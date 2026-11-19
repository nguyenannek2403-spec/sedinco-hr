import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Calendar,
  FileText,
  User,
  LogOut,
  ArrowLeft,
  Bell,
  CheckCheck,
  ChevronRight
} from "lucide-react";
import OneTouchCheckIn from "../../components/OneTouchCheckIn";
import WorkerHistoryTab from "./WorkerHistoryTab";
import WorkerRequestsTab from "./WorkerRequestsTab";
import WorkerProfileTab from "./WorkerProfileTab";
import SmartLeaveRequestModal from "../../components/SmartLeaveRequestModal";
import SalarySlipModal from "../../components/SalarySlipModal";
import { ThemeToggleButton } from "../../context/ThemeContext";
import { safeGet, safePut } from "../../utils/api";
import { AppButton, AppModal } from "../../components/ui";

export default function WorkerDashboard({
  currentUser,
  onLogout,
  showToast,
  onChangePasswordRequest
}) {
  const [activeTab, setActiveTab] = useState("checkin"); // 'checkin', 'history', 'requests', 'profile'
  const [fixCheckoutInfo, setFixCheckoutInfo] = useState(null);

  // Thông báo chốt kỳ công & deep-link mở thẳng Phiếu lương + Bảng công chi tiết
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [isBellOpen, setIsBellOpen] = useState(false);

  // Một modal Phiếu lương & Bảng công chi tiết duy nhất dùng chung cho Chuông, Hồ sơ & Lịch sử
  const [payslipModal, setPayslipModal] = useState({
    open: false,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  const fetchNotifications = useCallback(async () => {
    setLoadingNotifs(true);
    try {
      const res = await safeGet("/notifications/my", { limit: 30 }, { cancelPrevious: false });
      if (res?.success && res.data) {
        setNotifications(Array.isArray(res.data.notifications) ? res.data.notifications : []);
        setUnreadCount(Number(res.data.unread_count) || 0);
      }
    } catch {
      // Giữ trạng thái an toàn nếu mạng yếu
    } finally {
      setLoadingNotifs(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleOpenBell = () => {
    setIsBellOpen(true);
    fetchNotifications();
  };

  const handleClickNotification = async (notif) => {
    if (!notif) return;
    if (!notif.is_read) {
      setNotifications((prev) =>
        prev.map((item) => (item.id === notif.id ? { ...item, is_read: 1 } : item))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        const res = await safePut(`/notifications/${notif.id}/read`, {});
        if (res?.success && res.data) {
          setUnreadCount(Number(res.data.unread_count) || 0);
        }
      } catch {
        // Không chặn người dùng mở phiếu lương nếu mạng chậm
      }
    }

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
      await safePut("/notifications/read-all", {});
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: 1 })));
      setUnreadCount(0);
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
        className={`shrink-0 z-40 w-full bg-[#0055D4] bg-gradient-to-r from-[#0055D4] via-[#0068FF] to-[#0284C7] dark:bg-slate-900 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 text-white px-3.5 pb-2.5 flex flex-col gap-1.5 transition-colors duration-200 ${
          activeTab !== "checkin" ? "rounded-b-[24px] shadow-md" : ""
        }`}
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        {/* Hàng 1: Định danh nhân sự / Quay lại + vùng chừa capsule Zalo */}
        <div className="flex items-center gap-2.5 pr-[96px] sm:pr-0 min-h-[44px]">
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

          <div className="flex-1 min-w-0 text-left">
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
        <div className="flex items-center justify-between gap-2">
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
        footer={
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <AppButton
                variant="secondary"
                icon={CheckCheck}
                onClick={handleMarkAllRead}
                className="flex-1 text-xs"
              >
                Đọc tất cả
              </AppButton>
            )}
            <AppButton
              variant="primary"
              onClick={() => setIsBellOpen(false)}
              className="flex-1"
            >
              Đóng / Quay lại
            </AppButton>
          </div>
        }
      >
        <div data-testid="worker-notification-modal" className="p-4 space-y-2.5">
          {loadingNotifs && notifications.length === 0 ? (
            <p className="text-xs text-center text-slate-600 dark:text-slate-300 py-6">
              Đang tải thông báo...
            </p>
          ) : notifications.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-1.5">
              <Bell className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Chưa có thông báo mới</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Khi Kế toán chốt kỳ công hoặc có phiếu lương mới, thông báo sẽ hiện ngay tại đây.
              </p>
            </div>
          ) : (
            notifications.map((notif) => {
              const isUnread = !notif.is_read;
              return (
                <button
                  key={notif.id}
                  type="button"
                  data-testid={`worker-notif-item-${notif.id}`}
                  onClick={() => handleClickNotification(notif)}
                  className={`perf-list-item w-full text-left p-3.5 rounded-2xl border transition cursor-pointer space-y-1.5 ${
                    isUnread
                      ? "bg-blue-50/90 hover:bg-blue-100/80 dark:bg-blue-950/60 dark:hover:bg-blue-900/70 border-blue-300 dark:border-blue-500/50"
                      : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/70 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-snug">
                      {notif.title}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isUnread && (
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-600 shrink-0" aria-label="Chưa đọc" />
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                    {notif.message}
                  </p>
                  {notif.created_at && (
                    <div className="text-xs text-slate-500 dark:text-slate-300 font-medium">
                      {new Date(notif.created_at).toLocaleString("vi-VN")}
                    </div>
                  )}
                </button>
              );
            })
          )}
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
