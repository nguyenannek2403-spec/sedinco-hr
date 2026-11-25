import React from "react";
import { UnifiedAppHeader } from "../components/layout/UniversalAppShell";

/**
 * WorkerHeader — Thanh tiêu đề chuẩn cho Công nhân (Worker) trên Zalo Mini App
 * Đảm bảo vùng an toàn tai thỏ / Dynamic Island:
 * - padding-top: calc(var(--safe-area-top) + 8px)
 * - Chừa hành lang phải cho cụm nút Zalo Capsule (--zalo-capsule-w)
 */
export default function WorkerHeader({ className = "", style, ...props }) {
  return (
    <UnifiedAppHeader
      className={className}
      style={{
        paddingTop: "calc(var(--safe-area-top) + 8px)",
        paddingBottom: "8px",
        ...style
      }}
      {...props}
    />
  );
}
