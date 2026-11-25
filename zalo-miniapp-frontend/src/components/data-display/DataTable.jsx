import React from "react";

/**
 * DataTable — Bảng dữ liệu doanh nghiệp có thanh cuộn ngang cô lập & header bám dính
 */
export default function DataTable({
  columns = [],
  data = [],
  rowKey = "id",
  emptyContent = null,
  className = ""
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return emptyContent;
  }

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden ${className}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 text-xs uppercase">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-3 px-4 font-bold ${
                    col.align === "center"
                      ? "text-center"
                      : col.align === "right"
                        ? "text-right"
                        : "text-left"
                  } ${col.headerClassName || ""}`}
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.map((row, idx) => {
              const key = typeof rowKey === "function" ? rowKey(row, idx) : row[rowKey] ?? idx;
              return (
                <tr
                  key={key}
                  className="hover:bg-rose-50/30 dark:hover:bg-slate-800/60 transition"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-3 px-4 ${
                        col.align === "center"
                          ? "text-center"
                          : col.align === "right"
                            ? "text-right"
                            : "text-left"
                      } ${col.cellClassName || ""}`}
                    >
                      {typeof col.render === "function" ? col.render(row, idx) : row[col.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
