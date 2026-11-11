/**
 * G2 Cluster 2c: Anomaly Detection Tests (Anti-Fraud without sameIp False-Positives)
 * Đề xuất 3 (Đã duyệt):
 * - Bỏ sameIp hoàn toàn (tránh báo nhầm 100% khi nhân viên cùng Wi-Fi văn phòng)
 * - Một thiết bị nhiều tài khoản (chấm công hộ)
 * - Một tài khoản nhiều thiết bị bất thường trong ngày (≥ 3 thiết bị)
 * - Di chuyển vô lý / Impossible Travel (> 120 km/h hoặc khoảng cách xa trong thời gian ngắn)
 * - Đo đạc tỷ lệ báo nhầm (False Positive Rate)
 * 
 * Quy trình: ĐỎ → XANH
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Chốt chặn DB test
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
if (!DB_NAME.includes('test')) {
    throw new Error(`[CHỐT CHẶN] DB_NAME="${DB_NAME}" không chứa "test"! Hủy bỏ test.`);
}

process.env.NODE_ENV = 'test';
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env.test') });
process.env.JWT_SECRET = process.env.JWT_SECRET || 'sedinco_test_jwt_secret_super_secure_32chars_min';

const { query } = require('../src/config/db');
const attendanceService = require('../src/services/attendanceService');
const { generateDynamicQrToken } = require('../src/utils/dynamicQrHelper');
const { detectAttendanceAnomalies } = require('../src/utils/anomalyDetector');

// Tài khoản test riêng
const EMP_A = 'NV_ANOMALY_A';
const EMP_B = 'NV_ANOMALY_B';

before(async () => {
    // Tạo 2 nhân viên test
    await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
        VALUES 
        (?, 'NV Anomaly A', '123456', 'worker', 'active', 0),
        (?, 'NV Anomaly B', '123456', 'worker', 'active', 0)
        ON DUPLICATE KEY UPDATE status = 'active', is_locked = 0`, [EMP_A, EMP_B]);

    // Dọn dẹp logs test cũ
    await query('DELETE FROM attendance_logs WHERE employee_id IN (?, ?)', [EMP_A, EMP_B]);
    await query("DELETE FROM audit_logs WHERE actor_id IN (?, ?)", [EMP_A, EMP_B]);
});

beforeEach(async () => {
    // Đảm bảo tính độc lập giữa các ca kiểm thử
    await query('DELETE FROM attendance_logs WHERE employee_id IN (?, ?)', [EMP_A, EMP_B]);
    await query("DELETE FROM audit_logs WHERE actor_id IN (?, ?)", [EMP_A, EMP_B]);
});

after(async () => {
    await query('DELETE FROM attendance_logs WHERE employee_id IN (?, ?)', [EMP_A, EMP_B]);
    await query("DELETE FROM audit_logs WHERE actor_id IN (?, ?)", [EMP_A, EMP_B]);
    await query('DELETE FROM employees WHERE ma_nv IN (?, ?)', [EMP_A, EMP_B]);
});

// ─────────────────────────────────────────────────
// TC-G2-ANOMALY-01: Bỏ sameIp: Cùng IP không bị cờ gian lận
// ─────────────────────────────────────────────────
it('TC-G2-ANOMALY-01: Hai nhân viên khác nhau cùng IP Wi-Fi công ty KHÔNG BỊ gắn cờ suspicious', async () => {
    const sharedIp = '192.168.1.100'; // IP Wi-Fi công ty giả định

    // NV A chấm công trước với device_A
    await query(`INSERT INTO audit_logs (actor_id, actor_role, action, resource, ip_address, details, created_at)
        VALUES (?, 'worker', 'CHECK_IN_DYNAMIC_QR', 'attendance', ?, ?, NOW())`,
        [EMP_A, sharedIp, JSON.stringify({ device_fingerprint: 'device_iphone_A_unique' })]);

    // NV B chấm công sau 10 giây cùng IP nhưng KHÁC THIẾT BỊ (device_B)
    const result = await detectAttendanceAnomalies({
        ma_nv: EMP_B,
        device_info: 'device_samsung_B_unique',
        lat: 16.0544,
        lng: 108.2022,
        ip_address: sharedIp
    });

    assert.equal(result.is_suspicious, false, 'Cùng IP văn phòng nhưng khác thiết bị KHÔNG được đánh cờ gian lận');
});

// ─────────────────────────────────────────────────
// TC-G2-ANOMALY-02: Cùng thiết bị nhiều tài khoản (Chấm công hộ)
// ─────────────────────────────────────────────────
it('TC-G2-ANOMALY-02: Hai nhân viên khác nhau dùng CÙNG MỘT THIẾT BỊ trong vòng 3 phút PHẢI BỊ gắn cờ suspicious', async () => {
    const sharedDevice = 'shared_hardware_device_uuid_999';

    // NV A vừa chấm công trên sharedDevice
    await query(`INSERT INTO audit_logs (actor_id, actor_role, action, resource, ip_address, details, created_at)
        VALUES (?, 'worker', 'CHECK_IN_DYNAMIC_QR', 'attendance', '1.1.1.1', ?, NOW())`,
        [EMP_A, JSON.stringify({ device_fingerprint: sharedDevice })]);

    // NV B chấm công tiếp theo trên đúng thiết bị đó
    const result = await detectAttendanceAnomalies({
        ma_nv: EMP_B,
        device_info: sharedDevice,
        lat: 16.0544,
        lng: 108.2022,
        ip_address: '1.1.1.1'
    });

    assert.equal(result.is_suspicious, true, 'Dùng chung thiết bị cho 2 nhân viên khác nhau phải bị gắn cờ');
    assert.ok(result.suspicious_reason.includes('cùng thiết bị') || result.suspicious_reason.includes('nhiều tài khoản'),
        'Lý do cảnh báo phải nêu rõ thiết bị được dùng cho nhiều tài khoản');
});

// ─────────────────────────────────────────────────
// TC-G2-ANOMALY-03: Một tài khoản đổi quá nhiều thiết bị trong ngày (≥ 3)
// ─────────────────────────────────────────────────
it('TC-G2-ANOMALY-03: Một nhân viên đổi ≥ 3 thiết bị khác nhau trong ngày PHẢI BỊ gắn cờ suspicious', async () => {
    // NV A đã dùng device 1 và device 2 trong ngày
    await query(`INSERT INTO audit_logs (actor_id, actor_role, action, resource, ip_address, details, created_at)
        VALUES 
        (?, 'worker', 'CHECK_IN_DYNAMIC_QR', 'attendance', '1.1.1.1', ?, NOW() - INTERVAL 2 HOUR),
        (?, 'worker', 'CHECK_IN_DYNAMIC_QR', 'attendance', '1.1.1.1', ?, NOW() - INTERVAL 1 HOUR)`,
        [
            EMP_A, JSON.stringify({ device_fingerprint: 'device_01' }),
            EMP_A, JSON.stringify({ device_fingerprint: 'device_02' })
        ]);

    // Lần thứ 3 lại dùng device_03
    const result = await detectAttendanceAnomalies({
        ma_nv: EMP_A,
        device_info: 'device_03_strange',
        lat: 16.0544,
        lng: 108.2022,
        ip_address: '1.1.1.1'
    });

    assert.equal(result.is_suspicious, true, 'Đổi 3 thiết bị khác nhau trong ngày phải bị gắn cờ');
    assert.ok(result.suspicious_reason.includes('thiết bị'), 'Lý do phải đề cập đổi nhiều thiết bị');
});

// ─────────────────────────────────────────────────
// TC-G2-ANOMALY-04: Di chuyển bất khả thi (Impossible Travel)
// ─────────────────────────────────────────────────
it('TC-G2-ANOMALY-04: Di chuyển vô lý (> 120 km/h: cách 30km chỉ sau 2 phút) PHẢI BỊ gắn cờ suspicious', async () => {
    // Giả lập lần chấm trước cách đây 2 phút (120s) tại Đà Nẵng (16.0544, 108.2022)
    await query(`INSERT INTO audit_logs (actor_id, actor_role, action, resource, ip_address, details, created_at)
        VALUES (?, 'worker', 'CHECK_IN_DYNAMIC_QR', 'attendance', '1.1.1.1', ?, NOW() - INTERVAL 2 MINUTE)`,
        [EMP_A, JSON.stringify({ device_fingerprint: 'device_normal', lat: 16.0544, lng: 108.2022 })]);

    // Lần chấm này tại Hội An (cách ~30km) chỉ sau 2 phút (vận tốc ~900 km/h)
    const result = await detectAttendanceAnomalies({
        ma_nv: EMP_A,
        device_info: 'device_normal',
        lat: 15.8801, // Hội An
        lng: 108.3380,
        ip_address: '1.1.1.1'
    });

    assert.equal(result.is_suspicious, true, 'Di chuyển bất khả thi phải bị cờ');
    assert.ok(result.suspicious_reason.includes('bất khả thi') || result.suspicious_reason.includes('vận tốc'),
        'Lý do phải ghi nhận di chuyển bất khả thi');
});

// ─────────────────────────────────────────────────
// TC-G2-ANOMALY-05: Di chuyển bình thường không bị cờ
// ─────────────────────────────────────────────────
it('TC-G2-ANOMALY-05: Di chuyển thông thường (cách 200m sau 15 phút) KHÔNG BỊ gắn cờ', async () => {
    // 15 phút trước ở điểm A
    await query(`INSERT INTO audit_logs (actor_id, actor_role, action, resource, ip_address, details, created_at)
        VALUES (?, 'worker', 'CHECK_IN_DYNAMIC_QR', 'attendance', '1.1.1.1', ?, NOW() - INTERVAL 15 MINUTE)`,
        [EMP_A, JSON.stringify({ device_fingerprint: 'device_walking', lat: 16.0544, lng: 108.2022 })]);

    // 15 phút sau đi bộ cách 200m (vận tốc < 1 km/h)
    const result = await detectAttendanceAnomalies({
        ma_nv: EMP_A,
        device_info: 'device_walking',
        lat: 16.0550,
        lng: 108.2030,
        ip_address: '1.1.1.1'
    });

    assert.equal(result.is_suspicious, false, 'Di chuyển bình thường không được cờ');
});

// ─────────────────────────────────────────────────
// TC-G2-ANOMALY-06: Đo đạc tỷ lệ báo nhầm (False Positive Rate)
// ─────────────────────────────────────────────────
it('TC-G2-ANOMALY-06: Mô phỏng 30 nhân viên cùng Wi-Fi công ty -> Tỷ lệ báo nhầm (FPR) = 0%', async () => {
    const companyIp = '192.168.1.1';
    let falsePositiveCount = 0;
    const TOTAL_SIMULATED = 30;

    for (let i = 1; i <= TOTAL_SIMULATED; i++) {
        const empCode = `NV_SIM_${i}`;
        const deviceCode = `device_unique_hw_${i}`;

        // Mô phỏng chấm công vào cùng thời điểm trên cùng IP văn phòng
        const result = await detectAttendanceAnomalies({
            ma_nv: empCode,
            device_info: deviceCode,
            lat: 16.0544,
            lng: 108.2022,
            ip_address: companyIp
        });

        if (result.is_suspicious) {
            falsePositiveCount++;
        }

        // Lưu log của nhân viên này vào audit_logs để các nhân viên tiếp theo kiểm tra
        await query(`INSERT INTO audit_logs (actor_id, actor_role, action, resource, ip_address, details, created_at)
            VALUES (?, 'worker', 'CHECK_IN_DYNAMIC_QR', 'attendance', ?, ?, NOW())`,
            [empCode, companyIp, JSON.stringify({ device_fingerprint: deviceCode, lat: 16.0544, lng: 108.2022 })]);
    }

    // Dọn dẹp log mô phỏng
    await query("DELETE FROM audit_logs WHERE actor_id LIKE 'NV_SIM_%'");

    const fpr = (falsePositiveCount / TOTAL_SIMULATED) * 100;
    console.log(`\n    📊 KẾT QUẢ MÔ PHỎNG TỶ LỆ BÁO NHẦM (FPR): ${fpr}% (${falsePositiveCount}/${TOTAL_SIMULATED} trường hợp)`);
    assert.equal(falsePositiveCount, 0, `Tỷ lệ báo nhầm phải là 0% (hiện tại: ${fpr}%)`);
});
