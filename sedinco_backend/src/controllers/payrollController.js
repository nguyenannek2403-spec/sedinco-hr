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

    async exportPayroll(req, res, next) {
        try {
            const month = req.query?.month || req.body?.month || (new Date().getMonth() + 1);
            const year = req.query?.year || req.body?.year || new Date().getFullYear();
            const data = await payrollService.calculateMonthlyPayroll(month, year, { exportAll: true });

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
                'Thưởng Thêm', 'Phạt / Khấu Trừ', 'Tạm Ứng Đã Trừ',
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
                    emp.bonusAmount || 0,
                    emp.penaltyAmount || 0,
                    emp.advanceDeduction || 0,
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

    async rejectPayroll(req, res, next) {
        try {
            const { month, year, reason, rejected_reason } = req.body;
            const result = await payrollService.rejectPayroll(month, year, reason || rejected_reason, req.user);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async updatePaymentStatus(req, res, next) {
        try {
            const { month, year, status, payment_status } = req.body;
            const result = await payrollService.updatePaymentStatus(month, year, payment_status || status || 'PAID', req.user);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getPayrollStatusList(req, res, next) {
        try {
            const { month, year } = req.query;
            const data = await payrollService.getPayrollStatusList({ month, year });
            return res.json({ success: true, data });
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

    async getBackupSnapshot(req, res, next) {
        try {
            const { month, year } = req.query;
            const snapshot = await payrollService.getBackupSnapshot(month, year, req.user);
            return res.json({ success: true, data: snapshot });
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
