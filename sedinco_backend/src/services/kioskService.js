/**
 * src/services/kioskService.js
 * 
 * Nghiệp vụ quản lý thiết bị Kiosk QR chấm công chuyên dụng
 * Thực thi Đề xuất 2 (Đã duyệt):
 * - Bảng riêng kiosk_devices
 * - Token/API key chỉ có quyền lấy QR
 * - Thu hồi được (Revocable)
 * - Rate limit chống spam/DDoS
 * - Ghi audit log đầy đủ
 */

const crypto = require('crypto');
const { query } = require('../config/db');
const { logAuditEvent } = require('../middlewares/authMiddleware');
const { generateDynamicQrToken } = require('../utils/dynamicQrHelper');

// Rate limiting in-memory: map of kiosk_id -> { count, firstRequest }
const kioskRateLimits = new Map();
const KIOSK_MAX_REQUESTS_PER_MINUTE = 60;
const KIOSK_RATE_WINDOW_MS = 60 * 1000;

function checkKioskRateLimit(kioskId) {
    const now = Date.now();
    let record = kioskRateLimits.get(kioskId);

    if (!record || (now - record.firstRequest > KIOSK_RATE_WINDOW_MS)) {
        record = { count: 1, firstRequest: now };
        kioskRateLimits.set(kioskId, record);
        return true;
    }

    record.count++;
    if (record.count > KIOSK_MAX_REQUESTS_PER_MINUTE) {
        return false;
    }

    return true;
}

class KioskService {
    /**
     * Đăng ký thiết bị Kiosk mới (Chỉ Admin)
     */
    async registerKiosk({ kiosk_name, branch_id = 1, created_by = 'admin' }) {
        if (!kiosk_name || typeof kiosk_name !== 'string' || kiosk_name.trim().length === 0) {
            const error = new Error('Tên thiết bị Kiosk là bắt buộc!');
            error.statusCode = 400;
            throw error;
        }

        // Sinh API key ngẫu nhiên an toàn: ksk_ + 48 hex chars (24 bytes)
        const apiKey = 'ksk_' + crypto.randomBytes(24).toString('hex');
        const branch = parseInt(branch_id, 10) || 1;

        const result = await query(
            `INSERT INTO kiosk_devices (kiosk_name, branch_id, api_key, is_active, created_by)
             VALUES (?, ?, ?, TRUE, ?)`,
            [kiosk_name.trim(), branch, apiKey, created_by]
        );

        const newId = result.insertId;

        // Ghi nhận Audit Log
        await logAuditEvent({
            actor_id: created_by,
            actor_role: 'admin',
            action: 'KIOSK_REGISTER',
            resource: 'kiosk',
            details: { kiosk_id: newId, kiosk_name: kiosk_name.trim(), branch_id: branch }
        });

        return {
            id: newId,
            kiosk_name: kiosk_name.trim(),
            branch_id: branch,
            api_key: apiKey,
            is_active: true
        };
    }

    /**
     * Danh sách tất cả Kiosk (Chỉ Admin)
     */
    async listKiosks() {
        const rows = await query(`
            SELECT id, kiosk_name, branch_id, is_active, created_by, last_seen_at, created_at,
                   CONCAT(SUBSTRING(api_key, 1, 8), '...') as masked_key
            FROM kiosk_devices 
            ORDER BY id DESC
        `);
        return rows || [];
    }

    /**
     * Thu hồi quyền thiết bị Kiosk (Chỉ Admin)
     */
    async revokeKiosk(id, actor_id = 'admin') {
        const kioskId = parseInt(id, 10);
        if (!kioskId) {
            const error = new Error('ID thiết bị Kiosk không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        const kiosks = await query('SELECT id, kiosk_name FROM kiosk_devices WHERE id = ?', [kioskId]);
        if (!kiosks || kiosks.length === 0) {
            const error = new Error('Không tìm thấy thiết bị Kiosk!');
            error.statusCode = 404;
            throw error;
        }

        await query('UPDATE kiosk_devices SET is_active = FALSE WHERE id = ?', [kioskId]);

        await logAuditEvent({
            actor_id,
            actor_role: 'admin',
            action: 'KIOSK_REVOKE',
            resource: 'kiosk',
            details: { kiosk_id: kioskId, kiosk_name: kiosks[0].kiosk_name }
        });

        return { success: true, message: `Đã thu hồi quyền Kiosk ${kiosks[0].kiosk_name} thành công!` };
    }

    /**
     * Sinh mã QR động cho Kiosk qua API key
     * Endpoint chuyên dụng độc lập, không cần tài khoản Admin/Accountant
     */
    async generateKioskQr(apiKey, ipAddress = '') {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
            const error = new Error('Thiếu x-kiosk-key API header!');
            error.statusCode = 401;
            throw error;
        }

        const kiosks = await query('SELECT * FROM kiosk_devices WHERE api_key = ? LIMIT 1', [apiKey.trim()]);
        if (!kiosks || kiosks.length === 0) {
            const error = new Error('Khóa Kiosk API không hợp lệ hoặc không tồn tại!');
            error.statusCode = 401;
            throw error;
        }

        const kiosk = kiosks[0];

        // Kiểm tra thu hồi
        if (!kiosk.is_active) {
            const error = new Error('Thiết bị Kiosk này đã bị thu hồi quyền hoạt động!');
            error.statusCode = 403;
            throw error;
        }

        // Kiểm tra Rate limit
        if (!checkKioskRateLimit(kiosk.id)) {
            const error = new Error('Tần suất yêu cầu QR của Kiosk vượt quá giới hạn cho phép (60 req/phút)!');
            error.statusCode = 429;
            throw error;
        }

        // Phát hiện cảnh báo khi IP thay đổi
        if (kiosk.last_ip && ipAddress && kiosk.last_ip !== ipAddress) {
            await logAuditEvent({
                actor_id: `kiosk:${kiosk.kiosk_name}`,
                actor_role: 'kiosk',
                action: 'KIOSK_IP_CHANGED',
                resource: 'kiosk',
                details: { kiosk_id: kiosk.id, old_ip: kiosk.last_ip, new_ip: ipAddress },
                ip_address: ipAddress
            });
            console.warn(`[CẢNH BÁO BẢO MẬT] Kiosk ${kiosk.kiosk_name} (ID: ${kiosk.id}) đổi địa chỉ IP: ${kiosk.last_ip} -> ${ipAddress}`);
        }

        // Cập nhật last_seen_at và last_ip
        await query(
            'UPDATE kiosk_devices SET last_seen_at = NOW(), last_ip = COALESCE(?, last_ip) WHERE id = ?',
            [ipAddress || null, kiosk.id]
        );

        // Sinh QR token (30s TTL) gắn kiosk_id (QR v2)
        const qrData = generateDynamicQrToken(kiosk.branch_id, 30, kiosk.id);
        await query(
            'INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at) VALUES (?, ?, ?)',
            [qrData.token, qrData.branchId, qrData.expiresAt]
        );

        // Ghi nhận Audit Log
        await logAuditEvent({
            actor_id: `kiosk:${kiosk.kiosk_name}`,
            actor_role: 'kiosk',
            action: 'KIOSK_GENERATE_QR',
            resource: 'attendance',
            details: { branchId: kiosk.branch_id, kioskId: kiosk.id, ip: ipAddress }
        });

        return {
            token: qrData.token,
            branchId: qrData.branchId,
            expiresAt: qrData.expiresAt.toISOString(),
            ttlSeconds: qrData.ttlSeconds
        };
    }

    /**
     * Xoay khóa API Kiosk (Chỉ Admin)
     */
    async rotateApiKey(id, actor_id = 'admin') {
        const kioskId = parseInt(id, 10);
        if (!kioskId) {
            const error = new Error('ID thiết bị Kiosk không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        const kiosks = await query('SELECT id, kiosk_name FROM kiosk_devices WHERE id = ?', [kioskId]);
        if (!kiosks || kiosks.length === 0) {
            const error = new Error('Không tìm thấy thiết bị Kiosk!');
            error.statusCode = 404;
            throw error;
        }

        const newApiKey = 'ksk_' + crypto.randomBytes(24).toString('hex');
        await query('UPDATE kiosk_devices SET api_key = ? WHERE id = ?', [newApiKey, kioskId]);

        await logAuditEvent({
            actor_id,
            actor_role: 'admin',
            action: 'KIOSK_KEY_ROTATE',
            resource: 'kiosk',
            details: { kiosk_id: kioskId, kiosk_name: kiosks[0].kiosk_name }
        });

        return {
            success: true,
            id: kioskId,
            kiosk_name: kiosks[0].kiosk_name,
            api_key: newApiKey,
            message: 'Đã xoay khóa Kiosk thành công!'
        };
    }

    /**
     * Phương án A: Kiểm tra trạng thái mã QR hiện tại (polling mỗi 2-3s)
     * Giúp Kiosk đổi mã mới ngay khi mã cũ đã được sử dụng (Early Renewal)
     */
    async getKioskQrStatus(apiKey, sessionToken) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
            const error = new Error('Thiếu x-kiosk-key API header!');
            error.statusCode = 401;
            throw error;
        }

        if (!sessionToken || typeof sessionToken !== 'string') {
            const error = new Error('Thiếu session token cần kiểm tra!');
            error.statusCode = 400;
            throw error;
        }

        const kiosks = await query('SELECT id, is_active FROM kiosk_devices WHERE api_key = ? LIMIT 1', [apiKey.trim()]);
        if (!kiosks || kiosks.length === 0) {
            const error = new Error('Khóa Kiosk API không hợp lệ!');
            error.statusCode = 401;
            throw error;
        }

        if (!kiosks[0].is_active) {
            const error = new Error('Thiết bị Kiosk này đã bị thu hồi quyền hoạt động!');
            error.statusCode = 403;
            throw error;
        }

        const rows = await query('SELECT is_used, expires_at FROM dynamic_qr_sessions WHERE session_token = ? LIMIT 1', [sessionToken.trim()]);
        if (!rows || rows.length === 0) {
            return { is_used: true, is_expired: true, can_renew: true };
        }

        const row = rows[0];
        const isUsed = Boolean(row.is_used);
        const isExpired = new Date(row.expires_at) <= new Date();

        return {
            is_used: isUsed,
            is_expired: isExpired,
            can_renew: isUsed || isExpired
        };
    }

    /**
     * Dùng cho test cleanup
     */
    resetRateLimit() {
        kioskRateLimits.clear();
    }
}

module.exports = new KioskService();
