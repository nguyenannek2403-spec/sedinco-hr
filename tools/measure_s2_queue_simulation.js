/**
 * tools/measure_s2_queue_simulation.js
 * 
 * Mô phỏng hàng đợi thực tế cho Section B (S2):
 * - 20 và 50 công nhân quét tuần tự từ Kiosk.
 * - Mỗi người trễ ngẫu nhiên 4 - 8 giây (trung bình 6 giây).
 * - Kiosk chạy đúng theo mã nguồn KioskDisplayView.jsx:
 *   + Tần suất polling: KHÔNG CÓ polling kiểm tra QR đã dùng.
 *   + Chu kỳ refresh: Chỉ gọi API lấy QR mới khi hết TTL 30 giây (setInterval đếm lùi 30s).
 * - Kết quả: Đo đạc thông lượng thực tế, thời gian chờ trung bình, P95, tỉ lệ "QR đã dùng",
 *   và độ trễ thực tế từ lúc QR bị dùng đến lúc Kiosk có mã mới.
 */

const { query, pool } = require('../sedinco_backend/src/config/db');
const kioskService = require('../sedinco_backend/src/services/kioskService');
const attendanceService = require('../sedinco_backend/src/services/attendanceService');

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function runQueueSimulation(workerCount) {
    console.log(`\n=============================================================================`);
    console.log(`[B. S2 MÔ PHỎNG HÀNG ĐỢI THẬT] QUY MÔ: ${workerCount} CÔNG NHÂN`);
    console.log(`- Trễ giữa 2 công nhân kế tiếp: Ngẫu nhiên 4 - 8 giây (Phân bố đều)`);
    console.log(`- Cơ chế Kiosk (KioskDisplayView.jsx): TTL 30s, đếm lùi client-side, KHÔNG polling`);
    console.log(`=============================================================================`);

    // 1. Lấy hoặc tạo Kiosk kiểm thử
    const kiosks = await query('SELECT * FROM kiosk_devices WHERE is_active = 1 LIMIT 1');
    let kioskKey = kiosks && kiosks.length > 0 ? kiosks[0].api_key : null;
    if (!kioskKey) {
        const newKiosk = await kioskService.registerKiosk('Kiosk Cổng 1', 'Gate 1', '192.168.1.100', 'ADMIN_TEST');
        kioskKey = newKiosk.api_key;
    }

    // 2. Chuẩn bị nhân viên kiểm thử
    for (let i = 1; i <= workerCount; i++) {
        const ma_nv = `NV_Q${String(i).padStart(3, '0')}`;
        const existing = await query('SELECT ma_nv FROM employees WHERE ma_nv = ?', [ma_nv]);
        if (existing.length === 0) {
            await query(`
                INSERT INTO employees (ma_nv, ho_ten, role, password, status, ngay_bat_dau_lam, ngay_chinh_thuc, luong_cb, has_insurance)
                VALUES (?, ?, 'worker', '$2a$10$wT8m9Z7Z.qB7c/7R5R7b7e5b8s7d8f9g0h1j2k3l4m5n6o7p8q9r', 'active', '2025-01-01', '2025-03-01', 8000000, 1)
            `, [ma_nv, `Công nhân Hàng đợi ${i}`]);
        }
    }

    // Dọn dẹp logs cũ của nhóm nhân viên này trong ngày
    await query('DELETE FROM attendance_logs WHERE employee_id LIKE "NV_Q%"');

    // 3. Tiến trình mô phỏng
    // T_sim: Thời gian giả lập (giây tính từ 0)
    let t_sim = 0;
    let kiosk_qr_created_at = 0;
    let kiosk_qr_expires_at = 30; // 30s TTL
    let current_qr_token = null;
    let current_qr_is_used = false;
    let qr_used_at_ts = null;

    let idle_latencies = []; // Thời gian mã QR bị "chết" (đã dùng) nằm trên màn hình Kiosk trước khi đổi mã mới

    async function fetchNewKioskQr(simTime) {
        if (current_qr_is_used && qr_used_at_ts !== null) {
            const idleTime = kiosk_qr_expires_at - qr_used_at_ts;
            idle_latencies.push(idleTime);
        }
        const res = await kioskService.generateKioskQr(kioskKey, '192.168.1.100');
        current_qr_token = res.token;
        kiosk_qr_created_at = simTime;
        kiosk_qr_expires_at = simTime + 30;
        current_qr_is_used = false;
        qr_used_at_ts = null;
    }

    // Kiosk mở màn hình tại t=0
    await fetchNewKioskQr(0);

    const results = {
        workerCount,
        successCount: 0,
        reusedErrorCount: 0,
        expiredErrorCount: 0,
        otherErrorCount: 0,
        apiDurationsMs: [],
        timeline: []
    };

    for (let i = 1; i <= workerCount; i++) {
        const ma_nv = `NV_Q${String(i).padStart(3, '0')}`;
        
        // Công nhân kế tiếp đến Kiosk sau 4 - 8 giây
        const arrivalDelta = randomInt(4, 8);
        t_sim += arrivalDelta;

        // Nếu t_sim vượt quá thời điểm hết hạn của QR trên Kiosk -> Kiosk fetch mã mới
        while (t_sim >= kiosk_qr_expires_at) {
            await fetchNewKioskQr(kiosk_qr_expires_at);
        }

        // Đo thời gian xử lý API thật từ CSDL
        const apiStart = process.hrtime.bigint();
        let status = '';
        let errorMsg = '';

        try {
            await attendanceService.checkInMultiFactor({
                token: current_qr_token,
                lat: 16.054400,
                lng: 108.202200,
                current_user: { ma_nv, role: 'worker' },
                ip_address: '192.168.1.50',
                device_info: `DEV_${ma_nv}`
            });

            const apiEnd = process.hrtime.bigint();
            const durationMs = Number(apiEnd - apiStart) / 1e6;
            results.apiDurationsMs.push(durationMs);

            status = 'SUCCESS';
            results.successCount++;
            current_qr_is_used = true;
            qr_used_at_ts = t_sim;
        } catch (err) {
            const apiEnd = process.hrtime.bigint();
            const durationMs = Number(apiEnd - apiStart) / 1e6;
            results.apiDurationsMs.push(durationMs);

            errorMsg = err.message || '';
            if (errorMsg.includes('Mã QR này đã được sử dụng')) {
                status = 'FAIL_REUSED';
                results.reusedErrorCount++;
            } else if (errorMsg.includes('hết hạn')) {
                status = 'FAIL_EXPIRED';
                results.expiredErrorCount++;
            } else {
                status = 'FAIL_OTHER';
                results.otherErrorCount++;
            }
        }

        results.timeline.push({
            index: i,
            ma_nv,
            simTimeSec: t_sim,
            status,
            errorMsg: status === 'SUCCESS' ? '' : errorMsg
        });
    }

    // Nếu mã cuối cùng cũng bị dùng, ghi nhận độ trễ
    if (current_qr_is_used && qr_used_at_ts !== null) {
        idle_latencies.push(kiosk_qr_expires_at - qr_used_at_ts);
    }

    const totalSimMinutes = t_sim / 60;
    const throughputPerMinute = results.successCount / totalSimMinutes;

    // Tính thống kê API duration
    const sortedDurations = [...results.apiDurationsMs].sort((a, b) => a - b);
    const avgDuration = sortedDurations.reduce((a, b) => a + b, 0) / sortedDurations.length;
    const p95Idx = Math.floor(sortedDurations.length * 0.95);
    const p95Duration = sortedDurations[p95Idx] || sortedDurations[sortedDurations.length - 1];

    const avgIdleSec = idle_latencies.length > 0 
        ? (idle_latencies.reduce((a, b) => a + b, 0) / idle_latencies.length).toFixed(1)
        : '0';

    const reusedPct = ((results.reusedErrorCount / workerCount) * 100).toFixed(1);
    const successPct = ((results.successCount / workerCount) * 100).toFixed(1);

    console.log(`\n--- BÁO CÁO ĐO ĐẠC (${workerCount} CÔNG NHÂN) ---`);
    console.log(`1. Tổng thời gian hàng đợi: ${t_sim} giây (${totalSimMinutes.toFixed(2)} phút)`);
    console.log(`2. Số lượt chấm công thành công: ${results.successCount}/${workerCount} (${successPct}%)`);
    console.log(`3. Số lượt bị lỗi "Mã QR đã được sử dụng": ${results.reusedErrorCount}/${workerCount} (${reusedPct}%)`);
    console.log(`4. Số lượt bị lỗi "Mã QR hết hạn": ${results.expiredErrorCount}`);
    console.log(`5. Lỗi khác: ${results.otherErrorCount}`);
    console.log(`6. THÔNG LƯỢNG THỰC TẾ: ${throughputPerMinute.toFixed(2)} công nhân thành công/phút/kiosk`);
    console.log(`7. Thời gian phản hồi API: Trung bình = ${avgDuration.toFixed(2)} ms, P95 = ${p95Duration.toFixed(2)} ms`);
    console.log(`8. Độ trễ Kiosk hiển thị QR mới sau khi bị quét: Trung bình ${avgIdleSec} giây (Kiosk giữ nguyên mã chết chờ hết 30s)`);

    return {
        workerCount,
        totalSimSec: t_sim,
        totalSimMinutes: Number(totalSimMinutes.toFixed(2)),
        successCount: results.successCount,
        successPct,
        reusedErrorCount: results.reusedErrorCount,
        reusedPct,
        throughputPerMinute: Number(throughputPerMinute.toFixed(2)),
        avgDurationMs: Number(avgDuration.toFixed(2)),
        p95DurationMs: Number(p95Duration.toFixed(2)),
        avgIdleSec,
        sampleTimeline: results.timeline.slice(0, 8)
    };
}

async function main() {
    try {
        console.log("KHỞI ĐỘNG ĐO ĐẠC S2 THEO HÀNG ĐỢI THẬT (20 VÀ 50 CÔNG NHÂN)...");
        const res20 = await runQueueSimulation(20);
        const res50 = await runQueueSimulation(50);

        console.log(`\n=============================================================================`);
        console.log(`TỔNG HỢP SO SÁNH 20 VS 50 CÔNG NHÂN:`);
        console.log(`- Quy mô 20 CN: Thành công ${res20.successCount}/20 (${res20.successPct}%) | Lỗi QR đã dùng: ${res20.reusedErrorCount}/20 (${res20.reusedPct}%) | Thông lượng: ${res20.throughputPerMinute} ng/phút`);
        console.log(`- Quy mô 50 CN: Thành công ${res50.successCount}/50 (${res50.successPct}%) | Lỗi QR đã dùng: ${res50.reusedErrorCount}/50 (${res50.reusedPct}%) | Thông lượng: ${res50.throughputPerMinute} ng/phút`);
        console.log(`=============================================================================`);
        process.exit(0);
    } catch (err) {
        console.error("LỖI MÔ PHỎNG:", err);
        process.exit(1);
    }
}

main();
