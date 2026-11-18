import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  Camera,
  Image as ImageIcon,
  HardHat,
  Wifi,
  Calendar,
  TrendingUp,
  Wallet
} from "lucide-react";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { safePost, safeGet, generateIdempotencyKey } from "../utils/api";
import { captureDirectCameraPhoto, compressAndResizeImage, pickCompressedEvidencePhoto } from "../utils/imageHelper";
import { getDeviceIdentity } from "../utils/deviceIdentity";
import { useSpamClickGuard, SPAM_WARNING_MESSAGE } from "../hooks/useAttendanceCheckIn";
import { useTheme } from "../context/ThemeContext";
import { AppButton, AppModal, SedincoMascot } from "./ui";

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
  onOpenQuickService = null,
  onNavigateHistory = null,
  isLockedPeriod = false,
  showToast = null
}) {
  const { isDark } = useTheme();
  const [lastCheckAction, setLastCheckAction] = useState(null);
  const [nowClock, setNowClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNowClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
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
  const hasCheckedOut = Boolean(effectiveToday && effectiveToday.check_out_time);
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
      setLastCheckAction(checkinType);
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

  const quickServices = [
    {
      key: "leave",
      mode: "P",
      label: "Nghỉ phép",
      desc: "Phép năm, việc riêng",
      icon: Calendar,
      iconBg: "bg-blue-50 text-[#0068FF] border-blue-200/80 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30"
    },
    {
      key: "comp",
      mode: "Bổ sung công / Quên chấm giờ ra",
      label: "Bổ sung công",
      desc: "Quên chấm vào/ra",
      icon: Clock,
      iconBg: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30"
    },
    {
      key: "ot",
      mode: "OT",
      label: "Tăng ca (OT)",
      desc: "Đăng ký làm thêm",
      icon: TrendingUp,
      iconBg: "bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30"
    },
    {
      key: "advance",
      mode: "SALARY_ADVANCE",
      label: "Ứng lương",
      desc: "Tạm ứng trước kỳ",
      icon: Wallet,
      iconBg: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30"
    }
  ];

  const pad2 = (n) => String(n).padStart(2, "0");
  const weekdayNames = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  const weekdayDateLabel = `${weekdayNames[nowClock.getDay()]}, ngày ${pad2(nowClock.getDate())}/${pad2(nowClock.getMonth() + 1)}/${nowClock.getFullYear()}`;
  const clockHHMM = `${pad2(nowClock.getHours())}:${pad2(nowClock.getMinutes())}`;
  const clockSS = `:${pad2(nowClock.getSeconds())}`;
  const currentMonthNum = nowClock.getMonth() + 1;

  const mascotState =
    hasCheckedOut || lastCheckAction === "out"
      ? "waving_goodbye"
      : hasCheckedIn || lastCheckAction === "in"
      ? "waving_hello"
      : "sleeping";

  const isActionBusy = isDebounceLocked || isLockedRef.current || stage === STAGES.SUBMITTING || stage === STAGES.LOCATING;
  const checkInBtnEnabled = !hasCheckedIn && !isLockedPeriod && !isActionBusy;
  const checkOutBtnEnabled = hasCheckedIn && !hasCheckedOut && !isLockedPeriod && !isActionBusy;
  const confirmTimeStr =
    hasCheckedOut || lastCheckAction === "out"
      ? String(effectiveToday?.check_out_time || serverTimeResult || "").slice(0, 8)
      : String(effectiveToday?.check_in_time || serverTimeResult || "").slice(0, 8);

  return (
    <div className="w-full px-3.5 pt-3.5 flex flex-col space-y-3.5">
      {/* KHU VỰC 1: ĐẦU TRANG — TIÊU ĐỀ HỆ THỐNG, ĐỒNG HỒ SỐ THỰC TẾ & MẶT TRỜI / MẶT TRĂNG */}
      <div className="flex items-start justify-between gap-3 px-0.5">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            HỆ THỐNG CHẤM CÔNG NỘI BỘ
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
            CÔNG TY SEDINCO
          </h1>
          <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {weekdayDateLabel}
          </div>
          <div className="pt-1 flex items-baseline gap-1">
            <span className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight leading-none">
              {clockHHMM}
            </span>
            <span className="text-xl sm:text-2xl font-bold text-slate-500 dark:text-slate-400 tabular-nums leading-none">
              {clockSS}
            </span>
          </div>
        </div>

        {/* Biểu tượng Mặt trời / Mặt trăng tỏa hào quang 3 lớp đồng tâm */}
        <div className="shrink-0 pt-1" aria-hidden="true">
          {isDark ? (
            <svg viewBox="0 0 88 88" className="w-16 h-16 sm:w-20 sm:h-20 animate-sun-pulse">
              <circle cx="44" cy="44" r="40" fill="#38BDF8" fillOpacity="0.14" />
              <circle cx="44" cy="44" r="30" fill="#60A5FA" fillOpacity="0.24" />
              <circle cx="44" cy="44" r="21" fill="#0EA5E9" fillOpacity="0.38" />
              <path
                d="M 50 30 A 15 15 0 1 0 58 51 A 12 12 0 1 1 50 30 Z"
                fill="#E0F2FE"
              />
              <circle cx="56" cy="34" r="2" fill="#BAE6FD" />
              <circle cx="61" cy="42" r="1.5" fill="#E0F2FE" />
            </svg>
          ) : (
            <svg viewBox="0 0 88 88" className="w-16 h-16 sm:w-20 sm:h-20 animate-sun-pulse">
              <circle cx="44" cy="44" r="40" fill="#FEF08A" fillOpacity="0.45" />
              <circle cx="44" cy="44" r="30" fill="#FDE047" fillOpacity="0.58" />
              <circle cx="44" cy="44" r="20" fill="#FACC15" />
              <circle cx="44" cy="44" r="15" fill="#F59E0B" fillOpacity="0.35" />
            </svg>
          )}
        </div>
      </div>

      {/* KHU VỰC 2: THẺ TÓM TẮT NHÂN VIÊN & SỐ CÔNG TRONG THÁNG (2 CỘT) */}
      <div className="w-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-md flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            NHÂN VIÊN
          </div>
          <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-snug break-words">
            {currentUser?.ho_ten || "Cán bộ công nhân viên"}
          </div>
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-snug break-words">
            Mã: <strong className="text-slate-800 dark:text-slate-100">{currentUser?.ma_nv || "NV"}</strong> • Ca: {effStart} – {effEnd}
          </div>
        </div>

        <div className="text-right shrink-0 flex flex-col items-end">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
            CÔNG THÁNG {currentMonthNum} 🔍
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5 whitespace-nowrap">
            {monthlyCount} công
          </div>
          {typeof onNavigateHistory === "function" && (
            <button
              type="button"
              onClick={onNavigateHistory}
              className="min-h-[44px] px-2 -mr-2 inline-flex items-center justify-end text-xs font-bold text-[#0068FF] dark:text-blue-400 underline cursor-pointer hover:text-blue-700 dark:hover:text-blue-300"
            >
              Chi tiết
            </button>
          )}
        </div>
      </div>

      {/* KHU VỰC 3: SÂN KHẤU TRUNG TÂM — NHÂN VẬT HOẠT HÌNH ĐỒNG PHỤC SEDINCO */}
      <SedincoMascot state={mascotState} interactivePreview={true} />

      {/* KHU VỰC 4: KHUNG THÔNG BÁO XÁC NHẬN TRẠNG THÁI CHẤM CÔNG */}
      {(hasCheckedIn || stage === STAGES.SUCCESS) && (
        <div className="w-full rounded-2xl border-2 border-emerald-500 bg-emerald-50/75 dark:bg-slate-900 p-3.5 shadow-sm space-y-1">
          <div className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 leading-snug">
            <CheckCircle2 size={18} className="shrink-0" />
            <span>
              ✓ {hasCheckedOut || lastCheckAction === "out" ? "TAN CA THÀNH CÔNG" : "VÀO CA THÀNH CÔNG"}
              {confirmTimeStr ? ` ${confirmTimeStr}` : ""}
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed break-words">
            <strong>{currentUser?.ho_ten || "Nhân viên"}</strong> đã ghi nhận chấm công tại{" "}
            {effectiveToday?.location_name || "Văn phòng SEDINCO"}!
          </p>
          {effectiveToday?.proxy_by && (
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/40 text-blue-700 dark:text-blue-200 text-xs font-semibold">
              Quản lý chấm hộ{effectiveToday.proxy_note ? `: ${effectiveToday.proxy_note}` : ""}
            </span>
          )}
        </div>
      )}

      {/* KHU VỰC 5: HỆ THỐNG 2 NÚT CHẤM CÔNG XẾP DỌC — VÀO CA & TAN CA */}
      <div className="w-full space-y-2.5">
        {/* NÚT 1: CHẤM CÔNG VÀO (VÀO CA) */}
        <button
          id={!hasCheckedIn ? "btn-start-checkin" : undefined}
          type="button"
          disabled={!checkInBtnEnabled}
          onClick={() => handleStartCheckIn(false)}
          className={`min-h-[68px] w-full rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3 text-left transition-transform duration-150 ${
            !hasCheckedIn && !isLockedPeriod
              ? isFieldWorkMode
                ? "bg-amber-600 bg-gradient-to-r from-amber-500 to-orange-600 text-white border border-amber-500 shadow-lg shadow-amber-500/25 ring-2 ring-amber-400/40 cursor-pointer active:scale-[0.98]"
                : "bg-[#0068FF] bg-gradient-to-r from-[#0068FF] to-[#2563EB] text-white border border-blue-500 shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/40 cursor-pointer active:scale-[0.98]"
              : "bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 opacity-60 cursor-not-allowed pointer-events-none"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="text-2xl leading-none shrink-0" aria-hidden="true">☀️</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm sm:text-base font-extrabold leading-tight break-words">
                {!hasCheckedIn && stage === STAGES.SUBMITTING
                  ? "ĐANG GỬI CHẤM CÔNG..."
                  : !hasCheckedIn && stage === STAGES.LOCATING
                  ? "ĐANG ĐỊNH VỊ GPS..."
                  : isFieldWorkMode && !hasCheckedIn
                  ? "CHẤM CÔNG VÀO (ĐI CÔNG TRÌNH)"
                  : "CHẤM CÔNG VÀO (VÀO CA)"}
              </div>
              <div
                className={`text-xs font-semibold mt-0.5 leading-snug ${
                  !hasCheckedIn && !isLockedPeriod
                    ? "text-blue-100"
                    : "text-slate-600 dark:text-slate-300"
                }`}
              >
                {isLockedPeriod
                  ? "Kỳ công tháng này đã chốt"
                  : hasCheckedIn
                  ? `Đã ghi nhận vào ca lúc ${String(effectiveToday?.check_in_time || serverTimeResult).slice(0, 5)}`
                  : `Bắt đầu ca làm việc hôm nay (${effStart})`}
              </div>
            </div>
          </div>
          <Clock className="w-5 h-5 shrink-0 opacity-90" />
        </button>

        {/* NÚT 2: CHẤM CÔNG RA (TAN CA — VỀ THÔI!!!) */}
        <button
          id={hasCheckedIn ? "btn-start-checkin" : undefined}
          type="button"
          disabled={!checkOutBtnEnabled}
          onClick={() => handleStartCheckIn(false)}
          className={`min-h-[68px] w-full rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3 text-left transition-transform duration-150 ${
            hasCheckedIn && !hasCheckedOut && !isLockedPeriod
              ? isFieldWorkMode
                ? "bg-amber-600 bg-gradient-to-r from-amber-500 to-orange-600 text-white border border-amber-500 shadow-lg shadow-amber-500/25 ring-2 ring-amber-400/40 cursor-pointer active:scale-[0.98]"
                : "bg-indigo-600 bg-gradient-to-r from-indigo-600 to-[#0068FF] text-white border border-indigo-500 shadow-lg shadow-indigo-500/25 ring-2 ring-indigo-400/40 cursor-pointer active:scale-[0.98]"
              : "bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 opacity-60 cursor-not-allowed pointer-events-none"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="text-2xl leading-none shrink-0" aria-hidden="true">🌙</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm sm:text-base font-extrabold leading-tight break-words">
                {hasCheckedIn && !hasCheckedOut && stage === STAGES.SUBMITTING
                  ? "ĐANG GỬI TAN CA..."
                  : hasCheckedIn && !hasCheckedOut && stage === STAGES.LOCATING
                  ? "ĐANG ĐỊNH VỊ GPS..."
                  : "VỀ THÔI!!! 🏃‍♂️ (TAN CA)"}
              </div>
              <div
                className={`text-xs font-semibold mt-0.5 leading-snug ${
                  hasCheckedIn && !hasCheckedOut && !isLockedPeriod
                    ? "text-indigo-100"
                    : "text-slate-600 dark:text-slate-300"
                }`}
              >
                {hasCheckedOut
                  ? `Đã hoàn thành ca làm việc (${String(effectiveToday?.check_out_time || serverTimeResult).slice(0, 5)})`
                  : hasCheckedIn
                  ? `Bấm để kết thúc ca làm việc (${effEnd})`
                  : "Chưa vào ca làm việc"}
              </div>
            </div>
          </div>
          <Clock className="w-5 h-5 shrink-0 opacity-90" />
        </button>
      </div>

      {/* KHU VỰC 6: CHÚ THÍCH VỊ TRÍ, ĐI CÔNG TRÌNH, SELFIE & THÔNG BÁO */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-2.5">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
          📍 Yêu cầu đứng trong bán kính cho phép tại Văn phòng / Kho SEDINCO hoặc kết nối Wi-Fi công ty.
        </p>

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 text-[#0068FF] dark:text-blue-300">
            {locationFriendlyBadge.mode === "wifi_office" ? (
              <Wifi className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <MapPin className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{locationFriendlyBadge.text}</span>
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border ${
              !networkBadge.online || networkBadge.networkType === "none"
                ? "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-700 text-rose-700 dark:text-rose-200"
                : "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {!networkBadge.online || networkBadge.networkType === "none"
              ? "⚠️ Mất kết nối mạng"
              : networkBadge.networkType === "wifi"
              ? "🛜 Wi-Fi ổn định"
              : networkBadge.networkType === "cellular"
              ? "📶 Mạng 4G / Di động"
              : "🌐 Trực tuyến"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 pt-0.5">
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
            className={`text-xs font-bold ${
              isFieldWorkMode
                ? "border-amber-400 shadow-lg shadow-amber-500/20"
                : "!bg-amber-50 hover:!bg-amber-100 dark:!bg-slate-800 dark:hover:!bg-slate-700 !text-amber-800 dark:!text-amber-300 !border-amber-300 dark:!border-amber-500/40"
            }`}
          >
            {isFieldWorkMode
              ? "Đang bật: Chấm công Đi Công Trình (Bấm để tắt)"
              : "🚧 Chấm công Đi Công Trình / Thị Trường"}
          </AppButton>

          {isFieldWorkMode && (
            <div className="bg-amber-50 dark:bg-amber-950/35 border border-amber-300 dark:border-amber-500/40 rounded-2xl p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-amber-800 dark:text-amber-200 uppercase">
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
          >
            {capturedPhoto
              ? "✅ Đã đính kèm ảnh hiện trường"
              : isFieldWorkMode
              ? "📸 Chụp ảnh Công trình / Khách hàng (Bắt buộc)"
              : "Chụp ảnh Selfie xác thực"}
          </AppButton>
        </div>

        {/* Cảnh báo & Thông báo trạng thái xử lý */}
        <div className="space-y-2 text-center">
          {spamWarning && (
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-left flex items-start gap-2.5">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
              <p className="font-semibold text-xs sm:text-sm text-amber-900 dark:text-amber-100 leading-relaxed">{spamWarning}</p>
            </div>
          )}

          <div
            className={`w-full py-2.5 px-3.5 rounded-2xl text-xs font-semibold inline-flex items-center justify-center gap-2 border ${
              stage === STAGES.SUCCESS
                ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                : stage === STAGES.ERROR || stage === STAGES.SECURITY_FRAUD
                ? "bg-rose-50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 border-rose-300 dark:border-rose-700"
                : "bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
            }`}
          >
            {stage === STAGES.SUCCESS && <CheckCircle2 size={16} className="text-emerald-700 dark:text-emerald-300 shrink-0" />}
            {(stage === STAGES.ERROR || stage === STAGES.SECURITY_FRAUD) && (
              <AlertCircle size={16} className="text-rose-700 dark:text-rose-300 shrink-0" />
            )}
            {stage !== STAGES.SUCCESS && stage !== STAGES.ERROR && stage !== STAGES.SECURITY_FRAUD && (
              <span className="w-2 h-2 rounded-full bg-[#0068FF] dark:bg-blue-400 shrink-0 animate-pulse" />
            )}
            <span>{statusMessage}</span>
          </div>

          {errorMessage && stage !== STAGES.ERROR && stage !== STAGES.SECURITY_FRAUD && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 text-left flex items-start gap-2.5">
              <AlertTriangle size={18} className="text-rose-600 dark:text-rose-300 shrink-0 mt-0.5" />
              <p className="font-semibold text-xs text-rose-900 dark:text-rose-200">{errorMessage}</p>
            </div>
          )}

          {stage === STAGES.ERROR && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 text-left space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={18} className="text-rose-600 dark:text-rose-300 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-rose-900 dark:text-rose-100">{errorMessage}</h4>
                  {errorDetails && <p className="text-xs text-rose-800 dark:text-rose-200 mt-1">{errorDetails}</p>}
                </div>
              </div>
              <AppButton
                type="button"
                variant="danger"
                fullWidth
                onClick={() => handleStartCheckIn(true)}
                icon={RotateCcw}
              >
                BẤM VÀO ĐÂY ĐỂ THỬ LẠI
              </AppButton>
            </div>
          )}
        </div>

        {/* Thống kê tháng 3 cột */}
        <div className="zaui-ticket-divider" />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60 rounded-xl px-2 py-2">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Đúng giờ</div>
            <div className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">
              {attendanceSummary?.on_time_count || 0} ngày
            </div>
          </div>
          <div className="bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/60 rounded-xl px-2 py-2">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Đi trễ</div>
            <div className="text-sm font-extrabold text-amber-700 dark:text-amber-300 mt-0.5">
              {attendanceSummary?.late_count || 0} lần
            </div>
          </div>
          <div className="bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 rounded-xl px-2 py-2">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Tổng công</div>
            <div className="text-sm font-extrabold text-[#0068FF] dark:text-blue-300 mt-0.5">
              {monthlyCount} ngày
            </div>
          </div>
        </div>
      </div>

      {/* NHẮC QUÊN GIỜ RA + THÔNG BÁO + DỊCH VỤ NHÂN SỰ NHANH */}
      {forgottenCheckout && (
        <button
          type="button"
          onClick={() => onOpenFixCheckoutRequest && onOpenFixCheckoutRequest(forgottenCheckout)}
          className="w-full p-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 border border-amber-300 dark:border-amber-500/50 text-left flex items-start gap-2.5 shadow-sm transition cursor-pointer"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1 min-w-0 text-xs leading-relaxed">
            <p className="font-bold text-amber-900 dark:text-amber-200">
              ⚠️ Phát hiện ngày {forgottenCheckout.short_date} bạn có chấm công Vào ({String(forgottenCheckout.check_in_time).slice(0, 5)}) nhưng quên bấm Giờ Ra!
            </p>
            <span className="inline-block mt-1 font-bold text-amber-700 dark:text-amber-300 underline">
              👉 Bấm vào đây để gửi đơn bổ sung giờ ra 1 chạm
            </span>
          </div>
        </button>
      )}

      {companyMeta?.announcement_text && String(companyMeta.announcement_text).trim() && (
        <div className="w-full bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-400/40 rounded-2xl px-4 py-3 text-left space-y-1 shadow-sm">
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

      {typeof onOpenQuickService === "function" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100/90 dark:border-slate-800 rounded-2xl p-4 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Dịch vụ Nhân sự Nhanh</h3>
            <span className="text-xs font-semibold text-[#0068FF] dark:text-blue-400">Gửi 1 chạm</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {quickServices.map((svc) => {
              const SvcIcon = svc.icon;
              return (
                <button
                  key={svc.key}
                  type="button"
                  onClick={() => onOpenQuickService(svc.mode)}
                  className="p-3 rounded-2xl bg-slate-50/90 hover:bg-blue-50/70 dark:bg-slate-800/80 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex flex-col items-center justify-center text-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <div className={`zaui-service-icon w-11 h-11 rounded-2xl border shrink-0 ${svc.iconBg}`}>
                    <SvcIcon className="w-5 h-5" />
                  </div>
                  <div className="w-full min-w-0 space-y-0.5">
                    <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug break-words">
                      {svc.label}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 leading-snug break-words">
                      {svc.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-500/15 text-[#0068FF] dark:text-blue-400 flex items-center justify-center mx-auto shadow-sm border border-blue-100 dark:border-blue-500/30">
            <MapPin size={32} />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Sedinco HR sử dụng vị trí thực tế để xác nhận bạn đang ở chi nhánh/kho hàng hoặc tại công trình để chấm công nhanh gọn.
          </p>
        </div>
      </AppModal>

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
    </div>
  );
}
