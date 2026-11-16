/**
 * Phase 6 Local Scale Benchmark (50 / 100 / 200 employees on LOCAL sedinco_hr_test ONLY)
 * Measures P50 / P95 / P99 latency for attendance matrix, monthly payroll, batch approve, audit logs
 * plus SQL EXPLAIN plans. Never connects to or mutates TiDB Cloud.
 */
process.env.NODE_ENV = 'test';

const { dbConfig, pool, query } = require('../../sedinco_backend/src/config/db');
const attendanceService = require('../../sedinco_backend/src/services/attendanceService');
const payrollService = require('../../sedinco_backend/src/services/payrollService');
const requestService = require('../../sedinco_backend/src/services/requestService');
const permissionService = require('../../sedinco_backend/src/services/permissionService');
const { bcryptWorkerPool } = require('../../sedinco_backend/src/utils/bcryptWorkerPool');

function assertLocalTestDb() {
    const host = String(dbConfig.host || '').toLowerCase();
    const dbName = String(dbConfig.database || '');
    const isLocalHost = host === '127.0.0.1' || host === 'localhost';
    const isTestDb = dbName === 'sedinco_hr_test';
    const hasSsl = Boolean(dbConfig.ssl);
    if (!isLocalHost || !isTestDb || hasSsl) {
        throw new Error(
            `REFUSING benchmark against non-local/non-test DB! host=${host}, db=${dbName}, ssl=${hasSsl}`
        );
    }
}

function percentile(sortedMs, p) {
    if (!sortedMs.length) return 0;
    const idx = Math.min(sortedMs.length - 1, Math.max(0, Math.ceil((p / 100) * sortedMs.length) - 1));
    return Number(sortedMs[idx].toFixed(2));
}

async function benchOp(iterations, fn) {
    // 1 warmup run outside measured quantiles
    await fn();
    const samples = [];
    for (let i = 0; i < iterations; i++) {
        const t0 = process.hrtime.bigint();
        await fn();
        const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
        samples.push(elapsedMs);
    }
    samples.sort((a, b) => a - b);
    return {
        iterations,
        p50_ms: percentile(samples, 50),
        p95_ms: percentile(samples, 95),
        p99_ms: percentile(samples, 99),
        min_ms: Number(samples[0].toFixed(2)),
        max_ms: Number(samples[samples.length - 1].toFixed(2))
    };
}

async function seedScaleCohort(runId, totalCount, trackedMaNvs, trackedRequestIds) {
    const startIdx = trackedMaNvs.length;
    const needed = totalCount - startIdx;
    if (needed <= 0) return;

    const passwordHash = '$2b$10$QABenchmarkDummyHashNotForLogin00000000000000000000000';
    const empValues = [];
    const empPlaceholders = [];
    const newIds = [];

    for (let i = 0; i < needed; i++) {
        const idx = startIdx + i + 1;
        const maNv = `${runId}_E${String(idx).padStart(3, '0')}`.slice(0, 32);
        trackedMaNvs.push(maNv);
        newIds.push(maNv);
        empPlaceholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)');
        empValues.push(
            maNv,
            `Benchmark Emp ${idx}`,
            'worker',
            'Xưởng Cơ Khí',
            'Thợ lắp đặt',
            12000000,
            'active',
            passwordHash,
            '2024-01-01',
            'DEFAULT_8H'
        );
    }
    await query(
        `INSERT INTO employees (ma_nv, ho_ten, role, department, chuc_danh, luong_cb, status, password, ngay_chinh_thuc, shift_type, is_locked, has_insurance) VALUES ${empPlaceholders.join(',')}`,
        empValues
    );

    // Seed 22 workdays in 2097-05 per employee in bulk chunks
    const logRows = [];
    for (const maNv of newIds) {
        for (let d = 1; d <= 22; d++) {
            const dd = String(d).padStart(2, '0');
            logRows.push([maNv, `2097-05-${dd}`, '08:00:00', '17:30:00', d % 5 === 0 ? '1/OT' : '1', d % 5 === 0 ? 2 : 0, d % 7 === 0 ? 10 : 0, 8, 'OFFICE']);
        }
    }
    for (let i = 0; i < logRows.length; i += 400) {
        const chunk = logRows.slice(i, i + 400);
        const ph = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
        await query(
            `INSERT INTO attendance_logs (employee_id, record_date, check_in_time, check_out_time, status, ot_hours, late_minutes, work_hours, work_location_type) VALUES ${ph}`,
            chunk.flat()
        );
    }

    // Seed 1 pending request per employee (for batchApprove benchmark)
    for (const maNv of newIds) {
        const res = await query(
            `INSERT INTO requests (employee_id, request_type, request_date, reason, status) VALUES (?, 'P', '2097-05-24', 'Benchmark Leave', 'pending')`,
            [maNv]
        );
        if (res && res.insertId) trackedRequestIds.push(res.insertId);
    }
}

async function cleanupScaleCohort(trackedMaNvs, trackedRequestIds) {
    if (trackedRequestIds.length > 0) {
        for (let i = 0; i < trackedRequestIds.length; i += 200) {
            const chunk = trackedRequestIds.slice(i, i + 200);
            const ph = chunk.map(() => '?').join(',');
            await query(`DELETE FROM requests WHERE id IN (${ph})`, chunk).catch(() => {});
        }
    }
    if (trackedMaNvs.length > 0) {
        for (let i = 0; i < trackedMaNvs.length; i += 100) {
            const chunk = trackedMaNvs.slice(i, i + 100);
            const ph = chunk.map(() => '?').join(',');
            await query(`DELETE FROM attendance_logs WHERE employee_id IN (${ph})`, chunk).catch(() => {});
            await query(`DELETE FROM requests WHERE employee_id IN (${ph})`, chunk).catch(() => {});
            await query(`DELETE FROM audit_logs WHERE actor_id IN (${ph}) OR target_id IN (${ph})`, [...chunk, ...chunk]).catch(() => {});
            await query(`DELETE FROM employees WHERE ma_nv IN (${ph})`, chunk).catch(() => {});
        }
    }
}

async function main() {
    assertLocalTestDb();
    const runId = `BM${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const trackedMaNvs = [];
    const trackedRequestIds = [];
    const results = [];

    try {
        // Ensure at least 1 admin actor exists
        const adminActor = { id: 1, ma_nv: `${runId}_ADM`, role: 'admin', ho_ten: 'Benchmark Admin' };
        trackedMaNvs.push(adminActor.ma_nv);
        await query(
            `INSERT INTO employees (ma_nv, ho_ten, role, department, chuc_danh, luong_cb, status, password, is_locked) VALUES (?, 'Benchmark Admin', 'admin', 'BGD', 'Admin', 0, 'active', '$2b$10$QABenchmarkDummyHashNotForLogin00000000000000000000000', 0)`,
            [adminActor.ma_nv]
        );

        for (const scale of [50, 100, 200]) {
            await seedScaleCohort(runId, scale, trackedMaNvs, trackedRequestIds);
            const matrixStats = await benchOp(8, () => attendanceService.getAttendanceMatrix(5, 2097, { limit: 300 }));
            const payrollStats = await benchOp(8, () => payrollService.calculateMonthlyPayroll(5, 2097, { limit: 300 }));
            const auditStats = await benchOp(8, () => permissionService.getAuditLogs({ limit: 50, page: 1 }));

            const reqSlice = trackedRequestIds.slice(0, 10);
            const batchStats = await benchOp(5, async () => {
                if (reqSlice.length > 0) {
                    const ph = reqSlice.map(() => '?').join(',');
                    await query(`UPDATE requests SET status = 'pending' WHERE id IN (${ph})`, reqSlice);
                    await requestService.batchApproveRequests({ request_ids: reqSlice, current_user: adminActor });
                }
            });

            results.push({
                scale_employees: scale,
                attendance_matrix: matrixStats,
                payroll_calculate: payrollStats,
                batch_approve_10: batchStats,
                audit_logs_p1: auditStats
            });
        }

        // EXPLAIN diagnostics on local sedinco_hr_test queries
        const explainPayrollRange = await query(
            "EXPLAIN SELECT * FROM attendance_logs WHERE employee_id IN ('NV001','NV002','NV003') AND record_date >= '2097-05-01' AND record_date < '2097-06-01'"
        );
        const explainPayrollFn = await query(
            'EXPLAIN SELECT * FROM attendance_logs WHERE MONTH(record_date) = 5 AND YEAR(record_date) = 2097'
        );
        const explainAudit = await query(
            "EXPLAIN SELECT a.id, a.actor_id, e.ho_ten FROM audit_logs a LEFT JOIN employees e ON a.actor_id = e.ma_nv WHERE a.actor_id = 'NV001' ORDER BY a.created_at DESC LIMIT 50"
        );
        const explainReqs = await query(
            "EXPLAIN SELECT * FROM requests WHERE employee_id = 'NV003' AND status = 'approved' ORDER BY created_at DESC LIMIT 20"
        );

        console.log(JSON.stringify({
            environment: 'LOCAL_MYSQL_ONLY (sedinco_hr_test)',
            test_run_id: runId,
            benchmarks: results,
            explain_plans: {
                attendance_logs_sargable_range: explainPayrollRange,
                attendance_logs_month_year_fn: explainPayrollFn,
                audit_logs_actor_created: explainAudit,
                requests_emp_status_created: explainReqs
            }
        }, null, 2));
    } finally {
        await cleanupScaleCohort(trackedMaNvs, trackedRequestIds);
        await new Promise((resolve) => {
            try {
                pool.end(() => resolve());
            } catch {
                resolve();
            }
        });
        await Promise.resolve(bcryptWorkerPool.terminate()).catch(() => {});
    }
}

main().catch((err) => {
    console.error('[BENCHMARK FAILED]', err);
    process.exit(1);
});
