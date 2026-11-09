/**
 * sedinco_backend/src/controllers/diagnosticsController.js
 * 
 * Controller tự chẩn đoán (Diagnostics) phục vụ kiểm thử tích hợp SDK Zalo & Môi trường Staging.
 * TUYỆT ĐỐI KHÔNG HIỂN THỊ SECRET HOẶC TOKEN ĐẦY ĐỦ.
 */

const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const { verifyZaloLocationToken, verifyZaloUserToken } = require('../utils/zaloAdapter');
const { query } = require('../config/db');

function maskToken(token) {
    if (!token || typeof token !== 'string') return '';
    if (token.length <= 8) return '****';
    return `${token.substring(0, 4)}...${token.slice(-4)} (${token.length} chars)`;
}

function assertDiagnosticsAllowedAtStartup() {
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DIAGNOSTICS === 'true') {
        throw new Error('FATAL: Khởi động bị từ chối: Tuyệt đối không được kích hoạt ENABLE_DIAGNOSTICS trong môi trường production!');
    }
}

class DiagnosticsController {
    assertDiagnosticsAllowedAtStartup() {
        return assertDiagnosticsAllowedAtStartup();
    }

    // Middleware kiểm tra cờ cấu hình và vai trò admin
    checkDiagnosticsAccess(req, res, next) {
        const isEnabled = process.env.ENABLE_DIAGNOSTICS === 'true';
        if (!isEnabled) {
            return res.status(404).json({
                success: false,
                statusCode: 404,
                message: 'Chức năng tự chẩn đoán (/diagnostics) đã bị vô hiệu hóa hoặc không khả dụng trên môi trường này!'
            });
        }

        // Bắt buộc phải là admin
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                statusCode: 403,
                message: 'Truy cập bị từ chối: Chỉ Quản trị viên (Admin) mới có quyền thực thi chẩn đoán hệ thống!'
            });
        }

        next();
    }

    async getSystemStatus(req, res) {
        try {
            const dbCheck = await query('SELECT 1 as is_connected');
            const isDbOk = dbCheck && dbCheck.length > 0;

            let gitCommit = 'unknown';
            try {
                gitCommit = require('child_process').execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
            } catch (e) {
                gitCommit = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'N/A';
            }

            const corsOrigins = (process.env.CORS_ORIGIN || '*')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);

            return res.json({
                success: true,
                environment: process.env.NODE_ENV || 'staging',
                diagnostics_enabled: true,
                git_commit: gitCommit,
                request_origin: req.headers.origin || null,
                cors_origins_configured: corsOrigins,
                sdk_info: {
                    zalo_app_id_configured: Boolean(process.env.ZALO_APP_ID),
                    zalo_secret_configured: Boolean(process.env.ZALO_APP_SECRET),
                    zalo_secret_preview: process.env.ZALO_APP_SECRET ? 'PROTECTED (SHA256 Hash)' : 'NOT_SET'
                },
                db_status: isDbOk ? 'CONNECTED' : 'DISCONNECTED',
                timestamp: new Date().toISOString()
            });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }

    async getRecentLogs(req, res) {
        try {
            const hours = Math.min(24, Math.max(1, Number(req.query.hours) || 1));
            const { getRecentEvents } = require('../utils/stagingLogStore');
            const summary = getRecentEvents(hours);

            return res.json({
                success: true,
                environment: process.env.NODE_ENV || 'staging',
                ...summary
            });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }

    async verifyZaloUser(req, res) {
        const { access_token } = req.body || {};
        if (!access_token) {
            return res.status(400).json({
                success: false,
                error: 'Thiếu access_token để xác thực với máy chủ Zalo!'
            });
        }

        const maskedToken = maskToken(access_token);

        try {
            // Xác thực token qua Zalo Graph API
            const result = await verifyZaloUserToken(access_token);
            return res.json({
                success: result.valid,
                masked_token: maskedToken,
                token_length: access_token.length,
                zalo_response: result.data || null,
                raw_status: result.status || (result.valid ? 200 : 400),
                raw_error: result.error || null,
                timestamp: new Date().toISOString()
            });
        } catch (err) {
            return res.status(502).json({
                success: false,
                masked_token: maskedToken,
                token_length: access_token.length,
                raw_status: 502,
                raw_error: err.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async decodeZaloLocation(req, res) {
        const { location_token, access_token } = req.body || {};
        if (!location_token) {
            return res.status(400).json({
                success: false,
                error: 'Thiếu location_token để giải mã vị trí Zalo!'
            });
        }

        const maskedToken = maskToken(location_token);

        try {
            const geo = await verifyZaloLocationToken({
                locationToken: location_token,
                userAccessToken: access_token
            });

            if (!geo) {
                return res.status(400).json({
                    success: false,
                    masked_token: maskedToken,
                    error: 'Không thể giải mã location token từ Zalo!',
                    timestamp: new Date().toISOString()
                });
            }

            return res.json({
                success: true,
                masked_token: maskedToken,
                decoded_data: geo,
                timestamp: new Date().toISOString()
            });
        } catch (err) {
            return res.status(400).json({
                success: false,
                masked_token: maskedToken,
                error: err.message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = new DiagnosticsController();
