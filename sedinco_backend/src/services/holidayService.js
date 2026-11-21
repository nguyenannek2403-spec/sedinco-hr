const { query } = require('../config/db');
const { logAuditEvent } = require('../middlewares/authMiddleware');

class HolidayService {
    async getAllHolidays() {
        const results = await query(
            "SELECT id, holiday_name, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date FROM public_holidays ORDER BY start_date ASC"
        );
        return results || [];
    }

    async createHoliday(holiday_name, start_date, end_date, current_user = null) {
        const cleanName = String(holiday_name || '').trim();
        const s = String(start_date || '').trim().slice(0, 10);
        const e = String(end_date || start_date || '').trim().slice(0, 10);
        if (!cleanName || !/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) {
            const err = new Error('Tên ngày lễ và khoảng ngày (YYYY-MM-DD) không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }
        const res = await query(
            'INSERT INTO public_holidays (holiday_name, start_date, end_date) VALUES (?, ?, ?)',
            [cleanName, s, e]
        );
        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'CREATE_HOLIDAY',
            resource: 'public_holidays',
            details: { id: res?.insertId || null, holiday_name: cleanName, start_date: s, end_date: e }
        });
        return { success: true, id: res?.insertId || null };
    }

    async updateHoliday(id, holiday_name, start_date, end_date, current_user = null) {
        const cleanId = Number(id);
        const cleanName = String(holiday_name || '').trim();
        const s = String(start_date || '').trim().slice(0, 10);
        const e = String(end_date || start_date || '').trim().slice(0, 10);
        if (!cleanId || !cleanName || !/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) {
            const err = new Error('Dữ liệu cập nhật ngày lễ không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }
        await query(
            'UPDATE public_holidays SET holiday_name = ?, start_date = ?, end_date = ? WHERE id = ?',
            [cleanName, s, e, cleanId]
        );
        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'UPDATE_HOLIDAY',
            resource: 'public_holidays',
            details: { id: cleanId, holiday_name: cleanName, start_date: s, end_date: e }
        });
        return { success: true };
    }

    async deleteHoliday(id, current_user = null) {
        const existing = await query("SELECT holiday_name, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date FROM public_holidays WHERE id = ?", [id]).catch(() => []);
        await query('DELETE FROM public_holidays WHERE id = ?', [id]);
        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'DELETE_HOLIDAY',
            resource: 'public_holidays',
            details: { id: Number(id), holiday: existing[0] || null }
        });
        return { success: true };
    }
}

module.exports = new HolidayService();
