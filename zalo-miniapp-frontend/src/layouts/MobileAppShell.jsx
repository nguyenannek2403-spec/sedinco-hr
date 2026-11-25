import React from "react";
import UniversalAppShell from "../components/layout/UniversalAppShell";

/**
 * MobileAppShell — Khung ứng dụng tối ưu Mobile-First cho Công nhân (Worker) trên Zalo Mini App
 * Đảm bảo vùng an toàn 4 góc & tai thỏ iPhone (không cộng trùng 2 lần khi đã có WorkerHeader / UnifiedBottomNav):
 * - Đỉnh: padding-top: calc(var(--safe-area-top) + 8px)
 * - Đáy: padding-bottom: max(var(--safe-area-bottom), 12px)
 */
export default function MobileAppShell({
  header,
  bottomNav,
  containerClassName = "",
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
        role="worker"
        header={header}
        bottomNav={bottomNav}
        containerClassName={containerClassName}
        {...props}
      >
        {children}
      </UniversalAppShell>
    </div>
  );
}
