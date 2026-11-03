/**
 * src/routes/kioskRoutes.js
 * 
 * Routes cho chức năng Kiosk QR Hardware Isolation (Đề xuất 2)
 */

const express = require('express');
const router = express.Router();
const kioskController = require('../controllers/kioskController');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');

// 1. Sinh QR dành cho Kiosk phần cứng (chỉ cần x-kiosk-key, không cần token Admin/Accountant)
router.get('/qr', (req, res, next) => kioskController.getQr(req, res, next));
router.get('/dynamic-qr', (req, res, next) => kioskController.getQr(req, res, next));
// Phương án A: Kiosk kiểm tra trạng thái QR hiện tại (polling 2-3s để đổi mã ngay khi đã quét)
router.get('/qr-status', (req, res, next) => kioskController.getQrStatus(req, res, next));

// 2. Các API quản trị Kiosk (Chỉ dành cho Admin)
router.post('/register', authenticateToken, requireRole(['admin']), (req, res, next) => kioskController.register(req, res, next));
router.get('/list', authenticateToken, requireRole(['admin']), (req, res, next) => kioskController.list(req, res, next));
router.put('/:id/revoke', authenticateToken, requireRole(['admin']), (req, res, next) => kioskController.revoke(req, res, next));
router.post('/:id/rotate-key', authenticateToken, requireRole(['admin']), (req, res, next) => kioskController.rotateKey(req, res, next));

module.exports = router;

