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
  Calendar
} from "lucide-react";
import { safePost, safeGet } from "../../utils/api";
import SalarySlipModal from "../../components/SalarySlipModal";
import { getShiftLabel } from "../../utils/viLabels";
import { formatViWorkday, formatViNumber } from "../../utils/viNumberFormat";
import { getDeviceIdentity, getDeviceIdentitySync, formatEmployeeDeviceLabel } from "../../utils/deviceIdentity";
import { AppButton, AppModal } from "../../components/ui";
import { FontScaleSelector, useFontScale } from "../../modules/accessibility/FontScaleContext";

export default function WorkerProfileTab({
  currentUser,
  onLogout,
  showToast,
  onChangePasswordRequest,
  onOpenPayslip = null
}) {
  const { fontScale } = useFontScale();
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
    if (typeof onOpenPayslip === "function") {
      onOpenPayslip(curM, curY);
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

  return (
    <div className="p-3.5 pb-8 space-y-4">
      {/* Thẻ Hồ Sơ Nhân Sự */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100/90 dark:border-slate-800 rounded-2xl p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] relative overflow-hidden">
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#0068FF] to-[#06B6D4] p-0.5 shadow-md shadow-blue-600/25 shrink-0">
            <img
              src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
              alt="Avatar"
              className="w-full h-full object-cover rounded-full"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold leading-snug text-slate-900 dark:text-white break-words">{currentUser?.ho_ten || "Cán bộ công nhân viên"}</h2>
            <p className="text-sm text-[#0068FF] dark:text-blue-400 font-semibold mt-0.5 leading-snug break-words">{currentUser?.chuc_danh || "Nhân viên Sedinco"}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="inline-block px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 rounded-full whitespace-nowrap">
                Mã NV: {currentUser?.ma_nv}
              </span>
              <span className="inline-block px-2.5 py-0.5 bg-blue-50 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/40 text-xs font-mono font-semibold text-[#0068FF] dark:text-blue-300 rounded-full whitespace-nowrap">
                Tài khoản: {currentUser?.login_username || currentUser?.phone || currentUser?.ma_nv}
              </span>
            </div>
          </div>
        </div>

        <div className="zaui-ticket-divider" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700">
            <Phone className="w-3.5 h-3.5 text-[#0068FF] dark:text-blue-400 shrink-0" />
            <span>{currentUser?.phone || currentUser?.dien_thoai || "Chưa cập nhật SĐT"}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 min-w-0">
            <Mail className="w-3.5 h-3.5 text-[#0068FF] dark:text-blue-400 shrink-0" />
            <span className="break-words">{currentUser?.email || "worker@sedinco.vn"}</span>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2 px-3 py-2 rounded-xl bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-500/30 text-sky-800 dark:text-sky-200">
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">Khối / Bộ phận: {currentUser?.department || "Khối Công trình"}</span>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2 px-3 py-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30 text-indigo-800 dark:text-indigo-200">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">Ca làm việc: {activeShiftLabel} ({effStart} – {effEnd})</span>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2 p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200 min-w-0">
            <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-semibold break-words">
              Thiết bị: {formatEmployeeDeviceLabel(
                currentUser?.ho_ten,
                currentUser?.bound_device_name || getDeviceIdentitySync().device_model_name
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Thẻ Thống kê Công trong tháng */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100/90 dark:border-slate-800 rounded-2xl p-4 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#0068FF] dark:text-blue-400 shrink-0" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Thống kê Công tháng {currentMonthNum}
          </h3>
        </div>

        <div className={`grid gap-2 text-center ${fontScale >= 150 ? "grid-cols-1" : "grid-cols-3"}`}>
          <div className="bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 rounded-xl px-2 py-2.5">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Tổng công</div>
            <div className="text-sm font-extrabold text-[#0068FF] dark:text-blue-300 mt-0.5">
              {formatViWorkday(attendanceSummary?.total_work_days || 0)} công
            </div>
          </div>
          <div className="bg-emerald-50/75 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60 rounded-xl px-2 py-2.5">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Đúng giờ</div>
            <div className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">
              {formatViNumber(attendanceSummary?.on_time_count || 0, 0)} ngày
            </div>
          </div>
          <div className="bg-amber-50/75 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/60 rounded-xl px-2 py-2.5">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Đi muộn</div>
            <div className="text-sm font-extrabold text-amber-700 dark:text-amber-300 mt-0.5">
              {formatViNumber(attendanceSummary?.late_count || 0, 0)} lần
            </div>
          </div>
        </div>
      </div>

      {/* Thẻ Cỡ chữ Hiển thị cho mọi độ tuổi */}
      <FontScaleSelector />

      {/* Thẻ Phiếu Lương & Bảo mật Tài khoản */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100/90 dark:border-slate-800 rounded-2xl p-2 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] divide-y divide-slate-100 dark:divide-slate-800">
        {/* Phiếu Lương & Bảng Công Lịch Sử */}
        <div className="p-3.5 space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Phiếu Lương &amp; Bảng Công</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">Xem chi tiết lương, phụ cấp &amp; công từng ngày mọi tháng</div>
            </div>
          </div>

          <AppButton
            variant="success"
            fullWidth
            icon={DollarSign}
            onClick={handleOpenSalarySlip}
          >
            Xem phiếu lương tháng {currentMonthNum}/{currentYearNum}
          </AppButton>
        </div>

        {/* Yêu Cầu Đổi Thiết Bị */}
        <button
          type="button"
          onClick={() => {
            setDeviceError("");
            setIsDeviceModalOpen(true);
          }}
          className="perf-list-item w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Yêu cầu đổi thiết bị</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">Đăng ký đổi điện thoại chấm công mới</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200 transition-colors shrink-0" />
        </button>

        {/* Tài Khoản & Mật Khẩu */}
        <button
          type="button"
          onClick={onChangePasswordRequest}
          className="perf-list-item w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Tài khoản &amp; Mật khẩu</div>
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
