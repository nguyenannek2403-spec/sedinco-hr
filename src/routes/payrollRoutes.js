const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');

router.get('/', (req, res, next) => payrollController.getPayroll(req, res, next));
router.get('/status-list', (req, res, next) => {
    // Trả về danh sách trạng thái chi trả cho tháng hiện tại
    return res.json({ success: true, data: [] });
});

module.exports = router;
