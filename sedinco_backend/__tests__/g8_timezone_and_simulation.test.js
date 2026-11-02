/**
 * __tests__/g8_timezone_and_simulation.test.js
 * 
 * BÀI KIỂM THỬ BẢO CHỨNG MÚI GIỜ (TIMEZONE CONSISTENCY) & CÁC CA BIÊN G8
 * Xác minh tính nhất quán múi giờ Việt Nam Asia/Ho_Chi_Minh khi server chạy ở môi trường UTC
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const attendanceService = require('../src/services/attendanceService');
const { getVietnamDateString, getVietnamTimeString } = require('../src/utils/timeHelper');
const { query } = require('../src/config/db');

test('TC-G8-TZ-01: Chấm công lúc 06:00 sáng VN (tức 23:00 UTC hôm trước) phải ghi nhận record_date chuẩn ngày Việt Nam', async () => {
    // Thời điểm 06:30 sáng ngày 03/11/2026 tại Việt Nam = 23:30 UTC ngày 02/11/2026
    const earlyMorningVn = new Date('2026-11-02T23:30:00.000Z');
    
    // Sinh mã QR mới
    const qrRes = await attendanceService.generateDynamicQr(1);
    const workerUser = { ma_nv: 'NV001', role: 'worker' };

    // Thực hiện chấm công truyền currentTime giả lập thời điểm ranh giới múi giờ
    const res = await attendanceService.checkInMultiFactor({
        token: qrRes.token,
        lat: 16.0544,
        lng: 108.2022,
        current_user: workerUser,
        currentTime: earlyMorningVn
    });

    assert.equal(res.success, true);
    
    // Kiểm tra bản ghi trong CSDL: record_date phải là 2026-11-03, KHÔNG ĐƯỢC LÀ 2026-11-02
    const rows = await query('SELECT record_date, check_in_time FROM attendance_logs WHERE employee_id = ? AND record_date = "2026-11-03"', ['NV001']);
    
    assert.ok(rows && rows.length > 0, 'Phải tìm thấy bản ghi chấm công ngày 2026-11-03 theo giờ Việt Nam');
    assert.equal(res.data.record_date, '2026-11-03', 'res.data.record_date phải là 2026-11-03');
    assert.ok(res.data.check_in_time.startsWith('06:30'), `check_in_time phải là 06:30, nhận được: ${res.data.check_in_time}`);

    // Dọn dẹp bản ghi test
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = "2026-11-03"', ['NV001']);
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = "2026-11-02"', ['NV001']);
});
