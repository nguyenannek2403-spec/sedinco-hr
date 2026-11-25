import React, { useEffect, useRef } from "react";

/**
 * Popover — Hộp nổi neo theo nút bấm, tự động giới hạn chiều rộng trong khung nhìn 320px
 */
export default function Popover({
  open,
  onClose,
  trigger,
  align = "left", // "left" | "right" | "center"
  className = "",
  children
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  const alignClass =
    align === "right"
      ? "right-0"
      : align === "center"
        ? "left-1/2 -translate-x-1/2"
        : "left-0";

  return (
    <div ref={containerRef} className="relative inline-block">
      {trigger}
      {open && (
        <div
          role="dialog"
          className={`absolute ${alignClass} top-full mt-2 z-50 w-72 max-w-[calc(100vw-24px)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3.5 animate-fade-in ${className}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
