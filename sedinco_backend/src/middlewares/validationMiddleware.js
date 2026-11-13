/**
 * Middleware Thẩm tra & Làm sạch Dữ liệu Đầu vào (Input Validation & Sanitization)
 * Đã xác minh qua bộ test tự động TC-ATT-01 đến TC-ATT-05
 */

function validateAttendanceInput({ ma_nv, day, month, year, date, dateStr: rawDateStr, status, ot_hours }) {
    let resolvedDay = day;
    let resolvedMonth = month;
    let resolvedYear = year;

    const isoSource = date || rawDateStr;
    if ((resolvedDay === undefined || resolvedMonth === undefined || resolvedYear === undefined) && typeof isoSource === 'string') {
        const isoMatch = isoSource.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (isoMatch) {
            resolvedYear = isoMatch[1];
            resolvedMonth = isoMatch[2];
            resolvedDay = isoMatch[3];
        }
    }

    if (!ma_nv || resolvedDay === undefined || resolvedMonth === undefined || resolvedYear === undefined) {
        return { valid: false, error: 'Thiếu mã nhân viên hoặc thời gian chấm công!' };
    }

    const d = parseInt(resolvedDay, 10);
    const m = parseInt(resolvedMonth, 10);
    const y = parseInt(resolvedYear, 10);
    if (isNaN(d) || d < 1 || d > 31 || isNaN(m) || m < 1 || m > 12 || isNaN(y) || y < 2000 || y > 2100) {
        return { valid: false, error: 'Ngày tháng năm không hợp lệ!' };
    }

    let hours = ot_hours !== undefined ? Number(ot_hours) : 0;
    if (isNaN(hours) || hours < 0) hours = 0;
    if (hours > 24) hours = 24; // Chống tràn và hạn chế rủi ro DoS / gian lận

    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isDelete = (!status || status === '');

    return {
        valid: true,
        dateStr,
        hours,
        isDelete,
        status,
        day: d,
        month: m,
        year: y
    };
}

// Middleware Express
function validateAttendanceMiddleware(req, res, next) {
    const result = validateAttendanceInput(req.body);
    if (!result.valid) {
        return res.status(400).json({ success: false, message: result.error });
    }
    req.validatedAttendance = result;
    next();
}

module.exports = {
    validateAttendanceInput,
    validateAttendanceMiddleware
};
