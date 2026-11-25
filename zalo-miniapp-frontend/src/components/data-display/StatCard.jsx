import React from "react";

/**
 * StatCard — Thẻ chỉ số KPI chuẩn Sedinco Unified Design System
 */
export default function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  tone = "default", // "default" | "crimson" | "emerald" | "amber" | "cobalt"
  className = ""
}) {
  const toneMap = {
    default: "text-[#111C2D] dark:text-white",
    crimson: "text-[#E11D48] dark:text-rose-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    cobalt: "text-[#0051CA] dark:text-blue-400"
  };

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3.5 sm:p-4 shadow-sm flex flex-col justify-between gap-1 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {label}
        </span>
        {Icon && <Icon className={`w-4 h-4 shrink-0 ${toneMap[tone] || toneMap.default}`} />}
      </div>
      <div className={`text-lg sm:text-xl font-black leading-tight ${toneMap[tone] || toneMap.default}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-snug">
          {subValue}
        </div>
      )}
    </div>
  );
}
