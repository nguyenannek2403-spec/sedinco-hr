/**
 * sedinco_backend/src/routes/clientErrorRoutes.js
 * 
 * Endpoint nhận báo cáo lỗi giao diện POST /api/client-errors (Mục C.2)
 * Chỉ kích hoạt khi ENABLE_CLIENT_ERROR_REPORTING === 'true'
 */

const express = require('express');
const router = express.Router();
const { cleanString, recordStagingEvent } = require('../utils/stagingLogStore');

// In-memory rate limiter: Tối đa 30 reports / phút / IP
const clientErrorRateLimit = new Map();

function rateLimitClientErrors(req, res, next) {
    const ip = req.clientIp || req.ip || '127.0.0.1';
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxRequests = 30;

    let record = clientErrorRateLimit.get(ip);
    if (!record || now - record.startTime > windowMs) {
        record = { count: 1, startTime: now };
        clientErrorRateLimit.set(ip, record);
    } else {
        record.count++;
        if (record.count > maxRequests) {
            return res.status(429).json({
                success: false,
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Quá nhiều báo cáo lỗi từ thiết bị này. Vui lòng thử lại sau.'
            });
        }
    }

    // Tự động dọn dẹp rate limiter map nếu quá lớn
    if (clientErrorRateLimit.size > 2000) {
        for (const [k, v] of clientErrorRateLimit.entries()) {
            if (now - v.startTime > windowMs) clientErrorRateLimit.delete(k);
        }
    }

    next();
}

// Body parser riêng biệt giới hạn 10kb cho client errors
const clientErrorBodyParser = express.json({ limit: '10kb' });

router.post('/', clientErrorBodyParser, rateLimitClientErrors, (req, res) => {
    // 1. Kiểm tra cờ cấu hình
    const isEnabled = process.env.ENABLE_CLIENT_ERROR_REPORTING === 'true';
    if (!isEnabled) {
        return res.status(404).json({
            success: false,
            message: 'Endpoint báo cáo lỗi giao diện (/api/client-errors) đã bị vô hiệu hóa!'
        });
    }

    // 2. Tiếp nhận và làm sạch dữ liệu
    const body = req.body || {};
    const route = cleanString(body.route, 200);
    const rawErrorMessage = String(body.error_message || 'Unknown client error');

    // Từ chối nếu chứa thẻ script nguy hiểm
    if (/<script/i.test(rawErrorMessage) || /javascript:/i.test(rawErrorMessage)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_PAYLOAD',
            message: 'Nội dung báo cáo lỗi không hợp lệ (chứa script nguy hiểm)!'
        });
    }

    const errorMessage = cleanString(rawErrorMessage, 500);
    const apiCode = body.api_code ? cleanString(body.api_code, 50) : undefined;
    const apiStatus = body.api_status ? Number(body.api_status) : undefined;
    const validRoles = ['worker', 'accountant', 'admin', 'anonymous'];
    const role = validRoles.includes(body.role) ? body.role : 'anonymous';

    // 3. Ghi nhận sự kiện lỗi
    const event = {
        level: 'WARN',
        type: 'CLIENT_UI_ERROR',
        route,
        error_message: errorMessage,
        api_code: apiCode,
        api_status: apiStatus,
        role,
        client_time: body.client_time ? cleanString(body.client_time, 50) : new Date().toISOString(),
        ip: req.clientIp || req.ip || 'unknown',
        request_id: req.id || req.headers['x-request-id'] || null,
        timestamp: new Date().toISOString()
    };

    recordStagingEvent(event);

    if (process.env.NODE_ENV !== 'test') {
        console.warn(`[CLIENT_UI_ERROR] Role: ${role} | Route: ${route} | Message: ${errorMessage}`);
    }

    return res.status(200).json({
        success: true,
        reported: true,
        request_id: req.id
    });
});

module.exports = router;
