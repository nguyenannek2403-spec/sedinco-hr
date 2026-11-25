const authService = require('../services/authService');
const { sendSuccess, sendError } = require('../utils/responseHelper');

const bankLookupRateWindow = new Map();
function checkBankLookupRateLimit(actorKey, maxPerMinute = 25) {
    const now = Date.now();
    const windowStart = now - 60000;
    if (bankLookupRateWindow.size > 500) {
        for (const [k, stamps] of bankLookupRateWindow.entries()) {
            const active = stamps.filter((t) => t > windowStart);
            if (active.length === 0) bankLookupRateWindow.delete(k);
            else bankLookupRateWindow.set(k, active);
        }
    }
    const existing = (bankLookupRateWindow.get(actorKey) || []).filter((t) => t > windowStart);
    if (existing.length >= maxPerMinute) {
        bankLookupRateWindow.set(actorKey, existing);
        return false;
    }
    existing.push(now);
    bankLookupRateWindow.set(actorKey, existing);
    return true;
}

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
                return res.status(result.statusCode || 401).json({
                    success: false,
                    code: result.code || undefined,
                    message: result.message
                });
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

    async updatePreferences(req, res, next) {
        try {
            const theme_preference = req.body.theme_preference ?? req.body.theme;
            const font_scale = req.body.font_scale;
            const result = await authService.updateUserPreferences(req.user, { theme_preference, font_scale });
            if (!result.success) {
                return res.status(result.statusCode || 400).json({ success: false, message: result.message });
            }
            return res.json({ success: true, data: result.data });
        } catch (err) {
            next(err);
        }
    }

    async updateBankCard(req, res, next) {
        try {
            const result = await authService.updateBankCard(req.user, req.body || {});
            return res.json({
                success: true,
                message: result.message,
                data: result.data
            });
        } catch (err) {
            next(err);
        }
    }

    async lookupBankAccount(req, res, next) {
        try {
            const actorKey = String(req.user?.ma_nv || req.user?.username || req.ip || 'anon');
            if (!checkBankLookupRateLimit(actorKey)) {
                res.setHeader('Retry-After', '60');
                return res.status(429).json({
                    success: false,
                    code: '429',
                    message: 'Bạn tra cứu quá nhanh! Vui lòng đợi ít phút hoặc nhập họ tên chủ thẻ bằng tay.'
                });
            }
            const { bin, accountNumber } = req.body || {};
            const bankLookupService = require('../services/bankLookupService');
            const result = await bankLookupService.lookupBankAccount({ bin, accountNumber });
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async updateSelfAvatar(req, res, next) {
        try {
            const { avatar_url } = req.body || {};
            const result = await authService.updateSelfAvatar(req.user, avatar_url);
            return res.json({
                success: true,
                message: result.message,
                data: result.data
            });
        } catch (err) {
            next(err);
        }
    }

    async updateAvatar(req, res, next) {
        try {
            const { ma_nv, avatar_url } = req.body || {};
            if (!ma_nv) {
                const result = await authService.updateSelfAvatar(req.user, avatar_url);
                return res.json({ success: true, message: result.message, data: result.data });
            }
            const result = await authService.updateAvatar(ma_nv, avatar_url, req.user);
            if (!result.success) {
                return res.status(403).json({ success: false, message: result.message });
            }
            return res.json({ success: true, data: result.data });
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

    async getZaloStatus(req, res, next) {
        try {
            const data = await authService.getZaloLinkStatus(req.user);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async linkZalo(req, res, next) {
        try {
            const zalo_token = req.body?.zalo_access_token || req.body?.zalo_token || req.headers['x-zalo-access-token'];
            if (!req.user || !req.user.ma_nv) {
                return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập tài khoản nhân viên để liên kết Zalo!' });
            }
            const data = await authService.bindZalo(req.user.ma_nv, zalo_token, req.user);
            return res.json({ success: true, message: 'Đã liên kết tài khoản Zalo với mã nhân viên!', data });
        } catch (err) {
            next(err);
        }
    }

    async unlinkZalo(req, res, next) {
        try {
            const data = await authService.unlinkZaloAccount(req.user);
            return res.json({ success: true, message: 'Đã hủy liên kết tài khoản Zalo!', data });
        } catch (err) {
            next(err);
        }
    }

    async verifyZaloPhone(req, res, next) {
        try {
            const phone_token = req.body?.phone_token || req.body?.code || '';
            const zalo_access_token = req.body?.zalo_access_token || req.body?.access_token || req.headers['x-zalo-access-token'] || '';
            const data = await authService.verifyZaloPhone(req.user, { phone_token, zalo_access_token });
            return res.json({ success: true, message: data.message, data });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AuthController();
