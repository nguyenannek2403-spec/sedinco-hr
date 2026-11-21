const { query } = require('../config/db');
const { getAccountantPermissions } = require('../middlewares/authMiddleware');

const REQUEST_TYPE_LABELS = {
    leave: 'Xin nghỉ phép',
    p: 'Xin nghỉ phép',
    kp: 'Xin nghỉ không lương',
    late_early: 'Đi muộn / Về sớm',
    supplement: 'Bổ sung công',
    bs: 'Bổ sung công',
    ot: 'Đăng ký tăng ca',
    advance: 'Đề nghị tạm ứng',
    tam_ung: 'Đề nghị tạm ứng'
};

function parseJsonDetails(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

class NotificationService {
    resolveRecipientKey(user) {
        if (!user) {
            const err = new Error('Yêu cầu đăng nhập để xem thông báo!');
            err.statusCode = 401;
            throw err;
        }
        if (String(user.role || '').toLowerCase() === 'admin') {
            return 'ADMIN';
        }
        const maNv = String(user.ma_nv || '').trim();
        if (!maNv) {
            const err = new Error('Không xác định được mã nhân viên nhận thông báo!');
            err.statusCode = 401;
            throw err;
        }
        return maNv;
    }

    async broadcastPeriodLockNotifications({ month, year, lockedBy = 'admin' } = {}) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2000 || y > 2200) {
            return { notified_employees: 0, notified_admin: false };
        }

        const activeEmployees = await query(
            "SELECT ma_nv, COALESCE(role, 'worker') as role FROM employees WHERE (status IS NULL OR status != 'inactive') AND (role IS NULL OR role != 'admin') ORDER BY ma_nv ASC"
        ).catch(() => []);
        const empList = Array.isArray(activeEmployees) ? activeEmployees : [];

        const workerTitle = `📢 Đã chốt kỳ công & Bảng lương Tháng ${m}/${y}`;
        const workerMsg = `Kỳ công và phiếu lương Tháng ${m}/${y} của bạn đã được chốt minh bạch. Bấm để xem chi tiết từng ngày công và bảng lương.`;
        const adminTitle = `✅ Đã chốt kỳ công Tháng ${m}/${y}`;
        const adminMsg = `Đã khóa sổ kỳ công Tháng ${m}/${y}${lockedBy ? ` (${lockedBy})` : ''} và gửi thông báo bảng công, bảng lương tới toàn bộ ${empList.length} nhân viên.`;

        const rows = empList.map((e) => [
            e.ma_nv,
            null,
            'PERIOD_LOCKED_PAYROLL',
            'period_locked',
            'info',
            workerTitle,
            workerMsg,
            m,
            y,
            e.ma_nv,
            'payroll',
            null,
            `${m}_${y}`,
            0
        ]);
        rows.push([
            'ADMIN',
            null,
            'PERIOD_LOCKED_PAYROLL',
            'period_locked',
            'info',
            adminTitle,
            adminMsg,
            m,
            y,
            null,
            'management',
            'payroll',
            `${m}_${y}`,
            0
        ]);

        if (rows.length > 0) {
            const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
            const params = rows.flat();
            await query(
                `INSERT INTO user_notifications
                 (recipient_ma_nv, alert_key, type, category, severity, title, message, ref_month, ref_year, target_ma_nv, target_tab, target_subtab, target_id, is_read)
                 VALUES ${placeholders}`,
                params
            );
        }

        return {
            notified_employees: empList.length,
            notified_admin: true
        };
    }

    /**
     * V29: Đồng bộ cảnh báo hệ thống (Gian lận GPS, Đa thiết bị, Khiếu nại lương, Đơn chờ duyệt)
     * thành bản ghi bền vững trong user_notifications theo (recipient_ma_nv, alert_key).
     * TUYỆT ĐỐI KHÔNG ghi đè is_read / read_at khi đã tồn tại để giữ nguyên trạng thái Đã đọc.
     */
    async syncSystemAlertsForUser(user) {
        if (!user) return { synced: 0 };
        const role = String(user.role || '').toLowerCase();
        if (role !== 'admin' && role !== 'accountant') {
            return { synced: 0 };
        }
        const recipient = this.resolveRecipientKey(user);

        let perms = {};
        if (role === 'accountant') {
            perms = await getAccountantPermissions().catch(() => ({}));
        }

        const allowDispute = role === 'admin' || perms.payroll_view_all !== false;
        const allowRequest = role === 'admin' || perms.leave_view_all !== false;

        const [fraudRows, deviceRows, disputedRows, reqRows] = await Promise.all([
            role === 'admin'
                ? query(`
                    SELECT a.id, a.actor_id, e.ho_ten, a.details
                    FROM audit_logs a
                    LEFT JOIN employees e ON a.actor_id = e.ma_nv
                    WHERE (a.action = 'CRITICAL_FRAUD' OR a.resource = 'attendance_security')
                      AND a.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                      AND (e.role IS NULL OR e.role != 'admin')
                    ORDER BY a.created_at DESC
                    LIMIT 15
                `).catch(() => [])
                : Promise.resolve([]),
            role === 'admin'
                ? query(`
                    SELECT ma_nv, ho_ten, pending_device_id, pending_device_name, device_change_reason,
                           COALESCE(multi_device_alert, 0) as multi_device_alert
                    FROM employees
                    WHERE ((pending_device_id IS NOT NULL AND pending_device_id != '') OR COALESCE(multi_device_alert, 0) = 1)
                      AND (role IS NULL OR role != 'admin')
                    ORDER BY COALESCE(multi_device_alert, 0) DESC, ma_nv ASC
                    LIMIT 50
                `).catch(() => [])
                : Promise.resolve([]),
            allowDispute
                ? query(`
                    SELECT att.id, att.ma_nv, e.ho_ten, att.thang, att.nam, att.dispute_reason
                    FROM attendance att
                    LEFT JOIN employees e ON att.ma_nv = e.ma_nv
                    WHERE (att.dispute_status = 'OPEN' OR (att.dispute_status IS NULL AND att.salary_confirm_status = 'DISPUTED'))
                      AND (e.role IS NULL OR e.role != 'admin')
                    ORDER BY att.nam DESC, att.thang DESC
                    LIMIT 20
                `).catch(() => [])
                : Promise.resolve([]),
            allowRequest
                ? query(`
                    SELECT r.id, r.employee_id as ma_nv, e.ho_ten, r.request_type,
                           DATE_FORMAT(r.request_date, '%Y-%m-%d') as request_date, r.reason
                    FROM requests r
                    LEFT JOIN employees e ON r.employee_id = e.ma_nv
                    WHERE r.status = 'pending' AND (e.role IS NULL OR e.role != 'admin')
                    ORDER BY r.created_at DESC
                    LIMIT 15
                `).catch(() => [])
                : Promise.resolve([])
        ]);

        const upsertRows = [];

        for (const f of fraudRows || []) {
            const parsed = parseJsonDetails(f.details);
            const reasonText = parsed.reason || parsed.fraud_reason || parsed.fraud_type || 'Cảnh báo bất thường khi chấm công';
            upsertRows.push([
                recipient,
                `fraud:${f.id}`,
                'SYSTEM_ALERT_FRAUD',
                'fraud',
                'critical',
                `Cảnh báo an ninh: ${f.ho_ten || f.actor_id} (${f.actor_id})`,
                String(reasonText).slice(0, 500),
                null,
                null,
                f.actor_id,
                'management',
                'audit_logs',
                String(f.id),
                0
            ]);
        }

        for (const d of deviceRows || []) {
            const isMulti = Number(d.multi_device_alert) === 1;
            const hasPending = Boolean(d.pending_device_id);
            const deviceDesc = isMulti && hasPending
                ? `Phát hiện đăng nhập nhiều máy & chờ duyệt đổi sang ${d.pending_device_name || 'thiết bị mới'}`
                : isMulti
                    ? 'Phát hiện đăng nhập nhiều máy khác nhau — cần khóa cố định 1 máy'
                    : `Yêu cầu đổi sang ${d.pending_device_name || 'thiết bị mới'}: ${d.device_change_reason || 'Cập nhật thiết bị'}`;
            upsertRows.push([
                recipient,
                `device:${d.ma_nv}`,
                'SYSTEM_ALERT_DEVICE',
                'device',
                'high',
                `${isMulti ? 'Cảnh báo thiết bị' : 'Duyệt đổi thiết bị'}: ${d.ho_ten || d.ma_nv} (${d.ma_nv})`,
                deviceDesc.slice(0, 500),
                null,
                null,
                d.ma_nv,
                'management',
                'employees',
                String(d.ma_nv),
                0
            ]);
        }

        for (const s of disputedRows || []) {
            upsertRows.push([
                recipient,
                `dispute:${s.id}`,
                'SYSTEM_ALERT_DISPUTE',
                'salary_dispute',
                'high',
                `Khiếu nại lương T${s.thang}/${s.nam}: ${s.ho_ten || s.ma_nv} (${s.ma_nv})`,
                String(s.dispute_reason || 'Nhân viên báo sai số liệu bảng lương').slice(0, 500),
                s.thang || null,
                s.nam || null,
                s.ma_nv,
                role === 'admin' ? 'management' : 'payroll',
                role === 'admin' ? 'payroll' : null,
                String(s.id),
                0
            ]);
        }

        for (const r of reqRows || []) {
            const rawType = String(r.request_type || '').trim();
            const typeLabel = REQUEST_TYPE_LABELS[rawType.toLowerCase()] || rawType || 'Đơn từ nhân sự';
            upsertRows.push([
                recipient,
                `request:${r.id}`,
                'SYSTEM_ALERT_REQUEST',
                'pending_request',
                'medium',
                `${typeLabel}: ${r.ho_ten || r.ma_nv} (${r.ma_nv})`,
                r.reason ? String(r.reason).slice(0, 200) : `Ngày đề nghị: ${r.request_date || ''}`.trim(),
                null,
                null,
                r.ma_nv,
                'requests',
                null,
                String(r.id),
                0
            ]);
        }

        if (upsertRows.length > 0) {
            const placeholders = upsertRows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
            await query(
                `INSERT INTO user_notifications
                 (recipient_ma_nv, alert_key, type, category, severity, title, message, ref_month, ref_year, target_ma_nv, target_tab, target_subtab, target_id, is_read)
                 VALUES ${placeholders}
                 ON DUPLICATE KEY UPDATE
                    title = VALUES(title),
                    message = VALUES(message),
                    category = VALUES(category),
                    severity = VALUES(severity),
                    ref_month = VALUES(ref_month),
                    ref_year = VALUES(ref_year),
                    target_ma_nv = VALUES(target_ma_nv),
                    target_tab = VALUES(target_tab),
                    target_subtab = VALUES(target_subtab),
                    target_id = VALUES(target_id)`,
                upsertRows.flat()
            );
        }

        return { synced: upsertRows.length };
    }

    async getMyNotifications(user, { limit = 20, offset = 0, filter = 'all', sync = true } = {}) {
        const recipient = this.resolveRecipientKey(user);
        const role = String(user.role || '').toLowerCase();
        if (sync !== false && (role === 'admin' || role === 'accountant')) {
            await this.syncSystemAlertsForUser(user).catch(() => {});
        }

        const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
        const rawFilter = String(filter || 'all').trim().toLowerCase();
        const normalizedFilter = rawFilter === 'unread' || rawFilter === 'read' ? rawFilter : 'all';

        const whereParts = ['recipient_ma_nv = ?'];
        const whereParams = [recipient];
        if (normalizedFilter === 'unread') {
            whereParts.push('is_read = 0');
        } else if (normalizedFilter === 'read') {
            whereParts.push('is_read = 1');
        }
        const whereSql = whereParts.join(' AND ');

        const [rows, filteredCountRows, aggRows] = await Promise.all([
            query(
                `SELECT id, recipient_ma_nv, alert_key, type, category, severity, title, message,
                        ref_month, ref_year, target_ma_nv, target_tab, target_subtab, target_id,
                        is_read, read_at, created_at
                 FROM user_notifications
                 WHERE ${whereSql}
                 ORDER BY is_read ASC, created_at DESC, id DESC
                 LIMIT ? OFFSET ?`,
                [...whereParams, safeLimit, safeOffset]
            ),
            query(`SELECT COUNT(*) as cnt FROM user_notifications WHERE ${whereSql}`, whereParams),
            query(
                `SELECT COUNT(*) as total_cnt,
                        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_cnt,
                        SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END) as read_cnt
                 FROM user_notifications
                 WHERE recipient_ma_nv = ?`,
                [recipient]
            )
        ]);

        const notifications = (rows || []).map((r) => ({
            ...r,
            is_read: Number(r.is_read) === 1 ? 1 : 0,
            category: r.category || (r.type === 'PERIOD_LOCKED_PAYROLL' ? 'period_locked' : 'general'),
            severity: r.severity || 'info'
        }));

        const agg = aggRows && aggRows[0] ? aggRows[0] : {};
        const total_count = Number(agg.total_cnt) || 0;
        const unread_count = Number(agg.unread_cnt) || 0;
        const read_count = Number(agg.read_cnt) || 0;
        const filtered_total = filteredCountRows && filteredCountRows[0] ? Number(filteredCountRows[0].cnt) || 0 : 0;
        const has_more = safeOffset + notifications.length < filtered_total;

        return {
            notifications,
            unread_count,
            read_count,
            total_count,
            filtered_total,
            has_more,
            limit: safeLimit,
            offset: safeOffset,
            filter: normalizedFilter
        };
    }

    async markAsRead(notificationId, user) {
        const recipient = this.resolveRecipientKey(user);
        const idNum = parseInt(notificationId, 10);
        if (!Number.isInteger(idNum) || idNum <= 0) {
            const err = new Error('Mã thông báo không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }

        const existing = await query(
            'SELECT id, recipient_ma_nv FROM user_notifications WHERE id = ? AND recipient_ma_nv = ? LIMIT 1',
            [idNum, recipient]
        );
        if (!existing || existing.length === 0) {
            const err = new Error('Không tìm thấy thông báo hoặc bạn không có quyền truy cập!');
            err.statusCode = 404;
            throw err;
        }

        await query(
            'UPDATE user_notifications SET is_read = 1, read_at = COALESCE(read_at, NOW()) WHERE id = ? AND recipient_ma_nv = ?',
            [idNum, recipient]
        );

        const [updatedRows, countRows] = await Promise.all([
            query('SELECT id, is_read, read_at FROM user_notifications WHERE id = ? LIMIT 1', [idNum]),
            query('SELECT COUNT(*) as cnt FROM user_notifications WHERE recipient_ma_nv = ? AND is_read = 0', [recipient])
        ]);

        const unread_count = countRows && countRows[0] ? Number(countRows[0].cnt) || 0 : 0;
        const updated = updatedRows && updatedRows[0] ? updatedRows[0] : {};

        return {
            id: idNum,
            is_read: 1,
            read_at: updated.read_at || new Date().toISOString(),
            unread_count
        };
    }

    async markAllAsRead(user) {
        const recipient = this.resolveRecipientKey(user);
        const role = String(user.role || '').toLowerCase();
        if (role === 'admin' || role === 'accountant') {
            await this.syncSystemAlertsForUser(user).catch(() => {});
        }
        const res = await query(
            'UPDATE user_notifications SET is_read = 1, read_at = COALESCE(read_at, NOW()) WHERE recipient_ma_nv = ? AND is_read = 0',
            [recipient]
        );
        return {
            updated_count: res && res.affectedRows ? res.affectedRows : 0,
            unread_count: 0
        };
    }
}

module.exports = new NotificationService();
