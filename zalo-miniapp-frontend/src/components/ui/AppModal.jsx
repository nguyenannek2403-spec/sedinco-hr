import React from "react";
import { ArrowLeft, X } from "lucide-react";
import useLockBodyScroll from "../../hooks/useLockBodyScroll";
import AppButton from "./AppButton";

/**
 * Hộp thoại chuẩn Design System cho Zalo Mini App & Desktop:
 * - Tự khóa cuộn nền & chặn vuốt xuyênbackdrop
 * - Tự tính safe-area tránh cụm nút Zalo phía trên
 * - Luôn có nút "< Trở về" ở góc trên trái & nút "Đóng / Quay lại" ở đáy Modal
 * - Thân cuộn mượt 60fps trên iOS/Android
 */
export default function AppModal({
  isOpen = true,
  open,
  onClose,
  title,
  subtitle = "",
  icon = null,
  headerExtra = null,
  footer = null,
  closeLabel = "Đóng / Quay lại",
  theme = "light",
  maxWidthClass = "max-w-lg",
  maxHeightClass = "max-h-[90vh]",
  zIndexClass = "z-50",
  closeOnBackdrop = true,
  disableClose = false,
  showCloseX = true,
  children
}) {
  const visible = open !== undefined ? Boolean(open) : Boolean(isOpen);
  useLockBodyScroll(visible);

  if (!visible) return null;

  const isDark = theme === "dark";

  const handleSafeClose = () => {
    if (!disableClose && typeof onClose === "function") {
      onClose();
    }
  };

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4 animate-fade-in`}
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)"
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
          handleSafeClose();
        }
      }}
    >
      <div
        className={`flex flex-col w-full ${maxWidthClass} ${maxHeightClass} rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl animate-sheet-up border ${
          isDark
            ? "bg-slate-900 text-slate-100 border-slate-700/80"
            : "bg-white text-slate-800 border-slate-200"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Thanh tiêu đề: luôn có "< Trở về" ở góc trên trái */}
        <div
          className={`px-4 py-3.5 border-b flex flex-wrap items-center justify-between gap-2.5 shrink-0 ${
            isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              type="button"
              disabled={disableClose}
              onClick={handleSafeClose}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition-transform duration-150 active:scale-[0.98] disabled:opacity-50 ${
                isDark
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-100"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-800"
              }`}
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>Trở về</span>
            </button>

            {icon && <div className="shrink-0">{icon}</div>}

            <div className="min-w-0 flex-1">
              <h3
                className={`font-bold text-sm sm:text-base leading-snug break-words ${
                  isDark ? "text-white" : "text-slate-900"
                }`}
              >
                {title}
              </h3>
              {subtitle && (
                <p
                  className={`text-xs mt-0.5 leading-snug break-words ${
                    isDark ? "text-slate-300" : "text-slate-500"
                  }`}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {headerExtra}
            {showCloseX && (
              <button
                type="button"
                disabled={disableClose}
                onClick={handleSafeClose}
                aria-label="Đóng"
                className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-transform duration-150 active:scale-[0.98] disabled:opacity-50 ${
                  isDark
                    ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Nội dung Modal cuộn mượt, chặn trôi nền */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y modal-scroll-area">
          {children}
        </div>

        {/* Đáy Modal cố định: luôn có nút Đóng / Quay lại tối thiểu 46px */}
        <div
          className={`px-4 py-3 border-t shrink-0 ${
            isDark
              ? "bg-slate-900 border-slate-800"
              : "bg-white border-slate-200"
          }`}
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          {footer ? (
            footer
          ) : (
            <AppButton
              variant="secondary"
              tone={isDark ? "dark" : "light"}
              fullWidth
              disabled={disableClose}
              onClick={handleSafeClose}
            >
              {closeLabel}
            </AppButton>
          )}
        </div>
      </div>
    </div>
  );
}

