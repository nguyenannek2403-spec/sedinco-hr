/**
 * G7 Security Hardening Tests (Mục A.1):
 * - Bỏ mọi giá trị mặc định kiểu emp.password || '123456'
 * - Tài khoản không có hash bcrypt hợp lệ KHÔNG đăng nhập được (trả lỗi chung, ghi audit log)
 * - comparePasswordAsync không còn nhánh so sánh chuỗi thô
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Chốt chặn CSDL kiểm thử
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
if (!DB_NAME.includes('test')) {
    throw new Error(`[CHỐT CHẶN AN TOÀN] DB_NAME="${DB_NAME}" không chứa "test"! Hủy bỏ kiểm thử.`);
}

const { query } = require('../src/config/db');
const authService = require('../src/services/authService');
const { hashPassword, comparePasswordAsync, isBcryptHash } = require('../src/utils/passwordHelper');

const TEST_EMP_G7_PLAIN = 'EMP_G7_PLAIN_01';
const TEST_EMP_G7_NULL = 'EMP_G7_NULL_01';
const TEST_EMP_G7_BCRYPT = 'EMP_G7_BCRYPT_01';
const TEST_ADM_G7_PLAIN = 'ADM_G7_PLAIN_01';

describe('G7: Kiểm Thử Chặn Tài Khoản Không Có Bcrypt Hash Hợp Lệ (Mục A.1)', () => {
    beforeEach(async () => {
        await authService.resetRateLimitState();
    });

    before(async () => {
        await authService.resetRateLimitState();
        // 1. Tài khoản công nhân có password plaintext '123456' (chưa băm bcrypt)
        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'G7 Worker Plaintext', '123456', 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password = '123456', status = 'active', is_locked = 0`,
            [TEST_EMP_G7_PLAIN]);

        // 2. Tài khoản công nhân có password là NULL
        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'G7 Worker Null Pass', NULL, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password = NULL, status = 'active', is_locked = 0`,
            [TEST_EMP_G7_NULL]);

        // 3. Tài khoản công nhân có password băm bcrypt hợp lệ
        const validHash = hashPassword('Sedinco@2026');
        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'G7 Worker Bcrypt Valid', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`,
            [TEST_EMP_G7_BCRYPT, validHash]);

        // 4. Tài khoản Admin có password plaintext '123456'
        await query(`INSERT INTO admins (username, password, ho_ten)
            VALUES (?, '123456', 'G7 Admin Plaintext')
            ON DUPLICATE KEY UPDATE password = '123456'`,
            [TEST_ADM_G7_PLAIN]);
    });

    after(async () => {
        await query('DELETE FROM employees WHERE ma_nv IN (?, ?, ?)',
            [TEST_EMP_G7_PLAIN, TEST_EMP_G7_NULL, TEST_EMP_G7_BCRYPT]).catch(() => {});
        await query('DELETE FROM admins WHERE username = ?',
            [TEST_ADM_G7_PLAIN]).catch(() => {});
        await query('DELETE FROM audit_logs WHERE actor_id IN (?, ?, ?, ?)',
            [TEST_EMP_G7_PLAIN, TEST_EMP_G7_NULL, TEST_EMP_G7_BCRYPT, TEST_ADM_G7_PLAIN]).catch(() => {});
    });

    it('TC-G7-AUTH-NO-BCRYPT-REJECT-01: Tài khoản có mật khẩu plaintext KHÔNG được đăng nhập (trả lỗi chung, ghi audit log)', async () => {
        const res = await authService.employeeLogin(TEST_EMP_G7_PLAIN, '123456', '127.0.0.1');
        assert.strictEqual(res.success, false, 'Tài khoản có mật khẩu plaintext phải bị từ chối đăng nhập!');
        assert.strictEqual(res.message, authService.GENERIC_LOGIN_ERROR);

        // Kiểm tra audit log có ghi nhận reason: invalid_password_hash
        const logs = await query(
            'SELECT details FROM audit_logs WHERE actor_id = ? AND action = "LOGIN_FAILED" ORDER BY id DESC LIMIT 1',
            [TEST_EMP_G7_PLAIN]
        );
        assert.ok(logs && logs.length > 0, 'Phải ghi audit log cho sự kiện đăng nhập thất bại');
        const details = typeof logs[0].details === 'string' ? JSON.parse(logs[0].details) : logs[0].details;
        assert.strictEqual(details.reason, 'invalid_password_hash', 'Audit log phải ghi đúng reason = invalid_password_hash');
    });

    it('TC-G7-AUTH-NULL-PASSWORD-REJECT-02: Tài khoản có password là NULL không rơi vào fallback 123456 và bị từ chối đăng nhập', async () => {
        const res = await authService.employeeLogin(TEST_EMP_G7_NULL, '123456', '127.0.0.1');
        assert.strictEqual(res.success, false, 'Tài khoản có password NULL tuyệt đối không được fallback về 123456!');
        assert.strictEqual(res.message, authService.GENERIC_LOGIN_ERROR);

        const logs = await query(
            'SELECT details FROM audit_logs WHERE actor_id = ? AND action = "LOGIN_FAILED" ORDER BY id DESC LIMIT 1',
            [TEST_EMP_G7_NULL]
        );
        assert.ok(logs && logs.length > 0, 'Phải ghi audit log cho sự kiện đăng nhập thất bại của tài khoản NULL password');
        const details = typeof logs[0].details === 'string' ? JSON.parse(logs[0].details) : logs[0].details;
        assert.strictEqual(details.reason, 'invalid_password_hash');
    });

    it('TC-G7-AUTH-ADMIN-NO-BCRYPT-REJECT-03: Tài khoản Admin có mật khẩu plaintext bị từ chối đăng nhập và ghi audit log', async () => {
        const res = await authService.adminLogin(TEST_ADM_G7_PLAIN, '123456', '127.0.0.1');
        assert.strictEqual(res.success, false, 'Admin có mật khẩu plaintext phải bị từ chối đăng nhập!');
        assert.strictEqual(res.message, authService.GENERIC_LOGIN_ERROR);

        const logs = await query(
            'SELECT details FROM audit_logs WHERE actor_id = ? AND action = "ADMIN_LOGIN_FAILED" ORDER BY id DESC LIMIT 1',
            [TEST_ADM_G7_PLAIN]
        );
        assert.ok(logs && logs.length > 0, 'Phải ghi audit log cho admin login thất bại');
        const details = typeof logs[0].details === 'string' ? JSON.parse(logs[0].details) : logs[0].details;
        assert.strictEqual(details.reason, 'invalid_password_hash');
    });

    it('TC-G7-AUTH-BCRYPT-SUCCESS-04: Tài khoản có hash bcrypt hợp lệ đăng nhập thành công', async () => {
        const res = await authService.employeeLogin(TEST_EMP_G7_BCRYPT, 'Sedinco@2026', '127.0.0.1');
        assert.strictEqual(res.success, true, 'Đăng nhập mật khẩu bcrypt hợp lệ phải thành công!');
        assert.ok(res.data && res.data.token, 'Phải trả về JWT Token hợp lệ');
    });

    it('TC-G7-COMPARE-ASYNC-NO-PLAIN-05: comparePasswordAsync từ chối mật khẩu nếu storedPass không phải là hash bcrypt', async () => {
        // Trực tiếp kiểm thử hàm comparePasswordAsync
        const matchPlain = await comparePasswordAsync('123456', '123456');
        assert.strictEqual(matchPlain, false, 'comparePasswordAsync tuyệt đối không so sánh chuỗi thô!');

        const validHash = hashPassword('123456');
        const matchBcrypt = await comparePasswordAsync('123456', validHash);
        assert.strictEqual(matchBcrypt, true, 'comparePasswordAsync so sánh chuẩn xác hash bcrypt!');
    });
});
