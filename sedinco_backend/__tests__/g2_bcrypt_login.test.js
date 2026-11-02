/**
 * G2 Cluster 2a: bcrypt + Login Hardening Tests
 * Đề xuất 5 (Đã duyệt): bcrypt + rate limit theo TÀI KHOẢN + thông báo lỗi chung + must_change_password
 * 
 * Quy trình: ĐỎ → XANH (viết test FAIL trước, rồi sửa code cho PASS)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Chốt chặn DB test
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
if (!DB_NAME.includes('test')) {
    throw new Error(`[CHỐT CHẶN] DB_NAME="${DB_NAME}" không chứa "test"! Hủy bỏ test.`);
}

const { query } = require('../src/config/db');
const authService = require('../src/services/authService');
const { hashPassword, comparePassword, isBcryptHash } = require('../src/utils/passwordHelper');

// Tài khoản test riêng biệt, không dùng chung với test khác
const TEST_EMP_BCRYPT = 'EMP_BCRYPT_01';
const TEST_ADMIN_BCRYPT = 'ADM_BCRYPT_01';

before(async () => {
    // Seed tài khoản test riêng
    const bcryptHash = hashPassword('securePass123');
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked) 
        VALUES (?, 'NV Test Bcrypt', ?, 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`, 
        [TEST_EMP_BCRYPT, bcryptHash]);

    // Tài khoản với mật khẩu mặc định 123456 (plaintext) → để test từ chối plaintext không có hash bcrypt
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked) 
        VALUES ('EMP_PLAIN_01', 'NV Plaintext', '123456', 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = '123456', status = 'active', is_locked = 0`);

    // Admin test (băm bcrypt hợp lệ)
    const adminHash = hashPassword('123456');
    await query(`INSERT INTO admins (username, password, ho_ten) 
        VALUES (?, ?, 'Admin Bcrypt Test')
        ON DUPLICATE KEY UPDATE password = VALUES(password)`, [TEST_ADMIN_BCRYPT, adminHash]);
});

after(async () => {
    // Dọn dẹp
    await query('DELETE FROM employees WHERE ma_nv IN (?, ?)', [TEST_EMP_BCRYPT, 'EMP_PLAIN_01']).catch(() => {});
    await query('DELETE FROM admins WHERE username = ?', [TEST_ADMIN_BCRYPT]).catch(() => {});
    // Reset rate limit state
    if (authService.resetRateLimitState) {
        authService.resetRateLimitState();
    }
});

// ─────────────────────────────────────────────────
// TC-G2-BCRYPT-01: Đăng nhập với mật khẩu bcrypt hash thành công
// ─────────────────────────────────────────────────
it('TC-G2-BCRYPT-01: Đăng nhập nhân viên có password bcrypt hash phải thành công', async () => {
    const result = await authService.employeeLogin(TEST_EMP_BCRYPT, 'securePass123', '127.0.0.1');
    assert.equal(result.success, true, 'Đăng nhập phải thành công với mật khẩu bcrypt');
    assert.ok(result.data?.token, 'Phải trả về JWT token');
});

// ─────────────────────────────────────────────────
// TC-G2-BCRYPT-02: Đăng nhập sai mật khẩu → thông báo chung chung (không tiết lộ "sai mật khẩu" vs "không tồn tại")
// ─────────────────────────────────────────────────
it('TC-G2-BCRYPT-02: Đăng nhập sai mật khẩu phải trả thông báo chung chung, không phân biệt sai MK hay không tồn tại', async () => {
    const wrongPass = await authService.employeeLogin(TEST_EMP_BCRYPT, 'wrongPassword', '127.0.0.1');
    assert.equal(wrongPass.success, false);
    
    const notExist = await authService.employeeLogin('KHONG_TON_TAI_999', 'anything', '127.0.0.1');
    assert.equal(notExist.success, false);
    
    // Cả hai phải có cùng thông báo lỗi chung chung
    assert.equal(wrongPass.message, notExist.message, 
        'Thông báo sai MK và không tồn tại phải giống nhau → chống user enumeration');
    // Không được chứa "không tồn tại" hay "sai mật khẩu" cụ thể
    assert.ok(!wrongPass.message.includes('không tồn tại'), 'Không được tiết lộ tài khoản không tồn tại');
    assert.ok(!wrongPass.message.includes('không chính xác'), 'Không được nói "mật khẩu không chính xác"');
});

// ─────────────────────────────────────────────────
// TC-G2-BCRYPT-03: Tài khoản có mật khẩu plaintext chưa băm bcrypt phải bị từ chối đăng nhập (G7 Hardening)
// ─────────────────────────────────────────────────
it('TC-G2-BCRYPT-03: Tài khoản có mật khẩu plaintext chưa băm bcrypt phải bị từ chối đăng nhập', async () => {
    // Trước khi login, password là plaintext '123456'
    const beforeRows = await query('SELECT password FROM employees WHERE ma_nv = ?', ['EMP_PLAIN_01']);
    assert.equal(isBcryptHash(beforeRows[0].password), false, 'Ban đầu là plaintext');

    // Login phải thất bại với lỗi chung (không chấp nhận plaintext)
    const result = await authService.employeeLogin('EMP_PLAIN_01', '123456', '127.0.0.1');
    assert.equal(result.success, false, 'Login plaintext phải bị từ chối');
    assert.ok(result.message, 'Phải trả thông báo lỗi chung');
});

// ─────────────────────────────────────────────────
// TC-G2-BCRYPT-04: must_change_password flag cho tài khoản có mật khẩu mặc định 123456 (đã băm bcrypt)
// ─────────────────────────────────────────────────
it('TC-G2-BCRYPT-04: Đăng nhập tài khoản có must_change_password=true phải trả cờ cảnh báo', async () => {
    // Tạo tài khoản mới với mật khẩu mặc định 123456 đã được băm bcrypt và flag must_change_password
    const defHash = hashPassword('123456');
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked, must_change_password)
        VALUES ('EMP_MCP_01', 'NV Phai Doi MK', ?, 'worker', 'active', 0, 1)
        ON DUPLICATE KEY UPDATE password = VALUES(password), must_change_password = 1`, [defHash]);
    
    const result = await authService.employeeLogin('EMP_MCP_01', '123456', '127.0.0.1');
    assert.equal(result.success, true, 'Vẫn phải đăng nhập thành công với mật khẩu bcrypt hợp lệ');
    assert.equal(result.data?.must_change_password, true, 'Phải trả cờ must_change_password = true');

    // Dọn
    await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_MCP_01']).catch(() => {});
});

// ─────────────────────────────────────────────────
// TC-G2-RATE-01: Rate limit theo TÀI KHOẢN - khóa sau 5 lần sai liên tục
// ─────────────────────────────────────────────────
it('TC-G2-RATE-01: Sau 5 lần đăng nhập sai liên tiếp, tài khoản bị tạm khóa đăng nhập 15 phút (HTTP 429 hoặc thông báo)', async () => {
    // Reset rate limit state trước khi test
    if (authService.resetRateLimitState) authService.resetRateLimitState();

    // Tạo tài khoản riêng cho test rate limit
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES ('EMP_RATE_01', 'NV Rate Limit', '123456', 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = '123456', status = 'active', is_locked = 0`);

    // Gửi 5 lần sai liên tục
    for (let i = 0; i < 5; i++) {
        await authService.employeeLogin('EMP_RATE_01', 'wrong_pass', '10.0.0.1');
    }

    // Lần thứ 6 phải bị chặn dù mật khẩu ĐÚNG
    const blocked = await authService.employeeLogin('EMP_RATE_01', '123456', '10.0.0.1');
    assert.equal(blocked.success, false, 'Phải bị từ chối sau 5 lần sai');
    assert.ok(
        blocked.message.includes('tạm khóa') || blocked.message.includes('thử lại sau') || blocked.statusCode === 429,
        'Phải có thông báo tạm khóa hoặc status 429'
    );

    // Dọn
    await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_RATE_01']).catch(() => {});
});

// ─────────────────────────────────────────────────
// TC-G2-RATE-02: Rate limit rộng theo IP (nhiều người chung IP)
// ─────────────────────────────────────────────────
it('TC-G2-RATE-02: IP rate limit rộng (50 lần/15 phút) không chặn nhầm khi nhiều nhân viên cùng IP', async () => {
    if (authService.resetRateLimitState) authService.resetRateLimitState();

    // Tạo tài khoản riêng cho test IP rate limit
    const hash = hashPassword('ipTestPass');
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES ('EMP_IP_01', 'NV IP Test', ?, 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`, [hash]);

    // Đăng nhập hợp lệ từ cùng IP → không bị chặn
    const result = await authService.employeeLogin('EMP_IP_01', 'ipTestPass', '10.0.0.99');
    assert.equal(result.success, true, 'Đăng nhập hợp lệ cùng IP với tài khoản khác nhau không bị chặn');

    // Dọn
    await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_IP_01']).catch(() => {});
});

// ─────────────────────────────────────────────────
// TC-G2-ADMIN-BCRYPT-01: Admin login cũng phải dùng bcrypt + thông báo chung
// ─────────────────────────────────────────────────
it('TC-G2-ADMIN-BCRYPT-01: Admin login sai mật khẩu phải trả thông báo chung chung giống employee login', async () => {
    const result = await authService.adminLogin(TEST_ADMIN_BCRYPT, 'wrong_pass', '127.0.0.1');
    assert.equal(result.success, false);

    const notExist = await authService.adminLogin('ADMIN_KHONG_CO', 'anything', '127.0.0.1');
    assert.equal(notExist.success, false);
    
    // Thông báo phải chung chung, giống nhau
    assert.equal(result.message, notExist.message, 'Admin login cũng phải thông báo chung');
    assert.ok(!result.message.includes('không tồn tại'), 'Không được tiết lộ admin không tồn tại');
});

// ─────────────────────────────────────────────────
// TC-G2-CHGPWD-01: changePassword phải dùng bcrypt compare và hash mật khẩu mới
// ─────────────────────────────────────────────────
it('TC-G2-CHGPWD-01: Đổi mật khẩu phải so sánh bằng bcrypt và lưu mật khẩu mới dạng bcrypt', async () => {
    // Đặt lại password dạng bcrypt hash cho test đổi mật khẩu
    const oldHash = hashPassword('oldpass123');
    await query('UPDATE employees SET password = ? WHERE ma_nv = ?', [oldHash, TEST_EMP_BCRYPT]);
    
    const currentUser = { ma_nv: TEST_EMP_BCRYPT, role: 'worker' };
    const result = await authService.changePassword(TEST_EMP_BCRYPT, 'oldpass123', 'newSecure456', currentUser);
    assert.equal(result.success, true, 'Đổi mật khẩu phải thành công');

    // Kiểm tra trong DB: mật khẩu mới phải là bcrypt hash
    const rows = await query('SELECT password FROM employees WHERE ma_nv = ?', [TEST_EMP_BCRYPT]);
    assert.equal(isBcryptHash(rows[0].password), true, 'Mật khẩu mới trong DB phải là bcrypt hash');

    // Đăng nhập lại bằng mật khẩu mới
    const loginResult = await authService.employeeLogin(TEST_EMP_BCRYPT, 'newSecure456', '127.0.0.1');
    assert.equal(loginResult.success, true, 'Đăng nhập bằng MK mới phải thành công');
});

// ─────────────────────────────────────────────────
// TC-G2-PERF-01: Đo thời gian đăng nhập bcrypt (phải < 500ms)
// ─────────────────────────────────────────────────
it('TC-G2-PERF-01: Thời gian đăng nhập bcrypt phải dưới 500ms', async () => {
    // Reset password thành bcrypt hash
    const hash = hashPassword('perfTest123');
    await query('UPDATE employees SET password = ? WHERE ma_nv = ?', [hash, TEST_EMP_BCRYPT]);

    const start = performance.now();
    const result = await authService.employeeLogin(TEST_EMP_BCRYPT, 'perfTest123', '127.0.0.1');
    const elapsed = performance.now() - start;

    assert.equal(result.success, true);
    console.log(`    ⏱️ Thời gian đăng nhập bcrypt: ${elapsed.toFixed(2)}ms`);
    assert.ok(elapsed < 500, `Đăng nhập bcrypt mất ${elapsed.toFixed(0)}ms, vượt ngưỡng 500ms`);
});
