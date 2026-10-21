const test = require('node:test');
const assert = require('node:assert/strict');
const { 
    generateToken, 
    verifyToken, 
    requireAuth, 
    requireRole, 
    requirePermission 
} = require('../src/middlewares/authMiddleware');
const requestService = require('../src/services/requestService');
const attendanceService = require('../src/services/attendanceService');
const authService = require('../src/services/authService');

// Helper giả lập Request/Response cho Express Middleware
function mockReqRes(user = null, headers = {}) {
    let statusCode = 200;
    let jsonResponse = null;
    let nextCalled = false;

    const req = {
        user,
        headers,
        body: {},
        query: {},
        params: {}
    };

    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(data) {
            jsonResponse = data;
            return this;
        }
    };

    const next = () => {
        nextCalled = true;
    };

    return { req, res, next, getStatus: () => statusCode, getJson: () => jsonResponse, isNextCalled: () => nextCalled };
}

test('TC-RBAC-01: Token JWT sinh ra và xác thực toàn vẹn, từ chối token giả mạo chữ ký', () => {
    const payload = { id: 'NV001', ma_nv: 'NV001', role: 'worker', ho_ten: 'Nguyễn Văn A' };
    const token = generateToken(payload);
    assert.ok(token && token.split('.').length === 3, 'Token phải có định dạng JWT 3 phần');

    const decoded = verifyToken(token);
    assert.equal(decoded.ma_nv, 'NV001');
    assert.equal(decoded.role, 'worker');

    // Giả mạo payload hoặc chữ ký
    const parts = token.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}.invalidsignature123`;
    const tamperedResult = verifyToken(tamperedToken);
    assert.equal(tamperedResult, null, 'Chữ ký giả mạo phải bị từ chối');
});

test('TC-RBAC-02: Middleware requireAuth từ chối 401 khi chưa đăng nhập và cho qua khi đã xác thực', () => {
    // 1. Chưa đăng nhập
    const unauth = mockReqRes(null);
    requireAuth(unauth.req, unauth.res, unauth.next);
    assert.equal(unauth.getStatus(), 401, 'Phải trả về HTTP 401 khi chưa đăng nhập');
    assert.equal(unauth.isNextCalled(), false, 'Không được gọi next()');

    // 2. Đã đăng nhập
    const authed = mockReqRes({ ma_nv: 'NV001', role: 'worker' });
    requireAuth(authed.req, authed.res, authed.next);
    assert.equal(authed.isNextCalled(), true, 'Phải gọi next() khi đã có user context');
});

test('TC-RBAC-03: Middleware requireRole kiểm soát nghiêm ngặt 3 role chuẩn', () => {
    const adminUser = { ma_nv: 'ADMIN', role: 'admin' };
    const accountantUser = { ma_nv: 'NV002', role: 'accountant' };
    const workerUser = { ma_nv: 'NV001', role: 'worker' };

    const adminOnlyMiddleware = requireRole(['admin']);

    // Admin truy cập
    const c1 = mockReqRes(adminUser);
    adminOnlyMiddleware(c1.req, c1.res, c1.next);
    assert.equal(c1.isNextCalled(), true, 'Admin phải được phép truy cập');

    // Accountant thử truy cập route admin-only
    const c2 = mockReqRes(accountantUser);
    adminOnlyMiddleware(c2.req, c2.res, c2.next);
    assert.equal(c2.getStatus(), 403, 'Accountant phải bị chặn 403');
    assert.equal(c2.isNextCalled(), false);

    // Worker thử truy cập route admin-only
    const c3 = mockReqRes(workerUser);
    adminOnlyMiddleware(c3.req, c3.res, c3.next);
    assert.equal(c3.getStatus(), 403, 'Worker phải bị chặn 403');
    assert.equal(c3.isNextCalled(), false);
});

test('TC-RBAC-04: Middleware requirePermission thực thi chính sách Least Privilege', async () => {
    const adminUser = { ma_nv: 'ADMIN', role: 'admin' };
    const workerUser = { ma_nv: 'NV001', role: 'worker' };
    const accountantUser = { ma_nv: 'NV002', role: 'accountant' };

    // 1. Admin luôn có quyền với mọi permission
    const c1 = mockReqRes(adminUser);
    const permMiddleware1 = requirePermission('payroll_approve');
    await permMiddleware1(c1.req, c1.res, c1.next);
    assert.equal(c1.isNextCalled(), true, 'Admin phải được qua tất cả permission');

    // 2. Worker luôn bị chặn 403 với các permission nghiệp vụ
    const c2 = mockReqRes(workerUser);
    const permMiddleware2 = requirePermission('payroll_view_all');
    await permMiddleware2(c2.req, c2.res, c2.next);
    assert.equal(c2.getStatus(), 403, 'Worker không có quyền xem bảng lương toàn công ty');
    assert.equal(c2.isNextCalled(), false);

    // 3. Accountant: Quyền mặc định payroll_view_all = true
    const c3 = mockReqRes(accountantUser);
    const permMiddleware3 = requirePermission('payroll_view_all');
    await permMiddleware3(c3.req, c3.res, c3.next);
    assert.equal(c3.isNextCalled(), true, 'Kế toán mặc định có quyền payroll_view_all');

    // 4. Accountant: Quyền mặc định payroll_approve = false
    const c4 = mockReqRes(accountantUser);
    const permMiddleware4 = requirePermission('payroll_approve');
    await permMiddleware4(c4.req, c4.res, c4.next);
    assert.equal(c4.getStatus(), 403, 'Kế toán mặc định chưa có quyền payroll_approve');
    assert.equal(c4.isNextCalled(), false);
});

test('TC-BOLA-01: Ngăn chặn tự phê duyệt đơn xin nghỉ của chính mình (Separation of Duties)', async () => {
    // Mô phỏng người dùng NV001 tạo đơn nghỉ phép, sau đó chính NV001 đăng nhập cố duyệt đơn của mình
    const currentUser = { ma_nv: 'NV001', role: 'accountant' }; // Dù có role kế toán

    // Mock query trong DB nếu cần hoặc kiểm tra rule logic trong updateRequestStatus
    await assert.rejects(
        async () => {
            // Giả lập cập nhật trạng thái đơn mà employee_id trùng với current_user.ma_nv
            // Logic trong requestService: if (current_user.ma_nv === reqData.employee_id && status === 'approved') throw 403
            const { query } = require('../src/config/db');
            // Tìm 1 đơn bất kỳ để test hoặc mock
            const reqs = await query('SELECT id, employee_id FROM requests LIMIT 1');
            if (reqs && reqs.length > 0) {
                const targetReq = reqs[0];
                await requestService.updateRequestStatus(targetReq.id, 'approved', { ma_nv: targetReq.employee_id, role: 'admin' });
            } else {
                // Tạo đơn giả lập để test
                await query("INSERT INTO requests (id, employee_id, request_type, request_date, status) VALUES (99999, 'NV001', 'Nghỉ phép', '2026-10-21', 'pending') ON DUPLICATE KEY UPDATE employee_id='NV001'");
                await requestService.updateRequestStatus(99999, 'approved', currentUser);
            }
        },
        (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('tự phê duyệt'));
            return true;
        }
    );
});

test('TC-BOLA-02: Ngăn chặn công nhân chỉnh sửa chấm công của người khác (IDOR)', async () => {
    const workerUser = { ma_nv: 'NV001', role: 'worker' };
    
    await assert.rejects(
        async () => {
            await attendanceService.updateAttendanceDaily({
                ma_nv: 'NV002', // Cố sửa công của đồng nghiệp NV002
                dateStr: '2026-10-21',
                status: '1',
                current_user: workerUser
            });
        },
        (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('không thể chỉnh sửa chấm công của người khác'));
            return true;
        }
    );
});

test('TC-BOLA-03: Ngăn chặn nhân viên thay đổi mật khẩu của người khác trái phép', async () => {
    const workerUser = { ma_nv: 'NV001', role: 'worker' };

    const result = await authService.changePassword('NV002', '123456', 'newsecretpass', workerUser);
    assert.equal(result.success, false, 'Không được phép đổi mật khẩu của nhân viên khác');
    assert.ok(result.message.includes('không có quyền'));
});

test.after(async () => {
    const { pool } = require('../src/config/db');
    if (pool && pool.end) {
        await new Promise(resolve => pool.end(resolve));
    }
});

