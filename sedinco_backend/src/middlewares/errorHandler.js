/**
 * Middleware Xử Lý Lỗi Tập Trung (Centralized Error Handler)
 */

const { logRejection } = require('../utils/structuredLogger');

function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || 500;
    const errorCode = err.code || (statusCode === 403 ? 'FORBIDDEN' : (statusCode === 400 ? 'BAD_REQUEST' : 'SERVER_ERROR'));

    logRejection({
        code: errorCode,
        message: err.message,
        actor_id: req.user ? (req.user.ma_nv || req.user.username) : null,
        ip: req.ip,
        details: { path: req.originalUrl, method: req.method, statusCode }
    });

    const clientMessage = process.env.NODE_ENV === 'production' && statusCode >= 500
        ? 'Lỗi xử lý yêu cầu trên máy chủ!'
        : (err.message || 'Lỗi xử lý yêu cầu trên máy chủ!');

    res.status(statusCode).json({
        success: false,
        code: err.code || undefined,
        message: clientMessage
    });
}

function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        message: `Endpoint ${req.method} ${req.originalUrl} không tồn tại!`
    });
}

module.exports = {
    errorHandler,
    notFoundHandler
};
