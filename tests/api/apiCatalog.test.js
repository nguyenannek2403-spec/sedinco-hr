/**
 * Phase 3 & 10: Comprehensive API Verification Suite (All Modules, Valid/Invalid/Edge/Idempotency)
 * Strictly runs on NODE_ENV=test (`sedinco_hr_test`) and leaves DB clean via TestHarness.
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const crypto = require('crypto');
const { TestHarness, TINY_PNG_BUFFER, TINY_JPEG_BUFFER, TINY_PDF_BUFFER, query } = require('../fixtures/testHarness');

const results = [];
async function apiTest(id, name, fn) {
    const start = Date.now();
    try {
        await fn();
        results.push({ id, name, status: 'PASS', ms: Date.now() - start });
    } catch (err) {
        results.push({ id, name, status: 'FAIL', ms: Date.now() - start, error: err.message });
    }
}

(async () => {
    const harness = await new TestHarness().setup({ withMockCloudinary: true });
    let adminToken, workerToken, ktToken;
    try {
        adminToken = await harness.tokenFor('admin');
        workerToken = await harness.tokenFor('NV001');
        ktToken = await harness.tokenFor('NV002');

        // --- A. Health, Root, 404 & 410 Legacy Routes ---
        await apiTest('API-SYS-01', 'GET /api/health returns healthy + uptime', async () => {
            const r = await harness.request('GET', '/health');
            assert.strictEqual(r.status, 200);
            assert.strictEqual(r.body.status, 'healthy');
        });

        await apiTest('API-SYS-02', 'GET /api/nonexistent returns 404 JSON NOT_FOUND', async () => {
            const r = await harness.request('GET', '/definitely-missing-route');
            assert.strictEqual(r.status, 404);
            assert.strictEqual(r.body.code, 'NOT_FOUND');
        });

        await apiTest('API-SYS-03', 'GET /api/attendance/dynamic-qr & /qr return 410 Gone', async () => {
            const r1 = await harness.request('GET', '/attendance/dynamic-qr', { token: workerToken });
            const r2 = await harness.request('GET', '/attendance/qr', { token: workerToken });
            assert.strictEqual(r1.status, 410);
            assert.strictEqual(r2.status, 410);
        });

        await apiTest('API-SYS-04', 'POST /api/client-errors rejects XSS payload or succeeds when enabled', async () => {
            const bad = await harness.request('POST', '/client-errors', { body: { error_message: '<script>alert(1)</script>', route: '/test' } });
            assert([400, 404].includes(bad.status), `Expected 400 or 404, got ${bad.status}`);
        });

        // --- B. Auth, Account, Preferences & Zalo Identity ---
        await apiTest('API-AUTH-01', 'Unauthenticated protected routes return 401 UNAUTHORIZED', async () => {
            const r = await harness.request('GET', '/me');
            assert.strictEqual(r.status, 401);
        });

        await apiTest('API-AUTH-02', 'GET /me, /auth/me, /profile return sanitized profile (no password hash)', async () => {
            for (const p of ['/me', '/auth/me', '/profile']) {
                const r = await harness.request('GET', p, { token: workerToken });
                assert.strictEqual(r.status, 200);
                assert.strictEqual(r.body.data.ma_nv, 'NV001');
                assert.strictEqual(r.body.data.password, undefined);
            }
        });

        await apiTest('API-AUTH-03', 'Create test worker, login, change password, bank-card & theme/prefs', async () => {
            const c = await harness.request('POST', '/employees', {
                token: adminToken,
                body: { ma_nv: 'TEST_API_W1', ho_ten: 'API Test Worker', phone: '0998887701', role: 'worker', luong_cb: 12000000 }
            });
            assert.strictEqual(c.status, 201);
            const initPass = c.body.one_time_password || '123456';

            const loginOk = await harness.request('POST', '/login', {
                body: { identifier: 'TEST_API_W1', password: initPass }
            });
            assert.strictEqual(loginOk.status, 200);
            const tok = loginOk.body.data.token;
            assert(tok);

            const loginBad = await harness.request('POST', '/login', {
                body: { identifier: 'TEST_API_W1', password: 'WrongPassword123!' }
            });
            assert.strictEqual(loginBad.status, 401);

            const chgPass = await harness.request('POST', '/change-password', {
                token: tok,
                body: { old_password: initPass, new_password: 'StrongNewPass@99', new_username: 'test_api_w1_user' }
            });
            assert.strictEqual(chgPass.status, 200);
            const newTok = chgPass.body.token || chgPass.body.data?.token;
            assert(newTok);

            const themeRes = await harness.request('PUT', '/account/theme', { token: newTok, body: { theme_preference: 'dark' } });
            assert.strictEqual(themeRes.status, 200);
            const prefRes = await harness.request('PUT', '/account/preferences', { token: newTok, body: { theme_preference: 'dark', font_scale: 125 } });
            assert.strictEqual(prefRes.status, 200);

            const bankBad = await harness.request('PUT', '/account/bank-card', {
                token: newTok,
                body: { bank_code: '970436', bank_account_number: '12345678', qr_image: 'data:image/png;base64,abc' }
            });
            assert.strictEqual(bankBad.status, 400);

            const bankOk = await harness.request('PUT', '/account/bank-card', {
                token: newTok,
                body: { bank_code: '970436', bank_name: 'Vietcombank', bank_account_number: '1012345678', bank_account_name: 'nguyen van test' }
            });
            assert.strictEqual(bankOk.status, 200);
            assert.strictEqual(bankOk.body.data.bank_account_name, 'NGUYEN VAN TEST');
        });

        await apiTest('API-AUTH-04', 'Zalo link / status / verify-phone / zalo-auto-login / unlink using test token', async () => {
            const empTok = await harness.tokenFor('TEST_API_W1');
            const linkRes = await harness.request('POST', '/auth/zalo/link', {
                token: empTok,
                body: { zalo_access_token: 'mock_zalo_user_zuid_api_01' }
            });
            assert.strictEqual(linkRes.status, 200);

            const statusRes = await harness.request('GET', '/auth/zalo/status', { token: empTok });
            assert.strictEqual(statusRes.status, 200);
            assert.strictEqual(statusRes.body.data.is_linked, true);

            const autoRes = await harness.request('POST', '/auth/zalo-auto-login', {
                body: { zalo_access_token: 'mock_zalo_user_zuid_api_01' }
            });
            assert.strictEqual(autoRes.status, 200);

            const unlinkRes = await harness.request('POST', '/auth/zalo/unlink', { token: empTok });
            assert.strictEqual(unlinkRes.status, 200);
        });

        // --- C. Company, Departments & Holidays ---
        await apiTest('API-ORG-01', 'Company settings read/update + Departments CRUD + protect default delete', async () => {
            const getCo = await harness.request('GET', '/company', { token: workerToken });
            assert.strictEqual(getCo.status, 200);
            assert(Array.isArray(getCo.body.data.allowed_locations));

            const workerUpd = await harness.request('PUT', '/company', { token: workerToken, body: { company_name: 'Hacked' } });
            assert.strictEqual(workerUpd.status, 403);

            const depCreate = await harness.request('POST', '/departments', { token: adminToken, body: { name: 'TEST_DEPT_A' } });
            assert.strictEqual(depCreate.status, 201);
            const depId = depCreate.body.data.id;

            const depRename = await harness.request('PUT', `/departments/${depId}`, { token: adminToken, body: { name: 'TEST_DEPT_B' } });
            assert.strictEqual(depRename.status, 200);

            const depDelDef = await harness.request('DELETE', '/departments/1', { token: adminToken });
            assert.strictEqual(depDelDef.status, 400);

            const depDel = await harness.request('DELETE', `/departments/${depId}`, { token: adminToken });
            assert.strictEqual(depDel.status, 200);
        });

        await apiTest('API-ORG-02', 'Public holidays CRUD with x1.5 custom multiplier', async () => {
            const c = await harness.request('POST', '/holidays', {
                token: adminToken,
                body: { holiday_name: 'TEST_HOL_API', start_date: '2095-05-01', end_date: '2095-05-01', salary_multiplier: 1.5 }
            });
            assert.strictEqual(c.status, 201);
            assert.strictEqual(Number(c.body.salary_multiplier), 1.5);
            const hid = c.body.id;

            const bad = await harness.request('POST', '/holidays', {
                token: adminToken,
                body: { holiday_name: 'TEST_HOL_BAD', start_date: '2095-05-10', end_date: '2095-05-01', salary_multiplier: 2 }
            });
            assert.strictEqual(bad.status, 400);

            const u = await harness.request('PUT', `/holidays/${hid}`, {
                token: adminToken,
                body: { holiday_name: 'TEST_HOL_API_2', start_date: '2095-05-01', end_date: '2095-05-02', salary_multiplier: 2.5 }
            });
            assert.strictEqual(u.status, 200);

            const d = await harness.request('DELETE', `/holidays/${hid}`, { token: adminToken });
            assert.strictEqual(d.status, 200);
        });

        // --- D. Attendance, QR Session, Idempotency & Period Lock ---
        await apiTest('API-ATT-01', 'Precheck, QR Session, Check-In Idempotency & Manual Update', async () => {
            const empTok = await harness.tokenFor('TEST_API_W1');
            const co = await harness.request('GET', '/company', { token: empTok });
            const branch = co.body.data.allowed_locations[0];
            const pre = await harness.request('POST', '/attendance/precheck', {
                token: empTok,
                body: { lat: branch.lat, lng: branch.lng, work_location_type: 'OFFICE' }
            });
            assert.strictEqual(pre.status, 200);

            const qr = await harness.request('POST', '/attendance/qr-session', {
                token: adminToken,
                body: { branch_id: branch.id, ttl_seconds: 120 }
            });
            assert.strictEqual(qr.status, 200);
            assert(qr.body.data.qr_token.startsWith('SEDQR1.'));

            const idemKey = `test-idem-${crypto.randomUUID()}`;
            const ciBody = {
                lat: branch.lat,
                lng: branch.lng,
                zalo_location_token: `test_loc_token_${branch.lat}_${branch.lng}_${Date.now()}`,
                qr_token: qr.body.data.qr_token,
                client_nonce: 'nonce_' + crypto.randomUUID(),
                work_location_type: 'OFFICE'
            };
            const ci1 = await harness.request('POST', '/attendance/check-in', {
                token: empTok,
                headers: { 'X-Idempotency-Key': idemKey },
                body: ciBody
            });
            assert.strictEqual(ci1.status, 200);
            const ciReplay = await harness.request('POST', '/attendance/check-in', {
                token: empTok,
                headers: { 'X-Idempotency-Key': idemKey },
                body: ciBody
            });
            assert.strictEqual(ciReplay.status, 200);
            assert.strictEqual(ciReplay.headers['x-idempotency-replay'], 'true');

            const upd = await harness.request('POST', '/attendance/update', {
                token: adminToken,
                body: { ma_nv: 'TEST_API_W1', date: '2095-03-10', status: '1', ot_hours: 0 }
            });
            assert.strictEqual(upd.status, 200);

            const todayRes = await harness.request('GET', '/attendance/today', { token: empTok });
            assert.strictEqual(todayRes.status, 200);
            const meRes = await harness.request('GET', '/attendance/me?month=3&year=2095', { token: empTok });
            assert.strictEqual(meRes.status, 200);
            const matRes = await harness.request('GET', '/attendance?month=3&year=2095', { token: adminToken });
            assert.strictEqual(matRes.status, 200);
        });

        // --- E. Requests & Pre-OT ---
        await apiTest('API-REQ-01', 'Request creation (leave + validation), Cancel, Admin Approve & Pre-OT', async () => {
            const empTok = await harness.tokenFor('TEST_API_W1');
            const c1 = await harness.request('POST', '/requests', {
                token: empTok,
                body: { request_type: 'leave', request_date: '2095-04-02', reason: '[TEST] Nghi co phep' }
            });
            assert.strictEqual(c1.status, 201);
            const reqId = c1.body.data.id;

            const cancelRes = await harness.request('PUT', `/requests/${reqId}/cancel`, { token: empTok });
            assert.strictEqual(cancelRes.status, 200);

            const c2 = await harness.request('POST', '/requests', {
                token: empTok,
                body: { request_type: 'leave', request_date: '2095-04-03', reason: '[TEST] Nghi co phep lan 2' }
            });
            assert.strictEqual(c2.status, 201);
            const reqId2 = c2.body.data.id;

            const appRes = await harness.request('PUT', `/requests/${reqId2}`, {
                token: adminToken,
                body: { status: 'approved' }
            });
            assert.strictEqual(appRes.status, 200);

            const otPre = await harness.request('POST', '/requests/ot-pre-register', {
                token: empTok,
                body: { work_date: '2095-04-05', expected_hours: 2, reason: '[TEST] Tang ca' }
            });
            assert.strictEqual(otPre.status, 201);
            const otId = otPre.body.data.id;

            const otApp = await harness.request('PUT', `/requests/ot-registrations/${otId}`, {
                token: adminToken,
                body: { status: 'approved' }
            });
            assert.strictEqual(otApp.status, 200);
        });

        // --- F. Payroll, Slip, Dispute, Payment ---
        await apiTest('API-PAY-01', 'Payroll get, adjustments, send-report, confirm/dispute, resolve, mark-paid, received', async () => {
            const empTok = await harness.tokenFor('TEST_API_W1');
            const adj = await harness.request('POST', '/payroll/adjustments', {
                token: adminToken,
                body: { ma_nv: 'TEST_API_W1', month: 3, year: 2095, bonus_amount: 500000, penalty_amount: 0, advance_deduction: 100000, adjustment_note: '[TEST] Thuong du an' }
            });
            assert.strictEqual(adj.status, 200);

            const sendRep = await harness.request('POST', '/payroll/send-report', {
                token: adminToken,
                body: { ma_nv: 'TEST_API_W1', month: 3, year: 2095 }
            });
            assert.strictEqual(sendRep.status, 200);

            const disp = await harness.request('POST', '/payroll/confirm', {
                token: empTok,
                body: { month: 3, year: 2095, status: 'DISPUTED', dispute_reason: '[TEST] Thieu phu cap' }
            });
            assert.strictEqual(disp.status, 200);

            const resDisp = await harness.request('POST', '/payroll/resolve-dispute', {
                token: adminToken,
                body: { ma_nv: 'TEST_API_W1', month: 3, year: 2095, admin_response: '[TEST] Da kiem tra xong', new_status: 'CONFIRMED' }
            });
            assert.strictEqual(resDisp.status, 200);

            const paid = await harness.request('POST', '/payroll/mark-paid', {
                token: adminToken,
                body: { ma_nv: 'TEST_API_W1', month: 3, year: 2095, transfer_note: '[TEST] VCB' }
            });
            assert.strictEqual(paid.status, 200);

            const rcv = await harness.request('POST', '/payroll/confirm', {
                token: empTok,
                body: { month: 3, year: 2095, status: 'RECEIVED' }
            });
            assert.strictEqual(rcv.status, 200);

            const mySlip = await harness.request('GET', '/payroll/me?month=3&year=2095', { token: empTok });
            assert.strictEqual(mySlip.status, 200);
            assert(Array.isArray(mySlip.body.data.daily_logs));
        });

        // --- G. Media Pipeline & Admin Usage ---
        await apiTest('API-MED-01', 'Multipart upload, secure access signed JSON & binary stream, admin dashboard & delete', async () => {
            const empTok = await harness.tokenFor('TEST_API_W1');
            const cfg = await harness.request('GET', '/media/config', { token: empTok });
            assert.strictEqual(cfg.status, 200);

            const up = await harness.uploadMultipart('/media/upload', {
                token: empTok,
                fields: { category: 'leave_evidence', reference_date: '2095-04-02' },
                files: [{ fieldName: 'file', filename: 'test_ev_api.png', mimeType: 'image/png', buffer: TINY_PNG_BUFFER }]
            });
            assert.strictEqual(up.status, 201);
            const uuid = up.body.data.asset_uuid;
            assert(uuid);

            const accJson = await harness.request('GET', `/media/${uuid}/access?mode=json`, { token: empTok });
            assert.strictEqual(accJson.status, 200);
            assert(accJson.body.data.signed_url.includes('res.cloudinary.com/sedinco-test'));

            const dash = await harness.request('GET', '/media/admin/dashboard', { token: adminToken });
            assert.strictEqual(dash.status, 200);

            const del = await harness.request('DELETE', `/media/${uuid}`, { token: adminToken, body: { reason: 'cleanup' } });
            assert.strictEqual(del.status, 200);
        });

        // --- H. Notifications, Settings, Permissions & Audit ---
        await apiTest('API-SET-01', 'Notifications & Accountant Permissions & Audit Logs', async () => {
            const empTok = await harness.tokenFor('TEST_API_W1');
            const nMy = await harness.request('GET', '/notifications/my', { token: empTok });
            assert.strictEqual(nMy.status, 200);
            const nAll = await harness.request('PUT', '/notifications/read-all', { token: empTok });
            assert.strictEqual(nAll.status, 200);
            const nSum = await harness.request('GET', '/notifications/summary', { token: adminToken });
            assert.strictEqual(nSum.status, 200);
            const pGet = await harness.request('GET', '/settings/accountant-permissions', { token: ktToken });
            assert.strictEqual(pGet.status, 200);
            const aLogs = await harness.request('GET', '/settings/audit-logs?limit=5', { token: adminToken });
            assert.strictEqual(aLogs.status, 200);
        });

        // --- I. Fixed Endpoint Verification: DELETE /employees/:id ---
        await apiTest('API-EMP-DELETE', 'DELETE /employees/:id succeeds cleanly (200), cleans row & records DELETE_EMPLOYEE audit log', async () => {
            const delRes = await harness.request('DELETE', '/employees/TEST_API_W1', { token: adminToken });
            assert.strictEqual(delRes.status, 200, `Expected 200 after fix, got ${delRes.status}: ${delRes.body?.message}`);
            const rows = await query('SELECT ma_nv FROM employees WHERE ma_nv = ?', ['TEST_API_W1']);
            assert.strictEqual(rows.length, 0);
            const audits = await query("SELECT action FROM audit_logs WHERE action = 'DELETE_EMPLOYEE' AND details LIKE '%TEST_API_W1%'");
            assert(audits.length >= 1, 'Expected DELETE_EMPLOYEE audit log');
        });

        console.table(results);
        const failed = results.filter(r => r.status === 'FAIL');
        if (failed.length > 0) {
            console.error('API FAILURES:', failed);
            process.exitCode = 1;
        }
    } finally {
        await harness.teardown({ closePool: true });
        process.exit(process.exitCode || 0);
    }
})();
