/**
 * Tiện ích Sinh và Xác thực Mã QR Động (Dynamic QR Code Utility)
 * Sử dụng HMAC-SHA256 Nonce + Timestamp để chống chụp ảnh chia sẻ và Replay Attack
 */

const crypto = require('crypto');
const QR_SECRET = process.env.QR_SECRET || process.env.JWT_SECRET || 'sedinco-dynamic-qr-secure-salt-2026';

function generateDynamicQrToken(branchId = 1, ttlSeconds = 30) {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(8).toString('hex');
    const rawData = `${branchId}:${timestamp}:${nonce}`;
    const signature = crypto.createHmac('sha256', QR_SECRET).update(rawData).digest('base64url');
    const token = `sedinco:qr:v1:${branchId}:${timestamp}:${nonce}:${signature}`;
    const expiresAt = new Date((timestamp + ttlSeconds) * 1000);
    return {
        token,
        branchId,
        timestamp,
        nonce,
        expiresAt,
        ttlSeconds
    };
}

function verifyDynamicQrToken(token, maxAgeSeconds = 30) {
    if (!token || typeof token !== 'string') return { valid: false, reason: 'Token không hợp lệ' };
    const parts = token.split(':');
    if (parts.length !== 7 || parts[0] !== 'sedinco' || parts[1] !== 'qr' || parts[2] !== 'v1') {
        return { valid: false, reason: 'Định dạng mã QR không đúng chuẩn Sedinco' };
    }
    const branchId = parseInt(parts[3], 10);
    const timestamp = parseInt(parts[4], 10);
    const nonce = parts[5];
    const signature = parts[6];

    // 1. Kiểm tra chữ ký HMAC chống giả mạo
    const rawData = `${branchId}:${timestamp}:${nonce}`;
    const expectedSig = crypto.createHmac('sha256', QR_SECRET).update(rawData).digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expectedSigBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
        return { valid: false, reason: 'Chữ ký mã QR giả mạo hoặc không hợp lệ' };
    }

    // 2. Kiểm tra độ tuổi của mã QR (hết hạn sau maxAgeSeconds)
    const now = Math.floor(Date.now() / 1000);
    if (now - timestamp > maxAgeSeconds) {
        return { valid: false, reason: 'Mã QR đã hết hạn (Vượt quá 30 giây). Vui lòng quét mã mới trên màn hình!', expired: true };
    }

    return {
        valid: true,
        branchId,
        timestamp,
        nonce
    };
}

module.exports = {
    generateDynamicQrToken,
    verifyDynamicQrToken
};
