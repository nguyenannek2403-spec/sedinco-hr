import React, { useId } from "react";

/**
 * FormField — Trường biểu mẫu chuẩn hóa Accessibility (Label + Input + Helper + Error)
 */
export default function FormField({
  label,
  required = false,
  hint,
  error,
  htmlFor,
  className = "",
  children
}) {
  const autoId = useId();
  const fieldId = htmlFor || autoId;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={fieldId}
          className="block text-xs sm:text-sm font-bold text-[#111C2D] dark:text-slate-200 leading-snug"
        >
          <span>{label}</span>
          {required && <span className="text-[#E11D48] dark:text-rose-400 ml-1" aria-hidden="true">*</span>}
        </label>
      )}
      <div>{children}</div>
      {hint && !error && (
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{hint}</p>
      )}
      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400 leading-snug">
          {error}
        </p>
      )}
    </div>
  );
}
