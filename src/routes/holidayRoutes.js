const express = require('express');
const router = express.Router();
const holidayController = require('../controllers/holidayController');

router.get('/', (req, res, next) => holidayController.getHolidays(req, res, next));
router.post('/', (req, res, next) => holidayController.createHoliday(req, res, next));
router.delete('/:id', (req, res, next) => holidayController.deleteHoliday(req, res, next));

module.exports = router;
