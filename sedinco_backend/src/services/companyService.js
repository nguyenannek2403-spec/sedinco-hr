const { query } = require('../config/db');

class CompanyService {
    async getCompanyConfig() {
        const results = await query('SELECT * FROM company_settings LIMIT 1');
        return results?.[0] || {};
    }

    async updateCompanyConfig(data) {
        const current = await this.getCompanyConfig();
        const {
            company_name = current.company_name,
            phone = current.phone,
            address = current.address,
            tax_code = current.tax_code,
            logo_url = current.logo_url,
            work_start = current.work_start || '08:00',
            work_end = current.work_end || '17:00',
            lunch_start = current.lunch_start || '12:00',
            lunch_end = current.lunch_end || '13:00',
            grace_period_minutes = current.grace_period_minutes !== undefined ? current.grace_period_minutes : 15,
            penalty_per_minute = current.penalty_per_minute !== undefined ? current.penalty_per_minute : 2000,
            penalty_fixed_block = current.penalty_fixed_block !== undefined ? current.penalty_fixed_block : 50000,
            penalty_salary_percent = current.penalty_salary_percent !== undefined ? current.penalty_salary_percent : 0
        } = data;

        await query(
            `UPDATE company_settings SET 
                company_name=?, phone=?, address=?, tax_code=?, logo_url=?,
                work_start=?, work_end=?, lunch_start=?, lunch_end=?,
                grace_period_minutes=?, penalty_per_minute=?, penalty_fixed_block=?, penalty_salary_percent=? 
            WHERE id=1`,
            [
                company_name, phone, address, tax_code, logo_url,
                work_start, work_end, lunch_start, lunch_end,
                grace_period_minutes, penalty_per_minute, penalty_fixed_block, penalty_salary_percent
            ]
        );
        return { success: true };
    }

    async getPenaltiesConfig() {
        const conf = await this.getCompanyConfig();
        return {
            work_start: conf.work_start || '08:00',
            work_end: conf.work_end || '17:00',
            lunch_start: conf.lunch_start || '12:00',
            lunch_end: conf.lunch_end || '13:00',
            grace_period_minutes: conf.grace_period_minutes !== undefined ? Number(conf.grace_period_minutes) : 15,
            penalty_per_minute: conf.penalty_per_minute !== undefined ? Number(conf.penalty_per_minute) : 2000,
            penalty_fixed_block: conf.penalty_fixed_block !== undefined ? Number(conf.penalty_fixed_block) : 50000,
            penalty_salary_percent: conf.penalty_salary_percent !== undefined ? Number(conf.penalty_salary_percent) : 0
        };
    }

    async updatePenaltiesConfig(data) {
        return this.updateCompanyConfig(data);
    }
}

module.exports = new CompanyService();
