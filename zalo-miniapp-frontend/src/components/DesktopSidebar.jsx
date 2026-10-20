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
    <aside className="w-72 bg-slate-900 text-slate-200 flex flex-col justify-between shrink-0 h-screen sticky top-0 border-r-2 border-slate-800 select-none">
      
      {/* 1. Header Sidebar: Logo & Thông tin công ty */}
      <div className="p-5 border-b-2 border-slate-800">
        <CompanyLogo size="small" theme="dark" layout="horizontal" showSubtitle={true} />

        {/* 2. Thanh Chuyển Đổi Demo Role Nhanh */}
        <div className="mt-4 pt-3 border-t border-slate-800">
          <span className="text-xs font-black uppercase tracking-wider text-slate-300 block mb-2">
            Vai trò hiện hành ({ROLE_LABELS[activeRole]}):
          </span>
          <div className="grid grid-cols-2 gap-1.5 bg-slate-800/90 p-1.5 rounded-2xl border-2 border-slate-700">
            <button
              type="button"
              onClick={() => onSwitchDemoRole(ROLES.EMPLOYEE)}
              className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer border-2 ${
                activeRole === ROLES.EMPLOYEE
                  ? "bg-blue-600 text-white border-white shadow-md"
                  : "border-transparent text-slate-300 hover:border-slate-500 hover:text-white"
              }`}
            >
              Nhân Viên
            </button>
            <button
              type="button"
              onClick={() => onSwitchDemoRole(ROLES.HR)}
              className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer border-2 ${
                activeRole === ROLES.HR
                  ? "bg-purple-600 text-white border-white shadow-md"
                  : "border-transparent text-slate-300 hover:border-slate-500 hover:text-white"
              }`}
            >
              Nhân Sự
            </button>
            <button
              type="button"
              onClick={() => onSwitchDemoRole(ROLES.ACCOUNTANT)}
              className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer border-2 ${
                activeRole === ROLES.ACCOUNTANT
                  ? "bg-emerald-600 text-white border-white shadow-md"
                  : "border-transparent text-slate-300 hover:border-slate-500 hover:text-white"
              }`}
            >
              Kế Toán
            </button>
            <button
              type="button"
              onClick={() => onSwitchDemoRole(ROLES.ADMIN)}
              className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer border-2 ${
                activeRole === ROLES.ADMIN
                  ? "bg-amber-500 text-slate-950 border-white shadow-md"
                  : "border-transparent text-slate-300 hover:border-slate-500 hover:text-white"
              }`}
            >
              Quản Trị
            </button>
          </div>
        </div>
      </div>

      {/* 3. Danh Sách Menu Điều Hướng */}
      <nav className="p-4 flex-1 overflow-y-auto space-y-2">
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-black transition-all cursor-pointer border-2 ${
                isActive
                  ? "bg-blue-600 text-white border-white shadow-lg shadow-blue-600/30"
                  : "text-slate-200 border-slate-800 hover:border-slate-600 hover:bg-slate-800/80"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon size={18} className={isActive ? "text-white" : "text-slate-400"} />
                <span>{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-black border ${
                    item.badgeColor || (isActive ? "bg-white/20 text-white border-white/40" : "bg-slate-800 text-slate-200 border-slate-700")
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
      <div className="p-4 border-t-2 border-slate-800 bg-slate-950/60 space-y-3.5">
        <div className="flex items-center gap-3">
          <img
            src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
            alt="Avatar"
            className="w-11 h-11 rounded-2xl object-cover border-2 border-slate-600 shadow-sm"
          />
          <div className="flex-1 min-w-0">
            <h4 className="font-black text-sm text-white truncate">{currentUser?.ho_ten}</h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-blue-400 font-mono font-bold">{currentUser?.ma_nv}</span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-300 truncate font-semibold">{ROLE_LABELS[activeRole]}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onClearCache}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 hover:text-white transition-all cursor-pointer"
            title="Làm mới bộ nhớ đệm"
          >
            <RotateCcw size={14} />
            <span>Xóa Cache</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border-2 border-rose-500 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-md transition-all cursor-pointer"
          >
            <LogOut size={14} />
            <span>Đăng Xuất</span>
          </button>
        </div>
      </div>

    </aside>
  );
}
