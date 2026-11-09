/**
 * sedinco_backend/src/utils/stagingLogStore.js
 * 
 * Quản lý lưu trữ và truy xuất sự kiện/lỗi trên môi trường Staging (Mục C).
 * TUYỆT ĐỐI KHÔNG LƯU SECRET, MẬT KHẨU, TOKEN, HOẶC DỮ LIỆU CÁ NHÂN (PII).
 */

const fs = require('fs');
const path = require('path');

const MAX_IN_MEMORY_EVENTS = 1000;
const memoryBuffer = [];

const logsDir = path.resolve(__dirname, '../../logs');
const logFilePath = path.join(logsDir, 'staging_events.jsonl');

function cleanString(val, maxLen = 500) {
    if (val === undefined || val === null) return '';
    const str = String(val);
    // Bỏ control characters và HTML tags
    const stripped = str.replace(/<[^>]*>?/gm, '').replace(/[\x00-\x1F\x7F]/g, ' ');
    const trimmed = stripped.trim();
    return trimmed.length > maxLen ? trimmed.substring(0, maxLen) + '...' : trimmed;
}

function sanitizeEventPayload(event) {
    if (!event || typeof event !== 'object') return {};
    const sanitized = {};

    for (const [key, value] of Object.entries(event)) {
        const lowerKey = key.toLowerCase();
        // Loại bỏ hoàn toàn secret, token, password, credentials
        if (
            lowerKey.includes('secret') ||
            lowerKey.includes('password') ||
            lowerKey.includes('passwd') ||
            lowerKey.includes('token') ||
            lowerKey.includes('key') && !lowerKey.includes('rejection')
        ) {
            continue; // Không ghi
        }
        if (lowerKey.includes('image') || lowerKey.includes('snapshot') || lowerKey.includes('photo')) {
            continue; // Không ghi ảnh
        }
        if (typeof value === 'string') {
            sanitized[key] = cleanString(value, 500);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            sanitized[key] = value;
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            sanitized[key] = sanitizeEventPayload(value);
        }
    }

    return sanitized;
}

function recordStagingEvent(event) {
    try {
        const cleanEvent = sanitizeEventPayload(event);
        cleanEvent.timestamp = cleanEvent.timestamp || new Date().toISOString();

        // Lưu vào in-memory buffer
        memoryBuffer.push(cleanEvent);
        if (memoryBuffer.length > MAX_IN_MEMORY_EVENTS) {
            memoryBuffer.shift();
        }

        // Ghi append file nếu không phải test
        if (process.env.NODE_ENV !== 'test') {
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            fs.appendFileSync(logFilePath, JSON.stringify(cleanEvent) + '\n', 'utf8');
        }

        return cleanEvent;
    } catch (err) {
        return null;
    }
}

function getRecentEvents(hours = 1) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const events = [];

    // Ưu tiên đọc từ memoryBuffer
    for (let i = memoryBuffer.length - 1; i >= 0; i--) {
        const item = memoryBuffer[i];
        const itemTime = new Date(item.timestamp).getTime();
        if (itemTime >= cutoff) {
            events.push(item);
        }
    }

    // Nếu memoryBuffer rỗng và file tồn tại, đọc từ file
    if (events.length === 0 && fs.existsSync(logFilePath)) {
        try {
            const content = fs.readFileSync(logFilePath, 'utf8');
            const lines = content.trim().split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                if (!line) continue;
                try {
                    const parsed = JSON.parse(line);
                    const itemTime = new Date(parsed.timestamp).getTime();
                    if (itemTime >= cutoff) {
                        events.push(parsed);
                    }
                } catch (e) {}
            }
        } catch (e) {}
    }

    // Tổng hợp thống kê
    const byRoute = {};
    const byRole = {};

    for (const ev of events) {
        const r = ev.route || 'unknown_route';
        const role = ev.role || 'anonymous';
        byRoute[r] = (byRoute[r] || 0) + 1;
        byRole[role] = (byRole[role] || 0) + 1;
    }

    return {
        hours,
        total: events.length,
        by_route: byRoute,
        by_role: byRole,
        recent_items: events.slice(0, 50)
    };
}

function resetStagingEvents() {
    memoryBuffer.length = 0;
    if (fs.existsSync(logFilePath)) {
        try {
            fs.unlinkSync(logFilePath);
        } catch (e) {}
    }
}

module.exports = {
    cleanString,
    recordStagingEvent,
    getRecentEvents,
    resetStagingEvents
};
