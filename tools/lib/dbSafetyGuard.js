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

function maskString(str, visibleStart = 3, visibleEnd = 4) {
    if (!str || typeof str !== 'string') return '***';
    if (str.length <= visibleStart + visibleEnd) return '***';
    return str.substring(0, visibleStart) + '***' + str.substring(str.length - visibleEnd);
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

    const maskedHost = maskString(targetHost, 4, 6);
    const maskedDb = maskString(targetDbName, 3, 4);
    console.log(`[SAFETY CHECK G9 PASSED] Máy chủ mục tiêu: ${maskedHost} | CSDL: ${maskedDb} (Đã đối soát khớp ALLOW_DESTRUCTIVE_DB)`);
}

module.exports = {
    assertDestructiveDbAllowed,
    maskString
};
