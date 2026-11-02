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
        hour12: false
    });
    const parts = formatter.formatToParts(date);
    const map = {};
    for (const p of parts) {
        map[p.type] = p.value;
    }
    return {
        year: parseInt(map.year, 10),
        month: parseInt(map.month, 10),
        day: parseInt(map.day, 10),
        hour: parseInt(map.hour, 10),
        minute: parseInt(map.minute, 10),
        second: parseInt(map.second, 10),
        dateStr: `${map.year}-${map.month}-${map.day}`,
        timeStr: `${map.hour}:${map.minute}:${map.second}`
    };
}

function getVietnamDateString(date = new Date()) {
    return getVietnamDateParts(date).dateStr;
}

function getVietnamTimeString(date = new Date()) {
    return getVietnamDateParts(date).timeStr;
}

module.exports = {
    getVietnamDateParts,
    getVietnamDateString,
    getVietnamTimeString
};
