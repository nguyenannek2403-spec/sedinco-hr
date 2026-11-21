import React from "react";
import {
  SlidersHorizontal,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send
} from "lucide-react";
import { AppButton } from "./ui";

export default function PayslipActionFooter({
  isAdminOrAccountant = false,
  item = null,
  confirmStatus = "PENDING",
  submitting = false,
  resolving = false,
  canAdjust = false,
  canManagePayment = false,
  isLockedOrPaid = false,
  thang = null,
  nam = null,
  maNv = null,
  onClose,
  onOpenAdjustment,
  onOpenTransfer,
  onExportSlip,
  onConfirmSalary,
  onToggleDispute
}) {
  if (isAdminOrAccountant) {
    const showAdjustBtn = Boolean(
      item && !isLockedOrPaid && canAdjust && typeof onOpenAdjustment === "function"
    );
    const isEmployeePaid = Boolean(
      item && (item.employee_payment_status === "PAID" || item.payment_status === "PAID")
    );
    const showTransferBtn = Boolean(
      item && canManagePayment && typeof onOpenTransfer === "function"
    );
    const payload = item
      ? {
          ...item,
          thang: thang || item.thang,
          nam: nam || item.nam,
          ma_nv: maNv || item.ma_nv || item.id_nhan_vien
        }
      : null;

    return (
      <div
        data-testid="payslip-admin-footer"
        className="flex flex-wrap items-center justify-between gap-2 w-full"
      >
        <AppButton
          data-testid="payslip-close-btn"
          variant="secondary"
          disabled={resolving}
          onClick={onClose}
          className="min-h-[44px] rounded-xl font-semibold flex-1 sm:flex-initial min-w-[84px]"
        >
          Đóng
        </AppButton>

        {showAdjustBtn && (
          <AppButton
            data-testid="payslip-admin-adjust-btn"
            variant="warning"
            icon={SlidersHorizontal}
            disabled={resolving}
            title="Điều chỉnh Thưởng / Phạt / Tạm ứng"
            onClick={() => payload && onOpenAdjustment(payload)}
            className="min-h-[44px] rounded-xl font-semibold flex-1 sm:flex-initial text-xs sm:text-sm"
          >
            Điều chỉnh
          </AppButton>
        )}

        {showTransferBtn && (
          <AppButton
            data-testid="payslip-admin-transfer-btn"
            variant={isEmployeePaid ? "success" : "primary"}
            icon={isEmployeePaid ? CheckCircle2 : Send}
            disabled={resolving}
            title={isEmployeePaid ? "Đã chuyển khoản lương kỳ này" : "Mở mã VietQR chuyển khoản"}
            onClick={() => payload && onOpenTransfer(payload)}
            className={`min-h-[44px] rounded-xl font-semibold flex-1 sm:flex-initial text-xs sm:text-sm ${
              isEmployeePaid ? "" : "bg-[#0051CA] hover:bg-blue-700 border-[#0051CA]"
            }`}
          >
            {isEmployeePaid ? "✓ Đã chuyển khoản" : "Chuyển khoản"}
          </AppButton>
        )}

        <AppButton
          data-testid="payslip-admin-export-btn"
          variant="primary"
          icon={Download}
          disabled={!item || resolving}
          onClick={onExportSlip}
          className="min-h-[44px] rounded-xl font-semibold flex-1 sm:flex-initial text-xs sm:text-sm"
        >
          Xuất phiếu
        </AppButton>
      </div>
    );
  }

  const isPeriodPublished = Boolean(
    item &&
      (item.period_locked ||
        item.payroll_period_status === "APPROVED" ||
        item.payment_status === "PAID")
  );

  if (confirmStatus === "CONFIRMED") {
    return (
      <div
        data-testid="payslip-worker-footer"
        className="flex flex-wrap items-center justify-between gap-2 w-full"
      >
        <span
          data-testid="payslip-worker-confirmed-badge"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-semibold flex-1 min-w-[180px]"
        >
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>✓ Bạn đã xác nhận đúng lương</span>
        </span>
        <AppButton
          data-testid="payslip-close-btn"
          variant="secondary"
          disabled={submitting}
          onClick={onClose}
          className="min-h-[44px] rounded-xl font-semibold flex-1 sm:flex-initial min-w-[96px]"
        >
          Đóng
        </AppButton>
      </div>
    );
  }

  if (isPeriodPublished) {
    return (
      <div
        data-testid="payslip-worker-footer"
        className="flex flex-wrap items-center gap-2 w-full"
      >
        <AppButton
          data-testid="payslip-worker-confirm-btn"
          variant="success"
          icon={CheckCircle2}
          loading={submitting}
          loadingText="Đang lưu..."
          onClick={onConfirmSalary}
          className="min-h-[44px] rounded-xl font-semibold flex-1 min-w-[160px] text-xs sm:text-sm"
        >
          ✓ Xác nhận đúng lương
        </AppButton>
        <AppButton
          data-testid="payslip-worker-dispute-btn"
          variant="warning"
          icon={AlertTriangle}
          disabled={submitting}
          onClick={onToggleDispute}
          className="min-h-[44px] rounded-xl font-semibold flex-1 sm:flex-initial text-xs sm:text-sm"
        >
          ⚠️ Báo sai sót
        </AppButton>
        <AppButton
          data-testid="payslip-close-btn"
          variant="secondary"
          disabled={submitting}
          onClick={onClose}
          className="min-h-[44px] rounded-xl font-semibold flex-1 sm:flex-initial min-w-[84px]"
        >
          Đóng
        </AppButton>
      </div>
    );
  }

  return (
    <div
      data-testid="payslip-worker-footer"
      className="flex flex-wrap items-center justify-between gap-2 w-full"
    >
      <div
        data-testid="payslip-draft-notice"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-700/70 text-amber-900 dark:text-amber-200 text-xs font-semibold flex-1 min-w-[190px]"
      >
        <Clock size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
        <span>Bảng lương tạm tính — Đang chờ chốt kỳ</span>
      </div>
      <AppButton
        data-testid="payslip-close-btn"
        variant="secondary"
        onClick={onClose}
        className="min-h-[44px] rounded-xl font-semibold flex-1 sm:flex-initial min-w-[96px]"
      >
        Đóng
      </AppButton>
    </div>
  );
}
