const authService = require('../services/authService');
const { sendSuccess, sendError } = require('../utils/responseHelper');

class AuthController {
    async login(req, res, next) {
        try {
            const { ma_nv, password } = req.body;
            const ip = req.ip || req.connection.remoteAddress;
            const result = await authService.employeeLogin(ma_nv, password, ip);
            if (!result.success) {
                return res.json({ success: false, message: result.message });
            }
            return res.json({ success: true, data: result.data });
        } catch (err) {
            next(err);
        }
    }

    async adminLogin(req, res, next) {
        try {
            const { username, password } = req.body;
            const ip = req.ip || req.connection.remoteAddress;
            const result = await authService.adminLogin(username, password, ip);
            if (!result.success) {
                return res.json({ success: false, message: result.message });
            }
            return res.json({ success: true, data: result.data });
        } catch (err) {
            next(err);
        }
    }

    async adminRegister(req, res, next) {
        try {
            const { username, password, ho_ten } = req.body;
            const result = await authService.adminRegister(username, password, ho_ten);
            if (!result.success) {
                return res.json({ success: false, message: result.message });
            }
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }

    async changePassword(req, res, next) {
        try {
            const { ma_nv, old_password, new_password } = req.body;
            const result = await authService.changePassword(ma_nv, old_password, new_password, req.user);
            if (!result.success) {
                return res.json({ success: false, message: result.message });
            }
            return res.json({ success: true, message: result.message });
        } catch (err) {
            next(err);
        }
    }

    async updateAvatar(req, res, next) {
        try {
            const { ma_nv, avatar_url } = req.body;
            const result = await authService.updateAvatar(ma_nv, avatar_url, req.user);
            if (!result.success) {
                return res.status(403).json({ success: false, message: result.message });
            }
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }

    async getProfile(req, res, next) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Chưa đăng nhập!' });
            }
            return res.json({ success: true, data: req.user });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AuthController();
