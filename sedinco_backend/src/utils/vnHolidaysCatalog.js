const { getDaysInMonth, normalizePureIsoDate } = require('./timeHelper');

/**
 * Danh mục 11 ngày nghỉ lễ, Tết hưởng nguyên lương theo Điều 112 BLLĐ 2019
 * áp dụng cho doanh nghiệp tư nhân (SEDINCO) giai đoạn 2026–2030.
 */
const VIETNAM_PRIVATE_HOLIDAYS_2026_2030 = [
    // 2026 (11 ngày)
    { holiday_name: 'Tết Dương lịch (2026)', start_date: '2026-01-01', end_date: '2026-01-01', salary_multiplier: 3.0 },
    { holiday_name: 'Tết Nguyên Đán Bính Ngọ (5 ngày)', start_date: '2026-02-16', end_date: '2026-02-20', salary_multiplier: 3.0 },
    { holiday_name: 'Giỗ Tổ Hùng Vương 10/3 Âm lịch (2026)', start_date: '2026-04-26', end_date: '2026-04-26', salary_multiplier: 3.0 },
    { holiday_name: 'Ngày Chiến thắng 30/4 (2026)', start_date: '2026-04-30', end_date: '2026-04-30', salary_multiplier: 3.0 },
    { holiday_name: 'Quốc tế Lao động 1/5 (2026)', start_date: '2026-05-01', end_date: '2026-05-01', salary_multiplier: 3.0 },
    { holiday_name: 'Quốc khánh 2/9 (2026 — 2 ngày)', start_date: '2026-09-01', end_date: '2026-09-02', salary_multiplier: 3.0 },
    // 2027 (11 ngày)
    { holiday_name: 'Tết Dương lịch (2027)', start_date: '2027-01-01', end_date: '2027-01-01', salary_multiplier: 3.0 },
    { holiday_name: 'Tết Nguyên Đán Đinh Mùi (5 ngày)', start_date: '2027-02-05', end_date: '2027-02-09', salary_multiplier: 3.0 },
    { holiday_name: 'Giỗ Tổ Hùng Vương 10/3 Âm lịch (2027)', start_date: '2027-04-16', end_date: '2027-04-16', salary_multiplier: 3.0 },
    { holiday_name: 'Ngày Chiến thắng 30/4 (2027)', start_date: '2027-04-30', end_date: '2027-04-30', salary_multiplier: 3.0 },
    { holiday_name: 'Quốc tế Lao động 1/5 (2027)', start_date: '2027-05-01', end_date: '2027-05-01', salary_multiplier: 3.0 },
    { holiday_name: 'Quốc khánh 2/9 (2027 — 2 ngày)', start_date: '2027-09-02', end_date: '2027-09-03', salary_multiplier: 3.0 },
    // 2028 (11 ngày)
    { holiday_name: 'Tết Dương lịch (2028)', start_date: '2028-01-01', end_date: '2028-01-01', salary_multiplier: 3.0 },
    { holiday_name: 'Tết Nguyên Đán Mậu Thân (5 ngày)', start_date: '2028-01-25', end_date: '2028-01-29', salary_multiplier: 3.0 },
    { holiday_name: 'Giỗ Tổ Hùng Vương 10/3 Âm lịch (2028)', start_date: '2028-04-04', end_date: '2028-04-04', salary_multiplier: 3.0 },
    { holiday_name: 'Ngày Chiến thắng 30/4 (2028)', start_date: '2028-04-30', end_date: '2028-04-30', salary_multiplier: 3.0 },
    { holiday_name: 'Quốc tế Lao động 1/5 (2028)', start_date: '2028-05-01', end_date: '2028-05-01', salary_multiplier: 3.0 },
    { holiday_name: 'Quốc khánh 2/9 (2028 — 2 ngày)', start_date: '2028-09-01', end_date: '2028-09-02', salary_multiplier: 3.0 },
    // 2029 (11 ngày)
    { holiday_name: 'Tết Dương lịch (2029)', start_date: '2029-01-01', end_date: '2029-01-01', salary_multiplier: 3.0 },
    { holiday_name: 'Tết Nguyên Đán Kỷ Dậu (5 ngày)', start_date: '2029-02-12', end_date: '2029-02-16', salary_multiplier: 3.0 },
    { holiday_name: 'Giỗ Tổ Hùng Vương 10/3 Âm lịch (2029)', start_date: '2029-04-23', end_date: '2029-04-23', salary_multiplier: 3.0 },
    { holiday_name: 'Ngày Chiến thắng 30/4 (2029)', start_date: '2029-04-30', end_date: '2029-04-30', salary_multiplier: 3.0 },
    { holiday_name: 'Quốc tế Lao động 1/5 (2029)', start_date: '2029-05-01', end_date: '2029-05-01', salary_multiplier: 3.0 },
    { holiday_name: 'Quốc khánh 2/9 (2029 — 2 ngày)', start_date: '2029-09-02', end_date: '2029-09-03', salary_multiplier: 3.0 },
    // 2030 (11 ngày)
    { holiday_name: 'Tết Dương lịch (2030)', start_date: '2030-01-01', end_date: '2030-01-01', salary_multiplier: 3.0 },
    { holiday_name: 'Tết Nguyên Đán Canh Tuất (5 ngày)', start_date: '2030-02-02', end_date: '2030-02-06', salary_multiplier: 3.0 },
    { holiday_name: 'Giỗ Tổ Hùng Vương 10/3 Âm lịch (2030)', start_date: '2030-04-12', end_date: '2030-04-12', salary_multiplier: 3.0 },
    { holiday_name: 'Ngày Chiến thắng 30/4 (2030)', start_date: '2030-04-30', end_date: '2030-04-30', salary_multiplier: 3.0 },
    { holiday_name: 'Quốc tế Lao động 1/5 (2030)', start_date: '2030-05-01', end_date: '2030-05-01', salary_multiplier: 3.0 },
    { holiday_name: 'Quốc khánh 2/9 (2030 — 2 ngày)', start_date: '2030-09-02', end_date: '2030-09-03', salary_multiplier: 3.0 }
];

function findHolidayForDate(holidays = [], isoDateStr) {
    const cleanIso = normalizePureIsoDate(isoDateStr);
    if (!cleanIso || !Array.isArray(holidays)) return null;
    for (const h of holidays) {
        const s = normalizePureIsoDate(h.start_date || h.date);
        const e = normalizePureIsoDate(h.end_date || h.date || h.start_date);
        if (s && e && cleanIso >= s && cleanIso <= e) {
            const rawMult = Number(h.salary_multiplier ?? h.multiplier ?? 3.0);
            const salary_multiplier = Number.isFinite(rawMult) && rawMult >= 1
                ? Math.round(rawMult * 100) / 100
                : 3.0;
            return {
                id: h.id || null,
                holiday_name: h.holiday_name || h.name || 'Ngày nghỉ lễ',
                start_date: s,
                end_date: e,
                salary_multiplier
            };
        }
    }
    return null;
}

function buildHolidayDateMap(holidays = [], month, year) {
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    const map = {};
    if (!m || !y) return map;
    const days = getDaysInMonth(m, y);
    for (let d = 1; d <= days; d++) {
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const matched = findHolidayForDate(holidays, iso);
        if (matched) map[iso] = matched;
    }
    return map;
}

module.exports = {
    VIETNAM_PRIVATE_HOLIDAYS_2026_2030,
    findHolidayForDate,
    buildHolidayDateMap
};
