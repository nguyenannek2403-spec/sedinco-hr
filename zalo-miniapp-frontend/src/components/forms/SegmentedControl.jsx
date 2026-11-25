import React from "react";

/**
 * SegmentedControl — Thanh chuyển tab nhanh 2-4 lựa chọn chuẩn Mobile / Desktop (>= 44px touch target)
 */
export default function SegmentedControl({
  options = [],
  value,
  onChange,
  className = "",
  ariaLabel = "Chuyển chế độ xem"
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex flex-wrap items-center gap-1 p-1 rounded-2xl bg-[#F0F3FF] dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={opt.testId}
            onClick={() => onChange?.(opt.value)}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              active
                ? "bg-[#E11D48] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:text-[#111C2D] dark:hover:text-white"
            }`}
          >
            {Icon && <Icon className="w-4 h-4 shrink-0" />}
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none ${
                  active
                    ? "bg-white/20 text-white"
                    : "bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
