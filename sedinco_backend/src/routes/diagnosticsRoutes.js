/**
 * sedinco_backend/src/routes/diagnosticsRoutes.js
 * 
 * Tuyến đường tự chẩn đoán (/api/diagnostics).
 * Bắt buộc: ENABLE_DIAGNOSTICS=true & role='admin'
 */

const express = require('express');
const router = express.Router();
const diagnosticsController = require('../controllers/diagnosticsController');
const { authenticateToken } = require('../middlewares/authMiddleware');

// Áp dụng middleware kiểm tra quyền và cờ cấu hình cho toàn bộ routes
router.use(authenticateToken);
router.use((req, res, next) => diagnosticsController.checkDiagnosticsAccess(req, res, next));

router.get('/status', (req, res) => diagnosticsController.getSystemStatus(req, res));
router.get('/system-status', (req, res) => diagnosticsController.getSystemStatus(req, res));
router.get('/recent-logs', (req, res) => diagnosticsController.getRecentLogs(req, res));
router.post('/verify-zalo-user', (req, res) => diagnosticsController.verifyZaloUser(req, res));
router.post('/decode-location', (req, res) => diagnosticsController.decodeZaloLocation(req, res));

module.exports = router;
