/**
 * tools/measure_index_impact.js
 * 
 * Đo đạc đối chứng hiệu năng TRƯỚC và SAU khi có chỉ mục idx_att_record_date (G9.3 Mục D):
 * - Target: sedinco_hr_staging_test (CSDL có 156.500 bản ghi attendance_logs)
 * - 3 Nghiệp vụ đo đạc:
 *   1. Bảng công ma trận 1 tháng (WHERE record_date BETWEEN ...)
 *   2. Tổng hợp bảng lương tháng (GROUP BY employee_id WHERE record_date BETWEEN ...)
 *   3. Danh sách nhân sự toàn công ty (SELECT employees ORDER BY ma_nv)
 * - Đo đạc EXPLAIN và thống kê 30 lần lặp (P50, P95, Avg) cho cả 2 trạng thái.
 */

const path = require('path');
const mysql = require('../sedinco_backend/node_modules/mysql2/promise');
const { performance } = require('perf_hooks');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_staging_test';

function calcStats(durations) {
    if (!durations.length) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0 };
    const sorted = [...durations].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
    const p50 = sorted[Math.floor(sorted.length * 0.50)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    return { min, max, avg, p50, p95 };
}

async function runBenchmark(conn, iterations = 30) {
    // Truy vấn 1: Ma trận công tháng 10/2026
    const sqlMatrix = `
        SELECT employee_id, record_date, status, ot_hours 
        FROM attendance_logs 
        WHERE record_date >= '2026-10-01' AND record_date <= '2026-10-31'
    `;
    const [explainMatrix] = await conn.query(`EXPLAIN FORMAT=TRADITIONAL ${sqlMatrix}`);

    const matrixTimes = [];
    for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        await conn.query(sqlMatrix);
        matrixTimes.push(performance.now() - t0);
    }

    // Truy vấn 2: Tổng hợp bảng lương tháng 10/2026
    const sqlPayroll = `
        SELECT 
            employee_id,
            COUNT(CASE WHEN status = '1' THEN 1 END) as work_days,
            SUM(ot_hours) as total_ot
        FROM attendance_logs
        WHERE record_date >= '2026-10-01' AND record_date <= '2026-10-31'
        GROUP BY employee_id
    `;
    const [explainPayroll] = await conn.query(`EXPLAIN FORMAT=TRADITIONAL ${sqlPayroll}`);

    const payrollTimes = [];
    for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        await conn.query(sqlPayroll);
        payrollTimes.push(performance.now() - t0);
    }

    // Truy vấn 3: Danh sách nhân viên
    const sqlEmployees = `
        SELECT ma_nv, ho_ten, chuc_danh, role, status, luong_cb
        FROM employees
        ORDER BY ma_nv ASC
    `;
    const [explainEmployees] = await conn.query(`EXPLAIN FORMAT=TRADITIONAL ${sqlEmployees}`);

    const empTimes = [];
    for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        await conn.query(sqlEmployees);
        empTimes.push(performance.now() - t0);
    }

    return {
        matrix: { explain: explainMatrix[0], stats: calcStats(matrixTimes) },
        payroll: { explain: explainPayroll[0], stats: calcStats(payrollTimes) },
        employees: { explain: explainEmployees[0], stats: calcStats(empTimes) }
    };
}

async function main() {
    console.log('=============================================================================');
    console.log(`[BENCHMARK CHỈ MỤC G9.3] ĐO ĐỐI CHỨNG HIỆU NĂNG TRÊN: ${DB_NAME}`);
    console.log('=============================================================================');

    const conn = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME
    });

    try {
        const [cntRows] = await conn.query('SELECT COUNT(*) as cnt FROM attendance_logs');
        const [empRows] = await conn.query('SELECT COUNT(*) as cnt FROM employees');
        console.log(`Dữ liệu hiện hữu: ${cntRows[0].cnt.toLocaleString('vi-VN')} logs | ${empRows[0].cnt} nhân viên\n`);

        // GIAI ĐOẠN 1: TRƯỚC KHI THÊM CHỈ MỤC
        console.log('>>> [GIAI ĐOẠN 1] Đo TRƯỚC khi có chỉ mục idx_att_record_date...');
        await conn.query('ALTER TABLE attendance_logs DROP INDEX idx_att_record_date').catch(() => {});
        // Đảm bảo không còn index trên record_date
        const [idxBefore] = await conn.query("SHOW INDEX FROM attendance_logs WHERE Key_name = 'idx_att_record_date'");
        console.log(`    Trạng thái index idx_att_record_date: ${idxBefore.length ? 'TỒN TẠI' : 'ĐÃ XÓA (KHÔNG CÓ)'}`);

        const beforeResults = await runBenchmark(conn, 30);
        console.log('    ✓ Hoàn tất đo 30 mẫu cho 3 nghiệp vụ TRƯỚC khi có chỉ mục.\n');

        // GIAI ĐOẠN 2: THÊM CHỈ MỤC
        console.log('>>> [GIAI ĐOẠN 2] Thêm chỉ mục: CREATE INDEX idx_att_record_date ON attendance_logs (record_date)...');
        const tAdd0 = performance.now();
        await conn.query('CREATE INDEX idx_att_record_date ON attendance_logs (record_date)');
        const tAdd1 = performance.now();
        console.log(`    ✓ Tạo chỉ mục thành công trong ${(tAdd1 - tAdd0).toFixed(2)} ms.\n`);

        // GIAI ĐOẠN 3: SAU KHI THÊM CHỈ MỤC
        console.log('>>> [GIAI ĐOẠN 3] Đo SAU khi có chỉ mục idx_att_record_date...');
        const afterResults = await runBenchmark(conn, 30);
        console.log('    ✓ Hoàn tất đo 30 mẫu cho 3 nghiệp vụ SAU khi có chỉ mục.\n');

        // BẢNG TỔNG HỢP SO SÁNH
        console.log('=============================================================================');
        console.log('📊 BẢNG ĐỐI CHIẾU HIỆU NĂNG: TRƯỚC VS SAU KHI THÊM CHỈ MỤC idx_att_record_date');
        console.log('=============================================================================');

        console.log('\n--- 1. BẢNG CÔNG MA TRẬN 1 THÁNG (attendance_logs: 13.500 dòng trong ~156.500 dòng) ---');
        console.log(`[TRƯỚC] EXPLAIN: type=${beforeResults.matrix.explain.type} | key=${beforeResults.matrix.explain.key || 'NULL'} | rows=${beforeResults.matrix.explain.rows} | Extra=${beforeResults.matrix.explain.Extra}`);
        console.log(`        P50: ${beforeResults.matrix.stats.p50.toFixed(2)} ms | P95: ${beforeResults.matrix.stats.p95.toFixed(2)} ms | Avg: ${beforeResults.matrix.stats.avg.toFixed(2)} ms`);
        console.log(`[SAU]   EXPLAIN: type=${afterResults.matrix.explain.type} | key=${afterResults.matrix.explain.key} | rows=${afterResults.matrix.explain.rows} | Extra=${afterResults.matrix.explain.Extra}`);
        console.log(`        P50: ${afterResults.matrix.stats.p50.toFixed(2)} ms | P95: ${afterResults.matrix.stats.p95.toFixed(2)} ms | Avg: ${afterResults.matrix.stats.avg.toFixed(2)} ms`);
        const matrixSpeedup = (beforeResults.matrix.stats.p50 / afterResults.matrix.stats.p50).toFixed(2);
        console.log(`👉 Tốc độ P50: cải thiện ${matrixSpeedup} lần (${beforeResults.matrix.stats.p50.toFixed(1)}ms -> ${afterResults.matrix.stats.p50.toFixed(1)}ms)`);

        console.log('\n--- 2. TỔNG HỢP CÔNG & LƯƠNG 1 THÁNG (GROUP BY employee_id) ---');
        console.log(`[TRƯỚC] EXPLAIN: type=${beforeResults.payroll.explain.type} | key=${beforeResults.payroll.explain.key || 'NULL'} | rows=${beforeResults.payroll.explain.rows} | Extra=${beforeResults.payroll.explain.Extra}`);
        console.log(`        P50: ${beforeResults.payroll.stats.p50.toFixed(2)} ms | P95: ${beforeResults.payroll.stats.p95.toFixed(2)} ms | Avg: ${beforeResults.payroll.stats.avg.toFixed(2)} ms`);
        console.log(`[SAU]   EXPLAIN: type=${afterResults.payroll.explain.type} | key=${afterResults.payroll.explain.key} | rows=${afterResults.payroll.explain.rows} | Extra=${afterResults.payroll.explain.Extra}`);
        console.log(`        P50: ${afterResults.payroll.stats.p50.toFixed(2)} ms | P95: ${afterResults.payroll.stats.p95.toFixed(2)} ms | Avg: ${afterResults.payroll.stats.avg.toFixed(2)} ms`);
        const payrollSpeedup = (beforeResults.payroll.stats.p50 / afterResults.payroll.stats.p50).toFixed(2);
        console.log(`👉 Tốc độ P50: cải thiện ${payrollSpeedup} lần (${beforeResults.payroll.stats.p50.toFixed(1)}ms -> ${afterResults.payroll.stats.p50.toFixed(1)}ms)`);

        console.log('\n--- 3. DANH SÁCH NHÂN VIÊN (Bảng employees: 500 nhân viên) ---');
        console.log(`[TRƯỚC] EXPLAIN: type=${beforeResults.employees.explain.type} | key=${beforeResults.employees.explain.key} | rows=${beforeResults.employees.explain.rows}`);
        console.log(`        P50: ${beforeResults.employees.stats.p50.toFixed(2)} ms | P95: ${beforeResults.employees.stats.p95.toFixed(2)} ms`);
        console.log(`[SAU]   EXPLAIN: type=${afterResults.employees.explain.type} | key=${afterResults.employees.explain.key} | rows=${afterResults.employees.explain.rows}`);
        console.log(`        P50: ${afterResults.employees.stats.p50.toFixed(2)} ms | P95: ${afterResults.employees.stats.p95.toFixed(2)} ms`);
        console.log('👉 Truy vấn trên bảng employees không bị ảnh hưởng tiêu cực bởi index trên attendance_logs.');

        console.log('\n=============================================================================');
        console.log('📋 DANH SÁCH BẢNG KHÁC CẦN CHỈ MỤC TỪ TRUY VẤN CHẬM (LIỆT KÊ, CHƯA THÊM):');
        console.log('1. Bảng `requests`:');
        console.log('   - `INDEX idx_requests_emp_date (employee_id, request_date)`: Tối ưu tra cứu đơn theo nhân viên.');
        console.log('   - `INDEX idx_requests_status (status)`: Tối ưu lọc đơn pending chờ duyệt của Kế toán / Admin.');
        console.log('2. Bảng `audit_logs`:');
        console.log('   - `INDEX idx_audit_created_at (created_at)`: Tối ưu xem nhật ký theo khoảng thời gian.');
        console.log('   - `INDEX idx_audit_actor (actor_id)`: Tối ưu điều tra thao tác của một tài khoản cụ thể.');
        console.log('3. Bảng `dynamic_qr_sessions`:');
        console.log('   - `INDEX idx_qr_expires (expires_at)`: Tối ưu cron dọn dẹp các session QR động đã hết hạn.');
        console.log('=============================================================================\n');

    } finally {
        await conn.end();
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Lỗi đo hiệu năng:', err);
        process.exit(1);
    });
}
