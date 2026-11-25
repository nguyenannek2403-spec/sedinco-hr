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
  UserCheck
} from "lucide-react";
import { safeGet, safePut, generateIdempotencyKey } from "../../utils/api";
import { useDebouncedValue } from "../../hooks/useDebounce";
import useDepartments from "../../hooks/useDepartments";
import { getRequestTypeLabel, getCorrectionModeLabel } from "../../utils/viLabels";
import { formatViCurrency } from "../../utils/viNumberFormat";
import { AppButton, AppModal, StatusBadge, SkeletonList, EmptyState, UserAvatar, SecureMediaPreview } from "../../components/ui";

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
  if (s === "rejected") return "Từ chối";
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

  const [employeeGroups, setEmployeeGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterMode, setFilterMode] = useState("all"); // 'pending' | 'all' | 'processed'
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
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
    setFilterMode("pending");
    if (focusTarget.ma_nv) {
      setSearchQuery(focusTarget.ma_nv);
    }
  }, [focusTarget]);

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

  const { departmentNames, defaultDepartmentName } = useDepartments();
  const [selectedDepartment, setSelectedDepartment] = useState("ALL");

  const selectedEmployee = useMemo(
    () => employeeGroups.find((g) => g.ma_nv === selectedEmpMaNv) || null,
    [employeeGroups, selectedEmpMaNv]
  );

  const availableDepartments = useMemo(
    () =>
      Array.from(
        new Set([
          ...departmentNames,
          ...employeeGroups.map((e) => e.department).filter(Boolean)
        ])
      ),
    [departmentNames, employeeGroups]
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

  const stats = useMemo(() => {
    let withPending = 0;
    let totalPending = 0;
    let withProcessed = 0;
    for (const g of employeeGroups) {
      if (g.pending_count > 0) {
        withPending++;
        totalPending += g.pending_count;
      } else if (g.total_requests > 0) {
        withProcessed++;
      }
    }
    return {
      totalEmployees: employeeGroups.length,
      withPending,
      totalPending,
      withProcessed
    };
  }, [employeeGroups]);

  const filteredEmployees = useMemo(() => {
    const q = normalizeSearchStr(debouncedSearch);
    return employeeGroups.filter((emp) => {
      if (filterMode === "pending" && emp.pending_count === 0) return false;
      if (filterMode === "processed" && (emp.pending_count > 0 || emp.total_requests === 0)) {
        return false;
      }
      const empDept = emp.department || defaultDepartmentName;
      if (selectedDepartment !== "ALL" && empDept !== selectedDepartment) {
        return false;
      }
      if (!q) return true;
      const haystack = normalizeSearchStr(
        `${emp.ma_nv} ${emp.ho_ten} ${empDept} ${emp.chuc_danh || ""}`
      );
      return haystack.includes(q);
    });
  }, [employeeGroups, filterMode, debouncedSearch, selectedDepartment, defaultDepartmentName]);

  const myMaNv = currentUser?.ma_nv || currentUser?.username;
  const managerCanAct = canApproveRequest();

  return (
    <div className="space-y-4">
      {/* Header tinh gọn + bộ lọc & tìm kiếm */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 space-y-3 shadow-xs">
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
                {stats.totalPending > 0
                  ? `${stats.totalPending} đơn đang chờ duyệt tại ${stats.withPending} nhân sự`
                  : "Không có đơn chờ duyệt"}
              </p>
            </div>
          </div>

          <AppButton
            variant="secondary"
            icon={RefreshCw}
            loading={loading}
            onClick={fetchEmployeeRequests}
            className="text-xs px-3 py-2"
          >
            Làm mới
          </AppButton>
        </div>

        {/* Tìm kiếm theo Họ tên hoặc Bộ phận + Tabs lọc gọn */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-testid="requests-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm nhân viên theo họ tên hoặc bộ phận..."
              className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-[#F4F6F9] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-[#111C2D] dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-[#E11D48]"
            />
          </div>

          <select
            value={selectedDepartment}
            data-testid="requests-department-filter"
            aria-label="Lọc theo bộ phận"
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#E11D48]"
          >
            <option value="ALL">🏢 Tất cả bộ phận</option>
            {availableDepartments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          <div
            data-filter-group="requests-employee-filter"
            data-testid="requests-filter-bar"
            className="flex flex-wrap bg-[#F4F6F9] dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 p-1 rounded-xl gap-2 text-xs"
          >
            {[
              { id: "pending", label: `Chờ duyệt (${stats.withPending})` },
              { id: "all", label: `Tất cả nhân viên (${stats.totalEmployees})` },
              { id: "processed", label: `Đã xử lý (${stats.withProcessed})` }
            ].map((tab) => {
              const active = filterMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`requests-filter-${tab.id}`}
                  data-active={active ? "true" : "false"}
                  onClick={() => setFilterMode(tab.id)}
                  className={`min-h-[44px] px-3 py-2 rounded-lg font-bold transition cursor-pointer whitespace-nowrap ${
                    active
                      ? "bg-[#E11D48] text-white shadow-xs dark:bg-rose-600"
                      : "text-slate-600 dark:text-slate-300 hover:text-[#111C2D] dark:hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

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
          title="Không có nhân viên phù hợp"
          description={
            searchQuery
              ? "Không tìm thấy nhân viên nào khớp từ khóa tìm kiếm."
              : "Chưa có dữ liệu đơn từ ở bộ lọc này."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filteredEmployees.map((emp) => {
            const latest = emp.latest_request;
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
                {/* Trái: Avatar + Họ tên + Khối nghề + Tóm tắt đơn mới nhất (Thuần Tiếng Việt, ẩn Mã NV) */}
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
                              <span className="font-semibold text-slate-500 dark:text-slate-400">Ngày làm đơn: </span>
                              <span className="font-mono font-bold text-[#111C2D] dark:text-slate-100">{latestCreatedLabel}</span>
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

                {/* Phải: Nút Xem chi tiết + Duyệt/Từ chối nhanh (nếu đơn mới nhất đang PENDING) */}
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

      {/* Modal nhập lý do từ chối (tùy chọn) — --z-nested-modal chồng chuẩn trên modal chi tiết */}
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
