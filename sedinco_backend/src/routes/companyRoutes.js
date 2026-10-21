const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { 
    authenticateToken, 
    requireRole 
} = require('../middlewares/authMiddleware');

router.get('/', (req, res, next) => companyController.getCompany(req, res, next));
router.put('/', authenticateToken, requireRole(['admin']), (req, res, next) => companyController.updateCompany(req, res, next));
router.get('/penalties', (req, res, next) => companyController.getPenalties(req, res, next));
router.post('/penalties', authenticateToken, requireRole(['admin']), (req, res, next) => companyController.updatePenalties(req, res, next));
router.put('/penalties', authenticateToken, requireRole(['admin']), (req, res, next) => companyController.updatePenalties(req, res, next));

module.exports = router;
