const { query } = require('../config/db');
const { SAFE_EMPLOYEE_FIELDS } = require('../middlewares/authMiddleware');

class EmployeeService {
    async getAllEmployees() {
        const sql = `SELECT ${SAFE_EMPLOYEE_FIELDS} FROM employees ORDER BY ma_nv ASC`;
        const results = await query(sql);
        return results || [];
    }

    async createEmployee(data) {
        const {
            ma_nv, ho_ten, ngay_sinh, dien_thoai, email, chuc_danh,
            ngay_bat_dau_lam, ngay_chinh_thuc, luong_cb,
            phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o,
            thuong_htcv, phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance
        } = data;

        const sql = `
            INSERT INTO employees (
                ma_nv, ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, 
                ngay_bat_dau_lam, ngay_chinh_thuc, luong_cb, 
                phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o, 
                thuong_htcv, phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            ma_nv, ho_ten, ngay_sinh || null, dien_thoai || '', email || '', chuc_danh || '',
            ngay_bat_dau_lam || null, ngay_chinh_thuc || null, luong_cb || 0,
            phu_cap_an_trua || 0, phu_cap_xang_xe || 0, phu_cap_nha_o || 0,
            thuong_htcv || 0, phu_cap_trach_nhiem || 0, phu_cap_tiep_khach || 0,
            has_insurance ? 1 : 0
        ];
        await query(sql, values);
        return { success: true };
    }

    async updateEmployee(id, data) {
        const {
            ho_ten, ngay_sinh, dien_thoai, email, chuc_danh,
            ngay_bat_dau_lam, ngay_chinh_thuc, luong_cb,
            phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o,
            thuong_htcv, phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance
        } = data;

        const sql = `
            UPDATE employees SET 
                ho_ten=?, ngay_sinh=?, dien_thoai=?, email=?, chuc_danh=?, 
                ngay_bat_dau_lam=?, ngay_chinh_thuc=?, luong_cb=?, 
                phu_cap_an_trua=?, phu_cap_xang_xe=?, phu_cap_nha_o=?, 
                thuong_htcv=?, phu_cap_trach_nhiem=?, phu_cap_tiep_khach=?, has_insurance=? 
            WHERE ma_nv=?
        `;
        const values = [
            ho_ten, ngay_sinh || null, dien_thoai || '', email || '', chuc_danh || '',
            ngay_bat_dau_lam || null, ngay_chinh_thuc || null, luong_cb || 0,
            phu_cap_an_trua || 0, phu_cap_xang_xe || 0, phu_cap_nha_o || 0,
            thuong_htcv || 0, phu_cap_trach_nhiem || 0, phu_cap_tiep_khach || 0,
            has_insurance ? 1 : 0, id
        ];
        await query(sql, values);
        return { success: true };
    }

    async updateEmployeeRole(ma_nv, role) {
        // Ánh xạ role về chức danh đại diện phù hợp
        let chucDanh = role;
        if (role === 'admin') chucDanh = 'Giám Đốc';
        else if (role === 'accountant') chucDanh = 'Kế Toán';
        else if (role === 'employee') chucDanh = 'Cán Bộ Nhân Viên';

        await query('UPDATE employees SET chuc_danh = ? WHERE ma_nv = ?', [chucDanh, ma_nv]);
        return { success: true };
    }

    async deleteEmployee(id) {
        await query('DELETE FROM employees WHERE ma_nv=?', [id]);
        return { success: true };
    }
}

module.exports = new EmployeeService();
