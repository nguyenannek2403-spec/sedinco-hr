import React, { useState, useEffect } from "react";
import {
  DollarSign,
  Smartphone,
  Lock,
  LogOut,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  Clock,
  Building2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Edit3,
  Camera,
  Trash2,
  Loader2,
  Link2,
  Unlink,
  ShieldCheck
} from "lucide-react";
import { safeGet, safePut } from "../../utils/api";
import { compressAvatarImage } from "../../utils/imageCompressor";
import { zaloAuthService } from "../../services/zalo-auth.service";
import { SDK_STATES, isZaloMiniAppRuntime, openZaloPermissionSettings } from "../../services/zalo-sdk-core";
import { zaloMediaService } from "../../services/zalo-media.service";
import SalarySlipModal from "../../components/SalarySlipModal";
import BankCardModal from "../../components/BankCardModal";
import { BankBrandLogo } from "../../components/BankPickerDropdown";
import { findBankByCodeOrBin } from "../../utils/vietnamBanks";
import { getShiftLabel } from "../../utils/viLabels";
import { formatViWorkday, formatViNumber } from "../../utils/viNumberFormat";
import {
  parseKnownDevices,
  sanitizeSingleDeviceModelName
} from "../../utils/deviceIdentity";
import { AppButton, UserAvatar } from "../../components/ui";
import { FontScaleSelector } from "../../context/FontScaleContext";

function formatDeviceSeenShort(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

export default function WorkerProfileTab({
  currentUser,
  onLogout,
  onUserUpdated,
  showToast,
  onChangePasswordRequest,
  onOpenPayslip = null,
  onOpenPeriodPayslip = null
}) {
  const handleOpenPayslipProp = onOpenPayslip || onOpenPeriodPayslip;
  const avatarFileRef = React.useRef(null);
  const [fallbackSlipOpen, setFallbackSlipOpen] = useState(false);
  const [fallbackSlipPeriod, setFallbackSlipPeriod] = useState(() => ({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  }));
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [showDeviceHistory, setShowDeviceHistory] = useState(false);
  const [syncedUser, setSyncedUser] = useState(null);
  const [salaryStatusMeta, setSalaryStatusMeta] = useState(null);
  const [zaloLinkStatus, setZaloLinkStatus] = useState(null);
  const [zaloActionBusy, setZaloActionBusy] = useState(false);
  const [zaloNotice, setZaloNotice] = useState(null);
  const [attendanceSummary, setAttendanceSummary] = useState({
    total_work_days: 0,
    on_time_count: 0,
    late_count: 0,
    total_late_minutes: 0,
    total_ot_hours: 0,
    effective_shift_start: "",
    effective_shift_end: ""
  });

  useEffect(() => {
    if (currentUser?.role === "admin") return undefined;
    let active = true;
    const now = new Date();
    const curM = now.getMonth() + 1;
    const curY = now.getFullYear();
    Promise.all([
      safeGet("/attendance/me", {
        month: curM,
        year: curY
      }).catch(() => null),
      safeGet("/auth/me", {}, { cancelPrevious: false }).catch(() => null),
      safeGet("/payroll/me", {
        month: curM,
        year: curY
      }, { cancelPrevious: false }).catch(() => null),
      safeGet("/notifications/my", {
        filter: "unread",
        limit: 10
      }, { cancelPrevious: false }).catch(() => null),
      zaloAuthService.getZaloLinkStatus().catch(() => null)
    ]).then(([attRes, meRes, payRes, notifRes, zaloStatusData]) => {
      if (!active) return;
      if (zaloStatusData) {
        setZaloLinkStatus(zaloStatusData);
      }
      const rawAtt = attRes?.data;
      if (rawAtt && !Array.isArray(rawAtt) && rawAtt.summary) {
        setAttendanceSummary((prev) => ({
          ...prev,
          ...rawAtt.summary
        }));
      } else if (Array.isArray(rawAtt)) {
        const totalDays = rawAtt.filter((r) => r.status && r.status !== "0" && r.status !== "V").length;
        setAttendanceSummary((prev) => ({ ...prev, total_work_days: totalDays }));
      }
      if (meRes?.success && meRes?.data) {
        setSyncedUser(meRes.data);
      }

      const unreadList = notifRes?.data?.notifications || notifRes?.notifications || [];
      const reportNotif = Array.isArray(unreadList)
        ? unreadList.find((n) => n?.type === "SALARY_REPORT_SENT" || n?.category === "salary_report")
        : null;
      const mySlip = payRes?.success && payRes?.data ? payRes.data : null;

      if (mySlip && mySlip.payout_status === "REPORT_SENT") {
        setSalaryStatusMeta({
          payout_status: "REPORT_SENT",
          month: Number(mySlip.thang || curM),
          year: Number(mySlip.nam || curY),
          netSalary: mySlip.netSalary
        });
      } else if (reportNotif && reportNotif.ref_month && reportNotif.ref_year) {
        setSalaryStatusMeta({
          payout_status: "REPORT_SENT",
          month: Number(reportNotif.ref_month),
          year: Number(reportNotif.ref_year),
          netSalary: null
        });
      } else if (mySlip && mySlip.payout_status) {
        setSalaryStatusMeta({
          payout_status: mySlip.payout_status,
          month: Number(mySlip.thang || curM),
          year: Number(mySlip.nam || curY),
          netSalary: mySlip.netSalary
        });
      } else {
        setSalaryStatusMeta(null);
      }
    });
    return () => {
      active = false;
    };
  }, [currentUser?.ma_nv, currentUser?.role]);

  const profileUser = syncedUser ? { ...currentUser, ...syncedUser } : currentUser;

  const handleUploadAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarSaving(true);
    try {
      // Định tuyến qua hệ thống Media tập trung (/api/media/upload -> Cloudinary / Fallback nén gọn <= 45KB)
      let nextAvatarValue = "";
      const cloudRes = await zaloMediaService.uploadAvatarFile(file, {
        targetEmployeeId: profileUser?.ma_nv || ""
      });
      if (
        cloudRes.ok &&
        cloudRes.data?.url &&
        (cloudRes.data?.storage === "cloudinary" || String(cloudRes.data.url).length <= 45000)
      ) {
        nextAvatarValue = cloudRes.data.url;
      } else if (cloudRes.ok && cloudRes.data?.storage === "inline_compact_fallback") {
        const compressed = await compressAvatarImage(file);
        nextAvatarValue = compressed.dataUrl;
      } else if (!cloudRes.ok) {
        throw new Error(cloudRes.message || "Không thể tải lên ảnh đại diện.");
      }

      const res = await safePut("/account/avatar", { avatar_url: nextAvatarValue });
      if (res?.success) {
        const finalUrl = res?.data?.avatar_url ?? nextAvatarValue;
        setSyncedUser((prev) => ({ ...(prev || currentUser || {}), avatar_url: finalUrl }));
        if (typeof onUserUpdated === "function") onUserUpdated({ avatar_url: finalUrl });
        if (typeof showToast === "function") showToast(res.message || "Đã cập nhật ảnh đại diện!", "success");
      } else if (typeof showToast === "function") {
        showToast(res?.message || "Không thể cập nhật ảnh đại diện.", "error");
      }
    } catch (err) {
      if (typeof showToast === "function") showToast(err?.message || "Không thể nén hoặc tải lên ảnh đại diện.", "error");
    } finally {
      setAvatarSaving(false);
      try {
        e.target.value = "";
      } catch {}
    }
  };

  const handleLinkZalo = async () => {
    if (zaloActionBusy) return;
    setZaloActionBusy(true);
    setZaloNotice(null);
    try {
      const res = await zaloAuthService.linkZaloToCurrentEmployee();
      if (res.ok) {
        const updated = await zaloAuthService.getZaloLinkStatus().catch(() => null);
        if (updated) setZaloLinkStatus(updated);
        setZaloNotice({ state: "success", message: res.message || "Đã liên kết tài khoản Zalo với mã nhân viên!" });
        if (typeof showToast === "function") showToast(res.message || "Đã liên kết Zalo!", "success");
      } else {
        setZaloNotice({
          state: res.state,
          message: res.message,
          canOpenSettings: res.canOpenSettings
        });
      }
    } finally {
      setZaloActionBusy(false);
    }
  };

  const handleUnlinkZalo = async () => {
    if (zaloActionBusy) return;
    setZaloActionBusy(true);
    setZaloNotice(null);
    try {
      const res = await zaloAuthService.unlinkZaloFromCurrentEmployee();
      if (res?.success) {
        setZaloLinkStatus((prev) => ({ ...(prev || {}), is_linked: false, zalo_user_id_masked: null }));
        setSyncedUser((prev) => ({ ...(prev || currentUser || {}), zalo_user_id: null }));
        setZaloNotice({ state: "success", message: "Đã hủy liên kết tài khoản Zalo khỏi mã nhân viên." });
        if (typeof showToast === "function") showToast("Đã hủy liên kết Zalo.", "success");
      }
    } catch (err) {
      setZaloNotice({ state: "error", message: err?.message || "Không thể hủy liên kết Zalo." });
    } finally {
      setZaloActionBusy(false);
    }
  };

  const handleVerifyZaloPhone = async () => {
    if (zaloActionBusy) return;
    setZaloActionBusy(true);
    setZaloNotice(null);
    try {
      const res = await zaloAuthService.verifyZaloPhoneForEmployee();
      if (res.ok) {
        if (res.data?.phone) {
          setSyncedUser((prev) => ({ ...(prev || currentUser || {}), phone: res.data.phone, dien_thoai: res.data.phone }));
          if (typeof onUserUpdated === "function") onUserUpdated({ phone: res.data.phone, dien_thoai: res.data.phone });
        }
        setZaloNotice({
          state: res.data?.phone_matched === false ? "warning" : "success",
          message: res.message || "Đã xác minh số điện thoại Zalo!"
        });
      } else {
        setZaloNotice({
          state: res.state,
          message: res.message,
          canOpenSettings: res.canOpenSettings
        });
      }
    } finally {
      setZaloActionBusy(false);
    }
  };

  const handleDeleteAvatar = async () => {
    if (avatarSaving) return;
    setAvatarSaving(true);
    try {
      const res = await safePut("/account/avatar", { avatar_url: null });
      if (res?.success) {
        setSyncedUser((prev) => ({ ...(prev || currentUser || {}), avatar_url: null }));
        if (typeof onUserUpdated === "function") onUserUpdated({ avatar_url: null });
        if (typeof showToast === "function") showToast(res.message || "Đã xóa ảnh đại diện!", "success");
      } else if (typeof showToast === "function") {
        showToast(res?.message || "Không thể xóa ảnh đại diện.", "error");
      }
    } catch (err) {
      if (typeof showToast === "function") showToast(err?.message || "Lỗi kết nối máy chủ.", "error");
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleOpenSalarySlip = (overrideM = null, overrideY = null) => {
    const now = new Date();
    const targetM = Number(overrideM || now.getMonth() + 1);
    const targetY = Number(overrideY || now.getFullYear());
    if (typeof handleOpenPayslipProp === "function") {
      handleOpenPayslipProp(targetM, targetY);
    } else {
      setFallbackSlipPeriod({ month: targetM, year: targetY });
      setFallbackSlipOpen(true);
    }
  };

  const activeShiftLabel = getShiftLabel(profileUser?.shift_type);
  const effStart = attendanceSummary?.effective_shift_start || profileUser?.custom_start_time || "08:00";
  const effEnd = attendanceSummary?.effective_shift_end || profileUser?.custom_end_time || "17:30";
  const currentMonthNum = new Date().getMonth() + 1;
  const currentYearNum = new Date().getFullYear();

  const knownDevicesRaw = Array.isArray(profileUser?.device_history)
    ? profileUser.device_history
    : parseKnownDevices(profileUser?.known_devices_json);
  const sortedDeviceHistory = [...knownDevicesRaw]
    .filter((item) => item && (item.device_id || item.device_name || item.model))
    .sort((a, b) => {
      const ta = new Date(a?.last_seen || a?.first_seen || 0).getTime() || 0;
      const tb = new Date(b?.last_seen || b?.first_seen || 0).getTime() || 0;
      return tb - ta;
    })
    .map((item) => {
      const rawModel = String(item?.device_name || item?.model || "").trim();
      return {
        ...item,
        cleanModel: rawModel ? sanitizeSingleDeviceModelName(rawModel) : "Thiết bị không rõ",
        seenLabel: formatDeviceSeenShort(item?.last_seen || item?.first_seen)
      };
    });

  const dbBoundRaw = String(profileUser?.current_device || profileUser?.bound_device_name || "").trim();
  const dbCurrentModel = dbBoundRaw ? sanitizeSingleDeviceModelName(dbBoundRaw) : "";
  const hasDeviceData = sortedDeviceHistory.length > 0 || Boolean(dbCurrentModel);
  const latestDeviceModel = hasDeviceData ? (sortedDeviceHistory[0]?.cleanModel || dbCurrentModel) : "";
  const secondDeviceModel = hasDeviceData ? (sortedDeviceHistory[1]?.cleanModel || "") : "";
  const hasMultiDeviceAlert =
    hasDeviceData &&
    (Boolean(profileUser?.multi_device_alert) ||
      new Set(sortedDeviceHistory.map((d) => d.device_id || d.cleanModel).filter(Boolean)).size >= 2);
  const hasLongDeviceHistory = hasDeviceData && sortedDeviceHistory.length > 2;

  return (
    <div className="space-y-3.5 pb-8">
      {/* Header gọn */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-[#111C2D] dark:text-white tracking-tight">
          Tài khoản
        </h2>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-700 text-xs font-extrabold text-[#16A34A] dark:text-emerald-300 shrink-0 whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-[#16A34A] shrink-0" />
          <span className="whitespace-nowrap">Đang hoạt động</span>
        </span>
      </div>

      {/* Thông tin nhân sự */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-start gap-3.5">
          <div className="relative shrink-0 flex flex-col items-center gap-1.5">
            <div className="relative">
              <UserAvatar
                name={profileUser?.ho_ten || profileUser?.ma_nv}
                avatarUrl={profileUser?.avatar_url}
                size="xl"
              />
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/*"
                data-testid="profile-avatar-input"
                onChange={handleUploadAvatarFile}
                className="hidden"
              />
              <button
                type="button"
                disabled={avatarSaving}
                data-testid="profile-avatar-upload-btn"
                onClick={() => avatarFileRef.current?.click()}
                aria-label="Đổi ảnh đại diện"
                title="Đổi ảnh đại diện"
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#E11D48] hover:bg-[#BE123C] text-white border-2 border-white dark:border-slate-900 shadow-sm flex items-center justify-center cursor-pointer disabled:opacity-60"
              >
                {avatarSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
            </div>
            {profileUser?.avatar_url && (
              <button
                type="button"
                disabled={avatarSaving}
                data-testid="profile-avatar-delete-btn"
                onClick={handleDeleteAvatar}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/60 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 hover:text-rose-700 dark:text-slate-300 dark:hover:text-rose-300 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
                <span>Xóa ảnh</span>
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-base sm:text-lg font-extrabold text-[#111C2D] dark:text-white leading-snug break-words">
                {profileUser?.ho_ten || currentUser?.ho_ten || "Cán bộ công nhân viên"}
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-[#FFE4E6] dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 text-xs font-mono font-extrabold text-[#B80035] dark:text-rose-300">
                {profileUser?.ma_nv || currentUser?.ma_nv}
              </span>
            </div>
            <p className="text-xs sm:text-sm font-bold text-[#E11D48] dark:text-rose-400">
              {profileUser?.chuc_danh || currentUser?.chuc_danh || "Nhân viên Sedinco"}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{profileUser?.department || currentUser?.department || "Khối Công trình"}</span>
              </span>
              <span className="inline-flex items-center gap-1 font-mono">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{profileUser?.phone || profileUser?.dien_thoai || profileUser?.login_username || currentUser?.phone || currentUser?.dien_thoai || currentUser?.login_username || currentUser?.ma_nv}</span>
              </span>
            </div>
            {(profileUser?.email || currentUser?.email) && (
              <div className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span className="break-all">{profileUser?.email || currentUser?.email}</span>
              </div>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
          <div className="px-3 py-2 rounded-xl bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />
              <span className="text-slate-600 dark:text-slate-300 font-semibold">Ca làm việc:</span>
              <strong className="text-[#111C2D] dark:text-white truncate">
                {effStart} – {effEnd} ({activeShiftLabel})
              </strong>
            </div>
          </div>

          {/* 1 dòng thông báo / cảnh báo thiết bị đăng nhập gọn nhẹ (100% từ DB, không tự suy đoán User-Agent) */}
          <div
            data-testid="device-login-alert"
            className={`px-3 py-2 rounded-xl border space-y-2 ${
              hasMultiDeviceAlert
                ? "bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200"
                : "bg-[#F0F3FF] dark:bg-slate-800/80 border-slate-200/70 dark:border-slate-700 text-[#111C2D] dark:text-slate-200"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {!hasDeviceData ? (
                  <Smartphone className="w-4 h-4 text-slate-400 dark:text-slate-400 shrink-0" />
                ) : hasMultiDeviceAlert ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                ) : (
                  <Smartphone className="w-4 h-4 text-[#16A34A] dark:text-emerald-400 shrink-0" />
                )}
                <span className="truncate">
                  Thiết bị:{" "}
                  <strong className="font-bold">
                    {!hasDeviceData ? (
                      "Chưa ghi nhận"
                    ) : (
                      <>
                        {latestDeviceModel}
                        {sortedDeviceHistory.length === 2 && secondDeviceModel && secondDeviceModel !== latestDeviceModel
                          ? ` • ${secondDeviceModel}`
                          : ""}
                      </>
                    )}
                  </strong>
                </span>
              </div>

              {hasLongDeviceHistory && (
                <button
                  type="button"
                  data-testid="device-history-toggle-btn"
                  onClick={() => setShowDeviceHistory((prev) => !prev)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-[#0051CA] dark:text-blue-300 hover:bg-white/70 dark:hover:bg-slate-700/60 shrink-0 cursor-pointer"
                >
                  <span>{showDeviceHistory ? "Thu gọn" : "Xem chi tiết"}</span>
                  {showDeviceHistory ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>

            {hasLongDeviceHistory && showDeviceHistory && (
              <div className="pt-2 border-t border-amber-200/70 dark:border-slate-700 space-y-1">
                {sortedDeviceHistory.map((item, idx) => (
                  <div
                    key={`${item.device_id || item.cleanModel}-${idx}`}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-semibold truncate">{item.cleanModel}</span>
                    {item.seenLabel && (
                      <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                        {item.seenLabel}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Phiếu lương tháng */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        {salaryStatusMeta?.payout_status === "REPORT_SENT" && (
          <button
            type="button"
            data-testid="pending-salary-report-banner"
            onClick={() => handleOpenSalarySlip(salaryStatusMeta.month, salaryStatusMeta.year)}
            className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-rose-50 via-amber-50 to-rose-50 dark:from-rose-950/70 dark:via-amber-950/40 dark:to-rose-950/60 border border-rose-300 dark:border-rose-700/80 flex items-center justify-between gap-2.5 hover:shadow-sm transition cursor-pointer"
          >
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-extrabold text-[#B80035] dark:text-rose-200">
                📩 Báo cáo lương Tháng {salaryStatusMeta.month}/{salaryStatusMeta.year} đang chờ xác nhận
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Bấm để kiểm tra chi tiết &amp; bấm Xác nhận lương ngay
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#E11D48] dark:text-rose-300 shrink-0" />
          </button>
        )}

        {salaryStatusMeta?.payout_status === "CONFIRMED" && (
          <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 text-xs font-bold text-emerald-800 dark:text-emerald-200">
            ✓ Bạn đã xác nhận báo cáo lương Tháng {salaryStatusMeta.month}/{salaryStatusMeta.year}
          </div>
        )}

        {salaryStatusMeta?.payout_status === "PAID" && (
          <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 text-xs font-bold text-emerald-800 dark:text-emerald-200">
            💸 Công ty SEDINCO đã chuyển khoản lương Tháng {salaryStatusMeta.month}/{salaryStatusMeta.year}
          </div>
        )}

        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-[#E11D48] dark:text-rose-400 flex items-center justify-center shrink-0">
            <DollarSign className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-extrabold text-[#111C2D] dark:text-white">
            Phiếu lương Tháng {currentMonthNum}/{currentYearNum}
          </h3>
        </div>

        <AppButton
          variant="primary"
          fullWidth
          icon={DollarSign}
          onClick={() => handleOpenSalarySlip(currentMonthNum, currentYearNum)}
          className="min-h-[46px] rounded-xl font-extrabold"
        >
          Xem phiếu lương tháng {currentMonthNum}/{currentYearNum}
        </AppButton>
      </div>

      {/* Thẻ ngân hàng nhận lương (Hạng mục 3 - V40) */}
      {profileUser?.role !== "admin" && (
        <div
          data-testid="profile-bank-card-section"
          className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 text-[#0051CA] dark:text-blue-400 flex items-center justify-center shrink-0">
                <CreditCard className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-[#111C2D] dark:text-white truncate">
                  Thẻ ngân hàng nhận lương
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Dùng để nhận chuyển khoản lương hàng tháng
                </p>
              </div>
            </div>
          </div>

          {profileUser?.bank_account_number && profileUser?.bank_code ? (
            <div className="rounded-xl bg-[#F4F6F9] dark:bg-slate-800/85 border border-slate-200/80 dark:border-slate-700 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 font-semibold">Ngân hàng:</span>
                <div className="flex items-center gap-2 min-w-0">
                  {(() => {
                    const bankMeta = findBankByCodeOrBin(profileUser.bank_code || profileUser.bank_name);
                    return bankMeta ? <BankBrandLogo bank={bankMeta} sizeClass="w-7 h-7" /> : null;
                  })()}
                  <span
                    data-testid="profile-bank-name"
                    className="font-extrabold text-[#111C2D] dark:text-white text-right truncate"
                  >
                    {profileUser.bank_name || profileUser.bank_code}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 font-semibold">Số TK / Nickname:</span>
                <span
                  data-testid="profile-bank-acct"
                  className="font-mono font-black text-sm text-[#0051CA] dark:text-blue-300 break-all text-right"
                >
                  {profileUser.bank_account_number}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 font-semibold">Chủ tài khoản:</span>
                <span
                  data-testid="profile-bank-holder"
                  className="font-bold uppercase text-[#111C2D] dark:text-slate-100 text-right"
                >
                  {profileUser.bank_account_name || "Chưa cập nhật"}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-[#F4F6F9] dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
              Chưa liên kết tài khoản ngân hàng nhận lương.
            </div>
          )}

          <AppButton
            variant={profileUser?.bank_account_number ? "secondary" : "primary"}
            fullWidth
            icon={profileUser?.bank_account_number ? Edit3 : CreditCard}
            data-testid="open-bank-card-modal-btn"
            onClick={() => setBankModalOpen(true)}
            className="min-h-[44px] rounded-xl font-bold"
          >
            {profileUser?.bank_account_number ? "Cập nhật thẻ ngân hàng" : "+ Thêm thẻ ngân hàng"}
          </AppButton>
        </div>
      )}

      {/* Thống kê công tháng */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />
          <h3 className="text-sm font-extrabold text-[#111C2D] dark:text-white">
            Thống kê Công tháng {currentMonthNum}
          </h3>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 rounded-xl px-2 py-2.5">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Tổng công</div>
            <div className="text-sm font-extrabold text-[#E11D48] dark:text-rose-300 mt-0.5 font-mono">
              {formatViWorkday(attendanceSummary?.total_work_days || 0)} công
            </div>
          </div>
          <div className="bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 rounded-xl px-2 py-2.5">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Đúng giờ</div>
            <div className="text-sm font-extrabold text-[#16A34A] dark:text-emerald-300 mt-0.5 font-mono">
              {formatViNumber(attendanceSummary?.on_time_count || 0, 0)} ngày
            </div>
          </div>
          <div className="bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 rounded-xl px-2 py-2.5">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Đi muộn</div>
            <div className="text-sm font-extrabold text-amber-700 dark:text-amber-300 mt-0.5 font-mono">
              {formatViNumber(attendanceSummary?.late_count || 0, 0)} lần
            </div>
          </div>
        </div>
      </div>

      {/* Cỡ chữ (Option dropdown gọn) */}
      <FontScaleSelector />

      {/* Liên kết định danh Zalo & Xác minh SĐT */}
      {profileUser?.role !== "admin" && (
        <div
          data-testid="profile-zalo-identity-section"
          className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-500/15 border border-sky-200 dark:border-sky-500/30 text-[#0068FF] dark:text-sky-300 flex items-center justify-center shrink-0">
                <Link2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-[#111C2D] dark:text-white truncate">
                  Liên kết tài khoản Zalo
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Khóa định danh theo Mã NV {profileUser?.ma_nv}
                </p>
              </div>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${
                zaloLinkStatus?.is_linked || profileUser?.zalo_user_id
                  ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-700 text-[#16A34A] dark:text-emerald-300"
                  : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              }`}
            >
              {zaloLinkStatus?.is_linked || profileUser?.zalo_user_id ? "Đã liên kết" : "Chưa liên kết"}
            </span>
          </div>

          {zaloLinkStatus?.zalo_user_id_masked && (
            <div className="text-xs text-slate-600 dark:text-slate-300 bg-[#F4F6F9] dark:bg-slate-800/70 rounded-xl px-3 py-2 flex items-center justify-between">
              <span>Zalo ID liên kết:</span>
              <strong className="font-mono text-[#111C2D] dark:text-white">{zaloLinkStatus.zalo_user_id_masked}</strong>
            </div>
          )}

          {zaloNotice && (
            <div
              className={`p-3 rounded-xl text-xs border space-y-2 ${
                zaloNotice.state === "success"
                  ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                  : zaloNotice.state === SDK_STATES.PERMISSION_DENIED || zaloNotice.state === "warning"
                    ? "bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              }`}
            >
              <p className="font-semibold leading-relaxed">{zaloNotice.message}</p>
              {zaloNotice.canOpenSettings && isZaloMiniAppRuntime() && (
                <button
                  type="button"
                  onClick={() => openZaloPermissionSettings()}
                  className="text-xs font-bold underline text-[#0051CA] dark:text-blue-300 cursor-pointer"
                >
                  Mở cài đặt quyền Zalo
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {zaloLinkStatus?.is_linked || profileUser?.zalo_user_id ? (
              <AppButton
                variant="secondary"
                icon={Unlink}
                loading={zaloActionBusy}
                onClick={handleUnlinkZalo}
                className="min-h-[44px] rounded-xl text-xs font-bold"
              >
                Hủy liên kết Zalo
              </AppButton>
            ) : (
              <AppButton
                variant="primary"
                icon={Link2}
                loading={zaloActionBusy}
                onClick={handleLinkZalo}
                className="min-h-[44px] rounded-xl text-xs font-bold"
              >
                Liên kết Zalo hiện tại
              </AppButton>
            )}
            <AppButton
              variant="secondary"
              icon={ShieldCheck}
              loading={zaloActionBusy}
              onClick={handleVerifyZaloPhone}
              className="min-h-[44px] rounded-xl text-xs font-bold"
            >
              Xác minh SĐT từ Zalo
            </AppButton>
          </div>
        </div>
      )}

      {/* Tài khoản & Mật khẩu */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-1.5">
        <button
          type="button"
          onClick={onChangePasswordRequest}
          className="perf-list-item w-full p-3 flex items-center justify-between text-left hover:bg-[#F0F3FF]/60 dark:hover:bg-slate-800/80 rounded-xl transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-[#111C2D] dark:text-white">
              Tài khoản &amp; Mật khẩu
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200 transition-colors shrink-0" />
        </button>
      </div>

      {/* Nút Đăng Xuất */}
      <AppButton
        variant="danger"
        fullWidth
        icon={LogOut}
        onClick={onLogout}
        className="rounded-2xl"
      >
        Đăng xuất
      </AppButton>

      {/* Modal Thẻ ngân hàng nhận lương */}
      <BankCardModal
        open={bankModalOpen}
        onClose={() => setBankModalOpen(false)}
        currentUser={profileUser}
        showToast={showToast}
        onSaved={(savedBank) => {
          setSyncedUser((prev) => ({ ...(prev || currentUser || {}), ...savedBank }));
          if (typeof onUserUpdated === "function") {
            onUserUpdated(savedBank);
          }
        }}
      />

      {/* Fallback SalarySlipModal nếu component được dùng độc lập */}
      {fallbackSlipOpen && (
        <SalarySlipModal
          month={fallbackSlipPeriod.month}
          year={fallbackSlipPeriod.year}
          targetMaNv={currentUser?.ma_nv}
          showToast={showToast}
          onStatusUpdated={(nextSt) => {
            setSalaryStatusMeta((prev) =>
              prev ? { ...prev, payout_status: nextSt } : prev
            );
          }}
          onClose={() => setFallbackSlipOpen(false)}
        />
      )}
    </div>
  );
}
