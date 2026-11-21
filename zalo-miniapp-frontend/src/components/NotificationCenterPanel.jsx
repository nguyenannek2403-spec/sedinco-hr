import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  CheckCheck,
  Check,
  ChevronRight,
  ShieldAlert,
  Smartphone,
  DollarSign,
  FileText,
  CheckCircle2,
  AlertTriangle,
  X
} from "lucide-react";
import { useModalStack } from "../hooks/useLockBodyScroll";
import { useTheme } from "../context/ThemeContext";

const CATEGORY_META = {
  fraud: { Icon: ShieldAlert, iconColor: "text-rose-600 dark:text-rose-400", actionLabel: "Xem & Khóa" },
  device: { Icon: Smartphone, iconColor: "text-indigo-600 dark:text-indigo-300", actionLabel: "Mở 360°" },
  salary_dispute: { Icon: DollarSign, iconColor: "text-amber-600 dark:text-amber-300", actionLabel: "Xem phiếu" },
  salary_report: { Icon: FileText, iconColor: "text-[#E11D48] dark:text-rose-400", actionLabel: "Xem & Xác nhận" },
  salary_confirm: { Icon: CheckCircle2, iconColor: "text-emerald-600 dark:text-emerald-400", actionLabel: "Xem bảng lương" },
  salary_paid: { Icon: DollarSign, iconColor: "text-emerald-600 dark:text-emerald-400", actionLabel: "Xem phiếu lương" },
  pending_request: { Icon: FileText, iconColor: "text-blue-600 dark:text-blue-300", actionLabel: "Duyệt đơn" },
  period_locked: { Icon: CheckCircle2, iconColor: "text-emerald-600 dark:text-emerald-400", actionLabel: "Xem phiếu lương" }
};

function formatTimeVi(val) {
  if (!val) return "";
  try {
    return new Date(val).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  } catch {
    return String(val);
  }
}

export default function NotificationCenterPanel({
  open = true,
  onClose = null,
  title = "Trung tâm Thông báo",
  subtitle = "",
  mode = "desktop",
  notifications = [],
  unreadCount = 0,
  readCount = 0,
  totalCount = 0,
  filter = "all",
  onFilterChange,
  hasMore = false,
  loading = false,
  loadingMore = false,
  onLoadMore,
  onMarkAllRead,
  onMarkSingleRead,
  onClickItem
}) {
  const isWorker = mode === "worker";
  const { isDark } = useTheme();
  const visible = Boolean(open);
  const { zIndex, isTopModal } = useModalStack(visible, 125);
  const cardRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (visible) {
      previousFocusRef.current = typeof document !== "undefined" ? document.activeElement : null;
      return undefined;
    }
    const prevEl = previousFocusRef.current;
    previousFocusRef.current = null;
    if (prevEl && prevEl.isConnected && typeof prevEl.focus === "function") {
      try {
        prevEl.focus({ preventScroll: true });
      } catch {
        // ignore focus errors
      }
    }
    return undefined;
  }, [visible]);

  useEffect(() => {
    if (!visible || !isTopModal || typeof window === "undefined") return undefined;
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && typeof onClose === "function") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, isTopModal, onClose]);

  useEffect(() => {
    if (cardRef.current) {
      cardRef.current.inert = Boolean(visible && !isTopModal);
    }
  }, [visible, isTopModal]);

  if (!visible || typeof document === "undefined") return null;

  const effectiveZ = Math.max(zIndex, 125);
  const resolvedSubtitle =
    subtitle ||
    (unreadCount > 0
      ? `${unreadCount} thông báo chưa đọc`
      : "Đã xem tất cả thông báo");

  const handleClose = () => {
    if (isTopModal && typeof onClose === "function") {
      onClose();
    }
  };

  return createPortal(
    <div
      data-modal-root="true"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} (${unreadCount} chưa đọc)`}
      className={`fixed inset-0 ${isDark ? "dark" : ""}`}
      style={{ zIndex: effectiveZ }}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => {
        if (!e.target?.closest?.(".modal-scroll-area")) {
          e.preventDefault();
        }
        e.stopPropagation();
      }}
    >
      <div
        className="fixed inset-0 bg-slate-950/45 dark:bg-slate-950/65 transition-opacity"
        aria-hidden="true"
        onClick={handleClose}
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
        ref={cardRef}
        data-testid="notification-popover"
        onClick={(e) => e.stopPropagation()}
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)"
        }}
        className={`fixed left-3 right-3 bottom-3 sm:bottom-auto sm:top-[calc(env(safe-area-inset-top,0px)+58px)] sm:left-auto sm:right-4 sm:w-[420px] max-h-[82vh] sm:max-h-[75vh] z-10 flex flex-col rounded-[28px] sm:rounded-2xl shadow-2xl border bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-700 overflow-hidden animate-sheet-up sm:animate-fade-in ${
          !isTopModal ? "pointer-events-none select-none" : ""
        }`}
      >
        <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mt-1.5 mb-1 shrink-0 sm:hidden" aria-hidden="true" />

        <div className="pl-3.5 pr-[104px] sm:pr-4 py-2 min-h-[52px] border-b border-slate-200/80 dark:border-slate-800 bg-[#F4F6F9] dark:bg-slate-800/90 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {typeof onClose === "function" && (
              <button
                type="button"
                onClick={handleClose}
                aria-label="Đóng"
                className="min-w-[44px] min-h-[44px] p-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/80 dark:hover:bg-slate-700 text-slate-600 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            )}
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-[#111C2D] dark:text-white leading-tight truncate">
                {title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug truncate">
                {resolvedSubtitle}
              </p>
            </div>
          </div>
        </div>

        <div
          data-testid={isWorker ? "worker-notification-modal" : undefined}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y modal-scroll-area p-3.5 bg-[#F4F6F9] dark:bg-slate-900 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              data-filter-group="notification-filter"
              className="inline-flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700"
            >
              {[
                { key: "all", label: `Tất cả${totalCount > 0 ? ` (${totalCount})` : ""}` },
                { key: "unread", label: `Chưa đọc (${unreadCount})` },
                { key: "read", label: `Đã đọc${readCount > 0 ? ` (${readCount})` : ""}` }
              ].map((tab) => {
                const active = filter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    data-testid={`notif-tab-${tab.key}`}
                    data-active={active ? "true" : "false"}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onFilterChange) onFilterChange(tab.key);
                    }}
                    className={`min-h-[44px] px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
                      active
                        ? "bg-[#E11D48] text-white dark:bg-rose-600 shadow-xs"
                        : "text-slate-700 hover:text-[#111C2D] dark:text-slate-300 dark:hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {unreadCount > 0 && typeof onMarkAllRead === "function" && (
              <button
                type="button"
                data-testid="notif-mark-all-read-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMarkAllRead();
                }}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/70 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <CheckCheck size={14} className="shrink-0" />
                <span>Đánh dấu tất cả đã đọc</span>
              </button>
            )}
          </div>

          {loading && notifications.length === 0 ? (
            <div className="py-8 text-center text-xs font-medium text-slate-600 dark:text-slate-300">
              Đang tải thông báo...
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-1.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70">
              <Bell className="w-8 h-8 text-slate-400 dark:text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {filter === "unread"
                  ? "Không còn thông báo chưa đọc"
                  : filter === "read"
                  ? "Chưa có thông báo đã đọc"
                  : "Chưa có thông báo nào"}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {isWorker
                  ? "Khi Quản trị viên chốt kỳ công hoặc có phiếu lương mới, thông báo sẽ hiển thị đầy đủ tại đây."
                  : "Cảnh báo thiết bị, khiếu nại lương, đơn từ và xác nhận chốt kỳ công sẽ lưu lại tại đây."}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {notifications.map((notif) => {
                const isUnread = Number(notif.is_read || 0) === 0;
                const cat = notif.category || (notif.type === "PERIOD_LOCKED_PAYROLL" ? "period_locked" : "general");
                const meta = CATEGORY_META[cat] || {
                  Icon: AlertTriangle,
                  iconColor: "text-amber-600 dark:text-amber-300",
                  actionLabel: "Xem chi tiết"
                };
                const IconComp = meta.Icon;

                return (
                  <div
                    key={notif.id}
                    data-notif-unread={isUnread ? "true" : "false"}
                    className={`perf-list-item relative rounded-2xl border overflow-hidden transition-colors flex ${
                      isUnread
                        ? "bg-white dark:bg-slate-800/90 border-rose-300 dark:border-rose-500/60 shadow-sm"
                        : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-700"
                    }`}
                  >
                    <div
                      aria-hidden="true"
                      className={`w-1.5 shrink-0 ${
                        isUnread ? "bg-[#E11D48] dark:bg-rose-500" : "bg-[#16A34A]/60 dark:bg-emerald-600/60"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      data-testid={isWorker ? `worker-notif-item-${notif.id}` : `desktop-notif-item-${notif.id}`}
                      data-alert-item={String(notif.id)}
                      data-alert-category={cat}
                      onClick={() => onClickItem && onClickItem(notif)}
                      className="w-full min-h-[52px] text-left p-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <IconComp size={16} className={`${meta.iconColor} shrink-0 mt-0.5`} />
                          <span
                            className={`text-xs sm:text-sm leading-snug break-words ${
                              isUnread
                                ? "font-bold text-[#111C2D] dark:text-white"
                                : "font-medium text-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {notif.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isUnread ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E11D48] text-white text-xs font-bold whitespace-nowrap"
                              aria-label="Chưa đọc"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-white" />
                              <span>Chưa đọc</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-[#16A34A] dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 text-xs font-semibold whitespace-nowrap">
                              <Check size={12} />
                              <span>Đã đọc</span>
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                        </div>
                      </div>

                      {notif.message && (
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed pl-6 break-words">
                          {notif.message}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pl-6 pt-0.5 text-xs text-slate-600 dark:text-slate-300">
                        <span>{formatTimeVi(notif.created_at)}</span>
                        <span className="font-bold text-[#E11D48] dark:text-rose-300">
                          {meta.actionLabel} →
                        </span>
                      </div>
                    </button>

                    {(isUnread && typeof onMarkSingleRead === "function") || (!isUnread && notif.read_at) ? (
                      <div className="px-3.5 py-2 border-t border-dashed border-slate-200/90 dark:border-slate-800 flex items-center justify-between gap-2 bg-[#F0F3FF]/45 dark:bg-slate-950/40">
                        {!isUnread && notif.read_at ? (
                          <span className="text-xs text-slate-600 dark:text-slate-300">
                            ✓ Đã đọc lúc {formatTimeVi(notif.read_at)}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-[#B80035] dark:text-rose-300">
                            Thông báo mới chưa xem
                          </span>
                        )}

                        {isUnread && typeof onMarkSingleRead === "function" && (
                          <button
                            type="button"
                            data-testid={`notif-mark-read-${notif.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onMarkSingleRead(notif);
                            }}
                            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#111C2D] dark:text-slate-100 border border-slate-300 dark:border-slate-600 text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                          >
                            <Check size={13} />
                            <span>Đánh dấu đã đọc</span>
                          </button>
                        )}
                      </div>
                    ) : null}
                    </div>
                  </div>
                );
              })}

              {hasMore && typeof onLoadMore === "function" && (
                <button
                  type="button"
                  data-testid="notif-load-more-btn"
                  disabled={loadingMore}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLoadMore();
                  }}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 text-xs font-bold cursor-pointer transition-colors disabled:opacity-50"
                >
                  {loadingMore ? "Đang tải thêm..." : "Xem thêm thông báo cũ"}
                </button>
              )}
            </div>
          )}
        </div>

        {typeof onClose === "function" && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="w-full min-h-[44px] py-2 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 text-xs font-bold cursor-pointer transition-colors"
            >
              Đóng / Quay lại
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
