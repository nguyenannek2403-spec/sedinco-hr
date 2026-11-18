import React, { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

const VARIANT_CLASSES = {
  primary:
    "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white border border-blue-700 dark:border-blue-400/80 shadow-sm",
  secondary:
    "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 dark:border-slate-600 shadow-xs",
  "secondary-dark":
    "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 shadow-xs",
  success:
    "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white border border-emerald-700 dark:border-emerald-400/80 shadow-sm",
  danger:
    "bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500 text-white border border-rose-700 dark:border-rose-400/80 shadow-sm",
  warning:
    "bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-400 text-slate-950 border border-amber-600 dark:border-amber-400 shadow-sm",
  ghost:
    "bg-slate-50/80 hover:bg-slate-100 text-slate-700 border border-slate-200/90 dark:bg-slate-800/90 dark:hover:bg-slate-700 dark:text-slate-100 dark:border-slate-600",
  "ghost-dark":
    "bg-slate-800/90 hover:bg-slate-700 text-slate-100 border border-slate-600"
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
  tone = "light",
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
  const lockRef = useRef(false);
  const [internalLoading, setInternalLoading] = useState(false);

  const isBusy = Boolean(loading || internalLoading);
  const isDisabled = Boolean(disabled || isBusy);

  const resolvedVariantKey =
    tone === "dark" && (variant === "secondary" || variant === "ghost")
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
      className={`min-h-[46px] h-auto py-2.5 px-4 rounded-xl font-semibold leading-snug text-sm inline-flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-transform duration-150 disabled:opacity-55 disabled:cursor-not-allowed ${
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

