const { query } = require('../config/db');
const { invalidatePermissionCache, logAuditEvent } = require('../middlewares/authMiddleware');

class PermissionService {
    async getAccountantPermissions() {
        const sql = `
            SELECT permission_key, permission_name, category, is_enabled, description, updated_by, updated_at
            FROM accountant_permissions
            ORDER BY category ASC, permission_key ASC
        `;
        const rows = await query(sql);
        return rows || [];
    }

    async updateAccountantPermissions(updatedPermissions, current_user = null) {
        if (!updatedPermissions || typeof updatedPermissions !== 'object') {
            const error = new Error('Dữ liệu phân quyền không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        // Lấy trạng thái hiện tại để ghi audit log so sánh before / after
        const currentRows = await query('SELECT permission_key, is_enabled FROM accountant_permissions');
        const beforeMap = {};
        (currentRows || []).forEach(r => {
            beforeMap[r.permission_key] = Boolean(r.is_enabled);
        });

        const changes = {};
        const updaterId = current_user ? (current_user.username || current_user.ma_nv || 'admin') : 'admin';

        // Xử lý cả dạng Object { [key]: boolean } lẫn Array [ { permission_key, is_enabled } ]
        let entries = [];
        if (Array.isArray(updatedPermissions)) {
            entries = updatedPermissions.map(p => [p.permission_key, Boolean(p.is_enabled)]);
        } else {
            entries = Object.entries(updatedPermissions).map(([k, v]) => [k, Boolean(v)]);
        }

        for (const [key, enabled] of entries) {
            if (beforeMap[key] !== undefined && beforeMap[key] !== enabled) {
                changes[key] = { from: beforeMap[key], to: enabled };
                await query(
                    'UPDATE accountant_permissions SET is_enabled = ?, updated_by = ? WHERE permission_key = ?',
                    [enabled ? 1 : 0, updaterId, key]
                );
            }
        }

        // Vô hiệu hóa cache ngay lập tức để request kế tiếp của Kế toán được áp dụng quyền mới ngay
        invalidatePermissionCache();

        if (Object.keys(changes).length > 0 && current_user) {
            await logAuditEvent({
                actor_id: updaterId,
                actor_role: current_user.role || 'admin',
                action: 'UPDATE_ACCOUNTANT_PERMISSIONS',
                resource: 'permissions',
                details: {
                    changed_count: Object.keys(changes).length,
                    changes
                }
            });
        }

        return { 
            success: true, 
            message: 'Cập nhật cấu hình phân quyền Kế toán thành công!',
            changed_count: Object.keys(changes).length 
        };
    }

    async cleanupExpiredAuditLogs(customRetentionDays = null) {
        let retentionDays = 30;
        if (customRetentionDays !== null && customRetentionDays !== undefined && !isNaN(Number(customRetentionDays))) {
            retentionDays = Math.max(1, Math.min(365, parseInt(customRetentionDays, 10)));
            await query('UPDATE company_settings SET log_retention_days = ?', [retentionDays]).catch(() => {});
        } else {
            const csRows = await query('SELECT log_retention_days FROM company_settings LIMIT 1').catch(() => []);
            if (csRows && csRows.length > 0 && csRows[0].log_retention_days) {
                retentionDays = Math.max(1, parseInt(csRows[0].log_retention_days, 10) || 30);
            }
        }

        const res = await query(`
            DELETE FROM audit_logs
            WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
              AND (is_pinned IS NULL OR is_pinned = 0)
              AND actor_id NOT IN (SELECT ma_nv FROM employees WHERE keep_logs = 1)
        `, [retentionDays]);

        return {
            success: true,
            retention_days: retentionDays,
            deleted_count: res && res.affectedRows ? res.affectedRows : 0
        };
    }

    async getAuditLogs(filters = {}) {
        // Tự động dọn dẹp ngầm các log quá hạn (trừ log đã ghim hoặc nhân viên được bật keep_logs = 1)
        this.cleanupExpiredAuditLogs().catch(() => {});

        const isLegacyLimit = typeof filters === 'number' || typeof filters === 'string';
        const limit = isLegacyLimit ? (parseInt(filters, 10) || 150) : (parseInt(filters.limit, 10) || 200);
        const ma_nv = !isLegacyLimit && filters.ma_nv ? String(filters.ma_nv).trim() : '';
        const category = !isLegacyLimit && filters.category ? String(filters.category).trim().toLowerCase() : '';
        const startDate = !isLegacyLimit && filters.startDate ? String(filters.startDate).trim() : '';
        const endDate = !isLegacyLimit && filters.endDate ? String(filters.endDate).trim() : '';
        const pinnedOnly = !isLegacyLimit && (filters.pinnedOnly === 'true' || filters.pinnedOnly === true || filters.pinnedOnly === '1');

        const whereClauses = ['1=1'];
        const params = [];

        if (ma_nv) {
            whereClauses.push('a.actor_id = ?');
            params.push(ma_nv);
        }

        if (category === 'fraud') {
            whereClauses.push("(a.action = 'CRITICAL_FRAUD' OR a.resource = 'attendance_security')");
        } else if (category === 'attendance') {
            whereClauses.push("(a.resource = 'attendance' OR a.action LIKE '%CHECK_%')");
        } else if (category === 'requests') {
            whereClauses.push("a.resource IN ('requests', 'ot_registrations')");
        } else if (category === 'payroll') {
            whereClauses.push("a.resource = 'payroll'");
        } else if (category === 'auth_device') {
            whereClauses.push("a.resource IN ('auth', 'employee_device', 'employees')");
        }

        if (startDate) {
            whereClauses.push('DATE(a.created_at) >= ?');
            params.push(startDate);
        }
        if (endDate) {
            whereClauses.push('DATE(a.created_at) <= ?');
            params.push(endDate);
        }
        if (pinnedOnly) {
            whereClauses.push('a.is_pinned = 1');
        }

        params.push(Math.min(500, Math.max(10, limit)));

        const sql = `
            SELECT a.id, a.actor_id, a.actor_role, a.action, a.resource, a.details, a.ip_address,
                   a.created_at, COALESCE(a.is_pinned, 0) as is_pinned,
                   e.ho_ten, e.chuc_danh, COALESCE(e.keep_logs, 0) as keep_logs,
                   COALESCE(e.is_locked, 0) as is_locked, e.bound_device_id
            FROM audit_logs a
            LEFT JOIN employees e ON a.actor_id = e.ma_nv
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY a.is_pinned DESC, a.created_at DESC
            LIMIT ?
        `;
        const rows = await query(sql, params);
        return rows || [];
    }

    async togglePinAuditLog(logId, is_pinned) {
        const pinVal = is_pinned ? 1 : 0;
        await query('UPDATE audit_logs SET is_pinned = ? WHERE id = ?', [pinVal, logId]);
        return {
            success: true,
            id: Number(logId),
            is_pinned: Boolean(pinVal),
            message: pinVal ? '📌 Đã ghim giữ lại vĩnh viễn dòng lịch sử này!' : 'Đã bỏ ghim dòng lịch sử.'
        };
    }

    async toggleEmployeeKeepLogs(ma_nv, keep_logs, current_user = null) {
        const keepVal = keep_logs ? 1 : 0;
        await query('UPDATE employees SET keep_logs = ? WHERE ma_nv = ?', [keepVal, ma_nv]);
        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'admin',
                actor_role: current_user.role || 'admin',
                action: 'TOGGLE_EMPLOYEE_KEEP_LOGS',
                resource: 'employees',
                details: { target_ma_nv: ma_nv, keep_logs: Boolean(keepVal) }
            });
        }
        return {
            success: true,
            ma_nv,
            keep_logs: Boolean(keepVal),
            message: keepVal
                ? `🔒 Đã bật chế độ Giữ toàn bộ lịch sử cho nhân viên ${ma_nv}!`
                : `Đã tắt chế độ giữ toàn bộ lịch sử cho nhân viên ${ma_nv}.`
        };
    }

    async getAlertsSummary() {
        const { getVietnamDateString } = require('../utils/timeHelper');
        const todayStr = getVietnamDateString(new Date());

        const [fraudRows, disputedRows, deviceRows, reqRows, csRows, totalEmpRows, todayLogsRows] = await Promise.all([
            query(`
                SELECT a.id, a.actor_id, e.ho_ten, a.details, a.created_at, COALESCE(e.is_locked, 0) as is_locked
                FROM audit_logs a
                LEFT JOIN employees e ON a.actor_id = e.ma_nv
                WHERE a.action = 'CRITICAL_FRAUD' AND a.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                ORDER BY a.created_at DESC
                LIMIT 15
            `).catch(() => []),
            query(`
                SELECT att.id, att.ma_nv, e.ho_ten, att.thang, att.nam, att.dispute_reason, att.confirmed_at
                FROM attendance att
                LEFT JOIN employees e ON att.ma_nv = e.ma_nv
                WHERE att.salary_confirm_status = 'DISPUTED'
                ORDER BY att.nam DESC, att.thang DESC
                LIMIT 20
            `).catch(() => []),
            query(`
                SELECT COUNT(*) as cnt FROM employees WHERE pending_device_id IS NOT NULL AND pending_device_id != ''
            `).catch(() => [{ cnt: 0 }]),
            query(`
                SELECT COUNT(*) as cnt FROM requests WHERE status = 'pending'
            `).catch(() => [{ cnt: 0 }]),
            query('SELECT log_retention_days FROM company_settings LIMIT 1').catch(() => [{ log_retention_days: 30 }]),
            query("SELECT COUNT(*) as total FROM employees WHERE status != 'inactive'").catch(() => [{ total: 0 }]),
            query('SELECT status, late_minutes, check_in_time, work_location_type FROM attendance_logs WHERE record_date = ?', [todayStr]).catch(() => [])
        ]);

        let presentToday = 0;
        let lateToday = 0;
        let fieldWorkToday = 0;
        let leaveToday = 0;
        (todayLogsRows || []).forEach((l) => {
            if (l.status === 'P') {
                leaveToday++;
            } else if (l.status !== '0') {
                presentToday++;
                if ((Number(l.late_minutes) || 0) > 0 || (l.check_in_time && l.check_in_time > '08:15:00')) {
                    lateToday++;
                }
                if (l.work_location_type === 'FIELD_WORK') {
                    fieldWorkToday++;
                }
            }
        });
        const totalEmployees = totalEmpRows && totalEmpRows[0] ? Number(totalEmpRows[0].total) : 0;

        const fraudAlerts = fraudRows || [];
        const salaryDisputes = disputedRows || [];
        const pendingDevicesCount = deviceRows && deviceRows[0] ? Number(deviceRows[0].cnt) : 0;
        const pendingRequestsCount = reqRows && reqRows[0] ? Number(reqRows[0].cnt) : 0;
        const retentionDays = csRows && csRows[0] ? (Number(csRows[0].log_retention_days) || 30) : 30;

        return {
            fraud_count: fraudAlerts.length,
            fraud_alerts: fraudAlerts,
            disputed_salary_count: salaryDisputes.length,
            salary_disputes: salaryDisputes,
            pending_device_count: pendingDevicesCount,
            pending_requests_count: pendingRequestsCount,
            total_red_alerts: fraudAlerts.length + salaryDisputes.length + pendingDevicesCount,
            log_retention_days: retentionDays,
            headcount_today: {
                date: todayStr,
                total_employees: totalEmployees,
                present: presentToday,
                late: lateToday,
                field_work: fieldWorkToday,
                leave: leaveToday,
                absent: Math.max(0, totalEmployees - presentToday - leaveToday)
            }
        };
    }
}

module.exports = new PermissionService();
