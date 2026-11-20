import React, { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import AppButton from "./ui/AppButton";
import AppModal from "./ui/AppModal";

/**
 * Hộp thoại xác nhận / nhập liệu chuẩn Design System:
 * - Tích hợp trực tiếp AppModal (ReactDOM.createPortal + Multi-layer Scroll-Lock + Z-index stack >= 120)
 * - Thay thế hoàn toàn window.confirm / window.prompt / alert
 */
export default function ConfirmDialog({
  open = false,
  title = "Xác nhận thao tác",
  message = "",
  confirmLabel = "Xác nhận",
  cancelLabel = "Đóng / Quay lại",
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

  const palette =
    variant === "danger"
      ? {
          iconBg: "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300",
          Icon: AlertTriangle,
          btnVariant: "danger",
        }
      : variant === "warning"
      ? {
          iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300",
          Icon: AlertTriangle,
          btnVariant: "warning",
        }
      : {
          iconBg: "bg-rose-100 text-[#E11D48] dark:bg-rose-950/60 dark:text-rose-300",
          Icon: CheckCircle2,
          btnVariant: "primary",
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
    <AppModal
      open={Boolean(open)}
      onClose={onCancel}
      disableClose={loading}
      closeOnBackdrop={!loading}
      title={title}
      icon={
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${palette.iconBg}`}>
          <IconComp className="w-4 h-4" />
        </div>
      }
      maxWidthClass="sm:max-w-md"
      maxHeightClass="max-h-[88vh]"
      zIndexClass="z-[120]"
      footer={
        <div className="grid grid-cols-2 gap-2.5">
          <AppButton
            variant="secondary"
            disabled={loading}
            onClick={onCancel}
            className="w-full"
          >
            {cancelLabel}
          </AppButton>
          <AppButton
            variant={palette.btnVariant}
            loading={loading}
            loadingText="Đang xử lý..."
            onClick={handleConfirmClick}
            className="w-full font-bold"
          >
            {confirmLabel}
          </AppButton>
        </div>
      }
    >
      <div className="px-5 py-4 space-y-3">
        {message && (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line break-words">
            {message}
          </p>
        )}

        {showInput && (
          <div className="space-y-1.5">
            {inputLabel && (
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">{inputLabel}</label>
            )}
            <textarea
              rows={3}
              value={inputVal}
              onChange={(e) => {
                setInputVal(e.target.value);
                if (validationError) setValidationError("");
              }}
              placeholder={inputPlaceholder}
              className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#E11D48] focus:bg-white dark:focus:bg-slate-800"
            />
            {validationError && (
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{validationError}</p>
            )}
          </div>
        )}
      </div>
    </AppModal>
  );
}
