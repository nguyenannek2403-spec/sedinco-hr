const crypto = require('crypto');
const { query, withTransaction } = require('../config/db');
const { logAuditEvent, getAccountantPermissions } = require('../middlewares/authMiddleware');
const { calculateDistanceMeters } = require('../utils/geoHelper');
const { parseAllowedLocations, normalizeIp } = require('./companyService');
const { parseDeviceIdentity, recordEmployeeDeviceActivity } = require('../utils/deviceIdentityHelper');
const {
    evaluateMisaDailyAttendance,
    calculateDailyEarnedAmount,
    buildDailyAttendanceNote,
    formatViDateWithWeekday
} = require('../utils/misaWorkdayEngine');
const {
    getVietnamDateString,
    getDaysInMonth,
    getMonthlyStandardWorkdays,
    isSundayIsoDate
} = require('../utils/timeHelper');
const { findHolidayForDate, buildHolidayDateMap } = require('../utils/vnHolidaysCatalog');
const { generateAttendanceQrToken, verifyAttendanceQrToken } = require('../utils/qrTokenHelper');

function normalizeWorkMode(rawMode) {
    const val = String(rawMode || '').trim().toUpperCase();
    if (val === 'FIELD_WORK' || val === 'FIELD' || val === 'CONG_TRINH') {
        return 'FIELD_WORK';
    }
    return 'OFFICE';
}

function encodeCheckModes(inMode, outMode = null) {
    const cleanIn = normalizeWorkMode(inMode);
    if (!outMode) {
        return cleanIn === 'FIELD_WORK' ? 'FIELD_WORK_IN' : 'OFFICE_IN';
    }
    const cleanOut = normalizeWorkMode(outMode);
    return `${cleanIn}_IN__${cleanOut}_OUT`;
}

function parseAttendanceModes(log = {}) {
    if (!log || typeof log !== 'object') {
        return {
            check_in_mode: null,
            check_out_mode: null,
            work_mode: 'OFFICE',
            is_field_work: false
        };
    }
    const methodStr = String(log.check_in_method || '').trim().toUpperCase();
    const locTypeStr = String(log.work_location_type || '').trim().toUpperCase();
    const locNameStr = String(log.location_name || '').trim();
    const hasFieldNote = Boolean(log.field_note && String(log.field_note).trim());

    let check_in_mode = null;
    let check_out_mode = null;

    if (methodStr.includes('__')) {
        const [inPart, outPart] = methodStr.split('__');
        check_in_mode = inPart.startsWith('FIELD') ? 'FIELD_WORK' : 'OFFICE';
        if (log.check_out_time) {
            check_out_mode = outPart && outPart.startsWith('FIELD') ? 'FIELD_WORK' : 'OFFICE';
        }
    } else if (methodStr === 'FIELD_WORK_IN' || methodStr === 'FIELD_CHECKIN') {
        check_in_mode = 'FIELD_WORK';
        if (log.check_out_time) {
            check_out_mode = locTypeStr === 'FIELD_WORK' ? 'FIELD_WORK' : 'OFFICE';
        }
    } else if (methodStr === 'OFFICE_IN' || methodStr === 'ONE_TOUCH_GPS' || methodStr === 'WIFI_OFFICE' || methodStr === 'DYNAMIC_QR') {
        check_in_mode = 'OFFICE';
        if (log.check_out_time) {
            check_out_mode = locTypeStr === 'FIELD_WORK' ? 'FIELD_WORK' : 'OFFICE';
        }
    } else if (log.check_in_time) {
        check_in_mode = (locTypeStr === 'FIELD_WORK' || hasFieldNote || locNameStr.startsWith('Công trình'))
            ? 'FIELD_WORK'
            : 'OFFICE';
        if (log.check_out_time) {
            check_out_mode = check_in_mode;
        }
    }

    const is_field_work = Boolean(
        check_in_mode === 'FIELD_WORK' ||
        check_out_mode === 'FIELD_WORK' ||
        locTypeStr === 'FIELD_WORK' ||
        hasFieldNote
    );

    return {
        check_in_mode,
        check_out_mode,
        work_mode: is_field_work ? 'FIELD_WORK' : 'OFFICE',
        is_field_work
    };
}

function computeTodayEffectiveStatus({ todayStr, todayLog = null, holidays = [] } = {}) {
    const holidayMatch = findHolidayForDate(holidays, todayStr);
    if (!todayLog) {
        if (holidayMatch) {
            return {
                date: todayStr,
                effective_code: 'L',
                is_admin_adjusted: false,
                is_holiday: true,
                holiday_name: holidayMatch.holiday_name,
                work_credit: 1,
                ot_hours: 0,
                check_in_time: null,
                check_out_time: null,
                duration_status: null,
                note: `Nghỉ lễ hưởng nguyên lương (${holidayMatch.holiday_name})`
            };
        }
        return {
            date: todayStr,
            effective_code: 'NONE',
            is_admin_adjusted: false,
            is_holiday: false,
            holiday_name: null,
            work_credit: 0,
            ot_hours: 0,
            check_in_time: null,
            check_out_time: null,
            duration_status: null,
            note: 'Chưa chấm công hôm nay'
        };
    }

    const rawStatus = String(todayLog.status || '').trim().toUpperCase();
    const durStatus = String(todayLog.duration_status || '').trim().toUpperCase();
    const credit = todayLog.work_credit !== undefined && todayLog.work_credit !== null
        ? Number(todayLog.work_credit)
        : null;
    const otHours = Number(todayLog.ot_hours) || 0;
    const isAdminFlag = durStatus.startsWith('ADMIN_ADJUSTED') || Boolean(todayLog.proxy_by);

    // V65: Ngày hôm nay chưa kết thúc — nếu bản ghi có status '0' / 'KL' tự động mà chưa chấm công và không phải Admin chỉnh tay -> giữ trạng thái trung tính NONE
    if (['KL', 'KP', '0', 'V', 'ABSENT'].includes(rawStatus) && !isAdminFlag && !todayLog.check_in_time) {
        return {
            date: todayStr,
            effective_code: 'NONE',
            is_admin_adjusted: false,
            is_holiday: Boolean(holidayMatch),
            holiday_name: holidayMatch ? holidayMatch.holiday_name : null,
            work_credit: 0,
            ot_hours: 0,
            check_in_time: null,
            check_out_time: null,
            duration_status: null,
            note: 'Chưa chấm công hôm nay'
        };
    }

    let effective_code = 'NONE';
    let is_admin_adjusted = isAdminFlag;
    let is_holiday = Boolean(holidayMatch);
    let holiday_name = holidayMatch ? holidayMatch.holiday_name : null;
    let work_credit = credit !== null ? credit : 0;
    let note = '';

    if (rawStatus === '1/OT' || rawStatus === '1+OT') {
        effective_code = '1+OT';
        is_admin_adjusted = isAdminFlag || !todayLog.check_in_time;
        work_credit = credit !== null ? credit : 1;
        note = `Đủ công + Tăng ca (${otHours || 0}h OT)`;
    } else if (rawStatus === 'OT') {
        effective_code = 'OT';
        is_admin_adjusted = isAdminFlag || !todayLog.check_in_time;
        work_credit = credit !== null ? credit : 0;
        note = `Tăng ca (${otHours || 0}h OT)`;
    } else if (rawStatus === 'L') {
        effective_code = 'L';
        is_holiday = true;
        holiday_name = holiday_name || 'Ngày nghỉ lễ';
        is_admin_adjusted = isAdminFlag || !todayLog.check_in_time;
        work_credit = 1;
        note = `Nghỉ lễ hưởng nguyên lương (${holiday_name})`;
    } else if (rawStatus === 'P') {
        effective_code = 'P';
        is_admin_adjusted = isAdminFlag || !todayLog.check_in_time;
        work_credit = credit !== null ? credit : 1;
        note = 'Nghỉ phép có lương (1 công)';
    } else if (['KL', 'KP', '0', 'V', 'ABSENT'].includes(rawStatus)) {
        if (isAdminFlag || ['KL', 'KP', 'V', 'ABSENT'].includes(rawStatus)) {
            effective_code = 'KL';
            is_admin_adjusted = true;
            work_credit = 0;
            note = 'Nghỉ không lương (0 công)';
        } else {
            effective_code = todayLog.check_out_time ? 'COMPLETED' : 'NONE';
            is_admin_adjusted = false;
            work_credit = 0;
            note = durStatus === 'INVALID_SHORT_DURATION'
                ? 'Đã chấm công ra (Thời gian làm việc ngắn)'
                : 'Chưa chấm công hôm nay';
        }
    } else if (rawStatus === '0.5') {
        effective_code = '0.5';
        is_admin_adjusted = isAdminFlag || (!todayLog.check_in_time && !todayLog.check_out_time);
        work_credit = credit !== null ? credit : 0.5;
        note = 'Ghi nhận nửa công (0,5 công)';
    } else if (rawStatus === '1') {
        if (durStatus === 'AUTO_ACCOUNTANT') {
            effective_code = 'AUTO_ACCOUNTANT';
            is_admin_adjusted = false;
            work_credit = credit !== null ? credit : 1;
            note = 'Tự động tính công Kế toán (1 công)';
        } else {
            effective_code = '1';
            is_admin_adjusted = isAdminFlag || (!todayLog.check_in_time && !todayLog.check_out_time);
            work_credit = credit !== null ? credit : 1;
            note = is_admin_adjusted ? 'Đã được Quản trị viên xác nhận đủ 1 công' : 'Đủ 1 công';
        }
    }

    return {
        date: todayStr,
        effective_code,
        is_admin_adjusted: Boolean(is_admin_adjusted),
        is_auto_accountant: durStatus === 'AUTO_ACCOUNTANT',
        is_holiday,
        holiday_name,
        work_credit,
        ot_hours: otHours,
        check_in_time: todayLog.check_in_time || null,
        check_out_time: todayLog.check_out_time || null,
        duration_status: todayLog.duration_status || null,
        note
    };
}

const SHIFT_DEFINITIONS = {
    FULL_DAY: { code: 'FULL_DAY', label: 'Ca hành chính', start: '08:00', end: '17:30' },
    MORNING_SHIFT: { code: 'MORNING_SHIFT', label: 'Ca sáng', start: '07:30', end: '12:00' },
    AFTERNOON_SHIFT: { code: 'AFTERNOON_SHIFT', label: 'Ca chiều', start: '13:30', end: '17:30' },
    NIGHT_SHIFT: { code: 'NIGHT_SHIFT', label: 'Ca tối', start: '18:00', end: '22:00' }
};

function normalizeTimeHHMM(val, fallback) {
    if (!val || typeof val !== 'string') return fallback;
    const m = val.trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return fallback;
    const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    return `${String(hh).padStart(2, '0')}:${m[2]}`;
}

function resolveEmployeeWorkSchedule({
    emp = {},
    cs = {},
    activeShiftCode = 'FULL_DAY',
    hasMorningHalfLeave = false,
    hasRequestedShift = false
} = {}) {
    const def = SHIFT_DEFINITIONS[activeShiftCode] || SHIFT_DEFINITIONS.FULL_DAY;
    const lunchStartStr = normalizeTimeHHMM(cs.lunch_start, '12:00');
    const lunchEndStr = normalizeTimeHHMM(cs.lunch_end, '13:30');
    const baseStart = (hasMorningHalfLeave && !hasRequestedShift)
        ? lunchEndStr
        : (activeShiftCode === 'FULL_DAY' ? normalizeTimeHHMM(cs.work_start, def.start) : def.start);
    const baseEnd = activeShiftCode === 'FULL_DAY' || hasMorningHalfLeave
        ? normalizeTimeHHMM(cs.work_end, def.end)
        : def.end;
    const hasCustomStart = Boolean(emp.custom_start_time && String(emp.custom_start_time).trim());
    const hasCustomEnd = Boolean(emp.custom_end_time && String(emp.custom_end_time).trim());

    const workStartStr = (!hasMorningHalfLeave && !hasRequestedShift && hasCustomStart)
        ? normalizeTimeHHMM(emp.custom_start_time, baseStart)
        : baseStart;
    const workEndStr = (!hasRequestedShift && hasCustomEnd)
        ? normalizeTimeHHMM(emp.custom_end_time, baseEnd)
        : baseEnd;

    return {
        workStartStr,
        workEndStr,
        lunchStartStr,
        lunchEndStr,
        hasCustomSchedule: Boolean((!hasMorningHalfLeave && !hasRequestedShift && hasCustomStart) || (!hasRequestedShift && hasCustomEnd))
    };
}

class AttendanceService {
    async getAttendanceMatrix(month, year, pagination = {}) {
        const limit = Math.min(200, Math.max(1, parseInt(pagination.limit, 10) || 200));
        const page = Math.max(1, parseInt(pagination.page, 10) || 1);
        const offset = (page - 1) * limit;
        const todayStr = pagination?.todayOverride || getVietnamDateString(new Date());

        await this.ensureAccountantAutoAttendanceForPeriod(month, year, {
            todayOverride: todayStr
        }).catch(() => null);

        const emps = await query(
            "SELECT ma_nv, ho_ten, avatar_url, COALESCE(NULLIF(department, ''), 'Khối Công trình') as department FROM employees WHERE (role IS NULL OR role != 'admin') ORDER BY ma_nv ASC LIMIT ? OFFSET ?",
            [limit, offset]
        );
        if (!emps || emps.length === 0) return [];

        const [logs, holidays] = await Promise.all([
            query(
                `SELECT employee_id, DAY(record_date) as day,
                        DATE_FORMAT(record_date, '%Y-%m-%d') as record_date,
                        status, ot_hours, check_in_time, check_out_time,
                        late_minutes, early_leave_minutes, work_credit, duration_status,
                        COALESCE(morning_worked_minutes, 0) as morning_worked_minutes,
                        COALESCE(afternoon_worked_minutes, 0) as afternoon_worked_minutes,
                        work_location_type, field_note, location_name, check_in_method,
                        proxy_by
                 FROM attendance_logs
                 WHERE MONTH(record_date)=? AND YEAR(record_date)=?`,
                [month, year]
            ),
            query(
                "SELECT id, holiday_name, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date, COALESCE(salary_multiplier, 3.00) as salary_multiplier FROM public_holidays ORDER BY start_date ASC"
            ).catch(() => [])
        ]);
        const safeLogs = logs || [];
        const holidayMap = buildHolidayDateMap(holidays || [], month, year);
        const daysInMonth = getDaysInMonth(month, year);

        return emps.map(emp => {
            const days = Array(daysInMonth).fill('');
            const dayDetails = Array(daysInMonth).fill(null);
            safeLogs
                .filter(l => l.employee_id === emp.ma_nv)
                .forEach(log => {
                    if (log.day > 0 && log.day <= daysInMonth) {
                        const rawSt = String(log.status || '').trim().toUpperCase();
                        const rawDur = String(log.duration_status || '').trim().toUpperCase();
                        const isAdminAdj = rawDur.startsWith('ADMIN_ADJUSTED') || Boolean(log.proxy_by);
                        // V65: Không hiển thị Nghỉ không lương cho ngày hôm nay (>= todayStr) nếu chưa kết thúc ngày và không phải Admin chỉnh tay
                        if (
                            log.record_date >= todayStr &&
                            ['0', 'KL', 'KP', 'V', 'ABSENT'].includes(rawSt) &&
                            !isAdminAdj &&
                            !log.check_in_time
                        ) {
                            return;
                        }
                        const modes = parseAttendanceModes(log);
                        days[log.day - 1] = log.status;
                        dayDetails[log.day - 1] = {
                            status: log.status,
                            check_in_time: log.check_in_time || null,
                            check_out_time: log.check_out_time || null,
                            late_minutes: Number(log.late_minutes) || 0,
                            early_leave_minutes: Number(log.early_leave_minutes) || 0,
                            ot_hours: Number(log.ot_hours) || 0,
                            duration_status: log.duration_status || null,
                            work_credit: log.work_credit !== undefined && log.work_credit !== null ? Number(log.work_credit) : null,
                            work_location_type: modes.is_field_work ? 'FIELD_WORK' : (log.work_location_type || 'OFFICE'),
                            check_in_mode: modes.check_in_mode,
                            check_out_mode: modes.check_out_mode,
                            work_mode: modes.work_mode,
                            is_field_work: modes.is_field_work,
                            is_auto_accountant: rawDur === 'AUTO_ACCOUNTANT',
                            field_note: log.field_note || null,
                            location_name: log.location_name || null,
                            attendance_note: buildDailyAttendanceNote(log)
                        };
                    }
                });
            // Tự động áp dụng mã 'L' cho các ngày nghỉ lễ chuẩn nếu nhân viên chưa có log (hoặc giữ OT nếu có)
            for (let d = 1; d <= daysInMonth; d++) {
                if (days[d - 1]) continue;
                const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const hol = holidayMap[iso];
                if (hol) {
                    days[d - 1] = 'L';
                    dayDetails[d - 1] = {
                        status: 'L',
                        check_in_time: null,
                        check_out_time: null,
                        late_minutes: 0,
                        early_leave_minutes: 0,
                        ot_hours: 0,
                        duration_status: 'AUTO_HOLIDAY',
                        work_credit: 1,
                        is_holiday: true,
                        holiday_name: hol.holiday_name,
                        attendance_note: `Nghỉ lễ hưởng nguyên lương (${hol.holiday_name})`
                    };
                }
            }
            return {
                ma_nv: emp.ma_nv,
                ho_ten: emp.ho_ten,
                avatar_url: emp.avatar_url || null,
                department: emp.department || 'Khối Công trình',
                days: days,
                dayDetails
            };
        });
    }

    async getMyAttendance(ma_nv, month, year, nowOverride = null) {
        const refDate = nowOverride instanceof Date ? nowOverride : new Date();
        const { getVietnamDateString } = require('../utils/timeHelper');
        const todayStr = getVietnamDateString(refDate);
        const [todayY, todayM] = todayStr.split('-').map(Number);
        const m = parseInt(month, 10) || todayM;
        const y = parseInt(year, 10) || todayY;

        const empShiftRows = await query(
            "SELECT role, COALESCE(shift_type, 'FULL_DAY') as shift_type, custom_start_time, custom_end_time FROM employees WHERE ma_nv = ? LIMIT 1",
            [ma_nv]
        ).catch(() => []);
        const empRow = (empShiftRows && empShiftRows[0]) ? empShiftRows[0] : {};
        let accountantManualCheckin = null;
        if (empRow.role === 'accountant') {
            const perms = await getAccountantPermissions().catch(() => ({}));
            accountantManualCheckin = Boolean(perms?.accountant_manual_checkin);
            if (!accountantManualCheckin) {
                await this.ensureAccountantAutoAttendanceForPeriod(m, y, {
                    ma_nv,
                    todayOverride: todayStr
                }).catch(() => null);
            }
        }

        const logs = await query(
            `SELECT DATE_FORMAT(record_date, '%Y-%m-%d') as record_date,
                    DATE_FORMAT(record_date, '%Y-%m-%d') as work_date,
                    status, ot_hours, check_in_time, check_out_time, late_minutes, early_leave_minutes, work_hours,
                    COALESCE(morning_worked_minutes, 0) as morning_worked_minutes,
                    COALESCE(afternoon_worked_minutes, 0) as afternoon_worked_minutes,
                    work_credit, duration_status,
                    is_suspicious, suspicious_reason, location_name, field_note, work_location_type, check_in_method,
                    COALESCE(shift_type, 'FULL_DAY') as shift_type, proxy_by, proxy_note
             FROM attendance_logs
             WHERE employee_id = ? AND MONTH(record_date) = ? AND YEAR(record_date) = ?
             ORDER BY record_date ASC`,
            [ma_nv, m, y]
        );
        if (empRow.role === 'admin') {
            return {
                logs: [],
                days: [],
                today_record: null,
                forgotten_checkout: null,
                unclosed_previous_record: null,
                excluded_admin: true,
                shift_type: 'FULL_DAY',
                shift_info: { ...SHIFT_DEFINITIONS.FULL_DAY },
                summary: {
                    total_work_days: 0,
                    total_ot_hours: 0,
                    total_leave_days: 0,
                    late_count: 0,
                    total_late_minutes: 0,
                    on_time_count: 0
                }
            };
        }
        const empShiftCode = (empRow.shift_type && SHIFT_DEFINITIONS[empRow.shift_type])
            ? empRow.shift_type
            : 'FULL_DAY';
        const shiftInfo = SHIFT_DEFINITIONS[empShiftCode];

        const csRows = await query(
            'SELECT work_start, work_end, lunch_start, lunch_end, standard_work_days, grace_period_minutes, late_policy_type, free_late_occurrences FROM company_settings LIMIT 1'
        ).catch(() => []);
        const cs = (csRows && csRows[0]) ? csRows[0] : {};
        const schedule = resolveEmployeeWorkSchedule({ emp: empRow, cs, activeShiftCode: empShiftCode });

        // Truy vấn trực tiếp bản ghi chấm công hôm nay theo GMT+7 để đồng bộ 100% sau Đăng xuất / Đăng nhập lại
        const todayLogRows = await query(
            `SELECT id, employee_id,
                    DATE_FORMAT(record_date, '%Y-%m-%d') as record_date,
                    DATE_FORMAT(record_date, '%Y-%m-%d') as work_date,
                    check_in_time, check_out_time, status, ot_hours,
                    late_minutes, early_leave_minutes, work_hours,
                    COALESCE(morning_worked_minutes, 0) as morning_worked_minutes,
                    COALESCE(afternoon_worked_minutes, 0) as afternoon_worked_minutes,
                    work_credit, duration_status,
                    is_suspicious, suspicious_reason, location_name, field_note, work_location_type, check_in_method,
                    COALESCE(shift_type, 'FULL_DAY') as shift_type, proxy_by, proxy_note
             FROM attendance_logs
             WHERE employee_id = ? AND record_date = ?
             LIMIT 1`,
            [ma_nv, todayStr]
        );
        const holidays = await query(
            "SELECT id, holiday_name, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date, COALESCE(salary_multiplier, 3.00) as salary_multiplier FROM public_holidays ORDER BY start_date ASC"
        ).catch(() => []);
        const holidayMap = buildHolidayDateMap(holidays || [], m, y);
        const todayRaw = todayLogRows && todayLogRows.length > 0 ? todayLogRows[0] : null;
        const today_effective_status = computeTodayEffectiveStatus({
            todayStr,
            todayLog: todayRaw,
            holidays: holidays || []
        });

        const validLogs = (logs || []).filter((l) => {
            const iso = String(l.record_date || '').slice(0, 10);
            const rawSt = String(l.status || '').trim().toUpperCase();
            const rawDur = String(l.duration_status || '').trim().toUpperCase();
            const isAdminAdj = rawDur.startsWith('ADMIN_ADJUSTED') || Boolean(l.proxy_by);
            if (iso >= todayStr && ['0', 'KL', 'KP', 'V', 'ABSENT'].includes(rawSt) && !isAdminAdj && !l.check_in_time) {
                return false;
            }
            return true;
        });

        const existingDates = new Set(validLogs.map((l) => String(l.record_date || '').slice(0, 10)).filter(Boolean));
        const enrichedLogs = validLogs.map((l) => {
            const iso = String(l.record_date || '').slice(0, 10);
            const matchedHol = holidayMap[iso] || findHolidayForDate(holidays || [], iso);
            const modes = parseAttendanceModes(l);
            return {
                ...l,
                work_location_type: modes.is_field_work ? 'FIELD_WORK' : (l.work_location_type || 'OFFICE'),
                check_in_mode: modes.check_in_mode,
                check_out_mode: modes.check_out_mode,
                work_mode: modes.work_mode,
                is_field_work: modes.is_field_work,
                holiday_name: matchedHol ? matchedHol.holiday_name : null,
                date_label: formatViDateWithWeekday(l.record_date),
                attendance_note: matchedHol && String(l.status || '').toUpperCase() === 'L'
                    ? `Nghỉ lễ hưởng nguyên lương (${matchedHol.holiday_name})`
                    : buildDailyAttendanceNote(l, cs)
            };
        });
        const totalDaysInM = getDaysInMonth(m, y);
        const autoHolidayLogs = [];
        for (let d = 1; d <= totalDaysInM; d++) {
            const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            if (existingDates.has(iso)) continue;
            const hol = holidayMap[iso];
            if (!hol) continue;
            const autoHolEntry = {
                record_date: iso,
                work_date: iso,
                status: 'L',
                ot_hours: 0,
                check_in_time: null,
                check_out_time: null,
                late_minutes: 0,
                early_leave_minutes: 0,
                work_credit: 1,
                duration_status: 'AUTO_HOLIDAY',
                is_auto_holiday: true,
                holiday_name: hol.holiday_name,
                date_label: formatViDateWithWeekday(iso),
                attendance_note: `Nghỉ lễ hưởng nguyên lương (${hol.holiday_name})`
            };
            enrichedLogs.push(autoHolEntry);
            autoHolidayLogs.push(autoHolEntry);
        }
        enrichedLogs.sort((a, b) => String(a.record_date || '').localeCompare(String(b.record_date || '')));

        const todayRawModes = todayRaw ? parseAttendanceModes(todayRaw) : null;
        const today_record = todayRaw && (todayRaw.check_in_time || String(todayRaw.duration_status || '').toUpperCase().startsWith('ADMIN_ADJUSTED') || !['0', 'KL', 'KP', 'V', 'ABSENT'].includes(String(todayRaw.status || '').toUpperCase()))
            ? {
                  ...todayRaw,
                  work_location_type: todayRawModes.is_field_work ? 'FIELD_WORK' : (todayRaw.work_location_type || 'OFFICE'),
                  check_in_mode: todayRawModes.check_in_mode,
                  check_out_mode: todayRawModes.check_out_mode,
                  work_mode: todayRawModes.work_mode,
                  is_field_work: todayRawModes.is_field_work,
                  matched_location_name: todayRaw.location_name || (todayRawModes.is_field_work ? 'Đi công trình (GPS)' : 'Văn phòng SEDINCO'),
                  date_label: formatViDateWithWeekday(todayRaw.record_date),
                  attendance_note: buildDailyAttendanceNote(todayRaw, cs)
              }
            : null;

        // Phát hiện ngày làm việc gần nhất trước hôm nay bị Quên Bấm Giờ Ra (check_in_time IS NOT NULL AND check_out_time IS NULL)
        const unclosedPrevRows = await query(
            `SELECT id,
                    DATE_FORMAT(record_date, '%Y-%m-%d') as record_date,
                    DATE_FORMAT(record_date, '%Y-%m-%d') as work_date,
                    DATE_FORMAT(record_date, '%Y-%m-%d') as iso_date,
                    DATE_FORMAT(record_date, '%d/%m') as short_date,
                    check_in_time, status
             FROM attendance_logs
             WHERE employee_id = ?
               AND record_date < ?
               AND check_in_time IS NOT NULL
               AND (check_out_time IS NULL OR check_out_time = '')
             ORDER BY record_date DESC
             LIMIT 1`,
            [ma_nv, todayStr]
        );

        const unclosedPreviousRecord = unclosedPrevRows && unclosedPrevRows.length > 0
            ? unclosedPrevRows[0]
            : null;
        const forgottenCheckout = unclosedPreviousRecord
            ? {
                  iso_date: unclosedPreviousRecord.iso_date,
                  short_date: unclosedPreviousRecord.short_date,
                  check_in_time: unclosedPreviousRecord.check_in_time
              }
            : null;

        // Tổng hợp summary cho giao diện Heatmap tháng + bộ đếm đi trễ/đúng giờ
        let total_work_days = 0;
        let total_ot_hours = 0;
        let total_leave_days = 0;
        let late_count = 0;
        let total_late_minutes = 0;
        let on_time_count = 0;

        (logs || []).forEach((l) => {
            const st = String(l.status || '');
            if (l.work_credit !== undefined && l.work_credit !== null && ['1', '0.5', '0'].includes(st)) {
                total_work_days += Number(l.work_credit) || 0;
            } else if (st === '1' || st === '1/OT') total_work_days += 1;
            else if (st === '0.5') total_work_days += 0.5;
            else if (st === 'P') {
                total_work_days += 1;
                total_leave_days += 1;
            } else if (st === 'L') {
                total_work_days += 1;
            }
            total_ot_hours += Number(l.ot_hours) || 0;

            const isAdminAdjustedFull = String(l.duration_status || '').trim().toUpperCase() === 'ADMIN_ADJUSTED_FULL';
            const lateMins = isAdminAdjustedFull ? 0 : (Number(l.late_minutes) || 0);
            if (lateMins > 0) {
                late_count += 1;
                total_late_minutes += lateMins;
            } else if (st !== '0' && (l.check_in_time || ['1', '1/OT', '0.5', 'OT'].includes(st))) {
                on_time_count += 1;
            }
        });

        (autoHolidayLogs || []).forEach((h) => {
            if (!isSundayIsoDate(h.record_date)) {
                total_work_days += 1;
            }
        });

        const standardDays = getMonthlyStandardWorkdays(m, y);
        const freeLateOccurrences = cs.free_late_occurrences !== undefined && cs.free_late_occurrences !== null
            ? Number(cs.free_late_occurrences)
            : 3;

        return {
            logs: enrichedLogs,
            days: enrichedLogs,
            today_record,
            today_effective_status,
            forgotten_checkout: forgottenCheckout,
            unclosed_previous_record: unclosedPreviousRecord,
            accountant_manual_checkin: empRow.role === 'accountant' ? Boolean(accountantManualCheckin) : null,
            shift_type: empShiftCode,
            shift_info: {
                ...shiftInfo,
                start: schedule.workStartStr,
                end: schedule.workEndStr,
                effective_start: schedule.workStartStr,
                effective_end: schedule.workEndStr,
                is_custom: schedule.hasCustomSchedule
            },
            effective_shift_start: schedule.workStartStr,
            effective_shift_end: schedule.workEndStr,
            summary: {
                total_work_days: Number(total_work_days.toFixed(1)),
                total_ot_hours: Number(total_ot_hours.toFixed(1)),
                total_leave_days,
                late_count,
                total_late_minutes,
                on_time_count,
                free_late_occurrences: freeLateOccurrences,
                late_policy_type: cs.late_policy_type || 'PER_MINUTE',
                effective_shift_start: schedule.workStartStr,
                effective_shift_end: schedule.workEndStr,
                standard_days: standardDays
            }
        };
    }

    async getTodayEffectiveStatus(ma_nv, nowOverride = null) {
        const refDate = nowOverride instanceof Date ? nowOverride : new Date();
        const todayStr = getVietnamDateString(refDate);
        const [todayY, todayM] = todayStr.split('-').map(Number);

        const empRows = await query(
            "SELECT ma_nv, role, COALESCE(shift_type, 'FULL_DAY') as shift_type, custom_start_time, custom_end_time FROM employees WHERE ma_nv = ? LIMIT 1",
            [ma_nv]
        ).catch(() => []);
        const empRow = (empRows && empRows[0]) ? empRows[0] : {};
        if (empRow.role === 'admin') {
            return {
                date: todayStr,
                excluded_admin: true,
                today_record: null,
                today_effective_status: computeTodayEffectiveStatus({ todayStr, todayLog: null, holidays: [] }),
                is_period_locked: false
            };
        }

        let accountantManualCheckin = null;
        if (empRow.role === 'accountant') {
            const perms = await getAccountantPermissions().catch(() => ({}));
            accountantManualCheckin = Boolean(perms?.accountant_manual_checkin);
            if (!accountantManualCheckin) {
                await this.ensureAccountantAutoAttendanceForPeriod(todayM, todayY, {
                    ma_nv,
                    todayOverride: todayStr
                }).catch(() => null);
            }
        }

        const [todayLogRows, holidays, csRows, lockRows] = await Promise.all([
            query(
                `SELECT id, employee_id,
                        DATE_FORMAT(record_date, '%Y-%m-%d') as record_date,
                        DATE_FORMAT(record_date, '%Y-%m-%d') as work_date,
                        check_in_time, check_out_time, status, ot_hours,
                        late_minutes, early_leave_minutes, work_hours,
                        COALESCE(morning_worked_minutes, 0) as morning_worked_minutes,
                        COALESCE(afternoon_worked_minutes, 0) as afternoon_worked_minutes,
                        work_credit, duration_status,
                        is_suspicious, suspicious_reason, location_name, field_note, work_location_type, check_in_method,
                        COALESCE(shift_type, 'FULL_DAY') as shift_type, proxy_by, proxy_note
                 FROM attendance_logs
                 WHERE employee_id = ? AND record_date = ?
                 LIMIT 1`,
                [ma_nv, todayStr]
            ),
            query(
                "SELECT id, holiday_name, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date, COALESCE(salary_multiplier, 3.00) as salary_multiplier FROM public_holidays ORDER BY start_date ASC"
            ).catch(() => []),
            query(
                'SELECT work_start, work_end, lunch_start, lunch_end, grace_period_minutes FROM company_settings LIMIT 1'
            ).catch(() => []),
            query(
                'SELECT is_locked FROM period_locks WHERE month = ? AND year = ? LIMIT 1',
                [todayM, todayY]
            ).catch(() => [])
        ]);

        const cs = (csRows && csRows[0]) ? csRows[0] : {};
        const todayRaw = todayLogRows && todayLogRows[0] ? todayLogRows[0] : null;
        const todayRawModes = todayRaw ? parseAttendanceModes(todayRaw) : null;
        const today_record = todayRaw && (todayRaw.check_in_time || String(todayRaw.duration_status || '').toUpperCase().startsWith('ADMIN_ADJUSTED') || !['0', 'KL', 'KP', 'V', 'ABSENT'].includes(String(todayRaw.status || '').toUpperCase()))
            ? {
                  ...todayRaw,
                  work_location_type: todayRawModes.is_field_work ? 'FIELD_WORK' : (todayRaw.work_location_type || 'OFFICE'),
                  check_in_mode: todayRawModes.check_in_mode,
                  check_out_mode: todayRawModes.check_out_mode,
                  work_mode: todayRawModes.work_mode,
                  is_field_work: todayRawModes.is_field_work,
                  matched_location_name: todayRaw.location_name || (todayRawModes.is_field_work ? 'Đi công trình (GPS)' : 'Văn phòng SEDINCO'),
                  date_label: formatViDateWithWeekday(todayRaw.record_date),
                  attendance_note: buildDailyAttendanceNote(todayRaw, cs)
              }
            : null;
        const today_effective_status = computeTodayEffectiveStatus({
            todayStr,
            todayLog: todayRaw,
            holidays: holidays || []
        });

        const empShiftCode = (empRow.shift_type && SHIFT_DEFINITIONS[empRow.shift_type])
            ? empRow.shift_type
            : 'FULL_DAY';
        const schedule = resolveEmployeeWorkSchedule({ emp: empRow, cs, activeShiftCode: empShiftCode });

        return {
            date: todayStr,
            excluded_admin: false,
            accountant_manual_checkin: empRow.role === 'accountant' ? Boolean(accountantManualCheckin) : null,
            today_record,
            today_effective_status,
            is_period_locked: Boolean(lockRows && lockRows[0] && lockRows[0].is_locked),
            effective_shift_start: schedule.workStartStr,
            effective_shift_end: schedule.workEndStr
        };
    }

    async isPeriodLocked(month, year) {
        if (!month || !year) return false;
        const res = await query('SELECT is_locked FROM period_locks WHERE month = ? AND year = ? LIMIT 1', [month, year]);
        if (res && res.length > 0) {
            return Boolean(res[0].is_locked);
        }
        return false;
    }

    async getPeriodLockStatus(month, year) {
        if (!month || !year) return { is_locked: false, low_trust_count: 0, low_trust_logs: [] };
        const res = await query(
            'SELECT month, year, is_locked, locked_by, locked_at, reason FROM period_locks WHERE month = ? AND year = ? LIMIT 1',
            [month, year]
        );

        const lowTrustRows = await query(
            `SELECT employee_id, record_date, location_source, is_low_trust, suspicious_reason
             FROM attendance_logs 
             WHERE MONTH(record_date) = ? AND YEAR(record_date) = ? AND is_low_trust > 0`,
            [month, year]
        );

        const low_trust_logs = (lowTrustRows || []).map(r => ({
            employee_id: r.employee_id,
            record_date: r.record_date,
            location_source: r.location_source,
            is_low_trust: Number(r.is_low_trust),
            reason: Number(r.is_low_trust) === 2 
                ? 'Hạ cấp phương thức (từng có token Zalo nhưng gửi tọa độ raw)' 
                : (r.suspicious_reason || 'Tọa độ GPS thô không có chữ ký xác thực vị trí')
        }));

        const base = {
            month: Number(month),
            year: Number(year),
            is_locked: false,
            low_trust_count: low_trust_logs.length,
            low_trust_logs
        };

        if (res && res.length > 0) {
            return {
                ...base,
                month: Number(res[0].month),
                year: Number(res[0].year),
                is_locked: Boolean(res[0].is_locked),
                locked_by: res[0].locked_by,
                locked_at: res[0].locked_at,
                reason: res[0].reason
            };
        }
        return base;
    }

    async lockPeriod({ month, year, reason, locked_by = 'admin', current_user = null, confirm_low_trust = false }) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (isNaN(m) || isNaN(y)) {
            const error = new Error('Tháng và năm không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        const lowTrustRows = await query(
            'SELECT COUNT(*) as count FROM attendance_logs WHERE MONTH(record_date) = ? AND YEAR(record_date) = ? AND is_low_trust > 0',
            [m, y]
        );
        const low_trust_count = lowTrustRows && lowTrustRows[0] ? Number(lowTrustRows[0].count) : 0;

        if (low_trust_count > 0 && confirm_low_trust !== true) {
            const error = new Error(`Kỳ công Tháng ${m}/${y} hiện có ${low_trust_count} lượt chấm công cần rà soát lại. Vui lòng kiểm tra và xác nhận trước khi chốt sổ.`);
            error.statusCode = 400;
            error.requires_confirmation = true;
            error.low_trust_count = low_trust_count;
            throw error;
        }

        const sql = `
            INSERT INTO period_locks (month, year, is_locked, locked_by, reason)
            VALUES (?, ?, 1, ?, ?)
            ON DUPLICATE KEY UPDATE 
                is_locked = 1, 
                locked_by = VALUES(locked_by), 
                reason = VALUES(reason), 
                locked_at = CURRENT_TIMESTAMP
        `;
        await query(sql, [m, y, locked_by, reason || 'Khóa kỳ công']);

        const actorId = current_user
            ? (current_user.ma_nv || current_user.username || locked_by)
            : locked_by;

        if (current_user) {
            await logAuditEvent({
                actor_id: actorId,
                actor_role: current_user.role || 'admin',
                action: 'LOCK_ATTENDANCE_PERIOD',
                resource: 'attendance',
                details: { month: m, year: y, reason, confirm_low_trust }
            });
        }

        // V25: Tự động đồng bộ bảng lương tháng & gửi thông báo tới toàn bộ nhân viên + Admin
        const payrollService = require('./payrollService');
        const notificationService = require('./notificationService');
        await payrollService.calculateMonthlyPayroll(m, y, { exportAll: true }).catch(() => []);
        const notifSummary = await notificationService.broadcastPeriodLockNotifications({
            month: m,
            year: y,
            lockedBy: actorId
        });

        return {
            success: true,
            message: `Đã chốt sổ kỳ công Tháng ${m}/${y} thành công!`,
            notifications_sent: notifSummary.notified_employees
        };
    }

    async unlockPeriod({ month, year, reason, unlocked_by = 'admin', current_user = null }) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (isNaN(m) || isNaN(y)) {
            const error = new Error('Tháng và năm không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        if (!reason || !reason.trim()) {
            const error = new Error('Bắt buộc phải cung cấp lý do mở lại kỳ công đã chốt!');
            error.statusCode = 400;
            throw error;
        }

        const sql = `
            INSERT INTO period_locks (month, year, is_locked, locked_by, reason)
            VALUES (?, ?, 0, ?, ?)
            ON DUPLICATE KEY UPDATE 
                is_locked = 0, 
                locked_by = VALUES(locked_by), 
                reason = VALUES(reason), 
                locked_at = CURRENT_TIMESTAMP
        `;
        await query(sql, [m, y, unlocked_by, reason]);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || unlocked_by,
                actor_role: current_user.role || 'admin',
                action: 'UNLOCK_ATTENDANCE_PERIOD',
                resource: 'attendance',
                details: { month: m, year: y, reason }
            });
        }

        return { success: true, message: `Đã mở lại kỳ công Tháng ${m}/${y} thành công!` };
    }

    async updateAttendanceDaily({ ma_nv, dateStr, status, hours, isDelete, check_in_time, check_out_time, reason = null, current_user = null }) {
        // 1. Phân tách nhiệm vụ (SoD P0): Không vai trò nào (worker, accountant, admin) được tự sửa công của chính mình!
        if (current_user) {
            const userRole = current_user.role;
            const isSelf = current_user.ma_nv === ma_nv;

            if (userRole === 'worker' && isDelete) {
                const error = new Error('Bảo mật: Công nhân không thể tự ý xóa bản ghi chấm công của chính mình hoặc người khác!');
                error.statusCode = 403;
                throw error;
            }

            if (isSelf) {
                const error = new Error('Theo quy định kiểm soát nội bộ, bạn không thể tự chỉnh sửa ngày công của chính mình.');
                error.statusCode = 403;
                throw error;
            }

            if (userRole === 'worker') {
                const error = new Error('Bạn không có quyền chỉnh sửa dữ liệu chấm công của nhân viên khác.');
                error.statusCode = 403;
                throw error;
            }

            if (userRole === 'accountant') {
                const permissions = await getAccountantPermissions();
                if (!permissions['attendance_edit']) {
                    const error = new Error('Tài khoản Kế toán hiện chưa được Quản trị viên cấp quyền chỉnh sửa chấm công.');
                    error.statusCode = 403;
                    throw error;
                }
            }
        }

        // 2. Kiểm tra xem kỳ công của tháng này có bị đóng băng / khóa sổ không
        if (dateStr) {
            const parts = dateStr.split('-');
            if (parts.length >= 2) {
                const y = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10);
                const isLocked = await this.isPeriodLocked(m, y);
                if (isLocked) {
                    const error = new Error(`Kỳ công Tháng ${m}/${y} đã bị KHÓA SỔ để tính lương. Không thể thêm/sửa/xóa dữ liệu chấm công!`);
                    error.statusCode = 400;
                    error.code = 'PERIOD_LOCKED';
                    throw error;
                }
            }
        }

        // 3. Kiểm tra xem nhân viên có tồn tại / đang bị TẠM KHÓA tài khoản không
        if (ma_nv) {
            const empCheck = await query('SELECT is_locked, status FROM employees WHERE ma_nv = ?', [ma_nv]);
            if (!empCheck || empCheck.length === 0) {
                const error = new Error(`Không tìm thấy nhân viên ${ma_nv}!`);
                error.statusCode = 404;
                throw error;
            }
            const emp = empCheck[0];
            if (emp.status === 'inactive' || emp.is_locked === 1 || emp.is_locked === true) {
                const error = new Error(`Tài khoản nhân viên ${ma_nv} đang bị TẠM KHÓA. Không thể thực hiện chấm công!`);
                error.statusCode = 403;
                throw error;
            }
        }

        const cleanReason = (reason && String(reason).trim())
            ? String(reason).trim().slice(0, 255)
            : 'Quản trị viên cập nhật bảng công';

        if (isDelete) {
            await query('DELETE FROM attendance_logs WHERE employee_id=? AND record_date=?', [ma_nv, dateStr]);
            if (dateStr) {
                const parts = String(dateStr).split('-');
                if (parts.length >= 2) {
                    const yDel = parseInt(parts[0], 10);
                    const mDel = parseInt(parts[1], 10);
                    if (yDel && mDel) {
                        await require('./payrollService').autoResolveSalaryDisputes({
                            ma_nv,
                            month: mDel,
                            year: yDel,
                            resolved_note: `Quản trị viên đã cập nhật bảng công ngày ${dateStr}`,
                            current_user
                        }).catch(() => {});
                    }
                }
            }
            if (current_user) {
                await logAuditEvent({
                    actor_id: current_user.ma_nv || current_user.username || 'unknown',
                    actor_role: current_user.role || 'unknown',
                    action: 'DELETE_ATTENDANCE',
                    resource: 'attendance',
                    details: { ma_nv, record_date: dateStr, reason: cleanReason }
                });
            }
            return { success: true };
        }

        const rawStatusUpper = String(status || '').trim().toUpperCase();
        const dbStatus = rawStatusUpper === 'FULL_DAY'
            ? '1'
            : rawStatusUpper === '1+OT'
                ? '1/OT'
                : rawStatusUpper === '0.5'
                    ? '0.5'
                    : (rawStatusUpper || String(status || '').trim());
        const isFullWorkday = ['1', '1/OT', 'P', 'L'].includes(dbStatus);
        const isHalfWorkday = dbStatus === '0.5';
        const isZeroWorkday = ['0', 'KP', 'KL', 'V'].includes(dbStatus);

        if (isFullWorkday) {
            const sql = `
                INSERT INTO attendance_logs (
                    employee_id, record_date, status, ot_hours, check_in_time, check_out_time,
                    late_minutes, early_leave_minutes, work_credit, duration_status
                )
                VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1.00, 'ADMIN_ADJUSTED_FULL')
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    ot_hours = VALUES(ot_hours),
                    check_in_time = COALESCE(VALUES(check_in_time), check_in_time),
                    check_out_time = COALESCE(VALUES(check_out_time), check_out_time),
                    late_minutes = 0,
                    early_leave_minutes = 0,
                    work_credit = 1.00,
                    duration_status = 'ADMIN_ADJUSTED_FULL',
                    proxy_note = CASE
                        WHEN proxy_note IS NOT NULL AND (LOWER(proxy_note) LIKE '%vào muộn%' OR LOWER(proxy_note) LIKE '%ra sớm%')
                        THEN 'Đã điều chỉnh đủ 1 công'
                        ELSE proxy_note
                    END
            `;
            await query(sql, [ma_nv, dateStr, dbStatus, hours, check_in_time || null, check_out_time || null]);
        } else if (isHalfWorkday) {
            const sql = `
                INSERT INTO attendance_logs (
                    employee_id, record_date, status, ot_hours, check_in_time, check_out_time,
                    late_minutes, early_leave_minutes, work_credit, duration_status
                )
                VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0.50, 'ADMIN_ADJUSTED_HALF')
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    ot_hours = VALUES(ot_hours),
                    check_in_time = COALESCE(VALUES(check_in_time), check_in_time),
                    check_out_time = COALESCE(VALUES(check_out_time), check_out_time),
                    late_minutes = 0,
                    early_leave_minutes = 0,
                    work_credit = 0.50,
                    duration_status = 'ADMIN_ADJUSTED_HALF'
            `;
            await query(sql, [ma_nv, dateStr, dbStatus, hours, check_in_time || null, check_out_time || null]);
        } else if (isZeroWorkday) {
            const sql = `
                INSERT INTO attendance_logs (
                    employee_id, record_date, status, ot_hours, check_in_time, check_out_time,
                    late_minutes, early_leave_minutes, work_credit, duration_status
                )
                VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0.00, 'ADMIN_ADJUSTED_ABSENT')
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    ot_hours = VALUES(ot_hours),
                    check_in_time = COALESCE(VALUES(check_in_time), check_in_time),
                    check_out_time = COALESCE(VALUES(check_out_time), check_out_time),
                    late_minutes = 0,
                    early_leave_minutes = 0,
                    work_credit = 0.00,
                    duration_status = 'ADMIN_ADJUSTED_ABSENT'
            `;
            await query(sql, [ma_nv, dateStr, dbStatus, hours, check_in_time || null, check_out_time || null]);
        } else {
            const sql = `
                INSERT INTO attendance_logs (employee_id, record_date, status, ot_hours, check_in_time, check_out_time, work_credit, duration_status)
                VALUES (?, ?, ?, ?, ?, ?, 0.00, 'ADMIN_ADJUSTED_OT')
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    ot_hours = VALUES(ot_hours),
                    check_in_time = COALESCE(VALUES(check_in_time), check_in_time),
                    check_out_time = COALESCE(VALUES(check_out_time), check_out_time),
                    work_credit = 0.00,
                    duration_status = 'ADMIN_ADJUSTED_OT'
            `;
            await query(sql, [ma_nv, dateStr, dbStatus, hours, check_in_time || null, check_out_time || null]);
        }

        if (dateStr) {
            const parts = String(dateStr).split('-');
            if (parts.length >= 2) {
                const yUpd = parseInt(parts[0], 10);
                const mUpd = parseInt(parts[1], 10);
                if (yUpd && mUpd) {
                    await require('./payrollService').autoResolveSalaryDisputes({
                        ma_nv,
                        month: mUpd,
                        year: yUpd,
                        resolved_note: `Quản trị viên đã cập nhật bảng công ngày ${dateStr}`,
                        current_user
                    }).catch(() => {});
                }
            }
        }

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'unknown',
                actor_role: current_user.role || 'unknown',
                action: 'UPDATE_ATTENDANCE',
                resource: 'attendance',
                details: { target_ma_nv: ma_nv, dateStr, status: dbStatus, hours, reason: cleanReason }
            });
        }

        return { success: true };
    }

    validateImageSnapshot(image_snapshot) {
        if (!image_snapshot || typeof image_snapshot !== 'string') {
            const error = new Error('Ảnh chụp chấm công không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        const match = image_snapshot.match(/^data:([^;]+);base64,(.+)$/);
        let mimeType = '';
        let base64Content = image_snapshot;

        if (match) {
            mimeType = match[1];
            base64Content = match[2];
            if (!mimeType.startsWith('image/')) {
                const error = new Error('Định dạng tệp không phải là ảnh hợp lệ!');
                error.statusCode = 400;
                throw error;
            }
        }

        let buffer;
        try {
            buffer = Buffer.from(base64Content, 'base64');
        } catch {
            const error = new Error('Chuỗi dữ liệu ảnh Base64 không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        // Giới hạn dung lượng tối đa 150KB để bảo vệ CSDL Aiven MySQL không bị phình to
        if (buffer.length > 150 * 1024) {
            const error = new Error('Ảnh vượt quá dung lượng tối đa cho phép (150KB)! Vui lòng nén ảnh trước khi tải lên.');
            error.statusCode = 400;
            throw error;
        }

        // Magic bytes check:
        // WebP: RIFF (bytes 0-3: 0x52, 0x49, 0x46, 0x46) & WEBP (bytes 8-11: 0x57, 0x45, 0x42, 0x50)
        const isWebP = buffer.length >= 12 &&
            buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
            buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

        // JPEG: 0xFF, 0xD8, 0xFF
        const isJPEG = buffer.length >= 3 &&
            buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

        // PNG: 0x89, 0x50, 0x4E, 0x47
        const isPNG = buffer.length >= 4 &&
            buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;

        if (!isWebP && !isJPEG && !isPNG) {
            const error = new Error('Ảnh chụp chấm công không hợp lệ: Thiếu chữ ký định dạng magic bytes hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        return true;
    }

    parseTimeToMinutes(timeStr, defaultMins = 480) {
        if (!timeStr || typeof timeStr !== 'string') return defaultMins;
        const parts = timeStr.trim().split(':').map(Number);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return parts[0] * 60 + parts[1];
        }
        return defaultMins;
    }

    parseTimeToSeconds(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return null;
        const parts = timeStr.trim().split(':').map(Number);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const sec = parts.length >= 3 && !isNaN(parts[2]) ? parts[2] : 0;
            return parts[0] * 3600 + parts[1] * 60 + sec;
        }
        return null;
    }

    async generateDynamicBranchQr({ branch_id = null, ttl_seconds = 90, current_user = null } = {}) {
        const { getVietnamDateString, getVietnamTimeString } = require('../utils/timeHelper');
        const companySettingsRows = await query('SELECT allowed_locations, latitude, longitude, radius_meters FROM company_settings LIMIT 1');
        const cs = (companySettingsRows && companySettingsRows[0]) ? companySettingsRows[0] : {};
        const allowedLocations = parseAllowedLocations(
            cs.allowed_locations,
            cs.latitude,
            cs.longitude,
            cs.radius_meters
        );

        const targetBranch = branch_id
            ? allowedLocations.find((loc) => String(loc.id) === String(branch_id).trim())
            : allowedLocations[0];

        if (!targetBranch) {
            const err = new Error('Không tìm thấy chi nhánh / điểm chấm công hợp lệ để tạo mã QR!');
            err.statusCode = 404;
            err.code = 'BRANCH_NOT_FOUND';
            throw err;
        }

        const actorId = current_user ? (current_user.ma_nv || current_user.username || 'admin') : 'admin';
        const qrData = generateAttendanceQrToken({
            branchId: targetBranch.id,
            branchName: targetBranch.name,
            ttlSeconds: ttl_seconds,
            issuedBy: actorId
        });

        await logAuditEvent({
            actor_id: actorId,
            actor_role: current_user ? current_user.role : 'admin',
            action: 'GENERATE_ATTENDANCE_QR_SESSION',
            resource: 'attendance_qr',
            details: {
                branch_id: targetBranch.id,
                branch_name: targetBranch.name,
                ttl_seconds: qrData.ttl_seconds,
                exp: qrData.exp,
                server_date_vn: getVietnamDateString(new Date()),
                server_time_vn: getVietnamTimeString(new Date())
            }
        });

        return {
            ...qrData,
            attendance_method: targetBranch.attendance_method || 'GPS'
        };
    }

    async precheckAttendanceBranch({
        lat = null,
        lng = null,
        zalo_location_token = null,
        zalo_access_token = '',
        work_location_type = 'OFFICE',
        field_note = '',
        current_user = null,
        ip_address = '',
        currentTime = null
    } = {}) {
        if (!current_user || !current_user.ma_nv) {
            const error = new Error('Yêu cầu đăng nhập tài khoản nhân viên để kiểm tra chấm công!');
            error.statusCode = 401;
            throw error;
        }

        const ma_nv = current_user.ma_nv;
        const { getVietnamDateString, getVietnamTimeString } = require('../utils/timeHelper');
        const {
            verifyZaloLocationToken,
            issueLocationProofToken,
            isLocationTokenReplayed
        } = require('../utils/zaloAdapter');

        const today = currentTime instanceof Date ? currentTime : new Date();
        const dateStr = getVietnamDateString(today);
        const timeStr = getVietnamTimeString(today);
        const [currentYear, currentMonth] = dateStr.split('-').map(Number);

        const [empRows, companyRows, todayLogRows, holRows, isLocked] = await Promise.all([
            query(
                "SELECT ma_nv, ho_ten, role, is_locked, status, COALESCE(shift_type, 'FULL_DAY') as shift_type, custom_start_time, custom_end_time FROM employees WHERE ma_nv = ? LIMIT 1",
                [ma_nv]
            ),
            query('SELECT allowed_locations, latitude, longitude, radius_meters, office_ip_whitelist, work_start, lunch_start, lunch_end, work_end FROM company_settings LIMIT 1'),
            query('SELECT * FROM attendance_logs WHERE employee_id = ? AND record_date = ? LIMIT 1', [ma_nv, dateStr]),
            query(
                "SELECT id, holiday_name, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date, COALESCE(salary_multiplier, 3.00) as salary_multiplier FROM public_holidays WHERE start_date <= ? AND end_date >= ? LIMIT 1",
                [dateStr, dateStr]
            ).catch(() => []),
            this.isPeriodLocked(currentMonth, currentYear)
        ]);

        const emp = empRows && empRows[0];
        if (!emp) {
            const err = new Error('Mã nhân viên không tồn tại!');
            err.statusCode = 404;
            throw err;
        }
        if (emp.role === 'accountant' || current_user.role === 'accountant') {
            const perms = await getAccountantPermissions().catch(() => ({}));
            if (!perms?.accountant_manual_checkin) {
                const err = new Error('Tài khoản Kế toán đang ở chế độ tự động tính công, không cần chấm công thủ công.');
                err.statusCode = 403;
                err.code = 'ACCOUNTANT_AUTO_ATTENDANCE_MODE';
                throw err;
            }
        }

        const cs = (companyRows && companyRows[0]) ? companyRows[0] : {};
        const allowedLocations = parseAllowedLocations(
            cs.allowed_locations,
            cs.latitude,
            cs.longitude,
            cs.radius_meters
        );

        const cleanClientIp = normalizeIp(ip_address);
        const ipWhitelist = String(cs.office_ip_whitelist || '')
            .split(',')
            .map((s) => normalizeIp(s))
            .filter(Boolean);
        const matchedWifi = Boolean(cleanClientIp && ipWhitelist.includes(cleanClientIp));
        const isFieldWork = normalizeWorkMode(work_location_type) === 'FIELD_WORK';

        let numLat = lat !== null && lat !== undefined && lat !== '' && Number.isFinite(Number(lat)) ? Number(lat) : null;
        let numLng = lng !== null && lng !== undefined && lng !== '' && Number.isFinite(Number(lng)) ? Number(lng) : null;
        let resolvedSource = (numLat !== null && numLng !== null) ? 'raw' : (matchedWifi ? 'wifi' : 'none');

        // Giải mã Single-Use Zalo Location Token ĐÚNG 1 LẦN DUY NHẤT tại bước /precheck
        let tokenVerificationError = null;
        if (zalo_location_token && String(zalo_location_token).trim()) {
            const cleanLocToken = String(zalo_location_token).trim();
            const locTokenHash = `LOC_TOKEN_${crypto.createHash('sha256').update(cleanLocToken).digest('hex').slice(0, 50)}`;
            const existingReplayRows = await query(
                'SELECT key_hash FROM idempotency_keys WHERE key_hash = ? AND created_at >= NOW() - INTERVAL 15 MINUTE LIMIT 1',
                [locTokenHash]
            ).catch(() => []);

            if (isLocationTokenReplayed(cleanLocToken) || (existingReplayRows && existingReplayRows.length > 0)) {
                tokenVerificationError = {
                    code: 'ZALO_TOKEN_ALREADY_USED',
                    message: 'Mã định vị Zalo đã được sử dụng trước đó. Vui lòng bấm Thử lại để lấy vị trí mới!'
                };
            } else {
                const locRes = await verifyZaloLocationToken({
                    locationToken: cleanLocToken,
                    userAccessToken: zalo_access_token || ''
                });

                if (locRes && locRes.verified && Number.isFinite(Number(locRes.lat)) && Number.isFinite(Number(locRes.lng))) {
                    numLat = Number(locRes.lat);
                    numLng = Number(locRes.lng);
                    resolvedSource = 'token';
                    await query(
                        `INSERT INTO idempotency_keys (key_hash, actor_id, endpoint, response_status, response_body)
                         VALUES (?, ?, 'LOC_TOKEN_REPLAY_GUARD', 200, NULL)
                         ON DUPLICATE KEY UPDATE created_at = NOW(), actor_id = VALUES(actor_id)`,
                        [locTokenHash, ma_nv]
                    ).catch(() => {});
                } else if (numLat === null || numLng === null) {
                    tokenVerificationError = {
                        code: locRes?.errorCode || 'INVALID_ZALO_LOCATION_TOKEN',
                        message:
                            locRes?.message ||
                            'Token định vị Zalo không hợp lệ hoặc đã hết hạn. Vui lòng bấm Thử lại để lấy vị trí mới!'
                    };
                }
            }
        }

        let matchedBranch = null;
        let nearestBranch = allowedLocations[0] || { id: 'loc_hq_1', name: 'Trụ sở chính Đà Nẵng', lat: 16.0544, lng: 108.2022, radius: 500, attendance_method: 'GPS' };
        let minDistanceMeters = Infinity;

        if (numLat !== null && numLng !== null) {
            for (const loc of allowedLocations) {
                const dist = calculateDistanceMeters(numLat, numLng, Number(loc.lat), Number(loc.lng));
                if (dist < minDistanceMeters) {
                    minDistanceMeters = dist;
                    nearestBranch = loc;
                }
                if (dist <= (Number(loc.radius) || 500) && !matchedBranch) {
                    matchedBranch = loc;
                }
            }
        }

        const todayLog = todayLogRows && todayLogRows[0] ? todayLogRows[0] : null;
        const todayHoliday = holRows && holRows[0] ? holRows[0] : null;
        const effToday = computeTodayEffectiveStatus({
            todayStr: dateStr,
            todayLog,
            holidays: todayHoliday ? [todayHoliday] : []
        });

        const isAdmin = emp.role === 'admin' || current_user.role === 'admin';
        const isAccountLocked = emp.status === 'inactive' || emp.is_locked === 1 || emp.is_locked === true;
        const lockedCodes = ['P', 'L', 'KL', 'OT', '1+OT'];
        const isStatusLocked = lockedCodes.includes(effToday.effective_code) || (effToday.effective_code === '1' && effToday.is_admin_adjusted);
        const alreadyCheckedOut = Boolean(todayLog && todayLog.check_in_time && todayLog.check_out_time);

        let blockReason = null;
        let errorCode = null;
        if (isAdmin) {
            blockReason = 'Tài khoản Quản trị viên không tham gia chấm công cá nhân.';
            errorCode = 'ADMIN_EXCLUDED';
        } else if (isAccountLocked) {
            blockReason = 'Tài khoản nhân sự đang bị tạm khóa.';
            errorCode = 'ACCOUNT_LOCKED';
        } else if (isLocked) {
            blockReason = `Kỳ công Tháng ${currentMonth}/${currentYear} đã bị khóa sổ.`;
            errorCode = 'PERIOD_LOCKED';
        } else if (isStatusLocked) {
            blockReason = effToday.note || 'Trạng thái công hôm nay đã được chốt.';
            errorCode = 'EFFECTIVE_STATUS_LOCKED';
        } else if (alreadyCheckedOut) {
            blockReason = 'Bạn đã hoàn tất cả vào ca và tan ca hôm nay.';
            errorCode = 'ALREADY_CHECKED_OUT';
        } else if (!isFieldWork && !matchedWifi && tokenVerificationError && (numLat === null || numLng === null)) {
            blockReason = tokenVerificationError.message;
            errorCode = tokenVerificationError.code;
        } else if (!isFieldWork && !matchedBranch && !matchedWifi && numLat !== null && numLng !== null) {
            const distRounded = Number.isFinite(minDistanceMeters) ? Math.round(minDistanceMeters) : 999999;
            blockReason = `Bạn đang ngoài phạm vi các điểm chấm công văn phòng (Cách ${nearestBranch.name} ${distRounded}m, cho phép ${nearestBranch.radius}m). Nếu bạn đang đi thị trường/công trình, hãy chọn chế độ "Đi công trình"!`;
            errorCode = 'OUT_OF_GEOFENCE';
        } else if (!isFieldWork && !matchedBranch && !matchedWifi && (numLat === null || numLng === null)) {
            blockReason = 'Chưa xác định được vị trí GPS và không thuộc mạng Wi-Fi nội bộ văn phòng.';
            errorCode = 'EMPTY_LOCATION';
        }

        const checkType = (todayLog && todayLog.check_in_time && !todayLog.check_out_time) ? 'OUT' : 'IN';
        const activeShiftCode = (emp.shift_type && SHIFT_DEFINITIONS[String(emp.shift_type).trim().toUpperCase()])
            ? String(emp.shift_type).trim().toUpperCase()
            : 'FULL_DAY';

        const distanceMetersRounded = Number.isFinite(minDistanceMeters) ? Math.round(minDistanceMeters) : null;
        const isAllowed = !blockReason;

        // Cấp chứng chỉ vị trí 1 lần (location_proof_token) để /check-in sử dụng mà không cần gọi lại graph.zalo.me
        const locationProofToken = isAllowed
            ? issueLocationProofToken({
                  userId: ma_nv,
                  lat: numLat,
                  lng: numLng,
                  distance: distanceMetersRounded,
                  mode: isFieldWork ? 'FIELD_WORK' : 'OFFICE',
                  source: isFieldWork ? (resolvedSource === 'none' ? 'field_fallback' : resolvedSource) : resolvedSource
              })
            : null;

        return {
            ready: isAllowed,
            allowed: isAllowed,
            can_check_in: isAllowed,
            block_reason: blockReason,
            error_code: errorCode,
            location_proof_token: locationProofToken,
            verified_lat: numLat,
            verified_lng: numLng,
            resolved_lat: numLat,
            resolved_lng: numLng,
            location_source: resolvedSource,
            check_type: checkType,
            shift_type: activeShiftCode,
            shift_label: (SHIFT_DEFINITIONS[activeShiftCode] || SHIFT_DEFINITIONS.FULL_DAY).label,
            today_effective_status: effToday,
            matched_branch: matchedBranch ? { id: matchedBranch.id, name: matchedBranch.name, radius: matchedBranch.radius, attendance_method: 'GPS' } : null,
            nearest_branch: nearestBranch ? { id: nearestBranch.id, name: nearestBranch.name, radius: nearestBranch.radius, attendance_method: 'GPS' } : null,
            distance_meters: distanceMetersRounded,
            in_geofence: isFieldWork ? true : Boolean(matchedBranch || matchedWifi),
            matched_wifi: matchedWifi,
            work_location_type: isFieldWork ? 'FIELD_WORK' : 'OFFICE',
            required_method: 'GPS',
            requires_qr: false,
            period_locked: Boolean(isLocked),
            server_date_vn: dateStr,
            server_time_vn: timeStr,
            timezone: 'Asia/Ho_Chi_Minh'
        };
    }

    async checkInMultiFactor({ lat, lng, location_proof_token = null, zalo_location_token, zalo_access_token = '', qr_token = null, client_nonce = null, attendance_mode = null, image_snapshot, device_info, device_name = null, user_agent = '', is_fake_gps = false, is_fake_device = false, gps_accuracy = null, work_location_type = 'OFFICE', field_note = '', shift_type = null, action_type = 'IN', current_user = null, ip_address = '', currentTime = null, faultInjectionHook = null }) {
        if (!current_user || !current_user.ma_nv) {
            const error = new Error('Yêu cầu đăng nhập tài khoản nhân viên để chấm công!');
            error.statusCode = 401;
            throw error;
        }

        const ma_nv = current_user.ma_nv;
        const requestedAction = String(action_type || 'IN').trim().toUpperCase().includes('OUT') ? 'OUT' : 'IN';
        const { getVietnamDateString, getVietnamTimeString } = require('../utils/timeHelper');
        const today = currentTime instanceof Date ? currentTime : new Date();
        const dateStr = getVietnamDateString(today);
        const timeStr = getVietnamTimeString(today);

        // 1. Kiểm tra tài khoản có bị tạm khóa không & lấy thông tin ràng buộc thiết bị + ca làm việc riêng
        const empCheck = await query("SELECT ma_nv, ho_ten, role, is_locked, status, luong_cb, ngay_chinh_thuc, chuc_danh, bound_device_id, bound_device_name, device_binding_mode, known_devices_json, COALESCE(multi_device_alert, 0) as multi_device_alert, COALESCE(shift_type, 'FULL_DAY') as shift_type, custom_start_time, custom_end_time FROM employees WHERE ma_nv = ?", [ma_nv]);
        if (!empCheck || empCheck.length === 0) {
            const error = new Error('Mã nhân viên không tồn tại trong hệ thống!');
            error.statusCode = 404;
            throw error;
        }
        const emp = empCheck[0];
        if (emp.role === 'admin' || current_user.role === 'admin') {
            const error = new Error('Tài khoản Quản trị viên chỉ dùng để quản lý hệ thống, không tham gia chấm công cá nhân!');
            error.statusCode = 403;
            throw error;
        }
        if (emp.role === 'accountant' || current_user.role === 'accountant') {
            const perms = await getAccountantPermissions().catch(() => ({}));
            if (!perms?.accountant_manual_checkin) {
                const error = new Error('Tài khoản Kế toán đang ở chế độ tự động tính công, không cần chấm công thủ công.');
                error.statusCode = 403;
                error.code = 'ACCOUNTANT_AUTO_ATTENDANCE_MODE';
                throw error;
            }
        }
        if (emp.status === 'inactive' || emp.is_locked === 1 || emp.is_locked === true) {
            const error = new Error(`Tài khoản nhân viên ${ma_nv} đang bị TẠM KHÓA. Không thể thực hiện chấm công!`);
            error.statusCode = 403;
            throw error;
        }

        // 2. Xác thực / định tuyến ảnh minh chứng chấm công qua hệ thống Media tập trung (Cloudinary / Protected Access)
        let resolvedCheckInImageRef = null;
        if (image_snapshot && typeof image_snapshot === 'string' && image_snapshot.trim()) {
            const trimmedImg = image_snapshot.trim();
            if (trimmedImg.startsWith('/api/media/') || trimmedImg.startsWith('https://res.cloudinary.com/')) {
                const { validateMediaReference } = require('../utils/mediaValidator');
                resolvedCheckInImageRef = validateMediaReference(trimmedImg, { maxInlineBytes: 155 * 1024, allowNull: true });
            } else {
                const cloudinaryService = require('./cloudinaryService');
                const uploaded = await cloudinaryService.uploadEvidenceMedia({
                    file_data_url: trimmedImg,
                    category: 'attendance_evidence',
                    reference_date: currentTime ? undefined : getVietnamDateString(new Date()),
                    current_user,
                    ip_address
                });
                resolvedCheckInImageRef = uploaded?.url || null;
            }
        }

        // Chuẩn hóa chuỗi định danh & tên thương mại thiết bị
        const deviceIdentity = parseDeviceIdentity({ device_name, device_info, user_agent });
        const deviceStr = deviceIdentity.deviceId || null;

        // Đọc cấu hình công ty & kiểm tra Wi-Fi nội bộ trước để hỗ trợ fallback mượt mà
        const companySettingsRows = await query('SELECT * FROM company_settings LIMIT 1');
        const cs = (companySettingsRows && companySettingsRows[0]) ? companySettingsRows[0] : {};
        const allowedLocations = parseAllowedLocations(
            cs.allowed_locations,
            cs.latitude,
            cs.longitude,
            cs.radius_meters
        );
        const cleanClientIp = normalizeIp(ip_address);
        const ipWhitelist = String(cs.office_ip_whitelist || '')
            .split(',')
            .map(s => normalizeIp(s))
            .filter(Boolean);
        const matchedWifiIp = Boolean(cleanClientIp && ipWhitelist.includes(cleanClientIp));

        // 3. Xác thực Vị trí & Khóa Replay Token định vị Zalo qua idempotency_keys (TTL 15 phút)
        let location_source = 'raw';
        let is_low_trust = 1;
        let finalLat = lat;
        let finalLng = lng;
        let numLat = (lat !== null && lat !== undefined && lat !== '' && Number.isFinite(Number(lat))) ? Number(lat) : null;
        let numLng = (lng !== null && lng !== undefined && lng !== '' && Number.isFinite(Number(lng))) ? Number(lng) : null;

        // Helper kích hoạt Cảnh báo Đỏ 2 chiều (CRITICAL_FRAUD)
        // V65: Tuyệt đối KHÔNG tự động INSERT status = '0' (Nghỉ không lương) vào attendance_logs khi phát sinh lỗi thao tác / bảo mật!
        const triggerCriticalFraud = async (fraudType, fraudReason) => {
            await logAuditEvent({
                actor_id: ma_nv,
                actor_role: current_user.role || 'worker',
                action: 'CRITICAL_FRAUD',
                resource: 'attendance_security',
                details: {
                    fraud_type: fraudType,
                    reason: fraudReason,
                    device_fingerprint: deviceStr,
                    lat: numLat,
                    lng: numLng,
                    date: dateStr,
                    time: timeStr
                },
                ip_address
            });

            const error = new Error('⚠️ Không thể xác nhận chấm công do phát hiện tín hiệu vị trí giả lập (Mock Location). Vui lòng tắt ứng dụng giả lập GPS và thử lại!');
            error.statusCode = 403;
            error.code = 'SECURITY_VIOLATION_FRAUD';
            error.fraud_type = fraudType;
            error.fraud_reason = fraudReason;
            throw error;
        };

        const isFieldWorkReq = normalizeWorkMode(work_location_type) === 'FIELD_WORK';

        if (location_proof_token && String(location_proof_token).trim()) {
            const { verifyAndConsumeLocationProofToken } = require('../utils/zaloAdapter');
            const proof = await verifyAndConsumeLocationProofToken(location_proof_token, ma_nv);
            if (proof.lat !== null && proof.lat !== undefined && proof.lng !== null && proof.lng !== undefined) {
                finalLat = proof.lat;
                finalLng = proof.lng;
                numLat = Number(proof.lat);
                numLng = Number(proof.lng);
            }
            location_source = proof.source || 'token';
            is_low_trust = 0;
        } else if (zalo_location_token) {
            const { verifyZaloLocationToken, isLocationTokenReplayed } = require('../utils/zaloAdapter');
            const cleanLocToken = String(zalo_location_token).trim();
            const locTokenHash = `LOC_TOKEN_${crypto.createHash('sha256').update(cleanLocToken).digest('hex').slice(0, 50)}`;

            const existingReplayRows = await query(
                'SELECT key_hash FROM idempotency_keys WHERE key_hash = ? AND created_at >= NOW() - INTERVAL 15 MINUTE LIMIT 1',
                [locTokenHash]
            ).catch(() => []);

            if (isLocationTokenReplayed(cleanLocToken) || (existingReplayRows && existingReplayRows.length > 0)) {
                const replayErr = new Error('Mã định vị Zalo đã được sử dụng trước đó. Vui lòng bấm Thử lại để lấy vị trí mới!');
                replayErr.statusCode = 400;
                replayErr.code = 'ZALO_TOKEN_ALREADY_USED';
                throw replayErr;
            }

            const locResult = await verifyZaloLocationToken({
                locationToken: cleanLocToken,
                userAccessToken: zalo_access_token || ''
            });

            if (locResult && locResult.verified && locResult.lat !== undefined && locResult.lng !== undefined) {
                finalLat = locResult.lat;
                finalLng = locResult.lng;
                if (Number.isFinite(Number(finalLat)) && Number.isFinite(Number(finalLng))) {
                    numLat = Number(finalLat);
                    numLng = Number(finalLng);
                }
                location_source = 'token';
                is_low_trust = 0;
                await query(
                    `INSERT INTO idempotency_keys (key_hash, actor_id, endpoint, response_status, response_body)
                     VALUES (?, ?, 'LOC_TOKEN_REPLAY_GUARD', 200, NULL)
                     ON DUPLICATE KEY UPDATE created_at = NOW(), actor_id = VALUES(actor_id)`,
                    [locTokenHash, ma_nv]
                ).catch(() => {});
            } else if (numLat === null || numLng === null) {
                if (!matchedWifiIp && !isFieldWorkReq) {
                    const err = new Error(
                        locResult?.message ||
                            'Token định vị Zalo không hợp lệ, đã hết hạn hoặc bị chỉnh sửa. Vui lòng bấm Thử lại để lấy vị trí mới!'
                    );
                    err.statusCode = locResult?.errorCode === 'ZALO_GRAPH_TIMEOUT' ? 504 : 400;
                    err.code = locResult?.errorCode || 'INVALID_ZALO_LOCATION_TOKEN';
                    throw err;
                }
            }
        }

        const hasRawCoords = finalLat !== null && finalLat !== undefined && finalLat !== '' &&
            finalLng !== null && finalLng !== undefined && finalLng !== '';

        // 3.0 Kiểm tra Nonce chống Replay Request & Dynamic QR Token (nếu có)
        let verifiedQrInfo = null;
        let qrVerifiedBranch = null;
        let qrNonceHash = null;
        let clientNonceHash = null;

        if (client_nonce && typeof client_nonce === 'string' && client_nonce.trim()) {
            const cleanNonce = client_nonce.trim().slice(0, 128);
            clientNonceHash = `CLI_NONCE_${crypto.createHash('sha256').update(`${ma_nv}:${cleanNonce}`).digest('hex').slice(0, 50)}`;
            const existingClientNonce = await query(
                'SELECT key_hash FROM idempotency_keys WHERE key_hash = ? AND created_at >= NOW() - INTERVAL 15 MINUTE LIMIT 1',
                [clientNonceHash]
            ).catch(() => []);
            if (existingClientNonce && existingClientNonce.length > 0) {
                const err = new Error('Yêu cầu chấm công trùng lặp hoặc có dấu hiệu gửi lại (Replay Request). Vui lòng thử lại!');
                err.statusCode = 409;
                err.code = 'NONCE_REPLAYED';
                throw err;
            }
        }

        if (qr_token && typeof qr_token === 'string' && qr_token.trim()) {
            const qrEpoch = Math.floor(today.getTime() / 1000);
            verifiedQrInfo = verifyAttendanceQrToken(qr_token, qrEpoch);
            qrNonceHash = `QR_NONCE_${crypto.createHash('sha256').update(verifiedQrInfo.nonce).digest('hex').slice(0, 52)}`;
            const existingQrNonce = await query(
                'SELECT key_hash FROM idempotency_keys WHERE key_hash = ? AND created_at >= NOW() - INTERVAL 15 MINUTE LIMIT 1',
                [qrNonceHash]
            ).catch(() => []);
            if (existingQrNonce && existingQrNonce.length > 0) {
                const err = new Error('Mã QR chấm công này đã được sử dụng trước đó (chống replay attack). Vui lòng quét mã QR mới nhất!');
                err.statusCode = 403;
                err.code = 'QR_TOKEN_REPLAYED';
                throw err;
            }
            qrVerifiedBranch = allowedLocations.find((loc) => String(loc.id) === String(verifiedQrInfo.branch_id)) || null;
            if (!qrVerifiedBranch) {
                const err = new Error('Mã QR không thuộc chi nhánh hoặc địa điểm hợp lệ của Sedinco!');
                err.statusCode = 400;
                err.code = 'INVALID_QR_BRANCH';
                throw err;
            }
        }

        if (!hasRawCoords && !matchedWifiIp && !qrVerifiedBranch && !isFieldWorkReq) {
            const error = new Error('Không thể xác định tọa độ GPS hiện tại. Vui lòng bật GPS trên điện thoại, kết nối Wi-Fi Công ty hoặc bật chế độ Đi Công Trình và thử lại!');
            error.statusCode = 400;
            throw error;
        }

        if (hasRawCoords) {
            numLat = Number(finalLat);
            numLng = Number(finalLng);
            if (isNaN(numLat) || isNaN(numLng) || numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
                if (!matchedWifiIp) {
                    const error = new Error('Tọa độ GPS ngoài phạm vi hợp lệ (Vĩ độ: [-90, 90], Kinh độ: [-180, 180])!');
                    error.statusCode = 400;
                    throw error;
                }
                numLat = null;
                numLng = null;
            }
        }

        // 3.1 Kiểm tra cờ Fake GPS trực tiếp hoặc độ chính xác giả mạo
        if (is_fake_gps === true || is_fake_gps === 'true' || (gps_accuracy !== null && Number(gps_accuracy) < 0)) {
            await triggerCriticalFraud('FAKE_GPS', 'Phát hiện phần mềm giả mạo vị trí (Mock Location / Fake GPS)');
        }

        // 3.2 Ghi nhận hoạt động thiết bị (không chặn cứng khi nhân viên di chuyển giữa Văn phòng và Công trình hoặc dùng Zalo WebView)
        let is_suspicious = false;
        let suspicious_reason = null;

        if (is_fake_device === true || is_fake_device === 'true') {
            await triggerCriticalFraud('UNREGISTERED_DEVICE', `Phát hiện thiết bị giả mạo (${deviceStr || 'Unknown Device'})`);
        }

        if ((current_user.role === 'worker' || current_user.role === 'accountant') && deviceStr) {
            await recordEmployeeDeviceActivity(emp, {
                device_id: deviceStr,
                device_name: deviceIdentity.deviceName,
                device_info,
                user_agent,
                ip_address: cleanClientIp,
                source: 'check_in'
            });
        }

        // 4. Đối soát Geofence Đa chi nhánh (allowed_locations) + IP Wi-Fi Nội bộ + Chế độ Đi Công Trình (Tự do mọi nơi, không cần đăng ký trước)
        let matchedLocation = null;
        let nearestLocation = allowedLocations[0] || { name: 'Trụ sở chính Đà Nẵng', lat: 16.0544, lng: 108.2022, radius: 500 };
        let minDistanceMeters = Infinity;

        if (numLat !== null && numLng !== null) {
            for (const loc of allowedLocations) {
                const dist = calculateDistanceMeters(numLat, numLng, Number(loc.lat), Number(loc.lng));
                if (dist < minDistanceMeters) {
                    minDistanceMeters = dist;
                    nearestLocation = loc;
                }
                if (dist <= (Number(loc.radius) || 500) && !matchedLocation) {
                    matchedLocation = loc;
                }
            }
        }

        const distanceMeters = Number.isFinite(minDistanceMeters) ? Math.round(minDistanceMeters) : 999999;
        const isFieldWork = isFieldWorkReq;
        let finalLocationType = 'OFFICE';
        let locationName = nearestLocation.name || 'Trụ sở chính';
        let cleanFieldNote = field_note ? String(field_note).trim().slice(0, 400) : '';
        const targetBranchPolicy = String((qrVerifiedBranch || matchedLocation || nearestLocation)?.attendance_method || 'GPS').toUpperCase();

        if (!isFieldWork && targetBranchPolicy === 'GPS_AND_QR' && !qrVerifiedBranch) {
            const err = new Error(`Chi nhánh ${(matchedLocation || nearestLocation)?.name || 'hiện tại'} yêu cầu quét mã QR động kết hợp định vị GPS để chấm công!`);
            err.statusCode = 400;
            err.code = 'QR_REQUIRED';
            throw err;
        }
        if (!isFieldWork && targetBranchPolicy === 'QR_ONLY' && !qrVerifiedBranch) {
            const err = new Error(`Chi nhánh ${(matchedLocation || nearestLocation)?.name || 'hiện tại'} yêu cầu quét mã QR động tại điểm chấm công!`);
            err.statusCode = 400;
            err.code = 'QR_REQUIRED';
            throw err;
        }

        if (isFieldWork) {
            // V65: Đi công trình KHÔNG cần đăng ký trước, lấy GPS ở bất cứ đâu và luôn được phép chấm công Vào / Ra
            finalLocationType = 'FIELD_WORK';
            locationName = cleanFieldNote
                ? `Công trình: ${cleanFieldNote.slice(0, 80)}`
                : 'Đi công trình (GPS)';
            if (location_source === 'token') {
                is_low_trust = 0;
            }
        } else if (matchedLocation) {
            if (targetBranchPolicy === 'GPS_AND_QR' && qrVerifiedBranch && String(matchedLocation.id) !== String(qrVerifiedBranch.id)) {
                const err = new Error('Vị trí GPS và mã QR động không khớp cùng một chi nhánh!');
                err.statusCode = 400;
                err.code = 'QR_BRANCH_MISMATCH';
                throw err;
            }
            finalLocationType = 'OFFICE';
            locationName = qrVerifiedBranch ? `${qrVerifiedBranch.name} (QR + GPS)` : matchedLocation.name;
            if (qrVerifiedBranch) {
                location_source = location_source === 'token' ? 'token_and_qr' : 'qr_verified';
                is_low_trust = 0;
            }
        } else if (qrVerifiedBranch && (targetBranchPolicy === 'QR_ONLY' || String(attendance_mode || '').toUpperCase() === 'QR_FALLBACK')) {
            if (targetBranchPolicy === 'GPS_AND_QR') {
                const err = new Error(
                    `Chi nhánh ${qrVerifiedBranch.name} yêu cầu ở trong vùng GPS (Cách ${distanceMeters}m, cho phép ${qrVerifiedBranch.radius}m) cùng với mã QR!`
                );
                err.statusCode = 400;
                err.code = 'OUT_OF_GEOFENCE';
                throw err;
            }
            finalLocationType = 'QR_BRANCH';
            locationName = `${qrVerifiedBranch.name} (QR Động)`;
            location_source = 'qr_verified';
            is_low_trust = 0;
        } else if (matchedWifiIp) {
            finalLocationType = 'WIFI_OFFICE';
            locationName = qrVerifiedBranch
                ? `${qrVerifiedBranch.name} (QR + Wi-Fi Nội bộ)`
                : `Wi-Fi Nội bộ (${cleanClientIp})`;
            is_low_trust = 0;
        } else {
            const error = new Error(
                `Bạn đang ngoài phạm vi các điểm chấm công (Cách ${nearestLocation.name} ${distanceMeters}m, cho phép ${nearestLocation.radius}m). Nếu bạn đang đi thị trường/công trình, hãy chọn nút "Đi Công Trình / Thị Trường"!`
            );
            error.statusCode = 400;
            error.code = 'OUT_OF_GEOFENCE';
            error.nearest_location = nearestLocation.name;
            error.distance_meters = distanceMeters;
            throw error;
        }

        // 6. Kiểm tra kỳ công có bị khóa sổ không
        const [currentYear, currentMonth] = dateStr.split('-').map(Number);
        const isLocked = await this.isPeriodLocked(currentMonth, currentYear);
        if (isLocked) {
            const error = new Error(`Kỳ công Tháng ${currentMonth}/${currentYear} đã bị KHÓA SỔ. Không thể chấm công!`);
            error.statusCode = 400;
            error.code = 'PERIOD_LOCKED';
            throw error;
        }

        // 7. Phân tích Giờ Vào / Giờ Ra theo Giờ Riêng của Nhân Viên -> Ca làm việc -> Cấu hình Công ty
        const requestedShift = shift_type && SHIFT_DEFINITIONS[String(shift_type).trim().toUpperCase()]
            ? String(shift_type).trim().toUpperCase()
            : null;
        const empAssignedShift = emp.shift_type && SHIFT_DEFINITIONS[String(emp.shift_type).trim().toUpperCase()]
            ? String(emp.shift_type).trim().toUpperCase()
            : 'FULL_DAY';
        let activeShiftCode = requestedShift || empAssignedShift;
        let hasMorningHalfLeave = false;
        let hasMorningPaidHalfLeave = false;
        let hasAfternoonPaidHalfLeave = false;
        const todayLeaves = await query(
            `SELECT request_type, reason FROM requests WHERE employee_id = ? AND request_date = ? AND status = 'approved'`,
            [ma_nv, dateStr]
        ).catch(() => []);
        for (const r of todayLeaves || []) {
            const rType = String(r.request_type || '').toLowerCase();
            const txt = `${rType} ${r.reason || ''}`.toLowerCase();
            const isHalf = txt.includes('0.5') || txt.includes('nửa ngày') || txt.includes('buổi sáng') || txt.includes('buổi chiều');
            const isUnpaid = rType === 'kp' || txt.includes('không lương') || txt.includes('unpaid');
            if (isHalf && !txt.includes('chiều')) {
                hasMorningHalfLeave = true;
                if (!isUnpaid) hasMorningPaidHalfLeave = true;
            } else if (isHalf && txt.includes('chiều') && !isUnpaid) {
                hasAfternoonPaidHalfLeave = true;
            }
        }
        if (activeShiftCode === 'FULL_DAY' && hasMorningHalfLeave) {
            activeShiftCode = 'AFTERNOON_SHIFT';
        }
        const activeShiftDef = SHIFT_DEFINITIONS[activeShiftCode] || SHIFT_DEFINITIONS.FULL_DAY;
        const resolvedSchedule = resolveEmployeeWorkSchedule({
            emp,
            cs,
            activeShiftCode,
            hasMorningHalfLeave,
            hasRequestedShift: Boolean(requestedShift)
        });

        const workStartStr = resolvedSchedule.workStartStr;
        const lunchStartStr = resolvedSchedule.lunchStartStr;
        const lunchEndStr = resolvedSchedule.lunchEndStr;
        const workEndStr = resolvedSchedule.workEndStr;
        const graceMinutes = cs.grace_period_minutes !== undefined && cs.grace_period_minutes !== null ? Number(cs.grace_period_minutes) : 15;

        const workStartMins = this.parseTimeToMinutes(workStartStr, 480);   // 08:00 -> 480
        const lunchStartMins = this.parseTimeToMinutes(lunchStartStr, 720); // 12:00 -> 720
        const lunchEndMins = this.parseTimeToMinutes(lunchEndStr, 810);     // 13:30 -> 810
        const workEndMins = this.parseTimeToMinutes(workEndStr, 1050);      // 17:30 -> 1050
        const currentMins = this.parseTimeToMinutes(timeStr, 480);
        const currentSecs = this.parseTimeToSeconds(timeStr);
        const shortTime = timeStr.slice(0, 5);
        const prevDateStr = getVietnamDateString(new Date(today.getTime() - 24 * 3600 * 1000));

        const checkInMethod = finalLocationType === 'FIELD_WORK'
            ? 'field_checkin'
            : finalLocationType === 'WIFI_OFFICE'
            ? 'wifi_office'
            : qrVerifiedBranch
            ? 'dynamic_qr'
            : 'one_touch_gps';

        const txOutcome = await withTransaction(async (txQuery) => {
            if (faultInjectionHook && process.env.NODE_ENV === 'test') {
                await faultInjectionHook(txQuery);
            }

            // Khóa dòng nhân viên trong Transaction để serialize mọi cú bấm chấm công đồng thời
            await txQuery('SELECT ma_nv FROM employees WHERE ma_nv = ? FOR UPDATE', [ma_nv]);

            let targetRecordDate = dateStr;
            const existingRows = await txQuery(
                'SELECT * FROM attendance_logs WHERE employee_id = ? AND record_date = ? FOR UPDATE',
                [ma_nv, targetRecordDate]
            );
            let existingLog = existingRows && existingRows.length > 0 ? existingRows[0] : null;

            // Xử lý ranh giới qua đêm dành riêng cho NIGHT_SHIFT (trước 06:00 sáng đóng ca đêm ngày hôm trước)
            if (!existingLog && activeShiftCode === 'NIGHT_SHIFT' && currentMins < 360) {
                const prevNightRows = await txQuery(
                    "SELECT * FROM attendance_logs WHERE employee_id = ? AND record_date = ? AND shift_type = 'NIGHT_SHIFT' AND check_in_time IS NOT NULL AND (check_out_time IS NULL OR check_out_time = '') FOR UPDATE",
                    [ma_nv, prevDateStr]
                );
                if (prevNightRows && prevNightRows.length > 0) {
                    existingLog = prevNightRows[0];
                    targetRecordDate = prevDateStr;
                    const [prevY, prevM] = prevDateStr.split('-').map(Number);
                    if (prevM !== currentMonth || prevY !== currentYear) {
                        const prevLockRows = await txQuery(
                            'SELECT is_locked FROM period_locks WHERE month = ? AND year = ? LIMIT 1',
                            [prevM, prevY]
                        );
                        if (prevLockRows?.[0]?.is_locked) {
                            const err = new Error(`Kỳ công Tháng ${prevM}/${prevY} của ca đêm đã bị KHÓA SỔ. Không thể chấm ra!`);
                            err.statusCode = 400;
                            err.code = 'PERIOD_LOCKED';
                            throw err;
                        }
                    }
                }
            }
            const [targetYear, targetMonth] = targetRecordDate.split('-').map(Number);

            const hasExistingCheckIn = Boolean(existingLog && existingLog.check_in_time);
            const hasExistingCheckOut = Boolean(existingLog && existingLog.check_out_time);

            // V65 Unified State Machine Guardrails (ưu tiên kiểm tra trạng thái Vào/Ra trước):
            if (requestedAction === 'IN') {
                if (hasExistingCheckIn) {
                    const err = new Error('Bạn đã chấm công vào ca hôm nay rồi.');
                    err.statusCode = 409;
                    err.code = 'ALREADY_CHECKED_IN';
                    throw err;
                }
            } else if (requestedAction === 'OUT') {
                if (!hasExistingCheckIn) {
                    const err = new Error('Bạn chưa chấm công vào ca hôm nay.');
                    err.statusCode = 400;
                    err.code = 'NOT_CHECKED_IN_YET';
                    throw err;
                }
                if (hasExistingCheckOut) {
                    const err = new Error('Bạn đã hoàn tất chấm công ra ca hôm nay rồi.');
                    err.statusCode = 409;
                    err.code = 'ALREADY_CHECKED_OUT';
                    throw err;
                }
            }

            const holRows = await txQuery(
                "SELECT id, holiday_name, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date, COALESCE(salary_multiplier, 3.00) as salary_multiplier FROM public_holidays WHERE start_date <= ? AND end_date >= ? LIMIT 1",
                [targetRecordDate, targetRecordDate]
            ).catch(() => []);
            const todayHoliday = holRows && holRows[0] ? holRows[0] : null;
            const effToday = computeTodayEffectiveStatus({
                todayStr: targetRecordDate,
                todayLog: existingLog,
                holidays: todayHoliday ? [todayHoliday] : []
            });
            const lockedCodes = ['P', 'L', 'KL', 'OT', '1+OT'];
            if (
                lockedCodes.includes(effToday.effective_code) ||
                (effToday.effective_code === '1' && effToday.is_admin_adjusted)
            ) {
                const err = new Error(effToday.note || 'Hôm nay đã được ghi nhận công hoặc nghỉ theo quy định, không thể chấm công thêm!');
                err.statusCode = 400;
                err.code = 'EFFECTIVE_STATUS_LOCKED';
                throw err;
            }

            const isCheckOut = requestedAction === 'OUT';
            const checkType = isCheckOut ? 'OUT' : 'IN';
            let resolvedCheckInMode = isFieldWork ? 'FIELD_WORK' : 'OFFICE';
            let resolvedCheckOutMode = null;
            let resolvedWorkLocationType = finalLocationType;
            let resolvedFieldNote = cleanFieldNote || null;
            let late_minutes = existingLog ? (Number(existingLog.late_minutes) || 0) : 0;
            let early_leave_minutes = 0;
            let work_hours = existingLog ? (Number(existingLog.work_hours) || 0) : 0;
            let ot_hours = existingLog ? (Number(existingLog.ot_hours) || 0) : 0;
            let morning_worked_minutes = existingLog ? (Number(existingLog.morning_worked_minutes) || 0) : 0;
            let afternoon_worked_minutes = existingLog ? (Number(existingLog.afternoon_worked_minutes) || 0) : 0;
            let work_credit = (existingLog && existingLog.work_credit !== null && existingLog.work_credit !== undefined)
                ? Number(existingLog.work_credit)
                : 0;
            let duration_status = existingLog ? (existingLog.duration_status || null) : null;
            let session_summary = '';
            let newStatus = existingLog && existingLog.status && existingLog.status !== '0' ? existingLog.status : '1';
            let shiftEvaluation = '';
            let detailedMessage = '';

            if (!isCheckOut) {
                // LẦN BẤM 1 TRONG NGÀY -> CHECK-IN (VÀO CA)
                // Nếu nhân viên ca hành chính chỉ vào làm buổi chiều (>= giờ nghỉ trưa), đối chiếu mốc ca chiều (lunchEndStr = 13:30)
                const isAfternoonOnlyCheckIn = activeShiftCode === 'FULL_DAY' && currentMins >= lunchStartMins;
                const effectiveCheckInStartMins = isAfternoonOnlyCheckIn ? lunchEndMins : workStartMins;
                const effectiveCheckInStartStr = isAfternoonOnlyCheckIn ? lunchEndStr : workStartStr;

                if (isAfternoonOnlyCheckIn && !hasMorningPaidHalfLeave) {
                    newStatus = '0.5';
                    work_credit = 0.5;
                }

                if (currentMins <= effectiveCheckInStartMins) {
                    late_minutes = 0;
                    const earlyBy = effectiveCheckInStartMins - currentMins;
                    shiftEvaluation = earlyBy > 0
                        ? `Tuyệt vời! Bạn đến sớm ${earlyBy} phút (Giờ vào: ${shortTime})`
                        : `Tuyệt vời! Bạn đến đúng giờ (${shortTime})`;
                    detailedMessage = shiftEvaluation;
                } else if (currentMins <= effectiveCheckInStartMins + graceMinutes) {
                    late_minutes = 0;
                    shiftEvaluation = `Đúng giờ (Trong ${graceMinutes}p ân hạn)`;
                    detailedMessage = `Đã ghi nhận Giờ vào: ${shortTime} (${shiftEvaluation})`;
                } else {
                    late_minutes = currentMins - effectiveCheckInStartMins;
                    let halfDayNote = '';
                    const policyType = String(cs.late_policy_type || 'PER_MINUTE').toUpperCase();
                    const maxLateHalfDay = Math.max(1, Number(cs.max_late_minutes_for_half_day ?? 60) || 60);
                    const freeLateCount = cs.free_late_occurrences !== undefined && cs.free_late_occurrences !== null
                        ? Math.max(0, Number(cs.free_late_occurrences))
                        : 3;

                    const freeExemptsHalfday = Boolean(
                        cs.free_late_exempts_halfday === true ||
                        cs.free_late_exempts_halfday === 1 ||
                        String(cs.free_late_exempts_halfday) === '1'
                    );

                    if (policyType === 'DEDUCT_WORKDAY' && late_minutes > maxLateHalfDay) {
                        const priorLateRows = await txQuery(
                            'SELECT COUNT(*) as cnt FROM attendance_logs WHERE employee_id = ? AND MONTH(record_date) = ? AND YEAR(record_date) = ? AND record_date != ? AND late_minutes > 0',
                            [ma_nv, targetMonth, targetYear, targetRecordDate]
                        );
                        const priorLateCnt = Number(priorLateRows?.[0]?.cnt || 0);
                        if (!freeExemptsHalfday || priorLateCnt >= freeLateCount) {
                            newStatus = '0.5';
                            halfDayNote = ` • Trừ nửa công (trễ > ${maxLateHalfDay}p)`;
                        }
                    }

                    shiftEvaluation = `Đi trễ ${late_minutes} phút (Giờ vào quy định ${effectiveCheckInStartStr}${halfDayNote})`;
                    detailedMessage = `Đã ghi nhận Giờ vào: ${shortTime} (${shiftEvaluation})`;
                }

                const encodedInMethod = encodeCheckModes(resolvedCheckInMode, null);

                const insertSql = `
                    INSERT INTO attendance_logs (
                        employee_id, record_date, status, ot_hours, check_in_time,
                        check_in_lat, check_in_lng, check_in_method, check_in_image,
                        is_suspicious, suspicious_reason, device_fingerprint,
                        location_source, is_low_trust, late_minutes, early_leave_minutes, work_hours,
                        morning_worked_minutes, afternoon_worked_minutes, work_credit, duration_status,
                        location_name, field_note, work_location_type, shift_type
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, NULL, NULL, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        check_in_time = COALESCE(check_in_time, VALUES(check_in_time)),
                        check_in_lat = COALESCE(VALUES(check_in_lat), check_in_lat),
                        check_in_lng = COALESCE(VALUES(check_in_lng), check_in_lng),
                        check_in_method = VALUES(check_in_method),
                        check_in_image = COALESCE(VALUES(check_in_image), check_in_image),
                        is_suspicious = CASE WHEN VALUES(is_suspicious) = 1 THEN 1 ELSE is_suspicious END,
                        suspicious_reason = COALESCE(VALUES(suspicious_reason), suspicious_reason),
                        device_fingerprint = COALESCE(VALUES(device_fingerprint), device_fingerprint),
                        location_source = COALESCE(VALUES(location_source), location_source),
                        late_minutes = VALUES(late_minutes),
                        location_name = VALUES(location_name),
                        field_note = COALESCE(VALUES(field_note), field_note),
                        work_location_type = VALUES(work_location_type),
                        shift_type = VALUES(shift_type)
                `;
                await txQuery(insertSql, [
                    ma_nv,
                    targetRecordDate,
                    newStatus,
                    ot_hours,
                    timeStr,
                    numLat,
                    numLng,
                    encodedInMethod,
                    resolvedCheckInImageRef,
                    is_suspicious ? 1 : 0,
                    suspicious_reason || null,
                    deviceStr,
                    location_source,
                    is_low_trust,
                    late_minutes,
                    locationName,
                    resolvedFieldNote,
                    resolvedWorkLocationType,
                    activeShiftCode
                ]);
                if (resolvedCheckInImageRef) {
                    const mediaLifecycleService = require('./mediaLifecycleService');
                    await mediaLifecycleService.bindAssetToEntity({
                        mediaRef: resolvedCheckInImageRef,
                        entityType: 'attendance_log',
                        entityId: `${ma_nv}_${targetRecordDate}`,
                        employeeId: ma_nv,
                        txQuery
                    });
                }
            } else {
                // LẦN BẤM 2 TRỞ ĐI TRONG NGÀY -> CHECK-OUT (ĐỘNG CƠ MISA 8H: SÁNG 0,5 + CHIỀU 0,5)
                const logShiftCode = (existingLog.shift_type && SHIFT_DEFINITIONS[existingLog.shift_type]) ? existingLog.shift_type : activeShiftCode;
                const checkoutSchedule = resolveEmployeeWorkSchedule({
                    emp,
                    cs,
                    activeShiftCode: logShiftCode,
                    hasMorningHalfLeave,
                    hasRequestedShift: Boolean(requestedShift)
                });

                const policyTypeOut = String(cs.late_policy_type || 'PER_MINUTE').toUpperCase();
                const maxLateHalfDayOut = Math.max(1, Number(cs.max_late_minutes_for_half_day ?? 60) || 60);
                const wasDeductedHalfDayCheckIn = policyTypeOut === 'DEDUCT_WORKDAY'
                    && existingLog.status === '0.5'
                    && (Number(existingLog.late_minutes) || 0) > maxLateHalfDayOut;

                const approvedOtRows = await txQuery(
                    "SELECT expected_hours FROM ot_registrations WHERE employee_id = ? AND work_date = ? AND status = 'approved' LIMIT 1",
                    [ma_nv, targetRecordDate]
                );
                const hasApprovedOt = Boolean(approvedOtRows && approvedOtRows.length > 0);
                const approvedOtHours = hasApprovedOt ? (Number(approvedOtRows[0].expected_hours) || 0) : 0;

                const misaEval = evaluateMisaDailyAttendance({
                    checkInTime: existingLog.check_in_time,
                    checkOutTime: timeStr,
                    workStartStr: checkoutSchedule.workStartStr,
                    lunchStartStr: checkoutSchedule.lunchStartStr,
                    lunchEndStr: checkoutSchedule.lunchEndStr,
                    workEndStr: checkoutSchedule.workEndStr,
                    shiftCode: logShiftCode,
                    hasMorningPaidHalfLeave,
                    hasAfternoonPaidHalfLeave,
                    wasDeductedHalfDayLate: wasDeductedHalfDayCheckIn,
                    hasApprovedOt,
                    approvedOtHours,
                    existingOtHours: Number(existingLog.ot_hours) || 0
                });

                morning_worked_minutes = misaEval.morning_worked_minutes;
                afternoon_worked_minutes = misaEval.afternoon_worked_minutes;
                work_credit = misaEval.work_credit;
                work_hours = misaEval.work_hours;
                early_leave_minutes = misaEval.early_leave_minutes;
                ot_hours = misaEval.ot_hours;
                newStatus = misaEval.status;
                duration_status = misaEval.duration_status;
                session_summary = misaEval.session_summary;
                shiftEvaluation = misaEval.shift_evaluation;
                detailedMessage = `Đã ghi nhận Giờ ra: ${shortTime} (${shiftEvaluation})`;

                const prevModes = parseAttendanceModes(existingLog);
                resolvedCheckInMode = prevModes.check_in_mode || (existingLog.work_location_type === 'FIELD_WORK' ? 'FIELD_WORK' : 'OFFICE');
                resolvedCheckOutMode = isFieldWork ? 'FIELD_WORK' : 'OFFICE';
                const encodedOutMethod = encodeCheckModes(resolvedCheckInMode, resolvedCheckOutMode);
                resolvedWorkLocationType = (resolvedCheckInMode === 'FIELD_WORK' || resolvedCheckOutMode === 'FIELD_WORK')
                    ? 'FIELD_WORK'
                    : finalLocationType;
                resolvedFieldNote = cleanFieldNote
                    ? (existingLog.field_note && existingLog.field_note !== cleanFieldNote
                        ? `${existingLog.field_note} • ${cleanFieldNote}`
                        : cleanFieldNote)
                    : (existingLog.field_note || null);

                const updateOutSql = `
                    UPDATE attendance_logs
                    SET check_out_time = ?,
                        status = ?,
                        ot_hours = ?,
                        early_leave_minutes = ?,
                        work_hours = ?,
                        morning_worked_minutes = ?,
                        afternoon_worked_minutes = ?,
                        work_credit = ?,
                        duration_status = ?,
                        check_in_method = ?,
                        location_name = COALESCE(?, location_name),
                        field_note = COALESCE(?, field_note),
                        work_location_type = ?,
                        check_in_image = COALESCE(?, check_in_image),
                        is_suspicious = CASE WHEN ? = 1 THEN 1 ELSE is_suspicious END,
                        suspicious_reason = COALESCE(?, suspicious_reason),
                        device_fingerprint = COALESCE(?, device_fingerprint)
                    WHERE employee_id = ? AND record_date = ?
                `;
                await txQuery(updateOutSql, [
                    timeStr,
                    newStatus,
                    ot_hours,
                    early_leave_minutes,
                    work_hours,
                    morning_worked_minutes,
                    afternoon_worked_minutes,
                    work_credit,
                    duration_status,
                    encodedOutMethod,
                    locationName,
                    resolvedFieldNote,
                    resolvedWorkLocationType,
                    resolvedCheckInImageRef,
                    is_suspicious ? 1 : 0,
                    suspicious_reason || null,
                    deviceStr,
                    ma_nv,
                    targetRecordDate
                ]);
                if (resolvedCheckInImageRef) {
                    const mediaLifecycleService = require('./mediaLifecycleService');
                    await mediaLifecycleService.bindAssetToEntity({
                        mediaRef: resolvedCheckInImageRef,
                        entityType: 'attendance_log',
                        entityId: `${ma_nv}_${targetRecordDate}`,
                        employeeId: ma_nv,
                        txQuery
                    });
                }
            }

            // Ghi nhận atomic QR nonce & client nonce sau khi xử lý chấm công thành công (tránh tiêu thụ nonce nếu bị từ chối ở bước trên)
            if (qrNonceHash) {
                try {
                    await txQuery(
                        `INSERT INTO idempotency_keys (key_hash, actor_id, endpoint, response_status, response_body)
                         VALUES (?, ?, 'QR_NONCE_REPLAY_GUARD', 200, NULL)`,
                        [qrNonceHash, ma_nv.slice(0, 50)]
                    );
                } catch (nonceErr) {
                    if (nonceErr && (nonceErr.code === 'ER_DUP_ENTRY' || nonceErr.errno === 1062)) {
                        const err = new Error('Mã QR chấm công này đã được sử dụng trước đó (chống replay attack). Vui lòng quét mã QR mới!');
                        err.statusCode = 403;
                        err.code = 'QR_TOKEN_REPLAYED';
                        throw err;
                    }
                    throw nonceErr;
                }
            }
            if (clientNonceHash) {
                try {
                    await txQuery(
                        `INSERT INTO idempotency_keys (key_hash, actor_id, endpoint, response_status, response_body)
                         VALUES (?, ?, 'CLIENT_NONCE_GUARD', 200, NULL)`,
                        [clientNonceHash, ma_nv.slice(0, 50)]
                    );
                } catch (cErr) {
                    if (cErr && (cErr.code === 'ER_DUP_ENTRY' || cErr.errno === 1062)) {
                        const err = new Error('Yêu cầu chấm công bị trùng nonce. Vui lòng thử lại!');
                        err.statusCode = 409;
                        err.code = 'NONCE_REPLAYED';
                        throw err;
                    }
                    throw cErr;
                }
            }

            return {
                isCheckOut,
                checkType,
                targetRecordDate,
                existingLog,
                late_minutes,
                early_leave_minutes,
                work_hours,
                ot_hours,
                morning_worked_minutes,
                afternoon_worked_minutes,
                work_credit,
                duration_status,
                session_summary,
                newStatus,
                shiftEvaluation,
                detailedMessage,
                resolvedCheckInMode,
                resolvedCheckOutMode,
                resolvedWorkLocationType,
                resolvedFieldNote
            };
        });

        const {
            isCheckOut,
            checkType,
            targetRecordDate,
            existingLog,
            late_minutes,
            early_leave_minutes,
            work_hours,
            ot_hours,
            morning_worked_minutes,
            afternoon_worked_minutes,
            work_credit,
            duration_status,
            session_summary,
            newStatus,
            shiftEvaluation,
            detailedMessage,
            resolvedCheckInMode,
            resolvedCheckOutMode,
            resolvedWorkLocationType,
            resolvedFieldNote
        } = txOutcome;

        const isProbationWorker = Boolean(
            emp.ngay_chinh_thuc && new Date(targetRecordDate) < new Date(emp.ngay_chinh_thuc)
        );
        const probationRatio = isProbationWorker
            ? ((Number(cs.probation_salary_percent) || 85) / 100)
            : 1;
        const [checkOutY, checkOutM] = String(targetRecordDate || '').split('-').map(Number);
        const { getMonthlyStandardWorkdays } = require('../utils/timeHelper');
        const daily_wage = isCheckOut
            ? calculateDailyEarnedAmount({
                  luong_cb: emp.luong_cb,
                  cong_chuan: getMonthlyStandardWorkdays(checkOutM, checkOutY),
                  probationRatio,
                  workCredit: work_credit
              })
            : null;

        await logAuditEvent({
            actor_id: ma_nv,
            actor_role: current_user.role,
            action: isCheckOut ? 'CHECK_OUT_1TOUCH' : 'CHECK_IN_1TOUCH',
            resource: 'attendance',
            details: {
                check_type: checkType,
                location_name: locationName,
                work_location_type: finalLocationType,
                field_note: cleanFieldNote || null,
                date: targetRecordDate,
                time: timeStr,
                late_minutes,
                early_leave_minutes,
                work_hours,
                work_credit,
                duration_status,
                ot_hours,
                shift_evaluation: shiftEvaluation,
                shift_type: activeShiftCode,
                shift_label: activeShiftDef.label,
                distanceMeters,
                is_suspicious,
                suspicious_reason,
                device_fingerprint: deviceStr,
                location_source
            },
            ip_address
        });

        return {
            success: true,
            message: detailedMessage,
            server_time: timeStr,
            data: {
                employee_id: ma_nv,
                record_date: targetRecordDate,
                work_date: targetRecordDate,
                check_type: checkType,
                location_name: locationName,
                work_location_type: resolvedWorkLocationType,
                work_mode: resolvedWorkLocationType,
                check_in_mode: resolvedCheckInMode,
                check_out_mode: resolvedCheckOutMode,
                is_field_work: resolvedWorkLocationType === 'FIELD_WORK',
                field_note: resolvedFieldNote,
                check_in_time: isCheckOut ? existingLog.check_in_time : timeStr,
                check_out_time: isCheckOut ? timeStr : null,
                server_time: timeStr,
                late_minutes,
                early_leave_minutes,
                work_hours,
                morning_worked_minutes,
                afternoon_worked_minutes,
                work_credit,
                duration_status,
                session_summary,
                daily_wage,
                ot_hours,
                status: newStatus,
                shift_evaluation: shiftEvaluation,
                shift_type: activeShiftCode,
                shift_label: activeShiftDef.label,
                distanceMeters,
                is_suspicious,
                suspicious_reason,
                location_source,
                is_low_trust
            }
        };
    }

    async getSuspiciousLogs(limit = 100) {
        const sql = `
            SELECT a.id, a.employee_id, e.ho_ten, e.chuc_danh, 
                   DATE_FORMAT(a.record_date, '%d/%m/%Y') as record_date, 
                   a.check_in_time, a.check_out_time, a.check_in_lat, a.check_in_lng, 
                   a.check_in_method, a.is_suspicious, a.suspicious_reason, a.device_fingerprint,
                   a.location_source, a.is_low_trust
            FROM attendance_logs a
            LEFT JOIN employees e ON a.employee_id = e.ma_nv
            WHERE a.is_suspicious = 1
            ORDER BY a.record_date DESC, a.check_in_time DESC
            LIMIT ?
        `;
        const rows = await query(sql, [parseInt(limit, 10) || 100]);
        return rows || [];
    }

    async getAttendanceImageById(logId) {
        if (!logId) return null;
        const rows = await query('SELECT check_in_image FROM attendance_logs WHERE id = ? LIMIT 1', [logId]);
        return rows && rows.length > 0 ? rows[0].check_in_image : null;
    }

    async getAttendanceStats(dateStr = null) {
        const { getVietnamDateString } = require('../utils/timeHelper');
        const targetDate = dateStr || getVietnamDateString(new Date());
        const [totalEmpRow] = await query('SELECT COUNT(*) as total FROM employees WHERE status != "inactive" AND (role IS NULL OR role != "admin")');
        const totalEmployees = totalEmpRow ? Number(totalEmpRow.total) : 0;

        const logs = await query(
            "SELECT a.status, a.check_in_time, a.late_minutes, a.work_location_type, COALESCE(a.shift_type, 'FULL_DAY') as shift_type FROM attendance_logs a LEFT JOIN employees e ON a.employee_id = e.ma_nv WHERE a.record_date = ? AND (e.role IS NULL OR e.role != 'admin')",
            [targetDate]
        );

        let present = 0;
        let late = 0;
        let leave = 0;
        let fieldWork = 0;

        (logs || []).forEach(l => {
            if (l.status === 'P') {
                leave++;
            } else if (l.status !== '0') {
                present++;
                if ((Number(l.late_minutes) || 0) > 0 || (l.shift_type === 'FULL_DAY' && l.late_minutes == null && l.check_in_time && l.check_in_time > '08:15:00')) {
                    late++;
                }
                if (l.work_location_type === 'FIELD_WORK') {
                    fieldWork++;
                }
            }
        });

        const attendanceRate = totalEmployees > 0 ? Number(((present / totalEmployees) * 100).toFixed(1)) : 0;

        return {
            date: targetDate,
            totalEmployees,
            present,
            late,
            fieldWork,
            leave,
            absent: Math.max(0, totalEmployees - present - leave),
            attendanceRate
        };
    }

    /**
     * V65 Next-Day Unpaid-Leave Settlement ("Sang ngày mới mới chốt ngày cũ" theo GMT+7):
     * - Với ngày hôm nay (targetDateStr >= todayVN): KHÔNG BAO GIỜ tự động đánh dấu Nghỉ không lương.
     * - Chỉ khi bước sang ngày mới (targetDateStr < todayVN):
     *   Nếu ngày cũ đó là ngày làm việc bình thường (không phải Chủ nhật, không phải Ngày lễ,
     *   không có đơn nghỉ có lương đã duyệt, không có dữ liệu chấm công hợp lệ và chưa bị Admin chỉnh công tay)
     *   -> Tự động tính / chốt là Nghỉ không lương ('KL', 0 công).
     */
    async settlePastUnpaidLeaveDays({
        targetDateStr = null,
        todayOverride = null,
        ma_nv = null,
        persist = false,
        forceManualSettle = false
    } = {}) {
        const { getVietnamDateString, isSundayIsoDate } = require('../utils/timeHelper');
        const todayVN = todayOverride || getVietnamDateString(new Date());

        let targetIso = targetDateStr ? String(targetDateStr).trim().slice(0, 10) : null;
        if (!targetIso) {
            const todayEpoch = new Date(`${todayVN}T00:00:00+07:00`).getTime();
            targetIso = getVietnamDateString(new Date(todayEpoch - 24 * 3600 * 1000));
        }

        // Guardrail tuyệt đối: Không bao giờ chốt Nghỉ không lương cho ngày hiện tại hoặc tương lai
        if (targetIso >= todayVN) {
            return {
                settled_count: 0,
                auto_accountant_count: 0,
                settled_records: [],
                skipped_reason: 'CURRENT_OR_FUTURE_DAY_NOT_ENDED',
                today_vn: todayVN,
                target_date: targetIso
            };
        }

        if (isSundayIsoDate(targetIso)) {
            return {
                settled_count: 0,
                auto_accountant_count: 0,
                settled_records: [],
                skipped_reason: 'SUNDAY_NON_WORKING_DAY',
                today_vn: todayVN,
                target_date: targetIso
            };
        }

        const holidays = await query(
            "SELECT id, holiday_name, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date FROM public_holidays WHERE start_date <= ? AND end_date >= ? LIMIT 1",
            [targetIso, targetIso]
        ).catch(() => []);
        if (holidays && holidays.length > 0) {
            return {
                settled_count: 0,
                auto_accountant_count: 0,
                settled_records: [],
                skipped_reason: 'PUBLIC_HOLIDAY',
                holiday_name: holidays[0].holiday_name,
                today_vn: todayVN,
                target_date: targetIso
            };
        }

        const perms = forceManualSettle ? { accountant_manual_checkin: true } : await getAccountantPermissions().catch(() => ({}));
        const accountantManualEnabled = Boolean(perms?.accountant_manual_checkin);

        const empParams = [];
        let empSql = "SELECT ma_nv, ho_ten, role, status, is_locked FROM employees WHERE status != 'inactive' AND (is_locked = 0 OR is_locked IS NULL) AND (role IS NULL OR role != 'admin')";
        if (ma_nv) {
            empSql += ' AND ma_nv = ?';
            empParams.push(ma_nv);
        }
        const [activeEmps, existingLogs, approvedLeaves] = await Promise.all([
            query(empSql, empParams),
            query(
                `SELECT employee_id, status, check_in_time, check_out_time, work_credit, duration_status, proxy_by
                 FROM attendance_logs
                 WHERE record_date = ?${ma_nv ? ' AND employee_id = ?' : ''}`,
                ma_nv ? [targetIso, ma_nv] : [targetIso]
            ),
            query(
                `SELECT employee_id, request_type, reason
                 FROM requests
                 WHERE request_date = ? AND status = 'approved'${ma_nv ? ' AND employee_id = ?' : ''}`,
                ma_nv ? [targetIso, ma_nv] : [targetIso]
            ).catch(() => [])
        ]);

        const logByEmp = new Map();
        for (const l of existingLogs || []) {
            logByEmp.set(l.employee_id, l);
        }
        const paidLeaveEmps = new Set();
        for (const r of approvedLeaves || []) {
            const rType = String(r.request_type || '').toLowerCase();
            const txt = `${rType} ${r.reason || ''}`.toLowerCase();
            const isUnpaid = rType === 'kp' || rType === 'kl' || txt.includes('không lương') || txt.includes('unpaid');
            if (!isUnpaid) {
                paidLeaveEmps.add(r.employee_id);
            }
        }

        const settledRecords = [];
        let autoAccountantCount = 0;
        for (const emp of activeEmps || []) {
            const log = logByEmp.get(emp.ma_nv);
            if (paidLeaveEmps.has(emp.ma_nv)) continue;

            if (log) {
                const durStatus = String(log.duration_status || '').trim().toUpperCase();
                const rawSt = String(log.status || '').trim().toUpperCase();
                const isAdminAdjusted = durStatus.startsWith('ADMIN_ADJUSTED') || Boolean(log.proxy_by);
                // Tôn trọng 100% kết quả Admin đã chỉnh công tay
                if (isAdminAdjusted) continue;
                // Nếu đã có dữ liệu chấm công hợp lệ
                if (log.check_in_time || ['1', '0.5', '1/OT', 'OT', 'P', 'L'].includes(rawSt)) continue;
            }

            // V66: Khi Kế toán đang ở chế độ tự động tính công (công tắc TẮT), ngày công T2-T7 tạo 1.0 công thực thay vì chốt KL
            if (emp.role === 'accountant' && !accountantManualEnabled) {
                if (persist && !log) {
                    const syncRes = await this.syncAccountantAutoAttendance({
                        ma_nv: emp.ma_nv,
                        startDateStr: targetIso,
                        endDateStr: targetIso,
                        todayOverride: todayVN,
                        forceRun: true
                    }).catch(() => null);
                    autoAccountantCount += Number(syncRes?.inserted_count) || 0;
                }
                continue;
            }

            const settledItem = {
                employee_id: emp.ma_nv,
                record_date: targetIso,
                status: 'KL',
                work_credit: 0,
                duration_status: 'AUTO_SETTLED_NEXT_DAY',
                attendance_note: 'Nghỉ không lương (0 công)'
            };
            settledRecords.push(settledItem);

            if (persist) {
                await query(
                    `INSERT INTO attendance_logs (
                        employee_id, record_date, status, ot_hours, work_credit, duration_status
                     ) VALUES (?, ?, 'KL', 0, 0.00, 'AUTO_SETTLED_NEXT_DAY')
                     ON DUPLICATE KEY UPDATE
                        status = CASE
                            WHEN duration_status LIKE 'ADMIN_ADJUSTED%' OR check_in_time IS NOT NULL THEN status
                            ELSE 'KL'
                        END,
                        work_credit = CASE
                            WHEN duration_status LIKE 'ADMIN_ADJUSTED%' OR check_in_time IS NOT NULL THEN work_credit
                            ELSE 0.00
                        END,
                        duration_status = CASE
                            WHEN duration_status LIKE 'ADMIN_ADJUSTED%' OR check_in_time IS NOT NULL THEN duration_status
                            ELSE 'AUTO_SETTLED_NEXT_DAY'
                        END`,
                    [emp.ma_nv, targetIso]
                ).catch(() => {});
            }
        }

        return {
            settled_count: settledRecords.length,
            auto_accountant_count: autoAccountantCount,
            settled_records: settledRecords,
            skipped_reason: null,
            today_vn: todayVN,
            target_date: targetIso
        };
    }

    /**
     * V66: Tự động tạo và lưu 1 công thực (Thứ 2 – Thứ 7, trừ Chủ nhật & Ngày lễ)
     * cho tất cả tài khoản Kế toán đang hoạt động khi công tắc `accountant_manual_checkin` ĐANG TẮT.
     * Guardrail: Tuyệt đối KHÔNG ghi đè các bản ghi đã tồn tại (chấm công tay, Admin chỉnh công, đơn phép, KL đã chốt).
     */
    async syncAccountantAutoAttendance({
        ma_nv = null,
        startDateStr = null,
        endDateStr = null,
        todayOverride = null,
        excludeDates = [],
        forceRun = false
    } = {}) {
        const todayVN = todayOverride || getVietnamDateString(new Date());
        if (!forceRun) {
            const perms = await getAccountantPermissions().catch(() => ({}));
            if (perms?.accountant_manual_checkin) {
                return { inserted_count: 0, skipped_reason: 'MANUAL_CHECKIN_ENABLED', today_vn: todayVN };
            }
        }

        const startIso = (startDateStr ? String(startDateStr).slice(0, 10) : todayVN);
        let endIso = (endDateStr ? String(endDateStr).slice(0, 10) : todayVN);
        if (endIso > todayVN) endIso = todayVN;
        if (startIso > endIso) {
            return { inserted_count: 0, skipped_reason: 'EMPTY_DATE_RANGE', today_vn: todayVN };
        }

        const empParams = [];
        let empSql = "SELECT ma_nv FROM employees WHERE role = 'accountant' AND status != 'inactive' AND (is_locked = 0 OR is_locked IS NULL)";
        if (ma_nv) {
            empSql += ' AND ma_nv = ?';
            empParams.push(ma_nv);
        }
        const accountants = await query(empSql, empParams).catch(() => []);
        if (!accountants || accountants.length === 0) {
            return { inserted_count: 0, skipped_reason: 'NO_ACTIVE_ACCOUNTANT', today_vn: todayVN };
        }

        const excludedSet = new Set((excludeDates || []).map((d) => String(d).slice(0, 10)));
        const holidays = await query(
            "SELECT id, holiday_name, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date FROM public_holidays WHERE start_date <= ? AND end_date >= ?",
            [endIso, startIso]
        ).catch(() => []);

        const workingDates = [];
        let cursorMs = new Date(`${startIso}T00:00:00+07:00`).getTime();
        const endMs = new Date(`${endIso}T00:00:00+07:00`).getTime();
        while (cursorMs <= endMs) {
            const iso = getVietnamDateString(new Date(cursorMs));
            if (!excludedSet.has(iso) && !isSundayIsoDate(iso)) {
                const hol = findHolidayForDate(holidays || [], iso);
                if (!hol) {
                    workingDates.push(iso);
                }
            }
            cursorMs += 24 * 3600 * 1000;
        }

        if (workingDates.length === 0) {
            return { inserted_count: 0, skipped_reason: 'NO_WORKING_DATES', today_vn: todayVN };
        }

        const empIds = accountants.map((a) => a.ma_nv);
        const placeholders = empIds.map(() => '?').join(',');
        const [existingRows, approvedReqRows] = await Promise.all([
            query(
                `SELECT employee_id, DATE_FORMAT(record_date, '%Y-%m-%d') as record_date
                 FROM attendance_logs
                 WHERE employee_id IN (${placeholders}) AND record_date >= ? AND record_date <= ?`,
                [...empIds, startIso, endIso]
            ).catch(() => []),
            query(
                `SELECT employee_id, DATE_FORMAT(request_date, '%Y-%m-%d') as request_date
                 FROM requests
                 WHERE employee_id IN (${placeholders}) AND status = 'approved' AND request_date >= ? AND request_date <= ?`,
                [...empIds, startIso, endIso]
            ).catch(() => [])
        ]);

        const existingKey = new Set((existingRows || []).map((r) => `${r.employee_id}::${r.record_date}`));
        const reqKey = new Set((approvedReqRows || []).map((r) => `${r.employee_id}::${r.request_date}`));

        let insertedCount = 0;
        for (const emp of accountants) {
            for (const iso of workingDates) {
                const key = `${emp.ma_nv}::${iso}`;
                if (existingKey.has(key) || reqKey.has(key)) continue;
                const result = await query(
                    `INSERT IGNORE INTO attendance_logs (
                        employee_id, record_date, status, ot_hours,
                        late_minutes, early_leave_minutes, work_hours,
                        work_credit, duration_status, location_name
                     ) VALUES (?, ?, '1', 0, 0, 0, 8.00, 1.00, 'AUTO_ACCOUNTANT', 'Tự động tính công Kế toán')`,
                    [emp.ma_nv, iso]
                ).catch(() => ({ affectedRows: 0 }));
                if (Number(result?.affectedRows) > 0) {
                    insertedCount += 1;
                }
            }
        }

        return {
            inserted_count: insertedCount,
            accountant_count: accountants.length,
            date_range: { start: startIso, end: endIso },
            today_vn: todayVN
        };
    }

    /**
     * V66: Đồng bộ bù toàn bộ ngày làm việc (T2-T7) trong tháng nếu chế độ Kế toán tự động tính công ĐANG TẮT.
     */
    async ensureAccountantAutoAttendanceForPeriod(month, year, { ma_nv = null, todayOverride = null } = {}) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (!Number.isFinite(m) || !Number.isFinite(y) || m < 1 || m > 12) {
            return { inserted_count: 0, skipped_reason: 'INVALID_PERIOD' };
        }
        const todayVN = todayOverride || getVietnamDateString(new Date());
        const padM = String(m).padStart(2, '0');
        const startIso = `${y}-${padM}-01`;
        if (startIso > todayVN) {
            return { inserted_count: 0, skipped_reason: 'FUTURE_PERIOD', today_vn: todayVN };
        }
        const daysInMonth = getDaysInMonth(m, y);
        const monthEndIso = `${y}-${padM}-${String(daysInMonth).padStart(2, '0')}`;
        const endIso = monthEndIso < todayVN ? monthEndIso : todayVN;

        return this.syncAccountantAutoAttendance({
            ma_nv,
            startDateStr: startIso,
            endDateStr: endIso,
            todayOverride: todayVN
        });
    }

    /**
     * V66: Hook chuyển đổi tức thì khi Admin bật/tắt `accountant_manual_checkin`:
     * - OFF -> ON: Đồng bộ lưu mọi ngày T2-T7 trước hôm nay (< todayVN) trong tháng hiện tại (giữ 100% công tự động quá khứ),
     *   và xóa dòng AUTO_ACCOUNTANT chưa chấm công của riêng hôm nay (todayVN) để Kế toán tự chấm công được ngay trong ngày.
     * - ON -> OFF: Chốt các ngày làm việc còn trống trước hôm nay (< todayVN) trong tháng hiện tại về KL để không ghi đè quá khứ lúc đang bật thủ công,
     *   giữ nguyên toàn bộ công thủ công/tăng ca/nghỉ phép đã lưu, và tạo tự động 1 công cho hôm nay (todayVN).
     */
    async handleAccountantManualCheckinTransition({ enabled, todayOverride = null } = {}) {
        const todayVN = todayOverride || getVietnamDateString(new Date());
        const [todayY, todayM] = todayVN.split('-').map(Number);
        const padM = String(todayM).padStart(2, '0');
        const monthStartIso = `${todayY}-${padM}-01`;
        const todayEpoch = new Date(`${todayVN}T00:00:00+07:00`).getTime();
        const yesterdayIso = getVietnamDateString(new Date(todayEpoch - 24 * 3600 * 1000));

        if (enabled) {
            if (yesterdayIso >= monthStartIso) {
                await this.syncAccountantAutoAttendance({
                    startDateStr: monthStartIso,
                    endDateStr: yesterdayIso,
                    todayOverride: todayVN,
                    forceRun: true
                }).catch(() => null);
            }
            const cleared = await query(
                `DELETE al FROM attendance_logs al
                 INNER JOIN employees e ON e.ma_nv = al.employee_id
                 WHERE e.role = 'accountant'
                   AND al.record_date = ?
                   AND al.duration_status = 'AUTO_ACCOUNTANT'
                   AND al.check_in_time IS NULL
                   AND (al.proxy_by IS NULL OR al.proxy_by = '')`,
                [todayVN]
            ).catch(() => ({ affectedRows: 0 }));

            return {
                mode: 'MANUAL_CHECKIN_ON',
                today_vn: todayVN,
                cleared_today_auto_count: Number(cleared?.affectedRows) || 0
            };
        }

        const accountants = await query(
            "SELECT ma_nv FROM employees WHERE role = 'accountant' AND status != 'inactive' AND (is_locked = 0 OR is_locked IS NULL)"
        ).catch(() => []);
        if (yesterdayIso >= monthStartIso && accountants.length > 0) {
            let cursorMs = new Date(`${monthStartIso}T00:00:00+07:00`).getTime();
            const yesterdayMs = new Date(`${yesterdayIso}T00:00:00+07:00`).getTime();
            while (cursorMs <= yesterdayMs) {
                const iso = getVietnamDateString(new Date(cursorMs));
                for (const acc of accountants) {
                    await this.settlePastUnpaidLeaveDays({
                        targetDateStr: iso,
                        todayOverride: todayVN,
                        ma_nv: acc.ma_nv,
                        persist: true,
                        forceManualSettle: true
                    }).catch(() => null);
                }
                cursorMs += 24 * 3600 * 1000;
            }
        }

        const syncToday = await this.syncAccountantAutoAttendance({
            startDateStr: todayVN,
            endDateStr: todayVN,
            todayOverride: todayVN,
            forceRun: true
        }).catch(() => ({ inserted_count: 0 }));

        return {
            mode: 'AUTO_ACCOUNTANT_OFF',
            today_vn: todayVN,
            inserted_today_count: Number(syncToday?.inserted_count) || 0
        };
    }

    /**
     * V66 Scheduler: Tự động chạy hàng ngày lúc 00:05 GMT+7 để chốt ngày cũ (V65)
     * và ghi nhận 1 công tự động cho Kế toán khi công tắc đang TẮT.
     */
    startDailyAttendanceSettlementScheduler() {
        if (process.env.NODE_ENV === 'test') return null;
        if (this._dailySchedulerTimer) return this._dailySchedulerTimer;

        let lastRunDateVN = null;
        const runDailyTick = async () => {
            try {
                const now = new Date();
                const { getVietnamTimeString } = require('../utils/timeHelper');
                const todayVN = getVietnamDateString(now);
                const timeVN = getVietnamTimeString(now);
                if (lastRunDateVN === todayVN) return;
                if (timeVN < '00:05:00') return;
                lastRunDateVN = todayVN;

                await this.settlePastUnpaidLeaveDays({ todayOverride: todayVN, persist: true }).catch(() => null);
                await this.syncAccountantAutoAttendance({
                    startDateStr: todayVN,
                    endDateStr: todayVN,
                    todayOverride: todayVN
                }).catch(() => null);
            } catch (e) {
                console.warn('[V66-Scheduler] Daily attendance tick warning:', e?.message || e);
            }
        };

        this._dailySchedulerTimer = setInterval(runDailyTick, 60 * 1000);
        if (typeof this._dailySchedulerTimer.unref === 'function') {
            this._dailySchedulerTimer.unref();
        }
        return this._dailySchedulerTimer;
    }
}

module.exports = new AttendanceService();

