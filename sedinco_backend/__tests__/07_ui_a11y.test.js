/**
 * Suite 07 — UI/UX, Accessibility (WCAG 2.1 AA), True Portal Scroll-Lock Physics,
 * Zero-Pixel Overlap & Real-DB 3-Role Interactive E2E Matrix (Headless Brave CDP).
 *
 * ZERO API MOCKING: Runs a unified real Express + static www/ server against real MySQL (sedinco_hr_test).
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const {
    app,
    query,
    snapshotSettings,
    restoreSettings,
    closeTestRuntime
} = require('./_helpers');
const { initDatabase } = require('../src/database/initDb');
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
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Starts a unified HTTP server serving BOTH the real Express API (/api, /health, /uploads)
 * and the built static frontend bundle (www/) on the exact same origin.
 */
async function startUnifiedRealServer() {
    await initDatabase();
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const urlPath = (req.url || '/').split('?')[0];
            if (urlPath.startsWith('/api') || urlPath === '/health' || urlPath.startsWith('/uploads')) {
                return app(req, res);
            }
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

function listFilesRecursive(dir, extFilter) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listFilesRecursive(full, extFilter));
        else if (!extFilter || entry.name.endsWith(extFilter)) out.push(full);
    }
    return out;
}

test('UI-01: Index HTML zoom unlocked (WCAG 1.4.4) & SCSS scales input text at 200%', () => {
    const html = fs.readFileSync(path.join(FE_DIR, 'index.html'), 'utf8');
    assert.ok(!/user-scalable\s*=\s*no/i.test(html), 'index.html must not block pinch-to-zoom (user-scalable=no)');
    assert.ok(!/maximum-scale\s*=\s*1(\.0)?/i.test(html), 'index.html must not lock maximum-scale=1');

    const scss = fs.readFileSync(path.join(FE_SRC, 'css/app.scss'), 'utf8');
    assert.ok(!/font-size:\s*16px\s*;/.test(scss), 'app.scss must use scalable font-size (e.g. max(16px, 1rem)) instead of hardcoded 16px');
    assert.match(scss, /\.bg-scroll-locked/, 'app.scss must define .bg-scroll-locked for physical scroll isolation');
    assert.match(scss, /\.toast-progress-bar/, 'app.scss must define .toast-progress-bar');
});

test('UI-02: Semantic A11y & V15 Portal Architecture — switches, portals, scroll-lock & zero jargon', () => {
    const permView = fs.readFileSync(path.join(FE_SRC, 'components/AccountantPermissionView.jsx'), 'utf8');
    assert.match(permView, /<button[^>]*role=["']switch["']/, 'AccountantPermissionView toggles must be semantic <button role="switch">');

    const matrix = fs.readFileSync(path.join(FE_SRC, 'components/AttendanceMatrixTable.jsx'), 'utf8');
    assert.ok(!/<td[^>]*onClick=/.test(matrix), 'AttendanceMatrixTable must use interactive <button> inside <td> instead of clickable <td>');

    const authView = fs.readFileSync(path.join(FE_SRC, 'views/AuthView.jsx'), 'utf8');
    assert.match(authView, /aria-label=.*showPassword/, 'Password visibility toggle button in AuthView must have aria-label');

    const workerDash = fs.readFileSync(path.join(FE_SRC, 'views/worker/WorkerDashboard.jsx'), 'utf8');
    assert.ok(!workerDash.includes('text-[10px]'), 'WorkerDashboard navigation must not use micro text-[10px] font');
    assert.ok(!workerDash.includes('min-h-[38px]'), 'WorkerDashboard buttons must meet >=44px touch target');
    assert.match(workerDash, /data-scroll-container=/, 'WorkerDashboard main must declare data-scroll-container');

    const desktopDash = fs.readFileSync(path.join(FE_SRC, 'views/desktop/DesktopDashboard.jsx'), 'utf8');
    assert.match(desktopDash, /data-scroll-container=/, 'DesktopDashboard main must declare data-scroll-container');

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

    // V15 Portal invariants
    const appModal = fs.readFileSync(path.join(FE_SRC, 'components/ui/AppModal.jsx'), 'utf8');
    assert.match(appModal, /createPortal\(/, 'AppModal must render via createPortal(..., document.body)');
    assert.match(appModal, /useModalStack/, 'AppModal must use useModalStack for automatic nested z-index stacking');

    const sidebar = fs.readFileSync(path.join(FE_SRC, 'components/DesktopSidebar.jsx'), 'utf8');
    assert.match(sidebar, /createPortal\(/, 'DesktopSidebar mobile drawer must render via createPortal(..., document.body)');

    const indexPage = fs.readFileSync(path.join(FE_SRC, 'pages/index.jsx'), 'utf8');
    assert.match(indexPage, /createPortal\(/, 'Global Toast must render via createPortal(..., document.body)');
    assert.match(indexPage, /zIndex:\s*130|z-\[130\]/, 'Global Toast must sit at z-index 130 above all modals');

    // Zero inline fixed-inset-0 overlays outside AppModal, DesktopSidebar & index (Toast)
    const allSrcFiles = listFilesRecursive(FE_SRC, '.jsx');
    const allowedOverlayFiles = new Set(['AppModal.jsx', 'DesktopSidebar.jsx', 'index.jsx']);
    for (const file of allSrcFiles) {
        const base = path.basename(file);
        if (allowedOverlayFiles.has(base)) continue;
        const src = fs.readFileSync(file, 'utf8');
        assert.ok(!/fixed\s+inset-0/.test(src), `${base} must not render inline fixed inset-0 overlay — use <AppModal> portal instead`);
    }
});

// =========================================================================
// CDP HELPERS FOR REAL USER INTERACTION & 5-CHECK SCROLL/GEOMETRY INSPECTOR
// =========================================================================

async function setViewportAndScale(session, width, height, fontScalePct = 100) {
    await session.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: true,
        touch: true
    });
    await session.evaluate(`(() => {
        document.documentElement.style.fontSize = ${fontScalePct === 100 ? "''" : `'${(16 * fontScalePct) / 100}px'`};
        return true;
    })()`);
    await sleep(160);
}

async function waitForCondition(session, fnExpr, timeoutMs = 8000, description = 'condition') {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const ok = await session.evaluate(fnExpr);
        if (ok) return true;
        await sleep(120);
    }
    throw new Error(`Timeout waiting for: ${description}`);
}

async function waitForNoBlockingLoading(session) {
    await waitForCondition(
        session,
        `(() => {
            const text = document.body.innerText || '';
            return !text.includes('Đang khởi tạo phiên làm việc') && !text.includes('Đang tải dữ liệu');
        })()`,
        8000,
        'page ready without blocking spinner'
    ).catch(() => {});
    await sleep(200);
}

async function clickInPage(session, opts) {
    const {
        selector = null,
        text = null,
        exact = false,
        inTopModal = 'auto',
        outsideModalOnly = false,
        index = 0
    } = opts;

    const clicked = await session.evaluate(`(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        const modals = Array.from(document.querySelectorAll('[data-modal-root="true"]'))
            .filter(isVisible)
            .sort((a, b) => Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0));
        const topModal = modals[0] || null;
        let root = document;
        if (${JSON.stringify(outsideModalOnly)}) {
            root = document.getElementById('app') || document.body;
        } else if (${inTopModal === true ? 'true' : inTopModal === 'auto' ? 'Boolean(topModal)' : 'false'}) {
            root = topModal || document;
        }
        const candidates = [];
        if (${JSON.stringify(selector)}) {
            for (const el of root.querySelectorAll(${JSON.stringify(selector || '')})) {
                if (isVisible(el)) candidates.push(el);
            }
        } else if (${JSON.stringify(text)}) {
            const wanted = ${JSON.stringify(text || '')}.trim().replace(/\\s+/g, ' ');
            const nodes = root.querySelectorAll('button, [role="button"], a, summary, label');
            for (const el of nodes) {
                if (!isVisible(el)) continue;
                const txt = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ');
                const match = ${Boolean(exact)} ? (txt === wanted) : txt.includes(wanted);
                if (match) candidates.push(el);
            }
        }
        const target = candidates[${index}];
        if (!target || target.disabled) return null;
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        target.click();
        return {
            tag: target.tagName,
            text: (target.innerText || target.getAttribute('aria-label') || '').trim().slice(0, 60)
        };
    })()`);

    assert.ok(clicked, `Failed to find & click element (${JSON.stringify(opts)})`);
    await sleep(240);
    return clicked;
}

async function setReactInputValue(session, opts) {
    const {
        selector,
        value,
        inTopModal = 'auto',
        index = 0
    } = opts;
    const ok = await session.evaluate(`(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        const modals = Array.from(document.querySelectorAll('[data-modal-root="true"]'))
            .filter(isVisible)
            .sort((a, b) => Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0));
        const topModal = modals[0] || null;
        const root = (${inTopModal === true ? 'true' : inTopModal === 'auto' ? 'Boolean(topModal)' : 'false'} && topModal) ? topModal : document;
        const els = Array.from(root.querySelectorAll(${JSON.stringify(selector)})).filter(isVisible);
        const el = els[${index}];
        if (!el) return false;
        el.focus();
        const proto = el.tagName === 'TEXTAREA'
            ? HTMLTextAreaElement.prototype
            : (el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, ${JSON.stringify(String(value))});
        else el.value = ${JSON.stringify(String(value))};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return el.value === ${JSON.stringify(String(value))};
    })()`);
    assert.ok(ok, `Failed to set value "${value}" on selector "${selector}"`);
    await sleep(120);
}

async function uploadTempFileInModal(session, filePath) {
    await session.send('DOM.enable');
    const doc = await session.send('DOM.getDocument', { depth: -1 });
    const q = await session.send('DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector: '[data-modal-root="true"] input[type="file"]'
    });
    const qFallback = (q && q.nodeId) ? q : await session.send('DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector: 'input[type="file"]'
    });
    assert.ok(qFallback && qFallback.nodeId, 'File input must exist');
    await session.send('DOM.setFileInputFiles', {
        nodeId: qFallback.nodeId,
        files: [filePath]
    });
    await sleep(400);
}

/**
 * Runs the mandatory 5-Check DOM Geometry & Scroll Physics Inspector at the current screen state.
 * - Check 1: Background Scroll Bleed = 0px (dispatches real CDP mouseWheel & DOM Wheel/Touch on modal)
 * - Check 2: Inner Modal Scroll works smoothly (.modal-scroll-area) without touching background
 * - Check 3: Zero Bounding-Box Overlap & Strict Z-index hierarchy (Toast 130 > Nested Modal > Parent Modal > Header/Nav)
 * - Check 4: Zero Horizontal Overflow, >=42/44px Controls & FormRow Input Containment
 * - Check 5: Zero Developer Jargon & Zero Invalid Telemetry (undefined/null/NaN/[object Object])
 */
async function inspectPhysicsAndGeometry(session, label, { expectModal = false, testScrollBleed = true } = {}) {
    await sleep(180);

    // Prepare background scroll test state if modal isn't covering or record baseline scroll positions
    const stateBefore = await session.evaluate(`(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        const modals = Array.from(document.querySelectorAll('[data-modal-root="true"]'))
            .filter(isVisible)
            .sort((a, b) => Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0));
        const topModal = modals[0] || null;
        const bgContainers = Array.from(document.querySelectorAll('#app main, #app [data-scroll-container], #app .overflow-y-auto'))
            .filter((el) => !el.closest('[data-modal-root="true"]'));
        const bgScrollBefore = bgContainers.map((el, idx) => ({
            idx,
            scrollTop: el.scrollTop,
            inert: Boolean(el.closest('[inert]')) || el.inert === true || el.hasAttribute('inert'),
            locked: el.classList.contains('bg-scroll-locked') || getComputedStyle(el).overflowY === 'hidden'
        }));
        const modalScrollEl = topModal ? topModal.querySelector('.modal-scroll-area') : null;
        const modalRect = topModal ? topModal.getBoundingClientRect() : null;
        const modalScrollRect = modalScrollEl ? modalScrollEl.getBoundingClientRect() : null;
        return {
            hasModal: Boolean(topModal),
            modalCount: modals.length,
            modalZ: modals.map((m) => Number(getComputedStyle(m).zIndex || 0)),
            winY: window.scrollY,
            vw: window.innerWidth,
            vh: window.innerHeight,
            bgScrollBefore,
            modalRect: modalRect ? { left: modalRect.left, top: modalRect.top, width: modalRect.width, height: modalRect.height } : null,
            modalScrollRect: modalScrollRect ? {
                left: modalScrollRect.left,
                top: modalScrollRect.top,
                width: modalScrollRect.width,
                height: modalScrollRect.height,
                scrollTop: modalScrollEl.scrollTop,
                scrollHeight: modalScrollEl.scrollHeight,
                clientHeight: modalScrollEl.clientHeight
            } : null
        };
    })()`);

    if (expectModal) {
        assert.ok(stateBefore.hasModal, `[${label}] Expected an open portal modal [data-modal-root="true"]`);
    }

    // Check 1 & 2: Physical Wheel + Touch Bleed test when modal is open
    if (testScrollBleed && stateBefore.hasModal) {
        // Every background scroll container must be inert/locked
        for (const c of stateBefore.bgScrollBefore) {
            assert.ok(c.inert || c.locked, `[${label}] Background scroll container #${c.idx} must have inert/bg-scroll-locked while modal open`);
        }

        // Dispatch real CDP mouseWheel over backdrop corner (12, 12)
        await session.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: 12,
            y: 12,
            deltaX: 0,
            deltaY: 260
        });
        await sleep(90);

        // Dispatch real CDP mouseWheel inside modal scroll area center
        const targetRect = stateBefore.modalScrollRect || stateBefore.modalRect;
        if (targetRect && targetRect.width > 10 && targetRect.height > 10) {
            await session.send('Input.dispatchMouseEvent', {
                type: 'mouseWheel',
                x: Math.round(targetRect.left + targetRect.width / 2),
                y: Math.round(targetRect.top + Math.min(targetRect.height / 2, 160)),
                deltaX: 0,
                deltaY: 220
            });
            await sleep(90);
        }

        // Also dispatch synthetic document-level wheel + touchmove over modal root
        const afterBleed = await session.evaluate(`(() => {
            const modals = Array.from(document.querySelectorAll('[data-modal-root="true"]'))
                .sort((a, b) => Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0));
            const topModal = modals[0];
            if (topModal) {
                topModal.dispatchEvent(new WheelEvent('wheel', { deltaY: 240, bubbles: true, cancelable: true }));
            }
            const bgContainers = Array.from(document.querySelectorAll('#app main, #app [data-scroll-container], #app .overflow-y-auto'))
                .filter((el) => !el.closest('[data-modal-root="true"]'));
            const modalScrollEl = topModal ? topModal.querySelector('.modal-scroll-area') : null;
            return {
                winY: window.scrollY,
                bgScrollAfter: bgContainers.map((el) => el.scrollTop),
                modalScrollTopAfter: modalScrollEl ? modalScrollEl.scrollTop : 0
            };
        })()`);

        assert.ok(
            Math.abs(afterBleed.winY - stateBefore.winY) <= 1,
            `[${label}] CHECK-1 FAIL: Window scroll bled (${stateBefore.winY} -> ${afterBleed.winY})`
        );
        for (let i = 0; i < stateBefore.bgScrollBefore.length; i++) {
            const beforeTop = stateBefore.bgScrollBefore[i].scrollTop;
            const afterTop = afterBleed.bgScrollAfter[i] ?? beforeTop;
            assert.ok(
                Math.abs(afterTop - beforeTop) <= 1,
                `[${label}] CHECK-1 FAIL: Background container #${i} scrolled during open modal (${beforeTop} -> ${afterTop})`
            );
        }

        // Check 2: If inner modal content genuinely overflows, wheel should scroll it cleanly!
        if (stateBefore.modalScrollRect && stateBefore.modalScrollRect.scrollHeight > stateBefore.modalScrollRect.clientHeight + 8) {
            assert.ok(
                afterBleed.modalScrollTopAfter > stateBefore.modalScrollRect.scrollTop,
                `[${label}] CHECK-2 FAIL: Inner .modal-scroll-area failed to scroll when overflowing (scrollHeight=${stateBefore.modalScrollRect.scrollHeight}, clientHeight=${stateBefore.modalScrollRect.clientHeight}, after=${afterBleed.modalScrollTopAfter})`
            );
            await session.evaluate(`(() => {
                const top = Array.from(document.querySelectorAll('[data-modal-root="true"]'))
                    .sort((a, b) => Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0))[0];
                const sc = top?.querySelector('.modal-scroll-area');
                if (sc) sc.scrollTop = 0;
            })()`);
        }
    }

    // Checks 3, 4, 5: Geometry Overlap, Horizontal Overflow, Control Height, FormRow Containment & Zero Jargon
    const audit = await session.evaluate(`(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
            const r = el.getBoundingClientRect();
            return r.width >= 1 && r.height >= 1;
        };
        const modals = Array.from(document.querySelectorAll('[data-modal-root="true"]'))
            .filter(isVisible)
            .sort((a, b) => Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0));
        const topModal = modals[0] || null;
        const activeScope = topModal || (document.getElementById('app') || document.body);

        // Nested modal z-index strict monotonicity
        const zOrder = modals.map((m) => Number(getComputedStyle(m).zIndex || 0));
        let zMonotonicOk = true;
        for (let i = 1; i < zOrder.length; i++) {
            if (zOrder[i - 1] <= zOrder[i]) zMonotonicOk = false;
        }

        // Header / Bottom Nav / Toast vs Top Modal z-index hierarchy
        const toastEl = document.querySelector('[data-toast-root="true"]');
        let toastCheck = { present: false, zOk: true, inViewport: true, text: '' };
        if (toastEl && isVisible(toastEl)) {
            const tr = toastEl.getBoundingClientRect();
            const tz = Number(getComputedStyle(toastEl).zIndex || 0);
            const maxModalZ = zOrder[0] || 0;
            toastCheck = {
                present: true,
                zOk: tz >= 130 && tz > maxModalZ,
                inViewport: tr.top >= -1 && tr.left >= -1 && tr.right <= window.innerWidth + 1,
                text: (toastEl.innerText || '').trim()
            };
        }

        // Zero horizontal overflow
        const overflowPx = Math.round(document.documentElement.scrollWidth - window.innerWidth);

        // Compute clipped visible rect within all scroll/overflow-clipped ancestors (what actually renders & receives clicks)
        const getVisibleRect = (el) => {
            const raw = el.getBoundingClientRect();
            let left = raw.left;
            let top = raw.top;
            let right = raw.right;
            let bottom = raw.bottom;
            let p = el.parentElement;
            while (p && p !== document.body && p !== document.documentElement) {
                const pcs = getComputedStyle(p);
                const ovY = pcs.overflowY;
                const ovX = pcs.overflowX;
                if (ovY === 'auto' || ovY === 'scroll' || ovY === 'hidden') {
                    const pr = p.getBoundingClientRect();
                    top = Math.max(top, pr.top);
                    bottom = Math.min(bottom, pr.bottom);
                }
                if (ovX === 'auto' || ovX === 'scroll' || ovX === 'hidden') {
                    const pr = p.getBoundingClientRect();
                    left = Math.max(left, pr.left);
                    right = Math.min(right, pr.right);
                }
                p = p.parentElement;
            }
            return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top), raw };
        };

        // Bounding-Box overlap between visibly rendered interactive elements
        const controls = Array.from(activeScope.querySelectorAll('button, input:not([type="file"]):not([type="hidden"]), select, textarea, a[href]'))
            .filter(isVisible);
        const overlaps = [];
        for (let i = 0; i < controls.length; i++) {
            const a = controls[i];
            const ra = getVisibleRect(a);
            if (ra.width < 2 || ra.height < 2) continue;
            for (let j = i + 1; j < controls.length; j++) {
                const b = controls[j];
                if (a.contains(b) || b.contains(a)) continue;
                const rb = getVisibleRect(b);
                if (rb.width < 2 || rb.height < 2) continue;
                const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
                const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
                if (ix > 4 && iy > 4) {
                    overlaps.push({
                        a: (a.innerText || a.getAttribute('aria-label') || a.tagName).trim().slice(0, 35),
                        b: (b.innerText || b.getAttribute('aria-label') || b.tagName).trim().slice(0, 35),
                        ix: Math.round(ix),
                        iy: Math.round(iy)
                    });
                }
            }
        }

        // Control sizing (>=42px action buttons except tiny calendar day cells / icon badges) & input containment
        const undersizedButtons = [];
        const clippedInputs = [];
        for (const el of controls) {
            const r = el.getBoundingClientRect();
            // Skip sr-only or 7-column compact square day cell grid cells if any
            if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
                const inCalendarGrid = Boolean(el.closest('.grid-cols-7'));
                if (!inCalendarGrid && r.height < 41.5) {
                    undersizedButtons.push({
                        text: (el.innerText || el.getAttribute('aria-label') || el.className).toString().trim().slice(0, 45),
                        h: Math.round(r.height),
                        w: Math.round(r.width)
                    });
                }
            }
            if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
                const container = el.closest('[data-modal-root="true"] > div, .space-y-4, .space-y-3, form, section, main') || document.body;
                const cr = container.getBoundingClientRect();
                if (r.right > cr.right + 4 || r.right > window.innerWidth + 2) {
                    clippedInputs.push({
                        placeholder: el.getAttribute('placeholder') || el.tagName,
                        right: Math.round(r.right),
                        containerRight: Math.round(cr.right),
                        vw: window.innerWidth
                    });
                }
            }
        }

        // Check 5: Zero Jargon
        const bodyText = (document.body.innerText || '').trim();
        const jargonMatch = bodyText.match(/\\b(WORK_HOURS|FULL_DAY|MORNING|AFTERNOON|TiDB|undefined|null|NaN|Sổ lỗi P1|TypeError|ReferenceError|attendance_edit|payroll_approve)\\b|\\[object Object\\]/);

        return {
            overflowPx,
            zMonotonicOk,
            zOrder,
            toastCheck,
            overlaps,
            undersizedButtons,
            clippedInputs,
            jargonFound: jargonMatch ? jargonMatch[0] : null
        };
    })()`);

    assert.ok(audit.zMonotonicOk, `[${label}] CHECK-3 FAIL: Nested modal z-index must strictly increase: ${JSON.stringify(audit.zOrder)}`);
    assert.ok(audit.toastCheck.zOk && audit.toastCheck.inViewport, `[${label}] CHECK-5 FAIL: Toast hierarchy/bounds invalid: ${JSON.stringify(audit.toastCheck)}`);
    assert.equal(audit.overlaps.length, 0, `[${label}] CHECK-3 FAIL: Overlapping controls detected: ${JSON.stringify(audit.overlaps)}`);
    assert.ok(audit.overflowPx <= 1, `[${label}] CHECK-4 FAIL: Horizontal overflow ${audit.overflowPx}px detected`);
    assert.equal(audit.clippedInputs.length, 0, `[${label}] CHECK-4 FAIL: Clipped inputs detected: ${JSON.stringify(audit.clippedInputs)}`);
    assert.equal(audit.undersizedButtons.length, 0, `[${label}] CHECK-4 FAIL: Buttons below min touch height: ${JSON.stringify(audit.undersizedButtons)}`);
    assert.equal(audit.jargonFound, null, `[${label}] CHECK-5 FAIL: Jargon/invalid token detected in DOM: ${audit.jargonFound}`);

    return audit;
}

async function dismissModalIfOpen(session) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const hasModal = await session.evaluate(`(() => {
            const ms = Array.from(document.querySelectorAll('[data-modal-root="true"]')).filter((e) => getComputedStyle(e).display !== 'none');
            return ms.length > 0;
        })()`);
        if (!hasModal) return;
        const closed = await session.evaluate(`(() => {
            const ms = Array.from(document.querySelectorAll('[data-modal-root="true"]'))
                .filter((e) => getComputedStyle(e).display !== 'none')
                .sort((a, b) => Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0));
            const top = ms[0];
            if (!top) return false;
            const btn = top.querySelector('button[aria-label="Đóng"]')
                || Array.from(top.querySelectorAll('button')).find((b) => /^(Trở về|Đóng \\/ Quay lại|Đóng|Hủy bỏ|Hủy|Để sau)$/.test((b.innerText || '').trim()));
            if (btn) { btn.click(); return true; }
            return false;
        })()`);
        if (!closed) break;
        await sleep(260);
    }
}

async function dismissToastIfVisible(session) {
    await session.evaluate(`(() => {
        const btn = document.querySelector('[data-toast-root="true"] button[aria-label="Đóng thông báo"]');
        if (btn) btn.click();
    })()`);
    await sleep(140);
}

async function loginThroughAuthView(session, maNv, password) {
    await waitForCondition(
        session,
        `Boolean(document.querySelector('input[placeholder*="Nhập Mã NV"]'))`,
        8000,
        `AuthView login form visible for ${maNv}`
    );
    await setReactInputValue(session, { selector: 'input[placeholder*="Nhập Mã NV"]', value: maNv, inTopModal: false });
    await setReactInputValue(session, { selector: 'input[type="password"], input[placeholder*="mật khẩu"]', value: password, inTopModal: false });
    await clickInPage(session, { selector: 'button[type="submit"]', inTopModal: false });
    await waitForCondition(
        session,
        `!document.querySelector('input[placeholder*="Nhập Mã NV"]')`,
        10000,
        `Dashboard loaded after login for ${maNv}`
    );
    await waitForNoBlockingLoading(session);
}

async function logoutViaConfirmDialog(session, buttonText = 'Đăng xuất') {
    await dismissModalIfOpen(session);
    await dismissToastIfVisible(session);
    await clickInPage(session, { text: buttonText, inTopModal: false });
    await waitForCondition(
        session,
        `Boolean(document.querySelector('[data-modal-root="true"]'))`,
        5000,
        'ConfirmDialog portal opened on logout'
    );
    await inspectPhysicsAndGeometry(session, `Logout ConfirmDialog (${buttonText})`, { expectModal: true });
    await clickInPage(session, { text: 'Đăng xuất', inTopModal: true });
    await waitForCondition(
        session,
        `Boolean(document.querySelector('input[placeholder*="Nhập Mã NV"]'))`,
        8000,
        'Returned to AuthView after logout confirm'
    );
}

test('UI-03: V15 Real-DB 3-Role Full Click-Every-Button & 5-Check Scroll Physics Matrix (CDP Zero-Mock)', async () => {
    assert.ok(fs.existsSync(path.join(WWW_DIR, 'index.html')), 'Built frontend www/index.html must exist before UI CDP test');

    let srv = null;
    let session = null;
    let settingsSnap = null;
    let coreUsersBefore = [];
    let adminBefore = [];
    const maxIds = {};

    // Create 1x1 temporary PNG file for Field Work photo check-in
    const tmpPhotoPath = path.join(os.tmpdir(), `sedinco-v15-field-${Date.now()}.png`);
    fs.writeFileSync(
        tmpPhotoPath,
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64')
    );

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const pad2 = (n) => String(n).padStart(2, '0');
    const ymPrefix = `${curYear}-${pad2(curMonth)}`;
    const day2Str = `${ymPrefix}-02`;
    const day3Str = `${ymPrefix}-03`;
    const leaveDateStr = `${ymPrefix}-25`;
    const otDateStr = `${ymPrefix}-26`;

    const consoleErrors = [];
    const pageErrors = [];
    const server5xx = [];
    let allowExpected4xx = false;
    const unexpected4xx = [];

    try {
        srv = await startUnifiedRealServer();
        session = await launchHeadlessBrave();

        // Purge any orphaned benchmark/smoke fixtures from prior runs so Desktop lists stay clean
        await query("DELETE FROM employees WHERE ma_nv NOT IN ('NV001','NV002','NV003')").catch(() => {});
        await query("DELETE FROM admins WHERE username <> 'admin'").catch(() => {});
        await query("DELETE FROM attendance_logs WHERE employee_id NOT IN ('NV001','NV002','NV003')").catch(() => {});
        await query("DELETE FROM attendance WHERE ma_nv NOT IN ('NV001','NV002','NV003')").catch(() => {});
        await query("DELETE FROM requests WHERE employee_id NOT IN ('NV001','NV002','NV003')").catch(() => {});
        await query("DELETE FROM ot_registrations WHERE employee_id NOT IN ('NV001','NV002','NV003')").catch(() => {});

        // Snapshot DB baseline & max IDs so all UI test mutations are 100% restored in finally
        settingsSnap = await snapshotSettings();
        coreUsersBefore = await query(
            "SELECT ma_nv, ho_ten, chuc_danh, role, status, is_locked, password, must_change_password, bound_device_id, pending_device_id, device_change_reason, token_version FROM employees WHERE ma_nv IN ('NV001','NV002','NV003')"
        );
        adminBefore = await query('SELECT username, password, must_change_password, token_version FROM admins WHERE username = "admin"');
        for (const tbl of ['attendance_logs', 'requests', 'ot_registrations', 'payroll_periods', 'period_locks', 'public_holidays', 'audit_logs']) {
            const [r] = await query(`SELECT COALESCE(MAX(id), 0) as m FROM ${tbl}`);
            maxIds[tbl] = Number(r?.m || 0);
        }

        // Prepare predictable real DB state for core accounts & current month logs
        const pw123456 = bcrypt.hashSync('123456', 10);
        await query(
            "UPDATE employees SET password = ?, must_change_password = 0, is_locked = 0, status = 'active', bound_device_id = NULL, pending_device_id = NULL, device_change_reason = NULL WHERE ma_nv IN ('NV001','NV002','NV003')",
            [pw123456]
        );
        await query("UPDATE employees SET role = 'worker' WHERE ma_nv = 'NV003'");
        await query("UPDATE employees SET role = 'accountant' WHERE ma_nv = 'NV002'");
        await query('UPDATE admins SET password = ?, must_change_password = 0 WHERE username = "admin"', [pw123456]);
        await query("DELETE FROM login_rate_limits WHERE identifier IN ('NV001','NV002','NV003','admin') OR key_name LIKE '%127.0.0.1%'").catch(() => {});

        // Align company_settings geofence with CDP geolocation override
        await query(
            "UPDATE company_settings SET latitude = 16.0544, longitude = 108.2022, radius_meters = 200, work_start = '08:00', work_end = '17:00', lunch_start = '12:00', lunch_end = '13:00', allowed_locations = ?",
            [JSON.stringify([{ name: 'Trụ sở chính Đà Nẵng', lat: 16.0544, lng: 108.2022, radius: 200 }])]
        );

        // Clear any leftover NV003 current-month logs/requests/locks so Round 1-3 execute deterministically
        await query('DELETE FROM period_locks WHERE month = ? AND year = ?', [curMonth, curYear]);
        await query('DELETE FROM payroll_periods WHERE month = ? AND year = ?', [curMonth, curYear]);
        await query('DELETE FROM attendance_logs WHERE employee_id = "NV003" AND record_date IN (?, ?, CURDATE())', [day2Str, day3Str]);
        await query('DELETE FROM attendance WHERE ma_nv IN ("NV003", "NV002", "NV001") AND thang = ? AND nam = ?', [curMonth, curYear]);
        await query('DELETE FROM requests WHERE employee_id = "NV003" AND request_date IN (?, ?)', [day3Str, leaveDateStr]);
        await query('DELETE FROM ot_registrations WHERE employee_id = "NV003" AND work_date = ?', [otDateStr]);

        // Seed 1 normal day & 1 forgotten-checkout day for NV003 in current month
        await query(
            "INSERT INTO attendance_logs (employee_id, record_date, check_in_time, check_out_time, status, ot_hours) VALUES ('NV003', ?, '07:55:00', '17:05:00', '1', 0)",
            [day2Str]
        );
        await query(
            "INSERT INTO attendance_logs (employee_id, record_date, check_in_time, check_out_time, status, ot_hours) VALUES ('NV003', ?, '07:58:00', NULL, '0.5', 0)",
            [day3Str]
        );

        // Enable CDP domains & grant real Geolocation permissions (ZERO Fetch interception!)
        await session.send('Page.enable');
        await session.send('Runtime.enable');
        await session.send('Network.enable');
        await session.send('Browser.grantPermissions', {
            origin: srv.url,
            permissions: ['geolocation']
        });
        await session.send('Emulation.setGeolocationOverride', {
            latitude: 16.0544,
            longitude: 108.2022,
            accuracy: 15
        });

        session.on('Runtime.consoleAPICalled', (evt) => {
            if (evt.type === 'error') {
                const msg = (evt.args || []).map((a) => a.value || a.description || '').join(' ');
                if (!allowExpected4xx || !msg.includes('status of 4')) {
                    consoleErrors.push(msg);
                }
            }
        });
        session.on('Runtime.exceptionThrown', (evt) => {
            pageErrors.push(evt.exceptionDetails?.text || 'Uncaught exception');
        });
        session.on('Network.responseReceived', (evt) => {
            const st = evt.response?.status || 0;
            const u = evt.response?.url || '';
            const isExpectedZaloProbe = st === 401 && u.endsWith('/api/auth/zalo-auto-login');
            if (u.includes('/api/')) {
                if (st >= 500) server5xx.push(`${st} ${u}`);
                else if (st >= 400 && !allowExpected4xx && !isExpectedZaloProbe && !u.endsWith('/favicon.ico')) {
                    unexpected4xx.push(`${st} ${u}`);
                }
            }
        });

        // Set device viewport 360x780 & navigate to real unified origin
        await setViewportAndScale(session, 360, 780, 100);
        await session.send('Page.navigate', { url: srv.url });
        await waitForNoBlockingLoading(session);

        // -----------------------------------------------------------------
        // STEP 0: AUTH VIEW + 200% FONT SCALE + NEGATIVE PASSWORD ERROR
        // -----------------------------------------------------------------
        await inspectPhysicsAndGeometry(session, 'AuthView @ 360x780 (100%)', { expectModal: false, testScrollBleed: false });

        // Test 200% Elderly font scaling on AuthView
        await setViewportAndScale(session, 360, 780, 200);
        await inspectPhysicsAndGeometry(session, 'AuthView @ 360x780 (200% Elderly Scale)', { expectModal: false, testScrollBleed: false });
        await setViewportAndScale(session, 360, 780, 100);

        // Eye toggle & negative wrong-password feedback
        await clickInPage(session, { selector: 'button[aria-label*="mật khẩu"]', inTopModal: false });
        allowExpected4xx = true;
        await setReactInputValue(session, { selector: 'input[placeholder*="Nhập Mã NV"]', value: 'NV003', inTopModal: false });
        await setReactInputValue(session, { selector: 'input[placeholder*="mật khẩu"]', value: 'WrongPass999!', inTopModal: false });
        await clickInPage(session, { selector: 'button[type="submit"]', inTopModal: false });
        await sleep(500);
        await inspectPhysicsAndGeometry(session, 'AuthView Wrong Password Error', { expectModal: false, testScrollBleed: false });
        allowExpected4xx = false;
        await dismissToastIfVisible(session);

        // =================================================================
        // ROUND 1: WORKER (NV003 — Mobile 360x780)
        // =================================================================
        await loginThroughAuthView(session, 'NV003', '123456');
        await inspectPhysicsAndGeometry(session, 'Worker Tab 1: Chấm công', { expectModal: false, testScrollBleed: false });

        // 1A: Field Work Check-In Portal Modal + Real Photo + Check-In API
        await clickInPage(session, { text: 'Chấm công Đi Công Trình', inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Field Work AppModal opened');
        await inspectPhysicsAndGeometry(session, 'Worker Field Work Modal', { expectModal: true });
        await setReactInputValue(session, { selector: 'input[placeholder*="Hòa Xuân"]', value: 'Công trình Hòa Xuân V15', inTopModal: true });
        await uploadTempFileInModal(session, tmpPhotoPath);
        await clickInPage(session, { text: 'Xác nhận Công trình', inTopModal: true });
        await sleep(500);
        await waitForCondition(session, `!document.querySelector('[data-modal-root="true"]')`, 6000, 'Field Work modal closed after submit');

        // Also click primary check-in CTA (pre-permission modal if shown, or checkout flow)
        const prePermClicked = await session.evaluate(`(() => {
            const btn = document.getElementById('btn-start-checkin');
            if (!btn || btn.disabled) return false;
            btn.click();
            return true;
        })()`);
        if (prePermClicked) {
            await sleep(260);
            const hasPrePerm = await session.evaluate(`Boolean(document.querySelector('[data-modal-root="true"]'))`);
            if (hasPrePerm) {
                await inspectPhysicsAndGeometry(session, 'Worker GPS Pre-Permission Modal', { expectModal: true });
                await dismissModalIfOpen(session);
            }
        }
        await dismissToastIfVisible(session);

        // 1B: WorkerHistoryTab — click completed Day 2 & forgotten-checkout Day 3
        await clickInPage(session, { text: 'Lịch sử', inTopModal: false });
        await sleep(450);
        await inspectPhysicsAndGeometry(session, 'Worker Tab 2: Lịch sử', { expectModal: false, testScrollBleed: false });

        // Click Day 2 cell
        await clickInPage(session, { selector: '.grid-cols-7 button', text: '2', exact: true, inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Day 2 detail modal opened');
        await inspectPhysicsAndGeometry(session, 'Worker History Day 2 Modal', { expectModal: true });
        await dismissModalIfOpen(session);

        // Click Day 3 (forgotten checkout) & jump to compensation request modal
        await clickInPage(session, { selector: '.grid-cols-7 button', text: '3', exact: true, inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Day 3 detail modal opened');
        await inspectPhysicsAndGeometry(session, 'Worker History Day 3 Forgotten Modal', { expectModal: true });
        const jumped = await session.evaluate(`(() => {
            const btn = Array.from(document.querySelectorAll('[data-modal-root="true"] button')).find((b) => (b.innerText || '').includes('Gửi đơn bổ sung'));
            if (!btn) return false;
            btn.click();
            return true;
        })()`);
        if (jumped) {
            await sleep(320);
            await inspectPhysicsAndGeometry(session, 'SmartLeaveRequestModal from Day 3', { expectModal: true });
            await dismissModalIfOpen(session);
        } else {
            await dismissModalIfOpen(session);
        }

        // 1C: WorkerRequestsTab — Test OT empty validation + submit, Salary Advance, Leave + Cancel ConfirmDialog
        await clickInPage(session, { text: 'Đơn từ', inTopModal: false });
        await sleep(350);
        await inspectPhysicsAndGeometry(session, 'Worker Tab 3: Đơn từ', { expectModal: false, testScrollBleed: false });

        // OT Registration Modal: empty validation -> real submit
        await clickInPage(session, { text: 'Đăng ký Tăng ca', inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'OT modal opened');
        await inspectPhysicsAndGeometry(session, 'Worker OT Registration Modal', { expectModal: true });
        // Submit empty to verify custom inline warning (no native HTML block & no 500)
        await clickInPage(session, { selector: 'button[type="submit"]', inTopModal: true });
        await sleep(220);
        await inspectPhysicsAndGeometry(session, 'Worker OT Empty Validation Alert', { expectModal: true });
        await setReactInputValue(session, { selector: 'input[type="date"]', value: otDateStr, inTopModal: true });
        await clickInPage(session, { text: '2 giờ', exact: true, inTopModal: true });
        await setReactInputValue(session, { selector: 'textarea', value: 'Tăng ca hoàn thiện hạng mục V15', inTopModal: true });
        await clickInPage(session, { selector: 'button[type="submit"]', inTopModal: true });
        await waitForCondition(session, `!document.querySelector('[data-modal-root="true"]')`, 6000, 'OT modal closed after submit');
        await dismissToastIfVisible(session);

        // Salary Advance Modal: empty/0 validation -> 1.000.000 đ submit
        await clickInPage(session, { text: 'Xin Ứng lương', inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Salary Advance modal opened');
        await inspectPhysicsAndGeometry(session, 'Worker Salary Advance Modal', { expectModal: true });
        await clickInPage(session, { selector: 'button[type="submit"]', inTopModal: true });
        await sleep(200);
        await inspectPhysicsAndGeometry(session, 'Worker Salary Advance Empty Validation', { expectModal: true });
        await clickInPage(session, { text: '1.000.000 đ', inTopModal: true });
        await setReactInputValue(session, { selector: 'textarea', value: 'Ứng lương kiểm thử V15', inTopModal: true });
        await clickInPage(session, { selector: 'button[type="submit"]', inTopModal: true });
        await waitForCondition(session, `!document.querySelector('[data-modal-root="true"]')`, 6000, 'Salary Advance modal closed');
        await dismissToastIfVisible(session);

        // Leave Request Modal -> Submit -> Cancel via ConfirmDialog
        await clickInPage(session, { text: 'Nghỉ phép / Việc riêng', inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Leave modal opened');
        await setReactInputValue(session, { selector: 'input[type="date"]', value: leaveDateStr, inTopModal: true });
        await setReactInputValue(session, { selector: 'textarea', value: 'Nghỉ phép kiểm thử V15', inTopModal: true });
        await clickInPage(session, { selector: 'button[type="submit"]', inTopModal: true });
        await waitForCondition(session, `!document.querySelector('[data-modal-root="true"]')`, 6000, 'Leave modal closed');
        await dismissToastIfVisible(session);

        // Click "Hủy đơn" on the pending leave card -> ConfirmDialog
        await waitForCondition(
            session,
            `Array.from(document.querySelectorAll('button')).some((b) => (b.innerText || '').includes('Hủy đơn'))`,
            5000,
            'Cancel button visible on pending request'
        );
        await clickInPage(session, { text: 'Hủy đơn', inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Cancel ConfirmDialog opened');
        await inspectPhysicsAndGeometry(session, 'Worker Request Cancel ConfirmDialog', { expectModal: true });
        await clickInPage(session, { text: 'Xác nhận hủy', inTopModal: true });
        await sleep(450);
        await dismissToastIfVisible(session);

        // 1D: WorkerProfileTab — SalarySlipModal + Dispute, Device Change, Change Password Modal, Logout
        await clickInPage(session, { text: 'Tài khoản', inTopModal: false });
        await sleep(350);
        await inspectPhysicsAndGeometry(session, 'Worker Tab 4: Tài khoản', { expectModal: false, testScrollBleed: false });

        // Open SalarySlipModal & submit a salary dispute so Accountant/Admin see it!
        await clickInPage(session, { text: 'Xem phiếu lương tháng', inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 5000, 'Worker SalarySlipModal opened');
        await inspectPhysicsAndGeometry(session, 'Worker SalarySlipModal', { expectModal: true });
        const hasDisputeBtn = await session.evaluate(`Array.from(document.querySelectorAll('[data-modal-root="true"] button')).some((b) => (b.innerText || '').includes('Báo Cáo Sai Lương'))`);
        if (hasDisputeBtn) {
            await clickInPage(session, { text: 'Báo Cáo Sai Lương', inTopModal: true });
            await sleep(220);
            await inspectPhysicsAndGeometry(session, 'Worker SalarySlip Dispute Form', { expectModal: true });
            await setReactInputValue(session, { selector: 'textarea', value: 'Kiểm thử báo cáo sai lương V15', inTopModal: true });
            await clickInPage(session, { text: 'Gửi Báo Cáo Tới Kế Toán & Admin', inTopModal: true });
            await sleep(450);
        }
        await dismissModalIfOpen(session);
        await dismissToastIfVisible(session);

        // Open Device Change Request modal & submit
        await clickInPage(session, { text: 'Yêu cầu đổi thiết bị', inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Device Change modal opened');
        await inspectPhysicsAndGeometry(session, 'Worker Device Change Modal', { expectModal: true });
        await setReactInputValue(session, { selector: 'textarea', value: 'Đổi sang điện thoại kiểm thử V15', inTopModal: true });
        await clickInPage(session, { text: 'Gửi yêu cầu đổi thiết bị', inTopModal: true }).catch(async () => {
            await clickInPage(session, { selector: 'button[type="submit"]', inTopModal: true });
        });
        await sleep(450);
        await dismissModalIfOpen(session);
        await dismissToastIfVisible(session);

        // Open Password Change modal (inspect geometry + close cleanly without mutating token_version mid-flow)
        await clickInPage(session, { text: 'Đổi mật khẩu', inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Password Change modal opened');
        await inspectPhysicsAndGeometry(session, 'Worker ForcePasswordChangeModal', { expectModal: true });
        await dismissModalIfOpen(session);

        // Worker Logout via ConfirmDialog
        await logoutViaConfirmDialog(session, 'Đăng xuất khỏi thiết bị');

        // =================================================================
        // ROUND 2: ACCOUNTANT (NV002 — Mobile 390x844)
        // =================================================================
        await setViewportAndScale(session, 390, 844, 100);
        await loginThroughAuthView(session, 'NV002', '123456');
        await inspectPhysicsAndGeometry(session, 'Accountant Dashboard Initial', { expectModal: false, testScrollBleed: false });

        // 2A: Headcount LiveAttendanceBoardModal + Nested Proxy Check-in Child Modal (z100 -> z110)
        await clickInPage(session, { text: 'Quân số:', inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 5000, 'LiveAttendanceBoardModal opened');
        await inspectPhysicsAndGeometry(session, 'Accountant LiveAttendanceBoardModal', { expectModal: true });
        for (const filterTab of ['Đi muộn', 'Công trình', 'Nghỉ phép', 'Tổng nhân sự']) {
            await session.evaluate(`(() => {
                const top = document.querySelector('[data-modal-root="true"]');
                const b = top ? Array.from(top.querySelectorAll('button')).find((x) => (x.innerText || '').includes(${JSON.stringify(filterTab)})) : null;
                if (b) b.click();
            })()`);
            await sleep(160);
        }
        // Open nested Child Proxy Check-in modal
        await clickInPage(session, { text: 'Chấm công hộ', inTopModal: true });
        await waitForCondition(session, `document.querySelectorAll('[data-modal-root="true"]').length >= 2`, 4000, 'Nested Proxy Check-in modal stacked above LiveAttendanceBoardModal');
        await inspectPhysicsAndGeometry(session, 'Accountant Nested Proxy Modal (Stack 2)', { expectModal: true });
        // Verify backdrop modal behind child is marked inert
        const parentInertOk = await session.evaluate(`(() => {
            const ms = Array.from(document.querySelectorAll('[data-modal-root="true"]'))
                .sort((a, b) => Number(getComputedStyle(a).zIndex || 0) - Number(getComputedStyle(b).zIndex || 0));
            return ms.length >= 2 && Number(getComputedStyle(ms[1]).zIndex) > Number(getComputedStyle(ms[0]).zIndex);
        })()`);
        assert.ok(parentInertOk, 'Nested Proxy modal z-index must exceed parent LiveAttendanceBoardModal z-index');
        await dismissModalIfOpen(session);

        // 2B: DesktopHeader Bell Alert AppModal
        await clickInPage(session, { selector: 'button[aria-label="Trung tâm cảnh báo và thông báo"]', inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Header Alert modal opened');
        await inspectPhysicsAndGeometry(session, 'Accountant Header Alert Modal', { expectModal: true });
        await dismissModalIfOpen(session);

        // Helper to navigate Desktop tabs via Hamburger Portal Drawer
        async function openDesktopTabViaDrawer(tabId, roleLabel) {
            await dismissModalIfOpen(session);
            await clickInPage(session, { selector: 'button[aria-label="Mở danh mục quản trị"]', inTopModal: false });
            await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, `Hamburger Drawer opened (${roleLabel} -> ${tabId})`);
            await inspectPhysicsAndGeometry(session, `${roleLabel} Portal Drawer`, { expectModal: true });
            await clickInPage(session, { selector: `button[data-tab="${tabId}"]`, inTopModal: true });
            await waitForCondition(session, `!document.querySelector('[data-modal-root="true"]')`, 4000, 'Drawer closed after selecting tab');
            await waitForNoBlockingLoading(session);
        }

        // 2C: Attendance Matrix — toggle card/table view, click NV003 -> nested Edit Cell modal (z100 -> z110), inspect PeriodLockModal
        await inspectPhysicsAndGeometry(session, 'Accountant Tab: matrix', { expectModal: false, testScrollBleed: false });
        // Open NV003 31-day card/row detail if in mobile card mode
        const openedEmpMatrix = await session.evaluate(`(() => {
            const btn = Array.from(document.querySelectorAll('#app button')).find((b) => (b.innerText || '').includes('NV003') && (b.innerText || '').includes('Lê Văn Cường'));
            if (btn) { btn.click(); return true; }
            return false;
        })()`);
        if (openedEmpMatrix) {
            await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'NV003 31-day drawer/modal opened');
            await inspectPhysicsAndGeometry(session, 'Accountant NV003 31-day Modal', { expectModal: true });
            // Click Day 10 inside 31-day modal to trigger nested Edit Cell modal
            const clickedDay10 = await session.evaluate(`(() => {
                const top = Array.from(document.querySelectorAll('[data-modal-root="true"]'))
                    .sort((a, b) => Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0))[0];
                if (!top) return false;
                const btns = Array.from(top.querySelectorAll('button'));
                const d10 = btns.find((b) => /(^|\\n)10(\\n|$)/.test((b.innerText || '').trim()));
                if (d10) { d10.click(); return true; }
                return false;
            })()`);
            if (clickedDay10) {
                await waitForCondition(session, `document.querySelectorAll('[data-modal-root="true"]').length >= 2`, 4000, 'Nested Sửa công modal stacked');
                await inspectPhysicsAndGeometry(session, 'Accountant Nested Sửa Công Modal (Stack 2)', { expectModal: true });
                await clickInPage(session, { text: 'Đủ công (1)', inTopModal: true }).catch(() => {});
                await setReactInputValue(session, { selector: 'textarea', value: 'Kiểm thử sửa công V15', inTopModal: true }).catch(() => {});
                await clickInPage(session, { text: 'Lưu thay đổi', inTopModal: true }).catch(() => {});
                await sleep(350);
            }
            await dismissModalIfOpen(session);
        }

        // Toggle "Dạng thẻ" / "Bảng lưới" & inspect "Chốt kỳ công" modal
        await session.evaluate(`(() => {
            const b = Array.from(document.querySelectorAll('#app button')).find((x) => (x.innerText || '').includes('Bảng lưới') || (x.innerText || '').includes('Dạng thẻ'));
            if (b) b.click();
        })()`);
        await sleep(240);
        await inspectPhysicsAndGeometry(session, 'Accountant Matrix Alternate View', { expectModal: false, testScrollBleed: false });

        const hasPeriodBtn = await session.evaluate(`Array.from(document.querySelectorAll('#app button')).some((b) => (b.innerText || '').includes('Chốt kỳ công'))`);
        if (hasPeriodBtn) {
            await clickInPage(session, { text: 'Chốt kỳ công', inTopModal: false });
            await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'PeriodLockModal opened');
            await inspectPhysicsAndGeometry(session, 'Accountant PeriodLockModal', { expectModal: true });
            await dismissModalIfOpen(session);
        }

        // 2D: Requests Management — Approve NV003 pending OT registration via ConfirmDialog
        await openDesktopTabViaDrawer('requests', 'Accountant');
        await inspectPhysicsAndGeometry(session, 'Accountant Tab: requests', { expectModal: false, testScrollBleed: false });
        const hasApproveBtn = await session.evaluate(`Array.from(document.querySelectorAll('#app button')).some((b) => (b.innerText || '').trim() === 'Phê duyệt')`);
        if (hasApproveBtn) {
            await clickInPage(session, { text: 'Phê duyệt', exact: true, inTopModal: false });
            await sleep(350);
            await dismissToastIfVisible(session);
        }

        // 2E: Payroll Tab — Calculate, Adjust modal (FormRow), Dispute Slip view, Snapshot
        await openDesktopTabViaDrawer('payroll', 'Accountant');
        await inspectPhysicsAndGeometry(session, 'Accountant Tab: payroll', { expectModal: false, testScrollBleed: false });
        const hasCalcBtn = await session.evaluate(`(() => {
            const isVis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
            return Array.from(document.querySelectorAll('#app button')).some((b) => isVis(b) && (b.innerText || '').includes('Tính lương'));
        })()`);
        if (hasCalcBtn) {
            await clickInPage(session, { text: 'Tính lương', inTopModal: false });
            await sleep(500);
            await dismissToastIfVisible(session);
        }
        const adjBtnText = await session.evaluate(`(() => {
            const isVis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
            const found = Array.from(document.querySelectorAll('#app button')).find((b) => isVis(b) && ['Thưởng / Phạt / Ứng', 'Điều chỉnh'].includes((b.innerText || '').trim()));
            return found ? (found.innerText || '').trim() : null;
        })()`);
        if (adjBtnText) {
            await clickInPage(session, { text: adjBtnText, exact: true, inTopModal: false });
            await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Payroll Adjust modal opened');
            await inspectPhysicsAndGeometry(session, 'Accountant Payroll Adjust Modal', { expectModal: true });
            await clickInPage(session, { text: 'Lưu điều chỉnh', inTopModal: true });
            await sleep(350);
            await dismissModalIfOpen(session);
            await dismissToastIfVisible(session);
        }
        const slipBtnClicked = await session.evaluate(`(() => {
            const isVis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
            const b = Array.from(document.querySelectorAll('#app button')).find((x) => isVis(x) && ((x.innerText || '').includes('khiếu nại') || (x.innerText || '').includes('Khiếu nại') || (x.innerText || '').trim() === 'Chi tiết'));
            if (b) { b.click(); return true; }
            return false;
        })()`);
        if (slipBtnClicked) {
            await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'SalarySlipModal opened from PayrollGrid');
            await inspectPhysicsAndGeometry(session, 'Accountant SalarySlipModal Inspect', { expectModal: true });
            await dismissModalIfOpen(session);
        }

        // 2F: Management Tab (Accountant views roster — Device Approval sub-tab strictly restricted to Admin)
        await openDesktopTabViaDrawer('management', 'Accountant');
        await inspectPhysicsAndGeometry(session, 'Accountant Tab: management', { expectModal: false, testScrollBleed: false });
        const accHasDeviceSubtab = await session.evaluate(`Array.from(document.querySelectorAll('#app button')).some((b) => (b.innerText || '').includes('Đổi thiết bị'))`);
        assert.equal(accHasDeviceSubtab, false, 'RBAC: Accountant must NOT see Admin-only Đổi thiết bị approval sub-tab');
        const hasEmpDetail = await session.evaluate(`(() => {
            const isVis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
            return Array.from(document.querySelectorAll('#app button')).some((b) => isVis(b) && ((b.innerText || '').includes('Thông tin / Sửa') || (b.innerText || '').includes('Xem hồ sơ')));
        })()`);
        if (hasEmpDetail) {
            await session.evaluate(`(() => {
                const isVis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
                const b = Array.from(document.querySelectorAll('#app button')).find((x) => isVis(x) && ((x.innerText || '').includes('Thông tin / Sửa') || (x.innerText || '').includes('Xem hồ sơ')));
                if (b) b.click();
            })()`);
            await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Employee detail modal opened');
            await inspectPhysicsAndGeometry(session, 'Accountant Employee Detail Modal', { expectModal: true });
            await dismissModalIfOpen(session);
        }

        // Accountant Logout via Header
        await logoutViaConfirmDialog(session, 'Đăng xuất');

        // =================================================================
        // ROUND 3: ADMIN (admin — Mobile 360x780 & 200% Settings Check)
        // =================================================================
        await setViewportAndScale(session, 360, 780, 100);
        await loginThroughAuthView(session, 'admin', '123456');
        await inspectPhysicsAndGeometry(session, 'Admin Dashboard Initial', { expectModal: false, testScrollBleed: false });

        // 3A: Employee Management — Add NV_UI_TEMP, Open Custom Shift Modal, Approve Device
        await openDesktopTabViaDrawer('management', 'Admin');
        await clickInPage(session, { text: 'Thêm nhân viên', inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Add Employee modal opened');
        await inspectPhysicsAndGeometry(session, 'Admin Add Employee Modal', { expectModal: true });
        await setReactInputValue(session, { selector: 'input[placeholder*="VD: NV"]', value: 'NV_UI_TEMP', inTopModal: true });
        await setReactInputValue(session, { selector: 'input[placeholder="Nguyễn Văn A"]', value: 'Nhân Viên Kiểm Thử V15', inTopModal: true });
        await setReactInputValue(session, { selector: 'input[placeholder*="Kỹ thuật"]', value: 'Công nhân kiểm thử', inTopModal: true });
        await clickInPage(session, { text: 'Lưu nhân viên', inTopModal: true });
        await waitForCondition(
            session,
            `(document.body.innerText || '').includes('Tài khoản mới tạo') || !document.querySelector('[data-modal-root="true"]')`,
            6000,
            'Add Employee modal transitioned to created credentials or closed'
        );
        const hasCredsModal = await session.evaluate(`Boolean(document.querySelector('[data-modal-root="true"]'))`);
        if (hasCredsModal) {
            await inspectPhysicsAndGeometry(session, 'Admin Created Employee Credentials Modal', { expectModal: true });
            await dismissModalIfOpen(session);
        }
        await dismissToastIfVisible(session);

        // Open Custom Shift Modal ("Giờ riêng" mobile / "Giờ làm việc riêng" desktop)
        const shiftClicked = await session.evaluate(`(() => {
            const isVis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
            const b = Array.from(document.querySelectorAll('#app button')).find((x) => isVis(x) && ((x.innerText || '').includes('Giờ riêng') || (x.innerText || '').includes('Giờ làm việc') || x.getAttribute('title') === 'Giờ làm việc riêng'));
            if (b) { b.click(); return true; }
            return false;
        })()`);
        if (shiftClicked) {
            await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Custom Shift modal opened');
            await inspectPhysicsAndGeometry(session, 'Admin Custom Shift Modal', { expectModal: true });
            await dismissModalIfOpen(session);
        }

        // Approve pending NV003 device change request
        await clickInPage(session, { text: 'Đổi thiết bị', inTopModal: false });
        await sleep(300);
        await inspectPhysicsAndGeometry(session, 'Admin Sub-tab: Đổi thiết bị', { expectModal: false, testScrollBleed: false });
        const hasDeviceApprove = await session.evaluate(`(() => {
            const isVis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
            return Array.from(document.querySelectorAll('#app button')).some((b) => isVis(b) && (b.innerText || '').trim() === 'Phê duyệt');
        })()`);
        if (hasDeviceApprove) {
            await clickInPage(session, { text: 'Phê duyệt', exact: true, inTopModal: false });
            await sleep(350);
            await dismissToastIfVisible(session);
        }

        // 3B: Accountant Permissions Tab — semantic <button role="switch">
        await openDesktopTabViaDrawer('permissions', 'Admin');
        await inspectPhysicsAndGeometry(session, 'Admin Tab: permissions', { expectModal: false, testScrollBleed: false });
        await clickInPage(session, { selector: 'button[role="switch"]', inTopModal: false });
        await sleep(260);
        await clickInPage(session, { selector: 'button[role="switch"]', inTopModal: false });
        await sleep(260);

        // 3C: Payroll Admin Flow — Inspect "Trả lại Kế toán" modal, then Approve ("Chốt & Phát hành") & Pay ("Xác nhận Đã Chi Trả Lương")
        await openDesktopTabViaDrawer('payroll', 'Admin');
        await inspectPhysicsAndGeometry(session, 'Admin Tab: payroll', { expectModal: false, testScrollBleed: false });
        const hasReturnBtn = await session.evaluate(`(() => {
            const isVis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
            return Array.from(document.querySelectorAll('#app button')).some((b) => isVis(b) && (b.innerText || '').includes('Trả lại Kế toán'));
        })()`);
        if (hasReturnBtn) {
            await clickInPage(session, { text: 'Trả lại Kế toán', inTopModal: false });
            await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Return Payroll modal opened');
            await inspectPhysicsAndGeometry(session, 'Admin Return Payroll Modal', { expectModal: true });
            await dismissModalIfOpen(session);
        }
        const hasPublishBtn = await session.evaluate(`(() => {
            const isVis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
            return Array.from(document.querySelectorAll('#app button')).some((b) => isVis(b) && (b.innerText || '').includes('Chốt & Phát hành'));
        })()`);
        if (hasPublishBtn) {
            await clickInPage(session, { text: 'Chốt & Phát hành', inTopModal: false });
            await sleep(250);
            const hasConfirm = await session.evaluate(`Boolean(document.querySelector('[data-modal-root="true"]'))`);
            if (hasConfirm) {
                await inspectPhysicsAndGeometry(session, 'Admin Publish Payroll ConfirmDialog', { expectModal: true });
                await session.evaluate(`(() => {
                    const top = document.querySelector('[data-modal-root="true"]');
                    const btns = top ? Array.from(top.querySelectorAll('button')) : [];
                    const okBtn = btns.find((b) => /Xác nhận|Chốt|Đồng ý|Phê duyệt/.test((b.innerText || '').trim()));
                    if (okBtn) okBtn.click();
                })()`);
                await sleep(450);
            }
            await dismissToastIfVisible(session);
        }

        // 3D: Holidays Tab — Add Holiday Modal
        await openDesktopTabViaDrawer('holidays', 'Admin');
        await inspectPhysicsAndGeometry(session, 'Admin Tab: holidays', { expectModal: false, testScrollBleed: false });
        await clickInPage(session, { text: 'Thêm ngày lễ', inTopModal: false });
        await waitForCondition(session, `Boolean(document.querySelector('[data-modal-root="true"]'))`, 4000, 'Add Holiday modal opened');
        await inspectPhysicsAndGeometry(session, 'Admin Add Holiday Modal', { expectModal: true });
        await setReactInputValue(session, { selector: 'input[type="text"]', value: 'QA_UI_HOLIDAY', inTopModal: true });
        await setReactInputValue(session, { selector: 'input[type="date"]', value: `${curYear}-12-25`, inTopModal: true, index: 0 });
        await setReactInputValue(session, { selector: 'input[type="date"]', value: `${curYear}-12-25`, inTopModal: true, index: 1 });
        await clickInPage(session, { text: 'Lưu ngày lễ', inTopModal: true });
        await sleep(450);
        await dismissModalIfOpen(session);
        await dismissToastIfVisible(session);

        // 3E: Company Settings Tab — Expand Accordions + 200% Elderly Font Scale FormRow Check
        await openDesktopTabViaDrawer('company', 'Admin');
        await inspectPhysicsAndGeometry(session, 'Admin Tab: company (100%)', { expectModal: false, testScrollBleed: false });
        await setViewportAndScale(session, 360, 780, 200);
        await inspectPhysicsAndGeometry(session, 'Admin Tab: company (200% Elderly Scale)', { expectModal: false, testScrollBleed: false });
        await setViewportAndScale(session, 360, 780, 100);
        await clickInPage(session, { text: 'Lưu cấu hình', inTopModal: false });
        await sleep(350);
        await dismissToastIfVisible(session);

        // 3F: Audit Logs Tab
        await openDesktopTabViaDrawer('audit_logs', 'Admin');
        await inspectPhysicsAndGeometry(session, 'Admin Tab: audit_logs', { expectModal: false, testScrollBleed: false });

        // Admin Logout cleanly
        await logoutViaConfirmDialog(session, 'Đăng xuất');

        assert.deepEqual(pageErrors, [], `Zero uncaught page errors expected across 3 roles: ${JSON.stringify(pageErrors)}`);
        assert.deepEqual(server5xx, [], `Zero HTTP 5xx server errors expected across 3 roles: ${JSON.stringify(server5xx)}`);
        assert.deepEqual(unexpected4xx, [], `Zero unexpected HTTP 4xx errors expected across 3 roles: ${JSON.stringify(unexpected4xx)}`);
        assert.deepEqual(consoleErrors, [], `Zero console.error logs expected across 3 roles: ${JSON.stringify(consoleErrors)}`);
    } finally {
        // Complete Real-DB Restoration & Zero-Bloat Cleanup
        if (maxIds.attendance_logs !== undefined) {
            await query('DELETE FROM attendance_logs WHERE id > ?', [maxIds.attendance_logs]).catch(() => {});
            await query('DELETE FROM requests WHERE id > ?', [maxIds.requests]).catch(() => {});
            await query('DELETE FROM ot_registrations WHERE id > ?', [maxIds.ot_registrations]).catch(() => {});
            await query('DELETE FROM payroll_periods WHERE id > ?', [maxIds.payroll_periods]).catch(() => {});
            await query('DELETE FROM period_locks WHERE id > ?', [maxIds.period_locks]).catch(() => {});
            await query("DELETE FROM public_holidays WHERE id > ? OR holiday_name = 'QA_UI_HOLIDAY'", [maxIds.public_holidays]).catch(() => {});
            await query('DELETE FROM audit_logs WHERE id > ?', [maxIds.audit_logs]).catch(() => {});
        }
        await query("DELETE FROM idempotency_keys WHERE actor_id IN ('NV001','NV002','NV003','admin','NV_UI_TEMP')").catch(() => {});
        await query('DELETE FROM attendance WHERE ma_nv IN ("NV001","NV002","NV003","NV_UI_TEMP") AND thang = ? AND nam = ?', [curMonth, curYear]).catch(() => {});
        await query("DELETE FROM employees WHERE ma_nv = 'NV_UI_TEMP'").catch(() => {});
        await query("DELETE FROM login_rate_limits WHERE identifier IN ('NV001','NV002','NV003','admin') OR key_name LIKE '%127.0.0.1%'").catch(() => {});

        for (const emp of coreUsersBefore || []) {
            await query(
                `UPDATE employees SET
                    ho_ten = ?, chuc_danh = ?, role = ?, status = ?, is_locked = ?,
                    password = ?, must_change_password = ?, bound_device_id = ?,
                    pending_device_id = ?, device_change_reason = ?, token_version = ?
                 WHERE ma_nv = ?`,
                [
                    emp.ho_ten, emp.chuc_danh, emp.role, emp.status, emp.is_locked,
                    emp.password, emp.must_change_password, emp.bound_device_id,
                    emp.pending_device_id, emp.device_change_reason, emp.token_version,
                    emp.ma_nv
                ]
            ).catch(() => {});
        }
        for (const adm of adminBefore || []) {
            await query(
                'UPDATE admins SET password = ?, must_change_password = ?, token_version = ? WHERE username = ?',
                [adm.password, adm.must_change_password, adm.token_version, adm.username]
            ).catch(() => {});
        }
        if (settingsSnap) {
            await restoreSettings(settingsSnap).catch(() => {});
        }

        try { fs.unlinkSync(tmpPhotoPath); } catch { /* ignore */ }
        if (session) await session.close().catch(() => {});
        if (srv) await srv.close().catch(() => {});
    }
});

test.after(async () => {
    await closeTestRuntime();
});
