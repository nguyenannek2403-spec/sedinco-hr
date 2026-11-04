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
// Trust Proxy (B2)
// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình qua biến môi trường TRUST_PROXY:
//   TRUST_PROXY=false  → Không tin cậy X-Forwarded-For (default cho local/dev).
//                        req.ip = socket.remoteAddress (thường 127.0.0.1 nếu sau Nginx).
//                        Nguy cơ: mọi request đều cùng IP 127.0.0.1 → IP rate limit vô nghĩa.
//   TRUST_PROXY=1      → Tin cậy 1 hop ngay trước (Render.com, Nginx trên cùng server).
//                        req.ip = địa chỉ đầu tiên trong X-Forwarded-For.
//                        Nguy cơ: nếu không có reverse proxy, client có thể giả mạo X-Forwarded-For.
//   TRUST_PROXY=loopback → Chỉ tin cậy kết nối từ loopback (127.0.0.1, ::1).
// QUAN TRỌNG: Chỉ đặt TRUST_PROXY=1 khi chắc chắn có reverse proxy xác thực ở trước.
// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình qua biến môi trường TRUST_PROXY:
//   TRUST_PROXY=false (hoặc 'false', undefined) → app.set('trust proxy', false) (default an toàn cho local/dev).
//   TRUST_PROXY=1 (hoặc số hop n)               → app.set('trust proxy', n) (khi chạy sau Reverse Proxy chuẩn).
//   TRUST_PROXY='loopback'                      → app.set('trust proxy', 'loopback').
const rawTrustProxy = env.TRUST_PROXY;
if (rawTrustProxy === false || rawTrustProxy === 'false' || rawTrustProxy === undefined || rawTrustProxy === '') {
    app.set('trust proxy', false);
} else if (!isNaN(Number(rawTrustProxy))) {
    app.set('trust proxy', Number(rawTrustProxy));
} else {
    app.set('trust proxy', rawTrustProxy);
}

// Middleware chuẩn hóa trích xuất IP: Tuyệt đối không đọc trực tiếp header x-forwarded-for thô
app.use((req, res, next) => {
    const isTrustDisabled = !app.get('trust proxy');
    if (req.headers['x-forwarded-for'] && isTrustDisabled) {
        console.warn(`[CẢNH BÁO BẢO MẬT] Bỏ qua header X-Forwarded-For="${req.headers['x-forwarded-for']}" vì TRUST_PROXY=false. Sử dụng IP socket thực tế: ${req.socket?.remoteAddress || req.ip}`);
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

module.exports = app;

