const { query } = require('../config/db');
const { 
    sanitizeUserResponse, 
    resolveUserRole, 
    generateToken, 
    logAuditEvent 
} = require('../middlewares/authMiddleware');

class AuthService {
    async employeeLogin(ma_nv, password, ip_address = '') {
        if (!ma_nv || !password) {
            return { success: false, message: 'Vui lòng nhập đầy đủ mã nhân viên và mật khẩu!' };
        }
        const results = await query('SELECT * FROM employees WHERE ma_nv = ?', [ma_nv]);
        if (!results || results.length === 0) {
            return { success: false, message: 'Mã nhân viên không tồn tại!' };
        }
        const emp = results[0];
        
        // Kiểm tra xem tài khoản có bị tạm khóa bởi Quản trị viên hay không
        if (emp.status === 'inactive' || emp.is_locked === 1 || emp.is_locked === true) {
            return {
                success: false,
                message: 'Tài khoản nhân sự của bạn đã bị TẠM KHÓA bởi Quản trị viên. Vui lòng liên hệ bộ phận Nhân sự hoặc Ban giám đốc!'
            };
        }

        const defaultPass = emp.password || '123456';
        if (password === defaultPass) {
            const role = resolveUserRole(emp);
            const safeEmp = sanitizeUserResponse(emp);
            safeEmp.role = role;
            
            const token = generateToken({
                id: emp.ma_nv,
                ma_nv: emp.ma_nv,
                role: role,
                ho_ten: emp.ho_ten
            });

            await logAuditEvent({
                actor_id: emp.ma_nv,
                actor_role: role,
                action: 'LOGIN_SUCCESS',
                resource: 'auth',
                details: { method: 'employee_login' },
                ip_address
            });

            return { 
                success: true, 
                data: {
                    ...safeEmp,
                    token,
                    role
                }
            };
        }

        await logAuditEvent({
            actor_id: ma_nv,
            actor_role: 'worker',
            action: 'LOGIN_FAILED',
            resource: 'auth',
            details: { reason: 'wrong_password' },
            ip_address
        });

        return { success: false, message: 'Mật khẩu không chính xác!' };
    }

    async adminLogin(username, password, ip_address = '') {
        if (!username || !password) {
            return { success: false, message: 'Vui lòng nhập tài khoản và mật khẩu quản trị!' };
        }
        const results = await query('SELECT * FROM admins WHERE username = ?', [username]);
        if (!results || results.length === 0) {
            return { success: false, message: 'Tài khoản quản trị không tồn tại!' };
        }
        const admin = results[0];
        if (admin.password === password) {
            const safeAdmin = sanitizeUserResponse(admin);
            safeAdmin.role = 'admin';

            const token = generateToken({
                id: admin.id,
                username: admin.username,
                role: 'admin',
                ho_ten: admin.ho_ten
            });

            await logAuditEvent({
                actor_id: admin.username,
                actor_role: 'admin',
                action: 'ADMIN_LOGIN_SUCCESS',
                resource: 'auth',
                details: { method: 'admin_login' },
                ip_address
            });

            return { 
                success: true, 
                data: {
                    ...safeAdmin,
                    token,
                    role: 'admin'
                }
            };
        }

        await logAuditEvent({
            actor_id: username,
            actor_role: 'admin',
            action: 'ADMIN_LOGIN_FAILED',
            resource: 'auth',
            details: { reason: 'wrong_admin_password' },
            ip_address
        });

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

    async changePassword(ma_nv, old_password, new_password, current_user = null) {
        // Kiểm tra quyền: Chỉ chính nhân viên hoặc admin mới được đổi mật khẩu
        if (current_user && current_user.role !== 'admin' && current_user.ma_nv !== ma_nv) {
            return { success: false, message: 'Bạn không có quyền thay đổi mật khẩu của nhân viên khác!' };
        }

        const results = await query('SELECT password FROM employees WHERE ma_nv = ?', [ma_nv]);
        if (!results || results.length === 0) {
            return { success: false, message: 'Không tìm thấy nhân viên' };
        }
        const currentPass = results[0].password || '123456';
        
        // Nếu không phải admin thì bắt buộc phải nhập đúng mật khẩu cũ
        if (!current_user || current_user.role !== 'admin') {
            if (old_password !== currentPass) {
                return { success: false, message: 'Mật khẩu cũ không chính xác!' };
            }
        }

        if (!new_password || new_password.trim().length < 6) {
            return { success: false, message: 'Mật khẩu mới phải có tối thiểu 6 ký tự!' };
        }

        await query('UPDATE employees SET password = ? WHERE ma_nv = ?', [new_password, ma_nv]);

        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : ma_nv,
            actor_role: current_user ? current_user.role : 'worker',
            action: 'CHANGE_PASSWORD',
            resource: 'employees',
            details: { target_ma_nv: ma_nv }
        });

        return { success: true, message: 'Đổi mật khẩu thành công!' };
    }

    async updateAvatar(ma_nv, avatar_url, current_user = null) {
        if (current_user && current_user.role !== 'admin' && current_user.ma_nv !== ma_nv) {
            return { success: false, message: 'Bạn không có quyền cập nhật ảnh đại diện của người khác!' };
        }
        await query('UPDATE employees SET avatar_url = ? WHERE ma_nv = ?', [avatar_url, ma_nv]);
        return { success: true };
    }
}

module.exports = new AuthService();
