const crypto = require('crypto');
const env = require('../config/env');
const { query } = require('../config/db');
const { logAuditEvent } = require('../middlewares/authMiddleware');

/**
 * Tính chữ ký chuẩn theo tài liệu Zalo Mini App Open API Webhook (docs.zaloplatforms.com):
 * 1. Sắp xếp các key ở cấp top-level của payload theo Alphabet (A -> Z)
 * 2. Nối tuần tự các value (Object/Array dùng JSON.stringify) thành chuỗi content
 * 3. Băm SHA-256 chuỗi `${content}${apiKey}` ra hex
 */
function generateZEventSignature(data, apiKey) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return '';
    }
    const secret = String(apiKey || '').trim();
    if (!secret) {
        return '';
    }

    const keys = Object.keys(data).sort();
    let content = '';
    for (const k of keys) {
        const value = data[k];
        if (value === undefined || value === null) {
            content += '';
        } else if (typeof value === 'object') {
            content += JSON.stringify(value);
        } else {
            content += String(value);
        }
    }

    return crypto
        .createHash('sha256')
        .update(`${content}${secret}`)
        .digest('hex');
}

function getConfiguredWebhookSecret() {
    const openApiKey = String(process.env.ZALO_OPEN_API_KEY || env.ZALO_OPEN_API_KEY || '').trim();
    if (openApiKey) return openApiKey;

    const webhookSecret = String(process.env.ZALO_WEBHOOK_SECRET || env.ZALO_WEBHOOK_SECRET || '').trim();
    if (webhookSecret) return webhookSecret;

    const appSecret = String(process.env.ZALO_APP_SECRET || env.ZALO_APP_SECRET || '').trim();
    return appSecret;
}

function safeCompareHexSignature(actualHex, expectedHex) {
    const cleanActual = String(actualHex || '').trim().toLowerCase();
    const cleanExpected = String(expectedHex || '').trim().toLowerCase();
    if (!cleanActual || !cleanExpected || cleanActual.length !== cleanExpected.length) {
        return false;
    }
    const bufA = Buffer.from(cleanActual, 'utf8');
    const bufB = Buffer.from(cleanExpected, 'utf8');
    if (bufA.length !== bufB.length) {
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

class ZaloWebhookService {
    verifyIncomingRequest(payload, headerSignature) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length === 0) {
            return { ok: false, statusCode: 400, code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Payload Webhook không hợp lệ.' };
        }

        const secret = getConfiguredWebhookSecret();
        if (!secret) {
            return {
                ok: false,
                statusCode: 503,
                code: 'WEBHOOK_SECRET_NOT_CONFIGURED',
                message: 'Chưa cấu hình ZALO_OPEN_API_KEY hoặc ZALO_APP_SECRET trên server.'
            };
        }

        const sig = String(headerSignature || '').trim();
        if (!sig) {
            return {
                ok: false,
                statusCode: 401,
                code: 'MISSING_ZEVENT_SIGNATURE',
                message: 'Thiếu header xác thực X-ZEvent-Signature.'
            };
        }

        const expectedSig = generateZEventSignature(payload, secret);
        if (!safeCompareHexSignature(sig, expectedSig)) {
            return {
                ok: false,
                statusCode: 403,
                code: 'INVALID_ZEVENT_SIGNATURE',
                message: 'Chữ ký X-ZEvent-Signature không hợp lệ.'
            };
        }

        const configuredAppId = String(process.env.ZALO_APP_ID || env.ZALO_APP_ID || '').trim();
        const incomingAppId = payload.appId !== undefined && payload.appId !== null ? String(payload.appId).trim() : '';
        if (configuredAppId && incomingAppId && configuredAppId !== incomingAppId) {
            return {
                ok: false,
                statusCode: 403,
                code: 'ZALO_APP_ID_MISMATCH',
                message: 'appId trong Webhook không khớp với ứng dụng SEDINCO HR.'
            };
        }

        return { ok: true };
    }

    async processZaloWebhookEvent(payload, { ip_address = '' } = {}) {
        const eventName = String(payload?.event || payload?.event_name || 'unknown').trim();
        const eventLower = eventName.toLowerCase();
        const zaloUserId = payload?.userId ? String(payload.userId).trim() : '';

        if (eventLower === 'user.revoke.consent' && zaloUserId) {
            const matchedEmps = await query(
                'SELECT ma_nv, ho_ten FROM employees WHERE zalo_user_id = ? OR zalo_id = ?',
                [zaloUserId, zaloUserId]
            ).catch(() => []);

            const unlinkedIds = (matchedEmps || []).map((e) => e.ma_nv);
            if (unlinkedIds.length > 0) {
                await query(
                    'UPDATE employees SET zalo_id = NULL, zalo_user_id = NULL, token_version = COALESCE(token_version, 1) + 1 WHERE zalo_user_id = ? OR zalo_id = ?',
                    [zaloUserId, zaloUserId]
                );
            }

            await logAuditEvent({
                actor_id: unlinkedIds[0] || 'zalo_webhook',
                actor_role: 'system',
                action: 'ZALO_REVOKE_CONSENT',
                resource: 'zalo_webhook',
                details: {
                    event: eventName,
                    zalo_user_id_masked: zaloUserId.length > 4 ? `***${zaloUserId.slice(-4)}` : '***',
                    unlinked_employees: unlinkedIds,
                    timestamp: payload?.timestamp || Date.now()
                },
                ip_address
            });

            return { handled: true, event: eventName, unlinked_count: unlinkedIds.length };
        }

        if (eventLower.includes('review')) {
            const versionStr = payload?.version || payload?.versionId || '';
            const statusStr = payload?.status || payload?.reviewStatus || '';
            const title = '📢 Cập nhật xét duyệt Zalo Mini App';
            const message = `Zalo vừa gửi sự kiện "${eventName}"${versionStr ? ` (Phiên bản ${versionStr})` : ''}${statusStr ? ` — Trạng thái: ${statusStr}` : ''}.`;

            await query(
                `INSERT INTO user_notifications
                 (recipient_ma_nv, alert_key, type, category, severity, title, message, target_tab, target_id, is_read)
                 VALUES ('ADMIN', ?, 'ZALO_APP_REVIEW', 'system', 'info', ?, ?, 'settings', ?, 0)`,
                [`zalo_review_${Date.now()}`, title, message, String(versionStr || 'zalo')]
            ).catch(() => {});

            await logAuditEvent({
                actor_id: 'zalo_webhook',
                actor_role: 'system',
                action: 'ZALO_APP_REVIEW_EVENT',
                resource: 'zalo_webhook',
                details: {
                    event: eventName,
                    appId: payload?.appId || null,
                    version: versionStr || null,
                    status: statusStr || null,
                    timestamp: payload?.timestamp || Date.now()
                },
                ip_address
            });

            return { handled: true, event: eventName };
        }

        await logAuditEvent({
            actor_id: 'zalo_webhook',
            actor_role: 'system',
            action: 'ZALO_WEBHOOK_EVENT',
            resource: 'zalo_webhook',
            details: {
                event: eventName,
                appId: payload?.appId || null,
                timestamp: payload?.timestamp || Date.now()
            },
            ip_address
        });

        return { handled: true, event: eventName };
    }
}

module.exports = new ZaloWebhookService();
module.exports.generateZEventSignature = generateZEventSignature;
