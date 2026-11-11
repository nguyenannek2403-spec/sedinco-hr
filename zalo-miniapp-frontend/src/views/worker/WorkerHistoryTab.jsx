import React, { useState, useEffect, useCallback } from "react";
import { Calendar, ChevronLeft, ChevronRight, Clock, Award, AlertCircle, RefreshCw } from "lucide-react";
import { safeGet } from "../../utils/api";

const getStatusBadge = (status) => {
  if (status === "1") return { bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Đủ công (1.0)" };
  if (status === "0.5") return { bg: "bg-teal-500/15 text-teal-400 border-teal-500/30", label: "Nửa công (0.5)" };
  if (status === "P") return { bg: "bg-amber-500/15 text-amber-400 border-amber-500/30", label: "Nghỉ phép (P)" };
  if (String(status).includes("OT")) return { bg: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30", label: "Tăng ca (OT)" };
  if (status === "L") return { bg: "bg-rose-500/15 text-rose-400 border-rose-500/30", label: "Nghỉ lễ (x3)" };
  if (status === "0" || status === "KP") return { bg: "bg-slate-700/50 text-slate-400 border-slate-600/50", label: "Nghỉ không lương" };
  return { bg: "bg-slate-800 text-slate-500 border-slate-700", label: "Chưa chấm" };
};

export default function WorkerHistoryTab({ currentUser }) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/attendance/me", { month, year });
      if (res?.success && res.data) {
        setLogs(res.data.days || res.data.logs || []);
        setSummary(res.data.summary || null);
      } else {
        setLogs([]);
        setSummary(null);
      }
    } catch (err) {
      setError(err.message || "Không thể tải lịch sử chấm công");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(y => y - 1);
    } else {
      setMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(y => y + 1);
    } else {
      setMonth(m => m + 1);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Month Navigator Header */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 flex items-center justify-between shadow-lg">
        <button
          onClick={prevMonth}
          className="p-2 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <div className="text-xs font-bold text-blue-400 uppercase tracking-wider">Lịch sử chấm công</div>
          <div className="text-lg font-black text-white">Tháng {month} / {year}</div>
        </div>

        <button
          onClick={nextMonth}
          className="p-2 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3 text-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Ngày công</div>
            <div className="text-xl font-black text-emerald-400 mt-1">{summary.total_work_days || 0}</div>
            <div className="text-[10px] text-slate-500 font-semibold">/ {summary.standard_days || 26} công</div>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3 text-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Tăng ca (OT)</div>
            <div className="text-xl font-black text-indigo-400 mt-1">{summary.total_ot_hours || 0}h</div>
            <div className="text-[10px] text-slate-500 font-semibold">ngoài giờ</div>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3 text-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Nghỉ phép</div>
            <div className="text-xl font-black text-amber-400 mt-1">{summary.total_leave_days || 0}</div>
            <div className="text-[10px] text-slate-500 font-semibold">hưởng lương</div>
          </div>
        </div>
      )}

      {/* Days List */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            Chi tiết từng ngày
          </h3>
          <button
            onClick={fetchHistory}
            disabled={loading}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            Đang tải dữ liệu chấm công...
          </div>
        ) : error ? (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            Chưa có dữ liệu chấm công cho tháng {month}/{year}
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((day, idx) => {
              const badge = getStatusBadge(day.status);
              return (
                <div
                  key={day.date || idx}
                  className="p-3 bg-slate-900/60 border border-slate-700/50 rounded-xl flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-200">
                      {day.date || `Ngày ${day.day}`}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>Vào: <strong className="text-slate-300">{day.check_in_time || "--:--"}</strong></span>
                      <span>Ra: <strong className="text-slate-300">{day.check_out_time || "--:--"}</strong></span>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border ${badge.bg}`}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
