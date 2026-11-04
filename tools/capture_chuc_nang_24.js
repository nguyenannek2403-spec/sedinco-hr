process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '123456';
process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'sedinco_super_secure_jwt_secret_key_2026_local_test_32chars';
process.env.QR_SECRET = 'sedinco_super_secure_qr_secret_key_2026_local_test_32chars';

const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');
const app = require('../sedinco_backend/src/app');
const { query } = require('../sedinco_backend/src/config/db');

const BRAVE_BIN = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const BASE_URL = 'http://127.0.0.1:5001';
const SCREENS_DIR = path.join(__dirname, '../reports/screens');
const ARTIFACT_DIR = '/Users/an/.gemini/antigravity-ide/brain/d749f6a7-1d47-4498-bc81-b05d5c937170';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log('--- CHỤP ẢNH CHỨC NĂNG 24: KIOSK DISPLAY ĐANG HIỂN THỊ VÀ ĐỔI QR ---');
    const kioskApiKey = 'ksk_cn24_display_key';
    await query('DELETE FROM kiosk_devices WHERE api_key = ?', [kioskApiKey]);
    await query('INSERT INTO kiosk_devices (kiosk_name, branch_id, api_key, is_active) VALUES ("Kiosk Cổng Chính (Nhà Máy Sedinco)", 1, ?, 1)', [kioskApiKey]);

    const server = http.createServer(app);
    await new Promise(r => server.listen(5001, '127.0.0.1', r));

    const browser = await puppeteer.launch({
        executablePath: BRAVE_BIN,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
        await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

        // Đăng nhập Admin
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

        // Click Màn hình Kiosk QR
        await page.evaluate((kKey) => {
            localStorage.setItem('sedinco_kiosk_key', kKey);
            const kioskTab = Array.from(document.querySelectorAll('button, a')).find(el => el.innerText.includes('Kiosk QR'));
            if (kioskTab) kioskTab.click();
        }, kioskApiKey);

        // Chờ thẻ ảnh QR xuất hiện
        await page.waitForSelector('img[alt="Dynamic QR Kiosk"]', { timeout: 8000 });
        await sleep(1000);

        const screenName = 'UI_24_Kiosk_Displaying_And_Refreshing_QR_1280x800.png';
        const localPath = path.join(SCREENS_DIR, screenName);
        const artifactPath = path.join(ARTIFACT_DIR, screenName);

        await page.screenshot({ path: localPath, fullPage: false });
        fs.copyFileSync(localPath, artifactPath);
        console.log(`✅ Đã chụp ảnh chức năng 24: ${localPath}`);

    } finally {
        await browser.close();
        server.close();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
