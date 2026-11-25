const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const {
    authenticateToken,
    requireAuth,
    requireRole
} = require('../middlewares/authMiddleware');

router.get('/', authenticateToken, requireAuth, (req, res, next) => departmentController.getDepartments(req, res, next));
router.post('/', authenticateToken, requireRole(['admin']), (req, res, next) => departmentController.createDepartment(req, res, next));
router.put('/:id', authenticateToken, requireRole(['admin']), (req, res, next) => departmentController.updateDepartment(req, res, next));
router.delete('/:id', authenticateToken, requireRole(['admin']), (req, res, next) => departmentController.deleteDepartment(req, res, next));

module.exports = router;
