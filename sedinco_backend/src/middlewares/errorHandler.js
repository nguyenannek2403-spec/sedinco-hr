/**
 * Middleware Xử Lý Lỗi Tập Trung (Centralized Error Handler)
 */

const { logRejection } = require('../utils/structuredLogger');

function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || err.status || 500;
    const errorCode = err.code || (statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : (statusCode === 403 ? 'FORBIDDEN' : (statusCode === 400 ? 'BAD_REQUEST' : 'SERVER_ERROR')));

    if (res.locals) {
        res.locals.rejection_code = errorCode;
    }

    // Đảm bảo phản hồi lỗi luôn mang header CORS nếu origin hợp lệ (Mục B.2)
    if (typeof req.app?.setCorsHeadersIfAllowed === 'function') {
        req.app.setCorsHeadersIfAllowed(req, res);
    }

    logRejection({
        code: errorCode,
        message: err.message,
        actor_id: req.user ? (req.user.ma_nv || req.user.username) : null,
        ip: req.clientIp || req.ip,
        details: { path: req.originalUrl, method: req.method, statusCode, request_id: req.id }
    });

    const clientMessage = process.env.NODE_ENV === 'production' && statusCode >= 500
        ? 'Lỗi xử lý yêu cầu trên máy chủ!'
        : (err.message || 'Lỗi xử lý yêu cầu trên máy chủ!');

    res.status(statusCode).json({
        success: false,
        code: errorCode,
        message: clientMessage,
        request_id: req.id || undefined
    });
}

function notFoundHandler(req, res) {
    if (typeof req.app?.setCorsHeadersIfAllowed === 'function') {
        req.app.setCorsHeadersIfAllowed(req, res);
    }

    res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Đường dẫn yêu cầu không tồn tại trên hệ thống!',
        request_id: req.id || undefined
    });
}

module.exports = {
    errorHandler,
    notFoundHandler
};
