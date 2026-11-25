import React, { useEffect, useId, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ArrowLeft } from "lucide-react";
import { useModalStack } from "../../hooks/useLockBodyScroll";
import { useTheme } from "../../context/ThemeContext";

/**
 * AppModal — V54 Unified Enterprise Overlay Engine (Dialog / BottomSheet / FullScreenSheet / Drawer)
 *
 * Hỗ trợ đầy đủ cả `open` lẫn `isOpen` (mặc định `isOpen = true` khi render có điều kiện `{cond && <AppModal />}`),
 * `nested`, `customHeader`, `stickyTabs`, `subHeader`, `variant="dialog" | "sheet" | "fullscreen" | "drawer"`,
 * và tự động quản lý ngăn xếp Z-Index qua `useModalStack` khi mở modal lồng nhau (ví dụ: Bảng công tháng -> Sửa công ngày).
 */
export default function AppModal({
  open,
  isOpen = true,
  onClose,
  onBack,
  title,
  subtitle,
  icon,
  maxWidthClass = "max-w-lg",
  maxHeightClass = "",
  align = "bottom", // "bottom" | "center"
  variant, // "dialog" | "sheet" | "fullscreen" | "drawer"
  fullScreenSheet = false,
  nested = false,
  zIndex: propZIndex,
  zIndexClass = "",
  theme = "auto",
  closeOnBackdrop = true,
  disableClose = false,
  hideCloseButton = false,
  showCloseX = true,
  closeLabel = "Đóng / Quay lại",
  headerExtra = null,
  subHeader = null,
  stickyTabs = null,
  customHeader = null,
  footer,
  bodyClassName = "",
  panelClassName = "",
  showDragHandle = false,
  headerSafeStyle,
  footerSafeStyle,
  testId,
  children
}) {
  const titleId = useId();
  const { isDark: globalDark } = useTheme();
  const visible = open !== undefined ? Boolean(open) : Boolean(isOpen);

  const resolvedVariant =
    variant || (fullScreenSheet ? "fullscreen" : align === "center" ? "dialog" : "sheet");
  const isFullScreen = resolvedVariant === "fullscreen" || Boolean(fullScreenSheet);
  const isDrawer = resolvedVariant === "drawer";
  const isDialog = resolvedVariant === "dialog";
  const isBottomSheet = resolvedVariant === "sheet";

  const baseZ = nested ? 80 : 70;
  const { zIndex: stackZIndex, isTopModal } = useModalStack(visible, baseZ);
  const dialogCardRef = useRef(null);

  const zMatch = String(zIndexClass || "").match(/z-\[(\d+)\]/);
  const minExplicitZ = zMatch ? Number(zMatch[1]) : 0;
  const effectiveZIndex = propZIndex || Math.max(stackZIndex, minExplicitZ);
  const isDark = theme === "auto" ? globalDark : theme === "dark";

  const handleSafeClose = useCallback(() => {
    if (!disableClose && isTopModal && typeof onClose === "function") {
      onClose();
    }
  }, [disableClose, isTopModal, onClose]);

  const handleSafeBack = useCallback(() => {
    if (disableClose || !isTopModal) return;
    if (typeof onBack === "function") {
      onBack();
    } else if (typeof onClose === "function") {
      onClose();
    }
  }, [disableClose, isTopModal, onBack, onClose]);

  useEffect(() => {
    if (!visible || !isTopModal || disableClose) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleSafeClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, isTopModal, disableClose, handleSafeClose]);

  useEffect(() => {
    if (dialogCardRef.current) {
      dialogCardRef.current.inert = Boolean(visible && !isTopModal);
    }
  }, [visible, isTopModal]);

  const handleBodyFocusCapture = useCallback((e) => {
    const target = e.target;
    if (
      target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
    ) {
      setTimeout(() => {
        try {
          target.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch {
          // ignore on legacy webviews
        }
      }, 140);
    }
  }, []);

  if (!visible || typeof document === "undefined") return null;

  const hasMultiStepBack = typeof onBack === "function";
  const showHeader = Boolean(
    customHeader || title || subtitle || icon || headerExtra || (!hideCloseButton && onClose)
  );

  // Alignment classes for backdrop
  const backdropAlignClass = isFullScreen
    ? "items-end sm:items-center justify-center p-0 sm:p-4"
    : isDrawer
      ? "items-end sm:items-stretch justify-center sm:justify-end p-0"
      : isDialog || align === "center"
        ? "items-center justify-center p-3 sm:p-4"
        : "items-end sm:items-center justify-center p-0 sm:p-4";

  // Safe top offset for backdrop
  const backdropStyle = {
    zIndex: effectiveZIndex,
    paddingTop: isFullScreen
      ? "0px"
      : "max(calc(var(--safe-area-top, 0px) + var(--overlay-top-gap, 12px)), calc(var(--safe-area-top, 0px) + var(--zalo-capsule-h, 0px) + 8px))"
  };

  // Panel classes & max-height
  const panelShapeClass = isFullScreen
    ? `w-full ${maxWidthClass} h-[var(--visual-vh,100dvh)] max-h-[var(--visual-vh,100dvh)] sm:h-auto sm:max-h-[90dvh] rounded-none sm:rounded-3xl border-0 sm:border`
    : isDrawer
      ? `w-full ${maxWidthClass} sm:h-full max-h-[calc(var(--visual-vh,100dvh)-var(--safe-area-top,0px)-var(--zalo-capsule-h,0px)-12px)] sm:max-h-full rounded-t-3xl sm:rounded-l-3xl sm:rounded-tr-none border-t sm:border-t-0 sm:border-l`
      : isDialog || align === "center"
        ? `w-full ${maxWidthClass} ${maxHeightClass} rounded-2xl sm:rounded-3xl border`
        : `w-full ${maxWidthClass} ${maxHeightClass} rounded-t-3xl sm:rounded-3xl border-t sm:border`;

  const panelStyle =
    isFullScreen || isDrawer || maxHeightClass
      ? undefined
      : {
          maxHeight:
            "calc(var(--visual-vh, 100dvh) - max(calc(var(--safe-area-top, 0px) + var(--overlay-top-gap, 12px)), calc(var(--safe-area-top, 0px) + var(--zalo-capsule-h, 0px) + 8px)) - 12px)"
        };

  return createPortal(
    <div
      data-modal-root="true"
      className={`fixed inset-0 bg-slate-900/65 dark:bg-black/75 backdrop-blur-sm flex ${backdropAlignClass} animate-fade-in`}
      style={backdropStyle}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
          handleSafeClose();
        }
      }}
      role="presentation"
    >
      <div
        ref={dialogCardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        data-testid={testId}
        data-overlay-variant={resolvedVariant}
        onClick={(e) => e.stopPropagation()}
        style={panelStyle}
        className={`bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden transition-all ${panelShapeClass} ${
          !isTopModal ? "pointer-events-none select-none" : ""
        } ${panelClassName}`}
      >
        {/* Thanh kéo (Drag Handle) tinh tế cho Bottom Sheet trên Mobile */}
        {(showDragHandle || isBottomSheet) && !isFullScreen && (
          <div className="sm:hidden flex justify-center pt-2 pb-0.5 shrink-0" aria-hidden="true">
            <span className="w-10 h-1.5 rounded-full bg-slate-300/90 dark:bg-slate-700" />
          </div>
        )}

        {/* Header chuẩn hoá: Hỗ trợ customHeader hoặc Header tiêu chuẩn không trùng lặp nút Đóng */}
        {customHeader ? (
          customHeader({ handleSafeClose, isDark })
        ) : (
          showHeader && (
            <div
              style={isFullScreen ? headerSafeStyle : undefined}
              className={`px-4 py-2.5 sm:px-5 sm:py-3.5 min-h-[var(--overlay-header-height,56px)] border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2.5 bg-slate-50/90 dark:bg-slate-900/95 shrink-0 ${
                isFullScreen
                  ? "pt-[calc(var(--safe-area-top)+8px)] sm:pt-3.5 pr-[max(16px,calc(var(--zalo-capsule-w,0px)+12px))] sm:pr-5"
                  : ""
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {!hideCloseButton && (hasMultiStepBack || (isFullScreen && onClose)) && (
                  <button
                    type="button"
                    onClick={hasMultiStepBack ? handleSafeBack : handleSafeClose}
                    disabled={disableClose}
                    data-testid="modal-back-btn"
                    aria-label={hasMultiStepBack ? "Quay lại bước trước" : "Đóng hộp thoại"}
                    title={hasMultiStepBack ? "Quay lại bước trước" : "Quay lại / Đóng"}
                    className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-xs font-extrabold text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition cursor-pointer shrink-0 disabled:opacity-50 shadow-sm"
                  >
                    <ArrowLeft className="w-4 h-4 shrink-0 text-[#E11D48] dark:text-rose-400" />
                    <span>{hasMultiStepBack ? "Trở về" : "Quay lại"}</span>
                  </button>
                )}

                {icon && <div className="shrink-0 flex items-center justify-center">{icon}</div>}

                <div className="min-w-0 flex-1">
                  {title && (
                    <h3
                      id={titleId}
                      className="font-extrabold text-sm sm:text-base text-[#111C2D] dark:text-white leading-snug break-words line-clamp-2"
                    >
                      {title}
                    </h3>
                  )}
                  {subtitle && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug break-words line-clamp-2">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {headerExtra}

                {!hideCloseButton && showCloseX && onClose && (
                  <button
                    type="button"
                    onClick={handleSafeClose}
                    disabled={disableClose}
                    data-testid="modal-close-btn"
                    aria-label="Đóng hộp thoại"
                    title="Đóng (ESC)"
                    className={`${
                      isFullScreen && !hasMultiStepBack ? "hidden sm:inline-flex" : "inline-flex"
                    } min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:hover:bg-rose-950/60 dark:hover:text-rose-300 items-center justify-center text-slate-600 dark:text-slate-300 transition cursor-pointer shrink-0 disabled:opacity-50`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          )
        )}

        {/* Thanh tab hoặc bộ lọc ghim cố định ngay dưới Header (nếu có) */}
        {stickyTabs}

        {/* Thanh điều khiển phụ cố định dưới tiêu đề (nếu có) */}
        {subHeader && (
          <div className="px-4 py-2 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 shrink-0">
            {subHeader}
          </div>
        )}

        {/* Vùng nội dung cuộn mượt độc lập */}
        <div
          onFocusCapture={handleBodyFocusCapture}
          className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y modal-scroll-area ${
            !showHeader && isFullScreen ? "pt-[calc(var(--safe-area-top)+8px)]" : ""
          } ${
            footer === null
              ? "pb-[max(var(--safe-area-bottom),12px)]"
              : ""
          } ${bodyClassName}`}
        >
          {children}
        </div>

        {/* Footer cố định với Safe Area Bottom */}
        {footer !== undefined && footer !== null ? (
          <div
            style={footerSafeStyle}
            className="px-4 py-3 sm:px-5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 shrink-0 pb-[max(var(--safe-area-bottom),12px)]"
          >
            {footer}
          </div>
        ) : (
          footer !== null &&
          !hideCloseButton &&
          onClose && (
            <div
              style={footerSafeStyle}
              className="px-4 py-2.5 sm:px-5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 shrink-0 pb-[max(var(--safe-area-bottom),12px)] flex justify-end"
            >
              <button
                type="button"
                onClick={handleSafeClose}
                disabled={disableClose}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2 rounded-xl bg-slate-200/80 hover:bg-slate-300/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-extrabold transition cursor-pointer disabled:opacity-50"
              >
                {closeLabel}
              </button>
            </div>
          )
        )}
      </div>
    </div>,
    document.body
  );
}
