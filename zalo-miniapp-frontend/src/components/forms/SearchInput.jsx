import React from "react";
import { Search, X } from "lucide-react";

/**
 * SearchInput — Ô tìm kiếm tiêu chuẩn (>= 44px touch target) có nút xóa nhanh
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = "Tìm kiếm...",
  testId,
  className = "",
  ...props
}) {
  return (
    <div className={`relative flex-1 min-w-[160px] ${className}`}>
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        data-testid={testId}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-9 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange?.("")}
          aria-label="Xóa từ khóa tìm kiếm"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
