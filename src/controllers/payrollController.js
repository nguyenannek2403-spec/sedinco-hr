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
}

module.exports = new PayrollController();
