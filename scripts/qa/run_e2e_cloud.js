/**
 * Standalone Safe Cloud E2E Test (TiDB Cloud Serverless `sedinco_hr` via NODE_ENV=development).
 * STRICTLY uses isolated `QA_TEST_` users and `2099` test periods, never mutating real accounts or settings.
 * Enforces Anti-Hang Policy: connectTimeout=10000 and process.exit() in finally.
 */
process.env.NODE_ENV = 'development';

const assert = require('node:assert/strict');
const http = require('http');
const app = require('../../sedinco_backend/src/app');
const { query, pool } = require('../../sedinco_backend/src/config/db');
const bcrypt = require('../../sedinco_backend/node_modules/bcryptjs');

const PREFIX = 'QA_TEST_';
const TEST_YEAR = 2099;

async function req(baseUrl, method, path, { token, body, headers = {} } = {}) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: h,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    return { status: res.status, raw: text, json };
}

async function cleanupCloudQa() {
    const pat = `${PREFIX}%`;
    await query('DELETE FROM attendance_logs WHERE employee_id LIKE ? OR YEAR(record_date) = ?', [pat, TEST_YEAR]).catch(() => {});
    await query('DELETE FROM attendance WHERE ma_nv LIKE ? OR nam = ?', [pat, TEST_YEAR]).catch(() => {});
    await query('DELETE FROM requests WHERE employee_id LIKE ? OR YEAR(request_date) = ?', [pat, TEST_YEAR]).catch(() => {});
    await query('DELETE FROM ot_registrations WHERE employee_id LIKE ? OR YEAR(work_date) = ?', [pat, TEST_YEAR]).catch(() => {});
    await query('DELETE FROM period_locks WHERE year = ?', [TEST_YEAR]).catch(() => {});
    await query('DELETE FROM public_holidays WHERE holiday_name LIKE ?', [pat]).catch(() => {});
    await query('DELETE FROM audit_logs WHERE actor_id LIKE ? OR details LIKE ?', [pat, `%${PREFIX}%`]).catch(() => {});
    await query('DELETE FROM login_rate_limits WHERE identifier LIKE ? OR key_name LIKE ?', [pat, `%${PREFIX}%`]).catch(() => {});
    await query('DELETE FROM idempotency_keys WHERE actor_id LIKE ?', [pat]).catch(() => {});
    await query('DELETE FROM employees WHERE ma_nv LIKE ?', [pat]).catch(() => {});
}

async function main() {
    let server;
    let exitCode = 0;
    try {
        await cleanupCloudQa();

        // Seed 3 isolated QA role accounts directly inside TiDB Cloud without touching NV001/NV002/NV003
        const pwHash = bcrypt.hashSync('QaCloud@2026!', 10);
        for (const [ma_nv, ho_ten, role, luong_cb] of [
            ['QA_TEST_WKR', 'QA Cloud Công Nhân', 'worker', 13000000],
            ['QA_TEST_ACC', 'QA Cloud Kế Toán', 'accountant', 15000000],
            ['QA_TEST_ADM', 'QA Cloud Quản Trị', 'admin', 20000000]
        ]) {
            await query(
                `INSERT INTO employees (ma_nv, ho_ten, chuc_danh, department, ngay_bat_dau_lam, ngay_chinh_thuc, password, must_change_password, luong_cb, has_insurance, status, is_locked, role, annual_leave_quota)
                 VALUES (?, ?, 'QA Cloud', 'QA Dept', '2024-01-01', '2024-01-01', ?, 0, ?, 1, 'active', 0, ?, 12)
                 ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role), status = 'active', is_locked = 0`,
                [ma_nv, ho_ten, pwHash, luong_cb, role]
            );
        }

        server = http.createServer(app);
        await new Promise((res, rej) => {
            server.on('error', rej);
            server.listen(0, '127.0.0.1', res);
        });
        const baseUrl = `http://127.0.0.1:${server.address().port}`;

        // 1. Authenticate all 3 roles against TiDB Cloud
        const lW = await req(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_TEST_WKR', password: 'QaCloud@2026!' } });
        const lA = await req(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_TEST_ACC', password: 'QaCloud@2026!' } });
        const lD = await req(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_TEST_ADM', password: 'QaCloud@2026!' } });
        assert.equal(lW.status, 200);
        assert.equal(lA.status, 200);
        assert.equal(lD.status, 200);
        const tW = lW.json.data.token;
        const tA = lA.json.data.token;
        const tD = lD.json.data.token;

        // 2. Verify anonymous factory GPS/company protection + RBAC
        const anonCompany = await req(baseUrl, 'GET', '/api/company');
        assert.equal(anonCompany.status, 401, 'TiDB Cloud runtime must protect /api/company from unauthenticated scraping');
        const workerMatrix = await req(baseUrl, 'GET', '/api/attendance?month=10&year=2099', { token: tW });
        assert.equal(workerMatrix.status, 403);

        // 3. Cross-role E2E flow: Worker Zalo bind -> Worker check-in -> Leave Request P -> Admin/Acc approve -> Paid Leave Payroll 1.0 credit
        const bind = await req(baseUrl, 'POST', '/api/employees/bind-zalo', { token: tW, body: { zalo_token: 'mock_zalo_user_qa_cloud_1' } });
        assert.equal(bind.status, 200);
        const auto = await req(baseUrl, 'POST', '/api/auth/zalo-auto-login', { body: { zalo_user_id: 'qa_cloud_1', ma_nv: 'QA_TEST_WKR', device_id: 'QA_CLOUD_DEV' } });
        assert.equal(auto.status, 200);

        const proxyIn = await req(baseUrl, 'POST', '/api/attendance/proxy-check-in', {
            token: tD,
            headers: { 'X-Idempotency-Key': `qa-cloud-proxy-${Date.now()}` },
            body: { ma_nv: 'QA_TEST_WKR', record_date: '2099-10-02', check_in_time: '07:55', check_out_time: '17:30', work_location_type: 'FIELD_WORK', note: 'QA Cloud Công trình' }
        });
        assert.equal(proxyIn.status, 200);

        const leaveReq = await req(baseUrl, 'POST', '/api/requests', {
            token: tW,
            headers: { 'X-Idempotency-Key': `qa-cloud-req-${Date.now()}` },
            body: { request_type: 'P', from_date: '2099-10-03', to_date: '2099-10-03', reason: 'QA Cloud Nghỉ phép hưởng lương' }
        });
        assert.equal(leaveReq.status, 201);
        const reqRows = await query("SELECT id FROM requests WHERE employee_id = 'QA_TEST_WKR' AND request_date = '2099-10-03' LIMIT 1");
        assert.ok(reqRows[0]?.id);

        const approveReq = await req(baseUrl, 'PUT', `/api/requests/${reqRows[0].id}`, {
            token: tD,
            headers: { 'X-Idempotency-Key': `qa-cloud-app-${Date.now()}` },
            body: { status: 'approved' }
        });
        assert.equal(approveReq.status, 200);

        const mySlip = await req(baseUrl, 'GET', '/api/payroll/me?month=10&year=2099', { token: tW });
        assert.equal(mySlip.status, 200);
        assert.equal(Number(mySlip.json?.data?.actualWorkDays), 2, 'Cloud E2E expects 1 work day + 1 paid leave (P) = 2 paid work days');

        // 4. Period lock & admin unlock
        const lockPeriod = await req(baseUrl, 'POST', '/api/attendance/lock-period', {
            token: tD,
            headers: { 'X-Idempotency-Key': `qa-cloud-lock-${Date.now()}` },
            body: { month: 10, year: 2099, reason: 'QA Cloud lock check' }
        });
        assert.equal(lockPeriod.status, 200);
        const accUnlock = await req(baseUrl, 'POST', '/api/attendance/unlock-period', {
            token: tA,
            body: { month: 10, year: 2099, reason: 'Acc cannot unlock' }
        });
        assert.equal(accUnlock.status, 403);
        const admUnlock = await req(baseUrl, 'POST', '/api/attendance/unlock-period', {
            token: tD,
            body: { month: 10, year: 2099, reason: 'QA Cloud cleanup unlock' }
        });
        assert.equal(admUnlock.status, 200);

        console.log('E2E CLOUD FULL PASS: All 3-role cross-interaction flows verified on TiDB Cloud!');
    } catch (err) {
        exitCode = 1;
        console.error('E2E CLOUD FAILED:', err);
    } finally {
        await cleanupCloudQa().catch(() => {});
        const leftover = await query("SELECT COUNT(*) as cnt FROM employees WHERE ma_nv LIKE 'QA_TEST_%'").catch(() => [{ cnt: -1 }]);
        console.log('TiDB Cloud QA_TEST_ leftover count:', leftover[0]?.cnt);
        if (server) await new Promise((r) => server.close(r));
        pool.end(() => process.exit(exitCode));
    }
}

main();
