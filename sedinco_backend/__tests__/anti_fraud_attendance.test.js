const test = require('node:test');
const assert = require('node:assert/strict');
const attendanceService = require('../src/services/attendanceService');
const requestService = require('../src/services/requestService');
const { generateDynamicQrToken } = require('../src/utils/dynamicQrHelper');
const { calculateDistanceMeters, isWithinGeofence } = require('../src/utils/geoHelper');
const { calculateEmployeeSalary } = require('../src/utils/payrollCalculator');
const { query, pool } = require('../src/config/db');

test('TC-ANTI-01: Chấm công bằng mã QR đã hết hạn (> 30 giây) phải bị từ chối HTTP 400', async () => {
    // 1. Tạo session QR giả lập đã hết hạn (expires_at trong quá khứ 1 phút)
    const qrData = generateDynamicQrToken(1, -60);
    await query(
        'INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at) VALUES (?, 1, NOW() - INTERVAL 60 SECOND)',
        [qrData.token]
    );

    const workerUser = { ma_nv: 'NV001', role: 'worker' };

    await assert.rejects(
        async () => {
            await attendanceService.checkInMultiFactor({
                token: qrData.token,
                lat: 16.0544,
                lng: 108.2022,
                current_user: workerUser
            });
        },
        (err) => {
            assert.equal(err.statusCode, 400);
            assert.ok(err.message.includes('hết hạn'));
            return true;
        }
    );

    await query('DELETE FROM dynamic_qr_sessions WHERE session_token = ?', [qrData.token]);
});

test('TC-ANTI-02: Chấm công bằng mã QR đã có người quét trước đó (Replay Attack) phải bị từ chối HTTP 400', async () => {
    // 1. Sinh mã QR mới
    const qrRes = await attendanceService.generateDynamicQr(1);
    const workerUser1 = { ma_nv: 'NV001', role: 'worker' };
    const workerUser2 = { ma_nv: 'NV002', role: 'worker' };

    // 2. Nhân viên 1 quét chấm công thành công
    const check1 = await attendanceService.checkInMultiFactor({
        token: qrRes.token,
        lat: 16.0544,
        lng: 108.2022,
        current_user: workerUser1
    });
    assert.equal(check1.success, true);

    // 3. Nhân viên 2 quét lại mã QR cũ này -> Phải bị từ chối HTTP 400
    await assert.rejects(
        async () => {
            await attendanceService.checkInMultiFactor({
                token: qrRes.token,
                lat: 16.0544,
                lng: 108.2022,
                current_user: workerUser2
            });
        },
        (err) => {
            assert.equal(err.statusCode, 400);
            assert.ok(err.message.includes('đã được sử dụng'));
            return true;
        }
    );

    await query('DELETE FROM dynamic_qr_sessions WHERE session_token = ?', [qrRes.token]);
});

test('TC-ANTI-03: Chấm công với tọa độ GPS vượt quá bán kính quy định (khoảng cách > 100m) phải bị từ chối HTTP 400', async () => {
    // Trụ sở Sedinco: 16.0544, 108.2022 (Bán kính 100m)
    // Tọa độ giả mạo ở xa (cách ~2.5km): 16.0750, 108.2200
    const qrRes = await attendanceService.generateDynamicQr(1);
    const workerUser = { ma_nv: 'NV001', role: 'worker' };

    await assert.rejects(
        async () => {
            await attendanceService.checkInMultiFactor({
                token: qrRes.token,
                lat: 16.0750,
                lng: 108.2200,
                current_user: workerUser
            });
        },
        (err) => {
            assert.equal(err.statusCode, 400);
            assert.ok(err.message.includes('Vị trí chấm công không hợp lệ'));
            return true;
        }
    );

    await query('DELETE FROM dynamic_qr_sessions WHERE session_token = ?', [qrRes.token]);
});

test('TC-ANTI-04: Chấm công hợp lệ trong bán kính với Dynamic QR thành công và lưu ảnh snapshot', async () => {
    const qrRes = await attendanceService.generateDynamicQr(1);
    const workerUser = { ma_nv: 'NV001', role: 'worker' };
    const mockImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';

    const checkRes = await attendanceService.checkInMultiFactor({
        token: qrRes.token,
        lat: 16.054400,
        lng: 108.202200,
        image_snapshot: mockImage,
        device_info: 'iPhone 13 - Safari Zalo Mini App',
        current_user: workerUser
    });

    assert.equal(checkRes.success, true);
    assert.equal(checkRes.data.employee_id, 'NV001');

    // Kiểm tra trong CSDL
    const logs = await query('SELECT check_in_method, check_in_image, device_fingerprint FROM attendance_logs WHERE employee_id = ? AND record_date = CURRENT_DATE()', ['NV001']);
    assert.ok(logs.length > 0);
    assert.equal(logs[0].check_in_method, 'dynamic_qr');
    assert.equal(logs[0].device_fingerprint, 'iPhone 13 - Safari Zalo Mini App');

    await query('DELETE FROM dynamic_qr_sessions WHERE session_token = ?', [qrRes.token]);
});

test('TC-ANTI-05: Chấm công cho 2 nhân viên khác nhau trên cùng 1 IP trong vòng 60 giây bị gắn cờ is_suspicious = true', async () => {
    const testIp = '192.168.10.99';
    const workerUser1 = { ma_nv: 'NV001', role: 'worker' };
    const workerUser2 = { ma_nv: 'NV002', role: 'worker' };

    // 1. Nhân viên 1 chấm công
    const qr1 = await attendanceService.generateDynamicQr(1);
    await attendanceService.checkInMultiFactor({
        token: qr1.token,
        lat: 16.0544,
        lng: 108.2022,
        ip_address: testIp,
        device_info: 'Shared-Phone-Device-01',
        current_user: workerUser1
    });

    // 2. Nhân viên 2 ngay sau đó chấm công trên cùng IP/thiết bị này
    const qr2 = await attendanceService.generateDynamicQr(1);
    const check2 = await attendanceService.checkInMultiFactor({
        token: qr2.token,
        lat: 16.0544,
        lng: 108.2022,
        ip_address: testIp,
        device_info: 'Shared-Phone-Device-01',
        current_user: workerUser2
    });

    assert.equal(check2.success, true);
    assert.equal(check2.data.is_suspicious, true, 'Lượt chấm công thứ 2 phải bị gắn cờ nghi vấn');
    assert.ok(check2.data.suspicious_reason.includes('Phát hiện chấm công liên tiếp'));

    // Kiểm tra danh sách suspicious-logs
    const suspiciousLogs = await attendanceService.getSuspiciousLogs(10);
    const found = suspiciousLogs.find(l => l.employee_id === 'NV002');
    assert.ok(found, 'Phải có trong danh sách suspicious logs');

    await query('DELETE FROM dynamic_qr_sessions WHERE session_token IN (?, ?)', [qr1.token, qr2.token]);
});

test('TC-ANTI-06: Giới hạn tối đa 3 đơn bổ sung công / quên chấm công trong 1 tháng', async () => {
    const workerUser = { ma_nv: 'NV001', role: 'worker' };
    const testDate = '2026-11-10';

    // Xóa các đơn test tháng 11 nếu có
    await query("DELETE FROM requests WHERE employee_id = 'NV001' AND MONTH(request_date) = 11 AND YEAR(request_date) = 2026");

    // Tạo 3 đơn liên tiếp thành công
    for (let i = 1; i <= 3; i++) {
        const res = await requestService.createRequest({
            employee_id: 'NV001',
            request_type: 'Bổ sung công',
            request_date: testDate,
            reason: `Quên chấm công lần ${i}`,
            current_user: workerUser
        });
        assert.equal(res.success, true);
    }

    // Nộp đơn thứ 4 trong cùng tháng -> Phải bị từ chối 400
    await assert.rejects(
        async () => {
            await requestService.createRequest({
                employee_id: 'NV001',
                request_type: 'Bổ sung công',
                request_date: testDate,
                reason: 'Quên chấm công lần 4',
                current_user: workerUser
            });
        },
        (err) => {
            assert.equal(err.statusCode, 400);
            assert.ok(err.message.includes('tối đa 3 đơn bổ sung công'));
            return true;
        }
    );

    // Dọn dẹp đơn test tháng 11
    await query("DELETE FROM requests WHERE employee_id = 'NV001' AND MONTH(request_date) = 11 AND YEAR(request_date) = 2026");
});

test('TC-ANTI-07: Tính toán giờ OT siết chặt (Pre-Approval Clamping)', () => {
    const emp = {
        luong_cb: 10400000,
        cong_chuan: 26,
        ngay_chinh_thuc: '2025-01-01',
        has_insurance: true
    };

    const logs = [
        { record_date: '2026-10-15', status: 'OT', ot_hours: 4, dow: 4 } // Làm OT 4 giờ ngày thứ Năm
    ];

    // 1. Trường hợp có đơn OT đăng ký trước và được duyệt 2.0 giờ
    // Hệ thống phải khống chế: MIN(thực_tế=4, duyệt=2) = 2 giờ
    const approvedOtRegs = [
        { employee_id: 'NV001', work_date: '2026-10-15', expected_hours: 2, status: 'approved' }
    ];
    const calcWithApproved = calculateEmployeeSalary({
        luong_cb: emp.luong_cb,
        cong_chuan: emp.cong_chuan,
        ngay_chinh_thuc: emp.ngay_chinh_thuc,
        logs: logs,
        otRegistrations: approvedOtRegs
    });
    // 2 giờ * 50.000đ/h * 1.5 = 150.000đ
    assert.equal(calcWithApproved.otAmount, 150000);

    // 2. Trường hợp KHÔNG có đơn đăng ký duyệt trước (hoặc chưa được duyệt)
    // Giờ OT phải bị đưa về 0đ
    const calcWithoutApproved = calculateEmployeeSalary({
        luong_cb: emp.luong_cb,
        cong_chuan: emp.cong_chuan,
        ngay_chinh_thuc: emp.ngay_chinh_thuc,
        logs: logs,
        otRegistrations: [] // Không có đơn duyệt
    });
    assert.equal(calcWithoutApproved.otAmount, 0, 'Chưa có đơn duyệt trước thì giờ OT phải bằng 0');
});

test('TC-ANTI-08: Ngăn chặn tự phê duyệt đơn đăng ký OT của chính mình (Separation of Duties)', async () => {
    const workerUser = { ma_nv: 'NV001', role: 'worker' };
    const accountantUser = { ma_nv: 'NV001', role: 'accountant' };

    // 1. Đăng ký OT
    await query("DELETE FROM ot_registrations WHERE employee_id = 'NV001'");
    await requestService.createOtPreRegistration({
        employee_id: 'NV001',
        work_date: '2026-10-25',
        expected_hours: 3,
        reason: 'Làm thêm bốc dỡ hàng tại kho',
        current_user: workerUser
    });

    const rows = await query("SELECT id FROM ot_registrations WHERE employee_id = 'NV001' AND work_date = '2026-10-25'");
    assert.ok(rows.length > 0);
    const regId = rows[0].id;

    // 2. Chính NV001 đăng nhập cố duyệt đơn OT của mình -> Phải bị chặn 403
    await assert.rejects(
        async () => {
            await requestService.updateOtRegistrationStatus(regId, 'approved', accountantUser);
        },
        (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('tự phê duyệt'));
            return true;
        }
    );

    // Dọn dẹp
    await query("DELETE FROM ot_registrations WHERE employee_id = 'NV001'");
});

test.after(async () => {
    if (pool && pool.end) {
        await new Promise(resolve => pool.end(resolve));
    }
});
