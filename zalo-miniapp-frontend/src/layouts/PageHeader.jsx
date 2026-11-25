import React from "react";

/**
 * PageHeader — Đầu trang đồng nhất theo Sedinco Unified Design System
 * Hỗ trợ: Icon, Tiêu đề, Phụ đề, Badge trạng thái, và Cụm nút hành động (Actions) tự co giãn trên 320px.
 */
export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  badge,
  actions,
  className = ""
}) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-sm flex flex-wrap items-start justify-between gap-3 ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {Icon && (
          <div className="w-11 h-11 rounded-2xl bg-[#FFE4E6] dark:bg-rose-950/60 text-[#E11D48] dark:text-rose-300 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base sm:text-lg font-extrabold text-[#111C2D] dark:text-white leading-snug break-words">
              {title}
            </h2>
            {badge}
          </div>
          {subtitle && (
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed break-words">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
