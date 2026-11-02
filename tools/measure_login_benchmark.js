/**
 * Benchmark Script:
 * 1. Botnet Attack Simulation: 100 IPs x 6 requests = 600 requests
 *    Collect status code histogram per IP and overall
 * 2. 30 Single Logins under no-load on a real bcrypt hash account
 *    Measure min, max, average, p50, p95
 */
const { query } = require('../sedinco_backend/src/config/db');
const authService = require('../sedinco_backend/src/services/authService');
const bcrypt = require('../sedinco_backend/node_modules/bcryptjs');

async function main() {
    console.log('════════════════════════════════════════════════════════════════════');
    console.log('1. BOTNET BENCHMARK: 100 IPs x 6 REQUESTS PER IP (600 REQUESTS TỔNG)');
    console.log('════════════════════════════════════════════════════════════════════');

    const victimAccount = 'EMP_BOTNET_VICTIM';
    const victimPass = 'VictimSecure@2026';
    const bcryptHash = bcrypt.hashSync(victimPass, 10);

    await query('DELETE FROM login_rate_limits WHERE identifier = ? OR key_name LIKE ?', [victimAccount, `%${victimAccount}%`]);
    await query('DELETE FROM audit_logs WHERE actor_id = ?', [victimAccount]);

    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES (?, 'NV Botnet Target', ?, 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`,
        [victimAccount, bcryptHash]);

    // 100 distinct IPs (10.100.1.1 to 10.100.1.100)
    const ipList = [];
    for (let i = 1; i <= 100; i++) {
        ipList.push(`10.100.1.${i}`);
    }

    const overallStatusCount = { 401: 0, 429: 0, other: 0 };
    const perIpHistogram = {};

    console.log('Đang mô phỏng 100 IP botnet đồng thời tấn công tài khoản...');
    const startTime = Date.now();

    for (let ipIdx = 0; ipIdx < ipList.length; ipIdx++) {
        const ip = ipList[ipIdx];
        perIpHistogram[ip] = { 401: 0, 429: 0, other: 0, attempts: [] };

        for (let attempt = 1; attempt <= 6; attempt++) {
            const res = await authService.employeeLogin(victimAccount, `wrong_guess_${attempt}`, ip);
            const status = res.statusCode === 429 ? 429 : 401;
            perIpHistogram[ip].attempts.push(status);
            perIpHistogram[ip][status] = (perIpHistogram[ip][status] || 0) + 1;
            overallStatusCount[status] = (overallStatusCount[status] || 0) + 1;
        }
    }

    const elapsedMs = Date.now() - startTime;
    console.log(`Hoàn thành 600 requests trong ${elapsedMs} ms.`);
    console.log('Histogram mã trạng thái tổng hợp:');
    console.log(`- HTTP 401 (Sai thông tin đăng nhập, chưa bị khóa): ${overallStatusCount[401]} requests`);
    console.log(`- HTTP 429 (Tạm khóa rate limit): ${overallStatusCount[429]} requests`);

    // Verify consistency across all 100 IPs
    let inconsistentCount = 0;
    for (const [ip, data] of Object.entries(perIpHistogram)) {
        // Must be exactly 5 times 401, followed by 1 time 429
        if (data[401] !== 5 || data[429] !== 1) {
            inconsistentCount++;
        }
    }
    console.log(`Số IP có đúng 5 lần 401 và lần thứ 6 là 429: ${100 - inconsistentCount} / 100 IPs.`);

    console.log('\n════════════════════════════════════════════════════════════════════');
    console.log('2. ĐO THỜI GIAN ĐĂNG NHẬP THẬT (30 LẦN ĐƠN LẺ KHÔNG TẢI BẰNG BCRYPT)');
    console.log('════════════════════════════════════════════════════════════════════');

    const testAccount = 'EMP_BENCHMARK_BCRYPT';
    const testPass = 'SedincoSecret@2026';
    const testHash = bcrypt.hashSync(testPass, 10);
    const knownIp = '192.168.1.100';

    await query('DELETE FROM login_rate_limits WHERE identifier = ? OR key_name LIKE ?', [testAccount, `%${testAccount}%`]);
    await query('DELETE FROM audit_logs WHERE actor_id = ?', [testAccount]);

    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES (?, 'NV Đo Bcrypt', ?, 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`,
        [testAccount, testHash]);

    // Đăng nhập lần đầu để ghi nhận IP quen thuộc
    await authService.employeeLogin(testAccount, testPass, knownIp);

    const latencies = [];
    for (let run = 1; run <= 30; run++) {
        const t0 = process.hrtime.bigint();
        const loginRes = await authService.employeeLogin(testAccount, testPass, knownIp);
        const t1 = process.hrtime.bigint();
        if (!loginRes.success) {
            throw new Error(`Đăng nhập thất bại ở lần ${run}: ${loginRes.message}`);
        }
        const latencyMs = Number(t1 - t0) / 1e6;
        latencies.push(latencyMs);
    }

    latencies.sort((a, b) => a - b);
    const min = latencies[0];
    const max = latencies[latencies.length - 1];
    const sum = latencies.reduce((acc, v) => acc + v, 0);
    const avg = sum / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];

    console.log(`Số lần đo: 30 lần`);
    console.log(`Min: ${min.toFixed(2)} ms`);
    console.log(`Max: ${max.toFixed(2)} ms`);
    console.log(`Average: ${avg.toFixed(2)} ms`);
    console.log(`p50 (Median): ${p50.toFixed(2)} ms`);
    console.log(`p95: ${p95.toFixed(2)} ms`);
    console.log('\nChi tiết 30 lần (ms):');
    console.log(latencies.map((v, i) => `[${i + 1}] ${v.toFixed(2)} ms`).join(', '));
}

main().then(() => process.exit(0)).catch(err => {
    console.error('Lỗi benchmark:', err);
    process.exit(1);
});
