/**
 * Kiểm tra & chuẩn hóa ảnh đại diện đã nén phía Client (WebP/JPEG/PNG Data URL <= 45.000 ký tự),
 * đường dẫn /api/media/<uuid>/access, hoặc URL Cloudinary hợp lệ đã được upload qua backend.
 * Cho phép null / chuỗi rỗng để xóa ảnh đại diện về mặc định.
 */

const { isTrustedCloudinaryUrl, isSecureMediaAccessPath, inspectBufferMagicBytes } = require('./mediaValidator');

const MAX_AVATAR_DATA_URL_LENGTH = 45000;
const VALID_AVATAR_DATA_URL_REGEX = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/i;

function sanitizeAvatarInput(rawValue) {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
        return null;
    }
    if (typeof rawValue !== 'string') {
        const err = new Error('Dữ liệu ảnh đại diện không hợp lệ!');
        err.statusCode = 400;
        throw err;
    }
    const trimmed = rawValue.trim();
    if (!trimmed) return null;

    if (isTrustedCloudinaryUrl(trimmed) || isSecureMediaAccessPath(trimmed)) {
        return trimmed;
    }

    const match = trimmed.match(VALID_AVATAR_DATA_URL_REGEX);
    if (!match) {
        const err = new Error('Định dạng ảnh đại diện không hợp lệ (chỉ hỗ trợ URL Cloudinary hoặc ảnh WebP/JPEG/PNG hợp lệ)!');
        err.statusCode = 400;
        err.code = 'INVALID_AVATAR_FORMAT';
        throw err;
    }

    if (trimmed.length > MAX_AVATAR_DATA_URL_LENGTH) {
        const err = new Error('Dung lượng ảnh đại diện sau nén vượt quá giới hạn cho phép');
        err.statusCode = 400;
        err.code = 'AVATAR_TOO_LARGE';
        throw err;
    }

    const buf = Buffer.from(match[2], 'base64');
    const sig = inspectBufferMagicBytes(buf);
    if (!sig.valid || !sig.detectedMime || !sig.detectedMime.startsWith('image/')) {
        const err = new Error('Dữ liệu ảnh đại diện không khớp định dạng ảnh hợp lệ!');
        err.statusCode = 400;
        err.code = 'INVALID_AVATAR_SIGNATURE';
        throw err;
    }

    return trimmed;
}

module.exports = {
    MAX_AVATAR_DATA_URL_LENGTH,
    sanitizeAvatarInput
};
