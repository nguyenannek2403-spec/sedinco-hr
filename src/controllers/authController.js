const authService = require('../services/authService');
const { sendSuccess, sendError } = require('../utils/responseHelper');

class AuthController {
    async login(req, res, next) {
        try {
            const { ma_nv, password } = req.body;
            const result = await authService.employeeLogin(ma_nv, password);
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
            const result = await authService.adminLogin(username, password);
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
            const result = await authService.changePassword(ma_nv, old_password, new_password);
            if (!result.success) {
                return res.json({ success: false, message: result.message });
            }
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }

    async updateAvatar(req, res, next) {
        try {
            const { ma_nv, avatar_url } = req.body;
            const result = await authService.updateAvatar(ma_nv, avatar_url);
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AuthController();
