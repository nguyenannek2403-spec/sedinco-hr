/**
 * G2 Cluster 2d: Zalo ID & Device Binding Tests
 * Đề xuất 1 (Đã duyệt):
 * - Chỉ áp dụng cho worker / Mini App (không áp dụng accountant, admin)
 * - Zalo ID lấy từ access token do SERVER xác minh với Zalo (không tin ID client gửi)
 * - 2 bước: recording mode (chỉ ghi nhận) trước, enforced mode (bắt buộc) sau
 * - Đổi/mất thiết bị phải qua Admin duyệt, ghi audit log đầy đủ
 * 
 * Quy trình: ĐỎ → XANH
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Chốt chặn DB test
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
if (!DB_NAME.includes('test')) {
    throw new Error(`[CHỐT CHẶN] DB_NAME="${DB_NAME}" không chứa "test"! Hủy bỏ test.`);
}

process.env.NODE_ENV = 'test';
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env.test') });
process.env.JWT_SECRET = process.env.JWT_SECRET || 'sedinco_test_jwt_secret_super_secure_32chars_min';

const app = require('../src/app');
const { query } = require('../src/config/db');
const { generateToken } = require('../src/middlewares/authMiddleware');
const attendanceService = require('../src/services/attendanceService');
const employeeService = require('../src/services/employeeService');

let server;
let baseUrl;

const TEST_WORKER = 'NV_BIND_WORKER';
const TEST_ADMIN = 'NV_BIND_ADMIN';

let workerToken;
let adminToken;

async function request(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (options.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
    }
    const res = await fetch(`${baseUrl}${endpoint}`, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    let data;
    try {
        data = await res.json();
    } catch {
        data = null;
    }
    return { status: res.status, data };
}

before(async () => {
    await new Promise(resolve => {
        server = app.listen(0, () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });

    // Tạo nhân viên worker và admin
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES (?, 'NV Bind Worker', '123456', 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE status = 'active', is_locked = 0, bound_device_id = NULL, device_binding_mode = 'recording'`,
        [TEST_WORKER]);

    await query(`INSERT INTO admins (username, password, ho_ten)
        VALUES (?, '123456', 'Admin Bind Test')
        ON DUPLICATE KEY UPDATE password = '123456'`, [TEST_ADMIN]);

    workerToken = generateToken({ ma_nv: TEST_WORKER, role: 'worker', ho_ten: 'NV Bind Worker' });
    adminToken = generateToken({ username: TEST_ADMIN, role: 'admin', ho_ten: 'Admin Bind' });
});

beforeEach(async () => {
    // Reset trạng thái thiết bị của test worker về ban đầu
    await query(`UPDATE employees 
        SET bound_device_id = NULL, device_binding_mode = 'recording', pending_device_id = NULL, device_change_reason = NULL, zalo_id = NULL 
        WHERE ma_nv = ?`, [TEST_WORKER]);
    await query('DELETE FROM attendance_logs WHERE employee_id = ?', [TEST_WORKER]);
    await query('DELETE FROM audit_logs WHERE actor_id = ?', [TEST_WORKER]);
});

after(async () => {
    await query('DELETE FROM attendance_logs WHERE employee_id = ?', [TEST_WORKER]);
    await query('DELETE FROM audit_logs WHERE actor_id = ?', [TEST_WORKER]);
    await query('DELETE FROM employees WHERE ma_nv = ?', [TEST_WORKER]);
    await query('DELETE FROM admins WHERE username = ?', [TEST_ADMIN]);
    if (server) {
        await new Promise(resolve => server.close(resolve));
    }
});

// ─────────────────────────────────────────────────
// TC-G2-BIND-01: Chế độ Recording: Tự động ghi nhận thiết bị lần đầu
// ─────────────────────────────────────────────────
it('TC-G2-BIND-01: Ở chế độ recording, lần đầu worker chấm công sẽ tự động ghi nhận bound_device_id', async () => {
    const qr = await attendanceService.generateDynamicQr(1);
    const checkRes = await attendanceService.checkInMultiFactor({
        token: qr.token,
        lat: 16.0544,
        lng: 108.2022,
        device_info: 'hardware_iphone_primary_123',
        current_user: { ma_nv: TEST_WORKER, role: 'worker' }
    });

    assert.equal(checkRes.success, true);

    // Kiểm tra DB: bound_device_id phải được tự động ghi nhận
    const [emp] = await query('SELECT bound_device_id, device_binding_mode FROM employees WHERE ma_nv = ?', [TEST_WORKER]);
    assert.equal(emp.bound_device_id, 'hardware_iphone_primary_123', 'Phải tự động lưu thiết bị lần đầu');
    assert.equal(emp.device_binding_mode, 'recording', 'Mặc định phải ở recording mode');
});

// ─────────────────────────────────────────────────
// TC-G2-BIND-02: Chế độ Recording: Thiết bị lạ vẫn cho chấm nhưng cắm cờ suspicious
// ─────────────────────────────────────────────────
it('TC-G2-BIND-02: Ở chế độ recording, worker chấm công trên thiết bị lạ vẫn qua nhưng gắn cờ suspicious', async () => {
    // Đã liên kết thiết bị device_A
    await query("UPDATE employees SET bound_device_id = 'device_A', device_binding_mode = 'recording' WHERE ma_nv = ?", [TEST_WORKER]);

    const qr = await attendanceService.generateDynamicQr(1);
    const checkRes = await attendanceService.checkInMultiFactor({
        token: qr.token,
        lat: 16.0544,
        lng: 108.2022,
        device_info: 'device_B_unknown',
        current_user: { ma_nv: TEST_WORKER, role: 'worker' }
    });

    // Chế độ ghi nhận không chặn sản xuất: vẫn thành công
    assert.equal(checkRes.success, true, 'Vẫn phải cho phép chấm công ở recording mode');
    assert.equal(checkRes.data.is_suspicious, true, 'Phải gắn cờ suspicious khi thiết bị khác bound_device_id');
    assert.ok(checkRes.data.suspicious_reason.includes('thiết bị khác') || checkRes.data.suspicious_reason.includes('thiết bị lạ') || checkRes.data.suspicious_reason.includes('ghi nhận'),
        'Lý do cảnh báo phải nêu rõ thiết bị khác với thiết bị đăng ký');
});

// ─────────────────────────────────────────────────
// TC-G2-BIND-03: Chế độ Enforced: Thiết bị khác bound_device_id BỊ CHẶN 403
// ─────────────────────────────────────────────────
it('TC-G2-BIND-03: Ở chế độ enforced, worker chấm công trên thiết bị khác bound_device_id BỊ TỪ CHỐI HTTP 403', async () => {
    // Đã bật enforced mode
    await query("UPDATE employees SET bound_device_id = 'device_A', device_binding_mode = 'enforced' WHERE ma_nv = ?", [TEST_WORKER]);

    const qr = await attendanceService.generateDynamicQr(1);

    await assert.rejects(async () => {
        await attendanceService.checkInMultiFactor({
            token: qr.token,
            lat: 16.0544,
            lng: 108.2022,
            device_info: 'device_C_unauthorized',
            current_user: { ma_nv: TEST_WORKER, role: 'worker' }
        });
    }, (err) => {
        assert.equal(err.statusCode, 403, 'Phải trả về 403 Forbidden');
        assert.ok(err.message.includes('chưa được liên kết') || err.message.includes('đổi thiết bị'),
            'Thông báo phải hướng dẫn gửi yêu cầu đổi thiết bị');
        return true;
    });
});

// ─────────────────────────────────────────────────
// TC-G2-BIND-04: Non-worker (Admin, Accountant) KHÔNG BỊ ràng buộc thiết bị
// ─────────────────────────────────────────────────
it('TC-G2-BIND-04: Admin và Accountant không bị ràng buộc thiết bị', async () => {
    // Admin không có bound_device_id và không bị ràng buộc
    const adminCheck = await employeeService.checkDeviceBinding({
        ma_nv: TEST_ADMIN,
        role: 'admin',
        device_info: 'any_pc_device'
    });
    assert.equal(adminCheck.allowed, true, 'Admin phải luôn được phép');

    const accCheck = await employeeService.checkDeviceBinding({
        ma_nv: 'NV002',
        role: 'accountant',
        device_info: 'another_pc_browser'
    });
    assert.equal(accCheck.allowed, true, 'Accountant phải luôn được phép');
});

// ─────────────────────────────────────────────────
// TC-G2-BIND-05: Server xác minh Zalo Token, không tin Zalo ID client gửi
// ─────────────────────────────────────────────────
it('TC-G2-BIND-05: Server xác minh access token với Zalo, từ chối token giả mạo', async () => {
    // Gọi bind-zalo với access token hợp lệ [mock Zalo]
    const validRes = await request('/api/employees/bind-zalo', {
        method: 'POST',
        token: workerToken,
        body: { zalo_token: 'mock_zalo_user_ZALO_SECURE_99' }
    });

    assert.equal(validRes.status, 200, 'Xác minh token thành công');
    assert.equal(validRes.data.success, true);
    assert.equal(validRes.data.data.zalo_id, 'ZALO_SECURE_99');

    // Thử gửi zalo_id trực tiếp mà không có access token -> bị từ chối
    const fakeRes = await request('/api/employees/bind-zalo', {
        method: 'POST',
        token: workerToken,
        body: { client_zalo_id: 'HACKED_ZALO_ID' } // Không gửi token
    });
    assert.equal(fakeRes.status, 400, 'Không tin ID client gửi trực tiếp khi thiếu access token');
});

// ─────────────────────────────────────────────────
// TC-G2-BIND-06: Quy trình đổi thiết bị: Worker yêu cầu -> Admin duyệt -> Audit log
// ─────────────────────────────────────────────────
it('TC-G2-BIND-06: Quy trình đổi thiết bị: Worker gửi yêu cầu -> Admin phê duyệt -> Cập nhật thiết bị và ghi audit', async () => {
    // Thiết bị hiện tại là device_old
    await query("UPDATE employees SET bound_device_id = 'device_old', device_binding_mode = 'enforced' WHERE ma_nv = ?", [TEST_WORKER]);

    // 1. Worker gửi yêu cầu đổi thiết bị
    const reqRes = await request('/api/employees/request-device-change', {
        method: 'POST',
        token: workerToken,
        body: { new_device_id: 'device_new_iphone_16', reason: 'Tôi bị mất điện thoại cũ, đã đổi máy mới' }
    });

    assert.equal(reqRes.status, 200);
    assert.equal(reqRes.data.success, true);

    // Kiểm tra DB: pending_device_id phải được lưu
    const [empPending] = await query('SELECT pending_device_id, device_change_reason FROM employees WHERE ma_nv = ?', [TEST_WORKER]);
    assert.equal(empPending.pending_device_id, 'device_new_iphone_16');
    assert.equal(empPending.device_change_reason, 'Tôi bị mất điện thoại cũ, đã đổi máy mới');

    // 2. Admin phê duyệt yêu cầu đổi thiết bị
    const approveRes = await request(`/api/employees/${TEST_WORKER}/approve-device-change`, {
        method: 'PUT',
        token: adminToken
    });

    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.data.success, true);

    // Kiểm tra DB: bound_device_id phải được cập nhật sang máy mới, pending bị xóa
    const [empApproved] = await query('SELECT bound_device_id, pending_device_id FROM employees WHERE ma_nv = ?', [TEST_WORKER]);
    assert.equal(empApproved.bound_device_id, 'device_new_iphone_16', 'bound_device_id phải đổi sang thiết bị mới');
    assert.equal(empApproved.pending_device_id, null, 'pending_device_id phải được reset');

    // Kiểm tra audit_logs
    const auditLogs = await query(`
        SELECT actor_id, action, resource 
        FROM audit_logs 
        WHERE action = 'APPROVE_DEVICE_CHANGE' AND resource = 'employee_device'
        ORDER BY id DESC LIMIT 1
    `);
    assert.ok(auditLogs && auditLogs.length > 0, 'Phải ghi nhận audit log cho APPROVE_DEVICE_CHANGE');
});

// ─────────────────────────────────────────────────
// TC-G2-BIND-07: Separation of Duties: Worker không thể tự duyệt đổi thiết bị của mình
// ─────────────────────────────────────────────────
it('TC-G2-BIND-07: Worker hoặc Accountant không được phép tự duyệt đổi thiết bị (HTTP 403 - SoD)', async () => {
    const res = await request(`/api/employees/${TEST_WORKER}/approve-device-change`, {
        method: 'PUT',
        token: workerToken // Dùng token worker để tự duyệt
    });

    assert.equal(res.status, 403, 'Worker tự duyệt đổi thiết bị phải bị chặn HTTP 403');
});
