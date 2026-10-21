const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { validateAttendanceMiddleware } = require('../middlewares/validationMiddleware');
const { 
    authenticateToken, 
    requireAuth, 
    requirePermission, 
    requireRole 
} = require('../middlewares/authMiddleware');

// 1. Xem lịch sử chấm công cá nhân của chính mình (Công nhân, Kế toán, Admin)
router.get('/me', authenticateToken, requireAuth, (req, res, next) => attendanceController.getMyAttendance(req, res, next));

// 2. Xem ma trận bảng chấm công toàn công ty (Yêu cầu permission: attendance_view_all)
router.get('/', authenticateToken, requirePermission('attendance_view_all'), (req, res, next) => attendanceController.getAttendance(req, res, next));

// 3. Trạng thái khóa sổ kỳ công (Cho phép xem trạng thái trước khi nộp đơn/chấm công)
router.get('/period-status', (req, res, next) => attendanceController.getPeriodStatus(req, res, next));

// 4. Khóa kỳ công tháng (Yêu cầu permission: attendance_lock)
router.post('/lock-period', authenticateToken, requirePermission('attendance_lock'), (req, res, next) => attendanceController.lockPeriod(req, res, next));

// 5. Mở khóa kỳ công tháng (Chỉ Quản trị viên - Admin)
router.post('/unlock-period', authenticateToken, requireRole(['admin']), (req, res, next) => attendanceController.unlockPeriod(req, res, next));

// 6. Cập nhật dữ liệu chấm công (Kiểm tra quyền sở hữu hoặc permission attendance_edit trong service)
router.post('/update', authenticateToken, requireAuth, validateAttendanceMiddleware, (req, res, next) => attendanceController.updateAttendance(req, res, next));

// 7. Sinh mã QR Động (Yêu cầu permission: attendance_view_all - Admin & Kế toán)
router.get('/dynamic-qr', authenticateToken, requirePermission('attendance_view_all'), (req, res, next) => attendanceController.getDynamicQr(req, res, next));

// 8. Chấm công đa lớp Multi-Factor (Mã QR động + GPS Geofencing + Camera Snapshot + Anti-Proxy)
router.post('/check-in', authenticateToken, requireAuth, (req, res, next) => attendanceController.checkInMultiFactor(req, res, next));

// 9. Danh sách chấm công nghi vấn / phát hiện chấm công hộ (Yêu cầu permission: attendance_view_all)
router.get('/suspicious-logs', authenticateToken, requirePermission('attendance_view_all'), (req, res, next) => attendanceController.getSuspiciousLogs(req, res, next));

module.exports = router;
