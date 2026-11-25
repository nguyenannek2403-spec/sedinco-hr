const holidayService = require('../services/holidayService');

class HolidayController {
    async getHolidays(req, res, next) {
        try {
            const data = await holidayService.getAllHolidays();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async createHoliday(req, res, next) {
        try {
            const { holiday_name, name, start_date, end_date, salary_multiplier, multiplier } = req.body;
            const rawMult = salary_multiplier !== undefined ? salary_multiplier : multiplier;
            const result = await holidayService.createHoliday(holiday_name || name, start_date, end_date, rawMult, req.user);
            return res.status(201).json({
                success: true,
                id: result?.id || null,
                salary_multiplier: result?.salary_multiplier ?? 3.0
            });
        } catch (err) {
            next(err);
        }
    }

    async updateHoliday(req, res, next) {
        try {
            const { holiday_name, name, start_date, end_date, salary_multiplier, multiplier } = req.body;
            const rawMult = salary_multiplier !== undefined ? salary_multiplier : multiplier;
            const result = await holidayService.updateHoliday(req.params.id, holiday_name || name, start_date, end_date, rawMult, req.user);
            return res.json({
                success: true,
                salary_multiplier: result?.salary_multiplier ?? 3.0
            });
        } catch (err) {
            next(err);
        }
    }

    async deleteHoliday(req, res, next) {
        try {
            await holidayService.deleteHoliday(req.params.id, req.user);
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new HolidayController();
