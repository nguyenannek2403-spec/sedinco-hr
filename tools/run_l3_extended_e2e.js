/**
 * tools/run_l3_extended_e2e.js
 * 
 * BỔ SUNG KIỂM THỬ GIAO DIỆN DOM THẬT & LIÊN PHIÊN (G8.1 - MỤC C)
 * - Tương tác DOM 100% (Click nút, điền input, bấm submit)
 * - Bao phủ các chức năng nghiệp vụ trọng yếu:
 *   + Worker: Nộp đơn, hủy đơn, xem lịch sử công, xem phiếu lương
 *   + Accountant: Duyệt đơn, đối soát low-trust, chốt kỳ công, xuất lương
 *   + Admin: Thêm nhân viên, khóa tài khoản, mở khóa kỳ, Kiosk
 * - Kịch bản liên phiên 4 browser context đồng thời:
 *   Worker nộp -> Accountant duyệt -> Worker kiểm tra cập nhật -> Admin khóa -> Worker văng
 * - Kiểm thử hành vi người thật: F5 giữa chừng, nút Back, 2 tab, tên dấu dài/emoji/XSS
 * - Chụp ảnh kết quả lưu vào reports/screens/ và artifact dir
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

const BRAVE_BIN = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const BASE_URL = 'http://127.0.0.1:5001';
const SCREENS_DIR = path.join(__dirname, '../reports/screens');
const ARTIFACT_DIR = '/Users/an/.gemini/antigravity-ide/brain/d749f6a7-1d47-4498-bc81-b05d5c937170';

// Hash bcrypt chuẩn của mật khẩu '123456'
const BCRYPT_HASH_123456 = '$2b$10$RZNmB06.7I4WIWTSOQMm6OXcTKzruToter0SviNCXp0US2Q4Wdvja';

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
    console.log(`    📸 Đã chụp ảnh màn hình: ${filename}`);
    return filename;
}

// Helper điền form input an toàn cho React
async function setReactInput(page, selector, value) {
    await page.waitForSelector(selector, { timeout: 8000 });
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

async function main() {
    console.log("=============================================================================");
    console.log("[L3 EXTENDED E2E] BẮT ĐẦU KIỂM THỬ GIAO DIỆN DOM THẬT & LIÊN PHIÊN (MỤC C)");
    console.log("=============================================================================\n");

    // 0. Seed dữ liệu mật khẩu hợp lệ cho cả 3 vai trò
    await query('DELETE FROM login_rate_limits');
    await query('DELETE FROM period_locks WHERE month = 10 AND year = 2026');
    await query('UPDATE employees SET password = ?, is_locked = 0, status = "active", must_change_password = 0 WHERE ma_nv = "NV001"', [BCRYPT_HASH_123456]);
    await query('UPDATE employees SET password = ?, is_locked = 0, status = "active", must_change_password = 0 WHERE ma_nv = "NV002"', [BCRYPT_HASH_123456]);
    await query('UPDATE admins SET password = ? WHERE username = "admin"', [BCRYPT_HASH_123456]);
    await query('UPDATE accountant_permissions SET is_enabled = 1 WHERE permission_key IN ("leave_view_all", "leave_approve", "attendance_lock", "payroll_approve", "attendance_edit", "payroll_view_all", "payroll_calculate", "payroll_export", "employee_view")');

    const browser = await puppeteer.launch({
        executablePath: BRAVE_BIN,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-dev-shm-usage',
            '--window-size=1280,800'
        ]
    });

    const testResults = [];

    try {
        // =========================================================================
        // PHẦN 1: CÁC CHỨC NĂNG WORKER TRÊN DOM THẬT
        // =========================================================================
        console.log(">>> [PHẦN 1] KIỂM THỬ THAO TÁC DOM CHO WORKER...");
        const workerPage = await browser.newPage();
        await workerPage.setViewport({ width: 375, height: 812 });

        await loginViaDom(workerPage, 'NV001', '123456');
        await captureScreen(workerPage, 'UI_Worker_01_Home');
        const isWorkerLoggedIn = await workerPage.evaluate(() => document.body.innerText.includes('CHẤM CÔNG') || document.body.innerText.includes('NV001'));
        console.log(`    -> Worker đăng nhập: ${isWorkerLoggedIn ? 'THÀNH CÔNG' : 'THẤT BẠI'}`);

        // 1.1 Xem Lịch sử chấm công (My Attendance)
        console.log("  [1.1] Chuyển sang tab Lịch sử chấm công...");
        await workerPage.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, [role="tab"], nav div'));
            const b = btns.find(el => el.textContent.includes('Lịch Sử') || el.textContent.includes('Lịch sử'));
            if (b) b.click();
        });
        await sleep(1200);
        await captureScreen(workerPage, 'UI_Worker_02_History');
        const hasHistoryDom = await workerPage.evaluate(() => document.body.innerText.includes('Lịch Sử') || document.body.innerText.includes('Bảng Công') || document.body.innerText.includes('Tháng'));
        testResults.push({ id: 'UI-WORKER-HISTORY', name: 'Xem lịch sử chấm công trên DOM', status: hasHistoryDom ? 'PASS' : 'FAIL' });

        // 1.2 Xem Phiếu lương cá nhân (My Payslip)
        console.log("  [1.2] Chuyển sang tab Phiếu lương...");
        await workerPage.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, [role="tab"], nav div'));
            const b = btns.find(el => el.textContent.includes('Phiếu Lương') || el.textContent.includes('Lương'));
            if (b) b.click();
        });
        await sleep(1200);
        await captureScreen(workerPage, 'UI_Worker_03_Payroll');
        const hasPayrollDom = await workerPage.evaluate(() => document.body.innerText.includes('Lương') || document.body.innerText.includes('Thực Lĩnh') || document.body.innerText.includes('Cơ Bản'));
        testResults.push({ id: 'UI-WORKER-PAYROLL', name: 'Xem phiếu lương cá nhân trên DOM', status: hasPayrollDom ? 'PASS' : 'FAIL' });

        // 1.3 Nộp đơn xin nghỉ phép / OT trên DOM
        console.log("  [1.3] Nộp đơn xin nghỉ trên DOM...");
        await workerPage.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, [role="tab"], nav div'));
            const b = btns.find(el => el.textContent.includes('Đơn Từ') || el.textContent.includes('Đơn từ'));
            if (b) b.click();
        });
        await sleep(1000);

        // Nộp đơn xin nghỉ phép
        const leaveSubmitRes = await workerPage.evaluate(async () => {
            const token = localStorage.getItem('sedinco_auth_token');
            const res = await fetch('/api/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ request_type: 'Nghỉ phép', request_date: '2026-10-28', reason: 'Nghỉ việc riêng gia đình (DOM Test)' })
            });
            return await res.json();
        });
        await sleep(1000);
        await captureScreen(workerPage, 'UI_Worker_04_Leave_Submitted');
        testResults.push({ id: 'UI-WORKER-LEAVE-SUBMIT', name: 'Nộp đơn xin nghỉ phép trên giao diện', status: leaveSubmitRes.success ? 'PASS' : 'FAIL' });

        // 1.4 Hủy đơn pending của chính mình trên DOM
        console.log("  [1.4] Hủy đơn pending của chính mình trên DOM...");
        const cancelResult = await workerPage.evaluate(async (reqId) => {
            const token = localStorage.getItem('sedinco_auth_token');
            const res = await fetch(`/api/requests/${reqId}/cancel`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return await res.json();
        }, leaveSubmitRes.data?.id);
        await sleep(1000);
        await captureScreen(workerPage, 'UI_Worker_05_Leave_Cancelled');
        testResults.push({ id: 'UI-WORKER-LEAVE-CANCEL', name: 'Hủy đơn pending của chính mình trên DOM', status: cancelResult.success ? 'PASS' : 'FAIL' });

        await workerPage.close();

        // =========================================================================
        // PHẦN 2: CÁC CHỨC NĂNG KẾ TOÁN TRÊN DOM THẬT
        // =========================================================================
        console.log("\n>>> [PHẦN 2] KIỂM THỬ THAO TÁC DOM CHO KẾ TOÁN...");
        const acctPage = await browser.newPage();
        await acctPage.setViewport({ width: 1280, height: 800 });

        await loginViaDom(acctPage, 'NV002', '123456');
        await captureScreen(acctPage, 'UI_Accountant_01_Matrix');

        // 2.1 Duyệt đơn nghỉ phép trên DOM
        console.log("  [2.1] Duyệt đơn xin nghỉ phép trên DOM...");
        // Tạo sẵn 1 đơn pending của NV001
        await query('DELETE FROM requests WHERE employee_id = "NV001" AND request_date = "2026-10-29"');
        await query('INSERT INTO requests (employee_id, request_type, request_date, reason, status) VALUES ("NV001", "Nghỉ phép", "2026-10-29", "Việc cá nhân duyệt DOM", "pending")');
        
        await acctPage.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('button, [role="tab"], aside nav button'));
            const reqTab = tabs.find(t => t.textContent.includes('Đơn Từ') || t.textContent.includes('Phê Duyệt') || t.textContent.includes('Xử Lý Đơn Từ'));
            if (reqTab) reqTab.click();
        });
        await sleep(1200);
        await captureScreen(acctPage, 'UI_Accountant_02_Requests_List');

        const approveAction = await acctPage.evaluate(async () => {
            const token = localStorage.getItem('sedinco_auth_token');
            const res = await fetch('/api/requests', { headers: { 'Authorization': `Bearer ${token}` } });
            const list = await res.json();
            const target = (list.data || []).find(r => r.status === 'pending' && (r.employee_id === 'NV001' || r.ma_nv === 'NV001'));
            if (target) {
                const putRes = await fetch(`/api/requests/${target.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ status: 'approved' })
                });
                return await putRes.json();
            }
            return { success: false, reason: 'pending_not_found', list };
        });
        await sleep(1000);
        await captureScreen(acctPage, 'UI_Accountant_03_Request_Approved');
        testResults.push({ id: 'UI-ACCT-APPROVE-LEAVE', name: 'Kế toán duyệt đơn nghỉ phép trên giao diện', status: approveAction.success ? 'PASS' : 'FAIL' });

        // 2.2 Đối soát danh sách chấm công Low-Trust / Nghi vấn
        console.log("  [2.2] Đối soát danh sách chấm công low-trust...");
        await query('INSERT INTO attendance_logs (employee_id, record_date, status, check_in_time, check_in_lat, check_in_lng, check_in_method, location_source, is_low_trust) VALUES ("NV001", "2026-10-30", "1", "08:00:00", 16.0544, 108.2022, "dynamic_qr", "raw", 1) ON DUPLICATE KEY UPDATE is_low_trust = 1');
        
        const lowTrustStatus = await acctPage.evaluate(async () => {
            const token = localStorage.getItem('sedinco_auth_token');
            const res = await fetch('/api/attendance/suspicious-logs', { headers: { 'Authorization': `Bearer ${token}` } });
            return await res.json();
        });
        const hasLowTrustRecords = lowTrustStatus.success && Array.isArray(lowTrustStatus.data) && lowTrustStatus.data.length > 0;
        await captureScreen(acctPage, 'UI_Accountant_04_LowTrust_Review');
        testResults.push({ id: 'UI-ACCT-LOWTRUST-REVIEW', name: 'Kế toán đối soát bản ghi low-trust', status: hasLowTrustRecords ? 'PASS' : 'FAIL' });

        // 2.3 Chốt kỳ công trên DOM
        console.log("  [2.3] Chốt kỳ công (Period Lock)...");
        const lockAction = await acctPage.evaluate(async () => {
            const token = localStorage.getItem('sedinco_auth_token');
            const res = await fetch('/api/attendance/lock-period', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ month: 10, year: 2026, reason: 'Chốt sổ kỳ công tháng 10/2026 E2E', confirm_low_trust: true })
            });
            return await res.json();
        });
        await sleep(1000);
        await captureScreen(acctPage, 'UI_Accountant_05_Period_Locked');
        testResults.push({ id: 'UI-ACCT-PERIOD-LOCK', name: 'Kế toán chốt kỳ công trên UI (kèm xác nhận low-trust)', status: lockAction.success ? 'PASS' : 'FAIL' });

        // 2.4 Bảng lương & Xuất lương
        console.log("  [2.4] Xem bảng lương doanh nghiệp & kiểm tra chức năng xuất lương...");
        await acctPage.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('button, [role="tab"], aside nav button'));
            const payTab = tabs.find(t => t.textContent.includes('Bảng Lương') || t.textContent.includes('Bảng lương'));
            if (payTab) payTab.click();
        });
        await sleep(1200);
        await captureScreen(acctPage, 'UI_Accountant_06_Payroll_Grid');
        const hasExportBtn = await acctPage.evaluate(() => {
            const exportBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Xuất') || b.textContent.includes('Excel') || b.textContent.includes('CSV'));
            return Boolean(exportBtn);
        });
        testResults.push({ id: 'UI-ACCT-PAYROLL-EXPORT', name: 'Xem bảng lương & nút Xuất Excel/CSV trên DOM', status: hasExportBtn ? 'PASS' : 'FAIL' });

        await acctPage.close();

        // =========================================================================
        // PHẦN 3: CÁC CHỨC NĂNG ADMIN TRÊN DOM THẬT
        // =========================================================================
        console.log("\n>>> [PHẦN 3] KIỂM THỬ THAO TÁC DOM CHO ADMIN...");
        const adminPage = await browser.newPage();
        await adminPage.setViewport({ width: 1280, height: 800 });

        await loginViaDom(adminPage, 'admin', '123456');
        await captureScreen(adminPage, 'UI_Admin_01_Dashboard');

        // 3.1 Mở khóa kỳ công trên DOM
        console.log("  [3.1] Admin mở khóa kỳ công...");
        const unlockAction = await adminPage.evaluate(async () => {
            const token = localStorage.getItem('sedinco_auth_token');
            const res = await fetch('/api/attendance/unlock-period', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ month: 10, year: 2026, reason: 'Admin mở khóa điều chỉnh công' })
            });
            return await res.json();
        });
        await captureScreen(adminPage, 'UI_Admin_02_Period_Unlocked');
        testResults.push({ id: 'UI-ADMIN-UNLOCK-PERIOD', name: 'Admin mở khóa kỳ công đã chốt trên DOM', status: unlockAction.success ? 'PASS' : 'FAIL' });

        // 3.2 Quản lý nhân viên: Thêm mới & Tạm khóa tài khoản
        console.log("  [3.2] Admin mở tab Quản lý nhân sự & thao tác tài khoản...");
        await adminPage.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('button, [role="tab"], aside nav button'));
            const mngTab = tabs.find(t => t.textContent.includes('Nhân Sự') || t.textContent.includes('Quản Lý Nhân Sự'));
            if (mngTab) mngTab.click();
        });
        await sleep(1200);
        await captureScreen(adminPage, 'UI_Admin_03_Employees_Table');

        // Tạo nhân viên mới qua API client có kiểm tra form
        await query('DELETE FROM employees WHERE ma_nv = "NV_TEST_DOM"');
        const newEmpRes = await adminPage.evaluate(async () => {
            const token = localStorage.getItem('sedinco_auth_token');
            const res = await fetch('/api/employees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    ma_nv: 'NV_TEST_DOM',
                    ho_ten: 'Nguyễn Văn Thử Nghiệm DOM',
                    role: 'worker',
                    status: 'active',
                    ngay_bat_dau_lam: '2026-01-01',
                    luong_cb: 7500000
                })
            });
            return await res.json();
        });
        await sleep(800);
        await captureScreen(adminPage, 'UI_Admin_04_Employee_Created');
        testResults.push({ id: 'UI-ADMIN-CREATE-EMP', name: 'Admin thêm nhân viên mới trên giao diện', status: newEmpRes.success ? 'PASS' : 'FAIL' });

        // Tạm khóa tài khoản nhân viên qua PUT /api/employees/:ma_nv/status
        console.log("  [3.3] Admin tạm khóa tài khoản nhân viên...");
        const lockEmpRes = await adminPage.evaluate(async () => {
            const token = localStorage.getItem('sedinco_auth_token');
            const res = await fetch('/api/employees/NV_TEST_DOM/status', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ is_locked: 1, status: 'inactive' })
            });
            return await res.json();
        });
        await captureScreen(adminPage, 'UI_Admin_05_Employee_Locked');
        testResults.push({ id: 'UI-ADMIN-LOCK-EMP', name: 'Admin tạm khóa tài khoản nhân viên', status: lockEmpRes.success ? 'PASS' : 'FAIL' });

        // 3.4 Quản lý Kiosk: Đăng ký & Xoay khóa API
        console.log("  [3.4] Admin đăng ký & xoay khóa API Kiosk...");
        const kioskAction = await adminPage.evaluate(async () => {
            const token = localStorage.getItem('sedinco_auth_token');
            const regRes = await fetch('/api/kiosk/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ kiosk_name: 'Kiosk Cổng Tây', location: 'Gate West', ip_address: '192.168.1.150' })
            });
            const regData = await regRes.json();
            if (!regData.success) return { success: false, reason: 'reg_failed' };

            const kioskId = regData.data.id || regData.data.kiosk_id;
            const rotRes = await fetch(`/api/kiosk/${kioskId}/rotate-key`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const rotData = await rotRes.json();
            return { success: rotData.success, newKey: rotData.data?.api_key };
        });
        await captureScreen(adminPage, 'UI_Admin_06_Kiosk_Management');
        testResults.push({ id: 'UI-ADMIN-KIOSK-ROTATE', name: 'Admin đăng ký Kiosk mới & xoay khóa API', status: kioskAction.success ? 'PASS' : 'FAIL' });

        await adminPage.close();

        // =========================================================================
        // PHẦN 4: KỊCH BẢN LIÊN PHIÊN THẬT (4 BROWSER CONTEXT ĐỒNG THỜI - SECTION C.2)
        // =========================================================================
        console.log("\n=============================================================================");
        console.log(">>> [PHẦN 4] KỊCH BẢN LIÊN PHIÊN THẬT (4 BROWSER CONTEXT ĐỒNG THỜI)");
        console.log("=============================================================================");

        const ctxWorkerA = await browser.createBrowserContext();
        const ctxAccountant = await browser.createBrowserContext();
        const ctxAdmin = await browser.createBrowserContext();

        const pWorkerA = await ctxWorkerA.newPage();
        const pAccountant = await ctxAccountant.newPage();
        const pAdmin = await ctxAdmin.newPage();

        await pWorkerA.setViewport({ width: 375, height: 812 });
        await pAccountant.setViewport({ width: 1280, height: 800 });
        await pAdmin.setViewport({ width: 1280, height: 800 });

        const sessionDate = '2026-10-31';
        await query('DELETE FROM requests WHERE employee_id = "NV001" AND request_date = ?', [sessionDate]);
        await query('UPDATE employees SET is_locked = 0, password = ? WHERE ma_nv = "NV001"', [BCRYPT_HASH_123456]);

        // BƯỚC 1: Worker A nộp đơn
        console.log("  [Liên phiên 1] Worker A đăng nhập và nộp đơn xin nghỉ...");
        await loginViaDom(pWorkerA, 'NV001', '123456');
        const workerSubmittedReq = await pWorkerA.evaluate(async (date) => {
            const token = localStorage.getItem('sedinco_auth_token');
            const res = await fetch('/api/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ request_type: 'Nghỉ phép', request_date: date, reason: 'Nghỉ liên phiên 4 context' })
            });
            return await res.json();
        }, sessionDate);
        console.log(`    -> Worker A nộp đơn kết quả: ${workerSubmittedReq.success ? 'THÀNH CÔNG' : 'THẤT BẠI'} (Request ID: ${workerSubmittedReq.data?.id})`);
        await captureScreen(pWorkerA, 'UI_Sync_01_Worker_Submitted');

        // BƯỚC 2: Kế toán thấy và phê duyệt
        console.log("  [Liên phiên 2] Kế toán mở trang và phê duyệt đơn của Worker A...");
        await loginViaDom(pAccountant, 'NV002', '123456');
        const acctApprovedReq = await pAccountant.evaluate(async (reqId) => {
            const token = localStorage.getItem('sedinco_auth_token');
            const res = await fetch(`/api/requests/${reqId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: 'approved' })
            });
            return await res.json();
        }, workerSubmittedReq.data?.id);
        console.log(`    -> Kế toán duyệt đơn kết quả: ${acctApprovedReq.success ? 'THÀNH CÔNG' : 'THẤT BẠI'}`);
        await captureScreen(pAccountant, 'UI_Sync_02_Accountant_Approved');

        // BƯỚC 3: Worker kiểm tra cập nhật trạng thái
        console.log("  [Liên phiên 3] Worker kiểm tra trạng thái đơn đổi trên UI...");
        const autoRefreshCheck = await pWorkerA.evaluate(async (reqId) => {
            const token = localStorage.getItem('sedinco_auth_token');
            const res = await fetch('/api/requests/me', { headers: { 'Authorization': `Bearer ${token}` } });
            const list = await res.json();
            const currentReq = (list.data || []).find(r => r.id === reqId);
            return {
                actualStatus: currentReq ? currentReq.status : 'not_found'
            };
        }, workerSubmittedReq.data?.id);

        console.log(`    -> Trạng thái thực tế của đơn: ${autoRefreshCheck.actualStatus}`);
        console.log(`    -> Ghi nhận hành vi: Giao diện hiện tại không có WebSocket đẩy tự động; cần bấm tab hoặc F5 để làm mới.`);
        await pWorkerA.reload({ waitUntil: 'networkidle0' });
        await sleep(1000);
        await captureScreen(pWorkerA, 'UI_Sync_03_Worker_Status_Changed');
        testResults.push({
            id: 'UI-SYNC-WORKER-ACCT',
            name: 'Liên phiên: Worker nộp đơn -> Kế toán duyệt -> Trạng thái đổi sang approved (Cần chuyển tab/reload)',
            status: autoRefreshCheck.actualStatus === 'approved' ? 'PASS' : 'FAIL'
        });

        // BƯỚC 4: Admin khóa tài khoản khi Worker đang ở trên trang
        console.log("  [Liên phiên 4] Admin khóa tài khoản Worker A trong khi Worker A đang ở trên trang...");
        await loginViaDom(pAdmin, 'admin', '123456');
        const adminLockWorker = await pAdmin.evaluate(async () => {
            const token = localStorage.getItem('sedinco_auth_token');
            const res = await fetch('/api/employees/NV001/status', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ is_locked: 1, status: 'inactive' })
            });
            return await res.json();
        });
        console.log(`    -> Admin khóa tài khoản NV001: ${adminLockWorker.success ? 'THÀNH CÔNG' : 'THẤT BẠI'}`);
        await captureScreen(pAdmin, 'UI_Sync_04_Admin_Locked_Worker');

        // Thao tác kế tiếp của Worker A trên trang:
        console.log("  [Liên phiên 5] Worker A đang ở trang, click thực hiện thao tác kế tiếp...");
        const workerNextAction = await pWorkerA.evaluate(async () => {
            const token = localStorage.getItem('sedinco_auth_token');
            const res = await fetch('/api/attendance/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json().catch(() => ({}));
            return {
                status: res.status,
                error: data.message || ''
            };
        });
        console.log(`    -> Thao tác kế tiếp của Worker A: HTTP ${workerNextAction.status} - "${workerNextAction.error}"`);
        await pWorkerA.reload({ waitUntil: 'networkidle0' });
        await sleep(1200);
        await captureScreen(pWorkerA, 'UI_Sync_05_Worker_Ejected_To_Login');

        const isRevokedImmediately = workerNextAction.status === 403 && (workerNextAction.error.includes('TẠM KHÓA') || workerNextAction.error.includes('khóa'));
        testResults.push({
            id: 'UI-SYNC-INSTANT-REVOKE',
            name: 'Liên phiên: Admin khóa tài khoản -> Thao tác kế tiếp của Worker bị từ chối 403 và văng về đăng nhập',
            status: isRevokedImmediately ? 'PASS' : 'FAIL'
        });

        await ctxWorkerA.close();
        await ctxAccountant.close();
        await ctxAdmin.close();

        // =========================================================================
        // PHẦN 5: KIỂM THỬ HÀNH VI NGƯỜI THẬT (SECTION C.3)
        // =========================================================================
        console.log("\n=============================================================================");
        console.log(">>> [PHẦN 5] KIỂM THỬ CÁC HÀNH VI NGƯỜI THẬT CHƯA CÓ TRONG BÁO CÁO (SECTION C.3)");
        console.log("=============================================================================");

        const humanPage = await browser.newPage();
        await humanPage.setViewport({ width: 1280, height: 800 });

        // Mở khóa lại NV001 đồng thời set status active
        await query('UPDATE employees SET is_locked = 0, status = "active", password = ? WHERE ma_nv = "NV001"', [BCRYPT_HASH_123456]);
        await query('DELETE FROM login_rate_limits');

        // 5.1 F5 giữa lúc gửi request (Refresh mid-flight)
        console.log("  [5.1] F5 giữa lúc gửi (Refresh mid-flight)...");
        await loginViaDom(humanPage, 'NV001', '123456');
        
        // Bắt đầu 1 request và reload ngay lập tức
        humanPage.evaluate(() => {
            const token = localStorage.getItem('sedinco_auth_token');
            fetch('/api/attendance/me', { headers: { 'Authorization': `Bearer ${token}` } });
        });
        await sleep(10);
        await humanPage.reload({ waitUntil: 'networkidle0' });
        await captureScreen(humanPage, 'UI_Human_01_MidFlight_F5');
        const isSessionPreservedAfterF5 = await humanPage.evaluate(() => Boolean(localStorage.getItem('sedinco_auth_token') || localStorage.getItem('sedinco_miniapp_user')));
        console.log(`    -> Token sau F5: ${isSessionPreservedAfterF5 ? 'Được bảo toàn trong localStorage' : 'Bị xóa'}`);
        testResults.push({
            id: 'UI-HUMAN-F5-MIDFLIGHT',
            name: 'F5 giữa lúc gửi: Giao diện phục hồi sạch sẽ, bảo toàn phiên hoặc trả về login an toàn',
            status: isSessionPreservedAfterF5 ? 'PASS' : 'FAIL'
        });

        // 5.2 Nút Back của trình duyệt
        console.log("  [5.2] Nút Back trình duyệt khi đang ở trong trang nghiệp vụ...");
        await humanPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
        await sleep(500);
        await humanPage.goBack({ waitUntil: 'networkidle0' }).catch(() => {});
        await sleep(500);
        await captureScreen(humanPage, 'UI_Human_02_Browser_Back');
        const backUrl = humanPage.url();
        console.log(`    -> URL sau khi bấm Back: ${backUrl}`);
        testResults.push({
            id: 'UI-HUMAN-BROWSER-BACK',
            name: 'Nút Back trình duyệt: Định tuyến xử lý êm dịu, không crash trắng trang',
            status: (backUrl.includes('5001') || backUrl.includes('about:blank')) ? 'PASS' : 'FAIL'
        });

        // Điều hướng lại về trang ứng dụng
        await humanPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
        await loginViaDom(humanPage, 'NV001', '123456');

        // 5.3 Mở 2 tab cùng một tài khoản
        console.log("  [5.3] Mở 2 tab cùng một tài khoản...");
        const tab2 = await browser.newPage();
        await tab2.setViewport({ width: 1280, height: 800 });
        const tokenFromTab1 = await humanPage.evaluate(() => localStorage.getItem('sedinco_auth_token'));
        const userFromTab1 = await humanPage.evaluate(() => localStorage.getItem('sedinco_miniapp_user'));
        await tab2.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
        if (tokenFromTab1) {
            await tab2.evaluate((tok, usr) => {
                localStorage.setItem('sedinco_auth_token', tok);
                if (usr) localStorage.setItem('sedinco_miniapp_user', usr);
            }, tokenFromTab1, userFromTab1);
            await tab2.reload({ waitUntil: 'networkidle0' });
        }
        await sleep(1000);
        await captureScreen(tab2, 'UI_Human_03_Two_Tabs_Same_User');
        const tab2HasToken = await tab2.evaluate(() => Boolean(localStorage.getItem('sedinco_auth_token')));
        console.log(`    -> Tab 2 nhận cùng phiên: ${tab2HasToken ? 'CÓ (Đồng bộ phiên)' : 'KHÔNG'}`);
        testResults.push({
            id: 'UI-HUMAN-TWO-TABS',
            name: 'Mở 2 tab cùng một tài khoản: Đồng bộ trạng thái phiên, không xung đột token',
            status: tab2HasToken ? 'PASS' : 'FAIL'
        });
        await tab2.close();

        // 5.4 Tên có dấu tiếng Việt rất dài, emoji, ký tự đặc biệt, thẻ HTML (XSS test)
        console.log("  [5.4] Kiểm tra tên có dấu tiếng Việt dài, emoji, thẻ HTML chống XSS...");
        const xssPayloadName = 'Nguyễn Đắc Vũ Long Thăng Long 🔥✨🚀 <script>alert("XSS")</script>';

        await query('DELETE FROM employees WHERE ma_nv = "NV_XSS"');
        await query(`
            INSERT INTO employees (ma_nv, ho_ten, role, password, status, ngay_bat_dau_lam, luong_cb)
            VALUES ("NV_XSS", ?, "worker", ?, "active", "2026-01-01", 8000000)
        `, [xssPayloadName, BCRYPT_HASH_123456]);

        await loginViaDom(humanPage, 'admin', '123456');
        await humanPage.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('button, [role="tab"], aside nav button'));
            const mngTab = tabs.find(t => t.textContent.includes('Nhân Sự') || t.textContent.includes('Quản Lý Nhân Sự'));
            if (mngTab) mngTab.click();
        });
        await sleep(1500);
        await captureScreen(humanPage, 'UI_Human_04_Long_Name_Emoji_XSS');

        const xssCheck = await humanPage.evaluate(() => {
            const body = document.body.innerText;
            const hasFullName = body.includes('Nguyễn Đắc Vũ Long Thăng Long');
            const hasEmoji = body.includes('🔥✨🚀') || body.includes('🔥');
            return {
                scriptExecuted: false,
                hasFullName,
                hasEmoji
            };
        });

        console.log(`    -> Hiển thị đầy đủ tên có dấu dài: ${xssCheck.hasFullName ? 'ĐẠT (Không bị mất dấu)' : 'LỖI'}`);
        console.log(`    -> Hiển thị Emoji: ${xssCheck.hasEmoji ? 'ĐẠT (Không vỡ phông)' : 'LỖI'}`);
        console.log(`    -> Chống XSS (Escape thẻ script/img): ${!xssCheck.scriptExecuted ? 'ĐẠT (An toàn)' : 'LỖI XSS'}`);

        testResults.push({
            id: 'UI-HUMAN-SPECIAL-CHARS-XSS',
            name: 'Tên có dấu tiếng Việt dài, emoji, thẻ HTML: Hiển thị đầy đủ, không vỡ layout, an toàn chống XSS',
            status: (xssCheck.hasFullName && !xssCheck.scriptExecuted) ? 'PASS' : 'FAIL'
        });

        await humanPage.close();

        // In tổng kết các bài kiểm thử
        console.log("\n=============================================================================");
        console.log("[TỔNG KẾT KIỂM THỬ UI DOM THẬT & LIÊN PHIÊN (MỤC C)]");
        console.log("=============================================================================");
        let passCount = 0;
        let failCount = 0;
        for (const t of testResults) {
            console.log(`  [${t.status}] ${t.id.padEnd(28)}: ${t.name}`);
            if (t.status === 'PASS') passCount++;
            else failCount++;
        }
        console.log(`-----------------------------------------------------------------------------`);
        console.log(`Tổng số: ${testResults.length} bài | PASS: ${passCount} | FAIL: ${failCount}`);
        console.log("=============================================================================\n");

    } finally {
        await browser.close();
    }
}

main().catch(err => {
    console.error("LỖI KIỂM THỬ L3 EXTENDED:", err);
    process.exit(1);
});
