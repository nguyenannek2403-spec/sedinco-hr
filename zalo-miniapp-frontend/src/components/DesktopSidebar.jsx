import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  DollarSign,
  Users,
  FileText,
  Settings,
  User,
  LogOut,
  X,
  ShieldCheck,
  Clock
} from "lucide-react";
import { ROLES, ROLE_LABELS, isTabAllowedForRole } from "../constants/roles";
import CompanyLogo from "./CompanyLogo";
import { useTheme } from "../context/ThemeContext";
import { useModalStack } from "../hooks/useLockBodyScroll";
import { UnifiedBottomNav } from "./layout/UniversalAppShell";

const ALL_MENU_ITEMS = [
  { id: "employees", label: "Nhân sự 360°", shortLabel: "Nhân sự", icon: Users },
  { id: "matrix", label: "Bảng công", shortLabel: "Bảng công", icon: Calendar },
  { id: "requests", label: "Duyệt đơn", shortLabel: "Duyệt đơn", icon: FileText },
  { id: "payroll", label: "Bảng lương", shortLabel: "Bảng lương", icon: DollarSign },
  { id: "my_attendance", label: "Chấm công & Công cá nhân", shortLabel: "Chấm công", icon: Clock },
  { id: "settings", label: "Cài đặt", shortLabel: "Cài đặt", icon: Settings }
];

export function getAllowedDesktopMenuItems(effectiveRole, dynamicPerms = {}) {
  const accountantOrder = dynamicPerms?.accountant_manual_checkin
    ? ["my_attendance", "matrix", "requests", "payroll", "employees"]
    : ["matrix", "requests", "payroll", "my_attendance", "employees"];
  const ordered =
    effectiveRole === ROLES.ACCOUNTANT
      ? accountantOrder.map((id) => ALL_MENU_ITEMS.find((item) => item.id === id)).filter(Boolean)
      : ALL_MENU_ITEMS;
  return ordered.filter((item) => isTabAllowedForRole(item.id, effectiveRole, dynamicPerms));
}

/**
 * DesktopMobileBottomNav — Google Stitch "Sedinco Pulse" Direct Bottom Navigation (Screens 6–13)
 * - Admin: 5 direct tabs (Nhân sự, Bảng công, Duyệt đơn, Bảng lương, Cài đặt)
 * - Accountant: Direct allowed tabs + Hồ sơ tab (up to 5 tabs)
 */
export function DesktopMobileBottomNav({
  activeTab,
  currentTab,
  onSelectTab,
  setCurrentTab,
  userRole = ROLES.ADMIN,
  activeRole,
  dynamicPerms = {},
  alertsSummary = {},
  pendingRequestsCount = 0
}) {
  const effectiveRole = activeRole || userRole;
  const resolvedTab = currentTab || activeTab;
  const handleSelect = setCurrentTab || onSelectTab;
  const allowedItems = getAllowedDesktopMenuItems(effectiveRole, dynamicPerms);

  // Build bottom nav items matching Stitch Screens 6–13
  const navItems =
    effectiveRole === ROLES.ACCOUNTANT
      ? [
          ...allowedItems.slice(0, 4),
          { id: "profile", label: "Hồ sơ", shortLabel: "Hồ sơ", icon: User }
        ]
      : allowedItems.slice(0, 5);

  const pendingReqCount = Number(pendingRequestsCount || alertsSummary?.pending_requests_count || 0);

  return (
    <UnifiedBottomNav
      items={navItems}
      activeTab={resolvedTab}
      onSelectTab={handleSelect}
      badgeMap={{ requests: pendingReqCount }}
      hideOnDesktop={true}
      ariaLabel="Điều hướng chính quản trị"
    />
  );
}

export default function DesktopSidebar({
  activeTab,
  currentTab,
  onSelectTab,
  setCurrentTab,
  userRole = ROLES.ADMIN,
  activeRole,
  currentUser,
  onLogout,
  dynamicPerms = {},
  mobileOpen = false,
  isMobileMenuOpen = false,
  onCloseMobile,
  onCloseMobileMenu
}) {
  const { isDark } = useTheme();
  const effectiveRole = activeRole || userRole;
  const resolvedTab = currentTab || activeTab;
  const handleSelectFn = setCurrentTab || onSelectTab;
  const resolvedMobileOpen = Boolean(isMobileMenuOpen || mobileOpen);
  const handleCloseMobile = onCloseMobileMenu || onCloseMobile;
  const menuItems = getAllowedDesktopMenuItems(effectiveRole, dynamicPerms);

  const { zIndex, isTopModal } = useModalStack(resolvedMobileOpen, 60);

  useEffect(() => {
    if (!resolvedMobileOpen || !isTopModal) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && typeof handleCloseMobile === "function") {
        handleCloseMobile();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [resolvedMobileOpen, isTopModal, handleCloseMobile]);

  const handleSelect = (tabId) => {
    if (typeof handleSelectFn === "function") {
      handleSelectFn(tabId);
    }
    if (typeof handleCloseMobile === "function") {
      handleCloseMobile();
    }
  };

  const renderDrawerContent = () => (
    <div className="w-72 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 flex flex-col h-full shrink-0 select-none transition-colors duration-200">
      {/* Brand Header — Stitch Executive Identity */}
      <div className="px-5 pb-4 pt-[calc(var(--safe-area-top)+8px)] lg:pt-5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 bg-[#F4F6F9] dark:bg-slate-900">
        <div className="flex items-center gap-3 min-w-0">
          <CompanyLogo size="compact" theme={isDark ? "dark" : "light"} iconOnly />
          <div className="min-w-0">
            <h1 className="font-extrabold text-[#111C2D] dark:text-white text-base tracking-tight leading-tight truncate">
              Sedinco HR
            </h1>
            <p className="text-xs font-extrabold text-[#B80035] dark:text-rose-400 uppercase tracking-wider truncate">
              {effectiveRole === ROLES.ADMIN ? "ADMIN PORTAL" : ROLE_LABELS[effectiveRole] || "KẾ TOÁN"}
            </p>
          </div>
        </div>
        {typeof handleCloseMobile === "function" && (
          <button
            type="button"
            onClick={handleCloseMobile}
            aria-label="Đóng danh mục"
            className="lg:hidden min-w-[44px] min-h-[44px] p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-[#111C2D] dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 inline-flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav
        data-filter-group="sidebar-menu"
        className="flex-1 min-h-0 p-3.5 space-y-1.5 overflow-y-auto modal-scroll-area"
      >
        <div className="px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Phân hệ điều hành
        </div>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = resolvedTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-tab={item.id}
              data-active={isActive ? "true" : "false"}
              onClick={() => handleSelect(item.id)}
              className={`w-full min-h-[48px] flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all cursor-pointer ${
                isActive
                  ? "bg-[#E11D48] text-white shadow-[0_8px_20px_-4px_rgba(225,29,72,0.35)] dark:bg-rose-600"
                  : "text-slate-700 dark:text-slate-300 hover:bg-[#F0F3FF] dark:hover:bg-slate-800 hover:text-[#111C2D] dark:hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Profile & Logout Section */}
      <div className="p-3.5 pb-[max(var(--safe-area-bottom),12px)] border-t border-slate-200/80 dark:border-slate-800 space-y-2 bg-[#F4F6F9] dark:bg-slate-900/90">
        <button
          type="button"
          data-tab="profile"
          onClick={() => handleSelect("profile")}
          className={`w-full min-h-[48px] flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all cursor-pointer ${
            resolvedTab === "profile"
              ? "bg-[#E11D48] text-white shadow-md dark:bg-rose-600"
              : "bg-white dark:bg-slate-800 text-[#111C2D] dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 hover:border-rose-300"
          }`}
        >
          <User className="w-4 h-4 shrink-0" />
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-xs font-extrabold">
              {currentUser?.ho_ten || "Tài khoản"}
            </div>
            <div className={`truncate text-xs ${resolvedTab === "profile" ? "text-rose-100" : "text-slate-500 dark:text-slate-400"}`}>
              Tài khoản • {currentUser?.ma_nv || "ADMIN"}
            </div>
          </div>
        </button>

        {typeof onLogout === "function" && (
          <button
            type="button"
            onClick={() => {
              if (typeof handleCloseMobile === "function") handleCloseMobile();
              onLogout();
            }}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/70 text-[#B80035] dark:text-rose-300 border border-rose-200 dark:border-rose-800/70 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Đăng xuất khỏi thiết bị</span>
          </button>
        )}

        <div className="px-2 pt-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400 shrink-0" />
          <span>Sedinco Knox Security</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Executive Left Rail (>= 1024px) */}
      <aside className="hidden lg:flex h-full shrink-0">{renderDrawerContent()}</aside>

      {/* Mobile Portal Drawer */}
      {resolvedMobileOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-modal-root="true"
            role="dialog"
            aria-modal="true"
            aria-label="Danh mục quản trị"
            style={{ zIndex }}
            className={`lg:hidden fixed inset-0 flex ${isDark ? "dark" : ""}`}
          >
            <div
              className="fixed inset-0 bg-slate-950/60 transition-opacity"
              aria-hidden="true"
              onClick={handleCloseMobile}
            />
            <div className="relative z-10 h-full max-w-[85vw] flex">
              {renderDrawerContent()}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
