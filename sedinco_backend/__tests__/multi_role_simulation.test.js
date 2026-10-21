const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const { query } = require('../src/config/db');

let server;
let baseUrl;

// Helper thực hiện HTTP Request qua fetch
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
    // Khởi động server trên cổng ngẫu nhiên do hệ điều hành cấp
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

test('SIMULATION CHU TRÌNH 3 ROLES: Thao tác chức năng nhiều lần & phát hiện lỗi tiềm ẩn', async () => {
    try {
        await runSimulation();
    } catch (err) {
        console.error('❌ SIMULATION ERROR CAUGHT:');
        console.error(err);
        throw err;
    }
});

async function runSimulation() {
    // Role 1: Admin
    const adminLoginRes = await apiRequest('/api/admin/login', {
        method: 'POST',
        body: { username: 'admin', password: 'password123' }
    });
    let adminToken;
    if (adminLoginRes.status === 200 && adminLoginRes.data?.success) {
        adminToken = adminLoginRes.data.data.token;
    } else {
        // Thử mật khẩu 123456
        const retry = await apiRequest('/api/admin/login', {
            method: 'POST',
            body: { username: 'admin', password: '123456' }
        });
        assert.equal(retry.status, 200, 'Admin login failed');
        assert.ok(retry.data.success);
        adminToken = retry.data.data.token;
    }
    assert.ok(adminToken, 'Admin token must be generated');

    // Role 2: Accountant (NV002)
    const accountantLoginRes = await apiRequest('/api/login', {
        method: 'POST',
        body: { ma_nv: 'NV002', password: '123456' }
    });
    assert.equal(accountantLoginRes.status, 200, 'Accountant login failed');
    assert.ok(accountantLoginRes.data.success);
    const accountantToken = accountantLoginRes.data.data.token;
    assert.equal(accountantLoginRes.data.data.role, 'accountant');

    // Role 3: Worker (NV003)
    const workerLoginRes = await apiRequest('/api/login', {
        method: 'POST',
        body: { ma_nv: 'NV003', password: '123456' }
    });
    assert.equal(workerLoginRes.status, 200, 'Worker login failed');
    assert.ok(workerLoginRes.data.success);
    const workerToken = workerLoginRes.data.data.token;
    assert.equal(workerLoginRes.data.data.role, 'worker');

    console.log('✅ [Login Simulation] Cả 3 roles đã đăng nhập và nhận JWT token hợp lệ.');

    // =========================================================================
    // VÒNG LẶP KIỂM TRA ĐA LẦN (3 ITERATIONS) CHO MỖI ROLE
    // =========================================================================
    for (let iteration = 1; iteration <= 3; iteration++) {
        console.log(`\n--- BẮT ĐẦU VÒNG LẶP MÔ PHỎNG SỐ ${iteration} ---`);

        // ---------------------------------------------------------------------
        // ROLE ADMIN: Quản trị cấu hình, nhân sự, kiểm toán
        // ---------------------------------------------------------------------
        // 1.1 Đọc & Cập nhật thông tin công ty / bán kính Geofencing
        const getCompRes = await apiRequest('/api/company', { token: adminToken });
        assert.equal(getCompRes.status, 200);
        const originalRadius = getCompRes.data?.data?.radius_meters || 100;

        const updateCompRes = await apiRequest('/api/company', {
            method: 'PUT',
            token: adminToken,
            body: {
                ten_cong_ty: 'SEDINCO INDUSTRIAL HR CORP',
                latitude: 16.0544,
                longitude: 108.2022,
                radius_meters: 120
            }
        });
        assert.equal(updateCompRes.status, 200);

        // Khôi phục bán kính ban đầu
        await apiRequest('/api/company', {
            method: 'PUT',
            token: adminToken,
            body: { radius_meters: originalRadius }
        });

        // 1.2 Quản lý Nhân sự (CRUD Lifecycle)
        const testEmpId = `TEST_EMP_${iteration}_${Date.now().toString().slice(-4)}`;
        const createEmpRes = await apiRequest('/api/employees', {
            method: 'POST',
            token: adminToken,
            body: {
                ma_nv: testEmpId,
                ho_ten: `Nhân viên Thử Nghiệm ${iteration}`,
                chuc_vu: 'Công nhân may',
                phong_ban: 'Xưởng 1',
                luong_cb: 8000000,
                role: 'worker'
            }
        });
        assert.equal(createEmpRes.status, 201, `Create employee must return 201: ${JSON.stringify(createEmpRes.data)}`);

        // Tạm khóa tài khoản nhân viên
        const lockEmpRes = await apiRequest(`/api/employees/${testEmpId}/status`, {
            method: 'PUT',
            token: adminToken,
            body: { status: 'locked' }
        });
        assert.equal(lockEmpRes.status, 200);

        // Thử đăng nhập bằng tài khoản bị khóa -> Phải bị từ chối
        const lockedLogin = await apiRequest('/api/login', {
            method: 'POST',
            body: { ma_nv: testEmpId, password: '123456' }
        });
        assert.equal(lockedLogin.data?.success, false);
        assert.ok(lockedLogin.data?.message?.includes('TẠM KHÓA'));

        // Mở khóa lại
        const unlockEmpRes = await apiRequest(`/api/employees/${testEmpId}/status`, {
            method: 'PUT',
            token: adminToken,
            body: { status: 'active' }
        });
        assert.equal(unlockEmpRes.status, 200);

        // Nâng quyền lên accountant và hạ lại
        const roleUpRes = await apiRequest(`/api/employees/${testEmpId}/role`, {
            method: 'PUT',
            token: adminToken,
            body: { role: 'accountant' }
        });
        assert.equal(roleUpRes.status, 200);

        // Xóa nhân viên thử nghiệm
        const delEmpRes = await apiRequest(`/api/employees/${testEmpId}`, {
            method: 'DELETE',
            token: adminToken
        });
        assert.equal(delEmpRes.status, 200);

        // 1.3 Xem nhật ký kiểm toán (Audit Logs)
        const auditRes = await apiRequest('/api/settings/audit-logs', { token: adminToken });
        assert.equal(auditRes.status, 200);
        assert.ok(Array.isArray(auditRes.data?.data));

        console.log(`  ✔ [Admin Iteration ${iteration}] CRUD nhân viên, quản lý quyền & kiểm toán hoàn tất.`);

        // ---------------------------------------------------------------------
        // ROLE ACCOUNTANT: Quản lý nghiệp vụ công, đơn từ, bảng lương
        // ---------------------------------------------------------------------
        // 2.1 Sinh mã Dynamic QR
        const qrRes = await apiRequest('/api/attendance/dynamic-qr', { token: accountantToken });
        assert.equal(qrRes.status, 200);
        const dynamicToken = qrRes.data?.data?.token || qrRes.data?.token;
        assert.ok(dynamicToken, 'Dynamic token must exist');

        // 2.2 Xem danh sách chấm công nghi vấn
        const suspRes = await apiRequest('/api/attendance/suspicious-logs', { token: accountantToken });
        assert.equal(suspRes.status, 200);
        assert.ok(Array.isArray(suspRes.data?.data));

        // 2.3 Xem ma trận bảng chấm công toàn công ty
        const attRes = await apiRequest('/api/attendance?month=10&year=2026', { token: accountantToken });
        assert.equal(attRes.status, 200);
        assert.ok(Array.isArray(attRes.data?.data));

        // 2.4 Xem danh sách đơn từ và đơn đăng ký OT
        const reqsRes = await apiRequest('/api/requests?month=10&year=2026', { token: accountantToken });
        assert.equal(reqsRes.status, 200);

        const otListRes = await apiRequest('/api/requests/ot-registrations?month=10&year=2026', { token: accountantToken });
        assert.equal(otListRes.status, 200);

        // 2.5 Tính toán bảng lương tháng
        const calcRes = await apiRequest('/api/payroll/calculate', {
            method: 'POST',
            token: accountantToken,
            body: { month: 10, year: 2026 }
        });
        assert.equal(calcRes.status, 200);

        // 2.6 Kiểm tra quyền bị cấm đối với Kế toán:
        // Cố tình mở khóa kỳ công (chỉ admin) -> Phải bị từ chối 403
        const forbiddenUnlock = await apiRequest('/api/attendance/unlock-period', {
            method: 'POST',
            token: accountantToken,
            body: { month: 10, year: 2026 }
        });
        assert.equal(forbiddenUnlock.status, 403, 'Accountant cannot unlock period');

        // Cố tình sửa quyền kế toán -> Phải bị từ chối 403
        const forbiddenPerm = await apiRequest('/api/settings/accountant-permissions', {
            method: 'PUT',
            token: accountantToken,
            body: { permissions: { attendance_lock: true } }
        });
        assert.equal(forbiddenPerm.status, 403, 'Accountant cannot modify permissions');

        console.log(`  ✔ [Accountant Iteration ${iteration}] Sinh QR động, kiểm tra công, tính lương & chặn vượt quyền.`);

        // ---------------------------------------------------------------------
        // ROLE WORKER: Chấm công đa lớp, gửi đơn từ, xem bảng lương cá nhân
        // ---------------------------------------------------------------------
        // 3.1 Xem hồ sơ cá nhân
        const meRes = await apiRequest('/api/me', { token: workerToken });
        assert.equal(meRes.status, 200);
        assert.equal(meRes.data?.data?.ma_nv, 'NV003');

        // 3.2 Xem bảng lương cá nhân
        const myPayrollRes = await apiRequest('/api/payroll/me?month=10&year=2026', { token: workerToken });
        assert.equal(myPayrollRes.status, 200);

        // 3.3 Chấm công hợp lệ bằng mã QR vừa sinh ở bước 2.1
        const checkInSuccess = await apiRequest('/api/attendance/check-in', {
            method: 'POST',
            token: workerToken,
            body: {
                token: dynamicToken,
                lat: 16.05441,
                lng: 108.20221,
                image_snapshot: 'data:image/jpeg;base64,/9j/simulated_face_photo...',
                device_info: `ZaloMiniApp/TestDevice_Worker_${iteration}`
            }
        });
        assert.ok([200, 201].includes(checkInSuccess.status), `Check-in should succeed: ${JSON.stringify(checkInSuccess.data)}`);
        assert.ok(checkInSuccess.data?.success);

        // 3.4 Quét lại mã vừa dùng (Replay Attack) -> Phải bị từ chối 400
        const replayRes = await apiRequest('/api/attendance/check-in', {
            method: 'POST',
            token: workerToken,
            body: {
                token: dynamicToken,
                lat: 16.05441,
                lng: 108.20221
            }
        });
        assert.equal(replayRes.status, 400, 'Replay attack must return 400');

        // 3.5 Sinh mã QR mới rồi thử chấm công sai vị trí GPS (> 100m) -> Phải bị từ chối 400
        const newQrRes = await apiRequest('/api/attendance/dynamic-qr', { token: adminToken });
        const newDynamicToken = newQrRes.data?.data?.token || newQrRes.data?.token;
        const invalidGpsRes = await apiRequest('/api/attendance/check-in', {
            method: 'POST',
            token: workerToken,
            body: {
                token: newDynamicToken,
                lat: 16.0900, // Cách xa vài km
                lng: 108.2500
            }
        });
        assert.equal(invalidGpsRes.status, 400, 'Check-in outside radius must return 400');

        // 3.6 Đăng ký OT duyệt trước
        const otRegDate = `2026-11-${String(iteration + 10).padStart(2, '0')}`;
        await query('DELETE FROM ot_registrations WHERE employee_id = ? AND work_date = ?', ['NV003', otRegDate]);

        const otRegRes = await apiRequest('/api/requests/ot-pre-register', {
            method: 'POST',
            token: workerToken,
            body: {
                work_date: otRegDate,
                expected_hours: 2.0,
                reason: `Đăng ký tăng ca vòng ${iteration}`
            }
        });
        assert.equal(otRegRes.status, 201);
        const otId = otRegRes.data?.data?.id;

        // Kế toán phê duyệt đơn OT này
        if (otId) {
            // Khi chưa cấp quyền leave_approve -> Kế toán bị từ chối 403
            const blockedApprove = await apiRequest(`/api/requests/ot-registrations/${otId}`, {
                method: 'PUT',
                token: accountantToken,
                body: { status: 'approved' }
            });
            assert.equal(blockedApprove.status, 403, 'Accountant without leave_approve permission must be blocked');

            // Admin bật quyền leave_approve cho Kế toán
            await apiRequest('/api/settings/accountant-permissions', {
                method: 'PUT',
                token: adminToken,
                body: { permissions: { leave_approve: true } }
            });

            // Kế toán duyệt lại -> Thành công 200
            const approveOtRes = await apiRequest(`/api/requests/ot-registrations/${otId}`, {
                method: 'PUT',
                token: accountantToken,
                body: { status: 'approved' }
            });
            assert.equal(approveOtRes.status, 200);

            // Admin thu hồi quyền leave_approve để khôi phục trạng thái an toàn
            await apiRequest('/api/settings/accountant-permissions', {
                method: 'PUT',
                token: adminToken,
                body: { permissions: { leave_approve: false } }
            });

            // Dọn dẹp đơn OT test
            await query('DELETE FROM ot_registrations WHERE id = ?', [otId]);
        }

        // 3.7 Tạo đơn xin nghỉ phép và tự hủy đơn
        const leaveRes = await apiRequest('/api/requests', {
            method: 'POST',
            token: workerToken,
            body: {
                request_type: 'Nghỉ phép',
                request_date: `2026-11-${String(iteration + 20).padStart(2, '0')}`,
                reason: `Việc gia đình vòng ${iteration}`
            }
        });
        assert.equal(leaveRes.status, 201);
        const reqId = leaveRes.data?.data?.id;
        assert.ok(reqId);

        // Worker tự hủy đơn pending của mình
        const cancelRes = await apiRequest(`/api/requests/${reqId}/cancel`, {
            method: 'PUT',
            token: workerToken
        });
        assert.equal(cancelRes.status, 200);

        // Dọn dẹp đơn test
        await query('DELETE FROM requests WHERE id = ?', [reqId]);

        // 3.8 Thử các hành vi vượt quyền của Worker -> Phải bị từ chối 403
        // Cố xem danh sách nhân viên
        const forbidEmp = await apiRequest('/api/employees', { token: workerToken });
        assert.equal(forbidEmp.status, 403, 'Worker cannot view all employees');

        // Cố xem bảng lương toàn công ty
        const forbidPayroll = await apiRequest('/api/payroll', { token: workerToken });
        assert.equal(forbidPayroll.status, 403, 'Worker cannot view company payroll');

        // Cố duyệt đơn từ
        const forbidApprove = await apiRequest('/api/requests/1', {
            method: 'PUT',
            token: workerToken,
            body: { status: 'approved' }
        });
        assert.equal(forbidApprove.status, 403, 'Worker cannot approve requests');

        console.log(`  ✔ [Worker Iteration ${iteration}] Chấm công đa lớp, đăng ký OT, nộp đơn & chặn vượt quyền.`);
    }

    // Dọn dẹp sau khi chạy xong toàn bộ 3 vòng
    await query("DELETE FROM attendance_logs WHERE employee_id = 'NV003' AND record_date = CURDATE()");
    console.log('\n✅ [TẤT CẢ 3 VÒNG LẶP MÔ PHỎNG THÀNH CÔNG RỰC RỠ, KHÔNG CÓ LỖI NÀO PHÁT SINH!]');
}
