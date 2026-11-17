import React from "react";

/**
 * Dòng cài đặt 1 hàng chuẩn iOS:
 * Nhãn tiếng Việt tự xuống dòng bên trái, ô điều khiển giới hạn <= 55% bên phải
 * giúp input time/date/number/select không bao giờ bị lồi khỏi khung 320px-360px.
 */
export default function FormRow({
  label,
  htmlFor,
  description = "",
  dark = false,
  className = "",
  controlClassName = "",
  children
}) {
  return (
    <div
      className={`flex items-center justify-between gap-[10px] sm:gap-3 px-[12px] sm:px-3.5 py-2.5 ${
        dark ? "text-slate-100" : "text-slate-800"
      } ${className}`}
    >
      <div className="flex-1 min-w-0">
        <label
          htmlFor={htmlFor}
          className={`block break-words text-sm sm:text-base font-medium leading-snug ${
            dark ? "text-slate-200" : "text-slate-700"
          }`}
        >
          {label}
        </label>
        {description && (
          <p
            className={`text-xs mt-0.5 leading-snug break-words ${
              dark ? "text-slate-400" : "text-slate-500"
            }`}
          >
            {description}
          </p>
        )}
      </div>
      <div className={`shrink-0 min-w-0 max-w-[55%] ${controlClassName}`}>
        {children}
      </div>
    </div>
  );
}

