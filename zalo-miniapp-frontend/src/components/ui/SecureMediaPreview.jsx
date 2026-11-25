import React, { useState, useEffect } from "react";
import { FileText, ExternalLink, Loader2, Lock, Video } from "lucide-react";
import { fetchAuthorizedMediaBlobUrl } from "../../services/zalo-media.service";

export function useResolvedMediaSrc(mediaRef) {
  const initialTrimmed = typeof mediaRef === "string" ? mediaRef.trim() : "";
  const isProtectedPath = initialTrimmed.startsWith("/api/media/");
  const [resolved, setResolved] = useState({
    src: isProtectedPath ? "" : initialTrimmed,
    mimeType: initialTrimmed.startsWith("data:video/") ? "video/mp4" : initialTrimmed.includes(".pdf") ? "application/pdf" : "",
    loading: isProtectedPath,
    error: false
  });

  useEffect(() => {
    const trimmed = typeof mediaRef === "string" ? mediaRef.trim() : "";
    if (!trimmed) {
      setResolved({ src: "", mimeType: "", loading: false, error: false });
      return undefined;
    }

    if (!trimmed.startsWith("/api/media/")) {
      const guessedMime = trimmed.startsWith("data:video/")
        ? "video/mp4"
        : trimmed.includes(".pdf")
          ? "application/pdf"
          : "";
      setResolved({ src: trimmed, mimeType: guessedMime, loading: false, error: false });
      return undefined;
    }

    let active = true;
    let revokeFn = null;
    setResolved({ src: "", mimeType: "", loading: true, error: false });

    fetchAuthorizedMediaBlobUrl(trimmed)
      .then((res) => {
        revokeFn = res.revoke;
        if (!active) {
          if (revokeFn) revokeFn();
          return;
        }
        setResolved({ src: res.url, mimeType: res.mimeType || "", loading: false, error: false });
      })
      .catch(() => {
        if (active) setResolved({ src: "", mimeType: "", loading: false, error: true });
      });

    return () => {
      active = false;
      if (revokeFn) revokeFn();
    };
  }, [mediaRef]);

  return resolved;
}

/**
 * SecureMediaPreview — Trình xem an toàn cho cả ảnh, PDF và video từ Cloudinary (public/private authenticated)
 * và dữ liệu inline cũ mà không làm lộ token JWT trong URL DOM.
 */
export default function SecureMediaPreview({
  src,
  alt = "Tài liệu minh chứng",
  mimeType = "",
  filename = "",
  className = "w-full max-h-56 object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900",
  compact = false
}) {
  const { src: resolvedSrc, mimeType: fetchedMime, loading, error } = useResolvedMediaSrc(src);
  const effectiveMime = (mimeType || fetchedMime || "").toLowerCase();

  if (!src) return null;

  if (loading) {
    return (
      <div className="px-3 py-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-300">
        <Loader2 className="w-4 h-4 animate-spin text-[#E11D48]" />
        <span>Đang xác thực quyền tải tài liệu...</span>
      </div>
    );
  }

  if (error || !resolvedSrc) {
    return (
      <div className="px-3 py-2.5 rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/50 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
        <Lock className="w-4 h-4 shrink-0" />
        <span>Không thể hiển thị tệp hoặc bạn không có quyền truy cập tài liệu này.</span>
      </div>
    );
  }

  const isVideo =
    effectiveMime.startsWith("video/") ||
    String(src).startsWith("data:video/") ||
    /\.(mp4|webm|mov)(\?|$)/i.test(String(src));

  const isPdf =
    effectiveMime === "application/pdf" ||
    String(src).startsWith("data:application/pdf") ||
    /\.pdf(\?|$)/i.test(String(src)) ||
    /\.pdf$/i.test(String(filename || ""));

  if (isVideo) {
    return (
      <div className="space-y-1">
        <video
          src={resolvedSrc}
          controls
          className="w-full max-h-56 rounded-xl border border-slate-300 dark:border-slate-700 bg-black"
        />
        {!compact && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <Video className="w-3.5 h-3.5" />
            <span>{filename || "Video minh chứng bảo vệ riêng tư"}</span>
          </div>
        )}
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/70 dark:bg-indigo-950/40 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 flex items-center justify-center text-indigo-600 dark:text-indigo-300 shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#111C2D] dark:text-white truncate">
              {filename || "Tài liệu PDF đính kèm"}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Tệp PDF được bảo vệ xác thực
            </div>
          </div>
        </div>
        <a
          href={resolvedSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 shrink-0"
        >
          <span>Mở PDF</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
    />
  );
}
