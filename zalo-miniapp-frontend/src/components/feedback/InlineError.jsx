import React from "react";
import { AlertCircle } from "lucide-react";

/**
 * InlineError — Thông báo lỗi ngắn gọn ngay dưới ô nhập liệu hoặc trong form
 */
export default function InlineError({ message, className = "" }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={`flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 mt-1 ${className}`}
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
