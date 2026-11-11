import React, { useState, useEffect, useCallback } from "react";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Search,
  RefreshCw,
  AlertCircle,
  UserCheck
} from "lucide-react";
import { safeGet, safePut } from "../../utils/api";

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
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/requests");
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

  const handleAction = async (id, newStatus, ownerMaNv) => {
    // SoD (Separation of Duties): Chặn người tạo tự duyệt đơn của mình
    if (ownerMaNv && ownerMaNv === currentUser?.ma_nv) {
      if (showToast) showToast("Quy tắc SoD: Bạn không thể tự phê duyệt đơn của chính mình!", "warning");
      return;
    }

    let rejectReason = "";
    if (newStatus === "rejected") {
      const promptRes = window.prompt("Nhập lý do từ chối đơn:");
      if (promptRes === null) return;
      rejectReason = promptRes.trim() || "Không phù hợp kế hoạch công tác";
    }

    setActionLoadingId(id);
    try {
      const res = await safePut(`/requests/${id}`, {
        status: newStatus,
        reject_reason: rejectReason
      });

      if (res?.success) {
        if (showToast) {
          showToast(newStatus === "approved" ? "Đã phê duyệt đơn thành công!" : "Đã từ chối đơn!", "success");
        }
        fetchRequests();
      } else {
        alert(res?.message || "Không thể cập nhật trạng thái đơn.");
      }
    } catch (err) {
      alert(err.message || "Lỗi xử lý duyệt đơn.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const filtered = requests.filter(r => {
    const matchStatus = filterStatus === "all" || String(r.status).toUpperCase() === filterStatus.toUpperCase();
    const query = searchQuery.trim().toLowerCase();
    const matchSearch = !query ||
      String(r.ma_nv || "").toLowerCase().includes(query) ||
      String(r.ho_ten || "").toLowerCase().includes(query) ||
      String(r.reason || "").toLowerCase().includes(query);
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-4">
      {/* Header and Controls */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Xét Duyệt Đơn Từ & Nghỉ Phép
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Quản trị & kế toán xét duyệt theo quy tắc phân tách nhiệm vụ (SoD)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo mã NV, tên..."
              className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>

          {/* Status Filter */}
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700 text-xs">
            {["all", "PENDING", "APPROVED", "REJECTED"].map(st => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1 font-bold rounded-lg transition-all ${
                  filterStatus === st
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {st === "all" ? "Tất cả" : st === "PENDING" ? "Chờ duyệt" : st === "APPROVED" ? "Đã duyệt" : "Từ chối"}
              </button>
            ))}
          </div>

          <button
            onClick={fetchRequests}
            disabled={loading}
            className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} />
          </button>
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
          <div className="overflow-x-auto">
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
                        {req.request_type || "Nghỉ phép"}
                      </td>
                      <td className="p-3.5 text-slate-300 font-medium">
                        {req.request_date || req.start_date}
                      </td>
                      <td className="p-3.5 max-w-xs truncate text-slate-400" title={req.reason}>
                        {req.reason || "--"}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border inline-flex items-center gap-1 ${badge.bg}`}>
                          <badge.icon className="w-3 h-3" />
                          {badge.text}
                        </span>
                      </td>
                      <td className="p-3.5 text-right pr-5">
                        {isPending ? (
                          isOwner ? (
                            <span className="text-[11px] text-amber-400 italic font-semibold">
                              (Đơn của bạn - SoD cấm tự duyệt)
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
        )}
      </div>
    </div>
  );
}
