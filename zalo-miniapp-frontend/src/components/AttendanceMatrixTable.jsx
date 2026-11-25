import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Calendar,
  Search,
  CheckCircle2,
  RefreshCw,
  Lock,
  AlertTriangle,
  ChevronRight
} from "lucide-react";
import { safeGet, safePost, generateIdempotencyKey } from "../utils/api";
import { useDebouncedValue } from "../hooks/useDebounce";
import useDepartments from "../hooks/useDepartments";
import { formatViWorkday } from "../utils/viNumberFormat";
import { getMonthlyStandardWorkdays, isSundayDay } from "../utils/workdayUtils";
import { ROLES } from "../constants/roles";
import {
  AppButton,
  AppModal,
  EmptyState,
  FormRow,
  MonthYearPicker,
  SkeletonList,
  UserAvatar
} from "./ui";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/**
 * Màu trạng thái trực quan trên lưới lịch tháng:
 * - Xanh lá: Đủ 1 công (1) / Nghỉ lễ (L)
 * - Xanh dương: Nửa công (0,5) / Nghỉ phép (P)
 * - Tím/Chàm: Tăng ca (OT / 1/OT)
 * - Đỏ nhạt: Vắng không phép / Nghỉ không lương (KP / KL)
 * - Xám: Chủ nhật (CN) / Ngày chưa chấm
 */
const getBadgeStyle = (status, isSunday = false) => {
  const s = String(status || "").trim().toUpperCase();
  if (s === "1" || s === "L") {
    return "bg-emerald-100 dark:bg-emerald-950/75 text-emerald-900 dark:text-emerald-200 border border-emerald-500/80 dark:border-emerald-500/70 font-black";
  }
  if (s === "0.5" || s === "P") {
    return "bg-sky-100 dark:bg-sky-950/75 text-sky-900 dark:text-sky-200 border border-sky-500/80 dark:border-sky-500/70 font-black";
  }
  if (s.includes("OT")) {
    return "bg-indigo-100 dark:bg-indigo-950/75 text-indigo-900 dark:text-indigo-200 border border-indigo-500/80 dark:border-indigo-500/70 font-black";
  }
  if (s === "KL" || s === "KP" || s === "0" || s === "V") {
    return "bg-rose-100 dark:bg-rose-950/75 text-rose-900 dark:text-rose-200 border border-rose-400 dark:border-rose-600 font-black";
  }
  if (isSunday) {
    return "text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/70 font-bold";
  }
  return "text-slate-400 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50";
};

function computeEmployeeMonthlyStats(emp, month, year, daysInMonth) {
  const days = emp?.days || [];
  const dayDetails = emp?.dayDetails || [];
  let totalWorkDays = 0;
  let countP = 0;
  let countL = 0;
  let countOT = 0;
  let countKP = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const raw = String(days[d - 1] || "").trim().toUpperCase();
    const detail = dayDetails[d - 1];
    const isSun = isSundayDay(d, month, year);

    if (raw === "P") countP++;
    if (raw === "L" && !(isSun && detail?.duration_status === "AUTO_HOLIDAY")) countL++;
    if (raw.includes("OT")) countOT++;
    if (raw === "KP" || raw === "KL" || raw === "V") countKP++;

    if (!raw) continue;
    if (raw === "L" && isSun && detail?.duration_status === "AUTO_HOLIDAY") continue;

    if (detail?.work_credit !== undefined && detail?.work_credit !== null) {
      totalWorkDays += Number(detail.work_credit) || 0;
    } else if (raw === "1" || raw === "1/OT" || raw === "P" || raw === "L") {
      totalWorkDays += 1;
    } else if (raw === "0.5") {
      totalWorkDays += 0.5;
    }
  }

  return { totalWorkDays, countP, countL, countOT, countKP };
}

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
  const [detailEmpCode, setDetailEmpCode] = useState(null);
  const [editingCell, setEditingCell] = useState(null); // { emp, dayNum, currentStatus }
  const [selectedStatus, setSelectedStatus] = useState("1");
  const [otHours, setOtHours] = useState(2);
  const [editError, setEditError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const savingCellRef = useRef(false);
  const [internalData, setInternalData] = useState([]);
  const [optimisticOverrides, setOptimisticOverrides] = useState({});
  const [loadingCards, setLoadingCards] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [internalLocked, setInternalLocked] = useState(false);

  const fetchAttendanceFromApi = useCallback(
    async ({ silent = false } = {}) => {
      if (Array.isArray(attendanceData)) return;
      if (!silent) setLoadingCards(true);
      setLoadError("");
      try {
        const [res, lockRes] = await Promise.all([
          safeGet("/attendance", { month, year }, { cancelPrevious: true }),
          safeGet("/attendance/period-status", { month, year }, { cancelPrevious: false }).catch(
            () => null
          )
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
        console.warn("Lỗi tải bảng chấm công:", e);
        if (!silent) {
          setLoadError(e?.message || "Không thể tải bảng chấm công. Vui lòng thử lại.");
        }
      } finally {
        if (!silent) setLoadingCards(false);
      }
    },
    [attendanceData, month, year]
  );

  useEffect(() => {
    setOptimisticOverrides({});
    fetchAttendanceFromApi();
  }, [fetchAttendanceFromApi]);

  const isLocked = propIsLocked !== undefined ? propIsLocked : internalLocked;

  // Tách quyền: Admin luôn được sửa; Kế toán chỉ được sửa khi được cấp quyền attendance_edit (và kỳ chưa chốt)
  const canEdit =
    !isLocked &&
    (effectiveRole === ROLES.ADMIN ||
      (effectiveRole === ROLES.ACCOUNTANT && dynamicPerms?.attendance_edit === true));

  // Số ngày trong tháng & Số ngày công chuẩn tự động (trừ Chủ nhật)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const firstDayUtc = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const leadingEmptyDays = firstDayUtc === 0 ? 6 : firstDayUtc - 1;
  const stdWorkdays = getMonthlyStandardWorkdays(month, year);

  const rawSourceList = Array.isArray(attendanceData) ? attendanceData : internalData;
  const sourceList = (rawSourceList || []).map((emp) => {
    const ov = optimisticOverrides[emp.ma_nv];
    if (!ov) return emp;
    return {
      ...emp,
      days: ov.days || emp.days,
      dayDetails: ov.dayDetails || emp.dayDetails
    };
  });

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

  // Lọc nhân sự theo từ khóa tìm kiếm + khối/bộ phận
  const filteredData = (sourceList || []).filter((item) => {
    if (item.role === "admin") return false;
    const q = (debouncedSearch || "").toLowerCase();
    const matchText =
      !q ||
      item.ho_ten?.toLowerCase().includes(q) ||
      item.ma_nv?.toLowerCase().includes(q) ||
      item.department?.toLowerCase().includes(q);
    const empDept = item.department || defaultDepartmentName;
    const matchDept = selectedDepartment === "ALL" || empDept === selectedDepartment;
    return matchText && matchDept;
  });

  const handleOpenEmployeeAttendance = useCallback((emp) => {
    if (!emp?.ma_nv) return;
    setDetailEmpCode(emp.ma_nv);
  }, []);

  const handleCellClick = (emp, dayIndex) => {
    if (isLocked) {
      if (notify) {
        notify(
          `Kỳ công tháng ${month}/${year} đã chốt sổ tại Bảng lương. Chỉ Quản trị viên mới có quyền mở khóa.`,
          "warning"
        );
      }
      return;
    }
    if (!canEdit) {
      if (effectiveRole === ROLES.ACCOUNTANT && notify) {
        notify("Tách quyền: Kế toán chỉ có quyền xem công (chưa được cấp quyền sửa công).", "warning");
      }
      return;
    }
    const rawVal = (emp.days && emp.days[dayIndex]) || "";
    const detail = emp.dayDetails && emp.dayDetails[dayIndex];
    const normalizedVal = String(rawVal).trim().toUpperCase() === "KP" ? "KL" : rawVal;
    setEditingCell({
      emp,
      dayNum: dayIndex + 1,
      currentStatus: rawVal
    });
    setSelectedStatus(normalizedVal || "1");
    setOtHours(Number(detail?.ot_hours) > 0 ? Number(detail.ot_hours) : 2);
    setEditError("");
  };

  const applyUpdatedDayToEmp = (empRow, targetDayIdx, nextStatus, nextOtHours) => {
    const nextDays = Array.isArray(empRow.days) ? [...empRow.days] : [];
    const nextDetails = Array.isArray(empRow.dayDetails) ? [...empRow.dayDetails] : [];
    nextDays[targetDayIdx] = nextStatus;
    if (!nextStatus) {
      nextDetails[targetDayIdx] = null;
    } else {
      const upperSt = String(nextStatus).trim().toUpperCase();
      const isFullAdj = ["1", "1/OT", "P", "L"].includes(upperSt);
      const prevDetail = nextDetails[targetDayIdx] || {};
      const cleanNote =
        upperSt === "P"
          ? "Nghỉ phép hưởng lương (P)"
          : upperSt === "L"
            ? "Nghỉ lễ hưởng lương (L)"
            : upperSt === "KL"
              ? "Nghỉ không lương (KL)"
              : isFullAdj
                ? "Đúng giờ • Đủ công"
                : prevDetail.attendance_note;
      nextDetails[targetDayIdx] = {
        ...prevDetail,
        status: nextStatus,
        ot_hours: nextOtHours,
        work_credit: isFullAdj ? 1 : upperSt === "0.5" ? 0.5 : 0,
        ...(isFullAdj
          ? {
              late_minutes: 0,
              early_leave_minutes: 0,
              duration_status: "ADMIN_ADJUSTED_FULL",
              attendance_note: cleanNote
            }
          : { attendance_note: cleanNote })
      };
    }
    return { ...empRow, days: nextDays, dayDetails: nextDetails };
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
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(targetDayNum).padStart(
        2,
        "0"
      )}`;
      await safePost(
        "/attendance/update",
        {
          ma_nv: targetMaNv,
          dateStr,
          day: targetDayNum,
          month,
          year,
          status: nextStatus,
          hours: nextOtHours,
          ot_hours: nextOtHours,
          isDelete: !nextStatus
        },
        { idempotencyKey }
      );

      // Cập nhật tức thì cả lưới lịch bên trong lẫn số công tổng hợp trên thẻ ngoài
      const targetEmpCurrent =
        sourceList.find((e) => e.ma_nv === targetMaNv) || editingCell.emp;
      const updatedEmp = applyUpdatedDayToEmp(
        targetEmpCurrent,
        targetDayIdx,
        nextStatus,
        nextOtHours
      );

      setOptimisticOverrides((prev) => ({
        ...prev,
        [targetMaNv]: {
          days: updatedEmp.days,
          dayDetails: updatedEmp.dayDetails
        }
      }));

      setInternalData((prev) => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;
        return prev.map((empRow) =>
          empRow.ma_nv === targetMaNv
            ? applyUpdatedDayToEmp(empRow, targetDayIdx, nextStatus, nextOtHours)
            : empRow
        );
      });

      if (onRecordAuditLog) {
        onRecordAuditLog(
          "Điều chỉnh ngày công",
          `Sửa công ngày ${targetDayNum}/${month}/${year} của ${editingCell.emp.ho_ten} (${targetMaNv}) thành [${nextStatus || "Xóa công"}]`,
          "Quản trị viên cập nhật bảng công"
        );
      }

      if (notify) {
        notify(
          `Đã cập nhật công ngày ${targetDayNum}/${month} cho ${editingCell.emp.ho_ten}!`,
          "success"
        );
      }
      setEditingCell(null);
      await fetchAttendanceFromApi({ silent: true });
      if (onRefresh) onRefresh();
    } catch (err) {
      setEditError(err.message || "Không thể cập nhật ngày công.");
    } finally {
      savingCellRef.current = false;
      setIsSubmitting(false);
    }
  };

  const activeDetailEmp = detailEmpCode
    ? filteredData.find((e) => e.ma_nv === detailEmpCode) ||
      (sourceList || []).find((e) => e.ma_nv === detailEmpCode) ||
      null
    : null;

  return (
    <div className="space-y-4 mb-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] overflow-hidden">
        {/* Header Điều Khiển Tinh Gọn: MonthYearPicker + Bộ phận + Công chuẩn + Tìm kiếm */}
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
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  type="text"
                  data-testid="matrix-search-input"
                  placeholder="Tìm tên nhân viên..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-[44px] pl-9 pr-3 py-1.5 text-xs sm:text-sm font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 border border-slate-300 dark:border-slate-600 rounded-xl outline-none focus:border-[#E11D48] shadow-sm"
                />
              </div>

              <AppButton
                variant="secondary"
                icon={RefreshCw}
                loading={loadingCards}
                onClick={() => {
                  fetchAttendanceFromApi();
                  if (onRefresh) onRefresh();
                }}
                aria-label="Làm mới dữ liệu"
                title="Làm mới dữ liệu"
                className="min-w-[44px] h-[44px] px-3"
              />
            </div>
          </div>
        </div>

        {loadError && (
          <div className="mx-4 mt-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs sm:text-sm font-bold flex items-center justify-between gap-2">
            <span>{loadError}</span>
            <AppButton
              variant="danger"
              onClick={() => fetchAttendanceFromApi()}
              className="text-xs px-3.5 py-2 shrink-0"
            >
              Thử lại
            </AppButton>
          </div>
        )}

        {/* DANH SÁCH THẺ NHÂN SỰ GỌN THOÁNG */}
        <div
          data-testid="attendance-card-list"
          className="p-3 sm:p-4 bg-slate-50/70 dark:bg-slate-950/40"
        >
          {loadingCards && filteredData.length === 0 ? (
            <SkeletonList rows={4} label="Đang tải dữ liệu bảng chấm công..." />
          ) : filteredData.length === 0 ? (
            <EmptyState icon={Calendar} title="Không tìm thấy nhân viên nào khớp bộ lọc." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredData.map((emp, empIdx) => {
                const stats = computeEmployeeMonthlyStats(emp, month, year, daysInMonth);
                const deptLabel = emp.department || defaultDepartmentName;

                return (
                  <button
                    key={emp.ma_nv || empIdx}
                    type="button"
                    data-testid={`attendance-emp-card-${emp.ma_nv}`}
                    onClick={() => handleOpenEmployeeAttendance(emp)}
                    className="perf-list-item w-full text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-xs hover:border-rose-400 dark:hover:border-rose-500 active:scale-[0.99] transition flex flex-col justify-between gap-3 cursor-pointer"
                  >
                    {/* Hàng trên: UserAvatar + Họ và tên + Khối/Bộ phận & Tóm tắt số công */}
                    <div className="flex items-center justify-between gap-2.5 w-full">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <UserAvatar
                          name={emp.ho_ten || emp.ma_nv}
                          avatarUrl={emp.avatar_url}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-extrabold text-[#111C2D] dark:text-white text-sm sm:text-base truncate leading-snug">
                            {emp.ho_ten}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300 font-semibold truncate mt-0.5">
                            {deptLabel}
                          </div>
                        </div>
                      </div>

                      <span
                        data-testid={`attendance-card-summary-${emp.ma_nv}`}
                        className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#FFE4E6] dark:bg-rose-950/70 border border-rose-200/80 dark:border-rose-800/70 text-xs font-extrabold text-[#B80035] dark:text-rose-200 shrink-0 font-mono whitespace-nowrap"
                      >
                        {formatViWorkday(stats.totalWorkDays)} / {stdWorkdays} ngày chuẩn
                      </span>
                    </div>

                    {/* Hàng dưới: Chỉ số phụ gọn + Gợi ý thao tác "Xem & chỉnh công ›" */}
                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/90 flex items-center justify-between gap-2 w-full">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                        {stats.countP > 0 && (
                          <span className="px-2 py-0.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/60">
                            Phép: {stats.countP}
                          </span>
                        )}
                        {stats.countL > 0 && (
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
                            Lễ: {stats.countL}
                          </span>
                        )}
                        {stats.countOT > 0 && (
                          <span className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60">
                            OT: {stats.countOT}
                          </span>
                        )}
                        {stats.countKP > 0 && (
                          <span className="px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60">
                            KL: {stats.countKP}
                          </span>
                        )}
                        {stats.countP === 0 &&
                          stats.countL === 0 &&
                          stats.countOT === 0 &&
                          stats.countKP === 0 && (
                            <span className="text-slate-500 dark:text-slate-400 font-semibold">
                              Tháng {String(month).padStart(2, "0")}/{year}
                            </span>
                          )}
                      </div>

                      <span className="inline-flex items-center gap-0.5 text-xs font-extrabold text-[#E11D48] dark:text-rose-400 shrink-0">
                        <span>Xem &amp; chỉnh công</span>
                        <ChevronRight size={15} className="shrink-0" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cửa sổ Chi tiết Bảng công tháng M/YYYY của Nhân viên (Hỗ trợ cả Mobile Safe-Area & Desktop) */}
        {activeDetailEmp &&
          (() => {
            const days = activeDetailEmp.days || [];
            const activeStats = computeEmployeeMonthlyStats(
              activeDetailEmp,
              month,
              year,
              daysInMonth
            );
            const deptLabel = activeDetailEmp.department || defaultDepartmentName;
            return (
              <AppModal
                open={true}
                onClose={() => setDetailEmpCode(null)}
                icon={
                  <UserAvatar
                    name={activeDetailEmp.ho_ten || activeDetailEmp.ma_nv}
                    avatarUrl={activeDetailEmp.avatar_url}
                    size="sm"
                  />
                }
                title={`Bảng công chi tiết tháng ${month}/${year} của ${activeDetailEmp.ho_ten}`}
                subtitle={`${deptLabel} • ${formatViWorkday(activeStats.totalWorkDays)} / ${stdWorkdays} ngày công chuẩn`}
                maxWidthClass="max-w-xl"
              >
                <div
                  data-testid="attendance-emp-calendar-modal"
                  className="p-3.5 sm:p-4 space-y-3.5 bg-slate-50 dark:bg-slate-900"
                >
                  {/* Tóm tắt nhanh đầu trang */}
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        name={activeDetailEmp.ho_ten || activeDetailEmp.ma_nv}
                        avatarUrl={activeDetailEmp.avatar_url}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-[#111C2D] dark:text-white truncate">
                          {activeDetailEmp.ho_ten}
                        </div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
                          {deptLabel} • Tháng {String(month).padStart(2, "0")}/{year}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-xs font-extrabold text-emerald-800 dark:text-emerald-200 font-mono">
                        {formatViWorkday(activeStats.totalWorkDays)} / {stdWorkdays} ngày công chuẩn
                      </span>
                      {activeStats.countP > 0 && (
                        <span className="px-2 py-1 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800/70 text-xs font-bold text-sky-800 dark:text-sky-200">
                          P: {activeStats.countP}
                        </span>
                      )}
                      {activeStats.countL > 0 && (
                        <span className="px-2 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-xs font-bold text-emerald-800 dark:text-emerald-200">
                          L: {activeStats.countL}
                        </span>
                      )}
                      {activeStats.countOT > 0 && (
                        <span className="px-2 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/70 text-xs font-bold text-indigo-800 dark:text-indigo-200">
                          OT: {activeStats.countOT}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Thông báo trạng thái khóa kỳ công hoặc hướng dẫn chạm */}
                  {isLocked ? (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center gap-2">
                      <Lock size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>
                        Kỳ công Tháng {month}/{year} đã chốt sổ tại mục Bảng lương. Vui lòng mở khóa kỳ lương nếu cần chỉnh sửa.
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold text-center">
                      {canEdit
                        ? "Chạm vào bất kỳ ngày nào bên dưới để chỉnh sửa công 1 chạm"
                        : "Chế độ chỉ xem chi tiết công theo ngày"}
                    </p>
                  )}

                  {/* Hàng thứ T2 -> CN */}
                  <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-extrabold text-slate-500 dark:text-slate-400">
                    {WEEKDAYS.map((wd) => (
                      <div key={wd} className={wd === "CN" ? "text-rose-600 dark:text-rose-400" : ""}>
                        {wd}
                      </div>
                    ))}
                  </div>

                  {/* Lưới lịch tháng 1..31 (Chỉ hiển thị số ngày thuần 1..31, tuyệt đối không có chữ N) */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {Array.from({ length: leadingEmptyDays }, (_, idx) => (
                      <div key={`empty-${idx}`} className="min-h-[62px]" />
                    ))}

                    {dayNumbers.map((d, dIdx) => {
                      const val = days[dIdx] || "";
                      const detail = activeDetailEmp.dayDetails?.[dIdx];
                      const hasLateEarly = Boolean(
                        detail &&
                          ((Number(detail.late_minutes) || 0) > 0 ||
                            (Number(detail.early_leave_minutes) || 0) > 0 ||
                            /vào muộn|ra sớm|quên check-out|quá ngắn/i.test(
                              detail.attendance_note || ""
                            ))
                      );
                      const isSunday = isSundayDay(d, month, year);
                      const badgeClass = getBadgeStyle(val, isSunday);
                      const displayCode =
                        val === "0.5"
                          ? "0,5"
                          : val === "KP"
                            ? "KL"
                            : val || (isSunday ? "CN" : "·");

                      const checkInShort = detail?.check_in_time
                        ? String(detail.check_in_time).slice(0, 5)
                        : "";
                      const checkOutShort = detail?.check_out_time
                        ? String(detail.check_out_time).slice(0, 5)
                        : "";

                      return (
                        <button
                          key={d}
                          type="button"
                          data-testid={`att-cal-day-${d}`}
                          onClick={() => handleCellClick(activeDetailEmp, dIdx)}
                          title={detail?.attendance_note || undefined}
                          className={`relative min-h-[62px] rounded-xl border p-1 flex flex-col items-center justify-between transition active:scale-95 cursor-pointer ${
                            isSunday
                              ? "bg-slate-100/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700"
                              : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-rose-400"
                          }`}
                        >
                          {hasLateEarly && (
                            <span
                              aria-hidden="true"
                              className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500"
                            />
                          )}
                          <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200 leading-none">
                            {d}
                          </div>
                          <div
                            className={`w-full py-0.5 rounded-lg text-xs font-black text-center ${badgeClass}`}
                          >
                            {displayCode}
                          </div>
                          {(checkInShort || checkOutShort) && (
                            <div className="text-[9px] font-mono font-semibold text-slate-500 dark:text-slate-400 leading-none truncate max-w-full">
                              {checkInShort || "--:--"}
                              {checkOutShort ? `-${checkOutShort}` : ""}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </AppModal>
            );
          })()}

        {/* Modal Chỉnh Sửa Công 1 Chạm Cho Từng Ngày (Nested trên Bảng công chi tiết) */}
        {editingCell && (
          <AppModal
            open={true}
            nested={true}
            onClose={() => setEditingCell(null)}
            title={`Sửa công ngày ${editingCell.dayNum}/${month}`}
            subtitle={`${editingCell.emp.ho_ten} • ${editingCell.emp.department || defaultDepartmentName}`}
            maxWidthClass="max-w-md"
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
                  data-testid="att-save-cell-btn"
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
                if (!cellDetail?.attendance_note && !cellDetail?.check_in_time) return null;
                const isWarn = /vào muộn|ra sớm|quên check-out|quá ngắn/i.test(
                  cellDetail?.attendance_note || ""
                );
                return (
                  <div
                    className={`p-3 rounded-xl border text-xs space-y-1 ${
                      isWarn
                        ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70"
                        : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60"
                    }`}
                  >
                    <div className="font-bold">
                      Vào{" "}
                      {cellDetail.check_in_time
                        ? String(cellDetail.check_in_time).slice(0, 5)
                        : "--:--"}{" "}
                      • Ra{" "}
                      {cellDetail.check_out_time
                        ? String(cellDetail.check_out_time).slice(0, 5)
                        : "--:--"}
                    </div>
                    {cellDetail.attendance_note && (
                      <div className="font-semibold">Chi tiết ca: {cellDetail.attendance_note}</div>
                    )}
                  </div>
                );
              })()}
              <div>
                <label className="block text-slate-800 dark:text-slate-100 font-black mb-2">
                  Chọn nhanh trạng thái công
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      code: "1",
                      label: "Đủ 1 công (1)",
                      activeClass: "bg-emerald-600 text-white border-emerald-700"
                    },
                    {
                      code: "0.5",
                      label: "Nửa công (0,5)",
                      activeClass: "bg-sky-600 text-white border-sky-700"
                    },
                    {
                      code: "P",
                      label: "Nghỉ phép có lương (P)",
                      activeClass: "bg-sky-600 text-white border-sky-700"
                    },
                    {
                      code: "KL",
                      label: "Nghỉ không lương (KL)",
                      activeClass: "bg-rose-600 text-white border-rose-700"
                    },
                    {
                      code: "OT",
                      label: "Tăng ca (OT)",
                      activeClass: "bg-indigo-600 text-white border-indigo-700"
                    },
                    {
                      code: "1/OT",
                      label: "Đủ công + OT (1 + OT)",
                      activeClass: "bg-violet-600 text-white border-violet-700"
                    },
                    {
                      code: "L",
                      label: "Nghỉ lễ (L)",
                      activeClass: "bg-emerald-600 text-white border-emerald-700"
                    },
                    {
                      code: "",
                      label: "Xóa công ngày này",
                      activeClass: "bg-slate-700 text-white border-slate-800"
                    }
                  ].map((opt) => {
                    const isSelected = selectedStatus === opt.code;
                    return (
                      <button
                        key={opt.code || "clear"}
                        type="button"
                        data-testid={`att-opt-${opt.code || "clear"}`}
                        onClick={() => setSelectedStatus(opt.code)}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-extrabold text-left transition cursor-pointer ${
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
