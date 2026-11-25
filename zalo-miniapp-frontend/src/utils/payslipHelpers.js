import { sanitizeFormula } from "./api";
import { formatViNumber, formatViWorkday } from "./viNumberFormat";
import { getMonthlyStandardWorkdays } from "./workdayUtils";

export function buildHolidayWorkSummaryLabel(slip) {
  const breakdown = Array.isArray(slip?.holidayWorkBreakdown) ? slip.holidayWorkBreakdown : [];
  const multLabels = Array.from(
    new Set(
      breakdown
        .map((b) => b?.multiplier_label || (b?.multiplier ? `x${formatViNumber(b.multiplier, 2)}` : ""))
        .filter(Boolean)
    )
  );
  if (multLabels.length > 0) {
    return `Đi làm ngày lễ (${multLabels.join(" • ")})`;
  }
  return "Đi làm ngày lễ";
}

export const ALLOWANCE_DEFS = [
  { key: "an_trua", alt: "an_ca", label: "Phụ cấp ăn trưa" },
  { key: "xang_xe", alt: "xang", label: "Phụ cấp xăng xe" },
  { key: "nha_o", alt: "doc_hai", label: "Phụ cấp nhà ở" },
  { key: "thuong_htcv", label: "Thưởng hoàn thành công việc" },
  { key: "trach_nhiem", label: "Phụ cấp trách nhiệm" },
  { key: "tiep_khach", alt: "dien_thoai", label: "Phụ cấp điện thoại / tiếp khách" }
];

const VI_WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const VI_WEEKDAYS_FULL = [
  "Chủ nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy"
];

export function formatDayWithWeekday(isoStr, fallbackLabel = "") {
  if (fallbackLabel) return fallbackLabel;
  const clean = String(isoStr || "").trim().slice(0, 10);
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return clean || "--/--";
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const wd = VI_WEEKDAYS[dt.getUTCDay()] || "";
  return `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")} (${wd})`;
}

export function formatFullDateWithWeekday(isoStr) {
  const clean = String(isoStr || "").trim().slice(0, 10);
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { ddmmyyyy: clean || "--/--/----", weekdayFull: "" };
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const weekdayFull = VI_WEEKDAYS_FULL[dt.getUTCDay()] || "";
  return {
    ddmmyyyy: `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}`,
    weekdayFull
  };
}

export function resolveDailyStatusLabelVi({ log = null, credit = 0, isSunday = false, isFutureOrTodayEmpty = false } = {}) {
  if (log?.status_label_vi) return String(log.status_label_vi);
  if (!log) {
    if (isSunday) return "Chủ nhật";
    return isFutureOrTodayEmpty ? "Chưa phát sinh" : "Nghỉ không lương";
  }
  const st = String(log.status || "").trim().toUpperCase();
  if (st === "L" || st === "HOLIDAY") return "Nghỉ lễ hưởng lương";
  if (st === "P" || st === "PAID_LEAVE") return "Nghỉ phép có lương";
  if (["KL", "KP", "V", "ABSENT", "0"].includes(st)) return isSunday ? "Chủ nhật" : "Nghỉ không lương";
  if (st === "OT") {
    if (credit >= 1) return "Đủ 1 công";
    if (credit === 0.5) return "Làm nửa công (0,5)";
    return isSunday ? "Chủ nhật" : "Tăng ca OT";
  }
  if (st === "1/OT" || st === "1" || st === "FULL" || st === "PRESENT" || credit >= 1) return "Đủ 1 công";
  if (st === "0.5" || st === "HALF" || credit === 0.5) return "Làm nửa công (0,5)";
  return isSunday ? "Chủ nhật" : "Nghỉ không lương";
}

export function getPositiveAllowances(slip) {
  if (!slip) return [];
  if (Array.isArray(slip.allowances)) {
    return slip.allowances
      .map((a, idx) => ({
        key: a.key || a.id || `alw_${idx + 1}`,
        label: a.label || a.name || `Phụ cấp ${idx + 1}`,
        name: a.name || a.label || `Phụ cấp ${idx + 1}`,
        amount: Number(a.amount) || 0
      }))
      .filter((a) => a.amount > 0);
  }
  const b = slip.allowances_breakdown || {};
  return ALLOWANCE_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    name: def.label,
    amount: Number(b[def.key] ?? (def.alt ? b[def.alt] : 0)) || 0
  })).filter((a) => a.amount > 0);
}

export function resolveLogNote(log) {
  if (!log) return "";
  if (log.attendance_note && String(log.attendance_note).trim()) {
    return String(log.attendance_note).trim();
  }
  const late = Math.max(0, Math.round(Number(log.late_minutes) || 0));
  const early = Math.max(0, Math.round(Number(log.early_leave_minutes) || 0));
  const st = String(log.status || "").toUpperCase();
  const isAdminAdjustedFull = String(log.duration_status || "").trim().toUpperCase() === "ADMIN_ADJUSTED_FULL";
  if (isAdminAdjustedFull && late === 0 && early === 0) {
    if (st === "P") return "Nghỉ phép hưởng lương (P)";
    if (st === "L") return "Nghỉ lễ hưởng lương (L)";
    return "Đúng giờ • Đủ công";
  }
  const parts = [];
  if (late > 0) parts.push(`Vào muộn ${late} phút`);
  if (early > 0) parts.push(`Ra sớm ${early} phút`);
  if (parts.length > 0) return parts.join(" • ");
  if (st === "P") return "Nghỉ phép hưởng lương (P)";
  if (st === "L") return "Nghỉ lễ hưởng lương (L)";
  if (log.check_in_time && !log.check_out_time) return "Chưa chấm công ra (Quên check-out)";
  if (st === "0" || st === "KP" || st === "V") return "Không tính công";
  return "Đúng giờ • Đủ công";
}

export function getNoteBadgeClass(noteText) {
  const lower = String(noteText || "").toLowerCase();
  if (
    lower.includes("vào muộn") ||
    lower.includes("ra sớm") ||
    lower.includes("quên check-out") ||
    lower.includes("quá ngắn")
  ) {
    return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70";
  }
  if (lower.includes("không lương") || lower.includes("vắng") || lower.includes("chưa đủ")) {
    return "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/70";
  }
  if (lower.includes("nghỉ phép") || lower.includes("nghỉ lễ") || lower.includes("ngày lễ")) {
    return "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-200 dark:border-purple-800/70";
  }
  return "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70";
}

export function buildSingleSlipCsv({
  item,
  maNv,
  thang,
  nam,
  confirmStatus,
  positiveAllowances = [],
  totalPositiveAllowance = 0,
  showAllowancesBlock = false,
  dailyRows = []
}) {
  const rows = [
    ["PHIẾU LƯƠNG & BẢNG CÔNG ĐIỆN TỬ SEDINCO", `Kỳ lương: Tháng ${thang}/${nam}`],
    ["Mã nhân viên", sanitizeFormula(maNv)],
    ["Họ và tên", sanitizeFormula(item.ho_ten || "")],
    ["Chức danh", sanitizeFormula(item.chuc_danh || "Nhân viên")],
    ["Ngày công thực tế", `${item.totalWorkDays || 0} / ${item.standardWorkDays || item.standardDays || getMonthlyStandardWorkdays(thang, nam)}`],
    ["Lương cơ bản HĐ", Number(item.baseSalary || 0)],
    ["Lương theo ngày công", Number(item.salaryByWork || 0)],
    ...(showAllowancesBlock
      ? [
          ["Tổng phụ cấp", Number(totalPositiveAllowance || 0)],
          ...positiveAllowances.map((a) => [a.label, a.amount])
        ]
      : []),
    ...(Number(item.holidayWorkAmount || 0) > 0
      ? [[buildHolidayWorkSummaryLabel(item), Number(item.holidayWorkAmount || 0)]]
      : []),
    ["Lương tăng ca (OT)", Number(item.otAmount || 0)],
    ["Thưởng thêm", Number(item.bonusAmount || 0)],
    ["Khấu trừ BHXH", -Number(item.totalInsurance || item.insuranceDeduction || 0)],
    ["Phạt đi muộn", -Number(item.latePenaltyAmount || 0)],
    ["Phạt / Khấu trừ khác", -Number(item.penaltyAmount || 0)],
    ["Trừ tạm ứng lương", -Number(item.advanceDeduction || 0)],
    ["THỰC LĨNH (NET)", Number(item.netSalary || 0)],
    ...(Number(item.carryOverDebt || item.carry_over_debt || 0) > 0
      ? [["Khoản nợ chuyển kỳ lương sau", Number(item.carryOverDebt || item.carry_over_debt || 0)]]
      : []),
    ["Trạng thái xác nhận", confirmStatus],
    [],
    ["BẢNG CÔNG CHI TIẾT TỪNG NGÀY"],
    ["Ngày", "Giờ vào", "Giờ ra", "Ngày công", "Giờ OT", "Trạng thái", "Ghi chú"]
  ];

  for (const r of dailyRows || []) {
    rows.push([
      sanitizeFormula(r.dateLabel || r.iso),
      r.log?.check_in_time ? String(r.log.check_in_time).slice(0, 5) : "--:--",
      r.log?.check_out_time ? String(r.log.check_out_time).slice(0, 5) : "--:--",
      formatViWorkday(r.credit || 0),
      Number(r.otHours || 0),
      sanitizeFormula(r.status || "0"),
      sanitizeFormula(r.note || "")
    ]);
  }

  return "\uFEFF" + rows.map((r) => r.map((c) => formatCsvCellRFC4180(c)).join(",")).join("\r\n");
}
