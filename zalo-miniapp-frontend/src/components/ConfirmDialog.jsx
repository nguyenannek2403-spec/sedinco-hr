import React, { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, X } from "lucide-react";

/**
 * Hộp thoại xác nhận / nhập liệu trong ứng dụng (thay thế window.confirm / window.prompt / alert
 * vốn bị chặn hoặc hoạt động không ổn định trên WebView Zalo Mini App iOS/Android).
 */
export default function ConfirmDialog({
  open = false,
  title = "Xác nhận thao tác",
  message = "",
  confirmLabel = "Xác nhận",
  cancelLabel = "Đóng",
  variant = "primary", // "primary" | "danger" | "warning"
  showInput = false,
  inputLabel = "Ghi chú / Lý do",
  inputPlaceholder = "Nhập nội dung...",
  inputDefaultValue = "",
  inputRequired = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const [inputVal, setInputVal] = useState(inputDefaultValue || "");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (open) {
      setInputVal(inputDefaultValue || "");
      setValidationError("");
    }
  }, [open, inputDefaultValue]);

  if (!open) return null;

  const palette =
    variant === "danger"
      ? {
          iconBg: "bg-rose-100 text-rose-600",
          Icon: AlertTriangle,
          btn: "bg-rose-600 hover:bg-rose-700 text-white",
        }
      : variant === "warning"
      ? {
          iconBg: "bg-amber-100 text-amber-600",
          Icon: AlertTriangle,
          btn: "bg-amber-500 hover:bg-amber-600 text-slate-950",
        }
      : {
          iconBg: "bg-blue-100 text-blue-600",
          Icon: CheckCircle2,
          btn: "bg-blue-600 hover:bg-blue-700 text-white",
        };

  const IconComp = palette.Icon || HelpCircle;

  const handleConfirmClick = () => {
    if (loading) return;
    const trimmed = String(inputVal || "").trim();
    if (showInput && inputRequired && !trimmed) {
      setValidationError("Vui lòng nhập nội dung bắt buộc trước khi xác nhận.");
      return;
    }
    setValidationError("");
    if (onConfirm) {
      onConfirm(showInput ? trimmed : true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      onClick={() => {
        if (!loading && onCancel) onCancel();
      }}
    >
      <div
        className="w-full sm:max-w-md max-h-[88vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${palette.iconBg}`}>
            <IconComp className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-base font-bold text-slate-900 leading-snug">{title}</h3>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 disabled:opacity-50"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-5 py-4 space-y-3">
          {message && (
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {message}
            </p>
          )}

          {showInput && (
            <div className="space-y-1.5">
              {inputLabel && (
                <label className="block text-xs font-semibold text-slate-700">{inputLabel}</label>
              )}
              <textarea
                rows={3}
                value={inputVal}
                onChange={(e) => {
                  setInputVal(e.target.value);
                  if (validationError) setValidationError("");
                }}
                placeholder={inputPlaceholder}
                className="w-full p-3 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              {validationError && (
                <p className="text-xs font-medium text-rose-600">{validationError}</p>
              )}
            </div>
          )}
        </div>

        <div
          className="grid grid-cols-2 gap-2.5 px-5 py-3.5 border-t border-slate-100 bg-white shrink-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
        >
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold whitespace-nowrap disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleConfirmClick}
            className={`min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap disabled:opacity-50 ${palette.btn}`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{loading ? "Đang xử lý..." : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

