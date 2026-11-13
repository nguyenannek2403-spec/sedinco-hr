import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  DollarSign,
  Search,
  Download,
  Printer,
  FileText,
  Users,
  Award,
  TrendingUp,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Loader2,
  SlidersHorizontal,
  X
} from "lucide-react";
import SalarySlipModal from "./SalarySlipModal";
import { safeGet, safePost, sanitizeFormula, formatCsvCellRFC4180, generateIdempotencyKey } from "../utils/api";
import { useDebouncedValue } from "../hooks/useDebounce";

export default function PayrollGridTable({
  payrollData,
  month = new Date().getMonth() + 1,
  year = new Date().getFullYear(),
  onMonthChange,
  onRefresh,
  isLoading: propIsLoading,
  showToast,
  onShowToast
}) {
  const notify = showToast || onShowToast;
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [selectedSlipItem, setSelectedSlipItem] = useState(null);
  const [internalPayroll, setInternalPayroll] = useState([]);
  const [loadingPayroll, setLoadingPayroll] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [approving, setApproving] = useState(false);
  const calcInFlightRef = useRef(false);
  const approveInFlightRef = useRef(false);
  const adjInFlightRef = useRef(false);

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

  const fetchPayrollFromApi = useCallback(async () => {
    if (Array.isArray(payrollData)) return;
    setLoadingPayroll(true);
    try {
      const res = await safeGet("/payroll", { month, year }, { cancelPrevious: true });
      if (Array.isArray(res?.data) && res.data.length > 0) {
        setInternalPayroll(res.data);
      } else {
        // Nếu chưa có bản lưu, tự động gọi /payroll/calculate để hiển thị bảng tính lương tạm tính
        const calcRes = await safeGet("/payroll/calculate", { month, year }, { cancelPrevious: true });
        if (Array.isArray(calcRes?.data)) {
          setInternalPayroll(calcRes.data);
        } else {
          setInternalPayroll([]);
        }
      }
    } catch (e) {
      console.warn("Lỗi tải bảng lương:", e);
    } finally {
      setLoadingPayroll(false);
    }
  }, [payrollData, month, year]);

  useEffect(() => {
    fetchPayrollFromApi();
  }, [fetchPayrollFromApi]);

  const handleCalculatePayroll = async () => {
    if (calcInFlightRef.current) return;
    calcInFlightRef.current = true;
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
      calcInFlightRef.current = false;
      setCalculating(false);
    }
  };

  const handleApprovePayroll = async () => {
    if (approveInFlightRef.current) return;
    approveInFlightRef.current = true;
    setApproving(true);
    try {
      const res = await safePost("/payroll/approve", { month, year }, {
        idempotencyKey: generateIdempotencyKey("pay_approve")
      });
      if (res?.success) {
        if (notify) notify(`Đã duyệt và phát hành Phiếu Lương tháng ${month}/${year} cho toàn bộ nhân viên!`, "success");
        await fetchPayrollFromApi();
      }
    } catch (err) {
      if (notify) notify(err.message || "Không thể duyệt bảng lương.", "error");
    } finally {
      approveInFlightRef.current = false;
      setApproving(false);
    }
  };

  const handleOpenAdjustmentModal = (item) => {
    setAdjustItem(item);
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
    adjInFlightRef.current = true;
    setAdjSaving(true);
    setAdjError("");
    try {
      const res = await safePost(
        "/payroll/adjustments",
        {
          ma_nv: empId,
          month,
          year,
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
        await fetchPayrollFromApi();
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

  // Lọc dữ liệu theo tìm kiếm
  const filteredList = (sourceList || []).filter(item => {
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    const id = (item.ma_nv || item.id_nhan_vien || "").toLowerCase();
    const name = (item.ho_ten || "").toLowerCase();
    const role = (item.chuc_danh || "").toLowerCase();
    return id.includes(q) || name.includes(q) || role.includes(q);
  });

  // Tính 4 chỉ số KPI tổng hợp
  const totalNetSalary = filteredList.reduce((acc, cur) => acc + (Number(cur.netSalary) || 0), 0);
  const totalEmployees = filteredList.length;
  const totalWorkDays = filteredList.reduce((acc, cur) => acc + (Number(cur.totalWorkDays) || 0), 0);
  const averageIncome = totalEmployees > 0 ? totalNetSalary / totalEmployees : 0;

  // Xuất file CSV UTF-8 BOM chuẩn tiếng Việt
  const handleExportCSV = () => {
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
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Bang_Luong_Sedinco_Thang_${month}_${year}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5 pb-28">
      
      {/* 4 Card KPI Tổng Quan Tài Chính */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* KPI 1: Tổng Quỹ Lương Net */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-800 text-white rounded-3xl p-4 sm:p-5 shadow-md border-2 border-emerald-700 relative overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-emerald-100 font-semibold">Tổng quỹ lương (Net)</span>
            <div className="p-2 bg-white/20 rounded-xl border border-white/30 shrink-0">
              <DollarSign size={20} className="text-white" />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-xl sm:text-2xl font-bold">
              {totalNetSalary.toLocaleString("vi-VN")} đ
            </span>
            <span className="text-xs text-emerald-100 block mt-1 font-medium">Chi trả kỳ tháng {month}/{year}</span>
          </div>
        </div>

        {/* KPI 2: Tổng Số Nhân Sự */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border-2 border-slate-300 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-600 font-semibold">Tổng số nhân sự</span>
            <div className="p-2 bg-blue-50 text-blue-700 rounded-xl border-2 border-blue-200 shrink-0">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-xl sm:text-2xl font-bold text-slate-900">
              {totalEmployees} nhân sự
            </span>
            <span className="text-xs text-emerald-700 block mt-1 font-medium">100% hồ sơ hoàn tất</span>
          </div>
        </div>

        {/* KPI 3: Tổng Ngày Công Thực Tế */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border-2 border-slate-300 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-600 font-semibold">Tổng ngày công thực tế</span>
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl border-2 border-indigo-200 shrink-0">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-xl sm:text-2xl font-bold text-slate-900">
              {totalWorkDays.toFixed(1)} công
            </span>
            <span className="text-xs text-slate-500 font-medium block mt-1">Định mức chuẩn 26.0 ngày</span>
          </div>
        </div>

        {/* KPI 4: Bình Quân Thu Nhập */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border-2 border-slate-300 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-600 font-semibold">Thu nhập bình quân</span>
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl border-2 border-amber-200 shrink-0">
              <Award size={20} />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-xl sm:text-2xl font-bold text-slate-900">
              {averageIncome > 0 ? `${(averageIncome / 1000000).toFixed(1)} tr` : "0 tr"}
            </span>
            <span className="text-xs text-slate-500 font-medium block mt-1">Bình quân thực nhận / người</span>
          </div>
        </div>

      </div>

      {/* Bảng Chi Tiết Toàn Bộ Nhân Sự */}
      <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm overflow-hidden">
        
        {/* Header Tác Vụ */}
        <div className="p-4 sm:p-5 border-b-2 border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <DollarSign className="text-emerald-600 shrink-0" size={22} />
              <h3 className="font-bold text-lg leading-snug text-slate-900">
                Bảng thanh toán tiền lương &amp; phụ cấp
              </h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mt-1">
              Tự động tính công chuẩn, tăng ca, thưởng/phạt/tạm ứng và BHXH
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Bộ chọn tháng/năm */}
            <div className="flex items-center bg-white border-2 border-slate-300 rounded-xl px-2 py-1 shadow-sm">
              <button
                type="button"
                onClick={() => onMonthChange(month > 1 ? month - 1 : 12, month > 1 ? year : year - 1)}
                className="min-w-[36px] min-h-[36px] p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 cursor-pointer flex items-center justify-center"
                title="Tháng trước"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="font-bold text-sm px-2.5 text-slate-900 whitespace-nowrap">
                Tháng {month}/{year}
              </span>
              <button
                type="button"
                onClick={() => onMonthChange(month < 12 ? month + 1 : 1, month < 12 ? year : year + 1)}
                className="min-w-[36px] min-h-[36px] p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 cursor-pointer flex items-center justify-center"
                title="Tháng sau"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Tìm kiếm */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm nhân sự, chức vụ, mã NV..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm bg-white border-2 border-slate-300 rounded-xl outline-none focus:border-emerald-600 shadow-sm"
              />
            </div>

            {/* Nút Tính Lương Tự Động */}
            <button
              type="button"
              onClick={handleCalculatePayroll}
              disabled={calculating || isLoading}
              className="min-h-[42px] flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold px-3.5 py-2 rounded-xl border-2 border-blue-700 shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {calculating ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
              <span>{calculating ? "Đang tính..." : "Tính lương"}</span>
            </button>

            {/* Nút Duyệt & Phát Hành Phiếu Lương */}
            <button
              type="button"
              onClick={handleApprovePayroll}
              disabled={approving || isLoading}
              className="min-h-[42px] flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold px-3.5 py-2 rounded-xl border-2 border-indigo-700 shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {approving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              <span>{approving ? "Đang lưu..." : "Chốt & Phát hành"}</span>
            </button>

            {/* Nút Xuất CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="min-h-[42px] flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold px-3.5 py-2 rounded-xl border-2 border-emerald-700 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Download size={16} />
              <span>Xuất CSV</span>
            </button>

            {/* Nút Làm Mới */}
            <button
              type="button"
              onClick={() => {
                fetchPayrollFromApi();
                if (onRefresh) onRefresh();
              }}
              className="min-w-[42px] min-h-[42px] p-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border-2 border-slate-300 shadow-sm cursor-pointer flex items-center justify-center"
              title="Làm mới bảng lương"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin text-emerald-600" : ""} />
            </button>
          </div>
        </div>

        {/* Cảnh báo Thực lĩnh âm nếu có (Sổ lỗi P1: Chờ Kế toán trưởng phê duyệt quy tắc) */}
        {filteredList.some(item => Number(item.netSalary) < 0) && (
          <div className="mb-4 p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl text-amber-900 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              <div>
                <strong>Cảnh báo nghiệp vụ (Sổ lỗi P1):</strong> Phát hiện nhân viên có thực lĩnh âm (do 0 ngày công nhưng vẫn trừ BHXH). Đang chờ Kế toán trưởng phê duyệt quy tắc khấu trừ.
              </div>
            </div>
          </div>
        )}

        {/* Mobile Cards View (Tối ưu cho Zalo Mini App < 768px) */}
        <div className="md:hidden divide-y divide-slate-200">
          {isLoading ? (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-emerald-600" />
              <p className="text-sm font-medium">Đang tải bảng lương...</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <FileText size={30} className="mx-auto mb-2 text-slate-400" />
              <p className="text-sm font-medium">Không có dữ liệu tiền lương tháng {month}/{year}.</p>
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
                  className={`p-4 space-y-3 ${confirmStatus === "DISPUTED" ? "bg-rose-50" : "bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm truncate">{item.ho_ten}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {empId} • {item.totalWorkDays} công
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-base text-emerald-700 whitespace-nowrap">
                        {Number(item.netSalary || 0).toLocaleString("vi-VN")} đ
                      </div>
                      <div className="text-[11px] text-slate-500">Thực lĩnh</div>
                    </div>
                  </div>

                  {(bonusAmt > 0 || penaltyAmt > 0 || advAmt > 0) && (
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {bonusAmt > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold whitespace-nowrap">
                          +Thưởng {bonusAmt.toLocaleString("vi-VN")} đ
                        </span>
                      )}
                      {penaltyAmt > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-semibold whitespace-nowrap">
                          -Phạt {penaltyAmt.toLocaleString("vi-VN")} đ
                        </span>
                      )}
                      {advAmt > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-semibold whitespace-nowrap">
                          -Ứng {advAmt.toLocaleString("vi-VN")} đ
                        </span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenAdjustmentModal(item)}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <SlidersHorizontal size={14} className="shrink-0" />
                      <span>Thưởng / Phạt / Ứng</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSlipItem(item)}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-emerald-100 text-slate-800 border border-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Eye size={14} className="shrink-0" />
                      <span>{confirmStatus === "DISPUTED" ? "Xem khiếu nại" : "Chi tiết"}</span>
                    </button>
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
              <tr className="bg-slate-100 text-slate-800 font-semibold border-b-2 border-slate-300 text-xs">
                <th className="p-3 sm:p-3.5 pl-3 sm:pl-5 sticky left-0 bg-slate-100 z-10 min-w-[160px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)] whitespace-nowrap">Cán bộ nhân sự</th>
                <th className="p-3.5 text-right whitespace-nowrap">Lương CB (HĐ)</th>
                <th className="p-3.5 text-center whitespace-nowrap">Công TT</th>
                <th className="p-3.5 text-right whitespace-nowrap">Lương công</th>
                <th className="p-3.5 text-right whitespace-nowrap">Phụ cấp</th>
                <th className="p-3.5 text-right whitespace-nowrap">Tăng ca (OT)</th>
                <th className="p-3.5 text-right whitespace-nowrap">Thưởng / Phạt / Ứng</th>
                <th className="p-3.5 text-right text-rose-700 whitespace-nowrap">Trích BHXH</th>
                <th className="p-3.5 text-right text-emerald-900 font-bold whitespace-nowrap">Thực lĩnh (Net)</th>
                <th className="p-3.5 text-center whitespace-nowrap">Xác nhận</th>
                <th className="p-3.5 text-center pr-5 whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-500">
                    <RefreshCw size={28} className="mx-auto mb-2 animate-spin text-emerald-600" />
                    <p className="text-sm font-semibold">Đang tải và tính toán dữ liệu bảng lương...</p>
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-500">
                    <FileText size={36} className="mx-auto mb-2 text-slate-400" />
                    <p className="text-sm font-semibold">Không có dữ liệu tiền lương trong kỳ tháng {month}/{year}.</p>
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
                      className={`transition-colors ${
                        confirmStatus === "DISPUTED" ? "bg-rose-50 hover:bg-rose-100/70" : "hover:bg-emerald-50/40"
                      }`}
                    >
                      <td className="p-3 sm:p-3.5 pl-3 sm:pl-5 sticky left-0 bg-white z-10 min-w-[160px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)]">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm truncate">{item.ho_ten}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <span className="font-mono text-blue-700 font-semibold">{empId}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-right font-semibold text-slate-800 text-sm whitespace-nowrap">
                        {Number(item.baseSalary || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <span className="inline-block px-2.5 py-1 rounded-xl bg-blue-100 text-blue-900 font-bold text-xs border border-blue-300">
                          {item.totalWorkDays} công
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-semibold text-slate-800 text-sm whitespace-nowrap">
                        {Number(item.salaryByWork || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-right font-semibold text-slate-800 text-sm whitespace-nowrap">
                        {Number(item.totalAllowance || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-right font-semibold text-indigo-800 text-sm whitespace-nowrap">
                        +{Number(item.otAmount || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-right text-xs whitespace-nowrap">
                        {netAdj === 0 && bonusAmt === 0 && penaltyAmt === 0 && advAmt === 0 ? (
                          <span className="text-slate-400">0 đ</span>
                        ) : (
                          <div className="space-y-0.5">
                            {bonusAmt > 0 && <div className="text-emerald-700 font-semibold">+{bonusAmt.toLocaleString("vi-VN")} Thưởng</div>}
                            {penaltyAmt > 0 && <div className="text-rose-700 font-semibold">-{penaltyAmt.toLocaleString("vi-VN")} Phạt</div>}
                            {advAmt > 0 && <div className="text-amber-700 font-semibold">-{advAmt.toLocaleString("vi-VN")} Ứng</div>}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 text-right font-semibold text-rose-700 text-sm whitespace-nowrap">
                        -{Number(item.insuranceDeduction || item.totalInsurance || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-right font-bold text-base whitespace-nowrap">
                        <span className="text-emerald-800">
                          {Number(item.netSalary || 0).toLocaleString("vi-VN")} đ
                        </span>
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {confirmStatus === "CONFIRMED" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 font-semibold text-xs border border-emerald-300">
                            Đã xác nhận
                          </span>
                        ) : confirmStatus === "DISPUTED" ? (
                          <button
                            type="button"
                            onClick={() => setSelectedSlipItem(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-600 text-white font-semibold text-xs shadow-sm animate-pulse cursor-pointer"
                            title={item.dispute_reason || "Nhấn để xem minh chứng khiếu nại lương"}
                          >
                            Khiếu nại (Xem)
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium text-xs border border-slate-300">
                            Chờ xác nhận
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-center pr-5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenAdjustmentModal(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold border border-amber-300 transition-all cursor-pointer whitespace-nowrap"
                            title="Thưởng / Phạt / Tạm ứng"
                          >
                            <SlidersHorizontal size={14} />
                            <span>Điều chỉnh</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedSlipItem(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-100 text-slate-800 hover:text-emerald-900 text-xs font-semibold border border-slate-300 hover:border-emerald-600 transition-all cursor-pointer whitespace-nowrap"
                          >
                            <Eye size={14} />
                            <span>Chi tiết</span>
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
                <tr className="bg-slate-100 text-slate-900 border-t-2 border-slate-300 font-bold">
                  <td className="p-4 pl-5 text-xs whitespace-nowrap">Tổng cộng ({filteredList.length} NV):</td>
                  <td className="p-4 text-right text-sm whitespace-nowrap">
                    {filteredList.reduce((acc, c) => acc + (Number(c.baseSalary) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-4 text-center text-blue-800 text-sm whitespace-nowrap">
                    {totalWorkDays.toFixed(1)} công
                  </td>
                  <td className="p-4 text-right text-sm whitespace-nowrap">
                    {filteredList.reduce((acc, c) => acc + (Number(c.salaryByWork) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-4 text-right text-sm whitespace-nowrap">
                    {filteredList.reduce((acc, c) => acc + (Number(c.totalAllowance) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-4 text-right text-indigo-800 text-sm whitespace-nowrap">
                    +{filteredList.reduce((acc, c) => acc + (Number(c.otAmount) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-4 text-right text-slate-800 text-xs whitespace-nowrap">
                    {(
                      filteredList.reduce(
                        (acc, c) =>
                          acc + (Number(c.bonusAmount) || 0) - (Number(c.penaltyAmount) || 0) - (Number(c.advanceDeduction) || 0),
                        0
                      )
                    ).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-4 text-right text-rose-700 text-sm whitespace-nowrap">
                    -{filteredList.reduce((acc, c) => acc + (Number(c.insuranceDeduction || c.totalInsurance) || 0), 0).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-4 text-right text-emerald-800 text-base whitespace-nowrap">
                    {totalNetSalary.toLocaleString("vi-VN")} đ
                  </td>
                  <td className="p-4 text-center"></td>
                  <td className="p-4 text-center pr-5"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

      </div>

      {/* Modal Điều chỉnh Thưởng / Phạt / Tạm ứng (F2) */}
      {adjustItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)"
          }}
        >
          <div className="bg-white border-2 border-slate-200 rounded-3xl w-full max-w-md max-h-full overflow-y-auto p-5 shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-base font-bold text-slate-900">Điều chỉnh thưởng / phạt / tạm ứng</h4>
                <p className="text-xs text-slate-500">
                  {adjustItem.ho_ten} ({adjustItem.ma_nv || adjustItem.id_nhan_vien}) • Tháng {month}/{year}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !adjSaving && setAdjustItem(null)}
                aria-label="Đóng"
                className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {adjError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold">
                {adjError}
              </div>
            )}

            <form onSubmit={handleSaveAdjustment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tiền thưởng thêm (VNĐ)</label>
                <input
                  type="number"
                  min={0}
                  step={50000}
                  value={adjForm.bonus_amount}
                  onChange={(e) => setAdjForm((f) => ({ ...f, bonus_amount: Number(e.target.value) || 0 }))}
                  className="w-full min-h-[44px] px-3 py-2 border-2 border-slate-300 rounded-xl text-sm font-semibold text-emerald-700 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Khấu trừ phạt (VNĐ)</label>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    value={adjForm.penalty_amount}
                    onChange={(e) => setAdjForm((f) => ({ ...f, penalty_amount: Number(e.target.value) || 0 }))}
                    className="w-full min-h-[44px] px-3 py-2 border-2 border-slate-300 rounded-xl text-sm font-semibold text-rose-700 focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tạm ứng đã trừ (VNĐ)</label>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    value={adjForm.advance_deduction}
                    onChange={(e) => setAdjForm((f) => ({ ...f, advance_deduction: Number(e.target.value) || 0 }))}
                    className="w-full min-h-[44px] px-3 py-2 border-2 border-slate-300 rounded-xl text-sm font-semibold text-amber-800 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi chú điều chỉnh (hiển thị trên phiếu lương)</label>
                <textarea
                  rows={2}
                  value={adjForm.adjustment_note}
                  onChange={(e) => setAdjForm((f) => ({ ...f, adjustment_note: e.target.value }))}
                  placeholder="Ví dụ: Thưởng hoàn thành vượt tiến độ công trình..."
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-blue-600 leading-relaxed"
                />
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setAdjustItem(null)}
                  disabled={adjSaving}
                  className="flex-1 min-h-[44px] py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl border border-slate-300 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={adjSaving}
                  className="flex-1 min-h-[44px] py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {adjSaving ? "Đang lưu..." : "Lưu điều chỉnh"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Phiếu Lương Chi Tiết */}
      {selectedSlipItem && (
        <SalarySlipModal
          payrollItem={selectedSlipItem}
          month={month}
          year={year}
          isAdminOrAccountant={true}
          showToast={notify}
          onStatusUpdated={() => fetchPayrollFromApi()}
          onClose={() => setSelectedSlipItem(null)}
        />
      )}

    </div>
  );
}
