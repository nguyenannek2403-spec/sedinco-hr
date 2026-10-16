const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { validateAttendanceMiddleware } = require('../middlewares/validationMiddleware');

router.get('/', (req, res, next) => attendanceController.getAttendance(req, res, next));
router.post('/update', validateAttendanceMiddleware, (req, res, next) => attendanceController.updateAttendance(req, res, next));

module.exports = router;
