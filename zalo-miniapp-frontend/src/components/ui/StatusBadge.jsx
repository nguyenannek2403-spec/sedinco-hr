import React from "react";
import {
  getAttendanceStatusInfo,
  getRequestStatusInfo
} from "../../utils/viLabels";
import { useTheme } from "../../context/ThemeContext";

const REQUEST_SYMBOLS = {
  approved: "✓",
  rejected: "✕",
  cancelled: "—",
  pending: "⏳"
};

const EMPLOYEE_STATUS_MAP = {
  active: {
    symbol: "✓",
    label: "Hoạt động",
    lightClass: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    darkClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
  },
  locked: {
    symbol: "🔒",
    label: "Đã khóa",
    lightClass: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    darkClass: "bg-rose-500/15 text-rose-300 border-rose-500/30"
  }
};

/**
 * Nhãn trạng thái chuẩn accessibility:
 * Hiển thị đồng thời Màu sắc + Ký hiệu phi-màu sắc + Nhãn Tiếng Việt rõ ràng từ viLabels.js.
 */
export default function StatusBadge({
  type = "attendance",
  status,
  value,
  labelOverride = null,
  symbolOverride = null,
  dark = "auto",
  showSymbol = true,
  className = ""
}) {
  const { isDark: globalDark } = useTheme();
  const isDark = dark === "auto" ? globalDark : Boolean(dark);
  const raw = value !== undefined ? value : status;
  let symbol = "";
  let label = "";
  let badgeClass = "";

  if (type === "attendance") {
    const code = String(raw || "0").trim();
    const info = getAttendanceStatusInfo(code);
    symbol = symbolOverride || (code === "NOT_CHECKED_IN" ? "—" : code);
    label = labelOverride || info.shortLabel;
    badgeClass = info.badgeClass;
  } else if (type === "request") {
    const key = String(raw || "pending").trim().toLowerCase();
    const info = getRequestStatusInfo(key);
    symbol = symbolOverride || REQUEST_SYMBOLS[key] || "⏳";
    label = labelOverride || info.label;
    if (isDark) {
      badgeClass =
        key === "approved"
          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
          : key === "rejected"
            ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
            : key === "cancelled"
              ? "bg-slate-700/60 text-slate-300 border-slate-600/60"
              : "bg-amber-500/15 text-amber-300 border-amber-500/30";
    } else {
      badgeClass = info.bgClass;
    }
  } else if (type === "employee") {
    const key = raw === true || raw === "locked" || raw === "inactive" ? "locked" : "active";
    const meta = EMPLOYEE_STATUS_MAP[key];
    symbol = symbolOverride || meta.symbol;
    label = labelOverride || meta.label;
    badgeClass = isDark ? meta.darkClass : meta.lightClass;
  } else {
    symbol = symbolOverride || "•";
    label = labelOverride || String(raw || "");
    badgeClass = isDark
      ? "bg-slate-800 text-slate-200 border-slate-700"
      : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700";
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold leading-snug whitespace-nowrap shrink-0 ${badgeClass} ${className}`}
    >
      {showSymbol && symbol && (
        <span className="font-mono font-bold text-xs opacity-90" aria-hidden="true">
          {symbol}
        </span>
      )}
      <span>{label}</span>
    </span>
  );
}

