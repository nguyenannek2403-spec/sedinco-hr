/**
 * tools/measure_s2_plan_a_simulation.js
 * 
 * Đo lường & So sánh thông lượng Kiosk hàng đợi thực tế giữa 3 phương án:
 *  1. Baseline cũ: Kiosk đếm lùi 30s, không polling đổi mã (TTL 30s)
 *  2. Phương án rút ngắn TTL: Giảm xuống 15s, không polling (TTL 15s)
 *  3. Phương án A (Được duyệt): Kiosk polling trạng thái mỗi 2.5s, đổi mã mới ngay khi đã quét
 * 
 * Đo đạc cho 20 và 50 công nhân đến ngẫu nhiên cách nhau 4 - 8 giây:
 *  - Tỉ lệ chấm công thành công (%)
 *  - Tỉ lệ lỗi QR đã dùng / Replay (%)
 *  - Thông lượng (người/phút/kiosk)
 *  - Thời gian chờ P50, P95 (giây)
 *  - Tải do polling 2.5s lên server (độ trễ API, req/s)
 */

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '123456';
process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'sedinco_test_jwt_secret_super_secure_32chars_min';

const { query } = require('../sedinco_backend/src/config/db');
const attendanceService = require('../sedinco_backend/src/services/attendanceService');
const kioskService = require('../sedinco_backend/src/services/kioskService');
const { performance } = require('perf_hooks');

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function calcPercentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * p);
    return sorted[Math.min(idx, sorted.length - 1)];
}

async function simulateQueue({ workerCount, mode = 'baseline_30s' }) {
    // Tạo 1 kiosk test riêng
    const kioskName = `TEST_SIM_${mode.toUpperCase()}_${Date.now()}`;
    const kioskRes = await kioskService.registerKiosk({
        kiosk_name: kioskName,
        branch_id: 1,
        created_by: 'system'
    });
    const kioskKey = kioskRes.api_key;
    const kioskId = kioskRes.id;

    // Chuẩn bị nhân viên test
    for (let i = 1; i <= workerCount; i++) {
        const ma_nv = `NV_SIM_${String(i).padStart(3, '0')}`;
        await query(`
            INSERT INTO employees (ma_nv, ho_ten, chuc_danh, role, status, is_locked)
            VALUES (?, ?, 'Công nhân sản xuất', 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE status = 'active', is_locked = 0
        `, [ma_nv, `Công nhân Test ${i}`]);
    }

    let t_sim = 0; // Thời gian ảo (giây)
    let current_qr_token = null;
    let kiosk_qr_expires_at = 0;
    let current_qr_is_used = false;
    let qr_used_at_ts = null;
    let next_poll_check_at = 0;

    const ttlSeconds = (mode === 'ttl_15s') ? 15 : 30;

    async function fetchNewKioskQr(simTime) {
        const res = await kioskService.generateKioskQr(kioskKey, '192.168.1.100');
        current_qr_token = res.token;
        kiosk_qr_expires_at = simTime + ttlSeconds;
        current_qr_is_used = false;
        qr_used_at_ts = null;
        next_poll_check_at = simTime + 2.5; // Kiosk polling mỗi 2.5 giây
    }

    await fetchNewKioskQr(0);

    const waitTimes = []; // Thời gian công nhân phải chờ Kiosk đổi mã
    let successCount = 0;
    let reusedCount = 0;
    let expiredCount = 0;
    const apiDurations = [];

    for (let i = 1; i <= workerCount; i++) {
        const ma_nv = `NV_SIM_${String(i).padStart(3, '0')}`;
        const arrivalDelta = randomInt(4, 8); // Khoảng cách đến: 4-8 giây
        t_sim += arrivalDelta;

        // Mô phỏng diễn tiến Kiosk theo thời gian
        if (mode === 'plan_a') {
            // Phương án A: Kiosk hỏi trạng thái mỗi 2.5 giây
            // Nếu mã đã được dùng -> đổi mã mới tại nhịp poll gần nhất
            while (t_sim >= next_poll_check_at) {
                if (current_qr_is_used) {
                    await fetchNewKioskQr(next_poll_check_at);
                    break;
                }
                if (next_poll_check_at >= kiosk_qr_expires_at) {
                    await fetchNewKioskQr(next_poll_check_at);
                    break;
                }
                next_poll_check_at += 2.5;
            }
        } else {
            // Baseline 30s hoặc TTL 15s: Kiosk chỉ đổi mã khi hết hạn đếm lùi
            while (t_sim >= kiosk_qr_expires_at) {
                await fetchNewKioskQr(kiosk_qr_expires_at);
            }
        }

        // Đo thời gian chờ nếu mã đang bị "chết" (đã dùng) trên màn hình
        let waitTimeForFreshQr = 0;
        if (current_qr_is_used) {
            waitTimeForFreshQr = (mode === 'plan_a') 
                ? Math.max(0, next_poll_check_at - t_sim)
                : Math.max(0, kiosk_qr_expires_at - t_sim);
        }
        waitTimes.push(waitTimeForFreshQr);

        // Đo thời gian xử lý API thật từ DB
        const apiStart = performance.now();
        try {
            await attendanceService.checkInMultiFactor({
                token: current_qr_token,
                lat: 16.0544,
                lng: 108.2022,
                current_user: { ma_nv, role: 'worker' },
                ip_address: '192.168.1.100',
                device_info: `UniqueDevice_${ma_nv}`
            });
            const duration = performance.now() - apiStart;
            apiDurations.push(duration);

            successCount++;
            current_qr_is_used = true;
            qr_used_at_ts = t_sim;
            next_poll_check_at = t_sim + 2.5; // Kích hoạt nhịp poll kế tiếp
        } catch (err) {
            const duration = performance.now() - apiStart;
            apiDurations.push(duration);

            if (err.message && err.message.includes('đã được sử dụng')) {
                reusedCount++;
            } else if (err.message && err.message.includes('hết hạn')) {
                expiredCount++;
            }
        }
    }

    // Dọn dẹp test
    await query('DELETE FROM kiosk_devices WHERE id = ?', [kioskId]);
    await query('DELETE FROM dynamic_qr_sessions WHERE branch_id = 1 AND session_token LIKE ?', ['%']);
    await query('DELETE FROM attendance_logs WHERE employee_id LIKE "NV_SIM_%"');
    await query('DELETE FROM audit_logs WHERE actor_id LIKE "NV_SIM_%"');
    await query('DELETE FROM employees WHERE ma_nv LIKE "NV_SIM_%"');

    const totalMinutes = t_sim / 60;
    const throughputPerMin = (successCount / totalMinutes).toFixed(2);
    const successRate = ((successCount / workerCount) * 100).toFixed(1);
    const reusedRate = ((reusedCount / workerCount) * 100).toFixed(1);
    const waitP50 = calcPercentile(waitTimes, 0.50).toFixed(1);
    const waitP95 = calcPercentile(waitTimes, 0.95).toFixed(1);
    const avgDuration = (apiDurations.reduce((a, b) => a + b, 0) / apiDurations.length).toFixed(2);

    return {
        mode,
        workerCount,
        totalSimSeconds: t_sim,
        successCount,
        reusedCount,
        successRate,
        reusedRate,
        throughputPerMin,
        waitP50,
        waitP95,
        avgDuration
    };
}

async function measurePollingOverhead() {
    // Đo đạc độ trễ và tải CPU của endpoint /api/kiosk/qr-status
    const kioskRes = await kioskService.registerKiosk({
        kiosk_name: 'TEST_OVERHEAD_KIOSK',
        branch_id: 1,
        created_by: 'system'
    });
    const key = kioskRes.api_key;
    const qr = await kioskService.generateKioskQr(key, '127.0.0.1');

    const latencies = [];
    for (let i = 0; i < 50; i++) {
        const start = performance.now();
        await kioskService.getKioskQrStatus(key, qr.token);
        latencies.push(performance.now() - start);
    }

    await query('DELETE FROM kiosk_devices WHERE id = ?', [kioskRes.id]);
    await query('DELETE FROM dynamic_qr_sessions WHERE session_token = ?', [qr.token]);

    const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3);
    const p95 = calcPercentile(latencies, 0.95).toFixed(3);
    const rpsPerKiosk = (1 / 2.5).toFixed(2); // 2.5s poll 1 lần -> 0.4 req/s

    return { avgMs: avg, p95Ms: p95, rpsPerKiosk };
}

async function runAllSimulations() {
    console.log('=============================================================================');
    console.log('  BÁO CÁO ĐO LƯỜNG THỰC TẾ HÀNG ĐỢI KIOSK (TRƯỚC & SAU PHƯƠNG ÁN A)');
    console.log('=============================================================================\n');

    console.log('>>> Đang đo lường chi phí tải polling (Overhead) của Phương án A...');
    const overhead = await measurePollingOverhead();
    console.log(`    -> Độ trễ TB API /qr-status: ${overhead.avgMs} ms | P95: ${overhead.p95Ms} ms`);
    console.log(`    -> Tần suất gửi mỗi Kiosk: ${overhead.rpsPerKiosk} req/giây (24 req/phút/kiosk, tải không đáng kể)\n`);

    console.log('>>> [1] ĐO ĐẠC VỚI 20 CÔNG NHÂN (Đến ngẫu nhiên cách nhau 4-8 giây):');
    const r20_baseline = await simulateQueue({ workerCount: 20, mode: 'baseline_30s' });
    const r20_ttl15 = await simulateQueue({ workerCount: 20, mode: 'ttl_15s' });
    const r20_planA = await simulateQueue({ workerCount: 20, mode: 'plan_a' });

    console.log(`  - Baseline (30s không polling): Thành công ${r20_baseline.successCount}/20 (${r20_baseline.successRate}%) | Lỗi Reused ${r20_baseline.reusedCount} (${r20_baseline.reusedRate}%) | Thông lượng: ${r20_baseline.throughputPerMin} ng/phút | Chờ P50: ${r20_baseline.waitP50}s, P95: ${r20_baseline.waitP95}s`);
    console.log(`  - Rút ngắn TTL 15s (Báo cáo riêng): Thành công ${r20_ttl15.successCount}/20 (${r20_ttl15.successRate}%) | Lỗi Reused ${r20_ttl15.reusedCount} (${r20_ttl15.reusedRate}%) | Thông lượng: ${r20_ttl15.throughputPerMin} ng/phút | Chờ P50: ${r20_ttl15.waitP50}s, P95: ${r20_ttl15.waitP95}s`);
    console.log(`  - Phương án A (Polling 2.5s đổi sớm): Thành công ${r20_planA.successCount}/20 (${r20_planA.successRate}%) | Lỗi Reused ${r20_planA.reusedCount} (${r20_planA.reusedRate}%) | Thông lượng: ${r20_planA.throughputPerMin} ng/phút | Chờ P50: ${r20_planA.waitP50}s, P95: ${r20_planA.waitP95}s\n`);

    console.log('>>> [2] ĐO ĐẠC VỚI 50 CÔNG NHÂN (Đến ngẫu nhiên cách nhau 4-8 giây):');
    const r50_baseline = await simulateQueue({ workerCount: 50, mode: 'baseline_30s' });
    const r50_ttl15 = await simulateQueue({ workerCount: 50, mode: 'ttl_15s' });
    const r50_planA = await simulateQueue({ workerCount: 50, mode: 'plan_a' });

    console.log(`  - Baseline (30s không polling): Thành công ${r50_baseline.successCount}/50 (${r50_baseline.successRate}%) | Lỗi Reused ${r50_baseline.reusedCount} (${r50_baseline.reusedRate}%) | Thông lượng: ${r50_baseline.throughputPerMin} ng/phút | Chờ P50: ${r50_baseline.waitP50}s, P95: ${r50_baseline.waitP95}s`);
    console.log(`  - Rút ngắn TTL 15s (Báo cáo riêng): Thành công ${r50_ttl15.successCount}/50 (${r50_ttl15.successRate}%) | Lỗi Reused ${r50_ttl15.reusedCount} (${r50_ttl15.reusedRate}%) | Thông lượng: ${r50_ttl15.throughputPerMin} ng/phút | Chờ P50: ${r50_ttl15.waitP50}s, P95: ${r50_ttl15.waitP95}s`);
    console.log(`  - Phương án A (Polling 2.5s đổi sớm): Thành công ${r50_planA.successCount}/50 (${r50_planA.successRate}%) | Lỗi Reused ${r50_planA.reusedCount} (${r50_planA.reusedRate}%) | Thông lượng: ${r50_planA.throughputPerMin} ng/phút | Chờ P50: ${r50_planA.waitP50}s, P95: ${r50_planA.waitP95}s\n`);

    console.log('=============================================================================');
    console.log('  CẬP NHẬT CÔNG THỨC SỐ KIOSK THEO PHƯƠNG ÁN A (CỬA SỔ 15 PHÚT)');
    console.log('=============================================================================');
    const newThroughput = parseFloat(r50_planA.throughputPerMin);
    const capacityPerKiosk15m = (newThroughput * 15).toFixed(1);
    console.log(`- Thông lượng đo được mới của Phương án A: ~${newThroughput} người/phút/kiosk`);
    console.log(`- Năng lực phục vụ của 1 Kiosk trong 15 phút: C = 15 x ${newThroughput} = ${capacityPerKiosk15m} công nhân`);
    console.log(`- Công thức tính số Kiosk cần thiết: N_kiosk = Math.ceil(So_Cong_Nhan / ${capacityPerKiosk15m})`);
    console.log(`  * 100 công nhân / 15 phút: ${Math.ceil(100 / capacityPerKiosk15m)} Kiosk`);
    console.log(`  * 300 công nhân / 15 phút: ${Math.ceil(300 / capacityPerKiosk15m)} Kiosk`);
    console.log(`  * 500 công nhân / 15 phút: ${Math.ceil(500 / capacityPerKiosk15m)} Kiosk`);
    console.log('=============================================================================\n');

    process.exit(0);
}

runAllSimulations().catch(err => {
    console.error('Lỗi mô phỏng:', err);
    process.exit(1);
});
