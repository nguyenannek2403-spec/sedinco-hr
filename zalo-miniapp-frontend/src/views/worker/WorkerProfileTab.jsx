import React, { useState } from "react";
import {
  User,
  DollarSign,
  Smartphone,
  Lock,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Phone,
  Mail,
  Building,
  AlertCircle
} from "lucide-react";
import { safePost, safeGet } from "../../utils/api";
import SalarySlipModal from "../../components/SalarySlipModal";

export default function WorkerProfileTab({
  currentUser,
  onLogout,
  showToast,
  onChangePasswordRequest
}) {
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [payrollData, setPayrollData] = useState(null);
  const [salaryLoading, setSalaryLoading] = useState(false);

  // Yêu cầu đổi thiết bị
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [deviceReason, setDeviceReason] = useState("");
  const [deviceSubmitting, setDeviceSubmitting] = useState(false);

  const handleOpenSalarySlip = async () => {
    setSalaryLoading(true);
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    try {
      const res = await safeGet("/payroll/me", { month, year });
      if (res?.success && res.data) {
        setPayrollData(res.data);
        setIsSalaryModalOpen(true);
      } else {
        alert(res?.message || "Chưa có bảng tính lương chính thức cho tháng hiện tại.");
      }
    } catch (err) {
      alert(err.message || "Không thể tải phiếu lương.");
    } finally {
      setSalaryLoading(false);
    }
  };

  const handleRequestDeviceChange = async (e) => {
    e.preventDefault();
    if (!deviceReason.trim()) return;

    setDeviceSubmitting(true);
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
        alert(res?.message || "Không thể gửi yêu cầu đổi thiết bị.");
      }
    } catch (err) {
      alert(err.message || "Lỗi gửi yêu cầu.");
    } finally {
      setDeviceSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Profile Header Card */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-3xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 p-0.5 shadow-lg shadow-blue-600/30">
            <img
              src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
              alt="Avatar"
              className="w-full h-full object-cover rounded-2xl"
            />
          </div>
          <div>
            <h2 className="text-base font-black text-white">{currentUser?.ho_ten || "Cán bộ công nhân viên"}</h2>
            <p className="text-xs text-blue-400 font-bold mt-0.5">{currentUser?.chuc_danh || "Nhân viên Sedinco"}</p>
            <span className="inline-block mt-1 px-2.5 py-0.5 bg-slate-900/60 border border-slate-700 text-[10px] font-mono font-bold text-slate-300 rounded-md">
              Mã NV: {currentUser?.ma_nv}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-700/60 grid grid-cols-2 gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-slate-500" />
            <span>{currentUser?.dien_thoai || "0905123456"}</span>
          </div>
          <div className="flex items-center gap-1.5 truncate">
            <Mail className="w-3.5 h-3.5 text-slate-500" />
            <span className="truncate">{currentUser?.email || "worker@sedinco.vn"}</span>
          </div>
        </div>
      </div>

      {/* Action List */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-2 shadow-lg divide-y divide-slate-700/50">
        {/* Phiếu Lương */}
        <button
          onClick={handleOpenSalarySlip}
          disabled={salaryLoading}
          className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-700/40 rounded-xl transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Phiếu Lương Điện Tử</div>
              <div className="text-[11px] text-slate-400">Xem chi tiết lương & phụ cấp thực lĩnh</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
        </button>

        {/* Yêu Cầu Đổi Thiết Bị */}
        <button
          onClick={() => setIsDeviceModalOpen(true)}
          className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-700/40 rounded-xl transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Yêu Cầu Đổi Thiết Bị</div>
              <div className="text-[11px] text-slate-400">Đăng ký đổi điện thoại chấm công mới</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
        </button>

        {/* Đổi Mật Khẩu */}
        <button
          onClick={onChangePasswordRequest}
          className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-700/40 rounded-xl transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Đổi Mật Khẩu</div>
              <div className="text-[11px] text-slate-400">Cập nhật mật khẩu bảo mật tài khoản</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
        </button>
      </div>

      {/* Nút Đăng Xuất */}
      <button
        onClick={onLogout}
        className="w-full py-3.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" />
        <span>Đăng Xuất Khỏi Thiết Bị</span>
      </button>

      {/* Salary Slip Modal */}
      {isSalaryModalOpen && payrollData && (
        <SalarySlipModal
          payrollItem={payrollData}
          month={new Date().getMonth() + 1}
          year={new Date().getFullYear()}
          onClose={() => setIsSalaryModalOpen(false)}
        />
      )}

      {/* Modal Yêu Cầu Đổi Thiết Bị */}
      {isDeviceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-indigo-400" />
              Yêu Cầu Đổi Thiết Bị Chấm Công
            </h3>
            <p className="text-xs text-slate-400">
              Vui lòng nhập lý do thay đổi máy (ví dụ: mất điện thoại, hỏng máy, đổi máy mới) để Quản trị viên duyệt mở khóa:
            </p>
            <form onSubmit={handleRequestDeviceChange} className="space-y-4">
              <textarea
                value={deviceReason}
                onChange={(e) => setDeviceReason(e.target.value)}
                placeholder="Nhập lý do cụ thể..."
                required
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsDeviceModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={deviceSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
                >
                  {deviceSubmitting ? "Đang gửi..." : "Gửi Yêu Cầu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
