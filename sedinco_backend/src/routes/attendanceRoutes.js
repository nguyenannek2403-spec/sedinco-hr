const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { validateAttendanceMiddleware } = require('../middlewares/validationMiddleware');
const { idempotencyMiddleware } = require('../middlewares/idempotencyMiddleware');
const { 
    authenticateToken, 
    requireAuth, 
    requirePermission, 
    requireRole 
} = require('../middlewares/authMiddleware');

// 1. Xem lịch sử chấm công cá nhân của chính mình (Công nhân, Kế toán, Admin)
router.get('/today', authenticateToken, requireAuth, (req, res, next) => attendanceController.getTodayAttendance(req, res, next));
router.get('/me', authenticateToken, requireAuth, (req, res, next) => attendanceController.getMyAttendance(req, res, next));
router.get('/my-logs', authenticateToken, requireAuth, (req, res, next) => attendanceController.getMyAttendance(req, res, next));
router.get('/my-monthly', authenticateToken, requireAuth, (req, res, next) => attendanceController.getMyAttendance(req, res, next));

// 2. Xem ma trận bảng chấm công toàn công ty (Yêu cầu permission: attendance_view_all)
router.get('/', authenticateToken, requirePermission('attendance_view_all'), (req, res, next) => attendanceController.getAttendance(req, res, next));

// 3. Trạng thái khóa sổ kỳ công (Yêu cầu đăng nhập để xem trạng thái kỳ công)
router.get('/period-status', authenticateToken, requireAuth, (req, res, next) => attendanceController.getPeriodStatus(req, res, next));
router.get('/period-lock-status', authenticateToken, requireAuth, (req, res, next) => attendanceController.getPeriodStatus(req, res, next));

// 4. Khóa kỳ công tháng (Yêu cầu permission: attendance_lock)
router.post('/lock-period', authenticateToken, requirePermission('attendance_lock'), idempotencyMiddleware(), (req, res, next) => attendanceController.lockPeriod(req, res, next));
router.post('/lock', authenticateToken, requirePermission('attendance_lock'), idempotencyMiddleware(), (req, res, next) => attendanceController.lockPeriod(req, res, next));

// 5. Mở khóa kỳ công tháng (Chỉ Quản trị viên - Admin)
router.post('/unlock-period', authenticateToken, requireRole(['admin']), (req, res, next) => attendanceController.unlockPeriod(req, res, next));

// 6. Cập nhật dữ liệu chấm công (Kiểm tra quyền sở hữu hoặc quyền chấm công trong service)
router.post('/update', authenticateToken, requireAuth, validateAttendanceMiddleware, (req, res, next) => attendanceController.updateAttendance(req, res, next));
router.post('/', authenticateToken, requireAuth, validateAttendanceMiddleware, (req, res, next) => attendanceController.updateAttendance(req, res, next));

// 7. Ngừng hỗ trợ Kiosk QR từ V6 (410 Gone cho client cũ)
const legacyQrGone = (_req, res) => res.status(410).json({
    success: false,
    message: 'Tính năng Kiosk QR đã được loại bỏ ở phiên bản V6. Vui lòng dùng Chấm công 1 chạm!'
});
router.get('/dynamic-qr', authenticateToken, requireAuth, legacyQrGone);
router.get('/qr', authenticateToken, requireAuth, legacyQrGone);

// 8. Smart Attendance Phase 1 & V65 Unified Check-In/Check-Out State Machine
router.post('/precheck', authenticateToken, requireAuth, (req, res, next) => attendanceController.precheckCheckIn(req, res, next));
router.post('/qr-session', authenticateToken, requireRole(['admin', 'accountant']), (req, res, next) => attendanceController.generateQrSession(req, res, next));
router.post('/check-in', authenticateToken, requireAuth, idempotencyMiddleware(), (req, res, next) => attendanceController.checkInMultiFactor(req, res, next));
router.post('/check-out', authenticateToken, requireAuth, idempotencyMiddleware(), (req, res, next) => attendanceController.checkOutMultiFactor(req, res, next));

// 9. Danh sách chấm công nghi vấn / phát hiện chấm công hộ (Yêu cầu permission: attendance_view_all)
router.get('/suspicious-logs', authenticateToken, requirePermission('attendance_view_all'), (req, res, next) => attendanceController.getSuspiciousLogs(req, res, next));

// 10. Tải ảnh snapshot chi tiết của một bản ghi nghi vấn (Yêu cầu permission: attendance_view_all)
router.get('/logs/:id/image', authenticateToken, requirePermission('attendance_view_all'), (req, res, next) => attendanceController.getAttendanceImage(req, res, next));

// 11. Thống kê tỷ lệ đi làm theo ngày (Endpoint 18 trong DOCS/PROJECT.MD)
router.get('/stats', authenticateToken, requirePermission('attendance_view_all'), (req, res, next) => attendanceController.getAttendanceStats(req, res, next));

module.exports = router;
