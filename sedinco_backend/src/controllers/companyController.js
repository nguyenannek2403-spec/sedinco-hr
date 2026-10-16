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
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new CompanyController();
