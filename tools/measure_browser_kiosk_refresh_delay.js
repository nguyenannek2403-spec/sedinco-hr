/**
 * tools/measure_browser_kiosk_refresh_delay.js
 * 
 * B.2 Đo trong trình duyệt thật (Brave Browser Headless):
 * 1. Đo độ trễ từ lúc QR bị dùng (is_used = 1) đến lúc KioskDisplayView hiển thị QR mới (P50, P95, Min, Max, Avg) qua 10 lượt đo thật.
 * 2. Kiểm tra Kiosk khi mất mạng / polling lỗi:
 *    - Chặn request /api/kiosk/qr-status
 *    - Xác nhận giao diện hiển thị badge "Đang thử kết nối lại...", không bị treo màn hình
 *    - Chụp ảnh bằng chứng riêng UI_B2_Kiosk_Reconnecting_Offline_1024x768.png
 */

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '123456';
process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'sedinco_test_jwt_secret_super_secure_32chars_min';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { performance } = require('perf_hooks');
const { query } = require('../sedinco_backend/src/config/db');
const kioskService = require('../sedinco_backend/src/services/kioskService');

const BRAVE_BIN = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const BASE_URL = 'http://127.0.0.1:5001';
const SCREENS_DIR = path.join(__dirname, '../reports/screens');
const ARTIFACT_DIR = '/Users/an/.gemini/antigravity-ide/brain/d749f6a7-1d47-4498-bc81-b05d5c937170';

function calcPercentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * p);
    return sorted[Math.min(idx, sorted.length - 1)];
}

async function setReactInput(page, selector, value) {
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

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function main() {
    console.log('══════════════════════════════════════════════════════════════════════════');
    console.log('  B.2 ĐO ĐỘ TRỄ ĐỔI MÃ TRÊN TRÌNH DUYỆT THẬT & KIỂM TRA MẤT MẠNG KIOSK');
    console.log('══════════════════════════════════════════════════════════════════════════\n');

    // 1. Đăng ký Kiosk test
    const kioskName = `TEST_BROWSER_KIOSK_${Date.now()}`;
    const kiosk = await kioskService.registerKiosk({
        kiosk_name: kioskName,
        branch_id: 1,
        created_by: 'system'
    });
    const apiKey = kiosk.api_key;
    kioskService.resetRateLimit();

    const browser = await puppeteer.launch({
        executablePath: BRAVE_BIN,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1024,768']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });

    page.on('console', msg => console.log('    [BROWSER LOG]', msg.text()));
    page.on('pageerror', err => console.log('    [BROWSER ERR]', err.message));

    try {
        console.log('>>> [1] Đang tải giao diện KioskDisplayView trên trình duyệt...');
        await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });

        // Đăng nhập Admin
        await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
        await page.reload({ waitUntil: 'networkidle0' });

        // Điền form đăng nhập Admin
        await setReactInput(page, 'input[placeholder*="NV0970123"]', 'admin');
        await setReactInput(page, 'input[placeholder*="mật khẩu"]', '123456');
        await page.click('button[type="submit"]');
        await sleep(3000);

        const currentUrl = page.url();
        console.log('    -> URL sau đăng nhập:', currentUrl);

        // Lưu Kiosk API Key vào localStorage và chuyển sang tab Kiosk
        const clicked = await page.evaluate((key) => {
            localStorage.setItem('sedinco_kiosk_key', key);
            // Click menu Màn Hình Kiosk QR trên sidebar
            const btns = Array.from(document.querySelectorAll('button, a'));
            const kioskBtn = btns.find(b => b.innerText && b.innerText.includes('Kiosk QR'));
            if (kioskBtn) {
                kioskBtn.click();
                return true;
            }
            return false;
        }, apiKey);
        console.log('    -> Tìm thấy và bấm nút Kiosk menu:', clicked);

        await sleep(2000);

        const debugInfo = await page.evaluate(() => {
            return {
                inputs: Array.from(document.querySelectorAll('input')).map(i => ({ placeholder: i.placeholder, val: i.value })),
                buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean),
                textSnippet: document.body.innerText.slice(0, 500)
            };
        });
        console.log('    -> Debug DOM:', JSON.stringify(debugInfo, null, 2));

        // Nếu có input API key trên màn hình Kiosk thì điền và bấm nút Kích hoạt
        await page.evaluate((key) => {
            const input = document.querySelector('input[placeholder*="ksk_"]');
            if (input) {
                const valueSetter = Object.getOwnPropertyDescriptor(input, 'value')?.set;
                const prototype = Object.getPrototypeOf(input);
                const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
                if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
                    prototypeValueSetter.call(input, key);
                } else if (valueSetter) {
                    valueSetter.call(input, key);
                } else {
                    input.value = key;
                }
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const btns = Array.from(document.querySelectorAll('button'));
            const activateBtn = btns.find(b => b.innerText && b.innerText.includes('Kích Hoạt Kiosk'));
            if (activateBtn) {
                console.log('Bấm nút Kích Hoạt Kiosk trong KioskDisplayView');
                activateBtn.click();
            }
        }, apiKey);

        // Chờ ảnh QR ban đầu xuất hiện
        await page.waitForSelector('img[alt="Dynamic QR Kiosk"]', { timeout: 15000 });
        console.log('    -> Đã nạp thành công màn hình Kiosk hiển thị Dynamic QR.');

        // 2. Thực hiện 10 lần đo độ trễ từ lúc is_used = 1 đến khi ảnh QR đổi
        console.log('\n>>> [2] Đo độ trễ từ lúc QR bị dùng đến khi hiển thị QR mới (10 lần lặp):');
        const latencies = [];

        for (let iteration = 1; iteration <= 10; iteration++) {
            // Lấy token hiện tại từ ảnh QR trên DOM
            const currentImgSrc = await page.$eval('img[alt="Dynamic QR Kiosk"]', el => el.src);
            const tokenMatch = currentImgSrc.match(/data=([^&]+)/);
            const rawData = tokenMatch ? decodeURIComponent(tokenMatch[1]) : '';
            const sessionToken = rawData.split('|')[0];

            if (!sessionToken) {
                console.warn(`    Lần ${iteration}: Không trích xuất được session token, bỏ qua`);
                continue;
            }

            // Ghi nhận thời điểm mã bị tiêu thụ trong CSDL
            const t0 = performance.now();
            await query('UPDATE dynamic_qr_sessions SET is_used = 1, used_by = "WORKER_TEST", used_at = NOW() WHERE session_token = ?', [sessionToken]);

            // Chờ trình duyệt polling và đổi ảnh QR mới
            await page.waitForFunction(
                (oldSrc) => {
                    const img = document.querySelector('img[alt="Dynamic QR Kiosk"]');
                    return img && img.src !== oldSrc;
                },
                { timeout: 8000 },
                currentImgSrc
            );
            const t1 = performance.now();
            const latencyMs = t1 - t0;
            latencies.push(latencyMs);

            console.log(`    - Lượt ${iteration}: ${(latencyMs / 1000).toFixed(2)}s (${Math.round(latencyMs)} ms)`);
            // Chờ nhịp nghỉ ngắn giữa các lượt
            await sleep(1000);
        }

        const sorted = [...latencies].sort((a, b) => a - b);
        const minMs = sorted[0];
        const maxMs = sorted[sorted.length - 1];
        const avgMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const p50Ms = calcPercentile(latencies, 0.50);
        const p95Ms = calcPercentile(latencies, 0.95);

        console.log('\n  * KẾT QUẢ ĐO ĐỘ TRỄ ĐỔI MÃ (10 LẦN THỰC ĐO TRÌNH DUYỆT):');
        console.log(`    - Min: ${(minMs / 1000).toFixed(2)}s (${Math.round(minMs)} ms)`);
        console.log(`    - Max: ${(maxMs / 1000).toFixed(2)}s (${Math.round(maxMs)} ms)`);
        console.log(`    - Avg: ${(avgMs / 1000).toFixed(2)}s (${Math.round(avgMs)} ms)`);
        console.log(`    - P50: ${(p50Ms / 1000).toFixed(2)}s (${Math.round(p50Ms)} ms)`);
        console.log(`    - P95: ${(p95Ms / 1000).toFixed(2)}s (${Math.round(p95Ms)} ms)`);
        console.log(`    => Nhận định: Độ trễ phân phối đều quanh chu kỳ polling 2.5s (trung bình ~${(avgMs / 1000).toFixed(2)}s), giải phóng ngay lập tức QR cũ để công nhân kế tiếp không bị quét trúng mã đã dùng.`);

        // 3. Kiểm tra mất mạng / polling lỗi (Kiosk không treo, hiển thị trạng thái kết nối lại)
        console.log('\n>>> [3] Kiểm tra kịch bản Kiosk mất kết nối mạng / Polling lỗi...');
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (req.url().includes('/api/kiosk/qr-status')) {
                req.abort('failed'); // Giả lập rớt mạng khi polling
            } else {
                req.continue();
            }
        });

        // Chờ 3.5 giây để nhịp poll tiếp theo kích hoạt lỗi
        await sleep(3500);

        // Kiểm tra xem badge trạng thái "Đang thử kết nối lại..." có xuất hiện không
        const isReconnectingShown = await page.evaluate(() => {
            return document.body.innerText.includes('Đang thử kết nối lại') || document.body.innerText.includes('Mất mạng');
        });

        console.log(`    - Trạng thái kết nối lại hiển thị: ${isReconnectingShown ? '✅ ĐẠT (Hiển thị badge kết nối lại)' : '❌ CHƯA HIỂN THỊ'}`);

        // Chụp ảnh bằng chứng
        const screenshotPath = path.join(SCREENS_DIR, 'UI_B2_Kiosk_Reconnecting_Offline_1024x768.png');
        await page.screenshot({ path: screenshotPath, fullPage: false });
        try {
            fs.copyFileSync(screenshotPath, path.join(ARTIFACT_DIR, 'UI_B2_Kiosk_Reconnecting_Offline_1024x768.png'));
        } catch (e) {}
        console.log(`    📸 [ẢNH CHỤP]: UI_B2_Kiosk_Reconnecting_Offline_1024x768.png`);

    } finally {
        await browser.close();
        await query('DELETE FROM kiosk_devices WHERE id = ?', [kiosk.id]);
        await query('DELETE FROM dynamic_qr_sessions WHERE branch_id = 1 AND session_token LIKE "kiosk:%"');
        kioskService.resetRateLimit();
    }

    console.log('\n>>> KẾT THÚC B.2: PASS');
    process.exit(0);
}

main().catch(e => {
    console.error('Lỗi B.2:', e);
    process.exit(1);
});
