import React, { useState, useEffect } from "react";
import { useResolvedMediaSrc } from "./SecureMediaPreview";

const SIZE_CLASSES = {
  xs: "w-7 h-7 text-xs",
  sm: "w-9 h-9 text-xs",
  md: "w-11 h-11 text-sm",
  lg: "w-14 h-14 text-base",
  xl: "w-20 h-20 text-xl"
};

const PASTEL_PALETTES = [
  "bg-rose-100 text-[#B80035] border-rose-200/80 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-700/60",
  "bg-blue-100 text-[#0051CA] border-blue-200/80 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-700/60",
  "bg-emerald-100 text-emerald-800 border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700/60",
  "bg-indigo-100 text-indigo-800 border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-700/60",
  "bg-amber-100 text-amber-800 border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700/60",
  "bg-teal-100 text-teal-800 border-teal-200/80 dark:bg-teal-950/60 dark:text-teal-200 dark:border-teal-700/60"
];

function extractAvatarInitials(name) {
  const clean = String(name || "").trim();
  if (!clean) return "NV";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  const firstChar = words[0][0] || "";
  const lastChar = words[words.length - 1][0] || "";
  return `${firstChar}${lastChar}`.toUpperCase() || "NV";
}

function getPaletteClass(name) {
  const str = String(name || "NV");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return PASTEL_PALETTES[hash % PASTEL_PALETTES.length];
}

/**
 * Component Avatar dùng chung toàn hệ thống (V43):
 * - Hiển thị ảnh đã nén từ `avatarUrl` với fallback mượt mà về chữ cái đầu tên khi chưa có ảnh hoặc ảnh lỗi.
 */
export default function UserAvatar({
  name = "",
  avatarUrl = null,
  size = "md",
  className = ""
}) {
  const [imgError, setImgError] = useState(false);
  const { src: resolvedAvatarSrc } = useResolvedMediaSrc(avatarUrl);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const trimmedUrl = typeof resolvedAvatarSrc === "string" ? resolvedAvatarSrc.trim() : "";
  const hasValidSrc = Boolean(trimmedUrl && !imgError);

  if (hasValidSrc) {
    return (
      <div
        className={`${sizeClass} rounded-full overflow-hidden border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 ${className}`}
      >
        <img
          src={trimmedUrl}
          alt={name || "Ảnh đại diện"}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover rounded-full block"
        />
      </div>
    );
  }

  const initials = extractAvatarInitials(name);
  const paletteClass = getPaletteClass(name);

  return (
    <div
      aria-label={name || "Avatar"}
      className={`${sizeClass} ${paletteClass} rounded-full border font-extrabold flex items-center justify-center shrink-0 select-none ${className}`}
    >
      <span>{initials}</span>
    </div>
  );
}
