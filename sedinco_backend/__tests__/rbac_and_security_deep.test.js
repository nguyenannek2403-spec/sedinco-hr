const test = require('node:test');
const assert = require('node:assert/strict');
const { 
    generateToken, 
    verifyToken, 
    authenticateToken,
    requireAuth, 
    requireRole, 
    requirePermission 
} = require('../src/middlewares/authMiddleware');
const requestService = require('../src/services/requestService');
const attendanceService = require('../src/services/attendanceService');
const authService = require('../src/services/authService');
const employeeService = require('../src/services/employeeService');
const permissionService = require('../src/services/permissionService');
const { query } = require('../src/config/db');

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
    const currentUser = { ma_nv: 'NV001', role: 'accountant' };
    const testReqId = 99999;
    await query("INSERT INTO requests (id, employee_id, request_type, request_date, status) VALUES (?, 'NV001', 'Nghỉ phép', '2026-10-21', 'pending') ON DUPLICATE KEY UPDATE employee_id='NV001', status='pending'", [testReqId]);

    await assert.rejects(
        async () => {
            await requestService.updateRequestStatus(testReqId, 'approved', currentUser);
        },
        (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('tự phê duyệt'));
            return true;
        }
    );

    await query('DELETE FROM requests WHERE id = ?', [testReqId]);
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

test('TC-SEC-05: Chặn khai thác token JWT đã hết hạn (exp < now)', () => {
    // Tạo token có expiresInSeconds âm (-10 giây)
    const expiredToken = generateToken({ ma_nv: 'NV001', role: 'worker' }, -10);
    const decoded = verifyToken(expiredToken);
    assert.equal(decoded, null, 'Token đã quá hạn exp phải trả về null');
});

test('TC-SEC-06: Chặn giả mạo vai trò qua x-user-role header khi không ở môi trường test', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = 'production';
        const ctx = mockReqRes(null, {
            'x-user-id': 'hacker',
            'x-user-role': 'admin'
        });
        authenticateToken(ctx.req, ctx.res, ctx.next);
        assert.equal(ctx.req.user, null, 'Không được phép cấp user context từ header ngoài môi trường test');
    } finally {
        process.env.NODE_ENV = originalEnv;
    }
});

test('TC-SEC-07: Chặn người dùng không phải Admin đăng ký tài khoản Quản trị', async () => {
    // Đảm bảo có ít nhất 1 admin trong DB
    await query("INSERT INTO admins (username, password, ho_ten) VALUES ('admin_root', '123456', 'Root Admin') ON DUPLICATE KEY UPDATE ho_ten='Root Admin'");

    // 1. Thử đăng ký admin mà không có session admin
    const unauthedResult = await authService.adminRegister('hacker_admin', '123456', 'Hacker', null);
    assert.equal(unauthedResult.success, false);
    assert.equal(unauthedResult.statusCode, 403, 'Phải từ chối 403 khi chưa đăng nhập');

    // 2. Thử đăng ký admin với tài khoản role worker
    const workerResult = await authService.adminRegister('hacker_admin2', '123456', 'Hacker', { ma_nv: 'NV001', role: 'worker' });
    assert.equal(workerResult.success, false);
    assert.equal(workerResult.statusCode, 403, 'Worker không thể tạo tài khoản admin');
});

test('TC-SEC-08: Chặn Mass Assignment leo thang quyền thành admin trong createEmployee và updateEmployee', async () => {
    const accountantUser = { ma_nv: 'NV_KT', role: 'accountant' };
    const testEmpId = 'TEST_ELEV_01';

    // Xóa record test cũ nếu có
    await query('DELETE FROM employees WHERE ma_nv = ?', [testEmpId]);

    // 1. Kế toán gọi createEmployee gửi kèm role: 'admin'
    await employeeService.createEmployee({
        ma_nv: testEmpId,
        ho_ten: 'Test Nhân Viên',
        role: 'admin' // Cố tình gán admin
    }, accountantUser);

    const empAfterCreate = await employeeService.getEmployeeById(testEmpId);
    assert.equal(empAfterCreate.role, 'worker', 'Tài khoản do non-admin tạo bắt buộc phải có role worker');

    // 2. Kế toán gọi updateEmployee gửi kèm role: 'admin'
    await employeeService.updateEmployee(testEmpId, {
        role: 'admin' // Cố tình update thành admin
    }, accountantUser);

    const empAfterUpdate = await employeeService.getEmployeeById(testEmpId);
    assert.equal(empAfterUpdate.role, 'worker', 'Non-admin không thể nâng role qua updateEmployee');

    // Dọn dẹp
    await query('DELETE FROM employees WHERE ma_nv = ?', [testEmpId]);
});

test('TC-SEC-09: Kiểm soát trạng thái đơn từ (State Machine) - Chặn duyệt/từ chối đơn đã xử lý', async () => {
    const testReqId = 88881;
    await query('DELETE FROM requests WHERE id = ?', [testReqId]);
    await query("INSERT INTO requests (id, employee_id, request_type, request_date, status) VALUES (?, 'NV002', 'Nghỉ phép', '2026-10-21', 'approved')", [testReqId]);

    const adminUser = { username: 'admin', role: 'admin' };

    // Cố tình duyệt lại đơn đã 'approved'
    await assert.rejects(
        async () => {
            await requestService.updateRequestStatus(testReqId, 'approved', adminUser);
        },
        (err) => {
            assert.equal(err.statusCode, 400);
            assert.ok(err.message.includes('đã được xử lý'));
            return true;
        }
    );

    // Dọn dẹp
    await query('DELETE FROM requests WHERE id = ?', [testReqId]);
});

test('TC-SEC-10: Cho phép Worker hủy đơn pending của chính mình và chặn hủy đơn của người khác', async () => {
    const testReqId = 88882;
    await query('DELETE FROM requests WHERE id = ?', [testReqId]);
    await query("INSERT INTO requests (id, employee_id, request_type, request_date, status) VALUES (?, 'NV001', 'Nghỉ phép', '2026-10-21', 'pending')", [testReqId]);

    const colleague = { ma_nv: 'NV002', role: 'worker' };
    const owner = { ma_nv: 'NV001', role: 'worker' };

    // 1. Đồng nghiệp NV002 cố hủy đơn của NV001 -> Bị chặn 403
    await assert.rejects(
        async () => {
            await requestService.cancelRequest(testReqId, colleague);
        },
        (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('không có quyền'));
            return true;
        }
    );

    // 2. Chính chủ NV001 hủy đơn pending -> Thành công
    const cancelRes = await requestService.cancelRequest(testReqId, owner);
    assert.equal(cancelRes.success, true);

    const rows = await query('SELECT status FROM requests WHERE id = ?', [testReqId]);
    assert.equal(rows[0].status, 'cancelled');

    // 3. Thử hủy lại khi đã 'cancelled' -> Bị chặn 400
    await assert.rejects(
        async () => {
            await requestService.cancelRequest(testReqId, owner);
        },
        (err) => {
            assert.equal(err.statusCode, 400);
            return true;
        }
    );

    // Dọn dẹp
    await query('DELETE FROM requests WHERE id = ?', [testReqId]);
});

test('TC-SEC-11: Chặn Worker tự ý xóa bản ghi chấm công (isDelete = true)', async () => {
    const workerUser = { ma_nv: 'NV001', role: 'worker' };

    await assert.rejects(
        async () => {
            await attendanceService.updateAttendanceDaily({
                ma_nv: 'NV001',
                dateStr: '2026-10-21',
                isDelete: true,
                current_user: workerUser
            });
        },
        (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('không thể tự ý xóa'));
            return true;
        }
    );
});

test('TC-SEC-12: Thu hồi tức thì quyền Kế toán (Cache Invalidation)', async () => {
    const accountantUser = { ma_nv: 'NV002', role: 'accountant' };

    // 1. Bật quyền attendance_edit
    await permissionService.updateAccountantPermissions({ attendance_edit: true }, { role: 'admin', username: 'admin' });
    const check1 = mockReqRes(accountantUser);
    await requirePermission('attendance_edit')(check1.req, check1.res, check1.next);
    assert.equal(check1.isNextCalled(), true, 'Kế toán phải được cấp quyền sau khi bật');

    // 2. Thu hồi quyền attendance_edit
    await permissionService.updateAccountantPermissions({ attendance_edit: false }, { role: 'admin', username: 'admin' });
    const check2 = mockReqRes(accountantUser);
    await requirePermission('attendance_edit')(check2.req, check2.res, check2.next);
    assert.equal(check2.getStatus(), 403, 'Kế toán phải bị chặn ngay sau khi thu hồi quyền (cache invalidation)');
    assert.equal(check2.isNextCalled(), false);
});

test.after(async () => {
    const { pool } = require('../src/config/db');
    if (pool && pool.end) {
        await new Promise(resolve => pool.end(resolve));
    }
});

