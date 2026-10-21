const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requireAuth } = require('../middlewares/authMiddleware');

// Public & Protected registration
router.post('/login', (req, res, next) => authController.login(req, res, next));
router.post('/admin/login', (req, res, next) => authController.adminLogin(req, res, next));
router.post('/admin/register', authenticateToken, (req, res, next) => authController.adminRegister(req, res, next));

// Protected endpoints
router.get('/me', authenticateToken, requireAuth, (req, res, next) => authController.getProfile(req, res, next));
router.get('/profile', authenticateToken, requireAuth, (req, res, next) => authController.getProfile(req, res, next));
router.post('/change-password', authenticateToken, requireAuth, (req, res, next) => authController.changePassword(req, res, next));
router.post('/update-avatar', authenticateToken, requireAuth, (req, res, next) => authController.updateAvatar(req, res, next));

module.exports = router;
