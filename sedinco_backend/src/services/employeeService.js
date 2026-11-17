const crypto = require('crypto');
const { query } = require('../config/db');
const { SAFE_EMPLOYEE_FIELDS, resolveUserRole, logAuditEvent, invalidateUserCache } = require('../middlewares/authMiddleware');
const { verifyZaloUserToken } = require('../utils/zaloAdapter');
const { hashPassword, validatePasswordPolicy } = require('../utils/passwordHelper');
const {
    computeDeviceShortTag,
    resolveFriendlyDeviceName,
    safeParseKnownDevices
} = require('../utils/deviceIdentityHelper');

function normalizeOptionalTime(rawVal, label = 'Giờ làm việc riêng') {
    if (rawVal === null || rawVal === '') return null;
    const trimmed = String(rawVal).trim();
    const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
    if (!match) {
        const error = new Error(`${label} không đúng định dạng HH:mm!`);
        error.statusCode = 400;
        throw error;
    }
    const hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        const error = new Error(`${label} không hợp lệ!`);
        error.statusCode = 400;
        throw error;
    }
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

class EmployeeService {
    async getAllEmployees(pagination = {}) {
        const limit = Math.min(200, Math.max(1, parseInt(pagination.limit, 10) || 200));
        const page = Math.max(1, parseInt(pagination.page, 10) || 1);
        const offset = (page - 1) * limit;

        const sql = `SELECT ${SAFE_EMPLOYEE_FIELDS} FROM employees ORDER BY ma_nv ASC LIMIT ? OFFSET ?`;
        const results = await query(sql, [limit, offset]);
        return results || [];
    }

    async getEmployeeById(ma_nv) {
        const sql = `SELECT ${SAFE_EMPLOYEE_FIELDS} FROM employees WHERE ma_nv = ? LIMIT 1`;
        const results = await query(sql, [ma_nv]);
        return results && results.length > 0 ? results[0] : null;
    }

    async createEmployee(data, current_user = null) {
        const {
            ma_nv, ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, department, role,
            ngay_bat_dau_lam, ngay_chinh_thuc, luong_cb,
            phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o,
            thuong_htcv, phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance,
            status, is_locked, custom_start_time, custom_end_time
        } = data;

        const cleanCustomStart = custom_start_time !== undefined ? normalizeOptionalTime(custom_start_time, 'Giờ vào ca riêng') : null;
        const cleanCustomEnd = custom_end_time !== undefined ? normalizeOptionalTime(custom_end_time, 'Giờ tan ca riêng') : null;

        // Chỉ Quản trị viên (Admin) mới có quyền gán role 'accountant' hoặc 'admin' (Chống Mass Assignment & Privilege Escalation)
        let normalizedRole = 'worker';
        if (current_user && current_user.role === 'admin') {
            normalizedRole = ['worker', 'accountant', 'admin'].includes(role)
                ? role 
                : resolveUserRole({ chuc_danh });
        } else {
            normalizedRole = 'worker';
        }

        let rawPassword = data.password;
        let oneTimePassword = null;
        let mustChangePassword = 0;

        if (rawPassword && typeof rawPassword === 'string' && rawPassword.trim().length > 0) {
            rawPassword = rawPassword.trim();
            mustChangePassword = data.must_change_password !== undefined ? (data.must_change_password ? 1 : 0) : 1;
        } else {
            // Sinh ngẫu nhiên mật khẩu một lần an toàn (>= 16 ký tự, gồm số, chữ hoa, thường và ký tự đặc biệt)
            rawPassword = crypto.randomBytes(12).toString('base64url') + '!A9z';
            oneTimePassword = rawPassword;
            mustChangePassword = 1;
        }

        const hashedPassword = hashPassword(rawPassword);

        const sql = `
            INSERT INTO employees (
                ma_nv, ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, department, role,
                ngay_bat_dau_lam, ngay_chinh_thuc, luong_cb, 
                phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o, 
                thuong_htcv, phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance,
                status, is_locked, password, must_change_password, custom_start_time, custom_end_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const cleanDepartment = (department && String(department).trim()) ? String(department).trim().slice(0, 100) : 'Khối Công trình';
        const values = [
            ma_nv, ho_ten, ngay_sinh || null, dien_thoai || '', email || '', chuc_danh || '', cleanDepartment, normalizedRole,
            ngay_bat_dau_lam || null, ngay_chinh_thuc || null, luong_cb || 0,
            phu_cap_an_trua || 0, phu_cap_xang_xe || 0, phu_cap_nha_o || 0,
            thuong_htcv || 0, phu_cap_trach_nhiem || 0, phu_cap_tiep_khach || 0,
            has_insurance ? 1 : 0,
            status || 'active',
            is_locked ? 1 : 0,
            hashedPassword,
            mustChangePassword,
            cleanCustomStart,
            cleanCustomEnd
        ];
        try {
            await query(sql, values);
        } catch (err) {
            if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062 || String(err.message || '').includes('Duplicate entry'))) {
                const dupErr = new Error(`Mã nhân viên "${ma_nv}" đã tồn tại trên hệ thống. Vui lòng chọn mã khác!`);
                dupErr.statusCode = 409;
                dupErr.code = 'DUPLICATE_EMPLOYEE';
                throw dupErr;
            }
            throw err;
        }

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'admin',
                actor_role: current_user.role || 'admin',
                action: 'CREATE_EMPLOYEE',
                resource: 'employees',
                details: { ma_nv, ho_ten, role: normalizedRole }
            });
        }

        return { 
            success: true,
            ...(oneTimePassword ? { one_time_password: oneTimePassword } : {})
        };
    }

    async updateEmployee(id, data, current_user = null) {
        const {
            ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, department, role,
            ngay_bat_dau_lam, ngay_chinh_thuc, luong_cb,
            phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o,
            thuong_htcv, phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance,
            status, is_locked, shift_type, annual_leave_quota, keep_logs, new_password,
            custom_start_time, custom_end_time
        } = data;

        const setClauses = [];
        const values = [];
        const addField = (col, val) => {
            setClauses.push(`${col}=?`);
            values.push(val);
        };

        if (ho_ten !== undefined) addField('ho_ten', ho_ten);
        if (ngay_sinh !== undefined) addField('ngay_sinh', ngay_sinh || null);
        if (dien_thoai !== undefined) addField('dien_thoai', dien_thoai || '');
        if (email !== undefined) addField('email', email || '');
        if (chuc_danh !== undefined) addField('chuc_danh', chuc_danh || '');
        if (ngay_bat_dau_lam !== undefined) addField('ngay_bat_dau_lam', ngay_bat_dau_lam || null);
        if (ngay_chinh_thuc !== undefined) addField('ngay_chinh_thuc', ngay_chinh_thuc || null);
        if (luong_cb !== undefined) addField('luong_cb', luong_cb || 0);
        if (phu_cap_an_trua !== undefined) addField('phu_cap_an_trua', phu_cap_an_trua || 0);
        if (phu_cap_xang_xe !== undefined) addField('phu_cap_xang_xe', phu_cap_xang_xe || 0);
        if (phu_cap_nha_o !== undefined) addField('phu_cap_nha_o', phu_cap_nha_o || 0);
        if (thuong_htcv !== undefined) addField('thuong_htcv', thuong_htcv || 0);
        if (phu_cap_trach_nhiem !== undefined) addField('phu_cap_trach_nhiem', phu_cap_trach_nhiem || 0);
        if (phu_cap_tiep_khach !== undefined) addField('phu_cap_tiep_khach', phu_cap_tiep_khach || 0);
        if (has_insurance !== undefined) addField('has_insurance', has_insurance ? 1 : 0);

        if (department !== undefined) {
            addField('department', department && String(department).trim() ? String(department).trim().slice(0, 100) : 'Khối Công trình');
        }
        if ((current_user && current_user.role === 'admin') && role !== undefined && ['worker', 'accountant', 'admin'].includes(role)) {
            addField('role', role);
        }
        if (status !== undefined) addField('status', status);
        if (is_locked !== undefined) addField('is_locked', is_locked ? 1 : 0);
        if (shift_type !== undefined && shift_type !== null) {
            const cleanShift = String(shift_type).trim().toUpperCase();
            if (!['FULL_DAY', 'MORNING_SHIFT', 'AFTERNOON_SHIFT', 'NIGHT_SHIFT'].includes(cleanShift)) {
                const err = new Error('Ca làm việc không hợp lệ!');
                err.statusCode = 400;
                throw err;
            }
            addField('shift_type', cleanShift);
        }
        if (annual_leave_quota !== undefined && annual_leave_quota !== null && annual_leave_quota !== '') {
            const cleanQuota = Math.max(0, Math.min(60, Number(annual_leave_quota)));
            if (!Number.isFinite(cleanQuota)) {
                const err = new Error('Hạn mức phép năm không hợp lệ!');
                err.statusCode = 400;
                throw err;
            }
            addField('annual_leave_quota', cleanQuota);
        }
        if ((current_user && current_user.role === 'admin') && keep_logs !== undefined) {
            addField('keep_logs', keep_logs ? 1 : 0);
        }
        if ((current_user && current_user.role === 'admin') && new_password && String(new_password).trim().length > 0) {
            const cleanPw = String(new_password).trim();
            const policyCheck = validatePasswordPolicy(cleanPw, id);
            if (!policyCheck.valid) {
                const err = new Error(policyCheck.message);
                err.statusCode = 400;
                throw err;
            }
            addField('password', hashPassword(cleanPw));
            addField('must_change_password', 1);
            setClauses.push('token_version = COALESCE(token_version, 1) + 1');
        }
        if (custom_start_time !== undefined) addField('custom_start_time', normalizeOptionalTime(custom_start_time, 'Giờ vào ca riêng'));
        if (custom_end_time !== undefined) addField('custom_end_time', normalizeOptionalTime(custom_end_time, 'Giờ tan ca riêng'));

        if (setClauses.length === 0) {
            const existsRows = await query('SELECT ma_nv FROM employees WHERE ma_nv = ? LIMIT 1', [id]);
            if (!existsRows || existsRows.length === 0) {
                const err = new Error('Không tìm thấy nhân viên!');
                err.statusCode = 404;
                throw err;
            }
            return { success: true };
        }

        values.push(id);
        const updRes = await query(`UPDATE employees SET ${setClauses.join(', ')} WHERE ma_nv=?`, values);
        if (!updRes || updRes.affectedRows === 0) {
            const err = new Error('Không tìm thấy nhân viên!');
            err.statusCode = 404;
            throw err;
        }
        invalidateUserCache(id);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'admin',
                actor_role: current_user.role || 'admin',
                action: 'UPDATE_EMPLOYEE',
                resource: 'employees',
                details: { ma_nv: id, updated_fields: Object.keys(data) }
            });
        }

        return { success: true };
    }

    async updateEmployeeStatus(ma_nv, { status, is_locked }, current_user = null) {
        const isBlocked = status === 'inactive' || status === 'locked' || is_locked === 1 || is_locked === true;
        const newStatus = status ? status : (isBlocked ? 'inactive' : 'active');
        const newLocked = is_locked !== undefined ? (is_locked ? 1 : 0) : (isBlocked ? 1 : 0);
        const updRes = await query(
            'UPDATE employees SET status = ?, is_locked = ?, token_version = COALESCE(token_version, 1) + 1 WHERE ma_nv = ?',
            [newStatus, newLocked, ma_nv]
        );
        if (!updRes || updRes.affectedRows === 0) {
            const err = new Error('Không tìm thấy nhân viên!');
            err.statusCode = 404;
            throw err;
        }
        invalidateUserCache(ma_nv);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'admin',
                actor_role: current_user.role || 'admin',
                action: 'UPDATE_EMPLOYEE_STATUS',
                resource: 'employees',
                details: { ma_nv, status: newStatus, is_locked: newLocked }
            });
        }

        return { success: true };
    }

    async toggleEmployeeLock(ma_nv, payload = {}, current_user = null) {
        return this.updateEmployeeStatus(ma_nv, payload, current_user);
    }

    async updateEmployeeRole(ma_nv, role, current_user = null) {
        const validRole = ['worker', 'accountant', 'admin'].includes(role) 
            ? role 
            : (role === 'employee' ? 'worker' : 'worker');

        const updRes = await query(
            'UPDATE employees SET role = ?, token_version = COALESCE(token_version, 1) + 1 WHERE ma_nv = ?',
            [validRole, ma_nv]
        );
        if (!updRes || updRes.affectedRows === 0) {
            const err = new Error('Không tìm thấy nhân viên!');
            err.statusCode = 404;
            throw err;
        }
        invalidateUserCache(ma_nv);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'admin',
                actor_role: current_user.role || 'admin',
                action: 'UPDATE_EMPLOYEE_ROLE',
                resource: 'employees',
                details: { ma_nv, new_role: validRole }
            });
        }

        return { success: true };
    }

    async updateEmployeeShift(ma_nv, { shift_type = null, annual_leave_quota = null, custom_start_time, custom_end_time } = {}, current_user = null) {
        const allowedShifts = ['FULL_DAY', 'MORNING_SHIFT', 'AFTERNOON_SHIFT', 'NIGHT_SHIFT'];
        const updates = [];
        const params = [];
        const details = { ma_nv };

        if (shift_type !== null && shift_type !== undefined) {
            const cleanShift = String(shift_type).trim().toUpperCase();
            if (!allowedShifts.includes(cleanShift)) {
                const error = new Error('Ca làm việc không hợp lệ!');
                error.statusCode = 400;
                throw error;
            }
            updates.push('shift_type = ?');
            params.push(cleanShift);
            details.shift_type = cleanShift;
        }

        if (annual_leave_quota !== null && annual_leave_quota !== undefined && annual_leave_quota !== '') {
            const cleanQuota = Math.max(0, Math.min(60, Number(annual_leave_quota)));
            if (!Number.isFinite(cleanQuota)) {
                const error = new Error('Hạn mức phép năm không hợp lệ!');
                error.statusCode = 400;
                throw error;
            }
            updates.push('annual_leave_quota = ?');
            params.push(cleanQuota);
            details.annual_leave_quota = cleanQuota;
        }

        if (custom_start_time !== undefined) {
            const cleanStart = normalizeOptionalTime(custom_start_time, 'Giờ vào ca riêng');
            updates.push('custom_start_time = ?');
            params.push(cleanStart);
            details.custom_start_time = cleanStart;
        }

        if (custom_end_time !== undefined) {
            const cleanEnd = normalizeOptionalTime(custom_end_time, 'Giờ tan ca riêng');
            updates.push('custom_end_time = ?');
            params.push(cleanEnd);
            details.custom_end_time = cleanEnd;
        }

        if (updates.length === 0) {
            return { success: true };
        }

        params.push(ma_nv);
        await query(`UPDATE employees SET ${updates.join(', ')} WHERE ma_nv = ?`, params);
        invalidateUserCache(ma_nv);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'admin',
                actor_role: current_user.role || 'admin',
                action: 'UPDATE_EMPLOYEE_WORK_CONFIG',
                resource: 'employees',
                details
            });
        }

        return { success: true, message: 'Đã cập nhật ca làm việc & định mức phép!', data: details };
    }

    async deleteEmployee(id, current_user = null) {
        const delRes = await query('DELETE FROM employees WHERE ma_nv=?', [id]);
        if (!delRes || delRes.affectedRows === 0) {
            const err = new Error('Không tìm thấy nhân viên!');
            err.statusCode = 404;
            throw err;
        }
        invalidateUserCache(id);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'admin',
                actor_role: current_user.role || 'admin',
                action: 'DELETE_EMPLOYEE',
                resource: 'employees',
                details: { ma_nv: id }
            });
        }

        return { success: true };
    }

    /**
     * Liên kết tài khoản Zalo thông qua Access Token được Server xác minh với Zalo
     */
    async bindZalo(ma_nv, zalo_token, current_user = null) {
        if (!zalo_token || typeof zalo_token !== 'string' || !zalo_token.trim()) {
            const error = new Error('Phiên xác thực Zalo không hợp lệ hoặc đã hết hạn, vui lòng mở lại ứng dụng từ Zalo');
            error.statusCode = 401;
            throw error;
        }

        // Server-side verification với Zalo Open API
        const verified = await verifyZaloUserToken(zalo_token);
        if (!verified || !verified.zaloId) {
            const error = new Error('Phiên xác thực Zalo không hợp lệ hoặc đã hết hạn, vui lòng mở lại ứng dụng từ Zalo');
            error.statusCode = 401;
            throw error;
        }

        await query('UPDATE employees SET zalo_id = ?, zalo_user_id = ? WHERE ma_nv = ?', [verified.zaloId, verified.zaloId, ma_nv]);

        await logAuditEvent({
            actor_id: ma_nv,
            actor_role: current_user?.role || 'worker',
            action: 'BIND_ZALO',
            resource: 'employee_zalo',
            details: { zalo_id: verified.zaloId, provider: verified.provider }
        });

        return {
            ma_nv,
            zalo_id: verified.zaloId,
            verified_by: verified.provider
        };
    }

    /**
     * Worker gửi yêu cầu đổi/mất thiết bị
     */
    async requestDeviceChange(ma_nv, { new_device_id, device_name = null, reason }, current_user = null, user_agent = '') {
        if (!new_device_id || typeof new_device_id !== 'string' || new_device_id.trim().length === 0) {
            const error = new Error('Vui lòng cung cấp mã định danh thiết bị mới!');
            error.statusCode = 400;
            throw error;
        }
        const cleanNewId = new_device_id.trim().slice(0, 100);
        const cleanNewName = resolveFriendlyDeviceName({ device_name, user_agent });

        await query(
            'UPDATE employees SET pending_device_id = ?, pending_device_name = ?, device_change_reason = ? WHERE ma_nv = ?',
            [cleanNewId, cleanNewName, reason || 'Đổi thiết bị mới', ma_nv]
        );
        invalidateUserCache(ma_nv);

        await logAuditEvent({
            actor_id: ma_nv,
            actor_role: current_user?.role || 'worker',
            action: 'REQUEST_DEVICE_CHANGE',
            resource: 'employee_device',
            details: { new_device_id: cleanNewId, device_name: cleanNewName, reason }
        });

        return { success: true, message: 'Đã gửi yêu cầu đổi thiết bị tới Quản trị viên!' };
    }

    /**
     * Danh sách yêu cầu đổi thiết bị chờ duyệt hoặc cảnh báo đa thiết bị (Chỉ Admin)
     */
    async getPendingDeviceChanges() {
        const rows = await query(`
            SELECT ma_nv, ho_ten, chuc_danh, bound_device_id, bound_device_name,
                   pending_device_id, pending_device_name, device_change_reason,
                   device_binding_mode, known_devices_json, COALESCE(multi_device_alert, 0) as multi_device_alert
            FROM employees 
            WHERE (pending_device_id IS NOT NULL AND pending_device_id != '')
               OR COALESCE(multi_device_alert, 0) = 1
            ORDER BY COALESCE(multi_device_alert, 0) DESC, ma_nv ASC
        `);
        return rows || [];
    }

    /**
     * Admin duyệt đổi thiết bị cho nhân viên
     */
    async approveDeviceChange(ma_nv, current_user = null) {
        const rows = await query('SELECT pending_device_id, pending_device_name, device_change_reason FROM employees WHERE ma_nv = ?', [ma_nv]);
        if (!rows || rows.length === 0 || !rows[0].pending_device_id) {
            const error = new Error('Không tìm thấy yêu cầu đổi thiết bị của nhân viên này!');
            error.statusCode = 404;
            throw error;
        }

        const newDevice = rows[0].pending_device_id;
        const newDeviceName = rows[0].pending_device_name || resolveFriendlyDeviceName({ device_name: newDevice });
        const nowIso = new Date().toISOString();
        const freshKnown = [{
            device_id: newDevice,
            device_name: newDeviceName,
            short_tag: computeDeviceShortTag(newDevice),
            first_seen: nowIso,
            last_seen: nowIso,
            ip: '',
            login_count: 1
        }];

        await query(
            `UPDATE employees
             SET bound_device_id = pending_device_id,
                 bound_device_name = ?,
                 known_devices_json = ?,
                 multi_device_alert = 0,
                 pending_device_id = NULL,
                 pending_device_name = NULL,
                 device_change_reason = NULL,
                 token_version = COALESCE(token_version, 1) + 1
             WHERE ma_nv = ?`,
            [newDeviceName, JSON.stringify(freshKnown), ma_nv]
        );
        invalidateUserCache(ma_nv);

        await logAuditEvent({
            actor_id: current_user?.username || current_user?.ma_nv || 'admin',
            actor_role: 'admin',
            action: 'APPROVE_DEVICE_CHANGE',
            resource: 'employee_device',
            details: { target_ma_nv: ma_nv, approved_device: newDevice, approved_device_name: newDeviceName }
        });

        return { success: true, message: `Đã phê duyệt đổi sang máy mới (${newDeviceName}) cho ${ma_nv}!` };
    }

    /**
     * Admin từ chối đổi thiết bị
     */
    async rejectDeviceChange(ma_nv, current_user = null) {
        await query(
            'UPDATE employees SET pending_device_id = NULL, pending_device_name = NULL, device_change_reason = NULL WHERE ma_nv = ?',
            [ma_nv]
        );
        invalidateUserCache(ma_nv);

        await logAuditEvent({
            actor_id: current_user?.username || current_user?.ma_nv || 'admin',
            actor_role: 'admin',
            action: 'REJECT_DEVICE_CHANGE',
            resource: 'employee_device',
            details: { target_ma_nv: ma_nv }
        });

        return { success: true, message: `Đã từ chối yêu cầu đổi thiết bị của nhân viên ${ma_nv}!` };
    }

    /**
     * V16: Xử lý 1 chạm thiết bị & cảnh báo đa thiết bị cho Admin
     * - action = 'lock_primary': Chốt 1 thiết bị chính, xóa thiết bị phụ, đá văng token cũ & khóa cứng enforced
     * - action = 'reset_devices': Xóa toàn bộ liên kết để nhân viên đăng nhập lại từ đầu trên 1 máy sạch
     */
    async resolveEmployeeDevices(ma_nv, { target_device_id = null, target_device_name = null, action = 'lock_primary' } = {}, current_user = null) {
        const rows = await query(
            'SELECT ma_nv, ho_ten, bound_device_id, bound_device_name, known_devices_json FROM employees WHERE ma_nv = ? LIMIT 1',
            [ma_nv]
        );
        if (!rows || rows.length === 0) {
            const err = new Error('Không tìm thấy nhân viên!');
            err.statusCode = 404;
            throw err;
        }
        const emp = rows[0];
        const knownDevices = safeParseKnownDevices(emp.known_devices_json);

        if (action === 'reset_devices') {
            await query(
                `UPDATE employees
                 SET bound_device_id = NULL,
                     bound_device_name = NULL,
                     pending_device_id = NULL,
                     pending_device_name = NULL,
                     device_change_reason = NULL,
                     known_devices_json = NULL,
                     multi_device_alert = 0,
                     device_binding_mode = 'recording',
                     token_version = COALESCE(token_version, 1) + 1
                 WHERE ma_nv = ?`,
                [ma_nv]
            );
            invalidateUserCache(ma_nv);

            await logAuditEvent({
                actor_id: current_user?.username || current_user?.ma_nv || 'admin',
                actor_role: 'admin',
                action: 'RESET_EMPLOYEE_DEVICES',
                resource: 'employee_device',
                details: { target_ma_nv: ma_nv, token_revoked: true }
            });

            return {
                success: true,
                message: `Đã làm mới liên kết thiết bị và đăng xuất toàn bộ phiên của ${emp.ho_ten || ma_nv}!`
            };
        }

        const chosenDevice = knownDevices.find((d) => d.device_id === target_device_id) || knownDevices[0] || null;
        const finalDeviceId = String(target_device_id || chosenDevice?.device_id || emp.bound_device_id || '').trim();
        if (!finalDeviceId) {
            const err = new Error('Chưa có thiết bị nào được ghi nhận để khóa cố định!');
            err.statusCode = 400;
            throw err;
        }

        const finalDeviceName = String(
            target_device_name ||
            chosenDevice?.device_name ||
            emp.bound_device_name ||
            resolveFriendlyDeviceName({ device_name: finalDeviceId })
        ).trim().slice(0, 150);
        const nowIso = new Date().toISOString();
        const singleDeviceList = [{
            device_id: finalDeviceId,
            device_name: finalDeviceName,
            short_tag: chosenDevice?.short_tag || computeDeviceShortTag(finalDeviceId),
            first_seen: chosenDevice?.first_seen || nowIso,
            last_seen: nowIso,
            ip: chosenDevice?.ip || '',
            login_count: chosenDevice?.login_count || 1
        }];

        await query(
            `UPDATE employees
             SET bound_device_id = ?,
                 bound_device_name = ?,
                 pending_device_id = NULL,
                 pending_device_name = NULL,
                 device_change_reason = NULL,
                 known_devices_json = ?,
                 multi_device_alert = 0,
                 device_binding_mode = 'enforced',
                 token_version = COALESCE(token_version, 1) + 1
             WHERE ma_nv = ?`,
            [finalDeviceId, finalDeviceName, JSON.stringify(singleDeviceList), ma_nv]
        );
        invalidateUserCache(ma_nv);

        await logAuditEvent({
            actor_id: current_user?.username || current_user?.ma_nv || 'admin',
            actor_role: 'admin',
            action: 'RESOLVE_MULTI_DEVICE_LOCK',
            resource: 'employee_device',
            details: {
                target_ma_nv: ma_nv,
                locked_device_id: finalDeviceId,
                locked_device_name: finalDeviceName,
                short_tag: singleDeviceList[0].short_tag,
                token_revoked: true,
                device_binding_mode: 'enforced'
            }
        });

        return {
            success: true,
            data: {
                ma_nv,
                bound_device_id: finalDeviceId,
                bound_device_name: finalDeviceName,
                device_binding_mode: 'enforced',
                multi_device_alert: 0,
                known_devices: singleDeviceList
            },
            message: `Đã khóa cứng máy ${finalDeviceName} (#${singleDeviceList[0].short_tag}) cho ${emp.ho_ten || ma_nv} và đăng xuất toàn bộ máy khác!`
        };
    }

    /**
     * Admin thay đổi chế độ liên kết thiết bị ('recording' | 'enforced')
     */
    async setDeviceBindingMode(ma_nv, mode, current_user = null) {
        if (!['recording', 'enforced'].includes(mode)) {
            const error = new Error("Chế độ ràng buộc thiết bị phải là 'recording' hoặc 'enforced'!");
            error.statusCode = 400;
            throw error;
        }

        await query('UPDATE employees SET device_binding_mode = ? WHERE ma_nv = ?', [mode, ma_nv]);

        await logAuditEvent({
            actor_id: current_user?.username || current_user?.ma_nv || 'admin',
            actor_role: 'admin',
            action: 'SET_DEVICE_BINDING_MODE',
            resource: 'employee_device',
            details: { target_ma_nv: ma_nv, mode }
        });

        return { success: true, message: `Đã cập nhật chế độ liên kết thiết bị thành ${mode}!` };
    }

    /**
     * B2 (G5): Kích hoạt đổi mật khẩu theo đợt (Staged Rollout)
     * Hỗ trợ dry-run, chọn theo vai trò (role), chức danh (chuc_danh/tổ/ca), hoặc danh sách mã nhân viên
     */
    async stagedForcePasswordChange({
        role = null,
        chuc_danh = null,
        ma_nv_list = null,
        limit = 50,
        offset = 0,
        dry_run = false,
        current_user = null
    } = {}) {
        const conditions = ["status = 'active'", "is_locked = 0"];
        const params = [];

        if (role) {
            conditions.push("role = ?");
            params.push(role);
        }

        if (chuc_danh) {
            conditions.push("chuc_danh LIKE ?");
            params.push(`%${chuc_danh}%`);
        }

        if (Array.isArray(ma_nv_list) && ma_nv_list.length > 0) {
            const placeholders = ma_nv_list.map(() => '?').join(', ');
            conditions.push(`ma_nv IN (${placeholders})`);
            params.push(...ma_nv_list);
        }

        const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 50));
        const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

        const selectSql = `
            SELECT ma_nv, ho_ten, role, chuc_danh, must_change_password
            FROM employees
            WHERE ${conditions.join(' AND ')}
            ORDER BY ma_nv ASC
            LIMIT ? OFFSET ?
        `;
        params.push(safeLimit, safeOffset);

        const targetEmployees = await query(selectSql, params);

        if (!targetEmployees || targetEmployees.length === 0) {
            return {
                success: true,
                dry_run: Boolean(dry_run),
                target_count: 0,
                target_employees: [],
                message: 'Không tìm thấy nhân viên nào phù hợp với tiêu chí lọc.'
            };
        }

        const targetIds = targetEmployees.map(e => e.ma_nv);

        if (dry_run) {
            return {
                success: true,
                dry_run: true,
                target_count: targetEmployees.length,
                target_employees: targetEmployees.map(e => ({
                    ma_nv: e.ma_nv,
                    ho_ten: e.ho_ten,
                    role: e.role,
                    chuc_danh: e.chuc_danh,
                    current_must_change: Boolean(e.must_change_password)
                })),
                message: `[DRY-RUN] Dự kiến đặt cờ must_change_password=1 cho ${targetEmployees.length} nhân viên (Không thay đổi DB thật).`
            };
        }

        // Thực thi cập nhật thực tế & tăng token_version để thu hồi JWT cũ
        const idPlaceholders = targetIds.map(() => '?').join(', ');
        const updateSql = `UPDATE employees SET must_change_password = 1, token_version = COALESCE(token_version, 1) + 1 WHERE ma_nv IN (${idPlaceholders})`;
        await query(updateSql, targetIds);
        for (const tid of targetIds) {
            invalidateUserCache(tid);
        }

        // Ghi nhận Audit Log
        await logAuditEvent({
            actor_id: current_user?.username || current_user?.ma_nv || 'system',
            actor_role: current_user?.role || 'admin',
            action: 'STAGED_FORCE_PASSWORD_CHANGE',
            resource: 'employees',
            details: {
                target_count: targetIds.length,
                target_ids: targetIds,
                filter: { role, chuc_danh, limit: safeLimit, offset: safeOffset }
            }
        });

        return {
            success: true,
            dry_run: false,
            updated_count: targetIds.length,
            target_employees: targetIds,
            message: `Đã kích hoạt đổi mật khẩu bắt buộc cho ${targetIds.length} nhân viên thành công!`
        };
    }
}

module.exports = new EmployeeService();

