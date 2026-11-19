/**
 * Suite 11 — V25 Period-Lock Broadcast Notifications, Historical Payslip + Attendance Sheet,
 * Late/Early Attendance Notes & Conditional Allowances Verification.
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const {
    startTestServer,
    apiRequest,
    query,
    createQaEmployee,
    snapshotSettings,
    restoreSettings,
    createTestRunTracker,
    closeTestRuntime
} = require('./_helpers');

let srv = null;
let baseUrl = '';
let tracker = null;
let settingsSnap = null;
let admToken = '';
let accToken = '';
let w3Token = '';
let maxNotifIdBefore = 0;

const LOCK_MONTH = 7;
const HIST_MONTH = 6;
const NOTE_MONTH = 8;
const TEST_YEAR = 2096;

test.before(async () => {
    srv = await startTestServer();
    baseUrl = srv.baseUrl;
    tracker = createTestRunTracker('V25');
    settingsSnap = await snapshotSettings();

    const pwHash = bcrypt.hashSync('123456', 10);
    await query('UPDATE admins SET password = ?, must_change_password = 0 WHERE username = "admin"', [pwHash]);
    await query(
        "UPDATE employees SET password = ?, must_change_password = 0, is_locked = 0, status = 'active' WHERE ma_nv IN ('NV002', 'NV003')",
        [pwHash]
    );
    await query("UPDATE employees SET role = 'accountant' WHERE ma_nv = 'NV002'");
    await query("UPDATE employees SET role = 'worker' WHERE ma_nv = 'NV003'");

    const [maxN] = await query('SELECT COALESCE(MAX(id), 0) as m FROM user_notifications');
    maxNotifIdBefore = Number(maxN?.m || 0);

    await query('DELETE FROM period_locks WHERE year = ?', [TEST_YEAR]);
    await query('DELETE FROM payroll_periods WHERE year = ?', [TEST_YEAR]);
    await query('DELETE FROM attendance_logs WHERE employee_id IN ("NV002", "NV003") AND YEAR(record_date) = ?', [TEST_YEAR]);

    const admLogin = await apiRequest(baseUrl, 'POST', '/api/admin/login', {
        body: { username: 'admin', password: '123456' }
    });
    assert.equal(admLogin.status, 200, 'Admin baseline login must succeed');
    admToken = admLogin.json?.data?.token || admLogin.json?.token;
    assert.ok(admToken, 'Admin token must exist');

    const accLogin = await apiRequest(baseUrl, 'POST', '/api/login', {
        body: { ma_nv: 'NV002', password: '123456' }
    });
    assert.equal(accLogin.status, 200, 'Accountant NV002 login must succeed');
    accToken = accLogin.json?.data?.token || accLogin.json?.token;
    assert.ok(accToken, 'Accountant token must exist');

    const w3Login = await apiRequest(baseUrl, 'POST', '/api/login', {
        body: { ma_nv: 'NV003', password: '123456' }
    });
    assert.equal(w3Login.status, 200, 'Worker NV003 login must succeed');
    w3Token = w3Login.json?.data?.token || w3Login.json?.token;
    assert.ok(w3Token, 'Worker token must exist');
});

test.after(async () => {
    try {
        await query('DELETE FROM user_notifications WHERE id > ? OR ref_year = ?', [maxNotifIdBefore, TEST_YEAR]).catch(() => {});
        await query('DELETE FROM period_locks WHERE year = ?', [TEST_YEAR]).catch(() => {});
        await query('DELETE FROM payroll_periods WHERE year = ?', [TEST_YEAR]).catch(() => {});
        await query('DELETE FROM attendance_logs WHERE employee_id IN ("NV002", "NV003") AND YEAR(record_date) = ?', [TEST_YEAR]).catch(() => {});
        await query('DELETE FROM attendance WHERE nam = ?', [TEST_YEAR]).catch(() => {});
        if (tracker) await tracker.cleanup();
        if (settingsSnap) await restoreSettings(settingsSnap);
    } finally {
        if (srv) await srv.close();
        await closeTestRuntime();
    }
});

let workerTargetNotifId = null;
let accTargetNotifId = null;

test('V25-T1: Admin locks period -> Broadcasts persistent notifications to all active non-admin employees and Admin', async () => {
    const activeNonAdminRows = await query(
        "SELECT ma_nv FROM employees WHERE (status IS NULL OR status != 'inactive') AND (role IS NULL OR role != 'admin')"
    );
    const activeCount = activeNonAdminRows.length;
    assert.ok(activeCount >= 2, 'Expected active non-admin employees NV002 & NV003');

    tracker.trackPeriodLock(LOCK_MONTH, TEST_YEAR);
    const lockRes = await apiRequest(baseUrl, 'POST', '/api/attendance/lock', {
        token: admToken,
        body: {
            month: LOCK_MONTH,
            year: TEST_YEAR,
            reason: 'QA V25 Broadcast Chốt Kỳ Công'
        }
    });
    assert.equal(lockRes.status, 200, `POST /api/attendance/lock failed: ${lockRes.raw}`);
    assert.equal(lockRes.json.success, true);
    assert.equal(lockRes.json.notifications_sent, activeCount);

    // NV003 Worker checks GET /api/notifications/my
    const w3Notifs = await apiRequest(baseUrl, 'GET', '/api/notifications/my', { token: w3Token });
    assert.equal(w3Notifs.status, 200);
    assert.ok(w3Notifs.json.data.unread_count >= 1, 'NV003 must have >= 1 unread notification');
    const w3LockNotif = w3Notifs.json.data.notifications.find(
        (n) => n.type === 'PERIOD_LOCKED_PAYROLL' && Number(n.ref_month) === LOCK_MONTH && Number(n.ref_year) === TEST_YEAR
    );
    assert.ok(w3LockNotif, 'NV003 must receive PERIOD_LOCKED_PAYROLL notification for 7/2096');
    assert.equal(w3LockNotif.is_read, 0);
    assert.ok(w3LockNotif.title.includes(`Tháng ${LOCK_MONTH}/${TEST_YEAR}`));
    workerTargetNotifId = w3LockNotif.id;

    // NV002 Accountant checks GET /api/notifications/my
    const accNotifs = await apiRequest(baseUrl, 'GET', '/api/notifications/my', { token: accToken });
    assert.equal(accNotifs.status, 200);
    const accLockNotif = accNotifs.json.data.notifications.find(
        (n) => n.type === 'PERIOD_LOCKED_PAYROLL' && Number(n.ref_month) === LOCK_MONTH && Number(n.ref_year) === TEST_YEAR
    );
    assert.ok(accLockNotif, 'NV002 Accountant must also receive PERIOD_LOCKED_PAYROLL notification');
    assert.equal(accLockNotif.is_read, 0);
    accTargetNotifId = accLockNotif.id;

    // Admin sees confirmation notification on both /api/notifications/my and /api/notifications/summary
    const admNotifs = await apiRequest(baseUrl, 'GET', '/api/notifications/my', { token: admToken });
    assert.equal(admNotifs.status, 200);
    const admLockNotif = admNotifs.json.data.notifications.find(
        (n) => n.recipient_ma_nv === 'ADMIN' && n.type === 'PERIOD_LOCKED_PAYROLL' && Number(n.ref_month) === LOCK_MONTH && Number(n.ref_year) === TEST_YEAR
    );
    assert.ok(admLockNotif, 'Admin must receive confirmation notification in user_notifications');
    assert.ok(admLockNotif.message.includes(String(activeCount)), 'Admin message should mention notified employee count');

    const admSummary = await apiRequest(baseUrl, 'GET', '/api/notifications/summary', { token: admToken });
    assert.equal(admSummary.status, 200);
    const summaryAlert = (admSummary.json.data.actionable_alerts || []).find(
        (a) => a.category === 'period_locked' && Number(a.month) === LOCK_MONTH && Number(a.year) === TEST_YEAR
    );
    assert.ok(summaryAlert, 'Admin alerts summary must surface unread period_locked confirmation alert');
});

test('V25-T2: Worker reads notification (marks read) & fetches locked + historical Payslip + Daily Attendance', async () => {
    assert.ok(workerTargetNotifId, 'Precondition from T1: NV003 notification id must exist');
    assert.ok(accTargetNotifId, 'Precondition from T1: NV002 notification id must exist');

    // Seed daily logs for NV003 in locked month 7/2096 and previous historical month 6/2096
    await query(
        `INSERT INTO attendance_logs (employee_id, record_date, check_in_time, check_out_time, status, late_minutes, early_leave_minutes, work_credit, ot_hours)
         VALUES
         ('NV003', '2096-07-10', '08:00:00', '17:35:00', '1', 0, 0, 1, 0),
         ('NV003', '2096-06-15', '08:05:00', '17:30:00', '1', 5, 0, 1, 0)`
    );

    // Cross-user isolation: NV003 cannot mark NV002's notification as read
    const crossRead = await apiRequest(baseUrl, 'PUT', `/api/notifications/${accTargetNotifId}/read`, { token: w3Token });
    assert.equal(crossRead.status, 404, 'Worker must not be able to mark another employee notification as read');

    // NV003 marks own notification as read
    const beforeList = await apiRequest(baseUrl, 'GET', '/api/notifications/my', { token: w3Token });
    const unreadBefore = beforeList.json.data.unread_count;

    const markRes = await apiRequest(baseUrl, 'PUT', `/api/notifications/${workerTargetNotifId}/read`, { token: w3Token });
    assert.equal(markRes.status, 200);
    assert.equal(markRes.json.data.is_read, 1);
    assert.equal(markRes.json.data.unread_count, Math.max(0, unreadBefore - 1));

    const dbRows = await query('SELECT is_read FROM user_notifications WHERE id = ?', [workerTargetNotifId]);
    assert.equal(Number(dbRows[0].is_read), 1, 'DB user_notifications.is_read must persist as 1');

    // Also verify read-all endpoint for NV002
    const markAllRes = await apiRequest(baseUrl, 'PUT', '/api/notifications/read-all', { token: accToken });
    assert.equal(markAllRes.status, 200);
    assert.equal(markAllRes.json.data.unread_count, 0);

    // Worker opens locked month 7/2096 payslip + attendance sheet
    const lockedSlip = await apiRequest(baseUrl, 'GET', `/api/payroll/me?month=${LOCK_MONTH}&year=${TEST_YEAR}`, {
        token: w3Token
    });
    assert.equal(lockedSlip.status, 200);
    assert.equal(lockedSlip.json.data.period_locked, true);
    assert.equal(Number(lockedSlip.json.data.thang), LOCK_MONTH);
    assert.equal(Number(lockedSlip.json.data.nam), TEST_YEAR);
    assert.ok(Array.isArray(lockedSlip.json.data.daily_logs) && lockedSlip.json.data.daily_logs.length >= 1);

    // Worker switches inside modal to historical month 6/2096
    const histSlip = await apiRequest(baseUrl, 'GET', `/api/payroll/me?month=${HIST_MONTH}&year=${TEST_YEAR}`, {
        token: w3Token
    });
    assert.equal(histSlip.status, 200);
    assert.equal(histSlip.json.data.period_locked, false);
    assert.equal(Number(histSlip.json.data.thang), HIST_MONTH);
    assert.ok(Array.isArray(histSlip.json.data.daily_logs) && histSlip.json.data.daily_logs.length >= 1);
});

test('V25-T3: Admin views any employee historical Payslip + Detailed Attendance Sheet via /api/payroll/employee/:ma_nv', async () => {
    const admHistRes = await apiRequest(baseUrl, 'GET', `/api/payroll/employee/NV003?month=${HIST_MONTH}&year=${TEST_YEAR}`, {
        token: admToken
    });
    assert.equal(admHistRes.status, 200);
    assert.equal(admHistRes.json.data.ma_nv, 'NV003');
    assert.equal(Number(admHistRes.json.data.thang), HIST_MONTH);
    assert.ok(Array.isArray(admHistRes.json.data.daily_logs) && admHistRes.json.data.daily_logs.length >= 1);

    const admLockedRes = await apiRequest(baseUrl, 'GET', `/api/payroll/employee/NV003?month=${LOCK_MONTH}&year=${TEST_YEAR}`, {
        token: admToken
    });
    assert.equal(admLockedRes.status, 200);
    assert.equal(admLockedRes.json.data.period_locked, true);

    // RBAC: Worker must get 403 on /api/payroll/employee/:ma_nv
    const workerForbidden = await apiRequest(baseUrl, 'GET', `/api/payroll/employee/NV002?month=${LOCK_MONTH}&year=${TEST_YEAR}`, {
        token: w3Token
    });
    assert.equal(workerForbidden.status, 403);

    // Pure Manager Isolation: Admin profile employee (role='admin') must return 400 & nonexistent/admins table 'admin' returns 404
    const qaAdm = tracker.trackEmployee('QA_V25_ADM');
    await createQaEmployee({ ma_nv: qaAdm, ho_ten: 'QA Admin Manager', role: 'admin', luong_cb: 0 });
    const adminSelfReject = await apiRequest(baseUrl, 'GET', `/api/payroll/employee/${qaAdm}?month=${LOCK_MONTH}&year=${TEST_YEAR}`, {
        token: admToken
    });
    assert.equal(adminSelfReject.status, 400);

    const pureAdminReject = await apiRequest(baseUrl, 'GET', `/api/payroll/employee/admin?month=${LOCK_MONTH}&year=${TEST_YEAR}`, {
        token: admToken
    });
    assert.equal(pureAdminReject.status, 404);
});

test('V25-T4: Late / Early / Both / Short Duration / On-Time / Missing Checkout attendance notes match V25 specs', async () => {
    const qaEmp = tracker.trackEmployee('QA_V25_N');
    await createQaEmployee({ ma_nv: qaEmp, ho_ten: 'QA Ghi Chú Công', role: 'worker', luong_cb: 10400000 });

    const qaLogin = await apiRequest(baseUrl, 'POST', '/api/login', {
        body: { ma_nv: qaEmp, password: 'QaPass@2026!' }
    });
    assert.equal(qaLogin.status, 200);
    const qaTok = qaLogin.json?.data?.token || qaLogin.json?.token;
    assert.ok(qaTok, 'QA worker token must exist');

    await query(
        `INSERT INTO attendance_logs (employee_id, record_date, check_in_time, check_out_time, status, late_minutes, early_leave_minutes, work_credit, duration_status, morning_worked_minutes, afternoon_worked_minutes)
         VALUES
         (?, '2096-08-03', '08:25:00', '17:35:00', '1', 25, 0, 1, 'FULL_DAY', 215, 240),
         (?, '2096-08-04', '07:55:00', '17:00:00', '1', 0, 30, 1, 'FULL_DAY', 240, 210),
         (?, '2096-08-05', '08:10:00', '17:15:00', '1', 10, 15, 1, 'FULL_DAY', 230, 225),
         (?, '2096-08-06', '08:00:00', '08:05:00', '0', 0, 0, 0, 'INVALID_SHORT_DURATION', 5, 0),
         (?, '2096-08-07', '07:55:00', '17:35:00', '1', 0, 0, 1, 'FULL_DAY', 240, 240),
         (?, '2096-08-08', '08:02:00', NULL, '0.5', 2, 0, 0, 'INVALID_SHORT_DURATION', 0, 0)`,
        [qaEmp, qaEmp, qaEmp, qaEmp, qaEmp, qaEmp]
    );
    // Day 8 missing checkout has duration_status = NULL unless explicitly set on check-in
    await query(
        "UPDATE attendance_logs SET duration_status = NULL WHERE employee_id = ? AND record_date = '2096-08-08'",
        [qaEmp]
    );

    const [attRes, admDetailRes] = await Promise.all([
        apiRequest(baseUrl, 'GET', `/api/attendance/me?month=${NOTE_MONTH}&year=${TEST_YEAR}`, { token: qaTok }),
        apiRequest(baseUrl, 'GET', `/api/payroll/employee/${qaEmp}?month=${NOTE_MONTH}&year=${TEST_YEAR}`, { token: admToken })
    ]);
    assert.equal(attRes.status, 200);
    assert.equal(admDetailRes.status, 200);

    const checkNotes = (logs, sourceLabel) => {
        const byDate = {};
        for (const l of logs) {
            const iso = l.record_date_iso || String(l.record_date || '').slice(0, 10);
            byDate[iso] = l;
        }
        assert.equal(byDate['2096-08-03'].attendance_note, 'Vào muộn 25 phút', `${sourceLabel}: late note mismatch`);
        assert.equal(byDate['2096-08-04'].attendance_note, 'Ra sớm 30 phút', `${sourceLabel}: early note mismatch`);
        assert.equal(byDate['2096-08-05'].attendance_note, 'Vào muộn 10 phút • Ra sớm 15 phút', `${sourceLabel}: late+early note mismatch`);
        assert.equal(byDate['2096-08-06'].attendance_note, 'Thời gian làm quá ngắn (5 phút) - Không tính công', `${sourceLabel}: short note mismatch`);
        assert.equal(byDate['2096-08-07'].attendance_note, 'Đúng giờ • Đủ công', `${sourceLabel}: on-time note mismatch`);
        assert.equal(byDate['2096-08-08'].attendance_note, 'Vào muộn 2 phút • Chưa chấm công ra (Quên check-out)', `${sourceLabel}: missing checkout note mismatch`);
        assert.match(byDate['2096-08-03'].date_label, /^\d{2}\/\d{2} \(T[2-7]|CN\)$/);
    };

    checkNotes(attRes.json.data.logs, 'GET /api/attendance/me');
    checkNotes(admDetailRes.json.data.daily_logs, 'GET /api/payroll/employee/:ma_nv');
});

test('V25-T5: Conditional allowances return ONLY items > 0, and return [] / total_allowance = 0 when all are 0', async () => {
    const qaPartial = tracker.trackEmployee('QA_V25_A2');
    const qaZero = tracker.trackEmployee('QA_V25_A0');

    await createQaEmployee({ ma_nv: qaPartial, ho_ten: 'QA 2 Phụ Cấp', role: 'worker', luong_cb: 10400000 });
    await createQaEmployee({ ma_nv: qaZero, ho_ten: 'QA 0 Phụ Cấp', role: 'worker', luong_cb: 10400000 });

    await query(
        `UPDATE employees SET
            phu_cap_an_trua = 730000,
            phu_cap_xang_xe = 0,
            phu_cap_nha_o = 0,
            thuong_htcv = 0,
            phu_cap_trach_nhiem = 0,
            phu_cap_tiep_khach = 300000
         WHERE ma_nv = ?`,
        [qaPartial]
    );
    await query(
        `UPDATE employees SET
            phu_cap_an_trua = 0,
            phu_cap_xang_xe = 0,
            phu_cap_nha_o = 0,
            thuong_htcv = 0,
            phu_cap_trach_nhiem = 0,
            phu_cap_tiep_khach = 0
         WHERE ma_nv = ?`,
        [qaZero]
    );

    // Give both 2 full days worked in month 8/2096
    await query(
        `INSERT INTO attendance_logs (employee_id, record_date, check_in_time, check_out_time, status, work_credit)
         VALUES
         (?, '2096-08-10', '08:00:00', '17:30:00', '1', 1),
         (?, '2096-08-11', '08:00:00', '17:30:00', '1', 1),
         (?, '2096-08-10', '08:00:00', '17:30:00', '1', 1),
         (?, '2096-08-11', '08:00:00', '17:30:00', '1', 1)`,
        [qaPartial, qaPartial, qaZero, qaZero]
    );

    const partialRes = await apiRequest(baseUrl, 'GET', `/api/payroll/employee/${qaPartial}?month=${NOTE_MONTH}&year=${TEST_YEAR}`, {
        token: admToken
    });
    assert.equal(partialRes.status, 200);
    const partialData = partialRes.json.data;
    assert.equal(partialData.allowances.length, 2, 'Only the 2 positive allowances must be present');
    assert.deepEqual(
        partialData.allowances.map((a) => a.key),
        ['an_trua', 'tiep_khach']
    );
    for (const a of partialData.allowances) {
        assert.ok(Number(a.amount) > 0, `Allowance ${a.key} must be strictly > 0`);
    }
    assert.ok(partialData.total_allowance > 0);
    assert.equal(partialData.total_allowance, partialData.totalAllowance);

    const zeroRes = await apiRequest(baseUrl, 'GET', `/api/payroll/employee/${qaZero}?month=${NOTE_MONTH}&year=${TEST_YEAR}`, {
        token: admToken
    });
    assert.equal(zeroRes.status, 200);
    const zeroData = zeroRes.json.data;
    assert.deepEqual(zeroData.allowances, [], 'Employee with all 0 allowances must receive []');
    assert.equal(zeroData.total_allowance, 0);
    assert.equal(zeroData.totalAllowance, 0);
});
