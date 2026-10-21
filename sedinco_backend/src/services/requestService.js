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

        // Siết chặt phòng chống gian lận: Giới hạn tối đa 3 lần nộp đơn bổ sung công / quên chấm công trong 1 tháng
        const typeLower = (request_type || '').toLowerCase();
        if (typeLower.includes('cập nhật công') || typeLower.includes('quên chấm công') || typeLower.includes('bổ sung công')) {
            const dateObj = request_date ? new Date(request_date) : new Date();
            const m = dateObj.getMonth() + 1;
            const y = dateObj.getFullYear();
            const cntRows = await query(`
                SELECT COUNT(*) as cnt 
                FROM requests 
                WHERE employee_id = ? 
                  AND (LOWER(request_type) LIKE '%cập nhật công%' OR LOWER(request_type) LIKE '%quên chấm công%' OR LOWER(request_type) LIKE '%bổ sung công%')
                  AND MONTH(request_date) = ? AND YEAR(request_date) = ?
                  AND status != 'cancelled'
            `, [targetId, m, y]);
            const currentCount = (cntRows && cntRows[0]) ? cntRows[0].cnt : 0;
            if (currentCount >= 3) {
                const error = new Error(`Chính sách công ty: Bạn đã nộp tối đa 3 đơn bổ sung công trong Tháng ${m}/${y}! Vui lòng gặp trực tiếp Quản trị viên.`);
                error.statusCode = 400;
                throw error;
            }
        }

        const insertRes = await query(
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

        return { success: true, data: { id: insertRes ? insertRes.insertId : null } };
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

    async createOtPreRegistration({ employee_id, work_date, expected_hours, reason, current_user = null }) {
        if (!current_user) {
            const error = new Error('Yêu cầu đăng nhập!');
            error.statusCode = 401;
            throw error;
        }

        const targetId = (current_user.role === 'worker') ? current_user.ma_nv : (employee_id || current_user.ma_nv);
        const hours = Number(expected_hours);
        if (isNaN(hours) || hours <= 0 || hours > 8) {
            const error = new Error('Số giờ làm thêm dự kiến phải từ 0.5 đến 8.0 giờ/ngày!');
            error.statusCode = 400;
            throw error;
        }

        if (!work_date) {
            const error = new Error('Vui lòng chọn ngày làm thêm giờ!');
            error.statusCode = 400;
            throw error;
        }

        const sql = `
            INSERT INTO ot_registrations (employee_id, work_date, expected_hours, reason, status)
            VALUES (?, ?, ?, ?, 'pending')
            ON DUPLICATE KEY UPDATE 
                expected_hours = VALUES(expected_hours),
                reason = VALUES(reason),
                status = 'pending'
        `;
        const insertRes = await query(sql, [targetId, work_date, hours, reason || '']);
        const otId = insertRes ? insertRes.insertId : null;

        await logAuditEvent({
            actor_id: current_user.ma_nv || current_user.username,
            actor_role: current_user.role,
            action: 'REGISTER_PRE_OT',
            resource: 'ot_registrations',
            details: { employee_id: targetId, work_date, expected_hours: hours, reason }
        });

        return { 
            success: true, 
            message: 'Đăng ký làm thêm giờ thành công, đang chờ quản lý phê duyệt!',
            data: { id: otId, employee_id: targetId, work_date, expected_hours: hours }
        };
    }

    async getOtRegistrations(month, year) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();

        const sql = `
            SELECT o.id, o.employee_id, e.ho_ten, e.chuc_danh, 
                   DATE_FORMAT(o.work_date, '%d/%m/%Y') as work_date_display,
                   o.work_date, o.expected_hours, o.reason, o.approved_by, o.status, o.created_at
            FROM ot_registrations o
            LEFT JOIN employees e ON o.employee_id COLLATE utf8mb4_unicode_ci = e.ma_nv COLLATE utf8mb4_unicode_ci
            WHERE MONTH(o.work_date) = ? AND YEAR(o.work_date) = ?
            ORDER BY o.work_date DESC, o.created_at DESC
        `;
        const rows = await query(sql, [m, y]);
        return rows || [];
    }

    async updateOtRegistrationStatus(id, status, current_user = null) {
        if (!['approved', 'rejected'].includes(status)) {
            const error = new Error('Trạng thái phê duyệt không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        const rows = await query('SELECT * FROM ot_registrations WHERE id = ?', [id]);
        if (!rows || rows.length === 0) {
            const error = new Error('Không tìm thấy đơn đăng ký làm thêm giờ!');
            error.statusCode = 404;
            throw error;
        }

        const reg = rows[0];

        // Ngăn chặn tự duyệt OT của chính mình (Separation of Duties)
        if (current_user && current_user.ma_nv && current_user.ma_nv === reg.employee_id && status === 'approved') {
            const error = new Error('Bảo mật: Bạn không thể tự phê duyệt đơn đăng ký làm thêm giờ của chính mình!');
            error.statusCode = 403;
            throw error;
        }

        const approver = current_user ? (current_user.username || current_user.ma_nv) : 'admin';
        await query('UPDATE ot_registrations SET status = ?, approved_by = ? WHERE id = ?', [status, approver, id]);

        await logAuditEvent({
            actor_id: approver,
            actor_role: current_user ? current_user.role : 'admin',
            action: status === 'approved' ? 'APPROVE_OT_REGISTRATION' : 'REJECT_OT_REGISTRATION',
            resource: 'ot_registrations',
            details: { ot_reg_id: id, employee_id: reg.employee_id, status }
        });

        return { success: true, message: `Cập nhật trạng thái đăng ký OT thành '${status}' thành công!` };
    }
}

module.exports = new RequestService();
