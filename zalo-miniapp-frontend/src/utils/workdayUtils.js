/**
 * workdayUtils — Tiện ích Ngày công chuẩn tự động theo tháng (GMT+7)
 * & Quy tắc màu sắc Heatmap chấm công thống nhất toàn ứng dụng (V46)
 */

const VI_WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/**
 * Chuẩn hóa chuỗi ngày về dạng thuần "YYYY-MM-DD" theo múi giờ Việt Nam (GMT+7).
 * Khắc phục triệt để lỗi lệch 1 ngày khi MySQL DATE / Date.toISOString() trả về chuỗi UTC ("...T17:00:00.000Z").
 */
export function normalizePureIsoDate(input) {
  if (!input) return "";
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(input);
  }
  const trimmed = String(input).trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.includes("T") || /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(parsed);
    }
  }
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

/**
 * Ngày hiện tại ở Việt Nam (GMT+7) định dạng "YYYY-MM-DD".
 */
export function getVietnamTodayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function getDaysInMonth(month, year) {
  const now = new Date();
  const m = parseInt(month, 10) || now.getMonth() + 1;
  const y = parseInt(year, 10) || now.getFullYear();
  if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 1900 || y > 2300) {
    return 30;
  }
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function countSundaysInMonth(month, year) {
  const now = new Date();
  const m = parseInt(month, 10) || now.getMonth() + 1;
  const y = parseInt(year, 10) || now.getFullYear();
  const totalDays = getDaysInMonth(m, y);
  let sundays = 0;
  for (let d = 1; d <= totalDays; d++) {
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0) {
      sundays += 1;
    }
  }
  return sundays;
}

/**
 * Công thức ngày công chuẩn theo tháng: Tổng số ngày trong tháng - Số ngày Chủ nhật.
 * Ví dụ: Tháng 11/2026 (30 ngày - 5 Chủ nhật) = 25 công chuẩn.
 */
export function getMonthlyStandardWorkdays(month, year) {
  const totalDays = getDaysInMonth(month, year);
  const sundays = countSundaysInMonth(month, year);
  return Math.max(1, totalDays - sundays);
}

export function isSundayDay(day, month, year) {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  const d = parseInt(day, 10);
  if (!m || !y || !d) return false;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

export function formatViWeekdayShort(isoDateStr) {
  const iso = normalizePureIsoDate(isoDateStr);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return VI_WEEKDAYS[dt.getUTCDay()] || "";
}

/**
 * Bộ quy tắc màu sắc Heatmap thống nhất toàn ứng dụng (WorkerHistoryTab + SalarySlipModal):
 * - Xanh lá (Đủ công): work_credit >= 1 (không phải P/KP/KL/0/V) hoặc status thuộc ['1', '1/OT', 'FULL', 'PRESENT', 'L', 'HOLIDAY', 'OT']
 * - Xanh dương (Nửa công / Nghỉ phép có lương): status thuộc ['P', 'PAID_LEAVE', '0.5', 'HALF'] hoặc work_credit === 0.5
 * - Đỏ dịu (Vắng không phép): Ngày làm việc T2–T7 đã qua (< today_GMT7) không có công hoặc status thuộc ['0', 'KP', 'KL', 'V', 'ABSENT']
 * - Xám trung tính: Ngày Chủ nhật không tăng ca ('CN') & ngày hiện tại chưa chấm công / ngày tương lai
 */
export function resolveHeatmapCellMeta({ log = null, isoDate = "", todayIso = getVietnamTodayIso(), isSunday = false } = {}) {
  const isFuture = Boolean(isoDate && todayIso && isoDate > todayIso);
  const isToday = Boolean(isoDate && todayIso && isoDate === todayIso);
  const status = String(log?.status || "").trim().toUpperCase();
  const credit = Number(log?.work_credit ?? 0);
  const otHours = Number(log?.ot_hours_applied ?? log?.ot_hours ?? 0);
  const isAdminAdjustedFull = String(log?.duration_status || "").trim().toUpperCase() === "ADMIN_ADJUSTED_FULL";
  const forgotOut = !isAdminAdjustedFull && Boolean(log?.check_in_time && !log?.check_out_time);
  const lateMins = isAdminAdjustedFull ? 0 : (Number(log?.late_minutes) || 0);
  const earlyMins = isAdminAdjustedFull ? 0 : (Number(log?.early_leave_minutes) || 0);
  const hasLateOrEarly = Boolean(
    log && !isAdminAdjustedFull && (lateMins > 0 || earlyMins > 0 || forgotOut)
  );

  // 1. Nghỉ phép có lương (P) -> Xanh dương (Sky) theo bảng chú giải chung
  if (status === "P" || status === "PAID_LEAVE") {
    return {
      category: "PAID_LEAVE",
      colorName: "blue",
      cellClass: "bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-700 text-sky-800 dark:text-sky-200",
      dotClass: "bg-sky-500",
      shortCode: "P",
      badgeText: "Nghỉ phép có lương (P)",
      credit: credit > 0 ? credit : 1,
      hasLateOrEarly: false,
      needsCorrection: false
    };
  }

  // 2. Nghỉ không lương / Vắng không phép / 0 công rõ ràng -> Đỏ dịu
  if (["0", "KP", "KL", "V", "ABSENT"].includes(status)) {
    return {
      category: "ABSENT",
      colorName: "red",
      cellClass: "bg-rose-50 dark:bg-rose-950/55 border-rose-200 dark:border-rose-700 text-rose-700 dark:text-rose-200",
      dotClass: "bg-rose-500",
      shortCode: status === "0" ? "KP" : status,
      badgeText: status === "KL" ? "Nghỉ không lương (KL)" : "Vắng không phép / 0 công",
      credit: 0,
      hasLateOrEarly: false,
      needsCorrection: true
    };
  }

  // 3. Đủ công / Nghỉ lễ hưởng lương / Tăng ca (Green - Xanh lá thống nhất)
  if (
    credit >= 1 ||
    ["1", "1/OT", "FULL", "PRESENT", "L", "HOLIDAY", "OT"].includes(status) ||
    (isSunday && log && (credit > 0 || otHours > 0))
  ) {
    const shortCode =
      status === "1/OT" || status === "OT"
        ? "OT"
        : status === "L" || status === "HOLIDAY"
        ? "L"
        : "1";
    const badgeText =
      shortCode === "L"
        ? "Nghỉ lễ hưởng lương (L)"
        : shortCode === "OT"
        ? `Tăng ca (${otHours || 0}h OT)`
        : forgotOut
        ? "Đủ công / Thiếu giờ ra"
        : "Đủ công (1,0)";

    return {
      category: "FULL",
      colorName: "green",
      cellClass: "bg-emerald-50 dark:bg-emerald-950/65 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200",
      dotClass: "bg-emerald-500",
      shortCode,
      badgeText,
      credit: credit > 0 ? credit : shortCode === "OT" && status === "OT" ? 0 : 1,
      hasLateOrEarly,
      needsCorrection: forgotOut
    };
  }

  // 4. Nửa công (0.5 / HALF) -> Xanh dương (Sky)
  if (credit === 0.5 || status === "0.5" || status === "HALF") {
    return {
      category: "HALF",
      colorName: "blue",
      cellClass: "bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-700 text-sky-800 dark:text-sky-200",
      dotClass: "bg-sky-500",
      shortCode: "0,5",
      badgeText: "Nửa công (0,5)",
      credit: 0.5,
      hasLateOrEarly,
      needsCorrection: true
    };
  }

  // 5. Ngày Chủ nhật mặc định nghỉ tuần (CN) -> Xám trung tính
  if (isSunday || status === "CN") {
    return {
      category: "SUNDAY",
      colorName: "gray",
      cellClass: "bg-slate-100/80 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400",
      dotClass: "bg-slate-400",
      shortCode: "CN",
      badgeText: "Nghỉ cuối tuần (CN)",
      credit: 0,
      hasLateOrEarly: false,
      needsCorrection: false
    };
  }

  // 6. Ngày tương lai hoặc hôm nay chưa có log -> Xám nhạt trung tính
  if (isFuture || (isToday && !log)) {
    return {
      category: "FUTURE",
      colorName: "gray",
      cellClass: "bg-slate-50/70 dark:bg-slate-900/50 border-slate-200/70 dark:border-slate-800 text-slate-400 dark:text-slate-500",
      dotClass: "bg-slate-400",
      shortCode: isToday ? "·" : "",
      badgeText: isToday ? "Chưa chấm công hôm nay" : "Chưa tới ngày",
      credit: 0,
      hasLateOrEarly: false,
      needsCorrection: false
    };
  }

  // 7. Các ngày làm việc T2–T7 đã qua (< today_GMT7) chưa có công -> Đỏ dịu
  return {
    category: "ABSENT",
    colorName: "red",
    cellClass: "bg-rose-50 dark:bg-rose-950/55 border-rose-200 dark:border-rose-700 text-rose-700 dark:text-rose-200",
    dotClass: "bg-rose-500",
    shortCode: "V",
    badgeText: "Vắng / Chưa chấm công",
    credit: 0,
    hasLateOrEarly: false,
    needsCorrection: true
  };
}
