import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertCircle,
  RefreshCw,
  FilePlus2,
  MapPin,
  UserCheck
} from "lucide-react";
import { safeGet } from "../../utils/api";
import SmartLeaveRequestModal from "../../components/SmartLeaveRequestModal";
import useLockBodyScroll from "../../hooks/useLockBodyScroll";
import { getAttendanceStatusInfo } from "../../utils/viLabels";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function getHeatmapCellStyle(log, dayNum, isFuture) {
  if (isFuture) {
    return {
      cellClass: "bg-slate-900/40 border-slate-800/60 text-slate-600",
      dotClass: "bg-slate-700",
      badgeText: "Chưa tới",
      needsCorrection: false
    };
  }
  if (!log) {
    return {
      cellClass: "bg-rose-950/50 border-rose-500/40 text-rose-300",
      dotClass: "bg-rose-500",
      badgeText: "Vắng / Chưa chấm",
      needsCorrection: true
    };
  }

  const st = String(log.status || "").toUpperCase();
  const forgotOut = Boolean(log.check_in_time && !log.check_out_time);
  const isLate = Number(log.late_minutes) > 0;
  const isEarly = Number(log.early_leave_minutes) > 0;

  if (st === "P" || st === "L") {
    return {
      cellClass: "bg-purple-950/60 border-purple-500/50 text-purple-200",
      dotClass: "bg-purple-400",
      badgeText: st === "L" ? "Nghỉ lễ (L)" : "Nghỉ phép (P)",
      needsCorrection: false
    };
  }
  if (st.includes("OT")) {
    return {
      cellClass: "bg-blue-950/70 border-blue-500/60 text-blue-200",
      dotClass: "bg-blue-400",
      badgeText: `Tăng ca (${log.ot_hours || 0}h OT)`,
      needsCorrection: forgotOut
    };
  }
  if (st === "0" || st === "V" || st === "KP") {
    return {
      cellClass: "bg-rose-950/70 border-rose-500/60 text-rose-200",
      dotClass: "bg-rose-500",
      badgeText: "Vắng không phép / Thiếu công",
      needsCorrection: true
    };
  }
  if (forgotOut || st === "0.5" || isLate || isEarly) {
    return {
      cellClass: "bg-amber-950/65 border-amber-500/60 text-amber-200",
      dotClass: "bg-amber-400",
      badgeText: forgotOut
        ? "Quên Check-out"
        : st === "0.5"
        ? "Nửa công (0.5)"
        : isLate
        ? `Đi muộn ${log.late_minutes}p`
        : `Về sớm ${log.early_leave_minutes}p`,
      needsCorrection: true
    };
  }
  if (st === "1") {
    return {
      cellClass: "bg-emerald-950/65 border-emerald-500/50 text-emerald-200",
      dotClass: "bg-emerald-400",
      badgeText: "Đủ công (1.0)",
      needsCorrection: false
    };
  }
  return {
    cellClass: "bg-slate-800/70 border-slate-700 text-slate-300",
    dotClass: "bg-slate-500",
    badgeText: st || "Khác",
    needsCorrection: false
  };
}

export default function WorkerHistoryTab({ currentUser, showToast }) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedDayDetail, setSelectedDayDetail] = useState(null);
  const [correctionModalDate, setCorrectionModalDate] = useState(null);

  useLockBodyScroll(Boolean(selectedDayDetail));

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/attendance/me", { month, year });
      if (res?.success && res.data) {
        const list = Array.isArray(res.data)
          ? res.data
          : res.data.logs || res.data.days || [];
        setLogs(list);
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
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  // Xây dựng lưới Heatmap 7 cột (T2 -> CN)
  const calendarCells = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayJs = new Date(year, month - 1, 1).getDay(); // 0 = CN, 1 = T2...
    const leadingEmpty = firstDayJs === 0 ? 6 : firstDayJs - 1;

    const mapByDate = {};
    logs.forEach((item) => {
      const iso = String(item.record_date || item.date || "").slice(0, 10);
      if (iso) mapByDate[iso] = item;
    });

    const todayIso = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const cells = [];
    for (let i = 0; i < leadingEmpty; i++) {
      cells.push({ empty: true, key: `empty-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const log = mapByDate[isoDate] || null;
      const isFuture = isoDate > todayIso;
      const isSunday = new Date(year, month - 1, d).getDay() === 0;
      const style = getHeatmapCellStyle(log, d, isFuture || (isSunday && !log));
      cells.push({
        empty: false,
        key: isoDate,
        dayNum: d,
        isoDate,
        log,
        isToday: isoDate === todayIso,
        isFuture,
        isSunday,
        style
      });
    }
    return cells;
  }, [logs, month, year]);

  return (
    <div className="p-3 sm:p-4 pb-28 space-y-4">
      {/* Month Navigator */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-3.5 flex items-center justify-between shadow-lg">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Tháng trước"
          className="min-w-[44px] min-h-[44px] p-2 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center justify-center cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <div className="text-xs font-semibold text-blue-400">Lịch công Heatmap</div>
          <div className="text-base sm:text-lg font-bold text-white">Tháng {month} / {year}</div>
        </div>

        <button
          type="button"
          onClick={nextMonth}
          aria-label="Tháng sau"
          className="min-w-[44px] min-h-[44px] p-2 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center justify-center cursor-pointer"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Summary KPI & Thống kê Đi trễ / Đúng giờ */}
      {summary && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-2.5 text-center">
              <div className="text-xs font-semibold text-slate-300">Ngày công</div>
              <div className="text-lg font-bold text-emerald-400 mt-0.5">{summary.total_work_days || 0}</div>
              <div className="text-[11px] text-slate-400">/ {summary.standard_days || 26} công</div>
            </div>
            <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-2.5 text-center">
              <div className="text-xs font-semibold text-slate-300">Tăng ca OT</div>
              <div className="text-lg font-bold text-blue-400 mt-0.5">{summary.total_ot_hours || 0}h</div>
              <div className="text-[11px] text-slate-400">ngoài giờ</div>
            </div>
            <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-2.5 text-center">
              <div className="text-xs font-semibold text-slate-300">Nghỉ phép</div>
              <div className="text-lg font-bold text-purple-400 mt-0.5">{summary.total_leave_days || 0}</div>
              <div className="text-[11px] text-slate-400">hưởng lương</div>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-xs space-y-1">
            {summary.effective_shift_start && summary.effective_shift_end && (
              <div className="text-slate-300 font-medium">
                Ca làm việc của bạn hôm nay:{" "}
                <strong className="text-white">
                  {summary.effective_shift_start} – {summary.effective_shift_end}
                </strong>
              </div>
            )}
            <div className="text-[11px] text-slate-300 font-semibold flex flex-wrap items-center gap-1.5">
              <span>Tháng này:</span>
              <span className="text-amber-300 font-bold">
                Đi trễ {summary.late_count || 0} lần (Tổng {summary.total_late_minutes || 0} phút)
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-emerald-400 font-bold">
                Đi sớm/Đúng giờ {summary.on_time_count || 0} ngày
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CALENDAR GRID HEATMAP (7 CỘT T2 -> CN) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-200 flex items-center gap-1.5 uppercase">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span>Chạm vào từng ô ngày để xem & bù công</span>
          </h3>
          <button
            type="button"
            onClick={fetchHistory}
            disabled={loading}
            className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Chú thích màu Heatmap */}
        <div className="flex flex-wrap gap-2 text-[10px] font-bold text-slate-300">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>Đủ công</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>Muộn/Quên ra</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-400"></span>Phép/Lễ</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>Tăng ca OT</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>Vắng/Thiếu</span>
        </div>

        {/* Header Thứ */}
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-black text-slate-400">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>

        {/* Lưới Ngày */}
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            <span>Đang tải Heatmap tháng...</span>
          </div>
        ) : error ? (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell) => {
              if (cell.empty) {
                return <div key={cell.key} className="h-12 rounded-xl" />;
              }
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDayDetail(cell)}
                  className={`h-12 rounded-xl border flex flex-col items-center justify-center relative transition active:scale-95 cursor-pointer ${
                    cell.style.cellClass
                  } ${cell.isToday ? "ring-2 ring-blue-400" : ""}`}
                >
                  <span className="text-xs font-black leading-none">{cell.dayNum}</span>
                  <span className={`w-2 h-2 rounded-full mt-1.5 ${cell.style.dotClass}`} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* BẢNG ĐỐI CHIẾU CÔNG & LƯƠNG TỪNG NGÀY (CHUẨN MISA AMIS) */}
      {logs.length > 0 && (
        <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-3.5 space-y-2.5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-white">
              Bảng đối chiếu công từng ngày ({logs.length} ngày)
            </h4>
            <span className="text-xs text-blue-300 font-semibold">
              Chạm vào ngày để giải trình công
            </span>
          </div>
          <div className="divide-y divide-slate-700/60 bg-slate-900/70 border border-slate-700/70 rounded-2xl overflow-hidden">
            {logs.map((day, idx) => {
              const iso = String(day.record_date || "").slice(0, 10);
              const style = getHeatmapCellStyle(day, idx, false);
              const statusInfo = getAttendanceStatusInfo(day.status);
              const otHours = Number(day.ot_hours) || 0;
              const lateMinutes = Number(day.late_minutes) || 0;
              return (
                <button
                  key={iso || idx}
                  type="button"
                  onClick={() => setSelectedDayDetail({ isoDate: iso, dayNum: iso.slice(-2), log: day, style })}
                  className="w-full text-left p-3.5 flex items-start justify-between gap-3 hover:bg-slate-800/80 transition cursor-pointer"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white font-mono">{iso}</span>
                      <span className="text-xs font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                        {statusInfo.creditText}
                      </span>
                      {otHours > 0 && (
                        <span className="text-xs font-semibold text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 rounded-md">
                          +{otHours}h tăng ca
                        </span>
                      )}
                      {lateMinutes > 0 && (
                        <span className="text-xs font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md">
                          Muộn {lateMinutes}p
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-300 flex flex-wrap items-center gap-3">
                      <span>
                        Vào:{" "}
                        <strong className="text-white font-mono">
                          {day.check_in_time ? String(day.check_in_time).slice(0, 5) : "--:--"}
                        </strong>
                      </span>
                      <span>
                        Ra:{" "}
                        <strong className="text-white font-mono">
                          {day.check_out_time ? String(day.check_out_time).slice(0, 5) : "--:--"}
                        </strong>
                      </span>
                    </div>
                    {day.location_name && (
                      <div className="text-xs text-slate-400 flex items-center gap-1 leading-snug">
                        <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="break-words">{day.location_name}</span>
                      </div>
                    )}
                    {day.proxy_by && (
                      <div className="text-xs text-blue-300 flex items-center gap-1 leading-snug">
                        <UserCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>Chấm công hộ{day.proxy_note ? `: ${day.proxy_note}` : ""}</span>
                      </div>
                    )}
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg border shrink-0 whitespace-nowrap ${style.cellClass}`}>
                    {statusInfo.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL CHI TIẾT 1 NGÀY + NÚT BỔ SUNG CÔNG 1 CHẠM */}
      {selectedDayDetail && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)"
          }}
          onTouchMove={(e) => {
            if (e.target === e.currentTarget) e.preventDefault();
          }}
          onClick={() => setSelectedDayDetail(null)}
        >
          <div
            className="bg-slate-900 border-2 border-slate-700 rounded-t-3xl sm:rounded-3xl w-full max-w-sm max-h-[88vh] flex flex-col overflow-hidden shadow-2xl animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3.5 flex items-center gap-3 border-b border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedDayDetail(null)}
                className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition active:scale-[0.98]"
              >
                <ArrowLeft size={16} />
                <span>Trở về</span>
              </button>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-blue-400 block">Chi tiết công ngày</span>
                <h3 className="text-base font-bold text-white leading-snug">{selectedDayDetail.isoDate}</h3>
              </div>
            </div>

            <div
              className="modal-scroll-area flex-1 overflow-y-auto overscroll-contain touch-pan-y p-5 space-y-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
            >
              <div className="space-y-2.5 text-xs">
                <div className={`p-3 rounded-2xl border font-bold text-center text-sm ${selectedDayDetail.style.cellClass}`}>
                  {selectedDayDetail.style.badgeText}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                    <span className="text-xs text-slate-400 block mb-0.5">Giờ vào ca</span>
                    <span className="text-base font-bold text-white font-mono">
                      {selectedDayDetail.log?.check_in_time ? String(selectedDayDetail.log.check_in_time).slice(0, 5) : "--:--"}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                    <span className="text-xs text-slate-400 block mb-0.5">Giờ ra ca</span>
                    <span className="text-base font-bold text-white font-mono">
                      {selectedDayDetail.log?.check_out_time ? String(selectedDayDetail.log.check_out_time).slice(0, 5) : "--:--"}
                    </span>
                  </div>
                </div>

                {selectedDayDetail.log?.location_name && (
                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center gap-2 text-slate-300">
                    <MapPin size={15} className="text-blue-400 shrink-0" />
                    <span className="break-words">{selectedDayDetail.log.location_name}</span>
                  </div>
                )}

                {selectedDayDetail.log?.proxy_by && (
                  <div className="bg-blue-950/40 p-3 rounded-2xl border border-blue-500/30 text-blue-200 space-y-0.5">
                    <strong className="block text-xs">Chấm công hộ bởi {selectedDayDetail.log.proxy_by}</strong>
                    {selectedDayDetail.log.proxy_note && (
                      <span className="text-xs block">{selectedDayDetail.log.proxy_note}</span>
                    )}
                  </div>
                )}

                {selectedDayDetail.log?.field_note && (
                  <div className="bg-amber-950/40 p-3 rounded-2xl border border-amber-500/30 text-amber-200">
                    <strong className="block text-xs mb-0.5">Ghi chú công trình:</strong>
                    <span>{selectedDayDetail.log.field_note}</span>
                  </div>
                )}
              </div>

              {!selectedDayDetail.isFuture && (
                <button
                  type="button"
                  onClick={() => {
                    const iso = selectedDayDetail.isoDate;
                    const existingLog = selectedDayDetail.log;
                    setSelectedDayDetail(null);
                    setCorrectionModalDate({ iso, log: existingLog });
                  }}
                  className="w-full min-h-[46px] py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition active:scale-[0.98]"
                >
                  <FilePlus2 size={16} />
                  <span>Gửi đơn bổ sung công cho ngày này</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedDayDetail(null)}
                className="w-full min-h-[46px] py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-2xl font-semibold text-sm cursor-pointer transition active:scale-[0.98]"
              >
                Đóng / Quay lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BỔ SUNG CÔNG TỰ ĐỘNG ĐIỀN NGÀY TỪ HEATMAP */}
      {correctionModalDate && (
        <SmartLeaveRequestModal
          currentUser={currentUser}
          initialDate={typeof correctionModalDate === "string" ? correctionModalDate : correctionModalDate.iso}
          initialMode="Bổ sung công / Quên chấm giờ ra"
          initialCorrectionMode={
            correctionModalDate?.log?.check_in_time && !correctionModalDate?.log?.check_out_time
              ? "CHECK_OUT"
              : !correctionModalDate?.log?.check_in_time && correctionModalDate?.log?.check_out_time
                ? "CHECK_IN"
                : "BOTH"
          }
          initialCheckInTime={
            correctionModalDate?.log?.check_in_time
              ? String(correctionModalDate.log.check_in_time).slice(0, 5)
              : "07:30"
          }
          initialCheckOutTime={
            correctionModalDate?.log?.check_out_time
              ? String(correctionModalDate.log.check_out_time).slice(0, 5)
              : "17:30"
          }
          initialReason={`Đề nghị bổ sung công ngày ${typeof correctionModalDate === "string" ? correctionModalDate : correctionModalDate.iso}`}
          onClose={() => setCorrectionModalDate(null)}
          onRequestSubmitted={() => {
            setCorrectionModalDate(null);
            fetchHistory();
            if (showToast) showToast("Đã gửi đơn bổ sung công thành công!", "success");
          }}
        />
      )}
    </div>
  );
}
