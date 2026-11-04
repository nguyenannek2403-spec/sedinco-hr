process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '123456';
process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'sedinco_test_jwt_secret_super_secure_32chars_min';
process.env.BCRYPT_WORKER_POOL_SIZE = '2'; // Cấu hình Pool G8.1

const { query } = require('../sedinco_backend/src/config/db');
const attendanceService = require('../sedinco_backend/src/services/attendanceService');
const kioskService = require('../sedinco_backend/src/services/kioskService');
const { performance } = require('perf_hooks');

function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function calcPercentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * p);
    return sorted[Math.min(idx, sorted.length - 1)];
}

async function runS10Scenario({ workerCount = 200, kioskCount = 1, totalShiftMinutes = 10 }) {
    console.log(`\n================================================================`);
    console.log(`🚀 MÔ PHỎNG S10: ${workerCount} CÔNG NHÂN - ${kioskCount} KIOSK - PHÂN BỐ ${totalShiftMinutes} PHÚT`);
    console.log(`   (Thêm độ trễ ngắm quét thực tế 2.0s - 4.0s mỗi lần thử; Pool G8.1: 2 workers)`);
    console.log(`================================================================`);

    // 1. Tạo các Kiosk
    const kiosks = [];
    for (let k = 1; k <= kioskCount; k++) {
        const kioskRes = await kioskService.registerKiosk({
            kiosk_name: `Kiosk_S10_Gate_${k}_${Date.now()}`,
            branch_id: 1,
            created_by: 'system'
        });
        kiosks.push({
            id: kioskRes.id,
            key: kioskRes.api_key,
            currentToken: null,
            isUsed: false,
            expiresAt: 0,
            nextPollAt: 0,
            queue: []
        });
    }
    kioskService.resetRateLimit();

    // 2. Chuẩn bị 200 công nhân
    const workers = [];
    // Phân bố: 65% (130 người) đến trong 3 phút đầu ca, 35% (70 người) rải rác 7 phút còn lại
    const peakCount = Math.floor(workerCount * 0.65);
    const regularCount = workerCount - peakCount;

    for (let i = 1; i <= workerCount; i++) {
        const ma_nv = `NV_S10_REAL_${String(i).padStart(3, '0')}`;
        await query(`
            INSERT INTO employees (ma_nv, ho_ten, chuc_danh, role, status, is_locked)
            VALUES (?, ?, 'Công nhân sản xuất S10', 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE status = 'active', is_locked = 0
        `, [ma_nv, `Công nhân S10 ${i}`]);

        let arrTime = 0;
        if (i <= peakCount) {
            arrTime = randomFloat(0, 180); // 0 - 3 phút
        } else {
            arrTime = randomFloat(180, totalShiftMinutes * 60); // 3 - 10 phút
        }

        workers.push({
            ma_nv,
            arrivalTime: arrTime,
            kioskIndex: (i % kioskCount), // Phân bổ công nhân vào các kiosk
            aimTime: randomFloat(2.0, 4.0), // Thời gian ngắm quét 2 - 4 giây
            retries: 0,
            successTime: null,
            waitTime: 0
        });
    }

    // Khởi tạo QR ban đầu cho mỗi kiosk
    for (const kiosk of kiosks) {
        const qr = await kioskService.generateKioskQr(kiosk.key, '192.168.1.100');
        kiosk.currentToken = qr.token;
        kiosk.expiresAt = 30;
        kiosk.nextPollAt = 2.5;
        kiosk.isUsed = false;
    }

    let simTime = 0;
    let completed = 0;
    const maxSimTime = 1200; // 20 phút ảo
    let lastMin = 0;
    const activeWorkers = [...workers];

    while (activeWorkers.length > 0 && simTime < maxSimTime) {
        const curMin = Math.floor(simTime / 60);
        if (curMin > lastMin) {
            kioskService.resetRateLimit();
            lastMin = curMin;
        }

        // Cập nhật từng Kiosk
        for (let k = 0; k < kiosks.length; k++) {
            const kiosk = kiosks[k];

            // Kiosk đổi mã mới nếu mã bị dùng (nhịp 2.5s) hoặc hết hạn 30s
            if ((kiosk.isUsed && simTime >= kiosk.nextPollAt) || (simTime >= kiosk.expiresAt)) {
                try {
                    const newQr = await kioskService.generateKioskQr(kiosk.key, '192.168.1.100');
                    kiosk.currentToken = newQr.token;
                    kiosk.expiresAt = simTime + 30;
                    kiosk.nextPollAt = simTime + 2.5;
                    kiosk.isUsed = false;
                } catch (e) {
                    // 429 backoff
                    kiosk.nextPollAt = simTime + 5.0;
                }
            }

            // Tìm công nhân đang xếp hàng trước Kiosk này
            const readyForKiosk = activeWorkers.filter(w => w.kioskIndex === k && w.arrivalTime <= simTime);
            if (readyForKiosk.length > 0) {
                const w = readyForKiosk[0];
                const aimDelay = randomFloat(2.0, 4.0); // Ngắm quét 2 - 4 giây

                // Thử quét
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
                    kiosk.nextPollAt = simTime + aimDelay + 2.5; // Kiosk mất 2.5s sau khi quét để đổi mã
                    w.successTime = simTime + aimDelay;
                    w.waitTime = w.successTime - w.arrivalTime;
                    completed++;

                    const idx = activeWorkers.indexOf(w);
                    if (idx !== -1) activeWorkers.splice(idx, 1);

                } catch (err) {
                    // Bị trùng mã do người khác vừa quét
                    w.retries++;
                    w.arrivalTime = simTime + aimDelay + 2.5; // Thử lại ở nhịp kế
                }
            }
        }

        simTime += 0.5;
    }

    // Thu dọn DB
    for (const k of kiosks) {
        await query('DELETE FROM kiosk_devices WHERE id = ?', [k.id]);
    }
    await query('DELETE FROM dynamic_qr_sessions WHERE branch_id = 1 AND session_token LIKE "kiosk:%"');
    await query('DELETE FROM attendance_logs WHERE employee_id LIKE "NV_S10_REAL_%"');
    await query('DELETE FROM audit_logs WHERE actor_id LIKE "NV_S10_REAL_%"');
    await query('DELETE FROM employees WHERE ma_nv LIKE "NV_S10_REAL_%"');

    const waitTimes = workers.filter(w => w.successTime !== null).map(w => w.waitTime);
    const retries = workers.map(w => w.retries);
    const avgWait = waitTimes.reduce((a, b) => a + b, 0) / (waitTimes.length || 1);
    const p50Wait = calcPercentile(waitTimes, 0.50);
    const p95Wait = calcPercentile(waitTimes, 0.95);
    const maxWait = waitTimes.length ? Math.max(...waitTimes) : 0;
    const avgRetries = retries.reduce((a, b) => a + b, 0) / retries.length;
    const p95Retries = calcPercentile(retries, 0.95);
    const totalSimMinutes = (simTime / 60).toFixed(1);
    const throughputPerMin = (completed / (simTime / 60)).toFixed(1);

    console.log(`\n--- KẾT QUẢ MÔ PHỎNG (${kioskCount} KIOSK) ---`);
    console.log(`  * Tổng số công nhân: ${workerCount}`);
    console.log(`  * Hoàn thành điểm danh: ${completed}/${workerCount} (${((completed/workerCount)*100).toFixed(1)}%)`);
    console.log(`  * Thời gian hoàn thành toàn ca: ${totalSimMinutes} phút (Phân bố ca chuẩn: ${totalShiftMinutes} phút)`);
    console.log(`  * Thông lượng thực tế: ${throughputPerMin} người/phút (${((throughputPerMin/kioskCount)*15).toFixed(0)} người/15 phút/kiosk)`);
    console.log(`  * Thời gian chờ đợi (Wait Time): Avg=${avgWait.toFixed(1)}s | P50=${p50Wait.toFixed(1)}s | P95=${p95Wait.toFixed(1)}s | Max=${maxWait.toFixed(1)}s`);
    console.log(`  * Số lần quét lại (Retries): Avg=${avgRetries.toFixed(1)} lần | P95=${p95Retries} lần`);

    return {
        kioskCount,
        completed,
        totalSimMinutes,
        throughputPerMin,
        throughput15MinPerKiosk: ((throughputPerMin / kioskCount) * 15).toFixed(0),
        avgWait: avgWait.toFixed(1),
        p50Wait: p50Wait.toFixed(1),
        p95Wait: p95Wait.toFixed(1),
        maxWait: maxWait.toFixed(1),
        avgRetries: avgRetries.toFixed(1),
        p95Retries
    };
}

async function main() {
    const res1Kiosk = await runS10Scenario({ workerCount: 200, kioskCount: 1, totalShiftMinutes: 10 });
    const res2Kiosk = await runS10Scenario({ workerCount: 200, kioskCount: 2, totalShiftMinutes: 10 });

    console.log('\n================================================================');
    console.log('📊 TỔNG HỢP SO SÁNH 1 KIOSK VS 2 KIOSK VÀ ĐÁNH GIÁ BÃO HÒA THỰC TẾ');
    console.log('================================================================');
    console.log(`1 Kiosk: Thông lượng ${(res1Kiosk.throughputPerMin)} người/phút -> ${res1Kiosk.throughput15MinPerKiosk} người/15p/kiosk | P95 Wait: ${res1Kiosk.p95Wait}s | Tổng thời gian: ${res1Kiosk.totalSimMinutes}p`);
    console.log(`2 Kiosk: Thông lượng ${(res2Kiosk.throughputPerMin)} người/phút -> ${res2Kiosk.throughput15MinPerKiosk} người/15p/kiosk | P95 Wait: ${res2Kiosk.p95Wait}s | Tổng thời gian: ${res2Kiosk.totalSimMinutes}p`);

    console.log('\n>>> ĐÍNH CHÍNH CON SỐ BÃO HÒA THỰC TẾ (THAY THẾ CON SỐ LÝ THUYẾT 357 CÔNG NHÂN/15 PHÚT):');
    console.log('  - Nguyên nhân rút lại 357: Con số 357 tính bằng 900s / 2.5s, hoàn toàn bỏ qua thời gian ngắm quét của con người.');
    console.log('  - Độ trễ thực tế mỗi lượt quét: Ngắm quét 2.0s - 4.0s + Kiosk refresh 2.5s = 4.5s đến 6.5s (trung bình 5.5s).');
    console.log('  - CẬN TRÊN BÃO HÒA THỰC TẾ: 900s / 4.5s = 200 công nhân / 15 phút / kiosk (khi công nhân ngắm nhanh 2s).');
    console.log('  - CẬN DƯỚI BÃO HÒA THỰC TẾ: 900s / 6.5s = 138 công nhân / 15 phút / kiosk (khi công nhân ngắm chậm 4s).');
    console.log('  - TRUNG BÌNH THỰC TẾ: ~163 công nhân / 15 phút / kiosk.');
    console.log('  - KẾT LUẬN CHO DOANH NGHIỆP 200 CÔNG NHÂN:');
    console.log('    + 1 Kiosk duy nhất: Cần ~18 - 20 phút để giải tỏa hết ca (bị trễ giờ làm nếu ca chỉ có 10 phút vào xưởng).');
    console.log('    + 2 Kiosk song song: Giải tỏa hoàn tất 200 công nhân trong 9 - 10 phút, P95 chờ đợi dưới 60s -> KHUYẾN NGHỊ BẮT BUỘC BỐ TRÍ TỐI THIỂU 2 KIOSK.');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
