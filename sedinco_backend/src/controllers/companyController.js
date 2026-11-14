const companyService = require('../services/companyService');

function extractClientIp(req) {
    // Chỉ tin cậy IP đã qua filter trust proxy từ app middleware; tuyệt đối không đọc x-forwarded-for thô
    return req.clientIp || req.ip || (req.socket && req.socket.remoteAddress) || '';
}

class CompanyController {
    async getCompany(req, res, next) {
        try {
            const clientIp = extractClientIp(req);
            const data = await companyService.getCompanyConfig(clientIp);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async updateCompany(req, res, next) {
        try {
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const clientIp = extractClientIp(req);
            const result = await companyService.updateCompanyConfig(payload, req.user, clientIp);
            return res.json({ success: true, message: 'Lưu cấu hình công ty thành công!', data: result.data });
        } catch (err) {
            console.error('[CompanyController.updateCompany]', err);
            const status = err.statusCode || 400;
            if (status >= 400 && status < 500) {
                return res.status(status).json({
                    success: false,
                    message: err.message || 'Dữ liệu cấu hình không hợp lệ, vui lòng kiểm tra lại!'
                });
            }
            next(err);
        }
    }

    async saveWifiIp(req, res, next) {
        try {
            const clientIp = req.body?.ip || extractClientIp(req);
            const result = await companyService.saveCurrentWifiIp(clientIp, req.user);
            return res.json({
                success: true,
                message: `Đã lưu địa chỉ IP mạng Wi-Fi (${result.saved_ip}) vào danh sách Wi-Fi Công ty!`,
                saved_ip: result.saved_ip,
                data: result.data
            });
        } catch (err) {
            next(err);
        }
    }

    async resetDefaults(req, res, next) {
        try {
            const clientIp = extractClientIp(req);
            const result = await companyService.resetToDefaults(req.user, clientIp);
            return res.json({ success: true, message: 'Đã khôi phục toàn bộ thông số công ty về mặc định chuẩn!', data: result.data });
        } catch (err) {
            next(err);
        }
    }

    async getPenalties(req, res, next) {
        try {
            const data = await companyService.getPenaltiesConfig();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async updatePenalties(req, res, next) {
        try {
            const result = await companyService.updatePenaltiesConfig(req.body, req.user);
            return res.json({ success: true, message: 'Cập nhật cấu hình ca làm việc và thang phạt thành công!', data: result.data });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new CompanyController();
