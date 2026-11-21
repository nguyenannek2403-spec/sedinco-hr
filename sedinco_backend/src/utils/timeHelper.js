/**
 * Tiện ích xử lý thời gian chuẩn hóa múi giờ Việt Nam (Asia/Ho_Chi_Minh - GMT+7)
 * Loại bỏ hoàn toàn sự không nhất quán giữa UTC và Local Server OS
 */

function getVietnamDateParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(date);
    const map = {};
    for (const p of parts) {
        map[p.type] = p.value;
    }
    const hh = map.hour === '24' ? '00' : map.hour;
    return {
        year: parseInt(map.year, 10),
        month: parseInt(map.month, 10),
        day: parseInt(map.day, 10),
        hour: parseInt(hh, 10),
        minute: parseInt(map.minute, 10),
        second: parseInt(map.second, 10),
        dateStr: `${map.year}-${map.month}-${map.day}`,
        timeStr: `${hh}:${map.minute}:${map.second}`,
        dateTimeViStr: `${map.day}/${map.month}/${map.year} ${hh}:${map.minute}:${map.second}`
    };
}

function getVietnamDateString(date = new Date()) {
    return getVietnamDateParts(date).dateStr;
}

function getVietnamTimeString(date = new Date()) {
    return getVietnamDateParts(date).timeStr;
}

function formatVietnamDateTime(input) {
    if (!input) return null;
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) return null;
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
            const parsed = new Date(trimmed.replace(' ', 'T') + '+07:00');
            if (!Number.isNaN(parsed.getTime())) {
                return getVietnamDateParts(parsed).dateTimeViStr;
            }
        }
    }
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return null;
    return getVietnamDateParts(d).dateTimeViStr;
}

/**
 * Chuẩn hóa chuỗi ngày về dạng thuần 'YYYY-MM-DD' theo GMT+7,
 * tránh lỗi lệch -1 ngày khi Date / MySQL DATE serializes qua UTC (.toISOString()).
 */
function normalizePureIsoDate(input) {
    if (!input) return '';
    if (input instanceof Date) {
        return Number.isNaN(input.getTime()) ? '' : getVietnamDateString(input);
    }
    const trimmed = String(input).trim();
    if (!trimmed) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
    }
    if (trimmed.includes('T') || /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) {
            return getVietnamDateString(parsed);
        }
    }
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
}

function getDaysInMonth(month, year) {
    const parts = getVietnamDateParts();
    const m = parseInt(month, 10) || parts.month;
    const y = parseInt(year, 10) || parts.year;
    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 1900 || y > 2300) {
        return 30;
    }
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function countSundaysInMonth(month, year) {
    const parts = getVietnamDateParts();
    const m = parseInt(month, 10) || parts.month;
    const y = parseInt(year, 10) || parts.year;
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
 * Tính số ngày công chuẩn theo tháng = Tổng số ngày trong tháng - Số ngày Chủ nhật.
 * VD: Tháng 11/2026 (30 ngày, 5 CN) -> 25 ngày công chuẩn.
 */
function getMonthlyStandardWorkdays(month, year) {
    const parts = getVietnamDateParts();
    const m = parseInt(month, 10) || parts.month;
    const y = parseInt(year, 10) || parts.year;
    const totalDays = getDaysInMonth(m, y);
    const sundays = countSundaysInMonth(m, y);
    return Math.max(1, totalDays - sundays);
}

function isSundayIsoDate(isoDateStr) {
    const iso = normalizePureIsoDate(isoDateStr);
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

module.exports = {
    getVietnamDateParts,
    getVietnamDateString,
    getVietnamTimeString,
    formatVietnamDateTime,
    normalizePureIsoDate,
    getDaysInMonth,
    countSundaysInMonth,
    getMonthlyStandardWorkdays,
    isSundayIsoDate
};
