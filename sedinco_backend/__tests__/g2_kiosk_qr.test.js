/**
 * G2 Cluster 2b: Kiosk QR Hardware Isolation Tests
 * Đề xuất 2 (Đã duyệt): Bảng riêng kiosk_devices, API key chỉ có quyền lấy QR, 
 * thu hồi được, rate limit, ghi audit log đầy đủ.
 * 
 * Quy trình: ĐỎ → XANH
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Chốt chặn DB test
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
if (!DB_NAME.includes('test')) {
    throw new Error(`[CHỐT CHẶN] DB_NAME="${DB_NAME}" không chứa "test"! Hủy bỏ test.`);
}

require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'sedinco_test_jwt_secret_super_secure_32chars_min';

const app = require('../src/app');
const { query } = require('../src/config/db');
const { generateToken } = require('../src/middlewares/authMiddleware');

let server;
let baseUrl;

// Tokens cho các role khác nhau
let adminToken;
let workerToken;
let accountantToken;

let createdKioskId;
let createdKioskKey;

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
    // Khởi động HTTP server test trên port ngẫu nhiên
    await new Promise(resolve => {
        server = app.listen(0, () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });

    // Tạo token cho 3 role chuẩn
    adminToken = generateToken({ id: 1, username: 'admin', role: 'admin', ho_ten: 'Admin Test' });
    workerToken = generateToken({ ma_nv: 'NV003', role: 'worker', ho_ten: 'Worker Test' });
    accountantToken = generateToken({ ma_nv: 'NV002', role: 'accountant', ho_ten: 'Accountant Test' });

    // Dọn dẹp kiosk test cũ nếu có
    await query("DELETE FROM kiosk_devices WHERE kiosk_name LIKE 'TEST_KIOSK%'").catch(() => {});
});

after(async () => {
    await query("DELETE FROM kiosk_devices WHERE kiosk_name LIKE 'TEST_KIOSK%'").catch(() => {});
    if (server) {
        await new Promise(resolve => server.close(resolve));
    }
});

// ─────────────────────────────────────────────────
// TC-G2-KIOSK-01: Admin đăng ký kiosk mới nhận API key
// ─────────────────────────────────────────────────
it('TC-G2-KIOSK-01: Admin đăng ký kiosk mới thành công và nhận API key hợp lệ', async () => {
    const res = await request('/api/kiosk/register', {
        method: 'POST',
        token: adminToken,
        body: { kiosk_name: 'TEST_KIOSK_GATE1', branch_id: 1 }
    });

    assert.equal(res.status, 201, `Đăng ký kiosk phải trả về 201 Created (nhận: ${res.status})`);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.api_key, 'Phải có trường api_key');
    assert.ok(res.data.data.api_key.startsWith('ksk_'), 'API key phải có prefix ksk_');
    assert.ok(res.data.data.id, 'Phải có id kiosk');

    createdKioskId = res.data.data.id;
    createdKioskKey = res.data.data.api_key;
});

// ─────────────────────────────────────────────────
// TC-G2-KIOSK-02: Non-admin (worker, accountant) bị từ chối đăng ký kiosk
// ─────────────────────────────────────────────────
it('TC-G2-KIOSK-02: Worker và Accountant không được phép đăng ký hoặc quản lý kiosk (HTTP 403)', async () => {
    const workerRes = await request('/api/kiosk/register', {
        method: 'POST',
        token: workerToken,
        body: { kiosk_name: 'TEST_KIOSK_HACK', branch_id: 1 }
    });
    assert.equal(workerRes.status, 403, 'Worker phải bị chặn 403 khi đăng ký kiosk');

    const accRes = await request('/api/kiosk/register', {
        method: 'POST',
        token: accountantToken,
        body: { kiosk_name: 'TEST_KIOSK_HACK', branch_id: 1 }
    });
    assert.equal(accRes.status, 403, 'Accountant phải bị chặn 403 khi đăng ký kiosk');
});

// ─────────────────────────────────────────────────
// TC-G2-KIOSK-03: Kiosk dùng API key hợp lệ lấy được Dynamic QR
// ─────────────────────────────────────────────────
it('TC-G2-KIOSK-03: Kiosk gọi /api/kiosk/qr với x-kiosk-key hợp lệ nhận được dynamic QR token', async () => {
    assert.ok(createdKioskKey, 'Cần có kiosk key từ test trước');

    const res = await request('/api/kiosk/qr', {
        method: 'GET',
        headers: { 'x-kiosk-key': createdKioskKey }
    });

    assert.equal(res.status, 200, `Kiosk QR phải trả 200 OK (nhận: ${res.status})`);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.token, 'Phải trả về session token QR');
    assert.ok(res.data.data.expiresAt, 'Phải có thời gian hết hạn');
    assert.equal(res.data.data.branchId, 1);
});

// ─────────────────────────────────────────────────
// TC-G2-KIOSK-04: API key sai hoặc thiếu header bị từ chối HTTP 401
// ─────────────────────────────────────────────────
it('TC-G2-KIOSK-04: Thiếu x-kiosk-key hoặc API key không tồn tại phải trả HTTP 401', async () => {
    const noKeyRes = await request('/api/kiosk/qr', { method: 'GET' });
    assert.equal(noKeyRes.status, 401, 'Không có header x-kiosk-key phải trả 401');

    const badKeyRes = await request('/api/kiosk/qr', {
        method: 'GET',
        headers: { 'x-kiosk-key': 'ksk_invalid_key_1234567890' }
    });
    assert.equal(badKeyRes.status, 401, 'API key không tồn tại phải trả 401');
});

// ─────────────────────────────────────────────────
// TC-G2-KIOSK-05: Kiosk API key KHÔNG THỂ truy cập các endpoint nghiệp vụ khác
// ─────────────────────────────────────────────────
it('TC-G2-KIOSK-05: Kiosk API key không thể truy cập /api/payroll hoặc /api/employees (HTTP 401)', async () => {
    // Thử dùng kiosk key truy cập bảng lương
    const payrollRes = await request('/api/payroll', {
        method: 'GET',
        headers: { 'x-kiosk-key': createdKioskKey, 'Authorization': `Bearer ${createdKioskKey}` }
    });
    assert.equal(payrollRes.status, 401, 'Kiosk key không được phép xem bảng lương');

    // Thử truy cập danh sách nhân viên
    const empRes = await request('/api/employees', {
        method: 'GET',
        headers: { 'x-kiosk-key': createdKioskKey, 'Authorization': `Bearer ${createdKioskKey}` }
    });
    assert.equal(empRes.status, 401, 'Kiosk key không được phép xem danh sách nhân viên');
});

// ─────────────────────────────────────────────────
// TC-G2-KIOSK-06: Thu hồi Kiosk (Revocation) có hiệu lực tức thì
// ─────────────────────────────────────────────────
it('TC-G2-KIOSK-06: Kiosk bị thu hồi (is_active=0) bị chặn lấy QR ngay lập tức (HTTP 403)', async () => {
    assert.ok(createdKioskId, 'Cần có kiosk id');

    // Admin thu hồi kiosk
    const revokeRes = await request(`/api/kiosk/${createdKioskId}/revoke`, {
        method: 'PUT',
        token: adminToken
    });
    assert.equal(revokeRes.status, 200, 'Thu hồi kiosk thành công');

    // Kiosk thử gọi lại QR
    const qrRes = await request('/api/kiosk/qr', {
        method: 'GET',
        headers: { 'x-kiosk-key': createdKioskKey }
    });
    assert.equal(qrRes.status, 403, 'Kiosk đã bị thu hồi phải bị từ chối HTTP 403');
});

// ─────────────────────────────────────────────────
// TC-G2-KIOSK-07: Rate limiting Kiosk (tối đa 60 request/phút)
// ─────────────────────────────────────────────────
it('TC-G2-KIOSK-07: Kiosk bị chặn HTTP 429 khi gọi quá tần suất cho phép (Rate Limit)', async () => {
    // Tạo 1 kiosk riêng cho test rate limit
    const newKioskRes = await request('/api/kiosk/register', {
        method: 'POST',
        token: adminToken,
        body: { kiosk_name: 'TEST_KIOSK_RATE', branch_id: 1 }
    });
    assert.equal(newKioskRes.status, 201);
    const rateKioskKey = newKioskRes.data.data.api_key;

    // Gửi dồn dập 65 requests liên tiếp
    let got429 = false;
    for (let i = 0; i < 65; i++) {
        const res = await request('/api/kiosk/qr', {
            method: 'GET',
            headers: { 'x-kiosk-key': rateKioskKey }
        });
        if (res.status === 429) {
            got429 = true;
            break;
        }
    }
    assert.equal(got429, true, 'Phải trả về HTTP 429 khi vượt quá 60 requests/phút');
});

// ─────────────────────────────────────────────────
// TC-G2-KIOSK-08: Ghi nhận nhật ký kiểm toán KIOSK_GENERATE_QR
// ─────────────────────────────────────────────────
it('TC-G2-KIOSK-08: Hành động lấy QR của Kiosk được ghi nhận vào audit_logs với actor_id kiosk', async () => {
    // Tạo kiosk mới
    const kioskRes = await request('/api/kiosk/register', {
        method: 'POST',
        token: adminToken,
        body: { kiosk_name: 'TEST_KIOSK_AUDIT', branch_id: 1 }
    });
    const key = kioskRes.data.data.api_key;

    // Lấy QR
    await request('/api/kiosk/qr', {
        method: 'GET',
        headers: { 'x-kiosk-key': key }
    });

    // Kiểm tra audit_logs trong DB
    const logs = await query(`
        SELECT actor_id, actor_role, action, resource 
        FROM audit_logs 
        WHERE action = 'KIOSK_GENERATE_QR' AND actor_id = 'kiosk:TEST_KIOSK_AUDIT'
        ORDER BY id DESC LIMIT 1
    `);

    assert.ok(logs && logs.length > 0, 'Phải có bản ghi audit_log cho KIOSK_GENERATE_QR');
    assert.equal(logs[0].actor_role, 'kiosk');
    assert.equal(logs[0].action, 'KIOSK_GENERATE_QR');
});

let planAKioskKey;

// ─────────────────────────────────────────────────
// TC-G2-KIOSK-09: Phương án A - Kiosk polling trạng thái và đổi mã ngay khi đã sử dụng
// ─────────────────────────────────────────────────
it('TC-G2-KIOSK-09: Phương án A - Kiosk phát hiện QR đã quét qua /qr-status và lấy mã mới ngay lập tức', async () => {
    // 0. Đăng ký 1 kiosk active mới
    const kioskRes = await request('/api/kiosk/register', {
        method: 'POST',
        token: adminToken,
        body: { kiosk_name: 'TEST_KIOSK_PLAN_A', branch_id: 1 }
    });
    assert.equal(kioskRes.status, 201);
    planAKioskKey = kioskRes.data.data.api_key;

    // 1. Sinh QR ban đầu cho Kiosk
    const qrRes = await request('/api/kiosk/qr', {
        method: 'GET',
        headers: { 'x-kiosk-key': planAKioskKey }
    });
    assert.equal(qrRes.status, 200);
    const token1 = qrRes.data.data.token;

    // 2. Kiosk kiểm tra trạng thái ban đầu: Chưa dùng (is_used = false)
    const statusBefore = await request(`/api/kiosk/qr-status?token=${token1}`, {
        method: 'GET',
        headers: { 'x-kiosk-key': planAKioskKey }
    });
    assert.equal(statusBefore.status, 200);
    assert.equal(statusBefore.data.data.is_used, false);
    assert.equal(statusBefore.data.data.can_renew, false);

    // 3. Công nhân 1 quét chấm công thành công
    const checkInRes = await request('/api/attendance/check-in', {
        method: 'POST',
        token: workerToken,
        body: {
            token: token1,
            lat: 16.0544,
            lng: 108.2022,
            device_info: 'iPhone-Worker-01'
        }
    });
    assert.equal(checkInRes.status, 200);

    // 4. Kiosk polling lại sau khi công nhân quét: Phát hiện is_used = true, can_renew = true
    const statusAfter = await request(`/api/kiosk/qr-status?token=${token1}`, {
        method: 'GET',
        headers: { 'x-kiosk-key': planAKioskKey }
    });
    assert.equal(statusAfter.status, 200);
    assert.equal(statusAfter.data.data.is_used, true);
    assert.equal(statusAfter.data.data.can_renew, true);

    // 5. Kiosk lập tức lấy mã QR mới (Early renewal)
    const qrRes2 = await request('/api/kiosk/qr', {
        method: 'GET',
        headers: { 'x-kiosk-key': planAKioskKey }
    });
    assert.equal(qrRes2.status, 200);
    const token2 = qrRes2.data.data.token;
    assert.notEqual(token1, token2, 'Mã QR mới phải khác mã QR cũ');

    // 6. Công nhân 2 đến sau quét mã mới thành công
    const checkInRes2 = await request('/api/attendance/check-in', {
        method: 'POST',
        token: workerToken,
        body: {
            token: token2,
            lat: 16.0544,
            lng: 108.2022,
            device_info: 'iPhone-Worker-02'
        }
    });
    assert.equal(checkInRes2.status, 200, 'Công nhân thứ 2 quét mã mới phải thành công, không bị lỗi Replay Attack');
});

// ─────────────────────────────────────────────────
// TC-G2-KIOSK-10: Mutation Test - Tắt đổi mã sớm khiến người thứ 2 bị từ chối Replay
// ─────────────────────────────────────────────────
it('TC-G2-KIOSK-10: Mutation Test - Tắt đổi mã sớm (cố tình giữ mã cũ) khiến công nhân kế tiếp bị từ chối Replay', async () => {
    // 1. Sinh QR
    const qrRes = await request('/api/kiosk/qr', {
        method: 'GET',
        headers: { 'x-kiosk-key': planAKioskKey }
    });
    assert.equal(qrRes.status, 200);
    const token = qrRes.data.data.token;

    // 2. Người thứ nhất quét
    await request('/api/attendance/check-in', {
        method: 'POST',
        token: workerToken,
        body: { token, lat: 16.0544, lng: 108.2022, device_info: 'Phone-A' }
    });

    // 3. Người thứ hai quét cùng mã cũ (khi chưa đổi) -> Bị từ chối HTTP 400
    const failRes = await request('/api/attendance/check-in', {
        method: 'POST',
        token: workerToken,
        body: { token, lat: 16.0544, lng: 108.2022, device_info: 'Phone-B' }
    });
    assert.equal(failRes.status, 400);
    assert.ok(failRes.data.message.includes('quét trước đó') || failRes.data.message.includes('sử dụng'));
});
