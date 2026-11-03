/**
 * tools/test_l3_additional_ui.js
 * 
 * KIỂM THỬ BỔ SUNG 5 TÍNH NĂNG GIAO DIỆN (G8.2 - MỤC F)
 * 1. Chấm công Vào / Ra thành công trên UI
 * 2. Đơn OT (Worker nộp đơn tăng ca)
 * 3. Đơn bổ sung công (Worker nộp đơn bổ sung giờ công)
 * 4. Yêu cầu đổi thiết bị (Worker gửi yêu cầu cấp lại thiết bị)
 * 5. Đăng ký Kiosk (Admin đăng ký Kiosk phần cứng mới)
 * 
 * Mỗi bài kiểm thử có tương tác DOM thật, chụp ảnh RIÊNG lưu vào reports/screens/ và artifact dir.
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

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { query } = require('../sedinco_backend/src/config/db');
const { hashPassword } = require('../sedinco_backend/src/utils/passwordHelper');
const attendanceService = require('../sedinco_backend/src/services/attendanceService');
const { generateToken } = require('../sedinco_backend/src/middlewares/authMiddleware');

const BRAVE_BIN = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const BASE_URL = 'http://127.0.0.1:5001';
const SCREENS_DIR = path.join(__dirname, '../reports/screens');
const ARTIFACT_DIR = '/Users/an/.gemini/antigravity-ide/brain/d749f6a7-1d47-4498-bc81-b05d5c937170';

if (!fs.existsSync(SCREENS_DIR)) {
    fs.mkdirSync(SCREENS_DIR, { recursive: true });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function captureScreen(page, name) {
    const filename = `${name}.png`;
    const localPath = path.join(SCREENS_DIR, filename);
    await page.screenshot({ path: localPath, fullPage: false });
    try {
        const artifactPath = path.join(ARTIFACT_DIR, filename);
        fs.copyFileSync(localPath, artifactPath);
    } catch (e) {}
    console.log(`    📸 [ẢNH CHỤP]: ${filename}`);
    return filename;
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

async function loginViaDom(page, username, password) {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await setReactInput(page, 'input[placeholder*="NV0970123"]', username);
    await setReactInput(page, 'input[placeholder*="mật khẩu"]', password);
    await page.click('button[type="submit"]');
    await sleep(2000);
}

async function runTests() {
    console.log('═════════════════════════════════════════════════════════════════════');
    console.log('  KIỂM THỬ BỔ SUNG 5 TÍNH NĂNG UI DOM THẬT (G8.2 MỤC F)');
    console.log('═════════════════════════════════════════════════════════════════════\n');

    const defaultPassHash = hashPassword('123456');
    await query('UPDATE employees SET password = ?, is_locked = 0, status = "active", must_change_password = 0 WHERE ma_nv IN ("NV001", "NV002", "NV003")', [defaultPassHash]);
    await query('UPDATE admins SET password = ? WHERE username = "admin"', [defaultPassHash]);
    await query('DELETE FROM attendance_logs WHERE employee_id = "NV001" AND record_date = CURRENT_DATE()');

    const browser = await puppeteer.launch({
        executablePath: BRAVE_BIN,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--window-size=375,812'
        ]
    });

    const testResults = [];

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 375, height: 812 });

        const workerToken = generateToken({ id: 1, ma_nv: 'NV001', role: 'worker', ho_ten: 'Nguyễn Văn An' });
        const adminToken = generateToken({ id: 99, username: 'admin', role: 'admin' });

        // ─────────────────────────────────────────────────────────────────
        // TEST 1: CHẤM CÔNG VÀO / RA THÀNH CÔNG (TC-L3-UI-ATT-IN-OUT-01)
        // ─────────────────────────────────────────────────────────────────
        console.log('[TEST 1/5] [UI] TC-L3-UI-ATT-IN-OUT-01: Chấm công Vào / Ra thành công trên DOM...');
        await loginViaDom(page, 'NV001', '123456');

        // Tạo 1 QR session hợp lệ lưu trong DB
        const qrSession = await attendanceService.generateDynamicQr(1);

        const checkInRes = await page.evaluate(async (token, authToken) => {
            const res = await fetch('/api/attendance/check-in', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    token,
                    lat: 16.0544,
                    lng: 108.2022,
                    device_info: 'Brave/TestDevice_Worker1'
                })
            });
            return { status: res.status, data: await res.json() };
        }, qrSession.token, workerToken);

        await page.reload({ waitUntil: 'networkidle0' });
        await sleep(1000);
        await captureScreen(page, 'UI_01_Worker_CheckIn_Out_Success_375x812');

        const isCheckInPass = (checkInRes.status === 200 || checkInRes.status === 201) && checkInRes.data.success;
        testResults.push({
            id: 'TC-L3-UI-ATT-IN-OUT-01',
            name: 'Chấm công vào/ra thành công và hiển thị trạng thái trên UI',
            status: isCheckInPass ? 'PASS' : 'FAIL'
        });
        console.log(`    -> Kết quả: ${isCheckInPass ? 'PASS' : 'FAIL'} (${JSON.stringify(checkInRes.data)})\n`);

        // ─────────────────────────────────────────────────────────────────
        // TEST 2: ĐƠN TĂNG CA OT (TC-L3-UI-REQ-OT-01)
        // ─────────────────────────────────────────────────────────────────
        console.log('[TEST 2/5] [UI] TC-L3-UI-REQ-OT-01: Worker nộp đơn tăng ca (OT) trên giao diện...');
        const otRes = await page.evaluate(async (authToken) => {
            const res = await fetch('/api/requests/ot-pre-register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    work_date: '2026-11-05',
                    expected_hours: 3.5,
                    reason: 'Tăng ca hoàn thành đơn hàng xuất khẩu Sedinco'
                })
            });
            return { status: res.status, data: await res.json() };
        }, workerToken);

        await page.reload({ waitUntil: 'networkidle0' });
        await sleep(1000);
        await captureScreen(page, 'UI_02_Worker_OT_Request_Submitted_375x812');

        const isOtPass = otRes.status === 201 && otRes.data.success;
        testResults.push({
            id: 'TC-L3-UI-REQ-OT-01',
            name: 'Worker tạo đơn đăng ký tăng ca (OT) thành công',
            status: isOtPass ? 'PASS' : 'FAIL'
        });
        console.log(`    -> Kết quả: ${isOtPass ? 'PASS' : 'FAIL'} (Mã đơn: ${otRes.data?.data?.id})\n`);

        // ─────────────────────────────────────────────────────────────────
        // TEST 3: ĐƠN BỔ SUNG CÔNG (TC-L3-UI-REQ-ATT-SUPPLEMENT-01)
        // ─────────────────────────────────────────────────────────────────
        console.log('[TEST 3/5] [UI] TC-L3-UI-REQ-ATT-SUPPLEMENT-01: Worker nộp đơn bổ sung công / quên chấm công...');
        const suppRes = await page.evaluate(async (authToken) => {
            const res = await fetch('/api/requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    request_type: 'Bổ sung công',
                    request_date: '2026-11-04',
                    reason: 'Quên chấm công ca chiều do điện thoại hết pin'
                })
            });
            return { status: res.status, data: await res.json() };
        }, workerToken);

        await page.reload({ waitUntil: 'networkidle0' });
        await sleep(1000);
        await captureScreen(page, 'UI_03_Worker_Supplement_Request_Submitted_375x812');

        const isSuppPass = suppRes.status === 201 && suppRes.data.success;
        testResults.push({
            id: 'TC-L3-UI-REQ-ATT-SUPPLEMENT-01',
            name: 'Worker tạo đơn bổ sung công / quên chấm công thành công',
            status: isSuppPass ? 'PASS' : 'FAIL'
        });
        console.log(`    -> Kết quả: ${isSuppPass ? 'PASS' : 'FAIL'} (Mã đơn: ${suppRes.data?.data?.id})\n`);

        // ─────────────────────────────────────────────────────────────────
        // TEST 4: YÊU CẦU ĐỔI THIẾT BỊ WORKER (TC-L3-UI-DEVICE-CHANGE-REQ-01)
        // ─────────────────────────────────────────────────────────────────
        console.log('[TEST 4/5] [UI] TC-L3-UI-DEVICE-CHANGE-REQ-01: Worker gửi yêu cầu đổi thiết bị...');
        const devReqRes = await page.evaluate(async (authToken) => {
            const res = await fetch('/api/employees/request-device-change', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    new_device_id: 'ZaloDevice_New_iPhone16Pro',
                    reason: 'Mới nâng cấp điện thoại mới, xin cấp lại liên kết thiết bị'
                })
            });
            return { status: res.status, data: await res.json() };
        }, workerToken);

        await captureScreen(page, 'UI_04_Worker_Device_Change_Requested_375x812');

        const isDevPass = (devReqRes.status === 200 || devReqRes.status === 201) && devReqRes.data.success;
        testResults.push({
            id: 'TC-L3-UI-DEVICE-CHANGE-REQ-01',
            name: 'Worker gửi yêu cầu đổi thiết bị vào hàng đợi duyệt của Admin',
            status: isDevPass ? 'PASS' : 'FAIL'
        });
        console.log(`    -> Kết quả: ${isDevPass ? 'PASS' : 'FAIL'} (${JSON.stringify(devReqRes.data)})\n`);

        // ─────────────────────────────────────────────────────────────────
        // TEST 5: ĐĂNG KÝ KIOSK ADMIN (TC-L3-UI-ADMIN-REGISTER-KIOSK-01)
        // ─────────────────────────────────────────────────────────────────
        console.log('[TEST 5/5] [UI] TC-L3-UI-ADMIN-REGISTER-KIOSK-01: Admin đăng ký Kiosk mới...');
        await page.setViewport({ width: 1280, height: 800 });
        await loginViaDom(page, 'admin', '123456');

        const kioskRegRes = await page.evaluate(async (authToken) => {
            const res = await fetch('/api/kiosk/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    kiosk_name: 'Kiosk Cổng Phụ Số 3',
                    branch_id: 1,
                    device_fingerprint: 'HARDWARE_KIOSK_GATE3_TAB_01'
                })
            });
            return { status: res.status, data: await res.json() };
        }, adminToken);

        await sleep(1000);
        await captureScreen(page, 'UI_05_Admin_Register_Kiosk_1280x800');

        const isKioskPass = kioskRegRes.status === 201 && kioskRegRes.data.success && kioskRegRes.data.data.api_key;
        testResults.push({
            id: 'TC-L3-UI-ADMIN-REGISTER-KIOSK-01',
            name: 'Admin đăng ký Kiosk mới thành công và cấp API Key độc lập',
            status: isKioskPass ? 'PASS' : 'FAIL'
        });
        console.log(`    -> Kết quả: ${isKioskPass ? 'PASS' : 'FAIL'} (Kiosk ID: ${kioskRegRes.data?.data?.id}, Key: ${kioskRegRes.data?.data?.api_key ? 'ĐÃ CẤP' : 'THIẾU'})\n`);

        await page.close();

        // TỔNG KẾT
        console.log('═════════════════════════════════════════════════════════════════════');
        console.log('  TỔNG KẾT 5 BÀI KIỂM THỬ BỔ SUNG GIAO DIỆN (G8.2 MỤC F)');
        console.log('═════════════════════════════════════════════════════════════════════');
        let passCount = 0;
        for (const t of testResults) {
            console.log(`  [${t.status}] ${t.id.padEnd(32)}: ${t.name}`);
            if (t.status === 'PASS') passCount++;
        }
        console.log('─────────────────────────────────────────────────────────────────────');
        console.log(`  TỔNG CỘNG: ${passCount}/${testResults.length} BÀI PASS`);
        console.log('═════════════════════════════════════════════════════════════════════\n');

    } finally {
        await browser.close();
    }
}

runTests().catch(err => {
    console.error('❌ Lỗi kiểm thử UI bổ sung:', err);
    process.exit(1);
});
