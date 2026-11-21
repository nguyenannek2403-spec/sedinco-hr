import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Download,
  FileText,
  Users,
  X,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertTriangle,
  Calculator,
  CheckCircle2,
  SlidersHorizontal,
  Undo2,
  Wallet,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp,
  Calendar,
  Send
} from "lucide-react";
import SalarySlipModal from "./SalarySlipModal";
import BankTransferModal from "./BankTransferModal";
import { AppButton, AppModal, FormRow, StatusBadge, SkeletonList, EmptyState, UserAvatar } from "./ui";
import { safeGet, safePost, formatCsvCellRFC4180, generateIdempotencyKey } from "../utils/api";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { DEPARTMENT_OPTIONS } from "../utils/viLabels";
import {
  formatViNumber,
  formatViCurrency,
  formatViWorkday,
  parseViNumberInput
} from "../utils/viNumberFormat";

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
  const canExportPayroll = isAdmin || dynamicPerms?.payroll_export !== false;
  const canApprovePayroll = isAdmin || dynamicPerms?.payroll_approve === true;
  const canManagePayment = isAdmin || dynamicPerms?.payroll_payment_status_manage === true;
  const notify = showToast || onShowToast;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("ALL");
  const [selectedSlipItem, setSelectedSlipItem] = useState(null);
  const [slipRefreshTick, setSlipRefreshTick] = useState(0);
  const [internalPayroll, setInternalPayroll] = useState([]);
  const [periodStatus, setPeriodStatus] = useState(null);
  const [loadingPayroll, setLoadingPayroll] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const adjInFlightRef = useRef(false);
  const rejectInFlightRef = useRef(false);
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
  const [viewMode, setViewMode] = useState("overview"); // 'overview' | 'detailed'
  const [expandedDailyLogs, setExpandedDailyLogs] = useState({});
  const [transferItem, setTransferItem] = useState(null);

  const toggleDailyLogsRow = (empId) => {
    setExpandedDailyLogs((prev) => ({ ...prev, [empId]: !prev[empId] }));
  };

  const fetchPeriodStatus = useCallback(async () => {
    try {
      const stRes = await safeGet("/payroll/status-list", { month, year }, { cancelPrevious: false }).catch(() => null);
      if (stRes?.success && Array.isArray(stRes.data)) {
        const matched = stRes.data.find((r) => Number(r.month) === Number(month) && Number(r.year) === Number(year));
        setPeriodStatus(matched || { month, year, status: "DRAFT", payment_status: "UNPAID" });
      }
    } catch {
      // Bỏ qua nếu role không được phép đọc status-list
    }
  }, [month, year]);

  const fetchPayrollFromApi = useCallback(async () => {
    fetchPeriodStatus();
    if (Array.isArray(payrollData)) return payrollData;
    setLoadingPayroll(true);
    setPayrollError("");
    try {
      const res = await safeGet("/payroll", { month, year }, { cancelPrevious: true });
      if (Array.isArray(res?.data) && res.data.length > 0) {
        setInternalPayroll(res.data);
        return res.data;
      } else {
        // Nếu chưa có bản lưu, tự động gọi /payroll/calculate để hiển thị bảng tính lương tạm tính
        const calcRes = await safeGet("/payroll/calculate", { month, year }, { cancelPrevious: true });
        if (Array.isArray(calcRes?.data)) {
          setInternalPayroll(calcRes.data);
          return calcRes.data;
        } else {
          setInternalPayroll([]);
          return [];
        }
      }
    } catch (e) {
      console.warn("Lỗi tải bảng lương:", e);
      setPayrollError(e?.message || "Không thể tải bảng lương. Vui lòng thử lại.");
      return [];
    } finally {
      setLoadingPayroll(false);
    }
  }, [payrollData, month, year, fetchPeriodStatus]);

  useEffect(() => {
    fetchPayrollFromApi();
  }, [fetchPayrollFromApi]);

  const handleCalculatePayroll = async () => {
    setCalculating(true);
    try {
      const res = await safePost("/payroll/calculate", { month, year }, {
        idempotencyKey: generateIdempotencyKey("pay_calc")
      });
      if (res?.success && Array.isArray(res.data)) {
        setInternalPayroll(res.data);
        if (notify) notify(`Đã tính toán xong bảng lương tháng ${month}/${year}!`, "success");
      } else {
        await fetchPayrollFromApi();
      }
    } catch (err) {
      if (notify) notify(err.message || "Lỗi tính toán bảng lương.", "error");
    } finally {
      setCalculating(false);
    }
  };

  const handleApprovePayroll = async () => {
    setApproving(true);
    try {
      const res = await safePost("/payroll/approve", { month, year }, {
        idempotencyKey: generateIdempotencyKey("pay_approve")
      });
      if (res?.success) {
        if (res.data) setPeriodStatus(res.data);
        if (notify) notify(`Đã duyệt và phát hành Phiếu Lương tháng ${month}/${year} cho toàn bộ nhân viên!`, "success");
        await fetchPayrollFromApi();
      }
    } catch (err) {
      if (notify) notify(err.message || "Không thể duyệt bảng lương.", "error");
    } finally {
      setApproving(false);
    }
  };

  const handleSubmitRejectPayroll = async (e) => {
    e.preventDefault();
    if (rejectInFlightRef.current) return;
    const cleanReason = String(rejectReason || "").trim();
    if (!cleanReason) {
      setRejectError("Vui lòng nhập lý do cần Kế toán chỉnh sửa lại.");
      return;
    }
    rejectInFlightRef.current = true;
    setRejecting(true);
    setRejectError("");
    try {
      const res = await safePost("/payroll/reject", { month, year, reason: cleanReason }, {
        idempotencyKey: generateIdempotencyKey("pay_reject")
      });
      if (res?.success) {
        if (res.data) setPeriodStatus(res.data);
        setRejectModalOpen(false);
        setRejectReason("");
        if (notify) notify(res.message || `Đã trả lại bảng lương tháng ${month}/${year} cho Kế toán!`, "warning");
        await fetchPayrollFromApi();
      } else {
        setRejectError(res?.message || "Không thể trả lại bảng lương.");
      }
    } catch (err) {
      setRejectError(err.message || "Lỗi kết nối máy chủ.");
    } finally {
      rejectInFlightRef.current = false;
      setRejecting(false);
    }
  };

  const handleConfirmPaid = async () => {
    setPaying(true);
    try {
      const res = await safePost("/payroll/payment-status", { month, year, status: "PAID" }, {
        idempotencyKey: generateIdempotencyKey("pay_paid")
      });
      if (res?.success) {
        if (res.data) setPeriodStatus(res.data);
        if (notify) notify(res.message || `Đã xác nhận chi trả lương tháng ${month}/${year}!`, "success");
        await fetchPayrollFromApi();
      } else {
        if (notify) notify(res?.message || "Không thể cập nhật trạng thái chi trả.", "error");
      }
    } catch (err) {
      if (notify) notify(err.message || "Không thể xác nhận chi trả lương.", "error");
    } finally {
      setPaying(false);
    }
  };

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

  const availableDepartments = Array.from(
    new Set([
      ...DEPARTMENT_OPTIONS,
      ...(sourceList || []).map((item) => item.department).filter(Boolean)
    ])
  );

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
  const totalEmployeesCount = payrollEmployees.length;
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const isFiltering = Boolean(normalizedSearchQuery) || selectedDepartment !== "ALL";

  // Lọc tức thì (real-time, hỗ trợ tiếng Việt có dấu / không dấu) theo họ tên, mã NV, chức danh, bộ phận
  const filteredList = payrollEmployees.filter((item) => {
    const id = normalizeSearchText(item.ma_nv || item.id_nhan_vien || "");
    const name = normalizeSearchText(item.ho_ten || "");
    const role = normalizeSearchText(item.chuc_danh || "");
    const deptRaw = item.department || "Khối Công trình";
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

  // Tổng hợp số liệu footer bảng đối soát
  const totalNetSalary = filteredList.reduce((acc, cur) => acc + (Number(cur.netSalary) || 0), 0);
  const totalWorkDays = filteredList.reduce((acc, cur) => acc + (Number(cur.totalWorkDays) || 0), 0);

  // Xuất file CSV UTF-8 BOM chuẩn tiếng Việt
  const handleExportCSV = async () => {
    const headers = [
      "Mã NV",
      "Họ và Tên",
      "Chức Danh",
      "Lương Cơ Bản",
      "Ngày Công",
      "Lương Theo Công",
      "Phụ Cấp Ăn Trưa",
      "Phụ Cấp Xăng Xe",
      "Phụ Cấp Nhà Ở",
      "Thưởng HTCV",
      "Phụ Cấp Trách Nhiệm",
      "Tổng Phụ Cấp",
      "Tiền Tăng Ca (OT)",
      "Thưởng Thêm",
      "Phạt / Khấu Trừ",
      "Tạm Ứng Đã Trừ",
      "Ghi Chú Điều Chỉnh",
      "Khấu Trừ BHXH (10.5%)",
      "Thực Lĩnh (Net)"
    ];

    const rows = filteredList.map(item => {
      const b = item.allowances_breakdown || {};
      const totalAllowance = Number(item.totalAllowance) || 0;
      const anTrua = Number(b.an_trua) || 0;
      const xangXe = Number(b.xang_xe) || 0;
      const nhaO = Number(b.nha_o) || 0;
      const thuong = Number(b.thuong_htcv) || 0;
      const trachNhiem = Number(b.trach_nhiem) || (totalAllowance > (anTrua + xangXe + nhaO + thuong) ? totalAllowance - (anTrua + xangXe + nhaO + thuong) : 0);

      return [
        formatCsvCellRFC4180(item.ma_nv || item.id_nhan_vien || ""),
        formatCsvCellRFC4180(item.ho_ten || ""),
        formatCsvCellRFC4180(item.chuc_danh || "Nhân viên"),
        Number(item.baseSalary) || 0,
        Number(item.totalWorkDays) || 0,
        Number(item.salaryByWork) || 0,
        anTrua,
        xangXe,
        nhaO,
        thuong,
        trachNhiem,
        totalAllowance,
        Number(item.otAmount) || 0,
        Number(item.bonusAmount) || 0,
        Number(item.penaltyAmount) || 0,
        Number(item.advanceDeduction) || 0,
        formatCsvCellRFC4180(item.adjustment_note || item.adjustmentNote || ""),
        Number(item.insuranceDeduction || item.totalInsurance) || 0,
        Number(item.netSalary) || 0
      ];
    });

    const csvContent = "\uFEFF" + [headers.map(formatCsvCellRFC4180).join(","), ...rows.map(r => r.join(","))].join("\n");
    try {
      await zmpAdapter.saveFile({
        filename: `Bang_Luong_Sedinco_Thang_${month}_${year}.csv`,
        content: csvContent,
        mimeType: "text/csv;charset=utf-8;"
      });
      if (notify) notify(`Đã tải xuống bảng lương Tháng ${month}/${year}!`, "success");
    } catch (err) {
      if (notify) notify(err?.message || "Không thể tải xuống tệp bảng lương!", "error");
    }
  };

  const handleDownloadBackupSnapshot = async () => {
    setBackingUp(true);
    try {
      const res = await safeGet("/payroll/backup-snapshot", { month, year }, { cancelPrevious: false });
      const snapshot = res?.data || res;
      await zmpAdapter.saveFile({
        filename: `Sedinco_Backup_Thang_${month}_${year}.json`,
        content: JSON.stringify(snapshot, null, 2),
        mimeType: "application/json;charset=utf-8;"
      });
      if (notify) notify(`Đã sao lưu dữ liệu Tháng ${month}/${year} thành công!`, "success");
    } catch (err) {
      if (notify) notify(err?.message || "Không thể sao lưu dữ liệu tháng lúc này!", "error");
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Thanh Công Cụ Tinh Gọn: Đếm Nhân Sự & Tìm Kiếm Nhanh */}
      <div
        data-testid="payroll-summary-header"
        className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      >
        <div
          data-testid="payroll-employee-count"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#F0F3FF] dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 text-xs sm:text-sm font-bold text-[#111C2D] dark:text-slate-100 shrink-0 self-start sm:self-auto"
        >
          <Users size={16} className="text-[#E11D48] dark:text-rose-400 shrink-0" />
          <span>
            {isLoading && totalEmployeesCount === 0
              ? "Đang tải nhân sự..."
              : isFiltering
                ? `Hiển thị ${formatViNumber(filteredList.length, 0)} / ${formatViNumber(totalEmployeesCount, 0)} nhân viên`
                : `Số lượng nhân viên: ${formatViNumber(totalEmployeesCount, 0)} nhân viên`}
          </span>
        </div>

        <div className="relative w-full sm:flex-1 sm:max-w-md min-w-0">
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
      </div>

      {/* Bảng Chi Tiết Toàn Bộ Nhân Sự */}
      <div className="md:bg-white md:dark:bg-slate-900 md:rounded-2xl md:border md:border-slate-100/90 md:dark:border-slate-800 md:shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] overflow-hidden">
        {/* Header Tác Vụ Tinh Gọn */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-none mb-3 md:mb-0 p-3.5 sm:p-4 border border-slate-100/90 dark:border-slate-800 md:border-0 md:border-b space-y-2.5">
          {periodStatus?.status === "REJECTED" && periodStatus?.rejected_reason && (
            <div className="inline-flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/70 text-rose-800 dark:text-rose-200 text-xs font-semibold">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-300" />
              <span>Lý do trả lại chỉnh sửa: {periodStatus.rejected_reason}</span>
            </div>
          )}

          <div className="w-full min-w-0 flex flex-wrap items-center gap-2">
            {/* Thanh chuyển đổi Tổng quan / Chi tiết */}
            <div
              data-filter-group="payroll-view-mode"
              className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex items-center p-1 rounded-xl bg-[#F0F3FF] dark:bg-slate-950 border border-slate-200 dark:border-slate-700 gap-1"
            >
              <button
                type="button"
                data-testid="payroll-mode-overview"
                data-active={viewMode === "overview" ? "true" : "false"}
                onClick={() => setViewMode("overview")}
                className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                  viewMode === "overview"
                    ? "bg-[#E11D48] text-white shadow-sm dark:bg-rose-600"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <LayoutGrid size={14} className="shrink-0" />
                <span>Tổng quan</span>
              </button>
              <button
                type="button"
                data-testid="payroll-mode-detailed"
                data-active={viewMode === "detailed" ? "true" : "false"}
                onClick={() => setViewMode("detailed")}
                className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                  viewMode === "detailed"
                    ? "bg-[#E11D48] text-white shadow-sm dark:bg-rose-600"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <List size={14} className="shrink-0" />
                <span>Chi tiết</span>
              </button>
            </div>

            {periodStatus && (
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge type="payroll_period" status={periodStatus.status || "DRAFT"} />
                {(periodStatus.status === "APPROVED" || periodStatus.payment_status === "PAID") && (
                  <StatusBadge type="payment" status={periodStatus.payment_status || "UNPAID"} />
                )}
              </div>
            )}

            {/* Bộ chọn tháng/năm */}
            <div className="flex items-center bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-xl px-1.5 py-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => onMonthChange(month > 1 ? month - 1 : 12, month > 1 ? year : year - 1)}
                className="min-w-[44px] min-h-[44px] p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer flex items-center justify-center"
                title="Tháng trước"
                aria-label="Tháng trước"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="font-bold text-sm px-2.5 text-slate-900 dark:text-white whitespace-nowrap">
                Tháng {month}/{year}
              </span>
              <button
                type="button"
                onClick={() => onMonthChange(month < 12 ? month + 1 : 1, month < 12 ? year : year + 1)}
                className="min-w-[44px] min-h-[44px] p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer flex items-center justify-center"
                title="Tháng sau"
                aria-label="Tháng sau"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Lọc theo bộ phận */}
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full sm:w-auto max-w-full min-h-[44px] px-3 py-2 text-sm font-semibold bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-xl outline-none focus:border-[#E11D48] dark:focus:border-rose-400 shadow-sm text-slate-800 dark:text-slate-100"
            >
              <option value="ALL">🏢 Tất cả bộ phận</option>
              {availableDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            {/* Nút Tính Lương Tự Động (Nghiệp vụ riêng của Kế toán) */}
            {canCalculatePayroll && (
              <AppButton
                variant="primary"
                icon={Calculator}
                loading={calculating}
                disabled={isLoading}
                loadingText="Đang tính..."
                onClick={handleCalculatePayroll}
                className="text-xs sm:text-sm px-3.5 py-2"
              >
                Tính lương
              </AppButton>
            )}

            {/* Nút Duyệt & Phát Hành Phiếu Lương */}
            {canApprovePayroll && (
              <AppButton
                variant="zalo"
                icon={CheckCircle2}
                loading={approving}
                disabled={isLoading}
                loadingText="Đang lưu..."
                onClick={handleApprovePayroll}
                className="text-xs sm:text-sm px-3.5 py-2"
              >
                Chốt &amp; Phát hành
              </AppButton>
            )}

            {/* Nút Trả lại Kế toán (kèm lý do) dành cho Admin / người có quyền duyệt */}
            {(isAdmin || canApprovePayroll) && periodStatus?.payment_status !== "PAID" && (
              <AppButton
                variant="danger"
                icon={Undo2}
                disabled={isLoading}
                onClick={() => {
                  setRejectError("");
                  setRejectModalOpen(true);
                }}
                className="text-xs sm:text-sm px-3.5 py-2"
              >
                Trả lại Kế toán
              </AppButton>
            )}

            {/* Nút Xác nhận Đã Chi Trả Lương */}
            {canManagePayment && periodStatus?.status === "APPROVED" && periodStatus?.payment_status !== "PAID" && (
              <AppButton
                variant="success"
                icon={Wallet}
                loading={paying}
                disabled={isLoading}
                loadingText="Đang xác nhận..."
                onClick={handleConfirmPaid}
                className="text-xs sm:text-sm px-3.5 py-2"
              >
                Xác nhận Đã Chi Trả Lương
              </AppButton>
            )}

            {/* Nút Xuất CSV & Sao lưu dữ liệu tháng */}
            {canExportPayroll && (
              <>
                <AppButton
                  variant="success"
                  icon={Download}
                  onClick={handleExportCSV}
                  className="text-xs sm:text-sm px-3.5 py-2"
                >
                  Xuất CSV
                </AppButton>
                <AppButton
                  variant="secondary"
                  icon={Download}
                  loading={backingUp}
                  loadingText="Đang sao lưu..."
                  onClick={handleDownloadBackupSnapshot}
                  className="text-xs sm:text-sm px-3.5 py-2"
                >
                  Sao lưu dữ liệu tháng
                </AppButton>
              </>
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

        {viewMode === "detailed" ? (
          <div className="p-3 sm:p-5 space-y-4">
            {isLoading ? (
              <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl">
                <SkeletonList rows={3} label="Đang tải bảng lương chi tiết..." />
              </div>
            ) : filteredList.length === 0 ? (
              <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl">
                <EmptyState
                  icon={FileText}
                  title={
                    payrollEmployees.length > 0
                      ? "Không tìm thấy nhân viên phù hợp"
                      : `Không có dữ liệu tiền lương tháng ${month}/${year}.`
                  }
                />
              </div>
            ) : (
              filteredList.map((item, idx) => {
                const empId = item.ma_nv || item.id_nhan_vien;
                const confirmStatus = item.salary_confirm_status || "PENDING";
                const b = item.allowances_breakdown || {};
                const detailedAllowanceDefs = [
                  { key: "an_trua", alt: "an_ca", label: "Ăn trưa" },
                  { key: "xang_xe", alt: "xang", label: "Xăng xe" },
                  { key: "nha_o", alt: "doc_hai", label: "Nhà ở" },
                  { key: "thuong_htcv", label: "Thưởng HTCV" },
                  { key: "trach_nhiem", label: "Trách nhiệm" },
                  { key: "tiep_khach", alt: "dien_thoai", label: "ĐT / Tiếp khách" }
                ];
                const positiveAllowances = Array.isArray(item.allowances)
                  ? item.allowances.filter((a) => Number(a.amount) > 0)
                  : detailedAllowanceDefs
                      .map((def) => ({
                        key: def.key,
                        label: def.label,
                        amount: Number(b[def.key] ?? (def.alt ? b[def.alt] : 0)) || 0
                      }))
                      .filter((a) => a.amount > 0);
                const totalPositiveAllowance = Number(item.totalAllowance ?? item.total_allowance ?? 0);
                const showAllowanceCard = positiveAllowances.length > 0 && totalPositiveAllowance > 0;
                const bonusAmt = Number(item.bonusAmount) || 0;
                const penaltyAmt = Number(item.penaltyAmount) || 0;
                const latePenaltyAmt = Number(item.latePenaltyAmount) || 0;
                const advAmt = Number(item.advanceDeduction) || 0;
                const debtAmt = Number(item.carryOverDebt || item.carry_over_debt) || 0;
                const dailyLogs = Array.isArray(item.daily_logs) ? item.daily_logs : [];
                const isExpanded = Boolean(expandedDailyLogs[empId]);
                const unitWage = item.unitDailyWage || Math.round((Number(item.baseSalary) || 0) / (Number(item.standardWorkDays) || 26));

                return (
                  <div
                    key={empId || idx}
                    data-testid={`detailed-payroll-card-${empId}`}
                    className={`rounded-2xl border p-4 sm:p-5 space-y-4 shadow-sm ${
                      confirmStatus === "DISPUTED"
                        ? "bg-rose-50/70 dark:bg-rose-950/35 border-rose-300 dark:border-rose-700"
                        : "bg-slate-50/60 dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {/* Header Nhân viên + Thực lĩnh NET */}
                    <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-start gap-3 min-w-0">
                        <UserAvatar
                          name={item.ho_ten || empId}
                          avatarUrl={item.avatar_url}
                          size="md"
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#FFE4E6] dark:bg-rose-950/60 text-[#E11D48] dark:text-rose-200 border border-rose-200 dark:border-rose-800">
                              {empId}
                            </span>
                            <h4 className="font-extrabold text-base text-slate-900 dark:text-white break-words">
                              {item.ho_ten}
                            </h4>
                            {Number(item.probationPercent || 100) < 100 && (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                                Thử việc {item.probationPercent}%
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            {item.chuc_danh || "Nhân viên"} • {item.department || "Khối Công trình"}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                          Thực lĩnh (NET)
                        </div>
                        <div className="text-lg sm:text-xl font-black text-emerald-700 dark:text-emerald-300 font-mono">
                          {formatViCurrency(item.netSalary)}
                        </div>
                      </div>
                    </div>

                    {/* Lưới Bóc Tách Chi Tiết (Ẩn hoàn toàn khối Phụ cấp nếu = 0) */}
                    <div className={`grid grid-cols-1 sm:grid-cols-2 ${showAllowanceCard ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-3 text-xs`}>
                      {/* 1. Lương cơ bản & Công */}
                      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1.5">
                        <div className="font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-1">
                          1. Lương &amp; Ngày công
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-600 dark:text-slate-300">Lương CB (HĐ):</span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white">{formatViCurrency(item.baseSalary)}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-600 dark:text-slate-300">Công chuẩn / Đơn giá:</span>
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                            {formatViWorkday(item.standardWorkDays || 26)} / {formatViCurrency(unitWage)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-600 dark:text-slate-300">Làm TT / Phép / Lễ:</span>
                          <span className="font-mono font-semibold text-blue-700 dark:text-blue-300">
                            {formatViWorkday(item.workedDays ?? item.totalWorkDays)} / {formatViWorkday(item.paidLeaveDays || 0)} / {formatViWorkday(item.holidayDays || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-700 font-bold">
                          <span className="text-slate-800 dark:text-slate-100">Lương ngày công ({formatViWorkday(item.totalWorkDays)}):</span>
                          <span className="font-mono text-emerald-700 dark:text-emerald-300">{formatViCurrency(item.salaryByWork)}</span>
                        </div>
                      </div>

                      {/* 2. Phụ cấp phát sinh > 0 */}
                      {showAllowanceCard && (
                        <div
                          data-testid={`detailed-allowances-card-${empId}`}
                          className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1"
                        >
                          <div className="font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-1">
                            2. Chi tiết Phụ cấp
                          </div>
                          {positiveAllowances.map((a) => (
                            <div key={a.key || a.label} className="flex justify-between gap-2">
                              <span className="text-slate-600 dark:text-slate-300">{a.label}:</span>
                              <span className="font-mono text-slate-800 dark:text-slate-200">
                                {formatViCurrency(a.amount)}
                              </span>
                            </div>
                          ))}
                          <div className="flex justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-700 font-bold">
                            <span className="text-slate-800 dark:text-slate-100">Tổng phụ cấp:</span>
                            <span className="font-mono text-blue-700 dark:text-blue-300">+{formatViCurrency(totalPositiveAllowance)}</span>
                          </div>
                        </div>
                      )}

                      {/* Tăng ca OT & Thưởng */}
                      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1.5">
                        <div className="font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-1">
                          {showAllowanceCard ? 3 : 2}. Tăng ca &amp; Thưởng
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-600 dark:text-slate-300">Tăng ca ({formatViNumber(item.totalOtHours || 0)}h OT):</span>
                          <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">+{formatViCurrency(item.otAmount)}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-600 dark:text-slate-300">Thưởng nóng thêm:</span>
                          <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">+{formatViCurrency(bonusAmt)}</span>
                        </div>
                        {item.adjustment_note && (
                          <div className="text-slate-500 dark:text-slate-400 italic break-words pt-1">
                            Ghi chú: {item.adjustment_note}
                          </div>
                        )}
                      </div>

                      {/* Khấu trừ chi tiết */}
                      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1">
                        <div className="font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-1">
                          {showAllowanceCard ? 4 : 3}. Các khoản Khấu trừ
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-600 dark:text-slate-300">
                            Đi trễ ({formatViNumber(item.lateOccurrences || 0, 0)} lần / {formatViNumber(item.totalLateMinutes || 0, 0)}p):
                          </span>
                          <span className="font-mono text-rose-700 dark:text-rose-300">-{formatViCurrency(latePenaltyAmt)}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-600 dark:text-slate-300">Trích BHXH ({formatViNumber(item.insuranceRatePercent ?? 10.5)}%):</span>
                          <span className="font-mono text-rose-700 dark:text-rose-300">-{formatViCurrency(item.insuranceDeduction || item.totalInsurance)}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-600 dark:text-slate-300">Phạt khác / Tạm ứng:</span>
                          <span className="font-mono text-amber-700 dark:text-amber-300">
                            -{formatViCurrency(penaltyAmt, false)} / -{formatViCurrency(advAmt, false)}
                          </span>
                        </div>
                        {debtAmt > 0 && (
                          <div className="flex justify-between gap-2 font-bold text-amber-800 dark:text-amber-300">
                            <span>Nợ chuyển kỳ sau:</span>
                            <span className="font-mono">{formatViCurrency(debtAmt)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Thanh nút hành động + Đối chiếu Nhật ký từng ngày */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        data-testid={`toggle-daily-logs-${empId}`}
                        onClick={() => toggleDailyLogsRow(empId)}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Calendar size={14} className="text-[#E11D48] dark:text-rose-400" />
                        <span>Đối chiếu nhật ký công ({formatViNumber(dailyLogs.length, 0)} ngày)</span>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>

                      <div className="flex flex-wrap items-center gap-2">
                        {canManagePayment && (() => {
                          const empPaid = item.employee_payment_status === "PAID" || item.payment_status === "PAID";
                          return (
                            <AppButton
                              variant={empPaid ? "success" : "primary"}
                              icon={empPaid ? CheckCircle2 : Send}
                              data-testid={`payroll-transfer-btn-${empId}`}
                              onClick={() => setTransferItem(item)}
                              className={`text-xs ${empPaid ? "" : "bg-[#0051CA] hover:bg-blue-700 border-[#0051CA]"}`}
                            >
                              {empPaid ? "✓ Đã chuyển khoản" : "Chuyển khoản"}
                            </AppButton>
                          );
                        })()}
                        {canCalculatePayroll && (
                          <AppButton
                            variant="ghost"
                            icon={SlidersHorizontal}
                            onClick={() => handleOpenAdjustmentModal(item)}
                            className="bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 text-xs"
                          >
                            Điều chỉnh
                          </AppButton>
                        )}
                        <AppButton
                          variant="secondary"
                          icon={Eye}
                          data-testid={`payroll-view-detail-btn-${empId}`}
                          onClick={() => setSelectedSlipItem(item)}
                          className="text-xs"
                        >
                          Xem Lương &amp; Công chi tiết
                        </AppButton>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                        {dailyLogs.length === 0 ? (
                          <div className="p-3 text-xs text-slate-500 dark:text-slate-400 text-center">
                            Chưa có dữ liệu chấm công trong tháng {month}/{year}.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                            {dailyLogs.map((log, lIdx) => {
                              const dateIso = log.record_date_iso || String(log.record_date || "").slice(0, 10);
                              const noteText = log.attendance_note || "";
                              const isWarnNote = /vào muộn|ra sớm|quên check-out|quá ngắn/i.test(noteText);
                              return (
                                <div key={`${dateIso}-${lIdx}`} className="px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                                  <div className="min-w-0 space-y-1">
                                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                                      {log.date_label || dateIso}
                                    </div>
                                    <div className="text-slate-600 dark:text-slate-300">
                                      Vào {log.check_in_time ? String(log.check_in_time).slice(0, 5) : "--:--"} • Ra{" "}
                                      {log.check_out_time ? String(log.check_out_time).slice(0, 5) : "--:--"}
                                      {(Number(log.morning_worked_minutes) > 0 || Number(log.afternoon_worked_minutes) > 0) && (
                                        <span className="ml-1.5 text-slate-500 dark:text-slate-400">
                                          (Sáng {formatViNumber(log.morning_worked_minutes || 0, 0)}p / Chiều {formatViNumber(log.afternoon_worked_minutes || 0, 0)}p)
                                        </span>
                                      )}
                                    </div>
                                    {noteText && (
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-xs font-semibold ${
                                          isWarnNote
                                            ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70"
                                            : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60"
                                        }`}
                                      >
                                        {noteText}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <div className="text-right font-mono">
                                      <div className="font-bold text-[#E11D48] dark:text-rose-300">
                                        {formatViWorkday(log.work_credit ?? 0)} công
                                      </div>
                                      <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                                        {formatViCurrency(log.daily_earned_amount || 0)}
                                      </div>
                                    </div>
                                    <StatusBadge type="attendance" status={log.status} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <>
            {/* Mobile ZaUI Ticket Cards View */}
            <div className="md:hidden space-y-3">
          {isLoading ? (
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl">
              <SkeletonList rows={3} label="Đang tải bảng lương..." />
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl">
              <EmptyState icon={FileText} title={`Không có dữ liệu tiền lương tháng ${month}/${year}.`} />
            </div>
          ) : (
            filteredList.map((item, idx) => {
              const empId = item.ma_nv || item.id_nhan_vien;
              const confirmStatus = item.salary_confirm_status || "PENDING";
              const bonusAmt = Number(item.bonusAmount) || 0;
              const penaltyAmt = Number(item.penaltyAmount) || 0;
              const advAmt = Number(item.advanceDeduction) || 0;
              return (
                <div
                  key={empId || idx}
                  className={`perf-list-item rounded-2xl border p-4 space-y-2.5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] ${
                    confirmStatus === "DISPUTED"
                      ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700"
                      : "bg-white dark:bg-slate-900 border-slate-100/90 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        name={item.ho_ten || empId}
                        avatarUrl={item.avatar_url}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white text-sm truncate">{item.ho_ten}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-300 font-mono">
                          {empId} • {item.chuc_danh || "Nhân viên"}
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-700 text-[#16A34A] dark:text-emerald-300 text-xs font-extrabold shrink-0 whitespace-nowrap">
                      {formatViWorkday(item.totalWorkDays)} Công
                    </span>
                  </div>

                  {/* STITCH ADMIN SCREEN 4 — NET PAY TRANSFER POD */}
                  <div className="bg-[#F0F3FF] dark:bg-slate-800/80 rounded-xl p-2.5 border border-slate-200/70 dark:border-slate-700 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Thực nhận chuyển khoản (Net)</span>
                    <span className="font-extrabold text-base text-[#B80035] dark:text-rose-300 font-mono whitespace-nowrap">
                      {formatViCurrency(item.netSalary || 0)}
                    </span>
                  </div>

                  {/* Perforated Ticket Cutout Divider */}
                  <div className="sedinco-ticket-cutout">
                    <div className="w-full border-t-2 border-dashed border-slate-200 dark:border-slate-700" />
                  </div>

                  {/* 5-Item Ledger Breakdown */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-300">1. Lương cơ bản chuẩn ({formatViWorkday(item.totalWorkDays)} công)</span>
                      <span className="font-bold text-[#111C2D] dark:text-white font-mono whitespace-nowrap">{formatViCurrency(item.salaryByWork || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-300">2. Tăng ca OT ({formatViNumber(item.totalOtHours || 0)}h)</span>
                      <span className="font-bold text-[#16A34A] dark:text-emerald-300 font-mono whitespace-nowrap">+{formatViCurrency(item.otAmount || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-300">3. Phụ cấp định mức</span>
                      <span className="font-bold text-[#111C2D] dark:text-white font-mono whitespace-nowrap">+{formatViCurrency(item.totalAllowance || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-300">4. Khấu trừ BHXH (10,5%)</span>
                      <span className="font-bold text-[#DC2626] dark:text-rose-400 font-mono whitespace-nowrap">-{formatViCurrency(item.insuranceDeduction || item.totalInsurance || 0)}</span>
                    </div>
                    {(bonusAmt > 0 || penaltyAmt > 0 || advAmt > 0) && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-600 dark:text-slate-300">5. Thưởng / Phạt / Tạm ứng</span>
                        <span className="font-bold text-[#0051CA] dark:text-blue-300 font-mono whitespace-nowrap">
                          {formatViCurrency(bonusAmt - penaltyAmt - advAmt)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {canManagePayment && (() => {
                      const empPaid = item.employee_payment_status === "PAID" || item.payment_status === "PAID";
                      return (
                        <AppButton
                          variant={empPaid ? "success" : "primary"}
                          icon={empPaid ? CheckCircle2 : Send}
                          data-testid={`payroll-transfer-mobile-btn-${empId}`}
                          onClick={() => setTransferItem(item)}
                          className={`flex-1 min-w-[130px] text-xs ${empPaid ? "" : "bg-[#0051CA] hover:bg-blue-700 border-[#0051CA]"}`}
                        >
                          {empPaid ? "✓ Đã chuyển khoản" : "Chuyển khoản"}
                        </AppButton>
                      );
                    })()}
                    {canCalculatePayroll && (
                      <AppButton
                        variant="ghost"
                        icon={SlidersHorizontal}
                        onClick={() => handleOpenAdjustmentModal(item)}
                        className="flex-1 min-w-[130px] bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 text-xs"
                      >
                        Thưởng / Phạt / Ứng
                      </AppButton>
                    )}
                    <AppButton
                      variant="secondary"
                      icon={Eye}
                      onClick={() => setSelectedSlipItem(item)}
                      className="flex-1 min-w-[110px] text-xs"
                    >
                      {confirmStatus === "DISPUTED" ? "Xem khiếu nại" : "Chi tiết"}
                    </AppButton>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bảng Dữ Liệu Grid (Desktop >= 768px) */}
        <div className="hidden md:block overflow-x-auto touch-scroll-x">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#F0F3FF] dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold border-b-2 border-slate-300 dark:border-slate-700 text-xs">
                <th className="p-3 sm:p-3.5 pl-3 sm:pl-5 sticky left-0 bg-[#F0F3FF] dark:bg-slate-800 z-10 min-w-[160px] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)] dark:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.5)] whitespace-nowrap">Cán bộ nhân sự</th>
                <th className="p-3.5 text-right whitespace-nowrap">Lương CB (HĐ)</th>
                <th className="p-3.5 text-center whitespace-nowrap">Công TT</th>
                <th className="p-3.5 text-right whitespace-nowrap">Lương công</th>
                <th className="p-3.5 text-right whitespace-nowrap">Phụ cấp</th>
                <th className="p-3.5 text-right whitespace-nowrap">Tăng ca (OT)</th>
                <th className="p-3.5 text-right whitespace-nowrap">Thưởng / Phạt / Ứng</th>
                <th className="p-3.5 text-right text-rose-700 dark:text-rose-300 whitespace-nowrap">Trích BHXH</th>
                <th className="p-3.5 text-right text-emerald-900 dark:text-emerald-300 font-bold whitespace-nowrap">Thực lĩnh (Net)</th>
                <th className="p-3.5 text-center whitespace-nowrap">Xác nhận</th>
                <th className="p-3.5 text-center pr-5 whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-500 dark:text-slate-300">
                    <RefreshCw size={28} className="mx-auto mb-2 animate-spin text-emerald-600 dark:text-emerald-400" />
                    <p className="text-sm font-semibold">Đang tải và tính toán dữ liệu bảng lương...</p>
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-500 dark:text-slate-300">
                    <FileText size={36} className="mx-auto mb-2 text-slate-400" />
                    <p className="text-sm font-semibold">
                      {payrollEmployees.length > 0
                        ? "Không tìm thấy nhân viên phù hợp"
                        : `Không có dữ liệu tiền lương trong kỳ tháng ${month}/${year}.`}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredList.map((item, idx) => {
                  const empId = item.ma_nv || item.id_nhan_vien;
                  const confirmStatus = item.salary_confirm_status || "PENDING";
                  const bonusAmt = Number(item.bonusAmount) || 0;
                  const penaltyAmt = Number(item.penaltyAmount) || 0;
                  const advAmt = Number(item.advanceDeduction) || 0;
                  const netAdj = bonusAmt - penaltyAmt - advAmt;
                  return (
                    <tr
                      key={empId || idx}
                      className={`group transition-colors ${
                        confirmStatus === "DISPUTED"
                          ? "bg-rose-50 hover:bg-rose-100 dark:bg-[#2a1219] dark:hover:bg-[#381822]"
                          : "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                      }`}
                    >
                      <td
                        className={`p-3 sm:p-3.5 pl-3 sm:pl-5 sticky left-0 z-10 min-w-[160px] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)] dark:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.5)] ${
                          confirmStatus === "DISPUTED"
                            ? "bg-rose-50 group-hover:bg-rose-100 dark:bg-[#2a1219] dark:group-hover:bg-[#381822]"
                            : "bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar
                            name={item.ho_ten || empId}
                            avatarUrl={item.avatar_url}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm truncate">{item.ho_ten}</div>
                            <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-1 mt-0.5">
                              <span className="font-mono text-[#E11D48] dark:text-rose-300 font-semibold">{empId}</span>
                              <span>• {item.department || "Khối Công trình"}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5 text-right font-semibold text-slate-800 dark:text-slate-100 text-sm whitespace-nowrap">
                        {formatViCurrency(item.baseSalary || 0)}
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <span className="inline-block px-2.5 py-1 rounded-xl bg-[#F0F3FF] dark:bg-rose-950/60 text-[#111C2D] dark:text-rose-200 font-bold text-xs border border-slate-200 dark:border-rose-800/70">
                          {formatViWorkday(item.totalWorkDays)} công
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-semibold text-slate-800 dark:text-slate-100 text-sm whitespace-nowrap">
                        {formatViCurrency(item.salaryByWork || 0)}
                      </td>
                      <td className="p-3.5 text-right font-semibold text-slate-800 dark:text-slate-100 text-sm whitespace-nowrap">
                        {formatViCurrency(item.totalAllowance || 0)}
                      </td>
                      <td className="p-3.5 text-right font-semibold text-indigo-800 dark:text-indigo-300 text-sm whitespace-nowrap">
                        <div>+{formatViCurrency(item.otAmount || 0)}</div>
                        {Number(item.totalOtHours || 0) > 0 && (
                          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {formatViNumber(item.totalOtHours)}h tăng ca
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 text-right text-xs whitespace-nowrap">
                        {netAdj === 0 && bonusAmt === 0 && penaltyAmt === 0 && advAmt === 0 ? (
                          <span className="text-slate-400 dark:text-slate-400">0 đ</span>
                        ) : (
                          <div className="space-y-0.5">
                            {bonusAmt > 0 && <div className="text-emerald-700 dark:text-emerald-300 font-semibold">+{formatViCurrency(bonusAmt, false)} Thưởng</div>}
                            {penaltyAmt > 0 && <div className="text-rose-700 dark:text-rose-300 font-semibold">-{formatViCurrency(penaltyAmt, false)} Phạt</div>}
                            {advAmt > 0 && <div className="text-amber-700 dark:text-amber-300 font-semibold">-{formatViCurrency(advAmt, false)} Ứng</div>}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 text-right font-semibold text-rose-700 dark:text-rose-300 text-sm whitespace-nowrap">
                        -{formatViCurrency(item.insuranceDeduction || item.totalInsurance || 0)}
                      </td>
                      <td className="p-3.5 text-right font-bold text-base whitespace-nowrap">
                        <span className="text-emerald-800 dark:text-emerald-300">
                          {formatViCurrency(item.netSalary || 0)}
                        </span>
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {confirmStatus === "CONFIRMED" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 font-semibold text-xs border border-emerald-300 dark:border-emerald-800/70">
                            Đã xác nhận
                          </span>
                        ) : confirmStatus === "DISPUTED" ? (
                          <button
                            type="button"
                            onClick={() => setSelectedSlipItem(item)}
                            className="min-h-[44px] inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-600 text-white font-semibold text-xs shadow-sm cursor-pointer"
                            title={item.dispute_reason || "Nhấn để xem minh chứng khiếu nại lương"}
                          >
                            Khiếu nại (Xem)
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium text-xs border border-slate-300 dark:border-slate-700">
                            Chờ xác nhận
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-center pr-5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canManagePayment && (() => {
                            const empPaid = item.employee_payment_status === "PAID" || item.payment_status === "PAID";
                            return (
                              <button
                                type="button"
                                data-testid={`payroll-transfer-btn-${empId}`}
                                onClick={() => setTransferItem(item)}
                                className={`inline-flex items-center gap-1 min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                                  empPaid
                                    ? "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700"
                                    : "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-[#0051CA] dark:text-blue-200 border-blue-300 dark:border-blue-700"
                                }`}
                                title={empPaid ? "Đã chuyển khoản lương kỳ này" : "Mở mã VietQR chuyển khoản lương"}
                              >
                                {empPaid ? <CheckCircle2 size={14} /> : <Send size={14} />}
                                <span>{empPaid ? "✓ Đã chuyển khoản" : "Chuyển khoản"}</span>
                              </button>
                            );
                          })()}
                          {canCalculatePayroll && (
                            <button
                              type="button"
                              onClick={() => handleOpenAdjustmentModal(item)}
                              className="inline-flex items-center gap-1 min-h-[44px] px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-xs font-semibold border border-amber-300 dark:border-amber-700 transition-all cursor-pointer whitespace-nowrap"
                              title="Thưởng / Phạt / Tạm ứng"
                            >
                              <SlidersHorizontal size={14} />
                              <span>Điều chỉnh</span>
                            </button>
                          )}
                          <button
                            type="button"
                            data-testid={`payroll-view-detail-btn-${empId}`}
                            onClick={() => setSelectedSlipItem(item)}
                            className="inline-flex items-center gap-1 min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-emerald-100 dark:bg-slate-800 dark:hover:bg-emerald-950/60 text-slate-800 dark:text-slate-100 hover:text-emerald-900 dark:hover:text-emerald-300 text-xs font-semibold border border-slate-300 dark:border-slate-600 hover:border-emerald-600 transition-all cursor-pointer whitespace-nowrap"
                          >
                            <Eye size={14} />
                            <span>Xem Lương &amp; Công chi tiết</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredList.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-t-2 border-slate-300 dark:border-slate-700 font-bold">
                  <td className="p-4 pl-5 text-xs whitespace-nowrap sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)] dark:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.5)]">Tổng cộng ({formatViNumber(filteredList.length, 0)} NV):</td>
                  <td className="p-4 text-right text-sm whitespace-nowrap">
                    {formatViCurrency(filteredList.reduce((acc, c) => acc + (Number(c.baseSalary) || 0), 0))}
                  </td>
                  <td className="p-4 text-center text-blue-800 dark:text-blue-300 text-sm whitespace-nowrap">
                    {formatViWorkday(totalWorkDays)} công
                  </td>
                  <td className="p-4 text-right text-sm whitespace-nowrap">
                    {formatViCurrency(filteredList.reduce((acc, c) => acc + (Number(c.salaryByWork) || 0), 0))}
                  </td>
                  <td className="p-4 text-right text-sm whitespace-nowrap">
                    {formatViCurrency(filteredList.reduce((acc, c) => acc + (Number(c.totalAllowance) || 0), 0))}
                  </td>
                  <td className="p-4 text-right text-indigo-800 dark:text-indigo-300 text-sm whitespace-nowrap">
                    +{formatViCurrency(filteredList.reduce((acc, c) => acc + (Number(c.otAmount) || 0), 0))}
                  </td>
                  <td className="p-4 text-right text-slate-800 dark:text-slate-200 text-xs whitespace-nowrap">
                    {formatViCurrency(
                      filteredList.reduce(
                        (acc, c) =>
                          acc + (Number(c.bonusAmount) || 0) - (Number(c.penaltyAmount) || 0) - (Number(c.advanceDeduction) || 0),
                        0
                      )
                    )}
                  </td>
                  <td className="p-4 text-right text-rose-700 dark:text-rose-300 text-sm whitespace-nowrap">
                    -{formatViCurrency(filteredList.reduce((acc, c) => acc + (Number(c.insuranceDeduction || c.totalInsurance) || 0), 0))}
                  </td>
                  <td className="p-4 text-right text-emerald-800 dark:text-emerald-300 text-base whitespace-nowrap">
                    {formatViCurrency(totalNetSalary)}
                  </td>
                  <td className="p-4 text-center"></td>
                  <td className="p-4 text-center pr-5"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
          </>
        )}

      </div>

      {/* Modal Phiếu Lương & Bảng Công Chi Tiết */}
      {selectedSlipItem && (
        <SalarySlipModal
          payrollItem={selectedSlipItem}
          targetMaNv={selectedSlipItem.ma_nv || selectedSlipItem.id_nhan_vien}
          month={month}
          year={year}
          isAdminOrAccountant={isAdmin || isAccountant}
          employeeList={filteredList}
          onSelectEmployee={(emp) => setSelectedSlipItem(emp)}
          canAdjust={isAdmin || canCalculatePayroll}
          canManagePayment={canManagePayment}
          onOpenAdjustment={(slip) => handleOpenAdjustmentModal(slip)}
          onOpenTransfer={(slip) => setTransferItem(slip)}
          refreshKey={slipRefreshTick}
          showToast={notify}
          onStatusUpdated={() => {
            fetchPayrollFromApi();
            if (onRefresh) onRefresh();
          }}
          onClose={() => setSelectedSlipItem(null)}
        />
      )}

      {/* Modal Chuyển khoản lương VietQR (z-[115] chồng chuẩn trên SalarySlipModal) */}
      <BankTransferModal
        open={Boolean(transferItem)}
        item={transferItem}
        month={month}
        year={year}
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

      {/* Modal Điều chỉnh Thưởng / Phạt / Tạm ứng (F2) — z-[115] luôn nổi trên SalarySlipModal */}
      <AppModal
        open={Boolean(adjustItem)}
        onClose={() => !adjSaving && setAdjustItem(null)}
        disableClose={adjSaving}
        zIndexClass="z-[115]"
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

      {/* Modal Trả lại bảng lương cho Kế toán kèm lý do */}
      <AppModal
        open={rejectModalOpen}
        onClose={() => !rejecting && setRejectModalOpen(false)}
        disableClose={rejecting}
        title="Trả lại bảng lương cho Kế toán"
        subtitle={`Kỳ lương Tháng ${month}/${year}`}
        maxWidthClass="max-w-md"
        footer={
          <div className="flex gap-2.5">
            <AppButton
              variant="secondary"
              disabled={rejecting}
              onClick={() => setRejectModalOpen(false)}
              className="flex-1"
            >
              Đóng / Quay lại
            </AppButton>
            <AppButton
              type="submit"
              form="payroll-reject-form"
              variant="danger"
              icon={Undo2}
              loading={rejecting}
              loadingText="Đang trả lại..."
              className="flex-1"
            >
              Xác nhận trả lại
            </AppButton>
          </div>
        }
      >
        <form id="payroll-reject-form" onSubmit={handleSubmitRejectPayroll} className="p-4 space-y-3">
          {rejectError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs font-semibold">
              {rejectError}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Lý do cần Kế toán rà soát, chỉnh sửa lại <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ví dụ: Kiểm tra lại số giờ tăng ca công trình A của NV003..."
              className="w-full px-3 py-2.5 border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-rose-500 leading-relaxed"
            />
          </div>
        </form>
      </AppModal>

    </div>
  );
}
