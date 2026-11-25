import React from "react";
import { AlertCircle, CheckCircle2, AlertTriangle, Info } from "lucide-react";

const VARIANT_CONFIG = {
  info: {
    icon: Info,
    cls: "bg-blue-50/90 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800/70 text-blue-800 dark:text-blue-200"
  },
  success: {
    icon: CheckCircle2,
    cls: "bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-200"
  },
  warning: {
    icon: AlertTriangle,
    cls: "bg-amber-50/90 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200"
  },
  danger: {
    icon: AlertCircle,
    cls: "bg-rose-50/90 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70 text-rose-800 dark:text-rose-200"
  }
};

/**
 * AlertBanner — Khung thông báo ngữ nghĩa (Info / Success / Warning / Danger)
 */
export default function AlertBanner({
  variant = "info",
  title,
  children,
  action,
  className = ""
}) {
  const cfg = VARIANT_CONFIG[variant] || VARIANT_CONFIG.info;
  const Icon = cfg.icon;

  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={`p-3.5 rounded-2xl border flex items-start justify-between gap-3 text-xs sm:text-sm ${cfg.cls} ${className}`}
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-0.5">
          {title && <div className="font-extrabold leading-snug">{title}</div>}
          {children && <div className="leading-relaxed">{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
