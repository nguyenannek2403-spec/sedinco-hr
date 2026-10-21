const { query } = require('../config/db');
const { SAFE_EMPLOYEE_FIELDS, resolveUserRole, logAuditEvent } = require('../middlewares/authMiddleware');

class EmployeeService {
    async getAllEmployees() {
        const sql = `SELECT ${SAFE_EMPLOYEE_FIELDS} FROM employees ORDER BY ma_nv ASC`;
        const results = await query(sql);
        return results || [];
    }

    async getEmployeeById(ma_nv) {
        const sql = `SELECT ${SAFE_EMPLOYEE_FIELDS} FROM employees WHERE ma_nv = ? LIMIT 1`;
        const results = await query(sql, [ma_nv]);
        return results && results.length > 0 ? results[0] : null;
    }

    async createEmployee(data, current_user = null) {
        const {
            ma_nv, ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, role,
            ngay_bat_dau_lam, ngay_chinh_thuc, luong_cb,
            phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o,
            thuong_htcv, phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance,
            status, is_locked
        } = data;

        // Chỉ Quản trị viên (Admin) mới có quyền gán role 'accountant' hoặc 'admin' (Chống Mass Assignment & Privilege Escalation)
        let normalizedRole = 'worker';
        if (current_user && current_user.role === 'admin') {
            normalizedRole = ['worker', 'accountant', 'admin'].includes(role)
                ? role 
                : resolveUserRole({ chuc_danh });
        } else {
            normalizedRole = 'worker';
        }

        const sql = `
            INSERT INTO employees (
                ma_nv, ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, role,
                ngay_bat_dau_lam, ngay_chinh_thuc, luong_cb, 
                phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o, 
                thuong_htcv, phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance,
                status, is_locked
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            ma_nv, ho_ten, ngay_sinh || null, dien_thoai || '', email || '', chuc_danh || '', normalizedRole,
            ngay_bat_dau_lam || null, ngay_chinh_thuc || null, luong_cb || 0,
            phu_cap_an_trua || 0, phu_cap_xang_xe || 0, phu_cap_nha_o || 0,
            thuong_htcv || 0, phu_cap_trach_nhiem || 0, phu_cap_tiep_khach || 0,
            has_insurance ? 1 : 0,
            status || 'active',
            is_locked ? 1 : 0
        ];
        await query(sql, values);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'admin',
                actor_role: current_user.role || 'admin',
                action: 'CREATE_EMPLOYEE',
                resource: 'employees',
                details: { ma_nv, ho_ten, role: normalizedRole }
            });
        }

        return { success: true };
    }

    async updateEmployee(id, data, current_user = null) {
        const {
            ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, role,
            ngay_bat_dau_lam, ngay_chinh_thuc, luong_cb,
            phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o,
            thuong_htcv, phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance,
            status, is_locked
        } = data;

        const updateStatus = status !== undefined;
        const updateLocked = is_locked !== undefined;
        const updateRole = (current_user && current_user.role === 'admin') && role !== undefined && ['worker', 'accountant', 'admin'].includes(role);

        let sql = `
            UPDATE employees SET 
                ho_ten=?, ngay_sinh=?, dien_thoai=?, email=?, chuc_danh=?, 
                ngay_bat_dau_lam=?, ngay_chinh_thuc=?, luong_cb=?, 
                phu_cap_an_trua=?, phu_cap_xang_xe=?, phu_cap_nha_o=?, 
                thuong_htcv=?, phu_cap_trach_nhiem=?, phu_cap_tiep_khach=?, has_insurance=?
        `;
        const values = [
            ho_ten, ngay_sinh || null, dien_thoai || '', email || '', chuc_danh || '',
            ngay_bat_dau_lam || null, ngay_chinh_thuc || null, luong_cb || 0,
            phu_cap_an_trua || 0, phu_cap_xang_xe || 0, phu_cap_nha_o || 0,
            thuong_htcv || 0, phu_cap_trach_nhiem || 0, phu_cap_tiep_khach || 0,
            has_insurance ? 1 : 0
        ];

        if (updateRole) {
            sql += `, role=?`;
            values.push(role);
        }
        if (updateStatus) {
            sql += `, status=?`;
            values.push(status);
        }
        if (updateLocked) {
            sql += `, is_locked=?`;
            values.push(is_locked ? 1 : 0);
        }

        sql += ` WHERE ma_nv=?`;
        values.push(id);

        await query(sql, values);

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
        await query('UPDATE employees SET status = ?, is_locked = ? WHERE ma_nv = ?', [newStatus, newLocked, ma_nv]);

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

    async updateEmployeeRole(ma_nv, role, current_user = null) {
        const validRole = ['worker', 'accountant', 'admin'].includes(role) 
            ? role 
            : (role === 'employee' ? 'worker' : 'worker');

        await query('UPDATE employees SET role = ? WHERE ma_nv = ?', [validRole, ma_nv]);

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

    async deleteEmployee(id, current_user = null) {
        await query('DELETE FROM employees WHERE ma_nv=?', [id]);

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
}

module.exports = new EmployeeService();
