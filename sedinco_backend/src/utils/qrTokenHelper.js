/**
 * Dynamic Expiring QR Token Helper cho Smart Attendance (Phase 1)
 * - Ký HMAC-SHA256 phía server bằng QR_SECRET (hoặc khóa dẫn xuất từ JWT_SECRET trong dev/test).
 * - Mỗi QR token chứa branch_id, branch_name, nonce duy nhất, iat, exp (giới hạn 30..300 giây) và múi giờ Asia/Ho_Chi_Minh.
 * - Kết hợp kiểm tra nonce vào idempotency_keys để chống replay attack tuyệt đối.
 */

const crypto = require('crypto');
const { formatVietnamDateTime } = require('./timeHelper');

const TOKEN_PREFIX = 'SEDQR1';

function getQrSigningKey() {
    const rawQrSecret = process.env.QR_SECRET ? String(process.env.QR_SECRET).trim() : '';
    if (rawQrSecret.length >= 32) {
        return rawQrSecret;
    }
    const jwtSecret = process.env.JWT_SECRET ? String(process.env.JWT_SECRET).trim() : '';
    if (jwtSecret.length >= 32) {
        return crypto.createHmac('sha256', jwtSecret).update('sedinco-qr-attendance-v1').digest('hex');
    }
    if (process.env.NODE_ENV === 'test') {
        return 'sedinco-qr-test-secret-key-min-32-chars-v1';
    }
    throw new Error('QR_SECRET hoặc JWT_SECRET chưa được cấu hình an toàn để ký mã QR!');
}

function clampTtlSeconds(rawTtl) {
    const n = Number(rawTtl);
    if (!Number.isFinite(n)) return 90;
    return Math.min(300, Math.max(30, Math.round(n)));
}

function generateAttendanceQrToken({
    branchId = 'loc_hq_1',
    branchName = 'Trụ sở chính',
    ttlSeconds = 90,
    issuedBy = 'admin',
    nowEpochSec = Math.floor(Date.now() / 1000)
} = {}) {
    const cleanBranchId = String(branchId || 'loc_hq_1').trim().slice(0, 64) || 'loc_hq_1';
    const cleanBranchName = String(branchName || cleanBranchId).trim().slice(0, 120);
    const ttl = clampTtlSeconds(ttlSeconds);
    const iat = Math.floor(nowEpochSec);
    const exp = iat + ttl;
    const nonce = crypto.randomBytes(12).toString('base64url');

    const payload = {
        v: 1,
        branch_id: cleanBranchId,
        nonce,
        iat,
        exp,
        tz: 'Asia/Ho_Chi_Minh'
    };

    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto
        .createHmac('sha256', getQrSigningKey())
        .update(`${TOKEN_PREFIX}.${body}`)
        .digest('base64url');

    const qrToken = `${TOKEN_PREFIX}.${body}.${sig}`;

    return {
        qr_token: qrToken,
        branch_id: cleanBranchId,
        branch_name: cleanBranchName,
        nonce,
        iat,
        exp,
        ttl_seconds: ttl,
        issued_by: issuedBy,
        issued_at_vn: formatVietnamDateTime(new Date(iat * 1000)),
        expires_at_vn: formatVietnamDateTime(new Date(exp * 1000)),
        timezone: 'Asia/Ho_Chi_Minh'
    };
}

function verifyAttendanceQrToken(rawToken, nowEpochSec = Math.floor(Date.now() / 1000)) {
    if (!rawToken || typeof rawToken !== 'string') {
        const err = new Error('Mã QR chấm công không hợp lệ hoặc bị trống!');
        err.statusCode = 400;
        err.code = 'INVALID_QR_TOKEN';
        throw err;
    }

    const parts = rawToken.trim().split('.');
    if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
        const err = new Error('Định dạng mã QR chấm công không đúng chuẩn Sedinco!');
        err.statusCode = 400;
        err.code = 'INVALID_QR_TOKEN';
        throw err;
    }

    const [, body, signature] = parts;
    const expectedSig = crypto
        .createHmac('sha256', getQrSigningKey())
        .update(`${TOKEN_PREFIX}.${body}`)
        .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        const err = new Error('Chữ ký mã QR chấm công không hợp lệ hoặc đã bị chỉnh sửa!');
        err.statusCode = 403;
        err.code = 'INVALID_QR_SIGNATURE';
        throw err;
    }

    let payload;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        const err = new Error('Không thể giải mã nội dung mã QR chấm công!');
        err.statusCode = 400;
        err.code = 'INVALID_QR_TOKEN';
        throw err;
    }

    if (!payload || !payload.branch_id || !payload.nonce || !payload.exp) {
        const err = new Error('Dữ liệu bên trong mã QR chấm công bị thiếu thông tin bắt buộc!');
        err.statusCode = 400;
        err.code = 'INVALID_QR_TOKEN';
        throw err;
    }

    const nowSec = Math.floor(nowEpochSec);
    if (Number(payload.exp) < nowSec) {
        const err = new Error('Mã QR chấm công đã hết hạn! Vui lòng quét mã QR mới nhất trên màn hình chi nhánh.');
        err.statusCode = 400;
        err.code = 'QR_TOKEN_EXPIRED';
        throw err;
    }

    return {
        valid: true,
        branch_id: String(payload.branch_id),
        nonce: String(payload.nonce),
        iat: Number(payload.iat),
        exp: Number(payload.exp),
        timezone: payload.tz || 'Asia/Ho_Chi_Minh'
    };
}

module.exports = {
    TOKEN_PREFIX,
    generateAttendanceQrToken,
    verifyAttendanceQrToken
};
