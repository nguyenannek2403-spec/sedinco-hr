const { query } = require('../config/db');
const { invalidatePermissionCache, logAuditEvent } = require('../middlewares/authMiddleware');

class PermissionService {
    async getAccountantPermissions() {
        const sql = `
            SELECT permission_key, permission_name, category, is_enabled, description, updated_by, updated_at
            FROM accountant_permissions
            ORDER BY category ASC, permission_key ASC
        `;
        const rows = await query(sql);
        return rows || [];
    }

    async updateAccountantPermissions(updatedPermissions, current_user = null) {
        if (!updatedPermissions || typeof updatedPermissions !== 'object') {
            const error = new Error('Dữ liệu phân quyền không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        // Lấy trạng thái hiện tại để ghi audit log so sánh before / after
        const currentRows = await query('SELECT permission_key, is_enabled FROM accountant_permissions');
        const beforeMap = {};
        (currentRows || []).forEach(r => {
            beforeMap[r.permission_key] = Boolean(r.is_enabled);
        });

        const changes = {};
        const updaterId = current_user ? (current_user.username || current_user.ma_nv || 'admin') : 'admin';

        // Xử lý cả dạng Object { [key]: boolean } lẫn Array [ { permission_key, is_enabled } ]
        let entries = [];
        if (Array.isArray(updatedPermissions)) {
            entries = updatedPermissions.map(p => [p.permission_key, Boolean(p.is_enabled)]);
        } else {
            entries = Object.entries(updatedPermissions).map(([k, v]) => [k, Boolean(v)]);
        }

        for (const [key, enabled] of entries) {
            if (beforeMap[key] !== undefined && beforeMap[key] !== enabled) {
                changes[key] = { from: beforeMap[key], to: enabled };
                await query(
                    'UPDATE accountant_permissions SET is_enabled = ?, updated_by = ? WHERE permission_key = ?',
                    [enabled ? 1 : 0, updaterId, key]
                );
            }
        }

        // Vô hiệu hóa cache ngay lập tức để request kế tiếp của Kế toán được áp dụng quyền mới ngay
        invalidatePermissionCache();

        if (Object.keys(changes).length > 0 && current_user) {
            await logAuditEvent({
                actor_id: updaterId,
                actor_role: current_user.role || 'admin',
                action: 'UPDATE_ACCOUNTANT_PERMISSIONS',
                resource: 'permissions',
                details: {
                    changed_count: Object.keys(changes).length,
                    changes
                }
            });
        }

        return { 
            success: true, 
            message: 'Cập nhật cấu hình phân quyền Kế toán thành công!',
            changed_count: Object.keys(changes).length 
        };
    }

    async getAuditLogs(limit = 100) {
        const sql = `
            SELECT id, actor_id, actor_role, action, resource, details, ip_address, created_at
            FROM audit_logs
            ORDER BY created_at DESC
            LIMIT ?
        `;
        const rows = await query(sql, [parseInt(limit, 10) || 100]);
        return rows || [];
    }
}

module.exports = new PermissionService();
