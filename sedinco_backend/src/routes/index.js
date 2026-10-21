const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const attendanceRoutes = require('./attendanceRoutes');
const payrollRoutes = require('./payrollRoutes');
const requestRoutes = require('./requestRoutes');
const employeeRoutes = require('./employeeRoutes');
const companyRoutes = require('./companyRoutes');
const holidayRoutes = require('./holidayRoutes');
const settingsRoutes = require('./settingsRoutes');

// Mount từng router chức năng
router.use('/', authRoutes); // /api/login, /api/admin/login, /api/change-password, etc.
router.use('/attendance', attendanceRoutes); // /api/attendance
router.use('/payroll', payrollRoutes); // /api/payroll
router.use('/requests', requestRoutes); // /api/requests
router.use('/employees', employeeRoutes); // /api/employees
router.use('/company', companyRoutes); // /api/company
router.use('/holidays', holidayRoutes); // /api/holidays
router.use('/settings', settingsRoutes); // /api/settings (penalties, etc.)

module.exports = router;
