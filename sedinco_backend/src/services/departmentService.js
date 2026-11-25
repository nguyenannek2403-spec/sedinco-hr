const { query, withTransaction } = require('../config/db');
const { logAuditEvent, invalidateUserCache } = require('../middlewares/authMiddleware');

function normalizeDeptName(raw) {
    return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

class DepartmentService {
    async getDefaultDepartmentName() {
        const rows = await query('SELECT name FROM departments WHERE is_default = 1 ORDER BY id ASC LIMIT 1').catch(() => []);
        if (rows && rows[0] && rows[0].name) {
            return String(rows[0].name).trim();
        }
        const firstRows = await query('SELECT name FROM departments ORDER BY id ASC LIMIT 1').catch(() => []);
        if (firstRows && firstRows[0] && firstRows[0].name) {
            return String(firstRows[0].name).trim();
        }
        return 'Khối Văn phòng';
    }

    async getAllDepartments() {
        const sql = `
            SELECT d.id, d.name, d.is_default, d.created_at,
                   COUNT(e.ma_nv) AS employee_count
            FROM departments d
            LEFT JOIN employees e
              ON LOWER(TRIM(e.department)) = LOWER(TRIM(d.name))
            GROUP BY d.id, d.name, d.is_default, d.created_at
            ORDER BY d.is_default DESC, d.id ASC
        `;
        const rows = await query(sql);
        return (rows || []).map((r) => ({
            id: Number(r.id),
            name: String(r.name || '').trim(),
            is_default: Number(r.is_default) === 1 ? 1 : 0,
            employee_count: Number(r.employee_count) || 0,
            created_at: r.created_at || null
        }));
    }

    async createDepartment(name, current_user = null) {
        const cleanName = normalizeDeptName(name);
        if (!cleanName) {
            const err = new Error('Vui lòng nhập tên khối / bộ phận!');
            err.statusCode = 400;
            throw err;
        }
        const dup = await query(
            'SELECT id, name FROM departments WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1',
            [cleanName]
        );
        if (dup && dup.length > 0) {
            const err = new Error(`Tên khối / bộ phận "${cleanName}" đã tồn tại trong hệ thống!`);
            err.statusCode = 400;
            throw err;
        }
        const res = await query(
            'INSERT INTO departments (name, is_default) VALUES (?, 0)',
            [cleanName]
        );
        const created = {
            id: Number(res?.insertId),
            name: cleanName,
            is_default: 0,
            employee_count: 0
        };
        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'CREATE_DEPARTMENT',
            resource: 'departments',
            details: created
        });
        return created;
    }

    async updateDepartment(id, name, current_user = null) {
        const cleanId = Number(id);
        const cleanName = normalizeDeptName(name);
        if (!cleanId || !cleanName) {
            const err = new Error('Thông tin cập nhật khối / bộ phận không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }

        const result = await withTransaction(async (txQuery) => {
            const rows = await txQuery(
                'SELECT id, name, is_default FROM departments WHERE id = ? FOR UPDATE',
                [cleanId]
            );
            if (!rows || rows.length === 0) {
                const err = new Error('Không tìm thấy khối / bộ phận cần chỉnh sửa!');
                err.statusCode = 404;
                throw err;
            }
            const existing = rows[0];
            const dup = await txQuery(
                'SELECT id FROM departments WHERE LOWER(TRIM(name)) = LOWER(?) AND id != ? LIMIT 1',
                [cleanName, cleanId]
            );
            if (dup && dup.length > 0) {
                const err = new Error(`Tên khối / bộ phận "${cleanName}" đã tồn tại trong hệ thống!`);
                err.statusCode = 400;
                throw err;
            }

            await txQuery('UPDATE departments SET name = ? WHERE id = ?', [cleanName, cleanId]);
            const upd = await txQuery(
                'UPDATE employees SET department = ? WHERE LOWER(TRIM(department)) = LOWER(TRIM(?))',
                [cleanName, existing.name]
            );
            return {
                id: cleanId,
                name: cleanName,
                is_default: Number(existing.is_default) === 1 ? 1 : 0,
                old_name: existing.name,
                updated_employees: Number(upd?.affectedRows || 0)
            };
        });

        invalidateUserCache();
        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'UPDATE_DEPARTMENT',
            resource: 'departments',
            details: result
        });
        return result;
    }

    async deleteDepartment(id, current_user = null) {
        const cleanId = Number(id);
        if (!cleanId) {
            const err = new Error('Mã khối / bộ phận không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }

        const result = await withTransaction(async (txQuery) => {
            const rows = await txQuery(
                'SELECT id, name, is_default FROM departments WHERE id = ? FOR UPDATE',
                [cleanId]
            );
            if (!rows || rows.length === 0) {
                const err = new Error('Không tìm thấy khối / bộ phận cần xóa!');
                err.statusCode = 404;
                throw err;
            }
            const target = rows[0];
            if (Number(target.is_default) === 1) {
                const err = new Error(
                    'Đây là khối chính mặc định của hệ thống nên không thể xóa, bạn chỉ có thể chỉnh sửa tên khối này.'
                );
                err.statusCode = 400;
                throw err;
            }

            const defRows = await txQuery(
                'SELECT id, name FROM departments WHERE is_default = 1 AND id != ? ORDER BY id ASC LIMIT 1',
                [cleanId]
            );
            if (!defRows || defRows.length === 0) {
                const err = new Error('Không tìm thấy khối chính mặc định để tiếp nhận nhân viên!');
                err.statusCode = 400;
                throw err;
            }
            const defaultName = String(defRows[0].name).trim();

            const upd = await txQuery(
                'UPDATE employees SET department = ? WHERE LOWER(TRIM(department)) = LOWER(TRIM(?))',
                [defaultName, target.name]
            );
            await txQuery('DELETE FROM departments WHERE id = ?', [cleanId]);

            return {
                success: true,
                moved_employees: Number(upd?.affectedRows || 0),
                default_department: defaultName,
                deleted_department: target.name
            };
        });

        invalidateUserCache();
        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'DELETE_DEPARTMENT',
            resource: 'departments',
            details: result
        });
        return result;
    }
}

module.exports = new DepartmentService();
