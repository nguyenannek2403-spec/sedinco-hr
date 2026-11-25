import React from "react";
import AppModal from "../ui/AppModal";

/**
 * BaseDialog — Hộp thoại căn giữa nhỏ gọn (Compact Centered Dialog)
 * Dành cho: Xác nhận thao tác, hiển thị mật khẩu tạm 1 lần, thông báo ngắn, form 1-2 trường.
 */
export default function BaseDialog({
  maxWidthClass = "max-w-md",
  ...props
}) {
  return (
    <AppModal
      variant="dialog"
      align="center"
      maxWidthClass={maxWidthClass}
      {...props}
    />
  );
}
