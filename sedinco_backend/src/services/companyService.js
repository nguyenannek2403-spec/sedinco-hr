const { query } = require('../config/db');
const { logAuditEvent } = require('../middlewares/authMiddleware');

const DEFAULT_COMPANY_SETTINGS = {
    work_start: '08:00',
    lunch_start: '12:00',
    lunch_end: '13:30',
    work_end: '17:30',
    grace_period_minutes: 15,
    penalty_per_minute: 2000,
    penalty_fixed_block: 50000,
    penalty_salary_percent: 0,
    standard_work_days: 26,
    probation_salary_percent: 85,
    ot_rate_weekday: 1.5,
    ot_rate_weekend: 2.0,
    ot_rate_holiday: 3.0,
    custom_ot_hourly_rate: 0,
    insurance_rate: 10.5,
    log_retention_days: 30,
    office_ip_whitelist: ''
};

function normalizeIp(rawIp) {
    if (!rawIp) return '';
    const first = String(rawIp).split(',')[0].trim();
    return first.replace(/^::ffff:/i, '');
}

function parseAllowedLocations(rawJson, fallbackLat = 16.0544, fallbackLng = 108.2022, fallbackRadius = 500) {
    const defaultList = [
        {
            id: 'loc_hq_1',
            name: 'Trụ sở chính Đà Nẵng',
            lat: Number(fallbackLat) || 16.0544,
            lng: Number(fallbackLng) || 108.2022,
            radius: Number(fallbackRadius) || 500
        }
    ];
    if (!rawJson) return defaultList;
    if (Array.isArray(rawJson)) return rawJson.length > 0 ? rawJson : defaultList;
    try {
        const parsed = JSON.parse(rawJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((item, idx) => ({
                id: item.id || `loc_${idx + 1}`,
                name: String(item.name || `Địa điểm ${idx + 1}`).trim(),
                lat: Number(item.lat) || 16.0544,
                lng: Number(item.lng) || 108.2022,
                radius: Number(item.radius) || 300
            }));
        }
    } catch {}
    return defaultList;
}

class CompanyService {
    async getCompanyConfig(clientIp = '') {
        const results = await query('SELECT * FROM company_settings LIMIT 1');
        const row = results?.[0] || {};
        const allowed_locations = parseAllowedLocations(
            row.allowed_locations,
            row.latitude,
            row.longitude,
            row.radius_meters
        );
        const office_ip_whitelist = String(row.office_ip_whitelist || '').trim();
        const normalizedClientIp = normalizeIp(clientIp);
        const whitelistArr = office_ip_whitelist
            .split(',')
            .map(s => normalizeIp(s))
            .filter(Boolean);
        const is_matching_office_wifi = Boolean(
            normalizedClientIp && whitelistArr.includes(normalizedClientIp)
        );

        return {
            ...DEFAULT_COMPANY_SETTINGS,
            ...row,
            work_start: row.work_start || DEFAULT_COMPANY_SETTINGS.work_start,
            lunch_start: row.lunch_start || DEFAULT_COMPANY_SETTINGS.lunch_start,
            lunch_end: row.lunch_end || DEFAULT_COMPANY_SETTINGS.lunch_end,
            work_end: row.work_end || DEFAULT_COMPANY_SETTINGS.work_end,
            standard_work_days: Number(row.standard_work_days) || DEFAULT_COMPANY_SETTINGS.standard_work_days,
            probation_salary_percent: Number(row.probation_salary_percent) || DEFAULT_COMPANY_SETTINGS.probation_salary_percent,
            ot_rate_weekday: Number(row.ot_rate_weekday) || DEFAULT_COMPANY_SETTINGS.ot_rate_weekday,
            ot_rate_weekend: Number(row.ot_rate_weekend) || DEFAULT_COMPANY_SETTINGS.ot_rate_weekend,
            ot_rate_holiday: Number(row.ot_rate_holiday) || DEFAULT_COMPANY_SETTINGS.ot_rate_holiday,
            custom_ot_hourly_rate: Number(row.custom_ot_hourly_rate) || 0,
            insurance_rate: row.insurance_rate !== undefined && row.insurance_rate !== null ? Number(row.insurance_rate) : DEFAULT_COMPANY_SETTINGS.insurance_rate,
            log_retention_days: Number(row.log_retention_days) || DEFAULT_COMPANY_SETTINGS.log_retention_days,
            allowed_locations,
            office_ip_whitelist,
            current_client_ip: normalizedClientIp,
            is_matching_office_wifi
        };
    }

    async updateCompanyConfig(data, current_user = null, clientIp = '') {
        const current = await this.getCompanyConfig(clientIp);

        let locationsList = current.allowed_locations;
        if (data.allowed_locations !== undefined) {
            locationsList = parseAllowedLocations(
                data.allowed_locations,
                data.latitude ?? current.latitude,
                data.longitude ?? current.longitude,
                data.radius_meters ?? current.radius_meters
            );
        }

        const primaryLoc = locationsList[0] || { lat: 16.0544, lng: 108.2022, radius: 500 };

        const {
            company_name = current.company_name || data.name || 'CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO',
            phone = current.phone,
            address = current.address,
            tax_code = current.tax_code,
            logo_url = current.logo_url,
            work_start = current.work_start || '08:00',
            work_end = current.work_end || '17:30',
            lunch_start = current.lunch_start || '12:00',
            lunch_end = current.lunch_end || '13:30',
            grace_period_minutes = current.grace_period_minutes !== undefined ? current.grace_period_minutes : 15,
            penalty_per_minute = current.penalty_per_minute !== undefined ? current.penalty_per_minute : 2000,
            penalty_fixed_block = current.penalty_fixed_block !== undefined ? current.penalty_fixed_block : 50000,
            penalty_salary_percent = current.penalty_salary_percent !== undefined ? current.penalty_salary_percent : 0,
            standard_work_days = current.standard_work_days !== undefined ? current.standard_work_days : 26,
            probation_salary_percent = current.probation_salary_percent !== undefined ? current.probation_salary_percent : 85,
            ot_rate_weekday = current.ot_rate_weekday !== undefined ? current.ot_rate_weekday : 1.5,
            ot_rate_weekend = current.ot_rate_weekend !== undefined ? current.ot_rate_weekend : 2.0,
            ot_rate_holiday = current.ot_rate_holiday !== undefined ? current.ot_rate_holiday : 3.0,
            custom_ot_hourly_rate = current.custom_ot_hourly_rate !== undefined ? current.custom_ot_hourly_rate : 0,
            insurance_rate = current.insurance_rate !== undefined ? current.insurance_rate : 10.5,
            log_retention_days = current.log_retention_days !== undefined ? current.log_retention_days : 30,
            latitude = data.latitude !== undefined ? data.latitude : primaryLoc.lat,
            longitude = data.longitude !== undefined ? data.longitude : primaryLoc.lng,
            radius_meters = data.radius_meters !== undefined ? data.radius_meters : (data.geofence_radius !== undefined ? data.geofence_radius : primaryLoc.radius),
            office_ip_whitelist = data.office_ip_whitelist !== undefined ? String(data.office_ip_whitelist).trim() : (current.office_ip_whitelist || '')
        } = data;

        const targetId = current.id || 1;
        const allowedLocationsJson = JSON.stringify(locationsList);

        await query(
            `UPDATE company_settings SET 
                company_name=?, phone=?, address=?, tax_code=?, logo_url=?,
                work_start=?, work_end=?, lunch_start=?, lunch_end=?,
                grace_period_minutes=?, penalty_per_minute=?, penalty_fixed_block=?, penalty_salary_percent=?,
                standard_work_days=?, probation_salary_percent=?,
                ot_rate_weekday=?, ot_rate_weekend=?, ot_rate_holiday=?, custom_ot_hourly_rate=?,
                insurance_rate=?, log_retention_days=?,
                latitude=?, longitude=?, radius_meters=?,
                allowed_locations=?, office_ip_whitelist=?
            WHERE id=?`,
            [
                company_name, phone, address, tax_code, logo_url,
                work_start, work_end, lunch_start, lunch_end,
                Number(grace_period_minutes) || 0, Number(penalty_per_minute) || 0, Number(penalty_fixed_block) || 0, Number(penalty_salary_percent) || 0,
                Number(standard_work_days) || 26, Number(probation_salary_percent) || 85,
                Number(ot_rate_weekday) || 1.5, Number(ot_rate_weekend) || 2.0, Number(ot_rate_holiday) || 3.0, Number(custom_ot_hourly_rate) || 0,
                Number(insurance_rate) >= 0 ? Number(insurance_rate) : 10.5, Number(log_retention_days) || 30,
                Number(latitude), Number(longitude), Number(radius_meters),
                allowedLocationsJson, office_ip_whitelist,
                targetId
            ]
        );

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'admin',
                actor_role: current_user.role || 'admin',
                action: 'UPDATE_COMPANY_SETTINGS',
                resource: 'company_settings',
                details: {
                    work_start,
                    lunch_start,
                    lunch_end,
                    work_end,
                    standard_work_days,
                    locations_count: locationsList.length,
                    office_ip_whitelist
                }
            });
        }

        const updated = await this.getCompanyConfig(clientIp);
        return { success: true, data: updated };
    }

    async saveCurrentWifiIp(rawClientIp, current_user = null) {
        const cleanIp = normalizeIp(rawClientIp);
        if (!cleanIp) {
            const error = new Error('Không xác định được địa chỉ IP mạng hiện tại!');
            error.statusCode = 400;
            throw error;
        }
        const current = await this.getCompanyConfig(cleanIp);
        const existingIps = String(current.office_ip_whitelist || '')
            .split(',')
            .map(s => normalizeIp(s))
            .filter(Boolean);
        if (!existingIps.includes(cleanIp)) {
            existingIps.push(cleanIp);
        }
        const updatedWhitelist = existingIps.join(', ');
        const res = await this.updateCompanyConfig({ office_ip_whitelist: updatedWhitelist }, current_user, cleanIp);
        return {
            success: true,
            saved_ip: cleanIp,
            office_ip_whitelist: updatedWhitelist,
            data: res.data
        };
    }

    async resetToDefaults(current_user = null, clientIp = '') {
        return this.updateCompanyConfig(DEFAULT_COMPANY_SETTINGS, current_user, clientIp);
    }

    async getPenaltiesConfig() {
        const conf = await this.getCompanyConfig();
        return {
            work_start: conf.work_start || '08:00',
            work_end: conf.work_end || '17:30',
            lunch_start: conf.lunch_start || '12:00',
            lunch_end: conf.lunch_end || '13:30',
            grace_period_minutes: conf.grace_period_minutes !== undefined ? Number(conf.grace_period_minutes) : 15,
            penalty_per_minute: conf.penalty_per_minute !== undefined ? Number(conf.penalty_per_minute) : 2000,
            penalty_fixed_block: conf.penalty_fixed_block !== undefined ? Number(conf.penalty_fixed_block) : 50000,
            penalty_salary_percent: conf.penalty_salary_percent !== undefined ? Number(conf.penalty_salary_percent) : 0,
            standard_work_days: conf.standard_work_days || 26,
            probation_salary_percent: conf.probation_salary_percent || 85,
            ot_rate_weekday: conf.ot_rate_weekday || 1.5,
            ot_rate_weekend: conf.ot_rate_weekend || 2.0,
            ot_rate_holiday: conf.ot_rate_holiday || 3.0,
            custom_ot_hourly_rate: conf.custom_ot_hourly_rate || 0,
            insurance_rate: conf.insurance_rate !== undefined ? Number(conf.insurance_rate) : 10.5,
            log_retention_days: conf.log_retention_days || 30
        };
    }

    async updatePenaltiesConfig(data, current_user = null) {
        return this.updateCompanyConfig(data, current_user);
    }
}

module.exports = new CompanyService();
module.exports.parseAllowedLocations = parseAllowedLocations;
module.exports.normalizeIp = normalizeIp;
