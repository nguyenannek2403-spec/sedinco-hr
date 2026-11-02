/**
 * Script đo đạc hiệu năng cơ sở (G0 / G3 Baseline Performance Benchmark)
 * Chạy trên CSDL TEST: sedinco_hr_test với 500 nhân viên mô phỏng
 */

const path = require('path');
require(path.join(__dirname, '../sedinco_backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../sedinco_backend/.env') });
process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '123456';
process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'sedinco_test_jwt_secret_super_secure_32chars_min';

const app = require('../sedinco_backend/src/app');
const { pool, query } = require('../sedinco_backend/src/config/db');

let server;
let baseUrl;

async function request(path, options = {}) {
    const start = process.hrtime.bigint();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (options.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
    }
    const res = await fetch(`${baseUrl}${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    let data;
    try {
        data = await res.json();
    } catch {
        data = null;
    }
    return { status: res.status, data, durationMs };
}

function calcPercentiles(durations) {
    durations.sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.50)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const min = durations[0];
    const max = durations[durations.length - 1];
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    return { min, max, avg, p50, p95 };
}

async function runBenchmark() {
    await new Promise(resolve => {
        server = app.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });

    console.log(`================================================================`);
    console.log(`🚀 BẮT ĐẦU ĐO ĐẠC ĐƯỜNG CƠ SỞ HIỆU NĂNG (G0/G3 BASELINE)`);
    console.log(`Server: ${baseUrl} | DB: sedinco_hr_test (500 nhân viên)`);
    console.log(`================================================================\n`);

    const ITERATIONS = 30; // 30 mẫu cho mỗi endpoint

    // 1. Đăng nhập Admin
    const adminLoginRes = await request('/api/admin/login', {
        method: 'POST',
        body: { username: 'admin', password: '123456' }
    });
    const adminToken = adminLoginRes.data?.data?.token;

    // 2. Đăng nhập Worker (NV003)
    const workerLoginRes = await request('/api/login', {
        method: 'POST',
        body: { ma_nv: 'NV003', password: '123456' }
    });
    const workerToken = workerLoginRes.data?.data?.token;

    // -------------------------------------------------------------
    // BENCHMARK 1: Đăng nhập nhân viên (POST /api/login)
    // -------------------------------------------------------------
    console.log(`1. Đo hiệu năng Đăng nhập nhân viên (POST /api/login)...`);
    const loginDurations = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const res = await request('/api/login', {
            method: 'POST',
            body: { ma_nv: 'NV003', password: '123456' }
        });
        loginDurations.push(res.durationMs);
    }
    const loginStats = calcPercentiles(loginDurations);
    console.log(`   -> p50: ${loginStats.p50.toFixed(2)} ms | p95: ${loginStats.p95.toFixed(2)} ms | Avg: ${loginStats.avg.toFixed(2)} ms`);

    // -------------------------------------------------------------
    // BENCHMARK 2: Chấm công Check-in (POST /api/attendance/check-in)
    // -------------------------------------------------------------
    console.log(`2. Đo hiệu năng Check-in (POST /api/attendance/check-in)...`);
    const checkInDurations = [];
    for (let i = 0; i < ITERATIONS; i++) {
        // Sinh QR token mới cho mỗi lần check-in
        const qrRes = await request('/api/attendance/dynamic-qr', { token: adminToken });
        const qrToken = qrRes.data?.data?.token;

        const res = await request('/api/attendance/check-in', {
            method: 'POST',
            token: workerToken,
            body: {
                token: qrToken,
                lat: 16.0544,
                lng: 108.2022,
                device_info: `test-device-${i}`
            }
        });
        checkInDurations.push(res.durationMs);
    }
    const checkInStats = calcPercentiles(checkInDurations);
    console.log(`   -> p50: ${checkInStats.p50.toFixed(2)} ms | p95: ${checkInStats.p95.toFixed(2)} ms | Avg: ${checkInStats.avg.toFixed(2)} ms`);

    // -------------------------------------------------------------
    // BENCHMARK 3: Ma trận chấm công toàn công ty (GET /api/attendance)
    // Dữ liệu: 500 nhân viên x 31 ngày = 15.500 logs
    // -------------------------------------------------------------
    console.log(`3. Đo hiệu năng Bảng công ma trận (GET /api/attendance?month=10&year=2026)...`);
    const matrixDurations = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const res = await request('/api/attendance?month=10&year=2026', { token: adminToken });
        matrixDurations.push(res.durationMs);
    }
    const matrixStats = calcPercentiles(matrixDurations);
    console.log(`   -> p50: ${matrixStats.p50.toFixed(2)} ms | p95: ${matrixStats.p95.toFixed(2)} ms | Avg: ${matrixStats.avg.toFixed(2)} ms`);

    // -------------------------------------------------------------
    // BENCHMARK 4: Bảng lương toàn công ty (GET /api/payroll)
    // -------------------------------------------------------------
    console.log(`4. Đo hiệu năng Bảng lương tổng hợp (GET /api/payroll?month=10&year=2026)...`);
    const payrollDurations = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const res = await request('/api/payroll?month=10&year=2026', { token: adminToken });
        payrollDurations.push(res.durationMs);
    }
    const payrollStats = calcPercentiles(payrollDurations);
    console.log(`   -> p50: ${payrollStats.p50.toFixed(2)} ms | p95: ${payrollStats.p95.toFixed(2)} ms | Avg: ${payrollStats.avg.toFixed(2)} ms`);

    // -------------------------------------------------------------
    // BENCHMARK 5: Danh sách đơn từ (GET /api/requests)
    // -------------------------------------------------------------
    console.log(`5. Đo hiệu năng Danh sách đơn từ (GET /api/requests)...`);
    const reqDurations = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const res = await request('/api/requests', { token: adminToken });
        reqDurations.push(res.durationMs);
    }
    const reqStats = calcPercentiles(reqDurations);
    console.log(`   -> p50: ${reqStats.p50.toFixed(2)} ms | p95: ${reqStats.p95.toFixed(2)} ms | Avg: ${reqStats.avg.toFixed(2)} ms`);

    // -------------------------------------------------------------
    // BENCHMARK 6: Duyệt đơn (PUT /api/requests/:id)
    // -------------------------------------------------------------
    console.log(`6. Đo hiệu năng Duyệt đơn từ (PUT /api/requests/:id)...`);
    const approveDurations = [];
    // Lấy 1 đơn pending của worker khác
    const pendingRequests = await query("SELECT id FROM requests WHERE status = 'pending' AND employee_id != 'NV001' LIMIT 30");
    for (let i = 0; i < Math.min(ITERATIONS, pendingRequests.length); i++) {
        const reqId = pendingRequests[i].id;
        const res = await request(`/api/requests/${reqId}`, {
            method: 'PUT',
            token: adminToken,
            body: { status: 'approved' }
        });
        approveDurations.push(res.durationMs);
    }
    const approveStats = approveDurations.length > 0 ? calcPercentiles(approveDurations) : { p50: 0, p95: 0, avg: 0 };
    console.log(`   -> p50: ${approveStats.p50.toFixed(2)} ms | p95: ${approveStats.p95.toFixed(2)} ms | Avg: ${approveStats.avg.toFixed(2)} ms`);

    console.log(`\n================================================================`);
    console.log(`📊 TỔNG HỢP CHỈ SỐ ĐƯỜNG CƠ SỞ HIỆU NĂNG (G0/G3 BASELINE)`);
    console.log(`================================================================`);
    const summary = [
        { Chức_năng: 'Đăng nhập (POST /api/login)', p50: `${loginStats.p50.toFixed(2)} ms`, p95: `${loginStats.p95.toFixed(2)} ms`, queries: '~2 queries' },
        { Chức_năng: 'Check-in QR (POST /api/attendance/check-in)', p50: `${checkInStats.p50.toFixed(2)} ms`, p95: `${checkInStats.p95.toFixed(2)} ms`, queries: '~8 queries' },
        { Chức_năng: 'Ma trận công 31 ngày (GET /api/attendance)', p50: `${matrixStats.p50.toFixed(2)} ms`, p95: `${matrixStats.p95.toFixed(2)} ms`, queries: '2 queries (500 NV x 31 ngày)' },
        { Chức_năng: 'Bảng lương 500 NV (GET /api/payroll)', p50: `${payrollStats.p50.toFixed(2)} ms`, p95: `${payrollStats.p95.toFixed(2)} ms`, queries: '~3 queries' },
        { Chức_năng: 'Danh sách đơn từ (GET /api/requests)', p50: `${reqStats.p50.toFixed(2)} ms`, p95: `${reqStats.p95.toFixed(2)} ms`, queries: '1 query' },
        { Chức_năng: 'Duyệt đơn từ (PUT /api/requests/:id)', p50: `${approveStats.p50.toFixed(2)} ms`, p95: `${approveStats.p95.toFixed(2)} ms`, queries: '~4 queries' }
    ];
    console.table(summary);

    if (server) {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        await new Promise(r => server.close(r));
    }
    if (pool && pool.end) {
        await new Promise(r => pool.end(r));
    }
}

runBenchmark().catch(err => {
    console.error('❌ Lỗi Benchmark:', err);
    process.exit(1);
});
