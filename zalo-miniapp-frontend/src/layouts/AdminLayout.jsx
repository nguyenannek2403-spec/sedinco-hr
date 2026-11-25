import React from "react";
import UniversalAppShell from "../components/layout/UniversalAppShell";

/**
 * AdminLayout — Khung ứng dụng Quản trị viên (Responsive Desktop Sidebar + Mobile Bottom Nav & Drawer)
 * Đảm bảo vùng an toàn 4 góc & tai thỏ iPhone (không cộng trùng 2 lần khi đã có DesktopHeader / BottomNav):
 * - Đỉnh: padding-top: calc(var(--safe-area-top) + 8px)
 * - Đáy: padding-bottom: max(var(--safe-area-bottom), 12px)
 */
export default function AdminLayout({
  header,
  bottomNav,
  children,
  ...props
}) {
  const safeWrapperStyle = {
    paddingTop: header ? "0px" : "calc(var(--safe-area-top) + 8px)",
    paddingBottom: bottomNav ? "0px" : "max(var(--safe-area-bottom), 12px)"
  };

  return (
    <div style={safeWrapperStyle} className="w-full">
      <UniversalAppShell
        role="admin"
        header={header}
        bottomNav={bottomNav}
        {...props}
      >
        {children}
      </UniversalAppShell>
    </div>
  );
}
