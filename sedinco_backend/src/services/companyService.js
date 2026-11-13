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
    office_ip_whitelist: '',
    announcement_text: ''
};

function normalizeIp(rawIp) {
    if (!rawIp) return '';
    const first = String(rawIp).split(',')[0].trim();
    return first.replace(/^::ffff:/i, '');
}

function toFiniteNumber(val, fallback) {
    if (val === '' || val === null || val === undefined) return fallback;
    const num = Number(val);
    return Number.isFinite(num) ? num : fallback;
}

function toSafeText(val, fallback = '') {
    if (val === undefined || val === null) return fallback;
    return String(val).trim();
}

function sanitizeLocationsList(items, defaultLat = 16.0544, defaultLng = 108.2022, defaultRadius = 500) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const cleaned = items
        .filter((item) => item && typeof item === 'object')
        .map((item, idx) => ({
            id: toSafeText(item.id, `loc_${idx + 1}`) || `loc_${idx + 1}`,
            name: toSafeText(item.name, `Địa điểm ${idx + 1}`) || `Địa điểm ${idx + 1}`,
            lat: toFiniteNumber(item.lat, defaultLat),
            lng: toFiniteNumber(item.lng, defaultLng),
            radius: Math.max(20, toFiniteNumber(item.radius, defaultRadius))
        }));
    return cleaned.length > 0 ? cleaned : null;
}

function parseAllowedLocations(rawJson, fallbackLat = 16.0544, fallbackLng = 108.2022, fallbackRadius = 500) {
    const safeLat = toFiniteNumber(fallbackLat, 16.0544);
    const safeLng = toFiniteNumber(fallbackLng, 108.2022);
    const safeRadius = Math.max(20, toFiniteNumber(fallbackRadius, 500));
    const defaultList = [
        {
            id: 'loc_hq_1',
            name: 'Trụ sở chính Đà Nẵng',
            lat: safeLat,
            lng: safeLng,
            radius: safeRadius
        }
    ];
    if (!rawJson) return defaultList;
    if (Array.isArray(rawJson)) {
        return sanitizeLocationsList(rawJson, safeLat, safeLng, safeRadius) || defaultList;
    }
    if (typeof rawJson === 'string') {
        try {
            const parsed = JSON.parse(rawJson);
            return sanitizeLocationsList(parsed, safeLat, safeLng, safeRadius) || defaultList;
        } catch {
            return defaultList;
        }
    }
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
            announcement_text: row.announcement_text ? String(row.announcement_text) : '',
            announcement_updated_at: row.announcement_updated_at || null,
            current_client_ip: normalizedClientIp,
            is_matching_office_wifi
        };
    }

    async updateCompanyConfig(data = {}, current_user = null, clientIp = '') {
        const payload = data && typeof data === 'object' ? data : {};
        const current = await this.getCompanyConfig(clientIp);

        let locationsList = parseAllowedLocations(
            current.allowed_locations,
            current.latitude,
            current.longitude,
            current.radius_meters
        );
        if (payload.allowed_locations !== undefined) {
            locationsList = parseAllowedLocations(
                payload.allowed_locations,
                toFiniteNumber(payload.latitude, toFiniteNumber(current.latitude, 16.0544)),
                toFiniteNumber(payload.longitude, toFiniteNumber(current.longitude, 108.2022)),
                toFiniteNumber(payload.radius_meters, toFiniteNumber(current.radius_meters, 500))
            );
        }

        const primaryLoc = locationsList[0] || { lat: 16.0544, lng: 108.2022, radius: 500 };

        const company_name = toSafeText(payload.company_name ?? payload.name ?? current.company_name, 'CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO') || 'CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO';
        const phone = payload.phone !== undefined ? (payload.phone === null ? null : String(payload.phone).trim()) : (current.phone ?? null);
        const address = payload.address !== undefined ? (payload.address === null ? null : String(payload.address).trim()) : (current.address ?? null);
        const tax_code = payload.tax_code !== undefined ? (payload.tax_code === null ? null : String(payload.tax_code).trim()) : (current.tax_code ?? null);
        const logo_url = payload.logo_url !== undefined ? (payload.logo_url === null ? null : String(payload.logo_url).trim()) : (current.logo_url ?? null);

        const work_start = toSafeText(payload.work_start, current.work_start || '08:00') || '08:00';
        const work_end = toSafeText(payload.work_end, current.work_end || '17:30') || '17:30';
        const lunch_start = toSafeText(payload.lunch_start, current.lunch_start || '12:00') || '12:00';
        const lunch_end = toSafeText(payload.lunch_end, current.lunch_end || '13:30') || '13:30';

        const grace_period_minutes = Math.max(0, Math.round(toFiniteNumber(payload.grace_period_minutes, toFiniteNumber(current.grace_period_minutes, 15))));
        const penalty_per_minute = Math.max(0, toFiniteNumber(payload.penalty_per_minute, toFiniteNumber(current.penalty_per_minute, 2000)));
        const penalty_fixed_block = Math.max(0, toFiniteNumber(payload.penalty_fixed_block, toFiniteNumber(current.penalty_fixed_block, 50000)));
        const penalty_salary_percent = Math.max(0, toFiniteNumber(payload.penalty_salary_percent, toFiniteNumber(current.penalty_salary_percent, 0)));
        const standard_work_days = Math.max(1, toFiniteNumber(payload.standard_work_days, toFiniteNumber(current.standard_work_days, 26)));
        const probation_salary_percent = Math.min(100, Math.max(0, toFiniteNumber(payload.probation_salary_percent, toFiniteNumber(current.probation_salary_percent, 85))));
        const ot_rate_weekday = Math.max(0, toFiniteNumber(payload.ot_rate_weekday, toFiniteNumber(current.ot_rate_weekday, 1.5)));
        const ot_rate_weekend = Math.max(0, toFiniteNumber(payload.ot_rate_weekend, toFiniteNumber(current.ot_rate_weekend, 2.0)));
        const ot_rate_holiday = Math.max(0, toFiniteNumber(payload.ot_rate_holiday, toFiniteNumber(current.ot_rate_holiday, 3.0)));
        const custom_ot_hourly_rate = Math.max(0, toFiniteNumber(payload.custom_ot_hourly_rate, toFiniteNumber(current.custom_ot_hourly_rate, 0)));
        const insurance_rate = Math.max(0, toFiniteNumber(payload.insurance_rate, toFiniteNumber(current.insurance_rate, 10.5)));
        const log_retention_days = Math.max(1, Math.round(toFiniteNumber(payload.log_retention_days, toFiniteNumber(current.log_retention_days, 30))));

        const latitude = toFiniteNumber(payload.latitude, primaryLoc.lat);
        const longitude = toFiniteNumber(payload.longitude, primaryLoc.lng);
        const rawRadiusInput = payload.radius_meters !== undefined ? payload.radius_meters : payload.geofence_radius;
        const radius_meters = Math.max(20, Math.round(toFiniteNumber(rawRadiusInput, primaryLoc.radius)));

        const office_ip_whitelist = payload.office_ip_whitelist !== undefined
            ? toSafeText(payload.office_ip_whitelist, '')
            : toSafeText(current.office_ip_whitelist, '');

        const allowedLocationsJson = JSON.stringify(locationsList);
        const params = [
            company_name, phone, address, tax_code, logo_url,
            work_start, work_end, lunch_start, lunch_end,
            grace_period_minutes, penalty_per_minute, penalty_fixed_block, penalty_salary_percent,
            standard_work_days, probation_salary_percent,
            ot_rate_weekday, ot_rate_weekend, ot_rate_holiday, custom_ot_hourly_rate,
            insurance_rate, log_retention_days,
            latitude, longitude, radius_meters,
            allowedLocationsJson, office_ip_whitelist
        ];

        const existingRows = await query('SELECT id FROM company_settings LIMIT 1');
        if (existingRows && existingRows.length > 0) {
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
                [...params, existingRows[0].id]
            );
        } else {
            await query(
                `INSERT INTO company_settings (
                    company_name, phone, address, tax_code, logo_url,
                    work_start, work_end, lunch_start, lunch_end,
                    grace_period_minutes, penalty_per_minute, penalty_fixed_block, penalty_salary_percent,
                    standard_work_days, probation_salary_percent,
                    ot_rate_weekday, ot_rate_weekend, ot_rate_holiday, custom_ot_hourly_rate,
                    insurance_rate, log_retention_days,
                    latitude, longitude, radius_meters,
                    allowed_locations, office_ip_whitelist
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params
            );
        }

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

        if (payload.announcement_text !== undefined) {
            const cleanAnnouncement = payload.announcement_text === null
                ? ''
                : String(payload.announcement_text).trim().slice(0, 2000);
            await query(
                'UPDATE company_settings SET announcement_text = ?, announcement_updated_at = ?',
                [cleanAnnouncement || null, cleanAnnouncement ? new Date() : null]
            );
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
