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
if (env.TRUST_PROXY !== false && env.TRUST_PROXY !== 'false') {
    // Chuyển '1' (string từ env) → 1 (number) nếu cần
    const trustValue = !isNaN(Number(env.TRUST_PROXY)) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY;
    app.set('trust proxy', trustValue);
}
// Nếu TRUST_PROXY=false (default): không gọi app.set('trust proxy') → Express dùng socket IP

// Cảnh báo nếu nhận header X-Forwarded-For nhưng TRUST_PROXY chưa được cấu hình
let warnedAboutTrustProxy = false;
app.use((req, res, next) => {
    if (req.headers['x-forwarded-for'] && (env.TRUST_PROXY === false || env.TRUST_PROXY === 'false' || !app.get('trust proxy'))) {
        if (!warnedAboutTrustProxy) {
            console.warn('[CẢNH BÁO BẢO MẬT] Nhận header X-Forwarded-For nhưng TRUST_PROXY đang tắt! IP client có thể bị giả mạo hoặc rate limit không nhận đúng IP thật.');
            warnedAboutTrustProxy = true;
        }
    }
    next();
});

// Middlewares toàn cục
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

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

