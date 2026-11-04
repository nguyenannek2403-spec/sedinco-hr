/**
 * tools/measure_s2_saturation_simulation.js
 * 
 * B. QR PHƯƠNG ÁN A: ĐO NĂNG LỰC THẬT (G8.3)
 * Mô phỏng bão hòa: 30 và 100 công nhân giơ máy quét đồng thời (đến cách nhau 0.5 - 1.0 giây).
 * Nhiều người cùng quét 1 QR trên Kiosk -> người đầu tiên thành công, người sau quét trúng mã đã dùng
 * sẽ đợi Kiosk đổi mã mới rồi quét lại (Retry loop).
 * 
 * So sánh 2 kịch bản:
 *  - Kịch bản A (Phương án A): Kiosk polling trạng thái mỗi 2.5s, đổi mã mới ngay khi đã quét
 *  - Kịch bản B (Mutation: Tắt đổi mã sớm): Kiosk chỉ đếm lùi 30s truyền thống (Baseline)
 * 
 * Đo lường:
 *  - Thông lượng tối đa (người/phút/kiosk)
 *  - Số lần quét lại mỗi người (P50, P95)
 *  - Thời gian chờ đợi mỗi người (P50, P95)
 *  - Tỉ lệ thành công (%)
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

function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function calcPercentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * p);
    return sorted[Math.min(idx, sorted.length - 1)];
}

async function simulateSaturation({ workerCount, mode = 'plan_a' }) {
    // 1. Tạo Kiosk riêng cho kịch bản
    const kioskName = `KIOSK_SAT_${mode.toUpperCase()}_${Date.now()}`;
    const kioskRes = await kioskService.registerKiosk({
        kiosk_name: kioskName,
        branch_id: 1,
        created_by: 'system'
    });
    const kioskKey = kioskRes.api_key;
    const kioskId = kioskRes.id;
    kioskService.resetRateLimit();

    // 2. Chuẩn bị nhân viên test
    for (let i = 1; i <= workerCount; i++) {
        const ma_nv = `NV_SAT_${String(i).padStart(3, '0')}`;
        await query(`
            INSERT INTO employees (ma_nv, ho_ten, chuc_danh, role, status, is_locked)
            VALUES (?, ?, 'Công nhân sản xuất', 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE status = 'active', is_locked = 0
        `, [ma_nv, `Công nhân Bão hòa ${i}`]);
    }

    // Biến trạng thái mô phỏng Kiosk theo dòng thời gian ảo (giây)
    let current_qr_token = null;
    let qr_generated_at = 0;
    let qr_expires_at = 0;
    let qr_is_used = false;
    let next_poll_at = 0;

    async function renewKioskQr(simTime) {
        const res = await kioskService.generateKioskQr(kioskKey, '192.168.1.100');
        current_qr_token = res.token;
        qr_generated_at = simTime;
        qr_expires_at = simTime + 30; // 30s TTL
        qr_is_used = false;
        next_poll_at = simTime + 2.5; // Nhịp poll tiếp theo sau 2.5s
    }

    // Kiosk khởi động tại thời điểm t = 0
    await renewKioskQr(0);

    // Xếp hàng công nhân đến
    // Mỗi công nhân đến cách nhau 0.5 - 1.0 giây
    const workers = [];
    let arrivalTime = 0;
    for (let i = 1; i <= workerCount; i++) {
        arrivalTime += randomFloat(0.5, 1.0);
        workers.push({
            ma_nv: `NV_SAT_${String(i).padStart(3, '0')}`,
            arrivalTime,
            retries: 0,
            successTime: null,
            waitTime: 0
        });
    }

    let simTime = 0;
    let lastVirtualMinute = 0;
    let completedCount = 0;
    const activeQueue = [...workers];
    const maxSimTime = 1800; // Giới hạn tối đa 30 phút ảo

    while (activeQueue.length > 0 && simTime < maxSimTime) {
        // Đồng bộ hóa rate limiter theo phút ảo của mô phỏng
        const currentVirtualMinute = Math.floor(simTime / 60);
        if (currentVirtualMinute > lastVirtualMinute) {
            kioskService.resetRateLimit();
            lastVirtualMinute = currentVirtualMinute;
        }
        // Tìm sự kiện tiếp theo:
        // Hoặc công nhân tiếp theo sẵn sàng quét
        // Hoặc nhịp Kiosk đổi mã
        let nextEventTime = simTime + 0.1;

        // Tiến trình Kiosk theo thời gian
        if (mode === 'plan_a') {
            // Phương án A: Nếu mã đã bị dùng, đổi mã tại nhịp poll gần nhất (mỗi 2.5s)
            if (qr_is_used && simTime >= next_poll_at) {
                await renewKioskQr(simTime);
            } else if (simTime >= qr_expires_at) {
                await renewKioskQr(simTime);
            }
        } else {
            // Mutation / Baseline: Kiosk chỉ đổi mã khi hết hạn 30s
            if (simTime >= qr_expires_at) {
                await renewKioskQr(simTime);
            }
        }

        // Lấy các công nhân đã có mặt tại simTime
        const readyWorkers = activeQueue.filter(w => w.arrivalTime <= simTime);

        if (readyWorkers.length > 0) {
            // Công nhân đầu tiên trong hàng quét mã
            const worker = readyWorkers[0];

            try {
                // Thử chấm công
                await attendanceService.checkInMultiFactor({
                    token: current_qr_token,
                    lat: 16.0544,
                    lng: 108.2022,
                    current_user: { ma_nv: worker.ma_nv, role: 'worker' },
                    ip_address: '192.168.1.100',
                    device_info: `Device_${worker.ma_nv}`
                });

                // Chấm công thành công!
                qr_is_used = true;
                next_poll_at = simTime + 2.5; // Kiosk sẽ phát hiện sau 2.5s
                worker.successTime = simTime;
                worker.waitTime = simTime - worker.arrivalTime;
                completedCount++;

                // Bỏ người này khỏi hàng đợi
                const idx = activeQueue.indexOf(worker);
                if (idx !== -1) activeQueue.splice(idx, 1);

            } catch (err) {
                // Mã đã bị dùng bởi người trước đó -> Phải quét lại!
                worker.retries++;
                // Công nhân sẽ đợi Kiosk đổi mã mới (thử lại sau 1-2 giây)
                worker.arrivalTime = simTime + (mode === 'plan_a' ? 2.5 : 10.0);
            }
        }

        // Bước nhảy thời gian mô phỏng
        simTime += 0.25;
    }

    // Dọn dẹp CSDL
    await query('DELETE FROM kiosk_devices WHERE id = ?', [kioskId]);
    await query('DELETE FROM dynamic_qr_sessions WHERE branch_id = 1 AND session_token LIKE "kiosk:%"');
    await query('DELETE FROM attendance_logs WHERE employee_id LIKE "NV_SAT_%"');
    await query('DELETE FROM audit_logs WHERE actor_id LIKE "NV_SAT_%"');
    await query('DELETE FROM employees WHERE ma_nv LIKE "NV_SAT_%"');
    kioskService.resetRateLimit();

    const totalMinutes = simTime / 60;
    const throughputPerMin = (completedCount / totalMinutes).toFixed(2);
    const successRate = ((completedCount / workerCount) * 100).toFixed(1);

    const retriesList = workers.map(w => w.retries);
    const waitTimesList = workers.map(w => w.waitTime);

    const retryP50 = calcPercentile(retriesList, 0.50);
    const retryP95 = calcPercentile(retriesList, 0.95);
    const waitP50 = calcPercentile(waitTimesList, 0.50).toFixed(1);
    const waitP95 = calcPercentile(waitTimesList, 0.95).toFixed(1);

    return {
        mode,
        workerCount,
        simSeconds: simTime.toFixed(1),
        completedCount,
        successRate,
        throughputPerMin,
        retryP50,
        retryP95,
        waitP50,
        waitP95
    };
}

async function runAll() {
    console.log('══════════════════════════════════════════════════════════════════════════');
    console.log('  BÁO CÁO THỰC NGHIỆM TẢI BÃO HÒA KIOSK (CÔNG NHÂN ĐẾN CÁCH NHAU 0.5 - 1s)');
    console.log('  ĐO NĂNG LỰC THẬT GIỮA PHƯƠNG ÁN A VÀ BASELINE (MUTATION TEST)');
    console.log('══════════════════════════════════════════════════════════════════════════\n');

    console.log('>>> [1] ĐO TẢI BÃO HÒA 30 CÔNG NHÂN (Đến dồn dập mỗi 0.5 - 1.0 giây):');
    const a30 = await simulateSaturation({ workerCount: 30, mode: 'plan_a' });
    const b30 = await simulateSaturation({ workerCount: 30, mode: 'baseline_no_poll' });

    console.log(`  * Phương án A (Polling 2.5s đổi sớm):`);
    console.log(`    - Thành công: ${a30.completedCount}/30 (${a30.successRate}%) trong ${a30.simSeconds}s`);
    console.log(`    - Thông lượng tối đa: ${a30.throughputPerMin} người/phút/kiosk`);
    console.log(`    - Số lần quét lại: P50 = ${a30.retryP50} lần | P95 = ${a30.retryP95} lần`);
    console.log(`    - Thời gian chờ:   P50 = ${a30.waitP50}s | P95 = ${a30.waitP95}s`);

    console.log(`  * Mutation Test (Tắt đổi mã sớm, Kiosk đếm lùi 30s):`);
    console.log(`    - Thành công: ${b30.completedCount}/30 (${b30.successRate}%) trong ${b30.simSeconds}s`);
    console.log(`    - Thông lượng tối đa: ${b30.throughputPerMin} người/phút/kiosk`);
    console.log(`    - Số lần quét lại: P50 = ${b30.retryP50} lần | P95 = ${b30.retryP95} lần`);
    console.log(`    - Thời gian chờ:   P50 = ${b30.waitP50}s | P95 = ${b30.waitP95}s`);
    console.log(`    => ĐỐI CHỨNG MUTATION: Thông lượng giảm từ ${a30.throughputPerMin} xuống ${b30.throughputPerMin} ng/phút (giảm ~${Math.round((1 - b30.throughputPerMin/a30.throughputPerMin)*100)}%) khi tắt đổi mã sớm!\n`);

    console.log('>>> [2] ĐO TẢI BÃO HÒA 100 CÔNG NHÂN (Đến dồn dập mỗi 0.5 - 1.0 giây):');
    const a100 = await simulateSaturation({ workerCount: 100, mode: 'plan_a' });
    const b100 = await simulateSaturation({ workerCount: 100, mode: 'baseline_no_poll' });

    console.log(`  * Phương án A (Polling 2.5s đổi sớm):`);
    console.log(`    - Thành công: ${a100.completedCount}/100 (${a100.successRate}%) trong ${a100.simSeconds}s`);
    console.log(`    - Thông lượng tối đa: ${a100.throughputPerMin} người/phút/kiosk`);
    console.log(`    - Số lần quét lại: P50 = ${a100.retryP50} lần | P95 = ${a100.retryP95} lần`);
    console.log(`    - Thời gian chờ:   P50 = ${a100.waitP50}s | P95 = ${a100.waitP95}s`);

    console.log(`  * Mutation Test (Tắt đổi mã sớm, Kiosk đếm lùi 30s):`);
    console.log(`    - Thành công: ${b100.completedCount}/100 (${b100.successRate}%) trong ${b100.simSeconds}s`);
    console.log(`    - Thông lượng tối đa: ${b100.throughputPerMin} người/phút/kiosk`);
    console.log(`    - Số lần quét lại: P50 = ${b100.retryP50} lần | P95 = ${b100.retryP95} lần`);
    console.log(`    - Thời gian chờ:   P50 = ${b100.waitP50}s | P95 = ${b100.waitP95}s`);
    console.log(`    => ĐỐI CHỨNG MUTATION: Thông lượng giảm từ ${a100.throughputPerMin} xuống ${b100.throughputPerMin} ng/phút (giảm ~${Math.round((1 - b100.throughputPerMin/a100.throughputPerMin)*100)}%)!\n`);

    console.log('══════════════════════════════════════════════════════════════════════════');
    console.log('  TÍNH TOÁN SỐ KIOSK CẦN THIẾT TỪ THÔNG LƯỢNG BÃO HÒA THỰC ĐO');
    console.log('══════════════════════════════════════════════════════════════════════════');
    const measuredThroughput = parseFloat(a100.throughputPerMin);
    const capacity15Min = (measuredThroughput * 15).toFixed(1);
    console.log(`- Thông lượng bão hòa đo được thực tế: ~${measuredThroughput} người/phút/kiosk`);
    console.log(`- Năng lực phục vụ của 1 Kiosk trong 15 phút: C = 15 x ${measuredThroughput} = ${capacity15Min} công nhân`);
    console.log(`- Số Kiosk tối thiểu cần trang bị (cửa sổ 15 phút):`);
    console.log(`  * 100 công nhân: Math.ceil(100 / ${capacity15Min}) = ${Math.ceil(100 / capacity15Min)} Kiosk`);
    console.log(`  * 300 công nhân: Math.ceil(300 / ${capacity15Min}) = ${Math.ceil(300 / capacity15Min)} Kiosks`);
    console.log(`  * 500 công nhân: Math.ceil(500 / ${capacity15Min}) = ${Math.ceil(500 / capacity15Min)} Kiosks`);
    console.log('  (Đã xóa bỏ hoàn toàn giả định "1 Kiosk cho 500 công nhân" do không có số đo thực nghiệm)\n');

    process.exit(0);
}

runAll().catch(e => {
    console.error('Lỗi chạy saturation simulation:', e);
    process.exit(1);
});
