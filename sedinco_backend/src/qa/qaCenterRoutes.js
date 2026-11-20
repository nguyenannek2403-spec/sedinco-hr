const express = require('express');
const router = express.Router();
const qaCenterController = require('./qaCenterController');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');

// Toàn bộ QA Center chỉ dành riêng cho Quản trị viên (admin)
router.get('/overview', authenticateToken, requireRole(['admin']), (req, res, next) => qaCenterController.getOverview(req, res, next));
router.get('/test-cases', authenticateToken, requireRole(['admin']), (req, res, next) => qaCenterController.getTestCases(req, res, next));
router.get('/bugs', authenticateToken, requireRole(['admin']), (req, res, next) => qaCenterController.getBugs(req, res, next));
router.get('/history', authenticateToken, requireRole(['admin']), (req, res, next) => qaCenterController.getHistory(req, res, next));
router.post('/run-safe-checks', authenticateToken, requireRole(['admin']), (req, res, next) => qaCenterController.runSafeChecks(req, res, next));
router.get('/export', authenticateToken, requireRole(['admin']), (req, res, next) => qaCenterController.exportReport(req, res, next));

module.exports = router;
