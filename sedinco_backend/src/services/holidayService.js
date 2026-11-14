const { query } = require('../config/db');
const { logAuditEvent } = require('../middlewares/authMiddleware');

class HolidayService {
    async getAllHolidays() {
        const results = await query('SELECT * FROM public_holidays ORDER BY start_date ASC');
        return results || [];
    }

    async createHoliday(holiday_name, start_date, end_date, current_user = null) {
        const res = await query(
            'INSERT INTO public_holidays (holiday_name, start_date, end_date) VALUES (?, ?, ?)',
            [holiday_name, start_date, end_date]
        );
        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'CREATE_HOLIDAY',
            resource: 'public_holidays',
            details: { id: res?.insertId || null, holiday_name, start_date, end_date }
        });
        return { success: true };
    }

    async deleteHoliday(id, current_user = null) {
        const existing = await query('SELECT holiday_name, start_date, end_date FROM public_holidays WHERE id = ?', [id]).catch(() => []);
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
