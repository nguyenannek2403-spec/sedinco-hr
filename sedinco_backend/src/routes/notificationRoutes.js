const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateToken, requireAuth } = require('../middlewares/authMiddleware');

router.get('/my', authenticateToken, requireAuth, (req, res, next) => notificationController.getMyNotifications(req, res, next));
router.put('/read-all', authenticateToken, requireAuth, (req, res, next) => notificationController.markAllAsRead(req, res, next));
router.put('/:id/read', authenticateToken, requireAuth, (req, res, next) => notificationController.markAsRead(req, res, next));

module.exports = router;
