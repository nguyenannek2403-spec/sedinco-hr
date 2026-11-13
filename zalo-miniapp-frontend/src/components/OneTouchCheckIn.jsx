import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowLeft,
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
  HardHat,
  Wifi
} from "lucide-react";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { safePost, safeGet, generateIdempotencyKey } from "../utils/api";
import { captureDirectCameraPhoto } from "../utils/imageHelper";
import useLockBodyScroll from "../hooks/useLockBodyScroll";

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

function getOrCreateDeviceId() {
  try {
    const key = "sedinco_bound_device_fingerprint";
    let existing = localStorage.getItem(key);
    if (existing) return existing;
    const platform = typeof navigator !== "undefined" ? (navigator.platform || "Mobile") : "ZMP";
    const uaHash = typeof navigator !== "undefined"
      ? String(navigator.userAgent || "").replace(/[^a-zA-Z0-9]/g, "").slice(-12)
      : "ZALO";
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    existing = `ZMP_${platform}_${uaHash}_${rand}`.slice(0, 80);
    localStorage.setItem(key, existing);
    return existing;
  } catch {
    return "ZMP_MOBILE_DEFAULT";
  }
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
  isLockedPeriod = false
}) {
  const [stage, setStage] = useState(STAGES.IDLE);
  useLockBodyScroll(stage === STAGES.SECURITY_FRAUD || stage === STAGES.PERM_EXPLAIN);
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

  // Chế độ Đi Công Trình / Thị Trường
  const [isFieldWorkMode, setIsFieldWorkMode] = useState(false);
  const [fieldNote, setFieldNote] = useState("");

  const isLockedRef = useRef(false);
  const timeoutIdRef = useRef(null);
  const lastIdempotencyKeyRef = useRef("");

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

  const effectiveToday = liveTodayRecord || todayAttendance;
  const hasCheckedIn = Boolean(effectiveToday && effectiveToday.check_in_time);
  const checkinType = hasCheckedIn ? "out" : "in";

  useEffect(() => {
    return () => {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, []);

  const handleCaptureSelfie = async () => {
    try {
      const res = await captureDirectCameraPhoto();
      if (res?.success && res?.photoUrl) {
        setCapturedPhoto(res.photoUrl);
        setErrorMessage("");
        setStatusMessage("Đã chụp & nén ảnh hiện trường (< 50KB). Chạm nút CHẤM CÔNG để hoàn tất!");
      } else {
        setErrorMessage(res?.message || "Không thể mở máy ảnh. Vui lòng kiểm tra quyền Camera và thử lại!");
      }
    } catch (err) {
      setErrorMessage(err?.message || "Lỗi chụp ảnh hiện trường. Vui lòng thử lại!");
    }
  };

  const handleStartCheckIn = async (bypassPermExplain = false) => {
    if (isFieldWorkMode) {
      if (!capturedPhoto) {
        setStage(STAGES.ERROR);
        setErrorMessage("Chế độ Đi Công Trình yêu cầu BẮT BUỘC chụp ảnh hiện trường thực tế (< 50KB) trước khi chấm công!");
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

    const nowMs = Date.now();
    if (isLockedRef.current || isDebounceLocked || (nowMs - globalCheckInLockTimestamp < 1800)) return;
    globalCheckInLockTimestamp = nowMs;
    isLockedRef.current = true;
    setIsDebounceLocked(true);
    setTimeout(() => {
      setIsDebounceLocked(false);
    }, 1800);

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
        setStatusMessage("Đang xác thực sinh trắc học trên thiết bị...");
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
      const deviceFingerprint = getOrCreateDeviceId();

      let result = null;
      try {
        result = await safePost("/attendance/check-in", {
          lat: rawLat,
          lng: rawLng,
          zalo_location_token: locationToken || undefined,
          zalo_access_token: accessToken || undefined,
          device_info: deviceFingerprint,
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
          errText.includes("CẢNH BÁO VI PHẠM AN NINH") ||
          errText.includes("Fake GPS") ||
          errText.includes("thiết bị chưa được cấp phép")
        ) {
          await zmpAdapter.vibrate("heavy").catch(() => {});
          setStage(STAGES.SECURITY_FRAUD);
          setErrorMessage(
            "⚠️ CẢNH BÁO VI PHẠM AN NINH: Hệ thống phát hiện dấu hiệu giả mạo vị trí hoặc thiết bị chưa được cấp phép. Cảnh báo đã được gửi trực tiếp tới Ban Giám Đốc!"
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

      const locTag = result?.data?.location_name ? ` tại ${result.data.location_name}` : "";
      const serverMsg = `${result?.message || `Đã ghi nhận chấm công lúc ${serverTime}`}${locTag}`;
      setStatusMessage(serverMsg);

      if (onCheckInSuccess) onCheckInSuccess({ ...result, autoShiftMsg: serverMsg });
    } catch (err) {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      setStage(STAGES.ERROR);
      isLockedRef.current = false;
      globalCheckInLockTimestamp = 0;
      setErrorMessage(err.message || "Không thể hoàn thành chấm công.");
      setErrorDetails("Vui lòng kiểm tra lại kết nối mạng 4G/Wifi hoặc thử lại sau.");
    } finally {
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
    <div className="w-full flex flex-col items-center justify-center p-1 sm:p-3 space-y-3">
      {/* 1. BANNER NHẮC NHỞ THÔNG MINH "QUÊN BẤM GIỜ RA" */}
      {forgottenCheckout && (
        <button
          type="button"
          onClick={() => onOpenFixCheckoutRequest && onOpenFixCheckoutRequest(forgottenCheckout)}
          className="w-full max-w-sm p-3.5 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border-2 border-amber-400/70 text-left flex items-start gap-2.5 shadow-lg transition cursor-pointer"
        >
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
          <div className="text-xs leading-relaxed">
            <p className="font-black text-amber-200">
              ⚠️ Phát hiện ngày {forgottenCheckout.short_date} bạn có chấm công Vào ({String(forgottenCheckout.check_in_time).slice(0, 5)}) nhưng quên bấm Giờ Ra!
            </p>
            <span className="inline-block mt-1 font-black text-amber-300 underline">
              👉 Bấm vào đây để gửi đơn bổ sung giờ ra 1 chạm
            </span>
          </div>
        </button>
      )}

      {/* 2. THẺ TRẠNG THÁI VỊ TRÍ THÂN THIỆN (Không hiện thông số kỹ thuật thô) */}
      <div
        className={`w-full max-w-sm px-3.5 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2 shadow-sm ${
          locationFriendlyBadge.mode === "in_range"
            ? "bg-emerald-950/70 border-emerald-500/40 text-emerald-200"
            : locationFriendlyBadge.mode === "wifi_office"
            ? "bg-blue-950/70 border-blue-500/40 text-blue-200"
            : locationFriendlyBadge.mode === "out_of_range"
            ? "bg-amber-950/70 border-amber-500/40 text-amber-200"
            : "bg-slate-900/90 border-slate-700 text-slate-300"
        }`}
      >
        {locationFriendlyBadge.mode === "wifi_office" ? (
          <Wifi className="w-4 h-4 text-blue-400 shrink-0" />
        ) : (
          <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
        )}
        <span>{locationFriendlyBadge.text}</span>
      </div>

      {/* F4: THÔNG BÁO NỘI BỘ CÔNG TY */}
      {companyMeta?.announcement_text && String(companyMeta.announcement_text).trim() && (
        <div className="w-full max-w-sm bg-amber-500/15 border border-amber-400/50 rounded-2xl px-3.5 py-2.5 text-left space-y-1 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-amber-300">📢 Thông báo từ Công ty</span>
            {companyMeta.announcement_updated_at && (
              <span className="text-[11px] text-amber-200/80 whitespace-nowrap">
                {new Date(companyMeta.announcement_updated_at).toLocaleDateString("vi-VN")}
              </span>
            )}
          </div>
          <p className="text-xs text-amber-50 leading-relaxed whitespace-pre-line">
            {companyMeta.announcement_text}
          </p>
        </div>
      )}

      {/* 3. THẺ TÓM TẮT CÔNG HÔM NAY & CA CHUẨN */}
      <div className="w-full max-w-sm bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-xs shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-slate-400 font-medium block">
              Hôm nay ({new Date().toLocaleDateString("vi-VN")}):
            </span>
            <span className="font-bold text-emerald-400 text-sm">
              {effectiveToday?.check_out_time
                ? `Vào ${effectiveToday.check_in_time?.slice(0, 5)} • Ra ${effectiveToday.check_out_time?.slice(0, 5)}`
                : effectiveToday?.check_in_time
                ? `Đã vào ca lúc ${effectiveToday.check_in_time?.slice(0, 5)}`
                : "Chưa chấm công vào ca"}
            </span>
            {effectiveToday?.location_name && (
              <span className="block text-xs text-slate-400 mt-0.5">
                📍 {effectiveToday.location_name}
              </span>
            )}
            {effectiveToday?.proxy_by && (
              <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[11px] font-semibold">
                Quản lý chấm hộ{effectiveToday.proxy_note ? `: ${effectiveToday.proxy_note}` : ""}
              </span>
            )}
          </div>
          <div className="text-right bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 shrink-0">
            <span className="text-[11px] text-slate-400 font-medium block">Công tháng này</span>
            <span className="text-base font-bold text-blue-400">{monthlyCount} ngày</span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800 space-y-1.5 text-xs text-slate-400">
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
                    <strong className="text-slate-100">
                      {effStart} – {effEnd}
                    </strong>
                  </>
                );
              })()}
            </span>
            <div className="flex items-center gap-1">
              {Number(effectiveToday?.late_minutes) > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-semibold whitespace-nowrap">
                  Muộn {effectiveToday.late_minutes}p
                </span>
              )}
              {Number(effectiveToday?.ot_hours) > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-semibold whitespace-nowrap">
                  OT +{effectiveToday.ot_hours}h
                </span>
              )}
            </div>
          </div>

          <div className="text-[11px] font-semibold text-slate-300 flex flex-wrap items-center gap-1">
            <span>Tháng này:</span>
            <span className="text-amber-300 font-bold">
              Đi trễ {attendanceSummary?.late_count || 0} lần (Tổng {attendanceSummary?.total_late_minutes || 0} phút)
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-emerald-400 font-bold">
              Đi sớm/Đúng giờ {attendanceSummary?.on_time_count || 0} ngày
            </span>
          </div>
        </div>
      </div>

      {/* MODAL CẢNH BÁO ĐỎ TOÀN MÀN HÌNH KHI PHÁT HIỆN FAKE GPS / THIẾT BỊ LẠ */}
      {stage === STAGES.SECURITY_FRAUD && (
        <div
          className="fixed inset-0 bg-rose-950/95 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)"
          }}
          onTouchMove={(e) => {
            if (e.target === e.currentTarget) e.preventDefault();
          }}
          onClick={() => setStage(STAGES.IDLE)}
        >
          <div
            className="bg-slate-900 border-2 border-rose-500 rounded-t-3xl sm:rounded-3xl max-w-sm w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl text-center animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-rose-900/60 flex items-center justify-start shrink-0">
              <button
                type="button"
                onClick={() => setStage(STAGES.IDLE)}
                className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition active:scale-[0.98]"
              >
                <ArrowLeft size={16} />
                <span>Trở về</span>
              </button>
            </div>
            <div className="modal-scroll-area flex-1 overflow-y-auto overscroll-contain touch-pan-y p-6 space-y-4">
              <div className="w-20 h-20 rounded-full bg-rose-600/20 border-2 border-rose-500 text-rose-500 flex items-center justify-center mx-auto shadow-lg shadow-rose-600/30">
                <ShieldAlert size={44} />
              </div>
              <h3 className="font-black text-lg text-rose-400 tracking-wide">
                Cảnh báo an ninh chấm công
              </h3>
              <p className="text-xs text-white font-semibold leading-relaxed bg-rose-950/80 border border-rose-500/40 rounded-2xl p-3.5">
                Hệ thống phát hiện dấu hiệu giả mạo vị trí hoặc thiết bị chưa được cấp phép. Thông báo đã được gửi trực tiếp tới Quản lý!
              </p>
              {fraudDetails && (
                <p className="text-xs text-rose-200 bg-slate-950 p-3 rounded-xl border border-slate-800 leading-relaxed">
                  {fraudDetails}
                </p>
              )}
              <button
                type="button"
                onClick={() => setStage(STAGES.IDLE)}
                className="w-full min-h-[46px] py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-600/40 transition active:scale-[0.98]"
              >
                Đóng / Quay lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Giải Thích Quyền Vị Trí */}
      {stage === STAGES.PERM_EXPLAIN && (
        <div
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)"
          }}
          onTouchMove={(e) => {
            if (e.target === e.currentTarget) e.preventDefault();
          }}
          onClick={() => setStage(STAGES.IDLE)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-3xl max-w-sm w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl text-slate-800 text-center animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-start shrink-0">
              <button
                type="button"
                onClick={() => setStage(STAGES.IDLE)}
                className="min-h-[40px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition active:scale-[0.98]"
              >
                <ArrowLeft size={16} />
                <span>Trở về</span>
              </button>
            </div>
            <div
              className="modal-scroll-area flex-1 overflow-y-auto overscroll-contain touch-pan-y p-6"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
            >
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 shadow-sm border border-blue-100">
                <MapPin size={32} />
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Quyền Truy Cập Vị Trí GPS</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Sedinco HR sử dụng vị trí thực tế để xác nhận bạn đang ở chi nhánh/kho hàng hoặc tại công trình để chấm công nhanh gọn.
              </p>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleAcceptPermExplain}
                  className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/30 transition active:scale-[0.98] cursor-pointer"
                >
                  Tôi hiểu &amp; Cho phép
                </button>
                <button
                  type="button"
                  onClick={() => setStage(STAGES.IDLE)}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition active:scale-[0.98] cursor-pointer"
                >
                  Đóng / Quay lại
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. NÚT CHUYỂN CHẾ ĐỘ ĐI CÔNG TRÌNH / THỊ TRƯỜNG */}
      <div className="w-full max-w-sm">
        <button
          type="button"
          onClick={() => setIsFieldWorkMode((v) => !v)}
          className={`w-full min-h-[44px] py-2.5 px-4 rounded-2xl border-2 text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer ${
            isFieldWorkMode
              ? "bg-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/20"
              : "bg-slate-800/90 hover:bg-slate-800 text-amber-300 border-amber-500/40"
          }`}
        >
          <HardHat size={16} />
          <span>
            {isFieldWorkMode
              ? "🚧 Đang bật: Chấm Công Đi Công Trình (Bấm để tắt)"
              : "🚧 Chấm công Đi Công Trình / Thị Trường (Ngoài VP)"}
          </span>
        </button>

        {isFieldWorkMode && (
          <div className="mt-2.5 bg-amber-950/35 border border-amber-500/40 rounded-2xl p-3.5 space-y-2.5 text-xs">
            <label className="block text-[11px] font-black text-amber-200 uppercase">
              Ghi chú tên công trình / khách hàng (Bắt buộc):
            </label>
            <input
              type="text"
              value={fieldNote}
              onChange={(e) => setFieldNote(e.target.value)}
              placeholder="VD: Giao gạch công trình Hòa Xuân / Gặp anh Minh..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500"
            />
            <p className="text-[11px] text-amber-200/90">
              * Bắt buộc bấm nút chụp ảnh hiện trường bên dưới trước khi chấm công.
            </p>
          </div>
        )}
      </div>

      {/* 5. NÚT CHẤM CÔNG 1 CHẠM DUY NHẤT */}
      <div className="relative my-2 flex flex-col items-center">
        <button
          id="btn-start-checkin"
          type="button"
          onClick={() => handleStartCheckIn(false)}
          disabled={isDebounceLocked || isLockedRef.current || stage === STAGES.SUBMITTING || isLockedPeriod}
          className={`relative w-52 h-52 md:w-60 md:h-60 rounded-full flex flex-col items-center justify-center text-white transition-all duration-200 shadow-2xl select-none cursor-pointer active:scale-95 disabled:cursor-not-allowed border-[6px] ${
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

          <span className="font-black text-2xl md:text-3xl tracking-normal uppercase leading-tight text-center px-4">
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

      {/* Nút chụp ảnh Selfie / Hiện trường (< 50KB) */}
      <div className="w-full max-w-sm">
        <button
          type="button"
          onClick={handleCaptureSelfie}
          disabled={isDebounceLocked || stage === STAGES.SUBMITTING}
          className="w-full min-h-[46px] py-2.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-95 transition cursor-pointer"
        >
          <Camera size={16} className="text-emerald-400 shrink-0" />
          <span>
            {capturedPhoto
              ? "✅ Đã đính kèm ảnh hiện trường (< 50KB)"
              : isFieldWorkMode
              ? "📸 Chụp ảnh Công trình / Khách hàng (Bắt buộc)"
              : "Chụp ảnh Selfie xác thực (< 50KB)"}
          </span>
        </button>
      </div>

      {/* Kết quả & Thông báo chi tiết */}
      <div className="w-full max-w-sm text-center space-y-3">
        <div
          className={`w-full py-3 px-4 rounded-2xl text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-all border-2 shadow-sm ${
            stage === STAGES.SUCCESS
              ? "bg-emerald-50 text-emerald-950 border-emerald-400"
              : stage === STAGES.ERROR || stage === STAGES.SECURITY_FRAUD
              ? "bg-rose-50 text-rose-900 border-rose-400"
              : "bg-slate-900 text-slate-200 border-slate-700"
          }`}
        >
          {stage === STAGES.SUCCESS && <CheckCircle2 size={18} className="text-emerald-700 shrink-0" />}
          {(stage === STAGES.ERROR || stage === STAGES.SECURITY_FRAUD) && (
            <AlertCircle size={18} className="text-rose-700 shrink-0" />
          )}
          {stage !== STAGES.SUCCESS && stage !== STAGES.ERROR && stage !== STAGES.SECURITY_FRAUD && (
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 animate-pulse" />
          )}
          <span>{statusMessage}</span>
        </div>

        {stage === STAGES.ERROR && (
          <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-left space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={20} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-black text-sm text-rose-950">{errorMessage}</h4>
                {errorDetails && <p className="text-xs text-rose-800 mt-1 font-medium">{errorDetails}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleStartCheckIn(true)}
              className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer border-2 border-rose-800 shadow-md"
            >
              <RotateCcw size={16} />
              <span>BẤM VÀO ĐÂY ĐỂ THỬ LẠI</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
