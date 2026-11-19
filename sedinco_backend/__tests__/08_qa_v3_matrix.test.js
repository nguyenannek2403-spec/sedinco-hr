/**
 * Suite 08 — MASTER PROMPT V3 Expanded Matrix (Dimensions 1–11)
 * Covers: Dynamic Accountant RBAC & permissions payload, Admin register password policy &
 * pure-admin change-password, Partial PUT /employees preservation & 404 contracts,
 * Check-out DEDUCT_WORKDAY & 0h guard, delete attendance audit log, ATTENDANCE_COMPENSATION
 * quota aliases ('ct'), rejected OT request preserving '1', payroll resolve-dispute validation,
 * Golden Payroll Oracle parity, and withTransaction rollback + pool recovery.
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { withTransaction, query } = require('../src/config/db');
const { calculateEmployeeSalary } = require('../src/utils/payrollCalculator');
const { getVietnamDateString } = require('../src/utils/timeHelper');
const { resetMockZaloTokens } = require('../src/utils/zaloAdapter');
const {
    startTestServer,
    apiRequest,
    createQaEmployee,
    snapshotSettings,
    restoreSettings,
    createTestRunTracker,
    closeTestRuntime
} = require('./_helpers');

let srv;
let baseUrl;
let snap;
let permsSnapshot = [];
const tracker = createTestRunTracker('QV3');

let w1Id;
let w2Id;
let accId;
let admId;

let workerToken;
let worker2Token;
let accToken;
let adminToken;

test.before(async () => {
    srv = await startTestServer();
    baseUrl = srv.baseUrl;
    snap = await snapshotSettings();
    permsSnapshot = await query('SELECT permission_key, is_enabled FROM accountant_permissions');
    resetMockZaloTokens();

    w1Id = tracker.makeMaNv('W1');
    w2Id = tracker.makeMaNv('W2');
    accId = tracker.makeMaNv('AC');
    admId = tracker.makeMaNv('AD');

    await createQaEmployee({
        ma_nv: w1Id,
        ho_ten: 'QV3 Worker 1',
        role: 'worker',
        department: 'Xưởng Cơ Khí',
        chuc_danh: 'Thợ hàn',
        luong_cb: 13000000,
        has_insurance: 1,
        ngay_chinh_thuc: '2024-01-01',
        shift_type: 'DEFAULT_8H',
        annual_leave_quota: 12
    });
    await createQaEmployee({
        ma_nv: w2Id,
        ho_ten: 'QV3 Worker 2',
        role: 'worker',
        department: 'Công Trình',
        chuc_danh: 'Thợ lắp đặt',
        luong_cb: 10400000,
        has_insurance: 1,
        ngay_chinh_thuc: '2024-01-01'
    });
    await createQaEmployee({ ma_nv: accId, ho_ten: 'QV3 Accountant', role: 'accountant', chuc_danh: 'Kế toán' });
    await createQaEmployee({ ma_nv: admId, ho_ten: 'QV3 Admin', role: 'admin', chuc_danh: 'Giám đốc' });

    const rW1 = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: w1Id, password: 'QaPass@2026!' } });
    workerToken = rW1.json?.data?.token;
    const rW2 = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: w2Id, password: 'QaPass@2026!' } });
    worker2Token = rW2.json?.data?.token;
    const rAcc = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: accId, password: 'QaPass@2026!' } });
    accToken = rAcc.json?.data?.token;
    const rAdm = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: admId, password: 'QaPass@2026!' } });
    adminToken = rAdm.json?.data?.token;

    assert.ok(workerToken && worker2Token && accToken && adminToken, 'All QV3 role tokens must be issued');

    await query(
        "UPDATE company_settings SET latitude = 16.0544, longitude = 108.2022, radius_meters = 150, work_start = '08:00:00', work_end = '17:30:00', late_policy_type = 'DEDUCT_WORKDAY', max_late_minutes_for_half_day = 60, standard_work_days = 26, insurance_rate = 10.5"
    );
});

test.after(async () => {
    try {
        await restoreSettings(snap);
        for (const p of permsSnapshot) {
            await query('UPDATE accountant_permissions SET is_enabled = ? WHERE permission_key = ?', [
                p.is_enabled ? 1 : 0,
                p.permission_key
            ]).catch(() => {});
        }
        await tracker.cleanup();
    } finally {
        if (srv) await srv.close();
        await closeTestRuntime();
    }
});

test('QA3-AUTH-01: Accountant login & zalo-auto-login must include dynamic_permissions map', async () => {
    const loginRes = await apiRequest(baseUrl, 'POST', '/api/login', {
        body: { ma_nv: accId, password: 'QaPass@2026!' }
    });
    assert.equal(loginRes.status, 200);
    const loginPerms = loginRes.json?.data?.dynamic_permissions;
    assert.equal(typeof loginPerms, 'object', 'Accountant login must include data.dynamic_permissions');
    assert.ok(loginPerms !== null && 'payroll_view_all' in loginPerms, 'dynamic_permissions must contain seeded permission keys');

    const bindRes = await apiRequest(baseUrl, 'POST', '/api/employees/bind-zalo', {
        token: accToken,
        body: { zalo_token: `mock_zalo_user_${tracker.test_run_id}_acc` }
    });
    assert.equal(bindRes.status, 200);

    const autoRes = await apiRequest(baseUrl, 'POST', '/api/auth/zalo-auto-login', {
        body: {
            zalo_access_token: `mock_zalo_user_${tracker.test_run_id}_acc`,
            zalo_user_id: `${tracker.test_run_id}_acc`,
            ma_nv: accId,
            device_id: `DEV_${tracker.test_run_id}`
        }
    });
    assert.equal(autoRes.status, 200);
    const autoPerms = autoRes.json?.data?.dynamic_permissions;
    assert.equal(typeof autoPerms, 'object', 'Accountant zalo-auto-login must include data.dynamic_permissions');
    assert.ok(autoPerms !== null && 'attendance_view_all' in autoPerms);
});

test('QA3-AUTH-02: Admin register enforces password policy & pure admin user can change-password', async () => {
    const weakAdm = tracker.trackAdmin(`ADM_W_${tracker.test_run_id}`.slice(0, 30));
    const weakRes = await apiRequest(baseUrl, 'POST', '/api/admin/register', {
        token: adminToken,
        body: { username: weakAdm, password: '123', ho_ten: 'Weak Admin' }
    });
    assert.equal(weakRes.status, 400, `Weak password in admin/register must be rejected with 400, got ${weakRes.status}`);

    const pureAdm = tracker.trackAdmin(`ADM_P_${tracker.test_run_id}`.slice(0, 30));
    const regRes = await apiRequest(baseUrl, 'POST', '/api/admin/register', {
        token: adminToken,
        body: { username: pureAdm, password: 'QaAdmin@2026!', ho_ten: 'Pure Admin User' }
    });
    assert.ok([200, 201].includes(regRes.status), `Valid admin/register must succeed, got ${regRes.status}: ${regRes.raw}`);

    const admLoginRes = await apiRequest(baseUrl, 'POST', '/api/admin/login', {
        body: { username: pureAdm, password: 'QaAdmin@2026!' }
    });
    assert.equal(admLoginRes.status, 200);
    const pureAdmToken = admLoginRes.json?.data?.token;
    assert.ok(pureAdmToken);

    const chgRes = await apiRequest(baseUrl, 'POST', '/api/change-password', {
        token: pureAdmToken,
        body: { old_password: 'QaAdmin@2026!', new_password: 'QaAdmin#New2027!' }
    });
    assert.equal(chgRes.status, 200, `Pure admins table user change-password must succeed, got ${chgRes.status}: ${chgRes.raw}`);

    const oldLogin = await apiRequest(baseUrl, 'POST', '/api/admin/login', {
        body: { username: pureAdm, password: 'QaAdmin@2026!' }
    });
    assert.equal(oldLogin.status, 401, 'Old password must fail after admin change-password');

    const newLogin = await apiRequest(baseUrl, 'POST', '/api/admin/login', {
        body: { username: pureAdm, password: 'QaAdmin#New2027!' }
    });
    assert.equal(newLogin.status, 200, 'New password must work after admin change-password');
});

test('QA3-RBAC-01: Dynamic Accountant permissions negative 403 matrix & immutable Admin SoD boundaries', async () => {
    await apiRequest(baseUrl, 'PUT', '/api/settings/accountant-permissions', {
        token: adminToken,
        body: {
            permissions: {
                employee_view: true,
                employee_create: false,
                employee_edit: false,
                employee_delete: false,
                employee_status_manage: false,
                payroll_view_all: true,
                payroll_calculate: false,
                payroll_export: false,
                payroll_approve: false,
                leave_view_all: true,
                leave_approve: false
            }
        }
    });

    const deniedCalls = [
        ['POST', '/api/employees', { ma_nv: tracker.makeMaNv('NO_CR'), ho_ten: 'No Create', role: 'worker' }],
        ['PUT', `/api/employees/${w1Id}`, { ho_ten: 'Blocked Edit' }],
        ['DELETE', `/api/employees/${w2Id}`],
        ['PUT', `/api/employees/${w2Id}/status`, { is_locked: 1 }],
        ['POST', '/api/payroll/calculate', { month: 5, year: 2098 }],
        ['POST', '/api/payroll/adjustments', { ma_nv: w1Id, month: 5, year: 2098, bonus_amount: 100000 }],
        ['GET', '/api/payroll/export?month=5&year=2098'],
        ['POST', '/api/payroll/approve', { month: 5, year: 2098 }],
        ['POST', '/api/requests/batch-approve', { request_ids: [] }]
    ];
    for (const [method, url, body] of deniedCalls) {
        const res = await apiRequest(baseUrl, method, url, { token: accToken, body });
        assert.equal(res.status, 403, `Accountant ${method} ${url} with disabled perm must return 403, got ${res.status}`);
    }

    // Core Admin SoD endpoints ALWAYS blocked even if permissions exist
    for (const [method, url, body] of [
        ['PUT', `/api/employees/${w1Id}/role`, { role: 'accountant' }],
        ['PUT', '/api/company', { company_name: 'Hacked' }],
        ['POST', '/api/attendance/unlock-period', { month: 5, year: 2098, reason: 'Bypass' }],
        ['GET', '/api/audit-logs']
    ]) {
        const res = await apiRequest(baseUrl, method, url, { token: accToken, body });
        assert.equal(res.status, 403, `Admin-only ${method} ${url} must ALWAYS reject Accountant with 403, got ${res.status}`);
    }

    // Worker BOLA check on /api/employees/:other
    const bolaEmp = await apiRequest(baseUrl, 'GET', `/api/employees/${w1Id}`, { token: worker2Token });
    assert.equal(bolaEmp.status, 403, 'Worker cannot inspect another employee record');
});

test('QA3-EMP-01: Partial PUT /employees/:id preserves omitted fields & missing ma_nv returns 404', async () => {
    const partialRes = await apiRequest(baseUrl, 'PUT', `/api/employees/${w1Id}`, {
        token: adminToken,
        body: { ho_ten: 'QV3 Worker 1 Renamed' }
    });
    assert.equal(partialRes.status, 200);

    const checkRes = await apiRequest(baseUrl, 'GET', `/api/employees/${w1Id}`, { token: adminToken });
    assert.equal(checkRes.status, 200);
    const emp = checkRes.json?.data;
    assert.equal(emp.ho_ten, 'QV3 Worker 1 Renamed');
    assert.equal(Number(emp.luong_cb), 13000000, 'Partial PUT must preserve existing luong_cb');
    assert.equal(emp.department, 'Xưởng Cơ Khí', 'Partial PUT must preserve existing department');
    assert.equal(emp.chuc_danh, 'Thợ hàn', 'Partial PUT must preserve existing chuc_danh');
    assert.equal(Number(emp.has_insurance), 1, 'Partial PUT must preserve existing has_insurance');

    const missingId = 'NON_EXISTENT_QV3_99999';
    const missGet = await apiRequest(baseUrl, 'GET', `/api/employees/${missingId}`, { token: adminToken });
    assert.equal(missGet.status, 404);
    const missPut = await apiRequest(baseUrl, 'PUT', `/api/employees/${missingId}`, { token: adminToken, body: { ho_ten: 'X' } });
    assert.equal(missPut.status, 404, `PUT non-existent employee must return 404, got ${missPut.status}`);
    const missStatus = await apiRequest(baseUrl, 'PUT', `/api/employees/${missingId}/status`, { token: adminToken, body: { is_locked: 1 } });
    assert.equal(missStatus.status, 404, `PUT status non-existent employee must return 404, got ${missStatus.status}`);
    const missDel = await apiRequest(baseUrl, 'DELETE', `/api/employees/${missingId}`, { token: adminToken });
    assert.equal(missDel.status, 404, `DELETE non-existent employee must return 404, got ${missDel.status}`);
});

test('QA3-ATT-01: Checkout preserves DEDUCT_WORKDAY 0.5 penalty & blocks 1.0 workday when work_hours <= 4.5', async () => {
    const vnToday = getVietnamDateString(new Date());
    const nowVn = new Date(Date.now() + 7 * 3600 * 1000);
    const curMins = nowVn.getUTCHours() * 60 + nowVn.getUTCMinutes();
    // Mô phỏng ca làm việc hợp lệ 3,0 giờ (180 phút >= ngưỡng 120p/buổi và <= 4,5h) trong ngày
    const inMins = Math.max(0, curMins - 180);
    const startMins = Math.max(0, inMins - 30);
    const lunchStartMins = Math.max(curMins, inMins + 180);
    const lunchEndMins = Math.min(1435, lunchStartMins + 10);
    const endMins = Math.max(1, curMins - 5);
    const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

    await query(
        'UPDATE company_settings SET work_start = ?, lunch_start = ?, lunch_end = ?, work_end = ?, late_policy_type = ?, max_late_minutes_for_half_day = ?',
        [fmt(startMins), fmt(lunchStartMins), fmt(lunchEndMins), fmt(endMins), 'DEDUCT_WORKDAY', 60]
    );

    await query(
        "INSERT INTO attendance_logs (employee_id, record_date, check_in_time, status, late_minutes, work_location_type) VALUES (?, ?, ?, '0.5', 75, 'OFFICE') ON DUPLICATE KEY UPDATE check_in_time = VALUES(check_in_time), check_out_time = NULL, status = '0.5', late_minutes = 75",
        [w1Id, vnToday, `${fmt(inMins)}:00`]
    );

    const outRes = await apiRequest(baseUrl, 'POST', '/api/attendance/check-in', {
        token: workerToken,
        headers: { 'X-Idempotency-Key': `qv3-out-${tracker.test_run_id}` },
        body: { lat: 16.0544, lng: 108.2022, work_location_type: 'OFFICE', device_info: `DEV_${tracker.test_run_id}` }
    });
    assert.equal(outRes.status, 200, `Checkout failed: ${outRes.raw}`);

    const [logRow] = await query('SELECT status, work_hours FROM attendance_logs WHERE employee_id = ? AND record_date = ?', [w1Id, vnToday]);
    assert.equal(logRow.status, '0.5', `Checkout with ~3.0h worked & DEDUCT_WORKDAY half-day check-in MUST remain '0.5', got '${logRow.status}'`);
});

test('QA3-ATT-02: Manual attendance update rejects unknown ma_nv (404) & deletion writes DELETE_ATTENDANCE audit', async () => {
    const missingUpdate = await apiRequest(baseUrl, 'POST', '/api/attendance/update', {
        token: adminToken,
        body: { ma_nv: 'NO_SUCH_EMP_QV3', date: '2098-06-10', status: '1' }
    });
    assert.equal(missingUpdate.status, 404, `Manual update for non-existent ma_nv must return 404, got ${missingUpdate.status}`);

    await apiRequest(baseUrl, 'POST', '/api/attendance/update', {
        token: adminToken,
        body: { ma_nv: w2Id, date: '2098-06-10', status: '1' }
    });
    const delRes = await apiRequest(baseUrl, 'POST', '/api/attendance/update', {
        token: adminToken,
        body: { ma_nv: w2Id, date: '2098-06-10', status: '' }
    });
    assert.equal(delRes.status, 200);

    const delLogs = await query(
        "SELECT action FROM audit_logs WHERE actor_id = ? AND action = 'DELETE_ATTENDANCE' ORDER BY id DESC LIMIT 1",
        [admId]
    );
    assert.equal(delLogs.length, 1, 'Deleting manual attendance must write DELETE_ATTENDANCE audit log');
});

test('QA3-REQ-01: Unlimited monthly attendance compensation (including "ct" 4th/5th) & rejected OT preserves "1" log', async () => {
    const quotaMonth = '2098-06';
    for (const day of ['02', '03', '04', '05', '06']) {
        const reqType = day === '05' ? 'ct' : 'quên chấm công';
        const res = await apiRequest(baseUrl, 'POST', '/api/requests', {
            token: workerToken,
            headers: { 'X-Idempotency-Key': `qv3-comp-${day}-${tracker.test_run_id}` },
            body: { request_type: reqType, from_date: `${quotaMonth}-${day}`, to_date: `${quotaMonth}-${day}`, reason: `Compensation ${day}` }
        });
        assert.equal(res.status, 201, `Request ${day} (${reqType}) including 4th/5th must succeed 201 after V16 unlimited quota, got ${res.status}: ${res.raw}`);
        const [r] = await query('SELECT id FROM requests WHERE employee_id = ? AND request_date = ? ORDER BY id DESC LIMIT 1', [w1Id, `${quotaMonth}-${day}`]);
        if (r) tracker.trackRequest(r.id);
    }

    // Worker 2 has '1' worked day on 2098-06-16 -> submits OT -> Admin rejects -> attendance stays '1'
    await query(
        "INSERT INTO attendance_logs (employee_id, record_date, check_in_time, status) VALUES (?, '2098-06-16', '08:00:00', '1') ON DUPLICATE KEY UPDATE check_in_time = '08:00:00', status = '1'",
        [w2Id]
    );
    const otReq = await apiRequest(baseUrl, 'POST', '/api/requests', {
        token: worker2Token,
        headers: { 'X-Idempotency-Key': `qv3-ot-${tracker.test_run_id}` },
        body: { request_type: 'ot', from_date: '2098-06-16', to_date: '2098-06-16', reason: 'Xin tang ca' }
    });
    assert.equal(otReq.status, 201);
    const [otRow] = await query('SELECT id FROM requests WHERE employee_id = ? AND request_date = ? ORDER BY id DESC LIMIT 1', [w2Id, '2098-06-16']);
    assert.ok(otRow?.id);
    tracker.trackRequest(otRow.id);

    const rejRes = await apiRequest(baseUrl, 'PUT', `/api/requests/${otRow.id}`, {
        token: adminToken,
        headers: { 'X-Idempotency-Key': `qv3-rej-ot-${tracker.test_run_id}` },
        body: { status: 'rejected' }
    });
    assert.equal(rejRes.status, 200);

    const [attAfter] = await query('SELECT status FROM attendance_logs WHERE employee_id = ? AND record_date = ?', [w2Id, '2098-06-16']);
    assert.equal(attAfter.status, '1', `Rejected OT request must preserve existing worked status '1', got '${attAfter.status}'`);
});

test('QA3-PAY-01: resolve-dispute validates new_status & unknown employee (400/404) + Golden Payroll Oracle parity', async () => {
    const badStatus = await apiRequest(baseUrl, 'POST', '/api/payroll/resolve-dispute', {
        token: adminToken,
        headers: { 'X-Idempotency-Key': `qv3-disp-bad-${tracker.test_run_id}` },
        body: { ma_nv: w1Id, month: 6, year: 2098, new_status: 'INVALID_STATUS_XYZ', admin_response: 'Test' }
    });
    assert.equal(badStatus.status, 400, `Invalid resolve-dispute status must return 400, got ${badStatus.status}`);

    const missingEmp = await apiRequest(baseUrl, 'POST', '/api/payroll/resolve-dispute', {
        token: adminToken,
        headers: { 'X-Idempotency-Key': `qv3-disp-miss-${tracker.test_run_id}` },
        body: { ma_nv: 'UNKNOWN_EMP_QV3', month: 6, year: 2098, new_status: 'CONFIRMED', admin_response: 'Test' }
    });
    assert.equal(missingEmp.status, 404, `resolve-dispute for missing employee must return 404, got ${missingEmp.status}`);

    // Golden Payroll Oracle verification (probation + official + P + weekday 1/OT + Sunday OT + BHXH + PER_MINUTE late)
    const luongCb = 13000000;
    const stdDays = 26;
    const dailyRate = Math.round(luongCb / stdDays); // 500,000
    const hourlyRate = Math.round(dailyRate / 8); // 62,500
    const calc = calculateEmployeeSalary({
        luong_cb: luongCb,
        cong_chuan: stdDays,
        ngay_chinh_thuc: '2098-07-10',
        has_insurance: true,
        logs: [
            { record_date: '2098-07-02', status: '1', ot_hours: 0, late_minutes: 0, dow: 4 }, // Probation 85%
            { record_date: '2098-07-10', status: '1/OT', ot_hours: 2, late_minutes: 10, dow: 5 }, // Official + 2h weekday OT (1.5x) - 10m*2000
            { record_date: '2098-07-11', status: 'P', ot_hours: 0, late_minutes: 0, dow: 6 }, // Paid leave
            { record_date: '2098-07-13', status: 'OT', ot_hours: 4, late_minutes: 0, dow: 1 } // Sunday OT (2.0x)
        ],
        holidays: [],
        companySettings: {
            standard_work_days: 26,
            insurance_rate: 10.5,
            probation_salary_percent: 85,
            ot_rate_weekday: 1.5,
            ot_rate_weekend: 2.0,
            ot_rate_holiday: 3.0,
            late_policy_type: 'PER_MINUTE',
            late_penalty_per_minute: 2000,
            free_late_occurrences: 0
        }
    });

    const expectedSalaryByWork = Math.round((luongCb / stdDays) * (1 * 0.85 + 2)); // 1,425,000
    const expectedOt = Math.round(2 * hourlyRate * 1.5 + 4 * hourlyRate * 2.0); // 187,500 + 500,000 = 687,500
    const expectedLate = 10 * 2000; // 20,000
    const expectedInsurance = Math.round((luongCb * 10.5) / 100); // 1,365,000
    const expectedNet = Math.max(0, Math.round((luongCb / stdDays) * (1 * 0.85 + 2) + 2 * (luongCb / stdDays / 8) * 1.5 + 4 * (luongCb / stdDays / 8) * 2.0 - (luongCb * 10.5) / 100 - expectedLate));

    assert.equal(calc.salaryByWork, expectedSalaryByWork);
    assert.equal(calc.otAmount, expectedOt);
    assert.equal(calc.latePenaltyAmount, expectedLate);
    assert.equal(calc.totalInsurance, expectedInsurance);
    assert.equal(calc.netSalary, expectedNet);
});

test('QA3-DB-01: withTransaction rolls back atomically on error and releases DB connections without leak', async () => {
    const markerBefore = 'QV3_BEFORE_TX';
    await query('UPDATE employees SET ho_ten = ? WHERE ma_nv = ?', [markerBefore, w2Id]);

    await assert.rejects(async () => {
        await withTransaction(async (txQuery) => {
            await txQuery('UPDATE employees SET ho_ten = ? WHERE ma_nv = ?', ['QV3_DIRTY_TX', w2Id]);
            throw new Error('SIMULATED_TX_FAILURE');
        });
    }, /SIMULATED_TX_FAILURE/);

    const [afterRow] = await query('SELECT ho_ten FROM employees WHERE ma_nv = ?', [w2Id]);
    assert.equal(afterRow.ho_ten, markerBefore, 'Rolled-back transaction must restore original employee name');

    // Verify pool connections were released back properly across repeated rollbacks/queries
    for (let i = 0; i < 20; i++) {
        const rows = await query('SELECT 1 AS ok');
        assert.equal(rows[0].ok, 1);
    }
});

test('QA3-FE-01: safeGet cancelPrevious guards activeRequests deletion so superseded request finally cannot drop newer controller', async () => {
    const timers = new Set();
    const slowServer = http.createServer((req, res) => {
        const t = setTimeout(() => {
            timers.delete(t);
            if (!res.writableEnded) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, url: req.url }));
            }
        }, 80);
        timers.add(t);
    });

    await new Promise((resolve) => slowServer.listen(0, '127.0.0.1', resolve));
    const port = slowServer.address().port;
    const prevLocalStorage = global.localStorage;

    try {
        if (!global.localStorage) {
            const store = new Map();
            global.localStorage = {
                getItem: (k) => (store.has(k) ? store.get(k) : null),
                setItem: (k, v) => store.set(k, String(v)),
                removeItem: (k) => store.delete(k)
            };
        }

        const esbuildPath = path.resolve(__dirname, '../../zalo-miniapp-frontend/node_modules/esbuild');
        const esbuild = require(esbuildPath);
        const apiEntry = path.resolve(__dirname, '../../zalo-miniapp-frontend/src/utils/api.js');
        const bundled = esbuild.buildSync({
            entryPoints: [apiEntry],
            bundle: true,
            platform: 'node',
            format: 'cjs',
            write: false,
            logLevel: 'silent',
            define: {
                'import.meta.env': JSON.stringify({
                    VITE_API_URL: `http://127.0.0.1:${port}/api`,
                    VITE_ENABLE_CLIENT_ERROR_REPORTING: 'false'
                })
            }
        });

        const mod = { exports: {} };
        const fn = new Function('exports', 'require', 'module', bundled.outputFiles[0].text);
        fn(mod.exports, require, mod);
        const { safeGet } = mod.exports;

        const p1 = safeGet('/slow-race', { q: 'same' }, { cancelPrevious: true });
        const p2 = safeGet('/slow-race', { q: 'same' }, { cancelPrevious: true });

        await assert.rejects(p1, (err) => err?.isCanceled === true, 'First request must be canceled by second');

        // Give microtasks a tick after p1 settled (finally ran) before issuing p3
        await Promise.resolve();
        const p3 = safeGet('/slow-race', { q: 'same' }, { cancelPrevious: true });

        await assert.rejects(p2, (err) => err?.isCanceled === true, 'Second request controller must still be tracked and canceled by third');
        const res3 = await p3;
        assert.equal(res3?.ok, true);
    } finally {
        for (const t of timers) clearTimeout(t);
        if (prevLocalStorage === undefined) delete global.localStorage;
        else global.localStorage = prevLocalStorage;
        slowServer.closeAllConnections?.();
        await new Promise((r) => slowServer.close(r));
    }
});
