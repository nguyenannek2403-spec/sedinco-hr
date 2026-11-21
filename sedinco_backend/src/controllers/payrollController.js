const payrollService = require('../services/payrollService');

class PayrollController {
    async getPayroll(req, res, next) {
        try {
            const { month, year, page, limit } = req.query;
            const data = await payrollService.calculateMonthlyPayroll(month, year, { page, limit });
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

    async getEmployeePayrollDetail(req, res, next) {
        try {
            const { ma_nv } = req.params;
            const { month, year } = req.query;
            const data = await payrollService.getEmployeePayrollDetail(ma_nv, month, year);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async calculatePayroll(req, res, next) {
        try {
            const month = req.body?.month || req.query?.month;
            const year = req.body?.year || req.query?.year;
            await payrollService.autoResolveSalaryDisputes({
                month,
                year,
                resolved_note: `Quản trị viên / Kế toán đã tính toán lại bảng lương Tháng ${month}/${year}`,
                current_user: req.user
            }).catch(() => {});
            const data = await payrollService.calculateMonthlyPayroll(month, year, { exportAll: true });
            return res.json({ success: true, message: 'Tính toán bảng lương thành công!', data });
        } catch (err) {
            next(err);
        }
    }

    async confirmOrDisputeSalary(req, res, next) {
        try {
            const ma_nv = req.user ? req.user.ma_nv : null;
            if (!ma_nv) {
                return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập tài khoản nhân viên!' });
            }
            const { month, year, status, action, note, dispute_reason, dispute_evidence_media } = req.body || {};
            const result = await payrollService.confirmOrDisputeSalary({
                ma_nv,
                month,
                year,
                status,
                action,
                note,
                dispute_reason,
                dispute_evidence_media,
                current_user: req.user
            });
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async resolveSalaryDispute(req, res, next) {
        try {
            const { ma_nv, month, year, admin_response, new_status, status } = req.body;
            const resolvedStatus = new_status || status || 'CONFIRMED';
            const result = await payrollService.resolveSalaryDispute({
                ma_nv,
                month,
                year,
                admin_response,
                new_status: resolvedStatus,
                current_user: req.user
            });
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async adjustSalary(req, res, next) {
        try {
            const {
                ma_nv,
                month,
                year,
                bonus_amount,
                penalty_amount,
                advance_deduction,
                adjustment_note
            } = req.body;
            const result = await payrollService.adjustSalary({
                ma_nv,
                month,
                year,
                bonus_amount,
                penalty_amount,
                advance_deduction,
                adjustment_note,
                current_user: req.user
            });
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async sendSalaryReport(req, res, next) {
        try {
            const { month, year, ma_nv, send_all } = req.body || {};
            const result = await payrollService.sendSalaryReport({
                month,
                year,
                ma_nv,
                send_all: Boolean(send_all),
                current_user: req.user
            });
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async markPaid(req, res, next) {
        try {
            const ma_nv = req.body?.ma_nv || req.params?.ma_nv;
            const { month, year, transfer_note } = req.body || {};
            const result = await payrollService.updateEmployeePaymentStatus({
                ma_nv,
                month,
                year,
                status: 'PAID',
                transfer_note,
                current_user: req.user
            });
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async updateEmployeePaymentStatus(req, res, next) {
        try {
            const ma_nv = req.body.ma_nv || req.params.ma_nv;
            const { month, year, status, transfer_note } = req.body || {};
            const result = await payrollService.updateEmployeePaymentStatus({
                ma_nv,
                month,
                year,
                status: status || 'PAID',
                transfer_note,
                current_user: req.user
            });
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new PayrollController();
