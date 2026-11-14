import React, { useState } from "react";
import {
  Clock,
  Smartphone,
  RefreshCw,
  ChevronRight,
  Menu,
  Bell,
  ShieldAlert,
  AlertTriangle,
  X,
  ArrowLeft,
  LogOut
} from "lucide-react";
import { ROLE_LABELS, ROLES } from "../constants/roles";

export default function DesktopHeader({
  currentUser,
  currentTab,
  setCurrentTab,
  activeRole,
  onRoleSwitch,
  onLogout,
  currentTime,
  alertsSummary = {},
  onRefresh,
  isLoading,
  onOpenMobileMenu
}) {
  const [showAlertPanel, setShowAlertPanel] = useState(false);

  const fraudCount = Number(alertsSummary?.fraud_count) || 0;
  const disputedCount = Number(alertsSummary?.disputed_salary_count) || 0;
  const deviceCount = Number(alertsSummary?.pending_device_count) || 0;
  const totalRedAlerts = fraudCount + disputedCount + deviceCount;

  const getTabTitle = () => {
    switch (currentTab) {
      case "matrix":
        return activeRole === "accountant"
          ? "Bảng Chấm Công Ma Trận"
          : "Bảng Công Ma Trận (Toàn Công Ty)";
      case "payroll":
        return "Bảng Lương & Đối Soát Khiếu Nại";
      case "requests":
        return "Trung Tâm Phê Duyệt Đơn Từ";
      case "management":
        return "Quản lý hồ sơ nhân viên";
      case "company":
        return "Cài đặt Công ty & Chấm công";
      case "holidays":
        return "Danh Mục Ngày Nghỉ Lễ (x3)";
      case "devices":
        return "Quản lý nhân sự & Thiết bị";
      case "permissions":
        return "Phân Quyền Kế Toán";
      case "audit_logs":
        return "Giám Sát Nhân Viên & Chống Gian Lận";
      case "profile":
        return "Hồ Sơ Cá Nhân & Phiếu Lương";
      default:
        return "Bảng Điều Khiển Sedinco HR";
    }
  };

  const displayTime = currentTime instanceof Date ? currentTime : new Date();

  return (
    <header
      className="bg-slate-900 border-b border-slate-800 pl-3 sm:pl-6 pr-[96px] lg:pr-8 pb-2.5 flex items-center justify-between gap-2 sticky top-0 z-40 select-none shadow-sm"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
    >
      {/* Trái: Nút Menu Mobile + Nút Trở về trên tab phụ + Tiêu đề tab */}
      <div className="flex items-center gap-2 min-w-0 shrink-0 sm:shrink">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden min-w-[40px] min-h-[40px] p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center shrink-0"
            title="Mở danh mục quản trị"
          >
            <Menu size={18} />
          </button>
        )}

        {currentTab && currentTab !== "matrix" && typeof setCurrentTab === "function" && (
          <button
            type="button"
            onClick={() => setCurrentTab("matrix")}
            className="min-h-[44px] px-2.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 flex items-center gap-1 text-xs font-extrabold shrink-0"
          >
            <ArrowLeft size={15} />
            <span>Trở về</span>
          </button>
        )}

        <div className="hidden md:block min-w-0">
          <div className="flex items-center gap-1 text-xs text-slate-300 font-bold leading-snug">
            <span>Sedinco Nhân Sự</span>
            <ChevronRight size={12} className="shrink-0" />
            <span className="text-blue-400 font-black truncate">{ROLE_LABELS[activeRole] || currentUser?.ho_ten}</span>
          </div>
          <h2 className="text-sm sm:text-base font-black text-white tracking-tight truncate">
            {getTabTitle()}
          </h2>
        </div>
      </div>

      {/* Giữa: Tên nhân sự nổi bật + Mã NV / Vai trò (Tránh tràn chữ với truncate) */}
      <div className="flex-1 min-w-0 text-center px-1">
        <div className="text-xs sm:text-sm font-extrabold text-white leading-tight truncate">
          {currentUser?.ho_ten || ROLE_LABELS[activeRole] || "Quản trị viên"}
        </div>
        <div className="text-xs text-blue-300 font-semibold leading-snug truncate">
          {currentUser?.ma_nv ? `${currentUser.ma_nv} • ` : ""}
          {ROLE_LABELS[activeRole] || getTabTitle()}
        </div>
      </div>

      {/* Phải: Cảnh báo + Chế độ NV + Đăng xuất rõ ràng (Đã chừa 96px tránh nút ... và X của Zalo) */}
      <div className="flex items-center gap-1.5 shrink-0 relative">
        {/* Đồng hồ số thời gian thực (Desktop) */}
        <div className="hidden xl:flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-mono font-bold text-slate-200">
          <Clock size={14} className="text-blue-400" />
          <span>
            {displayTime.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
          </span>
        </div>

        {/* Nút Chuông Cảnh Báo Nóng (Vị trí/Thiết bị lạ / Khiếu nại sai lương) */}
        <button
          type="button"
          onClick={() => setShowAlertPanel(!showAlertPanel)}
          aria-label="Trung tâm cảnh báo và thông báo"
          className={`relative min-w-[44px] min-h-[44px] px-2.5 py-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-black transition-all ${
            totalRedAlerts > 0
              ? "bg-rose-600/20 border-rose-500 text-rose-300 shadow-lg shadow-rose-600/20"
              : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          }`}
          title="Trung tâm Cảnh báo & Khiếu nại Lương"
        >
          <Bell size={16} className={totalRedAlerts > 0 ? "text-rose-400 animate-bounce" : "text-slate-300"} />
          {totalRedAlerts > 0 && (
            <span className="px-1.5 py-0.5 text-xs leading-none rounded-full bg-rose-600 text-white font-black">
              {totalRedAlerts}
            </span>
          )}
        </button>

        {/* Nút chuyển nhanh sang chế độ Công nhân (Desktop) */}
        {typeof onRoleSwitch === "function" && (
          <button
            type="button"
            onClick={() => onRoleSwitch(ROLES.WORKER)}
            className="hidden sm:flex min-h-[44px] items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-bold"
            title="Chuyển sang giao diện chấm công cá nhân"
          >
            <Smartphone size={14} className="text-blue-400" />
            <span>Chế độ NV</span>
          </button>
        )}

        {/* Nút Làm mới dữ liệu (Desktop) */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Làm mới dữ liệu"
            className="hidden sm:flex min-w-[44px] min-h-[44px] p-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-xl transition-all active:scale-95 items-center justify-center"
            title="Tải lại dữ liệu mới nhất"
          >
            <RefreshCw size={15} className={isLoading ? "animate-spin text-blue-400" : ""} />
          </button>
        )}

        {/* Nút Đăng xuất rõ ràng kèm Icon */}
        {typeof onLogout === "function" && (
          <button
            type="button"
            onClick={onLogout}
            title="Đăng xuất"
            className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-100 hover:text-rose-200 border border-slate-700 hover:border-rose-500/40 flex items-center gap-1.5 text-xs font-bold shrink-0 transition-colors"
          >
            <LogOut size={14} className="shrink-0" />
            <span>Đăng xuất</span>
          </button>
        )}

        {/* Popover Danh Sách Cảnh Báo Nóng (Cảnh báo chấm công + Khiếu nại lương) */}
        {showAlertPanel && (
          <div className="fixed sm:absolute right-3 sm:right-0 top-[76px] sm:top-12 w-[92vw] max-w-sm bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-2xl p-4 z-50 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="text-sm font-bold text-white">
                  Cảnh báo nóng ({totalRedAlerts})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAlertPanel(false)}
                aria-label="Đóng"
                className="min-w-[44px] min-h-[44px] p-2 text-slate-200 hover:text-white bg-slate-800 rounded-xl flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {totalRedAlerts === 0 ? (
              <p className="text-xs text-slate-300 py-4 text-center">
                Hệ thống ổn định. Không có cảnh báo vị trí/thiết bị hay khiếu nại lương nào đang chờ xử lý.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto">
                {fraudCount > 0 && activeRole === ROLES.ADMIN && (
                  <button
                    type="button"
                    onClick={() => {
                      if (setCurrentTab) setCurrentTab("audit_logs");
                      setShowAlertPanel(false);
                    }}
                    className="w-full text-left p-3 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 space-y-1 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-rose-200">
                        🚨 {fraudCount} Cảnh báo Vị trí / Thiết bị lạ
                      </span>
                      <span className="text-xs font-bold text-rose-200 underline shrink-0">Xem &amp; Khóa</span>
                    </div>
                    <p className="text-xs text-slate-200">
                      Nhấn để mở Nhật ký Giám sát, xem chi tiết vị trí/thiết bị và xử lý tài khoản.
                    </p>
                  </button>
                )}

                {disputedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (setCurrentTab) setCurrentTab("payroll");
                      setShowAlertPanel(false);
                    }}
                    className="w-full text-left p-3 rounded-xl bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/40 space-y-1 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-amber-200 flex items-center gap-1">
                        <AlertTriangle size={13} />
                        {disputedCount} Khiếu nại sai lương từ Nhân viên
                      </span>
                      <span className="text-xs font-bold text-amber-200 underline shrink-0">Xem minh chứng</span>
                    </div>
                    <p className="text-xs text-slate-200">
                      Nhân viên đã gửi báo cáo sai lương kèm hình ảnh/video minh chứng. Nhấn để kiểm tra.
                    </p>
                  </button>
                )}

                {deviceCount > 0 && activeRole === ROLES.ADMIN && (
                  <button
                    type="button"
                    onClick={() => {
                      if (setCurrentTab) setCurrentTab("devices");
                      setShowAlertPanel(false);
                    }}
                    className="w-full text-left p-3 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/40 space-y-1 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-indigo-300">
                        📱 {deviceCount} Yêu cầu đổi thiết bị chờ duyệt
                      </span>
                      <span className="text-[10px] font-bold text-indigo-200 underline">Xét duyệt</span>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
