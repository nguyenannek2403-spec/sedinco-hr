const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const attendanceService = require('../src/services/attendanceService');
const { generateDynamicQrToken } = require('../src/utils/dynamicQrHelper');
const { query } = require('../src/config/db');
const { generateToken, authenticateToken } = require('../src/middlewares/authMiddleware');

let server;
let baseUrl;

async function apiRequest(path, { method = 'GET', body, token, headers = {} } = {}) {
    const reqHeaders = { 'Connection': 'close', ...headers };
    if (body) {
        reqHeaders['Content-Type'] = 'application/json';
    }
    if (token) {
        reqHeaders['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: reqHeaders,
        body: body ? JSON.stringify(body) : undefined
    });
    const status = res.status;
    let data;
    try {
        data = await res.json();
    } catch {
        data = null;
    }
    return { status, data };
}

test.before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

test.after(async () => {
    if (server) {
        if (typeof server.closeAllConnections === 'function') {
            server.closeAllConnections();
        }
        await new Promise((resolve) => server.close(resolve));
    }
    const { pool } = require('../src/config/db');
    if (pool && pool.end) {
        await new Promise((resolve) => pool.end(resolve));
    }
});

// =========================================================================
// 1. NHÓM GPS: Từ chối ngay lat/lng null, NaN, ngoài khoảng
// =========================================================================
test('TC-P0-GPS-01: Chấm công với lat: null hoặc lng: null phải bị từ chối HTTP 400', async () => {
    const qrData = generateDynamicQrToken(1, 30);
    await query('INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at) VALUES (?, 1, NOW() + INTERVAL 30 SECOND)', [qrData.token]);

    const workerUser = { ma_nv: 'NV003', role: 'worker' };

    await assert.rejects(
        async () => {
            await attendanceService.checkInMultiFactor({
                token: qrData.token,
                lat: null,
                lng: null,
                current_user: workerUser
            });
        },
        (err) => {
            assert.equal(err.statusCode, 400);
            assert.ok(err.message.includes('Tọa độ') || err.message.includes('vị trí') || err.message.includes('GPS'));
            return true;
        }
    );

    await query('DELETE FROM dynamic_qr_sessions WHERE session_token = ?', [qrData.token]);
});

test('TC-P0-GPS-02: Chấm công với lat/lng là NaN hoặc ngoài dải [-90,90] [-180,180] phải bị từ chối HTTP 400', async () => {
    const qrData = generateDynamicQrToken(1, 30);
    await query('INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at) VALUES (?, 1, NOW() + INTERVAL 30 SECOND)', [qrData.token]);

    const workerUser = { ma_nv: 'NV003', role: 'worker' };

    await assert.rejects(
        async () => {
            await attendanceService.checkInMultiFactor({
                token: qrData.token,
                lat: 999.99,
                lng: 108.2022,
                current_user: workerUser
            });
        },
        (err) => {
            assert.equal(err.statusCode, 400);
            return true;
        }
    );

    await query('DELETE FROM dynamic_qr_sessions WHERE session_token = ?', [qrData.token]);
});

// =========================================================================
// 2. NHÓM PHÂN TÁCH NHIỆM VỤ (SoD): Không vai trò nào được tự sửa công của chính mình
// =========================================================================
test('TC-P0-ROLE-01: Worker gọi updateAttendanceDaily sửa công của CHÍNH MÌNH phải bị từ chối HTTP 403', async () => {
    const workerUser = { ma_nv: 'NV003', role: 'worker' };

    await assert.rejects(
        async () => {
            await attendanceService.updateAttendanceDaily({
                ma_nv: 'NV003',
                dateStr: '2026-10-20',
                status: '1',
                hours: 8,
                isDelete: false,
                current_user: workerUser
            });
        },
        (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('chính mình') || err.message.includes('Không thể tự'));
            return true;
        }
    );
});

test('TC-P0-ROLE-02: Accountant gọi updateAttendanceDaily sửa công của CHÍNH MÌNH phải bị từ chối HTTP 403', async () => {
    const accountantUser = { ma_nv: 'NV002', role: 'accountant' };

    await assert.rejects(
        async () => {
            await attendanceService.updateAttendanceDaily({
                ma_nv: 'NV002',
                dateStr: '2026-10-20',
                status: '1',
                hours: 8,
                isDelete: false,
                current_user: accountantUser
            });
        },
        (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('chính mình') || err.message.includes('Không thể tự'));
            return true;
        }
    );
});

test('TC-P0-ROLE-03: Admin gọi updateAttendanceDaily sửa công của CHÍNH MÌNH phải bị từ chối HTTP 403', async () => {
    const adminUser = { ma_nv: 'NV001', role: 'admin' };

    await assert.rejects(
        async () => {
            await attendanceService.updateAttendanceDaily({
                ma_nv: 'NV001',
                dateStr: '2026-10-20',
                status: '1',
                hours: 8,
                isDelete: false,
                current_user: adminUser
            });
        },
        (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('chính mình') || err.message.includes('Không thể tự'));
            return true;
        }
    );
});

// =========================================================================
// 3. NHÓM HEADER SPOOFING: Xóa bỏ x-user-role ở MỌI môi trường
// =========================================================================
test('TC-P0-HEADER-01: Header x-user-role và x-user-id bị vô hiệu hóa hoàn toàn kể cả khi NODE_ENV=test', () => {
    const req = {
        headers: {
            'x-user-id': 'hacker',
            'x-user-role': 'admin'
        }
    };
    const res = {};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    authenticateToken(req, res, next);
    assert.equal(nextCalled, true);
    assert.equal(req.user, null, 'req.user PHẢI là null khi không có Bearer token hợp lệ!');
});

// =========================================================================
// 4. NHÓM JWT: Thu hồi tức thì khi tài khoản bị khóa hoặc đổi vai trò
// =========================================================================
test('TC-P0-JWT-01: Token JWT cũ của tài khoản bị khóa (is_locked=1) phải bị từ chối HTTP 403', async () => {
    const testEmpId = 'EMP_LOCK_P0';
    await query("INSERT INTO employees (ma_nv, ho_ten, role, status, is_locked, password) VALUES (?, 'Test Locked User', 'worker', 'active', 0, 'dummy_test_pass') ON DUPLICATE KEY UPDATE is_locked = 0", [testEmpId]);

    // Sinh token hợp lệ cho EMP_LOCK_P0
    const token = generateToken({ id: testEmpId, ma_nv: testEmpId, role: 'worker', ho_ten: 'Test Locked User' });

    // Khóa tài khoản EMP_LOCK_P0
    await query('UPDATE employees SET is_locked = 1 WHERE ma_nv = ?', [testEmpId]);

    try {
        const res = await apiRequest('/api/attendance/me', { token });
        assert.equal(res.status, 403, 'Tài khoản bị khóa phải trả về HTTP 403!');
    } finally {
        await query('DELETE FROM employees WHERE ma_nv = ?', [testEmpId]);
    }
});

// =========================================================================
// 5. NHÓM ẢNH: Magic bytes & Không SELECT cột check_in_image trong danh sách
// =========================================================================
test('TC-P0-IMG-01: Chấm công với chuỗi Base64 không phải ảnh hợp lệ (thiếu magic bytes) phải bị từ chối HTTP 400', async () => {
    const qrData = generateDynamicQrToken(1, 30);
    await query('INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at) VALUES (?, 1, NOW() + INTERVAL 30 SECOND)', [qrData.token]);

    const workerUser = { ma_nv: 'NV003', role: 'worker' };

    await assert.rejects(
        async () => {
            await attendanceService.checkInMultiFactor({
                token: qrData.token,
                lat: 16.0544,
                lng: 108.2022,
                image_snapshot: 'data:text/plain;base64,SGVsbG8gV29ybGQ=', // Text giả ảnh
                current_user: workerUser
            });
        },
        (err) => {
            assert.equal(err.statusCode, 400);
            assert.ok(err.message.includes('ảnh') || err.message.includes('image'));
            return true;
        }
    );

    await query('DELETE FROM dynamic_qr_sessions WHERE session_token = ?', [qrData.token]);
});

test('TC-P0-IMG-02: API getSuspiciousLogs không được chứa cột check_in_image trong kết quả', async () => {
    const logs = await attendanceService.getSuspiciousLogs(5);
    if (logs && logs.length > 0) {
        assert.equal('check_in_image' in logs[0], false, 'Cột check_in_image tuyệt đối không được xuất hiện trong danh sách!');
    }
});
