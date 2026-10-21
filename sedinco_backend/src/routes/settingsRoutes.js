const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const permissionController = require('../controllers/permissionController');
const { 
    authenticateToken, 
    requireRole 
} = require('../middlewares/authMiddleware');

// 1. Quản lý cấu hình ca làm việc & thang phạt đi trễ
router.get('/penalties', (req, res, next) => companyController.getPenalties(req, res, next));
router.post('/penalties', authenticateToken, requireRole(['admin']), (req, res, next) => companyController.updatePenalties(req, res, next));
router.put('/penalties', authenticateToken, requireRole(['admin']), (req, res, next) => companyController.updatePenalties(req, res, next));

// 2. Quản lý Phân quyền Kế toán động (Accountant Permissions)
// Xem danh sách phân quyền: Quản trị viên và Kế toán đều có thể đọc
router.get('/accountant-permissions', authenticateToken, requireRole(['admin', 'accountant']), (req, res, next) => permissionController.getAccountantPermissions(req, res, next));
// Cập nhật cấu hình bật/tắt quyền: CHỈ Quản trị viên (admin)
router.put('/accountant-permissions', authenticateToken, requireRole(['admin']), (req, res, next) => permissionController.updateAccountantPermissions(req, res, next));

// 3. Nhật ký Kiểm toán (Audit Logs) - CHỈ Quản trị viên (admin)
router.get('/audit-logs', authenticateToken, requireRole(['admin']), (req, res, next) => permissionController.getAuditLogs(req, res, next));

module.exports = router;
