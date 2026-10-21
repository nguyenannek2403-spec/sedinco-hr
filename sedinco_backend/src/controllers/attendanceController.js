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

    async getMyAttendance(req, res, next) {
        try {
            const { month, year } = req.query;
            const ma_nv = req.user ? req.user.ma_nv : null;
            if (!ma_nv) {
                return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập tài khoản nhân viên!' });
            }
            const data = await attendanceService.getMyAttendance(ma_nv, month, year);
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
                check_out_time,
                current_user: req.user
            });

            return res.json({ success: true, message: 'Cập nhật chấm công thành công!' });
        } catch (err) {
            next(err);
        }
    }

    async lockPeriod(req, res, next) {
        try {
            const { month, year, reason, locked_by } = req.body;
            const user = req.user ? (req.user.ma_nv || req.user.username) : (locked_by || 'admin');
            const result = await attendanceService.lockPeriod({ 
                month, 
                year, 
                reason, 
                locked_by: user,
                current_user: req.user 
            });
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async unlockPeriod(req, res, next) {
        try {
            const { month, year, reason, unlocked_by } = req.body;
            const user = req.user ? (req.user.ma_nv || req.user.username) : (unlocked_by || 'admin');
            const result = await attendanceService.unlockPeriod({ 
                month, 
                year, 
                reason, 
                unlocked_by: user,
                current_user: req.user 
            });
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getPeriodStatus(req, res, next) {
        try {
            const { month, year } = req.query;
            const data = await attendanceService.getPeriodLockStatus(month, year);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async getDynamicQr(req, res, next) {
        try {
            const branchId = parseInt(req.query.branch_id, 10) || 1;
            const data = await attendanceService.generateDynamicQr(branchId, req.user);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async checkInMultiFactor(req, res, next) {
        try {
            const { token, lat, lng, image_snapshot, device_info } = req.body;
            const ip = req.ip || (req.connection && req.connection.remoteAddress) || '';
            const result = await attendanceService.checkInMultiFactor({
                token,
                lat,
                lng,
                image_snapshot,
                device_info,
                current_user: req.user,
                ip_address: ip
            });
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getSuspiciousLogs(req, res, next) {
        try {
            const limit = parseInt(req.query.limit, 10) || 100;
            const data = await attendanceService.getSuspiciousLogs(limit);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AttendanceController();
