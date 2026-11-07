/**
 * tools/lib/dbSafetyGuard.js
 * 
 * Chốt chặn an toàn cho mọi công cụ phá hủy (làm sạch DB, seed, purge, runner).
 * Tuân thủ nghiêm ngặt Quy Tắc An Toàn G9:
 * 1. Chỉ chạy khi tên DB bằng CHÍNH XÁC giá trị ALLOW_DESTRUCTIVE_DB (không dùng wildcard).
 * 2. Tên DB bắt buộc phải chứa chuỗi con "test".
 * 3. Tuyệt đối từ chối nếu tên DB là database production (sedinco_hr hoặc không chứa "test").
 * 4. Mọi kết nối cloud in host/DB đã che một phần (masking), TUYỆT ĐỐI KHÔNG in secret.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function maskString(str, visibleStart = 3, visibleEnd = 4) {
    if (!str || typeof str !== 'string') return '***';
    if (str.length <= visibleStart + visibleEnd) return '***';
    return str.substring(0, visibleStart) + '***' + str.substring(str.length - visibleEnd);
}

function hashHost(host) {
    if (!host || typeof host !== 'string') return '';
    return crypto.createHash('sha256').update(host.trim().toLowerCase()).digest('hex');
}

function getProductionHostHash() {
    if (process.env.PROD_DB_HOST_HASH) {
        return process.env.PROD_DB_HOST_HASH;
    }
    // Tìm trong file cấu hình production nếu có (không in giá trị)
    const possibleProdEnvPaths = [
        path.resolve(__dirname, '../../.env.production'),
        path.resolve(__dirname, '../../sedinco_backend/.env.production')
    ];
    for (const p of possibleProdEnvPaths) {
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            const match = content.match(/^DB_HOST\s*=\s*(.*)$/m);
            if (match && match[1]) {
                const val = match[1].trim().replace(/^["']|["']$/g, '');
                return hashHost(val);
            }
        }
    }
    return null;
}

function formatHost(host) {
    if (!host || typeof host !== 'string') return '***';
    const h = host.trim();
    if (h === '127.0.0.1' || h === 'localhost' || h === '::1') {
        return h;
    }
    const parts = h.split('.');
    if (parts.length >= 2) {
        const suffix = parts.slice(-2).join('.');
        return `***.${suffix}`;
    }
    return maskString(h, 2, 2);
}

function assertDestructiveDbAllowed(targetDbName, targetHost = 'localhost') {
    const allowDestructiveDb = process.env.ALLOW_DESTRUCTIVE_DB;

    if (!allowDestructiveDb || typeof allowDestructiveDb !== 'string' || allowDestructiveDb.trim() === '') {
        throw new Error(
            '[CHỐT CHẶN AN TOÀN G9] Thao tác phá hủy bị TỪ CHỐI! ' +
            'Biến môi trường ALLOW_DESTRUCTIVE_DB chưa được thiết lập. ' +
            'Vui lòng chỉ định rõ ràng ALLOW_DESTRUCTIVE_DB=<tên_chính_xác_db_test>.'
        );
    }

    if (targetDbName !== allowDestructiveDb) {
        throw new Error(
            `[CHỐT CHẶN AN TOÀN G9] Thao tác phá hủy bị TỪ CHỐI! ` +
            `Tên CSDL mục tiêu "${targetDbName}" KHÔNG KHỚP CHÍNH XÁC với ALLOW_DESTRUCTIVE_DB="${allowDestructiveDb}".`
        );
    }

    if (!targetDbName.toLowerCase().includes('test')) {
        throw new Error(
            `[CHỐT CHẶN AN TOÀN G9] Thao tác phá hủy bị TỪ CHỐI! ` +
            `Tên CSDL "${targetDbName}" KHÔNG CHỨA chữ "test". Tuyệt đối không thao tác trên database production.`
        );
    }

    // Kiểm tra trùng lặp với host Production qua băm SHA-256 (không in giá trị)
    const prodHostHash = getProductionHostHash();
    if (prodHostHash && hashHost(targetHost) === prodHostHash) {
        throw new Error(
            `[CHỐT CHẶN AN TOÀN G9] Thao tác phá hủy bị TỪ CHỐI! ` +
            `Máy chủ mục tiêu trùng khớp với máy chủ Production (đối soát băm SHA-256: ${maskString(prodHostHash, 4, 4)}). Tuyệt đối cấm kết nối tới CSDL Production!`
        );
    }

    const isLocalHost = targetHost === '127.0.0.1' || targetHost === 'localhost' || targetHost === '::1';

    // Chốt chặn so sánh HOST khi ở chế độ test cục bộ hoặc khi chưa đặt NODE_ENV=staging
    if (!isLocalHost && process.env.NODE_ENV !== 'staging') {
        throw new Error(
            `[CHỐT CHẶN AN TOÀN G9] Thao tác bị TỪ CHỐI! ` +
            `Máy chủ mục tiêu "${formatHost(targetHost)}" là máy chủ Cloud nhưng NODE_ENV="${process.env.NODE_ENV}". ` +
            `Vui lòng đặt rõ ràng NODE_ENV=staging (và nạp .env.staging) trước khi kết nối tới Cloud.`
        );
    }

    // Khi ở chế độ staging: kiểm tra đuôi host hợp lệ (mặc định .aivencloud.com)
    if (process.env.NODE_ENV === 'staging') {
        const allowedSuffix = process.env.STAGING_HOST_SUFFIX || '.aivencloud.com';
        if (!targetHost.endsWith(allowedSuffix)) {
            throw new Error(
                `[CHỐT CHẶN AN TOÀN G9] Thao tác bị TỪ CHỐI! ` +
                `Máy chủ Staging "${formatHost(targetHost)}" không kết thúc bằng "${allowedSuffix}".`
            );
        }
    }

    console.log(`[SAFETY CHECK G9 PASSED] Máy chủ mục tiêu: ${formatHost(targetHost)} | CSDL: ${targetDbName} (Đã đối soát khớp ALLOW_DESTRUCTIVE_DB)`);
}

module.exports = {
    assertDestructiveDbAllowed,
    maskString,
    formatHost,
    hashHost
};
