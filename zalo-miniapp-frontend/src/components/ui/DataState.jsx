import React from "react";
import { FileText } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

/**
 * Khung xương tải dữ liệu mượt mà (SkeletonList)
 */
export function SkeletonList({ rows = 4, dark = "auto", label = "Đang tải dữ liệu...", className = "" }) {
  const { isDark: globalDark } = useTheme();
  const isDark = dark === "auto" ? globalDark : Boolean(dark);
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: Math.max(1, rows) }).map((_, idx) => (
        <div
          key={idx}
          className={`rounded-2xl border p-4 animate-pulse space-y-2.5 ${
            isDark
              ? "bg-slate-800/70 border-slate-700/70"
              : "bg-white border-slate-200 dark:bg-slate-800/70 dark:border-slate-700/70"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className={`h-4 rounded-lg w-2/5 ${isDark ? "bg-slate-700" : "bg-slate-200 dark:bg-slate-700"}`} />
            <div className={`h-6 rounded-lg w-20 ${isDark ? "bg-slate-700" : "bg-slate-200 dark:bg-slate-700"}`} />
          </div>
          <div className={`h-3.5 rounded-lg w-4/5 ${isDark ? "bg-slate-700/70" : "bg-slate-100 dark:bg-slate-700/70"}`} />
          <div className={`h-3.5 rounded-lg w-3/5 ${isDark ? "bg-slate-700/60" : "bg-slate-100 dark:bg-slate-700/60"}`} />
        </div>
      ))}
    </div>
  );
}

/**
 * Trạng thái trống thân thiện bằng tiếng Việt (EmptyState)
 */
export function EmptyState({
  icon: Icon = FileText,
  title = "Chưa có dữ liệu",
  description = "",
  action = null,
  dark = "auto",
  className = ""
}) {
  const { isDark: globalDark } = useTheme();
  const isDark = dark === "auto" ? globalDark : Boolean(dark);
  return (
    <div
      className={`py-12 px-5 rounded-2xl border text-center space-y-2.5 ${
        isDark
          ? "bg-slate-800/40 border-slate-700/60 text-slate-300"
          : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/40 dark:border-slate-700/60 dark:text-slate-300"
      } ${className}`}
    >
      <div
        className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center ${
          isDark ? "bg-slate-800 text-slate-400" : "bg-white text-slate-400 border border-slate-200 dark:bg-slate-800 dark:border-slate-700"
        }`}
      >
        <Icon className="w-6 h-6" />
      </div>
      <h4 className={`text-sm font-bold ${isDark ? "text-slate-100" : "text-slate-800 dark:text-slate-100"}`}>
        {title}
      </h4>
      {description && (
        <p className={`text-xs leading-relaxed max-w-sm mx-auto ${isDark ? "text-slate-400" : "text-slate-500 dark:text-slate-400"}`}>
          {description}
        </p>
      )}
      {action && <div className="pt-2 flex justify-center">{action}</div>}
    </div>
  );
}

