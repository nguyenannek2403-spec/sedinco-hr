import React from "react";

/**
 * InfoCard — Khung thẻ nội dung có tiêu đề và vùng hành động chuẩn hóa
 */
export default function InfoCard({
  title,
  subtitle,
  icon: Icon,
  actions,
  className = "",
  bodyClassName = "",
  children
}) {
  return (
    <section
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3.5 ${className}`}
    >
      {(title || subtitle || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div className="w-9 h-9 rounded-xl bg-[#FFE4E6] dark:bg-rose-950/60 text-[#E11D48] dark:text-rose-300 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="text-sm sm:text-base font-extrabold text-[#111C2D] dark:text-white leading-snug">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
