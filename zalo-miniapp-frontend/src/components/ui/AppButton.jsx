import React, { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

const VARIANT_CLASSES = {
  primary:
    "bg-[#0068FF] bg-gradient-to-r from-[#0068FF] to-[#0091FF] hover:from-[#0058D6] hover:to-[#007EE5] dark:from-blue-600 dark:to-sky-600 dark:hover:from-blue-500 dark:hover:to-sky-500 text-white border border-blue-600/80 dark:border-blue-400/70 shadow-[0_6px_16px_-3px_rgba(0,104,255,0.35)]",
  secondary:
    "bg-blue-50/95 hover:bg-blue-100/90 text-[#0068FF] border border-blue-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-blue-300 dark:border-blue-700/70 shadow-xs",
  "secondary-dark":
    "bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-700/70 shadow-xs",
  success:
    "bg-emerald-600 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 dark:from-emerald-600 dark:to-teal-600 text-white border border-emerald-700/80 dark:border-emerald-400/70 shadow-sm",
  danger:
    "bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500 text-white border border-rose-700/80 dark:border-rose-400/70 shadow-sm",
  warning:
    "bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-400 text-slate-950 border border-amber-600 dark:border-amber-400 shadow-sm",
  purple:
    "bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white border border-indigo-700/80 dark:border-indigo-400/70 shadow-sm",
  ghost:
    "bg-slate-50/90 hover:bg-slate-100 text-slate-700 border border-slate-200/90 dark:bg-slate-800/90 dark:hover:bg-slate-700 dark:text-slate-100 dark:border-slate-700",
  "ghost-dark":
    "bg-slate-800/90 hover:bg-slate-700 text-slate-100 border border-slate-700"
};

/**
 * Nút bấm chuẩn Design System:
 * - Tích hợp sẵn khóa chống bấm đúp useRef (tự mở khóa trong finally)
 * - Hiển thị vòng xoay Loader2 khi đang xử lý
 * - Chiều cao tối thiểu 46px & tự giãn khi người lớn tuổi bật cỡ chữ 200%
 */
export default function AppButton({
  children,
  variant = "primary",
  tone = "auto",
  loading = false,
  disabled = false,
  type = "button",
  onClick,
  icon: Icon = null,
  loadingText = null,
  fullWidth = false,
  className = "",
  ...rest
}) {
  const { isDark } = useTheme();
  const lockRef = useRef(false);
  const [internalLoading, setInternalLoading] = useState(false);

  const isBusy = Boolean(loading || internalLoading);
  const isDisabled = Boolean(disabled || isBusy);

  const effectiveTone = tone === "auto" ? (isDark ? "dark" : "light") : tone;
  const resolvedVariantKey =
    effectiveTone === "dark" && (variant === "secondary" || variant === "ghost")
      ? `${variant}-dark`
      : variant;
  const variantClass = VARIANT_CLASSES[resolvedVariantKey] || VARIANT_CLASSES.primary;

  const handleClick = async (e) => {
    if (isDisabled || lockRef.current) {
      if (type !== "submit") e.preventDefault();
      return;
    }
    if (typeof onClick !== "function") {
      return;
    }

    lockRef.current = true;
    setInternalLoading(true);
    try {
      await onClick(e);
    } finally {
      lockRef.current = false;
      setInternalLoading(false);
    }
  };

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={typeof onClick === "function" ? handleClick : undefined}
      className={`min-h-[46px] h-auto py-2.5 px-4 rounded-2xl font-semibold leading-snug text-sm inline-flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-transform duration-150 disabled:opacity-55 disabled:cursor-not-allowed ${
        fullWidth ? "w-full" : ""
      } ${variantClass} ${className}`}
      {...rest}
    >
      {isBusy ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : Icon ? (
        <Icon className="w-4 h-4 shrink-0" />
      ) : null}
      {((isBusy && loadingText) ||
        (children !== null && children !== undefined && children !== false && children !== "")) && (
        <span className="min-w-0 leading-snug break-words text-center">
          {isBusy && loadingText ? loadingText : children}
        </span>
      )}
    </button>
  );
}

