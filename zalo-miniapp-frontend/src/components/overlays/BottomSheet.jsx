import React from "react";
import AppModal from "../ui/AppModal";

/**
 * BottomSheet — Khay trượt từ dưới lên trên Mobile & Modal căn giữa trên Desktop
 * Dành cho: Bộ chọn ngân hàng, bộ lọc nâng cao, chọn hành động nhanh, form trung bình trên điện thoại.
 */
export default function BottomSheet({
  maxWidthClass = "max-w-lg",
  showDragHandle = true,
  ...props
}) {
  return (
    <AppModal
      variant="sheet"
      align="bottom"
      maxWidthClass={maxWidthClass}
      showDragHandle={showDragHandle}
      {...props}
    />
  );
}
