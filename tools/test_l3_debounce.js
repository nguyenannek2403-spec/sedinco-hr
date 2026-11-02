/**
 * tools/test_l3_debounce.js
 * 
 * Chuyên biệt kiểm thử TC-L3-UI-DEBOUNCE-01:
 * - 2 sự kiện click riêng biệt trên DOM thật
 * - Đếm số lượng HTTP request gửi lên server (bắt buộc === 1)
 * - Kiểm tra số bản ghi trong CSDL (bắt buộc === 1)
 * - Dùng để chạy thử nghiệm XANH và ĐỎ (Mutation)
 */

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
const { query } = require('../sedinco_backend/src/config/db');
const { hashPassword } = require('../sedinco_backend/src/utils/passwordHelper');
const { generateDynamicQrToken } = require('../sedinco_backend/src/utils/dynamicQrHelper');

const BRAVE_BIN = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const BASE_URL = 'http://127.0.0.1:5001';

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

async function runDebounceTest() {
    console.log('=== BẮT ĐẦU KIỂM THỬ TC-L3-UI-DEBOUNCE-01 (G7 Mục A.3) ===');
    
    // 1. Chuẩn bị dữ liệu tài khoản NV001 băm bcrypt mật khẩu 123456
    const passHash = hashPassword('123456');
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES ('NV001', 'Ngô Trường Sa', ?, 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`, [passHash]);

    // Xóa rate limit cũ
    await query('DELETE FROM login_rate_limits');

    // Chuẩn bị mã QR động hợp lệ và xóa dữ liệu chấm công cũ hôm nay của NV001
    const qrDebounce = generateDynamicQrToken(1, 60);
    await query('INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at, is_used) VALUES (?, 1, ?, 0)', [qrDebounce.token, qrDebounce.expiresAt]);
    await query('DELETE FROM attendance_logs WHERE employee_id = "NV001" AND record_date = CURRENT_DATE');

    const browser = await puppeteer.launch({
        executablePath: BRAVE_BIN,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1200,900']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 375, height: 812 });

        // Đến trang chủ và đăng nhập worker
        await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
        await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

        await setInputValue(page, 'input[placeholder*="NV0970123"]', 'NV001');
        await setInputValue(page, 'input[placeholder*="mật khẩu"]', '123456');
        await page.click('button[type="submit"]');
        await sleep(1500);

        // Đảm bảo đã vào màn hình Dashboard
        const bodyText = await page.evaluate(() => document.body.innerText);
        if (!bodyText.includes('NV001') && !bodyText.includes('CHẤM CÔNG') && !bodyText.includes('Điểm Danh') && !bodyText.includes('Ngô Trường Sa')) {
            throw new Error(`Đăng nhập NV001 thất bại! Nội dung màn hình: ${bodyText.slice(0, 150)}`);
        }

        // Cài đặt QR token và cờ vị trí vào localStorage
        await page.evaluate((qrTok) => {
            localStorage.setItem('sedinco_has_seen_location_perm', 'true');
            localStorage.setItem('sedinco_current_qr_token', qrTok);
        }, qrDebounce.token);

        // Lắng nghe và đếm số lượng HTTP request gửi lên server
        let networkAttendanceRequests = 0;
        const requestUrls = [];
        const requestListener = (req) => {
            const url = req.url();
            if ((url.includes('/api/attendance') || url.includes('/check-in') || url.includes('/update')) && (req.method() === 'POST' || req.method() === 'PUT')) {
                networkAttendanceRequests++;
                requestUrls.push(`${req.method()} ${url}`);
            }
        };
        page.on('request', requestListener);

        // Tìm nút chấm công lớn
        const checkinBtn = await page.$('button.rounded-full');
        if (!checkinBtn) {
            throw new Error('Không tìm thấy nút chấm công (button.rounded-full) trên giao diện!');
        }

        console.log('-> Kích hoạt HAI sự kiện click riêng biệt trên DOM thật...');
        // YÊU CẦU G7: Bấm 2 click riêng biệt dồn dập (không dùng clickCount: 2)
        await page.evaluate(() => {
            const btn = document.querySelector('button.rounded-full');
            if (btn) {
                btn.click();
                btn.click();
            }
        });

        // Chờ 2.5 giây để các request mạng hoàn tất
        await sleep(2500);
        page.off('request', requestListener);

        // Kiểm tra kết quả
        const [dbCheckRows] = await query('SELECT COUNT(*) as cnt FROM attendance_logs WHERE employee_id = "NV001" AND record_date = CURRENT_DATE');
        const dbRecordCount = Number(dbCheckRows.cnt);

        console.log(`-> Số request mạng gửi đi từ UI: ${networkAttendanceRequests} (Yêu cầu G7: đúng === 1)`);
        console.log(`   Chi tiết requests:`, requestUrls);
        console.log(`-> Số bản ghi trong CSDL: ${dbRecordCount} (Yêu cầu G7: đúng === 1)`);

        const requestPass = (networkAttendanceRequests === 1);
        const dbPass = (dbRecordCount === 1);

        if (requestPass && dbPass) {
            console.log('✅ KẾT QUẢ TC-L3-UI-DEBOUNCE-01: PASS (UI gửi đúng 1 request, CSDL có đúng 1 bản ghi)');
            process.exit(0);
        } else {
            console.error(`❌ KẾT QUẢ TC-L3-UI-DEBOUNCE-01: FAIL (Requests: ${networkAttendanceRequests} [kỳ vọng 1], DB: ${dbRecordCount} [kỳ vọng 1])`);
            process.exit(1);
        }
    } finally {
        await browser.close();
    }
}

runDebounceTest().catch(err => {
    console.error('Lỗi thực thi test:', err);
    process.exit(1);
});
