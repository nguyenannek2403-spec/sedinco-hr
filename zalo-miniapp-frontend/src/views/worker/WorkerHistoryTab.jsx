import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  FilePlus2,
  MapPin,
  UserCheck,
  FileSpreadsheet
} from "lucide-react";
import { safeGet } from "../../utils/api";
import SmartLeaveRequestModal from "../../components/SmartLeaveRequestModal";
import { getAttendanceStatusInfo } from "../../utils/viLabels";
import { formatViWorkday, formatViNumber } from "../../utils/viNumberFormat";
import { AppButton, AppModal, StatusBadge, SkeletonList } from "../../components/ui";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function getHeatmapCellStyle(log, dayNum, isFuture, isSunday = false) {
  if (isFuture) {
    return {
      cellClass: "bg-slate-100 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800/70 text-slate-500 dark:text-slate-400",
      dotClass: "bg-slate-400 dark:bg-slate-600",
      shortCode: "",
      badgeText: "Chưa tới",
      needsCorrection: false
    };
  }
  if (!log && isSunday) {
    return {
      cellClass: "bg-slate-100 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800/70 text-slate-500 dark:text-slate-300",
      dotClass: "bg-slate-400 dark:bg-slate-500",
      shortCode: "CN",
      badgeText: "Cuối tuần",
      needsCorrection: false
    };
  }
  if (!log) {
    return {
      cellClass: "bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200",
      dotClass: "bg-rose-500",
      shortCode: "V",
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
      cellClass: "bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-500/50 text-purple-700 dark:text-purple-200",
      dotClass: "bg-purple-500 dark:bg-purple-400",
      shortCode: st,
      badgeText: st === "L" ? "Nghỉ lễ (L)" : "Nghỉ phép (P)",
      needsCorrection: false
    };
  }
  if (st.includes("OT")) {
    return {
      cellClass: "bg-blue-50 dark:bg-blue-950/70 border-blue-200 dark:border-blue-500/60 text-blue-700 dark:text-blue-200",
      dotClass: "bg-blue-500 dark:bg-blue-400",
      shortCode: st === "1/OT" ? "1/OT" : "OT",
      badgeText: `Tăng ca (${log.ot_hours || 0}h OT)`,
      needsCorrection: forgotOut
    };
  }
  if (st === "0" || st === "V" || st === "KP") {
    return {
      cellClass: "bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-500/60 text-rose-700 dark:text-rose-200",
      dotClass: "bg-rose-500",
      shortCode: st === "0" ? "KP" : st,
      badgeText: "Vắng không phép / Thiếu công",
      needsCorrection: true
    };
  }
  if (forgotOut || st === "0.5" || isLate || isEarly) {
    return {
      cellClass: "bg-amber-50 dark:bg-amber-950/65 border-amber-200 dark:border-amber-500/60 text-amber-800 dark:text-amber-200",
      dotClass: "bg-amber-500 dark:bg-amber-400",
      shortCode: st === "0.5" ? "0.5" : (st || "1"),
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
      cellClass: "bg-emerald-50 dark:bg-emerald-950/65 border-emerald-200 dark:border-emerald-500/50 text-emerald-700 dark:text-emerald-200",
      dotClass: "bg-emerald-500 dark:bg-emerald-400",
      shortCode: "1",
      badgeText: "Đủ công (1.0)",
      needsCorrection: false
    };
  }
  return {
    cellClass: "bg-slate-100 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200",
    dotClass: "bg-slate-500",
    shortCode: st || "·",
    badgeText: st || "Khác",
    needsCorrection: false
  };
}

export default function WorkerHistoryTab({ currentUser, showToast, onOpenPayslip = null }) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedDayDetail, setSelectedDayDetail] = useState(null);
  const [correctionModalDate, setCorrectionModalDate] = useState(null);

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
      const style = getHeatmapCellStyle(log, d, isFuture, isSunday);
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
    <div className="pb-28 space-y-4">
      {/* ZaUI Month Navigator Hero */}
      <div className="bg-[#0055D4] bg-gradient-to-br from-[#0055D4] via-[#0068FF] to-[#0284C7] dark:bg-slate-900 dark:from-blue-950 dark:via-slate-900 dark:to-teal-950 text-white rounded-b-[28px] px-4 pt-2 pb-10 flex items-center justify-between shadow-md">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Tháng trước"
          className="min-w-[44px] min-h-[44px] p-2 bg-blue-900/45 hover:bg-blue-900/65 dark:bg-slate-800/90 dark:hover:bg-slate-700 border border-white/25 text-white rounded-full flex items-center justify-center cursor-pointer transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <div className="text-xs font-semibold text-blue-100">Lịch công Heatmap</div>
          <div className="text-base sm:text-lg font-extrabold text-white">Tháng {month} / {year}</div>
        </div>

        <button
          type="button"
          onClick={nextMonth}
          aria-label="Tháng sau"
          className="min-w-[44px] min-h-[44px] p-2 bg-blue-900/45 hover:bg-blue-900/65 dark:bg-slate-800/90 dark:hover:bg-slate-700 border border-white/25 text-white rounded-full flex items-center justify-center cursor-pointer transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Floating KPI Summary Card */}
      {summary && (
        <div className="zaui-floating-card mx-3.5 bg-white dark:bg-slate-900 border border-slate-100/90 dark:border-slate-800 rounded-2xl p-3.5 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-emerald-50/75 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60 rounded-xl p-2.5 text-center">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Ngày công</div>
              <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">{formatViWorkday(summary.total_work_days || 0)}</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">/ {formatViWorkday(summary.standard_days || 26)} công</div>
            </div>
            <div className="bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 rounded-xl p-2.5 text-center">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Tăng ca OT</div>
              <div className="text-lg font-extrabold text-[#0068FF] dark:text-blue-300 mt-0.5">{formatViNumber(summary.total_ot_hours || 0)}h</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">ngoài giờ</div>
            </div>
            <div className="bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 rounded-xl p-2.5 text-center">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Nghỉ phép</div>
              <div className="text-lg font-extrabold text-indigo-700 dark:text-indigo-300 mt-0.5">{formatViWorkday(summary.total_leave_days || 0)}</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">hưởng lương</div>
            </div>
          </div>

          <div className="zaui-ticket-divider" />

          <div className="space-y-2 text-xs">
            {summary.effective_shift_start && summary.effective_shift_end && (
              <div className="text-slate-700 dark:text-slate-200 font-medium">
                Ca làm việc của bạn hôm nay:{" "}
                <strong className="text-slate-900 dark:text-white">
                  {summary.effective_shift_start} – {summary.effective_shift_end}
                </strong>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 rounded-xl px-2.5 py-2">
                <span className="text-xs text-slate-600 dark:text-slate-300 block">Đúng giờ tháng này</span>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  {summary.on_time_count || 0} ngày
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 rounded-xl px-2.5 py-2">
                <span className="text-xs text-slate-600 dark:text-slate-300 block">Đi trễ tháng này</span>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                  {summary.late_count || 0} lần ({summary.total_late_minutes || 0} phút)
                </span>
              </div>
            </div>

            {typeof onOpenPayslip === "function" && (
              <AppButton
                data-testid="history-open-payslip-btn"
                variant="primary"
                fullWidth
                icon={FileSpreadsheet}
                onClick={() => onOpenPayslip(month, year)}
                className="text-xs"
              >
                Xem Bảng lương &amp; Bảng công chi tiết T{month}/{year}
              </AppButton>
            )}
          </div>
        </div>
      )}

      <div className="px-3.5 space-y-4">
      {/* CALENDAR GRID HEATMAP (7 CỘT T2 -> CN) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100/90 dark:border-slate-800 rounded-2xl p-4 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5 uppercase">
            <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>Chạm vào từng ô ngày để xem &amp; bù công</span>
          </h3>
          <AppButton
            variant="secondary"
            icon={RefreshCw}
            loading={loading}
            onClick={fetchHistory}
            aria-label="Làm mới lịch công"
            className="min-w-[44px] px-3"
          />
        </div>

        {/* Chú thích màu + Ký hiệu Heatmap (hỗ trợ người lớn tuổi & mù màu) */}
        <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>1: Đủ công</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 dark:bg-amber-400"></span>0.5/Muộn</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 dark:bg-purple-400"></span>P/L: Phép, Lễ</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 dark:bg-blue-400"></span>OT: Tăng ca</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>V/KP: Vắng</span>
        </div>

        {/* Header Thứ */}
        <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-black text-slate-500 dark:text-slate-300">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>

        {/* Lưới Ngày */}
        {loading ? (
          <SkeletonList rows={3} label="Đang tải Heatmap tháng..." />
        ) : error ? (
          <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <AppButton
              variant="danger"
              onClick={fetchHistory}
              className="text-xs px-3 py-1.5 shrink-0"
            >
              Thử lại
            </AppButton>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell) => {
              if (cell.empty) {
                return <div key={cell.key} className="min-h-[48px] rounded-xl" />;
              }
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDayDetail(cell)}
                  aria-label={`Ngày ${cell.dayNum} tháng ${month}: ${cell.style.badgeText}`}
                  className={`min-h-[48px] py-1 px-0.5 rounded-xl border flex flex-col items-center justify-center relative transition active:scale-95 cursor-pointer ${
                    cell.style.cellClass
                  } ${cell.isToday ? "ring-2 ring-blue-400" : ""}`}
                >
                  <span className="text-xs font-black leading-none">{cell.dayNum}</span>
                  <span className="text-xs font-extrabold leading-tight mt-0.5">
                    {cell.style.shortCode || "·"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* BẢNG ĐỐI CHIẾU CÔNG TỪNG NGÀY — ZAUI APPOINTMENT CARDS */}
      {logs.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Bảng đối chiếu công từng ngày ({logs.length} ngày)
            </h4>
            <span className="text-xs text-[#0068FF] dark:text-blue-400 font-semibold">
              Chạm để giải trình công
            </span>
          </div>
          <div className="space-y-2.5">
            {logs.map((day, idx) => {
              const iso = String(day.record_date || "").slice(0, 10);
              const style = getHeatmapCellStyle(day, idx, false);
              const statusInfo = getAttendanceStatusInfo(day.status);
              const otHours = Number(day.ot_hours) || 0;
              const lateMinutes = Number(day.late_minutes) || 0;
              const dayNumLabel = iso.slice(8, 10) || "--";
              const monthLabel = iso.slice(5, 7) || String(month);
              return (
                <button
                  key={iso || idx}
                  type="button"
                  onClick={() => setSelectedDayDetail({ isoDate: iso, dayNum: iso.slice(-2), log: day, style })}
                  className="perf-list-item w-full text-left bg-white dark:bg-slate-900 border border-slate-100/90 dark:border-slate-800 rounded-2xl p-3.5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] hover:border-blue-300 dark:hover:border-blue-500/40 transition cursor-pointer space-y-2.5"
                >
                  <div className="flex items-start gap-3">
                    {/* Left Rounded Date Badge */}
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200/80 dark:border-blue-500/30 flex flex-col items-center justify-center shrink-0">
                      <span className="text-sm font-extrabold text-[#0068FF] dark:text-blue-300 leading-none">{dayNumLabel}</span>
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-0.5">T{monthLabel}</span>
                    </div>

                    {/* Center Shift Info */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">{iso}</span>
                        <StatusBadge type="attendance" status={day.status} />
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-3">
                        <span>
                          Vào:{" "}
                          <strong className="text-slate-900 dark:text-white font-mono">
                            {day.check_in_time ? String(day.check_in_time).slice(0, 5) : "--:--"}
                          </strong>
                        </span>
                        <span>
                          Ra:{" "}
                          <strong className="text-slate-900 dark:text-white font-mono">
                            {day.check_out_time ? String(day.check_out_time).slice(0, 5) : "--:--"}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="zaui-ticket-divider !my-2" />

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                        {statusInfo.creditText}
                      </span>
                      {otHours > 0 && (
                        <span className="font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 px-2.5 py-0.5 rounded-full">
                          +{otHours}h tăng ca
                        </span>
                      )}
                      {(() => {
                        const earlyMinutes = Number(day.early_leave_minutes) || 0;
                        const noteStr = day.attendance_note || "";
                        const hasIssueNote =
                          lateMinutes > 0 ||
                          earlyMinutes > 0 ||
                          noteStr.toLowerCase().includes("vào muộn") ||
                          noteStr.toLowerCase().includes("ra sớm") ||
                          noteStr.toLowerCase().includes("quên check-out") ||
                          noteStr.toLowerCase().includes("quá ngắn");
                        if (!hasIssueNote) return null;
                        const displayNote =
                          noteStr ||
                          [
                            lateMinutes > 0 ? `Vào muộn ${lateMinutes} phút` : "",
                            earlyMinutes > 0 ? `Ra sớm ${earlyMinutes} phút` : ""
                          ]
                            .filter(Boolean)
                            .join(" • ");
                        return (
                          <span className="font-semibold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70 px-2.5 py-0.5 rounded-full">
                            {displayNote}
                          </span>
                        );
                      })()}
                    </div>
                    {day.location_name && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-[#0068FF] dark:text-blue-400 shrink-0" />
                        <span className="break-words">{day.location_name}</span>
                      </div>
                    )}
                    {day.proxy_by && (
                      <div className="text-xs text-[#0068FF] dark:text-blue-300 flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>Chấm công hộ</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      </div>

      {/* MODAL CHI TIẾT 1 NGÀY + NÚT BỔ SUNG CÔNG 1 CHẠM */}
      <AppModal
        open={Boolean(selectedDayDetail)}
        onClose={() => setSelectedDayDetail(null)}
        title={selectedDayDetail?.isoDate || ""}
        subtitle="Chi tiết công ngày"
        maxWidthClass="max-w-sm"
        footer={
          <div className="space-y-2">
            {selectedDayDetail && !selectedDayDetail.isFuture && (
              <AppButton
                variant="warning"
                fullWidth
                icon={FilePlus2}
                onClick={() => {
                  const iso = selectedDayDetail.isoDate;
                  const existingLog = selectedDayDetail.log;
                  setSelectedDayDetail(null);
                  setCorrectionModalDate({ iso, log: existingLog });
                }}
              >
                Gửi đơn bổ sung công cho ngày này
              </AppButton>
            )}
            <AppButton
              variant="secondary"
              fullWidth
              onClick={() => setSelectedDayDetail(null)}
            >
              Đóng / Quay lại
            </AppButton>
          </div>
        }
      >
        {selectedDayDetail && (
          <div className="p-5 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-700 dark:text-slate-300 font-semibold">{selectedDayDetail.style.badgeText}</span>
              <StatusBadge type="attendance" status={selectedDayDetail.log?.status || selectedDayDetail.style.shortCode || "0"} />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400 block mb-0.5">Giờ vào ca</span>
                <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  {selectedDayDetail.log?.check_in_time ? String(selectedDayDetail.log.check_in_time).slice(0, 5) : "--:--"}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400 block mb-0.5">Giờ ra ca</span>
                <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  {selectedDayDetail.log?.check_out_time ? String(selectedDayDetail.log.check_out_time).slice(0, 5) : "--:--"}
                </span>
              </div>
            </div>

            {selectedDayDetail.log?.attendance_note && (
              <div
                className={`p-3 rounded-2xl border text-xs font-semibold ${
                  selectedDayDetail.log.attendance_note.toLowerCase().includes("vào muộn") ||
                  selectedDayDetail.log.attendance_note.toLowerCase().includes("ra sớm") ||
                  selectedDayDetail.log.attendance_note.toLowerCase().includes("quên check-out") ||
                  selectedDayDetail.log.attendance_note.toLowerCase().includes("quá ngắn")
                    ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70"
                    : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60"
                }`}
              >
                {selectedDayDetail.log.attendance_note}
              </div>
            )}

            {selectedDayDetail.log?.location_name && (
              <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <MapPin size={15} className="text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="break-words">{selectedDayDetail.log.location_name}</span>
              </div>
            )}

            {selectedDayDetail.log?.proxy_by && (
              <div className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded-2xl border border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-200 space-y-0.5">
                <strong className="block text-xs">Chấm công hộ bởi {selectedDayDetail.log.proxy_by}</strong>
                {selectedDayDetail.log.proxy_note && (
                  <span className="text-xs block">{selectedDayDetail.log.proxy_note}</span>
                )}
              </div>
            )}

            {selectedDayDetail.log?.field_note && (
              <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-2xl border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200">
                <strong className="block text-xs mb-0.5">Ghi chú công trình:</strong>
                <span>{selectedDayDetail.log.field_note}</span>
              </div>
            )}
          </div>
        )}
      </AppModal>

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
