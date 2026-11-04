/**
 * __tests__/g5_security_hardening.test.js
 * 
 * Bộ kiểm thử an toàn & nghiệp vụ Giai đoạn G5:
 * - B2: Kích hoạt đổi mật khẩu theo đợt (stagedForcePasswordChange, dry-run, nhóm/ca, kiểm toán)
 * - B3: Thống kê bản ghi is_low_trust, chặn khóa sổ nếu chưa xác nhận (confirm_low_trust), phân định token vs raw
 * - B4: Mã QR Kiosk gắn kiosk_id (v2), kiểm tra trạng thái Kiosk khi chấm công, vô hiệu hóa/giới hạn endpoint QR cũ
 * 
 * Phương pháp: ĐỎ -> XANH
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
if (!DB_NAME.includes('test')) {
    throw new Error(`[CHỐT CHẶN BẢO MẬT] DB_NAME="${DB_NAME}" không chứa "test"! Hủy bỏ test.`);
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'sedinco_test_jwt_secret_super_secure_32chars_min';

const { query } = require('../src/config/db');
const employeeService = require('../src/services/employeeService');
const attendanceService = require('../src/services/attendanceService');
const kioskService = require('../src/services/kioskService');
const { generateDynamicQrToken, verifyDynamicQrToken } = require('../src/utils/dynamicQrHelper');
const { hashPassword } = require('../src/utils/passwordHelper');
const app = require('../src/app');

describe('G5: Security Hardening & Staged Rollout (B2, B3, B4)', () => {

    // ═════════════════════════════════════════════════════════════════
    // B2: KÍCH HOẠT ĐỔI MẬT KHẨU THEO ĐỢT (STAGED ROLLOUT)
    // ═════════════════════════════════════════════════════════════════

    it('TC-G5-B2-DRYRUN-01: Chế độ dry-run liệt kê danh sách mà KHÔNG thay đổi must_change_password trong DB', async () => {
        const hash = hashPassword('TestStaged123');
        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, chuc_danh, status, is_locked, must_change_password)
            VALUES ('EMP_G5_DRY_01', 'NV DryRun 1', ?, 'worker', 'Tổ may 1', 'active', 0, 0)
            ON DUPLICATE KEY UPDATE password=VALUES(password), chuc_danh='Tổ may 1', must_change_password=0, status='active', is_locked=0`, [hash]);

        const result = await employeeService.stagedForcePasswordChange({
            chuc_danh: 'Tổ may 1',
            dry_run: true
        });

        assert.equal(result.dry_run, true);
        assert.ok(result.target_count >= 1);

        // Kiểm tra trực tiếp DB: must_change_password PHẢI VẪN LÀ 0
        const [emp] = await query('SELECT must_change_password FROM employees WHERE ma_nv = ?', ['EMP_G5_DRY_01']);
        await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_G5_DRY_01']).catch(() => {});

        assert.equal(emp.must_change_password, 0, 'Chế độ dry-run không được phép sửa đổi DB');
    });

    it('TC-G5-B2-TARGET-GROUP-01: Chỉ nhóm nhân viên được chọn bị đặt must_change_password=1, nhóm khác giữ nguyên', async () => {
        const hash = hashPassword('TestStaged123');
        // Tạo 2 nhân viên: 1 thuộc Tổ cắt, 1 thuộc Tổ may
        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, chuc_danh, status, is_locked, must_change_password)
            VALUES 
                ('EMP_G5_CUT_01', 'NV Cắt Vải', ?, 'worker', 'Tổ cắt', 'active', 0, 0),
                ('EMP_G5_SEW_01', 'NV May Mặc', ?, 'worker', 'Tổ may', 'active', 0, 0)
            ON DUPLICATE KEY UPDATE password=VALUES(password), status='active', is_locked=0, must_change_password=0`, [hash, hash]);

        // Kích hoạt CHỈ cho Tổ cắt
        const updateRes = await employeeService.stagedForcePasswordChange({
            chuc_danh: 'Tổ cắt',
            dry_run: false,
            current_user: { username: 'admin', role: 'admin' }
        });

        assert.equal(updateRes.dry_run, false);
        assert.ok(updateRes.updated_count >= 1);

        const [cutEmp] = await query('SELECT must_change_password FROM employees WHERE ma_nv = ?', ['EMP_G5_CUT_01']);
        const [sewEmp] = await query('SELECT must_change_password FROM employees WHERE ma_nv = ?', ['EMP_G5_SEW_01']);

        await query('DELETE FROM employees WHERE ma_nv IN (?, ?)', ['EMP_G5_CUT_01', 'EMP_G5_SEW_01']).catch(() => {});

        assert.equal(cutEmp.must_change_password, 1, 'Nhân viên Tổ cắt PHẢI bị đặt must_change_password = 1');
        assert.equal(sewEmp.must_change_password, 0, 'Nhân viên Tổ may KHÔNG ĐƯỢC bị ảnh hưởng (giữ nguyên = 0)');
    });

    // ═════════════════════════════════════════════════════════════════
    // B3: BẢN GHI IS_LOW_TRUST & XÁC NHẬN TRƯỚC KHI KHÓA KỲ CÔNG
    // ═════════════════════════════════════════════════════════════════

    it('TC-G5-B3-LOWTRUST-STATUS-01: getPeriodLockStatus thống kê chính xác số lượng bản ghi is_low_trust = 1', async () => {
        const hash = hashPassword('Worker123');
        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES ('EMP_G5_TRUST_01', 'NV Trust Test', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password=VALUES(password), status='active', is_locked=0`, [hash]);

        const TEST_MONTH = 11;
        const TEST_YEAR = 2026;
        const TEST_DATE = `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, '0')}-15`;

        // Chèn 2 bản ghi: 1 is_low_trust=1, 1 is_low_trust=0
        await query(`INSERT INTO attendance_logs (employee_id, record_date, status, is_low_trust, location_source)
            VALUES 
                ('EMP_G5_TRUST_01', ?, '1', 1, 'raw'),
                ('EMP_G5_TRUST_01', ?, '1', 0, 'token')
            ON DUPLICATE KEY UPDATE is_low_trust=VALUES(is_low_trust), location_source=VALUES(location_source)`,
            [TEST_DATE, `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, '0')}-16`]);

        const status = await attendanceService.getPeriodLockStatus(TEST_MONTH, TEST_YEAR);

        await query('DELETE FROM attendance_logs WHERE employee_id = ?', ['EMP_G5_TRUST_01']).catch(() => {});
        await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_G5_TRUST_01']).catch(() => {});

        assert.ok(status.low_trust_count >= 1, 'Hệ thống phải đếm được bản ghi is_low_trust=1');
    });

    it('TC-G5-B3-LOCK-REQUIRE-CONFIRM-01: Chốt kỳ công có bản ghi is_low_trust mà thiếu confirm_low_trust bị từ chối 400', async () => {
        const hash = hashPassword('Worker123');
        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES ('EMP_G5_LOCK_01', 'NV Lock Low Trust', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password=VALUES(password), status='active', is_locked=0`, [hash]);

        const TEST_MONTH = 12;
        const TEST_YEAR = 2026;
        const TEST_DATE = `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, '0')}-20`;

        await query(`INSERT INTO attendance_logs (employee_id, record_date, status, is_low_trust, location_source)
            VALUES ('EMP_G5_LOCK_01', ?, '1', 1, 'raw')
            ON DUPLICATE KEY UPDATE is_low_trust=1, location_source='raw'`, [TEST_DATE]);

        // Thử chốt kỳ công mà KHÔNG truyền confirm_low_trust
        await assert.rejects(async () => {
            await attendanceService.lockPeriod({
                month: TEST_MONTH,
                year: TEST_YEAR,
                reason: 'Chốt công tháng 12',
                confirm_low_trust: false,
                current_user: { username: 'accountant1', role: 'accountant' }
            });
        }, (err) => {
            return err.statusCode === 400 && err.requires_confirmation === true;
        });

        // Chốt kỳ công CÓ confirm_low_trust=true -> Thành công
        const lockSuccess = await attendanceService.lockPeriod({
            month: TEST_MONTH,
            year: TEST_YEAR,
            reason: 'Chốt công tháng 12 đã xác nhận',
            confirm_low_trust: true,
            current_user: { username: 'accountant1', role: 'accountant' }
        });
        assert.equal(lockSuccess.success, true);

        // Dọn dẹp
        await query('DELETE FROM period_locks WHERE month = ? AND year = ?', [TEST_MONTH, TEST_YEAR]).catch(() => {});
        await query('DELETE FROM attendance_logs WHERE employee_id = ?', ['EMP_G5_LOCK_01']).catch(() => {});
        await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_G5_LOCK_01']).catch(() => {});
    });

    // ═════════════════════════════════════════════════════════════════
    // B4: QR V2 GẮN KIOSK_ID & VÔ HIỆU HÓA ENDPOINT CŨ
    // ═════════════════════════════════════════════════════════════════

    it('TC-G5-B4-KIOSK-TOKEN-V2-01: generateDynamicQrToken sinh token v2 có gắn kiosk_id và verify được', () => {
        const qrV2 = generateDynamicQrToken(1, 30, 999);
        assert.equal(qrV2.version, 'v2');
        assert.equal(qrV2.kioskId, 999);
        assert.ok(qrV2.token.startsWith('sedinco:qr:v2:1:999:'));

        const verified = verifyDynamicQrToken(qrV2.token, 30);
        assert.equal(verified.valid, true);
        assert.equal(verified.version, 'v2');
        assert.equal(verified.kioskId, 999);
        assert.equal(verified.branchId, 1);
    });

    it('TC-G5-B4-KIOSK-CHECKIN-REVOKED-01: Chấm công bằng mã QR từ Kiosk đã bị thu hồi quyền bị từ chối 403', async () => {
        const hash = hashPassword('WorkerPass@123');
        await query(`INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES ('EMP_G5_KIOSK_01', 'NV Kiosk Test', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password=VALUES(password), status='active', is_locked=0`, [hash]);

        // Đăng ký kiosk
        const kiosk = await kioskService.registerKiosk({ kiosk_name: 'Kiosk Cổng Phụ', branch_id: 1, created_by: 'admin' });
        const qrRes = await kioskService.generateKioskQr(kiosk.api_key, '192.168.1.150');

        // Thu hồi quyền Kiosk
        await kioskService.revokeKiosk(kiosk.id, 'admin');

        // Công nhân quét mã QR từ kiosk đã bị thu hồi -> Bị từ chối HTTP 403
        await assert.rejects(async () => {
            await attendanceService.checkInMultiFactor({
                token: qrRes.token,
                lat: 16.0544,
                lng: 108.2022,
                device_info: 'device_kiosk_test_1',
                current_user: { ma_nv: 'EMP_G5_KIOSK_01', role: 'worker' }
            });
        }, (err) => {
            return err.statusCode === 403 && err.message.includes('thu hồi quyền');
        });

        // Dọn dẹp
        await query('DELETE FROM kiosk_devices WHERE id = ?', [kiosk.id]).catch(() => {});
        await query('DELETE FROM dynamic_qr_sessions WHERE session_token = ?', [qrRes.token]).catch(() => {});
        await query('DELETE FROM employees WHERE ma_nv = ?', ['EMP_G5_KIOSK_01']).catch(() => {});
    });

    it('TC-G5-B4-LEGACY-ENDPOINT-PREVIEW-01: Endpoint cũ trả về preview_only khi ALLOW_LEGACY_ADMIN_QR=preview', async () => {
        const prevEnv = process.env.ALLOW_LEGACY_ADMIN_QR;
        try {
            process.env.ALLOW_LEGACY_ADMIN_QR = 'preview';
            const qrRes = await attendanceService.generateDynamicQr(1, { username: 'acc1', role: 'accountant' });
            assert.equal(qrRes.preview_only, true);
            assert.ok(qrRes.warning.includes('xem trước'));

            // Bản ghi không được lưu vào dynamic_qr_sessions
            const sessions = await query('SELECT * FROM dynamic_qr_sessions WHERE session_token = ?', [qrRes.token]);
            assert.equal(sessions.length, 0, 'Chế độ preview không được lưu session vào DB');
        } finally {
            process.env.ALLOW_LEGACY_ADMIN_QR = prevEnv;
        }
    });

    it('TC-G5-B4-LEGACY-ENDPOINT-BLOCKED-01: Endpoint cũ bị chặn hoàn toàn HTTP 403 khi ALLOW_LEGACY_ADMIN_QR=false', async () => {
        const prevEnv = process.env.ALLOW_LEGACY_ADMIN_QR;
        try {
            process.env.ALLOW_LEGACY_ADMIN_QR = 'false';
            await assert.rejects(async () => {
                await attendanceService.generateDynamicQr(1, { username: 'acc1', role: 'accountant' });
            }, (err) => {
                return err.statusCode === 403 && err.message.includes('vô hiệu hóa');
            });
        } finally {
            process.env.ALLOW_LEGACY_ADMIN_QR = prevEnv;
        }
    });

    // ═════════════════════════════════════════════════════════════════
    // G8.3: TRANSACTION ACID (S9_02), BODY SIZE LIMIT & KIOSK CONCURRENCY
    // ═════════════════════════════════════════════════════════════════

    it('TC-G8-TX-FAULT-INJECTION-01: Chèn lỗi giữa tiêu QR và ghi công -> Transaction Rollback, QR còn nguyên (is_used=0), không có công rác', async () => {
        const qrRes = await attendanceService.generateDynamicQr(1);
        const workerUser = { ma_nv: 'NV001', role: 'worker' };

        // Kiểm tra QR ban đầu là is_used = 0
        const [initialSession] = await query('SELECT is_used FROM dynamic_qr_sessions WHERE session_token = ?', [qrRes.token]);
        assert.equal(initialSession.is_used, 0);

        // Đếm số công ban đầu của NV001 hôm nay
        const [{ countBefore }] = await query('SELECT COUNT(*) as countBefore FROM attendance_logs WHERE employee_id = ? AND record_date = CURRENT_DATE()', ['NV001']);

        // Chạy checkInMultiFactor với fault injection hook ném lỗi ngay sau khi UPDATE is_used = 1
        await assert.rejects(async () => {
            await attendanceService.checkInMultiFactor({
                token: qrRes.token,
                lat: 16.0544,
                lng: 108.2022,
                current_user: workerUser,
                faultInjectionHook: async (txQuery) => {
                    throw new Error('SIMULATED_DB_CRASH_DURING_ATTENDANCE_INSERT');
                }
            });
        }, (err) => {
            return err.message === 'SIMULATED_DB_CRASH_DURING_ATTENDANCE_INSERT';
        });

        // Chứng minh: Transaction đã Rollback!
        // 1. dynamic_qr_sessions VẪN LÀ is_used = 0 (QR không bị tiêu hủy oan!)
        const [afterSession] = await query('SELECT is_used FROM dynamic_qr_sessions WHERE session_token = ?', [qrRes.token]);
        assert.equal(afterSession.is_used, 0, 'Transaction phải rollback: QR session không được bị đánh dấu is_used=1');

        // 2. Không có bản ghi rác mới nào trong attendance_logs
        const [{ countAfter }] = await query('SELECT COUNT(*) as countAfter FROM attendance_logs WHERE employee_id = ? AND record_date = CURRENT_DATE()', ['NV001']);
        assert.equal(countAfter, countBefore, 'Không có bản ghi chấm công rác nào được lưu lại');

        // 3. Sau khi sự cố qua đi, chính mã QR này VẪN CÓ THỂ chấm công thành công
        const retryCheck = await attendanceService.checkInMultiFactor({
            token: qrRes.token,
            lat: 16.0544,
            lng: 108.2022,
            current_user: workerUser
        });
        assert.equal(retryCheck.success, true, 'Mã QR vẫn sử dụng được sau khi rollback');

        // Dọn dẹp
        await query('DELETE FROM dynamic_qr_sessions WHERE session_token = ?', [qrRes.token]);
    });

    it('TC-G8-BODY-LIMIT-01: Payload quá 100 KB gửi vào /api/auth/employee-login bị từ chối HTTP 413 trước khi vào Service', async () => {
        let testServer;
        let testBaseUrl;
        await new Promise((resolve) => {
            testServer = app.listen(0, () => {
                testBaseUrl = `http://127.0.0.1:${testServer.address().port}`;
                resolve();
            });
        });

        try {
            // Tạo payload kích thước 150 KB (> 100 KB giới hạn mặc định)
            const hugeData = 'A'.repeat(150 * 1024);
            const res = await fetch(`${testBaseUrl}/api/auth/employee-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ma_nv: 'NV001', password: 'Password123', garbage: hugeData })
            });

            assert.equal(res.status, 413, 'Payload > 100 KB vào login phải bị từ chối với HTTP 413 Payload Too Large');
            const data = await res.json();
            assert.equal(data.success, false);
        } finally {
            await new Promise((res) => testServer.close(res));
        }
    });

    it('TC-G8-BODY-LIMIT-02: Payload ảnh snapshot ~1.5 MB gửi vào route /api/attendance vượt qua body parser an toàn (không bị 413)', async () => {
        let testServer;
        let testBaseUrl;
        await new Promise((resolve) => {
            testServer = app.listen(0, () => {
                testBaseUrl = `http://127.0.0.1:${testServer.address().port}`;
                resolve();
            });
        });

        try {
            // Tạo payload kích thước ~1.5 MB (cho ảnh Base64 hợp lệ của camera công nhân)
            const imagePayload = 'data:image/jpeg;base64,' + 'B'.repeat(1.5 * 1024 * 1024);
            const res = await fetch(`${testBaseUrl}/api/attendance/check-in`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_snapshot: imagePayload })
            });

            // Không bị chặn bởi 413 Payload Too Large, mà vượt qua body-parser tới tầng auth middleware (trả về 401 Unauthorized do thiếu token)
            assert.notEqual(res.status, 413, 'Ảnh snapshot 1.5 MB không được bị 413');
            assert.equal(res.status, 401, 'Request đã lọt qua body-parser tới auth middleware');
        } finally {
            await new Promise((res) => testServer.close(res));
        }
    });

    it('TC-G8-KIOSK-CONCURRENT-RATE-01: 2 Kiosk chạy đồng thời có rate limiter độc lập (60 req/phút/kiosk), polling 24 req/phút không chạm ngưỡng', async () => {
        // Đăng ký 2 Kiosk riêng biệt
        const k1 = await kioskService.registerKiosk({ kiosk_name: 'KIOSK_CONCURRENT_1', branch_id: 1, created_by: 'system' });
        const k2 = await kioskService.registerKiosk({ kiosk_name: 'KIOSK_CONCURRENT_2', branch_id: 1, created_by: 'system' });
        kioskService.resetRateLimit();

        try {
            // Cả 2 Kiosk cùng sinh QR ban đầu
            const qr1 = await kioskService.generateKioskQr(k1.api_key, '192.168.1.101');
            const qr2 = await kioskService.generateKioskQr(k2.api_key, '192.168.1.102');

            // Giả lập 24 nhịp polling trạng thái (tương đương 1 phút chạy liên tục mỗi 2.5s) cho cả 2 Kiosk
            for (let i = 0; i < 24; i++) {
                const s1 = await kioskService.getKioskQrStatus(k1.api_key, qr1.token);
                const s2 = await kioskService.getKioskQrStatus(k2.api_key, qr2.token);
                assert.equal(s1.is_used, false);
                assert.equal(s2.is_used, false);
            }

            // Kiosk 1 sinh thêm 5 lần QR đổi mã mới -> vẫn dưới 60 req/phút
            for (let i = 0; i < 5; i++) {
                const newQr = await kioskService.generateKioskQr(k1.api_key, '192.168.1.101');
                assert.ok(newQr.token);
            }

            // Kiosk 2 sinh thêm 5 lần QR đổi mã mới -> độc lập hoàn toàn, không bị ảnh hưởng bởi Kiosk 1
            for (let i = 0; i < 5; i++) {
                const newQr = await kioskService.generateKioskQr(k2.api_key, '192.168.1.102');
                assert.ok(newQr.token);
            }
        } finally {
            await query('DELETE FROM kiosk_devices WHERE id IN (?, ?)', [k1.id, k2.id]);
            await query('DELETE FROM dynamic_qr_sessions WHERE branch_id = 1 AND session_token LIKE "kiosk:%"');
            kioskService.resetRateLimit();
        }
    });
});
