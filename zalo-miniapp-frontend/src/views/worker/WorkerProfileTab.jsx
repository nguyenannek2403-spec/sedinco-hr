import React, { useState, useEffect, useRef } from "react";
import {
  DollarSign,
  Smartphone,
  Lock,
  LogOut,
  ChevronRight,
  Phone,
  Mail,
  Clock,
  Building2,
  Calendar,
  CheckCircle2
} from "lucide-react";
import { safePost, safeGet } from "../../utils/api";
import SalarySlipModal from "../../components/SalarySlipModal";
import { getShiftLabel } from "../../utils/viLabels";
import { formatViWorkday, formatViNumber } from "../../utils/viNumberFormat";
import { getDeviceIdentity, getDeviceIdentitySync, formatEmployeeDeviceLabel } from "../../utils/deviceIdentity";
import { AppButton, AppModal } from "../../components/ui";
import { FontScaleSelector } from "../../context/FontScaleContext";

/**
 * WorkerProfileTab — Google Stitch "Sedinco Pulse" Screen 5 (Tài khoản & Phiếu lương Nhân viên)
 * - Header Row: "Tài khoản nhân sự" + "● Đang hoạt động" green badge
 * - Employee Profile Ticket Card with perforated divider & 2 #F0F3FF tactical boxes (CA LÀM VIỆC CHUẨN & THIẾT BỊ ĐIỂM DANH CỐ ĐỊNH)
 * - Monthly Payslip Hero Card with full-width Crimson CTA ("Xem phiếu lương tháng M/YYYY")
 * - 3-Tile Monthly Attendance Stats Row ("Thống kê Công tháng M")
 * - Preferences & Operational Settings Card ("CÀI ĐẶT & TRỢ NĂNG XƯỞNG") with 6-step Font Scale (100%–200%), Device Change, Password & Logout
 */
export default function WorkerProfileTab({
  currentUser,
  onLogout,
  showToast,
  onChangePasswordRequest,
  onOpenPayslip = null,
  onOpenPeriodPayslip = null
}) {
  const handleOpenPayslipProp = onOpenPayslip || onOpenPeriodPayslip;
  const [fallbackSlipOpen, setFallbackSlipOpen] = useState(false);
  const [attendanceSummary, setAttendanceSummary] = useState({
    total_work_days: 0,
    on_time_count: 0,
    late_count: 0,
    total_late_minutes: 0,
    total_ot_hours: 0,
    effective_shift_start: "",
    effective_shift_end: ""
  });

  // Yêu cầu đổi thiết bị
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [deviceReason, setDeviceReason] = useState("");
  const [deviceSubmitting, setDeviceSubmitting] = useState(false);
  const [deviceError, setDeviceError] = useState("");

  const deviceSubmittingRef = useRef(false);

  useEffect(() => {
    if (currentUser?.role === "admin") return undefined;
    let active = true;
    const now = new Date();
    safeGet("/attendance/me", {
      month: now.getMonth() + 1,
      year: now.getFullYear()
    })
      .then((attRes) => {
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
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [currentUser?.role]);

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

  const handleRequestDeviceChange = async (e) => {
    e.preventDefault();
    if (deviceSubmittingRef.current) return;
    if (!deviceReason.trim()) {
      setDeviceError("Vui lòng nhập lý do đổi thiết bị.");
      return;
    }

    deviceSubmittingRef.current = true;
    setDeviceSubmitting(true);
    setDeviceError("");
    try {
      const identity = await getDeviceIdentity();
      const res = await safePost("/employees/request-device-change", {
        reason: deviceReason.trim(),
        new_device_id: identity.device_id,
        device_name: identity.device_model_name
      });
      if (res?.success) {
        if (showToast) showToast("Đã gửi yêu cầu đổi thiết bị đến Quản trị viên!", "success");
        setIsDeviceModalOpen(false);
        setDeviceReason("");
      } else {
        const msg = res?.message || "Không thể gửi yêu cầu đổi thiết bị.";
        setDeviceError(msg);
        if (showToast) showToast(msg, "error");
      }
    } catch (err) {
      const msg = err.message || "Lỗi gửi yêu cầu đổi thiết bị.";
      setDeviceError(msg);
      if (showToast) showToast(msg, "error");
    } finally {
      deviceSubmittingRef.current = false;
      setDeviceSubmitting(false);
    }
  };

  const activeShiftLabel = getShiftLabel(currentUser?.shift_type);
  const effStart = attendanceSummary?.effective_shift_start || currentUser?.custom_start_time || "08:00";
  const effEnd = attendanceSummary?.effective_shift_end || currentUser?.custom_end_time || "17:30";
  const currentMonthNum = new Date().getMonth() + 1;
  const currentYearNum = new Date().getFullYear();

  const initials = String(currentUser?.ho_ten || "NV")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase() || "NV";

  return (
    <div className="space-y-4 pb-8">
      {/* STITCH SCREEN 5 — SECTION 1: TOP TITLE & ACTIVE STATUS PILL */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-[#111C2D] dark:text-white tracking-tight">
          Tài khoản nhân sự
        </h2>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-700 text-xs font-extrabold text-[#16A34A] dark:text-emerald-300 shrink-0 whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-[#16A34A] shrink-0" />
          <span className="whitespace-nowrap">Đang hoạt động</span>
        </span>
      </div>

      {/* STITCH SCREEN 5 — SECTION 2: PERFORATED EMPLOYEE PROFILE TICKET CARD */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-start gap-3.5">
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#B80035] to-[#E11D48] p-0.5 shadow-md">
              {currentUser?.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt="Avatar"
                  className="w-full h-full object-cover rounded-[14px]"
                />
              ) : (
                <div className="w-full h-full rounded-[14px] bg-[#F0F3FF] dark:bg-slate-800 flex items-center justify-center text-lg font-extrabold text-[#E11D48] dark:text-rose-300">
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
              <span className="px-2.5 py-0.5 rounded-full bg-[#FFE4E6] dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 text-xs font-mono font-extrabold text-[#B80035] dark:text-rose-300">
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

        {/* Perforated Ticket Cutout Divider */}
        <div className="sedinco-ticket-cutout">
          <div className="w-full border-t-2 border-dashed border-slate-200 dark:border-slate-700" />
        </div>

        {/* 2 Tactical Info Boxes (#F0F3FF) */}
        <div className="space-y-2 text-xs">
          <div className="p-3 rounded-xl bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 text-[#E11D48] dark:text-rose-400 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                  CA LÀM VIỆC CHUẨN
                </span>
                <strong className="text-[#111C2D] dark:text-white break-words">
                  {effStart} – {effEnd} ({activeShiftLabel})
                </strong>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 text-[#16A34A] dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                  THIẾT BỊ ĐIỂM DANH CỐ ĐỊNH
                </span>
                <strong className="text-[#111C2D] dark:text-white break-words">
                  {formatEmployeeDeviceLabel(
                    currentUser?.ho_ten,
                    currentUser?.bound_device_name || getDeviceIdentitySync().device_model_name
                  )}
                </strong>
              </div>
            </div>
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] dark:text-emerald-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* STITCH SCREEN 5 — SECTION 3: MONTHLY PAYSLIP HERO CARD */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-[#E11D48] dark:text-rose-400 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-extrabold uppercase tracking-wider text-[#B80035] dark:text-rose-400">
                PHIẾU LƯƠNG &amp; BẢNG CÔNG
              </span>
              <h3 className="text-sm font-extrabold text-[#111C2D] dark:text-white">
                Kỳ lương Tháng {currentMonthNum}/{currentYearNum}
              </h3>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-[#F0F3FF] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-[#111C2D] dark:text-slate-200 shrink-0 whitespace-nowrap">
            Chuẩn 8h
          </span>
        </div>

        <AppButton
          variant="primary"
          fullWidth
          icon={DollarSign}
          onClick={handleOpenSalarySlip}
          className="min-h-[48px] rounded-xl font-extrabold shadow-[0_6px_18px_-3px_rgba(225,29,72,0.3)]"
        >
          Xem phiếu lương tháng {currentMonthNum}/{currentYearNum}
        </AppButton>
      </div>

      {/* STITCH SCREEN 5 — SECTION 4: 3-TILE MONTHLY ATTENDANCE STATS ROW */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
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

      {/* STITCH SCREEN 5 — SECTION 5: ACCESSIBILITY FONT SCALE & ACCOUNT SECURITY */}
      <FontScaleSelector />

      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-2 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
        {/* Yêu Cầu Đổi Thiết Bị */}
        <button
          type="button"
          onClick={() => {
            setDeviceError("");
            setIsDeviceModalOpen(true);
          }}
          className="perf-list-item w-full p-3.5 flex items-center justify-between text-left hover:bg-[#F0F3FF]/60 dark:hover:bg-slate-800/80 rounded-xl transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#111C2D] dark:text-white">Yêu cầu đổi thiết bị</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">Đăng ký đổi điện thoại chấm công mới</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200 transition-colors shrink-0" />
        </button>

        {/* Tài Khoản & Mật Khẩu */}
        <button
          type="button"
          onClick={onChangePasswordRequest}
          className="perf-list-item w-full p-3.5 flex items-center justify-between text-left hover:bg-[#F0F3FF]/60 dark:hover:bg-slate-800/80 rounded-xl transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#111C2D] dark:text-white">Tài khoản &amp; Mật khẩu</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">Đổi tên đăng nhập, SĐT hoặc mật khẩu bảo mật</div>
            </div>
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
        Đăng xuất khỏi thiết bị
      </AppButton>

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

      {/* Modal Yêu Cầu Đổi Thiết Bị */}
      <AppModal
        open={isDeviceModalOpen}
        onClose={() => !deviceSubmitting && setIsDeviceModalOpen(false)}
        disableClose={deviceSubmitting}
        title="Đổi thiết bị chấm công"
        subtitle="Gửi yêu cầu mở khóa sang điện thoại mới"
        icon={<Smartphone className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />}
        maxWidthClass="max-w-sm"
        footer={
          <div className="flex gap-2.5">
            <AppButton
              variant="secondary"
              disabled={deviceSubmitting}
              onClick={() => setIsDeviceModalOpen(false)}
              className="flex-1"
            >
              Đóng / Quay lại
            </AppButton>
            <AppButton
              type="submit"
              form="device-change-form"
              variant="primary"
              loading={deviceSubmitting}
              loadingText="Đang gửi..."
              className="flex-1"
            >
              Gửi yêu cầu
            </AppButton>
          </div>
        }
      >
        <form id="device-change-form" onSubmit={handleRequestDeviceChange} className="p-5 space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Vui lòng nhập lý do thay đổi điện thoại (ví dụ: mất máy, hỏng máy, đổi điện thoại mới) để Quản trị viên duyệt mở khóa:
          </p>
          {deviceError && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
              {deviceError}
            </div>
          )}
          <textarea
            value={deviceReason}
            onChange={(e) => setDeviceReason(e.target.value)}
            placeholder="Nhập lý do cụ thể..."
            required
            rows={3}
            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-2xl p-3 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
          />
        </form>
      </AppModal>
    </div>
  );
}
