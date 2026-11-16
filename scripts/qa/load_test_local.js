/**
 * Phase 9.6 — Real Concurrent HTTP & MySQL Pool Load Test (Local Test DB ONLY)
 * Simulates 50, 100, and 200 concurrent employees executing real HTTP requests against
 * the mounted Express app and local `sedinco_hr_test` MySQL instance.
 *
 * Strictly forbids Cloud/TiDB/Production targets and restores clean DB state on exit.
 */
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
process.env.DB_SSL = 'false';

if (!process.env.DB_NAME.toLowerCase().includes('test') || process.env.DB_HOST !== '127.0.0.1') {
    console.error('REFUSING TO RUN LOAD TEST: Must target local 127.0.0.1 test DB (sedinco_hr_test).');
    process.exit(1);
}

const http = require('http');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = require('../../sedinco_backend/src/app');
const { query, pool } = require('../../sedinco_backend/src/config/db');
const { initDatabase } = require('../../sedinco_backend/src/database/initDb');
const { invalidatePermissionCache } = require('../../sedinco_backend/src/middlewares/authMiddleware');
const { bcryptWorkerPool } = require('../../sedinco_backend/src/utils/bcryptWorkerPool');

const PREFIX = 'LD9_';
const TEST_YEAR = 2096;
const WORKER_COUNT = 200;
const PASSWORD = 'LoadPass@2026!';
const REQUEST_TIMEOUT_MS = 20000;

function percentile(sortedArr, p) {
    if (!sortedArr.length) return 0;
    const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.ceil((p / 100) * sortedArr.length) - 1));
    return Number(sortedArr[idx].toFixed(2));
}

function summarizeLatencies(samples) {
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    return {
        count: sorted.length,
        avgMs: sorted.length ? Number((sum / sorted.length).toFixed(2)) : 0,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        p99Ms: percentile(sorted, 99),
        maxMs: sorted.length ? Number(sorted[sorted.length - 1].toFixed(2)) : 0,
        gt250Ms: sorted.filter((x) => x > 250).length,
        gt1000Ms: sorted.filter((x) => x > 1000).length
    };
}

async function timedHttp(baseUrl, method, path, { token, body, headers = {} } = {}) {
    const start = process.hrtime.bigint();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const reqHeaders = { ...headers };
        if (token) reqHeaders.Authorization = `Bearer ${token}`;
        if (body !== undefined) reqHeaders['Content-Type'] = 'application/json';
        const res = await fetch(`${baseUrl}${path}`, {
            method,
            headers: reqHeaders,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* ignore */ }
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        return { ok: res.ok, status: res.status, ms, timedOut: false, json };
    } catch (err) {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        return {
            ok: false,
            status: err.name === 'AbortError' ? 408 : 0,
            ms,
            timedOut: err.name === 'AbortError',
            error: err.message
        };
    } finally {
        clearTimeout(timer);
    }
}

async function cleanupLoadData(keepEmployees = false) {
    await query(`DELETE FROM attendance_logs WHERE employee_id LIKE ? OR YEAR(record_date) = ?`, [`${PREFIX}%`, TEST_YEAR]);
    await query(`DELETE FROM attendance WHERE ma_nv LIKE ? OR nam = ?`, [`${PREFIX}%`, TEST_YEAR]);
    await query(`DELETE FROM requests WHERE employee_id LIKE ? OR YEAR(request_date) = ?`, [`${PREFIX}%`, TEST_YEAR]);
    await query(`DELETE FROM ot_registrations WHERE employee_id LIKE ? OR YEAR(work_date) = ?`, [`${PREFIX}%`, TEST_YEAR]);
    await query(`DELETE FROM period_locks WHERE year = ?`, [TEST_YEAR]);
    await query(`DELETE FROM idempotency_keys WHERE actor_id LIKE ?`, [`${PREFIX}%`]);
    await query(`DELETE FROM login_rate_limits WHERE identifier LIKE ? OR key_name LIKE ?`, [`${PREFIX}%`, `%${PREFIX}%`]);
    await query(`DELETE FROM audit_logs WHERE actor_id LIKE ? OR details LIKE ?`, [`${PREFIX}%`, `%${PREFIX}%`]);
    if (!keepEmployees) {
        await query(`DELETE FROM employees WHERE ma_nv LIKE ?`, [`${PREFIX}%`]);
    }
    invalidatePermissionCache();
}

async function seedCohort() {
    const pwHash = bcrypt.hashSync(PASSWORD, 10);
    const values = [];
    for (let i = 1; i <= WORKER_COUNT; i += 1) {
        const id = `${PREFIX}W${String(i).padStart(3, '0')}`;
        values.push([id, `Load Worker ${i}`, 'Công nhân', 'Xưởng Cơ Khí', '2024-01-01', '2024-03-01', pwHash, 0, 12000000, 1, 'active', 0, 'worker', 12, 'FULL_DAY']);
    }
    values.push([`${PREFIX}ACC`, 'Load Accountant', 'Kế toán', 'Kế toán', '2024-01-01', '2024-03-01', pwHash, 0, 16000000, 1, 'active', 0, 'accountant', 12, 'FULL_DAY']);
    values.push([`${PREFIX}ADM`, 'Load Admin', 'Quản lý', 'Ban Giám đốc', '2024-01-01', '2024-03-01', pwHash, 0, 26000000, 1, 'active', 0, 'admin', 12, 'FULL_DAY']);

    const chunkSize = 50;
    for (let i = 0; i < values.length; i += chunkSize) {
        const chunk = values.slice(i, i + chunkSize);
        const ph = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
        await query(
            `INSERT INTO employees (
                ma_nv, ho_ten, chuc_danh, department, ngay_bat_dau_lam, ngay_chinh_thuc,
                password, must_change_password, luong_cb, has_insurance, status, is_locked,
                role, annual_leave_quota, shift_type
            ) VALUES ${ph}`,
            chunk.flat()
        );
    }
}

async function snapshotState() {
    const [cs] = await query('SELECT id, latitude, longitude, radius_meters FROM company_settings LIMIT 1');
    const perms = await query('SELECT permission_key, is_enabled FROM accountant_permissions');
    return { cs, perms };
}

async function restoreState(snap) {
    if (snap?.cs) {
        await query('UPDATE company_settings SET latitude = ?, longitude = ?, radius_meters = ? WHERE id = ?', [
            snap.cs.latitude, snap.cs.longitude, snap.cs.radius_meters, snap.cs.id
        ]);
    }
    if (Array.isArray(snap?.perms)) {
        for (const p of snap.perms) {
            await query('UPDATE accountant_permissions SET is_enabled = ? WHERE permission_key = ?', [
                p.is_enabled ? 1 : 0, p.permission_key
            ]);
        }
    }
    invalidatePermissionCache();
}

async function runConcurrencyStage(baseUrl, concurrency, adminToken, accToken) {
    await cleanupLoadData(true);

    // Seed attendance history rows for realistic payroll/attendance reads & pending requests for parallel approval
    const logVals = [];
    for (let i = 1; i <= concurrency; i += 1) {
        const maNv = `${PREFIX}W${String(i).padStart(3, '0')}`;
        logVals.push([maNv, `${TEST_YEAR}-04-02`, '1', '08:00:00', '17:30:00']);
        logVals.push([maNv, `${TEST_YEAR}-04-03`, '1', '08:00:00', '17:30:00']);
    }
    for (let i = 0; i < logVals.length; i += 100) {
        const chunk = logVals.slice(i, i + 100);
        const ph = chunk.map(() => '(?, ?, ?, ?, ?)').join(',');
        await query(`INSERT INTO attendance_logs (employee_id, record_date, status, check_in_time, check_out_time) VALUES ${ph}`, chunk.flat());
    }

    const approveTargets = Math.min(20, concurrency);
    const pendingReqIds = [];
    for (let i = 1; i <= approveTargets; i += 1) {
        const maNv = `${PREFIX}W${String(i).padStart(3, '0')}`;
        const ins = await query(
            "INSERT INTO requests (employee_id, request_type, request_date, reason, status) VALUES (?, 'P', ?, 'Load Approve Target', 'pending')",
            [maNv, `${TEST_YEAR}-05-15`]
        );
        pendingReqIds.push(ins.insertId);
    }

    let enqueueCount = 0;
    let peakAllConns = 0;
    let peakConnQueue = 0;
    let peakBcryptQueue = 0;
    let peakRssMb = 0;
    const onEnqueue = () => { enqueueCount += 1; };
    pool.on('enqueue', onEnqueue);

    const sampler = setInterval(() => {
        const allC = Array.isArray(pool._allConnections) ? pool._allConnections.length : 0;
        const qLen = Array.isArray(pool._connectionQueue) ? pool._connectionQueue.length : 0;
        const bLen = Array.isArray(bcryptWorkerPool.queue) ? bcryptWorkerPool.queue.length : 0;
        const rss = process.memoryUsage().rss / (1024 * 1024);
        if (allC > peakAllConns) peakAllConns = allC;
        if (qLen > peakConnQueue) peakConnQueue = qLen;
        if (bLen > peakBcryptQueue) peakBcryptQueue = bLen;
        if (rss > peakRssMb) peakRssMb = rss;
    }, 20);

    const endpointMetrics = {
        login: [],
        check_in: [],
        attendance_me: [],
        payroll_me: [],
        request_create: [],
        request_approve: [],
        attendance_matrix: []
    };
    const allResults = [];

    const cpuStart = process.cpuUsage();
    const wallStart = process.hrtime.bigint();

    const workerJobs = Array.from({ length: concurrency }, async (_, idx) => {
        const maNv = `${PREFIX}W${String(idx + 1).padStart(3, '0')}`;
        const runNonce = crypto.randomBytes(3).toString('hex');

        const loginRes = await timedHttp(baseUrl, 'POST', '/api/login', {
            body: { ma_nv: maNv, password: PASSWORD }
        });
        endpointMetrics.login.push(loginRes);
        allResults.push(loginRes);
        const tok = loginRes.json?.data?.token;
        if (!tok) return;

        // Execute parallel user dashboard actions after session establishes
        const [ciRes, histRes, payRes, reqRes] = await Promise.all([
            timedHttp(baseUrl, 'POST', '/api/attendance/check-in', {
                token: tok,
                headers: { 'X-Idempotency-Key': `ld-ci-${maNv}-${runNonce}` },
                body: { lat: 16.0544, lng: 108.2022, device_info: `LD_DEV_${idx + 1}` }
            }),
            timedHttp(baseUrl, 'GET', `/api/attendance/me?month=4&year=${TEST_YEAR}`, { token: tok }),
            timedHttp(baseUrl, 'GET', `/api/payroll/me?month=4&year=${TEST_YEAR}`, { token: tok }),
            timedHttp(baseUrl, 'POST', '/api/requests', {
                token: tok,
                headers: { 'X-Idempotency-Key': `ld-req-${maNv}-${runNonce}` },
                body: { request_type: 'P', from_date: `${TEST_YEAR}-05-04`, to_date: `${TEST_YEAR}-05-04`, reason: 'Load Leave' }
            })
        ]);

        endpointMetrics.check_in.push(ciRes);
        endpointMetrics.attendance_me.push(histRes);
        endpointMetrics.payroll_me.push(payRes);
        endpointMetrics.request_create.push(reqRes);
        allResults.push(ciRes, histRes, payRes, reqRes);
    });

    const managerApproveJobs = pendingReqIds.map((reqId, idx) =>
        timedHttp(baseUrl, 'PUT', `/api/requests/${reqId}`, {
            token: idx % 2 === 0 ? adminToken : accToken,
            headers: { 'X-Idempotency-Key': `ld-app-${reqId}` },
            body: { status: 'approved' }
        }).then((r) => {
            endpointMetrics.request_approve.push(r);
            allResults.push(r);
        })
    );

    const matrixReadersCount = Math.max(3, Math.floor(concurrency / 10));
    const managerMatrixJobs = Array.from({ length: matrixReadersCount }, () =>
        timedHttp(baseUrl, 'GET', `/api/attendance?month=4&year=${TEST_YEAR}`, {
            token: accToken
        }).then((r) => {
            endpointMetrics.attendance_matrix.push(r);
            allResults.push(r);
        })
    );

    await Promise.all([...workerJobs, ...managerApproveJobs, ...managerMatrixJobs]);

    const wallMs = Number(process.hrtime.bigint() - wallStart) / 1e6;
    const cpuDelta = process.cpuUsage(cpuStart);

    clearInterval(sampler);
    pool.off('enqueue', onEnqueue);

    const dbStatus = await query("SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Slow_queries')").catch(() => []);
    const statusMap = Object.fromEntries((dbStatus || []).map((r) => [r.Variable_name, Number(r.Value)]));

    const okCount = allResults.filter((r) => r.ok).length;
    const err4xx = allResults.filter((r) => r.status >= 400 && r.status < 500).length;
    const err5xx = allResults.filter((r) => r.status >= 500 || r.status === 0).length;
    const timeouts = allResults.filter((r) => r.timedOut).length;
    const totalReqs = allResults.length;

    const endpointsSummary = {};
    for (const [k, list] of Object.entries(endpointMetrics)) {
        endpointsSummary[k] = {
            ...summarizeLatencies(list.map((x) => x.ms)),
            ok: list.filter((x) => x.ok).length,
            fail: list.filter((x) => !x.ok).length
        };
    }

    return {
        concurrency,
        totalRequests: totalReqs,
        wallMs: Number(wallMs.toFixed(2)),
        throughputRps: Number((totalReqs / (wallMs / 1000)).toFixed(2)),
        okCount,
        errorRatePct: Number((((err4xx + err5xx) / totalReqs) * 100).toFixed(2)),
        err4xx,
        err5xx,
        timeouts,
        overall: summarizeLatencies(allResults.map((x) => x.ms)),
        endpoints: endpointsSummary,
        resources: {
            cpuUserMs: Number((cpuDelta.user / 1000).toFixed(2)),
            cpuSystemMs: Number((cpuDelta.system / 1000).toFixed(2)),
            peakRssMb: Number(peakRssMb.toFixed(1)),
            mysqlPoolLimit: pool.config?.connectionLimit || 10,
            peakAllDbConns: peakAllConns,
            peakDbQueue: peakConnQueue,
            dbPoolEnqueueEvents: enqueueCount,
            bcryptPoolSize: bcryptWorkerPool.poolSize,
            peakBcryptQueue,
            mysqlThreadsConnected: statusMap.Threads_connected ?? null,
            mysqlThreadsRunning: statusMap.Threads_running ?? null
        }
    };
}

async function main() {
    let server = null;
    let snap = null;
    let exitCode = 0;
    try {
        await initDatabase();
        snap = await snapshotState();
        await cleanupLoadData(false);
        await seedCohort();

        await query("UPDATE company_settings SET latitude = 16.0544, longitude = 108.2022, radius_meters = 200");
        await query("UPDATE accountant_permissions SET is_enabled = 1 WHERE permission_key IN ('attendance_view_all', 'leave_approve')");
        invalidatePermissionCache();

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const baseUrl = `http://127.0.0.1:${server.address().port}`;

        const admRes = await timedHttp(baseUrl, 'POST', '/api/login', { body: { ma_nv: `${PREFIX}ADM`, password: PASSWORD } });
        const accRes = await timedHttp(baseUrl, 'POST', '/api/login', { body: { ma_nv: `${PREFIX}ACC`, password: PASSWORD } });
        const adminToken = admRes.json?.data?.token;
        const accToken = accRes.json?.data?.token;
        if (!adminToken || !accToken) throw new Error('Failed to authenticate load-test admin/accountant actors');

        // Warmup (10 sequential + 5 concurrent)
        for (let i = 1; i <= 5; i += 1) {
            await timedHttp(baseUrl, 'GET', `/api/attendance?month=4&year=${TEST_YEAR}`, { token: accToken });
        }

        const stages = [];
        for (const concurrency of [50, 100, 200]) {
            const res = await runConcurrencyStage(baseUrl, concurrency, adminToken, accToken);
            stages.push(res);
        }

        await restoreState(snap);
        await cleanupLoadData(false);

        const [remEmp] = await query('SELECT COUNT(*) AS c FROM employees WHERE ma_nv LIKE ?', [`${PREFIX}%`]);
        const [remLogs] = await query('SELECT COUNT(*) AS c FROM attendance_logs WHERE employee_id LIKE ?', [`${PREFIX}%`]);
        const [remReq] = await query('SELECT COUNT(*) AS c FROM requests WHERE employee_id LIKE ?', [`${PREFIX}%`]);

        console.log(JSON.stringify({
            environment: {
                dbHost: process.env.DB_HOST,
                dbName: process.env.DB_NAME,
                nodeVersion: process.version,
                bcryptWorkers: bcryptWorkerPool.poolSize,
                mysqlConnectionLimit: pool.config?.connectionLimit || 10
            },
            stages,
            cleanupVerification: {
                remainingEmployees: remEmp.c,
                remainingAttendanceLogs: remLogs.c,
                remainingRequests: remReq.c
            }
        }, null, 2));
    } catch (err) {
        console.error('LOAD TEST FAILED:', err);
        exitCode = 1;
    } finally {
        if (snap) await restoreState(snap).catch(() => {});
        await cleanupLoadData(false).catch(() => {});
        if (server) {
            server.closeAllConnections?.();
            await new Promise((r) => server.close(r));
        }
        await new Promise((r) => {
            try { pool.end(() => r()); } catch { r(); }
        });
        try { await bcryptWorkerPool.terminate(); } catch { /* ignore */ }
        process.exit(exitCode);
    }
}

main();

