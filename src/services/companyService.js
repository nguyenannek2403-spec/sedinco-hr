const { query } = require('../config/db');

class CompanyService {
    async getCompanyConfig() {
        const results = await query('SELECT * FROM company_settings LIMIT 1');
        return results?.[0] || {};
    }

    async updateCompanyConfig({ company_name, phone, address, tax_code, logo_url }) {
        await query(
            'UPDATE company_settings SET company_name=?, phone=?, address=?, tax_code=?, logo_url=? WHERE id=1',
            [company_name, phone, address, tax_code, logo_url]
        );
        return { success: true };
    }
}

module.exports = new CompanyService();
