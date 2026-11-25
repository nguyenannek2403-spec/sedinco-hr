import React from "react";
import DataTable from "./DataTable";

/**
 * ResponsiveDataList — Tự động hiển thị Thẻ (Mobile Card List) trên màn hình < md
 * và Bảng (Enterprise DataTable) trên màn hình >= md (Tablet / Desktop).
 * Giải quyết triệt để tình trạng ép bảng 680px trên màn hình điện thoại 320px-430px.
 */
export default function ResponsiveDataList({
  columns = [],
  data = [],
  rowKey = "id",
  renderMobileCard,
  emptyContent = null,
  mobileGridClassName = "space-y-2.5",
  className = ""
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return emptyContent;
  }

  return (
    <div className={className}>
      {/* Mobile Card List (< 768px) */}
      {typeof renderMobileCard === "function" && (
        <div className={`md:hidden ${mobileGridClassName}`}>
          {data.map((item, idx) => {
            const key = typeof rowKey === "function" ? rowKey(item, idx) : item[rowKey] ?? idx;
            return <React.Fragment key={key}>{renderMobileCard(item, idx)}</React.Fragment>;
          })}
        </div>
      )}

      {/* Tablet / Desktop DataTable (>= 768px) */}
      <div className={typeof renderMobileCard === "function" ? "hidden md:block" : "block"}>
        <DataTable columns={columns} data={data} rowKey={rowKey} emptyContent={emptyContent} />
      </div>
    </div>
  );
}
