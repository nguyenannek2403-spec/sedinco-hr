const { query, withTransaction } = require('../config/db');
const { logAuditEvent, getAccountantPermissions } = require('../middlewares/authMiddleware');
const { calculateDistanceMeters } = require('../utils/geoHelper');
const { parseAllowedLocations, normalizeIp } = require('./companyService');

const SHIFT_DEFINITIONS = {
    FULL_DAY: { code: 'FULL_DAY', label: 'Ca hành chính', start: '08:00', end: '17:30' },
    MORNING_SHIFT: { code: 'MORNING_SHIFT', label: 'Ca sáng', start: '07:30', end: '12:00' },
    AFTERNOON_SHIFT: { code: 'AFTERNOON_SHIFT', label: 'Ca chiều', start: '13:00', end: '17:30' },
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
    const baseStart = activeShiftCode === 'FULL_DAY' ? normalizeTimeHHMM(cs.work_start, def.start) : def.start;
    const baseEnd = activeShiftCode === 'FULL_DAY' ? normalizeTimeHHMM(cs.work_end, def.end) : def.end;
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
        lunchStartStr: normalizeTimeHHMM(cs.lunch_start, '12:00'),
        lunchEndStr: normalizeTimeHHMM(cs.lunch_end, '13:30'),
        hasCustomSchedule: Boolean((!hasMorningHalfLeave && !hasRequestedShift && hasCustomStart) || (!hasRequestedShift && hasCustomEnd))
    };
}

class AttendanceService {
    async getAttendanceMatrix(month, year, pagination = {}) {
        const limit = Math.min(200, Math.max(1, parseInt(pagination.limit, 10) || 200));
        const page = Math.max(1, parseInt(pagination.page, 10) || 1);
        const offset = (page - 1) * limit;

        const emps = await query('SELECT ma_nv, ho_ten FROM employees ORDER BY ma_nv ASC LIMIT ? OFFSET ?', [limit, offset]);
        if (!emps || emps.length === 0) return [];

        const logs = await query(
            'SELECT employee_id, DAY(record_date) as day, status, ot_hours FROM attendance_logs WHERE MONTH(record_date)=? AND YEAR(record_date)=?',
            [month, year]
        );
        const safeLogs = logs || [];
        const daysInMonth = new Date(year, month, 0).getDate();

        return emps.map(emp => {
            const days = Array(daysInMonth).fill('');
            safeLogs
                .filter(l => l.employee_id === emp.ma_nv)
                .forEach(log => {
                    if (log.day > 0 && log.day <= daysInMonth) {
                        days[log.day - 1] = log.status;
                    }
                });
            return {
                ma_nv: emp.ma_nv,
                ho_ten: emp.ho_ten,
                days: days
            };
        });
    }

    async getMyAttendance(ma_nv, month, year) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();

        const logs = await query(
            `SELECT record_date, status, ot_hours, check_in_time, check_out_time, late_minutes, early_leave_minutes, work_hours,
                    is_suspicious, suspicious_reason, location_name, field_note, work_location_type,
                    COALESCE(shift_type, 'FULL_DAY') as shift_type
             FROM attendance_logs
             WHERE employee_id = ? AND MONTH(record_date) = ? AND YEAR(record_date) = ?
             ORDER BY record_date ASC`,
            [ma_nv, m, y]
        );

        const empShiftRows = await query(
            "SELECT COALESCE(shift_type, 'FULL_DAY') as shift_type, custom_start_time, custom_end_time FROM employees WHERE ma_nv = ? LIMIT 1",
            [ma_nv]
        ).catch(() => []);
        const empRow = (empShiftRows && empShiftRows[0]) ? empShiftRows[0] : {};
        const empShiftCode = (empRow.shift_type && SHIFT_DEFINITIONS[empRow.shift_type])
            ? empRow.shift_type
            : 'FULL_DAY';
        const shiftInfo = SHIFT_DEFINITIONS[empShiftCode];

        const csRows = await query(
            'SELECT work_start, work_end, lunch_start, lunch_end, standard_work_days, grace_period_minutes, late_policy_type, free_late_occurrences FROM company_settings LIMIT 1'
        ).catch(() => []);
        const cs = (csRows && csRows[0]) ? csRows[0] : {};
        const schedule = resolveEmployeeWorkSchedule({ emp: empRow, cs, activeShiftCode: empShiftCode });

        // Phát hiện ngày làm việc gần nhất trước hôm nay bị Quên Bấm Giờ Ra (check_in_time IS NOT NULL AND check_out_time IS NULL)
        const { getVietnamDateString } = require('../utils/timeHelper');
        const todayStr = getVietnamDateString(new Date());
        const forgottenCheckoutRows = await query(
            `SELECT DATE_FORMAT(record_date, '%Y-%m-%d') as iso_date,
                    DATE_FORMAT(record_date, '%d/%m') as short_date,
                    check_in_time
             FROM attendance_logs
             WHERE employee_id = ?
               AND record_date < ?
               AND check_in_time IS NOT NULL
               AND (check_out_time IS NULL OR check_out_time = '')
             ORDER BY record_date DESC
             LIMIT 1`,
            [ma_nv, todayStr]
        );

        const forgottenCheckout = forgottenCheckoutRows && forgottenCheckoutRows.length > 0
            ? forgottenCheckoutRows[0]
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
            if (st === '1' || st === '1/OT') total_work_days += 1;
            else if (st === '0.5') total_work_days += 0.5;
            else if (st === 'P') {
                total_work_days += 1;
                total_leave_days += 1;
            } else if (st === 'L') {
                total_work_days += 1;
            }
            total_ot_hours += Number(l.ot_hours) || 0;

            const lateMins = Number(l.late_minutes) || 0;
            if (lateMins > 0) {
                late_count += 1;
                total_late_minutes += lateMins;
            } else if (l.check_in_time || ['1', '1/OT', '0.5', 'OT'].includes(st)) {
                on_time_count += 1;
            }
        });

        const standardDays = Number(cs.standard_work_days) || 26;
        const freeLateOccurrences = cs.free_late_occurrences !== undefined && cs.free_late_occurrences !== null
            ? Number(cs.free_late_occurrences)
            : 3;

        return {
            logs: logs || [],
            days: logs || [],
            forgotten_checkout: forgottenCheckout,
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
            const error = new Error(`Kỳ công Tháng ${m}/${y} có ${low_trust_count} bản ghi có độ tin cậy thấp (is_low_trust)! Vui lòng đối soát và xác nhận trước khi chốt.`);
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

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || locked_by,
                actor_role: current_user.role || 'admin',
                action: 'LOCK_ATTENDANCE_PERIOD',
                resource: 'attendance',
                details: { month: m, year: y, reason, confirm_low_trust }
            });
        }

        return { success: true, message: `Đã chốt sổ kỳ công Tháng ${m}/${y} thành công!` };
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

    async updateAttendanceDaily({ ma_nv, dateStr, status, hours, isDelete, check_in_time, check_out_time, current_user = null }) {
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
                const error = new Error('Phân tách nhiệm vụ (SoD): Không thể tự chỉnh sửa công của chính mình!');
                error.statusCode = 403;
                throw error;
            }

            if (userRole === 'worker') {
                const error = new Error('Bảo mật: Công nhân không thể chỉnh sửa chấm công của người khác!');
                error.statusCode = 403;
                throw error;
            }

            if (userRole === 'accountant') {
                const permissions = await getAccountantPermissions();
                if (!permissions['attendance_edit']) {
                    const error = new Error('Bảo mật: Kế toán chưa được cấp quyền chỉnh sửa chấm công nhân viên (attendance_edit)!');
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
                    throw error;
                }
            }
        }

        // 3. Kiểm tra xem nhân viên có đang bị TẠM KHÓA tài khoản không
        if (ma_nv) {
            const empCheck = await query('SELECT is_locked, status FROM employees WHERE ma_nv = ?', [ma_nv]);
            if (empCheck && empCheck.length > 0) {
                const emp = empCheck[0];
                if (emp.status === 'inactive' || emp.is_locked === 1 || emp.is_locked === true) {
                    const error = new Error(`Tài khoản nhân viên ${ma_nv} đang bị TẠM KHÓA. Không thể thực hiện chấm công!`);
                    error.statusCode = 403;
                    throw error;
                }
            }
        }

        if (isDelete) {
            await query('DELETE FROM attendance_logs WHERE employee_id=? AND record_date=?', [ma_nv, dateStr]);
            return { success: true };
        }

        const sql = `
            INSERT INTO attendance_logs (employee_id, record_date, status, ot_hours, check_in_time, check_out_time) 
            VALUES (?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
                status = VALUES(status), 
                ot_hours = VALUES(ot_hours),
                check_in_time = COALESCE(VALUES(check_in_time), check_in_time),
                check_out_time = COALESCE(VALUES(check_out_time), check_out_time)
        `;
        await query(sql, [ma_nv, dateStr, status, hours, check_in_time || null, check_out_time || null]);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'unknown',
                actor_role: current_user.role || 'unknown',
                action: 'UPDATE_ATTENDANCE',
                resource: 'attendance',
                details: { target_ma_nv: ma_nv, dateStr, status, hours }
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

    async generateDynamicQr() {
        const error = new Error('Tính năng Kiosk QR đã được loại bỏ ở phiên bản V6. Vui lòng dùng Chấm công 1 chạm!');
        error.statusCode = 410;
        throw error;
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

    async checkInMultiFactor({ lat, lng, zalo_location_token, zalo_access_token = '', image_snapshot, device_info, is_fake_gps = false, is_fake_device = false, gps_accuracy = null, work_location_type = 'OFFICE', field_note = '', shift_type = null, current_user = null, ip_address = '', currentTime = null, faultInjectionHook = null }) {
        if (!current_user || !current_user.ma_nv) {
            const error = new Error('Yêu cầu đăng nhập tài khoản nhân viên để chấm công!');
            error.statusCode = 401;
            throw error;
        }

        const ma_nv = current_user.ma_nv;
        const { getVietnamDateString, getVietnamTimeString } = require('../utils/timeHelper');
        const today = currentTime instanceof Date ? currentTime : new Date();
        const dateStr = getVietnamDateString(today);
        const timeStr = getVietnamTimeString(today);

        // 1. Kiểm tra tài khoản có bị tạm khóa không & lấy thông tin ràng buộc thiết bị + ca làm việc riêng
        const empCheck = await query("SELECT is_locked, status, bound_device_id, device_binding_mode, COALESCE(shift_type, 'FULL_DAY') as shift_type, custom_start_time, custom_end_time FROM employees WHERE ma_nv = ?", [ma_nv]);
        if (!empCheck || empCheck.length === 0) {
            const error = new Error('Mã nhân viên không tồn tại trong hệ thống!');
            error.statusCode = 404;
            throw error;
        }
        const emp = empCheck[0];
        if (emp.status === 'inactive' || emp.is_locked === 1 || emp.is_locked === true) {
            const error = new Error(`Tài khoản nhân viên ${ma_nv} đang bị TẠM KHÓA. Không thể thực hiện chấm công!`);
            error.statusCode = 403;
            throw error;
        }

        // 2. Kiểm tra ảnh chụp nếu có
        if (image_snapshot) {
            this.validateImageSnapshot(image_snapshot);
        }

        // Chuẩn hóa chuỗi định danh thiết bị
        const deviceStr = device_info
            ? (typeof device_info === 'object'
                ? String(device_info.deviceId || [device_info.platform, device_info.userAgent].filter(Boolean).join('|')).slice(0, 140)
                : String(device_info).slice(0, 140))
            : null;

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

        // 3. Xác thực Vị trí & Fallback an toàn sang GPS thô hoặc Wi-Fi công ty (không bao giờ chặn 400/403 vì token Zalo)
        let location_source = 'raw';
        let is_low_trust = 1;
        let finalLat = lat;
        let finalLng = lng;

        if (zalo_location_token) {
            const { verifyZaloLocationToken } = require('../utils/zaloAdapter');
            let locResult = null;
            try {
                locResult = await verifyZaloLocationToken({
                    locationToken: zalo_location_token,
                    userAccessToken: zalo_access_token || ''
                });
            } catch (zaloErr) {
                console.warn('[AttendanceService] Giải mã location_token Zalo thất bại, fallback sang GPS/Wi-Fi:', zaloErr?.message || zaloErr);
            }

            if (locResult && locResult.verified && locResult.lat !== undefined && locResult.lng !== undefined) {
                finalLat = locResult.lat;
                finalLng = locResult.lng;
                location_source = 'token';
                is_low_trust = 0;
            } else {
                // Fallback an toàn: không ném lỗi hết hạn/không hợp lệ để không làm gián đoạn chấm công thực tế
                location_source = 'raw';
                is_low_trust = 1;
            }
        }

        const hasRawCoords = finalLat !== null && finalLat !== undefined && finalLat !== '' &&
            finalLng !== null && finalLng !== undefined && finalLng !== '';

        if (!hasRawCoords && !matchedWifiIp) {
            const error = new Error('Không thể xác định tọa độ GPS hiện tại. Vui lòng bật GPS trên điện thoại hoặc kết nối Wi-Fi Công ty và thử lại!');
            error.statusCode = 400;
            throw error;
        }

        let numLat = null;
        let numLng = null;
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

        // Helper kích hoạt Cảnh báo Đỏ 2 chiều (CRITICAL_FRAUD)
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

            await query(`
                INSERT INTO attendance_logs (
                    employee_id, record_date, status, ot_hours, check_in_lat, check_in_lng,
                    check_in_method, is_suspicious, suspicious_reason, device_fingerprint, location_source, is_low_trust
                ) VALUES (?, ?, '0', 0, ?, ?, 'blocked_fraud', 1, ?, ?, ?, 2)
                ON DUPLICATE KEY UPDATE
                    is_suspicious = 1,
                    suspicious_reason = VALUES(suspicious_reason),
                    device_fingerprint = COALESCE(VALUES(device_fingerprint), device_fingerprint)
            `, [ma_nv, dateStr, numLat, numLng, fraudReason, deviceStr, location_source]).catch(() => {});

            const error = new Error('⚠️ CẢNH BÁO VI PHẠM AN NINH: Hệ thống phát hiện dấu hiệu giả mạo vị trí (Fake GPS) hoặc thiết bị chưa được cấp phép. Cảnh báo đã được gửi trực tiếp tới Ban Giám Đốc!');
            error.statusCode = 403;
            error.code = 'SECURITY_VIOLATION_FRAUD';
            error.fraud_type = fraudType;
            error.fraud_reason = fraudReason;
            throw error;
        };

        // 3.1 Kiểm tra cờ Fake GPS trực tiếp hoặc độ chính xác giả mạo
        if (is_fake_gps === true || is_fake_gps === 'true' || (gps_accuracy !== null && Number(gps_accuracy) < 0)) {
            await triggerCriticalFraud('FAKE_GPS', 'Phát hiện phần mềm giả mạo vị trí (Mock Location / Fake GPS)');
        }

        // 3.2 Kiểm tra dịch chuyển tức thời bất khả thi (Speed Anomaly > 120km/h trong vòng 10 phút)
        if (numLat !== null && numLng !== null) {
            const lastCheckInRows = await query(`
                SELECT check_in_lat, check_in_lng, check_in_time, check_out_time
                FROM attendance_logs
                WHERE employee_id = ? AND record_date = ? AND check_in_lat IS NOT NULL AND check_in_lng IS NOT NULL
                LIMIT 1
            `, [ma_nv, dateStr]);
            if (lastCheckInRows && lastCheckInRows.length > 0) {
                const prev = lastCheckInRows[0];
                const prevTimeStr = prev.check_out_time || prev.check_in_time;
                const prevMins = this.parseTimeToMinutes(prevTimeStr, -1);
                const curMins = this.parseTimeToMinutes(timeStr, -1);
                const diffMins = Math.abs(curMins - prevMins);
                if (prevMins >= 0 && curMins >= 0 && diffMins > 0 && diffMins <= 10) {
                    const jumpMeters = calculateDistanceMeters(numLat, numLng, Number(prev.check_in_lat), Number(prev.check_in_lng));
                    if (jumpMeters > 20000) {
                        await triggerCriticalFraud('FAKE_GPS_TELEPORT', `Dịch chuyển vị trí bất thường (${Math.round(jumpMeters / 1000)}km trong ${diffMins} phút)`);
                    }
                }
            }
        }

        // 3.3 Kiểm tra Ràng buộc Thiết bị & Chấm công hộ trên cùng thiết bị
        let is_suspicious = false;
        let suspicious_reason = null;

        if (is_fake_device === true || is_fake_device === 'true') {
            await triggerCriticalFraud('UNREGISTERED_DEVICE', `Phát hiện thiết bị giả mạo / chưa được cấp phép (${deviceStr || 'Unknown Device'})`);
        }

        if (deviceStr) {
            // Kiểm tra xem thiết bị này vừa được một nhân viên KHÁC dùng chấm công trong 15 phút qua không (Chấm công hộ)
            const sharedDeviceLogs = await query(`
                SELECT actor_id, details
                FROM audit_logs
                WHERE action IN ('CHECK_IN_1TOUCH', 'CHECK_OUT_1TOUCH', 'CHECK_IN_DYNAMIC_QR')
                  AND actor_id != ?
                  AND created_at >= NOW() - INTERVAL 15 MINUTE
                ORDER BY created_at DESC
                LIMIT 10
            `, [ma_nv]);

            if (sharedDeviceLogs && sharedDeviceLogs.length > 0) {
                for (const sLog of sharedDeviceLogs) {
                    try {
                        const parsed = JSON.parse(sLog.details || '{}');
                        if (parsed.device_fingerprint && parsed.device_fingerprint === deviceStr) {
                            await triggerCriticalFraud(
                                'CLONED_SHARED_DEVICE',
                                `Phát hiện dùng chung thiết bị chấm công hộ với nhân viên ${sLog.actor_id} (${deviceStr})`
                            );
                        }
                    } catch (err) {
                        if (err.code === 'SECURITY_VIOLATION_FRAUD') throw err;
                    }
                }
            }
        }

        if (current_user.role === 'worker' && deviceStr) {
            const bindingMode = emp.device_binding_mode || 'recording';
            if (!emp.bound_device_id) {
                await query('UPDATE employees SET bound_device_id = ? WHERE ma_nv = ?', [deviceStr, ma_nv]);
                emp.bound_device_id = deviceStr;
            } else if (emp.bound_device_id !== deviceStr) {
                if (bindingMode === 'enforced') {
                    await triggerCriticalFraud(
                        'UNREGISTERED_DEVICE',
                        `Thiết bị lạ chưa được cấp phép (${deviceStr}) khác với thiết bị đã đăng ký (${emp.bound_device_id})`
                    );
                } else {
                    is_suspicious = true;
                    suspicious_reason = `Phát hiện chấm công từ thiết bị lạ (${deviceStr}) khác với thiết bị đã đăng ký (${emp.bound_device_id})`;
                }
            }
        }

        // 4. Đối soát Geofence Đa chi nhánh (allowed_locations) + IP Wi-Fi Nội bộ + Chế độ Đi Công Trình
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
        const isFieldWork = String(work_location_type || '').toUpperCase() === 'FIELD_WORK';
        let finalLocationType = 'OFFICE';
        let locationName = nearestLocation.name || 'Trụ sở chính';
        let cleanFieldNote = field_note ? String(field_note).trim().slice(0, 400) : '';

        if (matchedLocation) {
            finalLocationType = 'OFFICE';
            locationName = matchedLocation.name;
        } else if (matchedWifiIp) {
            finalLocationType = 'WIFI_OFFICE';
            locationName = `Wi-Fi Nội bộ (${cleanClientIp})`;
        } else if (isFieldWork) {
            // Chế độ Đi Công Trình / Thị Trường: Bắt buộc có ảnh chụp hiện trường thật và ghi chú công trình
            const dummyTinyWebp = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
            if (!image_snapshot || image_snapshot === dummyTinyWebp || image_snapshot.length < 200) {
                const error = new Error('Chế độ Đi Công Trình yêu cầu BẮT BUỘC phải chụp ảnh hiện trường thực tế tại công trình/khách hàng!');
                error.statusCode = 400;
                throw error;
            }
            if (!cleanFieldNote || cleanFieldNote.length < 5) {
                const error = new Error('Vui lòng nhập ghi chú tên công trình hoặc khách hàng (tối thiểu 5 ký tự)!');
                error.statusCode = 400;
                throw error;
            }
            finalLocationType = 'FIELD_WORK';
            locationName = `Công trình: ${cleanFieldNote.slice(0, 80)}`;
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
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        const isLocked = await this.isPeriodLocked(currentMonth, currentYear);
        if (isLocked) {
            const error = new Error(`Kỳ công Tháng ${currentMonth}/${currentYear} đã bị KHÓA SỔ. Không thể chấm công!`);
            error.statusCode = 400;
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
        if (activeShiftCode === 'FULL_DAY') {
            const todayLeaves = await query(
                `SELECT request_type, reason FROM requests WHERE employee_id = ? AND request_date = ? AND status = 'approved'`,
                [ma_nv, dateStr]
            ).catch(() => []);
            hasMorningHalfLeave = (todayLeaves || []).some((r) => {
                const txt = `${r.request_type || ''} ${r.reason || ''}`.toLowerCase();
                const isHalf = txt.includes('0.5') || txt.includes('nửa ngày') || txt.includes('buổi sáng');
                return isHalf && !txt.includes('chiều');
            });
            if (hasMorningHalfLeave) {
                activeShiftCode = 'AFTERNOON_SHIFT';
            }
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

        const checkInMethod = finalLocationType === 'FIELD_WORK'
            ? 'field_checkin'
            : finalLocationType === 'WIFI_OFFICE'
            ? 'wifi_office'
            : 'one_touch_gps';

        const txOutcome = await withTransaction(async (txQuery) => {
            if (faultInjectionHook && process.env.NODE_ENV === 'test') {
                await faultInjectionHook(txQuery);
            }

            // Khóa dòng nhân viên trong Transaction để serialize mọi cú bấm chấm công đồng thời
            await txQuery('SELECT ma_nv FROM employees WHERE ma_nv = ? FOR UPDATE', [ma_nv]);

            const existingRows = await txQuery(
                'SELECT * FROM attendance_logs WHERE employee_id = ? AND record_date = ? FOR UPDATE',
                [ma_nv, dateStr]
            );
            const existingLog = existingRows && existingRows.length > 0 ? existingRows[0] : null;
            const isCheckOut = Boolean(existingLog && existingLog.check_in_time);

            // Chốt chặn Cooldown 60 giây chống bấm nhầm liên tiếp nhảy sang Check-out hoặc spam Check-out
            if (existingLog && currentSecs !== null) {
                const lastTimeStr = existingLog.check_out_time || existingLog.check_in_time;
                const lastSecs = this.parseTimeToSeconds(lastTimeStr);
                if (lastSecs !== null) {
                    const diffSecs = currentSecs - lastSecs;
                    if (diffSecs >= 0 && diffSecs < 60) {
                        const err = new Error(
                            `Bạn vừa chấm công vào lúc ${lastTimeStr}, vui lòng không bấm liên tục (chờ ${60 - diffSecs}s)!`
                        );
                        err.statusCode = 429;
                        err.code = 'CHECKIN_COOLDOWN_60S';
                        throw err;
                    }
                }
            }

            const checkType = isCheckOut ? 'OUT' : 'IN';
            let late_minutes = existingLog ? (Number(existingLog.late_minutes) || 0) : 0;
            let early_leave_minutes = 0;
            let work_hours = existingLog ? (Number(existingLog.work_hours) || 0) : 0;
            let ot_hours = existingLog ? (Number(existingLog.ot_hours) || 0) : 0;
            let newStatus = existingLog && existingLog.status && existingLog.status !== '0' ? existingLog.status : '1';
            let shiftEvaluation = '';
            let detailedMessage = '';

            if (!isCheckOut) {
                // LẦN BẤM 1 TRONG NGÀY -> CHECK-IN (VÀO CA)
                if (currentMins <= workStartMins) {
                    late_minutes = 0;
                    const earlyBy = workStartMins - currentMins;
                    shiftEvaluation = earlyBy > 0
                        ? `Tuyệt vời! Bạn đến sớm ${earlyBy} phút (Giờ vào: ${shortTime})`
                        : `Tuyệt vời! Bạn đến đúng giờ (${shortTime})`;
                    detailedMessage = shiftEvaluation;
                } else if (currentMins <= workStartMins + graceMinutes) {
                    late_minutes = 0;
                    shiftEvaluation = `Đúng giờ (Trong ${graceMinutes}p ân hạn)`;
                    detailedMessage = `Đã ghi nhận Giờ vào: ${shortTime} (${shiftEvaluation})`;
                } else {
                    late_minutes = currentMins - workStartMins;
                    let halfDayNote = '';
                    const policyType = String(cs.late_policy_type || 'PER_MINUTE').toUpperCase();
                    const maxLateHalfDay = Math.max(1, Number(cs.max_late_minutes_for_half_day ?? 60) || 60);
                    const freeLateCount = cs.free_late_occurrences !== undefined && cs.free_late_occurrences !== null
                        ? Math.max(0, Number(cs.free_late_occurrences))
                        : 3;

                    if (policyType === 'DEDUCT_WORKDAY' && late_minutes > maxLateHalfDay) {
                        const priorLateRows = await txQuery(
                            'SELECT COUNT(*) as cnt FROM attendance_logs WHERE employee_id = ? AND MONTH(record_date) = ? AND YEAR(record_date) = ? AND record_date != ? AND late_minutes > 0',
                            [ma_nv, currentMonth, currentYear, dateStr]
                        );
                        const priorLateCnt = Number(priorLateRows?.[0]?.cnt || 0);
                        if (priorLateCnt >= freeLateCount) {
                            newStatus = '0.5';
                            halfDayNote = ` • Trừ nửa công (trễ > ${maxLateHalfDay}p)`;
                        }
                    }

                    shiftEvaluation = `Đi trễ ${late_minutes} phút (Giờ vào quy định ${workStartStr}${halfDayNote})`;
                    detailedMessage = `Đã ghi nhận Giờ vào: ${shortTime} (${shiftEvaluation})`;
                }

                const insertSql = `
                    INSERT INTO attendance_logs (
                        employee_id, record_date, status, ot_hours, check_in_time,
                        check_in_lat, check_in_lng, check_in_method, check_in_image,
                        is_suspicious, suspicious_reason, device_fingerprint,
                        location_source, is_low_trust, late_minutes, early_leave_minutes, work_hours,
                        location_name, field_note, work_location_type, shift_type
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        check_in_time = COALESCE(check_in_time, VALUES(check_in_time)),
                        check_in_lat = COALESCE(VALUES(check_in_lat), check_in_lat),
                        check_in_lng = COALESCE(VALUES(check_in_lng), check_in_lng),
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
                    dateStr,
                    newStatus,
                    ot_hours,
                    timeStr,
                    numLat,
                    numLng,
                    checkInMethod,
                    image_snapshot || null,
                    is_suspicious ? 1 : 0,
                    suspicious_reason || null,
                    deviceStr,
                    location_source,
                    is_low_trust,
                    late_minutes,
                    locationName,
                    cleanFieldNote || null,
                    finalLocationType,
                    activeShiftCode
                ]);
            } else {
                // LẦN BẤM 2 TRỞ ĐI TRONG NGÀY -> CHECK-OUT (RA CA)
                const logShiftCode = (existingLog.shift_type && SHIFT_DEFINITIONS[existingLog.shift_type]) ? existingLog.shift_type : activeShiftCode;
                const checkoutSchedule = resolveEmployeeWorkSchedule({
                    emp,
                    cs,
                    activeShiftCode: logShiftCode,
                    hasMorningHalfLeave,
                    hasRequestedShift: Boolean(requestedShift)
                });
                const effectiveWorkStartMins = this.parseTimeToMinutes(checkoutSchedule.workStartStr, workStartMins);
                const effectiveWorkEndMins = this.parseTimeToMinutes(checkoutSchedule.workEndStr, workEndMins);
                const inMins = this.parseTimeToMinutes(existingLog.check_in_time, effectiveWorkStartMins);
                const effectiveIn = Math.min(inMins, currentMins);
                const lunchOverlap = logShiftCode === 'FULL_DAY'
                    ? Math.max(0, Math.min(currentMins, lunchEndMins) - Math.max(effectiveIn, lunchStartMins))
                    : 0;
                const rawWorkedMins = Math.max(0, currentMins - effectiveIn - lunchOverlap);
                work_hours = Number((rawWorkedMins / 60).toFixed(2));

                if (currentMins < effectiveWorkEndMins) {
                    early_leave_minutes = effectiveWorkEndMins - currentMins;
                    newStatus = work_hours > 0 && work_hours <= 4.5 ? '0.5' : (ot_hours > 0 ? '1/OT' : '1');
                    shiftEvaluation = `Về sớm ${early_leave_minutes} phút • Tổng ${work_hours}h làm việc`;
                } else {
                    early_leave_minutes = 0;
                    const extraMins = currentMins - effectiveWorkEndMins;
                    if (extraMins >= 30) {
                        const autoOt = Number((extraMins / 60).toFixed(2));
                        ot_hours = Math.max(ot_hours, autoOt);
                        newStatus = '1/OT';
                        const h = Math.floor(extraMins / 60);
                        const m = extraMins % 60;
                        const otLabel = `${h > 0 ? `${h}h` : ''}${m > 0 ? `${m}p` : ''}`;
                        shiftEvaluation = `Làm thêm ${otLabel} (${ot_hours}h OT) • Tổng ${work_hours}h`;
                    } else {
                        newStatus = ot_hours > 0 ? '1/OT' : '1';
                        shiftEvaluation = `Đủ công chuẩn • Tổng ${work_hours}h làm việc`;
                    }
                }
                detailedMessage = `Đã ghi nhận Giờ ra: ${shortTime} (${shiftEvaluation})`;

                const updateOutSql = `
                    UPDATE attendance_logs
                    SET check_out_time = ?,
                        status = ?,
                        ot_hours = ?,
                        early_leave_minutes = ?,
                        work_hours = ?,
                        location_name = COALESCE(?, location_name),
                        field_note = COALESCE(?, field_note),
                        work_location_type = COALESCE(?, work_location_type),
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
                    locationName,
                    cleanFieldNote || null,
                    finalLocationType,
                    image_snapshot || null,
                    is_suspicious ? 1 : 0,
                    suspicious_reason || null,
                    deviceStr,
                    ma_nv,
                    dateStr
                ]);
            }

            return {
                isCheckOut,
                checkType,
                existingLog,
                late_minutes,
                early_leave_minutes,
                work_hours,
                ot_hours,
                newStatus,
                shiftEvaluation,
                detailedMessage
            };
        });

        const {
            isCheckOut,
            checkType,
            existingLog,
            late_minutes,
            early_leave_minutes,
            work_hours,
            ot_hours,
            newStatus,
            shiftEvaluation,
            detailedMessage
        } = txOutcome;

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
                date: dateStr,
                time: timeStr,
                late_minutes,
                early_leave_minutes,
                work_hours,
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
                record_date: dateStr,
                check_type: checkType,
                location_name: locationName,
                work_location_type: finalLocationType,
                field_note: cleanFieldNote || null,
                check_in_time: isCheckOut ? existingLog.check_in_time : timeStr,
                check_out_time: isCheckOut ? timeStr : null,
                server_time: timeStr,
                late_minutes,
                early_leave_minutes,
                work_hours,
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
        const [totalEmpRow] = await query('SELECT COUNT(*) as total FROM employees WHERE status != "inactive"');
        const totalEmployees = totalEmpRow ? Number(totalEmpRow.total) : 0;

        const logs = await query(
            "SELECT status, check_in_time, late_minutes, work_location_type, COALESCE(shift_type, 'FULL_DAY') as shift_type FROM attendance_logs WHERE record_date = ?",
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
}

module.exports = new AttendanceService();

