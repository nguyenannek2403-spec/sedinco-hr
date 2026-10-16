const { query } = require('../config/db');
const { sanitizeUserResponse } = require('../middlewares/authMiddleware');

class AuthService {
    async employeeLogin(ma_nv, password) {
        if (!ma_nv || !password) {
            return { success: false, message: 'Vui lòng nhập đầy đủ mã nhân viên và mật khẩu!' };
        }
        const results = await query('SELECT * FROM employees WHERE ma_nv = ?', [ma_nv]);
        if (!results || results.length === 0) {
            return { success: false, message: 'Mã nhân viên không tồn tại!' };
        }
        const emp = results[0];
        const defaultPass = emp.password || '123456';
        if (password === defaultPass) {
            return { success: true, data: sanitizeUserResponse(emp) };
        }
        return { success: false, message: 'Mật khẩu không chính xác!' };
    }

    async adminLogin(username, password) {
        if (!username || !password) {
            return { success: false, message: 'Vui lòng nhập tài khoản và mật khẩu quản trị!' };
        }
        const results = await query('SELECT * FROM admins WHERE username = ?', [username]);
        if (!results || results.length === 0) {
            return { success: false, message: 'Tài khoản quản trị không tồn tại!' };
        }
        const admin = results[0];
        if (admin.password === password) {
            return { success: true, data: sanitizeUserResponse(admin) };
        }
        return { success: false, message: 'Mật khẩu quản trị không chính xác!' };
    }

    async adminRegister(username, password, ho_ten) {
        if (!username || !password) {
            return { success: false, message: 'Vui lòng nhập tài khoản và mật khẩu!' };
        }
        const existing = await query('SELECT * FROM admins WHERE username = ?', [username]);
        if (existing && existing.length > 0) {
            return { success: false, message: 'Tên đăng nhập này đã tồn tại!' };
        }
        await query('INSERT INTO admins (username, password, ho_ten) VALUES (?, ?, ?)', [
            username,
            password,
            ho_ten || 'Quản trị viên'
        ]);
        return { success: true };
    }

    async changePassword(ma_nv, old_password, new_password) {
        const results = await query('SELECT password FROM employees WHERE ma_nv = ?', [ma_nv]);
        if (!results || results.length === 0) {
            return { success: false, message: 'Không tìm thấy nhân viên' };
        }
        const currentPass = results[0].password || '123456';
        if (old_password !== currentPass) {
            return { success: false, message: 'Mật khẩu cũ không chính xác' };
        }
        await query('UPDATE employees SET password = ? WHERE ma_nv = ?', [new_password, ma_nv]);
        return { success: true };
    }

    async updateAvatar(ma_nv, avatar_url) {
        await query('UPDATE employees SET avatar_url = ? WHERE ma_nv = ?', [avatar_url, ma_nv]);
        return { success: true };
    }
}

module.exports = new AuthService();
