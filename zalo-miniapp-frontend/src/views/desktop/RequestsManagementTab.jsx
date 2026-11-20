import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Search,
  RefreshCw,
  AlertCircle,
  UserCheck,
  Loader2
} from "lucide-react";
import { safeGet, safePut, safePost, generateIdempotencyKey } from "../../utils/api";
import { useDebouncedValue } from "../../hooks/useDebounce";
import ConfirmDialog from "../../components/ConfirmDialog";
import { getRequestTypeLabel, getCorrectionModeLabel } from "../../utils/viLabels";
import { formatViCurrency } from "../../utils/viNumberFormat";
import { AppButton, StatusBadge, SkeletonList, EmptyState } from "../../components/ui";

export default function RequestsManagementTab({
  currentUser,
  showToast,
  activeRole,
  dynamicPerms = {},
  focusTarget = null
}) {
  const effectiveRole = activeRole || currentUser?.role || "admin";
  const canApproveRequest = useCallback(
    () => {
      if (effectiveRole !== "accountant") return effectiveRole === "admin";
      return Boolean(dynamicPerms?.leave_approve || dynamicPerms?.attendance_request_approve);
    },
    [effectiveRole, dynamicPerms]
  );
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [batchApproving, setBatchApproving] = useState(false);
  const [dialogState, setDialogState] = useState(null);
  const actionInFlightRef = useRef(false);
  const batchInFlightRef = useRef(false);
  const lastFocusTsRef = useRef(0);

  useEffect(() => {
    if (!focusTarget?.ts || focusTarget.ts === lastFocusTsRef.current) return;
    if (focusTarget.tab !== "requests" && focusTarget.category !== "pending_request") return;
    lastFocusTsRef.current = focusTarget.ts;
    setFilterStatus("PENDING");
    if (focusTarget.ma_nv) {
      setSearchQuery(focusTarget.ma_nv);
    }
  }, [focusTarget]);

  const notify = useCallback((msg, type = "info") => {
    if (showToast) showToast(msg, type);
  }, [showToast]);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/requests", {}, { cancelPrevious: true });
      if (res?.success && Array.isArray(res.data)) {
        setRequests(res.data);
      } else {
        setRequests([]);
      }
    } catch (err) {
      setError(err.message || "Không thể tải danh sách đơn từ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const executeAction = async (id, newStatus, rejectReason = "") => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setActionLoadingId(id);
    try {
      const res = await safePut(`/requests/${id}`, {
        status: newStatus,
        reject_reason: rejectReason
      }, {
        idempotencyKey: generateIdempotencyKey(`req_${newStatus}`)
      });

      if (res?.success) {
        notify(newStatus === "approved" ? "Đã phê duyệt đơn thành công!" : "Đã từ chối đơn!", "success");
        setDialogState(null);
        fetchRequests();
      } else {
        notify(res?.message || "Không thể cập nhật trạng thái đơn.", "error");
      }
    } catch (err) {
      notify(err.message || "Lỗi xử lý duyệt đơn.", "error");
    } finally {
      actionInFlightRef.current = false;
      setActionLoadingId(null);
    }
  };

  const handleAction = (id, newStatus, ownerMaNv) => {
    if (actionInFlightRef.current) return;
    if (ownerMaNv && ownerMaNv === currentUser?.ma_nv) {
      notify("Theo quy định kiểm soát nội bộ, bạn không thể tự phê duyệt đơn của chính mình!", "warning");
      return;
    }

    if (newStatus === "rejected") {
      setDialogState({
        mode: "reject",
        id,
        title: "Từ chối đơn yêu cầu",
        message: "Vui lòng nhập lý do để nhân viên nắm rõ thông tin.",
        showInput: true,
        inputLabel: "Lý do từ chối",
        inputPlaceholder: "VD: Thiếu nhân sự trực ca, vui lòng điều chỉnh ngày...",
        confirmLabel: "Xác nhận từ chối",
        variant: "danger"
      });
      return;
    }

    executeAction(id, newStatus, "");
  };

  const eligiblePendingIds = requests
    .filter(
      (r) =>
        String(r.status).toUpperCase() === "PENDING" &&
        r.ma_nv !== currentUser?.ma_nv &&
        canApproveRequest(r)
    )
    .map((r) => r.id);

  const handleBatchApprove = () => {
    if (batchInFlightRef.current || eligiblePendingIds.length === 0) return;
    setDialogState({
      mode: "batch",
      title: "Duyệt nhanh hàng loạt",
      message: `Xác nhận phê duyệt toàn bộ ${eligiblePendingIds.length} đơn đang chờ hợp lệ? (Đơn của chính người đang duyệt sẽ tự động bỏ qua để đảm bảo minh bạch.)`,
      showInput: false,
      confirmLabel: `Duyệt ${eligiblePendingIds.length} đơn`,
      variant: "primary"
    });
  };

  const executeBatchApprove = async () => {
    if (batchInFlightRef.current || eligiblePendingIds.length === 0) return;
    batchInFlightRef.current = true;
    setBatchApproving(true);
    try {
      const res = await safePost("/requests/batch-approve", {
        request_ids: eligiblePendingIds
      }, {
        idempotencyKey: generateIdempotencyKey("req_batch")
      });
      if (res?.success) {
        notify(res.message || `Đã duyệt nhanh ${res.approved_count} đơn!`, "success");
        setDialogState(null);
        fetchRequests();
      } else {
        notify(res?.message || "Lỗi duyệt hàng loạt", "error");
      }
    } catch (err) {
      notify(err.message || "Lỗi duyệt nhanh hàng loạt.", "error");
    } finally {
      batchInFlightRef.current = false;
      setBatchApproving(false);
    }
  };

  const filtered = requests.filter(r => {
    const matchStatus = filterStatus === "all" || String(r.status).toUpperCase() === filterStatus.toUpperCase();
    const rawType = String(r.request_type || r.type || "").toUpperCase();
    const matchType =
      filterType === "all" ||
      (filterType === "LEAVE" && (rawType === "P" || rawType === "KP" || rawType.includes("LEAVE"))) ||
      (filterType === "CORRECTION" && rawType.includes("ATTENDANCE_CORRECTION")) ||
      (filterType === "OT" && rawType === "OT") ||
      (filterType === "ADVANCE" && rawType.includes("ADVANCE"));
    const query = debouncedSearch.trim().toLowerCase();
    const matchSearch = !query ||
      String(r.ma_nv || "").toLowerCase().includes(query) ||
      String(r.ho_ten || "").toLowerCase().includes(query) ||
      String(r.reason || "").toLowerCase().includes(query);
    return matchStatus && matchType && matchSearch;
  });

  return (
    <div className="space-y-4 pb-28">
      {/* Header and Controls — ZaUI Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100/90 dark:border-slate-800 rounded-2xl p-4 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white leading-snug flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#E11D48] dark:text-rose-400 shrink-0" />
            Xét duyệt đơn từ &amp; Nghỉ phép
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
            Duyệt đơn nghỉ phép, bổ sung công, ứng lương và tăng ca của nhân viên
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Search box */}
          <div className="relative flex-1 sm:flex-initial min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã NV, họ tên..."
              className="w-full sm:w-48 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
            />
          </div>

          {/* Status Filter */}
          <div
            data-filter-group="admin-requests-filter"
            className="flex flex-wrap bg-[#F0F3FF] border border-slate-200/80 dark:bg-slate-950 dark:border-slate-800 p-1 rounded-2xl text-xs gap-1"
          >
            {["all", "PENDING", "APPROVED", "REJECTED"].map(st => {
              const active = filterStatus === st;
              return (
                <button
                  key={st}
                  type="button"
                  data-active={active ? "true" : "false"}
                  onClick={() => setFilterStatus(st)}
                  className={`min-h-[44px] px-3 py-2 font-semibold rounded-xl whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    active
                      ? "bg-[#E11D48] text-white shadow-sm dark:bg-rose-600 dark:text-white"
                      : "bg-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  {st === "all" ? "Tất cả" : st === "PENDING" ? "Chờ duyệt" : st === "APPROVED" ? "Đã duyệt" : "Từ chối"}
                </button>
              );
            })}
          </div>

          <AppButton
            variant="secondary"
            icon={RefreshCw}
            loading={loading}
            onClick={fetchRequests}
            className="min-w-[44px] px-3 py-2 text-xs"
            title="Làm mới"
            aria-label="Làm mới danh sách đơn"
          >
            <span className="sm:hidden">Tải lại</span>
          </AppButton>

          {eligiblePendingIds.length > 0 && (
            <AppButton
              variant="success"
              icon={CheckCircle2}
              loading={batchApproving}
              loadingText="Đang duyệt hàng loạt..."
              onClick={handleBatchApprove}
              className="w-full sm:w-auto text-xs font-bold shadow-lg shadow-emerald-600/25"
            >
              Duyệt nhanh ({eligiblePendingIds.length} đơn)
            </AppButton>
          )}
        </div>
        </div>

        {/* Bộ lọc loại đơn */}
        <div
          data-filter-group="admin-request-type-filter"
          className="flex flex-wrap items-center gap-1 bg-[#F0F3FF] border border-slate-200/80 dark:bg-slate-950 dark:border-slate-800 p-1 rounded-2xl text-xs"
        >
          {[
            { id: "all", label: "Mọi loại đơn" },
            { id: "LEAVE", label: "Nghỉ phép / KL" },
            { id: "CORRECTION", label: "Bổ sung công" },
            { id: "OT", label: "Đăng ký OT" },
            { id: "ADVANCE", label: "Ứng lương" }
          ].map((t) => {
            const active = filterType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                data-active={active ? "true" : "false"}
                onClick={() => setFilterType(t.id)}
                className={`min-h-[44px] px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? "bg-[#E11D48] text-white shadow-sm dark:bg-rose-600 dark:text-white"
                    : "bg-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table Data */}
      <div className="md:bg-white md:dark:bg-slate-900 md:border md:border-slate-100/90 md:dark:border-slate-800 md:rounded-2xl md:shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] overflow-hidden">
        {loading ? (
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl">
            <SkeletonList rows={4} label="Đang tải dữ liệu đơn từ..." />
          </div>
        ) : error ? (
          <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl text-center text-rose-600 dark:text-rose-300 text-xs flex flex-col items-center justify-center gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
            <AppButton variant="danger" onClick={fetchRequests} className="text-xs px-4 py-2">
              Thử lại
            </AppButton>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl">
            <EmptyState
              icon={FileText}
              title="Không tìm thấy đơn từ nào khớp với bộ lọc."
            />
          </div>
        ) : (
          <>
            {/* Mobile ZaUI Appointment Ticket Cards View */}
            <div className="md:hidden space-y-3">
              {filtered.map((req) => {
                const isPending = String(req.status).toUpperCase() === "PENDING";
                const isOwner = req.ma_nv === currentUser?.ma_nv;
                const isOperating = actionLoadingId === req.id;
                const isFocused = Boolean(focusTarget?.id && String(req.id) === String(focusTarget.id));

                return (
                  <div
                    key={req.id}
                    data-request-id={req.id}
                    className={`perf-list-item rounded-2xl border p-4 space-y-2.5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] ${
                      isFocused
                        ? "bg-amber-50 dark:bg-amber-950/40 border-amber-400 ring-2 ring-inset ring-amber-400"
                        : "bg-white dark:bg-slate-900 border-slate-100/90 dark:border-slate-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-base text-slate-900 dark:text-white block break-words leading-snug">
                          {req.ho_ten || req.ma_nv}{" "}
                          <span className="text-xs font-mono text-[#E11D48] dark:text-rose-400">({req.ma_nv})</span>
                        </span>
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 block mt-1 break-words leading-snug">
                          {getRequestTypeLabel(req.request_type || req.type)} • {req.request_date || req.date || req.start_date}
                          {Number(req.advance_amount) > 0 && (
                            <span className="inline-block ml-1.5 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-semibold whitespace-nowrap">
                              Ứng {formatViCurrency(req.advance_amount)}
                            </span>
                          )}
                        </span>
                        {(req.correction_mode || req.check_in_time || req.check_out_time) && (
                          <div className="inline-block text-xs text-cyan-800 dark:text-cyan-200 bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-500/40 px-2.5 py-1 rounded-full mt-1.5 break-words leading-snug">
                            {getCorrectionModeLabel(req.correction_mode) || "Bổ sung giờ công"}
                            {(req.check_in_time || req.check_out_time) && (
                              <span className="ml-1 font-semibold">
                                ({req.check_in_time ? `Vào ${String(req.check_in_time).slice(0, 5)}` : ""}
                                {req.check_in_time && req.check_out_time ? " – " : ""}
                                {req.check_out_time ? `Ra ${String(req.check_out_time).slice(0, 5)}` : ""})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <StatusBadge type="request" status={req.status} />
                    </div>

                    <div className="text-sm text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700 break-words leading-relaxed">
                      <span className="text-slate-500 dark:text-slate-300 font-semibold">Lý do: </span>
                      {req.reason || "--"}
                      {req.evidence_image && (
                        <div className="mt-2.5 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                          <img
                            src={req.evidence_image}
                            alt="Ảnh minh chứng"
                            className="max-h-36 rounded-lg border border-slate-200 dark:border-slate-700 object-cover"
                          />
                        </div>
                      )}
                    </div>

                    <div className="sedinco-ticket-divider !my-2" />

                    {isPending && (
                      isOwner ? (
                        <div className="text-xs text-amber-700 dark:text-amber-300 italic font-semibold leading-snug">
                          (Đơn của bạn — Cần quản lý khác xét duyệt)
                        </div>
                      ) : !canApproveRequest(req) ? (
                        <div className="text-xs text-slate-500 dark:text-slate-400 italic font-medium leading-snug">
                          (Chế độ chỉ xem — Chưa được cấp quyền phê duyệt đơn từ)
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2.5">
                          <AppButton
                            variant="success"
                            icon={CheckCircle2}
                            loading={isOperating}
                            disabled={actionLoadingId !== null && !isOperating}
                            loadingText="Đang xử lý..."
                            onClick={() => handleAction(req.id, "approved", req.ma_nv)}
                            className="text-xs"
                          >
                            Phê duyệt
                          </AppButton>
                          <AppButton
                            variant="danger"
                            icon={XCircle}
                            loading={isOperating}
                            disabled={actionLoadingId !== null && !isOperating}
                            loadingText="Đang xử lý..."
                            onClick={() => handleAction(req.id, "rejected", req.ma_nv)}
                            className="text-xs"
                          >
                            Từ chối
                          </AppButton>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto touch-scroll-x">
              <table className="w-full text-left text-xs">
              <thead className="bg-[#F0F3FF] dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold">
                <tr>
                  <th className="p-3.5 pl-5">Mã NV / Họ Tên</th>
                  <th className="p-3.5">Loại Đơn</th>
                  <th className="p-3.5">Ngày Áp Dụng</th>
                  <th className="p-3.5">Lý Do</th>
                  <th className="p-3.5">Trạng Thái</th>
                  <th className="p-3.5 text-right pr-5">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50 text-slate-700 dark:text-slate-300">
                {filtered.map(req => {
                  const isPending = String(req.status).toUpperCase() === "PENDING";
                  const isOwner = req.ma_nv === currentUser?.ma_nv;
                  const isOperating = actionLoadingId === req.id;
                  const isFocused = Boolean(focusTarget?.id && String(req.id) === String(focusTarget.id));

                  return (
                    <tr
                      key={req.id}
                      data-request-id={req.id}
                      className={`perf-list-item transition-colors ${
                        isFocused ? "bg-amber-50 dark:bg-amber-950/40 ring-2 ring-inset ring-amber-400" : "hover:bg-slate-50 dark:hover:bg-slate-700/30"
                      }`}
                    >
                      <td className="p-3.5 pl-5">
                        <div className="font-bold text-slate-900 dark:text-white">{req.ho_ten || req.ma_nv}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">{req.ma_nv}</div>
                      </td>
                      <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                        <div>{getRequestTypeLabel(req.request_type || req.type)}</div>
                        {(req.correction_mode || req.check_in_time || req.check_out_time) && (
                          <div className="inline-block text-xs text-cyan-800 dark:text-cyan-200 bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-500/40 px-2 py-0.5 rounded-md font-normal mt-1">
                            {getCorrectionModeLabel(req.correction_mode) || "Bổ sung giờ công"}
                            {(req.check_in_time || req.check_out_time) &&
                              ` (${req.check_in_time ? `Vào ${String(req.check_in_time).slice(0, 5)}` : ""}${
                                req.check_in_time && req.check_out_time ? " – " : ""
                              }${req.check_out_time ? `Ra ${String(req.check_out_time).slice(0, 5)}` : ""})`}
                          </div>
                        )}
                        {Number(req.advance_amount) > 0 && (
                          <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">
                            Ứng: {formatViCurrency(req.advance_amount)}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                        {req.request_date || req.date || req.start_date}
                      </td>
                      <td className="p-3.5 max-w-xs break-words text-slate-700 dark:text-slate-300" title={req.reason}>
                        <div>{req.reason || "--"}</div>
                        {req.evidence_image && (
                          <div className="mt-1.5 inline-block p-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <img
                              src={req.evidence_image}
                              alt="Minh chứng"
                              className="max-h-20 rounded border border-slate-200 dark:border-slate-700 object-cover"
                            />
                          </div>
                        )}
                      </td>
                      <td className="p-3.5">
                        <StatusBadge type="request" status={req.status} />
                      </td>
                      <td className="p-3.5 text-right pr-5">
                        {isPending ? (
                          isOwner ? (
                            <span className="text-xs text-amber-700 dark:text-amber-300 italic font-semibold">
                              (Đơn của bạn — Cần quản lý khác duyệt)
                            </span>
                          ) : !canApproveRequest(req) ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400 italic font-medium">
                              (Chỉ xem — Chưa cấp quyền duyệt)
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <AppButton
                                variant="success"
                                icon={CheckCircle2}
                                loading={isOperating}
                                disabled={actionLoadingId !== null && !isOperating}
                                onClick={() => handleAction(req.id, "approved", req.ma_nv)}
                                className="px-3.5 py-2 text-xs"
                              >
                                Duyệt
                              </AppButton>
                              <AppButton
                                variant="danger"
                                icon={XCircle}
                                loading={isOperating}
                                disabled={actionLoadingId !== null && !isOperating}
                                onClick={() => handleAction(req.id, "rejected", req.ma_nv)}
                                className="px-3.5 py-2 text-xs"
                              >
                                Từ chối
                              </AppButton>
                            </div>
                          )
                        ) : (
                          <span className="text-slate-400 text-xs">Đã xử lý</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(dialogState)}
        title={dialogState?.title}
        message={dialogState?.message}
        confirmLabel={dialogState?.confirmLabel}
        variant={dialogState?.variant || "primary"}
        showInput={Boolean(dialogState?.showInput)}
        inputLabel={dialogState?.inputLabel}
        inputPlaceholder={dialogState?.inputPlaceholder}
        loading={batchApproving || actionLoadingId !== null}
        onCancel={() => setDialogState(null)}
        onConfirm={(val) => {
          if (dialogState?.mode === "batch") {
            executeBatchApprove();
          } else if (dialogState?.mode === "reject") {
            executeAction(dialogState.id, "rejected", val || "Không phù hợp kế hoạch công tác");
          }
        }}
      />
    </div>
  );
}
