import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Calendar,
  Search,
  Filter,
  Download,
  Printer,
  Edit3,
  CheckCircle2,
  Clock,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  AlertTriangle,
  ShieldCheck,
  LayoutGrid,
  List,
  ArrowLeft,
  Users,
  UserCheck
} from "lucide-react";
import { safeGet, safePost, sanitizeFormula, generateIdempotencyKey } from "../utils/api";
import { useDebouncedValue } from "../hooks/useDebounce";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { DEPARTMENT_OPTIONS } from "../utils/viLabels";
import PeriodLockModal from "./PeriodLockModal";
import { ROLES, hasPermission } from "../constants/roles";

const getBadgeStyle = (status) => {
  if (status === "1") return "bg-emerald-100 text-emerald-900 border-2 border-emerald-500 font-black";
  if (status === "0.5") return "bg-teal-100 text-teal-900 border-2 border-teal-500 font-black";
  if (status === "P") return "bg-amber-100 text-amber-900 border-2 border-amber-500 font-black";
  if (String(status).includes("OT")) return "bg-indigo-100 text-indigo-900 border-2 border-indigo-500 font-black";
  if (status === "L") return "bg-rose-100 text-rose-900 border-2 border-rose-500 font-black";
  if (status === "KP") return "bg-slate-200 text-slate-800 border-2 border-slate-400 font-black";
  return "text-slate-400 border border-slate-200 bg-slate-50/50 hover:bg-slate-100";
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
  const [editReason, setEditReason] = useState("");
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

  useLockBodyScroll(Boolean(detailEmpCode || editingCell || showProxyModal));

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
    } finally {
      setLoadingMatrix(false);
    }
  }, [attendanceData, month, year]);

  useEffect(() => {
    fetchMatrixFromApi();
  }, [fetchMatrixFromApi]);

  const isLocked = propIsLocked !== undefined ? propIsLocked : internalLocked;

  // Tách quyền: Chỉ HR và Admin được sửa công khi kỳ CHƯA bị chốt
  const canEdit = !isLocked && (effectiveRole === ROLES.HR || effectiveRole === ROLES.ADMIN);

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
    if (proxyInFlightRef.current || !proxyForm.ma_nv) return;
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
    if (effectiveRole === ROLES.ACCOUNTANT) {
      if (notify) {
        notify("Tách quyền: Kế toán chỉ có quyền xem và chốt sổ, không được sửa dữ liệu công.", "warning");
      }
      return;
    }
    if (!canEdit) return;
    const currentVal = (emp.days && emp.days[dayIndex]) || "";
    setEditingCell({
      emp,
      dayNum: dayIndex + 1,
      currentStatus: currentVal
    });
    setSelectedStatus(currentVal || "1");
    setOtHours(2);
    setEditReason("");
    setEditError("");
  };

  const handleSaveCellAttendance = async () => {
    if (!editingCell || savingCellRef.current) return;
    if (!editReason.trim()) {
      setEditError("Vui lòng nhập lý do điều chỉnh công (Bắt buộc theo quy chế kiểm toán).");
      return;
    }

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
        isDelete: !selectedStatus,
        reason: editReason.trim()
      }, { idempotencyKey });

      if (onRecordAuditLog) {
        onRecordAuditLog(
          "Điều chỉnh ngày công",
          `Sửa công ngày ${editingCell.dayNum}/${month}/${year} của ${editingCell.emp.ho_ten} (${editingCell.emp.ma_nv}) thành [${selectedStatus || "Xóa công"}]`,
          editReason.trim()
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
  const handleExportCSV = () => {
    const headers = ["Mã NV", "Họ và Tên", ...dayNumbers.map(d => `Ngày ${d}`), "Đủ công (1)", "Nửa công (0.5)", "Phép (P)", "Tăng ca (OT)"];
    const rows = filteredData.map(item => {
      const days = item.days || [];
      const count1 = days.filter(d => d === "1").length;
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
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Bang_Cham_Cong_Ma_Tran_Thang_${month}_${year}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm overflow-hidden mb-24">
      
      {/* Header Điều Khiển & Tìm Kiếm */}
      <div className="p-4 sm:p-5 border-b-2 border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/70">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="text-blue-600 shrink-0" size={22} />
            <h3 className="font-bold text-lg leading-snug text-slate-900">
              Bảng chấm công ma trận
            </h3>
          </div>
          <p className="text-sm font-medium text-slate-600 mt-1">
            Tổng hợp dữ liệu điểm danh thực tế của toàn bộ cán bộ công nhân viên ({filteredData.length} nhân sự)
          </p>
        </div>

        {/* Thanh tác vụ: Tháng/Năm, Tìm kiếm & Nút hành động */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Bộ chọn tháng/năm */}
          <div className="flex items-center bg-white border-2 border-slate-300 rounded-xl px-2.5 py-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => onMonthChange(month > 1 ? month - 1 : 12, month > 1 ? year : year - 1)}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 cursor-pointer border border-transparent hover:border-slate-300"
              title="Tháng trước"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="font-black text-sm px-3 text-slate-900">
              Tháng {month}/{year}
            </span>
            <button
              type="button"
              onClick={() => onMonthChange(month < 12 ? month + 1 : 1, month < 12 ? year : year + 1)}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 cursor-pointer border border-transparent hover:border-slate-300"
              title="Tháng sau"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Lọc bộ phận */}
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="min-h-[42px] px-3 py-2 text-sm font-semibold bg-white border-2 border-slate-300 rounded-xl outline-none focus:border-blue-600 shadow-sm text-slate-800"
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
              className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm font-semibold bg-white border-2 border-slate-300 rounded-xl outline-none focus:border-blue-600 shadow-sm"
            />
          </div>

          {/* Nút Chấm công hộ / Điểm danh nhanh */}
          {(effectiveRole === ROLES.ADMIN || effectiveRole === ROLES.ACCOUNTANT) && !isLocked && (
            <button
              type="button"
              onClick={handleOpenProxyModal}
              className="min-h-[42px] flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-3.5 py-2 rounded-xl border-2 border-blue-700 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <UserCheck size={16} className="shrink-0" />
              <span>Chấm công hộ</span>
            </button>
          )}

          {/* Nút Xuất CSV */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black px-4 py-2.5 rounded-xl border-2 border-emerald-700 shadow-sm cursor-pointer"
          >
            <Download size={16} />
            <span>Xuất CSV</span>
          </button>

          {/* Nút Làm Mới */}
          <button
            type="button"
            onClick={() => {
              fetchMatrixFromApi();
              if (onRefresh) onRefresh();
            }}
            className="min-w-[44px] min-h-[44px] p-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border-2 border-slate-300 shadow-sm cursor-pointer flex items-center justify-center"
            title="Làm mới dữ liệu"
          >
            <RefreshCw size={16} className={loadingMatrix ? "animate-spin text-blue-600" : ""} />
          </button>

          {/* Nút Chốt Công Kỳ Lương (Kế toán & Quản trị) */}
          {hasPermission(effectiveRole, "canLockPeriod") && !isLocked && (
            <button
              type="button"
              onClick={() => setShowLockModal(true)}
              className="min-h-[42px] flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold px-4 py-2 rounded-xl border-2 border-rose-700 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Lock size={16} className="shrink-0" />
              <span>Chốt kỳ công</span>
            </button>
          )}

          {/* Nút Mở Lại Kỳ Công Đã Chốt (Chỉ Quản Trị) */}
          {hasPermission(effectiveRole, "canUnlockPeriod") && isLocked && (
            <button
              type="button"
              onClick={() => setShowLockModal(true)}
              className="min-h-[42px] flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-2 rounded-xl border-2 border-amber-700 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Unlock size={16} className="shrink-0" />
              <span>Mở lại kỳ đã chốt</span>
            </button>
          )}

          {isLocked && !hasPermission(effectiveRole, "canUnlockPeriod") && (
            <div className="min-h-[42px] flex items-center gap-2 bg-slate-200 text-slate-800 text-sm font-semibold px-4 py-2 rounded-xl border-2 border-slate-400 whitespace-nowrap">
              <Lock size={16} className="text-slate-600 shrink-0" />
              <span>Đã khóa sổ</span>
            </div>
          )}
        </div>
      </div>

      {/* Banner Cảnh Báo Nếu Kỳ Đã Chốt */}
      {isLocked && (
        <div className="px-5 py-3 bg-amber-100/80 border-b-2 border-amber-300 flex items-center justify-between text-sm text-amber-950 font-bold">
          <div className="flex items-center gap-2.5">
            <Lock size={18} className="text-amber-700 shrink-0" />
            <span>Kỳ công Tháng {month}/{year} đã được Kế toán chốt sổ. Toàn bộ bảng công ở chế độ CHỈ ĐỌC.</span>
          </div>
          {hasPermission(userRole, "canUnlockPeriod") && (
            <span className="text-xs text-amber-800 italic underline">Quản trị viên có thể mở khóa khi cần thiết</span>
          )}
        </div>
      )}

      {/* Thanh chuyển chế độ xem Mobile-First & Chú giải */}
      <div className="px-4 sm:px-5 py-3 bg-slate-100 border-b-2 border-slate-200 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex p-1 bg-slate-200/80 rounded-xl border border-slate-300">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-extrabold transition min-h-[38px] ${
                viewMode === "cards"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List size={15} />
              <span>Dạng thẻ (Dễ xem)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("matrix")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-extrabold transition min-h-[38px] ${
                viewMode === "matrix"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutGrid size={15} />
              <span>Bảng 31 ngày</span>
            </button>
          </div>
          {canEdit && (
            <span className="text-xs text-blue-700 font-extrabold">
              {viewMode === "cards"
                ? "💡 Chạm vào nhân viên để xem & sửa lịch 31 ngày"
                : "💡 Chạm trực tiếp vào ô ngày để sửa công"}
            </span>
          )}
          {isLocked && <span className="text-xs text-rose-700 font-black">🔒 Bảng công đã bị khóa sổ</span>}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-700">
          <span className="font-black text-slate-900">Ký hiệu:</span>
          <span className="flex items-center gap-1"><span className="w-6 h-5 rounded text-center inline-flex items-center justify-center text-[11px] font-black bg-emerald-100 text-emerald-900 border border-emerald-500">1</span> Đủ công</span>
          <span className="flex items-center gap-1"><span className="w-6 h-5 rounded text-center inline-flex items-center justify-center text-[11px] font-black bg-teal-100 text-teal-900 border border-teal-500">0.5</span> Nửa công</span>
          <span className="flex items-center gap-1"><span className="w-6 h-5 rounded text-center inline-flex items-center justify-center text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-500">P</span> Có phép</span>
          <span className="flex items-center gap-1"><span className="w-6 h-5 rounded text-center inline-flex items-center justify-center text-[11px] font-black bg-indigo-100 text-indigo-900 border border-indigo-500">OT</span> Tăng ca</span>
          <span className="flex items-center gap-1"><span className="w-6 h-5 rounded text-center inline-flex items-center justify-center text-[11px] font-black bg-rose-100 text-rose-900 border border-rose-500">L</span> Lễ</span>
          <span className="flex items-center gap-1"><span className="w-6 h-5 rounded text-center inline-flex items-center justify-center text-[11px] font-black bg-slate-200 text-slate-800 border border-slate-400">KP</span> Không phép</span>
        </div>
      </div>

      {/* CHẾ ĐỘ 1: DẠNG THẺ MOBILE-FIRST */}
      {viewMode === "cards" && (
        <div className="p-3 sm:p-4 space-y-2.5 bg-slate-50/70">
          {filteredData.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm font-bold">
              {loadingMatrix
                ? "Đang tải dữ liệu bảng chấm công..."
                : "Không tìm thấy nhân viên nào khớp từ khóa."}
            </div>
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
                  className="w-full text-left bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm hover:border-blue-400 active:scale-[0.99] transition flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-700 font-black flex items-center justify-center shrink-0 border border-blue-200">
                        {(emp.ho_ten || "N").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-extrabold text-slate-900 text-sm truncate">
                          {emp.ho_ten}
                        </div>
                        <div className="text-xs text-blue-700 font-bold">
                          Mã NV: {emp.ma_nv} {emp.bo_phan ? `• ${emp.bo_phan}` : ""}
                        </div>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 shrink-0">
                      31 ngày
                      <ChevronRight size={16} />
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-2 py-1.5 text-center">
                      <div className="text-[10px] font-bold text-emerald-700">Tổng công</div>
                      <div className="text-sm font-black text-emerald-900">{totalWorkDays}</div>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-2 py-1.5 text-center">
                      <div className="text-[10px] font-bold text-amber-700">Nghỉ phép</div>
                      <div className="text-sm font-black text-amber-900">{countP}</div>
                    </div>
                    <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-2 py-1.5 text-center">
                      <div className="text-[10px] font-bold text-indigo-700">Tăng ca</div>
                      <div className="text-sm font-black text-indigo-900">{countOT}</div>
                    </div>
                    <div className="rounded-xl bg-slate-100 border border-slate-200 px-2 py-1.5 text-center">
                      <div className="text-[10px] font-bold text-slate-600">Không phép</div>
                      <div className="text-sm font-black text-slate-800">{countKP}</div>
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
            <tr className="bg-slate-100 text-slate-800 border-b-2 border-slate-300 uppercase font-black sticky top-0 z-10">
              <th className="p-2.5 sm:p-3.5 pl-3 sm:pl-4 sticky left-0 bg-slate-100 z-20 min-w-[140px] sm:min-w-[190px] max-w-[155px] sm:max-w-none shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)]">
                Nhân Sự
              </th>
              {dayNumbers.map(d => {
                const dayOfWeek = new Date(year, month - 1, d).getDay();
                const isSunday = dayOfWeek === 0;
                return (
                  <th
                    key={d}
                    className={`p-1.5 text-center min-w-[48px] border-l border-slate-200 ${
                      isSunday ? "bg-rose-100/60 text-rose-800" : ""
                    }`}
                  >
                    <div className="text-sm font-black">{d}</div>
                    <span className="text-[10px] font-bold text-slate-500 block">
                      {isSunday ? "CN" : `T${dayOfWeek + 1}`}
                    </span>
                  </th>
                );
              })}
              <th className="p-3 text-center bg-emerald-100/70 text-emerald-950 font-black border-l-2 border-slate-300 min-w-[60px] text-xs">
                Đủ (1)
              </th>
              <th className="p-3 text-center bg-teal-100/70 text-teal-950 font-black border-l-2 border-slate-300 min-w-[60px] text-xs">
                Nửa (0.5)
              </th>
              <th className="p-3 text-center bg-amber-100/70 text-amber-950 font-black border-l-2 border-slate-300 min-w-[60px] text-xs">
                Phép (P)
              </th>
              <th className="p-3 text-center bg-indigo-100/70 text-indigo-950 font-black border-l-2 border-slate-300 min-w-[60px] text-xs">
                OT (h)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={daysInMonth + 5} className="py-12 text-center text-slate-500 text-sm font-bold">
                  Không tìm thấy dữ liệu điểm danh phù hợp.
                </td>
              </tr>
            ) : (
              filteredData.map((emp, empIdx) => {
                const days = emp.days || [];
                const count1 = days.filter(d => d === "1").length;
                const countHalf = days.filter(d => d === "0.5").length;
                const countP = days.filter(d => d === "P").length;
                const countOT = days.filter(d => String(d).includes("OT")).length;

                return (
                  <tr key={emp.ma_nv || empIdx} className="hover:bg-blue-50/50 transition-colors">
                    {/* Cột cố định: Tên & Mã NV */}
                    <td className="p-2.5 sm:p-3 pl-3 sm:pl-4 sticky left-0 bg-white z-10 min-w-[140px] sm:min-w-[190px] max-w-[155px] sm:max-w-none shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)]">
                      <div className="font-black text-slate-900 text-xs sm:text-sm leading-tight truncate">{emp.ho_ten}</div>
                      <div className="text-[11px] text-blue-700 font-mono font-bold mt-0.5">{emp.ma_nv}</div>
                    </td>

                    {/* 31 Cột ngày */}
                    {dayNumbers.map((d, dIdx) => {
                      const val = days[dIdx] || "";
                      const badgeClass = getBadgeStyle(val);
                      const isSunday = new Date(year, month - 1, d).getDay() === 0;

                      return (
                        <td
                          key={d}
                          onClick={() => handleCellClick(emp, dIdx)}
                          className={`p-1 text-center border-l border-slate-100 cursor-pointer select-none ${
                            isSunday ? "bg-rose-50/30" : ""
                          }`}
                          title={`Ngày ${d}/${month}: ${val || "Chưa có công"} (Nhấp để sửa)`}
                        >
                          <div
                            className={`min-w-[42px] h-[42px] px-1 mx-auto rounded-xl flex items-center justify-center text-xs font-black shadow-none active:scale-95 transition ${badgeClass}`}
                          >
                            {val || "·"}
                          </div>
                        </td>
                      );
                    })}

                    {/* Cột Tổng Kết */}
                    <td className="p-2.5 text-center font-black text-emerald-900 bg-emerald-50/60 border-l-2 border-slate-300 text-sm">
                      {count1}
                    </td>
                    <td className="p-2.5 text-center font-black text-teal-900 bg-teal-50/60 border-l-2 border-slate-300 text-sm">
                      {countHalf}
                    </td>
                    <td className="p-2.5 text-center font-black text-amber-900 bg-amber-50/60 border-l-2 border-slate-300 text-sm">
                      {countP}
                    </td>
                    <td className="p-2.5 text-center font-black text-indigo-900 bg-indigo-50/60 border-l-2 border-slate-300 text-sm">
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
          <div
            className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4"
            onTouchMove={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
            onClick={(e) => { if (e.target === e.currentTarget) setDetailEmpCode(null); }}
          >
            <div className="bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-sheet-up">
              <div
                className="px-4 pb-3 border-b border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0 pr-[96px] sm:pr-4"
                style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
              >
                <button
                  type="button"
                  onClick={() => setDetailEmpCode(null)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold min-h-[40px] shrink-0"
                >
                  <ArrowLeft size={16} />
                  <span>Trở về</span>
                </button>
                <div className="min-w-0 text-right sm:text-center flex-1">
                  <h4 className="font-black text-sm text-slate-900 truncate">{emp.ho_ten}</h4>
                  <p className="text-xs text-blue-700 font-bold">
                    {emp.ma_nv} • Tháng {month}/{year}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailEmpCode(null)}
                  className="hidden sm:flex w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 items-center justify-center text-slate-700"
                  aria-label="Đóng"
                >
                  <X size={20} />
                </button>
              </div>

              <div
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-3 bg-slate-50"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <p className="text-xs text-slate-600 font-medium text-center">
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
                            ? "bg-rose-50/70 border-rose-200"
                            : "bg-white border-slate-200 hover:border-blue-400"
                        }`}
                      >
                        <div className="text-[10px] font-bold text-slate-500">
                          {d} ({isSunday ? "CN" : `T${dayOfWeek + 1}`})
                        </div>
                        <div
                          className={`w-full py-1 rounded-lg text-[11px] font-black text-center ${badgeClass}`}
                        >
                          {val || "·"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                className="px-4 py-3 border-t border-slate-200 bg-white shrink-0"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
              >
                <button
                  type="button"
                  onClick={() => setDetailEmpCode(null)}
                  className="w-full min-h-[46px] rounded-xl bg-slate-800 text-white font-bold text-base"
                >
                  Đóng / Quay lại
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Chỉnh Sửa Công Ô Trực Tiếp */}
      {editingCell && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onTouchMove={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingCell(null); }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[88vh] shadow-2xl border-t-2 sm:border-2 border-slate-200 flex flex-col overflow-hidden animate-sheet-up">
            <div className="flex justify-between items-center border-b border-slate-100 px-5 py-3.5 gap-2 shrink-0 bg-white">
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold min-h-[40px]"
              >
                <ArrowLeft size={16} />
                <span>Trở về</span>
              </button>
              <div className="min-w-0 flex-1 text-center">
                <h4 className="font-black text-sm sm:text-base text-slate-900">
                  Sửa công ngày {editingCell.dayNum}/{month}
                </h4>
                <p className="text-xs text-blue-700 font-bold truncate">
                  {editingCell.emp.ho_ten} ({editingCell.emp.ma_nv})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-xl border border-slate-200 shrink-0"
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-5 space-y-4 text-sm">
              <div>
                <label className="block text-slate-800 font-black mb-2">
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
                            : "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {(selectedStatus === "OT" || selectedStatus === "1/OT") && (
                <div>
                  <label className="block text-slate-800 font-black mb-1.5">Số giờ tăng ca (OT)</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    step="0.5"
                    value={otHours}
                    onChange={e => setOtHours(Number(e.target.value))}
                    className="w-full px-3.5 py-3 bg-slate-50 border-2 border-slate-300 rounded-xl outline-none font-black text-indigo-800 focus:border-indigo-600"
                  />
                  <span className="text-xs text-slate-500 mt-1 block font-medium">Hệ số tham chiếu: Ngày thường 1.5x, Chủ nhật 2.0x, Lễ 3.0x</span>
                </div>
              )}

              <div>
                <label className="block text-slate-800 font-black mb-1.5">
                  Lý do điều chỉnh <span className="text-rose-600">* (Bắt buộc)</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={editReason}
                  onChange={e => {
                    setEditReason(e.target.value);
                    if (editError) setEditError("");
                  }}
                  placeholder="Ví dụ: Nhân viên đi công trình quên bấm chấm công..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl outline-none font-semibold text-slate-900 resize-none text-sm focus:border-blue-600"
                />
              </div>

              {editError && (
                <div className="p-3 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-800 text-xs flex items-center gap-2 font-bold">
                  <AlertTriangle size={16} className="shrink-0 text-rose-600" />
                  <span>{editError}</span>
                </div>
              )}
            </div>

            <div
              className="flex gap-3 px-5 py-3.5 border-t border-slate-100 bg-white shrink-0"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
            >
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="flex-1 min-h-[46px] bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl border border-slate-300 cursor-pointer"
              >
                Đóng / Quay lại
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSaveCellAttendance}
                className="flex-1 min-h-[46px] bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span>Lưu thay đổi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Chấm Công Hộ / Điểm Danh Nhanh (Dành cho Quản lý / Kế toán) */}
      {showProxyModal && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onTouchMove={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
          onClick={(e) => { if (e.target === e.currentTarget && !proxySaving) setShowProxyModal(false); }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-sheet-up text-slate-800">
            <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-slate-100 shrink-0">
              <button
                type="button"
                disabled={proxySaving}
                onClick={() => setShowProxyModal(false)}
                className="inline-flex items-center gap-1 min-h-[42px] px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold shrink-0"
              >
                <ArrowLeft size={16} />
                <span>Trở về</span>
              </button>
              <h4 className="font-black text-base text-slate-900 truncate">Chấm công hộ nhân viên</h4>
              <button
                type="button"
                disabled={proxySaving}
                onClick={() => setShowProxyModal(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0"
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            <form
              id="proxy-checkin-form"
              onSubmit={handleSubmitProxyCheckIn}
              className="modal-scroll-area flex-1 min-h-0 p-5 space-y-3.5"
            >
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">Chọn nhân viên</label>
                <select
                  required
                  value={proxyForm.ma_nv}
                  onChange={(e) => setProxyForm((p) => ({ ...p, ma_nv: e.target.value }))}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-base font-semibold text-slate-900"
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

              <div className="divide-y divide-slate-200 border-2 border-slate-200 rounded-2xl bg-slate-50 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <label className="text-sm font-bold text-slate-700">Ngày chấm công</label>
                  <input
                    type="date"
                    required
                    value={proxyForm.record_date}
                    onChange={(e) => setProxyForm((p) => ({ ...p, record_date: e.target.value }))}
                    className="w-36 shrink-0 bg-white border border-slate-300 rounded-lg px-2 py-2 text-base font-bold text-slate-900 text-center"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <label className="text-sm font-bold text-slate-700">Giờ vào ca</label>
                  <input
                    type="time"
                    value={proxyForm.check_in_time}
                    onChange={(e) => setProxyForm((p) => ({ ...p, check_in_time: e.target.value }))}
                    className="w-32 shrink-0 bg-white border border-slate-300 rounded-lg px-2 py-2 text-base font-bold text-slate-900 text-center"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <label className="text-sm font-bold text-slate-700">Giờ tan ca (nếu có)</label>
                  <input
                    type="time"
                    value={proxyForm.check_out_time}
                    onChange={(e) => setProxyForm((p) => ({ ...p, check_out_time: e.target.value }))}
                    className="w-32 shrink-0 bg-white border border-slate-300 rounded-lg px-2 py-2 text-base font-bold text-slate-900 text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">Địa điểm làm việc</label>
                <select
                  value={proxyForm.work_location_type}
                  onChange={(e) => setProxyForm((p) => ({ ...p, work_location_type: e.target.value }))}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-base font-semibold text-slate-900"
                >
                  <option value="OFFICE">Tại Văn phòng / Kho xưởng</option>
                  <option value="FIELD_WORK">Ngoài công trình / Dự án</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">Ghi chú điểm danh hộ</label>
                <textarea
                  rows={2}
                  value={proxyForm.note}
                  onChange={(e) => setProxyForm((p) => ({ ...p, note: e.target.value }))}
                  placeholder="Ví dụ: Quản lý chấm công hộ do nhân viên quên điện thoại"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-base text-slate-900"
                />
              </div>
            </form>

            <div
              className="flex gap-2.5 px-5 py-3.5 border-t border-slate-200 bg-white shrink-0"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
            >
              <button
                type="button"
                disabled={proxySaving}
                onClick={() => setShowProxyModal(false)}
                className="flex-1 min-h-[46px] py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-base rounded-xl border border-slate-300"
              >
                Đóng / Quay lại
              </button>
              <button
                type="submit"
                form="proxy-checkin-form"
                disabled={proxySaving || !proxyForm.ma_nv}
                className="flex-1 min-h-[46px] py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base rounded-xl shadow disabled:opacity-50"
              >
                {proxySaving ? "Đang lưu..." : "Xác nhận chấm hộ"}
              </button>
            </div>
          </div>
        </div>
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
