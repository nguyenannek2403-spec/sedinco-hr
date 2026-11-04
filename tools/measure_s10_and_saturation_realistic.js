/**
 * tools/measure_s10_and_saturation_realistic.js
 * 
 * Mô phỏng S10 Chi Tiết và Phân Tích Độ Nhạy (G8.5 Mục F):
 * - 200 công nhân, phân bố 10 phút đầu ca (65% đến trong 3 phút đầu)
 * - 2 Kiosk và 3 Kiosk
 * - 3 kịch bản thời gian ngắm quét:
 *     + 1.0s - 3.0s (Thao tác nhanh)
 *     + 2.0s - 4.0s (GIẢ ĐỊNH cơ sở)
 *     + 3.0s - 6.0s (Thao tác chậm / công nhân lớn tuổi)
 * - Trích xuất:
 *     + Số lần quét thất bại mỗi người (p50 / p95)
 *     + Thời gian từ lúc bắt đầu quét đến khi thành công (p50 / p95 / max)
 *     + Thời gian hoàn thành giải tỏa toàn ca
 */

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '123456';
process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'sedinco_test_jwt_secret_super_secure_32chars_min';
process.env.BCRYPT_WORKER_POOL_SIZE = '2';

const { query } = require('../sedinco_backend/src/config/db');
const attendanceService = require('../sedinco_backend/src/services/attendanceService');
const kioskService = require('../sedinco_backend/src/services/kioskService');

function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function calcPercentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * p);
    return sorted[Math.min(idx, sorted.length - 1)];
}

async function runSimulationScenario({ workerCount = 200, kioskCount = 2, totalShiftMinutes = 10, aimMin = 2.0, aimMax = 4.0, scenarioLabel = '' }) {
    // 1. Tạo Kiosk
    const kiosks = [];
    for (let k = 1; k <= kioskCount; k++) {
        const kioskRes = await kioskService.registerKiosk({
            kiosk_name: `Kiosk_Sim_${kioskCount}K_${Date.now()}_${k}`,
            branch_id: 1,
            created_by: 'system'
        });
        kiosks.push({
            id: kioskRes.id,
            key: kioskRes.api_key,
            currentToken: null,
            isUsed: false,
            expiresAt: 0,
            nextPollAt: 0
        });
    }
    kioskService.resetRateLimit();

    // 2. Tạo 200 công nhân
    const workers = [];
    const peakCount = Math.floor(workerCount * 0.65); // 65% dồn vào 3 phút đầu ca
    for (let i = 1; i <= workerCount; i++) {
        const ma_nv = `NV_SIM_${String(i).padStart(3, '0')}`;
        await query(`
            INSERT INTO employees (ma_nv, ho_ten, chuc_danh, role, status, is_locked)
            VALUES (?, ?, 'Công nhân sản xuất', 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE status = 'active', is_locked = 0
        `, [ma_nv, `Công nhân Sim ${i}`]);

        let arrTime = (i <= peakCount) ? randomFloat(0, 180) : randomFloat(180, totalShiftMinutes * 60);

        workers.push({
            ma_nv,
            arrivalTime: arrTime,
            kioskIndex: (i % kioskCount),
            aimMin,
            aimMax,
            firstScanStartTime: null, // Thời điểm bắt đầu giơ máy quét lần đầu
            retries: 0,
            successTime: null,
            scanDuration: 0, // Thời gian từ lúc bắt đầu quét đến lúc thành công
            waitTime: 0
        });
    }

    // Khởi tạo QR ban đầu
    for (const kiosk of kiosks) {
        const qr = await kioskService.generateKioskQr(kiosk.key, '192.168.1.100');
        kiosk.currentToken = qr.token;
        kiosk.expiresAt = 30;
        kiosk.nextPollAt = 2.5;
        kiosk.isUsed = false;
    }

    let simTime = 0;
    let completed = 0;
    const maxSimTime = 1800; // 30 phút ảo
    let lastMin = 0;
    const activeWorkers = [...workers];

    while (activeWorkers.length > 0 && simTime < maxSimTime) {
        const curMin = Math.floor(simTime / 60);
        if (curMin > lastMin) {
            kioskService.resetRateLimit();
            lastMin = curMin;
        }

        for (let k = 0; k < kiosks.length; k++) {
            const kiosk = kiosks[k];

            // Kiosk đổi mã mới nếu đã bị dùng (nhịp polling 2.5s) hoặc hết hạn 30s
            if ((kiosk.isUsed && simTime >= kiosk.nextPollAt) || (simTime >= kiosk.expiresAt)) {
                try {
                    const newQr = await kioskService.generateKioskQr(kiosk.key, '192.168.1.100');
                    kiosk.currentToken = newQr.token;
                    kiosk.expiresAt = simTime + 30;
                    kiosk.nextPollAt = simTime + 2.5;
                    kiosk.isUsed = false;
                } catch (e) {
                    kiosk.nextPollAt = simTime + 5.0;
                }
            }

            // Công nhân ở đầu hàng trước Kiosk này
            const readyWorkers = activeWorkers.filter(w => w.kioskIndex === k && w.arrivalTime <= simTime);
            if (readyWorkers.length > 0) {
                const w = readyWorkers[0];
                const aimDelay = randomFloat(w.aimMin, w.aimMax);

                if (w.firstScanStartTime === null) {
                    w.firstScanStartTime = simTime;
                }

                try {
                    await attendanceService.checkInMultiFactor({
                        token: kiosk.currentToken,
                        lat: 16.0544,
                        lng: 108.2022,
                        current_user: { ma_nv: w.ma_nv, role: 'worker' },
                        ip_address: '192.168.1.100',
                        device_info: `Device_${w.ma_nv}`
                    });

                    // Thành công
                    kiosk.isUsed = true;
                    kiosk.nextPollAt = simTime + aimDelay + 2.5;
                    w.successTime = simTime + aimDelay;
                    w.waitTime = w.successTime - w.arrivalTime;
                    w.scanDuration = w.successTime - w.firstScanStartTime;
                    completed++;

                    const idx = activeWorkers.indexOf(w);
                    if (idx !== -1) activeWorkers.splice(idx, 1);

                } catch (err) {
                    // Thất bại (do người khác quét trước hoặc mã hết hạn)
                    w.retries++;
                    w.arrivalTime = simTime + aimDelay + 2.5; // Đợi mã mới nhịp kế
                }
            }
        }

        simTime += 0.5;
    }

    // Cleanup DB
    for (const k of kiosks) {
        await query('DELETE FROM kiosk_devices WHERE id = ?', [k.id]);
    }
    await query('DELETE FROM dynamic_qr_sessions WHERE branch_id = 1 AND session_token LIKE "kiosk:%"');
    await query('DELETE FROM attendance_logs WHERE employee_id LIKE "NV_SIM_%"');
    await query('DELETE FROM employees WHERE ma_nv LIKE "NV_SIM_%"');

    const successfulWorkers = workers.filter(w => w.successTime !== null);
    const scanDurations = successfulWorkers.map(w => w.scanDuration);
    const waitTimes = successfulWorkers.map(w => w.waitTime);
    const retries = workers.map(w => w.retries);

    const result = {
        scenarioLabel,
        kioskCount,
        aimRange: `${aimMin}s - ${aimMax}s`,
        completed,
        totalSimMinutes: (simTime / 60).toFixed(1),
        throughputPerMin: (completed / (simTime / 60)).toFixed(1),
        // Số lần quét thất bại mỗi người (p50 / p95)
        retryP50: calcPercentile(retries, 0.50),
        retryP95: calcPercentile(retries, 0.95),
        retryMax: Math.max(...retries),
        // Thời gian từ lúc bắt đầu quét đến lúc thành công (p50 / p95 / max)
        scanDurP50: calcPercentile(scanDurations, 0.50).toFixed(1),
        scanDurP95: calcPercentile(scanDurations, 0.95).toFixed(1),
        scanDurMax: (scanDurations.length ? Math.max(...scanDurations) : 0).toFixed(1),
        // Thời gian chờ đợi xếp hàng (p50 / p95)
        waitP50: calcPercentile(waitTimes, 0.50).toFixed(1),
        waitP95: calcPercentile(waitTimes, 0.95).toFixed(1)
    };

    return result;
}

async function main() {
    console.log('========================================================================================');
    console.log('📊 CHƯƠNG TRÌNH MÔ PHỎNG S10 & PHÂN TÍCH ĐỘ NHẠY TRẢI NGHIỆM CÔNG NHÂN (G8.5 MỤC F)');
    console.log('   (Quy mô: 200 công nhân, phân bố 10 phút đầu ca [65% dồn trong 3 phút đầu])');
    console.log('   * Lưu ý quan trọng: "Thời gian ngắm quét 2.0s - 4.0s là GIẢ ĐỊNH cơ sở"');
    console.log('========================================================================================\n');

    const matrix = [
        // 2 Kiosk
        { kioskCount: 2, aimMin: 1.0, aimMax: 3.0, scenarioLabel: '2 Kiosk | Ngắm nhanh (1-3s)' },
        { kioskCount: 2, aimMin: 2.0, aimMax: 4.0, scenarioLabel: '2 Kiosk | GIẢ ĐỊNH cơ sở (2-4s)' },
        { kioskCount: 2, aimMin: 3.0, aimMax: 6.0, scenarioLabel: '2 Kiosk | Ngắm chậm (3-6s)' },
        // 3 Kiosk
        { kioskCount: 3, aimMin: 1.0, aimMax: 3.0, scenarioLabel: '3 Kiosk | Ngắm nhanh (1-3s)' },
        { kioskCount: 3, aimMin: 2.0, aimMax: 4.0, scenarioLabel: '3 Kiosk | GIẢ ĐỊNH cơ sở (2-4s)' },
        { kioskCount: 3, aimMin: 3.0, aimMax: 6.0, scenarioLabel: '3 Kiosk | Ngắm chậm (3-6s)' }
    ];

    const results = [];
    for (const m of matrix) {
        console.log(`Đang chạy mô phỏng: ${m.scenarioLabel}...`);
        const r = await runSimulationScenario(m);
        results.push(r);
        console.log(`  -> Xong: Giải tỏa ${r.totalSimMinutes}p | Fail p50=${r.retryP50}, p95=${r.retryP95} | ScanDur p50=${r.scanDurP50}s, p95=${r.scanDurP95}s, max=${r.scanDurMax}s`);
    }

    console.log('\n========================================================================================================================');
    console.log('📋 BẢNG TỔNG HỢP MÔ PHỎNG S10 (2 VÀ 3 KIOSK - ĐỘ NHẠY THỜI GIAN NGẮM QUÉT)');
    console.log('========================================================================================================================');
    console.log('| Kịch bản | Kiosk | Dải ngắm quét | Giải tỏa ca | Số lần quét fail (p50/p95/max) | TG từ lúc quét đến xong (p50/p95/max) | Chờ xếp hàng (p50/p95) |');
    console.log('| :--- | :---: | :---: | :---: | :---: | :---: | :---: |');
    for (const r of results) {
        console.log(`| ${r.scenarioLabel.padEnd(30)} | ${r.kioskCount} | ${r.aimRange.padEnd(10)} | ${r.totalSimMinutes} phút | ${r.retryP50} / ${r.retryP95} / ${r.retryMax} | ${r.scanDurP50}s / ${r.scanDurP95}s / ${r.scanDurMax}s | ${r.waitP50}s / ${r.waitP95}s |`);
    }
    console.log('========================================================================================================================\n');

    process.exit(0);
}

main().catch(err => {
    console.error('Lỗi mô phỏng:', err);
    process.exit(1);
});
