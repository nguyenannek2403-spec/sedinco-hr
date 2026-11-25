const { query } = require('../config/db');
const { logAuditEvent } = require('../middlewares/authMiddleware');

function parseHolidayMultiplier(raw, fallback = 3.0) {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return fallback;
    }
    const normalized = String(raw).trim().replace(',', '.');
    const num = Number(normalized);
    if (!Number.isFinite(num) || num < 1.0 || num > 10.0) {
        const err = new Error('Hệ số lương ngày lễ phải nằm trong khoảng từ 1,0 đến 10,0!');
        err.statusCode = 400;
        throw err;
    }
    return Math.round(num * 100) / 100;
}

class HolidayService {
    async getAllHolidays() {
        const results = await query(
            "SELECT id, holiday_name, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date, COALESCE(salary_multiplier, 3.00) as salary_multiplier FROM public_holidays ORDER BY start_date ASC"
        );
        return (results || []).map((row) => {
            const mult = Number(row.salary_multiplier) || 3.0;
            return {
                ...row,
                salary_multiplier: mult,
                multiplier: mult
            };
        });
    }

    async createHoliday(holiday_name, start_date, end_date, salary_multiplier, current_user = null) {
        const cleanName = String(holiday_name || '').trim();
        const s = String(start_date || '').trim().slice(0, 10);
        const e = String(end_date || start_date || '').trim().slice(0, 10);
        if (!cleanName || !/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || s > e) {
            const err = new Error('Tên ngày lễ và khoảng ngày (YYYY-MM-DD) không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }
        const mult = parseHolidayMultiplier(salary_multiplier, 3.0);
        const res = await query(
            'INSERT INTO public_holidays (holiday_name, start_date, end_date, salary_multiplier) VALUES (?, ?, ?, ?)',
            [cleanName, s, e, mult]
        );
        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'CREATE_HOLIDAY',
            resource: 'public_holidays',
            details: { id: res?.insertId || null, holiday_name: cleanName, start_date: s, end_date: e, salary_multiplier: mult }
        });
        return { success: true, id: res?.insertId || null, salary_multiplier: mult };
    }

    async updateHoliday(id, holiday_name, start_date, end_date, salary_multiplier, current_user = null) {
        const cleanId = Number(id);
        const cleanName = String(holiday_name || '').trim();
        const s = String(start_date || '').trim().slice(0, 10);
        const e = String(end_date || start_date || '').trim().slice(0, 10);
        if (!cleanId || !cleanName || !/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || s > e) {
            const err = new Error('Dữ liệu cập nhật ngày lễ không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }
        const existing = await query(
            'SELECT id, COALESCE(salary_multiplier, 3.00) as salary_multiplier FROM public_holidays WHERE id = ? LIMIT 1',
            [cleanId]
        );
        if (!existing || existing.length === 0) {
            const err = new Error('Không tìm thấy ngày lễ cần cập nhật!');
            err.statusCode = 404;
            throw err;
        }
        const existingMult = Number(existing[0].salary_multiplier) || 3.0;
        const mult = salary_multiplier !== undefined
            ? parseHolidayMultiplier(salary_multiplier, existingMult)
            : existingMult;

        await query(
            'UPDATE public_holidays SET holiday_name = ?, start_date = ?, end_date = ?, salary_multiplier = ? WHERE id = ?',
            [cleanName, s, e, mult, cleanId]
        );
        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'UPDATE_HOLIDAY',
            resource: 'public_holidays',
            details: { id: cleanId, holiday_name: cleanName, start_date: s, end_date: e, salary_multiplier: mult }
        });
        return { success: true, salary_multiplier: mult };
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
