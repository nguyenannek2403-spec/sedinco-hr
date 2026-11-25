/**
 * Bộ kiểm tra chữ ký nhị phân (Magic Bytes), khớp MIME/Extension, chống tệp thực thi / SVG / HTML / JS / PDF độc hại
 * và chống lưu file nhị phân lớn trực tiếp vào Database.
 */

const crypto = require('crypto');
const path = require('path');

const CLOUDINARY_URL_REGEX = /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/(image|raw|video)\/(upload|authenticated|private)\/[^\s"'<>]+$/i;
const SECURE_MEDIA_PATH_REGEX = /^\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/access$/i;
const COMPACT_IMAGE_DATA_URL_REGEX = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i;

const DANGEROUS_EXTENSIONS = new Set([
    '.exe', '.dll', '.bat', '.cmd', '.sh', '.bash', '.ps1', '.vbs', '.js', '.mjs', '.cjs',
    '.ts', '.jsx', '.tsx', '.html', '.htm', '.xhtml', '.svg', '.xml', '.php', '.py', '.rb',
    '.jar', '.apk', '.msi', '.app', '.dmg', '.iso', '.scr', '.pif', '.com', '.hta'
]);

const EXT_TO_ALLOWED_MIMES = {
    '.jpg': ['image/jpeg'],
    '.jpeg': ['image/jpeg'],
    '.png': ['image/png'],
    '.webp': ['image/webp'],
    '.pdf': ['application/pdf'],
    '.mp4': ['video/mp4'],
    '.m4v': ['video/mp4'],
    '.mov': ['video/mp4'],
    '.webm': ['video/webm'],
    '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    '.csv': ['text/csv']
};

const MIME_TO_CANONICAL_EXT = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/csv': 'csv'
};

const MAX_IMAGE_WIDTH = 12000;
const MAX_IMAGE_HEIGHT = 12000;
const MAX_IMAGE_PIXELS = 64_000_000;

function sha256Hex(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function sanitizeOriginalFilename(rawName) {
    if (!rawName || typeof rawName !== 'string') return null;
    const base = path.basename(rawName).replace(/[\x00-\x1F\x7F<>:"/\\|?*]/g, '_').trim();
    return base ? base.slice(0, 180) : null;
}

function detectExecutableOrScriptDanger(buf, ext = '') {
    if (!Buffer.isBuffer(buf) || buf.length < 2) return null;

    // 1. PE / DOS EXE/DLL: 'MZ'
    if (buf[0] === 0x4d && buf[1] === 0x5a) {
        return 'Phát hiện tệp thực thi Windows (MZ/EXE/DLL) bị cấm tải lên!';
    }
    // 2. ELF Linux Binary
    if (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
        return 'Phát hiện tệp nhị phân thực thi ELF bị cấm tải lên!';
    }
    // 3. Mach-O Binary
    if (
        buf.length >= 4 &&
        ((buf[0] === 0xfe && buf[1] === 0xed && buf[2] === 0xfa && (buf[3] === 0xce || buf[3] === 0xcf)) ||
            ((buf[0] === 0xce || buf[0] === 0xcf) && buf[1] === 0xfa && buf[2] === 0xed && buf[3] === 0xfe))
    ) {
        return 'Phát hiện tệp nhị phân thực thi Mach-O bị cấm tải lên!';
    }
    // 4. Shell script shebang '#!'
    if (buf[0] === 0x23 && buf[1] === 0x21) {
        return 'Phát hiện tệp script shell (#!) bị cấm tải lên!';
    }

    // 5. HTML / SVG / XML / JS active markup (kiểm tra phần đầu tệp và trường hợp nối đuôi polyglot ở phần cuối)
    const headText = buf.subarray(0, Math.min(buf.length, 4096)).toString('utf8').toLowerCase();
    const headTrimmed = headText.replace(/^\uFEFF/, '').trimStart();
    if (
        headTrimmed.startsWith('<!doctype html') ||
        headTrimmed.startsWith('<html') ||
        headTrimmed.startsWith('<script') ||
        headTrimmed.startsWith('<svg') ||
        headTrimmed.startsWith('<?xml')
    ) {
        if (headTrimmed.includes('<svg') || ext === '.svg') {
            return 'Tệp SVG không được phép tải lên vì nguy cơ chứa mã JavaScript/XSS!';
        }
        return 'Nội dung HTML/XML/Script bị chặn để đảm bảo an toàn hệ thống!';
    }

    if (headText.includes('<script') || headText.includes('<svg') || headText.includes('onload=') || headText.includes('onerror=')) {
        return 'Phát hiện mã HTML/SVG/JavaScript nhúng trái phép bên trong tệp!';
    }

    return null;
}

function parsePngDimensions(buf) {
    if (buf.length < 24) return null;
    if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
}

function parseJpegDimensions(buf) {
    let offset = 2;
    while (offset + 8 < buf.length) {
        if (buf[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = buf[offset + 1];
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
        }
        if (offset + 3 >= buf.length) break;
        const segmentLen = buf.readUInt16BE(offset + 2);
        if (segmentLen < 2) break;
        // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
        if (
            (marker >= 0xc0 && marker <= 0xc3) ||
            (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf)
        ) {
            if (offset + 8 < buf.length) {
                const height = buf.readUInt16BE(offset + 5);
                const width = buf.readUInt16BE(offset + 7);
                return { width, height };
            }
            break;
        }
        offset += 2 + segmentLen;
    }
    return null;
}

function inspectBufferMagicBytes(buf, { allowSpreadsheetOrCsv = false, originalFilename = '' } = {}) {
    if (!Buffer.isBuffer(buf) || buf.length < 12) {
        return { valid: false, detectedMime: null, ext: null, width: null, height: null };
    }

    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
        const dims = parseJpegDimensions(buf);
        return { valid: true, detectedMime: 'image/jpeg', ext: 'jpg', width: dims?.width || null, height: dims?.height || null };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a
    ) {
        const dims = parsePngDimensions(buf);
        return { valid: true, detectedMime: 'image/png', ext: 'png', width: dims?.width || null, height: dims?.height || null };
    }

    // WebP: RIFF....WEBP
    if (
        buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buf.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
        return { valid: true, detectedMime: 'image/webp', ext: 'webp', width: null, height: null };
    }

    // PDF: %PDF-1. or %PDF-2.
    const pdfPrefix = buf.subarray(0, 8).toString('ascii');
    if (pdfPrefix.startsWith('%PDF-1.') || pdfPrefix.startsWith('%PDF-2.')) {
        return { valid: true, detectedMime: 'application/pdf', ext: 'pdf', width: null, height: null };
    }

    // MP4 / QuickTime MOV: ....ftyp
    if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
        return { valid: true, detectedMime: 'video/mp4', ext: 'mp4', width: null, height: null };
    }

    // WebM / EBML: 1A 45 DF A3
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
        return { valid: true, detectedMime: 'video/webm', ext: 'webm', width: null, height: null };
    }

    if (allowSpreadsheetOrCsv) {
        const ext = path.extname(String(originalFilename || '')).toLowerCase();
        // XLSX (OpenXML ZIP): PK 03 04 + [Content_Types].xml marker
        if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
            const rawAscii = buf.subarray(0, Math.min(buf.length, 65536)).toString('latin1');
            if (rawAscii.includes('[Content_Types].xml') || rawAscii.includes('xl/')) {
                return {
                    valid: true,
                    detectedMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    ext: 'xlsx',
                    width: null,
                    height: null
                };
            }
        }
        // CSV: chỉ chấp nhận khi extension là .csv và không chứa null-byte
        if (ext === '.csv' && !buf.includes(0x00)) {
            return { valid: true, detectedMime: 'text/csv', ext: 'csv', width: null, height: null };
        }
    }

    return { valid: false, detectedMime: null, ext: null, width: null, height: null };
}

function inspectUploadedBuffer(
    buffer,
    {
        originalFilename = '',
        declaredMime = '',
        allowedMimes = ['image/jpeg', 'image/png', 'image/webp'],
        maxBytes = 10 * 1024 * 1024
    } = {}
) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        const err = new Error('Tệp tải lên bị rỗng (0 byte)! Hệ thống không tiếp nhận tệp trống.');
        err.statusCode = 400;
        err.code = 'EMPTY_FILE';
        throw err;
    }

    if (buffer.length > maxBytes) {
        const maxMb = (maxBytes / (1024 * 1024)).toFixed(1);
        const err = new Error(`Dung lượng tệp vượt quá giới hạn tối đa ${maxMb}MB cho loại nghiệp vụ này!`);
        err.statusCode = 413;
        err.code = 'MEDIA_TOO_LARGE';
        throw err;
    }

    const cleanName = sanitizeOriginalFilename(originalFilename);
    const ext = cleanName ? path.extname(cleanName).toLowerCase() : '';

    if (ext && DANGEROUS_EXTENSIONS.has(ext)) {
        const err = new Error(`Định dạng tệp "${ext}" bị chặn vì lý do an toàn hệ thống!`);
        err.statusCode = 400;
        err.code = 'DANGEROUS_FILE_EXTENSION';
        throw err;
    }

    const dangerReason = detectExecutableOrScriptDanger(buffer, ext);
    if (dangerReason) {
        const err = new Error(dangerReason);
        err.statusCode = 400;
        err.code = 'UNSAFE_ACTIVE_CONTENT';
        throw err;
    }

    if (buffer.length < 16) {
        const err = new Error('Tệp bị lỗi cấu trúc hoặc quá nhỏ, không thể xác thực nội dung!');
        err.statusCode = 400;
        err.code = 'INVALID_MEDIA_PAYLOAD';
        throw err;
    }

    const allowSpreadsheetOrCsv = allowedMimes.includes('text/csv') ||
        allowedMimes.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const sig = inspectBufferMagicBytes(buffer, {
        allowSpreadsheetOrCsv,
        originalFilename: cleanName || ''
    });

    if (!sig.valid || !sig.detectedMime) {
        const err = new Error('Chữ ký nhị phân (magic bytes) của tệp không khớp bất kỳ định dạng hợp lệ nào (JPEG, PNG, WebP, PDF, MP4/WebM)! Hệ thống đã chặn tệp nghi vấn.');
        err.statusCode = 400;
        err.code = 'INVALID_MEDIA_SIGNATURE';
        throw err;
    }

    if (!allowedMimes.includes(sig.detectedMime)) {
        const err = new Error(`Loại tệp thực tế (${sig.detectedMime}) không được phép cho mục nghiệp vụ này!`);
        err.statusCode = 400;
        err.code = 'UNSUPPORTED_MEDIA_TYPE';
        throw err;
    }

    // Kiểm tra phần mở rộng khớp chữ ký nhị phân thực tế (chống đổi đuôi giả mạo)
    if (ext && EXT_TO_ALLOWED_MIMES[ext]) {
        if (!EXT_TO_ALLOWED_MIMES[ext].includes(sig.detectedMime)) {
            const err = new Error(`Phần mở rộng tệp (${ext}) không khớp định dạng thực tế (${sig.detectedMime}). Nghi vấn giả mạo định dạng!`);
            err.statusCode = 400;
            err.code = 'MIME_EXTENSION_MISMATCH';
            throw err;
        }
    } else if (ext && ext !== `.${sig.ext}`) {
        const err = new Error(`Phần mở rộng tệp (${ext}) không hợp lệ hoặc không khớp nội dung tệp!`);
        err.statusCode = 400;
        err.code = 'MIME_EXTENSION_MISMATCH';
        throw err;
    }

    // Kiểm tra declared MIME (không tin tưởng MIME từ client khi xung đột chữ ký thật)
    const normalizedDeclared = String(declaredMime || '').trim().toLowerCase().split(';')[0];
    if (normalizedDeclared) {
        const canonicalDeclared = normalizedDeclared === 'image/jpg' ? 'image/jpeg' : normalizedDeclared;
        const compatibleGroup =
            canonicalDeclared === sig.detectedMime ||
            (canonicalDeclared === 'application/octet-stream') ||
            (canonicalDeclared === 'application/vnd.ms-excel' && sig.detectedMime === 'text/csv');
        if (!compatibleGroup) {
            const err = new Error(`MIME khai báo (${canonicalDeclared}) không khớp nội dung nhị phân thực tế (${sig.detectedMime})!`);
            err.statusCode = 400;
            err.code = 'MIME_SPOOF_DETECTED';
            throw err;
        }
    }

    // Kiểm tra chiều dài/rộng ảnh chống image decompression bomb
    if (sig.width && sig.height) {
        if (
            sig.width <= 0 ||
            sig.height <= 0 ||
            sig.width > MAX_IMAGE_WIDTH ||
            sig.height > MAX_IMAGE_HEIGHT ||
            sig.width * sig.height > MAX_IMAGE_PIXELS
        ) {
            const err = new Error('Kích thước điểm ảnh quá lớn hoặc bất thường, có nguy cơ gây quá tải bộ nhớ xử lý!');
            err.statusCode = 400;
            err.code = 'IMAGE_DIMENSIONS_UNSAFE';
            throw err;
        }
    }

    // Quét sâu PDF phòng chống mã JavaScript / hành động tự chạy / tệp nhúng độc hại
    if (sig.detectedMime === 'application/pdf') {
        const pdfScanText = buffer.toString('latin1');
        if (/\/(JavaScript|JS|Launch|OpenAction|AA|RichMedia)\b/i.test(pdfScanText)) {
            const err = new Error('Tài liệu PDF chứa script hoặc hành động tự thực thi bị cấm (/JavaScript, /Launch, /OpenAction)!');
            err.statusCode = 400;
            err.code = 'UNSAFE_PDF_ACTIVE_CONTENT';
            throw err;
        }
        if (!pdfScanText.includes('%%EOF')) {
            const err = new Error('Tài liệu PDF không đầy đủ hoặc bị cắt cụt (thiếu %%EOF)!');
            err.statusCode = 400;
            err.code = 'CORRUPT_PDF_FILE';
            throw err;
        }
    }

    return {
        buffer,
        bytes: buffer.length,
        detectedMime: sig.detectedMime,
        ext: MIME_TO_CANONICAL_EXT[sig.detectedMime] || sig.ext,
        width: sig.width || null,
        height: sig.height || null,
        originalFilename: cleanName,
        checksum: sha256Hex(buffer)
    };
}

function parseBase64ImageDataUrl(rawDataUrl, { maxDecodedBytes = 10 * 1024 * 1024 } = {}) {
    if (!rawDataUrl || typeof rawDataUrl !== 'string') {
        const err = new Error('Dữ liệu tệp tải lên không hợp lệ!');
        err.statusCode = 400;
        err.code = 'INVALID_MEDIA_PAYLOAD';
        throw err;
    }

    const trimmed = rawDataUrl.trim();
    const match = trimmed.match(COMPACT_IMAGE_DATA_URL_REGEX);
    if (!match) {
        const err = new Error('Chỉ hỗ trợ định dạng ảnh JPEG, PNG hoặc WebP hợp lệ!');
        err.statusCode = 400;
        err.code = 'UNSUPPORTED_MEDIA_TYPE';
        throw err;
    }

    const declaredSubtype = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
    const declaredMime = `image/${declaredSubtype}`;
    const b64Body = match[2];
    const buffer = Buffer.from(b64Body, 'base64');

    const inspected = inspectUploadedBuffer(buffer, {
        declaredMime,
        allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
        maxBytes: maxDecodedBytes
    });

    return {
        buffer: inspected.buffer,
        bytes: inspected.bytes,
        declaredMime,
        detectedMime: inspected.detectedMime,
        ext: inspected.ext,
        width: inspected.width,
        height: inspected.height,
        checksum: inspected.checksum,
        normalizedDataUrl: `data:${inspected.detectedMime};base64,${b64Body}`
    };
}

function isTrustedCloudinaryUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    return trimmed.length <= 1024 && CLOUDINARY_URL_REGEX.test(trimmed);
}

function isSecureMediaAccessPath(url) {
    if (!url || typeof url !== 'string') return false;
    return SECURE_MEDIA_PATH_REGEX.test(url.trim());
}

function extractAssetUuidFromMediaRef(url) {
    if (!url || typeof url !== 'string') return null;
    const m = url.trim().match(SECURE_MEDIA_PATH_REGEX);
    return m ? m[1].toLowerCase() : null;
}

/**
 * Kiểm tra & chuẩn hóa giá trị ảnh/minh chứng lưu trong cột DB:
 * - Chấp nhận đường dẫn bảo vệ /api/media/<uuid>/access (tài nguyên riêng tư)
 * - Chấp nhận HTTPS URL của Cloudinary (image/raw/video)
 * - Chấp nhận ảnh inline base64 CHỈ KHI đã qua kiểm tra magic-byte và <= maxInlineBytes
 */
function validateMediaReference(rawValue, { maxInlineBytes = 190 * 1024, allowNull = true } = {}) {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
        if (allowNull) return null;
        const err = new Error('Thiếu tệp minh chứng đính kèm!');
        err.statusCode = 400;
        err.code = 'MISSING_MEDIA';
        throw err;
    }

    if (typeof rawValue !== 'string') {
        const err = new Error('Định dạng dữ liệu minh chứng không hợp lệ!');
        err.statusCode = 400;
        err.code = 'INVALID_MEDIA_PAYLOAD';
        throw err;
    }

    const trimmed = rawValue.trim();
    if (!trimmed) {
        if (allowNull) return null;
        const err = new Error('Thiếu tệp minh chứng đính kèm!');
        err.statusCode = 400;
        throw err;
    }

    if (isSecureMediaAccessPath(trimmed) || isTrustedCloudinaryUrl(trimmed)) {
        return trimmed;
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const err = new Error('Chỉ chấp nhận đường dẫn media từ kho lưu trữ Cloudinary đã xác thực của hệ thống!');
        err.statusCode = 400;
        err.code = 'UNTRUSTED_MEDIA_URL';
        throw err;
    }

    if (trimmed.startsWith('data:image/')) {
        const parsed = parseBase64ImageDataUrl(trimmed, { maxDecodedBytes: maxInlineBytes });
        return parsed.normalizedDataUrl;
    }

    const err = new Error('Tệp đính kèm phải được tải qua hệ thống quản lý media tập trung (/api/media/upload)!');
    err.statusCode = 400;
    err.code = 'INVALID_MEDIA_FORMAT';
    throw err;
}

module.exports = {
    CLOUDINARY_URL_REGEX,
    SECURE_MEDIA_PATH_REGEX,
    DANGEROUS_EXTENSIONS,
    sha256Hex,
    sanitizeOriginalFilename,
    detectExecutableOrScriptDanger,
    inspectBufferMagicBytes,
    inspectUploadedBuffer,
    parseBase64ImageDataUrl,
    isTrustedCloudinaryUrl,
    isSecureMediaAccessPath,
    extractAssetUuidFromMediaRef,
    validateMediaReference
};
