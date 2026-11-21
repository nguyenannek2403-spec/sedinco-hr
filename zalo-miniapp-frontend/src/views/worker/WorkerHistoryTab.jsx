import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  FilePlus2,
  MapPin,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  AlertTriangle
} from "lucide-react";
import { safeGet } from "../../utils/api";
import SmartLeaveRequestModal from "../../components/SmartLeaveRequestModal";
import { formatViWorkday, formatViNumber } from "../../utils/viNumberFormat";
import { AppButton, AppModal, StatusBadge, SkeletonList } from "../../components/ui";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function getHeatmapCellStyle(log, dayNum, isFuture, isSunday = false) {
  if (isFuture) {
    return {
      cellClass: "bg-[#F0F3FF]/60 dark:bg-slate-900/50 border-slate-200/70 dark:border-slate-800/70 text-slate-500 dark:text-slate-400",
      dotClass: "bg-slate-400 dark:bg-slate-600",
      shortCode: "",
      badgeText: "Chưa tới",
      needsCorrection: false
    };
  }
  if (!log && isSunday) {
    return {
      cellClass: "bg-[#F0F3FF] dark:bg-slate-900/50 border-slate-200 dark:border-slate-800/70 text-slate-500 dark:text-slate-300",
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

/**
 * WorkerHistoryTab — Google Stitch "Sedinco Pulse" Screen 3 (Lịch công & Bảng chấm công)
 * - Pill Month Navigator + "Chuẩn: 26 công" badge
 * - 3 KPI Summary Cards in a Row (Tổng công, Đúng giờ, Đi muộn)
 * - Heatmap Card with pulsing red dot header, 7-column grid, perforated cutout divider & 7-item legend
 * - Perforated Daily Attendance Ticket Cards ("Chi tiết ngày công gần nhất") + "Tạo giải trình ->"
 * - Bottom full-width Crimson CTA ("Xem Bảng lương & Bảng công chi tiết")
 */
export default function WorkerHistoryTab({
  currentUser,
  showToast,
  onOpenPayslip = null,
  onOpenPeriodPayslip = null
}) {
  const handleOpenPayslip = onOpenPayslip || onOpenPeriodPayslip;
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

  const stdDays = Number(summary?.standard_days || 26);
  const earnedDays = Number(summary?.total_work_days || 0);
  const pctEarned = stdDays > 0 ? Math.min(100, Math.round((earnedDays / stdDays) * 100)) : 0;

  return (
    <div className="space-y-4 pb-8">
      {/* STITCH SCREEN 3 — SECTION 1: PILL MONTH NAVIGATOR & STANDARD WORKDAYS BADGE */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-full p-1 shadow-xs">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Tháng trước"
            className="min-w-[44px] min-h-[44px] p-2 rounded-full hover:bg-[#F0F3FF] dark:hover:bg-slate-800 text-[#111C2D] dark:text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-3 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />
            <span className="text-sm font-extrabold text-[#111C2D] dark:text-white whitespace-nowrap">
              Tháng {month} / {year}
            </span>
          </div>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="Tháng sau"
            className="min-w-[44px] min-h-[44px] p-2 rounded-full hover:bg-[#F0F3FF] dark:hover:bg-slate-800 text-[#111C2D] dark:text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="px-3 py-1.5 rounded-full bg-[#FFE4E6] dark:bg-rose-950/70 border border-rose-200/80 dark:border-rose-800/60 text-xs font-extrabold text-[#B80035] dark:text-rose-300">
            Chuẩn: {formatViWorkday(stdDays)} công
          </span>
          <AppButton
            variant="secondary"
            icon={RefreshCw}
            loading={loading}
            onClick={fetchHistory}
            aria-label="Làm mới lịch công"
            className="min-w-[44px] px-2.5 py-1.5 rounded-full"
          />
        </div>
      </div>

      {/* STITCH SCREEN 3 — SECTION 2: 3 KPI SUMMARY CARDS IN A ROW */}
      {summary && (
        <div className="grid grid-cols-3 gap-2.5">
          {/* Card 1: Tổng công */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 shadow-xs flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Tổng công</span>
            <div className="my-1 flex items-baseline gap-1 font-mono">
              <span className="text-xl font-black text-[#111C2D] dark:text-white">
                {formatViWorkday(earnedDays)}
              </span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                / {formatViWorkday(stdDays)}
              </span>
            </div>
            <div className="inline-flex items-center gap-1 text-xs font-bold text-[#16A34A] dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Đạt {pctEarned}%</span>
            </div>
          </div>

          {/* Card 2: Đúng giờ */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 shadow-xs flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Đúng giờ</span>
            <div className="my-1 flex items-baseline gap-1 font-mono">
              <span className="text-xl font-black text-[#111C2D] dark:text-white">
                {formatViNumber(summary.on_time_count || 0, 0)}
              </span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">ngày</span>
            </div>
            <div className="inline-flex items-center gap-1 text-xs font-bold text-[#0051CA] dark:text-blue-300">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>OT: {formatViNumber(summary.total_ot_hours || 0)}h</span>
            </div>
          </div>

          {/* Card 3: Đi muộn */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 shadow-xs flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Đi muộn</span>
            <div className="my-1 flex items-baseline gap-1 font-mono">
              <span className="text-xl font-black text-[#E11D48] dark:text-rose-400">
                {formatViNumber(summary.late_count || 0, 0)}
              </span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">lần</span>
            </div>
            <div className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{formatViNumber(summary.total_late_minutes || 0, 0)} phút</span>
            </div>
          </div>
        </div>
      )}

      {/* STITCH SCREEN 3 — SECTION 3: CALENDAR GRID HEATMAP (7 CỘT T2 -> CN) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E11D48] shrink-0" />
            <h3 className="text-sm font-extrabold text-[#111C2D] dark:text-white tracking-tight">
              Bản đồ chấm công (Heatmap)
            </h3>
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Chạm ô ngày để bù công
          </span>
        </div>

        {/* Header Thứ */}
        <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-extrabold text-slate-500 dark:text-slate-300">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className={`py-1 ${w === "CN" ? "text-[#E11D48] dark:text-rose-400" : ""}`}
            >
              {w}
            </div>
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
                  } ${cell.isToday ? "ring-2 ring-[#E11D48] dark:ring-rose-400" : ""}`}
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

        {/* Perforated Ticket Cutout Divider */}
        <div className="sedinco-ticket-cutout">
          <div className="w-full border-t-2 border-dashed border-slate-200 dark:border-slate-700" />
        </div>

        {/* 7-Symbol Legend Bar */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
          <span className="inline-flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-[#16A34A] dark:text-emerald-300 font-black">1</span>
            <span>Đủ công</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-black">0,5</span>
            <span>Nửa công</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-black">P/L</span>
            <span>Phép / Lễ</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-[#0051CA] dark:text-blue-300 font-black">OT</span>
            <span>Tăng ca</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-[#E11D48] dark:text-rose-300 font-black">V/KP</span>
            <span>Vắng</span>
          </span>
        </div>
      </div>

      {/* STITCH SCREEN 3 — SECTION 5: BOTTOM FULL-WIDTH CRIMSON PAYSLIP CTA */}
      {typeof handleOpenPayslip === "function" && (
        <AppButton
          data-testid="history-open-payslip-btn"
          variant="primary"
          fullWidth
          icon={FileSpreadsheet}
          onClick={() => handleOpenPayslip(month, year)}
          className="min-h-[52px] rounded-xl text-xs sm:text-sm font-extrabold shadow-[0_8px_20px_-4px_rgba(225,29,72,0.3)]"
        >
          Xem Bảng lương &amp; Bảng công chi tiết T{month}/{year}
        </AppButton>
      )}

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
