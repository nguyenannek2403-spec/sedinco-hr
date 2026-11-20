/**
 * SEDINCO HR V29 — Safe Local Concurrent Performance Benchmark (50 / 100 / 200 CCU)
 * KHÓA AN TOÀN TUYỆT ĐỐI: CHỈ CHẠY TRÊN 127.0.0.1 / localhost VÀ CSDL TEST (sedinco_hr_test).
 * TUYỆT ĐỐI KHÔNG CHẠY TRÊN TIDB CLOUD HAY PRODUCTION.
 */
process.env.NODE_ENV = 'test';
if (!process.env.DB_HOST) process.env.DB_HOST = '127.0.0.1';
if (!process.env.DB_NAME) process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';

if (!['127.0.0.1', 'localhost'].includes(process.env.DB_HOST) || !process.env.DB_NAME.toLowerCase().includes('test')) {
    console.error(`[SAFETY BLOCK] Refusing benchmark on DB_HOST=${process.env.DB_HOST}, DB_NAME=${process.env.DB_NAME}`);
    process.exit(1);
}

const fs = require('fs');
const path = require('path');
const http = require('http');
const bcrypt = require('../node_modules/bcryptjs');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');
const { initDatabase } = require('../src/database/initDb');
const { bcryptWorkerPool } = require('../src/utils/bcryptWorkerPool');

const ROOT_DIR = path.resolve(__dirname, '../..');
const METRICS_PATH = path.join(ROOT_DIR, 'docs/performance/V29_BENCHMARK_METRICS.json');

function percentile(sortedArr, p) {
    if (!sortedArr.length) return 0;
    const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.ceil((p / 100) * sortedArr.length) - 1));
    return Number(sortedArr[idx].toFixed(2));
}

function timedHttpRequest(urlStr, token, timeoutMs = 10000) {
    return new Promise((resolve) => {
        const start = process.hrtime.bigint();
        const u = new URL(urlStr);
        const req = http.request(
            {
                hostname: u.hostname,
                port: u.port,
                path: u.pathname + u.search,
                method: 'GET',
                timeout: timeoutMs,
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            },
            (res) => {
                res.on('data', () => {});
                res.on('end', () => {
                    const ms = Number(process.hrtime.bigint() - start) / 1e6;
                    resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, ms, timeout: false });
                });
            }
        );
        req.on('timeout', () => {
            req.destroy();
            const ms = Number(process.hrtime.bigint() - start) / 1e6;
            resolve({ ok: false, status: 0, ms, timeout: true });
        });
        req.on('error', () => {
            const ms = Number(process.hrtime.bigint() - start) / 1e6;
            resolve({ ok: false, status: 0, ms, timeout: false });
        });
        req.end();
    });
}

async function loginForToken(baseUrl, endpoint, body) {
    const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const json = await res.json();
    return json?.data?.token || json?.token;
}

async function runConcurrencyWave(baseUrl, ccu, scenarios, roundsPerUser = 3) {
    const waveStart = process.hrtime.bigint();
    const workers = [];
    for (let u = 0; u < ccu; u++) {
        workers.push(
            (async () => {
                const userResults = [];
                for (let r = 0; r < roundsPerUser; r++) {
                    const sc = scenarios[(u + r) % scenarios.length];
                    const res = await timedHttpRequest(`${baseUrl}${sc.path}`, sc.token);
                    userResults.push({ ...res, endpoint: sc.label });
                }
                return userResults;
            })()
        );
    }
    const nested = await Promise.all(workers);
    const totalWallMs = Number(process.hrtime.bigint() - waveStart) / 1e6;
    const all = nested.flat();
    const sortedMs = all.map((x) => x.ms).sort((a, b) => a - b);
    const errors = all.filter((x) => !x.ok).length;
    const timeouts = all.filter((x) => x.timeout).length;

    const byEndpoint = {};
    for (const item of all) {
        if (!byEndpoint[item.endpoint]) byEndpoint[item.endpoint] = [];
        byEndpoint[item.endpoint].push(item.ms);
    }
    const endpointStats = Object.entries(byEndpoint).map(([ep, arr]) => {
        const s = [...arr].sort((a, b) => a - b);
        return {
            endpoint: ep,
            count: s.length,
            p50_ms: percentile(s, 50),
            p95_ms: percentile(s, 95),
            p99_ms: percentile(s, 99)
        };
    });

    return {
        concurrency: ccu,
        rounds_per_user: roundsPerUser,
        total_requests: all.length,
        wall_time_ms: Number(totalWallMs.toFixed(2)),
        p50_ms: percentile(sortedMs, 50),
        p95_ms: percentile(sortedMs, 95),
        p99_ms: percentile(sortedMs, 99),
        max_ms: Number((sortedMs[sortedMs.length - 1] || 0).toFixed(2)),
        throughput_rps: Number(((all.length / totalWallMs) * 1000).toFixed(2)),
        error_count: errors,
        error_rate_pct: Number(((errors / all.length) * 100).toFixed(2)),
        timeout_rate_pct: Number(((timeouts / all.length) * 100).toFixed(2)),
        endpoints: endpointStats
    };
}

async function runSinglePhase() {
    await initDatabase();

    const coreEmpsBefore = await query("SELECT ma_nv, password, must_change_password, is_locked, status, role FROM employees WHERE ma_nv IN ('NV002','NV003')");
    const admBefore = await query("SELECT username, password, must_change_password FROM admins WHERE username = 'admin'");
    const [maxAudit] = await query('SELECT COALESCE(MAX(id), 0) as m FROM audit_logs');
    const [maxNotif] = await query('SELECT COALESCE(MAX(id), 0) as m FROM user_notifications');

    let server;
    try {
        const pwHash = bcrypt.hashSync('123456', 10);
        await query("UPDATE admins SET password = ?, must_change_password = 0 WHERE username = 'admin'", [pwHash]);
        await query("UPDATE employees SET password = ?, must_change_password = 0, is_locked = 0, status = 'active' WHERE ma_nv IN ('NV002','NV003')", [pwHash]);

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const baseUrl = `http://127.0.0.1:${port}`;

        const admToken = await loginForToken(baseUrl, '/api/admin/login', { username: 'admin', password: '123456' });
        const accToken = await loginForToken(baseUrl, '/api/login', { ma_nv: 'NV002', password: '123456' });
        const wkrToken = await loginForToken(baseUrl, '/api/login', { ma_nv: 'NV003', password: '123456' });

        if (!admToken || !accToken || !wkrToken) {
            throw new Error('Failed to acquire benchmark auth tokens');
        }

        const now = new Date();
        const m = now.getMonth() + 1;
        const y = now.getFullYear();

        const scenarios = [
            { label: 'GET /api/me', path: '/api/me', token: wkrToken },
            { label: 'GET /api/notifications/my', path: '/api/notifications/my?limit=20', token: wkrToken },
            { label: 'GET /api/notifications/summary', path: '/api/notifications/summary', token: admToken },
            { label: 'GET /api/attendance', path: `/api/attendance?month=${m}&year=${y}`, token: accToken },
            { label: 'GET /api/payroll/me', path: `/api/payroll/me?month=${m}&year=${y}`, token: wkrToken },
            { label: 'GET /api/payroll', path: `/api/payroll?month=${m}&year=${y}`, token: accToken }
        ];

        // Warm-up 5 requests
        for (const s of scenarios) {
            await timedHttpRequest(`${baseUrl}${s.path}`, s.token);
        }

        const levels = [];
        for (const ccu of [50, 100, 200]) {
            const wave = await runConcurrencyWave(baseUrl, ccu, scenarios, 2);
            levels.push(wave);
            console.log(`[BENCH ${ccu} CCU] total=${wave.total_requests} P50=${wave.p50_ms}ms P95=${wave.p95_ms}ms P99=${wave.p99_ms}ms RPS=${wave.throughput_rps} err=${wave.error_rate_pct}%`);
        }

        const [idxAtt, idxReq, idxNotif] = await Promise.all([
            query('SHOW INDEX FROM attendance_logs'),
            query('SHOW INDEX FROM requests'),
            query('SHOW INDEX FROM user_notifications')
        ]);

        return {
            levels,
            indexes: {
                attendance_logs: [...new Set(idxAtt.map((r) => `${r.Key_name}(${r.Column_name})`))],
                requests: [...new Set(idxReq.map((r) => `${r.Key_name}(${r.Column_name})`))],
                user_notifications: [...new Set(idxNotif.map((r) => `${r.Key_name}(${r.Column_name})`))]
            }
        };
    } finally {
        if (server) {
            server.closeAllConnections?.();
            await new Promise((r) => server.close(r));
        }
        await query('DELETE FROM audit_logs WHERE id > ?', [Number(maxAudit?.m || 0)]).catch(() => {});
        await query('DELETE FROM user_notifications WHERE id > ?', [Number(maxNotif?.m || 0)]).catch(() => {});
        await query("DELETE FROM login_rate_limits WHERE identifier IN ('admin','NV002','NV003') OR key_name LIKE '%127.0.0.1%'").catch(() => {});
        for (const e of coreEmpsBefore) {
            await query(
                'UPDATE employees SET password = ?, must_change_password = ?, is_locked = ?, status = ?, role = ? WHERE ma_nv = ?',
                [e.password, e.must_change_password, e.is_locked, e.status, e.role, e.ma_nv]
            ).catch(() => {});
        }
        for (const a of admBefore) {
            await query(
                'UPDATE admins SET password = ?, must_change_password = ? WHERE username = ?',
                [a.password, a.must_change_password, a.username]
            ).catch(() => {});
        }
    }
}

(async () => {
    let exitCode = 0;
    const mode = process.argv[2] || 'final'; // 'baseline' | 'final'
    try {
        const res = await runSinglePhase();
        const existing = fs.existsSync(METRICS_PATH) ? JSON.parse(fs.readFileSync(METRICS_PATH, 'utf8')) : {};
        const nextDoc = {
            version: 'V29',
            environment: 'local_test_db (127.0.0.1/sedinco_hr_test)',
            measured_at: new Date().toISOString(),
            note: 'Đo tải API đồng thời (50/100/200 CCU) trên máy cục bộ với JWT đã cấp phát; không chạy trên TiDB Cloud thật.',
            ...(mode === 'baseline'
                ? { baseline_before_index: res, levels: res.levels, indexes: res.indexes }
                : {
                      ...(existing.baseline_before_index ? { baseline_before_index: existing.baseline_before_index } : {}),
                      after_index_optimization: res,
                      levels: res.levels,
                      indexes: res.indexes
                  })
        };
        fs.mkdirSync(path.dirname(METRICS_PATH), { recursive: true });
        fs.writeFileSync(METRICS_PATH, JSON.stringify(nextDoc, null, 2));
        console.log(`Saved benchmark metrics (${mode}) to ${METRICS_PATH}`);
    } catch (err) {
        console.error('BENCHMARK ERROR:', err);
        exitCode = 1;
    } finally {
        await new Promise((r) => pool.end(() => r())).catch(() => {});
        await bcryptWorkerPool.terminate().catch(() => {});
        process.exit(exitCode);
    }
})();
