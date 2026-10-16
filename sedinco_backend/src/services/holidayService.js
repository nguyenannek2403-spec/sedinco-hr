const { query } = require('../config/db');

class HolidayService {
    async getAllHolidays() {
        const results = await query('SELECT * FROM public_holidays ORDER BY start_date ASC');
        return results || [];
    }

    async createHoliday(holiday_name, start_date, end_date) {
        await query(
            'INSERT INTO public_holidays (holiday_name, start_date, end_date) VALUES (?, ?, ?)',
            [holiday_name, start_date, end_date]
        );
        return { success: true };
    }

    async deleteHoliday(id) {
        await query('DELETE FROM public_holidays WHERE id = ?', [id]);
        return { success: true };
    }
}

module.exports = new HolidayService();
