const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const { authenticateToken, requireAuth, requireRole } = require('../middlewares/authMiddleware');
const { idempotencyMiddleware } = require('../middlewares/idempotencyMiddleware');

// Cấu hình công khai tối thiểu cho client (không bao giờ trả API Secret)
router.get('/config', authenticateToken, requireAuth, (req, res, next) => mediaController.getConfig(req, res, next));

// Cổng upload tập trung (multipart/form-data fieldname="file" & JSON fallback)
router.post('/upload', authenticateToken, requireAuth, idempotencyMiddleware(), (req, res, next) => mediaController.upload(req, res, next));

// Danh sách tài liệu hồ sơ nhân viên (RBAC chặt chẽ)
router.get('/employee/:ma_nv/documents', authenticateToken, requireAuth, (req, res, next) => mediaController.listEmployeeDocuments(req, res, next));

// Admin Media Storage Management Dashboard & Operations (Admin-only)
router.get('/admin/dashboard', authenticateToken, requireRole(['admin']), (req, res, next) => mediaController.getAdminDashboard(req, res, next));
router.get('/admin/assets', authenticateToken, requireRole(['admin']), (req, res, next) => mediaController.getAdminAssets(req, res, next));
router.post('/admin/sync-usage', authenticateToken, requireRole(['admin']), (req, res, next) => mediaController.syncAdminUsage(req, res, next));
router.post('/admin/cleanup-orphans', authenticateToken, requireRole(['admin']), (req, res, next) => mediaController.cleanupOrphans(req, res, next));

// Cổng truy cập / phát tài nguyên nhân sự riêng tư có xác thực JWT & kiểm tra quyền sở hữu
router.get('/:assetUuid/access', authenticateToken, requireAuth, (req, res, next) => mediaController.accessMedia(req, res, next));

// Xóa tài nguyên an toàn (chỉ Admin hoặc chủ sở hữu draft chưa gắn nghiệp vụ; cấm xóa khi đang được tham chiếu)
router.delete('/:assetUuid', authenticateToken, requireAuth, (req, res, next) => mediaController.deleteAsset(req, res, next));

module.exports = router;
