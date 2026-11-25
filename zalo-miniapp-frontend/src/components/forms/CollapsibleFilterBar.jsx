import React, { useState } from "react";
import { SlidersHorizontal, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

/**
 * CollapsibleFilterBar — Thanh bộ lọc Progressive Disclosure (Tiết lộ thông tin theo ngữ cảnh)
 * - Luôn hiển thị bộ lọc chính (Primary Controls).
 * - Các bộ lọc nâng cao (Advanced Filters) được thu gọn trên Mobile vào nút "Bộ lọc nâng cao (N)"
 *   kèm badge đếm số bộ lọc đang kích hoạt và nút "Đặt lại bộ lọc".
 */
export default function CollapsibleFilterBar({
  primaryControls,
  advancedControls,
  activeFilterCount = 0,
  onReset,
  defaultExpanded = false,
  className = ""
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={`space-y-2.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] flex flex-wrap items-center gap-2">
          {primaryControls}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {advancedControls && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              data-testid="toggle-advanced-filters-btn"
              className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer ${
                expanded || activeFilterCount > 0
                  ? "bg-rose-50 dark:bg-rose-950/60 text-[#E11D48] dark:text-rose-300 border-rose-200 dark:border-rose-800"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span>Bộ lọc nâng cao</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#E11D48] text-white text-[10px] font-black leading-none">
                  {activeFilterCount}
                </span>
              )}
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}

          {activeFilterCount > 0 && onReset && (
            <button
              type="button"
              onClick={onReset}
              data-testid="reset-filters-btn"
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-[#0051CA] dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Đặt lại</span>
            </button>
          )}
        </div>
      </div>

      {advancedControls && (expanded || activeFilterCount > 0) && (
        <div
          data-testid="advanced-filters-panel"
          className="p-3 rounded-2xl bg-[#F0F3FF]/60 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 animate-fade-in"
        >
          {advancedControls}
        </div>
      )}
    </div>
  );
}
