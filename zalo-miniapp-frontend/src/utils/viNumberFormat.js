/**
 * Thư viện Định dạng Số & Tiền tệ Chuẩn Việt Nam (MISA / Kế toán Việt Nam)
 * - Dấu chấm (.) phân tách hàng nghìn: 1000000 -> "1.000.000"
 * - Dấu phẩy (,) phân tách phần thập phân: 0.5 -> "0,5", 22.75 -> "22,75"
 */

function toSafeNumber(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : 0;
  }
  return parseViNumberInput(val);
}

/**
 * Chuyển đổi chuỗi người dùng nhập (VD: "1.500.000", "1.500.000 đ", "0,5", "24.5", "-250.000")
 * thành số chuẩn xác để tính toán & lưu Database.
 */
export function parseViNumberInput(rawStr) {
  if (rawStr === null || rawStr === undefined || rawStr === "") return 0;
  if (typeof rawStr === "number") {
    return Number.isFinite(rawStr) ? rawStr : 0;
  }

  let s = String(rawStr)
    .replace(/[^\d.,-]/g, "")
    .trim();

  if (!s || s === "-" || s === "." || s === ",") return 0;

  const isNegative = s.startsWith("-");
  s = s.replace(/-/g, "");

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  let normalized = s;
  if (hasDot && hasComma) {
    // Chuẩn Việt Nam: 1.500.000,75 -> 1500000.75
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // Chỉ có dấu phẩy: nếu nhiều hơn 1 dấu phẩy hoặc khớp phân tách nghìn theo kiểu EN thì bỏ, ngược lại là thập phân VN
    if (/^\d{1,3}(,\d{3})+$/.test(s)) {
      normalized = s.replace(/,/g, "");
    } else {
      normalized = s.replace(/,/g, ".");
    }
  } else if (hasDot) {
    // Chỉ có dấu chấm: nếu khớp phân tách nghìn (1.000 / 1.500.000) hoặc nhiều dấu chấm -> bỏ dấu chấm
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1 || /^\d{1,3}(\.\d{3})+$/.test(s)) {
      normalized = s.replace(/\./g, "");
    } else {
      normalized = s;
    }
  }

  const parsed = Number((isNegative ? "-" : "") + normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Định dạng số theo chuẩn Việt Nam (Intl 'vi-VN'):
 * 1000000 -> "1.000.000", 0.5 -> "0,5", 22.75 -> "22,75"
 */
export function formatViNumber(num, maxDecimals = 2) {
  const safe = toSafeNumber(num);
  const rounded = Object.is(safe, -0) ? 0 : safe;
  const maxD = Math.min(6, Math.max(0, Number.isFinite(Number(maxDecimals)) ? Number(maxDecimals) : 2));
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxD
  }).format(rounded);
}

/**
 * Định dạng tiền tệ chuẩn Việt Nam (VNĐ):
 * 1500000 -> "1.500.000 đ" (hoặc "1.500.000" khi showUnit = false)
 * Không viết tắt (tr, M, K) và không dùng dấu phẩy phân tách nghìn.
 */
export function formatViCurrency(amount, showUnit = true) {
  const safe = toSafeNumber(amount);
  const rounded = Math.round(safe);
  const finalVal = Object.is(rounded, -0) ? 0 : rounded;
  const formatted = new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(finalVal);
  return showUnit ? `${formatted} đ` : formatted;
}

/**
 * Định dạng số ngày công / giờ công chuẩn Việt Nam:
 * 0 -> "0", 0.5 -> "0,5", 1 -> "1", 24.5 -> "24,5"
 */
export function formatViWorkday(days) {
  return formatViNumber(days, 2);
}

export default {
  formatViNumber,
  formatViCurrency,
  formatViWorkday,
  parseViNumberInput
};
