const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Public & Protected auth endpoints
router.post('/login', (req, res, next) => authController.login(req, res, next));
router.post('/auth/zalo-auto-login', (req, res, next) => authController.zaloAutoLogin(req, res, next));
router.post('/zalo-auto-login', (req, res, next) => authController.zaloAutoLogin(req, res, next));
router.get('/auth/zalo/status', authenticateToken, requireAuth, (req, res, next) => authController.getZaloStatus(req, res, next));
router.post('/auth/zalo/link', authenticateToken, requireAuth, (req, res, next) => authController.linkZalo(req, res, next));
router.post('/auth/zalo/unlink', authenticateToken, requireAuth, (req, res, next) => authController.unlinkZalo(req, res, next));
router.post('/auth/zalo/verify-phone', authenticateToken, requireAuth, (req, res, next) => authController.verifyZaloPhone(req, res, next));
router.post('/admin/login', (req, res, next) => authController.adminLogin(req, res, next));
router.post('/admin/register', authenticateToken, requireAuth, requireRole('admin'), (req, res, next) => authController.adminRegister(req, res, next));

// Protected endpoints
router.get('/me', authenticateToken, requireAuth, (req, res, next) => authController.getProfile(req, res, next));
router.get('/auth/me', authenticateToken, requireAuth, (req, res, next) => authController.getProfile(req, res, next));
router.get('/profile', authenticateToken, requireAuth, (req, res, next) => authController.getProfile(req, res, next));
router.post('/change-password', authenticateToken, requireAuth, (req, res, next) => authController.changePassword(req, res, next));
router.put('/account/credentials', authenticateToken, requireAuth, (req, res, next) => authController.updateAccountCredentials(req, res, next));
router.put('/account/theme', authenticateToken, requireAuth, (req, res, next) => authController.updateTheme(req, res, next));
router.put('/account/preferences', authenticateToken, requireAuth, (req, res, next) => authController.updatePreferences(req, res, next));
router.put('/account/bank-card', authenticateToken, requireAuth, (req, res, next) => authController.updateBankCard(req, res, next));
router.post('/account/lookup-bank', authenticateToken, requireAuth, (req, res, next) => authController.lookupBankAccount(req, res, next));
router.put('/account/avatar', authenticateToken, requireAuth, (req, res, next) => authController.updateSelfAvatar(req, res, next));
router.post('/update-avatar', authenticateToken, requireAuth, (req, res, next) => authController.updateAvatar(req, res, next));

module.exports = router;
