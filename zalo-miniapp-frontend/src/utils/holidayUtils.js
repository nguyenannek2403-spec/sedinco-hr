/**
 * Tiện ích xử lý Ngày Lễ & Đơn Xin Nghỉ Thông Minh (Sedinco HR)
 * Căn cứ pháp lý: Điều 112 Bộ luật Lao động 2019 — 11 ngày nghỉ lễ hưởng nguyên lương cho Doanh nghiệp Tư nhân (2026–2030)
 * Lịch lễ chính thức được lấy từ Backend (/api/holidays) theo cấu hình doanh nghiệp.
 */

const VIETNAM_PRIVATE_HOLIDAYS_FALLBACK = [
  // 2026 (11 ngày)
  { start_date: "2026-01-01", end_date: "2026-01-01", name: "Tết Dương lịch (2026)", rate: 3.0 },
  { start_date: "2026-02-16", end_date: "2026-02-20", name: "Tết Nguyên Đán Bính Ngọ", rate: 3.0 },
  { start_date: "2026-04-26", end_date: "2026-04-26", name: "Giỗ Tổ Hùng Vương (10/3 AL)", rate: 3.0 },
  { start_date: "2026-04-30", end_date: "2026-04-30", name: "Ngày Chiến thắng 30/4", rate: 3.0 },
  { start_date: "2026-05-01", end_date: "2026-05-01", name: "Quốc tế Lao động 1/5", rate: 3.0 },
  { start_date: "2026-09-01", end_date: "2026-09-02", name: "Quốc khánh 2/9", rate: 3.0 },
  // 2027 (11 ngày)
  { start_date: "2027-01-01", end_date: "2027-01-01", name: "Tết Dương lịch (2027)", rate: 3.0 },
  { start_date: "2027-02-05", end_date: "2027-02-09", name: "Tết Nguyên Đán Đinh Mùi", rate: 3.0 },
  { start_date: "2027-04-16", end_date: "2027-04-16", name: "Giỗ Tổ Hùng Vương (10/3 AL)", rate: 3.0 },
  { start_date: "2027-04-30", end_date: "2027-04-30", name: "Ngày Chiến thắng 30/4", rate: 3.0 },
  { start_date: "2027-05-01", end_date: "2027-05-01", name: "Quốc tế Lao động 1/5", rate: 3.0 },
  { start_date: "2027-09-02", end_date: "2027-09-03", name: "Quốc khánh 2/9", rate: 3.0 },
  // 2028 (11 ngày)
  { start_date: "2028-01-01", end_date: "2028-01-01", name: "Tết Dương lịch (2028)", rate: 3.0 },
  { start_date: "2028-01-25", end_date: "2028-01-29", name: "Tết Nguyên Đán Mậu Thân", rate: 3.0 },
  { start_date: "2028-04-04", end_date: "2028-04-04", name: "Giỗ Tổ Hùng Vương (10/3 AL)", rate: 3.0 },
  { start_date: "2028-04-30", end_date: "2028-04-30", name: "Ngày Chiến thắng 30/4", rate: 3.0 },
  { start_date: "2028-05-01", end_date: "2028-05-01", name: "Quốc tế Lao động 1/5", rate: 3.0 },
  { start_date: "2028-09-01", end_date: "2028-09-02", name: "Quốc khánh 2/9", rate: 3.0 },
  // 2029 (11 ngày)
  { start_date: "2029-01-01", end_date: "2029-01-01", name: "Tết Dương lịch (2029)", rate: 3.0 },
  { start_date: "2029-02-12", end_date: "2029-02-16", name: "Tết Nguyên Đán Kỷ Dậu", rate: 3.0 },
  { start_date: "2029-04-23", end_date: "2029-04-23", name: "Giỗ Tổ Hùng Vương (10/3 AL)", rate: 3.0 },
  { start_date: "2029-04-30", end_date: "2029-04-30", name: "Ngày Chiến thắng 30/4", rate: 3.0 },
  { start_date: "2029-05-01", end_date: "2029-05-01", name: "Quốc tế Lao động 1/5", rate: 3.0 },
  { start_date: "2029-09-02", end_date: "2029-09-03", name: "Quốc khánh 2/9", rate: 3.0 },
  // 2030 (11 ngày)
  { start_date: "2030-01-01", end_date: "2030-01-01", name: "Tết Dương lịch (2030)", rate: 3.0 },
  { start_date: "2030-02-02", end_date: "2030-02-06", name: "Tết Nguyên Đán Canh Tuất", rate: 3.0 },
  { start_date: "2030-04-12", end_date: "2030-04-12", name: "Giỗ Tổ Hùng Vương (10/3 AL)", rate: 3.0 },
  { start_date: "2030-04-30", end_date: "2030-04-30", name: "Ngày Chiến thắng 30/4", rate: 3.0 },
  { start_date: "2030-05-01", end_date: "2030-05-01", name: "Quốc tế Lao động 1/5", rate: 3.0 },
  { start_date: "2030-09-02", end_date: "2030-09-03", name: "Quốc khánh 2/9", rate: 3.0 }
];

// Định dạng ngày YYYY-MM-DD chuẩn thuần
export const formatDateKey = (date) => {
  if (!date) return "";
  if (typeof date === "string") {
    const trimmed = date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
};

/**
 * Kiểm tra xem ngày có phải ngày Chủ nhật (hoặc ngày nghỉ hàng tuần) không
 * Mặc định Sedinco nghỉ Chủ nhật (day === 0)
 */
const isWeeklyRestDay = (dateStr) => {
  const iso = formatDateKey(dateStr);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay() === 0;
};

/**
 * Tìm thông tin ngày lễ trong danh sách do Backend cung cấp
 */
const findHoliday = (dateStr, holidaysList = []) => {
  if (!dateStr) return null;
  const dKey = formatDateKey(dateStr);

  if (Array.isArray(holidaysList) && holidaysList.length > 0) {
    const found = holidaysList.find((h) => {
      const start = formatDateKey(h.start_date || h.date);
      const end = formatDateKey(h.end_date || h.date || h.start_date);
      return dKey >= start && dKey <= end;
    });
    if (found) return found;
  }

  return (
    VIETNAM_PRIVATE_HOLIDAYS_FALLBACK.find(
      (h) => dKey >= h.start_date && dKey <= h.end_date
    ) || null
  );
};

/**
 * Phân tích khoảng ngày nghỉ xin phép:
 * - Tự động loại trừ ngày nghỉ lễ chính thức và ngày nghỉ hàng tuần khỏi số ngày phép bị trừ
 * - Báo cáo danh sách ngày lễ nằm trong khoảng
 * - Gợi ý ngày "cầu nối" (Bridge Day) nếu ngày nghỉ sát cạnh kỳ nghỉ lễ dài
 */
export const analyzeLeaveRequest = (startDate, endDate, holidaysList = []) => {
  if (!startDate) {
    return {
      isValid: false,
      totalCalendarDays: 0,
      actualDeductedDays: 0,
      holidaysEncountered: [],
      weekendDaysEncountered: [],
      bridgeSuggestions: []
    };
  }

  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date(startDate);

  if (start > end) {
    return {
      isValid: false,
      error: "Ngày bắt đầu không được lớn hơn ngày kết thúc.",
      totalCalendarDays: 0,
      actualDeductedDays: 0,
      holidaysEncountered: [],
      weekendDaysEncountered: [],
      bridgeSuggestions: []
    };
  }

  let totalCalendarDays = 0;
  let actualDeductedDays = 0;
  const holidaysEncountered = [];
  const weekendDaysEncountered = [];

  const curr = new Date(start);
  while (curr <= end) {
    totalCalendarDays++;
    const dateStr = formatDateKey(curr);
    const holiday = findHoliday(dateStr, holidaysList);
    const isWeekend = isWeeklyRestDay(dateStr);

    if (holiday) {
      holidaysEncountered.push({
        date: dateStr,
        name: holiday.name || holiday.ten_le || "Ngày lễ quy định",
        rate: holiday.rate || 3.0
      });
    } else if (isWeekend) {
      weekendDaysEncountered.push(dateStr);
    } else {
      actualDeductedDays++;
    }

    curr.setDate(curr.getDate() + 1);
  }

  // Phân tích ngày "cầu nối" (Bridge Days)
  // Ví dụ: Lễ rơi vào Thứ Năm, gợi ý nghỉ thêm Thứ Sáu để nối liền Thứ Bảy/Chủ Nhật
  const bridgeSuggestions = [];
  const dayBeforeStart = new Date(start);
  dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
  const dayAfterEnd = new Date(end);
  dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);

  const prevHoliday = findHoliday(formatDateKey(dayBeforeStart), holidaysList);
  const nextHoliday = findHoliday(formatDateKey(dayAfterEnd), holidaysList);

  if (prevHoliday) {
    bridgeSuggestions.push({
      type: "AFTER_HOLIDAY",
      message: `Đơn của bạn liền kề ngay sau kỳ nghỉ lễ "${prevHoliday.name}".`
    });
  }
  if (nextHoliday) {
    bridgeSuggestions.push({
      type: "BEFORE_HOLIDAY",
      message: `Đơn của bạn liền kề ngay trước kỳ nghỉ lễ "${nextHoliday.name}".`
    });
  }

  return {
    isValid: true,
    totalCalendarDays,
    actualDeductedDays,
    holidaysEncountered,
    weekendDaysEncountered,
    bridgeSuggestions
  };
};
