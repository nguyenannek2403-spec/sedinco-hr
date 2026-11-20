import React from "react";
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
  AlertTriangle
} from "lucide-react";

const CATEGORY_META = {
  fraud: { Icon: ShieldAlert, iconColor: "text-rose-600 dark:text-rose-400", actionLabel: "Xem & Khóa" },
  device: { Icon: Smartphone, iconColor: "text-indigo-600 dark:text-indigo-300", actionLabel: "Mở 360°" },
  salary_dispute: { Icon: DollarSign, iconColor: "text-amber-600 dark:text-amber-300", actionLabel: "Xem phiếu" },
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

/**
 * Giao diện Trung tâm Thông báo dùng chung cho Worker, Accountant và Admin:
 * - Tab lọc: Tất cả / Chưa đọc (N) / Đã đọc
 * - Nút "Đánh dấu tất cả đã đọc" & nút phụ "Đánh dấu đã đọc" trên từng dòng chưa đọc
 * - Phân biệt thị giác rõ ràng Chưa đọc vs Đã đọc cả Sáng & Tối cho mọi độ tuổi
 */
export default function NotificationCenterPanel({
  mode = "desktop", // 'worker' | 'desktop'
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

  return (
    <div className="space-y-3">
      {/* Thanh thao tác đầu: Bộ lọc 3 trạng thái + Nút Đánh dấu tất cả đã đọc */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          data-filter-group="notification-filter"
          className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700"
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
                onClick={() => onFilterChange && onFilterChange(tab.key)}
                className={`min-h-[44px] px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
                  active
                    ? "bg-[#0068FF] text-white dark:bg-blue-600 shadow-xs"
                    : "text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
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
            onClick={onMarkAllRead}
            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/70 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <CheckCheck size={14} className="shrink-0" />
            <span>Đánh dấu tất cả đã đọc</span>
          </button>
        )}
      </div>

      {/* Danh sách thông báo */}
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
              : "Cảnh báo an ninh, thiết bị, khiếu nại lương, đơn từ và xác nhận chốt kỳ công sẽ lưu lại tại đây."}
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
                className={`perf-list-item rounded-2xl border overflow-hidden transition-colors ${
                  isUnread
                    ? "bg-blue-50/70 dark:bg-blue-950/40 border-blue-300 dark:border-blue-600/60 shadow-xs"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                }`}
              >
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
                            ? "font-bold text-slate-900 dark:text-white"
                            : "font-medium text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {notif.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isUnread ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-xs font-bold whitespace-nowrap"
                          aria-label="Chưa đọc"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                          <span>Chưa đọc</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 text-xs font-semibold whitespace-nowrap">
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
                    <span className="font-bold text-[#0068FF] dark:text-blue-300">
                      {meta.actionLabel} →
                    </span>
                  </div>
                </button>

                {/* Hàng trạng thái đọc / nút phụ đánh dấu đã đọc */}
                {(isUnread && typeof onMarkSingleRead === "function") || (!isUnread && notif.read_at) ? (
                  <div className="px-3.5 py-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 bg-white/60 dark:bg-slate-950/40">
                    {!isUnread && notif.read_at ? (
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        ✓ Đã đọc lúc {formatTimeVi(notif.read_at)}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                        Thông báo mới chưa xem
                      </span>
                    )}

                    {isUnread && typeof onMarkSingleRead === "function" && (
                      <button
                        type="button"
                        data-testid={`notif-mark-read-${notif.id}`}
                        onClick={() => onMarkSingleRead(notif)}
                        className="min-h-[44px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                      >
                        <Check size={13} />
                        <span>Đánh dấu đã đọc</span>
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}

          {hasMore && typeof onLoadMore === "function" && (
            <button
              type="button"
              data-testid="notif-load-more-btn"
              disabled={loadingMore}
              onClick={onLoadMore}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 text-xs font-bold cursor-pointer transition-colors disabled:opacity-50"
            >
              {loadingMore ? "Đang tải thêm..." : "Xem thêm thông báo cũ"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
