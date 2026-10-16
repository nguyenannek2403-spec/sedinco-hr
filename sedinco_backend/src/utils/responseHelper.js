/**
 * Tiện ích chuẩn hóa phản hồi API (API Response Helpers)
 */

function sendSuccess(res, data = null, message = null, statusCode = 200) {
    const payload = { success: true };
    if (data !== null) payload.data = data;
    if (message !== null) payload.message = message;
    return res.status(statusCode).json(payload);
}

function sendError(res, message = 'Có lỗi xảy ra trên máy chủ', statusCode = 400, details = null) {
    const payload = { success: false, message };
    if (details && process.env.NODE_ENV !== 'production') {
        payload.details = details;
    }
    return res.status(statusCode).json(payload);
}

module.exports = {
    sendSuccess,
    sendError
};
