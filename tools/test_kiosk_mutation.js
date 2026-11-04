process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '123456';
process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'sedinco_super_secure_jwt_secret_key_2026_local_test_32chars';
process.env.QR_SECRET = 'sedinco_super_secure_qr_secret_key_2026_local_test_32chars';

const puppeteer = require('puppeteer-core');
const http = require('http');
const app = require('../sedinco_backend/src/app');
const { query } = require('../sedinco_backend/src/config/db');

const BRAVE_BIN = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const BASE_URL = 'http://127.0.0.1:5001';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log('--- KIỂM TRA MUTATION KIOSK TEST ---');
    const kioskApiKey = 'ksk_mutation_test_key_01';
    await query('DELETE FROM kiosk_devices WHERE api_key = ?', [kioskApiKey]);
    await query('INSERT INTO kiosk_devices (kiosk_name, branch_id, api_key, is_active) VALUES ("Kiosk Test Gate", 1, ?, 1)', [kioskApiKey]);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(5001, '127.0.0.1', resolve));

    const browser = await puppeteer.launch({
        executablePath: BRAVE_BIN,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

        // Đăng nhập admin
        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
        await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

        const setVal = async (sel, val) => {
            await page.waitForSelector(sel, { timeout: 3000 });
            await page.evaluate((s, v) => {
                const el = document.querySelector(s);
                const valueSetter = Object.getOwnPropertyDescriptor(el, 'value')?.set;
                const prototype = Object.getPrototypeOf(el);
                const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
                if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
                    prototypeValueSetter.call(el, v);
                } else if (valueSetter) {
                    valueSetter.call(el, v);
                } else {
                    el.value = v;
                }
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }, sel, val);
        };

        await setVal('input[placeholder*="NV0970123"]', 'admin');
        await setVal('input[placeholder*="mật khẩu"]', '123456');
        await page.click('button[type="submit"]');
        await sleep(1500);

        const afterLoginUrl = page.url();
        const afterLoginBody = await page.evaluate(() => document.body.innerText.substring(0, 300));
        console.log(`URL sau đăng nhập: ${afterLoginUrl}`);
        console.log(`Body sau đăng nhập: ${afterLoginBody}`);

        // Kích hoạt Kiosk
        await page.evaluate((kKey) => {
            localStorage.setItem('sedinco_kiosk_key', kKey);
            const kioskTab = document.querySelector('button[title*="Kiosk"], [data-tab="kiosk"]') ||
                Array.from(document.querySelectorAll('button, a')).find(el => el.innerText.includes('Kiosk QR'));
            if (kioskTab) kioskTab.click();
        }, kioskApiKey);
        await sleep(2500);

        const kioskBody = await page.evaluate(() => document.body.innerText.substring(0, 300));
        console.log(`Body tại Kiosk: ${kioskBody}`);

        // Chờ thẻ ảnh QR xuất hiện
        const imgPresent = await page.waitForSelector('img[alt="Dynamic QR Kiosk"]', { timeout: 4000 })
            .then(() => true)
            .catch(() => false);

        let initialSrc = '';
        if (imgPresent) {
            initialSrc = await page.$eval('img[alt="Dynamic QR Kiosk"]', el => el.src);
        }

        const hasValidQrImg = Boolean(initialSrc && initialSrc.includes('api.qrserver.com'));
        console.log(`Kết quả hiển thị thẻ img[alt="Dynamic QR Kiosk"]: ${imgPresent}`);
        console.log(`initialSrc: "${initialSrc}"`);
        console.log(`hasValidQrImg: ${hasValidQrImg}`);

        if (!hasValidQrImg) {
            console.log('>>> KẾT QUẢ MUTATION: ❌ ĐỎ (ĐÃ BẮT ĐƯỢC LỖI KHI CHỈ KIỂM qr_data)! Test đã FAIL chính xác.');
        } else {
            console.log('>>> KẾT QUẢ: 🟢 XANH (Test lọt qua lỗi)');
        }

    } finally {
        await browser.close();
        server.close();
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
