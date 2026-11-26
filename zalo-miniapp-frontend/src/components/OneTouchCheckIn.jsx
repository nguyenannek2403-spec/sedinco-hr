import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  HardHat,
  Building2,
  Settings
} from "lucide-react";
import { safeGet } from "../utils/api";
import { formatViWorkday } from "../utils/viNumberFormat";
import { getVietnamTodayIso } from "../utils/workdayUtils";
import { useSpamClickGuard, SPAM_WARNING_MESSAGE } from "../hooks/useAttendanceCheckIn";
import { useTheme } from "../context/ThemeContext";
import { attendanceService } from "../services/attendance.service";
import { zaloLocationService } from "../services/zalo-location.service";
import { SDK_STATES, isZaloMiniAppRuntime, openZaloPermissionSettings } from "../services/zalo-sdk-core";
import { AppButton, AppModal, SedincoMascot } from "./ui";
import { getAttendanceAnimationState } from "./ui/SedincoMascot";

const STAGES = {
  IDLE: "idle",
  PERM_EXPLAIN: "perm_explain",
  PERM_DENIED: "perm_denied",
  LOCATING: "locating",
  SUBMITTING: "submitting",
  SUCCESS: "success",
  ERROR: "error",
  SECURITY_FRAUD: "security_fraud"
};

let globalCheckInLockTimestamp = 0;

function formatModeBadgeLabel(mode) {
  const m = String(mode || "").toUpperCase();
  if (m === "FIELD_WORK" || m === "FIELD") return "Đi công trình";
  return "Tại văn phòng";
}

/**
 * V65 Unified Check-In State Machine (Office & Field-Site):
 * - 1 nguồn sự thật duy nhất (todayRecord theo GMT+7) dùng chung cho cả Tại văn phòng và Đi công trình:
 *   + Trạng thái 1 (!check_in_time): Hiển thị nút Chấm công Vào ở cả 2 mục, nhân vật ở Trạng thái 1 (ready).
 *   + Trạng thái 2 (check_in_time && !check_out_time): ẨN HOÀN TOÀN nút Chấm công Vào ở cả 2 mục,
 *     đồng bộ sang nút Chấm công Ra (Tan ca) ở cả 2 mục, nhân vật giữ nguyên Trạng thái 2 (working).
 *   + Trạng thái 3 (check_in_time && check_out_time): ẨN / KHÓA hoàn toàn cả 2 nút Vào & Ra ở cả 2 mục,
 *     hiển thị tóm tắt giờ Vào – giờ Ra, nhân vật ở Trạng thái 3 (completed).
 * - Chế độ Đi công trình: Không cần đăng ký trước, chấm công GPS ở bất cứ đâu, chỉ có 1 ô nhập ghi chú ngắn tùy chọn.
 */
export default function OneTouchCheckIn({
  currentUser,
  todayAttendance = null,
  onCheckInSuccess,
  onOpenFixCheckoutRequest,
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
  const [statusMessage, setStatusMessage] = useState("");
  const [serverTimeResult, setServerTimeResult] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const [fraudDetails, setFraudDetails] = useState("");
  const [isDebounceLocked, setIsDebounceLocked] = useState(false);
  const [liveTodayRecord, setLiveTodayRecord] = useState(todayAttendance);
  const [liveTodayEffective, setLiveTodayEffective] = useState(null);
  const [forgottenCheckout, setForgottenCheckout] = useState(null);
  const [attendanceSummary, setAttendanceSummary] = useState({
    late_count: 0,
    total_late_minutes: 0,
    on_time_count: 0,
    effective_shift_start: "",
    effective_shift_end: ""
  });
  const [shiftInfo, setShiftInfo] = useState(null);

  const [companyMeta, setCompanyMeta] = useState({
    work_start: "08:00",
    lunch_start: "12:00",
    lunch_end: "13:30",
    work_end: "17:30",
    allowed_locations: [],
    is_matching_office_wifi: false
  });
  const [locationFriendlyBadge, setLocationFriendlyBadge] = useState({
    mode: "checking",
    text: "Đang kiểm tra vị trí chi nhánh gần nhất..."
  });
  const [networkBadge, setNetworkBadge] = useState({
    networkType: "unknown",
    online: true
  });

  // Chế độ Tại văn phòng (false) | Đi công trình (true) + 1 ô ghi chú ngắn tùy chọn
  const [isFieldWorkMode, setIsFieldWorkMode] = useState(false);
  const [fieldNote, setFieldNote] = useState("");

  const isLockedRef = useRef(false);
  const timeoutIdRef = useRef(null);
  const [canOpenPermSetting, setCanOpenPermSetting] = useState(false);

  const evaluateFriendlyLocation = useCallback(async (compData) => {
    if (!compData) return;
    if (compData.is_matching_office_wifi) {
      setLocationFriendlyBadge({
        mode: "wifi_office",
        text: "🛜 Đã xác thực mạng Wi-Fi Nội bộ Công ty — Sẵn sàng chấm công"
      });
      return;
    }

    const locs =
      Array.isArray(compData.allowed_locations) && compData.allowed_locations.length > 0
        ? compData.allowed_locations
        : [
            {
              name: "Trụ sở chính",
              lat: Number(compData.latitude || 16.0544),
              lng: Number(compData.longitude || 108.2022),
              radius: Number(compData.radius_meters || 500),
              attendance_method: "GPS"
            }
          ];

    const permRes = await zaloLocationService.getLocationPermissionStatus().catch(() => null);

    if (permRes?.ok && permRes?.data?.granted) {
      setLocationFriendlyBadge({
        mode: "checking",
        text: `📍 Đã cấp quyền vị trí • Chi nhánh: ${locs[0]?.name || "Trụ sở chính"}`
      });
    } else {
      setLocationFriendlyBadge({
        mode: "checking",
        text: `📍 Chi nhánh mặc định: ${locs[0]?.name || "Trụ sở chính"} — Bấm Chấm công để xác thực`
      });
    }
  }, []);

  const fetchTodayStatus = useCallback(async () => {
    try {
      const todayIso = getVietnamTodayIso();
      const [todayMonY, todayMonM] = todayIso.split("-").map(Number);
      const [todayRes, attRes, compRes] = await Promise.all([
        safeGet("/attendance/today").catch(() => null),
        safeGet("/attendance/me", {
          month: todayMonM,
          year: todayMonY
        }),
        safeGet("/company").catch(() => null)
      ]);
      if (compRes?.success && compRes.data) {
        setCompanyMeta(compRes.data);
        evaluateFriendlyLocation(compRes.data);
      }

      const todayPayload = todayRes?.data || null;
      const rawData = attRes?.data;
      const list = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.logs)
        ? rawData.logs
        : Array.isArray(rawData?.days)
        ? rawData.days
        : [];

      if (rawData && !Array.isArray(rawData)) {
        setForgottenCheckout(rawData.unclosed_previous_record || rawData.forgotten_checkout || null);
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

      const resolvedEffective =
        todayPayload?.today_effective_status ||
        (rawData && !Array.isArray(rawData) && rawData.today_effective_status) ||
        null;
      setLiveTodayEffective(resolvedEffective);

      const hasEffectiveRec = todayPayload && Object.prototype.hasOwnProperty.call(todayPayload, "today_record");
      const todayRec = hasEffectiveRec
        ? todayPayload.today_record
        : (rawData && !Array.isArray(rawData) && rawData.today_record) ||
          list.find((r) => String(r.work_date || r.record_date || "").slice(0, 10) === todayIso) ||
          null;
      setLiveTodayRecord(todayRec);
      if (!todayRec || !todayRec.check_in_time) {
        setLastCheckAction(null);
        setServerTimeResult("");
      }
    } catch (e) {}
  }, [evaluateFriendlyLocation]);

  useEffect(() => {
    fetchTodayStatus();
  }, [fetchTodayStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleFocusSync = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        fetchTodayStatus();
      }
    };
    window.addEventListener("focus", handleFocusSync);
    document.addEventListener("visibilitychange", handleFocusSync);
    return () => {
      window.removeEventListener("focus", handleFocusSync);
      document.removeEventListener("visibilitychange", handleFocusSync);
    };
  }, [fetchTodayStatus]);

  useEffect(() => {
    let active = true;
    const refreshNetwork = async () => {
      try {
        const net = await attendanceService.getAttendanceNetworkStatus();
        if (active && net) setNetworkBadge(net);
      } catch {}
    };
    refreshNetwork();
    attendanceService.setAttendanceKeepScreen(true).catch(() => {});

    if (typeof window !== "undefined") {
      window.addEventListener("online", refreshNetwork);
      window.addEventListener("offline", refreshNetwork);
    }

    return () => {
      active = false;
      attendanceService.setAttendanceKeepScreen(false).catch(() => {});
      if (typeof window !== "undefined") {
        window.removeEventListener("online", refreshNetwork);
        window.removeEventListener("offline", refreshNetwork);
      }
    };
  }, []);

  const effectiveCode = String(liveTodayEffective?.effective_code || "").toUpperCase();
  const isDeletedOrClearedToday = effectiveCode === "NONE" && !liveTodayRecord?.check_in_time;
  const effectiveToday = isDeletedOrClearedToday ? null : (liveTodayRecord || todayAttendance);
  const isAdminAdjusted = Boolean(liveTodayEffective?.is_admin_adjusted);
  const isDayLockedByEffective = Boolean(
    effectiveCode === "P" ||
      (effectiveCode === "KL" && isAdminAdjusted) ||
      effectiveCode === "L" ||
      effectiveCode === "OT" ||
      effectiveCode === "1+OT" ||
      (effectiveCode === "1" && isAdminAdjusted)
  );
  const hasCheckedIn = !isDeletedOrClearedToday && Boolean(effectiveToday && effectiveToday.check_in_time);
  const hasCheckedOut = !isDeletedOrClearedToday && Boolean(effectiveToday && effectiveToday.check_out_time);
  const checkinType = hasCheckedIn ? "out" : "in";

  useEffect(() => {
    return () => {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, []);

  const handleStartCheckIn = async (bypassPermExplain = false, explicitAction = null) => {
    if (isLockedPeriod) {
      isLockedRef.current = false;
      globalCheckInLockTimestamp = 0;
      setIsDebounceLocked(false);
      setStage(STAGES.ERROR);
      setErrorMessage("Kỳ chấm công tháng này đã được Kế toán chốt. Không thể ghi nhận thêm.");
      return;
    }

    const actionType = explicitAction || (hasCheckedIn ? "OUT" : "IN");

    if (actionType === "IN" && hasCheckedIn) {
      setStage(STAGES.ERROR);
      setErrorMessage("Bạn đã chấm công vào ca hôm nay rồi.");
      return;
    }
    if (actionType === "OUT" && hasCheckedOut) {
      setStage(STAGES.ERROR);
      setErrorMessage("Bạn đã hoàn tất chấm công ra ca hôm nay rồi.");
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
      attendanceService.triggerAttendanceHaptic("medium").catch(() => {});
      return;
    }
    const nowMs = Date.now();
    if (isLockedRef.current || isDebounceLocked || (nowMs - globalCheckInLockTimestamp < 1200)) {
      attendanceService.triggerAttendanceHaptic("medium").catch(() => {});
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
    setCanOpenPermSetting(false);

    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = setTimeout(() => {
      if (isLockedRef.current) {
        setStage(STAGES.ERROR);
        setErrorMessage("Quá thời gian xử lý 25 giây. Vui lòng kiểm tra kết nối mạng và thử lại.");
        isLockedRef.current = false;
        setIsDebounceLocked(false);
        globalCheckInLockTimestamp = 0;
      }
    }, 25000);

    try {
      setStage(STAGES.LOCATING);
      setStatusMessage(
        isFieldWorkMode
          ? "Đang lấy tọa độ GPS công trình & xác thực..."
          : "Đang kiểm tra quyền vị trí & vùng chi nhánh..."
      );

      let flowOutcome = null;
      try {
        flowOutcome = await attendanceService.executeSmartAttendanceFlow({
          isFieldWorkMode,
          fieldNote,
          actionType
        });
      } catch (postErr) {
        const errCode = postErr.code || postErr.data?.code || postErr.response?.data?.code || "";
        const errText =
          postErr.message ||
          postErr.data?.message ||
          postErr.response?.data?.message ||
          "Lỗi kết nối mạng khi gửi chấm công";

        isLockedRef.current = false;
        globalCheckInLockTimestamp = 0;
        if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);

        if (errCode === "SECURITY_VIOLATION_FRAUD") {
          await attendanceService.triggerAttendanceHaptic("heavy").catch(() => {});
          setStage(STAGES.SECURITY_FRAUD);
          setErrorMessage(
            "⚠️ Không thể xác nhận chấm công do phát hiện tín hiệu giả lập vị trí (Mock Location). Vui lòng tắt ứng dụng giả lập GPS và thử lại."
          );
          setFraudDetails(postErr.data?.fraud_reason || errText);
          return;
        }

        if (errCode === "OUT_OF_GEOFENCE" || errText.includes("ngoài phạm vi")) {
          setIsFieldWorkMode(true);
        }

        setStage(STAGES.ERROR);
        setErrorMessage(errText);
        setErrorDetails(
          "Nếu bạn đang đi công trình hoặc gặp khách hàng ở ngoài văn phòng, hãy chọn mục Đi công trình để chấm công tại bất kỳ đâu."
        );
        return;
      }

      if (!flowOutcome?.ok) {
        isLockedRef.current = false;
        globalCheckInLockTimestamp = 0;
        if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);

        if (
          flowOutcome?.state === SDK_STATES.PERMISSION_DENIED ||
          flowOutcome?.state === SDK_STATES.PENDING_ZALO_APPROVAL
        ) {
          setCanOpenPermSetting(Boolean(flowOutcome.canOpenSettings));
          setStage(STAGES.PERM_DENIED);
          setErrorMessage(flowOutcome.message || "Chưa được cấp quyền vị trí trên Zalo.");
          setErrorDetails(
            "Vui lòng mở cài đặt quyền Zalo để bật Vị trí, hoặc kết nối Wi-Fi nội bộ Công ty / chọn mục Đi công trình."
          );
          return;
        }

        if (
          flowOutcome?.errorCode === "OUT_OF_GEOFENCE" ||
          String(flowOutcome?.message || "").includes("ngoài phạm vi")
        ) {
          setIsFieldWorkMode(true);
        }

        setStage(STAGES.ERROR);
        setErrorMessage(flowOutcome?.message || "Chưa hoàn tất kiểm tra chấm công.");
        setErrorDetails("Nếu bạn đang làm việc ngoài công trình, hãy chọn mục Đi công trình và bấm chấm công lại.");
        return;
      }

      const result = flowOutcome.data?.response;
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);

      const serverTime =
        result?.server_time ||
        result?.data?.server_time ||
        result?.data?.check_out_time ||
        result?.data?.check_in_time ||
        new Date().toLocaleTimeString("vi-VN", { hour12: false });

      if (result?.data && !result?.is_spam_warning && !result?.data?.is_spam_warning) {
        setLiveTodayRecord((prev) => ({
          ...(prev || {}),
          ...result.data,
          matched_location_name:
            result.data.location_name ||
            prev?.location_name ||
            (isFieldWorkMode ? "Đi công trình (GPS)" : "Văn phòng SEDINCO")
        }));
        setLastCheckAction(actionType === "OUT" ? "out" : "in");
      }

      setServerTimeResult(serverTime);
      setStage(STAGES.SUCCESS);
      setFieldNote("");

      if (result?.is_spam_warning || result?.data?.is_spam_warning) {
        const warnText = result?.message || SPAM_WARNING_MESSAGE;
        attendanceService.triggerAttendanceHaptic("medium").catch(() => {});
        setStatusMessage(warnText);
        showFriendlySpamAlert(warnText, showToast);
        endCheckInTap(true);
        return;
      }

      const locTag = result?.data?.location_name ? ` tại ${result.data.location_name}` : "";
      const serverMsg = `${result?.message || `Đã ghi nhận chấm công lúc ${serverTime}`}${locTag}`;
      setStatusMessage(serverMsg);
      endCheckInTap(true);

      // Step 5: Async post-tasks chạy bất đồng bộ sau khi check-in/out 200 OK
      Promise.resolve()
        .then(() => attendanceService.triggerAttendanceHaptic("light"))
        .catch(() => {});
      Promise.resolve()
        .then(() => fetchTodayStatus())
        .catch(() => {});
      if (onCheckInSuccess) {
        try {
          onCheckInSuccess({ ...result, autoShiftMsg: serverMsg });
        } catch {}
      }
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

  const pad2 = (n) => String(n).padStart(2, "0");
  const weekdayNames = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  const weekdayDateLabel = `${weekdayNames[nowClock.getDay()]}, ngày ${pad2(nowClock.getDate())}/${pad2(nowClock.getMonth() + 1)}/${nowClock.getFullYear()}`;
  const clockHHMM = `${pad2(nowClock.getHours())}:${pad2(nowClock.getMinutes())}`;
  const clockSS = `:${pad2(nowClock.getSeconds())}`;

  const mascotState = getAttendanceAnimationState({
    todayRecord: effectiveToday,
    todayEffective: liveTodayEffective,
    lastCheckAction
  });

  const isActionBusy =
    isDebounceLocked ||
    isLockedRef.current ||
    stage === STAGES.SUBMITTING ||
    stage === STAGES.LOCATING;
  const checkInBtnEnabled =
    !isDayLockedByEffective &&
    !hasCheckedIn &&
    !isLockedPeriod &&
    !isActionBusy;
  const checkOutBtnEnabled =
    !isDayLockedByEffective &&
    hasCheckedIn &&
    !hasCheckedOut &&
    !isLockedPeriod &&
    !isActionBusy;

  const checkInTimeShort = effectiveToday?.check_in_time
    ? String(effectiveToday.check_in_time).slice(0, 5)
    : "";
  const checkOutTimeShort = effectiveToday?.check_out_time
    ? String(effectiveToday.check_out_time).slice(0, 5)
    : "";
  const checkInModeLabel = formatModeBadgeLabel(
    effectiveToday?.check_in_mode || effectiveToday?.work_location_type
  );
  const checkOutModeLabel = formatModeBadgeLabel(
    effectiveToday?.check_out_mode || effectiveToday?.work_location_type
  );

  const todaySessionSummary = (() => {
    if (!hasCheckedOut) return "";
    if (effectiveToday?.session_summary) return effectiveToday.session_summary;
    const dur = effectiveToday?.duration_status;
    if (dur === "INVALID_SHORT_DURATION") {
      return "0 công (Thời gian làm quá ngắn)";
    }
    if (effectiveToday?.work_credit !== null && effectiveToday?.work_credit !== undefined) {
      const creditNum = Number(effectiveToday.work_credit) || 0;
      const suffix =
        dur === "MORNING_ONLY"
          ? " (Ca sáng)"
          : dur === "AFTERNOON_ONLY"
          ? " (Ca chiều)"
          : creditNum >= 1
          ? " (Cả ngày)"
          : "";
      return `${formatViWorkday(creditNum)} công${suffix}`;
    }
    if (effectiveToday?.status === "0.5") return "0,5 công";
    if (effectiveToday?.status === "0") return "0 công (Chưa đủ giờ)";
    if (effectiveToday?.status === "1" || effectiveToday?.status === "1/OT") return "1 công (Cả ngày)";
    return "";
  })();

  return (
    <div className="w-full px-3.5 pt-2 flex flex-col space-y-3">
      {/* SECTION 1: COMPACT DIGITAL CLOCK & SUN/MOON GREETING BAR */}
      <div className="bg-[#F0F3FF] dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-3xl sm:text-4xl font-black text-[#B80035] dark:text-rose-400 tabular-nums tracking-tight leading-none">
              {clockHHMM}
            </span>
            <span className="text-base sm:text-lg font-extrabold text-[#E11D48] dark:text-rose-300 tabular-nums leading-none">
              {clockSS}
            </span>
            <span className="ml-1 text-xs font-extrabold uppercase text-slate-500 dark:text-slate-400">
              {nowClock.getHours() >= 12 ? "PM" : "AM"}
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-1">
            {weekdayDateLabel}
          </p>
          <p className="text-xs font-bold text-[#111C2D] dark:text-slate-200 mt-0.5">
            CÔNG TY SEDINCO • Ca {effStart} – {effEnd}
          </p>
        </div>

        <div
          className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 border border-amber-200/80 dark:border-slate-700 shadow-sm flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          {isDark ? (
            <svg viewBox="0 0 88 88" className="w-9 h-9 animate-sun-pulse">
              <circle cx="44" cy="44" r="36" fill="#60A5FA" fillOpacity="0.22" />
              <path
                d="M 50 26 A 16 16 0 1 0 60 52 A 13 13 0 1 1 50 26 Z"
                fill="#38BDF8"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 88 88" className="w-9 h-9 animate-sun-pulse">
              <circle cx="44" cy="44" r="36" fill="#FEF08A" fillOpacity="0.65" />
              <circle cx="44" cy="44" r="22" fill="#F59E0B" />
            </svg>
          )}
        </div>
      </div>

      {/* SECTION 2: CENTER MASCOT STAGE (ĐỒNG BỘ 1-1 VỚI 3 TRẠNG THÁI CHẤM CÔNG) */}
      <SedincoMascot state={mascotState} />

      {/* SECTION 3: REAL-TIME VERIFICATION & DAILY STATUS TICKET CARD */}
      <div
        data-testid="checkin-effective-status-card"
        data-effective-code={effectiveCode || (hasCheckedOut ? "DONE" : hasCheckedIn ? "IN_SHIFT" : "NONE")}
        className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-[0_6px_20px_-4px_rgba(17,28,45,0.06)] overflow-hidden"
      >
        {effectiveCode === "1" && isAdminAdjusted ? (
          <div className="p-3.5 bg-emerald-50/85 dark:bg-emerald-950/50 space-y-1">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#16A34A] text-white flex items-center justify-center shrink-0 shadow-xs">
                <CheckCircle2 size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-extrabold text-[#16A34A] dark:text-emerald-300 leading-snug">
                  ✓ Bạn đã đủ công của ngày hôm nay
                </div>
                <p className="text-xs font-medium text-emerald-900 dark:text-emerald-100 mt-0.5 leading-snug">
                  Đã được Quản trị viên xác nhận đủ 1 công
                </p>
              </div>
            </div>
          </div>
        ) : effectiveCode === "P" ? (
          <div className="p-3.5 bg-sky-50/85 dark:bg-sky-950/45 space-y-1">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#0051CA] text-white flex items-center justify-center shrink-0 shadow-xs text-sm">
                📋
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-extrabold text-[#0051CA] dark:text-sky-200 leading-snug">
                  📋 Hôm nay bạn nghỉ phép có lương (1 công)
                </div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                  Đã khóa thao tác chấm công theo trạng thái nghỉ phép được duyệt.
                </p>
              </div>
            </div>
          </div>
        ) : effectiveCode === "KL" && isAdminAdjusted ? (
          <div className="p-3.5 bg-amber-50/85 dark:bg-amber-950/40 space-y-1">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center shrink-0 shadow-xs text-sm">
                ⏸️
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-amber-200 leading-snug">
                  ⏸️ Hôm nay bạn nghỉ không lương
                </div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                  Ngày nghỉ không tính công — Liên hệ Quản trị nếu có thay đổi
                </p>
              </div>
            </div>
          </div>
        ) : effectiveCode === "L" ? (
          <div className="p-3.5 bg-emerald-50/85 dark:bg-emerald-950/50 space-y-1">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#16A34A] text-white flex items-center justify-center shrink-0 shadow-xs text-sm">
                🎉
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-extrabold text-[#16A34A] dark:text-emerald-300 leading-snug">
                  🎉 Hôm nay là ngày Nghỉ lễ (Hưởng nguyên lương)
                </div>
                <p className="text-xs font-medium text-emerald-900 dark:text-emerald-100 mt-0.5 leading-snug">
                  {liveTodayEffective?.holiday_name
                    ? `Dịp lễ: ${liveTodayEffective.holiday_name}`
                    : "Nghỉ lễ chính thức theo quy định công ty."}
                </p>
              </div>
            </div>
          </div>
        ) : effectiveCode === "1+OT" || effectiveCode === "OT" ? (
          <div className="p-3.5 bg-indigo-50/85 dark:bg-indigo-950/50 space-y-1">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs text-sm">
                ⚡
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-extrabold text-indigo-900 dark:text-indigo-200 leading-snug">
                  {effectiveCode === "1+OT"
                    ? "⚡ Bạn đã đủ công và tăng ca (OT) hôm nay"
                    : "⚡ Hôm nay bạn được ghi nhận Tăng ca (OT)"}
                </div>
                <p className="text-xs font-medium text-indigo-800 dark:text-indigo-200 mt-0.5 leading-snug">
                  {Number(liveTodayEffective?.ot_hours || 0) > 0
                    ? `Đã ghi nhận ${formatViWorkday(liveTodayEffective.ot_hours)} giờ tăng ca hôm nay.`
                    : "Đã khóa thao tác chấm công theo ghi nhận tăng ca của Quản trị."}
                </p>
              </div>
            </div>
          </div>
        ) : hasCheckedIn && hasCheckedOut ? (
          /* TRẠNG THÁI 3 — ĐÃ CHẤM CÔNG RA (HOÀN THÀNH NGÀY CÔNG) */
          <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/45 space-y-2">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#16A34A] text-white flex items-center justify-center shrink-0 shadow-xs">
                <CheckCircle2 size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-extrabold text-[#16A34A] dark:text-emerald-300 uppercase tracking-tight leading-snug">
                  ✓ ĐÃ HOÀN TẤT CHẤM CÔNG HÔM NAY
                </div>
                <div
                  data-testid="checkin-completed-summary"
                  className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-bold text-[#111C2D] dark:text-slate-100"
                >
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span>Vào: {checkInTimeShort || "--:--"}</span>
                    <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400">
                      ({checkInModeLabel})
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span>Ra: {checkOutTimeShort || "--:--"}</span>
                    <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400">
                      ({checkOutModeLabel})
                    </span>
                  </span>
                </div>
              </div>
            </div>
            {todaySessionSummary && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-600/50 text-emerald-800 dark:text-emerald-200 text-xs font-bold">
                <span>Công thực tế hôm nay: {todaySessionSummary}</span>
              </div>
            )}
            {effectiveToday?.field_note && (
              <div className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                📍 Công trình: {effectiveToday.field_note}
              </div>
            )}
          </div>
        ) : hasCheckedIn ? (
          /* TRẠNG THÁI 2 — ĐÃ CHẤM CÔNG VÀO, ĐANG TRONG CA LÀM VIỆC */
          <div className="p-3.5 bg-sky-50/80 dark:bg-sky-950/40 space-y-1.5">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#16A34A] text-white flex items-center justify-center shrink-0 shadow-xs">
                <CheckCircle2 size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-extrabold text-[#16A34A] dark:text-emerald-300 uppercase tracking-tight leading-snug">
                    ✓ ĐÃ VÀO CA LÚC {checkInTimeShort}
                  </span>
                  <span
                    data-testid="checked-in-mode-badge"
                    className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                      checkInModeLabel === "Đi công trình"
                        ? "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700"
                        : "bg-sky-100 dark:bg-sky-950/80 text-[#0051CA] dark:text-sky-200 border border-sky-300 dark:border-sky-700"
                    }`}
                  >
                    {checkInModeLabel}
                  </span>
                </div>
                <p className="text-xs font-medium text-[#111C2D] dark:text-slate-200 leading-relaxed break-words mt-0.5">
                  Đang trong ca làm việc tại{" "}
                  <strong className="text-[#16A34A] dark:text-emerald-300">
                    {effectiveToday?.matched_location_name || effectiveToday?.location_name || checkInModeLabel}
                  </strong>
                  . Bấm <strong>Chấm công Ra (Tan ca)</strong> bên dưới khi kết thúc ca.
                </p>
                {effectiveToday?.field_note && (
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mt-0.5">
                    📍 Ghi chú: {effectiveToday.field_note}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* TRẠNG THÁI 1 — CHƯA CHẤM CÔNG VÀO */
          <div className="p-3.5 flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#FFE4E6] dark:bg-rose-950/70 text-[#E11D48] dark:text-rose-300 flex items-center justify-center shrink-0">
              <Clock size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold text-[#111C2D] dark:text-white leading-snug">
                Chưa chấm công hôm nay
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                Chọn chế độ <strong>Tại văn phòng</strong> hoặc <strong>Đi công trình</strong> và bấm <strong>Chấm công Vào</strong> để bắt đầu ca.
              </p>
            </div>
          </div>
        )}

        {/* Perforated Ticket Cutout Divider */}
        <div className="sedinco-ticket-cutout">
          <div className="w-full border-t-2 border-dashed border-slate-200 dark:border-slate-700" />
        </div>

        {/* 2-Column Ticket Metadata Footer Strip */}
        <div className="px-4 py-2.5 bg-[#F0F3FF]/65 dark:bg-slate-800/70 flex items-center justify-between gap-2 text-xs">
          <div>
            <span className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
              CA QUY ĐỊNH
            </span>
            <span className="font-extrabold text-[#111C2D] dark:text-white">
              {effStart} – {effEnd}
            </span>
          </div>
          <div className="text-right">
            <span className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
              TRẠNG THÁI
            </span>
            <span
              className={`inline-flex items-center gap-1 font-extrabold ${
                hasCheckedOut
                  ? "text-[#16A34A] dark:text-emerald-300"
                  : hasCheckedIn
                  ? "text-[#0051CA] dark:text-sky-300"
                  : "text-slate-700 dark:text-slate-200"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  hasCheckedOut
                    ? "bg-[#16A34A]"
                    : hasCheckedIn
                    ? "bg-[#0051CA]"
                    : "bg-amber-500"
                }`}
              />
              <span>
                {isDayLockedByEffective
                  ? liveTodayEffective?.note || "Đã chốt trạng thái hôm nay"
                  : hasCheckedOut
                  ? "Đã hoàn tất ca"
                  : hasCheckedIn
                  ? Number(effectiveToday?.late_minutes || 0) > 0
                    ? `Đang làm việc (Muộn ${effectiveToday.late_minutes}p)`
                    : "Đang trong ca làm việc"
                  : "Chờ vào ca"}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 4: THANH CHUYỂN CHẾ ĐỘ (TẠI VĂN PHÒNG | ĐI CÔNG TRÌNH) + Ô GHI CHÚ TÙY CHỌN + NÚT CHẤM CÔNG ĐỒNG BỘ 3 TRẠNG THÁI */}
      {!isDayLockedByEffective && !hasCheckedOut && !isLockedPeriod && (
        <div className="w-full space-y-2.5">
          {/* Thanh chuyển chế độ gọn gàng 2 lựa chọn */}
          <div
            data-testid="checkin-mode-selector"
            className="w-full rounded-2xl bg-slate-100/90 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-1.5 flex items-center gap-1.5"
          >
            <button
              type="button"
              data-testid="mode-btn-office"
              disabled={isActionBusy}
              onClick={() => setIsFieldWorkMode(false)}
              className={`flex-1 min-h-[42px] px-3 py-2 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                !isFieldWorkMode
                  ? "bg-white dark:bg-slate-800 text-[#111C2D] dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0 text-[#0051CA] dark:text-sky-400" />
              <span>Tại văn phòng</span>
            </button>
            <button
              type="button"
              data-testid="mode-btn-fieldwork"
              disabled={isActionBusy}
              onClick={() => setIsFieldWorkMode(true)}
              className={`flex-1 min-h-[42px] px-3 py-2 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                isFieldWorkMode
                  ? "bg-amber-500 text-white shadow-xs border border-amber-600"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <HardHat className="w-4 h-4 shrink-0" />
              <span>Đi công trình</span>
            </button>
          </div>

          {/* Khi chọn Đi công trình: chỉ hiển thị duy nhất 1 ô nhập ghi chú ngắn tùy chọn */}
          {isFieldWorkMode && (
            <input
              type="text"
              data-testid="fieldwork-optional-note-input"
              value={fieldNote}
              onChange={(e) => setFieldNote(e.target.value)}
              placeholder="Ghi chú công trình (không bắt buộc)"
              maxLength={200}
              className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-600/60 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-amber-500"
            />
          )}

          {/* TRẠNG THÁI 1 (!hasCheckedIn): CHỈ HIỂN THỊ NÚT CHẤM CÔNG VÀO Ở CẢ 2 MỤC */}
          {!hasCheckedIn && (
            <button
              id="btn-start-checkin"
              data-testid="btn-checkin"
              type="button"
              disabled={!checkInBtnEnabled}
              onClick={() => handleStartCheckIn(false, "IN")}
              className={`min-h-[58px] w-full rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-left transition-transform duration-150 ${
                checkInBtnEnabled
                  ? isFieldWorkMode
                    ? "bg-amber-600 bg-gradient-to-r from-amber-500 to-orange-600 text-white border border-amber-500 shadow-lg shadow-amber-500/25 cursor-pointer active:scale-[0.98]"
                    : "bg-[#16A34A] hover:bg-[#15803D] dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white border border-emerald-700/80 shadow-[0_8px_20px_-4px_rgba(22,163,74,0.3)] cursor-pointer active:scale-[0.98]"
                  : "bg-[#E7EEFF] dark:bg-slate-800 border border-slate-300/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 opacity-50 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-xl leading-none shrink-0" aria-hidden="true">☀️</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm sm:text-base font-extrabold leading-tight break-words">
                    {stage === STAGES.SUBMITTING
                      ? "ĐANG GỬI CHẤM CÔNG VÀO..."
                      : stage === STAGES.LOCATING
                      ? "ĐANG ĐỊNH VỊ GPS..."
                      : isFieldWorkMode
                      ? "CHẤM CÔNG VÀO (ĐI CÔNG TRÌNH)"
                      : "CHẤM CÔNG VÀO (VÀO CA)"}
                  </div>
                  <div className="text-xs font-semibold mt-0.5 leading-snug text-emerald-50">
                    {isFieldWorkMode
                      ? "Chấm công GPS tại công trình bất kỳ (không cần đăng ký trước)"
                      : `Bắt đầu ca làm việc tại văn phòng (${effStart})`}
                  </div>
                </div>
              </div>
              <Clock className="w-5 h-5 shrink-0 opacity-90" />
            </button>
          )}

          {/* TRẠNG THÁI 2 (hasCheckedIn && !hasCheckedOut): ẨN HOÀN TOÀN NÚT VÀO, ĐỒNG BỘ SANG NÚT CHẤM CÔNG RA Ở CẢ 2 MỤC */}
          {hasCheckedIn && !hasCheckedOut && (
            <button
              id="btn-start-checkin"
              data-testid="btn-checkout"
              type="button"
              disabled={!checkOutBtnEnabled}
              onClick={() => handleStartCheckIn(false, "OUT")}
              className={`min-h-[58px] w-full rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-left transition-transform duration-150 ${
                checkOutBtnEnabled
                  ? isFieldWorkMode
                    ? "bg-amber-600 bg-gradient-to-r from-amber-500 to-orange-600 text-white border border-amber-500 shadow-lg shadow-amber-500/25 cursor-pointer active:scale-[0.98]"
                    : "sedinco-crimson-gradient hover:bg-[#BE123C] dark:bg-rose-600 dark:hover:bg-rose-500 text-white border border-[#BE123C]/80 shadow-[0_8px_20px_-4px_rgba(225,29,72,0.35)] cursor-pointer active:scale-[0.98]"
                  : "bg-[#E7EEFF] dark:bg-slate-800 border border-slate-300/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 opacity-50 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-xl leading-none shrink-0" aria-hidden="true">🌙</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm sm:text-base font-extrabold leading-tight break-words">
                    {stage === STAGES.SUBMITTING
                      ? "ĐANG GỬI CHẤM CÔNG RA..."
                      : stage === STAGES.LOCATING
                      ? "ĐANG ĐỊNH VỊ GPS..."
                      : isFieldWorkMode
                      ? "CHẤM CÔNG RA (TAN CA CÔNG TRÌNH)"
                      : "CHẤM CÔNG RA (TAN CA)"}
                  </div>
                  <div className="text-xs font-semibold mt-0.5 leading-snug text-rose-100">
                    {isFieldWorkMode
                      ? "Chốt giờ tan ca từ công trình bất kỳ bằng GPS"
                      : `Bấm để chốt giờ tan ca tại văn phòng (${effEnd})`}
                  </div>
                </div>
              </div>
              <Clock className="w-5 h-5 shrink-0 opacity-90" />
            </button>
          )}

          {/* Dòng trạng thái vị trí & kết nối mạng gọn nhẹ */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {isFieldWorkMode
                ? "📍 Đi công trình: Cho phép chấm công GPS tự do mọi nơi"
                : locationFriendlyBadge?.text || "📍 Chấm công theo vị trí chi nhánh"}
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0 text-right">
              {networkBadge?.online ? (networkBadge.networkType === "wifi" ? "Wi-Fi sẵn sàng" : "Mạng di động") : "Mất kết nối"}
            </span>
          </div>
        </div>
      )}

      {/* Cảnh báo & Thông báo trạng thái xử lý */}
      {(Boolean(spamWarning) ||
        stage === STAGES.LOCATING ||
        stage === STAGES.SUBMITTING ||
        stage === STAGES.PERM_DENIED ||
        stage === STAGES.ERROR ||
        stage === STAGES.SECURITY_FRAUD ||
        (errorMessage && stage !== STAGES.ERROR && stage !== STAGES.PERM_DENIED && stage !== STAGES.SECURITY_FRAUD)) && (
        <div className="space-y-2 text-center">
          {spamWarning && (
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-left flex items-start gap-2.5">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
              <p className="font-semibold text-xs sm:text-sm text-amber-900 dark:text-amber-100 leading-relaxed">{spamWarning}</p>
            </div>
          )}

          {(stage === STAGES.LOCATING || stage === STAGES.SUBMITTING) && statusMessage && (
            <div className="w-full py-2.5 px-3.5 rounded-2xl text-xs font-semibold inline-flex items-center justify-center gap-2 border bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700">
              <span className="w-2 h-2 rounded-full bg-[#E11D48] dark:bg-rose-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && stage !== STAGES.ERROR && stage !== STAGES.PERM_DENIED && stage !== STAGES.SECURITY_FRAUD && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 text-left flex items-start gap-2.5">
              <AlertTriangle size={18} className="text-rose-600 dark:text-rose-300 shrink-0 mt-0.5" />
              <p className="font-semibold text-xs text-rose-900 dark:text-rose-200">{errorMessage}</p>
            </div>
          )}

          {stage === STAGES.PERM_DENIED && (
            <div
              data-testid="checkin-perm-denied-card"
              className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-left space-y-2.5"
            >
              <div className="flex items-start gap-2.5">
                <MapPin size={18} className="text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-amber-950 dark:text-amber-100">{errorMessage}</h4>
                  {errorDetails && <p className="text-xs text-amber-900 dark:text-amber-200 mt-1 leading-relaxed">{errorDetails}</p>}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                {(canOpenPermSetting || isZaloMiniAppRuntime()) && (
                  <AppButton
                    type="button"
                    variant="primary"
                    fullWidth
                    icon={Settings}
                    onClick={() => openZaloPermissionSettings()}
                  >
                    Mở cài đặt quyền Zalo
                  </AppButton>
                )}
                <AppButton
                  type="button"
                  variant="secondary"
                  fullWidth
                  icon={RotateCcw}
                  onClick={() => handleStartCheckIn(true)}
                >
                  Thử lại
                </AppButton>
              </div>
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
              <div className="flex flex-col sm:flex-row gap-2">
                <AppButton
                  type="button"
                  variant="danger"
                  fullWidth
                  onClick={() => handleStartCheckIn(true)}
                  icon={RotateCcw}
                >
                  Thử lại
                </AppButton>
                {!isFieldWorkMode && (
                  <AppButton
                    type="button"
                    variant="secondary"
                    fullWidth
                    icon={HardHat}
                    onClick={() => {
                      setIsFieldWorkMode(true);
                      setStage(STAGES.IDLE);
                      setErrorMessage("");
                    }}
                  >
                    Chuyển sang Đi công trình
                  </AppButton>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* NHẮC QUÊN GIỜ RA CỦA NGÀY CŨ + THÔNG BÁO CÔNG TY */}
      {forgottenCheckout && (
        <button
          type="button"
          onClick={() => onOpenFixCheckoutRequest && onOpenFixCheckoutRequest(forgottenCheckout)}
          className="w-full p-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 border border-amber-300 dark:border-amber-500/50 text-left flex items-start gap-2.5 transition cursor-pointer"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
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

      {/* MODAL CẢNH BÁO KHI PHÁT HIỆN FAKE GPS */}
      <AppModal
        open={stage === STAGES.SECURITY_FRAUD}
        onClose={() => setStage(STAGES.IDLE)}
        title="Cảnh báo tín hiệu GPS"
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
            Hệ thống phát hiện tín hiệu vị trí giả lập (Mock Location). Vui lòng tắt ứng dụng giả lập GPS trên thiết bị và thử lại.
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
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-500/15 text-[#E11D48] dark:text-rose-400 flex items-center justify-center mx-auto shadow-sm border border-rose-100 dark:border-rose-500/30">
            <MapPin size={32} />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Sedinco HR sử dụng vị trí thực tế để xác nhận bạn đang ở chi nhánh/kho hàng hoặc tại công trình để chấm công nhanh gọn.
          </p>
        </div>
      </AppModal>
    </div>
  );
}
