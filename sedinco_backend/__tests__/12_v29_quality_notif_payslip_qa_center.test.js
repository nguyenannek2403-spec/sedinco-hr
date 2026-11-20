/**
 * Suite 12 — V29 Comprehensive Quality Verification:
 * - Notification Lifecycle (Sync alert_key, Mark-Read without reset, Filter Tabs, Pagination, Read-All, RBAC Isolation)
 * - Persistent Font Scale (100%..200%) & Theme Preferences API
 * - QA Center Admin-Only RBAC, Runtime Safe Checks & Unsafe Load-Mode 403 Lock
 * - Architecture (0 circular dependencies), Payslip Role Sticky Footer Separation & Accessibility Contracts
 */
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
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

const ROOT_DIR = path.resolve(__dirname, '../..');
const FE_SRC = path.join(ROOT_DIR, 'zalo-miniapp-frontend/src');
const BE_SRC = path.join(ROOT_DIR, 'sedinco_backend/src');

let srv = null;
let baseUrl = '';
let tracker = null;
let settingsSnap = null;
let admToken = '';
let accToken = '';
let wkrToken = '';
let maxNotifId = 0;
let maxQaRunId = 0;
let admFontBefore = 100;
let accFontBefore = 100;
let wkrFontBefore = 100;

const TEST_YEAR = 2095;

test.before(async () => {
    srv = await startTestServer();
    baseUrl = srv.baseUrl;
    tracker = createTestRunTracker('V29');
    settingsSnap = await snapshotSettings();

    const [maxN] = await query('SELECT COALESCE(MAX(id), 0) as m FROM user_notifications');
    const [maxQ] = await query('SELECT COALESCE(MAX(id), 0) as m FROM qa_test_runs');
    maxNotifId = Number(maxN?.m || 0);
    maxQaRunId = Number(maxQ?.m || 0);

    const [admRow] = await query("SELECT COALESCE(font_scale, 100) as font_scale FROM admins WHERE username = 'admin' LIMIT 1");
    const [accRow] = await query("SELECT COALESCE(font_scale, 100) as font_scale FROM employees WHERE ma_nv = 'NV002' LIMIT 1");
    const [wkrRow] = await query("SELECT COALESCE(font_scale, 100) as font_scale FROM employees WHERE ma_nv = 'NV003' LIMIT 1");
    admFontBefore = Number(admRow?.font_scale || 100);
    accFontBefore = Number(accRow?.font_scale || 100);
    wkrFontBefore = Number(wkrRow?.font_scale || 100);

    const pwHash = bcrypt.hashSync('123456', 10);
    await query("UPDATE admins SET password = ?, must_change_password = 0 WHERE username = 'admin'", [pwHash]);
    await query("UPDATE employees SET password = ?, must_change_password = 0, is_locked = 0, status = 'active' WHERE ma_nv IN ('NV002','NV003')", [pwHash]);
    await query("UPDATE employees SET role = 'accountant' WHERE ma_nv = 'NV002'");
    await query("UPDATE employees SET role = 'worker' WHERE ma_nv = 'NV003'");

    const admLogin = await apiRequest(baseUrl, 'POST', '/api/admin/login', { body: { username: 'admin', password: '123456' } });
    assert.equal(admLogin.status, 200);
    admToken = admLogin.json?.data?.token;

    const accLogin = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'NV002', password: '123456' } });
    assert.equal(accLogin.status, 200);
    accToken = accLogin.json?.data?.token;

    const wkrLogin = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'NV003', password: '123456' } });
    assert.equal(wkrLogin.status, 200);
    wkrToken = wkrLogin.json?.data?.token;
});

test.after(async () => {
    try {
        await query('DELETE FROM user_notifications WHERE id > ? OR ref_year = ?', [maxNotifId, TEST_YEAR]).catch(() => {});
        await query('DELETE FROM qa_test_runs WHERE id > ?', [maxQaRunId]).catch(() => {});
        await query('DELETE FROM attendance WHERE nam = ?', [TEST_YEAR]).catch(() => {});
        await query('DELETE FROM requests WHERE YEAR(request_date) = ?', [TEST_YEAR]).catch(() => {});
        await query('DELETE FROM audit_logs WHERE actor_id LIKE "V29_%"').catch(() => {});
        await query("UPDATE admins SET font_scale = ?, theme_preference = 'light' WHERE username = 'admin'", [admFontBefore]).catch(() => {});
        await query("UPDATE employees SET font_scale = ?, theme_preference = 'light' WHERE ma_nv = 'NV002'", [accFontBefore]).catch(() => {});
        await query("UPDATE employees SET font_scale = ?, theme_preference = 'light' WHERE ma_nv = 'NV003'", [wkrFontBefore]).catch(() => {});
        if (tracker) await tracker.cleanup();
        if (settingsSnap) await restoreSettings(settingsSnap);
    } finally {
        if (srv) await srv.close();
        await closeTestRuntime();
    }
});

test('V29-NOTIF-01: Persistent alert sync via alert_key, mark-read updates is_read & read_at, never reverts on re-sync', async () => {
    const qaEmp = tracker.trackEmployee('V29_N_EMP');
    await createQaEmployee({ ma_nv: qaEmp, ho_ten: 'V29 Thông Báo Worker', role: 'worker', luong_cb: 9000000 });
    await query('UPDATE employees SET multi_device_alert = 1 WHERE ma_nv = ?', [qaEmp]);
    await query(
        `INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, cong_chinh_thuc, salary_confirm_status, dispute_reason)
         VALUES (?, 5, ?, 26, 24, 'DISPUTED', 'V29 Test dispute alert')`,
        [qaEmp, TEST_YEAR]
    );
    await query(
        `INSERT INTO requests (employee_id, request_type, request_date, reason, status)
         VALUES (?, 'leave', ?, 'V29 Test pending leave alert', 'pending')`,
        [qaEmp, `${TEST_YEAR}-05-12`]
    );

    const beforeAdmin = await apiRequest(baseUrl, 'GET', '/api/notifications/my?limit=50', { token: admToken });
    assert.equal(beforeAdmin.status, 200);
    const items = beforeAdmin.json?.data?.notifications || [];
    const deviceNotif = items.find((n) => n.alert_key === `device:${qaEmp}`);
    const disputeNotif = items.find((n) => n.category === 'salary_dispute' && n.target_ma_nv === qaEmp);
    assert.ok(deviceNotif, 'Admin must receive persisted multi-device notification in user_notifications');
    assert.ok(disputeNotif, 'Admin must receive persisted salary_dispute notification in user_notifications');
    assert.equal(disputeNotif.is_read, 0);

    const unreadBefore = Number(beforeAdmin.json?.data?.unread_count || 0);
    assert.ok(unreadBefore >= 2, `Expected >=2 unread alerts for Admin, got ${unreadBefore}`);

    // Clicking / marking dispute notification as read must decrement unread_count & set read_at
    const markRes = await apiRequest(baseUrl, 'PUT', `/api/notifications/${disputeNotif.id}/read`, { token: admToken });
    assert.equal(markRes.status, 200);
    assert.equal(markRes.json?.data?.is_read, 1);
    assert.ok(markRes.json?.data?.read_at, 'read_at must be populated when marking notification read');
    assert.equal(markRes.json?.data?.unread_count, unreadBefore - 1, 'unread_count must decrement by exact 1');

    // Re-fetching /api/notifications/my AND /api/notifications/summary must NOT revert is_read back to 0!
    await apiRequest(baseUrl, 'GET', '/api/notifications/summary', { token: admToken });
    const afterResync = await apiRequest(baseUrl, 'GET', '/api/notifications/my?limit=50', { token: admToken });
    assert.equal(afterResync.status, 200);
    assert.equal(afterResync.json?.data?.unread_count, unreadBefore - 1, 'Re-syncing live alerts must NEVER revert is_read=1 back to unread');
    const persistedRead = (afterResync.json?.data?.notifications || []).find((n) => n.id === disputeNotif.id);
    assert.ok(persistedRead, 'Read notification must stay in full history');
    assert.equal(persistedRead.is_read, 1);
    assert.ok(persistedRead.read_at);
});

test('V29-NOTIF-02: Filter tabs (all/unread/read), pagination, read-all & Accountant RBAC alert isolation', async () => {
    // Accountant gets only permitted alerts (never fraud/device!)
    const accRes = await apiRequest(baseUrl, 'GET', '/api/notifications/my?limit=50', { token: accToken });
    assert.equal(accRes.status, 200);
    const accNotifs = accRes.json?.data?.notifications || [];
    assert.ok(!accNotifs.some((n) => n.category === 'fraud' || n.category === 'device'), 'Accountant must NEVER receive fraud or device alerts');

    // Verify unread & read filter tabs + pagination (limit=1) for Admin
    const unreadTab = await apiRequest(baseUrl, 'GET', '/api/notifications/my?filter=unread&limit=50', { token: admToken });
    const readTab = await apiRequest(baseUrl, 'GET', '/api/notifications/my?filter=read&limit=50', { token: admToken });
    assert.equal(unreadTab.status, 200);
    assert.equal(readTab.status, 200);
    assert.ok((unreadTab.json?.data?.notifications || []).every((n) => n.is_read === 0), 'unread tab must only return is_read=0');
    assert.ok((readTab.json?.data?.notifications || []).length >= 1 && (readTab.json?.data?.notifications || []).every((n) => n.is_read === 1), 'read tab must return read history');

    const page1 = await apiRequest(baseUrl, 'GET', '/api/notifications/my?filter=all&limit=1&offset=0', { token: admToken });
    assert.equal(page1.status, 200);
    assert.equal(page1.json?.data?.notifications?.length, 1);
    if (Number(page1.json?.data?.total_count || 0) > 1) {
        assert.equal(page1.json?.data?.has_more, true, 'Pagination must report has_more=true when total_count > limit');
    }

    // Read-all zeroes badge cleanly & stays 0 even after re-sync!
    const markAll = await apiRequest(baseUrl, 'PUT', '/api/notifications/read-all', { token: admToken });
    assert.equal(markAll.status, 200);
    assert.equal(markAll.json?.data?.unread_count, 0);

    const postMarkAll = await apiRequest(baseUrl, 'GET', '/api/notifications/my?filter=all&limit=50', { token: admToken });
    assert.equal(postMarkAll.json?.data?.unread_count, 0);
    assert.ok((postMarkAll.json?.data?.notifications || []).length >= 2, 'History must retain all previously read notifications after read-all');
});

test('V29-PREF-01: Unified Font Scale (100%-200%) & Theme persistence across all 3 roles + 400 validation', async () => {
    for (const [label, token, loginEp, creds] of [
        ['Worker', wkrToken, '/api/login', { ma_nv: 'NV003', password: '123456' }],
        ['Accountant', accToken, '/api/login', { ma_nv: 'NV002', password: '123456' }],
        ['Admin', admToken, '/api/admin/login', { username: 'admin', password: '123456' }]
    ]) {
        const badScale = await apiRequest(baseUrl, 'PUT', '/api/account/preferences', {
            token,
            body: { font_scale: 133 }
        });
        assert.equal(badScale.status, 400, `${label}: invalid font_scale 133 must reject with 400`);

        const setScale = await apiRequest(baseUrl, 'PUT', '/api/account/preferences', {
            token,
            body: { font_scale: 175, theme_preference: 'dark' }
        });
        assert.equal(setScale.status, 200, `${label}: PUT /api/account/preferences failed: ${setScale.raw}`);
        assert.equal(setScale.json?.data?.font_scale, 175);
        assert.equal(setScale.json?.data?.theme_preference, 'dark');

        const meRes = await apiRequest(baseUrl, 'GET', '/api/me', { token });
        assert.equal(meRes.status, 200);
        assert.equal(meRes.json?.data?.font_scale, 175, `${label}: /api/me must return persisted font_scale=175`);

        const reLogin = await apiRequest(baseUrl, 'POST', loginEp, { body: creds });
        assert.equal(reLogin.status, 200);
        assert.equal(reLogin.json?.data?.font_scale, 175, `${label}: fresh login must return persisted font_scale=175`);

        // Reset back cleanly to 100 light
        await apiRequest(baseUrl, 'PUT', '/api/account/preferences', {
            token,
            body: { font_scale: 100, theme_preference: 'light' }
        });
    }
});

test('V29-QA-01: QA Center Admin-only RBAC (401/403), safe runtime checks & 403 block on load_benchmark', async () => {
    // Enable all 30 accountant DB perms to confirm Accountant still receives 403 on QA Center!
    await query('UPDATE accountant_permissions SET is_enabled = 1');

    const qaRoutes = [
        ['GET', '/api/qa-center/overview'],
        ['GET', '/api/qa-center/test-cases'],
        ['GET', '/api/qa-center/bugs'],
        ['GET', '/api/qa-center/history'],
        ['POST', '/api/qa-center/run-safe-checks', { requestedMode: 'safe', checks: ['db_integrity'] }],
        ['GET', '/api/qa-center/export']
    ];

    for (const [method, url, body] of qaRoutes) {
        const unauth = await apiRequest(baseUrl, method, url, { body });
        assert.equal(unauth.status, 401, `Unauth ${method} ${url} -> 401`);
        const wkr = await apiRequest(baseUrl, method, url, { token: wkrToken, body });
        assert.equal(wkr.status, 403, `Worker ${method} ${url} -> 403`);
        const acc = await apiRequest(baseUrl, method, url, { token: accToken, body });
        assert.equal(acc.status, 403, `Accountant (even full DB perms) ${method} ${url} -> 403`);
    }

    // Admin executes safe runtime checks cleanly
    const runSafe = await apiRequest(baseUrl, 'POST', '/api/qa-center/run-safe-checks', {
        token: admToken,
        body: {
            requestedMode: 'safe',
            checks: ['db_integrity', 'rbac_matrix', 'notification_lifecycle', 'route_inventory', 'architecture_health']
        }
    });
    assert.equal(runSafe.status, 200, `Admin POST /api/qa-center/run-safe-checks failed: ${runSafe.raw}`);
    assert.equal(runSafe.json?.data?.passed, 5, 'All 5 runtime safe checks must pass');
    assert.equal(runSafe.json?.data?.failed, 0);

    // Heavy load benchmark request from Web UI MUST be hard-blocked 403 SAFE_MODE_LOCKED
    const blockedStress = await apiRequest(baseUrl, 'POST', '/api/qa-center/run-safe-checks', {
        token: admToken,
        body: { requestedMode: 'load_benchmark', checks: ['load_stress'] }
    });
    assert.equal(blockedStress.status, 403);
    assert.equal(blockedStress.json?.code, 'SAFE_MODE_LOCKED');

    const histRes = await apiRequest(baseUrl, 'GET', '/api/qa-center/history', { token: admToken });
    assert.equal(histRes.status, 200);
    assert.ok((histRes.json?.data?.runs || []).length >= 1, 'qa_test_runs DB history must record the safe run');

    const expRes = await apiRequest(baseUrl, 'GET', '/api/qa-center/export', { token: admToken });
    assert.equal(expRes.status, 200);
    assert.ok(Array.isArray(expRes.json?.data?.bugs));
});

test('V29-ARCH-01: Zero circular dependencies, role separation in PayslipActionFooter & AppModal A11y invariants', async () => {
    const qaSvc = require('../src/qa/qaCenterService');
    const safeCheck = await qaSvc.runSafeChecks({
        checks: ['architecture_health'],
        requestedMode: 'safe',
        actor: 'V29_TEST'
    });
    assert.equal(safeCheck.passed, 1, `Circular dependency check failed: ${JSON.stringify(safeCheck)}`);

    const footerSrc = fs.readFileSync(path.join(FE_SRC, 'modules/payroll/PayslipActionFooter.jsx'), 'utf8');
    assert.ok(footerSrc.includes('payslip-admin-footer') && footerSrc.includes('payslip-worker-footer'));
    assert.ok(footerSrc.includes('Điều chỉnh') && footerSrc.includes('Xuất phiếu'));
    assert.ok(footerSrc.includes('Xác nhận đúng lương') && footerSrc.includes('Báo sai sót') && footerSrc.includes('Bảng lương tạm tính'));

    const modalSrc = fs.readFileSync(path.join(FE_SRC, 'components/ui/AppModal.jsx'), 'utf8');
    assert.match(modalSrc, /previousFocusRef/, 'AppModal must restore focus to prior trigger element on close');
    assert.match(modalSrc, /Escape/, 'AppModal must support Escape key closing when enabled');

    const scssSrc = fs.readFileSync(path.join(FE_SRC, 'css/app.scss'), 'utf8');
    assert.match(scssSrc, /:focus-visible/, 'app.scss must style high-contrast focus-visible indicators');
    assert.match(scssSrc, /prefers-reduced-motion/, 'app.scss must honor prefers-reduced-motion');
});
