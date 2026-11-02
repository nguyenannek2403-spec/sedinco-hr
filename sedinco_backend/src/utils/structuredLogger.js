/**
 * sedinco_backend/src/utils/structuredLogger.js
 * 
 * Structured Logger & Rejection Counter Metrics (F.4):
 * - Ghi log có cấu trúc dạng JSON cho các sự kiện từ chối / lỗi bảo mật.
 * - Tuyệt đối KHÔNG ghi secret, raw token đầy đủ hoặc Base64 ảnh snapshot.
 * - Thu thập bộ đếm theo mã lý do từ chối phục vụ monitoring tại /api/health.
 */

const rejectionCounters = {};

function maskString(str, startChars = 4, endChars = 4) {
    if (!str || typeof str !== 'string') return '';
    if (str.length <= startChars + endChars) return '****';
    return `${str.substring(0, startChars)}...${str.slice(-endChars)} (${str.length} chars)`;
}

function sanitizeDetails(details) {
    if (!details || typeof details !== 'object') return details;
    const sanitized = Array.isArray(details) ? [] : {};

    for (const [key, value] of Object.entries(details)) {
        const lowerKey = key.toLowerCase();
        // Redact secrets, passwords, keys
        if (lowerKey.includes('secret') || lowerKey.includes('password') || lowerKey.includes('passwd')) {
            sanitized[key] = '[REDACTED_SECRET]';
        } else if (lowerKey.includes('image') || lowerKey.includes('snapshot') || lowerKey.includes('photo')) {
            // Redact raw image payload
            const len = typeof value === 'string' ? value.length : 0;
            sanitized[key] = `[REDACTED_IMAGE: ${len} chars]`;
        } else if (lowerKey.includes('token') && typeof value === 'string') {
            // Mask tokens
            sanitized[key] = maskString(value);
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeDetails(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

function logRejection({ code = 'UNKNOWN_REJECTION', message = '', actor_id = null, ip = null, details = {} }) {
    const reasonCode = String(code).toUpperCase().trim();
    rejectionCounters[reasonCode] = (rejectionCounters[reasonCode] || 0) + 1;

    const logEntry = {
        level: 'WARN',
        type: 'SECURITY_REJECTION',
        code: reasonCode,
        message,
        actor_id: actor_id || 'anonymous',
        ip: ip || 'unknown',
        details: sanitizeDetails(details),
        timestamp: new Date().toISOString()
    };

    if (process.env.NODE_ENV !== 'test') {
        console.warn(JSON.stringify(logEntry));
    }

    return logEntry;
}

function getRejectionMetrics() {
    const total = Object.values(rejectionCounters).reduce((acc, v) => acc + v, 0);
    return {
        total_rejections: total,
        by_reason: { ...rejectionCounters }
    };
}

function resetRejectionMetrics() {
    for (const key of Object.keys(rejectionCounters)) {
        delete rejectionCounters[key];
    }
}

module.exports = {
    logRejection,
    getRejectionMetrics,
    resetRejectionMetrics,
    sanitizeDetails,
    maskString
};
