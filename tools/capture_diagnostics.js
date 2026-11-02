/**
 * tools/capture_diagnostics.js
 * 
 * Chụp ảnh màn hình giao diện /diagnostics với đầy đủ 7 bước Zalo và thẻ thông tin CSDL / Git Commit.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'sedinco_super_secure_jwt_secret_key_2026_local_test_32chars';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '123456';
process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { query } = require('../sedinco_backend/src/config/db');
const { hashPassword } = require('../sedinco_backend/src/utils/passwordHelper');

const BRAVE_BIN = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const BASE_URL = 'http://127.0.0.1:5001';
const ARTIFACT_DIR = '/Users/an/.gemini/antigravity-ide/brain/d749f6a7-1d47-4498-bc81-b05d5c937170';

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

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

async function capture() {
    // Đảm bảo mật khẩu admin là hash bcrypt của 123456
    const hash123456 = hashPassword('123456');
    await query('UPDATE admins SET password = ? WHERE username = "admin"', [hash123456]);
    await query('DELETE FROM login_rate_limits');

    const browser = await puppeteer.launch({
        executablePath: BRAVE_BIN,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1200,900']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 414, height: 896 });

        // Đến trang chủ và xóa session cũ
        await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
        await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

        // Đăng nhập tài khoản admin
        await setInputValue(page, 'input[placeholder*="NV0970123"]', 'admin');
        await setInputValue(page, 'input[placeholder*="mật khẩu"]', '123456');
        await page.click('button[type="submit"]');
        await sleep(1500);

        // Chuyển sang tab Chẩn Đoán (Diagnostics)
        const diagBtnFound = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Chẩn Đoán'));
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });

        if (!diagBtnFound) {
            console.log('Không tìm thấy nút Chẩn Đoán trên giao diện, thử tìm theo selector khác...');
        }
        await sleep(1000);

        // Kích hoạt chạy Bước 1 trong DiagnosticsView
        await page.evaluate(() => {
            const step1Btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Chạy bước 1'));
            if (step1Btn) step1Btn.click();
        });
        await sleep(800);

        const screenPath = path.join(ARTIFACT_DIR, 'g7_diagnostics_screen_7steps.png');
        await page.screenshot({ path: screenPath, fullPage: true });
        console.log(`✅ Đã chụp ảnh màn hình Diagnostics: ${screenPath}`);
    } finally {
        await browser.close();
    }
}

capture().catch(err => {
    console.error('Lỗi chụp ảnh:', err);
    process.exit(1);
});
