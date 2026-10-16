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
            const { holiday_name, start_date, end_date } = req.body;
            await holidayService.createHoliday(holiday_name, start_date, end_date);
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }

    async deleteHoliday(req, res, next) {
        try {
            await holidayService.deleteHoliday(req.params.id);
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new HolidayController();
