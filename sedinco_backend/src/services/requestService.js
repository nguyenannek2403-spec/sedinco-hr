const { query } = require('../config/db');
const attendanceService = require('./attendanceService');
const { logAuditEvent } = require('../middlewares/authMiddleware');

class RequestService {
    async getAllRequests() {
        const sql = `
            SELECT r.id, r.employee_id as ma_nv, e.ho_ten, r.request_type as type, 
                   DATE_FORMAT(r.request_date, '%d/%m/%Y') as date, r.reason, r.status 
            FROM requests r 
            LEFT JOIN employees e ON r.employee_id = e.ma_nv 
            ORDER BY r.created_at DESC
        `;
        const results = await query(sql);
        return results || [];
    }

    async getMyRequests(employee_id) {
        if (!employee_id) return [];
        const sql = `
            SELECT r.id, r.employee_id as ma_nv, e.ho_ten, r.request_type as type, 
                   DATE_FORMAT(r.request_date, '%d/%m/%Y') as date, r.reason, r.status 
            FROM requests r 
            LEFT JOIN employees e ON r.employee_id = e.ma_nv 
            WHERE r.employee_id = ?
            ORDER BY r.created_at DESC
        `;
        const results = await query(sql, [employee_id]);
        return results || [];
    }

    async createRequest({ employee_id, request_type, request_date, reason, current_user = null }) {
        // Nếu là worker, bắt buộc employee_id phải là của chính mình
        const targetId = (current_user && current_user.role === 'worker') ? current_user.ma_nv : employee_id;

        // Kiểm tra xem nhân viên có đang bị TẠM KHÓA tài khoản không
        if (targetId) {
            const empCheck = await query('SELECT is_locked, status FROM employees WHERE ma_nv = ?', [targetId]);
            if (empCheck && empCheck.length > 0) {
                const emp = empCheck[0];
                if (emp.status === 'inactive' || emp.is_locked === 1 || emp.is_locked === true) {
                    const error = new Error(`Tài khoản nhân viên ${targetId} đang bị TẠM KHÓA. Không thể tạo đơn!`);
                    error.statusCode = 403;
                    throw error;
                }
            }
        }

        await query(
            'INSERT INTO requests (employee_id, request_type, request_date, reason) VALUES (?, ?, ?, ?)',
            [targetId, request_type, request_date, reason]
        );

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || targetId,
                actor_role: current_user.role || 'worker',
                action: 'CREATE_REQUEST',
                resource: 'requests',
                details: { target_id: targetId, request_type, request_date }
            });
        }

        return { success: true };
    }

    async updateRequestStatus(reqId, status, current_user = null) {
        const results = await query('SELECT * FROM requests WHERE id = ?', [reqId]);
        if (!results || results.length === 0) {
            const error = new Error('Không tìm thấy đơn từ yêu cầu!');
            error.statusCode = 404;
            throw error;
        }

        const reqData = results[0];

        // 1. Ngăn chặn tự phê duyệt đơn của chính mình (Separation of Duties - 403 Forbidden)
        if (current_user && current_user.ma_nv && current_user.ma_nv === reqData.employee_id) {
            if (status === 'approved') {
                const error = new Error('Bảo mật: Bạn không thể tự phê duyệt đơn từ của chính mình!');
                error.statusCode = 403;
                throw error;
            }
        }

        // 2. Kiểm tra trạng thái hiện tại: Chỉ cho phép xử lý khi đơn đang ở trạng thái 'pending' (400 Bad Request)
        if (reqData.status !== 'pending') {
            const error = new Error(`Đơn từ này đã được xử lý (trạng thái: '${reqData.status}'). Không thể cập nhật lại!`);
            error.statusCode = 400;
            throw error;
        }

        if (status === 'approved') {
            const dateObj = new Date(reqData.request_date);
            const year = dateObj.getFullYear();
            const month = dateObj.getMonth() + 1;

            // Kiểm tra xem kỳ công của ngày này có bị khóa sổ không
            const isLocked = await attendanceService.isPeriodLocked(month, year);
            if (isLocked) {
                const error = new Error(`Kỳ công Tháng ${month}/${year} đã bị KHÓA SỔ. Không thể duyệt đơn làm thay đổi công!`);
                error.statusCode = 400;
                throw error;
            }
        }

        await query('UPDATE requests SET status = ? WHERE id = ?', [status, reqId]);

        if (status === 'approved') {
            const dateObj = new Date(reqData.request_date);
            const year = dateObj.getFullYear();
            const month = dateObj.getMonth() + 1;
            const day = dateObj.getDate();
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const type = (reqData.request_type || '').toLowerCase();

            if (type.includes('làm thêm') || type.includes('công tác') || type.includes('ot')) {
                const logRes = await query('SELECT status FROM attendance_logs WHERE employee_id = ? AND record_date = ?', [reqData.employee_id, dateStr]);
                let newStatus = 'OT';
                if (logRes && logRes.length > 0 && logRes[0].status === '1') {
                    newStatus = '1/OT';
                }
                const upsertQuery = `INSERT INTO attendance_logs (employee_id, record_date, status, ot_hours) VALUES (?, ?, ?, 4) ON DUPLICATE KEY UPDATE status = ?`;
                await query(upsertQuery, [reqData.employee_id, dateStr, newStatus, newStatus]);
            } else if (type.includes('phép')) {
                const upsertQuery = `INSERT INTO attendance_logs (employee_id, record_date, status) VALUES (?, ?, 'P') ON DUPLICATE KEY UPDATE status = 'P'`;
                await query(upsertQuery, [reqData.employee_id, dateStr]);
            } else if (type.includes('cập nhật công')) {
                const upsertQuery = `INSERT INTO attendance_logs (employee_id, record_date, status) VALUES (?, ?, '1') ON DUPLICATE KEY UPDATE status = '1'`;
                await query(upsertQuery, [reqData.employee_id, dateStr]);
            }
        } else if (status === 'rejected') {
            const dateObj = new Date(reqData.request_date);
            const year = dateObj.getFullYear();
            const month = dateObj.getMonth() + 1;
            const day = dateObj.getDate();
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const type = (reqData.request_type || '').toLowerCase();

            const isHalfDay = type.includes('nửa ngày') || type.includes('0.5') || type.includes('buổi');
            const absentStatus = isHalfDay ? '0.5' : 'V';
            const upsertQuery = `INSERT INTO attendance_logs (employee_id, record_date, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = ?`;
            await query(upsertQuery, [reqData.employee_id, dateStr, absentStatus, absentStatus]);
        }

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'unknown',
                actor_role: current_user.role || 'unknown',
                action: status === 'approved' ? 'APPROVE_REQUEST' : 'REJECT_REQUEST',
                resource: 'requests',
                details: { request_id: reqId, target_employee: reqData.employee_id, status }
            });
        }

        return { success: true };
    }

    async cancelRequest(reqId, current_user = null) {
        if (!current_user) {
            const error = new Error('Yêu cầu đăng nhập để hủy đơn!');
            error.statusCode = 401;
            throw error;
        }

        const results = await query('SELECT * FROM requests WHERE id = ?', [reqId]);
        if (!results || results.length === 0) {
            const error = new Error('Không tìm thấy đơn từ yêu cầu!');
            error.statusCode = 404;
            throw error;
        }

        const reqData = results[0];

        // Quyền sở hữu: Chỉ người tạo đơn hoặc Admin mới được hủy
        if (current_user.role !== 'admin' && current_user.ma_nv !== reqData.employee_id) {
            const error = new Error('Bảo mật: Bạn không có quyền hủy đơn từ của nhân viên khác!');
            error.statusCode = 403;
            throw error;
        }

        // Chỉ được hủy đơn khi còn ở trạng thái 'pending'
        if (reqData.status !== 'pending') {
            const error = new Error(`Chỉ có thể hủy đơn đang ở trạng thái 'pending'. Đơn này hiện là '${reqData.status}'!`);
            error.statusCode = 400;
            throw error;
        }

        await query("UPDATE requests SET status = 'cancelled' WHERE id = ?", [reqId]);

        await logAuditEvent({
            actor_id: current_user.ma_nv || current_user.username,
            actor_role: current_user.role,
            action: 'CANCEL_REQUEST',
            resource: 'requests',
            details: { request_id: reqId, target_employee: reqData.employee_id }
        });

        return { success: true, message: 'Hủy đơn thành công!' };
    }
}

module.exports = new RequestService();
