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
            await companyService.updateCompanyConfig(req.body);
            return res.json({ success: true, message: 'Cập nhật thông tin công ty thành công!' });
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
            await companyService.updatePenaltiesConfig(req.body);
            return res.json({ success: true, message: 'Cập nhật cấu hình ca làm việc và thang phạt thành công!' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new CompanyController();
