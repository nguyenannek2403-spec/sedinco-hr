const { query } = require('../config/db');
const { logAuditEvent } = require('../middlewares/authMiddleware');
const { getMonthlyStandardWorkdays, getVietnamDateParts } = require('../utils/timeHelper');

const DEFAULT_COMPANY_SETTINGS = {
    work_start: '08:00',
    lunch_start: '12:00',
    lunch_end: '13:30',
    work_end: '17:30',
    grace_period_minutes: 15,
    penalty_per_minute: 2000,
    penalty_fixed_block: 50000,
    penalty_salary_percent: 0,
    late_policy_type: 'PER_MINUTE',
    free_late_occurrences: 3,
    late_penalty_per_minute: 2000,
    late_penalty_amount: 50000,
    max_late_minutes_for_half_day: 60,
    standard_work_days: 26,
    probation_salary_percent: 85,
    probation_allowance_full: 1,
    ot_rate_weekday: 1.5,
    ot_rate_weekend: 2.0,
    ot_rate_holiday: 3.0,
    custom_ot_hourly_rate: 0,
    ot_calculation_mode: 'APPROVED_OR_AUTO',
    free_late_exempts_halfday: 0,
    negative_salary_policy: 'CLAMP_ZERO',
    insurance_rate: 10.5,
    monthly_paid_leave_limit: 1,
    log_retention_days: 30,
    office_ip_whitelist: '',
    announcement_text: ''
};

function createValidationError(message) {
    const err = new Error(message);
    err.statusCode = 400;
    return err;
}

function normalizeIp(rawIp) {
    if (!rawIp) return '';
    const first = String(rawIp).split(',')[0].trim();
    return first.replace(/^::ffff:/i, '');
}

function parseStrictDecimal(val) {
    if (val === '' || val === null || val === undefined || typeof val === 'boolean') {
        return NaN;
    }
    const normalized = typeof val === 'string' ? val.trim().replace(',', '.') : val;
    if (normalized === '') return NaN;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
}

function toFiniteNumber(val, fallback) {
    const num = parseStrictDecimal(val);
    return Number.isFinite(num) ? num : fallback;
}

function validateNumberRange(rawVal, { label, min, max, integer = false }) {
    const num = parseStrictDecimal(rawVal);
    if (!Number.isFinite(num)) {
        throw createValidationError(`${label} không hợp lệ (vui lòng nhập số hợp lệ)!`);
    }
    if (min !== undefined && num < min) {
        throw createValidationError(`${label} phải lớn hơn hoặc bằng ${String(min).replace('.', ',')}!`);
    }
    if (max !== undefined && num > max) {
        throw createValidationError(`${label} không được vượt quá ${String(max).replace('.', ',')}!`);
    }
    return integer ? Math.round(num) : Math.round(num * 100) / 100;
}

function parseTimeMinutes(rawTime, label) {
    const str = String(rawTime || '').trim();
    const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
        throw createValidationError(`${label} không đúng định dạng giờ (HH:MM)!`);
    }
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        throw createValidationError(`${label} nằm ngoài phạm vi 00:00 – 23:59!`);
    }
    return {
        formatted: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
        minutes: hh * 60 + mm
    };
}

function toSafeText(val, fallback = '') {
    if (val === undefined || val === null) return fallback;
    return String(val).trim();
}

const VALID_ATTENDANCE_METHODS = new Set(['GPS', 'GPS_AND_QR', 'QR_ONLY']);

function sanitizeLocationsList(items, defaultLat = 16.0544, defaultLng = 108.2022, defaultRadius = 500, strict = false) {
    if (!Array.isArray(items) || items.length === 0) {
        if (strict) {
            throw createValidationError('Danh sách địa điểm chấm công không được để trống!');
        }
        return null;
    }
    const cleaned = items
        .filter((item) => item && typeof item === 'object')
        .map((item, idx) => {
            const rawMethod = String(item.attendance_method || 'GPS').trim().toUpperCase();
            let lat = toFiniteNumber(item.lat, defaultLat);
            let lng = toFiniteNumber(item.lng, defaultLng);
            let radius = toFiniteNumber(item.radius, defaultRadius);

            if (strict) {
                lat = validateNumberRange(item.lat ?? defaultLat, {
                    label: `Vĩ độ điểm #${idx + 1}`,
                    min: -90,
                    max: 90
                });
                lng = validateNumberRange(item.lng ?? defaultLng, {
                    label: `Kinh độ điểm #${idx + 1}`,
                    min: -180,
                    max: 180
                });
                const rawRad = parseStrictDecimal(item.radius ?? defaultRadius);
                if (!Number.isFinite(rawRad) || rawRad <= 0) {
                    throw createValidationError(`Bán kính GPS tại điểm #${idx + 1} phải lớn hơn 0 mét!`);
                }
                if (rawRad > 50000) {
                    throw createValidationError(`Bán kính GPS tại điểm #${idx + 1} không được vượt quá 50.000 mét!`);
                }
                radius = Math.max(20, Math.round(rawRad));
            } else {
                radius = Math.max(20, Math.round(radius));
            }

            return {
                id: toSafeText(item.id, `loc_${idx + 1}`) || `loc_${idx + 1}`,
                name: toSafeText(item.name, `Địa điểm ${idx + 1}`) || `Địa điểm ${idx + 1}`,
                lat,
                lng,
                radius,
                attendance_method: VALID_ATTENDANCE_METHODS.has(rawMethod) ? rawMethod : 'GPS'
            };
        });
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
            radius: safeRadius,
            attendance_method: 'GPS'
        }
    ];
    if (!rawJson) return defaultList;
    if (Array.isArray(rawJson)) {
        return sanitizeLocationsList(rawJson, safeLat, safeLng, safeRadius, false) || defaultList;
    }
    if (typeof rawJson === 'string') {
        try {
            const parsed = JSON.parse(rawJson);
            return sanitizeLocationsList(parsed, safeLat, safeLng, safeRadius, false) || defaultList;
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

        const validLatePolicyTypes = ['NONE', 'PER_MINUTE', 'PER_OCCURRENCE', 'DEDUCT_WORKDAY'];
        const normalizedLatePolicy = validLatePolicyTypes.includes(String(row.late_policy_type || '').toUpperCase())
            ? String(row.late_policy_type).toUpperCase()
            : DEFAULT_COMPANY_SETTINGS.late_policy_type;
        const gracePeriod = row.grace_period_minutes !== undefined && row.grace_period_minutes !== null
            ? Number(row.grace_period_minutes)
            : DEFAULT_COMPANY_SETTINGS.grace_period_minutes;
        const penaltyPerMin = row.penalty_per_minute !== undefined && row.penalty_per_minute !== null
            ? Number(row.penalty_per_minute)
            : DEFAULT_COMPANY_SETTINGS.penalty_per_minute;
        const penaltyFixedBlock = row.penalty_fixed_block !== undefined && row.penalty_fixed_block !== null
            ? Number(row.penalty_fixed_block)
            : DEFAULT_COMPANY_SETTINGS.penalty_fixed_block;

        const validOtModes = ['APPROVED_OR_AUTO', 'REQUIRE_APPROVAL', 'AUTO_ACTUAL'];
        const normalizedOtMode = validOtModes.includes(String(row.ot_calculation_mode || '').trim().toUpperCase())
            ? String(row.ot_calculation_mode).trim().toUpperCase()
            : DEFAULT_COMPANY_SETTINGS.ot_calculation_mode;
        const validNegPolicies = ['CLAMP_ZERO', 'SHOW_NEGATIVE'];
        const normalizedNegPolicy = validNegPolicies.includes(String(row.negative_salary_policy || '').trim().toUpperCase())
            ? String(row.negative_salary_policy).trim().toUpperCase()
            : DEFAULT_COMPANY_SETTINGS.negative_salary_policy;

        return {
            ...DEFAULT_COMPANY_SETTINGS,
            ...row,
            work_start: String(row.work_start || DEFAULT_COMPANY_SETTINGS.work_start).slice(0, 5),
            lunch_start: String(row.lunch_start || DEFAULT_COMPANY_SETTINGS.lunch_start).slice(0, 5),
            lunch_end: String(row.lunch_end || DEFAULT_COMPANY_SETTINGS.lunch_end).slice(0, 5),
            work_end: String(row.work_end || DEFAULT_COMPANY_SETTINGS.work_end).slice(0, 5),
            grace_period_minutes: gracePeriod,
            penalty_per_minute: penaltyPerMin,
            penalty_fixed_block: penaltyFixedBlock,
            late_policy_type: normalizedLatePolicy,
            free_late_occurrences: row.free_late_occurrences !== undefined && row.free_late_occurrences !== null
                ? Number(row.free_late_occurrences)
                : DEFAULT_COMPANY_SETTINGS.free_late_occurrences,
            late_penalty_per_minute: row.late_penalty_per_minute !== undefined && row.late_penalty_per_minute !== null
                ? Number(row.late_penalty_per_minute)
                : penaltyPerMin,
            late_penalty_amount: row.late_penalty_amount !== undefined && row.late_penalty_amount !== null
                ? Number(row.late_penalty_amount)
                : penaltyFixedBlock,
            max_late_minutes_for_half_day: row.max_late_minutes_for_half_day !== undefined && row.max_late_minutes_for_half_day !== null
                ? Number(row.max_late_minutes_for_half_day)
                : DEFAULT_COMPANY_SETTINGS.max_late_minutes_for_half_day,
            standard_work_days: getMonthlyStandardWorkdays(getVietnamDateParts().month, getVietnamDateParts().year),
            standard_workdays_mode: 'AUTO_EXCLUDING_SUNDAYS',
            probation_salary_percent: row.probation_salary_percent !== undefined && row.probation_salary_percent !== null
                ? Number(row.probation_salary_percent)
                : DEFAULT_COMPANY_SETTINGS.probation_salary_percent,
            probation_allowance_full: (row.probation_allowance_full === undefined || row.probation_allowance_full === null)
                ? DEFAULT_COMPANY_SETTINGS.probation_allowance_full
                : (Number(row.probation_allowance_full) ? 1 : 0),
            ot_rate_weekday: row.ot_rate_weekday !== undefined && row.ot_rate_weekday !== null
                ? Number(row.ot_rate_weekday)
                : DEFAULT_COMPANY_SETTINGS.ot_rate_weekday,
            ot_rate_weekend: row.ot_rate_weekend !== undefined && row.ot_rate_weekend !== null
                ? Number(row.ot_rate_weekend)
                : DEFAULT_COMPANY_SETTINGS.ot_rate_weekend,
            ot_rate_holiday: row.ot_rate_holiday !== undefined && row.ot_rate_holiday !== null
                ? Number(row.ot_rate_holiday)
                : DEFAULT_COMPANY_SETTINGS.ot_rate_holiday,
            custom_ot_hourly_rate: Number(row.custom_ot_hourly_rate) || 0,
            ot_calculation_mode: normalizedOtMode,
            free_late_exempts_halfday: Number(row.free_late_exempts_halfday) ? 1 : 0,
            negative_salary_policy: normalizedNegPolicy,
            insurance_rate: row.insurance_rate !== undefined && row.insurance_rate !== null
                ? Number(row.insurance_rate)
                : DEFAULT_COMPANY_SETTINGS.insurance_rate,
            monthly_paid_leave_limit: row.monthly_paid_leave_limit !== undefined && row.monthly_paid_leave_limit !== null
                ? Math.max(0, Number(row.monthly_paid_leave_limit))
                : DEFAULT_COMPANY_SETTINGS.monthly_paid_leave_limit,
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

        const toBoolInt = (val, fallback) => {
            if (val === undefined || val === null || val === '') return fallback;
            if (val === true || val === 1 || String(val) === '1' || String(val).toLowerCase() === 'true') return 1;
            if (val === false || val === 0 || String(val) === '0' || String(val).toLowerCase() === 'false') return 0;
            return fallback;
        };

        // Danh sách cột cần cập nhật (True Partial Update Whitelist)
        const columnUpdates = {};
        let logoChanged = false;
        const previousLogoUrl = current.logo_url ?? null;
        let nextLogoUrl = previousLogoUrl;

        // 1. Khối Thông tin công ty & Logo
        if (payload.company_name !== undefined || payload.name !== undefined) {
            const rawName = toSafeText(payload.company_name ?? payload.name, '');
            if (!rawName) {
                throw createValidationError('Tên công ty không được để trống!');
            }
            columnUpdates.company_name = rawName;
        }
        if (payload.phone !== undefined) {
            columnUpdates.phone = payload.phone === null ? null : String(payload.phone).trim();
        }
        if (payload.address !== undefined) {
            columnUpdates.address = payload.address === null ? null : String(payload.address).trim();
        }
        if (payload.tax_code !== undefined) {
            columnUpdates.tax_code = payload.tax_code === null ? null : String(payload.tax_code).trim();
        }
        if (payload.logo_url !== undefined) {
            logoChanged = (payload.logo_url || null) !== (previousLogoUrl || null);
            if (logoChanged) {
                const { validateMediaReference } = require('../utils/mediaValidator');
                nextLogoUrl = validateMediaReference(payload.logo_url, {
                    maxInlineBytes: 185 * 1024,
                    allowNull: true
                });
            } else {
                nextLogoUrl = payload.logo_url || null;
            }
            columnUpdates.logo_url = nextLogoUrl;
        }

        // 2. Khối Bảng tin thông báo nội bộ
        if (payload.announcement_text !== undefined) {
            const cleanAnnouncement = payload.announcement_text === null
                ? ''
                : String(payload.announcement_text).trim().slice(0, 50000);
            columnUpdates.announcement_text = cleanAnnouncement || null;
            columnUpdates.announcement_updated_at = cleanAnnouncement ? new Date() : null;
        }

        // 3. Khối Giờ làm việc (Validate giờ kết thúc sau giờ bắt đầu)
        const hasScheduleField =
            payload.work_start !== undefined ||
            payload.lunch_start !== undefined ||
            payload.lunch_end !== undefined ||
            payload.work_end !== undefined;
        if (hasScheduleField) {
            const ws = parseTimeMinutes(payload.work_start ?? current.work_start ?? '08:00', 'Giờ bắt đầu ca sáng');
            const ls = parseTimeMinutes(payload.lunch_start ?? current.lunch_start ?? '12:00', 'Giờ kết thúc ca sáng');
            const le = parseTimeMinutes(payload.lunch_end ?? current.lunch_end ?? '13:30', 'Giờ bắt đầu ca chiều');
            const we = parseTimeMinutes(payload.work_end ?? current.work_end ?? '17:30', 'Giờ kết thúc ca chiều');

            if (ls.minutes <= ws.minutes) {
                throw createValidationError('Giờ kết thúc ca sáng phải sau giờ bắt đầu ca sáng!');
            }
            if (le.minutes < ls.minutes) {
                throw createValidationError('Giờ bắt đầu ca chiều không được sớm hơn giờ kết thúc ca sáng!');
            }
            if (we.minutes <= le.minutes) {
                throw createValidationError('Giờ kết thúc ca chiều phải sau giờ bắt đầu ca chiều!');
            }

            if (payload.work_start !== undefined) columnUpdates.work_start = ws.formatted;
            if (payload.lunch_start !== undefined) columnUpdates.lunch_start = ls.formatted;
            if (payload.lunch_end !== undefined) columnUpdates.lunch_end = le.formatted;
            if (payload.work_end !== undefined) columnUpdates.work_end = we.formatted;
        }

        // 4. Khối Địa chỉ & Wi-Fi chấm công
        if (payload.allowed_locations !== undefined) {
            const cleanedLocs = sanitizeLocationsList(
                payload.allowed_locations,
                toFiniteNumber(payload.latitude, toFiniteNumber(current.latitude, 16.0544)),
                toFiniteNumber(payload.longitude, toFiniteNumber(current.longitude, 108.2022)),
                toFiniteNumber(payload.radius_meters, toFiniteNumber(current.radius_meters, 500)),
                true
            );
            const primary = cleanedLocs[0] || { lat: 16.0544, lng: 108.2022, radius: 500 };
            columnUpdates.allowed_locations = JSON.stringify(cleanedLocs);
            columnUpdates.latitude = primary.lat;
            columnUpdates.longitude = primary.lng;
            columnUpdates.radius_meters = primary.radius;
        } else {
            if (payload.latitude !== undefined) {
                columnUpdates.latitude = validateNumberRange(payload.latitude, {
                    label: 'Vĩ độ GPS',
                    min: -90,
                    max: 90
                });
            }
            if (payload.longitude !== undefined) {
                columnUpdates.longitude = validateNumberRange(payload.longitude, {
                    label: 'Kinh độ GPS',
                    min: -180,
                    max: 180
                });
            }
            if (payload.radius_meters !== undefined || payload.geofence_radius !== undefined) {
                const rawR = payload.radius_meters !== undefined ? payload.radius_meters : payload.geofence_radius;
                const parsedR = parseStrictDecimal(rawR);
                if (!Number.isFinite(parsedR) || parsedR <= 0) {
                    throw createValidationError('Bán kính chấm công GPS phải lớn hơn 0 mét!');
                }
                columnUpdates.radius_meters = Math.max(20, Math.round(parsedR));
            }
        }

        if (payload.office_ip_whitelist !== undefined) {
            columnUpdates.office_ip_whitelist = toSafeText(payload.office_ip_whitelist, '');
        }

        // 5. Khối Quy tắc tính công, tăng ca & bảo hiểm
        if (payload.grace_period_minutes !== undefined) {
            columnUpdates.grace_period_minutes = validateNumberRange(payload.grace_period_minutes, {
                label: 'Ngưỡng đi muộn tối đa',
                min: 0,
                max: 240,
                integer: true
            });
        }
        if (payload.late_policy_type !== undefined) {
            const validPolicies = ['NONE', 'PER_MINUTE', 'PER_OCCURRENCE', 'DEDUCT_WORKDAY'];
            const rawPolicy = String(payload.late_policy_type || '').trim().toUpperCase();
            if (!validPolicies.includes(rawPolicy)) {
                throw createValidationError('Hình thức xử lý đi muộn không hợp lệ!');
            }
            columnUpdates.late_policy_type = rawPolicy;
        }
        if (payload.free_late_occurrences !== undefined) {
            columnUpdates.free_late_occurrences = validateNumberRange(payload.free_late_occurrences, {
                label: 'Số lần đi muộn miễn phạt',
                min: 0,
                max: 31,
                integer: true
            });
        }
        if (payload.late_penalty_per_minute !== undefined || payload.penalty_per_minute !== undefined) {
            const rawPerMin = payload.late_penalty_per_minute !== undefined
                ? payload.late_penalty_per_minute
                : payload.penalty_per_minute;
            const val = validateNumberRange(rawPerMin, {
                label: 'Mức phạt đi muộn mỗi phút',
                min: 0,
                max: 10000000,
                integer: true
            });
            columnUpdates.penalty_per_minute = val;
            columnUpdates.late_penalty_per_minute = val;
        }
        if (payload.late_penalty_amount !== undefined || payload.penalty_fixed_block !== undefined) {
            const rawFixed = payload.late_penalty_amount !== undefined
                ? payload.late_penalty_amount
                : payload.penalty_fixed_block;
            const val = validateNumberRange(rawFixed, {
                label: 'Mức phạt mỗi lần đi muộn',
                min: 0,
                max: 50000000,
                integer: true
            });
            columnUpdates.penalty_fixed_block = val;
            columnUpdates.late_penalty_amount = val;
        }
        if (payload.penalty_salary_percent !== undefined) {
            columnUpdates.penalty_salary_percent = validateNumberRange(payload.penalty_salary_percent, {
                label: 'Tỷ lệ phạt lương',
                min: 0,
                max: 100
            });
        }
        if (payload.max_late_minutes_for_half_day !== undefined) {
            columnUpdates.max_late_minutes_for_half_day = validateNumberRange(payload.max_late_minutes_for_half_day, {
                label: 'Ngưỡng trễ tính nửa công',
                min: 1,
                max: 480,
                integer: true
            });
        }
        if (payload.free_late_exempts_halfday !== undefined) {
            columnUpdates.free_late_exempts_halfday = toBoolInt(payload.free_late_exempts_halfday, 0);
        }
        if (payload.monthly_paid_leave_limit !== undefined) {
            columnUpdates.monthly_paid_leave_limit = validateNumberRange(payload.monthly_paid_leave_limit, {
                label: 'Định mức phép có lương / tháng',
                min: 0,
                max: 31
            });
        }
        if (payload.probation_salary_percent !== undefined) {
            columnUpdates.probation_salary_percent = validateNumberRange(payload.probation_salary_percent, {
                label: 'Mức hưởng lương thử việc',
                min: 0,
                max: 100
            });
        }
        if (payload.probation_allowance_full !== undefined) {
            columnUpdates.probation_allowance_full = toBoolInt(payload.probation_allowance_full, 1);
        }
        if (payload.ot_rate_weekday !== undefined) {
            columnUpdates.ot_rate_weekday = validateNumberRange(payload.ot_rate_weekday, {
                label: 'Hệ số OT ngày thường',
                min: 1.0,
                max: 10.0
            });
        }
        if (payload.ot_rate_weekend !== undefined) {
            columnUpdates.ot_rate_weekend = validateNumberRange(payload.ot_rate_weekend, {
                label: 'Hệ số OT Chủ nhật',
                min: 1.0,
                max: 10.0
            });
        }
        if (payload.ot_rate_holiday !== undefined) {
            columnUpdates.ot_rate_holiday = validateNumberRange(payload.ot_rate_holiday, {
                label: 'Hệ số OT ngày lễ',
                min: 1.0,
                max: 10.0
            });
        }
        if (payload.custom_ot_hourly_rate !== undefined) {
            columnUpdates.custom_ot_hourly_rate = validateNumberRange(payload.custom_ot_hourly_rate, {
                label: 'Đơn giá tăng ca cố định / giờ',
                min: 0,
                max: 50000000
            });
        }
        if (payload.ot_calculation_mode !== undefined) {
            const validOtModes = ['APPROVED_OR_AUTO', 'REQUIRE_APPROVAL', 'AUTO_ACTUAL'];
            const rawMode = String(payload.ot_calculation_mode || '').trim().toUpperCase();
            if (!validOtModes.includes(rawMode)) {
                throw createValidationError('Chế độ tính tăng ca không hợp lệ!');
            }
            columnUpdates.ot_calculation_mode = rawMode;
        }
        if (payload.insurance_rate !== undefined) {
            columnUpdates.insurance_rate = validateNumberRange(payload.insurance_rate, {
                label: 'Tỷ lệ khấu trừ bảo hiểm',
                min: 0,
                max: 100
            });
        }
        if (payload.negative_salary_policy !== undefined) {
            const validNegPolicies = ['CLAMP_ZERO', 'SHOW_NEGATIVE'];
            const rawNeg = String(payload.negative_salary_policy || '').trim().toUpperCase();
            if (!validNegPolicies.includes(rawNeg)) {
                throw createValidationError('Chính sách xử lý lương âm không hợp lệ!');
            }
            columnUpdates.negative_salary_policy = rawNeg;
        }
        if (payload.log_retention_days !== undefined) {
            columnUpdates.log_retention_days = validateNumberRange(payload.log_retention_days, {
                label: 'Số ngày lưu trữ nhật ký',
                min: 1,
                max: 365,
                integer: true
            });
        }

        const existingRows = await query('SELECT id FROM company_settings LIMIT 1');
        let savedCompanyId = 1;

        if (existingRows && existingRows.length > 0) {
            savedCompanyId = existingRows[0].id;
            const updateEntries = Object.entries(columnUpdates);
            if (updateEntries.length > 0) {
                const setClauses = updateEntries.map(([col]) => `${col} = ?`).join(', ');
                const values = updateEntries.map(([, val]) => val);
                await query(
                    `UPDATE company_settings SET ${setClauses} WHERE id = ?`,
                    [...values, savedCompanyId]
                );
            }
        } else {
            const merged = { ...DEFAULT_COMPANY_SETTINGS, ...current, ...columnUpdates };
            const nowVnParts = getVietnamDateParts();
            const stdDays = getMonthlyStandardWorkdays(nowVnParts.month, nowVnParts.year);
            const locs = parseAllowedLocations(
                merged.allowed_locations,
                merged.latitude,
                merged.longitude,
                merged.radius_meters
            );
            const primary = locs[0] || { lat: 16.0544, lng: 108.2022, radius: 500 };
            const insRes = await query(
                `INSERT INTO company_settings (
                    company_name, phone, address, tax_code, logo_url,
                    work_start, work_end, lunch_start, lunch_end,
                    grace_period_minutes, penalty_per_minute, penalty_fixed_block, penalty_salary_percent,
                    late_policy_type, free_late_occurrences, late_penalty_per_minute, late_penalty_amount, max_late_minutes_for_half_day,
                    standard_work_days, probation_salary_percent, probation_allowance_full,
                    ot_rate_weekday, ot_rate_weekend, ot_rate_holiday, custom_ot_hourly_rate,
                    ot_calculation_mode, free_late_exempts_halfday, negative_salary_policy,
                    insurance_rate, monthly_paid_leave_limit, log_retention_days,
                    latitude, longitude, radius_meters,
                    allowed_locations, office_ip_whitelist, announcement_text, announcement_updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    merged.company_name || 'CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO',
                    merged.phone ?? null,
                    merged.address ?? null,
                    merged.tax_code ?? null,
                    merged.logo_url ?? null,
                    merged.work_start || '08:00',
                    merged.work_end || '17:30',
                    merged.lunch_start || '12:00',
                    merged.lunch_end || '13:30',
                    merged.grace_period_minutes ?? 15,
                    merged.penalty_per_minute ?? 2000,
                    merged.penalty_fixed_block ?? 50000,
                    merged.penalty_salary_percent ?? 0,
                    merged.late_policy_type || 'PER_MINUTE',
                    merged.free_late_occurrences ?? 3,
                    merged.late_penalty_per_minute ?? 2000,
                    merged.late_penalty_amount ?? 50000,
                    merged.max_late_minutes_for_half_day ?? 60,
                    stdDays,
                    merged.probation_salary_percent ?? 85,
                    merged.probation_allowance_full ?? 1,
                    merged.ot_rate_weekday ?? 1.5,
                    merged.ot_rate_weekend ?? 2.0,
                    merged.ot_rate_holiday ?? 3.0,
                    merged.custom_ot_hourly_rate ?? 0,
                    merged.ot_calculation_mode || 'APPROVED_OR_AUTO',
                    merged.free_late_exempts_halfday ?? 0,
                    merged.negative_salary_policy || 'CLAMP_ZERO',
                    merged.insurance_rate ?? 10.5,
                    merged.monthly_paid_leave_limit ?? 1,
                    merged.log_retention_days ?? 30,
                    primary.lat,
                    primary.lng,
                    primary.radius,
                    typeof merged.allowed_locations === 'string'
                        ? merged.allowed_locations
                        : JSON.stringify(locs),
                    merged.office_ip_whitelist || '',
                    merged.announcement_text || null,
                    merged.announcement_text ? new Date() : null
                ]
            );
            savedCompanyId = insRes?.insertId || 1;
        }

        if (logoChanged) {
            const mediaLifecycleService = require('./mediaLifecycleService');
            if (nextLogoUrl) {
                await mediaLifecycleService.bindAssetToEntity({
                    mediaRef: nextLogoUrl,
                    entityType: 'company_branding',
                    entityId: String(savedCompanyId),
                    employeeId: current_user?.username || current_user?.ma_nv || 'admin'
                });
            }
            if (previousLogoUrl && previousLogoUrl !== nextLogoUrl) {
                await mediaLifecycleService.handleMediaReplacement({
                    oldMediaRef: previousLogoUrl,
                    newMediaRef: nextLogoUrl,
                    actor: current_user
                });
            }
        }

        if (current_user && Object.keys(columnUpdates).length > 0) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'admin',
                actor_role: current_user.role || 'admin',
                action: 'UPDATE_COMPANY_SETTINGS',
                resource: 'company_settings',
                details: {
                    updated_fields: Object.keys(columnUpdates)
                }
            });
        }

        const updated = await this.getCompanyConfig(clientIp);
        return {
            success: true,
            updated_fields: Object.keys(columnUpdates),
            data: updated
        };
    }

    async saveCurrentWifiIp(rawClientIp, current_user = null) {
        const cleanIp = normalizeIp(rawClientIp);
        if (!cleanIp) {
            throw createValidationError('Không xác định được địa chỉ IP mạng hiện tại!');
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
            late_policy_type: conf.late_policy_type || 'PER_MINUTE',
            free_late_occurrences: conf.free_late_occurrences !== undefined ? Number(conf.free_late_occurrences) : 3,
            late_penalty_per_minute: conf.late_penalty_per_minute !== undefined ? Number(conf.late_penalty_per_minute) : 2000,
            late_penalty_amount: conf.late_penalty_amount !== undefined ? Number(conf.late_penalty_amount) : 50000,
            max_late_minutes_for_half_day: conf.max_late_minutes_for_half_day !== undefined ? Number(conf.max_late_minutes_for_half_day) : 60,
            standard_work_days: getMonthlyStandardWorkdays(getVietnamDateParts().month, getVietnamDateParts().year),
            standard_workdays_mode: 'AUTO_EXCLUDING_SUNDAYS',
            probation_salary_percent: conf.probation_salary_percent || 85,
            probation_allowance_full: conf.probation_allowance_full !== undefined ? Number(conf.probation_allowance_full) : 1,
            ot_rate_weekday: conf.ot_rate_weekday || 1.5,
            ot_rate_weekend: conf.ot_rate_weekend || 2.0,
            ot_rate_holiday: conf.ot_rate_holiday || 3.0,
            custom_ot_hourly_rate: conf.custom_ot_hourly_rate || 0,
            ot_calculation_mode: conf.ot_calculation_mode || 'APPROVED_OR_AUTO',
            free_late_exempts_halfday: conf.free_late_exempts_halfday !== undefined ? Number(conf.free_late_exempts_halfday) : 0,
            negative_salary_policy: conf.negative_salary_policy || 'CLAMP_ZERO',
            insurance_rate: conf.insurance_rate !== undefined ? Number(conf.insurance_rate) : 10.5,
            monthly_paid_leave_limit: conf.monthly_paid_leave_limit !== undefined ? Number(conf.monthly_paid_leave_limit) : 1,
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
