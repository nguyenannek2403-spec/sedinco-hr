import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Calendar,
  Search,
  Download,
  CheckCircle2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  AlertTriangle,
  LayoutGrid,
  List,
  UserCheck
} from "lucide-react";
import { safeGet, safePost, sanitizeFormula, generateIdempotencyKey } from "../utils/api";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { useDebouncedValue } from "../hooks/useDebounce";
import { DEPARTMENT_OPTIONS } from "../utils/viLabels";
import PeriodLockModal from "./PeriodLockModal";
import { ROLES, hasPermission } from "../constants/roles";
import { AppButton, AppModal, FormRow, StatusBadge, SkeletonList, EmptyState } from "./ui";

const getBadgeStyle = (status) => {
  if (status === "1") return "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-300 border-2 border-emerald-500 dark:border-emerald-500/70 font-black";
  if (status === "0.5") return "bg-teal-100 dark:bg-teal-950/70 text-teal-900 dark:text-teal-300 border-2 border-teal-500 dark:border-teal-500/70 font-black";
  if (status === "P") return "bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border-2 border-amber-500 dark:border-amber-500/70 font-black";
  if (String(status).includes("OT")) return "bg-indigo-100 dark:bg-indigo-950/70 text-indigo-900 dark:text-indigo-300 border-2 border-indigo-500 dark:border-indigo-500/70 font-black";
  if (status === "L") return "bg-rose-100 dark:bg-rose-950/70 text-rose-900 dark:text-rose-300 border-2 border-rose-500 dark:border-rose-500/70 font-black";
  if (status === "KP") return "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-2 border-slate-400 dark:border-slate-600 font-black";
  return "text-slate-400 dark:text-slate-400 border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/70";
};

export default function AttendanceMatrixTable({
  currentUser,
  attendanceData,
  month = new Date().getMonth() + 1,
  year = new Date().getFullYear(),
  onMonthChange,
  onRefresh,
  userRole = "admin",
  activeRole,
  dynamicPerms = {},
  isLocked: propIsLocked,
  onShowToast,
  showToast,
  onRecordAuditLog
}) {
  const effectiveRole = activeRole || userRole || "admin";
  const notify = onShowToast || showToast;
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [selectedDepartment, setSelectedDepartment] = useState("ALL");
  const [viewMode, setViewMode] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "cards" : "matrix"
  );
  const [detailEmpCode, setDetailEmpCode] = useState(null);
  const [editingCell, setEditingCell] = useState(null); // { emp, dayIndex, currentStatus }
  const [selectedStatus, setSelectedStatus] = useState("1");
  const [otHours, setOtHours] = useState(2);
  const [editError, setEditError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showProxyModal, setShowProxyModal] = useState(false);
  const [proxyForm, setProxyForm] = useState({
    ma_nv: "",
    record_date: new Date().toISOString().slice(0, 10),
    check_in_time: "08:00",
    check_out_time: "17:30",
    work_location_type: "OFFICE",
    note: "Quản lý chấm công hộ do quên điện thoại"
  });
  const [proxySaving, setProxySaving] = useState(false);
  const savingCellRef = useRef(false);
  const proxyInFlightRef = useRef(false);
  const [internalData, setInternalData] = useState([]);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [matrixError, setMatrixError] = useState("");

  const [internalLocked, setInternalLocked] = useState(() => {
    try {
      const saved = localStorage.getItem(`sedinco_locked_period_${year}_${month}`);
      return saved ? JSON.parse(saved).locked : false;
    } catch (e) {
      return false;
    }
  });

  const fetchMatrixFromApi = useCallback(async () => {
    if (Array.isArray(attendanceData)) return;
    setLoadingMatrix(true);
    setMatrixError("");
    try {
      const res = await safeGet("/attendance", { month, year }, { cancelPrevious: true });
      if (Array.isArray(res?.data)) {
        setInternalData(res.data);
      } else if (Array.isArray(res)) {
        setInternalData(res);
      } else {
        setInternalData([]);
      }
      if (res?.isLocked !== undefined) {
        setInternalLocked(Boolean(res.isLocked));
      }
    } catch (e) {
      console.warn("Lỗi tải bảng công ma trận:", e);
      setMatrixError(e?.message || "Không thể tải bảng chấm công. Vui lòng thử lại.");
    } finally {
      setLoadingMatrix(false);
    }
  }, [attendanceData, month, year]);

  useEffect(() => {
    fetchMatrixFromApi();
  }, [fetchMatrixFromApi]);

  const isLocked = propIsLocked !== undefined ? propIsLocked : internalLocked;

  // Tách quyền: Admin luôn được sửa; Kế toán chỉ được sửa khi được cấp quyền attendance_edit (và kỳ chưa chốt)
  const canEdit =
    !isLocked &&
    (effectiveRole === ROLES.ADMIN ||
      (effectiveRole === ROLES.ACCOUNTANT && dynamicPerms?.attendance_edit === true));
  const canLockPeriod =
    hasPermission(effectiveRole, "canLockPeriod") &&
    (effectiveRole !== ROLES.ACCOUNTANT || dynamicPerms?.attendance_lock === true);
  const canUnlockPeriod = hasPermission(effectiveRole, "canUnlockPeriod");

  // Số ngày trong tháng
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const sourceList = Array.isArray(attendanceData) ? attendanceData : internalData;

  const availableDepartments = Array.from(
    new Set([
      ...DEPARTMENT_OPTIONS,
      ...(sourceList || []).map((item) => item.department).filter(Boolean)
    ])
  );

  // Lọc nhân sự theo từ khóa tìm kiếm + khối/bộ phận
  const filteredData = (sourceList || []).filter(item => {
    if (item.role === "admin") return false;
    const q = (debouncedSearch || "").toLowerCase();
    const matchText = !q ||
      item.ho_ten?.toLowerCase().includes(q) ||
      item.ma_nv?.toLowerCase().includes(q) ||
      item.department?.toLowerCase().includes(q);
    const empDept = item.department || "Khối Công trình";
    const matchDept = selectedDepartment === "ALL" || empDept === selectedDepartment;
    return matchText && matchDept;
  });

  const handleOpenProxyModal = () => {
    const firstValid = (sourceList || []).find((e) => e.ma_nv !== currentUser?.ma_nv) || sourceList[0];
    setProxyForm({
      ma_nv: firstValid?.ma_nv || "",
      record_date: new Date().toISOString().slice(0, 10),
      check_in_time: "08:00",
      check_out_time: "17:30",
      work_location_type: "OFFICE",
      note: "Quản lý chấm công hộ do quên điện thoại"
    });
    setShowProxyModal(true);
  };

  const handleSubmitProxyCheckIn = async (e) => {
    e.preventDefault();
    if (proxyInFlightRef.current) return;
    if (!proxyForm.ma_nv) {
      if (notify) notify("Vui lòng chọn nhân viên cần chấm công hộ!", "error");
      return;
    }
    if (!proxyForm.record_date) {
      if (notify) notify("Vui lòng chọn ngày chấm công!", "error");
      return;
    }
    proxyInFlightRef.current = true;
    setProxySaving(true);
    try {
      const res = await safePost(
        "/attendance/proxy-check-in",
        {
          ma_nv: proxyForm.ma_nv,
          record_date: proxyForm.record_date,
          check_in_time: proxyForm.check_in_time || null,
          check_out_time: proxyForm.check_out_time || null,
          work_location_type: proxyForm.work_location_type,
          note: proxyForm.note
        },
        { idempotencyKey: generateIdempotencyKey("proxy_checkin") }
      );
      if (res?.success) {
        if (notify) notify(res.message || "Đã chấm công hộ nhân viên thành công!", "success");
        setShowProxyModal(false);
        fetchMatrixFromApi();
        if (onRefresh) onRefresh();
      } else {
        if (notify) notify(res?.message || "Không thể chấm công hộ.", "error");
      }
    } catch (err) {
      if (notify) notify(err.message || "Lỗi khi gửi yêu cầu chấm công hộ.", "error");
    } finally {
      proxyInFlightRef.current = false;
      setProxySaving(false);
    }
  };

  const handleCellClick = (emp, dayIndex) => {
    if (isLocked) {
      if (notify) {
        notify(`Kỳ công tháng ${month}/${year} đã chốt sổ. Chỉ Quản trị viên mới có quyền mở khóa.`, "warning");
      }
      return;
    }
    if (!canEdit) {
      if (effectiveRole === ROLES.ACCOUNTANT && notify) {
        notify("Tách quyền: Kế toán chỉ có quyền xem công (chưa được cấp quyền sửa công).", "warning");
      }
      return;
    }
    const currentVal = (emp.days && emp.days[dayIndex]) || "";
    setEditingCell({
      emp,
      dayNum: dayIndex + 1,
      currentStatus: currentVal
    });
    setSelectedStatus(currentVal || "1");
    setOtHours(2);
    setEditError("");
  };

  const handleSaveCellAttendance = async () => {
    if (!editingCell || savingCellRef.current) return;

    savingCellRef.current = true;
    setIsSubmitting(true);
    setEditError("");
    try {
      const idempotencyKey = generateIdempotencyKey("att_edit");
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(editingCell.dayNum).padStart(2, "0")}`;
      await safePost("/attendance/update", {
        ma_nv: editingCell.emp.ma_nv,
        dateStr,
        day: editingCell.dayNum,
        month: month,
        year: year,
        status: selectedStatus || "1",
        hours: selectedStatus === "OT" || selectedStatus === "1/OT" ? otHours : 0,
        ot_hours: selectedStatus === "OT" || selectedStatus === "1/OT" ? otHours : 0,
        isDelete: !selectedStatus
      }, { idempotencyKey });

      if (onRecordAuditLog) {
        onRecordAuditLog(
          "Điều chỉnh ngày công",
          `Sửa công ngày ${editingCell.dayNum}/${month}/${year} của ${editingCell.emp.ho_ten} (${editingCell.emp.ma_nv}) thành [${selectedStatus || "Xóa công"}]`,
          "Quản trị viên cập nhật bảng công"
        );
      }

      if (notify) {
        notify(`Đã cập nhật công ngày ${editingCell.dayNum}/${month} cho ${editingCell.emp.ho_ten}!`, "success");
      }
      setEditingCell(null);
      await fetchMatrixFromApi();
      if (onRefresh) onRefresh();
    } catch (err) {
      setEditError(err.message || "Không thể cập nhật ngày công.");
    } finally {
      savingCellRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Xuất bảng chấm công sang CSV UTF-8
  const handleExportCSV = async () => {
    const headers = ["Mã NV", "Họ và Tên", ...dayNumbers.map(d => `Ngày ${d}`), "Đủ công (1)", "Nửa công (0.5)", "Phép (P)", "Tăng ca (OT)"];
    const rows = filteredData.map(item => {
      const days = item.days || [];
      const count1 = days.filter(d => d === "1" || d === "1/OT").length;
      const countHalf = days.filter(d => d === "0.5").length;
      const countP = days.filter(d => d === "P").length;
      const countOT = days.filter(d => String(d).includes("OT")).length;
      return [
        `"${sanitizeFormula(item.ma_nv)}"`,
        `"${sanitizeFormula(item.ho_ten)}"`,
        ...dayNumbers.map(d => `"${sanitizeFormula(days[d - 1] || "")}"`),
        count1,
        countHalf,
        countP,
        countOT
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    try {
      await zmpAdapter.saveFile({
        filename: `Bang_Cham_Cong_Ma_Tran_Thang_${month}_${year}.csv`,
        content: csvContent,
        mimeType: "text/csv;charset=utf-8;"
      });
      if (showToast) showToast(`Đã tải xuống bảng chấm công Tháng ${month}/${year}!`, "success");
    } catch (err) {
      if (showToast) showToast(err?.message || "Không thể xuất bảng chấm công!", "error");
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-24">
      
      {/* Header Điều Khiển & Tìm Kiếm */}
      <div className="p-4 sm:p-5 border-b-2 border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-800/60">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="text-blue-600 dark:text-blue-400 shrink-0" size={22} />
            <h3 className="font-bold text-lg leading-snug text-slate-900 dark:text-white">
              Bảng chấm công ma trận
            </h3>
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-1">
            Tổng hợp dữ liệu điểm danh thực tế của toàn bộ cán bộ công nhân viên ({filteredData.length} nhân sự)
          </p>
        </div>

        {/* Thanh tác vụ: Tháng/Năm, Tìm kiếm & Nút hành động */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Bộ chọn tháng/năm */}
          <div className="flex items-center bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-xl px-1.5 py-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => onMonthChange(month > 1 ? month - 1 : 12, month > 1 ? year : year - 1)}
              className="min-w-[44px] min-h-[44px] p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer border border-transparent hover:border-slate-300 dark:hover:border-slate-600 flex items-center justify-center"
              title="Tháng trước"
              aria-label="Tháng trước"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="font-black text-sm px-2.5 text-slate-900 dark:text-white">
              Tháng {month}/{year}
            </span>
            <button
              type="button"
              onClick={() => onMonthChange(month < 12 ? month + 1 : 1, month < 12 ? year : year + 1)}
              className="min-w-[44px] min-h-[44px] p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer border border-transparent hover:border-slate-300 dark:hover:border-slate-600 flex items-center justify-center"
              title="Tháng sau"
              aria-label="Tháng sau"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Lọc bộ phận */}
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="min-h-[44px] px-3 py-2 text-sm font-semibold bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-xl outline-none focus:border-blue-600 dark:focus:border-blue-400 shadow-sm text-slate-800 dark:text-slate-100"
          >
            <option value="ALL">🏢 Tất cả bộ phận</option>
            {availableDepartments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          {/* Ô tìm kiếm */}
          <div className="relative min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên hoặc mã NV..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-400 border-2 border-slate-300 dark:border-slate-600 rounded-xl outline-none focus:border-blue-600 dark:focus:border-blue-400 shadow-sm"
            />
          </div>

          {/* Nút Chấm công hộ / Điểm danh nhanh */}
          {canEdit && (
            <AppButton
              variant="primary"
              icon={UserCheck}
              onClick={handleOpenProxyModal}
              className="text-sm px-3.5 py-2"
            >
              Chấm công hộ
            </AppButton>
          )}

          {/* Nút Xuất CSV */}
          <AppButton
            variant="success"
            icon={Download}
            onClick={handleExportCSV}
            className="text-sm px-4 py-2"
          >
            Xuất CSV
          </AppButton>

          {/* Nút Làm Mới */}
          <AppButton
            variant="secondary"
            icon={RefreshCw}
            loading={loadingMatrix}
            onClick={() => {
              fetchMatrixFromApi();
              if (onRefresh) onRefresh();
            }}
            aria-label="Làm mới dữ liệu"
            title="Làm mới dữ liệu"
            className="min-w-[44px] px-3 py-2"
          />

          {/* Nút Chốt Công Kỳ Lương (Kế toán được phân quyền & Quản trị) */}
          {canLockPeriod && !isLocked && (
            <AppButton
              variant="danger"
              icon={Lock}
              onClick={() => setShowLockModal(true)}
              className="text-sm px-4 py-2"
            >
              Chốt kỳ công
            </AppButton>
          )}

          {/* Nút Mở Lại Kỳ Công Đã Chốt (Chỉ Quản Trị) */}
          {canUnlockPeriod && isLocked && (
            <AppButton
              variant="warning"
              icon={Unlock}
              onClick={() => setShowLockModal(true)}
              className="text-sm px-4 py-2"
            >
              Mở lại kỳ đã chốt
            </AppButton>
          )}

          {isLocked && !canUnlockPeriod && (
            <div className="min-h-[44px] flex items-center gap-2 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-semibold px-4 py-2 rounded-xl border-2 border-slate-400 dark:border-slate-600 whitespace-nowrap">
              <Lock size={16} className="text-slate-600 dark:text-slate-300 shrink-0" />
              <span>Đã khóa sổ</span>
            </div>
          )}
        </div>
      </div>

      {/* Banner Cảnh Báo Nếu Kỳ Đã Chốt */}
      {isLocked && (
        <div className="px-5 py-3 bg-amber-100/80 dark:bg-amber-950/60 border-b-2 border-amber-300 dark:border-amber-800/70 flex items-center justify-between text-sm text-amber-950 dark:text-amber-200 font-bold">
          <div className="flex items-center gap-2.5">
            <Lock size={18} className="text-amber-700 dark:text-amber-300 shrink-0" />
            <span>Kỳ công Tháng {month}/{year} đã được Kế toán chốt sổ. Toàn bộ bảng công ở chế độ CHỈ ĐỌC.</span>
          </div>
          {canUnlockPeriod && (
            <span className="text-xs text-amber-800 dark:text-amber-300 italic underline">Quản trị viên có thể mở khóa khi cần thiết</span>
          )}
        </div>
      )}

      {/* Thanh chuyển chế độ xem Mobile-First & Chú giải */}
      <div className="px-4 sm:px-5 py-3 bg-slate-50 dark:bg-slate-900/90 border-b-2 border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            data-filter-group="matrix-view-mode"
            className="inline-flex p-1 bg-slate-100 border border-slate-200/80 dark:bg-slate-950 dark:border-slate-800 rounded-xl gap-1"
          >
            <button
              type="button"
              data-active={viewMode === "cards" ? "true" : "false"}
              onClick={() => setViewMode("cards")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-extrabold transition min-h-[44px] cursor-pointer ${
                viewMode === "cards"
                  ? "bg-blue-600 text-white shadow-sm dark:bg-blue-600 dark:text-white ring-1 ring-blue-500/50"
                  : "bg-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              <List size={15} />
              <span>Dạng thẻ (Dễ xem)</span>
            </button>
            <button
              type="button"
              data-active={viewMode === "matrix" ? "true" : "false"}
              onClick={() => setViewMode("matrix")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-extrabold transition min-h-[44px] cursor-pointer ${
                viewMode === "matrix"
                  ? "bg-blue-600 text-white shadow-sm dark:bg-blue-600 dark:text-white ring-1 ring-blue-500/50"
                  : "bg-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              <LayoutGrid size={15} />
              <span>Bảng 31 ngày</span>
            </button>
          </div>
          {canEdit && (
            <span className="text-xs text-blue-700 dark:text-blue-300 font-extrabold">
              {viewMode === "cards"
                ? "💡 Chạm vào nhân viên để xem & sửa lịch 31 ngày"
                : "💡 Chạm trực tiếp vào ô ngày để sửa công"}
            </span>
          )}
          {isLocked && <span className="text-xs text-rose-700 dark:text-rose-300 font-black">🔒 Bảng công đã bị khóa sổ</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
          <span className="font-black text-slate-900 dark:text-white">Ký hiệu:</span>
          <StatusBadge type="attendance" status="1" />
          <StatusBadge type="attendance" status="0.5" />
          <StatusBadge type="attendance" status="P" />
          <StatusBadge type="attendance" status="OT" />
          <StatusBadge type="attendance" status="L" />
          <StatusBadge type="attendance" status="KP" />
        </div>
      </div>

      {matrixError && (
        <div className="mx-4 mt-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs sm:text-sm font-bold flex items-center justify-between gap-2">
          <span>{matrixError}</span>
          <AppButton
            variant="danger"
            onClick={fetchMatrixFromApi}
            className="text-xs px-3.5 py-2 shrink-0"
          >
            Thử lại
          </AppButton>
        </div>
      )}

      {/* CHẾ ĐỘ 1: DẠNG THẺ MOBILE-FIRST */}
      {viewMode === "cards" && (
        <div className="p-3 sm:p-4 space-y-2.5 bg-slate-50/70 dark:bg-slate-950/40">
          {loadingMatrix ? (
            <SkeletonList rows={3} label="Đang tải dữ liệu bảng chấm công..." />
          ) : filteredData.length === 0 ? (
            <EmptyState icon={Calendar} title="Không tìm thấy nhân viên nào khớp từ khóa." />
          ) : (
            filteredData.map((emp, empIdx) => {
              const days = emp.days || [];
              const count1 = days.filter((d) => d === "1" || d === "1/OT").length;
              const countHalf = days.filter((d) => d === "0.5").length;
              const totalWorkDays = count1 + countHalf * 0.5;
              const countP = days.filter((d) => d === "P").length;
              const countOT = days.filter((d) => String(d).includes("OT")).length;
              const countKP = days.filter((d) => d === "KP" || d === "KL").length;

              return (
                <button
                  key={emp.ma_nv || empIdx}
                  type="button"
                  onClick={() => setDetailEmpCode(emp.ma_nv)}
                  className="perf-list-item w-full text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-sm hover:border-blue-400 dark:hover:border-blue-500 active:scale-[0.99] transition flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-black flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800/70">
                        {(emp.ho_ten || "N").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-extrabold text-slate-900 dark:text-white text-sm truncate">
                          {emp.ho_ten}
                        </div>
                        <div className="text-xs text-blue-700 dark:text-blue-300 font-bold">
                          Mã NV: {emp.ma_nv} {(emp.department || emp.bo_phan) ? `• ${emp.department || emp.bo_phan}` : ""}
                        </div>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
                      {daysInMonth} ngày
                      <ChevronRight size={16} />
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 px-2 py-1.5 text-center">
                      <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Tổng công</div>
                      <div className="text-sm font-black text-emerald-900 dark:text-emerald-200">{totalWorkDays}</div>
                    </div>
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/70 px-2 py-1.5 text-center">
                      <div className="text-xs font-bold text-amber-700 dark:text-amber-300">Nghỉ phép</div>
                      <div className="text-sm font-black text-amber-900 dark:text-amber-200">{countP}</div>
                    </div>
                    <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/70 px-2 py-1.5 text-center">
                      <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300">Tăng ca</div>
                      <div className="text-sm font-black text-indigo-900 dark:text-indigo-200">{countOT}</div>
                    </div>
                    <div className="rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-center">
                      <div className="text-xs font-bold text-slate-600 dark:text-slate-300">Không phép</div>
                      <div className="text-sm font-black text-slate-800 dark:text-slate-100">{countKP}</div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* CHẾ ĐỘ 2: BẢNG MA TRẬN 31 NGÀY (Horizontal scroll mượt trên Mobile & Sticky cột Nhân Sự) */}
      {viewMode === "matrix" && (
      <div className="overflow-x-auto touch-scroll-x">
        <table className="w-full border-collapse text-xs text-left">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-b-2 border-slate-300 dark:border-slate-700 uppercase font-black sticky top-0 z-10">
              <th className="p-2.5 sm:p-3.5 pl-3 sm:pl-4 sticky left-0 bg-slate-100 dark:bg-slate-800 z-20 min-w-[140px] sm:min-w-[190px] max-w-[155px] sm:max-w-none shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)] dark:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.5)]">
                Nhân Sự
              </th>
              {dayNumbers.map(d => {
                const dayOfWeek = new Date(year, month - 1, d).getDay();
                const isSunday = dayOfWeek === 0;
                return (
                  <th
                    key={d}
                    className={`p-1.5 text-center min-w-[48px] border-l border-slate-200 dark:border-slate-700 ${
                      isSunday ? "bg-rose-100/60 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200" : ""
                    }`}
                  >
                    <div className="text-sm font-black">{d}</div>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-300 block">
                      {isSunday ? "CN" : `T${dayOfWeek + 1}`}
                    </span>
                  </th>
                );
              })}
              <th className="p-3 text-center bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200 font-black border-l-2 border-slate-300 dark:border-slate-700 min-w-[60px] text-xs">
                Đủ (1)
              </th>
              <th className="p-3 text-center bg-teal-100/70 dark:bg-teal-950/60 text-teal-950 dark:text-teal-200 font-black border-l-2 border-slate-300 dark:border-slate-700 min-w-[60px] text-xs">
                Nửa (0.5)
              </th>
              <th className="p-3 text-center bg-amber-100/70 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-black border-l-2 border-slate-300 dark:border-slate-700 min-w-[60px] text-xs">
                Phép (P)
              </th>
              <th className="p-3 text-center bg-indigo-100/70 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-200 font-black border-l-2 border-slate-300 dark:border-slate-700 min-w-[60px] text-xs">
                OT (h)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={daysInMonth + 5} className="py-12 text-center text-slate-500 dark:text-slate-300 text-sm font-bold">
                  Không tìm thấy dữ liệu điểm danh phù hợp.
                </td>
              </tr>
            ) : (
              filteredData.map((emp, empIdx) => {
                const days = emp.days || [];
                const count1 = days.filter(d => d === "1" || d === "1/OT").length;
                const countHalf = days.filter(d => d === "0.5").length;
                const countP = days.filter(d => d === "P").length;
                const countOT = days.filter(d => String(d).includes("OT")).length;

                return (
                  <tr key={emp.ma_nv || empIdx} className="group bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    {/* Cột cố định: Tên & Mã NV (Đặc 100% chống nhìn xuyên) */}
                    <td className="p-2.5 sm:p-3 pl-3 sm:pl-4 sticky left-0 bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800 z-10 min-w-[140px] sm:min-w-[190px] max-w-[165px] sm:max-w-none shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)] dark:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.5)]">
                      <div className="font-black text-slate-900 dark:text-white text-xs sm:text-sm leading-tight break-words">{emp.ho_ten}</div>
                      <div className="text-xs text-blue-700 dark:text-blue-300 font-mono font-bold mt-0.5">{emp.ma_nv}</div>
                    </td>

                    {/* 31 Cột ngày */}
                    {dayNumbers.map((d, dIdx) => {
                      const val = days[dIdx] || "";
                      const badgeClass = getBadgeStyle(val);
                      const isSunday = new Date(year, month - 1, d).getDay() === 0;

                      return (
                        <td
                          key={d}
                          className={`p-1 text-center border-l border-slate-100 dark:border-slate-800 ${
                            isSunday ? "bg-rose-50/30 dark:bg-rose-950/30" : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleCellClick(emp, dIdx)}
                            title={`Ngày ${d}/${month}: ${val || "Chưa có công"} (Nhấp để sửa)`}
                            aria-label={`${emp.ho_ten} ngày ${d}/${month}: ${val || "Chưa có công"}`}
                            className={`min-w-[44px] min-h-[44px] px-1 mx-auto rounded-xl flex items-center justify-center text-xs font-black shadow-none active:scale-95 transition cursor-pointer ${badgeClass}`}
                          >
                            {val || "·"}
                          </button>
                        </td>
                      );
                    })}

                    {/* Cột Tổng Kết */}
                    <td className="p-2.5 text-center font-black text-emerald-900 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/40 border-l-2 border-slate-300 dark:border-slate-700 text-sm">
                      {count1}
                    </td>
                    <td className="p-2.5 text-center font-black text-teal-900 dark:text-teal-300 bg-teal-50/60 dark:bg-teal-950/40 border-l-2 border-slate-300 dark:border-slate-700 text-sm">
                      {countHalf}
                    </td>
                    <td className="p-2.5 text-center font-black text-amber-900 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/40 border-l-2 border-slate-300 dark:border-slate-700 text-sm">
                      {countP}
                    </td>
                    <td className="p-2.5 text-center font-black text-indigo-900 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/40 border-l-2 border-slate-300 dark:border-slate-700 text-sm">
                      {countOT}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Modal Lịch Chi Tiết 31 Ngày Của Nhân Viên (Khi mở từ Dạng Thẻ) */}
      {(() => {
        if (!detailEmpCode) return null;
        const emp =
          filteredData.find((e) => e.ma_nv === detailEmpCode) ||
          (sourceList || []).find((e) => e.ma_nv === detailEmpCode);
        if (!emp) return null;
        const days = emp.days || [];
        return (
          <AppModal
            isOpen={true}
            onClose={() => setDetailEmpCode(null)}
            title={emp.ho_ten}
            subtitle={`${emp.ma_nv} • Tháng ${month}/${year}`}
            maxWidthClass="max-w-lg"
          >
            <div className="p-4 space-y-3 bg-slate-50 dark:bg-slate-900">
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium text-center">
                {canEdit
                  ? "Chạm vào bất kỳ ngày nào bên dưới để chỉnh sửa công"
                  : "Chế độ chỉ xem chi tiết công theo ngày"}
              </p>
              <div className="grid grid-cols-7 gap-2">
                {dayNumbers.map((d, dIdx) => {
                  const val = days[dIdx] || "";
                  const badgeClass = getBadgeStyle(val);
                  const dayOfWeek = new Date(year, month - 1, d).getDay();
                  const isSunday = dayOfWeek === 0;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleCellClick(emp, dIdx)}
                      className={`min-h-[58px] rounded-xl border p-1.5 flex flex-col items-center justify-between transition active:scale-95 ${
                        isSunday
                          ? "bg-rose-50/70 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70"
                          : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-500 dark:text-slate-300">
                        {d} ({isSunday ? "CN" : `T${dayOfWeek + 1}`})
                      </div>
                      <div
                        className={`w-full py-1 rounded-lg text-xs font-black text-center ${badgeClass}`}
                      >
                        {val || "·"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </AppModal>
        );
      })()}

      {/* Modal Chỉnh Sửa Công Ô Trực Tiếp */}
      {editingCell && (
        <AppModal
          isOpen={true}
          onClose={() => setEditingCell(null)}
          title={`Sửa công ngày ${editingCell.dayNum}/${month}`}
          subtitle={`${editingCell.emp.ho_ten} (${editingCell.emp.ma_nv})`}
          maxWidthClass="max-w-md"
          maxHeightClass="max-h-[88vh]"
          zIndexClass="z-[60]"
          disableClose={isSubmitting}
          footer={
            <div className="flex gap-3">
              <AppButton
                variant="secondary"
                fullWidth
                disabled={isSubmitting}
                onClick={() => setEditingCell(null)}
              >
                Đóng / Quay lại
              </AppButton>
              <AppButton
                variant="primary"
                fullWidth
                loading={isSubmitting}
                icon={CheckCircle2}
                onClick={handleSaveCellAttendance}
              >
                Lưu thay đổi
              </AppButton>
            </div>
          }
        >
          <div className="p-5 space-y-4 text-sm text-slate-800 dark:text-slate-100">
            <div>
              <label className="block text-slate-800 dark:text-slate-100 font-black mb-2">
                Chọn nhanh trạng thái công
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { code: "1", label: "Đủ công (1)", activeClass: "bg-emerald-600 text-white border-emerald-700" },
                  { code: "0.5", label: "Nửa công (0.5)", activeClass: "bg-teal-600 text-white border-teal-700" },
                  { code: "P", label: "Nghỉ phép (P)", activeClass: "bg-amber-500 text-white border-amber-600" },
                  { code: "KP", label: "Nghỉ không lương (KL)", activeClass: "bg-slate-700 text-white border-slate-800" },
                  { code: "OT", label: "Tăng ca (OT)", activeClass: "bg-indigo-600 text-white border-indigo-700" },
                  { code: "1/OT", label: "Đủ công + OT", activeClass: "bg-violet-600 text-white border-violet-700" },
                  { code: "L", label: "Nghỉ lễ (L)", activeClass: "bg-rose-600 text-white border-rose-700" },
                  { code: "", label: "Xóa công ngày này", activeClass: "bg-red-600 text-white border-red-700" },
                ].map((opt) => {
                  const isSelected = selectedStatus === opt.code;
                  return (
                    <button
                      key={opt.code || "clear"}
                      type="button"
                      onClick={() => setSelectedStatus(opt.code)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-extrabold text-left transition ${
                        isSelected
                          ? `${opt.activeClass} shadow-sm`
                          : "bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {(selectedStatus === "OT" || selectedStatus === "1/OT") && (
              <div className="border-2 border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800/70 overflow-hidden">
                <FormRow
                  label="Số giờ tăng ca (OT)"
                  description="Thường 1.5x • CN 2.0x • Lễ 3.0x"
                >
                  <input
                    type="number"
                    min="1"
                    max="12"
                    step="0.5"
                    value={otHours}
                    onChange={(e) => setOtHours(Number(e.target.value))}
                    className="w-24 px-3 py-2 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-lg outline-none font-black text-indigo-800 dark:text-indigo-300 text-center focus:border-indigo-600"
                  />
                </FormRow>
              </div>
            )}

            {editError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2 font-bold">
                <AlertTriangle size={16} className="shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{editError}</span>
              </div>
            )}
          </div>
        </AppModal>
      )}

      {/* Modal Chấm Công Hộ / Điểm Danh Nhanh (Dành cho Quản lý / Kế toán) */}
      {showProxyModal && (
        <AppModal
          isOpen={true}
          onClose={() => !proxySaving && setShowProxyModal(false)}
          title="Chấm công hộ nhân viên"
          maxWidthClass="max-w-md"
          zIndexClass="z-[70]"
          disableClose={proxySaving}
          closeOnBackdrop={!proxySaving}
          footer={
            <div className="flex gap-2.5">
              <AppButton
                variant="secondary"
                fullWidth
                disabled={proxySaving}
                onClick={() => setShowProxyModal(false)}
              >
                Đóng / Quay lại
              </AppButton>
              <AppButton
                type="submit"
                form="proxy-checkin-form"
                variant="primary"
                fullWidth
                loading={proxySaving}
                disabled={proxySaving || !proxyForm.ma_nv}
              >
                {proxySaving ? "Đang lưu..." : "Xác nhận chấm hộ"}
              </AppButton>
            </div>
          }
        >
          <form
            id="proxy-checkin-form"
            onSubmit={handleSubmitProxyCheckIn}
            className="p-5 space-y-3.5 text-slate-800 dark:text-slate-100"
          >
            <div>
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Chọn nhân viên</label>
              <select
                required
                value={proxyForm.ma_nv}
                onChange={(e) => setProxyForm((p) => ({ ...p, ma_nv: e.target.value }))}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                <option value="">-- Chọn nhân viên --</option>
                {(sourceList || [])
                  .filter((emp) => emp.ma_nv !== currentUser?.ma_nv)
                  .map((emp) => (
                    <option key={emp.ma_nv} value={emp.ma_nv}>
                      {emp.ho_ten} ({emp.ma_nv})
                    </option>
                  ))}
              </select>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-700 border-2 border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800/70 overflow-hidden">
              <FormRow label="Ngày chấm công">
                <input
                  type="date"
                  required
                  value={proxyForm.record_date}
                  onChange={(e) => setProxyForm((p) => ({ ...p, record_date: e.target.value }))}
                  className="w-36 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-2 text-base font-bold text-slate-900 dark:text-slate-100 text-center"
                />
              </FormRow>
              <FormRow label="Giờ vào ca">
                <input
                  type="time"
                  value={proxyForm.check_in_time}
                  onChange={(e) => setProxyForm((p) => ({ ...p, check_in_time: e.target.value }))}
                  className="w-32 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-2 text-base font-bold text-slate-900 dark:text-slate-100 text-center"
                />
              </FormRow>
              <FormRow label="Giờ tan ca (nếu có)">
                <input
                  type="time"
                  value={proxyForm.check_out_time}
                  onChange={(e) => setProxyForm((p) => ({ ...p, check_out_time: e.target.value }))}
                  className="w-32 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-2 text-base font-bold text-slate-900 dark:text-slate-100 text-center"
                />
              </FormRow>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Địa điểm làm việc</label>
              <select
                value={proxyForm.work_location_type}
                onChange={(e) => setProxyForm((p) => ({ ...p, work_location_type: e.target.value }))}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                <option value="OFFICE">Tại Văn phòng / Kho xưởng</option>
                <option value="FIELD_WORK">Ngoài công trình / Dự án</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">Ghi chú điểm danh hộ</label>
              <textarea
                rows={2}
                value={proxyForm.note}
                onChange={(e) => setProxyForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="Ví dụ: Quản lý chấm công hộ do nhân viên quên điện thoại"
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-base text-slate-900 dark:text-slate-100"
              />
            </div>
          </form>
        </AppModal>
      )}

      {/* Modal Chốt / Mở Lại Kỳ Công */}
      {showLockModal && (
        <PeriodLockModal
          month={month}
          year={year}
          isCurrentlyLocked={isLocked}
          userRole={effectiveRole}
          onClose={() => setShowLockModal(false)}
          onStatusChanged={(newLocked, lockReason) => {
            setInternalLocked(newLocked);
            if (onRecordAuditLog) {
              onRecordAuditLog(
                newLocked ? "Chốt kỳ công" : "Mở lại kỳ công",
                `${newLocked ? "Chốt sổ" : "Mở khóa"} kỳ chấm công tháng ${month}/${year}`,
                lockReason || (newLocked ? "Kế toán chốt số liệu công tính lương" : "Quản trị viên mở khóa kỳ công")
              );
            }
            if (notify) {
              notify(newLocked ? `Đã chốt sổ kỳ công tháng ${month}/${year} thành công!` : `Đã mở khóa kỳ công tháng ${month}/${year}!`, "success");
            }
            if (onRefresh) onRefresh();
          }}
        />
      )}

    </div>
  );
}
