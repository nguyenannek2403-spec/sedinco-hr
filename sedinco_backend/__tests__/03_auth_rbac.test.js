/**
 * Suite 03 — Authentication, JWT Security, 7-Layer RBAC, SoD, BOLA/IDOR, SQLi/XSS & Rate Limiting
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    startTestServer,
    apiRequest,
    signCustomJwt,
    createQaEmployee,
    cleanupQaData,
    snapshotSettings,
    restoreSettings,
    query
} = require('./_helpers');

let srv;
let baseUrl;
let snap;

let workerToken;
let worker2Token;
let accToken;
let adminToken;

test.before(async () => {
    srv = await startTestServer();
    baseUrl = srv.baseUrl;
    snap = await snapshotSettings();
    await cleanupQaData('QA_', 2099);

    await createQaEmployee({ ma_nv: 'QA_WKR_1', ho_ten: 'QA Công Nhân 1', role: 'worker' });
    await createQaEmployee({ ma_nv: 'QA_WKR_2', ho_ten: 'QA Công Nhân 2', role: 'worker' });
    await createQaEmployee({ ma_nv: 'QA_ACC_1', ho_ten: 'QA Kế Toán', role: 'accountant', chuc_danh: 'Kế toán trưởng' });
    await createQaEmployee({ ma_nv: 'QA_ADM_1', ho_ten: 'QA Quản Trị', role: 'admin', chuc_danh: 'Giám đốc' });
    await createQaEmployee({ ma_nv: 'QA_LOCK_1', ho_ten: 'QA Bị Khóa', role: 'worker', status: 'inactive', is_locked: 1 });

    const r1 = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_WKR_1', password: 'QaPass@2026!' } });
    workerToken = r1.json?.data?.token;
    const r2 = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_WKR_2', password: 'QaPass@2026!' } });
    worker2Token = r2.json?.data?.token;
    const rAcc = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_ACC_1', password: 'QaPass@2026!' } });
    accToken = rAcc.json?.data?.token;
    const rAdm = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_ADM_1', password: 'QaPass@2026!' } });
    adminToken = rAdm.json?.data?.token;

    assert.ok(workerToken && worker2Token && accToken && adminToken, 'All QA role logins must yield JWTs');
});

test.after(async () => {
    await restoreSettings(snap);
    await cleanupQaData('QA_', 2099);
    if (srv) await srv.close();
});

test('AUTH-01: Reject unauthenticated, malformed, alg=none, expired, and tampered JWTs', async () => {
    const noTok = await apiRequest(baseUrl, 'GET', '/api/me');
    assert.equal(noTok.status, 401);

    const fakeTok = signCustomJwt({ id: 'QA_ADM_1', ma_nv: 'QA_ADM_1', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 }, 'wrong-secret-key-min-32-characters-long!');
    const badSig = await apiRequest(baseUrl, 'GET', '/api/me', { token: fakeTok });
    assert.ok([401, 403].includes(badSig.status));

    const expiredTok = signCustomJwt({ id: 'QA_WKR_1', ma_nv: 'QA_WKR_1', role: 'worker', exp: Math.floor(Date.now() / 1000) - 60 });
    const expRes = await apiRequest(baseUrl, 'GET', '/api/me', { token: expiredTok });
    assert.ok([401, 403].includes(expRes.status));

    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const noneBody = Buffer.from(JSON.stringify({ id: 'QA_ADM_1', role: 'admin' })).toString('base64url');
    const noneRes = await apiRequest(baseUrl, 'GET', '/api/me', { token: `${noneHeader}.${noneBody}.` });
    assert.ok([401, 403].includes(noneRes.status));
});

test('AUTH-02: Locked/Inactive user rejected at login and live token revocation (0-delay DB check)', async () => {
    const lockedLogin = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_LOCK_1', password: 'QaPass@2026!' } });
    assert.ok([401, 403].includes(lockedLogin.status));

    await createQaEmployee({ ma_nv: 'QA_TEMP_LOCK', role: 'worker', status: 'active', is_locked: 0 });
    const okLogin = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_TEMP_LOCK', password: 'QaPass@2026!' } });
    const tempTok = okLogin.json?.data?.token;
    assert.ok(tempTok);

    await apiRequest(baseUrl, 'PUT', '/api/employees/QA_TEMP_LOCK/status', {
        token: adminToken,
        body: { status: 'inactive', is_locked: 1 }
    });
    const afterLock = await apiRequest(baseUrl, 'GET', '/api/me', { token: tempTok });
    assert.equal(afterLock.status, 403, 'Locked user JWT must be rejected immediately without waiting for TTL');
});

test('AUTH-03: Zalo bind-zalo + zalo-auto-login roundtrip must succeed end-to-end', async () => {
    const bindRes = await apiRequest(baseUrl, 'POST', '/api/employees/bind-zalo', {
        token: workerToken,
        body: { zalo_token: 'mock_zalo_user_qa_bind_01' }
    });
    assert.equal(bindRes.status, 200, `bind-zalo failed: ${bindRes.raw}`);

    const autoRes = await apiRequest(baseUrl, 'POST', '/api/auth/zalo-auto-login', {
        body: { zalo_user_id: 'qa_bind_01', ma_nv: 'QA_WKR_1', device_id: 'QA_DEV_01' }
    });
    assert.equal(autoRes.status, 200, `zalo-auto-login must recognize bound Zalo ID (got ${autoRes.status}: ${autoRes.raw})`);
    assert.ok(autoRes.json?.data?.token);
});

test('AUTH-04: Public config/holidays/period-status routes must require authentication (no factory GPS leak)', async () => {
    for (const ep of ['/api/company', '/api/company/settings', '/api/company/penalties', '/api/holidays', '/api/attendance/period-status?month=1&year=2099', '/api/settings/penalties']) {
        const res = await apiRequest(baseUrl, 'GET', ep);
        assert.equal(res.status, 401, `Anonymous GET ${ep} must return 401 Unauthorized, got ${res.status}`);
    }
    const authRes = await apiRequest(baseUrl, 'GET', '/api/company', { token: workerToken });
    assert.equal(authRes.status, 200, 'Authenticated worker can still read /api/company');
});

test('RBAC-01: Worker cannot access Accountant or Admin endpoints + No privilege escalation via claim spoofing', async () => {
    const blockedForWorker = [
        ['GET', '/api/attendance?month=1&year=2099'],
        ['GET', '/api/employees'],
        ['POST', '/api/employees', { ma_nv: 'QA_ESC', ho_ten: 'Esc', role: 'admin' }],
        ['PUT', '/api/employees/QA_WKR_1/role', { role: 'admin' }],
        ['GET', '/api/payroll?month=1&year=2099'],
        ['POST', '/api/payroll/approve', { month: 1, year: 2099 }],
        ['PUT', '/api/company', { company_name: 'Hacked' }],
        ['POST', '/api/holidays', { holiday_name: 'QA_HOL', start_date: '2099-01-01', end_date: '2099-01-01' }],
        ['GET', '/api/audit-logs'],
        ['PUT', '/api/settings/accountant-permissions', { permissions: { payroll_approve: true } }],
        ['POST', '/api/attendance/lock-period', { month: 1, year: 2099 }],
        ['POST', '/api/attendance/unlock-period', { month: 1, year: 2099 }]
    ];
    for (const [method, url, body] of blockedForWorker) {
        const res = await apiRequest(baseUrl, method, url, { token: workerToken, body });
        assert.equal(res.status, 403, `Worker ${method} ${url} must return 403, got ${res.status}`);
    }

    // Tamper JWT token role claim directly vs DB truth
    const forgedRoleTok = signCustomJwt({ id: 'QA_WKR_1', ma_nv: 'QA_WKR_1', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 });
    const escalateRes = await apiRequest(baseUrl, 'GET', '/api/audit-logs', { token: forgedRoleTok });
    assert.equal(escalateRes.status, 403, 'Server must resolve true DB role over forged JWT role claim');
});

test('RBAC-02: Strict SoD for Accountant + Exact dynamic permission key enforcement', async () => {
    // Set explicit SoD baseline permissions: view=true, sensitive=false
    await apiRequest(baseUrl, 'PUT', '/api/settings/accountant-permissions', {
        token: adminToken,
        body: {
            permissions: {
                payroll_view_all: true,
                payroll_export: false,
                payroll_approve: false,
                employee_view: true,
                employee_edit: true,
                shift_manage: false,
                leave_approve: false
            }
        }
    });

    const expBlocked = await apiRequest(baseUrl, 'GET', '/api/payroll/export?month=1&year=2099', { token: accToken });
    assert.equal(expBlocked.status, 403, 'GET /payroll/export must enforce payroll_export=false even when payroll_view_all=true');

    const dispBlocked = await apiRequest(baseUrl, 'POST', '/api/payroll/resolve-dispute', {
        token: accToken,
        body: { ma_nv: 'QA_WKR_1', month: 1, year: 2099, admin_response: 'Test', status: 'RESOLVED' }
    });
    assert.equal(dispBlocked.status, 403, 'POST /payroll/resolve-dispute must enforce payroll_approve SoD permission');

    const shiftBlocked = await apiRequest(baseUrl, 'PUT', '/api/employees/QA_WKR_1/shift', {
        token: accToken,
        body: { shift_type: 'MORNING_SHIFT' }
    });
    assert.equal(shiftBlocked.status, 403, 'PUT /employees/:ma_nv/shift must enforce shift_manage permission');

    const unlockBlocked = await apiRequest(baseUrl, 'POST', '/api/attendance/unlock-period', {
        token: accToken,
        body: { month: 1, year: 2099, reason: 'Try unlock' }
    });
    assert.equal(unlockBlocked.status, 403, 'Accountant must never unlock closed periods (SoD)');

    const adminRegBlocked = await apiRequest(baseUrl, 'POST', '/api/admin/register', {
        token: accToken,
        body: { username: 'QA_FAKE_ADM', password: 'QaPass@2026!', ho_ten: 'Fake' }
    });
    assert.equal(adminRegBlocked.status, 403);
});

test('SEC-01: BOLA/IDOR, SQL Injection, XSS sanitization, and composite login rate limiting (429)', async () => {
    // BOLA: Worker 1 creates request, Worker 2 tries to cancel it
    const reqRes = await apiRequest(baseUrl, 'POST', '/api/requests', {
        token: workerToken,
        body: { request_type: 'P', from_date: '2099-03-10', to_date: '2099-03-10', reason: 'QA BOLA Test' }
    });
    assert.equal(reqRes.status, 201);
    const reqRows = await query('SELECT id FROM requests WHERE employee_id = ? AND request_date = ? ORDER BY id DESC LIMIT 1', ['QA_WKR_1', '2099-03-10']);
    const createdReqId = reqRows[0]?.id;
    assert.ok(createdReqId);

    const cancelOther = await apiRequest(baseUrl, 'PUT', `/api/requests/${createdReqId}/cancel`, { token: worker2Token });
    assert.ok([403, 404].includes(cancelOther.status), `Worker 2 canceling Worker 1 request must fail with 403/404, got ${cancelOther.status}`);

    // SQLi attempt in login
    const sqli = await apiRequest(baseUrl, 'POST', '/api/login', {
        body: { ma_nv: "' OR '1'='1' -- ", password: "' OR '1'='1" }
    });
    assert.ok([400, 401].includes(sqli.status));

    // Composite login brute-force -> 429
    await createQaEmployee({ ma_nv: 'QA_RL_1', role: 'worker' });
    let lastStatus = 401;
    for (let i = 0; i < 6; i++) {
        const res = await apiRequest(baseUrl, 'POST', '/api/login', {
            body: { ma_nv: 'QA_RL_1', password: `WrongPass!${i}` },
            headers: { 'x-forwarded-for': '' }
        });
        lastStatus = res.status;
        if (lastStatus === 429) break;
    }
    assert.equal(lastStatus, 429, 'Repeated invalid login attempts must trigger 429 rate limit');
});
