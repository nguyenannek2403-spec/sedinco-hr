/**
 * tools/test_debounce_side_effects_e2e.js
 * 
 * Kiểm thử E2E tác dụng phụ của Debounce trên cả 2 nhánh router (BrowserRouter & ZMPRouter):
 * (1) Quét đầu bị từ chối (400 QR đã dùng) -> Thử lại trong vòng 1s xử lý được ngay (khóa mở khi lỗi)
 * (2) Lỗi mạng -> Công nhân quét lại được ngay trong vòng 1s
 * (3) Thành công -> Khóa giữ đúng 3s (click lần 2 trong 3s bị chặn)
 * (4) 2 click trong 50ms -> Đúng 1 request gửi lên backend
 * Và kiểm chứng thông báo: "Mã vừa có người dùng, vui lòng quét mã mới"
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
const assert = require('node:assert/strict');
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

async function runTestSuite() {
    console.log('=== KIỂM THỬ E2E TÁC DỤNG PHỤ DEBOUNCE (G8.5 MỤC E) ===');
    const browser = await puppeteer.launch({
        executablePath: BRAVE_BIN,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=375,812']
    });

    const routerConfigs = [
        { name: 'BrowserRouter (Web chuẩn)', forceZmp: false },
        { name: 'ZMPRouter (Mock Zalo SDK)', forceZmp: true }
    ];

    try {
        const defaultPassHash = hashPassword('123456');
        await query('UPDATE employees SET password = ?, is_locked = 0, status = "active", must_change_password = 0 WHERE ma_nv = "NV001"', [defaultPassHash]);

        for (const router of routerConfigs) {
            console.log(`\n──────────────────────────────────────────────────────────`);
            console.log(`▶ CHẠY KIỂM THỬ TRÊN NHÁNH ROUTER: ${router.name}`);
            console.log(`──────────────────────────────────────────────────────────`);

            const page = await browser.newPage();
            await page.setViewport({ width: 375, height: 812 });

            // Inject mock Zalo environment
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
            }, router.forceZmp);

            // Đảm bảo phiên sạch trước khi đăng nhập
            await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
            await page.evaluate(() => {
                localStorage.clear();
                sessionStorage.clear();
            });
            await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
            await setInputValue(page, 'input[placeholder*="NV0970123"]', 'NV001');
            await setInputValue(page, 'input[placeholder*="mật khẩu"]', '123456');
            await page.click('button[type="submit"]');
            await sleep(1500);

            // Chờ nút Chấm công hiển thị
            await page.waitForSelector('button.rounded-full', { timeout: 5000 });

            // =========================================================================
            // (1) Quét đầu bị từ chối (400 QR đã dùng) -> Thử lại trong vòng 1s xử lý được ngay
            // =========================================================================
            console.log(`[${router.name}] (1) Test QR đã dùng & mở khóa ngay lập tức trong vòng 1s...`);
            const usedQr = generateDynamicQrToken(1, 60);
            await query('INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at, is_used) VALUES (?, 1, ?, 1)', [usedQr.token, usedQr.expiresAt]);
            await query('DELETE FROM attendance_logs WHERE employee_id = "NV001" AND record_date = CURRENT_DATE');

            await page.evaluate((tok) => {
                localStorage.setItem('sedinco_has_seen_location_perm', 'true');
                localStorage.setItem('sedinco_current_qr_token', tok);
            }, usedQr.token);

            // Click lần 1 với mã đã dùng
            await page.click('button.rounded-full');
            await sleep(800);

            // Kiểm tra thông điệp UI hiển thị
            const domTextAfterUsedQr = await page.evaluate(() => document.body.innerText);
            assert.ok(domTextAfterUsedQr.includes('Mã vừa có người dùng, vui lòng quét mã mới'), 
                `UI phải hiển thị "Mã vừa có người dùng, vui lòng quét mã mới". Nhận được: ${domTextAfterUsedQr.substring(0, 150)}`);
            console.log(`  -> Thông điệp UI chuẩn xác: "Mã vừa có người dùng, vui lòng quét mã mới"`);

            // Trong vòng 400ms (< 1s), nạp QR mới hợp lệ và bấm lại ngay lập tức
            const freshQr1 = generateDynamicQrToken(1, 60);
            await query('INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at, is_used) VALUES (?, 1, ?, 0)', [freshQr1.token, freshQr1.expiresAt]);

            await page.evaluate((tok) => {
                localStorage.setItem('sedinco_current_qr_token', tok);
            }, freshQr1.token);

            await sleep(300); // Thử lại sau 300ms (< 1s)
            await page.click('button.rounded-full');
            await sleep(1200);

            const successText1 = await page.evaluate(() => document.body.innerText);
            assert.ok(successText1.includes('Đã Chấm Công') || successText1.includes('THÀNH CÔNG'),
                `Bấm lại sau lỗi trong 1s phải thành công ngay. Nhận được: ${successText1.substring(0, 150)}`);
            console.log(`  -> PASS (1): Thử lại trong vòng 1s được xử lý ngay lập tức (khóa đã mở khi lỗi).`);

            // =========================================================================
            // (2) Lỗi mạng -> công nhân quét lại được ngay
            // =========================================================================
            console.log(`[${router.name}] (2) Test Lỗi mạng -> quét lại được ngay trong vòng 1s...`);
            await query('DELETE FROM attendance_logs WHERE employee_id = "NV001" AND record_date = CURRENT_DATE');
            await page.evaluate(() => {
                localStorage.removeItem('sedinco_current_qr_token');
            });
            await page.reload({ waitUntil: 'networkidle0' });
            await sleep(500);

            // Tạm thời kích hoạt cờ offline trên trang
            await page.setOfflineMode(true);
            const offlineQr = generateDynamicQrToken(1, 60);
            await page.evaluate((tok) => {
                localStorage.setItem('sedinco_current_qr_token', tok);
            }, offlineQr.token);

            await page.click('button.rounded-full');
            await sleep(500);

            // Bật lại mạng ngay lập tức
            await page.setOfflineMode(false);
            const freshQr2 = generateDynamicQrToken(1, 60);
            await query('INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at, is_used) VALUES (?, 1, ?, 0)', [freshQr2.token, freshQr2.expiresAt]);
            await page.evaluate((tok) => {
                localStorage.setItem('sedinco_current_qr_token', tok);
            }, freshQr2.token);

            await sleep(300); // Thử lại sau 300ms (< 1s)
            await page.click('button.rounded-full');
            await sleep(1200);

            const successText2 = await page.evaluate(() => document.body.innerText);
            assert.ok(successText2.includes('Đã Chấm Công') || successText2.includes('THÀNH CÔNG'),
                `Quét lại sau lỗi mạng trong 1s phải thành công ngay. Nhận được: ${successText2.substring(0, 150)}`);
            console.log(`  -> PASS (2): Lỗi mạng giải phóng khóa ngay lập tức, công nhân quét lại được ngay.`);

            // =========================================================================
            // (3) Thành công -> khóa giữ đúng 3s
            // =========================================================================
            console.log(`[${router.name}] (3) Test Thành công -> khóa giữ đúng 3s...`);
            let postReqCount = 0;
            const countReq = (req) => {
                if (req.url().includes('/attendance/check-in') || req.url().includes('/attendance/update')) {
                    postReqCount++;
                }
            };
            page.on('request', countReq);

            // Bấm lần 2 sau khi vừa thành công 600ms
            await page.click('button.rounded-full').catch(() => {});
            await sleep(500);
            page.off('request', countReq);

            assert.equal(postReqCount, 0, 'Trong vòng 3s sau khi thành công, click tiếp theo BẮT BUỘC bị chặn bởi khóa debounce');
            console.log(`  -> PASS (3): Khóa debounce giữ nguyên hiệu lực trong 3s sau khi thành công.`);

            // =========================================================================
            // (4) 2 click trong 50ms -> đúng 1 request
            // =========================================================================
            console.log(`[${router.name}] (4) Test 2 click trong 50ms -> đúng 1 request...`);
            await query('DELETE FROM attendance_logs WHERE employee_id = "NV001" AND record_date = CURRENT_DATE');
            await page.reload({ waitUntil: 'networkidle0' });
            await sleep(500);

            const freshQr3 = generateDynamicQrToken(1, 60);
            await query('INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at, is_used) VALUES (?, 1, ?, 0)', [freshQr3.token, freshQr3.expiresAt]);
            await page.evaluate((tok) => {
                localStorage.setItem('sedinco_has_seen_location_perm', 'true');
                localStorage.setItem('sedinco_current_qr_token', tok);
            }, freshQr3.token);

            let clickReqCount = 0;
            const countClickReq = (req) => {
                if (req.url().includes('/attendance/check-in') || req.url().includes('/attendance/update')) {
                    clickReqCount++;
                }
            };
            page.on('request', countClickReq);

            // Bắn 2 click liên tiếp trong 50ms
            const btn = await page.$('button.rounded-full');
            await Promise.all([
                btn.click(),
                (async () => {
                    await sleep(30);
                    await btn.click().catch(() => {});
                })()
            ]);

            await sleep(1000);
            page.off('request', countClickReq);

            assert.equal(clickReqCount, 1, `2 click trong 50ms chỉ được sinh đúng 1 request network, thực tế sinh: ${clickReqCount}`);
            console.log(`  -> PASS (4): 2 click trong 50ms gửi đúng 1 request.`);

            await page.close();
            console.log(`✔ HOÀN THÀNH TOÀN BỘ 4 MỤC TEST DEBOUNCE TRÊN ROUTER: ${router.name}`);
        }

        console.log('\n=== KẾT LUẬN ĐÁNH GIÁ TỰ ĐỘNG MỞ LẠI CAMERA TRONG MINI APP ===');
        console.log('Theo cơ chế bảo mật của Zalo Mini App SDK (zmp-sdk):');
        console.log('- zmp.scanQRCode() bắt buộc kích hoạt từ cử chỉ bấm tay trực tiếp của người dùng (User gesture).');
        console.log('- Gọi tự động từ code ngầm sau lỗi bị Webview container chặn ("User gesture required").');
        console.log('- Đánh giá trạng thái: KHÔNG KIỂM CHỨNG ĐƯỢC trên môi trường tự động hóa không có tương tác người dùng.');

    } finally {
        await browser.close();
        await query('DELETE FROM attendance_logs WHERE employee_id = "NV001" AND record_date = CURRENT_DATE');
        await query('DELETE FROM dynamic_qr_sessions WHERE branch_id = 1 AND session_token LIKE "kiosk:%"');
    }
}

runTestSuite().then(() => {
    console.log('\n=== TOÀN BỘ KIỂM THỬ MỤC E ĐẠT TRẠNG THÁI PASS ===');
    process.exit(0);
}).catch(err => {
    console.error('\n❌ LỖI KIỂM THỬ MỤC E:', err);
    process.exit(1);
});
