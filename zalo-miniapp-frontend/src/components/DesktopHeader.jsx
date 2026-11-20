import React, { useEffect, useState } from "react";
import {
  Clock,
  RefreshCw,
  ChevronRight,
  Menu,
  Bell,
  ArrowLeft,
  LogOut,
  KeyRound
} from "lucide-react";
import { getDefaultTabForRole, ROLE_LABELS, ROLES } from "../constants/roles";
import { ThemeToggleButton } from "../context/ThemeContext";
import { useNotifications } from "../modules/notifications/useNotifications";
import NotificationCenterPanel from "../modules/notifications/NotificationCenterPanel";

export default function DesktopHeader({
  currentUser,
  currentTab,
  setCurrentTab,
  onNavigateAlert,
  settingsSubTab = "company",
  activeRole,
  dynamicPerms = {},
  onLogout,
  onChangePasswordRequest,
  currentTime,
  onRefresh,
  refreshSignal = 0,
  isLoading,
  onOpenMobileMenu
}) {
  const [showAlertPanel, setShowAlertPanel] = useState(false);

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
  }, [refreshSignal, currentTab]); // eslint-disable-line react-hooks/exhaustive-deps

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
        target_tab: notif.target_tab || (activeRole === ROLES.ADMIN ? "management" : "payroll"),
        target_subtab: notif.target_subtab || null,
        target_ma_nv: notif.target_ma_nv || null,
        target_id: notif.target_id || notif.id,
        month: notif.ref_month || null,
        year: notif.ref_year || null,
        _alreadyMarkedRead: true
      });
    } else if (setCurrentTab && notif.target_tab) {
      setCurrentTab(notif.target_tab);
    }
  };

  const unreadCriticalCount = notifications.filter(
    (n) => Number(n.is_read || 0) === 0 && (n.severity === "critical" || n.severity === "high")
  ).length;
  const totalBellCount = unreadCount;

  const defaultTab = getDefaultTabForRole(activeRole, dynamicPerms);

  const getTabTitle = () => {
    switch (currentTab) {
      case "employees":
        return "Nhân Sự & Thiết Bị";
      case "matrix":
        return activeRole === ROLES.ACCOUNTANT
          ? "Bảng Chấm Công Ma Trận"
          : "Bảng Công Ma Trận (Toàn Công Ty)";
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
        return activeRole === ROLES.ADMIN
          ? "Hồ Sơ Quản Trị Hệ Thống"
          : "Hồ Sơ Cá Nhân & Cỡ Chữ";
      default:
        return "Bảng Điều Khiển Sedinco HR";
    }
  };

  const displayTime = currentTime instanceof Date ? currentTime : new Date();

  return (
    <>
    <header
      className="sedinco-glass-header border-b border-slate-200/80 dark:border-slate-800 px-3 sm:px-6 lg:px-8 pb-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sticky top-0 z-40 select-none transition-colors duration-200"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
    >
      {/* Hàng 1 (Mobile chừa pr-[96px] cho cụm nút Zalo) / Trái + Giữa (Desktop) */}
      <div className="flex items-center gap-2 min-w-0 pr-[96px] sm:pr-0 sm:flex-1">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden min-w-[44px] min-h-[44px] p-2 rounded-xl bg-rose-50/90 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#E11D48] dark:text-rose-300 border border-rose-200/80 dark:border-slate-700 flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="Mở danh mục quản trị"
            title="Mở danh mục quản trị"
          >
            <Menu size={18} />
          </button>
        )}

        {currentTab && currentTab !== defaultTab && typeof setCurrentTab === "function" && (
          <button
            type="button"
            aria-label="Trở về"
            onClick={() => setCurrentTab(defaultTab)}
            className="hidden sm:flex min-w-[44px] min-h-[44px] px-3 py-1.5 rounded-full bg-rose-50/90 hover:bg-rose-100 dark:bg-rose-600/20 dark:hover:bg-rose-600/30 text-[#B80035] dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 items-center justify-center gap-1 text-xs font-extrabold shrink-0 cursor-pointer"
          >
            <ArrowLeft size={15} className="shrink-0" />
            <span className="hidden sm:inline">Trang chính</span>
          </button>
        )}

        <div className="hidden lg:block min-w-0 max-w-[260px]">
          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-300 font-bold leading-snug">
            <span className="truncate">Sedinco HR</span>
            <ChevronRight size={12} className="shrink-0" />
            <span className="text-[#E11D48] dark:text-rose-400 font-black truncate">{ROLE_LABELS[activeRole] || currentUser?.ho_ten}</span>
          </div>
          <h2 className="text-sm sm:text-base font-black text-[#111C2D] dark:text-white tracking-tight truncate">
            {getTabTitle()}
          </h2>
        </div>

        {/* Tên nhân sự nổi bật + Mã NV / Vai trò */}
        <div className="flex-1 min-w-0 text-left sm:text-center px-1">
          <div className="text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-white leading-tight truncate">
            {currentUser?.ho_ten || ROLE_LABELS[activeRole] || "Quản trị viên"}
          </div>
          <div className="text-xs text-[#E11D48] dark:text-rose-300 font-semibold leading-snug truncate">
            {currentUser?.login_username || currentUser?.ma_nv ? `${currentUser?.login_username || currentUser?.ma_nv} • ` : ""}
            {ROLE_LABELS[activeRole] || getTabTitle()}
          </div>
        </div>
      </div>

      {/* Hàng 2 (Mobile) / Phải (Desktop): Giao diện, Tài khoản, Thông báo, Làm mới & Đăng xuất */}
      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 shrink-0 relative">
        <span className="sm:hidden inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/50 border border-rose-200/80 dark:border-rose-800/60 text-xs font-bold text-[#B80035] dark:text-rose-300 truncate max-w-[140px]">
          {getTabTitle()}
        </span>

        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
          <div className="hidden xl:flex items-center gap-2 bg-[#F0F3FF] dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 px-3 py-1.5 rounded-full text-xs font-mono font-bold text-[#111C2D] dark:text-slate-200">
            <Clock size={14} className="text-[#E11D48] dark:text-rose-400" />
            <span>
              {displayTime.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </span>
          </div>

          <ThemeToggleButton compact />

          {typeof onChangePasswordRequest === "function" && (
            <button
              type="button"
              onClick={onChangePasswordRequest}
              data-testid="header-account-btn"
              aria-label="Tài khoản và mật khẩu"
              title="Cập nhật Tài khoản đăng nhập (SĐT) & Mật khẩu"
              className="hidden sm:flex min-w-[44px] min-h-[44px] px-3 py-1.5 bg-rose-50/70 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-500/20 text-[#B80035] hover:text-[#E11D48] dark:text-slate-200 dark:hover:text-rose-300 border border-rose-200/80 dark:border-slate-700 rounded-xl items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
            >
              <KeyRound size={14} className="shrink-0" />
              <span className="hidden xl:inline">Tài khoản</span>
            </button>
          )}

          {/* Nút Chuông Thông Báo & Cảnh Báo Deep-Link (Hiển thị đúng số CHƯA ĐỌC thật từ DB) */}
          <button
            type="button"
            data-bell-button="true"
            data-testid="desktop-bell-btn"
            onClick={handleTogglePanel}
            aria-label="Trung tâm cảnh báo và thông báo"
            className={`relative min-w-[44px] min-h-[44px] px-[8px] sm:px-3 py-1.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-black transition-all cursor-pointer ${
              unreadCriticalCount > 0
                ? "bg-rose-50 dark:bg-rose-600/20 border-rose-300 dark:border-rose-500 text-[#B80035] dark:text-rose-300 shadow-sm"
                : totalBellCount > 0
                ? "bg-amber-50 dark:bg-amber-500/20 border-amber-300 dark:border-amber-400 text-amber-700 dark:text-amber-200 shadow-sm"
                : "bg-[#F0F3FF] dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-[#111C2D] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Trung tâm Thông báo & Cảnh báo"
          >
            <Bell
              size={16}
              className={
                unreadCriticalCount > 0
                  ? "text-[#E11D48] dark:text-rose-400"
                  : totalBellCount > 0
                  ? "text-amber-600 dark:text-amber-300"
                  : "text-slate-600 dark:text-slate-300"
              }
            />
            {totalBellCount > 0 && (
              <span
                data-testid="desktop-bell-badge"
                className={`px-1.5 py-0.5 text-xs leading-none rounded-full text-white font-black ${
                  unreadCriticalCount > 0 ? "bg-[#E11D48]" : "bg-amber-600"
                }`}
              >
                {totalBellCount}
              </span>
            )}
          </button>

          {onRefresh && (
            <button
              type="button"
              onClick={() => {
                onRefresh();
                fetchNotifications({ filterOverride: filter, offset: 0, append: false });
              }}
              aria-label="Làm mới dữ liệu"
              className="hidden sm:flex min-w-[44px] min-h-[44px] p-2 bg-[#F0F3FF] hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#111C2D] dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl transition-all active:scale-95 items-center justify-center cursor-pointer"
              title="Tải lại dữ liệu mới nhất"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin text-[#E11D48] dark:text-rose-400" : ""} />
            </button>
          )}

          {typeof onLogout === "function" && (
            <button
              type="button"
              aria-label="Đăng xuất"
              onClick={onLogout}
              title="Đăng xuất"
              className="min-w-[44px] min-h-[44px] px-[10px] sm:px-3 py-2 rounded-xl bg-[#F0F3FF] hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-500/20 text-[#111C2D] hover:text-[#B80035] dark:text-slate-100 dark:hover:text-rose-200 border border-slate-200 dark:border-slate-700 hover:border-rose-400 flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 transition-colors cursor-pointer"
            >
              <LogOut size={14} className="shrink-0" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          )}
        </div>
      </div>
    </header>

    <NotificationCenterPanel
      open={showAlertPanel}
      onClose={() => setShowAlertPanel(false)}
      mode="desktop"
      title={`Trung tâm Thông báo (${unreadCount} chưa đọc)`}
      subtitle="Lưu đầy đủ lịch sử • Bấm để xem chi tiết"
      notifications={notifications}
      unreadCount={unreadCount}
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
