import React, { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import Popover from "./Popover";

/**
 * DropdownMenu — Menu hành động thu gọn (Overflow Action Menu) giúp bảng/thẻ không bị nhồi nhét nút
 */
export default function DropdownMenu({
  items = [],
  label = "Tùy chọn khác",
  align = "right",
  triggerClassName = ""
}) {
  const [open, setOpen] = useState(false);
  const visibleItems = items.filter((item) => item && !item.hidden);

  if (visibleItems.length === 0) return null;

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align={align}
      className="w-52 p-1.5"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={label}
          aria-expanded={open}
          className={`min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer ${triggerClassName}`}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      }
    >
      <div className="space-y-0.5" role="menu">
        {visibleItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key || idx}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
              className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center gap-2.5 transition cursor-pointer disabled:opacity-50 ${
                item.danger
                  ? "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {Icon && <Icon className="w-4 h-4 shrink-0" />}
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
