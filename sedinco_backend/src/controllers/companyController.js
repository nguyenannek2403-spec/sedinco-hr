const companyService = require('../services/companyService');

class CompanyController {
    async getCompany(req, res, next) {
        try {
            const data = await companyService.getCompanyConfig();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async updateCompany(req, res, next) {
        try {
            const result = await companyService.updateCompanyConfig(req.body, req.user);
            return res.json({ success: true, message: 'Cập nhật cấu hình hệ thống công ty thành công!', data: result.data });
        } catch (err) {
            next(err);
        }
    }

    async resetDefaults(req, res, next) {
        try {
            const result = await companyService.resetToDefaults(req.user);
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
