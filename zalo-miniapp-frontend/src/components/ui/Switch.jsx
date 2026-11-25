import React from "react";

/**
 * Switch — Chuẩn nút gạt Bật/Tắt (On/Off Toggle Switch) V60
 * - Khóa cứng kích thước chống bóp méo (Track: 46x26px shrink-0, Thumb: 20x20px shrink-0)
 * - Độ tương phản cao ở cả Light Mode & Dark Mode:
 *   + ON: bg-emerald-500
 *   + OFF: bg-slate-300 border border-slate-400/60 (Light) | dark:bg-slate-600 dark:border-slate-500 (Dark)
 * - Vùng chạm mở rộng p-1 -m-1 dễ thao tác bằng ngón tay trên Mobile mà không làm phồng chiều cao hàng
 */
export default function Switch({
  checked = false,
  onChange,
  disabled = false,
  ariaLabel,
  testId,
  id,
  className = ""
}) {
  const isChecked = Boolean(checked);

  const handleClick = (e) => {
    e.stopPropagation();
    if (disabled) return;
    onChange?.(!isChecked, e);
  };

  return (
    <button
      id={id}
      type="button"
      role="switch"
      data-testid={testId}
      aria-checked={isChecked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handleClick}
      className={`p-1 -m-1 shrink-0 inline-flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${className}`}
    >
      <span
        className={`w-[46px] min-w-[46px] h-[26px] shrink-0 rounded-full relative inline-flex items-center transition-colors duration-200 ${
          disabled ? "cursor-not-allowed" : "cursor-pointer"
        } ${
          isChecked
            ? "bg-emerald-500 dark:bg-emerald-500 border border-emerald-600/50 dark:border-emerald-400/50"
            : "bg-slate-300 border border-slate-400/60 dark:bg-slate-600 dark:border-slate-500"
        }`}
      >
        <span
          className={`w-[20px] h-[20px] shrink-0 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
            isChecked ? "translate-x-[23px]" : "translate-x-[3px]"
          }`}
        />
      </span>
    </button>
  );
}
