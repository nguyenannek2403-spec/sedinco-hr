const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { 
    authenticateToken, 
    requirePermission, 
    requireRole 
} = require('../middlewares/authMiddleware');

// 1. Xem danh sách nhân viên (Yêu cầu permission: employee_view)
router.get('/', authenticateToken, requirePermission('employee_view'), (req, res, next) => employeeController.getEmployees(req, res, next));

// 2. Xem chi tiết một nhân viên (Yêu cầu permission: employee_view)
router.get('/:id', authenticateToken, requirePermission('employee_view'), (req, res, next) => employeeController.getEmployeeById(req, res, next));

// 3. Thêm mới nhân sự (Yêu cầu permission: employee_create)
router.post('/', authenticateToken, requirePermission('employee_create'), (req, res, next) => employeeController.createEmployee(req, res, next));

// 4. Thay đổi phân quyền vai trò Role (Chỉ Quản trị viên - Admin)
router.put('/:ma_nv/role', authenticateToken, requireRole(['admin']), (req, res, next) => employeeController.updateEmployeeRole(req, res, next));

// 5. Khóa hoặc kích hoạt lại tài khoản nhân viên (Yêu cầu permission: employee_status_manage)
router.put('/:ma_nv/status', authenticateToken, requirePermission('employee_status_manage'), (req, res, next) => employeeController.updateEmployeeStatus(req, res, next));

// 6. Cập nhật hồ sơ nhân sự (Yêu cầu permission: employee_edit)
router.put('/:id', authenticateToken, requirePermission('employee_edit'), (req, res, next) => employeeController.updateEmployee(req, res, next));

// 7. Xóa hồ sơ nhân sự (Yêu cầu permission: employee_delete)
router.delete('/:id', authenticateToken, requirePermission('employee_delete'), (req, res, next) => employeeController.deleteEmployee(req, res, next));

module.exports = router;
