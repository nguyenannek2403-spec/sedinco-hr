/**
 * Suite 07 — UI/UX, Accessibility (WCAG 2.1 AA), Responsive Matrix (320-430px) & Elderly Font Scaling (100%-200%)
 * Combines source-level WCAG/Elderly checks with real headless Brave Browser CDP rendering telemetry.
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { launchHeadlessBrave } = require('./_cdp');

const ROOT_DIR = path.resolve(__dirname, '../..');
const FE_DIR = path.join(ROOT_DIR, 'zalo-miniapp-frontend');
const FE_SRC = path.join(FE_DIR, 'src');
const WWW_DIR = path.join(FE_DIR, 'www');

const MIME_MAP = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function startStaticFrontendServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const urlPath = (req.url || '/').split('?')[0];
            let filePath = path.join(WWW_DIR, urlPath === '/' ? 'index.html' : urlPath);
            if (!filePath.startsWith(WWW_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                filePath = path.join(WWW_DIR, 'index.html');
            }
            const ext = path.extname(filePath);
            res.setHeader('Content-Type', MIME_MAP[ext] || 'application/octet-stream');
            fs.createReadStream(filePath).pipe(res);
        });
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            resolve({
                url: `http://127.0.0.1:${addr.port}`,
                close: () => new Promise((r) => server.close(r))
            });
        });
    });
}

function buildMockApiPayload(urlStr) {
    const u = new URL(urlStr);
    const p = u.pathname;
    if (p.endsWith('/api/company') || p.endsWith('/api/company/settings')) {
        return {
            success: true,
            data: {
                company_name: 'CÔNG TY CP SEDINCO',
                latitude: 16.0544,
                longitude: 108.2022,
                radius_meters: 150,
                work_start: '08:00',
                work_end: '17:30',
                allowed_locations: [{ name: 'Trụ sở chính Đà Nẵng', lat: 16.0544, lng: 108.2022, radius: 150 }],
                office_ip_whitelist: ''
            }
        };
    }
    if (p.endsWith('/api/attendance/me')) {
        return {
            success: true,
            data: {
                logs: [
                    { record_date: '2026-11-02', status: '1', check_in_time: '07:55:00', check_out_time: '17:32:00', ot_hours: 0, late_minutes: 0 },
                    { record_date: '2026-11-03', status: 'P', check_in_time: null, check_out_time: null, ot_hours: 0, late_minutes: 0 },
                    { record_date: '2026-11-04', status: '1/OT', check_in_time: '07:50:00', check_out_time: '19:45:00', ot_hours: 2, late_minutes: 0 },
                    { record_date: '2026-11-05', status: '0.5', check_in_time: '08:40:00', check_out_time: '12:00:00', ot_hours: 0, late_minutes: 40 }
                ],
                forgotten_checkout: null,
                summary: { total_work_days: 3.5, total_ot_hours: 2, total_leave_days: 1, late_count: 1, standard_days: 26 }
            }
        };
    }
    if (p.endsWith('/api/requests/me')) {
        return {
            success: true,
            data: [
                { id: 101, request_type: 'P', request_date: '2026-11-03', status: 'approved', reason: 'Nghỉ phép năm gia đình' },
                { id: 102, request_type: 'OT', request_date: '2026-11-12', status: 'pending', reason: 'Tăng ca hoàn thiện công trình' }
            ]
        };
    }
    if (p.endsWith('/api/requests/leave-balance')) {
        return { success: true, data: { quota: 12, used: 1, remaining: 11 } };
    }
    if (p.endsWith('/api/payroll/me')) {
        return {
            success: true,
            data: {
                ma_nv: 'NV003',
                ho_ten: 'Nguyễn Văn Công Nhân Cao Tuổi',
                thang: 11,
                nam: 2026,
                baseSalary: 10400000,
                actualWorkDays: 24,
                standardWorkDays: 26,
                salaryByWork: 9600000,
                totalAllowance: 800000,
                otAmount: 600000,
                totalInsurance: 1092000,
                netSalary: 9908000,
                salary_confirm_status: 'PENDING'
            }
        };
    }
    if (p.endsWith('/api/notifications/summary')) {
        return {
            success: true,
            data: {
                fraud_count: 0,
                disputed_salary_count: 0,
                pending_device_count: 0,
                pending_requests_count: 1,
                headcount_today: { total: 10, present: 7, late: 1, field_work: 1, leave: 1, absent: 1 }
            }
        };
    }
    if (p.endsWith('/api/attendance')) {
        return { success: true, data: { employees: [{ ma_nv: 'NV003', ho_ten: 'Nguyễn Văn An', department: 'Công trình', days: ['1', 'P', '1/OT'] }], is_locked: false } };
    }
    if (p.endsWith('/api/settings/accountant-permissions')) {
        return {
            success: true,
            data: [
                { permission_key: 'attendance_view_all', permission_name: 'Xem bảng chấm công', category: 'attendance', is_enabled: 1, description: 'Xem toàn bộ' },
                { permission_key: 'payroll_export', permission_name: 'Xuất bảng lương Excel', category: 'payroll', is_enabled: 1, description: 'Xuất file CSV' }
            ]
        };
    }
    if (p.endsWith('/api/settings/audit-logs')) return { success: true, data: [] };
    if (p.endsWith('/api/employees')) return { success: true, data: [] };
    if (p.endsWith('/api/requests')) return { success: true, data: [] };
    if (p.endsWith('/api/payroll')) return { success: true, data: [] };
    if (p.endsWith('/api/holidays')) return { success: true, data: [] };
    return { success: true, data: {} };
}

test('UI-01: Index HTML zoom unlocked (WCAG 1.4.4) & SCSS scales input text at 200%', () => {
    const html = fs.readFileSync(path.join(FE_DIR, 'index.html'), 'utf8');
    assert.ok(!/user-scalable\s*=\s*no/i.test(html), 'index.html must not block pinch-to-zoom (user-scalable=no)');
    assert.ok(!/maximum-scale\s*=\s*1(\.0)?/i.test(html), 'index.html must not lock maximum-scale=1');

    const scss = fs.readFileSync(path.join(FE_SRC, 'css/app.scss'), 'utf8');
    assert.ok(!/font-size:\s*16px\s*;/.test(scss), 'app.scss must use scalable font-size (e.g. max(16px, 1rem)) instead of hardcoded 16px');
});

test('UI-02: Semantic A11y — switches, attendance cells, icon aria-labels, micro-fonts & contrast', () => {
    const permView = fs.readFileSync(path.join(FE_SRC, 'components/AccountantPermissionView.jsx'), 'utf8');
    assert.match(permView, /<button[^>]*role=["']switch["']/, 'AccountantPermissionView toggles must be semantic <button role="switch">');

    const matrix = fs.readFileSync(path.join(FE_SRC, 'components/AttendanceMatrixTable.jsx'), 'utf8');
    assert.ok(!/<td[^>]*onClick=/.test(matrix), 'AttendanceMatrixTable must use interactive <button> inside <td> instead of clickable <td>');

    const authView = fs.readFileSync(path.join(FE_SRC, 'views/AuthView.jsx'), 'utf8');
    assert.match(authView, /aria-label=.*showPassword/, 'Password visibility toggle button in AuthView must have aria-label');

    const workerDash = fs.readFileSync(path.join(FE_SRC, 'views/worker/WorkerDashboard.jsx'), 'utf8');
    assert.ok(!workerDash.includes('text-[10px]'), 'WorkerDashboard navigation must not use micro text-[10px] font');
    assert.ok(!workerDash.includes('min-h-[38px]'), 'WorkerDashboard buttons must meet >=44px touch target');

    const histTab = fs.readFileSync(path.join(FE_SRC, 'views/worker/WorkerHistoryTab.jsx'), 'utf8');
    assert.ok(!histTab.includes('text-[10px]') && !histTab.includes('text-[11px]'), 'WorkerHistoryTab must use >=12px readable fonts');

    const checkIn = fs.readFileSync(path.join(FE_SRC, 'components/OneTouchCheckIn.jsx'), 'utf8');
    assert.ok(!/className=\{`[^`]*\bw-52 h-52\b/.test(checkIn), 'OneTouchCheckIn button must not hardcode fixed w-52 h-52 that clips at 200% font scale');
    assert.ok(!checkIn.includes('text-[11px]'), 'OneTouchCheckIn must use >=12px readable fonts');

    const salarySlip = fs.readFileSync(path.join(FE_SRC, 'components/SalarySlipModal.jsx'), 'utf8');
    assert.ok(!salarySlip.includes('text-slate-400 block text-[10px]'), 'SalarySlipModal labels must meet WCAG AA contrast on light surfaces');
});

test('UI-03: Headless Brave CDP Matrix (320-430px viewports & 100%-200% font scale) zero overflow, >=44px targets & clean console', async () => {
    assert.ok(fs.existsSync(path.join(WWW_DIR, 'index.html')), 'Built frontend www/index.html must exist before UI CDP test');
    const staticSrv = await startStaticFrontendServer();
    const session = await launchHeadlessBrave();
    const apiHits = [];
    const pageErrors = [];
    const failed4xx = [];

    try {
        await session.send('Network.enable');
        await session.send('Fetch.enable', {
            patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }]
        });
        session.on('Fetch.requestPaused', async (ev) => {
            const reqUrl = ev.request.url;
            const corsHeaders = [
                { name: 'Access-Control-Allow-Origin', value: '*' },
                { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' },
                { name: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type, Idempotency-Key, X-Idempotency-Key, X-Requested-With' }
            ];
            if (ev.request.method === 'OPTIONS') {
                await session.send('Fetch.fulfillRequest', {
                    requestId: ev.requestId,
                    responseCode: 204,
                    responseHeaders: corsHeaders,
                    body: ''
                }).catch(() => {});
                return;
            }
            apiHits.push(reqUrl);
            if (reqUrl.includes('/api/session') || reqUrl.includes('/api/auth/link')) {
                failed4xx.push(`404 legacy route called: ${reqUrl}`);
                await session.send('Fetch.fulfillRequest', {
                    requestId: ev.requestId,
                    responseCode: 404,
                    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, ...corsHeaders],
                    body: Buffer.from(JSON.stringify({ success: false, message: 'Not Found' })).toString('base64')
                }).catch(() => {});
                return;
            }
            const payload = buildMockApiPayload(reqUrl);
            await session.send('Fetch.fulfillRequest', {
                requestId: ev.requestId,
                responseCode: 200,
                responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, ...corsHeaders],
                body: Buffer.from(JSON.stringify(payload)).toString('base64')
            }).catch(() => {});
        });
        session.on('Runtime.exceptionThrown', (ev) => {
            pageErrors.push(ev.exceptionDetails?.text || 'Runtime exception');
        });

        // 1. Test AuthView first (no token)
        await session.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
        await session.send('Page.navigate', { url: staticSrv.url });
        await new Promise((r) => setTimeout(r, 900));

        const authTelemetry = await session.evaluate(`(() => {
            const doc = document.documentElement;
            const btns = [...document.querySelectorAll('button')];
            const tinyBtns = btns.filter(b => b.offsetParent !== null && b.getBoundingClientRect().height < 42).map(b => b.innerText.trim() || b.getAttribute('aria-label'));
            return {
                overflowX: doc.scrollWidth > doc.clientWidth + 1,
                scrollWidth: doc.scrollWidth,
                clientWidth: doc.clientWidth,
                tinyBtns
            };
        })()`);
        assert.equal(authTelemetry.overflowX, false, `AuthView overflowed horizontally at 320px: ${JSON.stringify(authTelemetry)}`);
        assert.deepEqual(authTelemetry.tinyBtns, [], `AuthView has sub-42px buttons: ${JSON.stringify(authTelemetry.tinyBtns)}`);

        // 2. Inject Worker session & verify 6 viewports x 2 font scales (100%, 200%)
        await session.evaluate(`(() => {
            localStorage.setItem('sedinco_auth_token', 'qa-mock-token');
            localStorage.setItem('sedinco_miniapp_user', JSON.stringify({
                ma_nv: 'NV003',
                ho_ten: 'Nguyễn Văn Công Nhân Cao Tuổi Rất Dài',
                role: 'worker',
                chuc_danh: 'Thợ cơ khí'
            }));
            localStorage.setItem('sedinco_has_seen_location_perm', 'true');
        })()`);

        const viewports = [320, 360, 375, 390, 412, 430];
        for (const width of viewports) {
            await session.send('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 2, mobile: true });
            await session.send('Page.reload', { ignoreCache: true });
            await new Promise((r) => setTimeout(r, 900));

            for (const rootPx of [16, 32]) {
                await session.evaluate(`document.documentElement.style.fontSize = '${rootPx}px'`);
                await new Promise((r) => setTimeout(r, 150));

                const checkInTelemetry = await session.evaluate(`(() => {
                    const doc = document.documentElement;
                    const circleBtn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('CHẤM CÔNG'));
                    const navBtns = [...document.querySelectorAll('nav button')];
                    const smallNav = navBtns.filter(b => b.getBoundingClientRect().height < 44).map(b => b.innerText.trim());
                    return {
                        overflowX: doc.scrollWidth > doc.clientWidth + 1,
                        scrollWidth: doc.scrollWidth,
                        clientWidth: doc.clientWidth,
                        circleClipped: circleBtn ? (circleBtn.scrollHeight > circleBtn.clientHeight + 4 || circleBtn.scrollWidth > circleBtn.clientWidth + 4) : false,
                        smallNav
                    };
                })()`);
                assert.equal(checkInTelemetry.overflowX, false, `Worker check-in horizontal overflow at ${width}px / root=${rootPx}px: ${JSON.stringify(checkInTelemetry)}`);
                assert.equal(checkInTelemetry.circleClipped, false, `Check-in main circle clips text at ${width}px / root=${rootPx}px`);
                assert.deepEqual(checkInTelemetry.smallNav, [], `Bottom nav buttons <44px at ${width}px`);
            }
        }

        // 3. Test Worker History Heatmap readability & non-color-only code at 320px & 375px
        await session.evaluate(`document.documentElement.style.fontSize = '16px'`);
        await session.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
        await session.evaluate(`(() => {
            const histBtn = [...document.querySelectorAll('nav button')].find(b => b.innerText.includes('Lịch sử'));
            if (histBtn) histBtn.click();
        })()`);
        await new Promise((r) => setTimeout(r, 600));
        const histTelemetry = await session.evaluate(`(() => {
            const doc = document.documentElement;
            const dayBtns = [...document.querySelectorAll('button')].filter(b => /^\\d+/.test((b.innerText || '').trim()));
            const firstWithCode = dayBtns.find(b => /1|0\\.5|P|OT|L|KP|V/.test(b.innerText.replace(/^\\d+/, '').trim()));
            const minHeight = dayBtns.length ? Math.min(...dayBtns.map(b => b.getBoundingClientRect().height)) : 0;
            return {
                overflowX: doc.scrollWidth > doc.clientWidth + 1,
                dayCount: dayBtns.length,
                hasTextCodeInsideCells: Boolean(firstWithCode),
                minHeight
            };
        })()`);
        assert.equal(histTelemetry.overflowX, false, 'Worker history overflowed horizontally at 375px');
        assert.ok(histTelemetry.hasTextCodeInsideCells, 'Heatmap calendar cells must show non-color text status codes (e.g. P, 1, OT) for color-blind/elderly accessibility');
        assert.ok(histTelemetry.minHeight >= 44, `Calendar day cells height (${histTelemetry.minHeight}px) must be >= 44px`);

        // 4. Test Admin / Accountant DesktopSidebar + Permission switches A11y
        await session.evaluate(`(() => {
            localStorage.setItem('sedinco_miniapp_user', JSON.stringify({
                ma_nv: 'NV001',
                ho_ten: 'Admin Giám Đốc',
                role: 'admin'
            }));
        })()`);
        await session.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
        await session.send('Page.reload', { ignoreCache: true });
        await new Promise((r) => setTimeout(r, 900));
        await session.evaluate(`(() => {
            const permNav = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Phân Quyền'));
            if (permNav) permNav.click();
        })()`);
        await new Promise((r) => setTimeout(r, 500));
        const permTelemetry = await session.evaluate(`(() => {
            return {
                switchCount: document.querySelectorAll('button[role="switch"][aria-checked]').length
            };
        })()`);
        assert.ok(permTelemetry.switchCount >= 2, `AccountantPermissionView must render semantic <button role="switch" aria-checked> controls (got ${permTelemetry.switchCount})`);

        assert.deepEqual(failed4xx, [], `Legacy 404 API calls detected: ${failed4xx.join(', ')}`);
        assert.deepEqual(pageErrors, [], `Uncaught runtime errors in browser: ${pageErrors.join('; ')}`);
    } finally {
        await session.close();
        await staticSrv.close();
    }
});
