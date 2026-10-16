/**
 * Middleware Xử Lý Lỗi Tập Trung (Centralized Error Handler)
 */

function errorHandler(err, req, res, next) {
    console.error(`❌ [API Error] ${req.method} ${req.url}:`, err.message);

    // Không trả về chi tiết SQL nội bộ (table/column) ra ngoài client
    const statusCode = err.statusCode || 500;
    const clientMessage = process.env.NODE_ENV === 'production'
        ? 'Lỗi xử lý yêu cầu trên máy chủ!'
        : (err.message || 'Lỗi xử lý yêu cầu trên máy chủ!');

    res.status(statusCode).json({
        success: false,
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
