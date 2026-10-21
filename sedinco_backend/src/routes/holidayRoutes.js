const express = require('express');
const router = express.Router();
const holidayController = require('../controllers/holidayController');
const { 
    authenticateToken, 
    requireRole 
} = require('../middlewares/authMiddleware');

router.get('/', (req, res, next) => holidayController.getHolidays(req, res, next));
router.post('/', authenticateToken, requireRole(['admin']), (req, res, next) => holidayController.createHoliday(req, res, next));
router.delete('/:id', authenticateToken, requireRole(['admin']), (req, res, next) => holidayController.deleteHoliday(req, res, next));

module.exports = router;
