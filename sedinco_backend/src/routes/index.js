const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const attendanceRoutes = require('./attendanceRoutes');
const payrollRoutes = require('./payrollRoutes');
const requestRoutes = require('./requestRoutes');
const employeeRoutes = require('./employeeRoutes');
const companyRoutes = require('./companyRoutes');
const holidayRoutes = require('./holidayRoutes');
const settingsRoutes = require('./settingsRoutes');
const diagnosticsRoutes = require('./diagnosticsRoutes');
const clientErrorRoutes = require('./clientErrorRoutes');
const permissionController = require('../controllers/permissionController');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');

// Mount từng router chức năng
router.use('/', authRoutes); // /api/login, /api/admin/login, /api/change-password, etc.
router.use('/attendance', attendanceRoutes); // /api/attendance
router.use('/payroll', payrollRoutes); // /api/payroll
router.use('/requests', requestRoutes); // /api/requests
router.use('/employees', employeeRoutes); // /api/employees
router.use('/company', companyRoutes); // /api/company
router.use('/holidays', holidayRoutes); // /api/holidays
router.use('/settings', settingsRoutes); // /api/settings (penalties, etc.)
router.use('/permissions', settingsRoutes); // /api/permissions (alias cho audit-logs & accountant-permissions)
router.use('/diagnostics', diagnosticsRoutes); // /api/diagnostics (Staging Only)
router.use('/client-errors', clientErrorRoutes); // /api/client-errors (Staging Only)

// V5 Direct shortcuts cho Audit Logs & Red Alert Notifications Summary
router.get('/audit-logs', authenticateToken, requireRole(['admin']), (req, res, next) => permissionController.getAuditLogs(req, res, next));
router.put('/audit-logs/:id/pin', authenticateToken, requireRole(['admin']), (req, res, next) => permissionController.togglePinAuditLog(req, res, next));
router.post('/audit-logs/:id/pin', authenticateToken, requireRole(['admin']), (req, res, next) => permissionController.togglePinAuditLog(req, res, next));
router.put('/audit-logs/keep-employee/:ma_nv', authenticateToken, requireRole(['admin']), (req, res, next) => permissionController.toggleEmployeeKeepLogs(req, res, next));
router.post('/audit-logs/keep-employee/:ma_nv', authenticateToken, requireRole(['admin']), (req, res, next) => permissionController.toggleEmployeeKeepLogs(req, res, next));
router.post('/audit-logs/cleanup', authenticateToken, requireRole(['admin']), (req, res, next) => permissionController.cleanupAuditLogs(req, res, next));
router.get('/notifications/summary', authenticateToken, requireRole(['admin', 'accountant']), (req, res, next) => permissionController.getAlertsSummary(req, res, next));

module.exports = router;
