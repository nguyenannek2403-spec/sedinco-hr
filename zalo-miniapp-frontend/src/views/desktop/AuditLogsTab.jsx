import React, { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Search, RefreshCw, AlertCircle, Clock, UserCheck } from "lucide-react";
import { safeGet } from "../../utils/api";

export default function AuditLogsTab({ currentUser }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/audit-logs");
      if (res?.success && Array.isArray(res.data)) {
        setLogs(res.data);
      } else {
        // Fallback endpoint permission audit
        const permRes = await safeGet("/permissions/audit-logs");
        if (permRes?.success && Array.isArray(permRes.data)) {
          setLogs(permRes.data);
        } else {
          setLogs([]);
        }
      }
    } catch (err) {
      setError(err.message || "Không thể tải nhật ký kiểm toán");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filtered = logs.filter(l => {
    const q = searchQuery.trim().toLowerCase();
    return !q ||
      String(l.action || "").toLowerCase().includes(q) ||
      String(l.actor_id || l.user_id || "").toLowerCase().includes(q) ||
      String(l.details || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-xl flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            Nhật Ký Kiểm Toán Hệ Thống (Append-Only Audit Trail)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ghi vết bất biến mọi thao tác nhạy cảm: duyệt đơn, sửa công, chốt bảng lương, đổi quyền
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm hành động, người thực hiện..."
              className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            />
          </div>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            Đang tải dữ liệu nhật ký kiểm toán...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-rose-400 text-xs flex items-center justify-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            Chưa có bản ghi kiểm toán nào khớp với tìm kiếm.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 border-b border-slate-700/80 text-slate-400 uppercase tracking-wider font-bold">
                <tr>
                  <th className="p-3.5 pl-5">Thời Gian</th>
                  <th className="p-3.5">Người Thực Hiện</th>
                  <th className="p-3.5">Hành Động</th>
                  <th className="p-3.5">Chi Tiết Vết Thay Đổi</th>
                  <th className="p-3.5 text-right pr-5">IP / Thiết Bị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50 text-slate-300">
                {filtered.map((log, idx) => (
                  <tr key={log.id || idx} className="hover:bg-slate-700/30 transition-colors">
                    <td className="p-3.5 pl-5 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {log.created_at || log.timestamp || "--"}
                    </td>
                    <td className="p-3.5">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                        {log.actor_id || log.user_id || "SYSTEM"}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 bg-blue-500/15 border border-blue-500/30 text-blue-400 font-bold rounded-md text-[11px]">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3.5 max-w-md text-slate-300 font-medium">
                      {log.details || log.description || "--"}
                    </td>
                    <td className="p-3.5 text-right pr-5 font-mono text-[11px] text-slate-500">
                      {log.ip_address || "127.0.0.1"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
