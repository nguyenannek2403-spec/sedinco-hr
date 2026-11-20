import React from "react";
import {
  ArrowLeft,
  SlidersHorizontal,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock
} from "lucide-react";
import { AppButton } from "../../components/ui";

/**
 * Thanh Thao Tác Đáy Cố Định (Sticky Bottom Action Bar) của Phiếu lương,
 * tách biệt 100% theo vai trò:
 * - Admin / Kế toán: [← Đóng], [✏️ Điều chỉnh Thưởng/Phạt/Ứng], [📄 Tải / In Phiếu lương]
 * - Worker: Kỳ đã chốt -> [✓ Xác nhận đúng lương & công], [⚠️ Báo sai sót], [Đóng];
 *           Đã xác nhận -> Huy hiệu xanh + [Đóng];
 *           Bản nháp -> Chú thích tạm tính + [Đóng].
 */
export default function PayslipActionFooter({
  isAdminOrAccountant = false,
  item = null,
  confirmStatus = "PENDING",
  submitting = false,
  resolving = false,
  canAdjust = false,
  isLockedOrPaid = false,
  onClose,
  onOpenAdjustment,
  onExportSlip,
  onConfirmSalary,
  onToggleDispute
}) {
  if (isAdminOrAccountant) {
    const canClickAdjust = Boolean(item && canAdjust && typeof onOpenAdjustment === "function" && !isLockedOrPaid);
    return (
      <div
        data-testid="payslip-admin-footer"
        className="flex flex-wrap items-center justify-between gap-2 w-full"
      >
        <AppButton
          data-testid="payslip-close-btn"
          variant="secondary"
          icon={ArrowLeft}
          disabled={resolving}
          onClick={onClose}
          className="flex-1 sm:flex-initial min-w-[96px]"
        >
          ← Đóng
        </AppButton>

        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
          {typeof onOpenAdjustment === "function" && (
            <AppButton
              data-testid="payslip-admin-adjust-btn"
              variant="warning"
              icon={SlidersHorizontal}
              disabled={!canClickAdjust || resolving}
              title={
                isLockedOrPaid
                  ? "Kỳ lương đã khóa hoặc đã chi trả, không thể điều chỉnh"
                  : !canAdjust
                  ? "Bạn không có quyền điều chỉnh thưởng/phạt"
                  : "Điều chỉnh Thưởng / Phạt / Tạm ứng"
              }
              onClick={() => item && onOpenAdjustment(item)}
              className="flex-1 sm:flex-initial text-xs sm:text-sm"
            >
              ✏️ Điều chỉnh Thưởng/Phạt/Ứng
            </AppButton>
          )}

          <AppButton
            data-testid="payslip-admin-export-btn"
            variant="primary"
            icon={Download}
            disabled={!item || resolving}
            onClick={onExportSlip}
            className="flex-1 sm:flex-initial text-xs sm:text-sm"
          >
            📄 Tải / In Phiếu lương
          </AppButton>
        </div>
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
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-bold flex-1 min-w-[200px]"
        >
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>✓ Bạn đã xác nhận phiếu lương kỳ này</span>
        </span>
        <AppButton
          data-testid="payslip-close-btn"
          variant="secondary"
          disabled={submitting}
          onClick={onClose}
          className="w-full sm:w-auto min-w-[110px]"
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
          loadingText="Đang xác nhận..."
          onClick={onConfirmSalary}
          className="flex-1 min-w-[190px] text-xs sm:text-sm"
        >
          ✓ Xác nhận đúng lương &amp; công
        </AppButton>
        <AppButton
          data-testid="payslip-worker-dispute-btn"
          variant="warning"
          icon={AlertTriangle}
          disabled={submitting}
          onClick={onToggleDispute}
          className="flex-1 sm:flex-initial text-xs sm:text-sm"
        >
          ⚠️ Báo sai sót
        </AppButton>
        <AppButton
          data-testid="payslip-close-btn"
          variant="secondary"
          disabled={submitting}
          onClick={onClose}
          className="w-full sm:w-auto"
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
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-700/70 text-amber-900 dark:text-amber-200 text-xs font-semibold flex-1 min-w-[210px]"
      >
        <Clock size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
        <span>Bảng lương tạm tính — Đang chờ Quản trị viên chốt kỳ</span>
      </div>
      <AppButton
        data-testid="payslip-close-btn"
        variant="secondary"
        onClick={onClose}
        className="w-full sm:w-auto min-w-[110px]"
      >
        Đóng
      </AppButton>
    </div>
  );
}
