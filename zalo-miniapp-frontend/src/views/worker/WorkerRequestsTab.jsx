import React, { useState, useEffect, useCallback } from "react";
import { FileText, Plus, AlertCircle, CheckCircle2, Clock, XCircle, Trash2, RefreshCw } from "lucide-react";
import { safeGet, safePut } from "../../utils/api";
import SmartLeaveRequestModal from "../../components/SmartLeaveRequestModal";

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

export default function WorkerRequestsTab({ currentUser, showToast }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchMyRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/requests/me");
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
    fetchMyRequests();
  }, [fetchMyRequests]);

  const handleCancelRequest = async (id) => {
    if (!window.confirm("Bạn có chắc chắn muốn hủy đơn từ này?")) return;
    try {
      const res = await safePut(`/requests/${id}/cancel`, {});
      if (res?.success) {
        if (showToast) showToast("Đã hủy đơn thành công!", "success");
        fetchMyRequests();
      } else {
        alert(res?.message || "Không thể hủy đơn này!");
      }
    } catch (err) {
      alert(err.message || "Lỗi kết nối hủy đơn.");
    }
  };

  const filtered = requests.filter(req => {
    if (filterStatus === "all") return true;
    return String(req.status).toUpperCase() === filterStatus.toUpperCase();
  });

  return (
    <div className="p-4 space-y-4">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-white">Đơn Từ & Nghỉ Phép</h2>
          <p className="text-xs text-slate-400">Quản lý và theo dõi tiến độ phê duyệt</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-blue-600/30 flex items-center gap-1.5 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo Đơn</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs">
        {["all", "PENDING", "APPROVED", "REJECTED"].map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`flex-1 py-1.5 font-bold rounded-lg transition-all ${
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
                  <div>
                    <span className="text-xs font-black text-white block">
                      {req.request_type || "Đơn xin phép"}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      Ngày áp dụng: <strong className="text-slate-200">{req.request_date || req.start_date}</strong>
                    </span>
                  </div>

                  <span className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border flex items-center gap-1 ${badge.bg}`}>
                    <StatusIcon className="w-3 h-3" />
                    {badge.text}
                  </span>
                </div>

                {req.reason && (
                  <p className="text-xs text-slate-300 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800">
                    {req.reason}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                  <span>Mã đơn: #{req.id}</span>
                  {isPending && (
                    <button
                      onClick={() => handleCancelRequest(req.id)}
                      className="text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hủy đơn
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
          onClose={() => setIsModalOpen(false)}
          onRequestSubmitted={() => {
            setIsModalOpen(false);
            fetchMyRequests();
            if (showToast) showToast("Nộp đơn mới thành công!", "success");
          }}
        />
      )}
    </div>
  );
}
