const { query, withTransaction } = require('../config/db');
const { logAuditEvent, getAccountantPermissions } = require('../middlewares/authMiddleware');
const { calculateDistanceMeters } = require('../utils/geoHelper');
const { generateDynamicQrToken, verifyDynamicQrToken } = require('../utils/dynamicQrHelper');

class AttendanceService {
    async getAttendanceMatrix(month, year) {
        const emps = await query('SELECT ma_nv, ho_ten FROM employees ORDER BY ma_nv ASC');
        if (!emps || emps.length === 0) return [];

        const logs = await query(
            'SELECT employee_id, DAY(record_date) as day, status, ot_hours FROM attendance_logs WHERE MONTH(record_date)=? AND YEAR(record_date)=?',
            [month, year]
        );
        const safeLogs = logs || [];
        const daysInMonth = new Date(year, month, 0).getDate();

        return emps.map(emp => {
            const days = Array(daysInMonth).fill('');
            safeLogs
                .filter(l => l.employee_id === emp.ma_nv)
                .forEach(log => {
                    if (log.day > 0 && log.day <= daysInMonth) {
                        days[log.day - 1] = log.status;
                    }
                });
            return {
                ma_nv: emp.ma_nv,
                ho_ten: emp.ho_ten,
                days: days
            };
        });
    }

    async getMyAttendance(ma_nv, month, year) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();

        const logs = await query(
            'SELECT record_date, status, ot_hours, check_in_time, check_out_time, late_minutes, early_leave_minutes, work_hours, is_suspicious, suspicious_reason FROM attendance_logs WHERE employee_id = ? AND MONTH(record_date) = ? AND YEAR(record_date) = ? ORDER BY record_date ASC',
            [ma_nv, m, y]
        );
        return logs || [];
    }

    async isPeriodLocked(month, year) {
        if (!month || !year) return false;
        const res = await query('SELECT is_locked FROM period_locks WHERE month = ? AND year = ? LIMIT 1', [month, year]);
        if (res && res.length > 0) {
            return Boolean(res[0].is_locked);
        }
        return false;
    }

    async getPeriodLockStatus(month, year) {
        if (!month || !year) return { is_locked: false, low_trust_count: 0, low_trust_logs: [] };
        const res = await query(
            'SELECT month, year, is_locked, locked_by, locked_at, reason FROM period_locks WHERE month = ? AND year = ? LIMIT 1',
            [month, year]
        );

        const lowTrustRows = await query(
            `SELECT employee_id, record_date, location_source, is_low_trust, suspicious_reason
             FROM attendance_logs 
             WHERE MONTH(record_date) = ? AND YEAR(record_date) = ? AND is_low_trust > 0`,
            [month, year]
        );

        const low_trust_logs = (lowTrustRows || []).map(r => ({
            employee_id: r.employee_id,
            record_date: r.record_date,
            location_source: r.location_source,
            is_low_trust: Number(r.is_low_trust),
            reason: Number(r.is_low_trust) === 2 
                ? 'Hạ cấp phương thức (từng có token Zalo nhưng gửi tọa độ raw)' 
                : (r.suspicious_reason || 'Tọa độ GPS thô không có chữ ký xác thực vị trí')
        }));

        const base = {
            month: Number(month),
            year: Number(year),
            is_locked: false,
            low_trust_count: low_trust_logs.length,
            low_trust_logs
        };

        if (res && res.length > 0) {
            return {
                ...base,
                month: Number(res[0].month),
                year: Number(res[0].year),
                is_locked: Boolean(res[0].is_locked),
                locked_by: res[0].locked_by,
                locked_at: res[0].locked_at,
                reason: res[0].reason
            };
        }
        return base;
    }

    async lockPeriod({ month, year, reason, locked_by = 'admin', current_user = null, confirm_low_trust = false }) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (isNaN(m) || isNaN(y)) {
            const error = new Error('Tháng và năm không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        const lowTrustRows = await query(
            'SELECT COUNT(*) as count FROM attendance_logs WHERE MONTH(record_date) = ? AND YEAR(record_date) = ? AND is_low_trust > 0',
            [m, y]
        );
        const low_trust_count = lowTrustRows && lowTrustRows[0] ? Number(lowTrustRows[0].count) : 0;

        if (low_trust_count > 0 && confirm_low_trust !== true) {
            const error = new Error(`Kỳ công Tháng ${m}/${y} có ${low_trust_count} bản ghi có độ tin cậy thấp (is_low_trust)! Vui lòng đối soát và xác nhận trước khi chốt.`);
            error.statusCode = 400;
            error.requires_confirmation = true;
            error.low_trust_count = low_trust_count;
            throw error;
        }

        const sql = `
            INSERT INTO period_locks (month, year, is_locked, locked_by, reason)
            VALUES (?, ?, 1, ?, ?)
            ON DUPLICATE KEY UPDATE 
                is_locked = 1, 
                locked_by = VALUES(locked_by), 
                reason = VALUES(reason), 
                locked_at = CURRENT_TIMESTAMP
        `;
        await query(sql, [m, y, locked_by, reason || 'Khóa kỳ công']);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || locked_by,
                actor_role: current_user.role || 'admin',
                action: 'LOCK_ATTENDANCE_PERIOD',
                resource: 'attendance',
                details: { month: m, year: y, reason, confirm_low_trust }
            });
        }

        return { success: true, message: `Đã chốt sổ kỳ công Tháng ${m}/${y} thành công!` };
    }

    async unlockPeriod({ month, year, reason, unlocked_by = 'admin', current_user = null }) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (isNaN(m) || isNaN(y)) {
            const error = new Error('Tháng và năm không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        if (!reason || !reason.trim()) {
            const error = new Error('Bắt buộc phải cung cấp lý do mở lại kỳ công đã chốt!');
            error.statusCode = 400;
            throw error;
        }

        const sql = `
            INSERT INTO period_locks (month, year, is_locked, locked_by, reason)
            VALUES (?, ?, 0, ?, ?)
            ON DUPLICATE KEY UPDATE 
                is_locked = 0, 
                locked_by = VALUES(locked_by), 
                reason = VALUES(reason), 
                locked_at = CURRENT_TIMESTAMP
        `;
        await query(sql, [m, y, unlocked_by, reason]);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || unlocked_by,
                actor_role: current_user.role || 'admin',
                action: 'UNLOCK_ATTENDANCE_PERIOD',
                resource: 'attendance',
                details: { month: m, year: y, reason }
            });
        }

        return { success: true, message: `Đã mở lại kỳ công Tháng ${m}/${y} thành công!` };
    }

    async updateAttendanceDaily({ ma_nv, dateStr, status, hours, isDelete, check_in_time, check_out_time, current_user = null }) {
        // 1. Phân tách nhiệm vụ (SoD P0): Không vai trò nào (worker, accountant, admin) được tự sửa công của chính mình!
        if (current_user) {
            const userRole = current_user.role;
            const isSelf = current_user.ma_nv === ma_nv;

            if (userRole === 'worker' && isDelete) {
                const error = new Error('Bảo mật: Công nhân không thể tự ý xóa bản ghi chấm công của chính mình hoặc người khác!');
                error.statusCode = 403;
                throw error;
            }

            if (isSelf) {
                const error = new Error('Phân tách nhiệm vụ (SoD): Không thể tự chỉnh sửa công của chính mình!');
                error.statusCode = 403;
                throw error;
            }

            if (userRole === 'worker') {
                const error = new Error('Bảo mật: Công nhân không thể chỉnh sửa chấm công của người khác!');
                error.statusCode = 403;
                throw error;
            }

            if (userRole === 'accountant') {
                const permissions = await getAccountantPermissions();
                if (!permissions['attendance_edit']) {
                    const error = new Error('Bảo mật: Kế toán chưa được cấp quyền chỉnh sửa chấm công nhân viên (attendance_edit)!');
                    error.statusCode = 403;
                    throw error;
                }
            }
        }

        // 2. Kiểm tra xem kỳ công của tháng này có bị đóng băng / khóa sổ không
        if (dateStr) {
            const parts = dateStr.split('-');
            if (parts.length >= 2) {
                const y = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10);
                const isLocked = await this.isPeriodLocked(m, y);
                if (isLocked) {
                    const error = new Error(`Kỳ công Tháng ${m}/${y} đã bị KHÓA SỔ để tính lương. Không thể thêm/sửa/xóa dữ liệu chấm công!`);
                    error.statusCode = 400;
                    throw error;
                }
            }
        }

        // 3. Kiểm tra xem nhân viên có đang bị TẠM KHÓA tài khoản không
        if (ma_nv) {
            const empCheck = await query('SELECT is_locked, status FROM employees WHERE ma_nv = ?', [ma_nv]);
            if (empCheck && empCheck.length > 0) {
                const emp = empCheck[0];
                if (emp.status === 'inactive' || emp.is_locked === 1 || emp.is_locked === true) {
                    const error = new Error(`Tài khoản nhân viên ${ma_nv} đang bị TẠM KHÓA. Không thể thực hiện chấm công!`);
                    error.statusCode = 403;
                    throw error;
                }
            }
        }

        if (isDelete) {
            await query('DELETE FROM attendance_logs WHERE employee_id=? AND record_date=?', [ma_nv, dateStr]);
            return { success: true };
        }

        const sql = `
            INSERT INTO attendance_logs (employee_id, record_date, status, ot_hours, check_in_time, check_out_time) 
            VALUES (?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
                status = VALUES(status), 
                ot_hours = VALUES(ot_hours),
                check_in_time = COALESCE(VALUES(check_in_time), check_in_time),
                check_out_time = COALESCE(VALUES(check_out_time), check_out_time)
        `;
        await query(sql, [ma_nv, dateStr, status, hours, check_in_time || null, check_out_time || null]);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'unknown',
                actor_role: current_user.role || 'unknown',
                action: 'UPDATE_ATTENDANCE',
                resource: 'attendance',
                details: { target_ma_nv: ma_nv, dateStr, status, hours }
            });
        }

        return { success: true };
    }

    validateImageSnapshot(image_snapshot) {
        if (!image_snapshot || typeof image_snapshot !== 'string') {
            const error = new Error('Ảnh chụp chấm công không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        const match = image_snapshot.match(/^data:([^;]+);base64,(.+)$/);
        let mimeType = '';
        let base64Content = image_snapshot;

        if (match) {
            mimeType = match[1];
            base64Content = match[2];
            if (!mimeType.startsWith('image/')) {
                const error = new Error('Định dạng tệp không phải là ảnh hợp lệ!');
                error.statusCode = 400;
                throw error;
            }
        }

        let buffer;
        try {
            buffer = Buffer.from(base64Content, 'base64');
        } catch {
            const error = new Error('Chuỗi dữ liệu ảnh Base64 không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        // Giới hạn dung lượng tối đa 150KB để bảo vệ CSDL Aiven MySQL không bị phình to
        if (buffer.length > 150 * 1024) {
            const error = new Error('Ảnh vượt quá dung lượng tối đa cho phép (150KB)! Vui lòng nén ảnh trước khi tải lên.');
            error.statusCode = 400;
            throw error;
        }

        // Magic bytes check:
        // WebP: RIFF (bytes 0-3: 0x52, 0x49, 0x46, 0x46) & WEBP (bytes 8-11: 0x57, 0x45, 0x42, 0x50)
        const isWebP = buffer.length >= 12 &&
            buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
            buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

        // JPEG: 0xFF, 0xD8, 0xFF
        const isJPEG = buffer.length >= 3 &&
            buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

        // PNG: 0x89, 0x50, 0x4E, 0x47
        const isPNG = buffer.length >= 4 &&
            buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;

        if (!isWebP && !isJPEG && !isPNG) {
            const error = new Error('Ảnh chụp chấm công không hợp lệ: Thiếu chữ ký định dạng magic bytes hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        return true;
    }

    async generateDynamicQr(branchId = 1, current_user = null) {
        if (process.env.ALLOW_LEGACY_ADMIN_QR === 'false') {
            const error = new Error('Endpoint tạo QR cũ đã bị vô hiệu hóa! Vui lòng dùng Kiosk.');
            error.statusCode = 403;
            throw error;
        }

        const qrData = generateDynamicQrToken(branchId, 30);

        if (process.env.ALLOW_LEGACY_ADMIN_QR === 'preview') {
            return {
                is_preview: true,
                preview_only: true,
                warning: 'Chế độ xem trước: Mã QR này chỉ để kiểm tra hiển thị, không thể dùng chấm công.',
                token: qrData.token,
                qr_token: qrData.token,
                branchId: qrData.branchId,
                expiresAt: qrData.expiresAt.toISOString(),
                ttlSeconds: qrData.ttlSeconds
            };
        }

        const sql = `
            INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at)
            VALUES (?, ?, ?)
        `;
        await query(sql, [qrData.token, qrData.branchId, qrData.expiresAt]);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.username || current_user.ma_nv || 'system',
                actor_role: current_user.role || 'admin',
                action: 'GENERATE_DYNAMIC_QR',
                resource: 'attendance',
                details: { branchId: qrData.branchId, expiresAt: qrData.expiresAt }
            });
        }

        return {
            token: qrData.token,
            branchId: qrData.branchId,
            expiresAt: qrData.expiresAt.toISOString(),
            ttlSeconds: qrData.ttlSeconds
        };
    }

    parseTimeToMinutes(timeStr, defaultMins = 480) {
        if (!timeStr || typeof timeStr !== 'string') return defaultMins;
        const parts = timeStr.trim().split(':').map(Number);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return parts[0] * 60 + parts[1];
        }
        return defaultMins;
    }

    async checkInMultiFactor({ token, lat, lng, zalo_location_token, image_snapshot, device_info, is_fake_gps = false, is_fake_device = false, gps_accuracy = null, current_user = null, ip_address = '', currentTime = null, faultInjectionHook = null }) {
        if (!current_user || !current_user.ma_nv) {
            const error = new Error('Yêu cầu đăng nhập tài khoản nhân viên để chấm công!');
            error.statusCode = 401;
            throw error;
        }

        const ma_nv = current_user.ma_nv;
        const { getVietnamDateString, getVietnamTimeString } = require('../utils/timeHelper');
        const today = currentTime instanceof Date ? currentTime : new Date();
        const dateStr = getVietnamDateString(today);
        const timeStr = getVietnamTimeString(today);

        // 1. Kiểm tra tài khoản có bị tạm khóa không & lấy thông tin ràng buộc thiết bị
        const empCheck = await query('SELECT is_locked, status, bound_device_id, device_binding_mode FROM employees WHERE ma_nv = ?', [ma_nv]);
        if (!empCheck || empCheck.length === 0) {
            const error = new Error('Mã nhân viên không tồn tại trong hệ thống!');
            error.statusCode = 404;
            throw error;
        }
        const emp = empCheck[0];
        if (emp.status === 'inactive' || emp.is_locked === 1 || emp.is_locked === true) {
            const error = new Error(`Tài khoản nhân viên ${ma_nv} đang bị TẠM KHÓA. Không thể thực hiện chấm công!`);
            error.statusCode = 403;
            throw error;
        }

        // 2. Kiểm tra ảnh chụp nếu có
        if (image_snapshot) {
            this.validateImageSnapshot(image_snapshot);
        }

        // Chuẩn hóa chuỗi định danh thiết bị
        const deviceStr = device_info
            ? (typeof device_info === 'object'
                ? String(device_info.deviceId || [device_info.platform, device_info.userAgent].filter(Boolean).join('|')).slice(0, 140)
                : String(device_info).slice(0, 140))
            : null;

        // 3. Xác thực Vị trí & Kiểm tra Chống Fake GPS / Fake Thiết Bị (Nhiệm vụ 3)
        let location_source = 'raw';
        let is_low_trust = 1;
        let finalLat = lat;
        let finalLng = lng;

        if (zalo_location_token) {
            const { verifyZaloLocationToken } = require('../utils/zaloAdapter');
            let locResult = null;
            try {
                locResult = await verifyZaloLocationToken(zalo_location_token);
            } catch {}

            if (locResult && locResult.verified) {
                finalLat = locResult.lat;
                finalLng = locResult.lng;
                location_source = 'token';
                is_low_trust = 0;
            } else {
                const error = new Error('Mã xác thực vị trí Zalo không hợp lệ hoặc đã hết hạn!');
                error.statusCode = 400;
                throw error;
            }
        } else {
            const priorTokenLog = await query(
                'SELECT id FROM attendance_logs WHERE employee_id = ? AND location_source = "token" LIMIT 1',
                [ma_nv]
            );
            if (priorTokenLog && priorTokenLog.length > 0) {
                if (process.env.REJECT_DOWNGRADE_TO_RAW === 'true') {
                    const error = new Error('Phát hiện hạ cấp phương thức xác thực vị trí (ERR_METHOD_DOWNGRADE_DETECTED)! Tài khoản đã có lịch sử xác thực token không được gửi tọa độ thô.');
                    error.statusCode = 403;
                    error.code = 'ERR_METHOD_DOWNGRADE_DETECTED';
                    throw error;
                } else {
                    is_low_trust = 2;
                }
            } else {
                is_low_trust = 1;
            }
        }

        if (finalLat === null || finalLat === undefined || finalLng === null || finalLng === undefined) {
            const error = new Error('Tọa độ GPS không hợp lệ: Vui lòng cung cấp tọa độ vị trí thực tế!');
            error.statusCode = 400;
            throw error;
        }

        const numLat = Number(finalLat);
        const numLng = Number(finalLng);
        if (isNaN(numLat) || isNaN(numLng) || numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
            const error = new Error('Tọa độ GPS ngoài phạm vi hợp lệ (Vĩ độ: [-90, 90], Kinh độ: [-180, 180])!');
            error.statusCode = 400;
            throw error;
        }

        // Helper kích hoạt Cảnh báo Đỏ 2 chiều (CRITICAL_FRAUD)
        const triggerCriticalFraud = async (fraudType, fraudReason) => {
            await logAuditEvent({
                actor_id: ma_nv,
                actor_role: current_user.role || 'worker',
                action: 'CRITICAL_FRAUD',
                resource: 'attendance_security',
                details: {
                    fraud_type: fraudType,
                    reason: fraudReason,
                    device_fingerprint: deviceStr,
                    lat: numLat,
                    lng: numLng,
                    date: dateStr,
                    time: timeStr
                },
                ip_address
            });

            await query(`
                INSERT INTO attendance_logs (
                    employee_id, record_date, status, ot_hours, check_in_lat, check_in_lng,
                    check_in_method, is_suspicious, suspicious_reason, device_fingerprint, location_source, is_low_trust
                ) VALUES (?, ?, '0', 0, ?, ?, 'blocked_fraud', 1, ?, ?, ?, 2)
                ON DUPLICATE KEY UPDATE
                    is_suspicious = 1,
                    suspicious_reason = VALUES(suspicious_reason),
                    device_fingerprint = COALESCE(VALUES(device_fingerprint), device_fingerprint)
            `, [ma_nv, dateStr, numLat, numLng, fraudReason, deviceStr, location_source]).catch(() => {});

            const error = new Error('⚠️ CẢNH BÁO VI PHẠM AN NINH: Hệ thống phát hiện dấu hiệu giả mạo vị trí (Fake GPS) hoặc thiết bị chưa được cấp phép. Cảnh báo đã được gửi trực tiếp tới Ban Giám Đốc!');
            error.statusCode = 403;
            error.code = 'SECURITY_VIOLATION_FRAUD';
            error.fraud_type = fraudType;
            error.fraud_reason = fraudReason;
            throw error;
        };

        // 3.1 Kiểm tra cờ Fake GPS trực tiếp hoặc độ chính xác giả mạo
        if (is_fake_gps === true || is_fake_gps === 'true' || (gps_accuracy !== null && Number(gps_accuracy) < 0)) {
            await triggerCriticalFraud('FAKE_GPS', 'Phát hiện phần mềm giả mạo vị trí (Mock Location / Fake GPS)');
        }

        // 3.2 Kiểm tra dịch chuyển tức thời bất khả thi (Speed Anomaly > 120km/h trong vòng 10 phút)
        const lastCheckInRows = await query(`
            SELECT check_in_lat, check_in_lng, check_in_time, check_out_time
            FROM attendance_logs
            WHERE employee_id = ? AND record_date = ? AND check_in_lat IS NOT NULL AND check_in_lng IS NOT NULL
            LIMIT 1
        `, [ma_nv, dateStr]);
        if (lastCheckInRows && lastCheckInRows.length > 0) {
            const prev = lastCheckInRows[0];
            const prevTimeStr = prev.check_out_time || prev.check_in_time;
            const prevMins = this.parseTimeToMinutes(prevTimeStr, -1);
            const curMins = this.parseTimeToMinutes(timeStr, -1);
            const diffMins = Math.abs(curMins - prevMins);
            if (prevMins >= 0 && curMins >= 0 && diffMins > 0 && diffMins <= 10) {
                const jumpMeters = calculateDistanceMeters(numLat, numLng, Number(prev.check_in_lat), Number(prev.check_in_lng));
                if (jumpMeters > 20000) {
                    await triggerCriticalFraud('FAKE_GPS_TELEPORT', `Dịch chuyển vị trí bất thường (${Math.round(jumpMeters / 1000)}km trong ${diffMins} phút)`);
                }
            }
        }

        // 3.3 Kiểm tra Ràng buộc Thiết bị & Chấm công hộ trên cùng thiết bị
        let is_suspicious = false;
        let suspicious_reason = null;

        if (is_fake_device === true || is_fake_device === 'true') {
            await triggerCriticalFraud('UNREGISTERED_DEVICE', `Phát hiện thiết bị giả mạo / chưa được cấp phép (${deviceStr || 'Unknown Device'})`);
        }

        if (deviceStr) {
            // Kiểm tra xem thiết bị này vừa được một nhân viên KHÁC dùng chấm công trong 15 phút qua không (Chấm công hộ)
            const sharedDeviceLogs = await query(`
                SELECT actor_id, details
                FROM audit_logs
                WHERE action IN ('CHECK_IN_1TOUCH', 'CHECK_OUT_1TOUCH', 'CHECK_IN_DYNAMIC_QR')
                  AND actor_id != ?
                  AND created_at >= NOW() - INTERVAL 15 MINUTE
                ORDER BY created_at DESC
                LIMIT 10
            `, [ma_nv]);

            if (sharedDeviceLogs && sharedDeviceLogs.length > 0) {
                for (const sLog of sharedDeviceLogs) {
                    try {
                        const parsed = JSON.parse(sLog.details || '{}');
                        if (parsed.device_fingerprint && parsed.device_fingerprint === deviceStr) {
                            await triggerCriticalFraud(
                                'CLONED_SHARED_DEVICE',
                                `Phát hiện dùng chung thiết bị chấm công hộ với nhân viên ${sLog.actor_id} (${deviceStr})`
                            );
                        }
                    } catch (err) {
                        if (err.code === 'SECURITY_VIOLATION_FRAUD') throw err;
                    }
                }
            }
        }

        if (current_user.role === 'worker' && deviceStr) {
            const bindingMode = emp.device_binding_mode || 'recording';
            if (!emp.bound_device_id) {
                await query('UPDATE employees SET bound_device_id = ? WHERE ma_nv = ?', [deviceStr, ma_nv]);
                emp.bound_device_id = deviceStr;
            } else if (emp.bound_device_id !== deviceStr) {
                if (bindingMode === 'enforced') {
                    await triggerCriticalFraud(
                        'UNREGISTERED_DEVICE',
                        `Thiết bị lạ chưa được cấp phép (${deviceStr}) khác với thiết bị đã đăng ký (${emp.bound_device_id})`
                    );
                } else {
                    is_suspicious = true;
                    suspicious_reason = `Phát hiện chấm công từ thiết bị lạ (${deviceStr}) khác với thiết bị đã đăng ký (${emp.bound_device_id})`;
                }
            }
        }

        // 4. Nếu có truyền token QR Kiosk thì xác thực tùy chọn, còn Chấm công 1 chạm (V5) KHÔNG bắt buộc QR
        let usedQrToken = false;
        if (token && String(token).trim().length > 0) {
            const verifyRes = verifyDynamicQrToken(token, 60);
            if (verifyRes.valid) {
                const sessions = await query('SELECT * FROM dynamic_qr_sessions WHERE session_token = ? LIMIT 1', [token]);
                if (sessions && sessions.length > 0 && !sessions[0].is_used && new Date() <= new Date(sessions[0].expires_at)) {
                    usedQrToken = true;
                }
            }
        }

        // 5. Đọc Cấu hình Công ty (V5): Tọa độ Geofence + Khung giờ làm việc động
        const companySettingsRows = await query('SELECT * FROM company_settings LIMIT 1');
        const cs = (companySettingsRows && companySettingsRows[0]) ? companySettingsRows[0] : {};
        const companyLat = cs.latitude !== null && cs.latitude !== undefined ? Number(cs.latitude) : 16.0544;
        const companyLng = cs.longitude !== null && cs.longitude !== undefined ? Number(cs.longitude) : 108.2022;
        const allowedRadius = cs.radius_meters !== null && cs.radius_meters !== undefined ? Number(cs.radius_meters) : 5000;

        const distanceMeters = calculateDistanceMeters(numLat, numLng, companyLat, companyLng);
        if (distanceMeters > allowedRadius) {
            const error = new Error(`Vị trí chấm công không hợp lệ: Bạn đang cách trụ sở công ty ${distanceMeters}m (Bán kính cho phép tối đa ${allowedRadius}m)!`);
            error.statusCode = 400;
            throw error;
        }

        // 6. Kiểm tra kỳ công có bị khóa sổ không
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        const isLocked = await this.isPeriodLocked(currentMonth, currentYear);
        if (isLocked) {
            const error = new Error(`Kỳ công Tháng ${currentMonth}/${currentYear} đã bị KHÓA SỔ. Không thể chấm công!`);
            error.statusCode = 400;
            throw error;
        }

        // 7. Phân tích Giờ Vào (Check-in) / Giờ Ra (Check-out), Đi muộn, Về sớm & Tăng ca (OT) theo Cấu hình Công ty
        const workStartStr = cs.work_start || '08:00';
        const lunchStartStr = cs.lunch_start || '12:00';
        const lunchEndStr = cs.lunch_end || '13:30';
        const workEndStr = cs.work_end || '17:30';
        const graceMinutes = cs.grace_period_minutes !== undefined && cs.grace_period_minutes !== null ? Number(cs.grace_period_minutes) : 15;

        const workStartMins = this.parseTimeToMinutes(workStartStr, 480);   // 08:00 -> 480
        const lunchStartMins = this.parseTimeToMinutes(lunchStartStr, 720); // 12:00 -> 720
        const lunchEndMins = this.parseTimeToMinutes(lunchEndStr, 810);     // 13:30 -> 810
        const workEndMins = this.parseTimeToMinutes(workEndStr, 1050);      // 17:30 -> 1050
        const currentMins = this.parseTimeToMinutes(timeStr, 480);
        const shortTime = timeStr.slice(0, 5);

        const existingRows = await query(
            'SELECT * FROM attendance_logs WHERE employee_id = ? AND record_date = ? LIMIT 1',
            [ma_nv, dateStr]
        );
        const existingLog = existingRows && existingRows.length > 0 ? existingRows[0] : null;
        const isCheckOut = Boolean(existingLog && existingLog.check_in_time);

        let checkType = isCheckOut ? 'OUT' : 'IN';
        let late_minutes = existingLog ? (Number(existingLog.late_minutes) || 0) : 0;
        let early_leave_minutes = 0;
        let work_hours = existingLog ? (Number(existingLog.work_hours) || 0) : 0;
        let ot_hours = existingLog ? (Number(existingLog.ot_hours) || 0) : 0;
        let newStatus = existingLog && existingLog.status && existingLog.status !== '0' ? existingLog.status : '1';
        let shiftEvaluation = '';
        let detailedMessage = '';

        if (!isCheckOut) {
            // LẦN BẤM 1 TRONG NGÀY -> CHECK-IN (VÀO CA)
            if (currentMins <= workStartMins) {
                late_minutes = 0;
                const earlyBy = workStartMins - currentMins;
                shiftEvaluation = earlyBy > 0 ? `Đúng giờ • Đến sớm ${earlyBy} phút` : 'Đúng giờ';
            } else if (currentMins <= workStartMins + graceMinutes) {
                late_minutes = 0;
                shiftEvaluation = `Đúng giờ (Trong ${graceMinutes}p ân hạn)`;
            } else {
                late_minutes = currentMins - workStartMins;
                shiftEvaluation = `Đi muộn ${late_minutes} phút (Ca chuẩn ${workStartStr})`;
            }
            detailedMessage = `Đã ghi nhận Giờ vào: ${shortTime} (${shiftEvaluation})`;
        } else {
            // LẦN BẤM 2 TRỞ ĐI TRONG NGÀY -> CHECK-OUT (RA CA)
            const inMins = this.parseTimeToMinutes(existingLog.check_in_time, workStartMins);
            const effectiveIn = Math.min(inMins, currentMins);
            const lunchOverlap = Math.max(0, Math.min(currentMins, lunchEndMins) - Math.max(effectiveIn, lunchStartMins));
            const rawWorkedMins = Math.max(0, currentMins - effectiveIn - lunchOverlap);
            work_hours = Number((rawWorkedMins / 60).toFixed(2));

            if (currentMins < workEndMins) {
                early_leave_minutes = workEndMins - currentMins;
                newStatus = work_hours > 0 && work_hours <= 4.5 ? '0.5' : (ot_hours > 0 ? '1/OT' : '1');
                shiftEvaluation = `Về sớm ${early_leave_minutes} phút • Tổng ${work_hours}h làm việc`;
            } else {
                early_leave_minutes = 0;
                const extraMins = currentMins - workEndMins;
                if (extraMins >= 30) {
                    const autoOt = Number((extraMins / 60).toFixed(2));
                    ot_hours = Math.max(ot_hours, autoOt);
                    newStatus = '1/OT';
                    const h = Math.floor(extraMins / 60);
                    const m = extraMins % 60;
                    const otLabel = `${h > 0 ? `${h}h` : ''}${m > 0 ? `${m}p` : ''}`;
                    shiftEvaluation = `Làm thêm ${otLabel} (${ot_hours}h OT) • Tổng ${work_hours}h`;
                } else {
                    newStatus = ot_hours > 0 ? '1/OT' : '1';
                    shiftEvaluation = `Đủ công chuẩn • Tổng ${work_hours}h làm việc`;
                }
            }
            detailedMessage = `Đã ghi nhận Giờ ra: ${shortTime} (${shiftEvaluation})`;
        }

        const checkInMethod = usedQrToken ? 'dynamic_qr' : 'one_touch_gps';

        await withTransaction(async (txQuery) => {
            if (usedQrToken) {
                await txQuery(
                    'UPDATE dynamic_qr_sessions SET is_used = 1, used_by = ?, used_at = NOW() WHERE session_token = ? AND is_used = 0',
                    [ma_nv, token]
                );
            }

            if (faultInjectionHook && process.env.NODE_ENV === 'test') {
                await faultInjectionHook(txQuery);
            }

            if (!isCheckOut) {
                const insertSql = `
                    INSERT INTO attendance_logs (
                        employee_id, record_date, status, ot_hours, check_in_time,
                        check_in_lat, check_in_lng, check_in_method, check_in_image,
                        is_suspicious, suspicious_reason, device_fingerprint,
                        location_source, is_low_trust, late_minutes, early_leave_minutes, work_hours
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
                    ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        check_in_time = COALESCE(check_in_time, VALUES(check_in_time)),
                        check_in_lat = COALESCE(VALUES(check_in_lat), check_in_lat),
                        check_in_lng = COALESCE(VALUES(check_in_lng), check_in_lng),
                        check_in_image = COALESCE(VALUES(check_in_image), check_in_image),
                        is_suspicious = CASE WHEN VALUES(is_suspicious) = 1 THEN 1 ELSE is_suspicious END,
                        suspicious_reason = COALESCE(VALUES(suspicious_reason), suspicious_reason),
                        device_fingerprint = COALESCE(VALUES(device_fingerprint), device_fingerprint),
                        location_source = COALESCE(VALUES(location_source), location_source),
                        late_minutes = VALUES(late_minutes)
                `;
                await txQuery(insertSql, [
                    ma_nv,
                    dateStr,
                    newStatus,
                    ot_hours,
                    timeStr,
                    numLat,
                    numLng,
                    checkInMethod,
                    image_snapshot || null,
                    is_suspicious ? 1 : 0,
                    suspicious_reason || null,
                    deviceStr,
                    location_source,
                    is_low_trust,
                    late_minutes
                ]);
            } else {
                const updateOutSql = `
                    UPDATE attendance_logs
                    SET check_out_time = ?,
                        status = ?,
                        ot_hours = ?,
                        early_leave_minutes = ?,
                        work_hours = ?,
                        check_in_image = COALESCE(?, check_in_image),
                        is_suspicious = CASE WHEN ? = 1 THEN 1 ELSE is_suspicious END,
                        suspicious_reason = COALESCE(?, suspicious_reason),
                        device_fingerprint = COALESCE(?, device_fingerprint)
                    WHERE employee_id = ? AND record_date = ?
                `;
                await txQuery(updateOutSql, [
                    timeStr,
                    newStatus,
                    ot_hours,
                    early_leave_minutes,
                    work_hours,
                    image_snapshot || null,
                    is_suspicious ? 1 : 0,
                    suspicious_reason || null,
                    deviceStr,
                    ma_nv,
                    dateStr
                ]);
            }
        });

        await logAuditEvent({
            actor_id: ma_nv,
            actor_role: current_user.role,
            action: isCheckOut ? 'CHECK_OUT_1TOUCH' : 'CHECK_IN_1TOUCH',
            resource: 'attendance',
            details: {
                check_type: checkType,
                date: dateStr,
                time: timeStr,
                late_minutes,
                early_leave_minutes,
                work_hours,
                ot_hours,
                shift_evaluation: shiftEvaluation,
                distanceMeters,
                is_suspicious,
                suspicious_reason,
                device_fingerprint: deviceStr,
                location_source
            },
            ip_address
        });

        return {
            success: true,
            message: detailedMessage,
            server_time: timeStr,
            data: {
                employee_id: ma_nv,
                record_date: dateStr,
                check_type: checkType,
                check_in_time: isCheckOut ? existingLog.check_in_time : timeStr,
                check_out_time: isCheckOut ? timeStr : null,
                server_time: timeStr,
                late_minutes,
                early_leave_minutes,
                work_hours,
                ot_hours,
                status: newStatus,
                shift_evaluation: shiftEvaluation,
                distanceMeters,
                is_suspicious,
                suspicious_reason,
                location_source,
                is_low_trust
            }
        };
    }

    async getSuspiciousLogs(limit = 100) {
        const sql = `
            SELECT a.id, a.employee_id, e.ho_ten, e.chuc_danh, 
                   DATE_FORMAT(a.record_date, '%d/%m/%Y') as record_date, 
                   a.check_in_time, a.check_out_time, a.check_in_lat, a.check_in_lng, 
                   a.check_in_method, a.is_suspicious, a.suspicious_reason, a.device_fingerprint,
                   a.location_source, a.is_low_trust
            FROM attendance_logs a
            LEFT JOIN employees e ON a.employee_id = e.ma_nv
            WHERE a.is_suspicious = 1
            ORDER BY a.record_date DESC, a.check_in_time DESC
            LIMIT ?
        `;
        const rows = await query(sql, [parseInt(limit, 10) || 100]);
        return rows || [];
    }

    async getAttendanceImageById(logId) {
        if (!logId) return null;
        const rows = await query('SELECT check_in_image FROM attendance_logs WHERE id = ? LIMIT 1', [logId]);
        return rows && rows.length > 0 ? rows[0].check_in_image : null;
    }

    async getAttendanceStats(dateStr = null) {
        const targetDate = dateStr || new Date().toISOString().slice(0, 10);
        const [totalEmpRow] = await query('SELECT COUNT(*) as total FROM employees WHERE status != "inactive"');
        const totalEmployees = totalEmpRow ? Number(totalEmpRow.total) : 0;

        const logs = await query(
            'SELECT status, check_in_time FROM attendance_logs WHERE record_date = ?',
            [targetDate]
        );

        let present = 0;
        let late = 0;
        let leave = 0;

        (logs || []).forEach(l => {
            if (l.status === 'P') {
                leave++;
            } else if (l.status !== '0') {
                present++;
                if (l.check_in_time && l.check_in_time > '08:15:00') {
                    late++;
                }
            }
        });

        const attendanceRate = totalEmployees > 0 ? Number(((present / totalEmployees) * 100).toFixed(1)) : 0;

        return {
            date: targetDate,
            totalEmployees,
            present,
            late,
            leave,
            absent: Math.max(0, totalEmployees - present - leave),
            attendanceRate
        };
    }
}

module.exports = new AttendanceService();

