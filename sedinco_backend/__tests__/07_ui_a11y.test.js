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
                close: () => {
                    if (typeof server.closeAllConnections === 'function') {
                        server.closeAllConnections();
                    }
                    return new Promise((r) => server.close(r));
                }
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
                fraud_count: 2,
                disputed_salary_count: 1,
                pending_device_count: 3,
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
                { permission_key: 'attendance_edit', permission_name: 'Chấm sửa công trực tiếp', category: 'attendance', is_enabled: 1, description: 'Sửa công' },
                { permission_key: 'payroll_view_all', permission_name: 'Xem bảng lương', category: 'payroll', is_enabled: 1, description: 'Xem bảng lương' },
                { permission_key: 'payroll_export', permission_name: 'Xuất bảng lương Excel', category: 'payroll', is_enabled: 1, description: 'Xuất file CSV' },
                { permission_key: 'payroll_approve', permission_name: 'Chốt lương tháng', category: 'payroll', is_enabled: 0, description: 'Phê duyệt chốt lương' },
                { permission_key: 'leave_view_all', permission_name: 'Xem danh sách đơn từ', category: 'requests', is_enabled: 1, description: 'Xem đơn' },
                { permission_key: 'employee_view', permission_name: 'Xem hồ sơ nhân viên', category: 'employee', is_enabled: 1, description: 'Xem nhân sự' }
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

    const payrollGrid = fs.readFileSync(path.join(FE_SRC, 'components/PayrollGridTable.jsx'), 'utf8');
    assert.ok(!payrollGrid.includes('Sổ lỗi P1'), 'PayrollGridTable must not expose developer jargon "Sổ lỗi P1"');

    const auditTab = fs.readFileSync(path.join(FE_SRC, 'views/desktop/AuditLogsTab.jsx'), 'utf8');
    assert.ok(!auditTab.includes('TiDB Cloud'), 'AuditLogsTab must not expose database vendor jargon "TiDB Cloud"');

    const desktopHeader = fs.readFileSync(path.join(FE_SRC, 'components/DesktopHeader.jsx'), 'utf8');
    assert.ok(!desktopHeader.includes('min-h-[40px]'), 'DesktopHeader controls must meet >=44px touch target');
    assert.ok(!desktopHeader.includes('text-[10px]'), 'DesktopHeader must not use micro text-[10px] font');
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
        session.on('Runtime.consoleAPICalled', (ev) => {
            if (ev.type === 'error') {
                const msg = (ev.args || []).map((a) => a.value || a.description || '').join(' ');
                if (msg && !msg.includes('favicon')) pageErrors.push(`console.error: ${msg}`);
            }
        });

        // 1. Test AuthView first (no token)
        await session.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
        await session.send('Page.navigate', { url: staticSrv.url });
        await new Promise((r) => setTimeout(r, 900));

        const authTelemetry = await session.evaluate(`(() => {
            const doc = document.documentElement;
            const btns = [...document.querySelectorAll('button')];
            const tinyBtns = btns.filter(b => b.offsetParent !== null && b.getBoundingClientRect().height < 44).map(b => b.innerText.trim() || b.getAttribute('aria-label'));
            return {
                overflowX: doc.scrollWidth > doc.clientWidth + 1,
                scrollWidth: doc.scrollWidth,
                clientWidth: doc.clientWidth,
                tinyBtns
            };
        })()`);
        assert.equal(authTelemetry.overflowX, false, `AuthView overflowed horizontally at 320px: ${JSON.stringify(authTelemetry)}`);
        assert.deepEqual(authTelemetry.tinyBtns, [], `AuthView has sub-44px buttons: ${JSON.stringify(authTelemetry.tinyBtns)}`);

        // 2. Inject Worker session & verify ALL 6 viewports x ALL 4 font scales (100%, 125%, 150%, 200%)
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
            await new Promise((r) => setTimeout(r, 700));

            for (const rootPx of [16, 20, 24, 32]) {
                await session.evaluate(`document.documentElement.style.fontSize = '${rootPx}px'`);
                await new Promise((r) => setTimeout(r, 100));

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

        // 3. Test Worker History Heatmap readability, non-color code & NO "Chưa tới" on past unlogged Sunday (2026-11-08)
        await session.evaluate(`document.documentElement.style.fontSize = '16px'`);
        await session.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
        await session.evaluate(`(() => {
            const histBtn = [...document.querySelectorAll('nav button')].find(b => b.innerText.includes('Lịch sử'));
            if (histBtn) histBtn.click();
        })()`);
        await new Promise((r) => setTimeout(r, 600));
        // Click a past unlogged Sunday cell ('8' in Nov 2026 if month = 11)
        const histTelemetry = await session.evaluate(`(() => {
            const doc = document.documentElement;
            const dayBtns = [...document.querySelectorAll('button')].filter(b => /^\\d+/.test((b.innerText || '').trim()));
            const firstWithCode = dayBtns.find(b => /1|0\\.5|P|OT|L|KP|V/.test(b.innerText.replace(/^\\d+/, '').trim()));
            const minHeight = dayBtns.length ? Math.min(...dayBtns.map(b => b.getBoundingClientRect().height)) : 0;
            const pastSunBtn = dayBtns.find(b => /^8(\\D|$)/.test(b.innerText.trim()));
            if (pastSunBtn) pastSunBtn.click();
            return {
                overflowX: doc.scrollWidth > doc.clientWidth + 1,
                dayCount: dayBtns.length,
                hasTextCodeInsideCells: Boolean(firstWithCode),
                minHeight,
                clickedPastSun: Boolean(pastSunBtn)
            };
        })()`);
        await new Promise((r) => setTimeout(r, 250));
        const pastSunText = await session.evaluate(`document.body.innerText`);
        assert.equal(histTelemetry.overflowX, false, 'Worker history overflowed horizontally at 375px');
        assert.ok(histTelemetry.hasTextCodeInsideCells, 'Heatmap calendar cells must show non-color text status codes (e.g. P, 1, OT)');
        assert.ok(histTelemetry.minHeight >= 44, `Calendar day cells height (${histTelemetry.minHeight}px) must be >= 44px`);
        if (histTelemetry.clickedPastSun) {
            assert.ok(!pastSunText.includes('Chưa tới'), 'Past unlogged Sunday must not display "Chưa tới" badge');
        }

        // 4. Test Worker Requests tab + SmartLeaveRequestModal scroll lock & responsive at 320px/200% font scale
        await session.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 680, deviceScaleFactor: 2, mobile: true });
        await session.evaluate(`document.documentElement.style.fontSize = '32px'`);
        await session.evaluate(`(() => {
            const reqBtn = [...document.querySelectorAll('nav button')].find(b => b.innerText.includes('Đơn từ'));
            if (reqBtn) reqBtn.click();
        })()`);
        await new Promise((r) => setTimeout(r, 500));
        const reqOpenOk = await session.evaluate(`(() => {
            const btn = [...document.querySelectorAll('button')].find(b => /Xin nghỉ phép|Tạo đơn|Gửi đơn/i.test(b.innerText));
            if (btn) { btn.click(); return true; }
            return false;
        })()`);
        await new Promise((r) => setTimeout(r, 400));
        if (reqOpenOk) {
            const modalTelemetry = await session.evaluate(`(() => ({
                bodyOverflow: document.body.style.overflow,
                overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
            }))()`);
            assert.equal(modalTelemetry.bodyOverflow, 'hidden', 'Opening SmartLeaveRequestModal must lock document.body scroll');
            assert.equal(modalTelemetry.overflowX, false, 'SmartLeaveRequestModal must not overflow at 320px / 200% font scale');
            await session.evaluate(`(() => {
                const closeBtn = [...document.querySelectorAll('button')].find(b => /Đóng|Hủy|✕|×/.test(b.innerText) || b.getAttribute('aria-label')?.includes('Đóng'));
                if (closeBtn) closeBtn.click();
            })()`);
            await new Promise((r) => setTimeout(r, 250));
        }

        // 5. Test Worker Profile + SalarySlipModal open/close (Hooks consistency check)
        await session.evaluate(`document.documentElement.style.fontSize = '16px'`);
        await session.evaluate(`(() => {
            const profBtn = [...document.querySelectorAll('nav button')].find(b => b.innerText.includes('Cá nhân') || b.innerText.includes('Phiếu lương') || b.innerText.includes('Hồ sơ'));
            if (profBtn) profBtn.click();
        })()`);
        await new Promise((r) => setTimeout(r, 500));
        await session.evaluate(`(() => {
            const slipBtn = [...document.querySelectorAll('button')].find(b => /Xem phiếu lương|Chi tiết lương/i.test(b.innerText));
            if (slipBtn) slipBtn.click();
        })()`);
        await new Promise((r) => setTimeout(r, 400));
        await session.evaluate(`(() => {
            const closeBtn = [...document.querySelectorAll('button')].find(b => /Đóng|×/.test(b.innerText) || b.getAttribute('aria-label')?.includes('Đóng'));
            if (closeBtn) closeBtn.click();
        })()`);
        await new Promise((r) => setTimeout(r, 250));

        // 6. Test Accountant Mobile (320px/360px) Capsule pr-[96px], Header alert count & dynamic perms (management tab visible)
        await session.evaluate(`(() => {
            localStorage.setItem('sedinco_miniapp_user', JSON.stringify({
                ma_nv: 'NV002',
                ho_ten: 'Nguyễn Thị Kế Toán',
                role: 'accountant',
                dynamic_permissions: {
                    attendance_view_all: true,
                    attendance_edit: true,
                    payroll_view_all: true,
                    payroll_export: true,
                    payroll_approve: false,
                    leave_view_all: true,
                    employee_view: true
                }
            }));
        })()`);
        for (const w of [320, 360]) {
            await session.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 2, mobile: true });
            await session.send('Page.reload', { ignoreCache: true });
            for (let attempt = 0; attempt < 40; attempt += 1) {
                const ready = await session.evaluate(`Boolean(document.querySelector('header'))`);
                if (ready) break;
                await new Promise((r) => setTimeout(r, 100));
            }
            const accMobileTelemetry = await session.evaluate(`(() => {
                const header = document.querySelector('header');
                const hStyle = header ? getComputedStyle(header) : null;
                const btns = [...document.querySelectorAll('header button')].filter(b => b.offsetParent !== null);
                const smallHeaderBtns = btns.filter(b => b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44).map(b => b.innerText.trim() || b.getAttribute('aria-label'));
                const alertPill = [...document.querySelectorAll('header button, header a, header span')].find(el => /Cảnh báo|Khiếu nại/.test(el.innerText));
                return {
                    hasHeader: Boolean(header),
                    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                    paddingRight: hStyle ? parseFloat(hStyle.paddingRight) : 0,
                    smallHeaderBtns,
                    alertText: alertPill ? alertPill.innerText : ''
                };
            })()`);
            assert.equal(accMobileTelemetry.hasHeader, true, `DesktopHeader <header> must be mounted at ${w}px`);
            assert.equal(accMobileTelemetry.overflowX, false, `Accountant header overflowed at ${w}px`);
            assert.ok(accMobileTelemetry.paddingRight >= 80, `Mobile DesktopHeader must keep Zalo capsule clearance pr-[96px] at ${w}px (got ${accMobileTelemetry.paddingRight}px)`);
            assert.deepEqual(accMobileTelemetry.smallHeaderBtns, [], `Accountant header buttons <44px at ${w}px`);
            if (accMobileTelemetry.alertText) {
                assert.ok(!accMobileTelemetry.alertText.includes('6'), `Accountant alert count must only count disputes (1), not Admin fraud/device (6): got "${accMobileTelemetry.alertText}"`);
            }
        }

        // 7. Test Admin DesktopSidebar + AccountantPermissionView semantic switches + jargon-free tabs
        await session.evaluate(`(() => {
            localStorage.setItem('sedinco_miniapp_user', JSON.stringify({
                ma_nv: 'NV001',
                ho_ten: 'Admin Giám Đốc',
                role: 'admin'
            }));
        })()`);
        await session.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
        await session.send('Page.reload', { ignoreCache: true });
        for (let attempt = 0; attempt < 40; attempt += 1) {
            const ready = await session.evaluate(`[...document.querySelectorAll('button')].some(b => b.innerText.includes('Phân Quyền'))`);
            if (ready) break;
            await new Promise((r) => setTimeout(r, 100));
        }

        await session.evaluate(`(() => {
            const permNav = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Phân Quyền'));
            if (permNav) permNav.click();
        })()`);
        await new Promise((r) => setTimeout(r, 500));
        const permTelemetry = await session.evaluate(`(() => ({
            switchCount: document.querySelectorAll('button[role="switch"][aria-checked]').length,
            bodyText: document.body.innerText
        }))()`);
        assert.ok(permTelemetry.switchCount >= 2, `AccountantPermissionView must render semantic <button role="switch" aria-checked> controls (got ${permTelemetry.switchCount})`);
        assert.ok(!permTelemetry.bodyText.includes('TiDB Cloud') && !permTelemetry.bodyText.includes('Sổ lỗi P1'), 'Admin UI must not display developer jargon');

        await session.evaluate(`(() => {
            const auditNav = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Nhật Ký'));
            if (auditNav) auditNav.click();
        })()`);
        await new Promise((r) => setTimeout(r, 400));
        const auditText = await session.evaluate(`document.body.innerText`);
        assert.ok(!auditText.includes('TiDB Cloud'), 'AuditLogsTab rendered view must not contain "TiDB Cloud"');

        assert.deepEqual(failed4xx, [], `Legacy 404 API calls detected: ${failed4xx.join(', ')}`);
        assert.deepEqual(pageErrors, [], `Uncaught runtime errors in browser: ${pageErrors.join('; ')}`);
    } finally {
        await session.close();
        await staticSrv.close();
    }
});
