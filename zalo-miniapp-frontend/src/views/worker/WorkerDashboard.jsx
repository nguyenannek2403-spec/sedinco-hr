import React, { useState, useCallback } from "react";
import { Clock, Calendar, FileText, User, LogOut, Bell } from "lucide-react";
import OneTouchCheckIn from "../../components/OneTouchCheckIn";
import WorkerHistoryTab from "./WorkerHistoryTab";
import WorkerRequestsTab from "./WorkerRequestsTab";
import WorkerProfileTab from "./WorkerProfileTab";
import SmartLeaveRequestModal from "../../components/SmartLeaveRequestModal";
import SalarySlipModal from "../../components/SalarySlipModal";
import CompanyLogo from "../../components/CompanyLogo";
import { ThemeToggleButton, useTheme } from "../../context/ThemeContext";
import { useNotifications } from "../../hooks/useNotifications";
import NotificationCenterPanel from "../../components/NotificationCenterPanel";

const TAB_TITLES = {
  checkin: "Chấm Công",
  history: "Lịch Công",
  requests: "Đơn Từ",
  profile: "Tài Khoản"
};

/**
 * WorkerDashboard — Google Stitch "Sedinco Pulse" Architecture (Screens 2–5)
 * - Single-row Top Glass Header (shrink-0) with SEDINCO brand mark, micro-header, active screen title,
 *   Theme Toggle, Notification Bell, Avatar quick-profile trigger, and 96x44px Zalo capsule safe zone.
 * - Independent scroll container <main data-scroll-container="worker" className="flex-1 min-h-0 overflow-y-auto">
 * - In-flow 4-Tab Bottom Navigation Bar (shrink-0) so content never overlaps navigation controls.
 */
export default function WorkerDashboard({
  currentUser,
  onLogout,
  showToast,
  onChangePasswordRequest,
  onUserUpdated
}) {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState("checkin");
  const [fixCheckoutInfo, setFixCheckoutInfo] = useState(null);

  const {
    filter: notifFilter,
    changeFilter: changeNotifFilter,
    notifications,
    unreadCount,
    readCount,
    totalCount,
    hasMore: hasMoreNotifs,
    loading: loadingNotifs,
    loadingMore: loadingMoreNotifs,
    fetchNotifications,
    loadMore: loadMoreNotifs,
    markRead,
    markAllRead
  } = useNotifications({ limit: 20, autoFetch: true });
  const [isBellOpen, setIsBellOpen] = useState(false);

  const [payslipModal, setPayslipModal] = useState({
    open: false,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  const handleOpenBell = () => {
    setIsBellOpen(true);
    fetchNotifications({ filterOverride: notifFilter, offset: 0, append: false });
  };

  const handleClickNotification = async (notif) => {
    if (!notif) return;
    await markRead(notif);
    setIsBellOpen(false);
    const m = notif.ref_month || notif.period_month;
    const y = notif.ref_year || notif.period_year;
    if (m && y) {
      setPayslipModal({
        open: true,
        month: Number(m),
        year: Number(y)
      });
    } else {
      const now = new Date();
      setPayslipModal({
        open: true,
        month: now.getMonth() + 1,
        year: now.getFullYear()
      });
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead();
      if (showToast) showToast("Đã đánh dấu tất cả thông báo là đã đọc!", "success");
    } catch (err) {
      if (showToast) showToast(err?.message || "Không thể cập nhật thông báo.", "error");
    }
  };

  const openPayslip = useCallback((month, year) => {
    const now = new Date();
    setPayslipModal({
      open: true,
      month: Number(month) || now.getMonth() + 1,
      year: Number(year) || now.getFullYear()
    });
  }, []);

  const navItems = [
    { id: "checkin", label: "Chấm công", icon: Clock },
    { id: "history", label: "Lịch công", icon: Calendar },
    { id: "requests", label: "Đơn từ", icon: FileText },
    { id: "profile", label: "Tài khoản", icon: User }
  ];

  const userInitial = String(currentUser?.ho_ten || currentUser?.ma_nv || "N")
    .trim()
    .split(/\s+/)
    .slice(-1)[0]?.[0]
    ?.toUpperCase() || "N";

  return (
    <div className="w-full h-[100dvh] bg-[#F9F9FF] dark:bg-[#090D16] text-[#111C2D] dark:text-slate-100 flex flex-col max-w-md mx-auto shadow-2xl relative overflow-hidden transition-colors duration-200">
      {/* STITCH SINGLE-ROW TOP GLASS HEADER (Screens 2–5) — Reserves 88x44px top-right Zalo Mini App capsule safe zone */}
      <header
        className="shrink-0 z-30 w-full sedinco-glass-header border-b border-slate-200/80 dark:border-slate-800 px-3.5 py-2 transition-colors duration-200"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pr-[88px] sm:pr-0 min-h-[48px]">
          {/* Left: Brand Mark + SEDINCO HR micro-header + Active Screen Title */}
          <div className="flex items-center gap-2.5 shrink-0">
            <CompanyLogo size="compact" theme={isDark ? "dark" : "light"} iconOnly />
            <div>
              <span className="block text-xs font-extrabold uppercase tracking-wider text-[#B80035] dark:text-rose-400 leading-none whitespace-nowrap">
                SEDINCO HR
              </span>
              <h2 className="text-base font-extrabold text-[#111C2D] dark:text-white tracking-tight leading-snug whitespace-nowrap mt-0.5">
                {TAB_TITLES[activeTab] || "Chấm Công"}
              </h2>
            </div>
          </div>

          {/* Right: Theme Toggle + Notification Bell (Clean Stitch 2-Icon Header) */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <ThemeToggleButton compact />

            <button
              type="button"
              data-testid="worker-bell-btn"
              data-bell-button="true"
              onClick={handleOpenBell}
              aria-label={`Thông báo (${unreadCount} chưa đọc)`}
              title="Thông báo & Bảng lương"
              className="relative min-w-[44px] min-h-[44px] p-2 rounded-full bg-[#F0F3FF] hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#111C2D] dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 transition-colors cursor-pointer inline-flex items-center justify-center"
            >
              <Bell className="w-4 h-4 text-[#E11D48] dark:text-rose-400" />
              {unreadCount > 0 && (
                <span
                  data-testid="worker-bell-badge"
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E11D48] text-white text-xs font-extrabold flex items-center justify-center shadow-sm"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT VIEWPORT (Scroll-isolated above in-flow bottom navigation) */}
      <main
        data-scroll-container="worker"
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pb-6"
      >
        <div key={activeTab} className="animate-tab-enter">
          {activeTab === "checkin" && (
            <OneTouchCheckIn
              currentUser={currentUser}
              showToast={showToast}
              onCheckInSuccess={(res) => {
                if (showToast && res?.autoShiftMsg) {
                  showToast(res.autoShiftMsg, "success");
                }
              }}
              onOpenFixCheckoutRequest={(record) => setFixCheckoutInfo(record)}
            />
          )}

          {activeTab === "history" && (
            <div className="p-3.5">
              <WorkerHistoryTab
                currentUser={currentUser}
                showToast={showToast}
                onOpenPayslip={openPayslip}
                onOpenPeriodPayslip={openPayslip}
              />
            </div>
          )}

          {activeTab === "requests" && (
            <div className="p-3.5">
              <WorkerRequestsTab
                currentUser={currentUser}
                showToast={showToast}
              />
            </div>
          )}

          {activeTab === "profile" && (
            <div className="p-3.5">
              <WorkerProfileTab
                currentUser={currentUser}
                showToast={showToast}
                onChangePasswordRequest={onChangePasswordRequest}
                onUserUpdated={onUserUpdated}
                onLogout={onLogout}
                onOpenPayslip={openPayslip}
                onOpenPeriodPayslip={openPayslip}
              />
            </div>
          )}
        </div>
      </main>

      {/* STITCH 4-TAB IN-FLOW BOTTOM NAVIGATION BAR (Screens 2–5) */}
      <nav
        aria-label="Điều hướng chính nhân viên"
        className="shrink-0 z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200/80 dark:border-slate-800 px-2 pt-1.5 shadow-[0_-4px_20px_rgba(17,28,45,0.06)] transition-colors duration-200"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
      >
        <div className="grid grid-cols-4 gap-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-tab={item.id}
                data-active={active ? "true" : "false"}
                onClick={() => setActiveTab(item.id)}
                className={`relative min-h-[52px] flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl border transition-all cursor-pointer ${
                  active
                    ? "text-[#B80035] dark:text-rose-300 bg-[#FFE4E6] dark:bg-rose-950/80 border-[#E11D48]/50 dark:border-rose-500/60 font-extrabold"
                    : "text-slate-600 dark:text-slate-400 hover:text-[#111C2D] dark:hover:text-slate-200 border-transparent font-semibold"
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : "stroke-[2]"}`} />
                <span className="text-xs mt-0.5 leading-tight whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Portal Notification Center (Stitch Screen 14) */}
      <NotificationCenterPanel
        open={isBellOpen}
        onClose={() => setIsBellOpen(false)}
        title="Trung tâm Thông báo"
        subtitle={unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : "Đã xem tất cả"}
        mode="worker"
        notifications={notifications}
        unreadCount={unreadCount}
        readCount={readCount}
        totalCount={totalCount}
        filter={notifFilter}
        onFilterChange={changeNotifFilter}
        hasMore={hasMoreNotifs}
        loading={loadingNotifs}
        loadingMore={loadingMoreNotifs}
        onLoadMore={loadMoreNotifs}
        onMarkAllRead={handleMarkAllRead}
        onMarkSingleRead={markRead}
        onClickItem={handleClickNotification}
      />

      {/* Stacked Payslip & Daily Attendance Modal (Stitch Screen 5) */}
      {payslipModal.open && (
        <SalarySlipModal
          month={payslipModal.month}
          year={payslipModal.year}
          targetMaNv={currentUser?.ma_nv}
          isAdminOrAccountant={false}
          showToast={showToast}
          onClose={() => setPayslipModal((p) => ({ ...p, open: false }))}
        />
      )}

      {/* Modal Bổ Sung Giờ Ra 1 Chạm khi phát hiện quên Check-out */}
      {fixCheckoutInfo && (
        <SmartLeaveRequestModal
          currentUser={currentUser}
          initialDate={fixCheckoutInfo.iso_date || fixCheckoutInfo.work_date || fixCheckoutInfo.short_date}
          initialMode="Bổ sung công / Quên chấm giờ ra"
          initialCorrectionMode="CHECK_OUT"
          initialCheckInTime={fixCheckoutInfo.check_in_time ? String(fixCheckoutInfo.check_in_time).slice(0, 5) : "07:30"}
          initialCheckOutTime="17:30"
          initialReason={`Ngày ${fixCheckoutInfo.short_date} em đã chấm công Vào lúc ${String(fixCheckoutInfo.check_in_time || "").slice(0, 5)} nhưng quên bấm Giờ Ra. Kính mong Admin duyệt bổ sung giờ ra.`}
          onClose={() => setFixCheckoutInfo(null)}
          onRequestSubmitted={() => {
            setFixCheckoutInfo(null);
            if (showToast) showToast("Đã gửi đơn bổ sung giờ ra thành công!", "success");
          }}
        />
      )}
    </div>
  );
}
