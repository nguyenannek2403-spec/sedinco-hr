import React from "react";

/**
 * FormSection — Nhóm các trường biểu mẫu có liên quan thành một khối rõ ràng (Progressive Disclosure)
 */
export default function FormSection({
  title,
  subtitle,
  icon: Icon,
  badge,
  className = "",
  children
}) {
  return (
    <section
      className={`rounded-2xl bg-[#F0F3FF]/70 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 p-3.5 sm:p-4 space-y-3 ${className}`}
    >
      {(title || subtitle || badge) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && <Icon className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />}
            <div>
              {title && (
                <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-[#111C2D] dark:text-slate-100">
                  {title}
                </h4>
              )}
              {subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {badge}
        </div>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
}
