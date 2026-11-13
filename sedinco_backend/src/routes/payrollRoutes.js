const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');
const { idempotencyMiddleware } = require('../middlewares/idempotencyMiddleware');
const { 
    authenticateToken, 
    requireAuth, 
    requirePermission 
} = require('../middlewares/authMiddleware');

// 1. Xem bảng lương cá nhân & Xác nhận / Khiếu nại sai lương (V5)
router.get('/me', authenticateToken, requireAuth, (req, res, next) => payrollController.getMyPayroll(req, res, next));
router.get('/my-payslip', authenticateToken, requireAuth, (req, res, next) => payrollController.getMyPayroll(req, res, next));
router.post('/confirm', authenticateToken, requireAuth, idempotencyMiddleware(), (req, res, next) => payrollController.confirmOrDisputeSalary(req, res, next));
router.post('/resolve-dispute', authenticateToken, requirePermission('payroll_view_all'), idempotencyMiddleware(), (req, res, next) => payrollController.resolveSalaryDispute(req, res, next));

// 2. Xem bảng lương toàn công ty (Yêu cầu permission: payroll_view_all)
router.get('/', authenticateToken, requirePermission('payroll_view_all'), (req, res, next) => payrollController.getPayroll(req, res, next));

// 3. Tính toán bảng lương tháng (Yêu cầu permission: payroll_calculate)
router.post('/calculate', authenticateToken, requirePermission('payroll_calculate'), (req, res, next) => payrollController.calculatePayroll(req, res, next));
router.get('/calculate', authenticateToken, requirePermission('payroll_calculate'), (req, res, next) => payrollController.calculatePayroll(req, res, next));
router.post('/adjustments', authenticateToken, requirePermission('payroll_calculate'), idempotencyMiddleware(), (req, res, next) => payrollController.adjustSalary(req, res, next));

// 4. Phê duyệt bảng lương chính thức (Yêu cầu permission: payroll_approve)
router.post('/approve', authenticateToken, requirePermission('payroll_approve'), (req, res, next) => payrollController.approvePayroll(req, res, next));
router.post('/save', authenticateToken, requirePermission('payroll_approve'), (req, res, next) => payrollController.approvePayroll(req, res, next));

// 5. Xuất bảng lương CSV (Endpoint 22 trong DOCS/PROJECT.MD)
router.get('/export', authenticateToken, requirePermission('payroll_view_all'), (req, res, next) => payrollController.exportPayroll(req, res, next));

// 6. Cập nhật trạng thái chi trả lương (Yêu cầu permission: payroll_payment_status_manage)
router.put('/payment-status', authenticateToken, requirePermission('payroll_payment_status_manage'), (req, res, next) => payrollController.updatePaymentStatus(req, res, next));

// 7. Danh sách trạng thái chi trả (Yêu cầu permission: payroll_view_all)
router.get('/status-list', authenticateToken, requirePermission('payroll_view_all'), (req, res, next) => {
    return res.json({ success: true, data: [] });
});

module.exports = router;
