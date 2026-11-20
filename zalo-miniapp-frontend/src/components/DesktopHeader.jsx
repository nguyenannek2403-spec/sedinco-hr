import React, { useLayoutEffect, useEffect, useState } from "react";
import {
  Clock,
  RefreshCw,
  ChevronRight,
  Menu,
  Bell,
  ShieldAlert,
  ArrowLeft,
  LogOut,
  KeyRound,
  X
} from "lucide-react";
import { ROLE_LABELS, ROLES } from "../constants/roles";
import { ThemeToggleButton } from "../context/ThemeContext";
import { useNotifications } from "../modules/notifications/useNotifications";
import NotificationCenterPanel from "../modules/notifications/NotificationCenterPanel";

export default function DesktopHeader({
  currentUser,
  currentTab,
  setCurrentTab,
  onNavigateAlert,
  managementSubTab = "employees",
  settingsSubTab = "company",
  activeRole,
  dynamicPerms = {},
  onLogout,
  onChangePasswordRequest,
  currentTime,
  alertsSummary = {},
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

  useLayoutEffect(() => {
    if (!showAlertPanel || typeof document === "undefined") return undefined;
    document.documentElement.classList.add("body-modal-open");
    document.body.classList.add("body-modal-open");
    const bgContainers = document.querySelectorAll(
      "#app main, #app [data-scroll-container], #app .overflow-y-auto"
    );
    const lockedEls = [];
    bgContainers.forEach((el) => {
      if (!el.closest?.('[data-modal-root="true"]')) {
        el.classList.add("bg-scroll-locked");
        lockedEls.push(el);
      }
    });
    return () => {
      document.documentElement.classList.remove("body-modal-open");
      document.body.classList.remove("body-modal-open");
      lockedEls.forEach((el) => el.classList.remove("bg-scroll-locked"));
    };
  }, [showAlertPanel]);

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

  const getTabTitle = () => {
    switch (currentTab) {
      case "overview":
        return "Tổng Quan Điều Hành";
      case "matrix":
        return activeRole === "accountant"
          ? "Bảng Chấm Công Ma Trận"
          : "Bảng Công Ma Trận (Toàn Công Ty)";
      case "requests":
        return "Xét Duyệt Đơn Từ";
      case "management":
        if (activeRole !== ROLES.ADMIN) return "Quản Lý Nhân Sự";
        if (managementSubTab === "payroll") return "Trung Tâm Quản Trị • Giám Sát Lương";
        if (managementSubTab === "audit_logs") return "Trung Tâm Quản Trị • Nhật Ký & An Ninh";
        return "Trung Tâm Quản Trị • Nhân Sự & Thiết Bị";
      case "settings":
        if (settingsSubTab === "permissions") return "Cài Đặt Hệ Thống • Phân Quyền Kế Toán";
        if (settingsSubTab === "holidays") return "Cài Đặt Hệ Thống • Lịch Nghỉ Lễ (x3)";
        return "Cài Đặt Hệ Thống • Công Ty & GPS";
      case "qa_center":
        return "QA Center • Kiểm Thử Chất Lượng";
      case "payroll":
        return "Bảng Lương & Đối Soát Khiếu Nại";
      case "profile":
        return activeRole === ROLES.ADMIN
          ? "Hồ Sơ Quản Trị Hệ Thống"
          : "Hồ Sơ Cá Nhân & Phiếu Lương";
      default:
        return "Bảng Điều Khiển Sedinco HR";
    }
  };

  const displayTime = currentTime instanceof Date ? currentTime : new Date();

  return (
    <header
      className={`bg-white/95 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-[10px] sm:px-6 lg:px-8 pb-2.5 flex items-center justify-between gap-[6px] sm:gap-2 sticky top-0 select-none shadow-[0_2px_14px_-2px_rgba(15,23,42,0.06)] transition-colors duration-200 ${
        showAlertPanel ? "z-[125]" : "z-40"
      }`}
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
    >
      {/* Trái: Nút Menu Mobile + Nút Trở về trên tab phụ + Tiêu đề tab */}
      <div className="flex items-center gap-[6px] sm:gap-2 min-w-0 shrink-0 sm:shrink">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden min-w-[44px] min-h-[44px] p-[8px] sm:p-2 rounded-2xl bg-blue-50/90 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#0068FF] dark:text-blue-300 border border-blue-200/80 dark:border-slate-700 flex items-center justify-center shrink-0"
            aria-label="Mở danh mục quản trị"
            title="Mở danh mục quản trị"
          >
            <Menu size={18} />
          </button>
        )}

        {currentTab && currentTab !== "overview" && currentTab !== "matrix" && typeof setCurrentTab === "function" && (
          <button
            type="button"
            aria-label="Trở về"
            onClick={() => setCurrentTab("overview")}
            className="hidden sm:flex min-w-[44px] min-h-[44px] px-3 py-1.5 rounded-full bg-blue-50/90 hover:bg-blue-100 dark:bg-blue-600/20 dark:hover:bg-blue-600/30 text-[#0068FF] dark:text-blue-300 border border-blue-200 dark:border-blue-500/40 items-center justify-center gap-1 text-xs font-extrabold shrink-0"
          >
            <ArrowLeft size={15} className="shrink-0" />
            <span className="hidden sm:inline">Tổng quan</span>
          </button>
        )}

        <div className="hidden lg:block min-w-0 max-w-[260px]">
          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-300 font-bold leading-snug">
            <span className="truncate">Sedinco Nhân Sự</span>
            <ChevronRight size={12} className="shrink-0" />
            <span className="text-[#0068FF] dark:text-blue-400 font-black truncate">{ROLE_LABELS[activeRole] || currentUser?.ho_ten}</span>
          </div>
          <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight truncate">
            {getTabTitle()}
          </h2>
        </div>
      </div>

      {/* Giữa: Tên nhân sự nổi bật + Mã NV / Vai trò */}
      <div className="flex-1 min-w-0 text-center px-1">
        <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-tight truncate">
          {currentUser?.ho_ten || ROLE_LABELS[activeRole] || "Quản trị viên"}
        </div>
        <div className="text-xs text-[#0068FF] dark:text-blue-300 font-semibold leading-snug truncate">
          {currentUser?.login_username || currentUser?.ma_nv ? `${currentUser?.login_username || currentUser?.ma_nv} • ` : ""}
          {ROLE_LABELS[activeRole] || getTabTitle()}
        </div>
      </div>

      {/* Phải: Giao diện, Tài khoản, Thông báo, Làm mới & Đăng xuất */}
      <div className="flex items-center gap-[6px] sm:gap-1.5 shrink-0 relative">
        <div className="hidden xl:flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 px-3 py-1.5 rounded-full text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
          <Clock size={14} className="text-[#0068FF] dark:text-blue-400" />
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
            className="hidden sm:flex min-w-[44px] min-h-[44px] px-3 py-1.5 bg-blue-50/70 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-blue-500/20 text-[#0068FF] hover:text-blue-800 dark:text-slate-200 dark:hover:text-blue-300 border border-blue-200/80 dark:border-slate-700 rounded-2xl items-center justify-center gap-1.5 text-xs font-bold transition-colors"
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
          className={`relative min-w-[44px] min-h-[44px] px-[8px] sm:px-3 py-1.5 rounded-2xl border flex items-center justify-center gap-1.5 text-xs font-black transition-all cursor-pointer ${
            unreadCriticalCount > 0
              ? "bg-rose-50 dark:bg-rose-600/20 border-rose-300 dark:border-rose-500 text-rose-700 dark:text-rose-300 shadow-sm"
              : totalBellCount > 0
              ? "bg-amber-50 dark:bg-amber-500/20 border-amber-300 dark:border-amber-400 text-amber-700 dark:text-amber-200 shadow-sm"
              : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          }`}
          title="Trung tâm Thông báo & Cảnh báo"
        >
          <Bell
            size={16}
            className={
              unreadCriticalCount > 0
                ? "text-rose-600 dark:text-rose-400"
                : totalBellCount > 0
                ? "text-amber-600 dark:text-amber-300"
                : "text-slate-600 dark:text-slate-300"
            }
          />
          {totalBellCount > 0 && (
            <span
              data-testid="desktop-bell-badge"
              className={`px-1.5 py-0.5 text-xs leading-none rounded-full text-white font-black ${
                unreadCriticalCount > 0 ? "bg-rose-600" : "bg-amber-600"
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
            className="hidden sm:flex min-w-[44px] min-h-[44px] p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-2xl transition-all active:scale-95 items-center justify-center cursor-pointer"
            title="Tải lại dữ liệu mới nhất"
          >
            <RefreshCw size={15} className={isLoading ? "animate-spin text-[#0068FF] dark:text-blue-400" : ""} />
          </button>
        )}

        {typeof onLogout === "function" && (
          <button
            type="button"
            aria-label="Đăng xuất"
            onClick={onLogout}
            title="Đăng xuất"
            className="min-w-[44px] min-h-[44px] px-[10px] sm:px-3 py-2 rounded-2xl bg-slate-50 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-500/20 text-slate-700 hover:text-rose-700 dark:text-slate-100 dark:hover:text-rose-200 border border-slate-200 dark:border-slate-700 hover:border-rose-400 flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 transition-colors cursor-pointer"
          >
            <LogOut size={14} className="shrink-0" />
            <span className="hidden sm:inline">Đăng xuất</span>
          </button>
        )}

        {/* Popover Trung tâm Thông báo V29 */}
        {showAlertPanel && (
          <>
            <div
              className="fixed top-0 right-0 bottom-0 left-0 z-[120] bg-slate-950/35 dark:bg-slate-950/60"
              aria-hidden="true"
              onClick={() => setShowAlertPanel(false)}
              onWheel={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
            <div
              data-testid="notification-popover"
              data-modal-root="true"
              role="dialog"
              aria-modal="true"
              aria-label={`Thông báo & Cảnh báo (${totalBellCount})`}
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => {
                if (!e.target?.closest?.(".modal-scroll-area")) e.preventDefault();
                e.stopPropagation();
              }}
              className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top,0px)+64px)] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[440px] z-[125] max-h-[78vh] flex flex-col rounded-2xl shadow-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 overflow-hidden animate-fade-in"
            >
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/90 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldAlert className="w-4 h-4 text-[#0068FF] dark:text-blue-400 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight truncate">
                      Trung tâm Thông báo ({unreadCount} chưa đọc)
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug truncate">
                      Lưu đầy đủ lịch sử • Bấm để xem chi tiết
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAlertPanel(false)}
                  aria-label="Đóng"
                  className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/80 dark:hover:bg-slate-700 text-slate-600 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto modal-scroll-area p-3.5 bg-white dark:bg-slate-900">
                <NotificationCenterPanel
                  mode="desktop"
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
              </div>

              <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAlertPanel(false)}
                  className="w-full min-h-[44px] py-2 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 text-xs font-bold cursor-pointer transition-colors"
                >
                  Đóng / Quay lại
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
