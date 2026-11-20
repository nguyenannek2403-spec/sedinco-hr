import React from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Users,
  Settings,
  User,
  LogOut,
  RotateCcw,
  Menu,
  X
} from "lucide-react";
import { ROLES, ROLE_LABELS } from "../constants/roles";
import useLockBodyScroll from "../hooks/useLockBodyScroll";

import CompanyLogo from "./CompanyLogo";
import { useTheme } from "../context/ThemeContext";

export function getSidebarMenuItems({
  activeRole,
  dynamicPerms = {},
  alertsSummary = {},
  pendingRequestsCount = 0
}) {
  const disputedCount = Number(alertsSummary?.disputed_salary_count) || 0;
  const fraudCount = Number(alertsSummary?.fraud_count) || 0;
  const devicePendingCount = Number(alertsSummary?.pending_device_count) || 0;

  if (activeRole === ROLES.ADMIN) {
    return [
      {
        id: "employees",
        label: "Nhân sự & Thiết bị",
        shortLabel: "Nhân sự",
        icon: Users,
        badge: devicePendingCount > 0 ? String(devicePendingCount) : null,
        badgeColor: "bg-rose-600 text-white border-rose-400 animate-pulse"
      },
      { id: "matrix", label: "Bảng công", shortLabel: "Bảng công", icon: Calendar, badge: "31 Ngày" },
      {
        id: "requests",
        label: "Duyệt đơn từ",
        shortLabel: "Đơn từ",
        icon: FileText,
        badge: pendingRequestsCount > 0 ? String(pendingRequestsCount) : null,
        badgeColor: "bg-amber-500 text-slate-950 border-amber-300"
      },
      {
        id: "payroll",
        label: "Bảng lương",
        shortLabel: "Bảng lương",
        icon: DollarSign,
        badge: disputedCount > 0 ? `${disputedCount} Khiếu nại` : null,
        badgeColor: "bg-rose-600 text-white border-rose-400 animate-pulse"
      },
      {
        id: "settings",
        label: "Cài đặt & Nhật ký",
        shortLabel: "Cài đặt",
        icon: Settings,
        badge: fraudCount > 0 ? String(fraudCount) : null,
        badgeColor: "bg-rose-600 text-white border-rose-400 animate-pulse"
      }
    ];
  }

  if (activeRole === ROLES.ACCOUNTANT) {
    const items = [];
    if (dynamicPerms.attendance_view_all !== false) {
      items.push({ id: "matrix", label: "Bảng công", shortLabel: "Bảng công", icon: Calendar, badge: "31 Ngày" });
    }
    if (dynamicPerms.payroll_view_all !== false) {
      items.push({
        id: "payroll",
        label: "Bảng lương",
        shortLabel: "Bảng lương",
        icon: DollarSign,
        badge: disputedCount > 0 ? `${disputedCount} Khiếu nại` : null,
        badgeColor: "bg-rose-600 text-white border-rose-400 animate-pulse"
      });
    }
    if (dynamicPerms.leave_view_all !== false) {
      items.push({
        id: "requests",
        label: "Duyệt đơn từ",
        shortLabel: "Đơn từ",
        icon: FileText,
        badge: pendingRequestsCount > 0 ? String(pendingRequestsCount) : null,
        badgeColor: "bg-amber-500 text-slate-950 border-amber-300"
      });
    }
    if (dynamicPerms.employee_view === true) {
      items.push({ id: "employees", label: "Nhân sự & Thiết bị", shortLabel: "Nhân sự", icon: Users });
    }
    return items;
  }

  return [
    { id: "checkin", label: "Điểm Danh 1 Chạm", shortLabel: "Chấm công", icon: Clock, badge: "1 Chạm" },
    { id: "history", label: "Bảng Công Tháng (31 Ngày)", shortLabel: "Lịch công", icon: Calendar },
    { id: "requests", label: "Đơn Từ Của Tôi", shortLabel: "Đơn từ", icon: FileText },
    { id: "payroll", label: "Phiếu Lương Điện Tử", shortLabel: "Phiếu lương", icon: DollarSign },
    { id: "profile", label: "Hồ Sơ Cá Nhân", shortLabel: "Hồ sơ", icon: User }
  ];
}

export function DesktopMobileBottomNav({
  activeRole,
  dynamicPerms = {},
  alertsSummary = {},
  pendingRequestsCount = 0,
  currentTab,
  setCurrentTab,
  onOpenMobileMenu
}) {
  const mobileBottomItems = getSidebarMenuItems({
    activeRole,
    dynamicPerms,
    alertsSummary,
    pendingRequestsCount
  }).slice(0, 4);

  const handleSelect = (id) => {
    if (setCurrentTab) setCurrentTab(id);
  };

  return (
    <nav
      data-filter-group="mobile-bottom-nav"
      className="lg:hidden shrink-0 z-40 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 px-2 pt-1.5 flex items-center justify-around gap-1 shadow-2xl transition-colors duration-200"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
    >
      {mobileBottomItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-active={isActive ? "true" : "false"}
            onClick={() => handleSelect(item.id)}
            className={`flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-[60px] py-1 px-2.5 rounded-2xl transition-all cursor-pointer ${
              isActive
                ? "bg-[#E11D48] text-white dark:bg-rose-600 dark:text-white font-bold shadow-sm"
                : "text-slate-600 hover:text-[#111C2D] dark:text-slate-400 dark:hover:text-slate-100 hover:bg-[#F0F3FF] dark:hover:bg-slate-800/80 font-medium"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs leading-tight whitespace-nowrap">{item.shortLabel || item.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onOpenMobileMenu}
        aria-label="Mở menu đầy đủ"
        className="flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-[60px] py-1 px-2 rounded-xl text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 font-bold cursor-pointer"
      >
        <Menu className="w-5 h-5 text-amber-500 dark:text-amber-400" />
        <span className="text-xs leading-tight">Menu</span>
      </button>
    </nav>
  );
}

export default function DesktopSidebar({
  currentUser,
  activeRole,
  dynamicPerms = {},
  currentTab,
  setCurrentTab,
  onLogout,
  onClearCache,
  alertsSummary = {},
  pendingRequestsCount = 0,
  isMobileMenuOpen = false,
  onCloseMobileMenu,
  onOpenMobileMenu,
  showMobileBottomNav = true
}) {
  useLockBodyScroll(Boolean(isMobileMenuOpen), 90);
  const { isDark } = useTheme();

  const menuItems = getSidebarMenuItems({
    activeRole,
    dynamicPerms,
    alertsSummary,
    pendingRequestsCount
  });

  const handleSelect = (id) => {
    if (setCurrentTab) setCurrentTab(id);
    if (onCloseMobileMenu) onCloseMobileMenu();
  };

  const renderSidebarBody = (isMobileDrawer = false) => (
    <>
      {/* 1. Header Sidebar: Logo & Thông tin công ty */}
      <div
        className="p-4 sm:p-5 border-b-2 border-slate-200 dark:border-slate-800 flex items-center justify-between"
        style={isMobileDrawer ? { paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" } : undefined}
      >
        <CompanyLogo size="small" theme={isDark ? "dark" : "light"} layout="horizontal" showSubtitle={!isMobileDrawer} />
        {isMobileDrawer && (
          <button
            type="button"
            onClick={onCloseMobileMenu}
            aria-label="Đóng"
            className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* 2. Hiển thị Phân Hệ Xác Thực Chuẩn (RBAC Độc Lập) */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between px-3 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Phân hệ:</span>
          <span className={`text-xs font-black px-2.5 py-1 rounded-xl border ${
            activeRole === ROLES.ADMIN
              ? "bg-amber-400 text-slate-950 border-amber-500"
              : activeRole === ROLES.ACCOUNTANT
              ? "bg-emerald-400 text-slate-950 border-emerald-500"
              : "bg-blue-200 text-slate-950 border-blue-300"
          }`}>
            {ROLE_LABELS[activeRole]}
          </span>
        </div>
      </div>

      {/* 3. Danh Sách Menu Điều Hướng (Đúng 5 ngăn nghiệp vụ sạch, không trùng lặp) */}
      <nav
        data-filter-group="sidebar-menu"
        className="p-3 sm:p-4 flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y modal-scroll-area space-y-2"
      >
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-tab={item.id}
              data-active={isActive ? "true" : "false"}
              title={item.label}
              onClick={() => handleSelect(item.id)}
              className={`w-full min-h-[46px] flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-sm font-bold transition-all cursor-pointer border ${
                isActive
                  ? "bg-[#E11D48] text-white border-[#BE123C] dark:bg-rose-600 dark:text-white dark:border-rose-400 shadow-[0_6px_16px_-3px_rgba(225,29,72,0.3)]"
                  : "bg-transparent text-slate-600 hover:text-[#111C2D] dark:text-slate-400 dark:hover:text-slate-100 border-slate-200/70 dark:border-slate-800 hover:border-rose-200 dark:hover:border-slate-600 hover:bg-[#F0F3FF]/70 dark:hover:bg-slate-800/80"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon size={18} className={`shrink-0 ${isActive ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-black border shrink-0 ${
                    item.badgeColor || (isActive ? "bg-white/20 text-white border-white/40" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700")
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 4. Footer Sidebar: Nút Hồ Sơ Cá Nhân / Cỡ chữ & Đăng xuất */}
      <div
        className="p-4 border-t-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 space-y-3"
        style={isMobileDrawer ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" } : undefined}
      >
        <button
          type="button"
          data-tab="profile"
          data-active={currentTab === "profile" ? "true" : "false"}
          onClick={() => handleSelect("profile")}
          title="Mở Hồ sơ cá nhân & Cỡ chữ"
          className={`w-full min-h-[56px] p-3 rounded-2xl border shadow-sm flex items-center gap-3 text-left cursor-pointer transition-all ${
            currentTab === "profile"
              ? "bg-rose-50 dark:bg-rose-950/60 border-[#E11D48] dark:border-rose-400 ring-2 ring-rose-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-slate-600"
          }`}
        >
          <div className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl border-2 border-rose-200 dark:border-slate-600 shadow-sm overflow-hidden shrink-0 bg-[#E11D48] flex items-center justify-center text-white font-extrabold text-sm">
            {currentUser?.avatar_url ? (
              <img
                src={currentUser.avatar_url}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <span>
                {String(currentUser?.ho_ten || "AD")
                  .trim()
                  .split(/\s+/)
                  .slice(-2)
                  .map((p) => p[0] || "")
                  .join("")
                  .toUpperCase() || "AD"}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-black text-sm text-[#111C2D] dark:text-white break-words leading-snug">{currentUser?.ho_ten}</h4>
            <p className="text-xs text-[#E11D48] dark:text-rose-300 font-semibold leading-snug break-words">{currentUser?.chuc_danh || "Ban Quản Trị"}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-mono font-bold">
                TK: {currentUser?.login_username || currentUser?.ma_nv}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">•</span>
              <span className="text-xs text-slate-600 dark:text-slate-300 truncate font-semibold">Hồ sơ &amp; Cỡ chữ</span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2 pt-1">
          {onClearCache && (
            <button
              type="button"
              onClick={() => {
                if (onCloseMobileMenu) onCloseMobileMenu();
                onClearCache();
              }}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer whitespace-nowrap"
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
      <aside className="hidden lg:flex w-72 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 flex-col justify-between shrink-0 h-screen sticky top-0 border-r-2 border-slate-200 dark:border-slate-800 select-none transition-colors duration-200">
        {renderSidebarBody(false)}
      </aside>

      {/* Mobile Slide-Over Drawer (Render qua Portal & Z-Index 90 tách hoàn toàn khỏi #app) */}
      {isMobileMenuOpen && typeof document !== "undefined" &&
        createPortal(
          <div
            data-modal-root="true"
            role="dialog"
            aria-modal="true"
            className="lg:hidden fixed inset-0 flex animate-fade-in"
            style={{ zIndex: 90 }}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => {
              if (!e.target?.closest?.(".modal-scroll-area")) e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div
              className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm"
              onClick={onCloseMobileMenu}
              onWheel={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
            <aside className="relative z-10 w-[84vw] max-w-[320px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 flex flex-col justify-between h-full border-r border-slate-200 dark:border-slate-700 shadow-2xl">
              {renderSidebarBody(true)}
            </aside>
          </div>,
          document.body
        )}

      {/* Mobile Bottom Navigation Bar fallback (chỉ render nếu caller chưa đặt DesktopMobileBottomNav in-flow) */}
      {showMobileBottomNav && (
        <DesktopMobileBottomNav
          activeRole={activeRole}
          dynamicPerms={dynamicPerms}
          alertsSummary={alertsSummary}
          pendingRequestsCount={pendingRequestsCount}
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          onOpenMobileMenu={onOpenMobileMenu}
        />
      )}
    </>
  );
}
