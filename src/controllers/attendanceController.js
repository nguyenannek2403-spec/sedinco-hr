const attendanceService = require('../services/attendanceService');

class AttendanceController {
    async getAttendance(req, res, next) {
        try {
            const { month, year } = req.query;
            const data = await attendanceService.getAttendanceMatrix(month, year);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async updateAttendance(req, res, next) {
        try {
            const { ma_nv, check_in_time, check_out_time } = req.body;
            const { dateStr, status, hours, isDelete } = req.validatedAttendance;

            await attendanceService.updateAttendanceDaily({
                ma_nv,
                dateStr,
                status,
                hours,
                isDelete,
                check_in_time,
                check_out_time
            });

            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AttendanceController();
