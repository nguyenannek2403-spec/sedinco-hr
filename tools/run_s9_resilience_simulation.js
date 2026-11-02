/**
 * tools/run_s9_resilience_simulation.js
 * 
 * Mô phỏng S9: Kiểm thử Khả năng chịu lỗi & Phục hồi hệ thống
 * 1. Chạy 2 tiến trình Backend song song (Cổng 5001 & Cổng 5002), kiểm tra chia sẻ Rate limit và phiên QR động
 * 2. Restart backend giữa lúc gửi request chấm công (đo đạc hành vi client & CSDL)
 * 3. Ngắt MySQL 10s (đóng băng qua SIGSTOP/SIGCONT PID mysqld), ghi nhận lỗi hiển thị và khả năng tự phục hồi
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const { query, pool } = require('../sedinco_backend/src/config/db');

const BCRYPT_HASH_123456 = '$2b$10$RZNmB06.7I4WIWTSOQMm6OXcTKzruToter0SviNCXp0US2Q4Wdvja';

function httpRequest(url, options = {}, body = null) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const reqOptions = {
            hostname: u.hostname,
            port: u.port,
            path: u.pathname + u.search,
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: options.timeout || 5000
        };

        const req = http.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed, raw: data });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', err => resolve({ error: err.message, code: err.code }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ error: 'TIMEOUT', code: 'ETIMEDOUT' });
        });

        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
    console.log("=============================================================================");
    console.log("[S9 RESILIENCE SIMULATION] KIỂM THỬ KHẢ NĂNG CHỊU LỖI & PHỤC HỒI HỆ THỐNG");
    console.log("=============================================================================\n");

    const s9Results = {};

    // Chuẩn bị tài khoản test S9
    const testEmp = 'NV_S9_TEST';
    await query('DELETE FROM employees WHERE ma_nv = ?', [testEmp]);
    await query(`
        INSERT INTO employees (ma_nv, ho_ten, chuc_danh, role, status, is_locked, password, ngay_bat_dau_lam, luong_cb)
        VALUES (?, 'S9 Resilience Worker', 'Công nhân may', 'worker', 'active', 0, ?, '2026-01-01', 8000000)
    `, [testEmp, BCRYPT_HASH_123456]);
    await query('DELETE FROM login_rate_limits WHERE identifier = ? OR key_name LIKE ?', [testEmp, `%${testEmp}%`]);
    await query('DELETE FROM attendance_logs WHERE employee_id = ?', [testEmp]);

    let adminToken = '';
    const loginAdminInit = await httpRequest('http://127.0.0.1:5001/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { username: 'admin', password: '123456' });
    adminToken = loginAdminInit.data?.data?.token;

    // -------------------------------------------------------------------------
    // HẠNG MỤC 1: CHẠY 2 TIẾN TRÌNH BACKEND SONG SONG (CỔNG 5001 & CỔNG 5002)
    // -------------------------------------------------------------------------
    console.log(">>> [HẠNG MỤC 1] KHỞI ĐỘNG 2 TIẾN TRÌNH BACKEND (PORT 5001 & PORT 5002)...");
    
    // Khởi động instance 2 trên port 5002
    const backend2 = spawn('node', ['src/server.js'], {
        cwd: path.join(__dirname, '../sedinco_backend'),
        env: { ...process.env, PORT: '5002', NODE_ENV: 'test', DB_NAME: 'sedinco_hr_test' },
        stdio: 'pipe'
    });

    let backend2Started = false;
    backend2.stdout.on('data', data => {
        if (data.toString().includes('5002') || data.toString().includes('chạy')) {
            backend2Started = true;
        }
    });

    // Chờ backend 2 sẵn sàng (tối đa 4s)
    for (let i = 0; i < 20; i++) {
        await sleep(200);
        const ping = await httpRequest('http://127.0.0.1:5002/');
        if (ping.status === 200) {
            backend2Started = true;
            break;
        }
    }
    console.log(`  -> Instance 1: http://127.0.0.1:5001 (ĐANG CHẠY)`);
    console.log(`  -> Instance 2: http://127.0.0.1:5002 (${backend2Started ? 'KHỞI ĐỘNG THÀNH CÔNG' : 'CHƯA SẴN SÀNG'})`);

    if (backend2Started) {
        // Kiểm tra chia sẻ Rate limit: Gửi 3 lần sai vào Port 5001, gửi tiếp 3 lần sai vào Port 5002
        console.log("  -> Kiểm tra chia sẻ bộ đếm Rate Limit giữa 2 tiến trình:");
        await httpRequest('http://127.0.0.1:5001/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { ma_nv: testEmp, password: 'wrong_1' });
        await httpRequest('http://127.0.0.1:5001/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { ma_nv: testEmp, password: 'wrong_2' });
        await httpRequest('http://127.0.0.1:5001/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { ma_nv: testEmp, password: 'wrong_3' });

        const resP2_1 = await httpRequest('http://127.0.0.1:5002/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { ma_nv: testEmp, password: 'wrong_4' });
        const resP2_2 = await httpRequest('http://127.0.0.1:5002/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { ma_nv: testEmp, password: 'wrong_5' });
        const resP2_3 = await httpRequest('http://127.0.0.1:5002/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { ma_nv: testEmp, password: 'wrong_6' });

        const isLockedOnP2 = (resP2_3.data && resP2_3.data.message && resP2_3.data.message.includes('tạm khóa')) || resP2_3.status === 429;
        console.log(`     Lần 4 trên Port 5002: HTTP ${resP2_1.status} - ${resP2_1.data?.message}`);
        console.log(`     Lần 5 trên Port 5002: HTTP ${resP2_2.status} - ${resP2_2.data?.message}`);
        console.log(`     Lần 6 trên Port 5002: HTTP ${resP2_3.status} - ${resP2_3.data?.message} (${isLockedOnP2 ? 'ĐÃ KHÓA DO CHIA SẺ RATE LIMIT QUA MYSQL' : 'Chưa khóa'})`);

        // Kiểm tra phiên QR: Sinh mã QR trên Port 5001, chấm công trên Port 5002
        console.log("  -> Kiểm tra sinh QR trên Port 5001 -> Quét chấm công trên Port 5002:");
        // Mở khóa NV test
        await query('DELETE FROM login_rate_limits WHERE identifier = ? OR key_name LIKE ?', [testEmp, `%${testEmp}%`]);
        const loginEmp = await httpRequest('http://127.0.0.1:5001/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { ma_nv: testEmp, password: '123456' });
        const empToken = loginEmp.data?.data?.token;

        const qrGen = await httpRequest('http://127.0.0.1:5001/api/attendance/dynamic-qr', { headers: { 'Authorization': `Bearer ${adminToken}` } });
        const qrToken = qrGen.data?.data?.token || qrGen.data?.token;

        const checkInCross = await httpRequest('http://127.0.0.1:5002/api/attendance/check-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${empToken}` }
        }, {
            token: qrToken,
            lat: 16.0544,
            lng: 108.2022
        });

        console.log(`     Kết quả chấm công liên tiến trình (P5001 -> P5002): HTTP ${checkInCross.status} - ${checkInCross.data?.message || checkInCross.raw}`);
        const crossOk = checkInCross.status === 200 && checkInCross.data?.success === true;
        s9Results['S9_01_MULTI_PROCESS'] = (isLockedOnP2 && crossOk) ? 'PASS' : 'FAIL';
    } else {
        s9Results['S9_01_MULTI_PROCESS'] = 'FAIL (Cannot start port 5002)';
    }

    // Tắt instance 2
    backend2.kill();

    // -------------------------------------------------------------------------
    // HẠNG MỤC 2: RESTART BACKEND GIỮA LÚC CHẤM CÔNG
    // -------------------------------------------------------------------------
    console.log("\n>>> [HẠNG MỤC 2] RESTART BACKEND GIỮA LÚC GỬI REQUEST CHẤM CÔNG...");
    // Khởi tạo một tiến trình con riêng biệt trên cổng 5003 để kiểm tra restart an toàn không chạm 5001
    const backend3 = spawn('node', ['src/server.js'], {
        cwd: path.join(__dirname, '../sedinco_backend'),
        env: { ...process.env, PORT: '5003', NODE_ENV: 'test', DB_NAME: 'sedinco_hr_test' },
        stdio: 'pipe'
    });

    for (let i = 0; i < 20; i++) {
        await sleep(200);
        const ping = await httpRequest('http://127.0.0.1:5003/');
        if (ping.status === 200) break;
    }

    // Lấy token và QR
    const loginEmp3 = await httpRequest('http://127.0.0.1:5003/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { ma_nv: testEmp, password: '123456' });
    const empToken3 = loginEmp3.data?.data?.token;

    const qrGen3 = await httpRequest('http://127.0.0.1:5001/api/attendance/dynamic-qr', { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const qrToken3 = qrGen3.data?.data?.token || qrGen3.data?.token;

    // Gửi request dở dang (partial chunk) và lập tức gửi SIGKILL để ngắt kết nối giữa chừng
    console.log("  -> Gửi request dở dang và lập tức gửi SIGKILL tới backend (Mô phỏng đứt socket giữa chừng)...");
    const checkInPromise = new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 5003,
            path: '/api/attendance/check-in',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${empToken3}`,
                'Content-Length': '1024'
            },
            timeout: 2000
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, raw: data }));
        });

        req.on('error', err => resolve({ error: err.message, code: err.code }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ error: 'TIMEOUT', code: 'ETIMEDOUT' });
        });

        req.write('{"token":"' + qrToken3 + '","lat":16.0544');
        // Ngắt tiến trình ngay giữa lúc truyền body
        process.nextTick(() => backend3.kill('SIGKILL'));
    });

    const checkInAbortedRes = await checkInPromise;
    console.log(`  -> Phản hồi từ socket client khi backend bị sập:`, checkInAbortedRes);

    // Khởi động lại backend3
    console.log("  -> Khởi động lại backend và kiểm tra tính toàn vẹn CSDL...");
    const backend3Restored = spawn('node', ['src/server.js'], {
        cwd: path.join(__dirname, '../sedinco_backend'),
        env: { ...process.env, PORT: '5003', NODE_ENV: 'test', DB_NAME: 'sedinco_hr_test' },
        stdio: 'pipe'
    });

    for (let i = 0; i < 20; i++) {
        await sleep(200);
        const ping = await httpRequest('http://127.0.0.1:5003/');
        if (ping.status === 200) break;
    }

    // Gửi lại request sau khi backend phục hồi
    const qrGen3_new = await httpRequest('http://127.0.0.1:5001/api/attendance/dynamic-qr', { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const qrToken3_new = qrGen3_new.data?.data?.token || qrGen3_new.data?.token;
    const retryCheckIn = await httpRequest('http://127.0.0.1:5003/api/attendance/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${empToken3}` }
    }, {
        token: qrToken3_new,
        lat: 16.0544,
        lng: 108.2022
    });

    console.log(`  -> Request gửi lại sau khi khởi động: HTTP ${retryCheckIn.status} - ${retryCheckIn.data?.message}`);
    backend3Restored.kill();

    const isMidFlightInterrupted = Boolean(checkInAbortedRes.error || checkInAbortedRes.code || checkInAbortedRes.status >= 500);
    const isRecovered = retryCheckIn.status === 200 && retryCheckIn.data?.success === true;
    s9Results['S9_02_RESTART_MID_FLIGHT'] = (isMidFlightInterrupted && isRecovered) ? 'PASS' : 'FAIL';

    // -------------------------------------------------------------------------
    // HẠNG MỤC 3: NGẮT MYSQL 10S RỒI KHÔI PHỤC (DÁN LOG THỰC TẾ)
    // -------------------------------------------------------------------------
    console.log("\n>>> [HẠNG MỤC 3] ĐÓNG BĂNG MYSQL 10 GIÂY BẰNG SIGSTOP VÀ KHÔI PHỤC BẰNG SIGCONT...");
    // Tìm PID của mysqld
    let mysqlPid = null;
    try {
        const pgrepOut = execSync("pgrep -f '[m]ysqld ' || pgrep mysqld").toString().trim();
        const pids = pgrepOut.split(/\s+/).filter(Boolean);
        mysqlPid = pids[pids.length - 1]; // PID chính
    } catch (e) {
        mysqlPid = null;
    }

    if (mysqlPid) {
        console.log(`  -> Tìm thấy PID mysqld: ${mysqlPid}`);
        console.log(`  -> Đang gửi lệnh kill -STOP ${mysqlPid} (Đóng băng dịch vụ MySQL)...`);
        execSync(`kill -STOP ${mysqlPid}`);
        console.log(`  [LOG] MySQL đã bị ĐÓNG BĂNG lúc: ${new Date().toISOString()}`);

        // Gửi request API trong lúc MySQL bị đóng băng
        console.log("  -> Gửi request GET /api/attendance/period-status trong lúc MySQL đóng băng (timeout 2s)...");
        const freezeStart = Date.now();
        const frozenReqRes = await httpRequest('http://127.0.0.1:5001/api/attendance/period-status?month=10&year=2026', { timeout: 2500 });
        console.log(`  [LOG DÁN THỰC TẾ] Phản hồi trong lúc MySQL chết:`);
        console.log(`       Status/Error: ${frozenReqRes.error || frozenReqRes.status}`);
        console.log(`       Code: ${frozenReqRes.code || 'HTTP'}`);
        console.log(`       Thời gian chờ: ${Date.now() - freezeStart} ms`);

        // Chờ đủ 10 giây đóng băng
        const elapsed = Date.now() - freezeStart;
        if (elapsed < 10000) {
            console.log(`  -> Đang duy trì trạng thái đóng băng thêm ${(10000 - elapsed) / 1000}s...`);
            await sleep(10000 - elapsed);
        }

        console.log(`  -> Đang gửi lệnh kill -CONT ${mysqlPid} (Khôi phục dịch vụ MySQL)...`);
        execSync(`kill -CONT ${mysqlPid}`);
        console.log(`  [LOG] MySQL đã được KHÔI PHỤC lúc: ${new Date().toISOString()}`);

        // Chờ 1 giây cho MySQL ổn định socket
        await sleep(1000);

        // Gửi request kiểm tra khả năng tự phục hồi
        const recoveryStart = Date.now();
        const recoveredReq = await httpRequest('http://127.0.0.1:5001/api/attendance/period-status?month=10&year=2026');
        console.log(`  [LOG DÁN THỰC TẾ] Phản hồi ngay sau khi MySQL khôi phục:`);
        console.log(`       HTTP Status: ${recoveredReq.status}`);
        console.log(`       Data: ${JSON.stringify(recoveredReq.data)}`);
        console.log(`       Thời gian đáp ứng: ${Date.now() - recoveryStart} ms`);

        const freezeOk = (frozenReqRes.error === 'TIMEOUT' || frozenReqRes.code === 'ETIMEDOUT' || frozenReqRes.status >= 500) && recoveredReq.status === 200;
        s9Results['S9_03_MYSQL_10S_DOWN'] = freezeOk ? 'PASS' : 'FAIL';
    } else {
        console.log("  -> Không tìm thấy PID mysqld để giả lập SIGSTOP.");
        s9Results['S9_03_MYSQL_10S_DOWN'] = 'KHÔNG KIỂM CHỨNG ĐƯỢC';
    }

    // Dọn dẹp
    await query('DELETE FROM employees WHERE ma_nv = ?', [testEmp]);
    await query('DELETE FROM login_rate_limits WHERE identifier = ? OR key_name LIKE ?', [testEmp, `%${testEmp}%`]);
    await query('DELETE FROM attendance_logs WHERE employee_id = ?', [testEmp]);

    console.log("\n=============================================================================");
    console.log("[TỔNG KẾT KIỂM THỬ S9 (RESILIENCE)]");
    console.log("=============================================================================");
    for (const [k, v] of Object.entries(s9Results)) {
        console.log(`  [${v}] ${k}`);
    }
    console.log("=============================================================================\n");

    await pool.end();
}

main().catch(err => {
    console.error("LỖI S9 RESILIENCE:", err);
    process.exit(1);
});
