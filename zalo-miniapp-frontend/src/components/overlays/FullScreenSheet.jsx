import React from "react";
import AppModal from "../ui/AppModal";

/**
 * FullScreenSheet — Màn hình trượt toàn khung nhìn trên Mobile & Modal lớn trên Desktop
 * Đảm bảo vùng an toàn 4 góc & tai thỏ iPhone:
 * - Phần đỉnh: padding-top: calc(var(--safe-area-top) + 8px)
 * - Phần đáy: padding-bottom: max(var(--safe-area-bottom), 12px)
 * (Không cộng trùng 2 lần nhờ AppModal kiểm soát tập trung trên Header và Footer/Body).
 */
export default function FullScreenSheet({
  maxWidthClass = "max-w-2xl",
  headerSafeStyle = {
    paddingTop: "calc(var(--safe-area-top) + 8px)"
  },
  footerSafeStyle = {
    paddingBottom: "max(var(--safe-area-bottom), 12px)"
  },
  ...props
}) {
  return (
    <AppModal
      variant="fullscreen"
      fullScreenSheet
      maxWidthClass={maxWidthClass}
      headerSafeStyle={headerSafeStyle}
      footerSafeStyle={footerSafeStyle}
      {...props}
    />
  );
}
