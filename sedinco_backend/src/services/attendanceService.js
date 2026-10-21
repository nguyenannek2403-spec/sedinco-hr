const { query } = require('../config/db');
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
            'SELECT record_date, status, ot_hours, check_in_time, check_out_time FROM attendance_logs WHERE employee_id = ? AND MONTH(record_date) = ? AND YEAR(record_date) = ? ORDER BY record_date ASC',
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
        if (!month || !year) return { is_locked: false };
        const res = await query(
            'SELECT month, year, is_locked, locked_by, locked_at, reason FROM period_locks WHERE month = ? AND year = ? LIMIT 1',
            [month, year]
        );
        if (res && res.length > 0) {
            return {
                month: Number(res[0].month),
                year: Number(res[0].year),
                is_locked: Boolean(res[0].is_locked),
                locked_by: res[0].locked_by,
                locked_at: res[0].locked_at,
                reason: res[0].reason
            };
        }
        return {
            month: Number(month),
            year: Number(year),
            is_locked: false
        };
    }

    async lockPeriod({ month, year, reason, locked_by = 'admin', current_user = null }) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (isNaN(m) || isNaN(y)) {
            const error = new Error('Tháng và năm không hợp lệ!');
            error.statusCode = 400;
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
                details: { month: m, year: y, reason }
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
        // 1. Kiểm tra quyền hạn khi sửa cho người khác
        if (current_user) {
            const userRole = current_user.role;
            const isSelf = current_user.ma_nv === ma_nv;

            if (userRole === 'worker' && !isSelf) {
                const error = new Error('Bảo mật: Công nhân không thể chỉnh sửa chấm công của người khác!');
                error.statusCode = 403;
                throw error;
            }

            if (userRole === 'worker' && isDelete) {
                const error = new Error('Bảo mật: Công nhân không thể tự ý xóa bản ghi chấm công!');
                error.statusCode = 403;
                throw error;
            }

            if (userRole === 'accountant' && !isSelf) {
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

    async generateDynamicQr(branchId = 1, current_user = null) {
        const qrData = generateDynamicQrToken(branchId, 30);
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

    async checkInMultiFactor({ token, lat, lng, image_snapshot, device_info, current_user = null, ip_address = '' }) {
        if (!current_user || !current_user.ma_nv) {
            const error = new Error('Yêu cầu đăng nhập tài khoản nhân viên để chấm công!');
            error.statusCode = 401;
            throw error;
        }

        const ma_nv = current_user.ma_nv;

        // 1. Kiểm tra tài khoản có bị tạm khóa không
        const empCheck = await query('SELECT is_locked, status FROM employees WHERE ma_nv = ?', [ma_nv]);
        if (!empCheck || empCheck.length === 0) {
            const error = new Error('Mã nhân viên không tồn tại trong hệ thống!');
            error.statusCode = 404;
            throw error;
        }
        if (empCheck[0].status === 'inactive' || empCheck[0].is_locked === 1 || empCheck[0].is_locked === true) {
            const error = new Error(`Tài khoản nhân viên ${ma_nv} đang bị TẠM KHÓA. Không thể thực hiện chấm công!`);
            error.statusCode = 403;
            throw error;
        }

        // 2. Xác thực Mã QR Động
        if (!token) {
            const error = new Error('Thiếu mã QR xác thực chấm công!');
            error.statusCode = 400;
            throw error;
        }

        // 2.1 Kiểm tra định dạng và chữ ký HMAC
        const verifyRes = verifyDynamicQrToken(token, 60);
        if (!verifyRes.valid) {
            const error = new Error(verifyRes.reason);
            error.statusCode = 400;
            throw error;
        }

        // 2.2 Kiểm tra trong CSDL (chống replay attack và kiểm tra hết hạn)
        const sessions = await query('SELECT * FROM dynamic_qr_sessions WHERE session_token = ? LIMIT 1', [token]);
        if (!sessions || sessions.length === 0) {
            const error = new Error('Mã QR không hợp lệ hoặc không tồn tại trong hệ thống!');
            error.statusCode = 400;
            throw error;
        }

        const session = sessions[0];
        if (session.is_used === 1 || session.is_used === true) {
            const error = new Error('Mã QR này đã được sử dụng! Vui lòng quét mã QR mới trên màn hình.');
            error.statusCode = 400;
            throw error;
        }

        const now = new Date();
        const expiresAt = new Date(session.expires_at);
        if (now > expiresAt) {
            const error = new Error('Mã QR đã hết hạn! Vui lòng quét mã QR mới trên màn hình.');
            error.statusCode = 400;
            throw error;
        }

        // 3. Xác thực Vị trí Khoanh vùng (Geofencing)
        const companySettings = await query('SELECT latitude, longitude, radius_meters FROM company_settings LIMIT 1');
        const companyLat = companySettings && companySettings[0] && companySettings[0].latitude !== null ? Number(companySettings[0].latitude) : 16.0544;
        const companyLng = companySettings && companySettings[0] && companySettings[0].longitude !== null ? Number(companySettings[0].longitude) : 108.2022;
        const allowedRadius = companySettings && companySettings[0] && companySettings[0].radius_meters !== null ? Number(companySettings[0].radius_meters) : 100;

        let distanceMeters = null;
        if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
            distanceMeters = calculateDistanceMeters(lat, lng, companyLat, companyLng);
            if (distanceMeters > allowedRadius) {
                const error = new Error(`Vị trí chấm công không hợp lệ: Bạn đang cách trụ sở công ty ${distanceMeters}m (Bán kính cho phép tối đa ${allowedRadius}m)!`);
                error.statusCode = 400;
                throw error;
            }
        }

        // 4. Kiểm tra kỳ công có bị khóa sổ không
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        const isLocked = await this.isPeriodLocked(currentMonth, currentYear);
        if (isLocked) {
            const error = new Error(`Kỳ công Tháng ${currentMonth}/${currentYear} đã bị KHÓA SỔ. Không thể chấm công!`);
            error.statusCode = 400;
            throw error;
        }

        // 5. Thuật toán phát hiện bất thường / Chấm công hộ (Anomaly Detection)
        let is_suspicious = false;
        let suspicious_reason = null;

        if (ip_address || device_info) {
            const recentLogs = await query(`
                SELECT actor_id, ip_address, details, created_at 
                FROM audit_logs 
                WHERE action = 'CHECK_IN_DYNAMIC_QR' 
                  AND actor_id != ? 
                  AND created_at >= NOW() - INTERVAL 60 SECOND
                ORDER BY created_at DESC 
                LIMIT 5
            `, [ma_nv]);

            if (recentLogs && recentLogs.length > 0) {
                for (const log of recentLogs) {
                    const sameIp = ip_address && log.ip_address === ip_address;
                    let sameDevice = false;
                    try {
                        const parsedDetails = JSON.parse(log.details || '{}');
                        if (device_info && parsedDetails.device_fingerprint === device_info) {
                            sameDevice = true;
                        }
                    } catch {}

                    if (sameIp || sameDevice) {
                        is_suspicious = true;
                        suspicious_reason = `Phát hiện chấm công liên tiếp trên cùng ${sameDevice ? 'thiết bị' : 'địa chỉ mạng'} với nhân viên ${log.actor_id} trong vòng 60 giây`;
                        break;
                    }
                }
            }
        }

        // 6. Đánh dấu Token đã sử dụng (Atomic Single-Use update)
        const updateRes = await query(
            'UPDATE dynamic_qr_sessions SET is_used = 1, used_by = ?, used_at = NOW() WHERE session_token = ? AND is_used = 0',
            [ma_nv, token]
        );
        if (!updateRes || updateRes.affectedRows === 0) {
            const error = new Error('Mã QR đã vừa được sử dụng bởi phiên khác! Vui lòng quét mã mới.');
            error.statusCode = 400;
            throw error;
        }

        // 7. Ghi nhận nhật ký chấm công vào attendance_logs
        const dateStr = today.toISOString().split('T')[0];
        const hours = String(today.getHours()).padStart(2, '0');
        const minutes = String(today.getMinutes()).padStart(2, '0');
        const seconds = String(today.getSeconds()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}:${seconds}`;

        const insertLogSql = `
            INSERT INTO attendance_logs (
                employee_id, record_date, status, ot_hours, check_in_time, 
                check_in_lat, check_in_lng, check_in_method, check_in_image, 
                is_suspicious, suspicious_reason, device_fingerprint
            ) VALUES (?, ?, '1', 0, ?, ?, ?, 'dynamic_qr', ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                status = '1',
                check_in_time = COALESCE(check_in_time, VALUES(check_in_time)),
                check_out_time = VALUES(check_in_time),
                check_in_lat = COALESCE(VALUES(check_in_lat), check_in_lat),
                check_in_lng = COALESCE(VALUES(check_in_lng), check_in_lng),
                check_in_image = COALESCE(VALUES(check_in_image), check_in_image),
                is_suspicious = CASE WHEN VALUES(is_suspicious) = 1 THEN 1 ELSE is_suspicious END,
                suspicious_reason = COALESCE(VALUES(suspicious_reason), suspicious_reason),
                device_fingerprint = COALESCE(VALUES(device_fingerprint), device_fingerprint)
        `;

        await query(insertLogSql, [
            ma_nv,
            dateStr,
            timeStr,
            lat || null,
            lng || null,
            image_snapshot || null,
            is_suspicious ? 1 : 0,
            suspicious_reason || null,
            device_info || null
        ]);

        // 8. Ghi Audit Log
        await logAuditEvent({
            actor_id: ma_nv,
            actor_role: current_user.role,
            action: 'CHECK_IN_DYNAMIC_QR',
            resource: 'attendance',
            details: {
                date: dateStr,
                time: timeStr,
                distanceMeters,
                is_suspicious,
                suspicious_reason,
                device_fingerprint: device_info
            },
            ip_address
        });

        return {
            success: true,
            message: is_suspicious 
                ? 'Chấm công thành công (Hệ thống ghi nhận dấu hiệu bất thường để quản trị đối soát).' 
                : 'Chấm công qua Mã QR Động thành công!',
            data: {
                employee_id: ma_nv,
                record_date: dateStr,
                check_in_time: timeStr,
                distanceMeters,
                is_suspicious,
                suspicious_reason
            }
        };
    }

    async getSuspiciousLogs(limit = 100) {
        const sql = `
            SELECT a.id, a.employee_id, e.ho_ten, e.chuc_danh, 
                   DATE_FORMAT(a.record_date, '%d/%m/%Y') as record_date, 
                   a.check_in_time, a.check_out_time, a.check_in_lat, a.check_in_lng, 
                   a.check_in_method, a.check_in_image, a.is_suspicious, a.suspicious_reason, a.device_fingerprint
            FROM attendance_logs a
            LEFT JOIN employees e ON a.employee_id = e.ma_nv
            WHERE a.is_suspicious = 1
            ORDER BY a.record_date DESC, a.check_in_time DESC
            LIMIT ?
        `;
        const rows = await query(sql, [parseInt(limit, 10) || 100]);
        return rows || [];
    }
}

module.exports = new AttendanceService();
