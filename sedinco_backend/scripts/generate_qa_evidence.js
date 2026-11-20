/**
 * Sinh tệp bằng chứng QA thực tế (docs/qa/qa_latest_evidence.json) từ kết quả chạy test thật
 * và dữ liệu benchmark hiệu năng (docs/performance/V29_BENCHMARK_METRICS.json).
 * TUYỆT ĐỐI KHÔNG tự chế số liệu PASS cho bài test chưa chạy.
 */
process.env.NODE_ENV = 'test';
if (!process.env.DB_HOST) process.env.DB_HOST = '127.0.0.1';
if (!process.env.DB_NAME) process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pool, query } = require('../src/config/db');
const { initDatabase } = require('../src/database/initDb');

const ROOT_DIR = path.resolve(__dirname, '../..');
const EVIDENCE_PATH = path.join(ROOT_DIR, 'docs/qa/qa_latest_evidence.json');
const PERF_PATH = path.join(ROOT_DIR, 'docs/performance/V29_BENCHMARK_METRICS.json');
const BUGS_PATH = path.join(__dirname, '../src/qa/bugRegistry.json');

function classifyTestCase(testId, fullName) {
    const id = String(testId || '').toUpperCase();
    const name = String(fullName || '');

    if (id.startsWith('AST-') || id === 'V29-ARCH-01') {
        return {
            module: id === 'V29-ARCH-01' ? 'quality-assurance' : 'administration',
            group_key: 'H_ARCHITECTURE',
            group_code: 'H',
            execution_scope: 'dev_ci_only'
        };
    }
    if (id.startsWith('CONTRACT-')) {
        return { module: 'administration', group_key: 'E_API_INTEGRATION', group_code: 'E', execution_scope: 'dev_ci_only' };
    }
    if (id.startsWith('AUTH-') || id.startsWith('RBAC-') || id.startsWith('SEC-') || id.startsWith('P9-SEC') || id === 'P9-RBAC-ALL' || id === 'QA3-AUTH-01' || id === 'QA3-AUTH-02' || id === 'QA3-RBAC-01' || id === 'V29-QA-01') {
        return {
            module: id === 'V29-QA-01' ? 'quality-assurance' : 'administration',
            group_key: 'F_SECURITY',
            group_code: 'F',
            execution_scope: 'dev_ci_only'
        };
    }
    if (id.startsWith('UI-') || name.toLowerCase().includes('cdp')) {
        const isA11y = id === 'UI-01' || id === 'UI-02';
        return {
            module: id === 'UI-03' ? 'overview' : 'administration',
            group_key: isA11y ? 'B_ACCESSIBILITY' : 'A_UI_UX',
            group_code: isA11y ? 'B' : 'A',
            execution_scope: 'dev_ci_only'
        };
    }
    if (id === 'V29-PREF-01') {
        return { module: 'administration', group_key: 'B_ACCESSIBILITY', group_code: 'B', execution_scope: 'dev_ci_only' };
    }
    if (id.startsWith('V29-NOTIF') || id === 'V25-T1' || id === 'V25-T2' || id === 'P9-V17-01') {
        return { module: 'notifications', group_key: 'C_FUNCTIONAL', group_code: 'C', execution_scope: 'dev_ci_only' };
    }
    if (id.startsWith('ATT-') || id.startsWith('QA3-ATT') || /^TC-V24-(0[1-9]|1\d|20)$/.test(id) || id === 'V25-T4') {
        return { module: 'attendance', group_key: 'D_BUSINESS_LOGIC', group_code: 'D', execution_scope: 'dev_ci_only' };
    }
    if (id.startsWith('REQ-') || id === 'QA3-REQ-01') {
        return { module: 'requests', group_key: 'D_BUSINESS_LOGIC', group_code: 'D', execution_scope: 'dev_ci_only' };
    }
    if (id.startsWith('PAY-') || id === 'QA3-PAY-01' || id === 'P9-PAY-GOLDEN' || /^TC-V24-(2[1-9]|3[0-2])$/.test(id) || id === 'V25-T3' || id === 'V25-T5') {
        return { module: 'payroll', group_key: 'D_BUSINESS_LOGIC', group_code: 'D', execution_scope: 'dev_ci_only' };
    }
    if (id === 'QA3-EMP-01' || id === 'P9-8') {
        return { module: 'employees', group_key: 'C_FUNCTIONAL', group_code: 'C', execution_scope: 'dev_ci_only' };
    }
    if (id === 'QA3-DB-01' || id === 'QA3-FE-01') {
        return { module: 'overview', group_key: 'E_API_INTEGRATION', group_code: 'E', execution_scope: 'dev_ci_only' };
    }
    return { module: 'overview', group_key: 'C_FUNCTIONAL', group_code: 'C', execution_scope: 'dev_ci_only' };
}

function parseSpecOutput(rawOutput, version = 'V29') {
    const cases = [];
    const lines = String(rawOutput || '').split(/\r?\n/);
    const nowIso = new Date().toISOString();

    for (const line of lines) {
        const passMatch = line.match(/^\s*✔\s+([^:]+):\s+(.+?)\s+\((\d+(?:\.\d+)?)ms\)\s*$/);
        const failMatch = line.match(/^\s*✖\s+([^:]+):\s+(.+?)\s+\((\d+(?:\.\d+)?)ms\)\s*$/);
        const m = passMatch || failMatch;
        if (!m) continue;

        const status = passMatch ? 'PASS' : 'FAIL';
        const testId = m[1].trim();
        const title = m[2].trim();
        const durationMs = Number(Number(m[3]).toFixed(2));
        const meta = classifyTestCase(testId, title);

        cases.push({
            test_id: testId,
            name: title,
            module: meta.module,
            group_key: meta.group_key,
            group_code: meta.group_code,
            objective: title,
            precondition: 'Local test database (sedinco_hr_test) & Express test server',
            expected: 'Đạt toàn bộ khẳng định kiểm thử với 0 lỗi ngoài dự kiến',
            actual: status === 'PASS' ? `Đã xác nhận PASS (${durationMs}ms)` : `Thất bại trong lần chạy (${durationMs}ms)`,
            status,
            severity_if_fail: meta.group_code === 'F' ? 'Critical' : 'High',
            duration_ms: durationMs,
            executed_at: nowIso,
            version,
            execution_scope: meta.execution_scope
        });
    }
    return cases;
}

(async () => {
    let exitCode = 0;
    try {
        await initDatabase();

        const argIdx = process.argv.indexOf('--from-log');
        const logPath = argIdx >= 0 ? process.argv[argIdx + 1] : null;
        let rawOutput = '';
        let totalDurationMs = 0;

        if (logPath && fs.existsSync(logPath)) {
            rawOutput = fs.readFileSync(logPath, 'utf8');
            const durM = rawOutput.match(/duration_ms\s+(\d+(?:\.\d+)?)/);
            totalDurationMs = durM ? Math.round(Number(durM[1])) : 0;
        } else {
            const t0 = Date.now();
            rawOutput = execFileSync(
                'node',
                ['--test', '--test-concurrency=1', '--test-reporter=spec', '__tests__/*.test.js'],
                {
                    cwd: path.resolve(__dirname, '..'),
                    env: { ...process.env, NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_NAME: 'sedinco_hr_test', DB_SSL: 'false' },
                    encoding: 'utf8',
                    maxBuffer: 20 * 1024 * 1024
                }
            );
            totalDurationMs = Date.now() - t0;
        }

        const automatedCases = parseSpecOutput(rawOutput, 'V29');
        const perfDoc = fs.existsSync(PERF_PATH) ? JSON.parse(fs.readFileSync(PERF_PATH, 'utf8')) : null;
        const perfCases = [];
        if (perfDoc && Array.isArray(perfDoc.levels)) {
            for (const lv of perfDoc.levels) {
                perfCases.push({
                    test_id: `PERF-${lv.concurrency}CCU`,
                    name: `Kiểm thử tải đồng thời ${lv.concurrency} người dùng (${lv.total_requests} requests)`,
                    module: 'overview',
                    group_key: 'G_PERFORMANCE',
                    group_code: 'G',
                    objective: 'Đo P50, P95, P99, Throughput, Error rate & Timeout rate trên môi trường cục bộ',
                    precondition: 'Local test DB sedinco_hr_test + JWT hợp lệ cho 3 vai trò',
                    expected: 'Error rate = 0%, Timeout rate = 0%, P95 < 500ms',
                    actual: `P50=${lv.p50_ms}ms, P95=${lv.p95_ms}ms, P99=${lv.p99_ms}ms, RPS=${lv.throughput_rps}, Err=${lv.error_rate_pct}%, Timeout=${lv.timeout_rate_pct}%`,
                    status: Number(lv.error_rate_pct) === 0 && Number(lv.timeout_rate_pct) === 0 ? 'PASS' : 'FAIL',
                    severity_if_fail: 'High',
                    duration_ms: Math.round(Number(lv.wall_time_ms) || 0),
                    executed_at: perfDoc.measured_at,
                    version: 'V29',
                    execution_scope: 'dev_ci_only'
                });
            }
        }

        // Các hạng mục thủ công trên thiết bị thật phải ghi nhận trung thực là NOT TESTED (không tự bịa PASS)
        const manualCases = [
            {
                test_id: 'MANUAL-ZALO-DEVICE-01',
                name: 'Kiểm thử thực tế trên Zalo App iOS & Android vật lý (GPS thật, Notch/Capsule thật)',
                module: 'attendance',
                group_key: 'A_UI_UX',
                group_code: 'A',
                objective: 'Xác minh hiển thị và quyền vị trí thật bên trong ứng dụng Zalo trên thiết bị vật lý',
                precondition: 'Triển khai lên Zalo Mini App Studio Testing / Staging',
                expected: 'Không che nút, không lỗi quyền GPS Zalo thật',
                actual: 'Chưa kiểm tra trực tiếp trên điện thoại vật lý từ môi trường CLI này',
                status: 'NOT TESTED',
                severity_if_fail: 'Medium',
                duration_ms: 0,
                executed_at: null,
                version: 'V29',
                execution_scope: 'manual'
            },
            {
                test_id: 'MANUAL-SR-01',
                name: 'Kiểm thử đọc màn hình VoiceOver iOS & TalkBack Android đầy đủ các luồng',
                module: 'administration',
                group_key: 'B_ACCESSIBILITY',
                group_code: 'B',
                objective: 'Đảm bảo công nhân khiếm thị/thị lực kém sử dụng được qua trình đọc màn hình vật lý',
                precondition: 'Thiết bị thật bật VoiceOver / TalkBack',
                expected: 'Đọc đúng tên nút, vai trò và thông báo trạng thái',
                actual: 'Đã kiểm tra ARIA semantics tĩnh & CDP DOM; chưa test thiết bị VoiceOver/TalkBack vật lý',
                status: 'NOT TESTED',
                severity_if_fail: 'Low',
                duration_ms: 0,
                executed_at: null,
                version: 'V29',
                execution_scope: 'manual'
            }
        ];

        const allCases = [...automatedCases, ...perfCases, ...manualCases];
        const passed = allCases.filter((c) => c.status === 'PASS').length;
        const failed = allCases.filter((c) => c.status === 'FAIL').length;
        const blocked = allCases.filter((c) => c.status === 'BLOCKED').length;
        const notTested = allCases.filter((c) => c.status === 'NOT TESTED' || c.status === 'SKIPPED').length;

        const bugs = fs.existsSync(BUGS_PATH) ? JSON.parse(fs.readFileSync(BUGS_PATH, 'utf8')) : [];
        const evidenceDoc = {
            version: 'V29',
            generated_at: new Date().toISOString(),
            total_duration_ms: totalDurationMs,
            summary: {
                total_cases: allCases.length,
                automated_cases: automatedCases.length + perfCases.length,
                manual_cases: manualCases.length,
                passed,
                failed,
                blocked,
                not_tested: notTested,
                open_bugs: Array.isArray(bugs) ? bugs.filter((b) => b.status === 'OPEN').length : 0
            },
            version_history: [
                { version: 'V24', total_cases: 79, passed: 79, failed: 0, summary: 'MISA 8h Workday & 1.000.000 Formatting' },
                { version: 'V25', total_cases: 84, passed: 84, failed: 0, summary: 'Period-Lock Notifications & Historical Payslip' },
                {
                    version: 'V29',
                    total_cases: allCases.length,
                    passed,
                    failed,
                    summary: 'Notification Lifecycle + Payslip Action Bars + FontScale + Overview + QA Center + 50/100/200 CCU'
                }
            ],
            test_cases: allCases
        };

        fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
        fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidenceDoc, null, 2));

        // Đồng bộ bản ghi tổng hợp lên bảng qa_test_runs local (sẽ dọn ở bước hygiene cuối nếu là test, hoặc giữ baseline clean)
        await query(
            `INSERT INTO qa_test_runs (version, run_type, environment, total_cases, passed, failed, blocked, not_tested, duration_ms, triggered_by, summary_json)
             VALUES ('V29', 'full_regression_and_perf', 'test', ?, ?, ?, ?, ?, ?, 'qa_evidence_generator', ?)`,
            [allCases.length, passed, failed, blocked, notTested, totalDurationMs, JSON.stringify(evidenceDoc.summary)]
        ).catch(() => {});

        console.log(`Generated QA evidence: total=${allCases.length}, passed=${passed}, failed=${failed}, blocked=${blocked}, not_tested=${notTested}`);
    } catch (err) {
        console.error('QA EVIDENCE ERROR:', err);
        exitCode = 1;
    } finally {
        await new Promise((r) => pool.end(() => r())).catch(() => {});
        process.exit(exitCode);
    }
})();
