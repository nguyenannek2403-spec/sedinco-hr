const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const apiRoutes = require('./routes/index');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();

// Bảo vệ môi trường: Từ chối khởi động nếu NODE_ENV=production và ENABLE_DIAGNOSTICS=true (D.2)
if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DIAGNOSTICS === 'true') {
    throw new Error('FATAL: Khởi động bị từ chối: Tuyệt đối không được kích hoạt ENABLE_DIAGNOSTICS trong môi trường production!');
}


// ─────────────────────────────────────────────────────────────────────────────
// Trust Proxy (B2, B4, B5)
// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình qua biến môi trường TRUST_PROXY:
//   TRUST_PROXY=false  → Không tin cậy X-Forwarded-For (default cho local/dev).
//                        req.ip = socket.remoteAddress (thường 127.0.0.1 nếu sau Nginx).
//   TRUST_PROXY=1      → Tin cậy 1 hop ngay trước (Render.com, Nginx trên cùng server).
//   TRUST_PROXY=loopback → Chỉ tin cậy kết nối từ loopback (127.0.0.1, ::1).
// Bắt buộc xác thực cấu hình hợp lệ khi khởi động, ném lỗi rõ ràng nếu sai.
// ─────────────────────────────────────────────────────────────────────────────
const net = require('net');

function isValidIpOrCidr(str) {
    const trimmed = str.trim();
    if (net.isIP(trimmed)) return true;
    if (trimmed.includes('/')) {
        const [ip, maskStr] = trimmed.split('/');
        const ipType = net.isIP(ip);
        const mask = Number(maskStr);
        if (!isNaN(mask)) {
            if (ipType === 4 && mask >= 0 && mask <= 32) return true;
            if (ipType === 6 && mask >= 0 && mask <= 128) return true;
        }
    }
    return false;
}

function parseAndValidateTrustProxy(val, nodeEnv = process.env.NODE_ENV) {
    if (val === false || val === 'false' || val === undefined || val === null || val === '') {
        return false;
    }
    if (val === true || val === 'true') {
        if (nodeEnv === 'production' || nodeEnv === 'staging') {
            throw new Error(`FATAL: Cấm cấu hình TRUST_PROXY=true trong môi trường ${nodeEnv}! Chỉ chấp nhận số lớp proxy (ví dụ: 1 cho Render) hoặc danh sách subnet tin cậy.`);
        }
        return true;
    }
    const str = String(val).trim();
    if (/^\d+$/.test(str)) {
        return Number(str);
    }
    const predefined = ['loopback', 'linklocal', 'uniquelocal'];
    if (predefined.includes(str.toLowerCase())) {
        return str.toLowerCase();
    }
    const items = str.split(',').map(s => s.trim()).filter(Boolean);
    if (items.length > 0 && items.every(isValidIpOrCidr)) {
        return str;
    }
    throw new Error(`FATAL: Cấu hình TRUST_PROXY không hợp lệ: "${val}". Chỉ chấp nhận: false, số nguyên >= 0, "loopback", "linklocal", "uniquelocal", hoặc IP/CIDR hợp lệ.`);
}

const rawTrustProxy = env.TRUST_PROXY;
const validatedTrustProxy = parseAndValidateTrustProxy(rawTrustProxy);
app.set('trust proxy', validatedTrustProxy);

// Bộ nhớ đệm throttle cảnh báo XFF theo IP socket (tối đa 1 lần/phút/IP socket)
const lastXffWarnBySocketIp = new Map();

function sanitizeLogString(str, maxLen = 100) {
    if (typeof str !== 'string') return '';
    // Strip control characters (ASCII 0-31, 127) và dấu xuống dòng
    const cleaned = str.replace(/[\x00-\x1F\x7F]/g, '');
    return cleaned.length > maxLen ? cleaned.substring(0, maxLen) + '...' : cleaned;
}

// Middleware chuẩn hóa trích xuất IP: Tuyệt đối không đọc trực tiếp header x-forwarded-for thô
app.use((req, res, next) => {
    const isTrustDisabled = !app.get('trust proxy');
    if (req.headers['x-forwarded-for'] && isTrustDisabled) {
        const socketIp = req.socket?.remoteAddress || (req.connection && req.connection.remoteAddress) || req.ip || 'unknown';
        const now = Date.now();
        const lastWarn = lastXffWarnBySocketIp.get(socketIp) || 0;
        // Rate limit log tối đa 1 lần/phút/IP socket (60.000 ms)
        if (now - lastWarn >= 60000) {
            lastXffWarnBySocketIp.set(socketIp, now);
            if (lastXffWarnBySocketIp.size > 1000) {
                for (const [k, v] of lastXffWarnBySocketIp.entries()) {
                    if (now - v > 60000) lastXffWarnBySocketIp.delete(k);
                }
            }
            const sanitizedXff = sanitizeLogString(String(req.headers['x-forwarded-for']), 100);
            console.warn(`[CẢNH BÁO BẢO MẬT] Bỏ qua header X-Forwarded-For="${sanitizedXff}" vì TRUST_PROXY=false. Sử dụng IP socket thực tế: ${socketIp}`);
        }
    }
    // Gán req.clientIp chuẩn hóa từ req.ip của Express đã qua trust proxy filter
    req.clientIp = req.ip || (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress) || '127.0.0.1';
    next();
});

// Middlewares toàn cục: Phân bổ kích thước body parser tối ưu
// Mặc định giới hạn nhỏ (100kb) để phòng chống DoS/Payload Too Large vào các route nhạy cảm (/api/login, /api/auth...)
// Riêng route chấm công (/api/attendance) cho phép tới 3mb để nạp ảnh snapshot Base64
const defaultJsonParser = express.json({ limit: '100kb' });
const attendanceJsonParser = express.json({ limit: '3mb' });
const defaultUrlParser = express.urlencoded({ limit: '100kb', extended: true });
const attendanceUrlParser = express.urlencoded({ limit: '3mb', extended: true });

app.use(cors({ origin: env.CORS_ORIGIN }));

app.use((req, res, next) => {
    if (req.path.startsWith('/api/attendance')) {
        return attendanceJsonParser(req, res, (err) => {
            if (err) return next(err);
            attendanceUrlParser(req, res, next);
        });
    }
    return defaultJsonParser(req, res, (err) => {
        if (err) return next(err);
        defaultUrlParser(req, res, next);
    });
});

const path = require('path');
const frontendDistPath = path.join(__dirname, '../../zalo-miniapp-frontend/www');
app.use(express.static(frontendDistPath));

const { getRejectionMetrics } = require('./utils/structuredLogger');

// Healthcheck endpoints (cho Render Web Service & Uptime Monitors)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        rejection_metrics: getRejectionMetrics()
    });
});

app.get('/api', (req, res) => {
    res.json({
        status: 'ok',
        name: 'Sedinco HR Backend API',
        time: new Date().toISOString()
    });
});

// Gắn toàn bộ REST API routes
app.use('/api', apiRoutes);

// SPA Fallback cho Frontend Router (Tương thích Express v5)
app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
        if (err) next();
    });
});

// Xử lý 404 và Error Handler
app.use(notFoundHandler);
app.use(errorHandler);

app.parseAndValidateTrustProxy = parseAndValidateTrustProxy;
app.sanitizeLogString = sanitizeLogString;
app.lastXffWarnBySocketIp = lastXffWarnBySocketIp;

module.exports = app;

