import React, { useState, useEffect, useRef } from "react";
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, RotateCcw } from "lucide-react";
import { getVietnamTodayIso } from "../../utils/workdayUtils";

/**
 * Bộ chọn kỳ Tháng / Năm hiện đại kết hợp điều hướng ◀ ▶ và popover chọn nhanh 12 tháng + nút Về tháng hiện tại.
 */
export default function MonthYearPicker({
  month,
  year,
  onChange,
  testIdPrefix = "month-year-picker",
  className = ""
}) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(Number(year) || new Date().getFullYear());
  const containerRef = useRef(null);

  useEffect(() => {
    if (year) setPickerYear(Number(year));
  }, [year]);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const curParts = getVietnamTodayIso().split("-").map(Number);
  const currentVnYear = curParts[0] || new Date().getFullYear();
  const currentVnMonth = curParts[1] || new Date().getMonth() + 1;

  const paddedMonth = String(Number(month) || currentVnMonth).padStart(2, "0");
  const numericMonth = Number(month) || currentVnMonth;
  const numericYear = Number(year) || currentVnYear;

  const handleStep = (delta) => {
    if (typeof onChange !== "function") return;
    if (delta < 0) {
      onChange(numericMonth > 1 ? numericMonth - 1 : 12, numericMonth > 1 ? numericYear : numericYear - 1);
    } else {
      onChange(numericMonth < 12 ? numericMonth + 1 : 1, numericMonth < 12 ? numericYear : numericYear + 1);
    }
  };

  const handleSelectMonth = (m) => {
    if (typeof onChange === "function") {
      onChange(m, pickerYear);
    }
    setOpen(false);
  };

  const handleJumpToday = () => {
    setPickerYear(currentVnYear);
    if (typeof onChange === "function") {
      onChange(currentVnMonth, currentVnYear);
    }
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative inline-flex ${className}`}>
      <div className="inline-flex items-center bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-1 py-0.5 shadow-sm">
        <button
          type="button"
          onClick={() => handleStep(-1)}
          title="Tháng trước"
          aria-label="Tháng trước"
          className="min-w-[40px] min-h-[40px] p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer flex items-center justify-center transition"
        >
          <ChevronLeft size={18} />
        </button>

        <button
          type="button"
          data-testid={`${testIdPrefix}-trigger`}
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          title="Chọn nhanh tháng và năm"
          className="min-h-[40px] px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/80 flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-white cursor-pointer whitespace-nowrap transition"
        >
          <Calendar size={15} className="text-[#E11D48] dark:text-rose-400 shrink-0" />
          <span>Tháng {paddedMonth}/{numericYear}</span>
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        <button
          type="button"
          onClick={() => handleStep(1)}
          title="Tháng sau"
          aria-label="Tháng sau"
          className="min-w-[40px] min-h-[40px] p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer flex items-center justify-center transition"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {open && (
        <div
          data-testid={`${testIdPrefix}-popover`}
          className="absolute left-0 top-full mt-2 z-50 w-72 max-w-[calc(100vw-24px)] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-3.5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setPickerYear((y) => y - 1)}
              aria-label="Năm trước"
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-black text-[#111C2D] dark:text-white font-mono">
              Năm {pickerYear}
            </span>
            <button
              type="button"
              onClick={() => setPickerYear((y) => y + 1)}
              aria-label="Năm sau"
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => {
              const isSelected = m === numericMonth && pickerYear === numericYear;
              const isNow = m === currentVnMonth && pickerYear === currentVnYear;
              return (
                <button
                  key={m}
                  type="button"
                  data-testid={`${testIdPrefix}-m-${m}`}
                  onClick={() => handleSelectMonth(m)}
                  className={`min-h-[38px] px-2 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isSelected
                      ? "bg-[#E11D48] text-white shadow-sm dark:bg-rose-600"
                      : isNow
                      ? "bg-rose-50 dark:bg-rose-950/50 text-[#B80035] dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                      : "bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  Tháng {m}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            data-testid={`${testIdPrefix}-today-btn`}
            onClick={handleJumpToday}
            className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[#F0F3FF] hover:bg-blue-100/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#0051CA] dark:text-blue-300 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition"
          >
            <RotateCcw size={13} />
            <span>
              Tháng hiện tại ({String(currentVnMonth).padStart(2, "0")}/{currentVnYear})
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
