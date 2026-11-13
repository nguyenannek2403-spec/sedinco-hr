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
  QrCode,
  Menu,
  X
} from "lucide-react";
import { ROLES, ROLE_LABELS } from "../constants/roles";

import CompanyLogo from "./CompanyLogo";

export default function DesktopSidebar({
  currentUser,
  activeRole,
  onRoleSwitch,
  currentTab,
  setCurrentTab,
  onSelectTab,
  onLogout,
  onClearCache,
  alertsSummary = {},
  pendingRequestsCount = 0,
  isMobileMenuOpen = false,
  onCloseMobileMenu,
  onOpenMobileMenu
}) {
  const disputedCount = Number(alertsSummary?.disputed_salary_count) || 0;
  const fraudCount = Number(alertsSummary?.fraud_count) || 0;
  const devicePendingCount = Number(alertsSummary?.pending_device_count) || 0;

  // Danh sách menu theo đúng 3 Role chuẩn: Admin, Accountant, Worker (V5 đã loại bỏ Kiosk QR)
  const getMenuItems = () => {
    if (activeRole === ROLES.ADMIN) {
      return [
        { id: "matrix", label: "Bảng Công Ma Trận", shortLabel: "Bảng công", icon: Calendar, badge: "31 Ngày" },
        {
          id: "payroll",
          label: "Bảng Lương & Khiếu Nại",
          shortLabel: "Bảng lương",
          icon: DollarSign,
          badge: disputedCount > 0 ? `${disputedCount} Khiếu nại` : null,
          badgeColor: "bg-rose-600 text-white border-rose-400 animate-pulse"
        },
        {
          id: "requests",
          label: "Phê Duyệt Đơn Từ",
          shortLabel: "Đơn từ",
          icon: FileText,
          badge: pendingRequestsCount > 0 ? `${pendingRequestsCount}` : null,
          badgeColor: "bg-amber-500 text-slate-950 border-amber-300"
        },
        {
          id: "audit_logs",
          label: "Nhật Ký & Kiểm Tra Chấm Công",
          shortLabel: "Nhật ký",
          icon: ShieldCheck,
          badge: fraudCount > 0 ? `${fraudCount} Cảnh báo` : null,
          badgeColor: fraudCount > 0 ? "bg-rose-600 text-white border-rose-400 animate-pulse" : undefined
        },
        { id: "management", label: "Quản Lý Nhân Sự", shortLabel: "Nhân sự", icon: Users },
        {
          id: "devices",
          label: "Duyệt Đổi Thiết Bị",
          shortLabel: "Thiết bị",
          icon: Smartphone,
          badge: devicePendingCount > 0 ? `${devicePendingCount}` : null,
          badgeColor: "bg-rose-500 text-white"
        },
        { id: "company", label: "Cài Đặt Công Ty", shortLabel: "Cài đặt", icon: Building },
        { id: "permissions", label: "Phân Quyền Kế Toán", shortLabel: "Phân quyền", icon: ShieldCheck },
        { id: "holidays", label: "Lịch Nghỉ Lễ (x3)", shortLabel: "Nghỉ lễ", icon: Gift },
        { id: "profile", label: "Hồ Sơ Quản Trị", shortLabel: "Hồ sơ", icon: User }
      ];
    }

    if (activeRole === ROLES.ACCOUNTANT) {
      return [
        { id: "matrix", label: "Bảng Công (Chốt Sổ)", shortLabel: "Bảng công", icon: Calendar, badge: "Chấm công" },
        {
          id: "payroll",
          label: "Bảng Lương & Khiếu Nại",
          shortLabel: "Bảng lương",
          icon: DollarSign,
          badge: disputedCount > 0 ? `${disputedCount} Khiếu nại` : null,
          badgeColor: "bg-rose-600 text-white border-rose-400 animate-pulse"
        },
        {
          id: "requests",
          label: "Xử Lý Đơn Từ",
          shortLabel: "Đơn từ",
          icon: FileText,
          badge: pendingRequestsCount > 0 ? `${pendingRequestsCount}` : null,
          badgeColor: "bg-rose-500 text-white"
        },
        { id: "profile", label: "Hồ Sơ Kế Toán", shortLabel: "Hồ sơ", icon: User }
      ];
    }

    // Role Công Nhân / Nhân Viên (Worker / Employee)
    return [
      { id: "checkin", label: "Điểm Danh 1 Chạm", shortLabel: "Chấm công", icon: Clock, badge: "1 Chạm" },
      { id: "history", label: "Bảng Công Tháng (31 Ngày)", shortLabel: "Lịch sử", icon: Calendar },
      { id: "requests", label: "Đơn Từ Của Tôi", shortLabel: "Đơn từ", icon: FileText },
      { id: "payroll", label: "Phiếu Lương Điện Tử", shortLabel: "Phiếu lương", icon: DollarSign },
      { id: "profile", label: "Hồ Sơ Cá Nhân", shortLabel: "Hồ sơ", icon: User }
    ];
  };

  const menuItems = getMenuItems();
  const mobileBottomItems = menuItems.slice(0, 4);

  const handleSelect = (id) => {
    if (onSelectTab) onSelectTab(id);
    else if (setCurrentTab) setCurrentTab(id);
    if (onCloseMobileMenu) onCloseMobileMenu();
  };

  const renderSidebarBody = (isMobileDrawer = false) => (
    <>
      {/* 1. Header Sidebar: Logo & Thông tin công ty */}
      <div
        className="p-4 sm:p-5 border-b-2 border-slate-800 flex items-center justify-between"
        style={isMobileDrawer ? { paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" } : undefined}
      >
        <CompanyLogo size="small" theme="dark" layout="horizontal" showSubtitle={!isMobileDrawer} />
        {isMobileDrawer && (
          <button
            type="button"
            onClick={onCloseMobileMenu}
            className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* 2. Hiển thị Phân Hệ Xác Thực Chuẩn (RBAC Độc Lập) */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-800 space-y-2">
        <div className="flex items-center justify-between px-3 py-2 rounded-2xl bg-slate-800/80 border border-slate-700">
          <span className="text-xs font-bold text-slate-400">Phân hệ:</span>
          <span className={`text-xs font-black px-2.5 py-1 rounded-xl border ${
            activeRole === ROLES.ADMIN
              ? "bg-amber-400 text-slate-950 border-amber-300"
              : activeRole === ROLES.ACCOUNTANT
              ? "bg-emerald-400 text-slate-950 border-emerald-300"
              : "bg-blue-300 text-slate-950 border-blue-200"
          }`}>
            {ROLE_LABELS[activeRole]}
          </span>
        </div>
        {typeof onRoleSwitch === "function" && (
          <button
            type="button"
            onClick={() => {
              onRoleSwitch(ROLES.WORKER);
              if (onCloseMobileMenu) onCloseMobileMenu();
            }}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Smartphone size={14} />
            <span>Chuyển sang Giao diện Chấm công Cá nhân</span>
          </button>
        )}
      </div>

      {/* 3. Danh Sách Menu Điều Hướng */}
      <nav className="p-3 sm:p-4 flex-1 overflow-y-auto space-y-1.5">
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-tab={item.id}
              title={item.label}
              onClick={() => handleSelect(item.id)}
              className={`w-full min-h-[46px] flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-sm font-black transition-all cursor-pointer border-2 ${
                isActive
                  ? "bg-blue-600 text-white border-white shadow-lg shadow-blue-600/30"
                  : "text-slate-200 border-slate-800 hover:border-slate-600 hover:bg-slate-800/80"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon size={18} className={`shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-black border shrink-0 ${
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
      <div
        className="p-4 border-t-2 border-slate-800 bg-slate-950/60 space-y-3"
        style={isMobileDrawer ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" } : undefined}
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl border-2 border-slate-600 shadow-sm overflow-hidden shrink-0 bg-slate-800">
            <img
              src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-black text-sm text-white truncate">{currentUser?.ho_ten}</h4>
            <p className="text-[11px] text-blue-300 font-semibold truncate">{currentUser?.chuc_danh || "Ban Quản Trị"}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-emerald-400 font-mono font-bold">Mã: {currentUser?.ma_nv}</span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-300 truncate font-semibold">{ROLE_LABELS[activeRole]}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {onClearCache && (
            <button
              type="button"
              onClick={() => {
                if (onCloseMobileMenu) onCloseMobileMenu();
                onClearCache();
              }}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer whitespace-nowrap"
              title="Làm mới bộ nhớ đệm"
            >
              <RotateCcw size={14} className="shrink-0" />
              <span>Xóa cache</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (onCloseMobileMenu) onCloseMobileMenu();
              if (onLogout) onLogout();
            }}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-rose-500 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer whitespace-nowrap"
          >
            <LogOut size={14} className="shrink-0" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar (chỉ hiển thị từ màn hình >= 1024px) */}
      <aside className="hidden lg:flex w-72 bg-slate-900 text-slate-200 flex-col justify-between shrink-0 h-screen sticky top-0 border-r-2 border-slate-800 select-none">
        {renderSidebarBody(false)}
      </aside>

      {/* Mobile Slide-Over Drawer (khi mở trên Zalo Mini App / màn hình < 1024px) */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={onCloseMobileMenu}
          />
          <aside className="relative z-10 w-[84vw] max-w-[320px] bg-slate-900 text-slate-200 flex flex-col justify-between h-full border-r border-slate-700 shadow-2xl">
            {renderSidebarBody(true)}
          </aside>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar cho Admin & Accountant trên Zalo Mini App */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 px-2 pt-1.5 flex items-center justify-around shadow-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
      >
        {mobileBottomItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-[60px] py-1 px-2 rounded-xl transition-all ${
                isActive
                  ? "text-blue-400 font-bold bg-blue-500/10"
                  : "text-slate-400 hover:text-slate-200 font-medium"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] truncate max-w-[64px]">{item.shortLabel || item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-[60px] py-1 px-2 rounded-xl text-slate-300 hover:text-white font-bold"
        >
          <Menu className="w-5 h-5 text-amber-400" />
          <span className="text-[10px]">Menu</span>
        </button>
      </nav>
    </>
  );
}
