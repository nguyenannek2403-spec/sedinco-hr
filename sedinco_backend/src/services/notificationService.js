const { query } = require('../config/db');

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
            "SELECT ma_nv FROM employees WHERE (status IS NULL OR status != 'inactive') AND (role IS NULL OR role != 'admin') ORDER BY ma_nv ASC"
        ).catch(() => []);
        const empList = Array.isArray(activeEmployees) ? activeEmployees : [];

        const workerTitle = `📢 Đã chốt kỳ công & Bảng lương Tháng ${m}/${y}`;
        const workerMsg = `Kỳ công và phiếu lương Tháng ${m}/${y} của bạn đã được chốt minh bạch. Bấm để xem chi tiết từng ngày công và bảng lương.`;
        const adminTitle = `✅ Đã chốt kỳ công Tháng ${m}/${y}`;
        const adminMsg = `Đã khóa sổ kỳ công Tháng ${m}/${y}${lockedBy ? ` (${lockedBy})` : ''} và gửi thông báo bảng công, bảng lương tới toàn bộ ${empList.length} nhân viên.`;

        const rows = empList.map((e) => [
            e.ma_nv,
            'PERIOD_LOCKED_PAYROLL',
            workerTitle,
            workerMsg,
            m,
            y,
            e.ma_nv,
            0
        ]);
        rows.push([
            'ADMIN',
            'PERIOD_LOCKED_PAYROLL',
            adminTitle,
            adminMsg,
            m,
            y,
            null,
            0
        ]);

        if (rows.length > 0) {
            const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
            const params = rows.flat();
            await query(
                `INSERT INTO user_notifications (recipient_ma_nv, type, title, message, ref_month, ref_year, target_ma_nv, is_read)
                 VALUES ${placeholders}`,
                params
            );
        }

        return {
            notified_employees: empList.length,
            notified_admin: true
        };
    }

    async getMyNotifications(user, { limit = 50 } = {}) {
        const recipient = this.resolveRecipientKey(user);
        const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

        const [rows, countRows] = await Promise.all([
            query(
                `SELECT id, recipient_ma_nv, type, title, message, ref_month, ref_year, target_ma_nv, is_read, created_at
                 FROM user_notifications
                 WHERE recipient_ma_nv = ?
                 ORDER BY created_at DESC, id DESC
                 LIMIT ?`,
                [recipient, safeLimit]
            ),
            query(
                'SELECT COUNT(*) as cnt FROM user_notifications WHERE recipient_ma_nv = ? AND is_read = 0',
                [recipient]
            )
        ]);

        const notifications = (rows || []).map((r) => ({
            ...r,
            is_read: Number(r.is_read) === 1 ? 1 : 0
        }));
        const unread_count = countRows && countRows[0] ? Number(countRows[0].cnt) || 0 : 0;

        return {
            notifications,
            unread_count
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
            'UPDATE user_notifications SET is_read = 1 WHERE id = ? AND recipient_ma_nv = ?',
            [idNum, recipient]
        );

        const countRows = await query(
            'SELECT COUNT(*) as cnt FROM user_notifications WHERE recipient_ma_nv = ? AND is_read = 0',
            [recipient]
        );
        const unread_count = countRows && countRows[0] ? Number(countRows[0].cnt) || 0 : 0;

        return {
            id: idNum,
            is_read: 1,
            unread_count
        };
    }

    async markAllAsRead(user) {
        const recipient = this.resolveRecipientKey(user);
        const res = await query(
            'UPDATE user_notifications SET is_read = 1 WHERE recipient_ma_nv = ? AND is_read = 0',
            [recipient]
        );
        return {
            updated_count: res && res.affectedRows ? res.affectedRows : 0,
            unread_count: 0
        };
    }
}

module.exports = new NotificationService();
