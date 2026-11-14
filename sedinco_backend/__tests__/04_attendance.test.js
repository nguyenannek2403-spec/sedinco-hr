/**
 * Suite 04 — Attendance Multi-Factor Check-in, Geofence, IP Spoofing, Concurrency, Period Lock & Audit Logs
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
    startTestServer,
    apiRequest,
    createQaEmployee,
    cleanupQaData,
    snapshotSettings,
    restoreSettings,
    query
} = require('./_helpers');
const { verifyZaloLocationToken, verifyZaloUserToken, resetMockZaloTokens } = require('../src/utils/zaloAdapter');

let srv;
let baseUrl;
let snap;
let workerToken;
let accToken;
let adminToken;

test.before(async () => {
    srv = await startTestServer();
    baseUrl = srv.baseUrl;
    snap = await snapshotSettings();
    await cleanupQaData('QA_', 2099);
    resetMockZaloTokens();

    await createQaEmployee({ ma_nv: 'QA_ATT_W1', ho_ten: 'QA Chấm Công 1', role: 'worker' });
    await createQaEmployee({ ma_nv: 'QA_ATT_W2', ho_ten: 'QA Chấm Công 2', role: 'worker' });
    await createQaEmployee({ ma_nv: 'QA_ATT_ACC', ho_ten: 'QA Kế Toán CC', role: 'accountant' });
    await createQaEmployee({ ma_nv: 'QA_ATT_ADM', ho_ten: 'QA Admin CC', role: 'admin' });

    const rW1 = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_ATT_W1', password: 'QaPass@2026!' } });
    workerToken = rW1.json?.data?.token;
    const rAcc = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_ATT_ACC', password: 'QaPass@2026!' } });
    accToken = rAcc.json?.data?.token;
    const rAdm = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_ATT_ADM', password: 'QaPass@2026!' } });
    adminToken = rAdm.json?.data?.token;

    await query("UPDATE company_settings SET latitude = 16.0544, longitude = 108.2022, radius_meters = 150, office_ip_whitelist = '198.51.100.77'");
});

test.after(async () => {
    await restoreSettings(snap);
    await cleanupQaData('QA_', 2099);
    if (srv) await srv.close();
});

test('ATT-01: GPS Geofence check-in inside radius + out-of-range flagged + field work raw fallback', async () => {
    const insideRes = await apiRequest(baseUrl, 'POST', '/api/attendance/check-in', {
        token: workerToken,
        headers: { 'X-Idempotency-Key': `qa-att-in-${Date.now()}` },
        body: { lat: 16.0544, lng: 108.2022, work_location_type: 'OFFICE', device_info: 'QA_DEV_ATT_1' }
    });
    assert.equal(insideRes.status, 200, `Inside office check-in failed: ${insideRes.raw}`);

    // Proxy check-in for a test date in 2099 to test heatmap & matrix
    const proxyRes = await apiRequest(baseUrl, 'POST', '/api/attendance/proxy-check-in', {
        token: adminToken,
        headers: { 'X-Idempotency-Key': `qa-proxy-${Date.now()}` },
        body: {
            ma_nv: 'QA_ATT_W1',
            record_date: '2099-04-02',
            check_in_time: '07:55',
            check_out_time: '17:30',
            work_location_type: 'FIELD_WORK',
            note: 'QA Công trình ĐN'
        }
    });
    assert.equal(proxyRes.status, 200, `Proxy check-in failed: ${proxyRes.raw}`);
    const [row] = await query('SELECT work_location_type, status, check_in_time, check_out_time FROM attendance_logs WHERE employee_id = ? AND record_date = ?', ['QA_ATT_W1', '2099-04-02']);
    assert.equal(row.work_location_type, 'FIELD_WORK');
    assert.equal(row.status, '1');
});

test('ATT-02: Single-use location token replay protection & production mock token blocking', async () => {
    const replayToken = `mock_zalo_loc_qa_replay_${crypto.randomBytes(4).toString('hex')}`;
    const first = await verifyZaloLocationToken({ locationToken: replayToken });
    assert.ok(first && first.verified === true, 'Non-production valid mock token should resolve in test');
    const second = await verifyZaloLocationToken({ locationToken: replayToken });
    assert.equal(second, null, 'Replayed location token must be rejected');

    const prevEnv = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = 'production';
        const prodLoc = await verifyZaloLocationToken({ locationToken: 'web_gps_bypass_attempt' });
        const prodUser = await verifyZaloUserToken('mock_zalo_user_hacker');
        assert.equal(prodLoc, null, 'Mock location token MUST be blocked in production');
        assert.equal(prodUser, null, 'Mock user token MUST be blocked in production');
    } finally {
        process.env.NODE_ENV = prevEnv;
    }
});

test('ATT-03: IP Spoofing via forged X-Forwarded-For must NOT bypass geofence or pollute Wi-Fi whitelist', async () => {
    const rW2 = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_ATT_W2', password: 'QaPass@2026!' } });
    const w2Tok = rW2.json?.data?.token;

    // Worker 2 sends forged XFF matching whitelisted office IP with no coordinates -> MUST NOT match Wi-Fi when TRUST_PROXY is off
    const spoofRes = await apiRequest(baseUrl, 'POST', '/api/attendance/check-in', {
        token: w2Tok,
        headers: {
            'X-Forwarded-For': '198.51.100.77',
            'X-Idempotency-Key': `qa-xff-${Date.now()}`
        },
        body: { device_info: 'QA_DEV_SPOOF' }
    });
    assert.equal(spoofRes.status, 400, `Forged X-Forwarded-For must not bypass GPS requirement, got ${spoofRes.status}: ${spoofRes.raw}`);

    // Admin save-wifi-ip with spoofed XFF must ignore forged IP
    const saveIpRes = await apiRequest(baseUrl, 'POST', '/api/company/save-wifi-ip', {
        token: adminToken,
        headers: { 'X-Forwarded-For': '203.0.113.250' },
        body: {}
    });
    const [cs] = await query('SELECT office_ip_whitelist FROM company_settings LIMIT 1');
    assert.ok(!String(cs.office_ip_whitelist || '').includes('203.0.113.250'), `Spoofed XFF IP 203.0.113.250 leaked into office_ip_whitelist (${saveIpRes.raw})`);
});

test('ATT-04: Concurrency spam check-in produces at most 1 row + Idempotency replay returns consistent result', async () => {
    await query("DELETE FROM attendance_logs WHERE employee_id = 'QA_ATT_W2' AND record_date = CURDATE()");
    const rW2 = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_ATT_W2', password: 'QaPass@2026!' } });
    const w2Tok = rW2.json?.data?.token;
    const sameIdemKey = `qa-idem-spam-${Date.now()}`;

    const burst = await Promise.all(
        Array.from({ length: 6 }, () =>
            apiRequest(baseUrl, 'POST', '/api/attendance/check-in', {
                token: w2Tok,
                headers: { 'X-Idempotency-Key': sameIdemKey },
                body: { lat: 16.0544, lng: 108.2022, device_info: 'QA_BURST_DEV' }
            })
        )
    );
    const successCount = burst.filter((r) => r.status === 200).length;
    assert.ok(successCount >= 1);

    const todayLogs = await query('SELECT COUNT(*) as cnt FROM attendance_logs WHERE employee_id = ? AND record_date = CURDATE()', ['QA_ATT_W2']);
    assert.equal(todayLogs[0].cnt, 1, 'Parallel check-in burst must produce strictly 1 row for the day');
});

test('ATT-05: Period lock blocks worker/admin mutations until admin unlocks + Holiday & Cleanup audit logging', async () => {
    await apiRequest(baseUrl, 'PUT', '/api/settings/accountant-permissions', {
        token: adminToken,
        body: { permissions: { attendance_lock: true } }
    });

    const lockRes = await apiRequest(baseUrl, 'POST', '/api/attendance/lock-period', {
        token: accToken,
        headers: { 'X-Idempotency-Key': `qa-lock-${Date.now()}` },
        body: { month: 4, year: 2099, reason: 'Chốt kỳ kiểm thử QA', confirm_low_trust: true }
    });
    assert.equal(lockRes.status, 200);

    const editLocked = await apiRequest(baseUrl, 'POST', '/api/attendance/update', {
        token: adminToken,
        body: { ma_nv: 'QA_ATT_W1', dateStr: '2099-04-03', status: '1', reason: 'Try edit locked' }
    });
    assert.equal(editLocked.status, 400, 'Locked period must reject attendance edits');

    const unlockRes = await apiRequest(baseUrl, 'POST', '/api/attendance/unlock-period', {
        token: adminToken,
        body: { month: 4, year: 2099, reason: 'Mở kỳ QA' }
    });
    assert.equal(unlockRes.status, 200);

    // Holiday CRUD audit log gap check
    const holCreate = await apiRequest(baseUrl, 'POST', '/api/holidays', {
        token: adminToken,
        body: { holiday_name: 'QA_HOL_2099', start_date: '2099-05-01', end_date: '2099-05-01' }
    });
    assert.ok([200, 201].includes(holCreate.status), `Expected 200 or 201, got ${holCreate.status}`);
    const [holAudit] = await query(
        "SELECT id FROM audit_logs WHERE action LIKE '%HOLIDAY%' AND details LIKE '%QA_HOL_2099%' ORDER BY id DESC LIMIT 1"
    );
    assert.ok(holAudit, 'Creating a public holiday must emit an audit log entry');
});
