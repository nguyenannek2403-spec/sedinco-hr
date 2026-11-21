import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import { useModalStack } from "../../hooks/useLockBodyScroll";
import AppButton from "./AppButton";
import { useTheme } from "../../context/ThemeContext";

/**
 * Hộp thoại chuẩn Design System cho Zalo Mini App & Desktop:
 * - Render qua ReactDOM.createPortal(..., document.body) tách hoàn toàn khỏi DOM nền
 * - Tự khóa cuộn đa tầng (inert + bg-scroll-locked) & cách ly sự kiện wheel/touchmove
 * - Tự động quản lý Z-Index ngăn xếp khi mở Modal lồng nhau (100 -> 110 -> 120)
 * - Tự tính safe-area tránh cụm nút Zalo phía trên & luôn có nút "< Trở về" + "Đóng / Quay lại"
 */
export default function AppModal({
  isOpen = true,
  open,
  onClose,
  title,
  subtitle = "",
  icon = null,
  headerExtra = null,
  subHeader = null,
  stickyTabs = null,
  footer = null,
  closeLabel = "Đóng / Quay lại",
  theme = "auto",
  fullScreenSheet = false,
  nested = false,
  customHeader = null,
  maxWidthClass = "max-w-lg",
  maxHeightClass = "",
  zIndexClass = "",
  closeOnBackdrop = true,
  disableClose = false,
  showCloseX = true,
  children
}) {
  const { isDark: globalDark } = useTheme();
  const visible = open !== undefined ? Boolean(open) : Boolean(isOpen);
  const { zIndex, isTopModal } = useModalStack(visible, nested ? 70 : 60);
  const dialogCardRef = useRef(null);
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
        // ignore focus error
      }
    }
    return undefined;
  }, [visible]);

  useEffect(() => {
    if (!visible || !isTopModal || disableClose || typeof window === "undefined") return undefined;
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && typeof onClose === "function") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, isTopModal, disableClose, onClose]);

  useEffect(() => {
    if (dialogCardRef.current) {
      dialogCardRef.current.inert = Boolean(visible && !isTopModal);
    }
  }, [visible, isTopModal]);

  if (!visible || typeof document === "undefined") return null;

  const isDark = theme === "auto" ? globalDark : theme === "dark";
  const zMatch = String(zIndexClass || "").match(/z-\[(\d+)\]/);
  const minExplicitZ = zMatch ? Number(zMatch[1]) : 0;
  const effectiveZIndex = Math.max(zIndex, minExplicitZ);

  const handleSafeClose = () => {
    if (!disableClose && isTopModal && typeof onClose === "function") {
      onClose();
    }
  };

  return createPortal(
    <div
      data-modal-root="true"
      role="dialog"
      aria-modal="true"
      className={`fixed top-0 left-0 right-0 flex ${
        fullScreenSheet ? "items-stretch sm:items-center" : "items-end sm:items-center"
      } justify-center bg-slate-900/55 backdrop-blur-[3px] transition-opacity duration-200 p-0 sm:p-4 animate-fade-in`}
      style={{
        zIndex: effectiveZIndex,
        height: "var(--visual-vh, 100dvh)",
        paddingTop: fullScreenSheet ? "0px" : "calc(var(--sat, 0px) + 12px)",
        paddingBottom: "0px"
      }}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
          handleSafeClose();
        }
      }}
    >
      <div
        ref={dialogCardRef}
        className={`flex flex-col w-full ${maxWidthClass} ${
          fullScreenSheet
            ? "h-full max-h-full sm:h-auto sm:max-h-[92dvh] rounded-none sm:rounded-[24px]"
            : `${maxHeightClass || ""} rounded-t-[28px] sm:rounded-[24px]`
        } overflow-hidden shadow-2xl animate-sheet-up border ${
          isDark
            ? "bg-slate-900 text-slate-100 border-slate-700/80"
            : "bg-white text-slate-800 border-slate-200/90 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700/80"
        } ${!isTopModal ? "pointer-events-none select-none" : ""}`}
        style={
          !fullScreenSheet && !maxHeightClass
            ? { maxHeight: "calc(var(--visual-vh, 100dvh) - var(--sat, 0px) - 16px)" }
            : undefined
        }
        onClick={(e) => e.stopPropagation()}
      >
        {!fullScreenSheet && (
          <div
            className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mt-2.5 mb-1 shrink-0"
            aria-hidden="true"
          />
        )}

        {/* Thanh tiêu đề cố định: fullScreenSheet áp dụng u-modal-header-safe (1 lần --sat + capsule guard); Sheet thu gọn chỉ chừa capsule ngang để không nhân đôi --sat */}
        {customHeader ? (
          customHeader({ handleSafeClose, isDark })
        ) : (
          <div
            className={`${
              fullScreenSheet
                ? "u-modal-header-safe"
                : "pl-3.5 pr-[calc(var(--zalo-capsule-w)+8px)] sm:pr-4 py-2 min-h-[52px]"
            } border-b flex items-center justify-between gap-2 shrink-0 ${
              isDark
                ? "bg-slate-900 border-slate-800"
                : "bg-white border-slate-100 dark:bg-slate-900 dark:border-slate-800"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <button
                type="button"
                disabled={disableClose}
                onClick={handleSafeClose}
                className={`min-h-[44px] px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap transition-transform duration-150 active:scale-[0.98] disabled:opacity-50 ${
                  isDark
                    ? "bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700"
                    : "bg-rose-50/90 hover:bg-rose-100 text-[#B80035] border border-rose-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-rose-300 dark:border-slate-700"
                }`}
              >
                <ArrowLeft className="w-4 h-4 shrink-0" />
                <span>Trở về</span>
              </button>

              {icon && <div className="shrink-0">{icon}</div>}

              <div className="min-w-0 flex-1">
                <h3
                  className={`font-bold text-sm sm:text-base leading-snug break-words ${
                    isDark ? "text-white" : "text-slate-900 dark:text-white"
                  }`}
                >
                  {title}
                </h3>
                {subtitle && (
                  <p
                    className={`text-xs mt-0.5 leading-snug break-words ${
                      isDark ? "text-slate-300" : "text-slate-500 dark:text-slate-300"
                    }`}
                  >
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {headerExtra}
              {showCloseX && (
                <button
                  type="button"
                  disabled={disableClose}
                  onClick={handleSafeClose}
                  aria-label="Đóng"
                  className={`min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-transform duration-150 active:scale-[0.98] disabled:opacity-50 ${
                    isDark
                      ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200"
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Thanh tab hoặc bộ lọc ghim cố định ngay dưới Header (nếu có) */}
        {stickyTabs}

        {/* Thanh điều khiển phụ cố định dưới tiêu đề (nếu có) */}
        {subHeader && (
          <div
            className={`px-4 py-2 border-b shrink-0 ${
              isDark
                ? "bg-slate-900/95 border-slate-800"
                : "bg-slate-50/90 border-slate-200/80 dark:bg-slate-900/95 dark:border-slate-800"
            }`}
          >
            {subHeader}
          </div>
        )}

        {/* DUY NHẤT 1 vùng cuộn mượt trên iOS/Android Zalo WebView */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y modal-scroll-area">
          {children}
        </div>

        {/* Đáy Modal cố định: 1 lần safe-area-inset-bottom qua .u-footer-safe */}
        <div
          className={`px-4 u-footer-safe border-t shrink-0 ${
            isDark
              ? "bg-slate-900 border-slate-800"
              : "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800"
          }`}
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
    </div>,
    document.body
  );
}
