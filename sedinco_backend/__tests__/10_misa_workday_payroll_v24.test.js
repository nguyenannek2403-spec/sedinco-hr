/**
 * Suite 10 — V24 MISA-Standard 8h (Morning/Afternoon) Attendance & Payroll Engine,
 * Vietnamese Number Formatting (1.000.000), Admin Overview/Detailed Payroll & 32-Case Matrix
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const {
    startTestServer,
    apiRequest,
    createQaEmployee,
    cleanupQaData,
    snapshotSettings,
    restoreSettings,
    query,
    closeTestRuntime
} = require('./_helpers');

const attendanceService = require('../src/services/attendanceService');
const { calculateEmployeeSalary } = require('../src/utils/payrollCalculator');
const { evaluateMisaDailyAttendance, calculateDailyEarnedAmount } = require('../src/utils/misaWorkdayEngine');

const vnTime = (isoDate, hhmmss) => new Date(`${isoDate}T${hhmmss}+07:00`);

const ROOT_DIR = path.resolve(__dirname, '../..');
const FE_SRC = path.join(ROOT_DIR, 'zalo-miniapp-frontend/src');

let srv;
let baseUrl;
let snap;
let adminToken;
let workerRow;
let probationRow;
let nightRow;
let viFmt;

async function clearV24TestData() {
    await query("DELETE FROM attendance_logs WHERE employee_id LIKE 'QA_V24_%' OR YEAR(record_date) = 2097").catch(() => {});
    await query("DELETE FROM attendance WHERE ma_nv LIKE 'QA_V24_%' OR nam = 2097").catch(() => {});
    await query("DELETE FROM requests WHERE employee_id LIKE 'QA_V24_%' OR YEAR(request_date) = 2097").catch(() => {});
    await query("DELETE FROM ot_registrations WHERE employee_id LIKE 'QA_V24_%' OR YEAR(work_date) = 2097").catch(() => {});
    await query("DELETE FROM idempotency_keys WHERE actor_id LIKE 'QA_V24_%'").catch(() => {});
    await query("DELETE FROM audit_logs WHERE actor_id LIKE 'QA_V24_%'").catch(() => {});
    await query("DELETE FROM employees WHERE ma_nv LIKE 'QA_V24_%'").catch(() => {});
}

test.before(async () => {
    srv = await startTestServer();
    baseUrl = srv.baseUrl;
    snap = await snapshotSettings();
    await cleanupQaData('QA_V24_', 2097);
    await clearV24TestData();

    viFmt = await import(pathToFileURL(path.join(FE_SRC, 'utils/viNumberFormat.js')).href);

    await createQaEmployee({
        ma_nv: 'QA_V24_W1',
        ho_ten: 'QA MISA Nhân Viên 1',
        role: 'worker',
        luong_cb: 13000000,
        status: 'active',
        shift_type: 'FULL_DAY'
    });
    await query(
        "UPDATE employees SET phu_cap_an_trua = 780000, phu_cap_xang_xe = 520000, phu_cap_nha_o = 260000, thuong_htcv = 260000, phu_cap_trach_nhiem = 260000, phu_cap_tiep_khach = 260000, department = 'Khối Công trình' WHERE ma_nv = 'QA_V24_W1'"
    );

    await createQaEmployee({
        ma_nv: 'QA_V24_PROB',
        ho_ten: 'QA MISA Thử Việc',
        role: 'worker',
        luong_cb: 13000000,
        status: 'probation',
        ngay_chinh_thuc: '2097-06-01',
        shift_type: 'FULL_DAY'
    });

    await createQaEmployee({
        ma_nv: 'QA_V24_NIGHT',
        ho_ten: 'QA MISA Ca Đêm',
        role: 'worker',
        luong_cb: 10400000,
        status: 'active',
        shift_type: 'NIGHT_SHIFT'
    });

    await createQaEmployee({
        ma_nv: 'QA_V24_ADM',
        ho_ten: 'QA MISA Admin',
        role: 'admin',
        luong_cb: 50000000
    });

    await query(
        `UPDATE company_settings SET
            work_start = '08:00',
            lunch_start = '12:00',
            lunch_end = '13:30',
            work_end = '17:30',
            standard_work_days = 26,
            probation_salary_percent = 85,
            grace_period_minutes = 15,
            late_policy_type = 'PER_MINUTE',
            late_penalty_per_minute = 2000,
            free_late_occurrences = 1,
            ot_calculation_mode = 'APPROVED_OR_AUTO',
            latitude = 16.0544,
            longitude = 108.2022,
            radius_meters = 200`
    );

    const rAdm = await apiRequest(baseUrl, 'POST', '/api/login', {
        body: { ma_nv: 'QA_V24_ADM', password: 'QaPass@2026!' }
    });
    adminToken = rAdm.json?.data?.token;

    const [w1] = await query("SELECT * FROM employees WHERE ma_nv = 'QA_V24_W1' LIMIT 1");
    const [prob] = await query("SELECT * FROM employees WHERE ma_nv = 'QA_V24_PROB' LIMIT 1");
    const [ng] = await query("SELECT * FROM employees WHERE ma_nv = 'QA_V24_NIGHT' LIMIT 1");
    workerRow = w1;
    probationRow = prob;
    nightRow = ng;
});

test.after(async () => {
    try {
        await restoreSettings(snap);
        await clearV24TestData();
        await cleanupQaData('QA_V24_', 2097);
    } finally {
        if (srv) await srv.close();
        await closeTestRuntime();
    }
});

// =========================================================================
// NHÓM A — CHỐNG TÍNH CÔNG / TIỀN ẢO CHO THAO TÁC NGẮN (5 TESTCASES)
// =========================================================================

test('TC-V24-01: Check-in 08:00 -> Check-out 08:05 (5 mins) yields 0 work_credit & 0 daily_wage', async () => {
    const d = '2097-04-01';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);

    await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '08:00:00')
    });
    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '08:05:00')
    });

    assert.equal(outRes.data.work_credit, 0);
    assert.equal(outRes.data.daily_wage, 0);
    assert.equal(outRes.data.status, '0');
    assert.equal(outRes.data.duration_status, 'INVALID_SHORT_DURATION');

    const [row] = await query('SELECT status, work_credit, work_hours FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);
    assert.equal(row.status, '0');
    assert.equal(Number(row.work_credit), 0);
    assert.equal(Number(row.work_hours), 0);
});

test('TC-V24-02: Check-in 13:30 -> Check-out 13:44 (14 mins < 15m floor) yields 0 work_credit & 0 daily_wage', async () => {
    const d = '2097-04-02';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);

    await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '13:30:00')
    });
    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '13:44:00')
    });

    assert.equal(outRes.data.work_credit, 0);
    assert.equal(outRes.data.daily_wage, 0);
    assert.equal(outRes.data.status, '0');
});

test('TC-V24-03: Check-in 08:00 -> Check-out 09:00 (60 mins < 120m half-session) does NOT round up to 0.5 credit', async () => {
    const d = '2097-04-03';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);

    await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '08:00:00')
    });
    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '09:00:00')
    });

    assert.equal(outRes.data.work_credit, 0);
    assert.equal(outRes.data.daily_wage, 0);
    assert.equal(outRes.data.status, '0');
    assert.equal(outRes.data.duration_status, 'INSUFFICIENT_SESSION_DURATION');
});

test('TC-V24-04: Full Morning Session 08:00 -> 12:00 (240 mins) earns 0.5 credit and exact 50% daily wage', async () => {
    const d = '2097-04-04';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);

    await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '08:00:00')
    });
    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '12:00:00')
    });

    assert.equal(outRes.data.morning_worked_minutes, 240);
    assert.equal(outRes.data.afternoon_worked_minutes, 0);
    assert.equal(outRes.data.work_credit, 0.5);
    assert.equal(outRes.data.daily_wage, 250000);
    assert.equal(outRes.data.status, '0.5');
});

test('TC-V24-05: Full 8h Workday 08:00 -> 17:30 (excluding 12:00-13:30 lunch = 480 mins) earns 1.0 credit & 100% daily wage', async () => {
    const d = '2097-04-05';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);

    await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '08:00:00')
    });
    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '17:30:00')
    });

    assert.equal(outRes.data.morning_worked_minutes, 240);
    assert.equal(outRes.data.afternoon_worked_minutes, 240);
    assert.equal(outRes.data.work_hours, 8);
    assert.equal(outRes.data.work_credit, 1);
    assert.equal(outRes.data.daily_wage, 500000);
    assert.equal(outRes.data.status, '1');
});

// =========================================================================
// NHÓM B — CA SÁNG / CA CHIỀU ĐỘT XUẤT & NÚT CHẤM CÔNG RA (8 TESTCASES)
// =========================================================================

test('TC-V24-06: Early afternoon leave (08:00 check-in -> 12:00 check-out) records 0.5 credit cleanly via API/service', async () => {
    const d = '2097-04-06';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);

    const inRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '08:00:00')
    });
    assert.equal(inRes.data.check_type, 'IN');

    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '12:00:00')
    });
    assert.equal(outRes.data.check_type, 'OUT');
    assert.equal(outRes.data.work_credit, 0.5);
    assert.equal(outRes.data.duration_status, 'MORNING_ONLY');
});

test('TC-V24-07: OneTouchCheckIn.jsx keeps Check-Out button permanently enabled whenever hasCheckedIn && !hasCheckedOut', () => {
    const src = fs.readFileSync(path.join(FE_SRC, 'components/OneTouchCheckIn.jsx'), 'utf8');
    assert.match(src, /const checkOutBtnEnabled\s*=\s*hasCheckedIn\s*&&\s*!hasCheckedOut\s*&&\s*!isLockedPeriod\s*&&\s*!isActionBusy;/);
    assert.ok(src.includes('data-testid="btn-checkout"'), 'Check-Out button must expose data-testid="btn-checkout"');
    assert.ok(src.includes('CHẤM CÔNG RA'), 'Check-Out button must render clear Vietnamese label CHẤM CÔNG RA');
});

test('TC-V24-08: Afternoon-only attendance (13:30 check-in -> 17:30 check-out) has 0 late_minutes & 0.5 afternoon credit', async () => {
    const d = '2097-04-08';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);

    const inRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '13:30:00')
    });
    assert.equal(inRes.data.late_minutes, 0, 'Checking in at 13:30 for afternoon work must NOT incur morning lateness');

    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '17:30:00')
    });
    assert.equal(outRes.data.late_minutes, 0);
    assert.equal(outRes.data.afternoon_worked_minutes, 240);
    assert.equal(outRes.data.work_credit, 0.5);
    assert.equal(outRes.data.duration_status, 'AFTERNOON_ONLY');
});

test('TC-V24-09: Afternoon-only late check-in at 13:50 measures exact 20m lateness from 13:30 (NOT 350m from 08:00)', async () => {
    const d = '2097-04-09';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);

    const inRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '13:50:00')
    });
    assert.equal(inRes.data.late_minutes, 20, 'Late minutes must be calculated relative to 13:30 (20 mins), not 08:00 (350 mins)');

    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '17:30:00')
    });
    assert.equal(outRes.data.work_credit, 0.5);
});

test('TC-V24-10: Approved Paid Morning Half-Leave (0.5 P) + Full Afternoon Work (13:30-17:30) totals 1.0 paid workday', async () => {
    const d = '2097-04-10';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);
    await query('DELETE FROM requests WHERE employee_id = ? AND request_date = ?', ['QA_V24_W1', d]);

    await query(
        "INSERT INTO requests (employee_id, request_type, request_date, reason, status) VALUES ('QA_V24_W1', 'Nghỉ phép nửa ngày sáng (0.5)', ?, 'Việc gia đình buổi sáng', 'approved')",
        [d]
    );

    await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '13:30:00')
    });
    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '17:30:00')
    });

    assert.equal(outRes.data.work_credit, 1);
    assert.equal(outRes.data.status, '1');
    assert.equal(outRes.data.daily_wage, 500000);
});

test('TC-V24-11: Approved Unpaid Morning Leave + Full Afternoon Work (13:30-17:30) yields 0.5 paid workday', async () => {
    const d = '2097-04-11';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);
    await query('DELETE FROM requests WHERE employee_id = ? AND request_date = ?', ['QA_V24_W1', d]);

    await query(
        "INSERT INTO requests (employee_id, request_type, request_date, reason, status) VALUES ('QA_V24_W1', 'KP', ?, 'Nghỉ không lương nửa ngày sáng (0.5)', 'approved')",
        [d]
    );

    await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '13:30:00')
    });
    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '17:30:00')
    });

    assert.equal(outRes.data.work_credit, 0.5);
    assert.equal(outRes.data.status, '0.5');
    assert.equal(outRes.data.daily_wage, 250000);
});

test('TC-V24-12: Full morning (240m) + short 30m afternoon (13:30-14:00) keeps 0.5 credit (does NOT round to 1.0)', async () => {
    const d = '2097-04-12';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);

    await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '08:00:00')
    });
    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '14:00:00')
    });

    assert.equal(outRes.data.morning_worked_minutes, 240);
    assert.equal(outRes.data.afternoon_worked_minutes, 30);
    assert.equal(outRes.data.work_credit, 0.5);
    assert.equal(outRes.data.status, '0.5');
});

test('TC-V24-13: Probation worker (85%) working 0.5 morning session earns 0.5 * (baseSalary * 85% / stdDays)', async () => {
    const d = '2097-04-13';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_PROB', d]);

    await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_PROB',
        current_user: probationRow, currentTime: vnTime(d, '08:00:00')
    });
    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_PROB',
        current_user: probationRow, currentTime: vnTime(d, '12:00:00')
    });

    assert.equal(outRes.data.work_credit, 0.5);
    assert.equal(outRes.data.daily_wage, 212500);

    const calc = calculateEmployeeSalary({
        luong_cb: 13000000,
        cong_chuan: 26,
        ngay_chinh_thuc: '2097-06-01',
        status: 'probation',
        logs: [{ record_date: d, status: '0.5', work_credit: 0.5, ot_hours: 0, late_minutes: 0, dow: 3 }],
        has_insurance: false,
        companySettings: { standard_work_days: 26, probation_salary_percent: 85 }
    });
    assert.equal(calc.salaryByWork, 212500);
});

// =========================================================================
// NHÓM C — QUÊN CHẤM CÔNG RA TRONG CÙNG NGÀY VS SANG NGÀY HÔM SAU (7 TESTCASES)
// =========================================================================

test('TC-V24-14: Returning to office at 14:30 same day updates single work_date row cleanly', async () => {
    const d = '2097-04-14';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);

    await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '08:00:00')
    });
    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '14:30:00')
    });

    const rows = await query('SELECT COUNT(*) as cnt, check_in_time, check_out_time FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);
    assert.equal(rows[0].cnt, 1);
    assert.equal(outRes.data.record_date, d);
    assert.equal(outRes.data.morning_worked_minutes, 240);
    assert.equal(outRes.data.afternoon_worked_minutes, 60);
    assert.equal(outRes.data.work_credit, 0.5);
});

test('TC-V24-15: Late same-day check-out at 21:30 WITHOUT approved OT grants 1.0 workday & ZERO phantom OT hours', async () => {
    const d = '2097-04-15';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', d]);
    await query('DELETE FROM ot_registrations WHERE employee_id = ? AND work_date = ?', ['QA_V24_W1', d]);

    await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '08:00:00')
    });
    const outRes = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d, '21:30:00')
    });

    assert.equal(outRes.data.work_credit, 1);
    assert.equal(outRes.data.work_hours, 8);
    assert.equal(outRes.data.ot_hours, 0, 'Must NOT fabricate 4h OT from 17:30->21:30 without approved OT registration');
    assert.equal(outRes.data.status, '1');
});

test('TC-V24-16: Re-querying getMyAttendance after 21:30 check-out preserves check_in_time & check_out_time (goodbye state)', async () => {
    const d = '2097-04-15';
    const meState = await attendanceService.getMyAttendance('QA_V24_W1', 4, 2097, vnTime(d, '22:00:00'));

    assert.ok(meState.today_record, 'today_record must be populated after relogin same evening');
    assert.equal(meState.today_record.work_date, d);
    assert.equal(meState.today_record.check_in_time, '08:00:00');
    assert.equal(meState.today_record.check_out_time, '21:30:00');
    assert.equal(Number(meState.today_record.work_credit), 1);
});

test('TC-V24-17: Unclosed yesterday (D-1) on next morning (D) returns today_record=null + unclosed_previous_record', async () => {
    const dPrev = '2097-04-16';
    const dCurr = '2097-04-17';
    await query('DELETE FROM attendance_logs WHERE employee_id = ? AND record_date IN (?, ?)', ['QA_V24_W1', dPrev, dCurr]);

    await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(dPrev, '08:00:00')
    });

    const nextMorningState = await attendanceService.getMyAttendance('QA_V24_W1', 4, 2097, vnTime(dCurr, '08:00:00'));
    assert.equal(nextMorningState.today_record, null, 'Next calendar day D must start fresh with today_record = null');
    assert.ok(nextMorningState.unclosed_previous_record, 'Must expose unclosed_previous_record from D-1');
    assert.equal(nextMorningState.unclosed_previous_record.record_date, dPrev);
    assert.equal(nextMorningState.unclosed_previous_record.check_in_time, '08:00:00');
});

test('TC-V24-18: Checking in on day D creates new row for D without overwriting unclosed D-1 check_out_time', async () => {
    const dPrev = '2097-04-16';
    const dCurr = '2097-04-17';

    const inDayD = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(dCurr, '08:02:00')
    });
    assert.equal(inDayD.data.check_type, 'IN');
    assert.equal(inDayD.data.record_date, dCurr);

    const [prevRow] = await query('SELECT check_in_time, check_out_time FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', dPrev]);
    const [currRow] = await query('SELECT check_in_time, check_out_time FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', dCurr]);
    assert.equal(prevRow.check_out_time, null, 'Day D check-in must NEVER overwrite D-1 check_out_time');
    assert.equal(currRow.check_in_time, '08:02:00');
});

test('TC-V24-19: Approving forgot-checkout compensation request for D-1 closes D-1 & computes MISA workday credit', async () => {
    const dPrev = '2097-04-16';
    const rW1 = await apiRequest(baseUrl, 'POST', '/api/login', {
        body: { ma_nv: 'QA_V24_W1', password: 'QaPass@2026!' }
    });
    const w1Tok = rW1.json?.data?.token;

    const reqRes = await apiRequest(baseUrl, 'POST', '/api/requests', {
        token: w1Tok,
        headers: { 'X-Idempotency-Key': `v24-comp-${Date.now()}` },
        body: {
            request_type: 'Bổ sung công / Quên chấm giờ ra',
            from_date: dPrev,
            to_date: dPrev,
            correction_mode: 'CHECK_OUT',
            check_out_time: '17:30',
            reason: 'Quên bấm ra chiều ngày hôm trước'
        }
    });
    assert.equal(reqRes.status, 201, `Create comp request failed: ${reqRes.raw}`);
    const reqId = reqRes.json?.data?.id;

    const appRes = await apiRequest(baseUrl, 'PUT', `/api/requests/${reqId}`, {
        token: adminToken,
        headers: { 'X-Idempotency-Key': `v24-app-comp-${Date.now()}` },
        body: { status: 'approved' }
    });
    assert.equal(appRes.status, 200, `Approve comp request failed: ${appRes.raw}`);

    const [prevRow] = await query('SELECT check_in_time, check_out_time, work_credit, work_hours, status FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_V24_W1', dPrev]);
    assert.equal(prevRow.check_out_time, '17:30:00');
    assert.equal(Number(prevRow.work_hours), 8);
    assert.equal(Number(prevRow.work_credit), 1);
    assert.equal(prevRow.status, '1');
});

test('TC-V24-20: Cross-midnight GMT+7 separation for FULL_DAY (23:50 D vs 00:10 D+1) and overnight close for NIGHT_SHIFT', async () => {
    const d1 = '2097-04-19';
    const d2 = '2097-04-20';
    const dNight = '2097-04-21';
    const dNightNext = '2097-04-22';

    // Standard FULL_DAY splits strictly on GMT+7 calendar boundary
    const f1 = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d1, '23:50:00')
    });
    const f2 = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_1',
        current_user: workerRow, currentTime: vnTime(d2, '00:10:00')
    });
    assert.equal(f1.data.record_date, d1);
    assert.equal(f2.data.record_date, d2);
    assert.equal(f1.data.check_type, 'IN');
    assert.equal(f2.data.check_type, 'IN');

    // NIGHT_SHIFT closes open overnight shift cleanly
    const nIn = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_NIGHT',
        current_user: nightRow, currentTime: vnTime(dNight, '18:00:00')
    });
    const nOut = await attendanceService.checkInMultiFactor({
        lat: 16.0544, lng: 108.2022, device_info: 'QA_V24_DEV_NIGHT',
        current_user: nightRow, currentTime: vnTime(dNightNext, '02:00:00')
    });
    assert.equal(nIn.data.record_date, dNight);
    assert.equal(nOut.data.record_date, dNight);
    assert.equal(nOut.data.check_type, 'OUT');
    assert.equal(nOut.data.work_credit, 1);
    assert.ok(nOut.data.work_hours >= 4);
});

// =========================================================================
// NHÓM D — ĐỊNH DẠNG SỐ VIỆT NAM (1.000.000) & BẢNG LƯƠNG ADMIN (12 TESTCASES)
// =========================================================================

test('TC-V24-21: formatViNumber formats thousands with dot and decimals with comma', () => {
    assert.equal(viFmt.formatViNumber(0), '0');
    assert.equal(viFmt.formatViNumber(1000000), '1.000.000');
    assert.equal(viFmt.formatViNumber(12500000), '12.500.000');
    assert.equal(viFmt.formatViNumber(0.5), '0,5');
    assert.equal(viFmt.formatViNumber(22.75), '22,75');
});

test('TC-V24-22: formatViCurrency produces exact Vietnamese currency format with zero comma-thousands or abbreviations', () => {
    assert.equal(viFmt.formatViCurrency(1500000), '1.500.000 đ');
    assert.equal(viFmt.formatViCurrency(500000, false), '500.000');
    assert.equal(viFmt.formatViCurrency(-250000), '-250.000 đ');
    assert.equal(viFmt.formatViCurrency(12500000), '12.500.000 đ');
});

test('TC-V24-23: formatViWorkday formats 0, 0.5, 1, 24.5 accurately', () => {
    assert.equal(viFmt.formatViWorkday(0), '0');
    assert.equal(viFmt.formatViWorkday(0.5), '0,5');
    assert.equal(viFmt.formatViWorkday(1), '1');
    assert.equal(viFmt.formatViWorkday(24.5), '24,5');
});

test('TC-V24-24: parseViNumberInput round-trips formatted Vietnamese numbers and decimals accurately', () => {
    assert.equal(viFmt.parseViNumberInput('1.000.000'), 1000000);
    assert.equal(viFmt.parseViNumberInput('12.500.000 đ'), 12500000);
    assert.equal(viFmt.parseViNumberInput('1500000'), 1500000);
    assert.equal(viFmt.parseViNumberInput('0,5'), 0.5);
    assert.equal(viFmt.parseViNumberInput('-250.000'), -250000);
});

test('TC-V24-25: viNumberFormat safely handles null, undefined, empty string, and NaN', () => {
    assert.equal(viFmt.formatViNumber(null), '0');
    assert.equal(viFmt.formatViNumber(undefined), '0');
    assert.equal(viFmt.formatViCurrency(NaN), '0 đ');
    assert.equal(viFmt.formatViWorkday(''), '0');
    assert.equal(viFmt.parseViNumberInput(null), 0);
    assert.equal(viFmt.parseViNumberInput(undefined), 0);
});

test('TC-V24-26: Frontend source uses viNumberFormat across Payroll, Slip, Advance, HR & History (zero "tr" shorthand)', () => {
    const payrollGrid = fs.readFileSync(path.join(FE_SRC, 'components/PayrollGridTable.jsx'), 'utf8');
    const slipModal = fs.readFileSync(path.join(FE_SRC, 'components/SalarySlipModal.jsx'), 'utf8');
    const leaveModal = fs.readFileSync(path.join(FE_SRC, 'components/SmartLeaveRequestModal.jsx'), 'utf8');
    const empTab = fs.readFileSync(path.join(FE_SRC, 'views/desktop/EmployeeManagementTab.jsx'), 'utf8');
    const histTab = fs.readFileSync(path.join(FE_SRC, 'views/worker/WorkerHistoryTab.jsx'), 'utf8');
    const profTab = fs.readFileSync(path.join(FE_SRC, 'views/worker/WorkerProfileTab.jsx'), 'utf8');

    for (const src of [payrollGrid, slipModal, leaveModal, empTab, histTab, profTab]) {
        assert.ok(src.includes('viNumberFormat'), 'Must import viNumberFormat utilities');
        assert.ok(!src.includes('.toLocaleString('), 'Must not call raw .toLocaleString directly on numbers');
    }
    assert.ok(!payrollGrid.includes('/ 1000000).toFixed(1)} tr'), 'KPI must not abbreviate salary as "X.Y tr"');
});

test('TC-V24-27: Admin GET /api/payroll exposes full detailed fields (unitDailyWage, workedDays, leave/holiday, daily_logs)', async () => {
    const res = await apiRequest(baseUrl, 'GET', '/api/payroll?month=4&year=2097', { token: adminToken });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json?.data));
    const w1 = res.json.data.find((r) => r.ma_nv === 'QA_V24_W1');
    assert.ok(w1, 'QA_V24_W1 must appear in Admin payroll');
    assert.equal(w1.unitDailyWage, 500000);
    assert.ok(Array.isArray(w1.daily_logs));
    assert.ok('workedDays' in w1 && 'paidLeaveDays' in w1 && 'holidayDays' in w1 && 'probationPercent' in w1);
});

test('TC-V24-28: Pure Admin account is 100% excluded from Admin GET /api/payroll & PayrollGridTable filter', async () => {
    const res = await apiRequest(baseUrl, 'GET', '/api/payroll?month=4&year=2097', { token: adminToken });
    assert.equal(res.status, 200);
    const hasAdmin = res.json.data.some((r) => r.ma_nv === 'QA_V24_ADM' || r.role === 'admin');
    assert.equal(hasAdmin, false, 'Admin account must never appear on payroll list');
});

test('TC-V24-29: Detailed payroll breaks down 6 allowance categories, approved OT & manual bonus accurately', async () => {
    // Seed 2h approved weekday OT on 2097-04-23 + bonus 1.000.000 đ
    const dOt = '2097-04-23';
    await query(
        "INSERT INTO attendance_logs (employee_id, record_date, check_in_time, check_out_time, status, work_credit, ot_hours) VALUES ('QA_V24_W1', ?, '08:00:00', '19:30:00', '1/OT', 1, 2) ON DUPLICATE KEY UPDATE status = '1/OT', work_credit = 1, ot_hours = 2",
        [dOt]
    );
    await query(
        "INSERT INTO ot_registrations (employee_id, work_date, expected_hours, reason, approved_by, status) VALUES ('QA_V24_W1', ?, 2, 'Tăng ca V24', 'QA_V24_ADM', 'approved') ON DUPLICATE KEY UPDATE expected_hours = 2, status = 'approved'",
        [dOt]
    );
    await query(
        "INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, bonus_amount, penalty_amount, advance_deduction) VALUES ('QA_V24_W1', 4, 2097, 26, 1000000, 150000, 500000) ON DUPLICATE KEY UPDATE bonus_amount = 1000000, penalty_amount = 150000, advance_deduction = 500000"
    );

    const res = await apiRequest(baseUrl, 'GET', '/api/payroll?month=4&year=2097', { token: adminToken });
    assert.equal(res.status, 200);
    const w1 = res.json.data.find((r) => r.ma_nv === 'QA_V24_W1');
    assert.equal(w1.bonusAmount, 1000000);
    assert.ok(w1.otAmount > 0, 'OT amount must be positive for approved 1/OT day');
    assert.ok(w1.allowances_breakdown && 'an_trua' in w1.allowances_breakdown && 'xang_xe' in w1.allowances_breakdown && 'trach_nhiem' in w1.allowances_breakdown);
    assert.equal(w1.totalAllowance,
        w1.allowances_breakdown.an_trua +
        w1.allowances_breakdown.xang_xe +
        w1.allowances_breakdown.nha_o +
        w1.allowances_breakdown.thuong_htcv +
        w1.allowances_breakdown.trach_nhiem +
        w1.allowances_breakdown.tiep_khach
    );
});

test('TC-V24-30: Detailed payroll breaks down latePenaltyAmount, totalInsurance, penaltyAmount, advanceDeduction & carryOverDebt', async () => {
    const res = await apiRequest(baseUrl, 'GET', '/api/payroll?month=4&year=2097', { token: adminToken });
    const w1 = res.json.data.find((r) => r.ma_nv === 'QA_V24_W1');
    assert.equal(w1.penaltyAmount, 150000);
    assert.equal(w1.advanceDeduction, 500000);
    assert.equal(w1.totalInsurance, Math.round(13000000 * 0.105));
    assert.equal(typeof w1.latePenaltyAmount, 'number');
    assert.equal(typeof w1.carryOverDebt, 'number');
});

test('TC-V24-31: Payroll daily_logs assigns 0 đ to 5-min invalid log & exact 250.000/500.000 đ to valid half/full day logs', async () => {
    const res = await apiRequest(baseUrl, 'GET', '/api/payroll?month=4&year=2097', { token: adminToken });
    const w1 = res.json.data.find((r) => r.ma_nv === 'QA_V24_W1');
    const dayShort5Min = w1.daily_logs.find((l) => l.record_date_iso === '2097-04-01');
    const dayMorningHalf = w1.daily_logs.find((l) => l.record_date_iso === '2097-04-04');
    const dayFull8h = w1.daily_logs.find((l) => l.record_date_iso === '2097-04-05');

    assert.ok(dayShort5Min && dayMorningHalf && dayFull8h);
    assert.equal(dayShort5Min.work_credit, 0);
    assert.equal(dayShort5Min.daily_earned_amount, 0, '5-minute short check must pay 0 đ');
    assert.equal(dayMorningHalf.work_credit, 0.5);
    assert.equal(dayMorningHalf.daily_earned_amount, 250000);
    assert.equal(dayFull8h.work_credit, 1);
    assert.equal(dayFull8h.daily_earned_amount, 500000);
});

test('TC-V24-32: PayrollGridTable.jsx renders both Overview and Detailed Admin modes with daily log drilldown', () => {
    const gridSrc = fs.readFileSync(path.join(FE_SRC, 'components/PayrollGridTable.jsx'), 'utf8');
    assert.ok(gridSrc.includes('data-testid="payroll-mode-overview"'));
    assert.ok(gridSrc.includes('data-testid="payroll-mode-detailed"'));
    assert.ok(gridSrc.includes('📊 Bảng lương tổng quan'));
    assert.ok(gridSrc.includes('📑 Bảng lương chi tiết'));
    assert.ok(gridSrc.includes('Đối chiếu nhật ký công'));
    assert.ok(gridSrc.includes('daily_earned_amount'));

    // Pure function smoke verification matching 2097-04 rules
    const dEval = evaluateMisaDailyAttendance({
        checkInTime: '08:00:00',
        checkOutTime: '12:00:00',
        shiftCode: 'FULL_DAY'
    });
    assert.equal(dEval.work_credit, 0.5);
    assert.equal(calculateDailyEarnedAmount({ luong_cb: 13000000, cong_chuan: 26, probationRatio: 1, workCredit: dEval.work_credit }), 250000);
});
