import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  RefreshCw,
  AlertCircle,
  UserCheck,
  Pin,
  Lock,
  Unlock,
  Trash2,
  Filter
} from "lucide-react";
import { safeGet, safePost, safePut } from "../../utils/api";

export default function AuditLogsTab({ currentUser, showToast, onRefreshAlerts }) {
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Bộ lọc nâng cao (Nhiệm vụ 4)
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmp, setSelectedEmp] = useState("");
  const [category, setCategory] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [cleaning, setCleaning] = useState(false);

  const fetchEmployeesAndSettings = useCallback(async () => {
    try {
      const [empRes, compRes] = await Promise.all([
        safeGet("/employees").catch(() => null),
        safeGet("/company").catch(() => null)
      ]);
      if (empRes?.success && Array.isArray(empRes.data)) {
        setEmployees(empRes.data);
      }
      if (compRes?.success && compRes.data?.log_retention_days) {
        setRetentionDays(Number(compRes.data.log_retention_days) || 30);
      }
    } catch {}
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/audit-logs", {
        ma_nv: selectedEmp || undefined,
        category: category || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        pinnedOnly: pinnedOnly ? "true" : undefined,
        limit: 250
      });
      if (res?.success && Array.isArray(res.data)) {
        setLogs(res.data);
      } else {
        setLogs([]);
      }
    } catch (err) {
      setError(err.message || "Không thể tải nhật ký giám sát");
    } finally {
      setLoading(false);
    }
  }, [selectedEmp, category, startDate, endDate, pinnedOnly]);

  useEffect(() => {
    fetchEmployeesAndSettings();
  }, [fetchEmployeesAndSettings]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleTogglePin = async (log) => {
    const nextPinned = !Boolean(log.is_pinned);
    try {
      const res = await safePut(`/audit-logs/${log.id}/pin`, { is_pinned: nextPinned });
      if (res?.success) {
        setLogs((prev) =>
          prev.map((item) => (item.id === log.id ? { ...item, is_pinned: nextPinned ? 1 : 0 } : item))
        );
        if (showToast) showToast(res.message || "Đã cập nhật trạng thái ghim!", "success");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Không thể ghim dòng lịch sử.", "error");
    }
  };

  const handleToggleKeepEmployeeLogs = async (actorId, currentKeep) => {
    if (!actorId || actorId === "SYSTEM" || actorId === "admin") return;
    const nextKeep = !Boolean(currentKeep);
    try {
      const res = await safePut(`/audit-logs/keep-employee/${actorId}`, { keep_logs: nextKeep });
      if (res?.success) {
        setLogs((prev) =>
          prev.map((item) => (item.actor_id === actorId ? { ...item, keep_logs: nextKeep ? 1 : 0 } : item))
        );
        setEmployees((prev) =>
          prev.map((e) => (e.ma_nv === actorId ? { ...e, keep_logs: nextKeep ? 1 : 0 } : e))
        );
        if (showToast) showToast(res.message, "success");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi cập nhật chế độ lưu trữ của nhân viên.", "error");
    }
  };

  const handleToggleLockAccount = async (actorId, currentLocked) => {
    if (!actorId || actorId === "SYSTEM" || actorId === "admin") return;
    const nextLocked = !Boolean(currentLocked);
    try {
      const res = await safePut(`/employees/${actorId}/status`, {
        is_locked: nextLocked ? 1 : 0,
        status: nextLocked ? "inactive" : "active"
      });
      if (res?.success) {
        setLogs((prev) =>
          prev.map((item) => (item.actor_id === actorId ? { ...item, is_locked: nextLocked ? 1 : 0 } : item))
        );
        if (showToast) {
          showToast(
            nextLocked
              ? `🔒 Đã KHÓA KHẨN CẤP tài khoản nhân viên ${actorId}!`
              : `🔓 Đã mở khóa tài khoản nhân viên ${actorId}!`,
            nextLocked ? "warning" : "success"
          );
        }
        if (onRefreshAlerts) onRefreshAlerts();
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Không thể khóa/mở khóa tài khoản.", "error");
    }
  };

  const handleRunCleanup = async (newDays = retentionDays) => {
    setCleaning(true);
    try {
      const res = await safePost("/audit-logs/cleanup", { retention_days: Number(newDays) });
      if (res?.success) {
        if (showToast) {
          showToast(
            `Đã lưu chu kỳ ${res.retention_days} ngày & dọn dẹp ${res.deleted_count} bản ghi cũ (Bảo toàn log đã ghim & NV giữ lịch sử)!`,
            "success"
          );
        }
        fetchLogs();
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi dọn dẹp nhật ký.", "error");
    } finally {
      setCleaning(false);
    }
  };

  const formatDetails = (rawDetails) => {
    if (!rawDetails) return "--";
    try {
      const obj = typeof rawDetails === "string" ? JSON.parse(rawDetails) : rawDetails;
      if (obj.reason) return obj.reason;
      if (obj.shift_evaluation) return `${obj.check_type || "CHẤM CÔNG"}: ${obj.shift_evaluation} (${obj.time || ""})`;
      if (obj.dispute_reason) return `Khiếu nại lương T${obj.month}/${obj.year}: ${obj.dispute_reason}`;
      return JSON.stringify(obj);
    } catch {
      return String(rawDetails);
    }
  };

  const filtered = logs.filter((l) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      String(l.action || "").toLowerCase().includes(q) ||
      String(l.actor_id || "").toLowerCase().includes(q) ||
      String(l.ho_ten || "").toLowerCase().includes(q) ||
      String(l.details || "").toLowerCase().includes(q)
    );
  });

  const selectedEmpObj = employees.find((e) => e.ma_nv === selectedEmp);

  return (
    <div className="space-y-4">
      {/* Header & Cấu hình Tự động Xóa Dữ liệu Quá hạn (Auto-Retention Cleanup) */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Giám Sát Hoạt Động Nhân Viên & Chống Gian Lận (V5)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ghi vết thời gian thực theo từng mã nhân viên • Tự động dọn dẹp bảo vệ dung lượng TiDB Cloud
            </p>
          </div>

          {/* Chu kỳ tự động xóa log quá hạn */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 border border-slate-700 p-2 rounded-xl">
            <span className="text-[11px] font-bold text-slate-300 pl-1">Tự xóa sau:</span>
            <select
              value={retentionDays}
              onChange={(e) => {
                const val = Number(e.target.value);
                setRetentionDays(val);
                handleRunCleanup(val);
              }}
              className="bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs font-black text-amber-300"
            >
              <option value={15}>15 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={60}>60 ngày</option>
              <option value={90}>90 ngày</option>
            </select>
            <button
              type="button"
              onClick={() => handleRunCleanup(retentionDays)}
              disabled={cleaning}
              className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition"
              title="Dọn dẹp ngay các log cũ (Trừ log đã ghim 📌 hoặc nhân viên bật Giữ toàn bộ lịch sử 🔒)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{cleaning ? "Đang dọn..." : "Dọn Log Quá Hạn"}</span>
            </button>
          </div>
        </div>

        {/* Thanh Bộ Lọc Đa Chiều (Nhân viên / Phân loại / Từ ngày - Đến ngày / Ghim) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t border-slate-700/60">
          {/* Lọc theo Nhân viên */}
          <select
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold"
          >
            <option value="">👤 Tất cả nhân sự ({employees.length})</option>
            {employees.map((emp) => (
              <option key={emp.ma_nv} value={emp.ma_nv}>
                {emp.ma_nv} — {emp.ho_ten} {emp.keep_logs ? "(🔒 Giữ LS)" : ""}
              </option>
            ))}
          </select>

          {/* Lọc theo Danh mục hành động */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold"
          >
            <option value="">📂 Tất cả loại hành động</option>
            <option value="fraud">🚨 Cảnh báo Gian lận (Fake GPS / Thiết bị)</option>
            <option value="attendance">⏱️ Chấm công Vào ca / Ra ca</option>
            <option value="requests">📝 Đơn từ & Đăng ký Tăng ca</option>
            <option value="payroll">💰 Xác nhận & Khiếu nại Lương</option>
            <option value="auth_device">🔐 Đăng nhập & Đổi thiết bị</option>
          </select>

          {/* Từ ngày - Đến ngày */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              title="Từ ngày"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              title="Đến ngày"
            />
          </div>

          {/* Ô tìm kiếm từ khóa */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã NV, nội dung..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500"
            />
          </div>

          {/* Nút lọc Đã ghim & Làm mới */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPinnedOnly(!pinnedOnly)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition ${
                pinnedOnly
                  ? "bg-amber-500/20 border-amber-400 text-amber-300"
                  : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Pin className="w-3.5 h-3.5" />
              <span>Đã ghim</span>
            </button>
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="p-2 bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl transition-colors"
              title="Tải lại nhật ký"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Nếu đang chọn 1 nhân viên cụ thể: Hiện thanh công tắc "🔒 Giữ toàn bộ lịch sử của nhân viên này" */}
        {selectedEmpObj && (
          <div className="p-3 rounded-xl bg-indigo-950/50 border border-indigo-500/40 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs">
              <span className="font-black text-white">
                Nhân sự đang chọn: {selectedEmpObj.ho_ten} ({selectedEmpObj.ma_nv})
              </span>
              <span className="block text-[11px] text-indigo-200">
                Khi bật giữ lịch sử, toàn bộ hoạt động của nhân viên này sẽ được miễn trừ khỏi tiến trình tự động xóa định kỳ.
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleToggleKeepEmployeeLogs(selectedEmpObj.ma_nv, selectedEmpObj.keep_logs)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black border flex items-center gap-1.5 transition ${
                selectedEmpObj.keep_logs
                  ? "bg-emerald-600 text-white border-emerald-400 shadow-md"
                  : "bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700"
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {selectedEmpObj.keep_logs
                  ? "🔒 Đang Giữ Toàn Bộ Lịch Sử NV Này (Bấm để tắt)"
                  : "🔒 Bật Giữ Toàn Bộ Lịch Sử NV Này"}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Bảng Danh Sách Nhật Ký Kiểm Toán & Cảnh Báo Đỏ */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            Đang tải dữ liệu giám sát hoạt động...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-rose-400 text-xs flex items-center justify-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            Không có bản ghi hoạt động nào khớp với bộ lọc hiện tại.
          </div>
        ) : (
          <div className="overflow-x-auto touch-scroll-x">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 border-b border-slate-700/80 text-slate-400 uppercase tracking-wider font-bold">
                <tr>
                  <th className="p-3.5 pl-4">Thời Gian</th>
                  <th className="p-3.5">Nhân Viên</th>
                  <th className="p-3.5">Hành Động</th>
                  <th className="p-3.5">Chi Tiết Hoạt Động / Vi Phạm</th>
                  <th className="p-3.5 text-center">Bảo Toàn & Xử Lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50 text-slate-200">
                {filtered.map((log, idx) => {
                  const isFraud = log.action === "CRITICAL_FRAUD" || log.resource === "attendance_security";
                  const isPinned = Boolean(log.is_pinned);
                  const isKeepEmp = Boolean(log.keep_logs);
                  const isEmpLocked = Boolean(log.is_locked);

                  return (
                    <tr
                      key={log.id || idx}
                      className={`transition-colors ${
                        isFraud
                          ? "bg-rose-950/50 hover:bg-rose-900/40"
                          : isPinned
                          ? "bg-amber-950/25 hover:bg-amber-900/20"
                          : "hover:bg-slate-700/30"
                      }`}
                    >
                      <td className="p-3.5 pl-4 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                        {log.created_at ? new Date(log.created_at).toLocaleString("vi-VN") : "--"}
                      </td>

                      <td className="p-3.5">
                        <div className="font-black text-white flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>{log.ho_ten || log.actor_id || "SYSTEM"}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                          <span>Mã: {log.actor_id}</span>
                          {isKeepEmp && (
                            <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded font-sans font-bold">
                              🔒 Giữ LS
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-black text-[11px] border ${
                            isFraud
                              ? "bg-rose-600 text-white border-rose-400 shadow-sm"
                              : log.action?.includes("DISPUTED")
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              : "bg-blue-500/15 border-blue-500/30 text-blue-300"
                          }`}
                        >
                          {isFraud && <ShieldAlert className="w-3.5 h-3.5" />}
                          {log.action}
                        </span>
                      </td>

                      <td className="p-3.5 max-w-md text-slate-200 font-medium leading-relaxed">
                        {formatDetails(log.details)}
                      </td>

                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Nút Ghim dòng lịch sử */}
                          <button
                            type="button"
                            onClick={() => handleTogglePin(log)}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 transition ${
                              isPinned
                                ? "bg-amber-500 text-slate-950 border-amber-300 font-black"
                                : "bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-700"
                            }`}
                            title="📌 Ghim giữ lại lịch sử này vĩnh viễn"
                          >
                            <Pin className="w-3 h-3" />
                            <span>{isPinned ? "Đã ghim" : "Ghim"}</span>
                          </button>

                          {/* Nút Giữ toàn bộ lịch sử nhân viên */}
                          {log.actor_id && log.actor_id !== "admin" && log.actor_id !== "system" && (
                            <button
                              type="button"
                              onClick={() => handleToggleKeepEmployeeLogs(log.actor_id, isKeepEmp)}
                              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 transition ${
                                isKeepEmp
                                  ? "bg-indigo-600 text-white border-indigo-400"
                                  : "bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-700"
                              }`}
                              title="🔒 Giữ toàn bộ lịch sử của nhân viên này"
                            >
                              <Lock className="w-3 h-3" />
                              <span className="hidden sm:inline">{isKeepEmp ? "Giữ NV" : "Lưu NV"}</span>
                            </button>
                          )}

                          {/* Nút Khóa nóng tài khoản khi phát hiện Gian lận */}
                          {isFraud && log.actor_id && log.actor_id !== "admin" && (
                            <button
                              type="button"
                              onClick={() => handleToggleLockAccount(log.actor_id, isEmpLocked)}
                              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black border flex items-center gap-1 transition ${
                                isEmpLocked
                                  ? "bg-slate-700 text-emerald-300 border-emerald-500/40"
                                  : "bg-rose-600 hover:bg-rose-500 text-white border-rose-400"
                              }`}
                            >
                              {isEmpLocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                              <span>{isEmpLocked ? "Mở khóa NV" : "Khóa NV"}</span>
                            </button>
                          )}
                        </div>
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
