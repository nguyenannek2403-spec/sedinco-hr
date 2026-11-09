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
const kioskRoutes = require('./kioskRoutes');
const diagnosticsRoutes = require('./diagnosticsRoutes');
const clientErrorRoutes = require('./clientErrorRoutes');

// Mount từng router chức năng
router.use('/', authRoutes); // /api/login, /api/admin/login, /api/change-password, etc.
router.use('/attendance', attendanceRoutes); // /api/attendance
router.use('/payroll', payrollRoutes); // /api/payroll
router.use('/requests', requestRoutes); // /api/requests
router.use('/employees', employeeRoutes); // /api/employees
router.use('/company', companyRoutes); // /api/company
router.use('/holidays', holidayRoutes); // /api/holidays
router.use('/settings', settingsRoutes); // /api/settings (penalties, etc.)
router.use('/kiosk', kioskRoutes); // /api/kiosk (QR Hardware Isolation)
router.use('/diagnostics', diagnosticsRoutes); // /api/diagnostics (Staging Only)
router.use('/client-errors', clientErrorRoutes); // /api/client-errors (Staging Only)

module.exports = router;
