import * as XLSX from "xlsx";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { formatViCurrency, formatViWorkday, formatViNumber } from "./viNumberFormat";
import { formatDayWithWeekday, getPositiveAllowances, resolveLogNote } from "./payslipHelpers";
import { getMonthlyStandardWorkdays } from "./workdayUtils";

function sanitizeSheetCell(val) {
  if (typeof val === "number") return val;
  const s = String(val ?? "");
  // Tránh công thức Excel vô ý nếu nội dung do người dùng nhập bắt đầu bằng =, +, -, @
  return /^[=+@]/.test(s) ? `'${s}` : s;
}

function getPayoutLabelVi(item, confirmStatus) {
  const payout = String(item?.payout_status || "").toUpperCase();
  if (payout === "RECEIVED" || Boolean(item?.received_at)) return "Đã nhận đủ lương";
  const paid =
    payout === "PAID" ||
    item?.employee_payment_status === "PAID" ||
    item?.payment_status === "PAID";
  if (paid) return "Đã chuyển khoản";
  if (payout === "CONFIRMED" || confirmStatus === "CONFIRMED") return "Đã đọc báo cáo lương";
  if (payout === "DISPUTED" || confirmStatus === "DISPUTED") return "Đang báo sai sót";
  if (payout === "REPORT_SENT") return "Đã gửi báo cáo — Chờ xác nhận";
  return "Bản nháp";
}

function buildDailyAttendanceRowsForExcel(item, month, year) {
  const m = Number(item?.thang || month || new Date().getMonth() + 1);
  const y = Number(item?.nam || year || new Date().getFullYear());
  const rawLogs = Array.isArray(item?.daily_logs) ? item.daily_logs : [];
  const byDate = {};
  rawLogs.forEach((log) => {
    const iso = log.record_date_iso || String(log.record_date || "").slice(0, 10);
    if (iso) byDate[iso] = log;
  });

  const daysInMonth = new Date(y, m, 0).getDate();
  const rows = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const log = byDate[iso] || null;
    const isSunday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
    const rawSt = String(log?.status || "").trim().toUpperCase();
    const credit = log
      ? Number(
          log.work_credit ??
            (rawSt === "1" || rawSt === "1/OT" || rawSt === "P" || rawSt === "L"
              ? 1
              : rawSt === "0.5"
                ? 0.5
                : 0)
        )
      : 0;
    const otHours = Number(log?.ot_hours_applied ?? log?.ot_hours) || 0;
    const note = log
      ? resolveLogNote(log)
      : isSunday
        ? "Nghỉ cuối tuần (CN)"
        : "Không có dữ liệu chấm công";

    rows.push({
      dateLabel: formatDayWithWeekday(iso, log?.date_label),
      status: log ? log.status || "0" : isSunday ? "CN" : "V",
      checkIn: log?.check_in_time ? String(log.check_in_time).slice(0, 5) : "--:--",
      checkOut: log?.check_out_time ? String(log.check_out_time).slice(0, 5) : "--:--",
      credit,
      otHours,
      dailyEarned: Number(log?.daily_earned_amount) || 0,
      note
    });
  }
  return rows;
}

/**
 * Tạo đối tượng Workbook SheetJS (.xlsx) phiếu lương + bảng chấm công từng ngày.
 */
export function buildEmployeeSalaryWorkbook(item, { month, year, dailyRows = null } = {}) {
  if (!item) {
    throw new Error("Thiếu dữ liệu phiếu lương để xuất Excel.");
  }

  const m = Number(item.thang || month || new Date().getMonth() + 1);
  const y = Number(item.nam || year || new Date().getFullYear());
  const maNv = String(item.ma_nv || item.id_nhan_vien || "NV").trim();
  const confirmStatus = item.salary_confirm_status || "PENDING";
  const positiveAllowances = getPositiveAllowances(item);
  const totalPositiveAllowance = Number(item.totalAllowance ?? item.total_allowance ?? 0);
  const statusVi = getPayoutLabelVi(item, confirmStatus);

  const slipAoa = [
    ["CÔNG TY CỔ PHẦN SEDINCO", "", "PHIẾU LƯƠNG CHI TIẾT ĐIỆN TỬ"],
    [`Kỳ lương: Tháng ${m}/${y}`, "", `Trạng thái: ${statusVi}`],
    [],
    ["THÔNG TIN NHÂN SỰ"],
    ["Mã nhân viên", sanitizeSheetCell(maNv)],
    ["Họ và tên", sanitizeSheetCell(item.ho_ten || "")],
    ["Chức danh", sanitizeSheetCell(item.chuc_danh || "Nhân viên")],
    ["Bộ phận", sanitizeSheetCell(item.department || "Khối Công trình")],
    [
      "Ngày công thực tế / chuẩn",
      `${formatViWorkday(item.totalWorkDays || 0)} / ${formatViWorkday(item.standardWorkDays || item.standardDays || getMonthlyStandardWorkdays(m, y))} công`
    ],
    ["Tổng giờ tăng ca (OT)", `${formatViNumber(item.totalOtHours || 0)} giờ`],
    [],
    ["HẠNG MỤC THU NHẬP & KHẤU TRỪ", "SỐ TIỀN (VNĐ)", "DIỄN GIẢI"],
    [
      "Lương cơ bản hợp đồng",
      Math.round(Number(item.baseSalary || 0)),
      formatViCurrency(item.baseSalary || 0)
    ],
    [
      "Lương chính theo ngày công",
      Math.round(Number(item.salaryByWork || 0)),
      `${formatViWorkday(item.totalWorkDays || 0)} công`
    ]
  ];

  if (positiveAllowances.length > 0 && totalPositiveAllowance > 0) {
    slipAoa.push([
      "Tổng phụ cấp theo công",
      Math.round(totalPositiveAllowance),
      `${positiveAllowances.length} khoản phụ cấp`
    ]);
    positiveAllowances.forEach((alw) => {
      slipAoa.push([
        `  + ${sanitizeSheetCell(alw.label || alw.name)}`,
        Math.round(Number(alw.amount || 0)),
        formatViCurrency(alw.amount || 0)
      ]);
    });
  }

  slipAoa.push(
    [
      "Lương tăng ca (OT)",
      Math.round(Number(item.otAmount || 0)),
      `${formatViNumber(item.totalOtHours || 0)} giờ OT`
    ],
    ["Thưởng thêm", Math.round(Number(item.bonusAmount || 0)), sanitizeSheetCell(item.adjustment_note || "")],
    [
      "Khấu trừ BHXH",
      -Math.round(Number(item.insuranceDeduction || item.totalInsurance || 0)),
      `${formatViNumber(item.insuranceRatePercent ?? 10.5)}%`
    ],
    [
      "Phạt đi muộn / về sớm",
      -Math.round(Number(item.latePenaltyAmount || 0)),
      `${Number(item.lateOccurrences || 0)} lần (${Number(item.totalLateMinutes || 0)} phút)`
    ],
    ["Phạt / Khấu trừ khác", -Math.round(Number(item.penaltyAmount || 0)), ""],
    ["Trừ tạm ứng lương", -Math.round(Number(item.advanceDeduction || 0)), ""],
    ["THỰC LĨNH (NET)", Math.round(Number(item.netSalary || 0)), formatViCurrency(item.netSalary || 0)]
  );

  if (Number(item.carryOverDebt || item.carry_over_debt || 0) > 0) {
    slipAoa.push([
      "Nợ chuyển kỳ sau",
      Math.round(Number(item.carryOverDebt || item.carry_over_debt || 0)),
      formatViCurrency(item.carryOverDebt || item.carry_over_debt || 0)
    ]);
  }

  const wsSlip = XLSX.utils.aoa_to_sheet(slipAoa);
  wsSlip["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 28 }];

  const resolvedDailyRows = Array.isArray(dailyRows) && dailyRows.length > 0
    ? dailyRows.map((r) => ({
        dateLabel: r.dateLabel || formatDayWithWeekday(r.iso, r.log?.date_label),
        status: r.status || r.log?.status || "0",
        checkIn: r.log?.check_in_time ? String(r.log.check_in_time).slice(0, 5) : "--:--",
        checkOut: r.log?.check_out_time ? String(r.log.check_out_time).slice(0, 5) : "--:--",
        credit: Number(r.credit ?? r.log?.work_credit ?? 0),
        otHours: Number(r.otHours ?? r.log?.ot_hours_applied ?? r.log?.ot_hours ?? 0),
        dailyEarned: Number(r.log?.daily_earned_amount ?? 0),
        note: r.note || (r.log ? resolveLogNote(r.log) : "")
      }))
    : buildDailyAttendanceRowsForExcel(item, m, y);

  const dailyAoa = [
    [`BẢNG CHẤM CÔNG TỪNG NGÀY — ${sanitizeSheetCell(item.ho_ten || maNv)} (${maNv}) • THÁNG ${m}/${y}`],
    [],
    ["Ngày", "Trạng thái", "Giờ vào", "Giờ ra", "Công quy đổi", "Giờ OT", "Lương ngày (VNĐ)", "Ghi chú chi tiết"],
    ...resolvedDailyRows.map((row) => [
      sanitizeSheetCell(row.dateLabel),
      sanitizeSheetCell(row.status),
      row.checkIn,
      row.checkOut,
      row.credit,
      row.otHours,
      Math.round(row.dailyEarned),
      sanitizeSheetCell(row.note)
    ])
  ];

  const wsDaily = XLSX.utils.aoa_to_sheet(dailyAoa);
  wsDaily["!cols"] = [
    { wch: 16 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 10 },
    { wch: 18 },
    { wch: 36 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSlip, "Phieu_Luong");
  XLSX.utils.book_append_sheet(wb, wsDaily, "Bang_Cong_Ngay");

  const filename = `Phieu_Luong_T${String(m).padStart(2, "0")}_${y}_${maNv}.xlsx`;
  return { wb, filename };
}

/**
 * Xuất trực tiếp file Excel (.xlsx) phiếu lương chi tiết cá nhân.
 */
export async function exportEmployeeSalaryExcel(item, options = {}) {
  const { wb, filename } = buildEmployeeSalaryWorkbook(item, options);
  const rawBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const bytes = new Uint8Array(rawBuffer);

  await zmpAdapter.saveFile({
    filename,
    content: bytes,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  return { filename, byteLength: bytes.byteLength };
}
