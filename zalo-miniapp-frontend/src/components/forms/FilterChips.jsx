import React from "react";

/**
 * FilterChips — Dải chip lọc ngang gọn gàng, hỗ trợ cuộn ngang mượt trên màn hình 320px-375px
 */
export default function FilterChips({
  options = [],
  value,
  onChange,
  className = ""
}) {
  return (
    <div
      className={`flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 ${className}`}
      role="group"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            data-testid={opt.testId}
            onClick={() => onChange?.(opt.value)}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-extrabold whitespace-nowrap inline-flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              active
                ? "bg-[#E11D48] text-white border-[#E11D48] shadow-xs"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none ${
                  active
                    ? "bg-white/25 text-white"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
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
