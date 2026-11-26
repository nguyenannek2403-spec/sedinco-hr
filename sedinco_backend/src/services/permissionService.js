const { query } = require('../config/db');
const { invalidatePermissionCache, logAuditEvent } = require('../middlewares/authMiddleware');

const ENFORCED_ACCOUNTANT_KEYS = [
    'attendance_view_all',
    'attendance_edit',
    'attendance_lock',
    'accountant_manual_checkin',
    'leave_view_all',
    'leave_approve',
    'employee_view',
    'employee_create',
    'employee_edit',
    'employee_delete',
    'employee_status_manage',
    'shift_manage',
    'payroll_view_all',
    'payroll_calculate',
    'payroll_approve',
    'payroll_payment_status_manage',
    'payroll_export'
];

const OPTIONAL_PERMISSION_SEEDS = {
    accountant_manual_checkin: {
        permission_name: 'Bật chấm công cho Kế toán',
        category: 'attendance',
        is_enabled: 0,
        description:
            'Mặc định tắt: hệ thống tự động lưu 1 công mỗi ngày làm việc (trừ Chủ nhật). Khi bật: Kế toán tự chấm công Vào/Ra như nhân viên bình thường và vẫn giữ nguyên toàn bộ ngày công tự động đã lưu trước đó.'
    }
};

class PermissionService {
    async ensureAccountantManualCheckinSeeded() {
        const meta = OPTIONAL_PERMISSION_SEEDS.accountant_manual_checkin;
        await query(
            `INSERT IGNORE INTO accountant_permissions (permission_key, permission_name, category, is_enabled, description, updated_by)
             VALUES (?, ?, ?, ?, ?, 'system')`,
            ['accountant_manual_checkin', meta.permission_name, meta.category, meta.is_enabled, meta.description]
        ).catch(() => {});
    }

    async getAccountantPermissions() {
        await this.ensureAccountantManualCheckinSeeded();
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

        await this.ensureAccountantManualCheckinSeeded();

        // Lấy trạng thái hiện tại để ghi audit log so sánh before / after
        const currentRows = await query('SELECT permission_key, is_enabled FROM accountant_permissions');
        const beforeMap = {};
        (currentRows || []).forEach(r => {
            beforeMap[r.permission_key] = Boolean(r.is_enabled);
        });

        const changes = {};
        const updaterId = current_user ? (current_user.username || current_user.ma_nv || 'admin') : 'admin';

        // Xử lý cả dạng Object { [key]: boolean } lẫn Array [ { permission_key, is_enabled } ]
        let rawEntries = [];
        if (Array.isArray(updatedPermissions)) {
            rawEntries = updatedPermissions.map(p => [p.permission_key, Boolean(p.is_enabled)]);
        } else {
            rawEntries = Object.entries(updatedPermissions).map(([k, v]) => [k, Boolean(v)]);
        }

        // Đồng bộ các khóa phụ cùng nghiệp vụ trong DB
        const inputMap = {};
        for (const [k, v] of rawEntries) {
            if (k) inputMap[k] = v;
        }
        if (inputMap.leave_approve !== undefined) {
            if (inputMap.attendance_request_approve === undefined) inputMap.attendance_request_approve = inputMap.leave_approve;
            if (inputMap.leave_reject === undefined) inputMap.leave_reject = inputMap.leave_approve;
            if (inputMap.request_manage === undefined) inputMap.request_manage = inputMap.leave_approve;
        }
        if (inputMap.leave_view_all !== undefined && inputMap.request_view_all === undefined) {
            inputMap.request_view_all = inputMap.leave_view_all;
        }
        if (inputMap.payroll_export !== undefined && inputMap.report_export === undefined) {
            inputMap.report_export = inputMap.payroll_export;
        }
        if (inputMap.attendance_view_all !== undefined) {
            if (inputMap.attendance_summarize === undefined) inputMap.attendance_summarize = inputMap.attendance_view_all;
            if (inputMap.report_view === undefined) inputMap.report_view = inputMap.attendance_view_all;
        }

        for (const [key, enabled] of Object.entries(inputMap)) {
            if (beforeMap[key] !== undefined && beforeMap[key] !== enabled) {
                changes[key] = { from: beforeMap[key], to: enabled };
                await query(
                    'UPDATE accountant_permissions SET is_enabled = ?, updated_by = ? WHERE permission_key = ?',
                    [enabled ? 1 : 0, updaterId, key]
                );
            } else if (beforeMap[key] === undefined && OPTIONAL_PERMISSION_SEEDS[key]) {
                const meta = OPTIONAL_PERMISSION_SEEDS[key];
                changes[key] = { from: false, to: enabled };
                await query(
                    `INSERT INTO accountant_permissions (permission_key, permission_name, category, is_enabled, description, updated_by)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled), updated_by = VALUES(updated_by)`,
                    [key, meta.permission_name, meta.category, enabled ? 1 : 0, meta.description, updaterId]
                );
            }
        }

        // Vô hiệu hóa cache ngay lập tức để request kế tiếp của Kế toán được áp dụng quyền mới ngay
        invalidatePermissionCache();

        // V66 Transition Hook: Xử lý bảo toàn dữ liệu lịch sử khi bật/tắt chế độ Chấm công Kế toán
        let transitionSummary = null;
        if (changes.accountant_manual_checkin !== undefined) {
            const attendanceService = require('./attendanceService');
            transitionSummary = await attendanceService.handleAccountantManualCheckinTransition({
                enabled: Boolean(changes.accountant_manual_checkin.to),
                actorId: updaterId
            });
        }

        if (Object.keys(changes).length > 0 && current_user) {
            await logAuditEvent({
                actor_id: updaterId,
                actor_role: current_user.role || 'admin',
                action: 'UPDATE_ACCOUNTANT_PERMISSIONS',
                resource: 'permissions',
                details: {
                    changed_count: Object.keys(changes).length,
                    changes,
                    ...(transitionSummary ? { accountant_checkin_transition: transitionSummary } : {})
                }
            });
        }

        const updatedRows = await this.getAccountantPermissions();

        return { 
            success: true, 
            message: 'Cập nhật cấu hình phân quyền Kế toán thành công!',
            changed_count: Object.keys(changes).length,
            updated_keys: Object.keys(inputMap),
            transition_summary: transitionSummary,
            data: updatedRows
        };
    }

    async cleanupExpiredAuditLogs(customRetentionDays = null, current_user = null) {
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

        const deletedCount = res && res.affectedRows ? res.affectedRows : 0;
        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'admin',
                actor_role: current_user.role || 'admin',
                action: 'CLEANUP_AUDIT_LOGS',
                resource: 'audit_logs',
                details: { retention_days: retentionDays, deleted_count: deletedCount }
            });
        }

        return {
            success: true,
            retention_days: retentionDays,
            deleted_count: deletedCount
        };
    }

    async getAuditLogs(filters = {}) {
        // Tự động dọn dẹp ngầm các log quá hạn (trừ log đã ghim hoặc nhân viên được bật keep_logs = 1)
        this.cleanupExpiredAuditLogs().catch(() => {});

        const isLegacyLimit = typeof filters === 'number' || typeof filters === 'string';
        const limit = Math.min(500, Math.max(10, isLegacyLimit ? (parseInt(filters, 10) || 150) : (parseInt(filters.limit, 10) || 200)));
        const page = Math.max(1, !isLegacyLimit ? (parseInt(filters.page, 10) || 1) : 1);
        const offset = (page - 1) * limit;
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

        params.push(limit, offset);

        const sql = `
            SELECT a.id, a.actor_id, a.actor_role, a.action, a.resource, a.details, a.ip_address,
                   a.created_at, COALESCE(a.is_pinned, 0) as is_pinned,
                   e.ho_ten, e.chuc_danh, COALESCE(e.keep_logs, 0) as keep_logs,
                   COALESCE(e.is_locked, 0) as is_locked, e.bound_device_id
            FROM audit_logs a
            LEFT JOIN employees e ON a.actor_id = e.ma_nv
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY a.is_pinned DESC, a.created_at DESC
            LIMIT ? OFFSET ?
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

    async getAlertsSummary(currentUser = null) {
        const { getVietnamDateString, getVietnamDateParts } = require('../utils/timeHelper');
        const notificationService = require('./notificationService');
        const todayStr = getVietnamDateString(new Date());
        const nowParts = getVietnamDateParts(new Date());

        if (currentUser) {
            await notificationService.syncSystemAlertsForUser(currentUser).catch(() => {});
        }
        const recipientKey = currentUser ? notificationService.resolveRecipientKey(currentUser) : 'ADMIN';

        const parseJsonDetails = (raw) => {
            if (!raw) return {};
            if (typeof raw === 'object') return raw;
            try {
                return JSON.parse(raw);
            } catch {
                return {};
            }
        };

        const [fraudRows, disputedRows, deviceRows, reqCountRows, reqItemRows, csRows, totalEmpRows, todayLogsRows, adminNotifRows, syncedNotifRows, pendingOtRows, payPeriodRows, lockRows] = await Promise.all([
            query(`
                SELECT a.id, a.actor_id, e.ho_ten, a.action, a.resource, a.details, a.created_at, COALESCE(e.is_locked, 0) as is_locked
                FROM audit_logs a
                LEFT JOIN employees e ON a.actor_id = e.ma_nv
                WHERE (a.action = 'CRITICAL_FRAUD' OR a.resource = 'attendance_security')
                  AND a.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                  AND (e.role IS NULL OR e.role != 'admin')
                ORDER BY a.created_at DESC
                LIMIT 15
            `).catch(() => []),
            query(`
                SELECT att.id, att.ma_nv, e.ho_ten, att.thang, att.nam, att.dispute_reason, att.confirmed_at
                FROM attendance att
                LEFT JOIN employees e ON att.ma_nv = e.ma_nv
                WHERE (att.dispute_status = 'OPEN' OR (att.dispute_status IS NULL AND att.salary_confirm_status = 'DISPUTED'))
                  AND (e.role IS NULL OR e.role != 'admin')
                ORDER BY att.nam DESC, att.thang DESC
                LIMIT 20
            `).catch(() => []),
            query(`
                SELECT ma_nv, ho_ten, pending_device_id, pending_device_name, device_change_reason,
                       known_devices_json, COALESCE(multi_device_alert, 0) as multi_device_alert
                FROM employees
                WHERE ((pending_device_id IS NOT NULL AND pending_device_id != '') OR COALESCE(multi_device_alert, 0) = 1)
                  AND (role IS NULL OR role != 'admin')
                ORDER BY COALESCE(multi_device_alert, 0) DESC, ma_nv ASC
                LIMIT 50
            `).catch(() => []),
            query(`
                SELECT COUNT(*) as cnt
                FROM requests r
                LEFT JOIN employees e ON r.employee_id = e.ma_nv
                WHERE r.status = 'pending' AND (e.role IS NULL OR e.role != 'admin')
            `).catch(() => [{ cnt: 0 }]),
            query(`
                SELECT r.id, r.employee_id as ma_nv, e.ho_ten, r.request_type,
                       DATE_FORMAT(r.request_date, '%Y-%m-%d') as request_date,
                       r.reason, r.created_at
                FROM requests r
                LEFT JOIN employees e ON r.employee_id = e.ma_nv
                WHERE r.status = 'pending' AND (e.role IS NULL OR e.role != 'admin')
                ORDER BY r.created_at DESC
                LIMIT 15
            `).catch(() => []),
            query('SELECT log_retention_days FROM company_settings LIMIT 1').catch(() => [{ log_retention_days: 30 }]),
            query("SELECT ma_nv, ho_ten, chuc_danh, COALESCE(NULLIF(department, ''), 'Khối Công trình') as department, COALESCE(shift_type, 'FULL_DAY') as shift_type FROM employees WHERE status != 'inactive' AND (role IS NULL OR role != 'admin') ORDER BY ma_nv ASC").catch(() => []),
            query("SELECT a.employee_id, a.status, a.late_minutes, a.check_in_time, a.check_out_time, a.work_location_type, a.location_name, a.field_note, COALESCE(a.shift_type, 'FULL_DAY') as shift_type, CASE WHEN a.check_in_image IS NOT NULL AND LENGTH(a.check_in_image) > 100 THEN 1 ELSE 0 END as has_photo FROM attendance_logs a INNER JOIN employees e ON a.employee_id = e.ma_nv WHERE a.record_date = ? AND (e.role IS NULL OR e.role != 'admin')", [todayStr]).catch(() => []),
            query(`
                SELECT id, type, title, message, ref_month, ref_year, target_ma_nv, is_read, read_at, created_at
                FROM user_notifications
                WHERE recipient_ma_nv = 'ADMIN' AND type = 'PERIOD_LOCKED_PAYROLL' AND is_read = 0
                ORDER BY created_at DESC, id DESC
                LIMIT 10
            `).catch(() => []),
            query(`
                SELECT id, alert_key, is_read, read_at
                FROM user_notifications
                WHERE recipient_ma_nv = ? AND alert_key IS NOT NULL
                ORDER BY id DESC
                LIMIT 120
            `, [recipientKey]).catch(() => []),
            query("SELECT COUNT(*) as cnt FROM ot_registrations WHERE status = 'pending'").catch(() => [{ cnt: 0 }]),
            query('SELECT month, year, status, payment_status FROM payroll_periods WHERE month = ? AND year = ? LIMIT 1', [nowParts.month, nowParts.year]).catch(() => []),
            query('SELECT is_locked FROM period_locks WHERE month = ? AND year = ? LIMIT 1', [nowParts.month, nowParts.year]).catch(() => [])
        ]);

        const notifByKey = {};
        for (const nr of syncedNotifRows || []) {
            if (nr && nr.alert_key) notifByKey[nr.alert_key] = nr;
        }
        const pendingOtCount = pendingOtRows && pendingOtRows[0] ? (Number(pendingOtRows[0].cnt) || 0) : 0;
        const payPeriod = payPeriodRows && payPeriodRows[0] ? payPeriodRows[0] : null;
        const periodLock = lockRows && lockRows[0] ? Boolean(lockRows[0].is_locked) : false;
        const unreadNotificationCount = (syncedNotifRows || []).filter((n) => Number(n.is_read) === 0).length
            + (recipientKey === 'ADMIN' ? (Array.isArray(adminNotifRows) ? adminNotifRows.length : 0) : 0);

        const empList = Array.isArray(totalEmpRows) ? totalEmpRows : [];
        const empMap = {};
        empList.forEach((e) => {
            empMap[e.ma_nv] = e;
        });

        let presentToday = 0;
        let lateToday = 0;
        let fieldWorkToday = 0;
        let leaveToday = 0;

        const presentList = [];
        const lateList = [];
        const fieldWorkList = [];
        const leaveList = [];
        const recordedIds = new Set();

        (todayLogsRows || []).forEach((l) => {
            recordedIds.add(l.employee_id);
            const empInfo = empMap[l.employee_id] || {};
            const baseItem = {
                ma_nv: l.employee_id,
                ho_ten: empInfo.ho_ten || l.employee_id,
                chuc_danh: empInfo.chuc_danh || '',
                department: empInfo.department || 'Khối Công trình',
                shift_type: l.shift_type || empInfo.shift_type || 'FULL_DAY',
                status: l.status,
                check_in_time: l.check_in_time || null,
                check_out_time: l.check_out_time || null,
                late_minutes: Number(l.late_minutes) || 0,
                work_location_type: l.work_location_type || 'OFFICE',
                location_name: l.location_name || '',
                field_note: l.field_note || '',
                has_photo: Boolean(l.has_photo)
            };

            if (l.status === 'P' || l.status === 'KP') {
                leaveToday++;
                leaveList.push(baseItem);
            } else if (l.status !== '0') {
                presentToday++;
                presentList.push(baseItem);
                const isLate = (Number(l.late_minutes) || 0) > 0 || (baseItem.shift_type === 'FULL_DAY' && l.late_minutes == null && l.check_in_time && l.check_in_time > '08:15:00');
                if (isLate) {
                    lateToday++;
                    lateList.push(baseItem);
                }
                if (l.work_location_type === 'FIELD_WORK') {
                    fieldWorkToday++;
                    fieldWorkList.push(baseItem);
                }
            }
        });

        const absentList = empList
            .filter((e) => !recordedIds.has(e.ma_nv))
            .map((e) => ({
                ma_nv: e.ma_nv,
                ho_ten: e.ho_ten || e.ma_nv,
                chuc_danh: e.chuc_danh || '',
                department: e.department || 'Khối Công trình',
                shift_type: e.shift_type || 'FULL_DAY',
                status: 'NOT_CHECKED_IN'
            }));

        const totalEmployees = empList.length;

        const fraudAlerts = fraudRows || [];
        const salaryDisputes = disputedRows || [];
        const deviceAlerts = Array.isArray(deviceRows) ? deviceRows : [];
        const pendingDevicesCount = deviceAlerts.length;
        const pendingRequestsCount = reqCountRows && reqCountRows[0] ? Number(reqCountRows[0].cnt) : 0;
        const pendingRequests = Array.isArray(reqItemRows) ? reqItemRows : [];
        const retentionDays = csRows && csRows[0] ? (Number(csRows[0].log_retention_days) || 30) : 30;

        const REQUEST_TYPE_LABELS = {
            leave: 'Xin nghỉ phép',
            late_early: 'Đi muộn / Về sớm',
            supplement: 'Bổ sung công',
            ot: 'Đăng ký tăng ca'
        };

        const actionableAlerts = [];
        fraudAlerts.forEach((f) => {
            const parsed = parseJsonDetails(f.details);
            const reasonText = parsed.reason || parsed.fraud_reason || parsed.fraud_type || 'Cảnh báo bất thường khi chấm công';
            const synced = notifByKey[`fraud:${f.id}`];
            actionableAlerts.push({
                id: `fraud_${f.id}`,
                notification_id: synced ? synced.id : null,
                is_read: synced ? Number(synced.is_read) : 0,
                read_at: synced ? synced.read_at : null,
                category: 'fraud',
                severity: 'critical',
                title: `Cảnh báo an ninh: ${f.ho_ten || f.actor_id} (${f.actor_id})`,
                description: reasonText,
                created_at: f.created_at || null,
                target_tab: 'management',
                target_subtab: 'audit_logs',
                target_ma_nv: f.actor_id,
                target_id: f.id,
                month: null,
                year: null
            });
        });

        deviceAlerts.forEach((d) => {
            const isMulti = Number(d.multi_device_alert) === 1;
            const hasPending = Boolean(d.pending_device_id);
            const deviceDesc = isMulti && hasPending
                ? `Phát hiện đăng nhập nhiều máy & chờ duyệt đổi sang ${d.pending_device_name || 'thiết bị mới'}`
                : isMulti
                    ? 'Phát hiện đăng nhập nhiều máy khác nhau — cần khóa cố định 1 máy'
                    : `Yêu cầu đổi sang ${d.pending_device_name || 'thiết bị mới'}: ${d.device_change_reason || 'Cập nhật thiết bị'}`;
            const synced = notifByKey[`device:${d.ma_nv}`];
            actionableAlerts.push({
                id: `device_${d.ma_nv}`,
                notification_id: synced ? synced.id : null,
                is_read: synced ? Number(synced.is_read) : 0,
                read_at: synced ? synced.read_at : null,
                category: 'device',
                severity: 'high',
                title: `${isMulti ? 'Cảnh báo thiết bị' : 'Duyệt đổi thiết bị'}: ${d.ho_ten || d.ma_nv} (${d.ma_nv})`,
                description: deviceDesc,
                created_at: null,
                target_tab: 'management',
                target_subtab: 'employees',
                target_ma_nv: d.ma_nv,
                target_id: d.ma_nv,
                month: null,
                year: null
            });
        });

        salaryDisputes.forEach((s) => {
            const synced = notifByKey[`dispute:${s.id}`];
            actionableAlerts.push({
                id: `dispute_${s.id}`,
                notification_id: synced ? synced.id : null,
                is_read: synced ? Number(synced.is_read) : 0,
                read_at: synced ? synced.read_at : null,
                category: 'salary_dispute',
                severity: 'high',
                title: `Khiếu nại lương T${s.thang}/${s.nam}: ${s.ho_ten || s.ma_nv} (${s.ma_nv})`,
                description: s.dispute_reason || 'Nhân viên báo sai số liệu bảng lương',
                created_at: s.confirmed_at || null,
                target_tab: 'management',
                target_subtab: 'payroll',
                target_ma_nv: s.ma_nv,
                target_id: s.id,
                month: s.thang,
                year: s.nam
            });
        });

        pendingRequests.forEach((r) => {
            const rawType = String(r.request_type || '').trim();
            const typeLabel = REQUEST_TYPE_LABELS[rawType.toLowerCase()] || rawType || 'Đơn từ nhân sự';
            const synced = notifByKey[`request:${r.id}`];
            actionableAlerts.push({
                id: `request_${r.id}`,
                notification_id: synced ? synced.id : null,
                is_read: synced ? Number(synced.is_read) : 0,
                read_at: synced ? synced.read_at : null,
                category: 'pending_request',
                severity: 'medium',
                title: `${typeLabel}: ${r.ho_ten || r.ma_nv} (${r.ma_nv})`,
                description: r.reason ? String(r.reason).slice(0, 120) : `Ngày đề nghị: ${r.request_date || ''}`.trim(),
                created_at: r.created_at || null,
                target_tab: 'requests',
                target_subtab: null,
                target_ma_nv: r.ma_nv,
                target_id: r.id,
                month: null,
                year: null
            });
        });

        const adminNotifs = Array.isArray(adminNotifRows) ? adminNotifRows : [];
        adminNotifs.forEach((n) => {
            actionableAlerts.push({
                id: `notif_${n.id}`,
                notification_id: n.id,
                is_read: Number(n.is_read || 0),
                read_at: n.read_at || null,
                category: 'period_locked',
                severity: 'info',
                title: n.title,
                description: n.message,
                created_at: n.created_at || null,
                target_tab: 'management',
                target_subtab: 'payroll',
                target_ma_nv: n.target_ma_nv || null,
                target_id: n.id,
                month: n.ref_month || null,
                year: n.ref_year || null
            });
        });

        let mediaQuotaAlert = null;
        if (!currentUser || currentUser.role === 'admin') {
            try {
                const cloudinaryUsageMonitor = require('./cloudinaryUsageMonitor');
                const quotaEval = await cloudinaryUsageMonitor.getBudgetEvaluation();
                if (quotaEval && quotaEval.budget_bytes !== null &&
                    ['CRITICAL', 'RESTRICTED', 'EXHAUSTED'].includes(quotaEval.threshold_state)) {
                    mediaQuotaAlert = {
                        threshold_state: quotaEval.threshold_state,
                        current_percent: quotaEval.current_percent,
                        effective_used_bytes: quotaEval.effective_used_bytes,
                        budget_bytes: quotaEval.budget_bytes
                    };
                    actionableAlerts.unshift({
                        id: `media_quota_${quotaEval.threshold_state}`,
                        notification_id: null,
                        is_read: 0,
                        read_at: null,
                        category: 'media_storage',
                        severity: 'critical',
                        title: `Cảnh báo dung lượng Cloudinary đạt ${quotaEval.current_percent}%`,
                        description: quotaEval.threshold_state === 'EXHAUSTED'
                            ? 'Kho lưu trữ media đã chạm ngưỡng 100%, tạm ngừng tiếp nhận tệp mới.'
                            : quotaEval.threshold_state === 'RESTRICTED'
                                ? 'Đã vượt 95% hạn mức — tạm hạn chế ảnh đại diện & tệp không thiết yếu.'
                                : 'Dung lượng lưu trữ đã vượt ngưỡng cảnh báo nghiêm trọng (>= 85%). Vui lòng kiểm tra mục Quản lý Media.',
                        created_at: new Date().toISOString(),
                        target_tab: 'settings',
                        target_subtab: 'media_storage',
                        target_ma_nv: null,
                        target_id: 'media_storage',
                        month: null,
                        year: null
                    });
                }
            } catch {}
        }

        const totalRedAlerts = fraudAlerts.length + salaryDisputes.length + pendingDevicesCount + (mediaQuotaAlert ? 1 : 0);

        return {
            fraud_count: fraudAlerts.length,
            fraud_alerts: fraudAlerts,
            disputed_salary_count: salaryDisputes.length,
            salary_disputes: salaryDisputes,
            pending_device_count: pendingDevicesCount,
            pending_device_alerts: deviceAlerts,
            media_quota_alert: mediaQuotaAlert,
            pending_requests_count: pendingRequestsCount,
            pending_ot_count: pendingOtCount,
            pending_requests: pendingRequests,
            admin_notifications: adminNotifs,
            unread_notification_count: unreadNotificationCount,
            current_payroll_period: {
                month: nowParts.month,
                year: nowParts.year,
                status: payPeriod?.status || 'DRAFT',
                payment_status: payPeriod?.payment_status || 'UNPAID',
                is_locked: periodLock
            },
            last_updated_at: new Date().toISOString(),
            total_red_alerts: totalRedAlerts,
            total_actionable_count: totalRedAlerts + pendingRequestsCount,
            actionable_alerts: actionableAlerts.slice(0, 30),
            log_retention_days: retentionDays,
            headcount_today: {
                date: todayStr,
                total_employees: totalEmployees,
                present: presentToday,
                late: lateToday,
                field_work: fieldWorkToday,
                leave: leaveToday,
                absent: Math.max(0, totalEmployees - presentToday - leaveToday),
                live_board: {
                    date: todayStr,
                    present_list: presentList,
                    late_list: lateList,
                    field_work_list: fieldWorkList,
                    leave_list: leaveList,
                    absent_list: absentList
                }
            }
        };
    }
}

module.exports = new PermissionService();
module.exports.ENFORCED_ACCOUNTANT_KEYS = ENFORCED_ACCOUNTANT_KEYS;
