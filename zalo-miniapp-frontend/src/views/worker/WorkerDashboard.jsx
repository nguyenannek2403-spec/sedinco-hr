import React, { useState, useCallback } from "react";
import {
  Clock,
  Calendar,
  FileText,
  User,
  LogOut,
  ArrowLeft,
  Bell
} from "lucide-react";
import OneTouchCheckIn from "../../components/OneTouchCheckIn";
import WorkerHistoryTab from "./WorkerHistoryTab";
import WorkerRequestsTab from "./WorkerRequestsTab";
import WorkerProfileTab from "./WorkerProfileTab";
import SmartLeaveRequestModal from "../../components/SmartLeaveRequestModal";
import SalarySlipModal from "../../components/SalarySlipModal";
import { ThemeToggleButton } from "../../context/ThemeContext";
import { useNotifications } from "../../modules/notifications/useNotifications";
import NotificationCenterPanel from "../../modules/notifications/NotificationCenterPanel";
import { AppModal } from "../../components/ui";
import { useFontScale } from "../../modules/accessibility/FontScaleContext";

export default function WorkerDashboard({
  currentUser,
  onLogout,
  showToast,
  onChangePasswordRequest
}) {
  const { fontScale } = useFontScale();
  const isLargeFont = fontScale >= 150;
  const [activeTab, setActiveTab] = useState("checkin"); // 'checkin', 'history', 'requests', 'profile'
  const [fixCheckoutInfo, setFixCheckoutInfo] = useState(null);

  // Thông báo chốt kỳ công & lịch sử đã đọc/chưa đọc
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

  // Một modal Phiếu lương & Bảng công chi tiết duy nhất dùng chung cho Chuông, Hồ sơ & Lịch sử
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
    if (notif.ref_month && notif.ref_year) {
      setPayslipModal({
        open: true,
        month: Number(notif.ref_month),
        year: Number(notif.ref_year)
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

  const initials = String(currentUser?.ho_ten || "NV")
    .trim()
    .split(/\s+/)
    .slice(-1)[0]?.[0]
    ?.toUpperCase() || "N";

  return (
    <div
      className="w-full h-[100dvh] bg-[#F4F6F9] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col max-w-md mx-auto shadow-2xl relative overflow-hidden transition-colors duration-200"
    >
      {/* Top ZaUI Doctor Gradient Header — Chừa vùng an toàn pr-[96px] cho cụm nút Zalo */}
      <header
        className={`shrink-0 z-40 w-full bg-[#0055D4] bg-gradient-to-r from-[#0055D4] via-[#0068FF] to-[#0284C7] dark:bg-slate-900 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 text-white pb-2.5 flex flex-col gap-1.5 transition-colors duration-200 ${
          activeTab !== "checkin" ? "rounded-b-[24px] shadow-md" : ""
        }`}
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
          paddingLeft: "14px",
          paddingRight: "14px"
        }}
      >
        {/* Hàng 1: Định danh nhân sự / Quay lại + vùng chừa capsule Zalo */}
        <div
          className={`flex ${
            isLargeFont
              ? "flex-col items-start gap-2"
              : "items-center gap-2.5 pr-[96px] sm:pr-0 min-h-[44px]"
          }`}
        >
          <div className={isLargeFont ? "w-full pr-[96px] sm:pr-0 flex items-center min-h-[44px]" : "shrink-0"}>
            {activeTab !== "checkin" ? (
              <button
                type="button"
                onClick={() => setActiveTab("checkin")}
                aria-label="Trở về"
                className="min-w-[44px] min-h-[44px] px-2.5 py-2 rounded-full bg-blue-900/45 hover:bg-blue-900/65 dark:bg-slate-800/90 text-white border border-white/25 flex items-center justify-center gap-1 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 shrink-0" />
                <span>Trở về</span>
              </button>
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/95 dark:bg-slate-800 border-2 border-white/50 dark:border-slate-700 flex items-center justify-center shadow-sm shrink-0 text-sm font-extrabold text-[#0068FF] dark:text-blue-300">
                {initials}
              </div>
            )}
          </div>

          <div className={`${isLargeFont ? "w-full" : "flex-1"} min-w-0 text-left`}>
            <div className="text-sm font-extrabold text-white leading-tight break-words">
              {activeTab === "checkin"
                ? `Xin chào, ${currentUser?.ho_ten || "Nhân viên"}`
                : activeTab === "history"
                  ? "Lịch sử Chấm công"
                  : activeTab === "requests"
                    ? "Đơn từ & Phép năm"
                    : "Tài khoản Cá nhân"}
            </div>
            <div className="text-xs text-blue-100 dark:text-blue-300 font-semibold leading-snug break-words mt-0.5">
              {currentUser?.login_username || currentUser?.ma_nv || "NV"} •{" "}
              {currentUser?.role === "admin"
                ? "Quản trị"
                : currentUser?.role === "accountant"
                  ? "Kế toán"
                  : currentUser?.department || "Nhân sự"}
            </div>
          </div>
        </div>

        {/* Hàng 2: Trạng thái + Chuông thông báo + Sáng/Tối + Thoát */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-900/45 dark:bg-slate-800/90 border border-white/20 text-xs font-semibold text-white">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span>Trực tuyến</span>
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="worker-bell-btn"
              onClick={handleOpenBell}
              aria-label="Thông báo chốt công và bảng lương"
              title="Thông báo chốt kỳ công & bảng lương"
              className="relative min-w-[44px] min-h-[44px] px-2.5 py-2 bg-blue-900/45 hover:bg-blue-900/65 dark:bg-slate-800/90 dark:hover:bg-slate-700 border border-white/25 dark:border-slate-700 text-white rounded-full transition-colors flex items-center justify-center gap-1 text-xs font-bold shrink-0 cursor-pointer"
            >
              <Bell className={`w-4 h-4 shrink-0 ${unreadCount > 0 ? "text-amber-300" : "text-white"}`} />
              {unreadCount > 0 && (
                <span
                  data-testid="worker-bell-badge"
                  className="px-1.5 py-0.5 text-xs leading-none rounded-full bg-rose-600 text-white font-black"
                >
                  {unreadCount}
                </span>
              )}
            </button>

            <ThemeToggleButton compact />

            <button
              type="button"
              onClick={onLogout}
              title="Đăng xuất"
              aria-label="Đăng xuất"
              className="min-w-[44px] min-h-[44px] px-3 py-2 bg-blue-900/45 hover:bg-rose-600/85 dark:bg-slate-800/90 dark:hover:bg-rose-600/80 border border-white/25 dark:border-slate-700 text-white rounded-full transition-colors flex items-center justify-center gap-1 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Thoát</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main data-scroll-container="worker" className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div key={activeTab} className="animate-tab-enter pb-6">
          {activeTab === "checkin" && (
            <OneTouchCheckIn
              currentUser={currentUser}
              showToast={showToast}
              onOpenFixCheckoutRequest={(info) => setFixCheckoutInfo(info)}
              onCheckInSuccess={() => {
                if (showToast) showToast("Điểm danh thành công!", "success");
              }}
            />
          )}

          {activeTab === "history" && (
            <WorkerHistoryTab
              currentUser={currentUser}
              showToast={showToast}
              onOpenPayslip={openPayslip}
            />
          )}

          {activeTab === "requests" && (
            <WorkerRequestsTab currentUser={currentUser} showToast={showToast} />
          )}

          {activeTab === "profile" && (
            <WorkerProfileTab
              currentUser={currentUser}
              onLogout={onLogout}
              showToast={showToast}
              onChangePasswordRequest={onChangePasswordRequest}
              onOpenPayslip={openPayslip}
            />
          )}
        </div>
      </main>

      {/* ZaUI Bottom Navigation Bar */}
      <nav
        className="shrink-0 z-40 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-100 dark:border-slate-800/90 px-1.5 pt-1.5 flex items-center justify-around gap-0.5 shadow-[0_-6px_24px_-6px_rgba(15,23,42,0.08)] dark:shadow-2xl transition-colors duration-200"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
      >
        {[
          { key: "checkin", label: "Chấm công", Icon: Clock },
          { key: "history", label: "Lịch sử", Icon: Calendar },
          { key: "requests", label: "Đơn từ", Icon: FileText },
          { key: "profile", label: "👤 Tài khoản", Icon: User }
        ].map(({ key, label, Icon }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 min-h-[48px] py-1.5 px-1.5 rounded-2xl transition-all cursor-pointer ${
                active
                  ? "text-[#0068FF] dark:text-blue-400 font-bold bg-blue-50/90 dark:bg-blue-500/15"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="w-5 h-1 rounded-full bg-[#0068FF] dark:bg-blue-400 mb-0.5"
                />
              )}
              <Icon className={`w-5 h-5 ${active ? "scale-105" : ""}`} />
              <span className="text-xs leading-tight whitespace-nowrap">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Modal Chuông Thông Báo Nhân Viên */}
      <AppModal
        open={isBellOpen}
        onClose={() => setIsBellOpen(false)}
        title="Thông báo của bạn"
        subtitle={unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : "Đã xem tất cả"}
        icon={<Bell className="w-5 h-5 text-[#0068FF] dark:text-blue-400 shrink-0" />}
        maxWidthClass="max-w-md"
      >
        <div data-testid="worker-notification-modal" className="p-4">
          <NotificationCenterPanel
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
        </div>
      </AppModal>

      {/* Modal Phiếu Lương & Bảng Công Chi Tiết Thống Nhất */}
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
          initialDate={fixCheckoutInfo.iso_date}
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
