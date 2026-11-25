/**
 * Phase 9: Performance, Concurrency & SQL EXPLAIN / Index Verification
 */
process.env.NODE_ENV = 'test';

const { TestHarness, query } = require('../fixtures/testHarness');

(async () => {
    const harness = await new TestHarness().setup({ withMockCloudinary: true });
    try {
        const adminToken = await harness.tokenFor('admin');
        const workerToken = await harness.tokenFor('NV001');

        async function bench(label, concurrency, iterations, fn) {
            const latencies = [];
            let errors = 0;
            const t0 = Date.now();
            for (let b = 0; b < iterations; b += concurrency) {
                const batch = [];
                for (let i = 0; i < Math.min(concurrency, iterations - b); i++) {
                    batch.push((async () => {
                        const s = performance.now();
                        try {
                            const ok = await fn(b + i);
                            if (!ok) errors++;
                        } catch {
                            errors++;
                        } finally {
                            latencies.push(performance.now() - s);
                        }
                    })());
                }
                await Promise.all(batch);
            }
            const totalMs = Date.now() - t0;
            latencies.sort((a, b) => a - b);
            const avg = latencies.reduce((s, x) => s + x, 0) / latencies.length;
            const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))];
            return {
                label,
                concurrency,
                total_requests: iterations,
                errors,
                total_ms: totalMs,
                avg_ms: Number(avg.toFixed(2)),
                p95_ms: Number(p95.toFixed(2)),
                max_ms: Number(latencies[latencies.length - 1].toFixed(2))
            };
        }

        const memBefore = process.memoryUsage().heapUsed;
        const benches = [];

        benches.push(await bench('GET /api/health', 20, 60, async () => {
            const r = await harness.request('GET', '/health');
            return r.status === 200;
        }));
        benches.push(await bench('GET /api/me (Auth + DB check)', 15, 45, async () => {
            const r = await harness.request('GET', '/me', { token: workerToken });
            return r.status === 200;
        }));
        benches.push(await bench('GET /api/payroll (Monthly Calc)', 10, 20, async () => {
            const r = await harness.request('GET', '/payroll?month=11&year=2026', { token: adminToken });
            return r.status === 200;
        }));
        benches.push(await bench('GET /api/attendance (Matrix)', 10, 20, async () => {
            const r = await harness.request('GET', '/attendance?month=11&year=2026', { token: adminToken });
            return r.status === 200;
        }));
        benches.push(await bench('GET /api/notifications/summary', 10, 20, async () => {
            const r = await harness.request('GET', '/notifications/summary', { token: adminToken });
            return r.status === 200;
        }));

        const memAfter = process.memoryUsage().heapUsed;
        console.log('=== BENCHMARK METRICS ===');
        console.table(benches);
        console.log('Heap delta MB:', Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)));

        console.log('=== SQL EXPLAIN ANALYSIS ===');
        const explains = [
            {
                name: 'Non-sargable attendance_logs MONTH/YEAR',
                sql: 'EXPLAIN SELECT * FROM attendance_logs WHERE MONTH(record_date) = 11 AND YEAR(record_date) = 2026'
            },
            {
                name: 'Sargable range attendance_logs (recommendation)',
                sql: "EXPLAIN SELECT * FROM attendance_logs WHERE record_date >= '2026-11-01' AND record_date < '2026-12-01'"
            },
            {
                name: 'Audit logs query',
                sql: 'EXPLAIN SELECT * FROM audit_logs ORDER BY is_pinned DESC, created_at DESC LIMIT 50'
            },
            {
                name: 'Media assets employee filter',
                sql: "EXPLAIN SELECT * FROM media_assets WHERE employee_id = 'NV001' ORDER BY created_at DESC"
            },
            {
                name: 'Department lowercase trim join',
                sql: "EXPLAIN SELECT ma_nv FROM employees WHERE LOWER(TRIM(department)) = 'khối văn phòng'"
            }
        ];

        for (const e of explains) {
            const rows = await query(e.sql);
            console.log(`-- ${e.name}:`, rows);
        }
    } finally {
        await harness.teardown({ closePool: true });
        process.exit(0);
    }
})();
