import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  FileText,
  X,
  RefreshCw,
  Eye,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  Send,
  Lock,
  Unlock
} from "lucide-react";
import SalarySlipModal from "./SalarySlipModal";
import BankTransferModal from "./BankTransferModal";
import SalaryReportModal from "./SalaryReportModal";
import PeriodLockModal from "./PeriodLockModal";
import ConfirmDialog from "./ConfirmDialog";
import { AppButton, AppModal, FormRow, MonthYearPicker, SkeletonList, EmptyState, UserAvatar } from "./ui";
import { safeGet, safePost, generateIdempotencyKey } from "../utils/api";
import { ROLES, hasPermission } from "../constants/roles";
import useDepartments from "../hooks/useDepartments";
import { buildHolidayWorkSummaryLabel } from "../utils/payslipHelpers";
import {
  formatViNumber,
  formatViCurrency,
  formatViWorkday,
  parseViNumberInput
} from "../utils/viNumberFormat";
import { getMonthlyStandardWorkdays } from "../utils/workdayUtils";

export default function PayrollGridTable({
  payrollData,
  month = new Date().getMonth() + 1,
  year = new Date().getFullYear(),
  onMonthChange,
  onRefresh,
  isLoading: propIsLoading,
  showToast,
  onShowToast,
  activeRole,
  userRole,
  dynamicPerms = {},
  focusTarget = null
}) {
  const effectiveRole = activeRole || userRole || "admin";
  const isAccountant = effectiveRole === "accountant";
  const isAdmin = effectiveRole === "admin";
  const canCalculatePayroll = isAccountant && dynamicPerms?.payroll_calculate !== false;
  const canApprovePayroll = isAdmin || dynamicPerms?.payroll_approve === true;
  const canManagePayment = isAdmin || dynamicPerms?.payroll_payment_status_manage === true;
  const canExportPayroll = isAdmin || dynamicPerms?.payroll_export !== false;
  const canLockPeriod = isAdmin || (isAccountant && dynamicPerms?.attendance_lock === true);
  const canUnlockPeriod = hasPermission(effectiveRole, "canUnlockPeriod");
  const notify = showToast || onShowToast;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("ALL");
  const [selectedSlipItem, setSelectedSlipItem] = useState(null);
  const [slipRefreshTick, setSlipRefreshTick] = useState(0);
  const [internalPayroll, setInternalPayroll] = useState([]);
  const [isPeriodLocked, setIsPeriodLocked] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [loadingPayroll, setLoadingPayroll] = useState(false);
  const adjInFlightRef = useRef(false);
  const lastFocusTsRef = useRef(0);

  // Modal Điều chỉnh Thưởng / Phạt / Tạm ứng (F2)
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjForm, setAdjForm] = useState({
    bonus_amount: 0,
    penalty_amount: 0,
    advance_deduction: 0,
    adjustment_note: ""
  });
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjError, setAdjError] = useState("");
  const [payrollError, setPayrollError] = useState("");
  const [transferItem, setTransferItem] = useState(null);
  const [reportModalItem, setReportModalItem] = useState(null);
  const [sendAllConfirmOpen, setSendAllConfirmOpen] = useState(false);
  const [sendingAllReports, setSendingAllReports] = useState(false);
  const [sendingReportId, setSendingReportId] = useState(null);
  const [unconfirmedWarnItem, setUnconfirmedWarnItem] = useState(null);
  const [resolvingDisputeId, setResolvingDisputeId] = useState(null);

  const handleQuickResolveDispute = async (dItem) => {
    const dId = dItem?.ma_nv || dItem?.id_nhan_vien;
    if (!dId || resolvingDisputeId) return;
    setResolvingDisputeId(dId);
    try {
      const targetMonth = Number(dItem?.thang || month);
      const targetYear = Number(dItem?.nam || year);
      const res = await safePost(
        "/payroll/resolve-dispute",
        {
          ma_nv: dId,
          month: targetMonth,
          year: targetYear,
          status: "RESOLVED",
          admin_response: "Quản trị viên đã kiểm tra và đánh dấu đã giải quyết"
        },
        { idempotencyKey: generateIdempotencyKey("pay_quick_resolve") }
      );
      if (res?.success) {
        const patch = {
          dispute_status: "RESOLVED",
          salary_confirm_status: res.salary_confirm_status || "CONFIRMED",
          payout_status:
            dItem.payout_status === "PAID" || dItem.employee_payment_status === "PAID"
              ? "PAID"
              : res.salary_confirm_status || "CONFIRMED",
          dispute_reason: null,
          dispute_note: null,
          dispute_evidence_media: null,
          admin_response: null
        };
        setInternalPayroll((prev) =>
          prev.map((row) => ((row.ma_nv || row.id_nhan_vien) === dId ? { ...row, ...patch } : row))
        );
        setSelectedSlipItem((prev) =>
          prev && (prev.ma_nv || prev.id_nhan_vien) === dId ? { ...prev, ...patch } : prev
        );
        if (notify) notify(res.message || `Đã giải quyết khiếu nại của ${dItem.ho_ten || dId}!`, "success");
        await fetchPayrollFromApi();
        if (onRefresh) onRefresh();
      } else if (notify) {
        notify(res?.message || "Không thể đánh dấu đã giải quyết.", "error");
      }
    } catch (err) {
      if (notify) notify(err?.message || "Lỗi kết nối máy chủ khi xử lý khiếu nại.", "error");
    } finally {
      setResolvingDisputeId(null);
    }
  };

  const getEffectivePayoutStatus = (row) => {
    if (!row) return "DRAFT";
    const rawPayout = String(row.payout_status || "").trim().toUpperCase();
    if (rawPayout === "RECEIVED" || Boolean(row.received_at)) return "RECEIVED";
    const isPaidRow =
      rawPayout === "PAID" ||
      row.employee_payment_status === "PAID" ||
      row.payment_status === "PAID";
    if (isPaidRow) return "PAID";
    if (row.dispute_status !== "RESOLVED" && (rawPayout === "DISPUTED" || row.salary_confirm_status === "DISPUTED")) return "DISPUTED";
    if (rawPayout === "CONFIRMED" || row.salary_confirm_status === "CONFIRMED") return "CONFIRMED";
    if (rawPayout === "REPORT_SENT") return "REPORT_SENT";
    return "DRAFT";
  };

  const getUnconfirmedStatusLabel = (status) => {
    switch (status) {
      case "REPORT_SENT":
        return "Đã gửi báo cáo — Chưa đọc xác nhận";
      case "DISPUTED":
        return "Đang báo sai sót";
      default:
        return "Chưa gửi báo cáo";
    }
  };

  const renderPayoutStatusBadge = (row) => {
    const st = getEffectivePayoutStatus(row);
    const empCode = row?.ma_nv || row?.id_nhan_vien || "";
    if (st === "RECEIVED") {
      return (
        <span
          data-testid={`payroll-status-badge-${empCode}`}
          data-payout-status="RECEIVED"
          title={row.received_at_vn ? `Đã nhận lúc ${row.received_at_vn}` : "Nhân viên đã xác nhận nhận đủ lương"}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 font-extrabold text-xs border border-emerald-400 dark:border-emerald-600 whitespace-nowrap"
        >
          💰 Đã nhận lương
        </span>
      );
    }
    if (st === "PAID") {
      return (
        <span
          data-testid={`payroll-status-badge-${empCode}`}
          data-payout-status="PAID"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 font-bold text-xs border border-emerald-300 dark:border-emerald-700 whitespace-nowrap"
        >
          💸 Đã chuyển khoản
        </span>
      );
    }
    if (st === "CONFIRMED") {
      return (
        <span
          data-testid={`payroll-status-badge-${empCode}`}
          data-payout-status="CONFIRMED"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200 font-bold text-xs border border-teal-300 dark:border-teal-700 whitespace-nowrap"
        >
          ✓ Đã đọc báo cáo
        </span>
      );
    }
    if (st === "DISPUTED") {
      return (
        <button
          type="button"
          data-testid={`payroll-status-badge-${empCode}`}
          data-payout-status="DISPUTED"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedSlipItem(row);
          }}
          className="min-h-[44px] inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm cursor-pointer whitespace-nowrap"
          title={row.dispute_note || row.dispute_reason || "Nhấn để xem báo cáo sai sót lương"}
        >
          ⚠️ Báo sai sót (Xem)
        </button>
      );
    }
    if (st === "REPORT_SENT") {
      return (
        <span
          data-testid={`payroll-status-badge-${empCode}`}
          data-payout-status="REPORT_SENT"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 font-bold text-xs border border-amber-300 dark:border-amber-700 whitespace-nowrap"
        >
          📩 Đã gửi báo cáo
        </span>
      );
    }
    return (
      <span
        data-testid={`payroll-status-badge-${empCode}`}
        data-payout-status="DRAFT"
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-xs border border-slate-300 dark:border-slate-700 whitespace-nowrap"
      >
        Bản nháp
      </span>
    );
  };

  const handleSendAllReports = async () => {
    if (sendingAllReports) return;
    setSendingAllReports(true);
    try {
      const res = await safePost("/payroll/send-report", {
        month,
        year,
        send_all: true
      });
      if (res?.success) {
        setInternalPayroll((prev) =>
          prev.map((row) => {
            const curPayout = getEffectivePayoutStatus(row);
            if (curPayout === "PAID") return row;
            return {
              ...row,
              payout_status: "REPORT_SENT",
              salary_confirm_status: "PENDING"
            };
          })
        );
        setSendAllConfirmOpen(false);
        if (notify) {
          notify(
            res.message || `Đã gửi báo cáo xác nhận lương Tháng ${month}/${year} tới tất cả nhân sự!`,
            "success"
          );
        }
        await fetchPayrollFromApi();
        if (onRefresh) onRefresh();
      } else if (notify) {
        notify(res?.message || "Không thể gửi báo cáo lương hàng loạt.", "error");
      }
    } catch (err) {
      if (notify) notify(err?.message || "Lỗi kết nối khi gửi báo cáo lương.", "error");
    } finally {
      setSendingAllReports(false);
    }
  };

  const handleSendSingleReport = async (row, { skipModal = false } = {}) => {
    const empCode = row?.ma_nv || row?.id_nhan_vien;
    if (!empCode || sendingReportId) return;
    setSendingReportId(empCode);
    try {
      const res = await safePost("/payroll/send-report", {
        month,
        year,
        ma_nv: empCode
      });
      if (res?.success) {
        const curPaid = getEffectivePayoutStatus(row) === "PAID";
        const updatedRow = {
          ...row,
          payout_status: curPaid ? "PAID" : "REPORT_SENT",
          salary_confirm_status: curPaid ? row.salary_confirm_status : "PENDING"
        };
        setInternalPayroll((prev) =>
          prev.map((r) => ((r.ma_nv || r.id_nhan_vien) === empCode ? updatedRow : r))
        );
        setSelectedSlipItem((prev) =>
          prev && (prev.ma_nv || prev.id_nhan_vien) === empCode ? updatedRow : prev
        );
        if (!skipModal) {
          setReportModalItem(updatedRow);
        }
        if (notify) {
          notify(res.message || `Đã gửi báo cáo lương cho ${row.ho_ten || empCode}!`, "success");
        }
        fetchPayrollFromApi();
        if (onRefresh) onRefresh();
      } else if (notify) {
        notify(res?.message || "Không thể gửi báo cáo lương.", "error");
      }
    } catch (err) {
      if (notify) notify(err?.message || "Lỗi kết nối khi gửi báo cáo lương.", "error");
    } finally {
      setSendingReportId(null);
    }
  };

  const handleRequestTransfer = (row) => {
    if (!row) return;
    const status = getEffectivePayoutStatus(row);
    if (!["CONFIRMED", "PAID", "RECEIVED"].includes(status)) {
      setUnconfirmedWarnItem(row);
      return;
    }
    setTransferItem(row);
  };

  const fetchPeriodLockStatus = useCallback(async () => {
    setIsPeriodLocked(false);
    try {
      const stRes = await safeGet("/attendance/period-status", { month, year }, { cancelPrevious: false }).catch(() => null);
      setIsPeriodLocked(Boolean(stRes?.data?.is_locked));
    } catch {
      setIsPeriodLocked(false);
    }
  }, [month, year]);

  const fetchPayrollFromApi = useCallback(async () => {
    fetchPeriodLockStatus();
    if (Array.isArray(payrollData)) return payrollData;
    setLoadingPayroll(true);
    setPayrollError("");
    try {
      const res = await safeGet("/payroll", { month, year }, { cancelPrevious: true });
      if (Array.isArray(res?.data)) {
        setInternalPayroll(res.data);
        return res.data;
      }
      setInternalPayroll([]);
      return [];
    } catch (e) {
      console.warn("Lỗi tải bảng lương:", e);
      setPayrollError(e?.message || "Không thể tải bảng lương. Vui lòng thử lại.");
      return [];
    } finally {
      setLoadingPayroll(false);
    }
  }, [payrollData, month, year, fetchPeriodLockStatus]);

  useEffect(() => {
    fetchPayrollFromApi();
  }, [fetchPayrollFromApi]);

  const handleOpenAdjustmentModal = (item) => {
    const targetMonth = Number(item?.thang || month);
    const targetYear = Number(item?.nam || year);
    setAdjustItem({
      ...item,
      _targetMonth: targetMonth,
      _targetYear: targetYear
    });
    setAdjForm({
      bonus_amount: Math.max(0, Math.round(Number(item.bonusAmount) || 0)),
      penalty_amount: Math.max(0, Math.round(Number(item.penaltyAmount) || 0)),
      advance_deduction: Math.max(0, Math.round(Number(item.advanceDeduction ?? item.advance_deduction) || 0)),
      adjustment_note: item.adjustment_note || item.adjustmentNote || ""
    });
    setAdjError("");
  };

  const handleSaveAdjustment = async (e) => {
    e.preventDefault();
    if (!adjustItem || adjInFlightRef.current) return;
    const empId = adjustItem.ma_nv || adjustItem.id_nhan_vien;
    const targetMonth = Number(adjustItem._targetMonth || month);
    const targetYear = Number(adjustItem._targetYear || year);
    adjInFlightRef.current = true;
    setAdjSaving(true);
    setAdjError("");
    try {
      const res = await safePost(
        "/payroll/adjustments",
        {
          ma_nv: empId,
          month: targetMonth,
          year: targetYear,
          bonus_amount: Math.max(0, Math.round(Number(adjForm.bonus_amount) || 0)),
          penalty_amount: Math.max(0, Math.round(Number(adjForm.penalty_amount) || 0)),
          advance_deduction: Math.max(0, Math.round(Number(adjForm.advance_deduction) || 0)),
          adjustment_note: String(adjForm.adjustment_note || "").trim()
        },
        { idempotencyKey: generateIdempotencyKey("pay_adj") }
      );
      if (res?.success) {
        if (notify) notify(`Đã cập nhật thưởng / phạt / tạm ứng cho ${adjustItem.ho_ten || empId}!`, "success");
        setAdjustItem(null);
        const updatedList = await fetchPayrollFromApi();
        if (selectedSlipItem && Array.isArray(updatedList)) {
          const openId = selectedSlipItem.ma_nv || selectedSlipItem.id_nhan_vien;
          const refreshedSlip = updatedList.find((r) => (r.ma_nv || r.id_nhan_vien) === openId);
          if (refreshedSlip) setSelectedSlipItem(refreshedSlip);
        }
        setSlipRefreshTick((t) => t + 1);
        if (onRefresh) onRefresh();
      } else {
        setAdjError(res?.message || "Không thể lưu điều chỉnh.");
      }
    } catch (err) {
      setAdjError(err.message || "Lỗi kết nối máy chủ khi lưu điều chỉnh.");
    } finally {
      adjInFlightRef.current = false;
      setAdjSaving(false);
    }
  };

  const isLoading = propIsLoading || loadingPayroll;
  const sourceList = Array.isArray(payrollData) ? payrollData : internalPayroll;
  const { departmentNames, defaultDepartmentName } = useDepartments();

  const availableDepartments = Array.from(
    new Set([
      ...departmentNames,
      ...(sourceList || []).map((item) => item.department).filter(Boolean)
    ])
  );

  useEffect(() => {
    if (
      selectedDepartment !== "ALL" &&
      availableDepartments.length > 0 &&
      !availableDepartments.includes(selectedDepartment)
    ) {
      setSelectedDepartment("ALL");
    }
  }, [selectedDepartment, availableDepartments]);

  const normalizeSearchText = (val) =>
    String(val || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .trim();

  // Loại trừ tuyệt đối tài khoản Admin khỏi danh sách tính lương & đếm tổng nhân sự hợp lệ
  const payrollEmployees = (sourceList || []).filter((item) => item && item.role !== "admin");
  const openDisputes = payrollEmployees.filter(
    (item) => item.dispute_status === "OPEN" || getEffectivePayoutStatus(item) === "DISPUTED"
  );
  const totalEmployeesCount = payrollEmployees.length;
  const normalizedSearchQuery = normalizeSearchText(searchQuery);

  // Lọc tức thì (real-time, hỗ trợ tiếng Việt có dấu / không dấu) theo họ tên, mã NV, chức danh, bộ phận
  const filteredList = payrollEmployees.filter((item) => {
    const id = normalizeSearchText(item.ma_nv || item.id_nhan_vien || "");
    const name = normalizeSearchText(item.ho_ten || "");
    const role = normalizeSearchText(item.chuc_danh || "");
    const deptRaw = item.department || defaultDepartmentName;
    const dept = normalizeSearchText(deptRaw);
    const matchText =
      !normalizedSearchQuery ||
      id.includes(normalizedSearchQuery) ||
      name.includes(normalizedSearchQuery) ||
      role.includes(normalizedSearchQuery) ||
      dept.includes(normalizedSearchQuery);
    const matchDept = selectedDepartment === "ALL" || deptRaw === selectedDepartment;
    return matchText && matchDept;
  });

  useEffect(() => {
    if (!focusTarget?.ts || focusTarget.ts === lastFocusTsRef.current) return;
    if (focusTarget.category !== "salary_dispute" && focusTarget.subTab !== "payroll" && focusTarget.tab !== "payroll") return;
    if (focusTarget.ma_nv) {
      setSearchQuery(focusTarget.ma_nv);
    }
    const targetList = (Array.isArray(payrollData) ? payrollData : internalPayroll) || [];
    const matched = focusTarget.ma_nv
      ? targetList.find((item) => (item.ma_nv || item.id_nhan_vien) === focusTarget.ma_nv)
      : null;
    if (matched) {
      lastFocusTsRef.current = focusTarget.ts;
      setSelectedSlipItem(matched);
    } else if (!loadingPayroll && focusTarget.ma_nv) {
      lastFocusTsRef.current = focusTarget.ts;
    }
  }, [focusTarget, payrollData, internalPayroll, loadingPayroll]);

  // Tổng hợp số liệu cuối danh sách bảng lương
  const totalNetSalary = filteredList.reduce((acc, cur) => acc + (Number(cur.netSalary) || 0), 0);

  return (
    <div className="space-y-4 pb-8">
      {/* Khung Bảng Lương Tinh Gọn: Tìm kiếm, Kỳ lương, Chốt kỳ & Hành động */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] overflow-hidden">
        {/* Header Tìm Kiếm & Tác Vụ Siêu Gọn */}
        <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="relative w-full sm:max-w-md min-w-0">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              data-testid="payroll-search-input"
              placeholder="Tìm theo họ tên hoặc mã NV..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Tìm kiếm nhân viên theo họ tên hoặc mã nhân viên"
              className={`w-full min-h-[44px] pl-10 py-2 text-sm bg-slate-50/70 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-400 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-[#E11D48] dark:focus:border-rose-400 transition ${
                searchQuery ? "pr-10" : "pr-3.5"
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                data-testid="payroll-search-clear-btn"
                onClick={() => setSearchQuery("")}
                aria-label="Xóa từ khóa tìm kiếm"
                title="Xóa tìm kiếm"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="w-full min-w-0 flex flex-wrap items-center gap-2">
            {/* Bộ chọn kỳ lương Tháng/Năm hiện đại */}
            <MonthYearPicker
              month={month}
              year={year}
              onChange={onMonthChange}
              testIdPrefix="payroll-month-picker"
            />

            {/* Lọc theo bộ phận */}
            <select
              value={selectedDepartment}
              data-testid="payroll-department-filter"
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full sm:w-auto max-w-full min-h-[44px] px-3 py-2 text-xs sm:text-sm font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl outline-none focus:border-[#E11D48] dark:focus:border-rose-400 shadow-sm text-slate-800 dark:text-slate-100"
            >
              <option value="ALL">🏢 Tất cả bộ phận</option>
              {availableDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            {/* Nút Chốt kỳ công theo kỳ (month, year) */}
            {!isPeriodLocked && canLockPeriod && (
              <AppButton
                variant="danger"
                icon={Lock}
                disabled={isLoading}
                data-testid="payroll-period-lock-btn"
                data-period-locked="false"
                onClick={() => setShowLockModal(true)}
                className="text-xs sm:text-sm px-3.5 py-2"
              >
                🔒 Chốt kỳ công
              </AppButton>
            )}

            {isPeriodLocked && canUnlockPeriod && (
              <AppButton
                variant="warning"
                icon={Unlock}
                disabled={isLoading}
                data-testid="payroll-period-lock-btn"
                data-period-locked="true"
                onClick={() => setShowLockModal(true)}
                className="text-xs sm:text-sm px-3.5 py-2"
                title={`Kỳ công Tháng ${month}/${year} đã chốt sổ. Nhấn nếu cần mở khóa khẩn cấp.`}
              >
                🔓 Đã chốt công T{month}/{year}
              </AppButton>
            )}

            {isPeriodLocked && !canUnlockPeriod && (
              <span
                data-testid="payroll-period-lock-btn"
                data-period-locked="true"
                className="min-h-[44px] inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 text-xs font-bold px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700 whitespace-nowrap"
              >
                <Lock size={14} className="shrink-0" />
                <span>🔒 Đã chốt công T{month}/{year}</span>
              </span>
            )}

            {/* Nút Gửi Báo Cáo Lương Hàng Loạt (Chỉ Admin) */}
            {isAdmin && totalEmployeesCount > 0 && (
              <AppButton
                variant="zalo"
                icon={Send}
                loading={sendingAllReports}
                disabled={isLoading}
                data-testid="payroll-send-all-reports-btn"
                onClick={() => setSendAllConfirmOpen(true)}
                className="text-xs sm:text-sm px-3.5 py-2"
              >
                📨 Gửi báo cáo tất cả
              </AppButton>
            )}

            {/* Nút Làm Mới */}
            <AppButton
              variant="secondary"
              icon={RefreshCw}
              loading={isLoading}
              onClick={() => {
                fetchPayrollFromApi();
                if (onRefresh) onRefresh();
              }}
              aria-label="Làm mới bảng lương"
              className="min-w-[44px] px-3 py-2"
              title="Làm mới bảng lương"
            />
          </div>
        </div>

        {payrollError && (
          <div className="mx-4 mt-4 p-3.5 bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-300 dark:border-rose-700 rounded-xl text-rose-800 dark:text-rose-200 text-xs sm:text-sm font-bold flex items-center justify-between gap-2">
            <span>{payrollError}</span>
            <AppButton
              variant="danger"
              onClick={fetchPayrollFromApi}
              className="text-xs px-3.5 py-2 shrink-0"
            >
              Thử lại
            </AppButton>
          </div>
        )}

        {/* Danh sách Khiếu nại sai lệch lương/công đang mở của kỳ xem */}
        {openDisputes.length > 0 && (
          <div
            data-testid="payroll-open-disputes-banner"
            className="mx-3.5 sm:mx-4 mt-4 p-3.5 bg-rose-50/90 dark:bg-rose-950/50 border-2 border-rose-300 dark:border-rose-700 rounded-2xl space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200 font-extrabold text-xs sm:text-sm">
                <AlertTriangle size={16} className="text-rose-600 dark:text-rose-300 shrink-0" />
                <span>
                  Báo cáo sai lệch lương / công cần kiểm tra — Tháng {month}/{year} ({openDisputes.length})
                </span>
              </div>
            </div>
            <div className="space-y-2">
              {openDisputes.map((dItem) => {
                const dId = dItem.ma_nv || dItem.id_nhan_vien;
                return (
                  <div
                    key={dId}
                    data-testid={`payroll-dispute-row-${dId}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/70"
                  >
                    <div className="min-w-0 text-xs space-y-0.5">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {dItem.ho_ten || dId} <span className="font-mono text-[#E11D48] dark:text-rose-300">({dId})</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 break-words">
                        {dItem.dispute_reason || dItem.dispute_note || "Nhân viên báo cáo sai lệch số liệu lương/công"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <AppButton
                        variant="secondary"
                        icon={Eye}
                        onClick={() => setSelectedSlipItem(dItem)}
                        className="text-xs px-2.5 py-1.5"
                      >
                        Xem phiếu
                      </AppButton>
                      {(isAdmin || canApprovePayroll) && (
                        <AppButton
                          variant="success"
                          icon={CheckCircle2}
                          loading={resolvingDisputeId === dId}
                          disabled={Boolean(resolvingDisputeId)}
                          data-testid={`payroll-resolve-dispute-btn-${dId}`}
                          onClick={() => handleQuickResolveDispute(dItem)}
                          className="text-xs px-3 py-1.5"
                        >
                          ✓ Đã giải quyết
                        </AppButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Thông báo khi kỳ lương bật hiển thị số dư thực lĩnh âm */}
        {filteredList.some(item => Number(item.netSalary) < 0) && (
          <div className="mb-4 p-3.5 bg-amber-50 dark:bg-amber-950/60 border-2 border-amber-300 dark:border-amber-700 rounded-xl text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-300 shrink-0" />
              <div>
                <strong>Lưu ý đối soát thực lĩnh âm:</strong> Phát hiện nhân viên có số dư thực lĩnh âm trong kỳ (tổng khấu trừ bảo hiểm / tạm ứng vượt thu nhập). Vui lòng đối chiếu trước khi chốt chi trả.
              </div>
            </div>
          </div>
        )}

        {/* Danh sách Thẻ Bảng Lương Nhân Sự (Responsive Unified Cards — Ẩn Mọi Giá Trị 0) */}
        <div className="px-2 py-3 sm:p-4">
          {isLoading ? (
            <SkeletonList rows={4} label="Đang tải và đồng bộ bảng lương..." />
          ) : filteredList.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={
                payrollEmployees.length > 0
                  ? "Không tìm thấy nhân viên phù hợp"
                  : `Không có dữ liệu tiền lương tháng ${month}/${year}.`
              }
            />
          ) : (
            <div data-testid="payroll-cards-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {filteredList.map((item, idx) => {
                const empId = item.ma_nv || item.id_nhan_vien;
                const confirmStatus = item.salary_confirm_status || "PENDING";
                const isRowDisputed =
                  item.dispute_status === "OPEN" ||
                  (item.dispute_status !== "RESOLVED" && confirmStatus === "DISPUTED");
                const stdDays =
                  item.standardWorkDays ||
                  item.standardDays ||
                  getMonthlyStandardWorkdays(item.thang || month, item.nam || year);
                const salaryByWork = Number(item.salaryByWork) || 0;
                const otHours = Number(item.totalOtHours) || 0;
                const otPay = Number(item.otAmount ?? item.ot_pay) || 0;
                const totalAllowance = Number(item.totalAllowance ?? item.total_allowance) || 0;
                const bonusAmt = Number(item.bonusAmount) || 0;
                const penaltyAmt = Number(item.penaltyAmount) || 0;
                const latePenaltyAmt = Number(item.latePenaltyAmount) || 0;
                const advAmt = Number(item.advanceDeduction) || 0;
                const insAmt = Number(item.insuranceDeduction || item.totalInsurance) || 0;
                const effStatus = getEffectivePayoutStatus(item);
                const empPaid = ["PAID", "RECEIVED"].includes(effStatus);

                return (
                  <div
                    key={empId || idx}
                    data-testid={`payroll-card-${empId}`}
                    onClick={() => setSelectedSlipItem(item)}
                    className={`perf-list-item rounded-2xl border p-3 sm:p-4 flex flex-col justify-between gap-3 shadow-xs transition-colors cursor-pointer ${
                      isRowDisputed
                        ? "bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700"
                        : "bg-white dark:bg-slate-900 border-slate-200/85 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Header thẻ nhân viên: Avatar, Họ tên, Bộ phận & Số công */}
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar
                            name={item.ho_ten || empId}
                            avatarUrl={item.avatar_url}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-white text-sm truncate">
                              {item.ho_ten}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                              <span className="font-mono font-semibold text-[#E11D48] dark:text-rose-300">
                                {empId}
                              </span>
                              <span> • {item.department || defaultDepartmentName}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-700 text-[#16A34A] dark:text-emerald-300 text-xs font-extrabold whitespace-nowrap">
                            {formatViWorkday(item.totalWorkDays || 0)} / {formatViWorkday(stdDays)} công
                          </span>
                          {renderPayoutStatusBadge(item)}
                        </div>
                      </div>

                      {/* Chỉ hiển thị các khoản phát sinh thực tế > 0; ẩn hoàn toàn giá trị 0 / trống */}
                      {(salaryByWork > 0 ||
                        Number(item.holidayWorkAmount) > 0 ||
                        otHours > 0 ||
                        otPay > 0 ||
                        totalAllowance > 0 ||
                        bonusAmt > 0 ||
                        latePenaltyAmt > 0 ||
                        penaltyAmt > 0 ||
                        advAmt > 0 ||
                        insAmt > 0) && (
                        <div className="space-y-1.5 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                          {salaryByWork > 0 && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-slate-600 dark:text-slate-300">
                                Lương ngày công ({formatViWorkday(item.totalWorkDays || 0)} công)
                              </span>
                              <span className="font-mono font-bold text-[#111C2D] dark:text-white whitespace-nowrap">
                                {formatViCurrency(salaryByWork)}
                              </span>
                            </div>
                          )}
                          {Number(item.holidayWorkAmount) > 0 && (
                            <div
                              data-testid={`payroll-card-holiday-${empId}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="text-purple-700 dark:text-purple-300 font-semibold">
                                {buildHolidayWorkSummaryLabel(item)}
                              </span>
                              <span className="font-mono font-bold text-purple-700 dark:text-purple-300 whitespace-nowrap">
                                +{formatViCurrency(item.holidayWorkAmount)}
                              </span>
                            </div>
                          )}
                          {(otHours > 0 || otPay > 0) && (
                            <div
                              data-testid={`payroll-card-ot-${empId}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="text-slate-600 dark:text-slate-300">
                                Tăng ca OT ({formatViNumber(otHours)} giờ)
                              </span>
                              <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                                +{formatViCurrency(otPay)}
                              </span>
                            </div>
                          )}
                          {totalAllowance > 0 && (
                            <div
                              data-testid={`payroll-card-allowance-${empId}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="text-slate-600 dark:text-slate-300">Phụ cấp</span>
                              <span className="font-mono font-bold text-blue-700 dark:text-blue-300 whitespace-nowrap">
                                +{formatViCurrency(totalAllowance)}
                              </span>
                            </div>
                          )}
                          {bonusAmt > 0 && (
                            <div
                              data-testid={`payroll-card-bonus-${empId}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="text-slate-600 dark:text-slate-300">Thưởng</span>
                              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                                +{formatViCurrency(bonusAmt)}
                              </span>
                            </div>
                          )}
                          {latePenaltyAmt > 0 && (
                            <div
                              data-testid={`payroll-card-late-penalty-${empId}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="text-slate-600 dark:text-slate-300">
                                Phạt đi muộn ({formatViNumber(item.totalLateMinutes || 0, 0)} phút)
                              </span>
                              <span className="font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                -{formatViCurrency(latePenaltyAmt)}
                              </span>
                            </div>
                          )}
                          {penaltyAmt > 0 && (
                            <div
                              data-testid={`payroll-card-penalty-${empId}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="text-slate-600 dark:text-slate-300">Phạt / Khấu trừ</span>
                              <span className="font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                -{formatViCurrency(penaltyAmt)}
                              </span>
                            </div>
                          )}
                          {advAmt > 0 && (
                            <div
                              data-testid={`payroll-card-advance-${empId}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="text-slate-600 dark:text-slate-300">Tạm ứng</span>
                              <span className="font-mono font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                                -{formatViCurrency(advAmt)}
                              </span>
                            </div>
                          )}
                          {insAmt > 0 && (
                            <div
                              data-testid={`payroll-card-insurance-${empId}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="text-slate-600 dark:text-slate-300">
                                Khấu trừ BHXH ({formatViNumber(item.insuranceRatePercent ?? 10.5)}%)
                              </span>
                              <span className="font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                -{formatViCurrency(insAmt)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Thực lĩnh (Net Pay Pod) */}
                      <div className="bg-[#F0F3FF] dark:bg-slate-800/80 rounded-xl px-3 py-2.5 border border-slate-200/70 dark:border-slate-700 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          Thực lĩnh
                        </span>
                        <span className="font-extrabold text-base text-[#B80035] dark:text-rose-300 font-mono whitespace-nowrap">
                          {formatViCurrency(item.netSalary || 0)}
                        </span>
                      </div>
                    </div>

                    {/* 1 hàng đáy gọn tối đa 3 nút cân đối, chữ ngắn 2-3 từ, khoảng cách 10px, không tràn 360px */}
                    <div
                      className="flex items-center gap-2 sm:gap-2.5 pt-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <AppButton
                        variant="secondary"
                        size="compact"
                        icon={FileText}
                        data-testid={`payroll-view-detail-btn-${empId}`}
                        onClick={() => setSelectedSlipItem(item)}
                        className="flex-auto min-w-0 whitespace-nowrap"
                      >
                        {isRowDisputed ? "Khiếu nại" : "Xem phiếu"}
                      </AppButton>

                      {isAdmin && (
                        <AppButton
                          variant="zalo"
                          size="compact"
                          icon={Send}
                          loading={sendingReportId === empId}
                          disabled={Boolean(sendingReportId)}
                          data-testid={`payroll-send-report-btn-${empId}`}
                          onClick={() => handleSendSingleReport(item)}
                          className="flex-auto min-w-0 whitespace-nowrap"
                        >
                          Gửi báo cáo
                        </AppButton>
                      )}

                      {canManagePayment && (
                        <AppButton
                          variant={empPaid ? "success" : "primary"}
                          size="compact"
                          icon={empPaid ? CheckCircle2 : Send}
                          data-testid={`payroll-transfer-btn-${empId}`}
                          onClick={() => handleRequestTransfer(item)}
                          className={`flex-auto min-w-0 whitespace-nowrap ${
                            empPaid ? "" : "bg-[#0051CA] hover:bg-blue-700 border-[#0051CA]"
                          }`}
                        >
                          {empPaid ? "Đã chuyển" : "Chuyển khoản"}
                        </AppButton>
                      )}

                      {!isAdmin && canCalculatePayroll && !empPaid && !isPeriodLocked && (
                        <AppButton
                          variant="ghost"
                          size="compact"
                          icon={SlidersHorizontal}
                          data-testid={`payroll-adjust-btn-${empId}`}
                          onClick={() => handleOpenAdjustmentModal(item)}
                          className="flex-auto min-w-0 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 whitespace-nowrap"
                        >
                          Điều chỉnh
                        </AppButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filteredList.length > 0 && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
              <span className="font-bold text-slate-700 dark:text-slate-200">
                Tổng quỹ lương Thực lĩnh kỳ Tháng {month}/{year}
              </span>
              <span className="font-mono font-extrabold text-base text-emerald-700 dark:text-emerald-300">
                {formatViCurrency(totalNetSalary)}
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Modal Phiếu Lương 1 Lớp Toàn Màn Hình */}
      {selectedSlipItem && (
        <SalarySlipModal
          payrollItem={selectedSlipItem}
          targetMaNv={selectedSlipItem.ma_nv || selectedSlipItem.id_nhan_vien}
          month={month}
          year={year}
          isAdminOrAccountant={isAdmin || isAccountant}
          isAdminUser={isAdmin}
          employeeList={filteredList}
          onSelectEmployee={(emp) => setSelectedSlipItem(emp)}
          canAdjust={isAdmin || canCalculatePayroll}
          canManagePayment={canManagePayment}
          canApprovePayroll={canApprovePayroll}
          canExportPayroll={canExportPayroll}
          onOpenAdjustment={(slip) => handleOpenAdjustmentModal(slip)}
          onOpenTransfer={(slip) => handleRequestTransfer(slip)}
          onSendReport={(slip) => handleSendSingleReport(slip, { skipModal: true })}
          refreshKey={slipRefreshTick}
          showToast={notify}
          onStatusUpdated={() => {
            fetchPayrollFromApi();
            if (onRefresh) onRefresh();
          }}
          onClose={() => setSelectedSlipItem(null)}
        />
      )}

      {/* Modal Chuyển khoản lương VietQR (--z-nested-modal chồng chuẩn trên SalarySlipModal) */}
      <BankTransferModal
        open={Boolean(transferItem)}
        item={transferItem}
        month={month}
        year={year}
        isAdminUser={isAdmin}
        canEditEmployeeBank={isAdmin || dynamicPerms?.employee_edit === true}
        showToast={notify}
        onClose={() => setTransferItem(null)}
        onBankSaved={(targetMaNv, bankData) => {
          setInternalPayroll((prev) =>
            prev.map((row) =>
              (row.ma_nv || row.id_nhan_vien) === targetMaNv ? { ...row, ...bankData } : row
            )
          );
          setSelectedSlipItem((prev) =>
            prev && (prev.ma_nv || prev.id_nhan_vien) === targetMaNv
              ? { ...prev, ...bankData }
              : prev
          );
          setTransferItem((prev) =>
            prev && (prev.ma_nv || prev.id_nhan_vien) === targetMaNv
              ? { ...prev, ...bankData }
              : prev
          );
          setSlipRefreshTick((t) => t + 1);
          fetchPayrollFromApi();
        }}
        onConfirmedPaid={(payoutData) => {
          const targetMaNv = payoutData?.ma_nv || transferItem?.ma_nv || transferItem?.id_nhan_vien;
          if (targetMaNv) {
            const patch = {
              employee_payment_status: "PAID",
              payout_status: "PAID",
              transfer_note: payoutData?.transfer_note || null,
              employee_paid_at: payoutData?.employee_paid_at || new Date().toISOString(),
              employee_paid_at_vn: payoutData?.employee_paid_at_vn || null,
              employee_paid_by: payoutData?.employee_paid_by || null
            };
            setInternalPayroll((prev) =>
              prev.map((row) =>
                (row.ma_nv || row.id_nhan_vien) === targetMaNv ? { ...row, ...patch } : row
              )
            );
            setSelectedSlipItem((prev) =>
              prev && (prev.ma_nv || prev.id_nhan_vien) === targetMaNv
                ? { ...prev, ...patch }
                : prev
            );
          }
          setSlipRefreshTick((t) => t + 1);
          fetchPayrollFromApi();
          if (onRefresh) onRefresh();
        }}
      />

      {/* Modal Điều chỉnh Thưởng / Phạt / Tạm ứng (F2) — --z-nested-modal nổi trên SalarySlipModal */}
      <AppModal
        open={Boolean(adjustItem)}
        onClose={() => !adjSaving && setAdjustItem(null)}
        disableClose={adjSaving}
        nested={true}
        title="Điều chỉnh thưởng / phạt"
        subtitle={
          adjustItem
            ? `${adjustItem.ho_ten} (${adjustItem.ma_nv || adjustItem.id_nhan_vien}) • Tháng ${adjustItem._targetMonth || month}/${adjustItem._targetYear || year}`
            : ""
        }
        maxWidthClass="max-w-md"
        footer={
          <div className="flex gap-2.5">
            <AppButton
              variant="secondary"
              disabled={adjSaving}
              onClick={() => setAdjustItem(null)}
              className="flex-1"
            >
              Đóng / Quay lại
            </AppButton>
            <AppButton
              type="submit"
              form="payroll-adjust-form"
              variant="primary"
              loading={adjSaving}
              loadingText="Đang lưu..."
              className="flex-1"
            >
              Lưu điều chỉnh
            </AppButton>
          </div>
        }
      >
        {adjustItem && (
          <form
            id="payroll-adjust-form"
            data-testid="payroll-adjust-form"
            onSubmit={handleSaveAdjustment}
            className="p-4 space-y-4"
          >
            {adjError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs font-semibold">
                {adjError}
              </div>
            )}

            <div className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/70 overflow-hidden">
              <FormRow label="Tiền thưởng thêm (VNĐ)">
                <input
                  type="text"
                  data-testid="adj-bonus-input"
                  inputMode="numeric"
                  value={formatViNumber(adjForm.bonus_amount, 0)}
                  onChange={(e) => setAdjForm((f) => ({ ...f, bonus_amount: Math.max(0, Math.round(parseViNumberInput(e.target.value))) }))}
                  className="w-36 min-h-[44px] px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-semibold text-emerald-700 dark:text-emerald-300 text-right focus:outline-none focus:border-emerald-600"
                />
              </FormRow>
              <FormRow label="Khấu trừ phạt (VNĐ)">
                <input
                  type="text"
                  data-testid="adj-penalty-input"
                  inputMode="numeric"
                  value={formatViNumber(adjForm.penalty_amount, 0)}
                  onChange={(e) => setAdjForm((f) => ({ ...f, penalty_amount: Math.max(0, Math.round(parseViNumberInput(e.target.value))) }))}
                  className="w-36 min-h-[44px] px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-semibold text-rose-700 dark:text-rose-300 text-right focus:outline-none focus:border-rose-500"
                />
              </FormRow>
              <FormRow label="Tạm ứng đã trừ (VNĐ)">
                <input
                  type="text"
                  data-testid="adj-advance-input"
                  inputMode="numeric"
                  value={formatViNumber(adjForm.advance_deduction, 0)}
                  onChange={(e) => setAdjForm((f) => ({ ...f, advance_deduction: Math.max(0, Math.round(parseViNumberInput(e.target.value))) }))}
                  className="w-36 min-h-[44px] px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-semibold text-amber-800 dark:text-amber-300 text-right focus:outline-none focus:border-amber-500"
                />
              </FormRow>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Ghi chú điều chỉnh (hiển thị trên phiếu lương)</label>
              <textarea
                rows={2}
                value={adjForm.adjustment_note}
                onChange={(e) => setAdjForm((f) => ({ ...f, adjustment_note: e.target.value }))}
                placeholder="Ví dụ: Thưởng hoàn thành vượt tiến độ công trình..."
                className="w-full px-3 py-2 border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#E11D48] leading-relaxed"
              />
            </div>
          </form>
        )}
      </AppModal>

      {/* Modal Chốt / Mở Lại Kỳ Công (từ Bảng Lương - V48) */}
      {showLockModal && (
        <PeriodLockModal
          month={month}
          year={year}
          isCurrentlyLocked={isPeriodLocked}
          userRole={effectiveRole}
          onClose={() => setShowLockModal(false)}
          onStatusChanged={(newLocked) => {
            setIsPeriodLocked(Boolean(newLocked));
            if (notify) {
              notify(
                newLocked
                  ? `Đã chốt sổ kỳ công Tháng ${month}/${year} thành công!`
                  : `Đã mở khóa kỳ công Tháng ${month}/${year}!`,
                "success"
              );
            }
            fetchPayrollFromApi();
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Modal Tiện Ích Chia Sẻ Báo Cáo Lương Qua Zalo & Xuất Excel (.xlsx) */}
      <SalaryReportModal
        open={Boolean(reportModalItem)}
        item={reportModalItem}
        month={month}
        year={year}
        canExportPayroll={canExportPayroll}
        showToast={notify}
        onClose={() => setReportModalItem(null)}
      />

      {/* Hộp thoại Xác nhận Gửi Báo Cáo Hàng Loạt */}
      <ConfirmDialog
        open={sendAllConfirmOpen}
        variant="primary"
        title="Gửi báo cáo xác nhận lương"
        message={`Gửi báo cáo xác nhận lương Tháng ${month}/${year} tới tất cả nhân sự & kế toán?`}
        confirmLabel="📨 Gửi tất cả ngay"
        cancelLabel="Đóng"
        loading={sendingAllReports}
        onConfirm={handleSendAllReports}
        onCancel={() => !sendingAllReports && setSendAllConfirmOpen(false)}
      />

      {/* Modal Cảnh Báo Linh Hoạt Khi Nhân Viên Chưa Xác Nhận Lương Trước Lúc Chuyển Khoản */}
      {unconfirmedWarnItem && (
        <AppModal
          open={Boolean(unconfirmedWarnItem)}
          onClose={() => setUnconfirmedWarnItem(null)}
          nested={true}
          maxWidthClass="sm:max-w-md"
          icon={
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
          }
          title="⚠️ Nhân viên chưa xác nhận báo cáo lương"
          subtitle={`${unconfirmedWarnItem.ho_ten || unconfirmedWarnItem.ma_nv} • Tháng ${month}/${year}`}
          footer={
            <div className="space-y-2 w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <AppButton
                  variant="zalo"
                  icon={Send}
                  loading={sendingReportId === (unconfirmedWarnItem.ma_nv || unconfirmedWarnItem.id_nhan_vien)}
                  data-testid="warn-send-report-first-btn"
                  onClick={async () => {
                    const targetRow = unconfirmedWarnItem;
                    setUnconfirmedWarnItem(null);
                    await handleSendSingleReport(targetRow);
                  }}
                  className="w-full text-xs font-bold"
                >
                  📨 Gửi báo cáo trước
                </AppButton>
                <AppButton
                  variant="warning"
                  data-testid="warn-continue-transfer-btn"
                  onClick={() => {
                    const targetRow = unconfirmedWarnItem;
                    setUnconfirmedWarnItem(null);
                    setTransferItem(targetRow);
                  }}
                  className="w-full text-xs font-extrabold"
                >
                  Vẫn tiếp tục chuyển khoản
                </AppButton>
              </div>
              <AppButton
                variant="secondary"
                fullWidth
                onClick={() => setUnconfirmedWarnItem(null)}
                className="text-xs"
              >
                Đóng / Quay lại
              </AppButton>
            </div>
          }
        >
          <div data-testid="unconfirmed-transfer-warning-modal" className="p-4 sm:p-5 text-sm text-slate-700 dark:text-slate-200 leading-relaxed space-y-2.5">
            <p>
              Nhân viên <strong className="text-[#111C2D] dark:text-white">{unconfirmedWarnItem.ho_ten}</strong> hiện chưa bấm xác nhận báo cáo lương Tháng {month}/{year}{" "}
              (Trạng thái:{" "}
              <strong className="text-amber-700 dark:text-amber-300">
                {getUnconfirmedStatusLabel(getEffectivePayoutStatus(unconfirmedWarnItem))}
              </strong>
              ).
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Bạn có muốn gửi báo cáo xác nhận trước, hoặc chủ động tiếp tục mở chuyển khoản ngay bây giờ?
            </p>
          </div>
        </AppModal>
      )}

    </div>
  );
}
