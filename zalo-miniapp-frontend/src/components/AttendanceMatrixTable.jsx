import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  CheckCircle2,
  RefreshCw,
  Lock,
  AlertTriangle
} from "lucide-react";
import { safeGet, safePost, generateIdempotencyKey } from "../utils/api";
import { useDebouncedValue } from "../hooks/useDebounce";
import { DEPARTMENT_OPTIONS } from "../utils/viLabels";
import { getMonthlyStandardWorkdays, isSundayDay } from "../utils/workdayUtils";
import { ROLES } from "../constants/roles";
import { AppButton, AppModal, FormRow, MonthYearPicker, UserAvatar } from "./ui";

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
  const [editingCell, setEditingCell] = useState(null); // { emp, dayNum, currentStatus }
  const [selectedStatus, setSelectedStatus] = useState("1");
  const [otHours, setOtHours] = useState(2);
  const [editError, setEditError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const savingCellRef = useRef(false);
  const [internalData, setInternalData] = useState([]);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [matrixError, setMatrixError] = useState("");
  const [internalLocked, setInternalLocked] = useState(false);

  const fetchMatrixFromApi = useCallback(async () => {
    if (Array.isArray(attendanceData)) return;
    setLoadingMatrix(true);
    setMatrixError("");
    try {
      const [res, lockRes] = await Promise.all([
        safeGet("/attendance", { month, year }, { cancelPrevious: true }),
        safeGet("/attendance/period-status", { month, year }, { cancelPrevious: false }).catch(() => null)
      ]);
      if (Array.isArray(res?.data)) {
        setInternalData(res.data);
      } else if (Array.isArray(res)) {
        setInternalData(res);
      } else {
        setInternalData([]);
      }
      if (lockRes?.data && lockRes.data.is_locked !== undefined) {
        setInternalLocked(Boolean(lockRes.data.is_locked));
      } else if (res?.isLocked !== undefined) {
        setInternalLocked(Boolean(res.isLocked));
      } else {
        setInternalLocked(false);
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

  // Số ngày trong tháng & Số ngày công chuẩn tự động (trừ Chủ nhật)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const stdWorkdays = getMonthlyStandardWorkdays(month, year);

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
      const targetMaNv = editingCell.emp.ma_nv;
      const targetDayNum = editingCell.dayNum;
      const targetDayIdx = targetDayNum - 1;
      const nextStatus = selectedStatus || "";
      const nextOtHours = nextStatus === "OT" || nextStatus === "1/OT" ? otHours : 0;
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(targetDayNum).padStart(2, "0")}`;
      await safePost("/attendance/update", {
        ma_nv: targetMaNv,
        dateStr,
        day: targetDayNum,
        month: month,
        year: year,
        status: nextStatus,
        hours: nextOtHours,
        ot_hours: nextOtHours,
        isDelete: !nextStatus
      }, { idempotencyKey });

      // Cập nhật lạc quan trạng thái ma trận ngay lập tức (đặc biệt xóa sạch chấm cam / nhãn đi muộn khi chỉnh thành đủ công)
      setInternalData((prev) => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;
        return prev.map((empRow) => {
          if (empRow.ma_nv !== targetMaNv) return empRow;
          const nextDays = Array.isArray(empRow.days) ? [...empRow.days] : [];
          const nextDetails = Array.isArray(empRow.dayDetails) ? [...empRow.dayDetails] : [];
          nextDays[targetDayIdx] = nextStatus;
          if (!nextStatus) {
            nextDetails[targetDayIdx] = null;
          } else {
            const upperSt = String(nextStatus).trim().toUpperCase();
            const isFullAdj = ["1", "1/OT", "P", "L"].includes(upperSt);
            const prevDetail = nextDetails[targetDayIdx] || {};
            const cleanNote = upperSt === "P"
              ? "Nghỉ phép hưởng lương (P)"
              : upperSt === "L"
                ? "Nghỉ lễ hưởng lương (L)"
                : isFullAdj
                  ? "Đúng giờ • Đủ công"
                  : prevDetail.attendance_note;
            nextDetails[targetDayIdx] = {
              ...prevDetail,
              status: nextStatus,
              ot_hours: nextOtHours,
              ...(isFullAdj
                ? {
                    late_minutes: 0,
                    early_leave_minutes: 0,
                    work_credit: 1,
                    duration_status: "ADMIN_ADJUSTED_FULL",
                    attendance_note: cleanNote
                  }
                : {})
            };
          }
          return { ...empRow, days: nextDays, dayDetails: nextDetails };
        });
      });

      if (onRecordAuditLog) {
        onRecordAuditLog(
          "Điều chỉnh ngày công",
          `Sửa công ngày ${targetDayNum}/${month}/${year} của ${editingCell.emp.ho_ten} (${targetMaNv}) thành [${nextStatus || "Xóa công"}]`,
          "Quản trị viên cập nhật bảng công"
        );
      }

      if (notify) {
        notify(`Đã cập nhật công ngày ${targetDayNum}/${month} cho ${editingCell.emp.ho_ten}!`, "success");
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

  return (
    <div className="space-y-4 mb-24">
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] overflow-hidden">
      {/* Header Điều Khiển Tinh Gọn (1 dòng chọn kỳ + lọc bộ phận + tìm kiếm) */}
      <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/90 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <MonthYearPicker
              month={month}
              year={year}
              onChange={onMonthChange}
              testIdPrefix="matrix-month-picker"
            />

            <select
              value={selectedDepartment}
              data-testid="matrix-department-filter"
              aria-label="Lọc theo bộ phận"
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="h-[44px] max-w-[210px] px-3 py-1.5 text-xs sm:text-sm font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl outline-none focus:border-[#E11D48] shadow-sm text-slate-800 dark:text-slate-100"
            >
              <option value="ALL">🏢 Tất cả bộ phận</option>
              {availableDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            <span
              data-testid="matrix-standard-workdays-badge"
              className="min-h-[40px] inline-flex items-center px-3 py-1.5 rounded-xl bg-[#FFE4E6] dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/70 text-xs font-extrabold text-[#B80035] dark:text-rose-200 whitespace-nowrap"
            >
              Công chuẩn: {stdWorkdays} ngày
            </span>

            {isLocked && (
              <span
                data-testid="matrix-locked-indicator"
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-xs font-bold text-amber-800 dark:text-amber-200 whitespace-nowrap"
                title="Kỳ công này đã được chốt tại mục Bảng lương"
              >
                <Lock size={13} className="shrink-0" />
                <span>Đã chốt kỳ tại Bảng lương</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-52">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                data-testid="matrix-search-input"
                placeholder="Tìm tên nhân viên..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-[44px] pl-9 pr-3 py-1.5 text-xs sm:text-sm font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 border border-slate-300 dark:border-slate-600 rounded-xl outline-none focus:border-[#E11D48] shadow-sm"
              />
            </div>

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
              className="min-w-[44px] h-[44px] px-3"
            />
          </div>
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

      {/* Bảng Lịch Chấm Công 1 Chạm Duy Nhất */}
      <div className="overflow-x-auto touch-scroll-x">
        <table className="w-full border-collapse text-xs text-left">
          <thead>
            <tr className="bg-[#F0F3FF] dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-b-2 border-slate-300 dark:border-slate-700 uppercase font-black sticky top-0 z-10">
              <th className="p-2.5 sm:p-3.5 pl-3 sm:pl-4 sticky left-0 bg-[#F0F3FF] dark:bg-slate-800 z-20 min-w-[140px] sm:min-w-[190px] max-w-[155px] sm:max-w-none shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)] dark:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.5)]">
                Nhân Sự
              </th>
              {dayNumbers.map(d => {
                const utcDow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
                const isSunday = utcDow === 0;
                return (
                  <th
                    key={d}
                    className={`p-1.5 text-center min-w-[48px] border-l border-slate-200 dark:border-slate-700 ${
                      isSunday ? "bg-rose-100/60 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200" : ""
                    }`}
                  >
                    <div className="text-sm font-black">{d}</div>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-300 block">
                      {isSunday ? "CN" : `T${utcDow + 1}`}
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
            {loadingMatrix && filteredData.length === 0 ? (
              <tr>
                <td colSpan={daysInMonth + 5} className="py-12 text-center text-slate-500 dark:text-slate-300 text-sm font-bold">
                  <RefreshCw size={22} className="mx-auto mb-2 animate-spin text-[#E11D48]" />
                  <span>Đang tải dữ liệu bảng chấm công...</span>
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
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
                      <div className="flex items-center gap-2 min-w-0">
                        <UserAvatar
                          name={emp.ho_ten || emp.ma_nv}
                          avatarUrl={emp.avatar_url}
                          size="xs"
                        />
                        <div className="min-w-0">
                          <div className="font-black text-slate-900 dark:text-white text-xs sm:text-sm leading-tight break-words">{emp.ho_ten}</div>
                          <div className="text-xs text-[#E11D48] dark:text-rose-300 font-mono font-bold mt-0.5">{emp.ma_nv}</div>
                        </div>
                      </div>
                    </td>

                    {/* 31 Cột ngày */}
                    {dayNumbers.map((d, dIdx) => {
                      const val = days[dIdx] || "";
                      const detail = emp.dayDetails?.[dIdx];
                      const hasLateEarly = Boolean(
                        detail &&
                          ((Number(detail.late_minutes) || 0) > 0 ||
                            (Number(detail.early_leave_minutes) || 0) > 0 ||
                            /vào muộn|ra sớm|quên check-out|quá ngắn/i.test(detail.attendance_note || ""))
                      );
                      const isSunday = isSundayDay(d, month, year);
                      const badgeClass = val
                        ? getBadgeStyle(val)
                        : isSunday
                        ? "text-rose-600 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 bg-rose-50/70 dark:bg-rose-950/40 font-bold"
                        : getBadgeStyle("");

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
                            title={`Ngày ${d}/${month}: ${val || (isSunday ? "Nghỉ cuối tuần (CN)" : "Chưa có công")}${detail?.attendance_note ? ` • ${detail.attendance_note}` : ""} (Nhấp để sửa)`}
                            aria-label={`${emp.ho_ten} ngày ${d}/${month}: ${val || (isSunday ? "Chủ nhật nghỉ tuần" : "Chưa có công")}${detail?.attendance_note ? `, ${detail.attendance_note}` : ""}`}
                            className={`relative min-w-[44px] min-h-[44px] px-1 mx-auto rounded-xl flex items-center justify-center text-xs font-black shadow-none active:scale-95 transition cursor-pointer ${badgeClass}`}
                          >
                            {val || (isSunday ? "CN" : "·")}
                            {hasLateEarly && (
                              <span
                                aria-hidden="true"
                                className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-1 ring-white dark:ring-slate-900"
                              />
                            )}
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
            {(() => {
              const cellDetail = editingCell.emp?.dayDetails?.[editingCell.dayNum - 1];
              if (!cellDetail?.attendance_note) return null;
              const isWarn = /vào muộn|ra sớm|quên check-out|quá ngắn/i.test(cellDetail.attendance_note);
              return (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    isWarn
                      ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70"
                      : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60"
                  }`}
                >
                  <div className="font-bold">
                    Vào {cellDetail.check_in_time ? String(cellDetail.check_in_time).slice(0, 5) : "--:--"} • Ra{" "}
                    {cellDetail.check_out_time ? String(cellDetail.check_out_time).slice(0, 5) : "--:--"}
                  </div>
                  <div className="font-semibold">Chi tiết ca: {cellDetail.attendance_note}</div>
                </div>
              );
            })()}
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
                    className="w-24 px-3 py-2 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-lg outline-none font-black text-[#E11D48] dark:text-rose-300 text-center focus:border-[#E11D48]"
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
    </div>
    </div>
  );
}
