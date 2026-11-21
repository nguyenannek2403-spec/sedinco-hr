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

module.exports = {
    getVietnamDateParts,
    getVietnamDateString,
    getVietnamTimeString,
    formatVietnamDateTime
};
