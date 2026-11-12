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

    async calculatePayroll(req, res, next) {
        try {
            const month = req.body?.month || req.query?.month;
            const year = req.body?.year || req.query?.year;
            const data = await payrollService.calculateMonthlyPayroll(month, year);
            return res.json({ success: true, message: 'Tính toán bảng lương thành công!', data });
        } catch (err) {
            next(err);
        }
    }

    async exportPayroll(req, res, next) {
        try {
            const month = req.query?.month || req.body?.month || (new Date().getMonth() + 1);
            const year = req.query?.year || req.body?.year || new Date().getFullYear();
            const data = await payrollService.calculateMonthlyPayroll(month, year);

            // Khử CSV Formula Injection cho các ký tự =, +, -, @, \t, \r
            const sanitizeCell = (val) => {
                let str = String(val ?? '');
                if (/^[=+@\-\t\r]/.test(str)) {
                    str = "'" + str;
                }
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            const headers = [
                'Mã NV', 'Họ và Tên', 'Chức Danh', 'Lương Cơ Bản', 'Ngày Công',
                'Lương Theo Công', 'Phụ Cấp Ăn Trưa', 'Phụ Cấp Xăng Xe', 'Phụ Cấp Nhà Ở',
                'Thưởng HTCV', 'Phụ Cấp Trách Nhiệm', 'Tổng Phụ Cấp', 'Tiền Tăng Ca (OT)',
                'Khấu Trừ BHXH (10.5%)', 'Thực Lĩnh (Net)'
            ];

            const rows = (data || []).map(emp => {
                const b = emp.allowances_breakdown || {};
                return [
                    sanitizeCell(emp.ma_nv || emp.id_nhan_vien),
                    sanitizeCell(emp.ho_ten),
                    sanitizeCell(emp.chuc_danh || 'Nhân viên'),
                    emp.baseSalary || 0,
                    emp.totalWorkDays || 0,
                    emp.salaryByWork || 0,
                    b.an_trua || 0,
                    b.xang_xe || 0,
                    b.nha_o || 0,
                    b.thuong_htcv || 0,
                    b.trach_nhiem || 0,
                    emp.totalAllowance || 0,
                    emp.otAmount || 0,
                    emp.totalInsurance || 0,
                    emp.netSalary || 0
                ].join(',');
            });

            const csvContent = '\uFEFF' + [headers.map(sanitizeCell).join(','), ...rows].join('\n');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="Bang_Luong_${month}_${year}.csv"`);
            return res.status(200).send(csvContent);
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

    async confirmOrDisputeSalary(req, res, next) {
        try {
            const ma_nv = req.user ? req.user.ma_nv : null;
            if (!ma_nv) {
                return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập tài khoản nhân viên!' });
            }
            const { month, year, status, dispute_reason, dispute_evidence_media } = req.body;
            const result = await payrollService.confirmOrDisputeSalary({
                ma_nv,
                month,
                year,
                status,
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
            const { ma_nv, month, year, admin_response, new_status } = req.body;
            const result = await payrollService.resolveSalaryDispute({
                ma_nv,
                month,
                year,
                admin_response,
                new_status,
                current_user: req.user
            });
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new PayrollController();
