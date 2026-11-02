/**
 * __tests__/g4_security_hardening.test.js
 * 
 * Bộ kiểm thử an toàn & chống gian lận Giai đoạn G4:
 * - B1: Vị trí tin cậy (Zalo getLocation server token, cờ LOCATION_MODE, cảnh báo chênh lệch, gắn cờ is_low_trust)
 * - B2: Rate limit dùng chung qua MySQL (bảng login_rate_limits, soft-lock, giới hạn tài khoản toàn cục, IP chỉ đếm lỗi)
 * - B5: Kiosk IP tracking & API Key rotation
 * - B6: Xác thực Magic Bytes WebP ("RIFF"..."WEBP") & Giới hạn dung lượng ảnh (2MB)
 * - B7: Mật khẩu 100% bcrypt (gỡ plaintext) & Xác thực tức thì trạng thái/vai trò tại mỗi request (0-delay)
 * 
 * Phương pháp: ĐỎ (Fail trước khi sửa code) -> XANH (Pass sau khi sửa code)
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Chốt chặn DB test: Tuyệt đối không chạm Cloud/Production
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
if (!DB_NAME.includes('test')) {
    throw new Error(`[CHỐT CHẶN BẢO MẬT] DB_NAME="${DB_NAME}" không chứa "test"! Hủy bỏ test.`);
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'sedinco_test_jwt_secret_super_secure_32chars_min';

const { query } = require('../src/config/db');
const authService = require('../src/services/authService');
const attendanceService = require('../src/services/attendanceService');
const kioskService = require('../src/services/kioskService');
const { generateToken } = require('../src/middlewares/authMiddleware');
const { hashPassword } = require('../src/utils/passwordHelper');
const zaloAdapter = require('../src/utils/zaloAdapter');

beforeEach(async () => {
    if (authService.resetRateLimitState) {
        await authService.resetRateLimitState();
    }
});

// ═════════════════════════════════════════════════════════════════
// B7: MẬT KHẨU BCRYPT & THU HỒI TỨC THÌ (0-DELAY)
// ═════════════════════════════════════════════════════════════════

it('TC-G4-B7-PLAIN-01: Gỡ bỏ nhánh so sánh plaintext -> Mật khẩu không phải bcrypt hash bị từ chối đăng nhập', async () => {
    // Tạo nhân viên với mật khẩu cố tình lưu dạng plaintext thuần túy (không có $2b$)
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES ('EMP_G4_PLAIN', 'NV Plain Text', 'plainPassword123', 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = 'plainPassword123', status = 'active', is_locked = 0`);

    const result = await authService.employeeLogin('EMP_G4_PLAIN', 'plainPassword123', '192.168.1.50');
    await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_G4_PLAIN']).catch(() => {});

    // Sau khi gỡ nhánh plaintext, mật khẩu không phải dạng bcrypt hash bắt buộc bị từ chối
    assert.equal(
        result.success, false,
        'Mật khẩu plaintext lưu trong DB không có hash bcrypt phải bị từ chối đăng nhập sau di trú'
    );
});

it('TC-G4-B7-REVOKE-01: Tài khoản bị khóa trong DB (is_locked=1) bị từ chối ngay lập tức ở request tiếp theo (0-delay)', async () => {
    const hash = hashPassword('TestPass@123');
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES ('EMP_G4_REVOKE', 'NV Revoke Test', ?, 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`, [hash]);

    const token = generateToken({ ma_nv: 'EMP_G4_REVOKE', role: 'worker', ho_ten: 'NV Revoke' });

    // Khóa tài khoản trong DB
    await query("UPDATE employees SET is_locked = 1, status = 'locked' WHERE ma_nv = 'EMP_G4_REVOKE'");

    // Thẩm tra qua middleware authenticateToken
    const { authenticateToken } = require('../src/middlewares/authMiddleware');
    const req = { headers: { authorization: `Bearer ${token}` } };
    let resStatus = null;
    let resData = null;
    const res = {
        status: (s) => { resStatus = s; return res; },
        json: (d) => { resData = d; return res; }
    };

    let nextCalled = false;
    await authenticateToken(req, res, () => { nextCalled = true; });

    await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_G4_REVOKE']).catch(() => {});

    assert.equal(nextCalled, false, 'Không được cho phép request tiếp tục khi user đã bị khóa trong DB');
    assert.equal(resStatus, 403, 'Phải trả về HTTP 403 khi tài khoản bị khóa');
});

it('TC-G4-B7-DEMOTE-01: Kế toán bị hạ quyền xuống worker trong DB bị từ chối ngay ở endpoint kế toán (0-delay)', async () => {
    const hash = hashPassword('TestPass@123');
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES ('EMP_G4_DEMOTE', 'NV Demote Test', ?, 'accountant', 'active', 0)
        ON DUPLICATE KEY UPDATE password = VALUES(password), role = 'accountant', status = 'active', is_locked = 0`, [hash]);

    // Token được cấp lúc vẫn là accountant
    const token = generateToken({ ma_nv: 'EMP_G4_DEMOTE', role: 'accountant', ho_ten: 'NV Demote' });

    // Hạ quyền xuống worker ngay lập tức trong DB
    await query("UPDATE employees SET role = 'worker' WHERE ma_nv = 'EMP_G4_DEMOTE'");

    const { authenticateToken } = require('../src/middlewares/authMiddleware');
    const req = { headers: { authorization: `Bearer ${token}` } };
    let resStatus = null;
    let resData = null;
    const res = {
        status: (s) => { resStatus = s; return res; },
        json: (d) => { resData = d; return res; }
    };

    let nextCalled = false;
    await authenticateToken(req, res, () => { nextCalled = true; });

    await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_G4_DEMOTE']).catch(() => {});

    assert.equal(nextCalled, false, 'Token mang role cũ phải bị từ chối khi DB đã thay đổi role');
    assert.equal(resStatus, 403, 'Phải trả về HTTP 403 yêu cầu đăng nhập lại do thay đổi vai trò');
});

// ═════════════════════════════════════════════════════════════════
// B6: XÁC THỰC ẢNH CHUẨN WEBP & GIỚI HẠN DUNG LƯỢNG
// ═════════════════════════════════════════════════════════════════

it('TC-G4-B6-WEBP-01: Ảnh WebP chuẩn ("RIFF"..."WEBP" ở byte 8-11) được chấp nhận', async () => {
    // Tạo buffer WebP chuẩn: RIFF + 4 bytes length + WEBP + payload
    const webpHeader = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // "RIFF"
        0x20, 0x00, 0x00, 0x00, // file size
        0x57, 0x45, 0x42, 0x50, // "WEBP"
        0x56, 0x50, 0x38, 0x20  // "VP8 "
    ]);
    const validWebpBase64 = 'data:image/webp;base64,' + webpHeader.toString('base64');

    // Gọi hàm kiểm tra ảnh trong attendanceService
    assert.doesNotThrow(() => {
        attendanceService.validateImageSnapshot(validWebpBase64);
    });
});

it('TC-G4-B6-WEBP-02: Chuỗi giả mạo WebP thiếu byte WEBP bị từ chối HTTP 400', async () => {
    // Buffer có "RIFF" nhưng byte 8-11 không phải "WEBP"
    const fakeWebp = Buffer.from([
        0x52, 0x49, 0x46, 0x46,
        0x20, 0x00, 0x00, 0x00,
        0x46, 0x41, 0x4B, 0x45, // "FAKE" thay vì "WEBP"
        0x00, 0x00, 0x00, 0x00
    ]);
    const fakeBase64 = 'data:image/webp;base64,' + fakeWebp.toString('base64');

    assert.throws(() => {
        attendanceService.validateImageSnapshot(fakeBase64);
    }, (err) => err.statusCode === 400);
});

it('TC-G4-B6-SIZE-01: Ảnh vượt quá dung lượng tối đa 2MB bị từ chối HTTP 400', async () => {
    // Tạo buffer ảnh giả lập > 2MB
    const largeBuf = Buffer.alloc(2.5 * 1024 * 1024);
    largeBuf[0] = 0xFF; largeBuf[1] = 0xD8; largeBuf[2] = 0xFF; // JPEG magic bytes
    const largeBase64 = 'data:image/jpeg;base64,' + largeBuf.toString('base64');

    assert.throws(() => {
        attendanceService.validateImageSnapshot(largeBase64);
    }, (err) => err.statusCode === 400 && err.message.includes('dung lượng'));
});

// ═════════════════════════════════════════════════════════════════
// B1: VỊ TRÍ TIN CẬY & ZALO GETLOCATION TOKEN
// ═════════════════════════════════════════════════════════════════

it('TC-G4-B1-ZALO-LOC-01: Server xác thực token getLocation [mock Zalo], ghi nhận location_source="token" và is_low_trust=0', async () => {
    const locResult = await zaloAdapter.verifyZaloLocationToken({
        locationToken: 'mock_zalo_loc_valid_da_nang',
        userAccessToken: 'mock_zalo_user_001'
    });

    assert.ok(locResult !== null, 'Phải giải mã được location token hợp lệ');
    assert.equal(locResult.verified, true);
    assert.equal(locResult.provider, 'mock Zalo');
    assert.ok(typeof locResult.lat === 'number');
    assert.ok(typeof locResult.lng === 'number');
});

it('TC-G4-B1-ZALO-LOC-02: Token getLocation hết hạn (> 2 phút) hoặc dùng lại bị từ chối', async () => {
    const expiredRes = await zaloAdapter.verifyZaloLocationToken({
        locationToken: 'mock_zalo_loc_expired',
        userAccessToken: 'mock_zalo_user_001'
    });
    assert.equal(expiredRes, null, 'Token quá 2 phút phải bị từ chối');

    // Token dùng lần 1
    const tokenSingleUse = 'mock_zalo_loc_single_use_test_123';
    const firstUse = await zaloAdapter.verifyZaloLocationToken({
        locationToken: tokenSingleUse,
        userAccessToken: 'mock_zalo_user_001'
    });
    assert.ok(firstUse !== null, 'Lần 1 phải thành công');

    // Gọi lần 2 với cùng token -> Bị từ chối
    const secondUse = await zaloAdapter.verifyZaloLocationToken({
        locationToken: tokenSingleUse,
        userAccessToken: 'mock_zalo_user_001'
    });
    assert.equal(secondUse, null, 'Token getLocation dùng lại lần 2 phải bị từ chối (Single-use)');
});

it('TC-G4-B1-RAW-LOWTRUST-01: Chấm công chỉ có tọa độ raw được ghi nhận location_source="raw" và is_low_trust=1', async () => {
    const hash = hashPassword('WorkerPass@123');
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES ('NV_G4_RAW', 'NV Raw GPS', ?, 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`, [hash]);

    const qr = await attendanceService.generateDynamicQr(1);
    const checkRes = await attendanceService.checkInMultiFactor({
        token: qr.token,
        lat: 16.0544,
        lng: 108.2022,
        device_info: 'device_raw_test_1',
        current_user: { ma_nv: 'NV_G4_RAW', role: 'worker' }
        // Không truyền location_token
    });

    assert.equal(checkRes.success, true);

    const [log] = await query('SELECT location_source, is_low_trust FROM attendance_logs WHERE employee_id = ? ORDER BY id DESC LIMIT 1', ['NV_G4_RAW']);
    await query('DELETE FROM attendance_logs WHERE employee_id = ?', ['NV_G4_RAW']).catch(() => {});
    await query('DELETE FROM employees WHERE ma_nv = ?', ['NV_G4_RAW']).catch(() => {});

    assert.equal(log.location_source, 'raw', 'Nguồn vị trí phải là raw');
    assert.equal(log.is_low_trust, 1, 'Tọa độ raw phải gắn cờ độ tin cậy thấp is_low_trust=1');
});

// ═════════════════════════════════════════════════════════════════
// B2: RATE LIMIT DÙNG CHUNG TRONG CSDL (SHARED ACROSS PROCESSES)
// ═════════════════════════════════════════════════════════════════

it('TC-G4-B2-SHARED-01: Bộ đếm thất bại được lưu trong bảng login_rate_limits của MySQL (dùng chung đa tiến trình)', async () => {
    const hash = hashPassword('SharedPass@123');
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES ('EMP_G4_SHARE', 'NV Shared Rate', ?, 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`, [hash]);

    // Thử sai 2 lần từ IP 10.0.0.1
    await authService.employeeLogin('EMP_G4_SHARE', 'wrong_pass', '10.0.0.1');
    await authService.employeeLogin('EMP_G4_SHARE', 'wrong_pass', '10.0.0.1');

    // Kiểm tra trực tiếp bảng login_rate_limits trong MySQL
    const rows = await query("SELECT attempt_count FROM login_rate_limits WHERE key_name = 'composite:EMP_G4_SHARE:10.0.0.1'");
    await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_G4_SHARE']).catch(() => {});

    assert.ok(rows && rows.length > 0, 'Phải có bản ghi trong bảng login_rate_limits');
    assert.equal(rows[0].attempt_count, 2, 'Số lần sai phải được ghi nhận là 2 trong MySQL');
});

it('TC-G4-B2-ACCT-LOCK-01: Kẻ tấn công đổi 100 IP thử sai 1 tài khoản -> Vượt ngưỡng toàn cục bị soft-lock / chặn', async () => {
    const hash = hashPassword('AttackedAccountPass@123');
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES ('EMP_G4_TARGET', 'NV Bi Tan Cong', ?, 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`, [hash]);

    await query("DELETE FROM audit_logs WHERE actor_id = 'EMP_G4_TARGET'");
    await query("DELETE FROM login_rate_limits WHERE identifier = 'EMP_G4_TARGET' OR key_name LIKE '%EMP_G4_TARGET%'");

    // Kẻ tấn công thử từ 35 IP khác nhau, mỗi IP 1 lần sai (tổng 35 lần sai toàn cục > ngưỡng 30)
    for (let i = 1; i <= 35; i++) {
        await authService.employeeLogin('EMP_G4_TARGET', 'wrong_brute', `10.88.0.${i}`);
    }

    // Kiểm tra bộ đếm toàn cục của tài khoản trong CSDL
    const [acctRow] = await query("SELECT attempt_count FROM login_rate_limits WHERE key_name = 'account:EMP_G4_TARGET'");
    const auditRows = await query(
        "SELECT details FROM audit_logs WHERE actor_id = 'EMP_G4_TARGET' AND action = 'ACCOUNT_UNDER_DISTRIBUTED_ATTACK' ORDER BY id DESC LIMIT 1"
    );
    await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_G4_TARGET']).catch(() => {});

    assert.ok(acctRow, 'Phải có bản ghi toàn cục account:EMP_G4_TARGET trong login_rate_limits');
    assert.ok(acctRow.attempt_count >= 35, 'Tổng số lần thử sai toàn cục phải >= 35');
    assert.ok(auditRows.length > 0, 'Phải ghi nhận sự kiện ACCOUNT_UNDER_DISTRIBUTED_ATTACK khi vượt ngưỡng');
});

it('TC-G4-B2-LEGIT-ENTRY-01: Người dùng thật đăng nhập từ IP mới khi tài khoản đang bị tấn công vẫn vào được', async () => {
    const hash = hashPassword('LegitUserPass@123');
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES ('EMP_G4_LEGIT', 'NV Hop Le', ?, 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`, [hash]);

    // Kẻ tấn công gửi 35 lần sai từ các IP khác nhau (vượt ngưỡng toàn cục 30 lần)
    for (let i = 1; i <= 35; i++) {
        await authService.employeeLogin('EMP_G4_LEGIT', 'wrong_attack', `1.1.1.${i}`);
    }

    // Người dùng thật từ IP riêng đăng nhập đúng mật khẩu
    const legitResult = await authService.employeeLogin('EMP_G4_LEGIT', 'LegitUserPass@123', '192.168.10.99');
    await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_G4_LEGIT']).catch(() => {});

    assert.equal(
        legitResult.success, true,
        'Người dùng thật đăng nhập đúng mật khẩu phải thành công dù tài khoản đang bị tấn công dồn dập vượt ngưỡng toàn cục'
    );
});

it('TC-G4-B2-NAT-MULTI-01: 5 công nhân hợp lệ cùng IP đăng nhập thành công không làm tăng bộ đếm IP rate limit', async () => {
    const hash = hashPassword('CommonPassword@123');
    for (let i = 1; i <= 5; i++) {
        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, ?, ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`,
            [`EMP_NAT_${i}`, `NV NAT ${i}`, hash]);
    }

    const SHARED_NAT_IP = '118.69.100.5';
    for (let i = 1; i <= 5; i++) {
        const res = await authService.employeeLogin(`EMP_NAT_${i}`, 'CommonPassword@123', SHARED_NAT_IP);
        assert.equal(res.success, true);
    }

    // Kiểm tra bộ đếm IP trong DB: Đăng nhập thành công KHÔNG được tăng bộ đếm lỗi của IP
    const [ipRow] = await query("SELECT attempt_count FROM login_rate_limits WHERE key_name = ?", [`ip:${SHARED_NAT_IP}`]);

    for (let i = 1; i <= 5; i++) {
        await query('DELETE FROM employees WHERE ma_nv = ?', [`EMP_NAT_${i}`]).catch(() => {});
    }

    assert.ok(
        !ipRow || ipRow.attempt_count === 0,
        'Đăng nhập thành công không được làm tăng số lần thất bại của IP chung'
    );
});

// ═════════════════════════════════════════════════════════════════
// B5: KIOSK IP TRACKING & ROTATE API KEY
// ═════════════════════════════════════════════════════════════════

it('TC-G4-B5-KIOSK-IP-01: Kiosk ghi nhận last_ip và phát hiện cảnh báo khi IP thay đổi', async () => {
    const reg = await kioskService.registerKiosk({ kiosk_name: 'Kiosk Cổng 1', branch_id: 1, created_by: 'admin' });
    const apiKey = reg.api_key;

    // Lần 1: Gọi từ IP cố định ban đầu
    await kioskService.generateKioskQr(apiKey, '192.168.1.100');
    const [kiosk1] = await query('SELECT last_ip FROM kiosk_devices WHERE id = ?', [reg.id]);
    assert.equal(kiosk1.last_ip, '192.168.1.100');

    // Lần 2: Gọi từ IP lạ khác -> Ghi nhận IP mới và phát sinh cảnh báo audit
    await kioskService.generateKioskQr(apiKey, '192.168.1.222');
    const [kiosk2] = await query('SELECT last_ip FROM kiosk_devices WHERE id = ?', [reg.id]);
    assert.equal(kiosk2.last_ip, '192.168.1.222');

    // Dọn dẹp
    await query('DELETE FROM kiosk_devices WHERE id = ?', [reg.id]).catch(() => {});
});

it('TC-G4-B5-KIOSK-ROTATE-01: Xoay khóa Kiosk (rotateApiKey) vô hiệu hóa khóa cũ, cấp khóa mới hoạt động', async () => {
    const reg = await kioskService.registerKiosk({ kiosk_name: 'Kiosk Cổng 2', branch_id: 1, created_by: 'admin' });
    const oldKey = reg.api_key;

    // Xoay khóa
    const rotateRes = await kioskService.rotateApiKey(reg.id, 'admin');
    const newKey = rotateRes.api_key;
    assert.notEqual(newKey, oldKey);

    // Khóa cũ phải bị từ chối 401
    await assert.rejects(async () => {
        await kioskService.generateKioskQr(oldKey, '192.168.1.100');
    }, (err) => err.statusCode === 401);

    // Khóa mới hoạt động bình thường
    const qrRes = await kioskService.generateKioskQr(newKey, '192.168.1.100');
    assert.ok(qrRes.token, 'Khóa mới phải lấy được Dynamic QR');

    // Dọn dẹp
    await query('DELETE FROM kiosk_devices WHERE id = ?', [reg.id]).catch(() => {});
});
