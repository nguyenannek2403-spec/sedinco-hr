import React from "react";

/**
 * PageContainer — Khung chứa trang tiêu chuẩn trong UniversalAppShell
 * Loại bỏ hoàn toàn các khoảng đệm đáy dư thừa (pb-28 / mb-24) do BottomNav đã nằm trong CSS Grid row 3.
 */
export default function PageContainer({
  maxWidth = "max-w-6xl",
  className = "",
  testId,
  children
}) {
  return (
    <div
      data-testid={testId}
      className={`w-full ${maxWidth} mx-auto space-y-4 pb-6 ${className}`}
    >
      {children}
    </div>
  );
}
