import React from "react";
import AppModal from "../ui/AppModal";

/**
 * ResponsiveDrawer — Ngăn kéo trượt cạnh phải trên Desktop & Bottom Sheet trên Mobile
 * Dành cho: Xem chi tiết bản ghi, trung tâm thông báo, bộ lọc nhiều tiêu chí.
 */
export default function ResponsiveDrawer({
  maxWidthClass = "max-w-md",
  ...props
}) {
  return (
    <AppModal
      variant="drawer"
      maxWidthClass={maxWidthClass}
      {...props}
    />
  );
}
