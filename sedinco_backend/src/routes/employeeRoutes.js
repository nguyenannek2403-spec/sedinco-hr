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

// 1.1 Danh sách yêu cầu đổi thiết bị chờ duyệt (Chỉ Admin)
router.get('/pending-device-changes', authenticateToken, requireRole(['admin']), (req, res, next) => employeeController.getPendingDeviceChanges(req, res, next));

// 1.2 Liên kết tài khoản Zalo (Xác minh qua access token Zalo trên Server)
router.post('/bind-zalo', authenticateToken, (req, res, next) => employeeController.bindZalo(req, res, next));

// 1.3 Yêu cầu đổi thiết bị (Dành cho Worker)
router.post('/request-device-change', authenticateToken, (req, res, next) => employeeController.requestDeviceChange(req, res, next));

// 2. Xem chi tiết một nhân viên (Yêu cầu permission: employee_view)
router.get('/:id', authenticateToken, requirePermission('employee_view'), (req, res, next) => employeeController.getEmployeeById(req, res, next));

// 3. Thêm mới nhân sự (Yêu cầu permission: employee_create)
router.post('/', authenticateToken, requirePermission('employee_create'), (req, res, next) => employeeController.createEmployee(req, res, next));

// 4. Thay đổi phân quyền vai trò Role (Chỉ Quản trị viên - Admin)
router.put('/:ma_nv/role', authenticateToken, requireRole(['admin']), (req, res, next) => employeeController.updateEmployeeRole(req, res, next));

// 4.1 Phê duyệt đổi thiết bị cho nhân viên (Chỉ Admin)
router.put('/:ma_nv/approve-device-change', authenticateToken, requireRole(['admin']), (req, res, next) => employeeController.approveDeviceChange(req, res, next));
router.post('/:ma_nv/approve-device-change', authenticateToken, requireRole(['admin']), (req, res, next) => employeeController.approveDeviceChange(req, res, next));
router.post('/:ma_nv/approve-device', authenticateToken, requireRole(['admin']), (req, res, next) => employeeController.approveDeviceChange(req, res, next));

// 4.2 Từ chối yêu cầu đổi thiết bị (Chỉ Admin)
router.put('/:ma_nv/reject-device-change', authenticateToken, requireRole(['admin']), (req, res, next) => employeeController.rejectDeviceChange(req, res, next));
router.post('/:ma_nv/reject-device-change', authenticateToken, requireRole(['admin']), (req, res, next) => employeeController.rejectDeviceChange(req, res, next));
router.post('/:ma_nv/reject-device', authenticateToken, requireRole(['admin']), (req, res, next) => employeeController.rejectDeviceChange(req, res, next));

// 4.3 Cài đặt chế độ ràng buộc thiết bị: recording / enforced (Chỉ Admin)
router.put('/:ma_nv/device-binding-mode', authenticateToken, requireRole(['admin']), (req, res, next) => employeeController.setDeviceBindingMode(req, res, next));

// 5. Khóa hoặc kích hoạt lại tài khoản nhân viên (Yêu cầu permission: employee_status_manage)
router.put('/:ma_nv/status', authenticateToken, requirePermission('employee_status_manage'), (req, res, next) => employeeController.updateEmployeeStatus(req, res, next));

// 6. Cập nhật hồ sơ nhân sự (Yêu cầu permission: employee_edit)
router.put('/:id', authenticateToken, requirePermission('employee_edit'), (req, res, next) => employeeController.updateEmployee(req, res, next));

// 7. Xóa hồ sơ nhân sự (Yêu cầu permission: employee_delete)
router.delete('/:id', authenticateToken, requirePermission('employee_delete'), (req, res, next) => employeeController.deleteEmployee(req, res, next));

// 8. B2 (G5): Kích hoạt đổi mật khẩu theo đợt (Chỉ Admin)
router.post('/staged-force-password', authenticateToken, requireRole(['admin']), (req, res, next) => employeeController.stagedForcePasswordChange(req, res, next));

module.exports = router;
