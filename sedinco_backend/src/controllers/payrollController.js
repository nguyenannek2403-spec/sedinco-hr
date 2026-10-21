const payrollService = require('../services/payrollService');

class PayrollController {
    async getPayroll(req, res, next) {
        try {
            const { month, year } = req.query;
            const data = await payrollService.calculateMonthlyPayroll(month, year);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async getMyPayroll(req, res, next) {
        try {
            const { month, year } = req.query;
            const ma_nv = req.user ? req.user.ma_nv : null;
            if (!ma_nv) {
                return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập tài khoản nhân viên!' });
            }
            const data = await payrollService.getMyPayroll(ma_nv, month, year);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async calculatePayroll(req, res, next) {
        try {
            const { month, year } = req.body;
            const data = await payrollService.calculateMonthlyPayroll(month, year);
            return res.json({ success: true, message: 'Tính toán bảng lương thành công!', data });
        } catch (err) {
            next(err);
        }
    }

    async approvePayroll(req, res, next) {
        try {
            const { month, year } = req.body;
            const result = await payrollService.approvePayroll(month, year, req.user);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async updatePaymentStatus(req, res, next) {
        try {
            const { month, year, status } = req.body;
            const result = await payrollService.updatePaymentStatus(month, year, status, req.user);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new PayrollController();
