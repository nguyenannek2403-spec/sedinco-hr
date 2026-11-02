/**
 * Tiện ích Sinh và Xác thực Mã QR Động (Dynamic QR Code Utility)
 * Sử dụng HMAC-SHA256 Nonce + Timestamp + Kiosk ID để chống chụp ảnh chia sẻ và Replay Attack
 * 
 * HỖ TRỢ 2 PHIÊN BẢN (B4 - G5):
 * - v2 (Kiosk QR): Gắn trực tiếp kiosk_id vào token:
 *   sedinco:qr:v2:<branchId>:<kioskId>:<timestamp>:<nonce>:<signature>
 * - v1 (Legacy/Admin QR): Không có kiosk_id:
 *   sedinco:qr:v1:<branchId>:<timestamp>:<nonce>:<signature>
 */

const crypto = require('crypto');
const QR_SECRET = process.env.QR_SECRET || process.env.JWT_SECRET || 'sedinco-dynamic-qr-secure-salt-2026';

function generateDynamicQrToken(branchId = 1, ttlSeconds = 30, kioskId = null) {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(8).toString('hex');

    let token;
    let rawData;

    if (kioskId !== null && kioskId !== undefined) {
        const kId = parseInt(kioskId, 10);
        rawData = `${branchId}:${kId}:${timestamp}:${nonce}`;
        const signature = crypto.createHmac('sha256', QR_SECRET).update(rawData).digest('base64url');
        token = `sedinco:qr:v2:${branchId}:${kId}:${timestamp}:${nonce}:${signature}`;
    } else {
        rawData = `${branchId}:${timestamp}:${nonce}`;
        const signature = crypto.createHmac('sha256', QR_SECRET).update(rawData).digest('base64url');
        token = `sedinco:qr:v1:${branchId}:${timestamp}:${nonce}:${signature}`;
    }

    const expiresAt = new Date((timestamp + ttlSeconds) * 1000);
    return {
        token,
        branchId,
        kioskId: (kioskId !== null && kioskId !== undefined) ? parseInt(kioskId, 10) : null,
        version: (kioskId !== null && kioskId !== undefined) ? 'v2' : 'v1',
        timestamp,
        nonce,
        expiresAt,
        ttlSeconds
    };
}

function verifyDynamicQrToken(token, maxAgeSeconds = 30) {
    if (!token || typeof token !== 'string') return { valid: false, reason: 'Token không hợp lệ' };
    const parts = token.split(':');

    if (parts[0] !== 'sedinco' || parts[1] !== 'qr') {
        return { valid: false, reason: 'Định dạng mã QR không đúng chuẩn Sedinco' };
    }

    const version = parts[2];

    if (version === 'v2') {
        // v2: sedinco:qr:v2:<branchId>:<kioskId>:<timestamp>:<nonce>:<signature>
        if (parts.length !== 8) {
            return { valid: false, reason: 'Định dạng mã QR v2 không đúng chuẩn' };
        }
        const branchId = parseInt(parts[3], 10);
        const kioskId = parseInt(parts[4], 10);
        const timestamp = parseInt(parts[5], 10);
        const nonce = parts[6];
        const signature = parts[7];

        const rawData = `${branchId}:${kioskId}:${timestamp}:${nonce}`;
        const expectedSig = crypto.createHmac('sha256', QR_SECRET).update(rawData).digest('base64url');
        const sigBuf = Buffer.from(signature);
        const expectedSigBuf = Buffer.from(expectedSig);
        if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
            return { valid: false, reason: 'Chữ ký mã QR giả mạo hoặc không hợp lệ' };
        }

        const now = Math.floor(Date.now() / 1000);
        if (now - timestamp > maxAgeSeconds) {
            return { valid: false, reason: 'Mã QR đã hết hạn. Vui lòng quét mã mới trên màn hình!', expired: true };
        }

        return {
            valid: true,
            version: 'v2',
            branchId,
            kioskId,
            timestamp,
            nonce
        };
    } else if (version === 'v1') {
        // v1: sedinco:qr:v1:<branchId>:<timestamp>:<nonce>:<signature>
        if (parts.length !== 7) {
            return { valid: false, reason: 'Định dạng mã QR v1 không đúng chuẩn' };
        }
        const branchId = parseInt(parts[3], 10);
        const timestamp = parseInt(parts[4], 10);
        const nonce = parts[5];
        const signature = parts[6];

        const rawData = `${branchId}:${timestamp}:${nonce}`;
        const expectedSig = crypto.createHmac('sha256', QR_SECRET).update(rawData).digest('base64url');
        const sigBuf = Buffer.from(signature);
        const expectedSigBuf = Buffer.from(expectedSig);
        if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
            return { valid: false, reason: 'Chữ ký mã QR giả mạo hoặc không hợp lệ' };
        }

        const now = Math.floor(Date.now() / 1000);
        if (now - timestamp > maxAgeSeconds) {
            return { valid: false, reason: 'Mã QR đã hết hạn. Vui lòng quét mã mới trên màn hình!', expired: true };
        }

        return {
            valid: true,
            version: 'v1',
            branchId,
            kioskId: null,
            timestamp,
            nonce
        };
    }

    return { valid: false, reason: `Phiên bản QR không được hỗ trợ: ${version}` };
}

module.exports = {
    generateDynamicQrToken,
    verifyDynamicQrToken
};
