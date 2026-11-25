import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  AlertCircle,
  Eye,
  Clock,
  Calendar,
  UserCheck,
  Users,
  ChevronDown,
  Check,
  RotateCcw
} from "lucide-react";
import { safeGet, safePut, generateIdempotencyKey } from "../../utils/api";
import useDepartments from "../../hooks/useDepartments";
import { getRequestTypeLabel, getCorrectionModeLabel } from "../../utils/viLabels";
import { formatViCurrency } from "../../utils/viNumberFormat";
import {
  AppButton,
  AppModal,
  BottomSheet,
  StatusBadge,
  SkeletonList,
  EmptyState,
  UserAvatar,
  SecureMediaPreview
} from "../../components/ui";

function formatTimestampVi(isoOrRaw, preformattedVn = null) {
  if (preformattedVn && /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(String(preformattedVn).trim())) {
    return String(preformattedVn).trim().slice(0, 16);
  }
  if (!isoOrRaw) return null;
  const d = new Date(isoOrRaw);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hh = map.hour === "24" ? "00" : map.hour;
  return `${map.day}/${map.month}/${map.year} ${hh}:${map.minute}`;
}

function getRequestStatusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return "Đã duyệt";
  if (s === "rejected") return "Từ chối duyệt";
  if (s === "cancelled") return "Đã hủy";
  return "Chờ duyệt";
}

function normalizeSearchStr(val) {
  return String(val || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

const STATUS_OPTIONS_META = [
  {
    id: "pending",
    label: "Chờ duyệt",
    dotClass: "bg-amber-500",
    badgeClass:
      "bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border-amber-300/80 dark:border-amber-700/70"
  },
  {
    id: "approved",
    label: "Đã duyệt",
    dotClass: "bg-emerald-500",
    badgeClass:
      "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border-emerald-300/80 dark:border-emerald-700/70"
  },
  {
    id: "rejected",
    label: "Từ chối duyệt",
    dotClass: "bg-rose-500",
    badgeClass:
      "bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border-rose-300/80 dark:border-rose-700/70"
  },
  {
    id: "all",
    label: "Tất cả trạng thái",
    dotClass: "bg-[#0051CA]",
    badgeClass:
      "bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-200 border-blue-300/80 dark:border-blue-700/70"
  }
];

export default function RequestsManagementTab({
  currentUser,
  showToast,
  activeRole,
  dynamicPerms = {},
  focusTarget = null
}) {
  const effectiveRole = activeRole || currentUser?.role || "admin";
  const canApproveRequest = useCallback(() => {
    if (effectiveRole !== "accountant") return effectiveRole === "admin";
    return Boolean(dynamicPerms?.leave_approve || dynamicPerms?.attendance_request_approve);
  }, [effectiveRole, dynamicPerms]);

  const { defaultDepartmentName } = useDepartments();

  const [employeeGroups, setEmployeeGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // V56: 2 Bộ chọn Option chuẩn Enterprise (Mặc định: "pending" - Chờ duyệt & "ALL" - Tất cả nhân viên)
  const [statusFilter, setStatusFilter] = useState("pending"); // 'pending' | 'approved' | 'rejected' | 'all'
  const [employeeFilter, setEmployeeFilter] = useState("ALL"); // 'ALL' | ma_nv
  const [activePicker, setActivePicker] = useState(null); // null | 'status' | 'employee'
  const [isMobilePickerSheet, setIsMobilePickerSheet] = useState(false);
  const [empPickerSearch, setEmpPickerSearch] = useState("");
  const filterToolbarRef = useRef(null);

  const [selectedEmpMaNv, setSelectedEmpMaNv] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [rejectDialogReq, setRejectDialogReq] = useState(null);
  const [rejectReasonInput, setRejectReasonInput] = useState("");

  const actionInFlightRef = useRef(false);
  const lastFocusTsRef = useRef(0);

  useEffect(() => {
    if (!focusTarget?.ts || focusTarget.ts === lastFocusTsRef.current) return;
    if (focusTarget.tab !== "requests" && focusTarget.category !== "pending_request") return;
    lastFocusTsRef.current = focusTarget.ts;
    setStatusFilter("pending");
    if (focusTarget.ma_nv) {
      setEmployeeFilter(focusTarget.ma_nv);
    }
  }, [focusTarget]);

  useEffect(() => {
    if (!activePicker || isMobilePickerSheet) return undefined;
    const handleOutsideClick = (e) => {
      if (filterToolbarRef.current && !filterToolbarRef.current.contains(e.target)) {
        setActivePicker(null);
      }
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") setActivePicker(null);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick, { passive: true });
    window.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [activePicker, isMobilePickerSheet]);

  const notify = useCallback(
    (msg, type = "info") => {
      if (showToast) showToast(msg, type);
    },
    [showToast]
  );

  const fetchEmployeeRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/requests/by-employees", {}, { cancelPrevious: true });
      if (res?.success && Array.isArray(res.data)) {
        setEmployeeGroups(res.data);
      } else {
        setEmployeeGroups([]);
      }
    } catch (err) {
      setError(err?.message || "Không thể tải danh sách đơn từ theo nhân viên.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployeeRequests();
  }, [fetchEmployeeRequests]);

  const executeAction = async (id, newStatus, rejectReason = "") => {
    if (!id || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setActionLoadingId(id);
    try {
      const res = await safePut(
        `/requests/${id}`,
        {
          status: newStatus,
          reject_reason: newStatus === "rejected" ? String(rejectReason || "").trim() : null
        },
        {
          idempotencyKey: generateIdempotencyKey(`req_${newStatus}_${id}`)
        }
      );

      if (res?.success) {
        notify(
          newStatus === "approved" ? "Đã phê duyệt đơn thành công!" : "Đã từ chối đơn thành công!",
          "success"
        );
        setRejectDialogReq(null);
        setRejectReasonInput("");
        await fetchEmployeeRequests();
      } else {
        notify(res?.message || "Thao tác không thành công", "error");
      }
    } catch (err) {
      notify(err?.message || "Lỗi kết nối máy chủ", "error");
    } finally {
      actionInFlightRef.current = false;
      setActionLoadingId(null);
    }
  };

  const selectedEmployee = useMemo(
    () => employeeGroups.find((g) => g.ma_nv === selectedEmpMaNv) || null,
    [employeeGroups, selectedEmpMaNv]
  );

  const activeFilteredEmployeeObj = useMemo(
    () =>
      employeeFilter !== "ALL"
        ? employeeGroups.find((g) => g.ma_nv === employeeFilter) || null
        : null,
    [employeeGroups, employeeFilter]
  );

  // Thống kê số lượng đơn theo 4 trạng thái (tính trên nhân viên đang chọn hoặc toàn công ty)
  const statusCounts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let all = 0;
    let withPendingEmployees = 0;

    const targetGroups =
      employeeFilter !== "ALL"
        ? employeeGroups.filter((g) => g.ma_nv === employeeFilter)
        : employeeGroups;

    for (const g of targetGroups) {
      const reqList = Array.isArray(g.requests) ? g.requests : [];
      if (g.pending_count > 0) withPendingEmployees++;
      for (const r of reqList) {
        const st = String(r.status || "pending").toLowerCase();
        all++;
        if (st === "pending") pending++;
        else if (st === "approved") approved++;
        else if (st === "rejected") rejected++;
      }
    }

    return {
      pending,
      approved,
      rejected,
      all,
      withPendingEmployees
    };
  }, [employeeGroups, employeeFilter]);

  // Danh sách nhân viên bên trong Option 2 (lọc theo từ khóa tìm nhanh tiếng Việt có dấu / không dấu)
  const pickerEmployeesList = useMemo(() => {
    const q = normalizeSearchStr(empPickerSearch);
    if (!q) return employeeGroups;
    return employeeGroups.filter((emp) => {
      const dept = emp.department || defaultDepartmentName;
      const haystack = normalizeSearchStr(`${emp.ho_ten || ""} ${dept}`);
      return haystack.includes(q);
    });
  }, [employeeGroups, empPickerSearch, defaultDepartmentName]);

  // Lọc danh sách thẻ nhân viên hiển thị ngoài màn hình theo Option 1 (Trạng thái) & Option 2 (Nhân viên)
  const filteredEmployees = useMemo(() => {
    return employeeGroups.filter((emp) => {
      if (employeeFilter !== "ALL" && emp.ma_nv !== employeeFilter) {
        return false;
      }
      const reqList = Array.isArray(emp.requests) ? emp.requests : [];
      if (statusFilter === "pending") {
        return (
          emp.pending_count > 0 ||
          reqList.some((r) => String(r.status || "pending").toLowerCase() === "pending")
        );
      }
      if (statusFilter === "approved") {
        return reqList.some((r) => String(r.status || "").toLowerCase() === "approved");
      }
      if (statusFilter === "rejected") {
        return reqList.some((r) => String(r.status || "").toLowerCase() === "rejected");
      }
      // statusFilter === "all"
      if (employeeFilter !== "ALL") return true;
      return reqList.length > 0 || emp.total_requests > 0;
    });
  }, [employeeGroups, statusFilter, employeeFilter]);

  const handleTogglePicker = (pickerName) => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsMobilePickerSheet(true);
    } else {
      setIsMobilePickerSheet(false);
    }
    if (pickerName === "employee") {
      setEmpPickerSearch("");
    }
    setActivePicker((prev) => (prev === pickerName ? null : pickerName));
  };

  const activeStatusMeta =
    STATUS_OPTIONS_META.find((item) => item.id === statusFilter) || STATUS_OPTIONS_META[0];
  const activeStatusCount = statusCounts[activeStatusMeta.id] || 0;
  const hasNonDefaultFilter = statusFilter !== "pending" || employeeFilter !== "ALL";

  const myMaNv = currentUser?.ma_nv || currentUser?.username;
  const managerCanAct = canApproveRequest();

  const renderStatusOptionList = () => (
    <div className="space-y-1.5" role="listbox" aria-label="Chọn trạng thái đơn">
      {STATUS_OPTIONS_META.map((opt) => {
        const isSelected = statusFilter === opt.id;
        const count = statusCounts[opt.id] || 0;
        return (
          <button
            key={opt.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            data-testid={`requests-status-opt-${opt.id}`}
            onClick={() => {
              setStatusFilter(opt.id);
              setActivePicker(null);
            }}
            className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 text-left transition cursor-pointer ${
              isSelected
                ? "bg-[#FFE4E6]/80 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700"
                : "bg-white dark:bg-slate-800/80 border-slate-200/70 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt.dotClass}`} />
              <span
                className={`text-xs sm:text-sm font-extrabold truncate ${
                  isSelected
                    ? "text-[#B80035] dark:text-rose-200"
                    : "text-[#111C2D] dark:text-white"
                }`}
              >
                {opt.label}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`px-2 py-0.5 rounded-full border text-xs font-extrabold font-mono ${opt.badgeClass}`}
              >
                {count}
              </span>
              {isSelected && (
                <span className="w-6 h-6 rounded-full bg-[#E11D48] text-white flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );

  const renderEmployeeOptionList = () => (
    <div className="space-y-2.5" role="listbox" aria-label="Chọn nhân viên">
      {/* Ô tìm nhanh theo tên / khối làm việc */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          data-testid="requests-emp-picker-search"
          value={empPickerSearch}
          onChange={(e) => setEmpPickerSearch(e.target.value)}
          placeholder="Tìm nhanh theo họ tên hoặc khối làm việc..."
          className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-[#111C2D] dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#E11D48]"
        />
      </div>

      <div className="max-h-72 overflow-y-auto space-y-1.5 pr-0.5">
        {/* Mục đầu tiên: Tất cả nhân viên */}
        <button
          type="button"
          role="option"
          aria-selected={employeeFilter === "ALL"}
          data-testid="requests-emp-opt-ALL"
          onClick={() => {
            setEmployeeFilter("ALL");
            setActivePicker(null);
          }}
          className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 text-left transition cursor-pointer ${
            employeeFilter === "ALL"
              ? "bg-[#FFE4E6]/80 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700"
              : "bg-white dark:bg-slate-800/80 border-slate-200/70 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#F0F3FF] dark:bg-slate-700 text-[#E11D48] dark:text-rose-300 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-white truncate">
                Tất cả nhân viên
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Hiển thị đơn từ của toàn bộ nhân sự
              </div>
            </div>
          </div>

          {employeeFilter === "ALL" && (
            <span className="w-6 h-6 rounded-full bg-[#E11D48] text-white flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </span>
          )}
        </button>

        {/* Danh sách từng nhân viên: UserAvatar + Họ và tên + Khối làm việc (Ẩn hoàn toàn mã NV00x) */}
        {pickerEmployeesList.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Không tìm thấy nhân viên nào khớp tên vừa nhập.
          </div>
        ) : (
          pickerEmployeesList.map((emp) => {
            const isSelected = employeeFilter === emp.ma_nv;
            const deptLabel = emp.department || defaultDepartmentName;
            return (
              <button
                key={emp.ma_nv}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-testid={`requests-emp-opt-${emp.ma_nv}`}
                onClick={() => {
                  setEmployeeFilter(emp.ma_nv);
                  setActivePicker(null);
                }}
                className={`w-full min-h-[50px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2.5 text-left transition cursor-pointer ${
                  isSelected
                    ? "bg-[#FFE4E6]/80 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700"
                    : "bg-white dark:bg-slate-800/80 border-slate-200/70 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <UserAvatar
                    name={emp.ho_ten || "Nhân viên"}
                    avatarUrl={emp.avatar_url}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-white truncate">
                      {emp.ho_ten || "Nhân viên"}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                      {deptLabel}
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <span className="w-6 h-6 rounded-full bg-[#E11D48] text-white flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header tinh gọn + Thanh công cụ 2 Option Selector đặt cân đối trên 1 hàng */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-3.5 sm:p-4 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/70 text-[#E11D48] dark:text-rose-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-[#111C2D] dark:text-white truncate">
                Đơn từ theo Nhân viên
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                {statusCounts.pending > 0
                  ? `${statusCounts.pending} đơn đang chờ duyệt`
                  : "Không có đơn chờ duyệt"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasNonDefaultFilter && (
              <button
                type="button"
                data-testid="requests-reset-filter-btn"
                onClick={() => {
                  setStatusFilter("pending");
                  setEmployeeFilter("ALL");
                  setActivePicker(null);
                }}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#F0F3FF] hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-xs font-extrabold text-[#0051CA] dark:text-blue-400 inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Đặt lại</span>
              </button>
            )}

            <AppButton
              variant="secondary"
              icon={RefreshCw}
              loading={loading}
              onClick={fetchEmployeeRequests}
              className="text-xs px-3 py-2 min-h-[40px]"
            >
              Làm mới
            </AppButton>
          </div>
        </div>

        {/* Thanh công cụ duy nhất chứa 2 nút chọn dạng Option đặt cân đối trên cùng 1 hàng */}
        <div
          ref={filterToolbarRef}
          data-testid="requests-option-toolbar"
          className="grid grid-cols-2 gap-2.5 md:flex md:items-center md:gap-3 relative"
        >
          {/* Option 1: Bộ chọn Trạng thái đơn */}
          <div className="relative min-w-0 md:flex-1">
            <button
              type="button"
              data-testid="requests-status-selector-trigger"
              aria-expanded={activePicker === "status"}
              aria-haspopup="listbox"
              onClick={() => handleTogglePicker("status")}
              className="w-full min-h-[46px] px-3 sm:px-3.5 py-2 rounded-xl bg-[#F0F3FF]/80 dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700 hover:border-[#E11D48] dark:hover:border-rose-500/60 flex items-center justify-between gap-2 text-left transition active:scale-[0.99] cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${activeStatusMeta.dotClass}`} />
                <span className="text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-white truncate">
                  {activeStatusMeta.label}
                  {activeStatusCount > 0 ? ` (${activeStatusCount})` : ""}
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 transition-transform duration-200 ${
                  activePicker === "status" ? "rotate-180 text-[#E11D48]" : ""
                }`}
              />
            </button>

            {/* Desktop Dropdown cho Option 1 (>= 768px) */}
            {activePicker === "status" && !isMobilePickerSheet && (
              <div
                data-testid="requests-status-dropdown"
                className="hidden md:block absolute left-0 right-0 top-full mt-2 z-50 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 rounded-2xl shadow-2xl p-2.5 animate-fade-in"
              >
                {renderStatusOptionList()}
              </div>
            )}
          </div>

          {/* Option 2: Bộ chọn Nhân viên */}
          <div className="relative min-w-0 md:flex-1">
            <button
              type="button"
              data-testid="requests-employee-selector-trigger"
              aria-expanded={activePicker === "employee"}
              aria-haspopup="listbox"
              onClick={() => handleTogglePicker("employee")}
              className="w-full min-h-[46px] px-3 sm:px-3.5 py-2 rounded-xl bg-[#F0F3FF]/80 dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700 hover:border-[#E11D48] dark:hover:border-rose-500/60 flex items-center justify-between gap-2 text-left transition active:scale-[0.99] cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Users className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />
                <span className="text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-white truncate">
                  {activeFilteredEmployeeObj
                    ? activeFilteredEmployeeObj.ho_ten
                    : "Tất cả nhân viên"}
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 transition-transform duration-200 ${
                  activePicker === "employee" ? "rotate-180 text-[#E11D48]" : ""
                }`}
              />
            </button>

            {/* Desktop Dropdown cho Option 2 (>= 768px) */}
            {activePicker === "employee" && !isMobilePickerSheet && (
              <div
                data-testid="requests-employee-dropdown"
                className="hidden md:block absolute right-0 left-0 top-full mt-2 z-50 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 rounded-2xl shadow-2xl p-3 animate-fade-in"
              >
                {renderEmployeeOptionList()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Sheet Picker cho Option 1 & Option 2 (< 768px) */}
      <BottomSheet
        open={Boolean(activePicker && isMobilePickerSheet)}
        onClose={() => setActivePicker(null)}
        title={activePicker === "status" ? "Chọn trạng thái đơn" : "Chọn nhân viên"}
        subtitle={
          activePicker === "status"
            ? "Lọc danh sách đơn từ theo trạng thái xử lý"
            : "Lọc danh sách đơn từ theo từng nhân sự"
        }
        footer={null}
      >
        <div className="p-3.5">
          {activePicker === "status" ? renderStatusOptionList() : renderEmployeeOptionList()}
        </div>
      </BottomSheet>

      {/* Error banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <AppButton variant="danger" onClick={fetchEmployeeRequests} className="text-xs px-3 py-1.5">
            Thử lại
          </AppButton>
        </div>
      )}

      {/* Danh sách nhóm theo nhân viên */}
      {loading && employeeGroups.length === 0 ? (
        <SkeletonList rows={5} label="Đang tải danh sách đơn từ theo nhân viên..." />
      ) : filteredEmployees.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={`Không có đơn ở trạng thái "${activeStatusMeta.label}"`}
          description={
            activeFilteredEmployeeObj
              ? `Nhân viên ${activeFilteredEmployeeObj.ho_ten} hiện không có đơn nào khớp bộ lọc đang chọn.`
              : "Hãy bấm đổi sang trạng thái khác hoặc bấm Đặt lại để xem các đơn từ khác."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filteredEmployees.map((emp) => {
            const empRequests = Array.isArray(emp.requests) ? emp.requests : [];
            const matchingRequest =
              statusFilter === "all"
                ? emp.latest_request || empRequests[0] || null
                : empRequests.find(
                    (r) => String(r.status || "pending").toLowerCase() === statusFilter
                  ) ||
                  emp.latest_request ||
                  null;

            const latest = matchingRequest;
            const latestSt = latest ? String(latest.status || "pending").toLowerCase() : "pending";
            const latestPending = Boolean(latest && latestSt === "pending");
            const isSelf = myMaNv && myMaNv === emp.ma_nv;
            const canQuickAct = managerCanAct && latestPending && !isSelf;

            const latestCreatedLabel = latest
              ? formatTimestampVi(latest.created_at, latest.created_at_vn)
              : null;
            const latestProcessedLabel = latest
              ? formatTimestampVi(latest.processed_at, latest.processed_at_vn)
              : null;
            const deptLabel = emp.department || defaultDepartmentName;

            return (
              <div
                key={emp.ma_nv}
                data-testid={`req-emp-card-${emp.ma_nv}`}
                className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
              >
                {/* Trái: Avatar + Họ tên + Khối làm việc + Tóm tắt đơn (Thuần Tiếng Việt, ẩn Mã NV) */}
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  <UserAvatar
                    name={emp.ho_ten || "Nhân viên"}
                    avatarUrl={emp.avatar_url}
                    size="md"
                  />

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-[#111C2D] dark:text-white truncate">
                        {emp.ho_ten || "Nhân viên"}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold">
                        {deptLabel}
                      </span>
                      {emp.pending_count > 0 && (
                        <span
                          data-testid={`req-emp-pending-badge-${emp.ma_nv}`}
                          className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300/80 dark:border-amber-700/70 text-xs font-extrabold"
                        >
                          {emp.pending_count} chờ duyệt
                        </span>
                      )}
                    </div>

                    {latest ? (
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-700 dark:text-slate-200">
                          <span className="font-bold text-[#111C2D] dark:text-slate-100">
                            {getRequestTypeLabel(latest.request_type || latest.type)}
                          </span>
                          <span aria-hidden="true">•</span>
                          <span>Ngày nghỉ/áp dụng: {latest.date}</span>
                          <StatusBadge
                            type="request"
                            status={latestSt}
                            labelOverride={getRequestStatusLabel(latestSt)}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                          {latestCreatedLabel && (
                            <span>
                              <span className="font-semibold text-slate-500 dark:text-slate-400">
                                Ngày làm đơn:{" "}
                              </span>
                              <span className="font-mono font-bold text-[#111C2D] dark:text-slate-100">
                                {latestCreatedLabel}
                              </span>
                            </span>
                          )}
                          <span>
                            <span className="font-semibold text-slate-500 dark:text-slate-400">
                              {latestSt === "rejected"
                                ? "Ngày từ chối: "
                                : latestSt === "approved"
                                  ? "Ngày duyệt đơn: "
                                  : latestSt === "cancelled"
                                    ? "Ngày hủy đơn: "
                                    : ""}
                            </span>
                            <span className="font-mono font-bold text-[#111C2D] dark:text-slate-100">
                              {latestPending
                                ? "Đang chờ duyệt"
                                : latestProcessedLabel || getRequestStatusLabel(latestSt)}
                            </span>
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 dark:text-slate-400 italic">
                        Chưa phát sinh đơn từ
                      </div>
                    )}
                  </div>
                </div>

                {/* Phải: Nút Xem chi tiết + Duyệt/Từ chối nhanh (nếu đơn đang Chờ duyệt) */}
                <div className="flex flex-wrap items-center justify-end gap-2.5 shrink-0">
                  {canQuickAct && (
                    <>
                      <AppButton
                        variant="danger"
                        icon={XCircle}
                        loading={actionLoadingId === latest.id}
                        disabled={Boolean(actionLoadingId)}
                        data-testid={`req-quick-reject-${emp.ma_nv}`}
                        onClick={() => {
                          setRejectDialogReq(latest);
                          setRejectReasonInput("");
                        }}
                        className="text-xs px-3 py-2 whitespace-nowrap"
                      >
                        Từ chối
                      </AppButton>
                      <AppButton
                        variant="success"
                        icon={CheckCircle2}
                        loading={actionLoadingId === latest.id}
                        disabled={Boolean(actionLoadingId)}
                        data-testid={`req-quick-approve-${emp.ma_nv}`}
                        onClick={() => executeAction(latest.id, "approved")}
                        className="text-xs px-3 py-2 whitespace-nowrap"
                      >
                        ✓ Duyệt nhanh
                      </AppButton>
                    </>
                  )}

                  <AppButton
                    variant="secondary"
                    icon={Eye}
                    data-testid={`req-emp-detail-btn-${emp.ma_nv}`}
                    onClick={() => setSelectedEmpMaNv(emp.ma_nv)}
                    className="text-xs px-3.5 py-2 whitespace-nowrap"
                  >
                    Xem chi tiết{emp.total_requests > 0 ? ` (${emp.total_requests})` : ""}
                  </AppButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Chi tiết toàn bộ đơn từ của nhân viên + Full Timestamps GMT+7 */}
      <AppModal
        open={Boolean(selectedEmployee)}
        onClose={() => setSelectedEmpMaNv(null)}
        maxWidthClass="sm:max-w-2xl"
        icon={
          selectedEmployee ? (
            <UserAvatar
              name={selectedEmployee.ho_ten || "Nhân viên"}
              avatarUrl={selectedEmployee.avatar_url}
              size="sm"
            />
          ) : null
        }
        title={selectedEmployee ? selectedEmployee.ho_ten : "Chi tiết đơn từ"}
        subtitle={
          selectedEmployee
            ? `${selectedEmployee.department || defaultDepartmentName} • Phép có lương tháng này: ${selectedEmployee.current_month_paid_leave_used || 0}/${selectedEmployee.monthly_paid_leave_limit || 1} lượt`
            : ""
        }
        footer={
          <div className="flex justify-end w-full">
            <AppButton variant="secondary" onClick={() => setSelectedEmpMaNv(null)}>
              Đóng
            </AppButton>
          </div>
        }
      >
        {selectedEmployee && (
          <div data-testid="req-employee-detail-modal" className="p-4 sm:p-5 space-y-3">
            {selectedEmployee.requests.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Chưa phát sinh đơn từ"
                description={`Nhân viên ${selectedEmployee.ho_ten} chưa gửi đơn nghỉ phép, tạm ứng hay giải trình chấm công nào.`}
              />
            ) : (
              selectedEmployee.requests.map((req) => {
                const st = String(req.status || "pending").toLowerCase();
                const isPending = st === "pending";
                const isSelf = myMaNv && myMaNv === selectedEmployee.ma_nv;
                const canActOnItem = managerCanAct && isPending && !isSelf;

                const createdLabel =
                  formatTimestampVi(req.created_at, req.created_at_vn) || "Không rõ thời gian";
                const processedLabel = formatTimestampVi(req.processed_at, req.processed_at_vn);

                return (
                  <div
                    key={req.id}
                    data-testid={`req-history-item-${req.id}`}
                    className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/75 p-4 space-y-2.5 shadow-xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-extrabold text-[#111C2D] dark:text-white">
                            {getRequestTypeLabel(req.request_type || req.type)}
                          </span>
                          <StatusBadge
                            type="request"
                            status={st}
                            labelOverride={getRequestStatusLabel(st)}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-semibold">
                          <Calendar className="w-3.5 h-3.5 text-[#E11D48] dark:text-rose-400 shrink-0" />
                          <span>Ngày áp dụng: {req.date}</span>
                          {req.correction_mode && getCorrectionModeLabel(req.correction_mode) && (
                            <span>• {getCorrectionModeLabel(req.correction_mode)}</span>
                          )}
                        </div>
                      </div>

                      {Number(req.advance_amount) > 0 && (
                        <div className="px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 font-mono text-xs font-extrabold">
                          {formatViCurrency(req.advance_amount)}
                        </div>
                      )}
                    </div>

                    {(req.check_in_time || req.check_out_time) && (
                      <div className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                        Giờ đề nghị: {req.check_in_time || "--:--"} → {req.check_out_time || "--:--"}
                      </div>
                    )}

                    <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 bg-[#F4F6F9] dark:bg-slate-900/70 rounded-xl px-3 py-2 border border-slate-200/80 dark:border-slate-700/80">
                      <span className="font-bold text-slate-500 dark:text-slate-400">Lý do: </span>
                      <span>{req.reason || "Không có ghi chú"}</span>
                    </div>

                    {/* Thời gian làm đơn & thời gian duyệt/từ chối chuẩn GMT+7 (DD/MM/YYYY HH:mm) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="px-3 py-2 rounded-xl bg-[#F4F6F9] dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-[#0051CA] dark:text-blue-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                            Ngày làm đơn:
                          </div>
                          <div
                            data-testid={`req-created-at-${req.id}`}
                            className="font-mono font-bold text-[#111C2D] dark:text-slate-100"
                          >
                            {createdLabel}
                          </div>
                        </div>
                      </div>

                      <div className="px-3 py-2 rounded-xl bg-[#F4F6F9] dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 flex items-center gap-2">
                        <UserCheck className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                            {st === "rejected"
                              ? "Ngày từ chối:"
                              : st === "approved"
                                ? "Ngày duyệt đơn:"
                                : st === "cancelled"
                                  ? "Ngày hủy đơn:"
                                  : "Trạng thái duyệt:"}
                          </div>
                          <div
                            data-testid={`req-processed-at-${req.id}`}
                            className="font-mono font-bold text-[#111C2D] dark:text-slate-100 break-words"
                          >
                            {isPending
                              ? "Đang chờ duyệt"
                              : processedLabel || getRequestStatusLabel(st)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {st === "rejected" && req.reject_reason && (
                      <div
                        data-testid={`req-reject-reason-${req.id}`}
                        className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 text-xs text-rose-800 dark:text-rose-200 font-semibold"
                      >
                        Lý do từ chối: {req.reject_reason}
                      </div>
                    )}

                    {req.evidence_image && (
                      <div className="pt-1">
                        <SecureMediaPreview
                          src={req.evidence_image}
                          alt="Minh chứng đính kèm"
                          className="max-h-40 rounded-xl border border-slate-200 dark:border-slate-700 object-contain"
                        />
                      </div>
                    )}

                    {canActOnItem && (
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/80">
                        <AppButton
                          variant="danger"
                          icon={XCircle}
                          loading={actionLoadingId === req.id}
                          disabled={Boolean(actionLoadingId)}
                          data-testid={`req-modal-reject-${req.id}`}
                          onClick={() => {
                            setRejectDialogReq(req);
                            setRejectReasonInput("");
                          }}
                          className="text-xs px-3 py-2"
                        >
                          Từ chối
                        </AppButton>
                        <AppButton
                          variant="success"
                          icon={CheckCircle2}
                          loading={actionLoadingId === req.id}
                          disabled={Boolean(actionLoadingId)}
                          data-testid={`req-modal-approve-${req.id}`}
                          onClick={() => executeAction(req.id, "approved")}
                          className="text-xs px-3.5 py-2"
                        >
                          ✓ Phê duyệt
                        </AppButton>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </AppModal>

      {/* Modal nhập lý do từ chối (tùy chọn) */}
      <AppModal
        open={Boolean(rejectDialogReq)}
        onClose={() => !actionLoadingId && setRejectDialogReq(null)}
        disableClose={Boolean(actionLoadingId)}
        nested={true}
        maxWidthClass="max-w-md"
        title="Từ chối đơn từ"
        subtitle={
          rejectDialogReq
            ? `${getRequestTypeLabel(rejectDialogReq.request_type || rejectDialogReq.type)} • Ngày ${rejectDialogReq.date}`
            : ""
        }
        footer={
          <div className="flex items-center gap-2.5 w-full">
            <AppButton
              variant="secondary"
              disabled={Boolean(actionLoadingId)}
              onClick={() => setRejectDialogReq(null)}
              className="flex-1"
            >
              Hủy
            </AppButton>
            <AppButton
              variant="danger"
              icon={XCircle}
              loading={Boolean(actionLoadingId)}
              loadingText="Đang xử lý..."
              data-testid="confirm-reject-request-btn"
              onClick={() =>
                rejectDialogReq && executeAction(rejectDialogReq.id, "rejected", rejectReasonInput)
              }
              className="flex-1"
            >
              Xác nhận từ chối
            </AppButton>
          </div>
        }
      >
        <div className="p-4 space-y-3">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
            Lý do từ chối (tùy chọn — giúp nhân viên nắm rõ nguyên nhân)
          </label>
          <textarea
            rows={3}
            data-testid="reject-request-reason-input"
            value={rejectReasonInput}
            onChange={(e) => setRejectReasonInput(e.target.value)}
            placeholder="Ví dụ: Đã hết hạn mức phép hoặc thiếu minh chứng chấm công..."
            className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-sm text-[#111C2D] dark:text-slate-100 focus:outline-none focus:border-rose-500"
          />
        </div>
      </AppModal>
    </div>
  );
}
