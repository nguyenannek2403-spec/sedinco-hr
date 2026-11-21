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
  Edit3
} from "lucide-react";
import { safeGet } from "../../utils/api";
import SalarySlipModal from "../../components/SalarySlipModal";
import BankCardModal from "../../components/BankCardModal";
import { getShiftLabel } from "../../utils/viLabels";
import { formatViWorkday, formatViNumber } from "../../utils/viNumberFormat";
import {
  parseKnownDevices,
  sanitizeSingleDeviceModelName
} from "../../utils/deviceIdentity";
import { AppButton } from "../../components/ui";
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
  const [fallbackSlipOpen, setFallbackSlipOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [showDeviceHistory, setShowDeviceHistory] = useState(false);
  const [syncedUser, setSyncedUser] = useState(null);
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
    Promise.all([
      safeGet("/attendance/me", {
        month: now.getMonth() + 1,
        year: now.getFullYear()
      }).catch(() => null),
      safeGet("/auth/me", {}, { cancelPrevious: false }).catch(() => null)
    ]).then(([attRes, meRes]) => {
      if (!active) return;
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
    });
    return () => {
      active = false;
    };
  }, [currentUser?.ma_nv, currentUser?.role]);

  const profileUser = syncedUser ? { ...currentUser, ...syncedUser } : currentUser;

  const handleOpenSalarySlip = () => {
    const now = new Date();
    const curM = now.getMonth() + 1;
    const curY = now.getFullYear();
    if (typeof handleOpenPayslipProp === "function") {
      handleOpenPayslipProp(curM, curY);
    } else {
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

  const initials = String(currentUser?.ho_ten || "NV")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase() || "NV";

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
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#B80035] to-[#E11D48] p-0.5">
              {currentUser?.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt="Avatar"
                  className="w-full h-full object-cover rounded-[14px]"
                />
              ) : (
                <div className="w-full h-full rounded-[14px] bg-[#F0F3FF] dark:bg-slate-800 flex items-center justify-center text-base font-extrabold text-[#E11D48] dark:text-rose-300">
                  {initials}
                </div>
              )}
            </div>
            <span
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#16A34A] text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900"
              aria-hidden="true"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-base sm:text-lg font-extrabold text-[#111C2D] dark:text-white leading-snug break-words">
                {currentUser?.ho_ten || "Cán bộ công nhân viên"}
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-[#FFE4E6] dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 text-xs font-mono font-extrabold text-[#B80035] dark:text-rose-300">
                {currentUser?.ma_nv}
              </span>
            </div>
            <p className="text-xs sm:text-sm font-bold text-[#E11D48] dark:text-rose-400">
              {currentUser?.chuc_danh || "Nhân viên Sedinco"}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{currentUser?.department || "Khối Công trình"}</span>
              </span>
              <span className="inline-flex items-center gap-1 font-mono">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{currentUser?.phone || currentUser?.dien_thoai || currentUser?.login_username || currentUser?.ma_nv}</span>
              </span>
            </div>
            {currentUser?.email && (
              <div className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span className="break-all">{currentUser.email}</span>
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
          onClick={handleOpenSalarySlip}
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
            <div className="rounded-xl bg-[#F4F6F9] dark:bg-slate-800/85 border border-slate-200/80 dark:border-slate-700 p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 font-semibold">Ngân hàng:</span>
                <span
                  data-testid="profile-bank-name"
                  className="font-extrabold text-[#111C2D] dark:text-white text-right"
                >
                  {profileUser.bank_name || profileUser.bank_code}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 font-semibold">Số tài khoản:</span>
                <span
                  data-testid="profile-bank-acct"
                  className="font-mono font-black text-sm text-[#0051CA] dark:text-blue-300"
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
                  {profileUser.bank_account_name || profileUser.ho_ten}
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
          month={currentMonthNum}
          year={currentYearNum}
          targetMaNv={currentUser?.ma_nv}
          showToast={showToast}
          onClose={() => setFallbackSlipOpen(false)}
        />
      )}
    </div>
  );
}
