const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');
const { 
    authenticateToken, 
    requireAuth, 
    requirePermission 
} = require('../middlewares/authMiddleware');

// 1. Xem bảng lương cá nhân (Công nhân, Kế toán, Admin đều xem được của chính mình)
router.get('/me', authenticateToken, requireAuth, (req, res, next) => payrollController.getMyPayroll(req, res, next));

// 2. Xem bảng lương toàn công ty (Yêu cầu permission: payroll_view_all)
router.get('/', authenticateToken, requirePermission('payroll_view_all'), (req, res, next) => payrollController.getPayroll(req, res, next));

// 3. Tính toán lại bảng lương tháng (Yêu cầu permission: payroll_calculate)
router.post('/calculate', authenticateToken, requirePermission('payroll_calculate'), (req, res, next) => payrollController.calculatePayroll(req, res, next));

// 4. Phê duyệt bảng lương chính thức (Yêu cầu permission: payroll_approve)
router.post('/approve', authenticateToken, requirePermission('payroll_approve'), (req, res, next) => payrollController.approvePayroll(req, res, next));

// 5. Cập nhật trạng thái chi trả lương (Yêu cầu permission: payroll_payment_status_manage)
router.put('/payment-status', authenticateToken, requirePermission('payroll_payment_status_manage'), (req, res, next) => payrollController.updatePaymentStatus(req, res, next));

// 6. Danh sách trạng thái chi trả (Yêu cầu permission: payroll_view_all)
router.get('/status-list', authenticateToken, requirePermission('payroll_view_all'), (req, res, next) => {
    return res.json({ success: true, data: [] });
});

module.exports = router;
