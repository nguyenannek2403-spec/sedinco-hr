import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  Plus,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  RefreshCw,
  Wallet,
  CalendarCheck
} from "lucide-react";
import { safeGet, safePut } from "../../utils/api";
import SmartLeaveRequestModal from "../../components/SmartLeaveRequestModal";
import ConfirmDialog from "../../components/ConfirmDialog";

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

const getRequestTypeLabel = (rawType) => {
  const t = String(rawType || "").trim();
  const lower = t.toLowerCase();
  if (lower === "salary_advance" || lower.includes("ứng lương")) return "Đơn xin ứng lương";
  if (lower === "p") return "Nghỉ phép năm (P)";
  if (lower === "kp") return "Nghỉ không lương (KP)";
  if (lower === "om") return "Nghỉ ốm đau (OM)";
  if (lower === "ot") return "Làm thêm giờ (OT)";
  if (lower === "ct") return "Đi công tác / công trình (CT)";
  return t || "Đơn xin phép";
};

export default function WorkerRequestsTab({ currentUser, showToast }) {
  const [requests, setRequests] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialType, setModalInitialType] = useState("P");
  const [confirmCancel, setConfirmCancel] = useState({ open: false, id: null });
  const [cancelling, setCancelling] = useState(false);
  const cancelInFlightRef = useRef(false);

  const fetchMyRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reqRes, balRes] = await Promise.all([
        safeGet("/requests/me"),
        safeGet("/requests/leave-balance").catch(() => null)
      ]);
      if (reqRes?.success && Array.isArray(reqRes.data)) {
        setRequests(reqRes.data);
      } else {
        setRequests([]);
      }
      if (balRes?.success && balRes.data) {
        setLeaveBalance(balRes.data);
      }
    } catch (err) {
      setError(err.message || "Không thể tải danh sách đơn từ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyRequests();
  }, [fetchMyRequests]);

  const handleCancelRequest = (id) => {
    setConfirmCancel({ open: true, id });
  };

  const executeCancelRequest = async () => {
    if (cancelInFlightRef.current || !confirmCancel.id) return;
    cancelInFlightRef.current = true;
    setCancelling(true);
    try {
      const res = await safePut(`/requests/${confirmCancel.id}/cancel`, {});
      if (res?.success) {
        if (showToast) showToast("Đã hủy đơn thành công!", "success");
        setConfirmCancel({ open: false, id: null });
        fetchMyRequests();
      } else {
        if (showToast) showToast(res?.message || "Không thể hủy đơn này!", "error");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi kết nối hủy đơn.", "error");
    } finally {
      cancelInFlightRef.current = false;
      setCancelling(false);
    }
  };

  const filtered = requests.filter(req => {
    if (filterStatus === "all") return true;
    return String(req.status).toUpperCase() === filterStatus.toUpperCase();
  });

  return (
    <div className="p-4 pb-28 space-y-4">
      {/* Top Header */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold leading-snug text-white">Đơn từ &amp; ứng lương</h2>
          <p className="text-sm text-slate-400 leading-relaxed">Quản lý phép năm, đơn tăng ca và tạm ứng lương</p>
        </div>

        {/* Action buttons: Mobile-first 2-column grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              setModalInitialType("P");
              setIsModalOpen(true);
            }}
            className="min-h-[44px] px-3 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-xs shadow-lg shadow-blue-600/25 flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Tạo đơn phép / OT</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setModalInitialType("SALARY_ADVANCE");
              setIsModalOpen(true);
            }}
            className="min-h-[44px] px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-xs shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer"
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span>Xin ứng lương</span>
          </button>
        </div>
      </div>

      {/* F1: Thẻ Quỹ Phép Năm */}
      {leaveBalance && (
        <div className="bg-gradient-to-r from-indigo-950/90 to-slate-800/90 border border-indigo-500/30 rounded-2xl p-4 shadow-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">
                Quỹ phép năm {leaveBalance.year}
              </div>
              <div className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                Đã dùng {leaveBalance.used} • Chờ duyệt {leaveBalance.pending} ngày
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-base font-bold whitespace-nowrap ${
              leaveBalance.remaining > 0 ? "text-emerald-400" : "text-rose-400"
            }`}>
              Còn {leaveBalance.remaining} / {leaveBalance.quota}
            </div>
            <div className="text-[11px] text-slate-400">ngày phép</div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs gap-1">
        {["all", "PENDING", "APPROVED", "REJECTED"].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setFilterStatus(st)}
            className={`flex-1 min-h-[36px] px-2 py-1.5 font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
              filterStatus === st
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {st === "all" ? "Tất cả" : st === "PENDING" ? "Chờ duyệt" : st === "APPROVED" ? "Đã duyệt" : "Từ chối"}
          </button>
        ))}
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            Đang tải danh sách đơn từ...
          </div>
        ) : error ? (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 bg-slate-800/40 border border-slate-700/50 rounded-2xl text-center text-slate-500 text-xs p-6">
            <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            Chưa có đơn từ nào trong danh mục này.
          </div>
        ) : (
          filtered.map((req) => {
            const badge = getStatusBadge(req.status);
            const StatusIcon = badge.icon;
            const isPending = String(req.status).toUpperCase() === "PENDING";

            return (
              <div
                key={req.id}
                className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-lg space-y-2.5 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-white block leading-snug">
                      {getRequestTypeLabel(req.request_type)}
                    </span>
                    <span className="text-xs text-slate-400 font-medium block mt-0.5">
                      Ngày áp dụng:{" "}
                      <strong className="text-slate-200">
                        {String(req.request_date || req.start_date || "").slice(0, 10)}
                      </strong>
                    </span>
                    {Number(req.advance_amount) > 0 && (
                      <div className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold whitespace-nowrap">
                        <Wallet className="w-3.5 h-3.5 shrink-0" />
                        <span>Số tiền ứng: {Math.round(Number(req.advance_amount)).toLocaleString("vi-VN")} đ</span>
                      </div>
                    )}
                  </div>

                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg border flex items-center gap-1 whitespace-nowrap shrink-0 ${badge.bg}`}>
                    <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{badge.text}</span>
                  </span>
                </div>

                {req.reason && (
                  <p className="text-sm text-slate-300 bg-slate-900/50 p-3 rounded-xl border border-slate-800 leading-relaxed">
                    {req.reason}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
                  <span>Mã đơn: #{req.id}</span>
                  {isPending && (
                    <button
                      type="button"
                      onClick={() => handleCancelRequest(req.id)}
                      className="min-h-[36px] px-2.5 py-1 text-rose-400 hover:bg-rose-500/10 rounded-lg font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Hủy đơn</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal nộp đơn */}
      {isModalOpen && (
        <SmartLeaveRequestModal
          currentUser={currentUser}
          existingRequests={requests}
          leaveBalance={leaveBalance}
          initialMode={modalInitialType}
          onClose={() => setIsModalOpen(false)}
          onRequestSubmitted={() => {
            setIsModalOpen(false);
            fetchMyRequests();
            if (showToast) showToast("Nộp đơn mới thành công!", "success");
          }}
        />
      )}

      <ConfirmDialog
        open={confirmCancel.open}
        title="Xác nhận hủy đơn"
        message={`Bạn có chắc chắn muốn hủy đơn #${confirmCancel.id || ""} không?`}
        confirmLabel="Xác nhận hủy"
        danger={true}
        loading={cancelling}
        onCancel={() => {
          if (!cancelling) setConfirmCancel({ open: false, id: null });
        }}
        onConfirm={executeCancelRequest}
      />
    </div>
  );
}
