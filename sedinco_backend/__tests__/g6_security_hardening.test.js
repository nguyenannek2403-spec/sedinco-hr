/**
 * sedinco_backend/__tests__/g6_security_hardening.test.js
 * 
 * BỘ KIỂM THỬ G6 (Chuẩn hóa G6.1): BẢO MẬT NÂNG CAO, CHỐNG DOS & CHỐNG HẠ CẤP
 * Quy trình ĐỎ -> XANH nghiêm ngặt:
 *   1. Chống DoS khóa hộ: 200 lần thử sai từ 100 IP lạ KHÔNG khóa người dùng từ IP quen thuộc (Known IP).
 *   2. Throttle IP lạ khi tài khoản bị tấn công vượt ngưỡng 30 lần, người dùng từ IP lạ nhập đúng MK vẫn vào được.
 *   3. Chính sách mật khẩu: Độ dài tối thiểu 8, cấm mật khẩu phổ biến, cấm trùng mã nhân viên.
 *   4. Chống hạ cấp phương thức:
 *      - (a) REJECT_DOWNGRADE_TO_RAW=true -> Bị từ chối HTTP 403 với mã ERR_METHOD_DOWNGRADE_DETECTED.
 *      - (b) REJECT_DOWNGRADE_TO_RAW=false -> Cho phép nhưng gắn cờ is_low_trust = 2 (risk cao).
 *   5. Mã QR chế độ preview không thể dùng để chấm công (Regression Guard).
 */

const { it, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '123456';
process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'sedinco_super_secure_jwt_secret_key_2026_local_test_32chars';
process.env.QR_SECRET = 'sedinco_super_secure_qr_secret_key_2026_local_test_32chars';

const { initDatabase } = require('../src/database/initDb');
const { query } = require('../src/config/db');
const authService = require('../src/services/authService');
const attendanceService = require('../src/services/attendanceService');
const { hashPassword } = require('../src/utils/passwordHelper');
const { generateDynamicQrToken } = require('../src/utils/dynamicQrHelper');
const { generateToken } = require('../src/middlewares/authMiddleware');

describe('G6: Chống DoS Khóa Hộ, Chính Sách Mật Khẩu & Chống Hạ Cấp', () => {
    before(async () => {
        await initDatabase();
        await query('DELETE FROM login_rate_limits');
        await query('DELETE FROM attendance_logs WHERE employee_id LIKE "EMP_G6_%"');
        await query('DELETE FROM employees WHERE ma_nv LIKE "EMP_G6_%"');
    });

    after(async () => {
        await query('DELETE FROM login_rate_limits');
        await query('DELETE FROM attendance_logs WHERE employee_id LIKE "EMP_G6_%"');
        await query('DELETE FROM employees WHERE ma_nv LIKE "EMP_G6_%"');
    });

    // ─────────────────────────────────────────────────────────────
    // 1. CHỐNG DOS KHÓA HỘ (KNOWN LEGIT IP VẪN ĐĂNG NHẬP ĐƯỢC)
    // ─────────────────────────────────────────────────────────────
    it('TC-G6-DOS-01: 200 lần sai từ 100 IP lạ KHÔNG khóa người dùng từ IP quen thuộc', async () => {
        const ma_nv = 'EMP_G6_DOS01';
        const password = 'SecurePassword@2026';
        const legitIp = '192.168.1.100';
        const hash = hashPassword(password);

        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'NV Test G6 DoS', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`,
            [ma_nv, hash]);

        // Giai đoạn 1: Người dùng thật đăng nhập thành công 1 lần từ legitIp -> Hệ thống nhận diện Known IP
        const initialLogin = await authService.employeeLogin(ma_nv, password, legitIp);
        assert.equal(initialLogin.success, true, 'Đăng nhập ban đầu từ legitIp phải thành công');

        // Giai đoạn 2: Botnet 100 IP lạ gửi dồn dập 200 lần thử sai (mỗi IP 2 lần)
        for (let i = 1; i <= 100; i++) {
            const attackerIp = `10.200.${Math.floor(i / 256)}.${i % 256}`;
            await authService.employeeLogin(ma_nv, 'wrong_pass_1', attackerIp);
            await authService.employeeLogin(ma_nv, 'wrong_pass_2', attackerIp);
        }

        // Giai đoạn 3: Người dùng thật từ legitIp đăng nhập với mật khẩu đúng
        const legitLogin = await authService.employeeLogin(ma_nv, password, legitIp);
        assert.equal(
            legitLogin.success, true,
            `Người dùng thật từ IP quen thuộc PHẢI đăng nhập thành công dù có 200 lần sai từ 100 IP lạ! msg: "${legitLogin.message}"`
        );
    });

    it('TC-G6-DOS-02: Mật khẩu đúng từ IP lạ khi đang bị tấn công (>30 lần sai) vẫn vào được nhưng bị throttle delay', async () => {
        const ma_nv = 'EMP_G6_DOS02';
        const password = 'NewPhonePass@2026';
        const hash = hashPassword(password);

        await query('DELETE FROM login_rate_limits WHERE identifier = ? OR key_name LIKE ?', [ma_nv, `%${ma_nv}%`]);
        await query('DELETE FROM audit_logs WHERE actor_id = ?', [ma_nv]);

        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'NV Test IP La', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`,
            [ma_nv, hash]);

        // Tạo trạng thái tài khoản đang bị tấn công toàn cục vượt ngưỡng 30 lần (35 lần sai từ 35 IP khác nhau)
        for (let i = 1; i <= 35; i++) {
            await authService.employeeLogin(ma_nv, 'attack_guess', `172.16.2.${i}`);
        }

        // Người dùng thật mua máy mới / dùng mạng 4G mới (IP lạ) nhập ĐÚNG mật khẩu
        const start = Date.now();
        const loginNewIp = await authService.employeeLogin(ma_nv, password, '113.161.50.88');
        const duration = Date.now() - start;

        assert.equal(
            loginNewIp.success, true,
            `Mật khẩu đúng từ IP lạ khi đang bị tấn công (>30 lần) vẫn PHẢI đăng nhập được, không bị khóa cứng! msg: "${loginNewIp.message}"`
        );
        // Kiểm tra audit log xác nhận cơ chế throttle đã kích hoạt với delay_ms > 0
        const auditRows = await query(
            "SELECT details FROM audit_logs WHERE actor_id = ? AND action = 'ACCOUNT_UNDER_DISTRIBUTED_ATTACK' ORDER BY id DESC LIMIT 1",
            [ma_nv]
        );
        assert.ok(auditRows.length > 0, 'Phải ghi nhận audit log ACCOUNT_UNDER_DISTRIBUTED_ATTACK khi tài khoản bị tấn công phân tán');
        const details = typeof auditRows[0].details === 'string' ? JSON.parse(auditRows[0].details) : auditRows[0].details;
        assert.ok(details.delay_ms > 0, `Độ trễ điều tiết throttle delay_ms phải > 0, thực tế nhận: ${details.delay_ms}`);
    });

    it('TC-G6-KNOWN-IP-NAT-ATTACK-01: Kẻ tấn công ở CÙNG IP NAT quen thuộc thử 100 mật khẩu sai -> Bị khóa cứng composite ở lần thứ 6', async () => {
        const ma_nv = 'EMP_G6_NAT_VICTIM';
        const correctPassword = 'VictimPassword@2026';
        const sharedNatIp = '118.69.100.5';
        const hash = hashPassword(correctPassword);

        await query('DELETE FROM login_rate_limits WHERE identifier = ? OR key_name LIKE ?', [ma_nv, `%${ma_nv}%`]);
        await query('DELETE FROM audit_logs WHERE actor_id = ?', [ma_nv]);

        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'NV Nan Nhan Cung NAT', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password = VALUES(password), status = 'active', is_locked = 0`,
            [ma_nv, hash]);

        // 1. Nạn nhân đăng nhập thành công từ IP NAT này -> Hệ thống ghi nhận cặp (ma_nv, IP) là Known Legit IP
        const legitLogin = await authService.employeeLogin(ma_nv, correctPassword, sharedNatIp);
        assert.equal(legitLogin.success, true, 'Nạn nhân đăng nhập thành công lần đầu');

        // 2. Kẻ tấn công ngồi cùng quán cafe / văn phòng (CÙNG IP NAT) thử đoán mật khẩu 100 lần
        let firstBlockedIndex = -1;
        let blockedCount = 0;

        for (let i = 1; i <= 100; i++) {
            const attackRes = await authService.employeeLogin(ma_nv, `wrong_guess_${i}`, sharedNatIp);
            if (attackRes.statusCode === 429) {
                if (firstBlockedIndex === -1) {
                    firstBlockedIndex = i;
                }
                blockedCount++;
            }
        }

        // Khóa Composite cho phép tối đa 5 lần sai; từ lần thứ 6 trên cùng IP này PHẢI bị khóa 429!
        assert.equal(firstBlockedIndex, 6, `Kẻ tấn công phải bị chặn cứng HTTP 429 đúng ở lần thứ 6! Nhận: ${firstBlockedIndex}`);
        assert.equal(blockedCount, 95, `Toàn bộ 95 lần còn lại (từ lần 6 đến 100) phải bị từ chối 429! Thực tế: ${blockedCount}`);

        // 3. Kiểm tra bản ghi trong bảng login_rate_limits
        const [compRow] = await query('SELECT attempt_count, locked_until FROM login_rate_limits WHERE key_name = ?', [`composite:${ma_nv}:${sharedNatIp}`]);
        assert.ok(compRow, 'Phải tồn tại bản ghi composite key');
        assert.ok(compRow.locked_until !== null, 'locked_until phải được thiết lập');
    });

    // ─────────────────────────────────────────────────────────────
    // 2. CHÍNH SÁCH MẬT KHẨU (PASSWORD POLICY)
    // ─────────────────────────────────────────────────────────────
    it('TC-G6-PWD-MIN8: Từ chối mật khẩu mới có độ dài < 8 ký tự', async () => {
        const ma_nv = 'EMP_G6_PWD01';
        const hash = hashPassword('OldValidPass@123');
        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'NV Test Policy', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password = VALUES(password)`, [ma_nv, hash]);

        const res = await authService.changePassword(ma_nv, 'OldValidPass@123', 'Abc@12', { ma_nv, role: 'worker' });
        assert.equal(res.success, false);
        assert.ok(res.message.includes('8 ký tự'), `Thông báo phải nêu rõ độ dài tối thiểu 8 ký tự: "${res.message}"`);
    });

    it('TC-G6-PWD-COMMON: Từ chối mật khẩu nằm trong danh sách đen phổ biến (123456, 12345678, password...)', async () => {
        const ma_nv = 'EMP_G6_PWD02';
        const hash = hashPassword('OldValidPass@123');
        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'NV Test Policy', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password = VALUES(password)`, [ma_nv, hash]);

        const blacklist = ['12345678', 'password', '11111111', 'admin123', 'sedinco123'];
        for (const badPwd of blacklist) {
            const res = await authService.changePassword(ma_nv, 'OldValidPass@123', badPwd, { ma_nv, role: 'worker' });
            assert.equal(res.success, false, `Phải từ chối mật khẩu phổ biến: ${badPwd}`);
            assert.ok(res.message.includes('phổ biến') || res.message.includes('dễ đoán'), `Thông báo phải rõ ràng: "${res.message}"`);
        }
    });

    it('TC-G6-PWD-MATCH-MANV: Từ chối mật khẩu trùng hoặc chứa mã nhân viên', async () => {
        const ma_nv = 'NV0999';
        const hash = hashPassword('OldValidPass@123');
        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'NV Test Policy', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password = VALUES(password)`, [ma_nv, hash]);

        const res = await authService.changePassword(ma_nv, 'OldValidPass@123', 'NV0999@2026', { ma_nv, role: 'worker' });
        assert.equal(res.success, false);
        assert.ok(res.message.includes('mã nhân viên'), `Thông báo phải nêu rõ không chứa mã nhân viên: "${res.message}"`);
    });

    // ─────────────────────────────────────────────────────────────
    // 3. CHỐNG HẠ CẤP PHƯƠNG THỨC (ANTI-DOWNGRADE)
    // ─────────────────────────────────────────────────────────────
    it('TC-G6-DOWNGRADE-01A: Khi REJECT_DOWNGRADE_TO_RAW=true, nhân viên đã có token Zalo gửi tọa độ raw BỊ TỪ CHỐI HTTP 403 (ERR_METHOD_DOWNGRADE_DETECTED)', async () => {
        const ma_nv = 'EMP_G6_DOWN01A';
        await query(`INSERT INTO employees (ma_nv, ho_ten, role, status, is_locked)
            VALUES (?, 'NV Test Downgrade A', 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE status = 'active', is_locked = 0`, [ma_nv]);

        // Seed 1 bản ghi token hợp lệ trong quá khứ
        const pastDate = '2026-10-01';
        await query(`INSERT INTO attendance_logs (employee_id, record_date, check_in_time, location_source, is_low_trust, status)
            VALUES (?, ?, '08:00:00', 'token', 0, 'X')
            ON DUPLICATE KEY UPDATE location_source = 'token', is_low_trust = 0`, [ma_nv, pastDate]);

        // Xác nhận seed CSDL thật sự có hàng (không chấp nhận lỗi SQL im lặng)
        const seedCheck = await query('SELECT COUNT(*) as cnt FROM attendance_logs WHERE employee_id = ? AND location_source = "token"', [ma_nv]);
        assert.equal(Number(seedCheck[0].cnt), 1, 'Seed bản ghi token quá khứ phải tồn tại chính xác 1 hàng trong DB');

        // Sinh QR hợp lệ
        const qr = generateDynamicQrToken(1, 60);
        await query('INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at, is_used) VALUES (?, 1, ?, 0)', [qr.token, qr.expiresAt]);

        process.env.REJECT_DOWNGRADE_TO_RAW = 'true';
        try {
            await attendanceService.checkInMultiFactor({
                token: qr.token,
                lat: 16.0544,
                lng: 108.2022,
                current_user: { ma_nv, role: 'worker' }
            });
            assert.fail('Phải từ chối check-in khi REJECT_DOWNGRADE_TO_RAW=true và tài khoản đã có lịch sử token');
        } catch (err) {
            assert.equal(err.statusCode, 403, 'Mã trạng thái phải là 403');
            assert.equal(err.code, 'ERR_METHOD_DOWNGRADE_DETECTED', 'Mã lỗi phải là ERR_METHOD_DOWNGRADE_DETECTED');
            assert.ok(err.message.includes('Phát hiện hạ cấp phương thức'), `Thông báo phải chỉ rõ hạ cấp: "${err.message}"`);
        } finally {
            process.env.REJECT_DOWNGRADE_TO_RAW = 'false';
        }
    });

    it('TC-G6-DOWNGRADE-01B: Khi REJECT_DOWNGRADE_TO_RAW=false, nhân viên đã có token Zalo gửi tọa độ raw ĐƯỢC CHẤM CÔNG NHƯNG gắn cờ is_low_trust = 2 (risk cao)', async () => {
        const ma_nv = 'EMP_G6_DOWN01B';
        await query(`INSERT INTO employees (ma_nv, ho_ten, role, status, is_locked)
            VALUES (?, 'NV Test Downgrade B', 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE status = 'active', is_locked = 0`, [ma_nv]);

        // Seed 1 bản ghi token hợp lệ trong quá khứ
        const pastDate = '2026-10-01';
        await query(`INSERT INTO attendance_logs (employee_id, record_date, check_in_time, location_source, is_low_trust, status)
            VALUES (?, ?, '08:00:00', 'token', 0, 'X')
            ON DUPLICATE KEY UPDATE location_source = 'token', is_low_trust = 0`, [ma_nv, pastDate]);

        // Xác nhận seed CSDL thật sự có hàng
        const seedCheck = await query('SELECT COUNT(*) as cnt FROM attendance_logs WHERE employee_id = ? AND location_source = "token"', [ma_nv]);
        assert.equal(Number(seedCheck[0].cnt), 1, 'Seed bản ghi token quá khứ phải tồn tại chính xác 1 hàng trong DB');

        // Sinh QR hợp lệ
        const qr = generateDynamicQrToken(1, 60);
        await query('INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at, is_used) VALUES (?, 1, ?, 0)', [qr.token, qr.expiresAt]);

        process.env.REJECT_DOWNGRADE_TO_RAW = 'false';
        const res = await attendanceService.checkInMultiFactor({
            token: qr.token,
            lat: 16.0544,
            lng: 108.2022,
            current_user: { ma_nv, role: 'worker' }
        });

        assert.equal(res.success, true, 'Check-in phải thành công');
        // Kiểm tra trong CSDL bản ghi hôm nay phải có is_low_trust = 2
        const todayRows = await query('SELECT is_low_trust, location_source FROM attendance_logs WHERE employee_id = ? ORDER BY record_date DESC LIMIT 1', [ma_nv]);
        assert.equal(Number(todayRows[0].is_low_trust), 2, 'Bản ghi phải bị gắn cờ is_low_trust = 2 (Cảnh báo hạ cấp cao)');
        assert.equal(todayRows[0].location_source, 'raw', 'Nguồn vị trí phải là raw');
    });

    // ─────────────────────────────────────────────────────────────
    // 4. MÃ QR PREVIEW CŨ KHÔNG THỂ DÙNG ĐỂ CHẤM CÔNG (REGRESSION GUARD)
    // ─────────────────────────────────────────────────────────────
    it('TC-G6-QR-PREVIEW-01: Mã QR từ chế độ preview (ALLOW_LEGACY_ADMIN_QR=preview) không thể dùng để chấm công', async () => {
        process.env.ALLOW_LEGACY_ADMIN_QR = 'preview';

        // Admin gọi sinh QR chế độ preview
        const previewQrRes = await attendanceService.generateDynamicQr(1, { username: 'admin', role: 'admin' });
        assert.equal(previewQrRes.is_preview, true, 'Mã phải được gắn nhãn is_preview = true');

        // Worker cố tình dùng mã preview này để chấm công
        const ma_nv = 'EMP_G6_PREVIEW01';
        await query(`INSERT INTO employees (ma_nv, ho_ten, role, status, is_locked)
            VALUES (?, 'NV Test Preview QR', 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE status = 'active', is_locked = 0`, [ma_nv]);

        try {
            await attendanceService.checkInMultiFactor({
                token: previewQrRes.qr_token,
                lat: 16.0544,
                lng: 108.2022,
                current_user: { ma_nv, role: 'worker' }
            });
            assert.fail('Mã QR preview tuyệt đối không được phép chấm công thành công!');
        } catch (err) {
            assert.ok(
                err.message.includes('không hợp lệ') || err.message.includes('không tồn tại'),
                `Phải báo lỗi mã không tồn tại trong hệ thống: "${err.message}"`
            );
        } finally {
            process.env.ALLOW_LEGACY_ADMIN_QR = 'false';
        }
    });

    // ─────────────────────────────────────────────────────────────
    // 5. IS_LOW_TRUST MỨC 2 ĐƯỢC ĐẾM VÀ LIỆT KÊ TRONG CHỐT SỔ KỲ CÔNG
    // ─────────────────────────────────────────────────────────────
    it('TC-G6-LOWTRUST-LEVEL2-COUNT-01: Bản ghi is_low_trust = 2 (hạ cấp) được đếm ở màn chốt công và hiển thị trong danh sách', async () => {
        const testMonth = 11;
        const testYear = 2026;
        const testEmp = 'EMP_G6_LEVEL2_LOCK';
        const testDate = '2026-11-15';

        await query('DELETE FROM period_locks WHERE month = ? AND year = ?', [testMonth, testYear]);
        await query('DELETE FROM attendance_logs WHERE employee_id = ?', [testEmp]);

        await query(`INSERT INTO employees (ma_nv, ho_ten, role, status, is_locked)
            VALUES (?, 'NV Hạ Cấp Mức 2', 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE status = 'active', is_locked = 0`, [testEmp]);

        // Chèn bản ghi hạ cấp mức 2 (is_low_trust = 2)
        await query(`INSERT INTO attendance_logs (employee_id, record_date, check_in_time, location_source, is_low_trust, status)
            VALUES (?, ?, '08:00:00', 'raw', 2, 'present')
            ON DUPLICATE KEY UPDATE is_low_trust = 2, location_source = 'raw'`, [testEmp, testDate]);

        // 1. Kiểm tra getPeriodLockStatus
        const status = await attendanceService.getPeriodLockStatus(testMonth, testYear);
        assert.ok(status.low_trust_count >= 1, `Phải đếm được ít nhất 1 bản ghi độ tin cậy thấp, nhận: ${status.low_trust_count}`);

        // 2. Kiểm tra trong low_trust_logs
        const found = status.low_trust_logs.find(log => log.employee_id === testEmp);
        assert.ok(found, 'Phải tìm thấy nhân viên trong danh sách low_trust_logs');
        assert.equal(Number(found.is_low_trust), 2, 'Bản ghi phải có is_low_trust = 2');
        assert.ok(found.reason.includes('Hạ cấp phương thức'), `Lý do cảnh báo phải nêu hạ cấp phương thức: "${found.reason}"`);

        // 3. Chốt kỳ công mà confirm_low_trust=false -> Bị từ chối HTTP 400
        await assert.rejects(
            async () => {
                await attendanceService.lockPeriod({
                    month: testMonth,
                    year: testYear,
                    reason: 'Kế toán thử chốt không xác nhận',
                    confirm_low_trust: false
                });
            },
            (err) => {
                assert.equal(err.statusCode, 400);
                assert.ok(err.message.includes('độ tin cậy thấp'));
                return true;
            },
            'Phải chặn chốt sổ khi chưa xác nhận bản ghi low-trust'
        );

        // 4. Chốt kỳ công với confirm_low_trust=true -> Thành công
        const lockRes = await attendanceService.lockPeriod({
            month: testMonth,
            year: testYear,
            reason: 'Kế toán đã kiểm tra và xác nhận',
            confirm_low_trust: true,
            current_user: { username: 'ketoan_test', role: 'accountant' }
        });
        assert.equal(lockRes.success, true, 'Chốt sổ phải thành công khi đã xác nhận');

        // Cleanup
        await query('DELETE FROM period_locks WHERE month = ? AND year = ?', [testMonth, testYear]);
        await query('DELETE FROM attendance_logs WHERE employee_id = ?', [testEmp]);
    });
});

