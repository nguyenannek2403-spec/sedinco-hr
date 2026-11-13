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

const getStatusBadge = (status) => {
  const s = String(status).toUpperCase();
  if (s === "APPROVED") {
    return { bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2, text: "Đã duyệt" };
  }
  if (s === "REJECTED") {
    return { bg: "bg-rose-500/15 text-rose-400 border-rose-500/30", icon: XCircle, text: "Từ chối" };
  }
  if (s === "CANCELLED") {
    return { bg: "bg-slate-700/50 text-slate-400 border-slate-600/50", icon: XCircle, text: "Đã hủy" };
  }
  return { bg: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: Clock, text: "Chờ duyệt" };
};

export default function RequestsManagementTab({ currentUser, showToast }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [batchApproving, setBatchApproving] = useState(false);
  const [dialogState, setDialogState] = useState(null);
  const actionInFlightRef = useRef(false);
  const batchInFlightRef = useRef(false);

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
    .filter((r) => String(r.status).toUpperCase() === "PENDING" && r.ma_nv !== currentUser?.ma_nv)
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
    const query = debouncedSearch.trim().toLowerCase();
    const matchSearch = !query ||
      String(r.ma_nv || "").toLowerCase().includes(query) ||
      String(r.ho_ten || "").toLowerCase().includes(query) ||
      String(r.reason || "").toLowerCase().includes(query);
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-4 pb-28">
      {/* Header and Controls */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white leading-snug flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400 shrink-0" />
            Xét duyệt đơn từ & Nghỉ phép
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5 leading-relaxed">
            Duyệt đơn nghỉ phép, bổ sung công, ứng lương và tăng ca của nhân viên
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Search box */}
          <div className="relative flex-1 sm:flex-initial min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã NV, họ tên..."
              className="w-full sm:w-48 bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex flex-wrap bg-slate-900 p-1 rounded-xl border border-slate-700 text-xs gap-1">
            {["all", "PENDING", "APPROVED", "REJECTED"].map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap shrink-0 transition-all ${
                  filterStatus === st
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {st === "all" ? "Tất cả" : st === "PENDING" ? "Chờ duyệt" : st === "APPROVED" ? "Đã duyệt" : "Từ chối"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={fetchRequests}
            disabled={loading}
            className="min-h-[42px] px-3 bg-slate-700/60 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-medium whitespace-nowrap"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} />
            <span className="sm:hidden">Tải lại</span>
          </button>

          {eligiblePendingIds.length > 0 && (
            <button
              type="button"
              disabled={batchApproving}
              onClick={handleBatchApprove}
              className="w-full sm:w-auto min-h-[42px] px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/25 cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {batchApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>
                {batchApproving
                  ? "Đang duyệt hàng loạt..."
                  : `Duyệt nhanh (${eligiblePendingIds.length} đơn)`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Table Data */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            Đang tải dữ liệu đơn từ...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-rose-400 text-xs flex items-center justify-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            Không tìm thấy đơn từ nào khớp với bộ lọc.
          </div>
        ) : (
          <>
            {/* Mobile Card View (Tối ưu cho màn hình điện thoại 360px - 430px trên Zalo Mini App) */}
            <div className="md:hidden divide-y divide-slate-700/60">
              {filtered.map((req) => {
                const badge = getStatusBadge(req.status);
                const isPending = String(req.status).toUpperCase() === "PENDING";
                const isOwner = req.ma_nv === currentUser?.ma_nv;
                const isOperating = actionLoadingId === req.id;

                return (
                  <div key={req.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-semibold text-base text-white block break-words leading-snug">
                          {req.ho_ten || req.ma_nv}{" "}
                          <span className="text-xs font-mono text-blue-400">({req.ma_nv})</span>
                        </span>
                        <span className="text-sm font-medium text-amber-300 block mt-1 break-words leading-snug">
                          {getRequestTypeLabel(req.request_type || req.type)} • {req.request_date || req.date || req.start_date}
                          {Number(req.advance_amount) > 0 && (
                            <span className="inline-block ml-1.5 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-semibold whitespace-nowrap">
                              Ứng {(Number(req.advance_amount) || 0).toLocaleString("vi-VN")}đ
                            </span>
                          )}
                        </span>
                        {(req.correction_mode || req.check_in_time || req.check_out_time) && (
                          <div className="text-xs text-cyan-300 mt-1 break-words leading-snug">
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
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-lg border inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${badge.bg}`}>
                        <badge.icon className="w-3 h-3" />
                        {badge.text}
                      </span>
                    </div>

                    <div className="text-sm text-slate-200 bg-slate-900/60 p-3 rounded-xl border border-slate-700/60 break-words leading-relaxed">
                      <span className="text-slate-400 font-semibold">Lý do: </span>
                      {req.reason || "--"}
                      {req.evidence_image && (
                        <div className="mt-2">
                          <img
                            src={req.evidence_image}
                            alt="Ảnh minh chứng"
                            className="max-h-36 rounded-lg border border-slate-700 object-cover"
                          />
                        </div>
                      )}
                    </div>

                    {isPending && (
                      isOwner ? (
                        <div className="text-xs text-amber-400 italic font-semibold leading-snug">
                          (Đơn của bạn — Cần quản lý khác xét duyệt)
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleAction(req.id, "approved", req.ma_nv)}
                            disabled={isOperating || actionLoadingId !== null}
                            className="min-h-[44px] py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                          >
                            {isOperating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            <span>{isOperating ? "Đang xử lý..." : "Phê Duyệt"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAction(req.id, "rejected", req.ma_nv)}
                            disabled={isOperating || actionLoadingId !== null}
                            className="min-h-[44px] py-2.5 px-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                          >
                            {isOperating ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                            <span>{isOperating ? "Đang xử lý..." : "Từ Chối"}</span>
                          </button>
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
              <thead className="bg-slate-900/80 border-b border-slate-700/80 text-slate-400 uppercase tracking-wider font-bold">
                <tr>
                  <th className="p-3.5 pl-5">Mã NV / Họ Tên</th>
                  <th className="p-3.5">Loại Đơn</th>
                  <th className="p-3.5">Ngày Áp Dụng</th>
                  <th className="p-3.5">Lý Do</th>
                  <th className="p-3.5">Trạng Thái</th>
                  <th className="p-3.5 text-right pr-5">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50 text-slate-300">
                {filtered.map(req => {
                  const badge = getStatusBadge(req.status);
                  const isPending = String(req.status).toUpperCase() === "PENDING";
                  const isOwner = req.ma_nv === currentUser?.ma_nv;
                  const isOperating = actionLoadingId === req.id;

                  return (
                    <tr key={req.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="p-3.5 pl-5">
                        <div className="font-bold text-white">{req.ho_ten || req.ma_nv}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{req.ma_nv}</div>
                      </td>
                      <td className="p-3.5 font-semibold text-slate-200">
                        <div>{getRequestTypeLabel(req.request_type || req.type)}</div>
                        {(req.correction_mode || req.check_in_time || req.check_out_time) && (
                          <div className="text-xs text-cyan-300 font-normal mt-0.5">
                            {getCorrectionModeLabel(req.correction_mode) || "Bổ sung giờ công"}
                            {(req.check_in_time || req.check_out_time) &&
                              ` (${req.check_in_time ? `Vào ${String(req.check_in_time).slice(0, 5)}` : ""}${
                                req.check_in_time && req.check_out_time ? " – " : ""
                              }${req.check_out_time ? `Ra ${String(req.check_out_time).slice(0, 5)}` : ""})`}
                          </div>
                        )}
                        {Number(req.advance_amount) > 0 && (
                          <div className="text-xs text-emerald-400 font-semibold mt-0.5">
                            Ứng: {(Number(req.advance_amount) || 0).toLocaleString("vi-VN")} đ
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-300 font-medium whitespace-nowrap">
                        {req.request_date || req.date || req.start_date}
                      </td>
                      <td className="p-3.5 max-w-xs break-words text-slate-300" title={req.reason}>
                        <div>{req.reason || "--"}</div>
                        {req.evidence_image && (
                          <img
                            src={req.evidence_image}
                            alt="Minh chứng"
                            className="mt-1.5 max-h-20 rounded border border-slate-700 object-cover"
                          />
                        )}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border inline-flex items-center gap-1 ${badge.bg}`}>
                          <badge.icon className="w-3 h-3" />
                          {badge.text}
                        </span>
                      </td>
                      <td className="p-3.5 text-right pr-5">
                        {isPending ? (
                          isOwner ? (
                            <span className="text-xs text-amber-400 italic font-semibold">
                              (Đơn của bạn — Cần quản lý khác duyệt)
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleAction(req.id, "approved", req.ma_nv)}
                                disabled={isOperating}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors flex items-center gap-1 shadow-md shadow-emerald-600/20 disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Duyệt
                              </button>
                              <button
                                onClick={() => handleAction(req.id, "rejected", req.ma_nv)}
                                disabled={isOperating}
                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition-colors flex items-center gap-1 shadow-md shadow-rose-600/20 disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Từ chối
                              </button>
                            </div>
                          )
                        ) : (
                          <span className="text-slate-500 text-[11px]">Đã xử lý</span>
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
