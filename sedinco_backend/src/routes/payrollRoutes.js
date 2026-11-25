const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');
const { idempotencyMiddleware } = require('../middlewares/idempotencyMiddleware');
const {
    authenticateToken,
    requireAuth,
    requirePermission,
    requireRole
} = require('../middlewares/authMiddleware');

// 1. Xem bảng lương cá nhân & Xác nhận / Khiếu nại sai lương (V5)
router.get('/me', authenticateToken, requireAuth, (req, res, next) => payrollController.getMyPayroll(req, res, next));
router.get('/my-payslip', authenticateToken, requireAuth, (req, res, next) => payrollController.getMyPayroll(req, res, next));
router.get('/slip', authenticateToken, requireAuth, (req, res, next) => payrollController.getSlip(req, res, next));
router.post('/confirm', authenticateToken, requireAuth, idempotencyMiddleware(), (req, res, next) => payrollController.confirmOrDisputeSalary(req, res, next));
router.post('/resolve-dispute', authenticateToken, requirePermission('payroll_approve'), idempotencyMiddleware(), (req, res, next) => payrollController.resolveSalaryDispute(req, res, next));

// 2. Xem bảng lương toàn công ty & Chi tiết phiếu lương + bảng công từng nhân viên (Yêu cầu permission: payroll_view_all)
router.get('/', authenticateToken, requirePermission('payroll_view_all'), (req, res, next) => payrollController.getPayroll(req, res, next));
router.get('/employee/:ma_nv', authenticateToken, requirePermission('payroll_view_all'), (req, res, next) => payrollController.getEmployeePayrollDetail(req, res, next));

// 3. Tính toán bảng lương tháng (Yêu cầu permission: payroll_calculate, chỉ cho phép POST để tránh CSRF qua GET)
router.post('/calculate', authenticateToken, requirePermission('payroll_calculate'), (req, res, next) => payrollController.calculatePayroll(req, res, next));
router.get('/calculate', authenticateToken, requireAuth, (req, res) => {
    return res.status(405).json({
        success: false,
        code: 'METHOD_NOT_ALLOWED',
        message: 'Phương thức GET không được phép thay đổi dữ liệu lương. Vui lòng sử dụng POST /api/payroll/calculate.'
    });
});
router.post('/adjustments', authenticateToken, requirePermission('payroll_calculate'), idempotencyMiddleware(), (req, res, next) => payrollController.adjustSalary(req, res, next));

// 4. Gửi báo cáo xác nhận lương & Chốt chuyển khoản (Chỉ Admin - V45)
router.post('/send-report', authenticateToken, requireRole(['admin']), (req, res, next) => payrollController.sendSalaryReport(req, res, next));
router.post('/mark-paid', authenticateToken, requireRole(['admin']), idempotencyMiddleware(), (req, res, next) => payrollController.markPaid(req, res, next));

// 5. Cập nhật trạng thái chuyển khoản từng nhân viên (Yêu cầu permission: payroll_payment_status_manage)
router.post('/employee-payment-status', authenticateToken, requirePermission('payroll_payment_status_manage'), idempotencyMiddleware(), (req, res, next) => payrollController.updateEmployeePaymentStatus(req, res, next));
router.put('/employee-payment-status', authenticateToken, requirePermission('payroll_payment_status_manage'), idempotencyMiddleware(), (req, res, next) => payrollController.updateEmployeePaymentStatus(req, res, next));
router.post('/employee-paid', authenticateToken, requirePermission('payroll_payment_status_manage'), idempotencyMiddleware(), (req, res, next) => payrollController.updateEmployeePaymentStatus(req, res, next));

module.exports = router;
