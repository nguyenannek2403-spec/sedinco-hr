import React from "react";
import {
  Clock,
  Smartphone,
  Monitor,
  RefreshCw,
  Bell,
  ShieldCheck,
  ChevronRight
} from "lucide-react";
import { ROLE_LABELS } from "../constants/roles";

export default function DesktopHeader({
  currentTab,
  activeRole,
  currentTime,
  onRefresh,
  isLoading,
  viewMode,
  onToggleViewMode
}) {
  const getTabTitle = () => {
    switch (currentTab) {
      case "matrix":
        return activeRole === "accountant"
          ? "Bảng Chấm Công Ma Trận (Đối Soát & Chốt Sổ)"
          : "Bảng Chấm Công Ma Trận (Toàn Doanh Nghiệp)";
      case "payroll":
        return activeRole === "employee" || activeRole === "hr"
          ? "Phiếu Lương Điện Tử Cá Nhân"
          : "Bảng Lương & Chi Trả Doanh Nghiệp";
      case "requests":
        return activeRole === "admin" || activeRole === "hr"
          ? "Trung Tâm Phê Duyệt Đơn Từ"
          : "Danh Sách Đơn Từ Của Tôi";
      case "management":
        return activeRole === "hr"
          ? "Hồ Sơ Nhân Sự & Cấp Mã Liên Kết"
          : "Quản Trị Nhân Sự & Phân Quyền (RBAC)";
      case "company":
        return "Cấu Hình Thông Tin Doanh Nghiệp";
      case "holidays":
        return "Danh Mục Ngày Nghỉ Lễ Hưởng Lương (x3)";
      case "history":
        return "Lịch Sử Chấm Công Cá Nhân (31 Ngày)";
      case "checkin":
        return "Điểm Danh & Chấm Công Trực Tuyến";
      case "profile":
        return "Hồ Sơ Cá Nhân & Bảo Mật Mật Khẩu";
      default:
        return "Bảng Điều Khiển Sedinco HR";
    }
  };

  return (
    <header className="bg-white border-b-2 border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-30 select-none shadow-sm">
      
      {/* Tiêu đề & Breadcrumb */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
          <span>Sedinco HR</span>
          <ChevronRight size={14} />
          <span className="text-blue-700 font-black">{ROLE_LABELS[activeRole]}</span>
        </div>
        <h2 className="text-xl font-black text-slate-900 tracking-tight mt-0.5">
          {getTabTitle()}
        </h2>
      </div>

      {/* Tác vụ bên phải: Đồng hồ, Chuyển mode Mobile & Refresh */}
      <div className="flex items-center gap-3">
        
        {/* Đồng hồ số thời gian thực */}
        <div className="hidden md:flex items-center gap-2 bg-slate-50 border-2 border-slate-200 px-4 py-2 rounded-2xl text-sm font-mono font-black text-slate-800 shadow-inner">
          <Clock size={16} className="text-blue-600" />
          <span>
            {currentTime.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })} • {currentTime.toLocaleTimeString("vi-VN")}
          </span>
        </div>

        {/* Nút Chuyển đổi qua lại giữa Giao diện PC và Giả lập Điện thoại */}
        <button
          type="button"
          onClick={onToggleViewMode}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer shadow-sm active:scale-95 border-2 ${
            viewMode === "mobile_simulator"
              ? "bg-blue-600 text-white border-blue-400 shadow-blue-500/30"
              : "bg-white hover:bg-slate-100 text-slate-800 border-slate-300"
          }`}
          title="Bật/Tắt khung giả lập điện thoại di động"
        >
          {viewMode === "mobile_simulator" ? (
            <>
              <Monitor size={16} />
              <span>Chuyển Về Màn Hình PC</span>
            </>
          ) : (
            <>
              <Smartphone size={16} className="text-blue-600" />
              <span>Xem Giả Lập Điện Thoại</span>
            </>
          )}
        </button>

        {/* Nút Làm mới dữ liệu */}
        <button
          type="button"
          onClick={onRefresh}
          className="p-2.5 bg-white hover:bg-slate-100 text-slate-800 border-2 border-slate-300 rounded-2xl transition-all active:scale-95 cursor-pointer shadow-sm"
          title="Tải lại toàn bộ dữ liệu mới nhất"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin text-blue-600" : ""} />
        </button>

      </div>

    </header>
  );
}
