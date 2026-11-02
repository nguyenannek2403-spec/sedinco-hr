/**
 * G3 Security Hardening Tests (Cụm B1, B2, B7)
 *
 * B1 — Chống DoS lockout: khóa nên theo (tài khoản, IP) kết hợp,
 *      không khóa toàn bộ tài khoản chỉ vì IP lạ tấn công
 * B2 — req.ip phải lấy đúng từ X-Forwarded-For khi trust proxy cấu hình
 * B7 — Ngưỡng anomaly phải cấu hình được qua hằng số (không hardcode ngầm)
 *
 * Quy trình: ĐỎ (fail trước) → XANH (pass sau khi sửa code)
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Chốt chặn DB test
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
if (!DB_NAME.includes('test')) {
    throw new Error(`[CHỐT CHẶN] DB_NAME="${DB_NAME}" không chứa "test"! Hủy bỏ test.`);
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'sedinco_test_jwt_secret_super_secure_32chars_min';

const { query } = require('../src/config/db');
const authService = require('../src/services/authService');
const { hashPassword } = require('../src/utils/passwordHelper');
const anomalyDetector = require('../src/utils/anomalyDetector');

// ─────────────────────────────────────────────────
// TC-B1-DOS-01: Kẻ tấn công từ IP lạ gửi 5 lần sai KHÔNG được khóa
//               tài khoản với người dùng hợp lệ từ IP đã biết
// ─────────────────────────────────────────────────
it('TC-B1-DOS-01: Kẻ tấn công từ IP lạ khóa tài khoản → người dùng hợp lệ từ IP khác vẫn đăng nhập được (chống DoS)', async () => {
    if (authService.resetRateLimitState) authService.resetRateLimitState();

    const hash = hashPassword('realUserPass123');
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES ('EMP_DOS_01', 'NV DoS Test', ?, 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`, [hash]);

    // Kẻ tấn công từ IP lạ gửi 5 lần sai
    const ATTACKER_IP = '1.2.3.4';
    for (let i = 0; i < 5; i++) {
        await authService.employeeLogin('EMP_DOS_01', 'wrong_attacker', ATTACKER_IP);
    }

    // Người dùng hợp lệ từ IP khác PHẢI vẫn đăng nhập được
    // (Hiện tại sẽ FAIL vì code khóa theo tài khoản không phân biệt IP)
    const USER_IP = '192.168.1.10';
    const result = await authService.employeeLogin('EMP_DOS_01', 'realUserPass123', USER_IP);

    await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_DOS_01']).catch(() => {});

    assert.equal(
        result.success, true,
        `Người dùng hợp lệ từ ${USER_IP} phải đăng nhập được dù kẻ tấn công từ ${ATTACKER_IP} đã gửi 5 lần sai. ` +
        `Hiện tại: success=${result.success}, msg="${result.message}"`
    );
});

// ─────────────────────────────────────────────────
// TC-B1-DOS-02: Phân lập brute-force theo IP (chống khóa chéo người dùng hợp lệ)
// ─────────────────────────────────────────────────
it('TC-B1-DOS-02: Phân lập brute-force theo IP: Người dùng từ IP quen thuộc không bị khóa bởi brute-force từ IP khác', async () => {
    if (authService.resetRateLimitState) authService.resetRateLimitState();

    const hash = hashPassword('boundDevicePass');
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked, bound_device_id, device_binding_mode)
        VALUES ('EMP_BOUND_01', 'NV Bound Device', ?, 'worker', 'active', 0, 'DEVICE_ABC_123', 'recording')
        ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0, bound_device_id = 'DEVICE_ABC_123'`,
        [hash]);

    // Brute-force từ thiết bị khác (chỉ 5 lần sai)
    for (let i = 0; i < 5; i++) {
        await authService.employeeLogin('EMP_BOUND_01', 'wrong_pass', '5.6.7.8');
    }

    // Người dùng hợp lệ từ IP và thiết bị quen thuộc phải vẫn đăng nhập được
    // (Điều kiện: có thể cần truyền device_id, hoặc kiểm tra IP từ lịch sử)
    const result = await authService.employeeLogin('EMP_BOUND_01', 'boundDevicePass', '192.168.1.10');

    await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_BOUND_01']).catch(() => {});

    // Test này có thể vẫn FAIL ở giai đoạn hiện tại nếu chưa implement exempt-bound-device
    // Đây là test định hướng cho việc sửa tiếp theo
    assert.equal(
        result.success, true,
        `Người dùng có bound_device phải đăng nhập được. msg="${result.message}"`
    );
});

// ─────────────────────────────────────────────────
// TC-B2-PROXY-01: Kiểm tra cấu hình TRUST_PROXY trong env
//                 (logic level, không cần HTTP server thật)
// ─────────────────────────────────────────────────
it('TC-B2-PROXY-01: env.TRUST_PROXY mặc định phải là false (không tin cậy X-Forwarded-For khi không có proxy)', async () => {
    const env = require('../src/config/env');
    // Khi không đặt TRUST_PROXY trong env, default phải là false để tránh spoofing
    // (test này PASS nếu env.js đã cấu hình đúng)
    assert.ok(
        env.TRUST_PROXY === false || env.TRUST_PROXY === 'false' || env.TRUST_PROXY === undefined,
        `env.TRUST_PROXY default phải là false. Hiện tại: ${env.TRUST_PROXY}`
    );
});

// ─────────────────────────────────────────────────
// TC-B7-THRESHOLD-01: Ngưỡng anomaly phải được export dưới dạng hằng số
//                      (không hardcode ngầm trong hàm)
// ─────────────────────────────────────────────────
it('TC-B7-THRESHOLD-01: anomalyDetector phải export ngưỡng cấu hình được (MULTI_ACCT_WINDOW_SEC, MAX_DEVICES_PER_DAY, IMPOSSIBLE_DIST_M, IMPOSSIBLE_SPEED_KMH)', async () => {
    // Kiểm tra xem anomalyDetector có export các hằng số cấu hình không
    const thresholds = anomalyDetector.THRESHOLDS || anomalyDetector.config || null;

    assert.ok(
        thresholds !== null,
        'anomalyDetector phải export THRESHOLDS hoặc config object với các ngưỡng cấu hình được. ' +
        'Hiện tại không tìm thấy export THRESHOLDS/config → test FAIL'
    );

    assert.ok(typeof thresholds.MULTI_ACCT_WINDOW_SEC === 'number',
        `THRESHOLDS.MULTI_ACCT_WINDOW_SEC phải là number, hiện: ${typeof thresholds?.MULTI_ACCT_WINDOW_SEC}`);
    assert.ok(typeof thresholds.MAX_DEVICES_PER_DAY === 'number',
        `THRESHOLDS.MAX_DEVICES_PER_DAY phải là number, hiện: ${typeof thresholds?.MAX_DEVICES_PER_DAY}`);
    assert.ok(typeof thresholds.IMPOSSIBLE_DIST_M === 'number',
        `THRESHOLDS.IMPOSSIBLE_DIST_M phải là number, hiện: ${typeof thresholds?.IMPOSSIBLE_DIST_M}`);
    assert.ok(typeof thresholds.IMPOSSIBLE_SPEED_KMH === 'number',
        `THRESHOLDS.IMPOSSIBLE_SPEED_KMH phải là number, hiện: ${typeof thresholds?.IMPOSSIBLE_SPEED_KMH}`);
});

// ─────────────────────────────────────────────────
// TC-B1-LOCKSTATE-01: Trạng thái khóa lưu ở RAM (Map) → mất khi khởi động lại
//                      Test ghi nhận hành vi này, không bypass
// ─────────────────────────────────────────────────
it('TC-B1-LOCKSTATE-01: authService.resetRateLimitState() phải tồn tại và xóa được trạng thái khóa', async () => {
    // Đây là kiểm tra API contract: service phải export hàm reset để test clean
    assert.ok(
        typeof authService.resetRateLimitState === 'function',
        'authService phải export resetRateLimitState() để test isolation. Không tìm thấy!'
    );
    // Gọi reset và verify không throw
    assert.doesNotThrow(() => authService.resetRateLimitState());
});
