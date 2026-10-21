const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const { 
    authenticateToken, 
    requireAuth, 
    requirePermission 
} = require('../middlewares/authMiddleware');

// 1. Xem đơn cá nhân của chính mình (Công nhân, Kế toán, Admin)
router.get('/me', authenticateToken, requireAuth, (req, res, next) => requestController.getMyRequests(req, res, next));

// 2. Xem toàn bộ đơn từ công ty (Yêu cầu permission: leave_view_all)
router.get('/', authenticateToken, requirePermission('leave_view_all'), (req, res, next) => requestController.getRequests(req, res, next));

// 3. Tạo đơn từ mới (Yêu cầu đăng nhập, công nhân chỉ tạo đơn cho chính mình)
router.post('/', authenticateToken, requireAuth, (req, res, next) => requestController.createRequest(req, res, next));

// 4. Đăng ký làm thêm giờ duyệt trước (Pre-Approval OT)
router.post('/ot-pre-register', authenticateToken, requireAuth, (req, res, next) => requestController.createOtPreRegistration(req, res, next));
router.get('/ot-registrations', authenticateToken, requirePermission('leave_view_all'), (req, res, next) => requestController.getOtRegistrations(req, res, next));
router.put('/ot-registrations/:id', authenticateToken, requirePermission('leave_approve'), (req, res, next) => requestController.updateOtRegistrationStatus(req, res, next));

// 5. Phê duyệt hoặc từ chối đơn từ (Yêu cầu permission: leave_approve, cấm tự phê duyệt)
router.put('/:id', authenticateToken, requirePermission('leave_approve'), (req, res, next) => requestController.updateRequestStatus(req, res, next));

// 6. Hủy đơn từ (Yêu cầu đăng nhập, chỉ hủy đơn pending của chính mình hoặc Admin)
router.put('/:id/cancel', authenticateToken, requireAuth, (req, res, next) => requestController.cancelRequest(req, res, next));

module.exports = router;
