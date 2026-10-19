/**
 * Tiện ích xử lý Ngày Lễ & Đơn Xin Nghỉ Thông Minh (Sedinco HR)
 * Căn cứ pháp lý: Điều 112 Bộ luật Lao động 2019 & Nghị quyết 28/2026/QH16 (Thêm ngày 24/11 Ngày Văn hóa Việt Nam)
 * Lịch lễ chính thức là dữ liệu được lấy từ Backend theo từng công ty/năm.
 */

// Danh mục ngày lễ luật định 2026 (Điều 112 BLLĐ 2019 + NQ 28/2026/QH16)
export const VIETNAM_LEGAL_HOLIDAYS_2026 = [
  { date: "2026-01-01", name: "Tết Dương lịch", rate: 3.0 },
  { date: "2026-02-16", name: "Tết Nguyên Đán (29 Tết)", rate: 3.0 },
  { date: "2026-02-17", name: "Tết Nguyên Đán (Mùng 1)", rate: 3.0 },
  { date: "2026-02-18", name: "Tết Nguyên Đán (Mùng 2)", rate: 3.0 },
  { date: "2026-02-19", name: "Tết Nguyên Đán (Mùng 3)", rate: 3.0 },
  { date: "2026-02-20", name: "Tết Nguyên Đán (Mùng 4)", rate: 3.0 },
  { date: "2026-04-26", name: "Giỗ Tổ Hùng Vương (10/3 AL)", rate: 3.0 },
  { date: "2026-04-30", name: "Ngày Giải phóng Miền Nam", rate: 3.0 },
  { date: "2026-05-01", name: "Ngày Quốc tế Lao động", rate: 3.0 },
  { date: "2026-09-01", name: "Nghỉ liền kề Quốc Khánh", rate: 3.0 },
  { date: "2026-09-02", name: "Ngày Quốc Khánh", rate: 3.0 },
  { date: "2026-11-24", name: "Ngày Văn hóa Việt Nam (NQ 28/2026/QH16)", rate: 3.0 }
];

// Định dạng ngày YYYY-MM-DD
export const formatDateKey = (date) => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Kiểm tra xem ngày có phải ngày Chủ nhật (hoặc ngày nghỉ hàng tuần) không
 * Mặc định Sedinco nghỉ Chủ nhật (day === 0)
 */
export const isWeeklyRestDay = (dateStr) => {
  const d = new Date(dateStr);
  return d.getDay() === 0;
};

/**
 * Tìm thông tin ngày lễ trong danh sách do Backend cung cấp
 */
export const findHoliday = (dateStr, holidaysList = []) => {
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

  // Fallback danh mục luật định 2026 (Điều 112 BLLĐ 2019 + NQ 28/2026/QH16)
  return VIETNAM_LEGAL_HOLIDAYS_2026.find((h) => h.date === dKey) || null;
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
