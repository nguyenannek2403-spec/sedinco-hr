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
  CalendarCheck,
  X
} from "lucide-react";
import { safePost, safeGet } from "../../utils/api";
import SalarySlipModal from "../../components/SalarySlipModal";

const SHIFT_LABELS = {
  FULL_DAY: "Ca hành chính (08:00 – 17:30)",
  MORNING_SHIFT: "Ca sáng (07:30 – 12:00)",
  AFTERNOON_SHIFT: "Ca chiều (13:00 – 17:30)",
  NIGHT_SHIFT: "Ca tối / đêm (18:00 – 22:00)"
};

export default function WorkerProfileTab({
  currentUser,
  onLogout,
  showToast,
  onChangePasswordRequest
}) {
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [payrollData, setPayrollData] = useState(null);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [slipMonth, setSlipMonth] = useState(new Date().getMonth() + 1);
  const [slipYear, setSlipYear] = useState(new Date().getFullYear());
  const [leaveBalance, setLeaveBalance] = useState(null);

  // Yêu cầu đổi thiết bị
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [deviceReason, setDeviceReason] = useState("");
  const [deviceSubmitting, setDeviceSubmitting] = useState(false);
  const [deviceError, setDeviceError] = useState("");

  const salaryLoadingRef = useRef(false);
  const deviceSubmittingRef = useRef(false);

  useEffect(() => {
    let active = true;
    safeGet("/requests/leave-balance")
      .then((res) => {
        if (active && res?.success && res.data) {
          setLeaveBalance(res.data);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleOpenSalarySlip = async () => {
    if (salaryLoadingRef.current) return;
    salaryLoadingRef.current = true;
    setSalaryLoading(true);
    try {
      const res = await safeGet("/payroll/me", { month: slipMonth, year: slipYear });
      if (res?.success && res.data) {
        setPayrollData(res.data);
        setIsSalaryModalOpen(true);
      } else {
        if (showToast) showToast(res?.message || "Chưa có bảng tính lương cho tháng này.", "warning");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Không thể tải phiếu lương.", "error");
    } finally {
      salaryLoadingRef.current = false;
      setSalaryLoading(false);
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
      const res = await safePost("/employees/request-device-change", {
        reason: deviceReason.trim(),
        new_device_id: `WEB_MOBILE_${Date.now()}`
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

  const activeShiftLabel = SHIFT_LABELS[currentUser?.shift_type] || SHIFT_LABELS.FULL_DAY;

  return (
    <div className="p-4 pb-28 space-y-4">
      {/* Profile Header Card */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-3xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 p-0.5 shadow-lg shadow-blue-600/30 shrink-0">
            <img
              src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
              alt="Avatar"
              className="w-full h-full object-cover rounded-2xl"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-snug text-white truncate">{currentUser?.ho_ten || "Cán bộ công nhân viên"}</h2>
            <p className="text-sm text-blue-400 font-semibold mt-0.5">{currentUser?.chuc_danh || "Nhân viên Sedinco"}</p>
            <span className="inline-block mt-1 px-2.5 py-0.5 bg-slate-900/60 border border-slate-700 text-xs font-mono font-semibold text-slate-300 rounded-md whitespace-nowrap">
              Mã NV: {currentUser?.ma_nv}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{currentUser?.dien_thoai || "Chưa cập nhật SĐT"}</span>
          </div>
          <div className="flex items-center gap-1.5 truncate">
            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{currentUser?.email || "worker@sedinco.vn"}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:col-span-2 text-indigo-300">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">Ca làm việc: {activeShiftLabel}</span>
          </div>
        </div>
      </div>

      {/* Quỹ Phép Năm */}
      {leaveBalance && (
        <div className="bg-indigo-950/60 border border-indigo-500/30 rounded-2xl p-4 shadow-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Quỹ phép năm {leaveBalance.year}</div>
              <div className="text-xs text-slate-300">
                Đã dùng {leaveBalance.used} • Chờ duyệt {leaveBalance.pending} ngày
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-sm font-bold text-emerald-400 whitespace-nowrap">
              Còn {leaveBalance.remaining}/{leaveBalance.quota} ngày
            </span>
          </div>
        </div>
      )}

      {/* Action List */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-2 shadow-lg divide-y divide-slate-700/50">
        {/* Phiếu Lương + Bộ chọn kỳ lương */}
        <div className="p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Phiếu Lương Điện Tử</div>
                <div className="text-[11px] text-slate-400">Xem chi tiết công, phụ cấp, BHXH & thực lĩnh</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={slipMonth}
                onChange={(e) => setSlipMonth(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-bold"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>T{m}</option>
                ))}
              </select>
              <select
                value={slipYear}
                onChange={(e) => setSlipYear(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-bold"
              >
                {[2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenSalarySlip}
            disabled={salaryLoading}
            className="w-full min-h-[44px] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-md transition whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <DollarSign className="w-4 h-4 shrink-0" />
            <span>{salaryLoading ? "Đang tải phiếu lương..." : `Mở phiếu lương tháng ${slipMonth}/${slipYear}`}</span>
          </button>
        </div>

        {/* Yêu Cầu Đổi Thiết Bị */}
        <button
          type="button"
          onClick={() => {
            setDeviceError("");
            setIsDeviceModalOpen(true);
          }}
          className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-700/40 rounded-xl transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Yêu cầu đổi thiết bị</div>
              <div className="text-xs text-slate-400">Đăng ký đổi điện thoại chấm công mới</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors shrink-0" />
        </button>

        {/* Đổi Mật Khẩu */}
        <button
          type="button"
          onClick={onChangePasswordRequest}
          className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-700/40 rounded-xl transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Đổi mật khẩu</div>
              <div className="text-xs text-slate-400">Cập nhật mật khẩu bảo mật tài khoản</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors shrink-0" />
        </button>
      </div>

      {/* Nút Đăng Xuất */}
      <button
        type="button"
        onClick={onLogout}
        className="w-full min-h-[44px] py-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-semibold text-sm rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        <LogOut className="w-4 h-4 shrink-0" />
        <span>Đăng xuất khỏi thiết bị</span>
      </button>

      {/* Salary Slip Modal */}
      {isSalaryModalOpen && payrollData && (
        <SalarySlipModal
          payrollItem={payrollData}
          month={slipMonth}
          year={slipYear}
          currentUser={currentUser}
          showToast={showToast}
          onStatusUpdated={(newStatus) => {
            setPayrollData((prev) => (prev ? { ...prev, salary_confirm_status: newStatus } : prev));
          }}
          onClose={() => setIsSalaryModalOpen(false)}
        />
      )}

      {/* Modal Yêu Cầu Đổi Thiết Bị */}
      {isDeviceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-indigo-400" />
                Yêu Cầu Đổi Thiết Bị Chấm Công
              </h3>
              <button
                type="button"
                onClick={() => setIsDeviceModalOpen(false)}
                className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center shrink-0"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Vui lòng nhập lý do thay đổi máy (ví dụ: mất điện thoại, hỏng máy, đổi máy mới) để Quản trị viên duyệt mở khóa:
            </p>
            <form onSubmit={handleRequestDeviceChange} className="space-y-3">
              {deviceError && (
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                  {deviceError}
                </div>
              )}
              <textarea
                value={deviceReason}
                onChange={(e) => setDeviceReason(e.target.value)}
                placeholder="Nhập lý do cụ thể..."
                required
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
              />
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsDeviceModalOpen(false)}
                  className="flex-1 min-h-[44px] py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={deviceSubmitting}
                  className="flex-1 min-h-[44px] py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {deviceSubmitting ? "Đang gửi..." : "Gửi yêu cầu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
