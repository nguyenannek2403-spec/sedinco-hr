/**
 * Suite 02 — 4-Source Contract Reconciliation (FE <-> BE Routes <-> RBAC Keys <-> DB/Scripts)
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app, listExpressRoutes } = require('./_helpers');

const ROOT_DIR = path.resolve(__dirname, '../..');
const FE_SRC = path.join(ROOT_DIR, 'zalo-miniapp-frontend/src');
const BE_SRC = path.join(ROOT_DIR, 'sedinco_backend/src');

function collectFrontendApiCalls() {
    const results = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else if (full.endsWith('.js') || full.endsWith('.jsx')) {
                const src = fs.readFileSync(full, 'utf8');
                const re = /\b(safeGet|safePost|safePut|safeDelete)\s*\(\s*([`'"])([^`'"]+)\2/g;
                let m;
                while ((m = re.exec(src))) {
                    const method = m[1].replace('safe', '').toUpperCase();
                    let rawPath = m[3].replace(/\$\{[^}]+\}/g, ':param');
                    rawPath = rawPath.split('?')[0];
                    results.push({
                        file: path.relative(ROOT_DIR, full),
                        method,
                        path: rawPath.startsWith('/api') ? rawPath : `/api${rawPath}`
                    });
                }
            }
        }
    };
    walk(FE_SRC);
    return results;
}

function matchExpressRoute(feMethod, fePath, routes) {
    const cleanFe = fePath.replace(/\/+$/, '') || '/';
    const feParts = cleanFe.split('/');
    return routes.some((r) => {
        if (r.method !== feMethod) return false;
        const cleanBe = r.path.replace(/\/+$/, '') || '/';
        const beParts = cleanBe.split('/');
        if (beParts.length !== feParts.length) return false;
        return beParts.every((seg, i) => seg.startsWith(':') || feParts[i].startsWith(':') || seg === feParts[i]);
    });
}

test('CONTRACT-01: Every FE API call (safeGet/Post/Put/Delete) matches a real mounted BE Express route', () => {
    const routes = listExpressRoutes(app);
    assert.ok(routes.length >= 90, `Expected >=90 mounted route entries, got ${routes.length}`);
    const calls = collectFrontendApiCalls();
    assert.ok(calls.length >= 40, `Expected >=40 FE API callers, got ${calls.length}`);

    const mismatches = calls.filter((c) => !matchExpressRoute(c.method, c.path, routes));
    assert.deepEqual(
        mismatches,
        [],
        `Frontend calls to non-existent BE routes:\n${mismatches.map((m) => `${m.file}: ${m.method} ${m.path}`).join('\n')}`
    );
});

test('CONTRACT-02: FE proxy-check-in parity & desktop tab route authorization guard', () => {
    const liveBoard = fs.readFileSync(path.join(FE_SRC, 'components/LiveAttendanceBoardModal.jsx'), 'utf8');
    assert.match(liveBoard, /work_location_type/, 'LiveAttendanceBoardModal must pass work_location_type consistently with AttendanceMatrixTable');

    const deskDash = fs.readFileSync(path.join(FE_SRC, 'views/desktop/DesktopDashboard.jsx'), 'utf8');
    assert.match(
        deskDash,
        /isTabAllowedForRole/,
        'DesktopDashboard must enforce isTabAllowedForRole guard on currentTab'
    );
});

test('CONTRACT-03: Zero Developer Jargon in rendered FE text', () => {
    const header = fs.readFileSync(path.join(FE_SRC, 'components/DesktopHeader.jsx'), 'utf8');
    const adapter = fs.readFileSync(path.join(FE_SRC, 'adapters/zmp/realSdkAdapter.js'), 'utf8');
    const checkIn = fs.readFileSync(path.join(FE_SRC, 'components/OneTouchCheckIn.jsx'), 'utf8');

    assert.ok(!header.includes('Fake GPS'), 'DesktopHeader must not show "Fake GPS" to end users');
    assert.ok(!adapter.includes('Access Token'), 'realSdkAdapter must not show "Access Token" jargon to workers');
    assert.ok(!adapter.includes('sinh trắc học'), 'realSdkAdapter should use plain Vietnamese (vân tay / khuôn mặt)');
    assert.ok(!checkIn.includes('CẢNH BÁO VI PHẠM AN NINH'), 'OneTouchCheckIn should avoid alarming criminalizing warning text for elderly workers');
});

test('CONTRACT-04: BE permission route alignment & SoD UI transparency & staging grant SQL consistency', () => {
    const payrollRoutes = fs.readFileSync(path.join(BE_SRC, 'routes/payrollRoutes.js'), 'utf8');
    assert.match(payrollRoutes, /['"]\/resolve-dispute['"][^\n]*requirePermission\(['"]payroll_approve['"]\)/, 'POST /payroll/resolve-dispute must enforce payroll_approve SoD permission');
    assert.match(payrollRoutes, /['"]\/export['"][^\n]*requirePermission\(['"]payroll_export['"]\)/, 'GET /payroll/export must enforce payroll_export permission');

    const empRoutes = fs.readFileSync(path.join(BE_SRC, 'routes/employeeRoutes.js'), 'utf8');
    assert.match(empRoutes, /['"]\/:ma_nv\/shift['"][^\n]*requirePermission\(['"]shift_manage['"]\)/, 'PUT /employees/:ma_nv/shift must enforce shift_manage permission');

    const grantSql = fs.readFileSync(path.join(ROOT_DIR, 'scripts/grant_staging_app_user.sql'), 'utf8');
    assert.ok(grantSql.includes('idempotency_keys'), 'grant_staging_app_user.sql must grant privileges on idempotency_keys');
    assert.ok(!grantSql.includes('dynamic_qr_sessions') && !grantSql.includes('kiosk_devices'), 'grant_staging_app_user.sql must not reference dropped kiosk tables');

    const permView = fs.readFileSync(path.join(FE_SRC, 'components/AccountantPermissionView.jsx'), 'utf8');
    assert.match(permView, /role=["']switch["']/, 'AccountantPermissionView switches must use accessible role="switch" button semantics');
});

