import React from "react";
import {
  Download,
  CheckCircle2,
  AlertTriangle,
  Send
} from "lucide-react";
import { AppButton } from "./ui";

export default function PayslipActionFooter({
  isAdminOrAccountant = false,
  item = null,
  confirmStatus = "PENDING",
  submitting = false,
  resolving = false,
  sendingReport = false,
  canAdjust = false,
  canManagePayment = false,
  canSendReport = false,
  isLockedOrPaid = false,
  thang = null,
  nam = null,
  maNv = null,
  onClose,
  onOpenAdjustment,
  onOpenTransfer,
  onSendReport,
  onExportSlip,
  onConfirmSalary,
  onConfirmReceived,
  onToggleDispute
}) {
  if (isAdminOrAccountant) {
    const showAdjustBtn = Boolean(
      item && !isLockedOrPaid && canAdjust && typeof onOpenAdjustment === "function"
    );
    const isEmployeePaid = Boolean(
      item && (item.payout_status === "PAID" || item.payout_status === "RECEIVED" || item.employee_payment_status === "PAID" || item.payment_status === "PAID")
    );
    const showTransferBtn = Boolean(
      item && canManagePayment && typeof onOpenTransfer === "function"
    );
    const showSendReportBtn = Boolean(
      item && canSendReport && typeof onSendReport === "function"
    );
    const payload = item
      ? {
          ...item,
          thang: thang || item.thang,
          nam: nam || item.nam,
          ma_nv: maNv || item.ma_nv || item.id_nhan_vien
        }
      : null;

    if (showSendReportBtn && showTransferBtn) {
      return (
        <div
          data-testid="payslip-admin-footer"
          className="flex items-center gap-3 w-full"
        >
          <AppButton
            data-testid="payslip-admin-send-report-btn"
            variant="zalo"
            icon={Send}
            loading={sendingReport}
            disabled={resolving || sendingReport}
            onClick={() => payload && onSendReport(payload)}
            className="basis-[45%] shrink-0 min-h-[46px] !px-2.5 sm:!px-4 rounded-xl font-semibold text-xs sm:text-sm whitespace-nowrap"
          >
            Gửi báo cáo
          </AppButton>

          <AppButton
            data-testid="payslip-admin-transfer-btn"
            variant={isEmployeePaid ? "success" : "primary"}
            icon={isEmployeePaid ? CheckCircle2 : Send}
            disabled={resolving || sendingReport}
            onClick={() => payload && onOpenTransfer(payload)}
            className={`flex-1 min-w-0 min-h-[46px] !px-2.5 sm:!px-4 rounded-xl font-semibold text-xs sm:text-sm whitespace-nowrap ${
              isEmployeePaid ? "" : "bg-[#0051CA] hover:bg-blue-700 border-[#0051CA]"
            }`}
          >
            {isEmployeePaid ? "✓ Đã chuyển" : "Chuyển khoản"}
          </AppButton>
        </div>
      );
    }

    return (
      <div
        data-testid="payslip-admin-footer"
        className="flex items-center gap-3 w-full"
      >
        <AppButton
          data-testid="payslip-close-btn"
          variant="secondary"
          disabled={resolving}
          onClick={onClose}
          className="basis-[45%] shrink-0 min-h-[46px] rounded-xl font-semibold text-xs sm:text-sm whitespace-nowrap"
        >
          Đóng
        </AppButton>

        {showTransferBtn ? (
          <AppButton
            data-testid="payslip-admin-transfer-btn"
            variant={isEmployeePaid ? "success" : "primary"}
            icon={isEmployeePaid ? CheckCircle2 : Send}
            disabled={resolving}
            onClick={() => payload && onOpenTransfer(payload)}
            className={`flex-1 min-w-0 min-h-[46px] rounded-xl font-semibold text-xs sm:text-sm whitespace-nowrap ${
              isEmployeePaid ? "" : "bg-[#0051CA] hover:bg-blue-700 border-[#0051CA]"
            }`}
          >
            {isEmployeePaid ? "✓ Đã chuyển" : "💸 Chuyển khoản"}
          </AppButton>
        ) : showAdjustBtn ? (
          <AppButton
            data-testid="payslip-admin-adjust-btn"
            variant="warning"
            disabled={resolving}
            onClick={() => payload && onOpenAdjustment(payload)}
            className="flex-1 min-w-0 min-h-[46px] rounded-xl font-semibold text-xs sm:text-sm whitespace-nowrap"
          >
            Điều chỉnh
          </AppButton>
        ) : (
          <AppButton
            data-testid="payslip-admin-export-btn"
            variant="primary"
            icon={Download}
            disabled={!item || resolving}
            onClick={onExportSlip}
            className="flex-1 min-w-0 min-h-[46px] rounded-xl font-semibold text-xs sm:text-sm whitespace-nowrap"
          >
            Xuất Excel
          </AppButton>
        )}
      </div>
    );
  }

  const isEmployeeReceived = Boolean(
    item && (item.payout_status === "RECEIVED" || Boolean(item.received_at))
  );
  const isEmployeePaid = Boolean(
    !isEmployeeReceived &&
      item &&
      (item.payout_status === "PAID" ||
        item.employee_payment_status === "PAID" ||
        item.payment_status === "PAID")
  );
  const isPeriodPublished = Boolean(
    item &&
      (item.payout_status === "REPORT_SENT" ||
        (item.payout_status === "DISPUTED" && item.dispute_status !== "RESOLVED") ||
        item.period_locked ||
        item.payroll_period_status === "APPROVED" ||
        isEmployeePaid ||
        isEmployeeReceived)
  );

  if (isEmployeeReceived) {
    return (
      <div
        data-testid="payslip-worker-footer"
        className="flex items-center gap-3 w-full"
      >
        <div
          data-testid="payslip-worker-received-badge"
          className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-extrabold w-full whitespace-nowrap"
        >
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>💰 Đã xác nhận nhận đủ lương</span>
        </div>
      </div>
    );
  }

  if (isEmployeePaid) {
    return (
      <div
        data-testid="payslip-worker-footer"
        className="flex items-center w-full"
      >
        <AppButton
          data-testid="payslip-worker-confirm-received-btn"
          variant="success"
          icon={CheckCircle2}
          loading={submitting}
          loadingText="Đang xác nhận..."
          fullWidth
          onClick={onConfirmReceived}
          className="min-h-[46px] rounded-xl font-semibold text-sm whitespace-nowrap shadow-sm"
        >
          💰 Xác nhận đã nhận lương
        </AppButton>
      </div>
    );
  }

  if (confirmStatus === "CONFIRMED" || item?.payout_status === "CONFIRMED") {
    return (
      <div
        data-testid="payslip-worker-footer"
        className="flex items-center gap-3 w-full"
      >
        <span
          data-testid="payslip-worker-confirmed-badge"
          className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 min-h-[46px] px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-200 text-xs sm:text-sm font-bold whitespace-nowrap"
        >
          <CheckCircle2 size={16} className="shrink-0 text-teal-600 dark:text-teal-400" />
          <span>✓ Đã xác nhận đọc báo cáo</span>
        </span>
      </div>
    );
  }

  if (isPeriodPublished) {
    return (
      <div
        data-testid="payslip-worker-footer"
        className="flex items-center gap-3 w-full"
      >
        <AppButton
          data-testid="payslip-worker-dispute-btn"
          variant="warning"
          size="compact"
          icon={AlertTriangle}
          disabled={submitting}
          onClick={onToggleDispute}
          className="shrink-0 min-h-[46px] px-3 sm:px-4 text-xs sm:text-sm whitespace-nowrap"
        >
          Báo sai sót
        </AppButton>
        <AppButton
          data-testid="payslip-worker-confirm-btn"
          variant="success"
          size="compact"
          icon={CheckCircle2}
          loading={submitting}
          loadingText="Đang lưu..."
          onClick={onConfirmSalary}
          className="flex-1 min-w-0 min-h-[46px] px-3 sm:px-4 text-xs sm:text-sm whitespace-nowrap"
        >
          Xác nhận đọc báo cáo
        </AppButton>
      </div>
    );
  }

  return (
    <div
      data-testid="payslip-worker-footer"
      className="flex items-center gap-3 w-full"
    >
      <AppButton
        data-testid="payslip-close-btn"
        variant="secondary"
        fullWidth
        onClick={onClose}
        className="min-h-[46px] rounded-xl font-semibold text-sm whitespace-nowrap"
      >
        Đóng phiếu lương
      </AppButton>
    </div>
  );
}
