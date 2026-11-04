/**
 * tools/verify_l3_debounce_20x.js
 * 
 * Kiểm thử độ bền và tần suất thất bại của cơ chế Debounce / Khóa phần cứng
 * Thực hiện 20 lần lặp bấm đúp trên cả 2 nhánh router (HashRouter & ZMPRouter)
 * Mục tiêu: Tần suất thất bại 0/20 trên cả 2 nhánh.
 */

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '123456';
process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'sedinco_super_secure_jwt_secret_key_2026_local_test_32chars';

const puppeteer = require('puppeteer-core');
const { query } = require('../sedinco_backend/src/config/db');
const { hashPassword } = require('../sedinco_backend/src/utils/passwordHelper');
const { generateDynamicQrToken } = require('../sedinco_backend/src/utils/dynamicQrHelper');

const BRAVE_BIN = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const BASE_URL = 'http://127.0.0.1:5001';

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function setInputValue(page, selector, value) {
    await page.waitForSelector(selector, { timeout: 5000 });
    await page.evaluate((sel, val) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const valueSetter = Object.getOwnPropertyDescriptor(el, 'value')?.set;
        const prototype = Object.getPrototypeOf(el);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(el, val);
        } else if (valueSetter) {
            valueSetter.call(el, val);
        } else {
            el.value = val;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
}

async function runDebounceIteration(page, iteration, routerType) {
    const qrDebounce = generateDynamicQrToken(1, 60);
    await query('INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at, is_used) VALUES (?, 1, ?, 0)', [qrDebounce.token, qrDebounce.expiresAt]);
    await query('DELETE FROM attendance_logs WHERE employee_id = "NV001" AND record_date = CURRENT_DATE');

    await page.evaluate((qrTok) => {
        localStorage.setItem('sedinco_has_seen_location_perm', 'true');
        localStorage.setItem('sedinco_current_qr_token', qrTok);
    }, qrDebounce.token);

    let networkAttendanceRequests = 0;
    const countReq = (req) => {
        const url = req.url();
        if ((url.includes('/api/attendance') || url.includes('/check-in')) && (req.method() === 'POST' || req.method() === 'PUT')) {
            networkAttendanceRequests++;
        }
    };
    page.on('request', countReq);

    const checkinBtn = await page.$('button.rounded-full');
    if (checkinBtn) {
        await checkinBtn.click();
        await checkinBtn.click();
    } else {
        const anyBtn = await page.$('button');
        if (anyBtn) {
            await anyBtn.click();
            await anyBtn.click();
        }
    }

    await sleep(2000);
    page.off('request', countReq);

    const [dbRows] = await query('SELECT COUNT(*) as cnt FROM attendance_logs WHERE employee_id = "NV001" AND record_date = CURRENT_DATE');
    const dbCnt = Number(dbRows.cnt);
    const pass = (networkAttendanceRequests === 1) && (dbCnt === 1);

    return {
        iteration,
        routerType,
        networkRequests: networkAttendanceRequests,
        dbRecords: dbCnt,
        pass
    };
}

async function testRouterBranch(routerType, totalIterations = 20) {
    console.log(`\n═════════════════════════════════════════════════════════════════════`);
    console.log(`  BẮT ĐẦU ĐO DEBOUNCE ${totalIterations} LẦN TRÊN NHÁNH: ${routerType.toUpperCase()}`);
    console.log(`═════════════════════════════════════════════════════════════════════`);

    const defaultPassHash = hashPassword('123456');
    await query('UPDATE employees SET password = ?, is_locked = 0, status = "active", must_change_password = 0 WHERE ma_nv = "NV001"', [defaultPassHash]);

    const browser = await puppeteer.launch({
        executablePath: BRAVE_BIN,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=375,812']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812 });

    const isZmpRouter = routerType === 'zmp';
    await page.evaluateOnNewDocument((forceZmp) => {
        if (forceZmp) {
            window.__FORCE_ZMP_ROUTER__ = true;
        }
        window.ZaloJavaScriptInterface = {
            _mock: 'mock Zalo (L3 Automated E2E)',
            getAccessToken: (cb) => cb && cb('mock_zalo_access_token_l3'),
            getUserID: (cb) => cb && cb('mock_zalo_uid_l3'),
            getDeviceIdAsync: () => Promise.resolve('mock_brave_device_e2e_01'),
            getLocation: (opts) => Promise.resolve({ latitude: 16.0544, longitude: 108.2022, token: 'mock_loc_token_l3' })
        };
    }, isZmpRouter);

    try {
        const targetUrl = isZmpRouter ? `${BASE_URL}/?zmp_router=1` : `${BASE_URL}/`;
        await page.goto(targetUrl, { waitUntil: 'networkidle0' });

        await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
        await page.reload({ waitUntil: 'networkidle0' });

        // Đăng nhập Worker qua form DOM
        await setInputValue(page, 'input[placeholder*="NV0970123"]', 'NV001');
        await setInputValue(page, 'input[placeholder*="mật khẩu"]', '123456');
        await page.click('button[type="submit"]');
        await sleep(2500);

        // Chờ nút chấm công lớn xuất hiện
        await page.waitForSelector('button.rounded-full', { timeout: 6000 });

        let failCount = 0;
        const results = [];

        for (let i = 1; i <= totalIterations; i++) {
            const res = await runDebounceIteration(page, i, routerType);
            results.push(res);
            if (!res.pass) failCount++;
            process.stdout.write(`  [Lần ${String(i).padStart(2, '0')}/${totalIterations}] NetReq: ${res.networkRequests} | DB: ${res.dbRecords} => ${res.pass ? '✅ PASS' : '❌ FAIL'}\n`);
            // Nghỉ ngắn giữa các lượt để reset debounce module timestamp nếu cần
            await sleep(1500);
        }

        console.log(`─────────────────────────────────────────────────────────────────────`);
        console.log(`  KẾT QUẢ NHÁNH ${routerType.toUpperCase()}: ${totalIterations - failCount}/${totalIterations} PASS | Số lần thất bại: ${failCount}/${totalIterations} (${((failCount / totalIterations) * 100).toFixed(1)}%)`);
        return { routerType, total: totalIterations, failCount, passCount: totalIterations - failCount };

    } finally {
        await browser.close();
    }
}

async function main() {
    console.log('Khởi động kiểm thử độ bền Debounce 20x trên cả 2 nhánh Router...\n');
    const hashRes = await testRouterBranch('hash', 20);
    const zmpRes = await testRouterBranch('zmp', 20);

    console.log(`\n=====================================================================`);
    console.log(`  TỔNG KẾT KIỂM THỬ DEBOUNCE 20X`);
    console.log(`=====================================================================`);
    console.log(`  Nhánh HashRouter : ${hashRes.passCount}/${hashRes.total} PASS (Thất bại: ${hashRes.failCount}/${hashRes.total})`);
    console.log(`  Nhánh ZMPRouter  : ${zmpRes.passCount}/${zmpRes.total} PASS (Thất bại: ${zmpRes.failCount}/${zmpRes.total})`);
    console.log(`=====================================================================\n`);

    if (hashRes.failCount === 0 && zmpRes.failCount === 0) {
        console.log('✅ ĐẠT MỤC TIÊU: Tần suất thất bại 0/20 trên cả 2 nhánh router!');
        process.exit(0);
    } else {
        console.error('❌ CHƯA ĐẠT: Vẫn còn lượt bấm đúp bị lọt 2 request.');
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Lỗi thực thi kiểm thử debounce 20x:', err);
    process.exit(1);
});
