import React from "react";
import {
  Clock,
  Smartphone,
  RefreshCw,
  ChevronRight,
  Menu,
  QrCode
} from "lucide-react";
import { ROLE_LABELS, ROLES } from "../constants/roles";

export default function DesktopHeader({
  currentUser,
  currentTab,
  setCurrentTab,
  activeRole,
  onRoleSwitch,
  currentTime,
  onRefresh,
  isLoading,
  onOpenMobileMenu
}) {
  const getTabTitle = () => {
    switch (currentTab) {
      case "matrix":
        return activeRole === "accountant"
          ? "Bảng Chấm Công Ma Trận"
          : "Bảng Công Ma Trận (Toàn Công Ty)";
      case "payroll":
        return "Bảng Lương & Chi Trả Doanh Nghiệp";
      case "requests":
        return "Trung Tâm Phê Duyệt Đơn Từ";
      case "management":
        return "Quản Trị Hồ Sơ Nhân Sự (RBAC)";
      case "company":
        return "Cấu Hình Vị Trí & Trụ Sở";
      case "holidays":
        return "Danh Mục Ngày Nghỉ Lễ (x3)";
      case "kiosk":
        return "Màn Hình Kiosk QR Điểm Danh";
      case "devices":
        return "Phê Duyệt Đổi Thiết Bị";
      case "permissions":
        return "Phân Quyền Kế Toán";
      case "audit_logs":
        return "Nhật Ký Kiểm Toán Hệ Thống";
      case "profile":
        return "Hồ Sơ Cá Nhân & Phiếu Lương";
      default:
        return "Bảng Điều Khiển Sedinco HR";
    }
  };

  const displayTime = currentTime instanceof Date ? currentTime : new Date();

  return (
    <header
      className="bg-slate-900 border-b border-slate-800 pl-3 sm:pl-6 pr-[96px] lg:pr-8 pb-3 flex items-center justify-between gap-2 sticky top-0 z-30 select-none shadow-sm"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
    >
      {/* Nút Menu Mobile + Tiêu đề & Breadcrumb */}
      <div className="flex items-center gap-2.5 min-w-0">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden min-w-[44px] min-h-[44px] p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center shrink-0"
            title="Mở danh mục quản trị"
          >
            <Menu size={20} />
          </button>
        )}

        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-bold truncate">
            <span>Sedinco HR</span>
            <ChevronRight size={12} className="shrink-0" />
            <span className="text-blue-400 font-black truncate">{ROLE_LABELS[activeRole] || currentUser?.ho_ten}</span>
          </div>
          <h2 className="text-sm sm:text-lg font-black text-white tracking-tight truncate">
            {getTabTitle()}
          </h2>
        </div>
      </div>

      {/* Tác vụ bên phải (Đã chừa 96px bên phải trên Mobile tránh nút ... và X của Zalo) */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Đồng hồ số thời gian thực (Desktop) */}
        <div className="hidden xl:flex items-center gap-2 bg-slate-800 border border-slate-700 px-3.5 py-2 rounded-2xl text-xs font-mono font-bold text-slate-200">
          <Clock size={14} className="text-blue-400" />
          <span>
            {displayTime.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
          </span>
        </div>

        {/* Nút bật nhanh Màn Hình Kiosk QR cho Admin */}
        {activeRole === ROLES.ADMIN && setCurrentTab && currentTab !== "kiosk" && (
          <button
            type="button"
            onClick={() => setCurrentTab("kiosk")}
            className="min-h-[40px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
            title="Mở mã QR cho nhân viên quét chấm công"
          >
            <QrCode size={15} />
            <span className="hidden sm:inline">Phát Mã QR</span>
          </button>
        )}

        {/* Nút chuyển nhanh sang chế độ Công nhân (Chấm công / Xem phiếu lương cá nhân) */}
        {typeof onRoleSwitch === "function" && (
          <button
            type="button"
            onClick={() => onRoleSwitch(ROLES.WORKER)}
            className="hidden sm:flex min-h-[40px] items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold"
            title="Chuyển sang giao diện chấm công cá nhân"
          >
            <Smartphone size={15} className="text-blue-400" />
            <span>Chế độ NV</span>
          </button>
        )}

        {/* Nút Làm mới dữ liệu */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="min-w-[40px] min-h-[40px] p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-all active:scale-95 flex items-center justify-center"
            title="Tải lại dữ liệu mới nhất"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin text-blue-400" : ""} />
          </button>
        )}
      </div>
    </header>
  );
}
