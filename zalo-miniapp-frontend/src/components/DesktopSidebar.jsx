import React from "react";
import {
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Users,
  Building,
  Gift,
  ShieldCheck,
  User,
  LogOut,
  RotateCcw,
  Smartphone,
  ChevronRight
} from "lucide-react";
import { ROLES, ROLE_LABELS } from "../constants/roles";

import CompanyLogo from "./CompanyLogo";

export default function DesktopSidebar({
  currentUser,
  activeRole,
  currentTab,
  onSelectTab,
  onSwitchDemoRole,
  onLogout,
  onClearCache,
  pendingRequestsCount = 0
}) {
  // Danh sách menu theo từng role
  const getMenuItems = () => {
    if (activeRole === ROLES.ADMIN) {
      return [
        { id: "matrix", label: "Bảng Công Ma Trận", icon: Calendar, badge: "31 Ngày" },
        { id: "payroll", label: "Bảng Lương Doanh Nghiệp", icon: DollarSign },
        { id: "requests", label: "Phê Duyệt Đơn Từ", icon: FileText, badge: pendingRequestsCount > 0 ? `${pendingRequestsCount}` : null, badgeColor: "bg-rose-500 text-white" },
        { id: "management", label: "Quản Lý Nhân Sự & RBAC", icon: Users },
        { id: "company", label: "Cấu Hình Doanh Nghiệp", icon: Building },
        { id: "holidays", label: "Lịch Nghỉ Lễ (x3)", icon: Gift },
        { id: "audit_logs", label: "Nhật Ký Thao Tác", icon: ShieldCheck },
        { id: "checkin", label: "Điểm Danh Thử Nghiệm", icon: Clock },
        { id: "profile", label: "Hồ Sơ Quản Trị", icon: User }
      ];
    }

    if (activeRole === ROLES.ACCOUNTANT) {
      return [
        { id: "matrix", label: "Bảng Công (Chốt Sổ)", icon: Calendar, badge: "Chỉ đọc" },
        { id: "payroll", label: "Bảng Lương & Xuất CSV", icon: DollarSign },
        { id: "history", label: "Lịch Sử Công Cá Nhân", icon: Calendar },
        { id: "checkin", label: "Điểm Danh Thử Nghiệm", icon: Clock },
        { id: "profile", label: "Hồ Sơ Kế Toán", icon: User }
      ];
    }

    if (activeRole === ROLES.HR) {
      return [
        { id: "matrix", label: "Bảng Công Ma Trận", icon: Calendar, badge: "Sửa công" },
        { id: "requests", label: "Phê Duyệt Đơn Từ", icon: FileText, badge: pendingRequestsCount > 0 ? `${pendingRequestsCount}` : null, badgeColor: "bg-rose-500 text-white" },
        { id: "management", label: "Cấp Mã & Nhân Sự", icon: Users },
        { id: "history", label: "Lịch Sử Công Cá Nhân", icon: Calendar },
        { id: "payroll", label: "Phiếu Lương Cá Nhân", icon: DollarSign },
        { id: "checkin", label: "Điểm Danh Thử Nghiệm", icon: Clock },
        { id: "profile", label: "Hồ Sơ Nhân Sự", icon: User }
      ];
    }

    // Role Nhân Viên (Employee)
    return [
      { id: "checkin", label: "Điểm Danh 1 Chạm", icon: Clock, badge: "GPS Token" },
      { id: "history", label: "Bảng Công Tháng (31 Ngày)", icon: Calendar },
      { id: "requests", label: "Đơn Từ Của Tôi", icon: FileText },
      { id: "payroll", label: "Phiếu Lương Điện Tử", icon: DollarSign },
      { id: "profile", label: "Hồ Sơ Cá Nhân", icon: User }
    ];
  };

  const menuItems = getMenuItems();

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 h-screen sticky top-0 border-r border-slate-800 select-none">
      
      {/* 1. Header Sidebar: Logo & Thông tin công ty */}
      <div className="p-5 border-b border-slate-800">
        <CompanyLogo size="small" theme="dark" layout="horizontal" showSubtitle={true} />

        {/* 2. Thanh Chuyển Đổi Demo Role Nhanh */}
        <div className="mt-4 pt-3 border-t border-slate-800/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
            Phân hệ hiện hành ({ROLE_LABELS[activeRole]}):
          </span>
          <div className="grid grid-cols-2 gap-1 bg-slate-800/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => onSwitchDemoRole(ROLES.EMPLOYEE)}
              className={`py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                activeRole === ROLES.EMPLOYEE
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Nhân Viên
            </button>
            <button
              type="button"
              onClick={() => onSwitchDemoRole(ROLES.HR)}
              className={`py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                activeRole === ROLES.HR
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Nhân Sự
            </button>
            <button
              type="button"
              onClick={() => onSwitchDemoRole(ROLES.ACCOUNTANT)}
              className={`py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                activeRole === ROLES.ACCOUNTANT
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Kế Toán
            </button>
            <button
              type="button"
              onClick={() => onSwitchDemoRole(ROLES.ADMIN)}
              className={`py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                activeRole === ROLES.ADMIN
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Quản Trị
            </button>
          </div>
        </div>
      </div>

      {/* 3. Danh Sách Menu Điều Hướng */}
      <nav className="p-3 flex-1 overflow-y-auto space-y-1">
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-extrabold"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon size={16} className={isActive ? "text-white" : "text-slate-400"} />
                <span>{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-black ${
                    item.badgeColor || (isActive ? "bg-white/20 text-white" : "bg-slate-800 text-slate-300")
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 4. Footer Sidebar: Người Dùng & Nút Đăng Xuất */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40 space-y-3">
        <div className="flex items-center gap-3">
          <img
            src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
            alt="Avatar"
            className="w-10 h-10 rounded-xl object-cover border border-slate-700 shadow-sm"
          />
          <div className="flex-1 min-w-0">
            <h4 className="font-extrabold text-xs text-white truncate">{currentUser?.ho_ten}</h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-blue-400 font-mono">{currentUser?.ma_nv}</span>
              <span className="text-[9px] text-slate-500">•</span>
              <span className="text-[10px] text-slate-400 truncate">{ROLE_LABELS[activeRole]}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 text-xs">
          <button
            type="button"
            onClick={onClearCache}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
            title="Làm mới bộ nhớ đệm"
          >
            <RotateCcw size={12} />
            <span>Xóa Cache</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 font-bold cursor-pointer"
          >
            <LogOut size={12} />
            <span>Đăng Xuất</span>
          </button>
        </div>
      </div>

    </aside>
  );
}
