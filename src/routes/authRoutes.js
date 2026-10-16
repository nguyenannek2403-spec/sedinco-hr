const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', (req, res, next) => authController.login(req, res, next));
router.post('/admin/login', (req, res, next) => authController.adminLogin(req, res, next));
router.post('/admin/register', (req, res, next) => authController.adminRegister(req, res, next));
router.post('/change-password', (req, res, next) => authController.changePassword(req, res, next));
router.post('/update-avatar', (req, res, next) => authController.updateAvatar(req, res, next));

module.exports = router;
