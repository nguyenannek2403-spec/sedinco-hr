import React, { useEffect, useState } from "react";
import { LogOut, Bell, Menu, RefreshCw, KeyRound } from "lucide-react";
import { ROLE_LABELS, ROLES } from "../constants/roles";
import CompanyLogo from "./CompanyLogo";
import { ThemeToggleButton, useTheme } from "../context/ThemeContext";
import { useNotifications } from "../hooks/useNotifications";
import NotificationCenterPanel from "./NotificationCenterPanel";
import { UserAvatar } from "./ui";

/**
 * DesktopHeader — Google Stitch "Sedinco Pulse" Single-Row Executive TopAppBar (Screens 6–14)
 * - Left: Mobile menu button + Official SEDINCO logo / Crimson "S" badge + Portal title & active tab title
 * - Right (with 96px mobile safe zone for Zalo capsule): Notification Bell + Theme Toggle + Profile Avatar + Logout
 */
export default function DesktopHeader({
  currentUser,
  currentTab,
  activeTab,
  setCurrentTab,
  onSelectTab,
  onNavigateAlert,
  settingsSubTab = "company",
  activeRole,
  onLogout,
  onChangePasswordRequest,
  onRefresh,
  refreshSignal = 0,
  isLoading,
  onOpenMobileMenu
}) {
  const { isDark } = useTheme();
  const [showAlertPanel, setShowAlertPanel] = useState(false);

  const effectiveTab = currentTab || activeTab || "employees";
  const handleSelectTab = setCurrentTab || onSelectTab;
  const effectiveRole = activeRole || currentUser?.role || ROLES.ADMIN;
  const isAdmin = effectiveRole === ROLES.ADMIN;

  const {
    filter,
    changeFilter,
    notifications,
    unreadCount,
    readCount,
    totalCount,
    hasMore,
    loading: loadingNotifs,
    loadingMore,
    fetchNotifications,
    loadMore,
    markRead,
    markAllRead
  } = useNotifications({ limit: 20, autoFetch: true });

  useEffect(() => {
    fetchNotifications({ filterOverride: filter, offset: 0, append: false });
  }, [refreshSignal, effectiveTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTogglePanel = () => {
    const next = !showAlertPanel;
    setShowAlertPanel(next);
    if (next) {
      fetchNotifications({ filterOverride: filter, offset: 0, append: false });
    }
  };

  const handleClickNotification = async (notif) => {
    if (!notif) return;
    await markRead(notif);
    setShowAlertPanel(false);
    if (typeof onNavigateAlert === "function") {
      onNavigateAlert({
        id: notif.id,
        notification_id: notif.id,
        category: notif.category || (notif.type === "PERIOD_LOCKED_PAYROLL" ? "period_locked" : "general"),
        severity: notif.severity || "info",
        title: notif.title,
        description: notif.message,
        target_tab: notif.target_tab || (effectiveRole === ROLES.ADMIN ? "management" : "payroll"),
        target_subtab: notif.target_subtab || null,
        target_ma_nv: notif.target_ma_nv || null,
        target_id: notif.target_id || notif.id,
        month: notif.ref_month || notif.period_month || null,
        year: notif.ref_year || notif.period_year || null,
        _alreadyMarkedRead: true
      });
    } else if (handleSelectTab && notif.target_tab) {
      handleSelectTab(notif.target_tab);
    }
  };

  const unreadCriticalCount = notifications.filter(
    (n) => Number(n.is_read || 0) === 0 && (n.severity === "critical" || n.severity === "high")
  ).length;
  const totalBellCount = Number(unreadCount || 0);

  const getTabTitle = () => {
    switch (effectiveTab) {
      case "employees":
        return "Nhân Sự & Thiết Bị 360°";
      case "matrix":
        return "Bảng Chấm Công";
      case "requests":
        return "Duyệt Đơn Từ & OT";
      case "payroll":
        return "Bảng Lương & Phiếu Lương";
      case "settings":
        if (settingsSubTab === "permissions") return "Cài Đặt • Phân Quyền Kế Toán";
        if (settingsSubTab === "holidays") return "Cài Đặt • Lịch Nghỉ Lễ (x3)";
        if (settingsSubTab === "audit_logs") return "Cài Đặt • Nhật Ký & An Ninh";
        return "Cài Đặt • Công Ty & GPS";
      case "profile":
        return effectiveRole === ROLES.ADMIN ? "Tài Khoản Quản Trị" : "Tài Khoản & Cỡ Chữ";
      default:
        return "Sedinco HR";
    }
  };

  return (
    <>
      <header
        className="sticky top-0 z-30 sedinco-glass-header border-b border-slate-200/80 dark:border-slate-800 pl-3 sm:pl-5 pr-[104px] py-2 pt-[max(env(safe-area-inset-top,0px),8px)] min-h-[52px] flex items-center select-none transition-colors duration-200"
      >
        <div className="w-full flex items-center justify-between gap-2">
          {/* Left: Drawer Trigger + Official SEDINCO Brand + Active Section */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {typeof onOpenMobileMenu === "function" && (
              <button
                type="button"
                onClick={onOpenMobileMenu}
                aria-label="Mở danh mục quản trị"
                title="Danh mục điều hành"
                className="lg:hidden min-w-[40px] min-h-[40px] w-10 h-10 p-1.5 rounded-xl bg-[#F0F3FF] hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-[#111C2D] dark:text-slate-100 inline-flex items-center justify-center cursor-pointer transition-colors shrink-0"
              >
                <Menu className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />
              </button>
            )}

            <div className="hidden sm:flex shrink-0">
              {isAdmin ? (
                <div className="w-8 h-8 rounded-xl bg-[#B80035] flex items-center justify-center text-white font-extrabold text-sm shadow-sm shrink-0">
                  S
                </div>
              ) : (
                <CompanyLogo size="compact" theme={isDark ? "dark" : "light"} iconOnly />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs sm:text-sm font-extrabold tracking-tight text-[#111C2D] dark:text-white truncate">
                  {getTabTitle()}
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-[#FFE4E6] dark:bg-rose-950/70 text-[#B80035] dark:text-rose-300 text-xs font-extrabold uppercase shrink-0 whitespace-nowrap">
                  {isAdmin ? "ADMIN" : ROLE_LABELS[effectiveRole] || "Kế toán"}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Notification Bell + Theme Toggle + Refresh + Profile Avatar + Logout */}
          <div className="flex items-center justify-end gap-1 sm:gap-1.5 shrink-0">
            <button
              type="button"
              data-bell-button="true"
              data-testid="desktop-bell-btn"
              onClick={handleTogglePanel}
              aria-label="Trung tâm cảnh báo và thông báo"
              title="Trung tâm Thông báo & Cảnh báo"
              className={`relative min-w-[40px] min-h-[40px] px-2 py-1.5 rounded-full border inline-flex items-center justify-center gap-1 text-xs font-extrabold transition cursor-pointer ${
                unreadCriticalCount > 0
                  ? "bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/70 dark:hover:bg-rose-900/70 border-rose-300 dark:border-rose-500/60 text-[#B80035] dark:text-rose-200"
                  : totalBellCount > 0
                  ? "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-500/50 text-amber-800 dark:text-amber-200"
                  : "bg-[#F0F3FF] hover:bg-slate-200/70 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200/80 dark:border-slate-700 text-[#111C2D] dark:text-slate-200"
              }`}
            >
              <Bell
                className={`w-4 h-4 shrink-0 ${
                  unreadCriticalCount > 0
                    ? "text-[#E11D48] dark:text-rose-400"
                    : totalBellCount > 0
                    ? "text-amber-600 dark:text-amber-300"
                    : "text-slate-600 dark:text-slate-300"
                }`}
              />
              {totalBellCount > 0 && (
                <span
                  data-testid="desktop-bell-badge"
                  className={`min-w-[16px] h-[16px] px-1 rounded-full text-white text-[11px] font-extrabold flex items-center justify-center ${
                    unreadCriticalCount > 0 ? "bg-[#E11D48]" : "bg-amber-600"
                  }`}
                >
                  {totalBellCount > 99 ? "99+" : totalBellCount}
                </span>
              )}
            </button>

            <ThemeToggleButton compact />

            {typeof onRefresh === "function" && (
              <button
                type="button"
                onClick={() => {
                  onRefresh();
                  fetchNotifications({ filterOverride: filter, offset: 0, append: false });
                }}
                aria-label="Làm mới dữ liệu"
                title="Tải lại dữ liệu mới nhất"
                className="hidden sm:inline-flex min-w-[40px] min-h-[40px] p-2 rounded-full bg-[#F0F3FF] hover:bg-slate-200/70 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-[#111C2D] dark:text-slate-200 items-center justify-center cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-[#E11D48] dark:text-rose-400" : ""}`} />
              </button>
            )}

            {typeof onChangePasswordRequest === "function" && (
              <button
                type="button"
                onClick={onChangePasswordRequest}
                title="Đổi tài khoản đăng nhập (SĐT) & Mật khẩu"
                className="hidden md:inline-flex min-w-[40px] min-h-[40px] px-3 py-1.5 rounded-full bg-[#F0F3FF] hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-[#111C2D] dark:text-slate-200 items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#E11D48] dark:text-rose-400 shrink-0" />
                <span className="hidden xl:inline">Mật khẩu</span>
              </button>
            )}

            {typeof handleSelectTab === "function" && (
              <button
                type="button"
                onClick={() => handleSelectTab("profile")}
                aria-label="Hồ sơ tài khoản"
                title={`${currentUser?.ho_ten || "Tài khoản"} (${currentUser?.ma_nv || "ADMIN"})`}
                className={`min-w-[40px] min-h-[40px] p-1 rounded-full border transition cursor-pointer inline-flex items-center justify-center ${
                  effectiveTab === "profile"
                    ? "bg-[#FFE4E6] dark:bg-rose-950/80 border-[#E11D48] text-[#B80035] dark:text-rose-300"
                    : "bg-[#F0F3FF] hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200/80 dark:border-slate-700 text-[#111C2D] dark:text-slate-200"
                }`}
              >
                <UserAvatar
                  name={currentUser?.ho_ten || currentUser?.username || currentUser?.ma_nv || "Admin"}
                  avatarUrl={currentUser?.avatar_url}
                  size="xs"
                />
              </button>
            )}

            {typeof onLogout === "function" && (
              <button
                type="button"
                onClick={onLogout}
                title="Đăng xuất khỏi hệ thống"
                aria-label="Đăng xuất"
                className="hidden sm:inline-flex min-w-[40px] min-h-[40px] px-2.5 py-1.5 rounded-full bg-[#F0F3FF] hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-700 hover:text-[#E11D48] dark:text-slate-200 dark:hover:text-rose-300 text-xs font-bold items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">Đăng xuất</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <NotificationCenterPanel
        open={showAlertPanel}
        onClose={() => setShowAlertPanel(false)}
        mode="desktop"
        title={`Trung tâm Thông báo (${totalBellCount} chưa đọc)`}
        subtitle="Lưu đầy đủ lịch sử • Bấm để xem chi tiết"
        notifications={notifications}
        unreadCount={totalBellCount}
        readCount={readCount}
        totalCount={totalCount}
        filter={filter}
        onFilterChange={changeFilter}
        hasMore={hasMore}
        loading={loadingNotifs}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        onMarkAllRead={markAllRead}
        onMarkSingleRead={markRead}
        onClickItem={handleClickNotification}
      />
    </>
  );
}
