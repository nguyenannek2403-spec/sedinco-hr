const { query } = require('../config/db');
const { logAuditEvent, getAccountantPermissions } = require('../middlewares/authMiddleware');

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
}

module.exports = new AttendanceService();
