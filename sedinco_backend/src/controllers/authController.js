const authService = require('../services/authService');
const { sendSuccess, sendError } = require('../utils/responseHelper');

class AuthController {
    async login(req, res, next) {
        try {
            const identifier = req.body.identifier || req.body.phone || req.body.login_username || req.body.username || req.body.ma_nv;
            const { password, zalo_user_id, zalo_access_token, zalo_token, device_id, device_name, device_info } = req.body;
            const ip = req.clientIp || req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
            const result = await authService.employeeLogin(identifier, password, ip, {
                zalo_user_id,
                zalo_access_token: zalo_access_token || zalo_token || req.headers['x-zalo-access-token'] || null,
                device_id,
                device_name,
                device_info,
                user_agent: req.headers['user-agent'] || ''
            });
            if (!result.success) {
                const status = result.statusCode || 401;
                return res.status(status).json({ success: false, message: result.message, statusCode: status, request_id: req.id });
            }
            return res.json({ success: true, data: result.data });
        } catch (err) {
            next(err);
        }
    }

    async zaloAutoLogin(req, res, next) {
        try {
            const { zalo_user_id, zalo_access_token, zalo_token, device_id, device_name, device_info, ma_nv } = req.body;
            const ip = req.clientIp || req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
            const result = await authService.zaloAutoLogin({
                zalo_user_id,
                zalo_access_token: zalo_access_token || zalo_token || req.headers['x-zalo-access-token'] || null,
                device_id,
                device_name,
                device_info,
                user_agent: req.headers['user-agent'] || '',
                ma_nv_hint: ma_nv
            }, ip);
            if (!result.success) {
                return res.status(result.statusCode || 401).json({ success: false, message: result.message });
            }
            return res.json({ success: true, data: result.data });
        } catch (err) {
            next(err);
        }
    }

    async adminLogin(req, res, next) {
        try {
            const { username, password } = req.body;
            const ip = req.clientIp || req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
            const result = await authService.adminLogin(username, password, ip);
            if (!result.success) {
                const status = result.statusCode || 401;
                return res.status(status).json({ success: false, message: result.message, statusCode: status, request_id: req.id });
            }
            return res.json({ success: true, data: result.data });
        } catch (err) {
            next(err);
        }
    }

    async adminRegister(req, res, next) {
        try {
            const { username, password, ho_ten } = req.body;
            const result = await authService.adminRegister(username, password, ho_ten, req.user);
            if (!result.success) {
                const code = result.statusCode || 400;
                return res.status(code).json({ success: false, message: result.message });
            }
            return res.json({ success: true, message: 'Tạo tài khoản quản trị thành công!' });
        } catch (err) {
            next(err);
        }
    }

    async changePassword(req, res, next) {
        try {
            const targetMaNv = req.body.ma_nv || req.user?.ma_nv || req.user?.username;
            const oldPass = req.body.old_password ?? req.body.oldPassword;
            const newPass = req.body.new_password ?? req.body.newPassword;
            const newUsername = req.body.new_username ?? req.body.login_username ?? req.body.username;
            const phone = req.body.phone;
            const result = await authService.changePassword(targetMaNv, oldPass, newPass, req.user, {
                new_username: newUsername,
                phone
            });
            if (!result.success) {
                return res.status(result.statusCode || 400).json({ success: false, message: result.message });
            }
            return res.json({
                success: true,
                message: result.message,
                ...(result.data ? { data: result.data } : {}),
                ...(result.token ? { token: result.token } : {})
            });
        } catch (err) {
            next(err);
        }
    }

    async updateAccountCredentials(req, res, next) {
        try {
            const oldPass = req.body.old_password ?? req.body.oldPassword;
            const newPass = req.body.new_password ?? req.body.newPassword;
            const newUsername = req.body.new_username ?? req.body.login_username ?? req.body.username;
            const phone = req.body.phone;
            const result = await authService.updateAccountCredentials(req.user, {
                old_password: oldPass,
                new_password: newPass,
                new_username: newUsername,
                phone
            });
            if (!result.success) {
                return res.status(result.statusCode || 400).json({ success: false, message: result.message });
            }
            return res.json({
                success: true,
                message: result.message,
                data: result.data,
                ...(result.token ? { token: result.token } : {})
            });
        } catch (err) {
            next(err);
        }
    }

    async updateTheme(req, res, next) {
        try {
            const theme = req.body.theme_preference ?? req.body.theme;
            const result = await authService.updateThemePreference(req.user, theme);
            if (!result.success) {
                return res.status(result.statusCode || 400).json({ success: false, message: result.message });
            }
            return res.json({ success: true, data: result.data });
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
            const data = await authService.getProfile(req.user);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AuthController();
