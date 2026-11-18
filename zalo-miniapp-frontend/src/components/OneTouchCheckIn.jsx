import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Clock,
  MapPin,
  Fingerprint,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  Send,
  Camera,
  Image as ImageIcon,
  HardHat,
  Wifi
} from "lucide-react";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { safePost, safeGet, generateIdempotencyKey } from "../utils/api";
import { captureDirectCameraPhoto, compressAndResizeImage, pickCompressedEvidencePhoto } from "../utils/imageHelper";
import { getDeviceIdentity } from "../utils/deviceIdentity";
import { useSpamClickGuard, SPAM_WARNING_MESSAGE } from "../hooks/useAttendanceCheckIn";
import { AppButton, AppModal } from "./ui";

export const FEATURE_BIOMETRIC_ENABLED = false;

const STAGES = {
  IDLE: "idle",
  PERM_EXPLAIN: "perm_explain",
  BIO_AUTH: "bio_auth",
  LOCATING: "locating",
  SUBMITTING: "submitting",
  SUCCESS: "success",
  ERROR: "error",
  SECURITY_FRAUD: "security_fraud"
};

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let globalCheckInLockTimestamp = 0;
export function getGlobalCheckInLockTimestamp() {
  return globalCheckInLockTimestamp;
}
export function resetGlobalCheckInLockTimestamp() {
  globalCheckInLockTimestamp = 0;
}

/**
 * F2 (V6): Chấm Công 1 Chạm Thông Minh
 * - Hỗ trợ Đa địa điểm (Kho/Showroom) & Cứu cánh Wi-Fi Nội bộ
 * - Hỗ trợ chế độ "Đi Công Trình / Thị Trường" (Ảnh hiện trường + Ghi chú)
 * - Ẩn toàn bộ thông số kỹ thuật thô, thay bằng thẻ trạng thái thân thiện
 * - Phát hiện "Quên bấm Giờ Ra" của ngày hôm trước để bù công 1 chạm
 */
export default function OneTouchCheckIn({
  currentUser,
  todayAttendance = null,
  onCheckInSuccess,
  onOpenFixCheckoutRequest,
  isLockedPeriod = false,
  showToast = null
}) {
  const {
    spamWarning,
    showFriendlySpamAlert,
    beginCheckInTap,
    endCheckInTap
  } = useSpamClickGuard(2500);
  const [stage, setStage] = useState(STAGES.IDLE);
  const [statusMessage, setStatusMessage] = useState("Chạm nút tròn lớn bên dưới để Chấm Công 1 Chạm (Vào ca / Ra ca)");
  const [serverTimeResult, setServerTimeResult] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const [fraudDetails, setFraudDetails] = useState("");
  const [isDebounceLocked, setIsDebounceLocked] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState("");
  const [liveTodayRecord, setLiveTodayRecord] = useState(todayAttendance);
  const [forgottenCheckout, setForgottenCheckout] = useState(null);
  const [monthlyCount, setMonthlyCount] = useState(0);
  const [attendanceSummary, setAttendanceSummary] = useState({
    late_count: 0,
    total_late_minutes: 0,
    on_time_count: 0,
    effective_shift_start: "",
    effective_shift_end: ""
  });
  const [shiftInfo, setShiftInfo] = useState(null);

  // Đa địa điểm & Trạng thái vị trí thân thiện (Không hiện lat/lng thô)
  const [companyMeta, setCompanyMeta] = useState({
    work_start: "08:00",
    lunch_start: "12:00",
    lunch_end: "13:30",
    work_end: "17:30",
    allowed_locations: [],
    is_matching_office_wifi: false
  });
  const [locationFriendlyBadge, setLocationFriendlyBadge] = useState({
    mode: "checking", // 'in_range' | 'wifi_office' | 'out_of_range' | 'checking'
    text: "Đang kiểm tra vị trí chi nhánh gần nhất..."
  });
  const [networkBadge, setNetworkBadge] = useState({
    networkType: "unknown",
    online: true
  });

  // Chế độ Đi Công Trình / Thị Trường
  const [isFieldWorkMode, setIsFieldWorkMode] = useState(false);
  const [fieldNote, setFieldNote] = useState("");
  const [showFieldWorkModal, setShowFieldWorkModal] = useState(false);
  const [fieldModalError, setFieldModalError] = useState("");

  const isLockedRef = useRef(false);
  const timeoutIdRef = useRef(null);
  const lastIdempotencyKeyRef = useRef("");
  const cameraFileInputRef = useRef(null);
  const albumFileInputRef = useRef(null);

  const evaluateFriendlyLocation = useCallback((compData) => {
    if (!compData) return;
    if (compData.is_matching_office_wifi) {
      setLocationFriendlyBadge({
        mode: "wifi_office",
        text: "🛜 Đã xác thực mạng Wi-Fi Nội bộ Công ty — Sẵn sàng chấm công"
      });
      return;
    }

    const locs = Array.isArray(compData.allowed_locations) && compData.allowed_locations.length > 0
      ? compData.allowed_locations
      : [{ name: "Trụ sở chính", lat: Number(compData.latitude || 16.0544), lng: Number(compData.longitude || 108.2022), radius: Number(compData.radius_meters || 500) }];

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const curLat = Number(pos.coords.latitude);
          const curLng = Number(pos.coords.longitude);
          let nearest = locs[0];
          let minDist = Infinity;
          let matched = null;

          locs.forEach((loc) => {
            const d = haversineMeters(curLat, curLng, Number(loc.lat), Number(loc.lng));
            if (d < minDist) {
              minDist = d;
              nearest = loc;
            }
            if (d <= (Number(loc.radius) || 500) && !matched) {
              matched = { loc, dist: Math.round(d) };
            }
          });

          if (matched) {
            setLocationFriendlyBadge({
              mode: "in_range",
              text: `🟢 Đang tại: ${matched.loc.name} (Cách ${matched.dist}m) — Sẵn sàng chấm công`
            });
          } else if (Number.isFinite(minDist)) {
            const distLabel = minDist >= 1000 ? `${(minDist / 1000).toFixed(1)}km` : `${Math.round(minDist)}m`;
            setLocationFriendlyBadge({
              mode: "out_of_range",
              text: `🟠 Ngoài phạm vi ${nearest.name} (Cách ${distLabel}) — Có thể chọn chế độ Đi Công Trình`
            });
          } else {
            setLocationFriendlyBadge({
              mode: "checking",
              text: `📍 Chi nhánh mặc định: ${nearest?.name || "Trụ sở chính"} — Bấm nút để định vị`
            });
          }
        },
        () => {
          setLocationFriendlyBadge({
            mode: "checking",
            text: `📍 Chi nhánh mặc định: ${locs[0]?.name || "Trụ sở chính"} — Bấm nút để định vị`
          });
        },
        { enableHighAccuracy: true, timeout: 4500 }
      );
    }
  }, []);

  const fetchTodayStatus = useCallback(async () => {
    try {
      const now = new Date();
      const [attRes, compRes] = await Promise.all([
        safeGet("/attendance/me", {
          month: now.getMonth() + 1,
          year: now.getFullYear()
        }),
        safeGet("/company").catch(() => null)
      ]);
      if (compRes?.success && compRes.data) {
        setCompanyMeta(compRes.data);
        evaluateFriendlyLocation(compRes.data);
      }

      const rawData = attRes?.data;
      const list = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.logs)
        ? rawData.logs
        : Array.isArray(rawData?.days)
        ? rawData.days
        : [];

      if (rawData && !Array.isArray(rawData)) {
        setForgottenCheckout(rawData.forgotten_checkout || null);
        setShiftInfo(rawData.shift_info || null);
        if (rawData.summary) {
          setAttendanceSummary((prev) => ({
            ...prev,
            ...rawData.summary
          }));
        }
      } else {
        setForgottenCheckout(null);
      }

      const todayIso = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      const found = list.find((r) => String(r.record_date || "").slice(0, 10) === todayIso);
      if (found) setLiveTodayRecord(found);
      setMonthlyCount(list.filter((r) => r.status && r.status !== "0" && r.status !== "V").length);
    } catch (e) {}
  }, [evaluateFriendlyLocation]);

  useEffect(() => {
    fetchTodayStatus();
  }, [fetchTodayStatus]);

  useEffect(() => {
    let active = true;
    const refreshNetwork = async () => {
      try {
        const net = await zmpAdapter.getNetworkType();
        if (active && net) setNetworkBadge(net);
      } catch {}
    };
    refreshNetwork();
    zmpAdapter.keepScreenOn(true).catch(() => {});

    if (typeof window !== "undefined") {
      window.addEventListener("online", refreshNetwork);
      window.addEventListener("offline", refreshNetwork);
    }

    return () => {
      active = false;
      zmpAdapter.keepScreenOn(false).catch(() => {});
      if (typeof window !== "undefined") {
        window.removeEventListener("online", refreshNetwork);
        window.removeEventListener("offline", refreshNetwork);
      }
    };
  }, []);

  const effectiveToday = liveTodayRecord || todayAttendance;
  const hasCheckedIn = Boolean(effectiveToday && effectiveToday.check_in_time);
  const checkinType = hasCheckedIn ? "out" : "in";

  useEffect(() => {
    return () => {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, []);

  const handleFallbackFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const rawDataUrl = ev.target?.result;
        if (!rawDataUrl) return;
        const compressed = await compressAndResizeImage(rawDataUrl, 480, 480, 0.6);
        setCapturedPhoto(compressed);
        setErrorMessage("");
        setErrorDetails("");
        setStatusMessage("Đã chụp ảnh hiện trường! Chạm nút CHẤM CÔNG bên trên để hoàn tất.");
      } catch {
        setErrorMessage("Không thể xử lý ảnh vừa chụp. Vui lòng thử lại!");
      }
    };
    reader.onerror = () => {
      setErrorMessage("Không thể đọc tệp ảnh từ máy ảnh. Vui lòng thử lại!");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCaptureSelfie = async () => {
    try {
      const res = await captureDirectCameraPhoto();
      if (res?.success && res?.photoUrl) {
        setCapturedPhoto(res.photoUrl);
        setErrorMessage("");
        setErrorDetails("");
        setStatusMessage("Đã chụp ảnh hiện trường! Chạm nút CHẤM CÔNG để hoàn tất.");
      } else {
        const msg = res?.error || res?.message || "Không thể mở máy ảnh trực tiếp.";
        if (cameraFileInputRef.current) {
          setStatusMessage("Đang mở máy ảnh thiết bị để chụp ảnh hiện trường...");
          cameraFileInputRef.current.click();
        }
        setErrorMessage(msg);
      }
    } catch (err) {
      if (cameraFileInputRef.current) {
        cameraFileInputRef.current.click();
      }
      setErrorMessage(err?.message || "Lỗi chụp ảnh hiện trường. Vui lòng thử lại!");
    }
  };

  const handlePickFieldPhoto = async (sourceType) => {
    const res = await pickCompressedEvidencePhoto({
      sourceType,
      cameraType: "back",
      maxWidth: 720,
      maxHeight: 720,
      quality: 0.65
    });
    if (res?.success && res?.photoUrl) {
      setCapturedPhoto(res.photoUrl);
      setFieldModalError("");
      setErrorMessage("");
      setErrorDetails("");
      setStatusMessage("Đã đính kèm ảnh hiện trường! Chạm nút CHẤM CÔNG để hoàn tất.");
      return;
    }
    if (sourceType?.[0] === "camera") {
      if (cameraFileInputRef.current) cameraFileInputRef.current.click();
    } else if (albumFileInputRef.current) {
      albumFileInputRef.current.click();
    }
  };

  const handleStartCheckIn = async (bypassPermExplain = false) => {
    if (isFieldWorkMode) {
      if (!capturedPhoto) {
        setStage(STAGES.ERROR);
        setErrorMessage("Chế độ Đi Công Trình yêu cầu BẮT BUỘC chụp ảnh hiện trường thực tế trước khi chấm công!");
        return;
      }
      if (!fieldNote.trim() || fieldNote.trim().length < 5) {
        setStage(STAGES.ERROR);
        setErrorMessage("Vui lòng nhập tên công trình / khách hàng (tối thiểu 5 ký tự)!");
        return;
      }
    }

    if (isLockedPeriod) {
      isLockedRef.current = false;
      globalCheckInLockTimestamp = 0;
      setIsDebounceLocked(false);
      setStage(STAGES.ERROR);
      setErrorMessage("Kỳ chấm công tháng này đã được Kế toán chốt. Không thể ghi nhận thêm.");
      return;
    }

    const hasSeenPerm = localStorage.getItem("sedinco_has_seen_location_perm");
    if (!hasSeenPerm && !bypassPermExplain) {
      isLockedRef.current = false;
      globalCheckInLockTimestamp = 0;
      setIsDebounceLocked(false);
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      setStage(STAGES.PERM_EXPLAIN);
      return;
    }

    if (!beginCheckInTap(showToast)) {
      zmpAdapter.vibrate("medium").catch(() => {});
      return;
    }
    const nowMs = Date.now();
    if (isLockedRef.current || isDebounceLocked || (nowMs - globalCheckInLockTimestamp < 1200)) {
      zmpAdapter.vibrate("medium").catch(() => {});
      showFriendlySpamAlert(SPAM_WARNING_MESSAGE, showToast);
      return;
    }
    globalCheckInLockTimestamp = nowMs;
    isLockedRef.current = true;
    setIsDebounceLocked(true);
    setTimeout(() => {
      setIsDebounceLocked(false);
    }, 1200);

    setErrorMessage("");
    setErrorDetails("");
    setFraudDetails("");

    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = setTimeout(() => {
      if (isLockedRef.current) {
        setStage(STAGES.ERROR);
        setErrorMessage("Quá thời gian xử lý 20 giây. Vui lòng kiểm tra kết nối mạng và thử lại.");
        isLockedRef.current = false;
        setIsDebounceLocked(false);
        globalCheckInLockTimestamp = 0;
      }
    }, 20000);

    try {

      if (FEATURE_BIOMETRIC_ENABLED) {
        setStage(STAGES.BIO_AUTH);
        setStatusMessage("Đang xác nhận vân tay / khuôn mặt trên điện thoại...");
        const secretData = `sedinco_bio_${Date.now()}_${currentUser?.ma_nv}`;
        await zmpAdapter.openBioAuthentication({ secretData });
      }

      setStage(STAGES.LOCATING);
      setStatusMessage("Đang xác định vị trí & kiểm tra bảo mật...");

      let accessToken = "";
      try {
        accessToken = await zmpAdapter.getAccessToken().catch(() => "");
      } catch {}

      let locationToken = "";
      let rawLat = null;
      let rawLng = null;
      let gpsAccuracy = null;
      let isFakeGpsDetected = false;

      try {
        const locationRes = await zmpAdapter.getLocation();
        locationToken = locationRes?.token || "";
        if (locationRes?.latitude && locationRes?.longitude) {
          rawLat = Number(locationRes.latitude);
          rawLng = Number(locationRes.longitude);
        }
        if (locationRes?.accuracy !== undefined && locationRes?.accuracy !== null) {
          gpsAccuracy = Number(locationRes.accuracy);
        }
        if (locationRes?.mocked === true || locationRes?.isMock === true) {
          isFakeGpsDetected = true;
        }
      } catch {}

      // Luôn cố gắng lấy tọa độ GPS thiết bị nếu SDK chỉ trả về location_token (tránh gửi null khi fallback)
      if ((rawLat === null || rawLng === null) && typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000, enableHighAccuracy: true })
          );
          rawLat = Number(pos.coords.latitude);
          rawLng = Number(pos.coords.longitude);
          gpsAccuracy = Number(pos.coords.accuracy);
          if (pos.coords.accuracy !== undefined && pos.coords.accuracy <= 0) {
            isFakeGpsDetected = true;
          }
        } catch {}
      }

      setStage(STAGES.SUBMITTING);
      setStatusMessage(
        isFieldWorkMode
          ? "Đang gửi chấm công Đi Công Trình kèm ảnh hiện trường..."
          : checkinType === "in"
          ? "Đang ghi nhận Giờ Vào Ca trên máy chủ Sedinco..."
          : "Đang ghi nhận Giờ Ra Ca & tính giờ làm việc..."
      );

      lastIdempotencyKeyRef.current = generateIdempotencyKey("checkin");
      const devIdentity = await getDeviceIdentity();

      let result = null;
      try {
        result = await safePost("/attendance/check-in", {
          lat: rawLat,
          lng: rawLng,
          zalo_location_token: locationToken || undefined,
          zalo_access_token: accessToken || undefined,
          device_name: devIdentity.device_model_name,
          device_info: devIdentity.device_info,
          gps_accuracy: gpsAccuracy,
          is_fake_gps: isFakeGpsDetected,
          work_location_type: isFieldWorkMode ? "FIELD_WORK" : "OFFICE",
          field_note: isFieldWorkMode ? fieldNote.trim() : "",
          image_snapshot: capturedPhoto || "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="
        }, {
          idempotencyKey: lastIdempotencyKeyRef.current
        });
      } catch (postErr) {
        const errCode = postErr.code || postErr.data?.code || postErr.response?.data?.code || "";
        const errText = postErr.message || postErr.data?.message || postErr.response?.data?.message || "Lỗi kết nối mạng khi gửi chấm công";

        isLockedRef.current = false;
        globalCheckInLockTimestamp = 0;
        if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);

        if (
          errCode === "SECURITY_VIOLATION_FRAUD" ||
          errText.includes("VI PHẠM") ||
          errText.includes("giả mạo") ||
          errText.includes("thiết bị chưa được cấp phép")
        ) {
          await zmpAdapter.vibrate("heavy").catch(() => {});
          setStage(STAGES.SECURITY_FRAUD);
          setErrorMessage(
            "⚠️ Không thể xác nhận chấm công: Hệ thống nhận thấy vị trí hoặc thiết bị chưa khớp với thông tin đã đăng ký. Vui lòng tắt ứng dụng giả lập (nếu có) hoặc liên hệ Quản lý để được hỗ trợ."
          );
          setFraudDetails(postErr.data?.fraud_reason || errText);
          return;
        }

        // Nếu báo ngoài vùng chấm công -> tự động mở gợi ý chế độ Đi Công Trình
        if (errCode === "OUT_OF_GEOFENCE" || errText.includes("ngoài phạm vi")) {
          setIsFieldWorkMode(true);
        }

        setStage(STAGES.ERROR);
        setErrorMessage(errText);
        setErrorDetails("Nếu bạn đang đi công tác/gặp khách hàng, hãy chụp ảnh hiện trường và ghi chú bên dưới.");
        return;
      }

      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      await zmpAdapter.vibrate("light");

      const serverTime =
        result?.server_time ||
        result?.data?.server_time ||
        result?.data?.check_out_time ||
        result?.data?.check_in_time ||
        new Date().toLocaleTimeString("vi-VN", { hour12: false });

      setServerTimeResult(serverTime);
      setStage(STAGES.SUCCESS);
      setIsFieldWorkMode(false);
      setFieldNote("");
      fetchTodayStatus();

      if (result?.is_spam_warning || result?.data?.is_spam_warning) {
        const warnText = result?.message || SPAM_WARNING_MESSAGE;
        zmpAdapter.vibrate("medium").catch(() => {});
        setStatusMessage(warnText);
        showFriendlySpamAlert(warnText, showToast);
        endCheckInTap(true);
        return;
      }

      const locTag = result?.data?.location_name ? ` tại ${result.data.location_name}` : "";
      const serverMsg = `${result?.message || `Đã ghi nhận chấm công lúc ${serverTime}`}${locTag}`;
      setStatusMessage(serverMsg);
      endCheckInTap(true);

      if (onCheckInSuccess) onCheckInSuccess({ ...result, autoShiftMsg: serverMsg });
    } catch (err) {
      endCheckInTap(false);
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      setStage(STAGES.ERROR);
      isLockedRef.current = false;
      globalCheckInLockTimestamp = 0;
      setErrorMessage(err.message || "Không thể hoàn thành chấm công.");
      setErrorDetails("Vui lòng kiểm tra lại kết nối mạng 4G/Wifi hoặc thử lại sau.");
    } finally {
      endCheckInTap(false);
      isLockedRef.current = false;
      setIsDebounceLocked(false);
      globalCheckInLockTimestamp = 0;
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    }
  };

  const handleAcceptPermExplain = () => {
    localStorage.setItem("sedinco_has_seen_location_perm", "true");
    isLockedRef.current = false;
    globalCheckInLockTimestamp = 0;
    setIsDebounceLocked(false);
    setStage(STAGES.IDLE);
    handleStartCheckIn(true);
  };

  return (
    <div className="w-full flex flex-col items-center justify-center space-y-3">
      {/* 1. BANNER NHẮC NHỞ THÔNG MINH "QUÊN BẤM GIỜ RA" */}
      {forgottenCheckout && (
        <button
          type="button"
          onClick={() => onOpenFixCheckoutRequest && onOpenFixCheckoutRequest(forgottenCheckout)}
          className="w-full p-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 border-2 border-amber-400/70 text-left flex items-start gap-2.5 shadow-sm dark:shadow-lg transition cursor-pointer"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1 min-w-0 text-xs leading-relaxed">
            <p className="font-black text-amber-900 dark:text-amber-200">
              ⚠️ Phát hiện ngày {forgottenCheckout.short_date} bạn có chấm công Vào ({String(forgottenCheckout.check_in_time).slice(0, 5)}) nhưng quên bấm Giờ Ra!
            </p>
            <span className="inline-block mt-1 font-black text-amber-700 dark:text-amber-300 underline">
              👉 Bấm vào đây để gửi đơn bổ sung giờ ra 1 chạm
            </span>
          </div>
        </button>
      )}

      {/* 2. THẺ TRẠNG THÁI VỊ TRÍ & KẾT NỐI MẠNG THÂN THIỆN */}
      <div
        className={`w-full px-3.5 py-2.5 rounded-2xl border text-xs font-bold flex flex-col gap-1.5 shadow-sm ${
          locationFriendlyBadge.mode === "in_range"
            ? "bg-emerald-50 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200"
            : locationFriendlyBadge.mode === "wifi_office"
            ? "bg-blue-50 dark:bg-blue-950/70 border-blue-200 dark:border-blue-500/40 text-blue-800 dark:text-blue-200"
            : locationFriendlyBadge.mode === "out_of_range"
            ? "bg-amber-50 dark:bg-amber-950/70 border-amber-200 dark:border-amber-500/40 text-amber-900 dark:text-amber-200"
            : "bg-white dark:bg-slate-900/90 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
        }`}
      >
        <div className="flex items-center gap-2">
          {locationFriendlyBadge.mode === "wifi_office" ? (
            <Wifi className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          ) : (
            <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          )}
          <span className="flex-1 min-w-0 leading-snug">{locationFriendlyBadge.text}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold opacity-95 pl-6">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
              !networkBadge.online || networkBadge.networkType === "none"
                ? "bg-rose-100 dark:bg-rose-500/20 border-rose-300 dark:border-rose-400/50 text-rose-800 dark:text-rose-200"
                : networkBadge.networkType === "wifi"
                ? "bg-emerald-100 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-400/40 text-emerald-800 dark:text-emerald-200"
                : "bg-sky-100 dark:bg-sky-500/15 border-sky-300 dark:border-sky-400/40 text-sky-800 dark:text-sky-200"
            }`}
          >
            {!networkBadge.online || networkBadge.networkType === "none"
              ? "⚠️ Không có kết nối mạng"
              : networkBadge.networkType === "wifi"
              ? "🛜 Mạng: Wi-Fi ổn định"
              : networkBadge.networkType === "cellular"
              ? "📶 Mạng: 4G / Di động"
              : "🌐 Kết nối trực tuyến"}
          </span>
        </div>
      </div>

      {/* F4: THÔNG BÁO NỘI BỘ CÔNG TY */}
      {companyMeta?.announcement_text && String(companyMeta.announcement_text).trim() && (
        <div className="w-full bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-400/50 rounded-2xl px-3.5 py-2.5 text-left space-y-1 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-200">📢 Thông báo từ Công ty</span>
            {companyMeta.announcement_updated_at && (
              <span className="text-xs text-amber-700/90 dark:text-amber-100/90 whitespace-nowrap shrink-0">
                {new Date(companyMeta.announcement_updated_at).toLocaleDateString("vi-VN")}
              </span>
            )}
          </div>
          <p className="text-xs text-amber-900 dark:text-amber-50 leading-relaxed whitespace-pre-line">
            {companyMeta.announcement_text}
          </p>
        </div>
      )}

      {/* 3. THẺ TÓM TẮT CÔNG HÔM NAY & CA CHUẨN */}
      <div className="w-full bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2.5 text-xs shadow-sm dark:shadow-md">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex-1 min-w-0">
            <span className="text-slate-600 dark:text-slate-300 font-medium block">
              Hôm nay ({new Date().toLocaleDateString("vi-VN")}):
            </span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm block mt-0.5 leading-snug">
              {effectiveToday?.check_out_time
                ? `Vào ${effectiveToday.check_in_time?.slice(0, 5)} • Ra ${effectiveToday.check_out_time?.slice(0, 5)}`
                : effectiveToday?.check_in_time
                ? `Đã vào ca lúc ${effectiveToday.check_in_time?.slice(0, 5)}`
                : "Chưa chấm công vào ca"}
            </span>
            {effectiveToday?.location_name && (
              <span className="block text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                📍 {effectiveToday.location_name}
              </span>
            )}
            {effectiveToday?.proxy_by && (
              <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/40 text-blue-700 dark:text-blue-200 text-xs font-semibold">
                Quản lý chấm hộ{effectiveToday.proxy_note ? `: ${effectiveToday.proxy_note}` : ""}
              </span>
            )}
          </div>
          <div className="text-right bg-slate-50 dark:bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
            <span className="text-xs text-slate-500 dark:text-slate-300 font-medium block whitespace-nowrap">Công tháng này</span>
            <span className="text-base font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">{monthlyCount} ngày</span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span>
              {(() => {
                const effStart =
                  shiftInfo?.effective_start ||
                  attendanceSummary?.effective_shift_start ||
                  currentUser?.custom_start_time ||
                  (effectiveToday?.shift_type === "MORNING_SHIFT"
                    ? "07:30"
                    : effectiveToday?.shift_type === "AFTERNOON_SHIFT"
                    ? "13:00"
                    : effectiveToday?.shift_type === "NIGHT_SHIFT"
                    ? "18:00"
                    : companyMeta.work_start || "08:00");
                const effEnd =
                  shiftInfo?.effective_end ||
                  attendanceSummary?.effective_shift_end ||
                  currentUser?.custom_end_time ||
                  (effectiveToday?.shift_type === "MORNING_SHIFT"
                    ? "12:00"
                    : effectiveToday?.shift_type === "AFTERNOON_SHIFT"
                    ? "17:30"
                    : effectiveToday?.shift_type === "NIGHT_SHIFT"
                    ? "22:00"
                    : companyMeta.work_end || "17:30");
                return (
                  <>
                    Ca làm việc của bạn hôm nay:{" "}
                    <strong className="text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {effStart} – {effEnd}
                    </strong>
                  </>
                );
              })()}
            </span>
            <div className="flex items-center gap-1">
              {Number(effectiveToday?.late_minutes) > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 font-semibold whitespace-nowrap">
                  Muộn {effectiveToday.late_minutes}p
                </span>
              )}
              {Number(effectiveToday?.ot_hours) > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 font-semibold whitespace-nowrap">
                  OT +{effectiveToday.ot_hours}h
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-xl px-2.5 py-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-300 block">Đúng giờ tháng này</span>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                {attendanceSummary?.on_time_count || 0} ngày
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-xl px-2.5 py-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-300 block">Đi trễ tháng này</span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                {attendanceSummary?.late_count || 0} lần ({attendanceSummary?.total_late_minutes || 0} phút)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL CẢNH BÁO ĐỎ TOÀN MÀN HÌNH KHI PHÁT HIỆN FAKE GPS / THIẾT BỊ LẠ */}
      <AppModal
        open={stage === STAGES.SECURITY_FRAUD}
        onClose={() => setStage(STAGES.IDLE)}
        zIndexClass="z-[100]"
        title="Cảnh báo an ninh chấm công"
        maxWidthClass="max-w-sm"
        footer={
          <AppButton
            variant="danger"
            fullWidth
            onClick={() => setStage(STAGES.IDLE)}
          >
            Đóng / Quay lại
          </AppButton>
        }
      >
        <div className="p-6 space-y-4 text-center">
          <div className="w-20 h-20 rounded-full bg-rose-100 dark:bg-rose-600/20 border-2 border-rose-500 text-rose-600 dark:text-rose-500 flex items-center justify-center mx-auto shadow-lg shadow-rose-600/20">
            <ShieldAlert size={44} />
          </div>
          <p className="text-xs text-rose-900 dark:text-white font-semibold leading-relaxed bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-500/40 rounded-2xl p-3.5">
            Hệ thống phát hiện dấu hiệu giả mạo vị trí hoặc thiết bị chưa được cấp phép. Thông báo đã được gửi trực tiếp tới Quản lý!
          </p>
          {fraudDetails && (
            <p className="text-xs text-rose-700 dark:text-rose-200 bg-slate-100 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 leading-relaxed">
              {fraudDetails}
            </p>
          )}
        </div>
      </AppModal>

      {/* Modal Giải Thích Quyền Vị Trí */}
      <AppModal
        open={stage === STAGES.PERM_EXPLAIN}
        onClose={() => setStage(STAGES.IDLE)}
        title="Quyền Truy Cập Vị Trí GPS"
        maxWidthClass="max-w-sm"
        footer={
          <div className="space-y-2">
            <AppButton
              variant="primary"
              fullWidth
              onClick={handleAcceptPermExplain}
            >
              Tôi hiểu &amp; Cho phép
            </AppButton>
            <AppButton
              variant="secondary"
              fullWidth
              onClick={() => setStage(STAGES.IDLE)}
            >
              Đóng / Quay lại
            </AppButton>
          </div>
        }
      >
        <div className="p-6 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-sm border border-blue-100 dark:border-blue-500/30">
            <MapPin size={32} />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Sedinco HR sử dụng vị trí thực tế để xác nhận bạn đang ở chi nhánh/kho hàng hoặc tại công trình để chấm công nhanh gọn.
          </p>
        </div>
      </AppModal>

      {/* 4. NÚT CHUYỂN CHẾ ĐỘ ĐI CÔNG TRÌNH / THỊ TRƯỜNG */}
      <div className="w-full">
        <AppButton
          variant={isFieldWorkMode ? "warning" : "secondary"}
          fullWidth
          icon={HardHat}
          onClick={() => {
            if (isFieldWorkMode) {
              setIsFieldWorkMode(false);
            } else {
              setFieldModalError("");
              setShowFieldWorkModal(true);
            }
          }}
          className={`text-xs font-black rounded-2xl border-2 ${
            isFieldWorkMode
              ? "border-amber-400 shadow-lg shadow-amber-500/20"
              : "!bg-amber-50 hover:!bg-amber-100 dark:!bg-slate-800/90 dark:hover:!bg-slate-800 !text-amber-800 dark:!text-amber-300 !border-amber-300 dark:!border-amber-500/40"
          }`}
        >
          {isFieldWorkMode
            ? "Đang bật: Chấm công Đi Công Trình (Bấm để tắt)"
            : "Chấm công Đi Công Trình / Thị Trường"}
        </AppButton>

        {isFieldWorkMode && (
          <div className="mt-2.5 bg-amber-50 dark:bg-amber-950/35 border border-amber-300 dark:border-amber-500/40 rounded-2xl p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-amber-800 dark:text-amber-200 uppercase">
                Thông tin công trình đã xác nhận:
              </span>
              <AppButton
                variant="secondary"
                onClick={() => {
                  setFieldModalError("");
                  setShowFieldWorkModal(true);
                }}
                className="text-xs px-3 py-1.5"
              >
                Chỉnh sửa
              </AppButton>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white break-words bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
              {fieldNote}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
              {capturedPhoto ? "✅ Đã đính kèm ảnh chụp hiện trường" : "⚠️ Chưa có ảnh hiện trường"}
            </p>
          </div>
        )}
      </div>

      {/* Modal Nhập Thông Tin & Ảnh Hiện Trường Đi Công Trình */}
      <AppModal
        open={showFieldWorkModal}
        onClose={() => setShowFieldWorkModal(false)}
        title="Chấm công Đi công trình"
        subtitle="Nhập tên công trình & chụp ảnh hiện trường"
        icon={<HardHat className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0" />}
        maxWidthClass="max-w-md"
        footer={
          <div className="flex gap-2.5">
            <AppButton
              variant="secondary"
              onClick={() => setShowFieldWorkModal(false)}
              className="flex-1"
            >
              Đóng / Quay lại
            </AppButton>
            <AppButton
              variant="warning"
              onClick={() => {
                if (!fieldNote.trim() || fieldNote.trim().length < 5) {
                  setFieldModalError("Vui lòng nhập tên công trình hoặc tên khách hàng (tối thiểu 5 ký tự).");
                  return;
                }
                if (!capturedPhoto) {
                  setFieldModalError("Vui lòng chụp hoặc chọn ảnh hiện trường trước khi xác nhận đi công trình.");
                  return;
                }
                setFieldModalError("");
                setIsFieldWorkMode(true);
                setShowFieldWorkModal(false);
              }}
              className="flex-1 font-bold"
            >
              Xác nhận Công trình
            </AppButton>
          </div>
        }
      >
        <div className="p-4 space-y-3.5 text-sm">
          {fieldModalError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 text-xs font-semibold flex items-start gap-2">
              <AlertTriangle size={16} className="text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{fieldModalError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-amber-800 dark:text-amber-200 uppercase mb-1.5">
              Tên công trình / khách hàng <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={fieldNote}
              onChange={(e) => {
                setFieldNote(e.target.value);
                if (fieldModalError) setFieldModalError("");
              }}
              placeholder="VD: Giao gạch công trình Hòa Xuân / Gặp anh Minh..."
              className="w-full min-h-[46px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400"
            />
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Ảnh xác thực hiện trường <span className="text-rose-500">*</span>
              </span>
              {capturedPhoto && (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✅ Đã có ảnh</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <AppButton
                variant="secondary"
                icon={Camera}
                onClick={() => handlePickFieldPhoto(["camera"])}
                className="!text-emerald-700 dark:!text-emerald-300 text-xs"
              >
                📷 Chụp ảnh Camera
              </AppButton>
              <AppButton
                variant="secondary"
                icon={ImageIcon}
                onClick={() => handlePickFieldPhoto(["album"])}
                className="!text-sky-700 dark:!text-sky-300 text-xs"
              >
                🖼️ Chọn ảnh thư viện
              </AppButton>
            </div>
          </div>
        </div>
      </AppModal>

      {/* 5. NÚT CHẤM CÔNG 1 CHẠM DUY NHẤT */}
      <div className="relative my-2 flex flex-col items-center">
        <button
          id="btn-start-checkin"
          type="button"
          onClick={() => handleStartCheckIn(false)}
          disabled={isDebounceLocked || isLockedRef.current || stage === STAGES.SUBMITTING || isLockedPeriod}
          className={`relative w-[216px] min-h-[216px] aspect-square h-auto max-w-[85vw] p-5 rounded-full flex flex-col items-center justify-center text-white transition-all duration-200 shadow-2xl select-none cursor-pointer active:scale-95 disabled:cursor-not-allowed border-[6px] ${
            isLockedPeriod
              ? "bg-slate-600 border-slate-400 opacity-70"
              : stage === STAGES.SUCCESS
              ? "bg-emerald-600 border-white shadow-emerald-600/50"
              : stage === STAGES.ERROR || stage === STAGES.SECURITY_FRAUD
              ? "bg-rose-600 border-white shadow-rose-600/50"
              : isFieldWorkMode
              ? "bg-amber-600 border-white hover:bg-amber-500 shadow-amber-600/50"
              : checkinType === "in"
              ? "bg-blue-600 border-white hover:bg-blue-500 shadow-blue-600/50"
              : "bg-indigo-600 border-white hover:bg-indigo-500 shadow-indigo-600/50"
          }`}
        >
          <div className="mb-2">
            {stage === STAGES.SUCCESS ? (
              <CheckCircle2 size={54} className="text-white" />
            ) : stage === STAGES.ERROR || stage === STAGES.SECURITY_FRAUD ? (
              <AlertCircle size={54} className="text-white" />
            ) : stage === STAGES.BIO_AUTH ? (
              <Fingerprint size={54} className="text-blue-100" />
            ) : stage === STAGES.LOCATING ? (
              <MapPin size={54} className="text-amber-100" />
            ) : stage === STAGES.SUBMITTING ? (
              <Send size={50} className="text-white" />
            ) : isFieldWorkMode ? (
              <HardHat size={54} className="text-white" />
            ) : (
              <Clock size={54} className="text-white" />
            )}
          </div>

          <span className="font-black text-xl tracking-tight uppercase leading-tight text-center px-2">
            {stage === STAGES.SUBMITTING
              ? "ĐANG GỬI..."
              : stage === STAGES.LOCATING
              ? "ĐANG ĐỊNH VỊ"
              : stage === STAGES.SUCCESS
              ? "HOÀN TẤT"
              : stage === STAGES.ERROR
              ? "BẤM THỬ LẠI"
              : isFieldWorkMode
              ? "ĐI CÔNG TRÌNH"
              : checkinType === "in"
              ? "CHẤM CÔNG VÀO"
              : "CHẤM CÔNG RA"}
          </span>

          <span className="text-xs font-black text-white mt-2 bg-black/30 px-3.5 py-1 rounded-full border border-white/20">
            {isLockedPeriod
              ? "Kỳ công đã chốt"
              : stage === STAGES.SUCCESS
              ? (serverTimeResult ? `Lúc ${serverTimeResult}` : "Đã ghi nhận")
              : isFieldWorkMode
              ? "Kèm ảnh hiện trường"
              : checkinType === "in"
              ? `Vào ca (${shiftInfo?.effective_start || attendanceSummary?.effective_shift_start || currentUser?.custom_start_time || companyMeta.work_start || "08:00"})`
              : `Ra ca (${shiftInfo?.effective_end || attendanceSummary?.effective_shift_end || currentUser?.custom_end_time || companyMeta.work_end || "17:30"})`}
          </span>
        </button>
      </div>

      {/* Nút chụp ảnh Selfie / Hiện trường */}
      <div className="w-full">
        <input
          ref={cameraFileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFallbackFileChange}
          className="hidden"
        />
        <input
          ref={albumFileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFallbackFileChange}
          className="hidden"
        />
        <AppButton
          type="button"
          variant="secondary"
          fullWidth
          onClick={handleCaptureSelfie}
          disabled={isDebounceLocked || stage === STAGES.SUBMITTING}
          icon={Camera}
          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 dark:!bg-slate-800 dark:hover:!bg-slate-700 dark:!border-slate-700 dark:!text-emerald-300"
        >
          {capturedPhoto
            ? "✅ Đã đính kèm ảnh hiện trường"
            : isFieldWorkMode
            ? "📸 Chụp ảnh Công trình / Khách hàng (Bắt buộc)"
            : "Chụp ảnh Selfie xác thực"}
        </AppButton>
      </div>

      {/* Kết quả & Thông báo chi tiết */}
      <div className="w-full text-center space-y-3">
        {spamWarning && (
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border-2 border-amber-400 dark:border-amber-700 text-left flex items-start gap-2.5 shadow-lg">
            <AlertTriangle size={18} className="text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
            <p className="font-bold text-xs sm:text-sm text-amber-900 dark:text-amber-100 leading-relaxed">{spamWarning}</p>
          </div>
        )}
        <div
          className={`w-full py-3 px-4 rounded-2xl text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-all border-2 shadow-sm ${
            stage === STAGES.SUCCESS
              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700"
              : stage === STAGES.ERROR || stage === STAGES.SECURITY_FRAUD
              ? "bg-rose-50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 border-rose-400 dark:border-rose-700"
              : "bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700"
          }`}
        >
          {stage === STAGES.SUCCESS && <CheckCircle2 size={18} className="text-emerald-700 dark:text-emerald-300 shrink-0" />}
          {(stage === STAGES.ERROR || stage === STAGES.SECURITY_FRAUD) && (
            <AlertCircle size={18} className="text-rose-700 dark:text-rose-300 shrink-0" />
          )}
          {stage !== STAGES.SUCCESS && stage !== STAGES.ERROR && stage !== STAGES.SECURITY_FRAUD && (
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 animate-pulse" />
          )}
          <span>{statusMessage}</span>
        </div>

        {errorMessage && stage !== STAGES.ERROR && stage !== STAGES.SECURITY_FRAUD && (
          <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-300 dark:border-rose-700 text-left flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-rose-600 dark:text-rose-300 shrink-0 mt-0.5" />
            <p className="font-bold text-xs text-rose-900 dark:text-rose-200">{errorMessage}</p>
          </div>
        )}

        {stage === STAGES.ERROR && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-300 dark:border-rose-700 text-left space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={20} className="text-rose-600 dark:text-rose-300 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-black text-sm text-rose-950 dark:text-rose-100">{errorMessage}</h4>
                {errorDetails && <p className="text-xs text-rose-800 dark:text-rose-200 mt-1 font-medium">{errorDetails}</p>}
              </div>
            </div>
            <AppButton
              type="button"
              variant="danger"
              fullWidth
              onClick={() => handleStartCheckIn(true)}
              icon={RotateCcw}
              className="!border-2 !border-rose-800"
            >
              BẤM VÀO ĐÂY ĐỂ THỬ LẠI
            </AppButton>
          </div>
        )}
      </div>
    </div>
  );
}
