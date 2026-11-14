const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { idempotencyMiddleware } = require('../middlewares/idempotencyMiddleware');
const { 
    authenticateToken, 
    requireAuth,
    requireRole 
} = require('../middlewares/authMiddleware');

router.get('/', authenticateToken, requireAuth, (req, res, next) => companyController.getCompany(req, res, next));
router.get('/settings', authenticateToken, requireAuth, (req, res, next) => companyController.getCompany(req, res, next));
router.put('/', authenticateToken, requireRole(['admin']), idempotencyMiddleware(), (req, res, next) => companyController.updateCompany(req, res, next));
router.put('/settings', authenticateToken, requireRole(['admin']), idempotencyMiddleware(), (req, res, next) => companyController.updateCompany(req, res, next));
router.post('/save-wifi-ip', authenticateToken, requireRole(['admin']), (req, res, next) => companyController.saveWifiIp(req, res, next));
router.post('/reset-defaults', authenticateToken, requireRole(['admin']), (req, res, next) => companyController.resetDefaults(req, res, next));
router.get('/penalties', authenticateToken, requireAuth, (req, res, next) => companyController.getPenalties(req, res, next));
router.post('/penalties', authenticateToken, requireRole(['admin']), (req, res, next) => companyController.updatePenalties(req, res, next));
router.put('/penalties', authenticateToken, requireRole(['admin']), (req, res, next) => companyController.updatePenalties(req, res, next));

module.exports = router;
