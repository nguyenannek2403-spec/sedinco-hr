/**
 * tools/test_timezone_matrix.js
 * 
 * Ma trận kiểm thử múi giờ toàn diện Mục D:
 * Node TZ in ['UTC', 'Asia/Ho_Chi_Minh'] x MySQL time_zone in ['SYSTEM', '+00:00', '+07:00']
 * Tổng cộng 6 cấu hình x 8 hạng mục kiểm tra
 */

const crypto = require('crypto');
const { query, pool } = require('../sedinco_backend/src/config/db');
const attendanceService = require('../sedinco_backend/src/services/attendanceService');
const authService = require('../sedinco_backend/src/services/authService');
const { calculateEmployeeSalary } = require('../sedinco_backend/src/utils/payrollCalculator');
const { getVietnamDateString, getVietnamTimeString, getVietnamDateParts } = require('../sedinco_backend/src/utils/timeHelper');
const { generateDynamicQrToken, verifyDynamicQrToken } = require('../sedinco_backend/src/utils/dynamicQrHelper');
const { logAuditEvent } = require('../sedinco_backend/src/middlewares/authMiddleware');

const nodeTzs = ['UTC', 'Asia/Ho_Chi_Minh'];
const mysqlTzs = ['SYSTEM', '+00:00', '+07:00'];

const BCRYPT_HASH_123456 = '$2b$10$RZNmB06.7I4WIWTSOQMm6OXcTKzruToter0SviNCXp0US2Q4Wdvja';
const QR_SECRET = process.env.QR_SECRET || process.env.JWT_SECRET || 'sedinco-dynamic-qr-secure-salt-2026';

function createCustomTimestampQr(branchId, timestampSec) {
    const nonce = crypto.randomBytes(8).toString('hex');
    const rawData = `${branchId}:${timestampSec}:${nonce}`;
    const signature = crypto.createHmac('sha256', QR_SECRET).update(rawData).digest('base64url');
    return `sedinco:qr:v1:${branchId}:${timestampSec}:${nonce}:${signature}`;
}

async function runSingleConfig(nodeTz, mysqlTz) {
    process.env.TZ = nodeTz;
    await query(`SET time_zone = '${mysqlTz}'`);
    
    const results = {};
    const testEmployee = 'NV_TZ_TEST';

    // Chuẩn bị nhân viên test
    await query('DELETE FROM employees WHERE ma_nv = ?', [testEmployee]);
    await query(`
        INSERT INTO employees (ma_nv, ho_ten, chuc_danh, role, status, is_locked, password, ngay_bat_dau_lam, luong_cb)
        VALUES (?, 'Timezone Test Worker', 'Công nhân may', 'worker', 'active', 0, ?, '2026-01-01', 8000000)
    `, [testEmployee, BCRYPT_HASH_123456]);

    // Dọn dẹp logs cũ của NV này
    await query('DELETE FROM attendance_logs WHERE employee_id = ?', [testEmployee]);
    await query('DELETE FROM login_rate_limits WHERE identifier = ? OR key_name LIKE ?', [testEmployee, `%${testEmployee}%`]);

    // 1. Chấm công 06:00 VN (23:00 UTC ngày 2026-11-02 -> ngày VN là 2026-11-03)
    try {
        const time0600 = new Date('2026-11-02T23:00:00.000Z');
        const qr1 = await attendanceService.generateDynamicQr(1);
        const checkIn1 = await attendanceService.checkInMultiFactor({
            token: qr1.token,
            lat: 16.0544,
            lng: 108.2022,
            current_user: { ma_nv: testEmployee, role: 'worker' },
            currentTime: time0600
        });
        
        const row1 = await query('SELECT record_date, check_in_time FROM attendance_logs WHERE employee_id = ? AND record_date = "2026-11-03"', [testEmployee]);
        const dateMatch = row1.length > 0 && checkIn1.data.record_date === '2026-11-03';
        const timeMatch = checkIn1.data.check_in_time && checkIn1.data.check_in_time.startsWith('06:00');
        results['01_checkin_0600_vn'] = (dateMatch && timeMatch) ? 'PASS' : `FAIL (date=${checkIn1.data?.record_date}, time=${checkIn1.data?.check_in_time})`;
    } catch (e) {
        results['01_checkin_0600_vn'] = `FAIL: ${e.message}`;
    }

    // 2. Chấm công 23:50 VN (16:50 UTC ngày 2026-11-03 -> ngày VN là 2026-11-03)
    try {
        const time2350 = new Date('2026-11-03T16:50:00.000Z');
        const qr2 = await attendanceService.generateDynamicQr(1);
        const checkIn2 = await attendanceService.checkInMultiFactor({
            token: qr2.token,
            lat: 16.0544,
            lng: 108.2022,
            current_user: { ma_nv: testEmployee, role: 'worker' },
            currentTime: time2350
        });
        
        const row2 = await query('SELECT check_out_time FROM attendance_logs WHERE employee_id = ? AND record_date = "2026-11-03"', [testEmployee]);
        const dbCheckoutTime = row2.length > 0 ? row2[0].check_out_time : '';
        const timeMatch = dbCheckoutTime && dbCheckoutTime.startsWith('23:50');
        results['02_checkin_2350_vn'] = (checkIn2.success && timeMatch) ? 'PASS' : `FAIL (time=${dbCheckoutTime})`;
    } catch (e) {
        results['02_checkin_2350_vn'] = `FAIL: ${e.message}`;
    }

    // 3. Ma trận công tháng (Truy vấn theo tháng 11/2026)
    try {
        const matrix = await attendanceService.getAttendanceMatrix(11, 2026);
        const empRecord = matrix.find(m => m.ma_nv === testEmployee);
        results['03_attendance_matrix'] = empRecord ? 'PASS' : 'FAIL (No emp in matrix)';
    } catch (e) {
        results['03_attendance_matrix'] = `FAIL: ${e.message}`;
    }

    // 4. TTL QR Token (30s)
    try {
        const nowSec = Math.floor(Date.now() / 1000);
        const tokenValidObj = generateDynamicQrToken(1, 30);
        const verifyValid = verifyDynamicQrToken(tokenValidObj.token, 30);
        
        // Token hết hạn
        const tokenExpiredStr = createCustomTimestampQr(1, nowSec - 35);
        const verifyExpired = verifyDynamicQrToken(tokenExpiredStr, 30);

        results['04_ttl_qr_30s'] = (verifyValid.valid && !verifyExpired.valid && verifyExpired.expired) ? 'PASS' : 'FAIL (TTL verification error)';
    } catch (e) {
        results['04_ttl_qr_30s'] = `FAIL: ${e.message}`;
    }

    // 5. Rate limit (Login fail lock & age check)
    try {
        await query('DELETE FROM login_rate_limits WHERE identifier = ? OR key_name LIKE ?', [testEmployee, `%${testEmployee}%`]);
        // Ghi nhận 1 thất bại qua hàm employeeLogin
        await authService.employeeLogin(testEmployee, 'wrong_password_tz', '127.0.0.1');
        const rows = await query('SELECT attempt_count, locked_until FROM login_rate_limits WHERE identifier = ? OR key_name LIKE ?', [testEmployee, `%${testEmployee}%`]);
        results['05_rate_limit'] = (rows && rows.length > 0 && rows[0].attempt_count >= 1) ? 'PASS' : 'FAIL';
    } catch (e) {
        results['05_rate_limit'] = `FAIL: ${e.message}`;
    }

    // 6. Kỳ chốt (Period Lock check với record_date)
    try {
        await query('DELETE FROM period_locks WHERE month = 11 AND year = 2026');
        const beforeLock = await attendanceService.isPeriodLocked(11, 2026);
        await attendanceService.lockPeriod({ month: 11, year: 2026, locked_by: 'admin', reason: 'Test Lock Timezone', confirm_low_trust: true });
        const afterLock = await attendanceService.isPeriodLocked(11, 2026);
        await query('DELETE FROM period_locks WHERE month = 11 AND year = 2026');
        results['06_period_lock'] = (!beforeLock && afterLock) ? 'PASS' : `FAIL (before=${beforeLock}, after=${afterLock})`;
    } catch (e) {
        results['06_period_lock'] = `FAIL: ${e.message}`;
    }

    // 7. Bảng lương (Payroll Calculation ngày làm việc không bị lệch)
    try {
        const logs = [
            { record_date: '2026-11-03', status: '1', check_in_time: '08:00:00', check_out_time: '17:00:00' },
            { record_date: '2026-11-04', status: '1', check_in_time: '08:00:00', check_out_time: '17:00:00' }
        ];
        const payroll = calculateEmployeeSalary({
            luong_cb: 8000000,
            cong_chuan: 26,
            ngay_chinh_thuc: '2026-01-01',
            logs,
            holidays: []
        });
        const daysOk = payroll.totalWorkDays === 2 && payroll.salaryByWork > 0;
        results['07_payroll_calc'] = daysOk ? 'PASS' : `FAIL (days=${payroll.totalWorkDays}, salaryByWork=${payroll.salaryByWork})`;
    } catch (e) {
        results['07_payroll_calc'] = `FAIL: ${e.message}`;
    }

    // 8. Audit log (Kiểm tra ghi nhận thời gian)
    try {
        await logAuditEvent({
            actor_id: testEmployee,
            actor_role: 'worker',
            action: 'TZ_TEST_ACTION',
            resource: 'timezone',
            details: { nodeTz, mysqlTz }
        });
        const auditRows = await query('SELECT created_at FROM audit_logs WHERE actor_id = ? ORDER BY id DESC LIMIT 1', [testEmployee]);
        results['08_audit_log'] = (auditRows.length > 0 && auditRows[0].created_at) ? 'PASS' : 'FAIL';
    } catch (e) {
        results['08_audit_log'] = `FAIL: ${e.message}`;
    }

    // Dọn dẹp NV test
    await query('DELETE FROM employees WHERE ma_nv = ?', [testEmployee]);
    await query('DELETE FROM attendance_logs WHERE employee_id = ?', [testEmployee]);
    await query('DELETE FROM login_rate_limits WHERE identifier = ? OR key_name LIKE ?', [testEmployee, `%${testEmployee}%`]);
    await query('DELETE FROM audit_logs WHERE actor_id = ?', [testEmployee]);

    return results;
}

async function main() {
    console.log("=============================================================================");
    console.log(">>> CHẠY MA TRẬN KIỂM THỬ MÚI GIỜ TOÀN DIỆN (MỤC D)");
    console.log("=============================================================================\n");

    const matrixReport = [];

    for (const nTz of nodeTzs) {
        for (const mTz of mysqlTzs) {
            console.log(`Đang chạy kiểm thử: Node TZ = [${nTz}] x MySQL time_zone = [${mTz}]...`);
            const res = await runSingleConfig(nTz, mTz);
            matrixReport.push({
                nodeTz: nTz,
                mysqlTz: mTz,
                results: res
            });
            console.log(`  -> Hoàn thành cấu hình: ${Object.values(res).filter(v => v === 'PASS').length}/8 PASS\n`);
        }
    }

    console.log("=============================================================================");
    console.log("[TỔNG KẾT MA TRẬN MÚI GIỜ 6 TỔ HỢP X 8 HẠNG MỤC]");
    console.log("=============================================================================");
    console.log(JSON.stringify(matrixReport, null, 2));

    await pool.end();
}

main().catch(err => {
    console.error("LỖI CHẠY MA TRẬN MÚI GIỜ:", err);
    process.exit(1);
});
