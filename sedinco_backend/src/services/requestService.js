const { query, withTransaction } = require('../config/db');
const attendanceService = require('./attendanceService');
const { logAuditEvent } = require('../middlewares/authMiddleware');

function classifyRequestCategory(requestType) {
    const t = String(requestType || '').trim().toLowerCase();
    if (!t) return 'OTHER';
    if (
        t === 'ot' ||
        t.includes('overtime') ||
        t.includes('tăng ca') ||
        t.includes('làm thêm') ||
        t.includes('công tác')
    ) {
        return 'OVERTIME';
    }
    if (
        t === 'ct' ||
        t.includes('compensation') ||
        t.includes('cập nhật công') ||
        t.includes('quên chấm công') ||
        t.includes('bổ sung') ||
        t.includes('giờ ra') ||
        t.includes('forgot_checkin') ||
        t.includes('late_early')
    ) {
        return 'ATTENDANCE_COMPENSATION';
    }
    if (
        t === 'p' ||
        t === 'leave' ||
        t.includes('leave') ||
        t.includes('phép') ||
        t.includes('nghỉ')
    ) {
        return 'LEAVE';
    }
    return 'OTHER';
}

function normalizeIsoDate(raw) {
    if (!raw) return null;
    const str = String(raw).trim();
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const y = Number(isoMatch[1]);
        const m = Number(isoMatch[2]);
        const d = Number(isoMatch[3]);
        const dt = new Date(Date.UTC(y, m - 1, d));
        if (dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d) {
            return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
        }
        return null;
    }
    const dmyMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmyMatch) {
        const d = Number(dmyMatch[1]);
        const m = Number(dmyMatch[2]);
        const y = Number(dmyMatch[3]);
        const dt = new Date(Date.UTC(y, m - 1, d));
        if (dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d) {
            return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
        }
    }
    return null;
}

function expandDateRange(fromIso, toIso) {
    if (!fromIso) return [];
    if (!toIso || toIso === fromIso) return [fromIso];
    const start = new Date(`${fromIso}T00:00:00Z`);
    const end = new Date(`${toIso}T00:00:00Z`);
    if (end < start) return [];
    const diffDays = Math.round((end - start) / 86400000);
    if (diffDays > 31) return null; // Giới hạn an toàn tối đa 31 ngày/đơn
    const list = [];
    for (let i = 0; i <= diffDays; i++) {
        const cur = new Date(start.getTime() + i * 86400000);
        const y = cur.getUTCFullYear();
        const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
        const d = String(cur.getUTCDate()).padStart(2, '0');
        list.push(`${y}-${m}-${d}`);
    }
    return list;
}

class RequestService {
    async getAllRequests(pagination = {}) {
        const limit = Math.min(200, Math.max(1, parseInt(pagination.limit, 10) || 100));
        const page = Math.max(1, parseInt(pagination.page, 10) || 1);
        const offset = (page - 1) * limit;

        const sql = `
            SELECT r.id, r.employee_id as ma_nv, e.ho_ten, r.request_type as type, 
                   DATE_FORMAT(r.request_date, '%d/%m/%Y') as date, r.reason, r.status, r.created_at
            FROM requests r 
            LEFT JOIN employees e ON r.employee_id = e.ma_nv 
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT ? OFFSET ?
        `;
        const results = await query(sql, [limit, offset]);
        return results || [];
    }

    async getMyRequests(employee_id, pagination = {}) {
        if (!employee_id) return [];
        const limit = Math.min(200, Math.max(1, parseInt(pagination.limit, 10) || 100));
        const page = Math.max(1, parseInt(pagination.page, 10) || 1);
        const offset = (page - 1) * limit;

        const sql = `
            SELECT r.id, r.employee_id as ma_nv, e.ho_ten, r.request_type as type, 
                   DATE_FORMAT(r.request_date, '%d/%m/%Y') as date, r.reason, r.status, r.created_at
            FROM requests r 
            LEFT JOIN employees e ON r.employee_id = e.ma_nv 
            WHERE r.employee_id = ?
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT ? OFFSET ?
        `;
        const results = await query(sql, [employee_id, limit, offset]);
        return results || [];
    }

    async createRequest({ employee_id, request_type, request_date, from_date, to_date, reason, current_user = null }) {
        // Chỉ Admin mới được tạo đơn hộ nhân viên khác
        const targetId = (current_user && current_user.role !== 'admin')
            ? current_user.ma_nv
            : (employee_id || current_user?.ma_nv);

        if (!targetId) {
            const error = new Error('Thiếu mã nhân viên nộp đơn!');
            error.statusCode = 400;
            throw error;
        }

        const cleanType = String(request_type || '').trim().slice(0, 50);
        if (!cleanType) {
            const error = new Error('Vui lòng chọn loại đơn từ!');
            error.statusCode = 400;
            throw error;
        }

        const startIso = normalizeIsoDate(from_date || request_date);
        const endIso = normalizeIsoDate(to_date || from_date || request_date);
        if (!startIso || !endIso) {
            const error = new Error('Ngày nộp đơn không hợp lệ (định dạng chuẩn YYYY-MM-DD)!');
            error.statusCode = 400;
            throw error;
        }

        const datesList = expandDateRange(startIso, endIso);
        if (datesList === null) {
            const error = new Error('Khoảng ngày xin nghỉ trong một đơn không được vượt quá 31 ngày!');
            error.statusCode = 400;
            throw error;
        }
        if (datesList.length === 0) {
            const error = new Error('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu!');
            error.statusCode = 400;
            throw error;
        }

        const cleanReason = String(reason || '').trim().slice(0, 1000);
        const reqCategory = classifyRequestCategory(cleanType);

        // Kiểm tra kỳ công đã khóa cho từng tháng trong khoảng ngày đơn
        const checkedMonths = new Set();
        for (const iso of datesList) {
            const [yStr, mStr] = iso.split('-');
            const ymKey = `${yStr}-${mStr}`;
            if (!checkedMonths.has(ymKey)) {
                checkedMonths.add(ymKey);
                const isLocked = await attendanceService.isPeriodLocked(Number(mStr), Number(yStr));
                if (isLocked) {
                    const error = new Error(`Kỳ công Tháng ${Number(mStr)}/${yStr} đã bị KHÓA SỔ. Không thể gửi đơn vào tháng đã khóa!`);
                    error.statusCode = 400;
                    error.code = 'PERIOD_LOCKED';
                    throw error;
                }
            }
        }

        const txResult = await withTransaction(async (txQuery) => {
            // Khóa dòng nhân viên để serialize mọi request tạo đơn đồng thời của cùng 1 người
            const empRows = await txQuery(
                'SELECT is_locked, status FROM employees WHERE ma_nv = ? FOR UPDATE',
                [targetId]
            );
            if (!empRows || empRows.length === 0) {
                const error = new Error(`Không tìm thấy nhân viên ${targetId}!`);
                error.statusCode = 404;
                throw error;
            }
            const emp = empRows[0];
            if (emp.status === 'inactive' || emp.is_locked === 1 || emp.is_locked === true) {
                const error = new Error(`Tài khoản nhân viên ${targetId} đang bị TẠM KHÓA. Không thể tạo đơn!`);
                error.statusCode = 403;
                throw error;
            }

            // Kiểm tra khóa sổ trong transaction (chống race với lock-period)
            for (const ymKey of checkedMonths) {
                const [yStr, mStr] = ymKey.split('-');
                const lockRows = await txQuery(
                    'SELECT is_locked FROM period_locks WHERE month = ? AND year = ? LIMIT 1',
                    [Number(mStr), Number(yStr)]
                );
                if (lockRows && lockRows.length > 0 && Boolean(lockRows[0].is_locked)) {
                    const error = new Error(`Kỳ công Tháng ${Number(mStr)}/${yStr} đã bị KHÓA SỔ. Không thể gửi đơn!`);
                    error.statusCode = 400;
                    error.code = 'PERIOD_LOCKED';
                    throw error;
                }
            }

            // Kiểm tra trùng ngày / chồng lấn khoảng ngày với các đơn đang pending hoặc approved
            const placeholders = datesList.map(() => '?').join(',');
            const existingSameDates = await txQuery(
                `SELECT id, request_type, status, DATE_FORMAT(request_date, '%Y-%m-%d') as req_date
                 FROM requests
                 WHERE employee_id = ?
                   AND request_date IN (${placeholders})
                   AND status IN ('pending', 'approved')
                 FOR UPDATE`,
                [targetId, ...datesList]
            );

            for (const row of existingSameDates || []) {
                const existingCat = classifyRequestCategory(row.request_type);
                const isConflict =
                    existingCat === reqCategory ||
                    (reqCategory === 'OTHER' && String(row.request_type || '').toLowerCase() === cleanType.toLowerCase());

                if (isConflict) {
                    const error = new Error('Bạn đã có đơn cho ngày này đang chờ duyệt hoặc đã được duyệt, không thể gửi trùng!');
                    error.statusCode = 409;
                    error.code = 'DUPLICATE_REQUEST';
                    throw error;
                }
            }

            // Giới hạn tối đa 3 lần nộp đơn bổ sung công / quên chấm công trong 1 tháng
            if (reqCategory === 'ATTENDANCE_COMPENSATION') {
                const [yStr, mStr] = datesList[0].split('-');
                const cntRows = await txQuery(`
                    SELECT COUNT(*) as cnt 
                    FROM requests 
                    WHERE employee_id = ? 
                      AND (LOWER(request_type) LIKE '%cập nhật công%' OR LOWER(request_type) LIKE '%quên chấm công%' OR LOWER(request_type) LIKE '%bổ sung%')
                      AND MONTH(request_date) = ? AND YEAR(request_date) = ?
                      AND status != 'cancelled'
                `, [targetId, Number(mStr), Number(yStr)]);
                const currentCount = (cntRows && cntRows[0]) ? Number(cntRows[0].cnt) : 0;
                if (currentCount + datesList.length > 3) {
                    const error = new Error(`Chính sách công ty: Bạn đã nộp tối đa 3 đơn bổ sung công trong Tháng ${Number(mStr)}/${yStr}! Vui lòng gặp trực tiếp Quản trị viên.`);
                    error.statusCode = 400;
                    throw error;
                }
            }

            const insertedIds = [];
            for (const iso of datesList) {
                const insertRes = await txQuery(
                    'INSERT INTO requests (employee_id, request_type, request_date, reason, status) VALUES (?, ?, ?, ?, ?)',
                    [targetId, cleanType, iso, cleanReason, 'pending']
                );
                if (insertRes && insertRes.insertId) {
                    insertedIds.push(insertRes.insertId);
                }
            }

            return { id: insertedIds[0] || null, ids: insertedIds, dates: datesList };
        });

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || targetId,
                actor_role: current_user.role || 'worker',
                action: 'CREATE_REQUEST',
                resource: 'requests',
                details: { target_id: targetId, request_type: cleanType, request_date: startIso, days_count: datesList.length }
            });
        }

        return { success: true, data: txResult };
    }

    async updateRequestStatus(reqId, status, current_user = null) {
        const normalizedStatus = String(status || '').trim().toLowerCase();
        if (!['approved', 'rejected'].includes(normalizedStatus)) {
            const error = new Error('Trạng thái xử lý đơn chỉ chấp nhận approved hoặc rejected!');
            error.statusCode = 400;
            throw error;
        }

        const actorId = current_user ? (current_user.ma_nv || current_user.username) : null;

        const reqData = await withTransaction(async (txQuery) => {
            const results = await txQuery('SELECT * FROM requests WHERE id = ? FOR UPDATE', [reqId]);
            if (!results || results.length === 0) {
                const error = new Error('Không tìm thấy đơn từ yêu cầu!');
                error.statusCode = 404;
                throw error;
            }

            const row = results[0];

            // 1. Ngăn chặn tự phê duyệt đơn của chính mình (Separation of Duties - 403 Forbidden)
            if (actorId && actorId === row.employee_id && normalizedStatus === 'approved') {
                const error = new Error('Bảo mật: Bạn không thể tự phê duyệt đơn từ của chính mình!');
                error.statusCode = 403;
                throw error;
            }

            // 2. Chống duyệt 2 lần (Double-Approval Guard)
            if (String(row.status || '').toLowerCase() !== 'pending') {
                const error = new Error(`Đơn từ này đã được xử lý (trạng thái: '${row.status}'). Không thể duyệt lại!`);
                error.statusCode = 409;
                error.code = 'ALREADY_PROCESSED';
                throw error;
            }

            const dateObj = new Date(row.request_date);
            const year = dateObj.getFullYear();
            const month = dateObj.getMonth() + 1;
            const day = dateObj.getDate();
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            // 3. Kiểm tra xem kỳ công của ngày này có bị khóa sổ không
            const lockRows = await txQuery(
                'SELECT is_locked FROM period_locks WHERE month = ? AND year = ? LIMIT 1',
                [month, year]
            );
            if (lockRows && lockRows.length > 0 && Boolean(lockRows[0].is_locked)) {
                const error = new Error(`Kỳ công Tháng ${month}/${year} đã bị KHÓA SỔ. Không thể duyệt đơn làm thay đổi công!`);
                error.statusCode = 400;
                error.code = 'PERIOD_LOCKED';
                throw error;
            }

            const updateRes = await txQuery(
                "UPDATE requests SET status = ? WHERE id = ? AND status = 'pending'",
                [normalizedStatus, reqId]
            );
            if (!updateRes || updateRes.affectedRows === 0) {
                const error = new Error('Đơn từ này vừa được xử lý trước đó!');
                error.statusCode = 409;
                error.code = 'ALREADY_PROCESSED';
                throw error;
            }

            const type = (row.request_type || '').toLowerCase();

            if (normalizedStatus === 'approved') {
                if (type.includes('làm thêm') || type.includes('tăng ca') || type.includes('công tác') || type.includes('ot') || type.includes('overtime')) {
                    const logRes = await txQuery(
                        'SELECT status FROM attendance_logs WHERE employee_id = ? AND record_date = ? FOR UPDATE',
                        [row.employee_id, dateStr]
                    );
                    let newStatus = 'OT';
                    if (logRes && logRes.length > 0 && logRes[0].status === '1') {
                        newStatus = '1/OT';
                    }
                    await txQuery(
                        `INSERT INTO attendance_logs (employee_id, record_date, status, ot_hours)
                         VALUES (?, ?, ?, 4)
                         ON DUPLICATE KEY UPDATE status = ?, ot_hours = GREATEST(IFNULL(ot_hours, 0), 4)`,
                        [row.employee_id, dateStr, newStatus, newStatus]
                    );
                    await txQuery(
                        `INSERT INTO ot_registrations (employee_id, work_date, expected_hours, reason, approved_by, status)
                         VALUES (?, ?, 4, ?, ?, 'approved')
                         ON DUPLICATE KEY UPDATE status = 'approved', approved_by = VALUES(approved_by)`,
                        [row.employee_id, dateStr, row.reason || 'Duyệt từ đơn tăng ca', actorId || 'admin']
                    );
                } else if (type.includes('nửa ngày') || type.includes('0.5')) {
                    await txQuery(
                        `INSERT INTO attendance_logs (employee_id, record_date, status)
                         VALUES (?, ?, '0.5')
                         ON DUPLICATE KEY UPDATE status = '0.5'`,
                        [row.employee_id, dateStr]
                    );
                } else if (type === 'p' || type === 'leave' || type.includes('phép') || type.includes('nghỉ') || type.includes('leave_annual')) {
                    await txQuery(
                        `INSERT INTO attendance_logs (employee_id, record_date, status)
                         VALUES (?, ?, 'P')
                         ON DUPLICATE KEY UPDATE status = 'P'`,
                        [row.employee_id, dateStr]
                    );
                } else if (type === 'ct' || type.includes('cập nhật công') || type.includes('bổ sung') || type.includes('quên chấm công') || type.includes('giờ ra') || type.includes('forgot_checkin') || type.includes('late_early')) {
                    await txQuery(
                        `INSERT INTO attendance_logs (employee_id, record_date, status, check_out_time)
                         VALUES (?, ?, '1', '17:30:00')
                         ON DUPLICATE KEY UPDATE status = '1', check_out_time = COALESCE(NULLIF(check_out_time, ''), '17:30:00')`,
                        [row.employee_id, dateStr]
                    );
                }
            } else if (normalizedStatus === 'rejected') {
                const isHalfDay = type.includes('nửa ngày') || type.includes('0.5') || type.includes('buổi');
                const absentStatus = isHalfDay ? '0.5' : 'V';
                await txQuery(
                    `INSERT INTO attendance_logs (employee_id, record_date, status)
                     VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE status = ?`,
                    [row.employee_id, dateStr, absentStatus, absentStatus]
                );
            }

            return row;
        });

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'unknown',
                actor_role: current_user.role || 'unknown',
                action: normalizedStatus === 'approved' ? 'APPROVE_REQUEST' : 'REJECT_REQUEST',
                resource: 'requests',
                details: { request_id: reqId, target_employee: reqData.employee_id, status: normalizedStatus }
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

        const reqData = await withTransaction(async (txQuery) => {
            const results = await txQuery('SELECT * FROM requests WHERE id = ? FOR UPDATE', [reqId]);
            if (!results || results.length === 0) {
                const error = new Error('Không tìm thấy đơn từ yêu cầu!');
                error.statusCode = 404;
                throw error;
            }

            const row = results[0];

            // Quyền sở hữu: Chỉ người tạo đơn hoặc Admin mới được hủy
            if (current_user.role !== 'admin' && current_user.ma_nv !== row.employee_id) {
                const error = new Error('Bảo mật: Bạn không có quyền hủy đơn từ của nhân viên khác!');
                error.statusCode = 403;
                throw error;
            }

            // Chỉ được hủy đơn khi còn ở trạng thái 'pending'
            if (String(row.status || '').toLowerCase() !== 'pending') {
                const error = new Error(`Chỉ có thể hủy đơn đang ở trạng thái 'pending'. Đơn này hiện là '${row.status}'!`);
                error.statusCode = 400;
                throw error;
            }

            await txQuery("UPDATE requests SET status = 'cancelled' WHERE id = ? AND status = 'pending'", [reqId]);
            return row;
        });

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

        const targetId = (current_user.role !== 'admin')
            ? current_user.ma_nv
            : (employee_id || current_user.ma_nv);
        const hours = Number(expected_hours);
        if (isNaN(hours) || hours <= 0 || hours > 8) {
            const error = new Error('Số giờ làm thêm dự kiến phải từ 0.5 đến 8.0 giờ/ngày!');
            error.statusCode = 400;
            throw error;
        }

        const cleanDate = normalizeIsoDate(work_date);
        if (!cleanDate) {
            const error = new Error('Vui lòng chọn ngày làm thêm giờ hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        const [yStr, mStr] = cleanDate.split('-');
        const isLocked = await attendanceService.isPeriodLocked(Number(mStr), Number(yStr));
        if (isLocked) {
            const error = new Error(`Kỳ công Tháng ${Number(mStr)}/${yStr} đã bị KHÓA SỔ. Không thể đăng ký OT!`);
            error.statusCode = 400;
            error.code = 'PERIOD_LOCKED';
            throw error;
        }

        const otId = await withTransaction(async (txQuery) => {
            const existing = await txQuery(
                "SELECT id, status FROM ot_registrations WHERE employee_id = ? AND work_date = ? AND status IN ('pending', 'approved') FOR UPDATE",
                [targetId, cleanDate]
            );
            if (existing && existing.length > 0) {
                const error = new Error('Bạn đã có đơn đăng ký làm thêm giờ cho ngày này đang chờ duyệt hoặc đã được duyệt!');
                error.statusCode = 409;
                error.code = 'DUPLICATE_REQUEST';
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
            const insertRes = await txQuery(sql, [targetId, cleanDate, hours, String(reason || '').trim().slice(0, 500)]);
            return insertRes ? insertRes.insertId : null;
        });

        await logAuditEvent({
            actor_id: current_user.ma_nv || current_user.username,
            actor_role: current_user.role,
            action: 'REGISTER_PRE_OT',
            resource: 'ot_registrations',
            details: { employee_id: targetId, work_date: cleanDate, expected_hours: hours, reason }
        });

        return { 
            success: true, 
            message: 'Đăng ký làm thêm giờ thành công, đang chờ quản lý phê duyệt!',
            data: { id: otId, employee_id: targetId, work_date: cleanDate, expected_hours: hours }
        };
    }

    async getOtRegistrations(month, year, pagination = {}) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();
        const limit = Math.min(200, Math.max(1, parseInt(pagination.limit, 10) || 100));
        const page = Math.max(1, parseInt(pagination.page, 10) || 1);
        const offset = (page - 1) * limit;

        const sql = `
            SELECT o.id, o.employee_id, e.ho_ten, e.chuc_danh, 
                   DATE_FORMAT(o.work_date, '%d/%m/%Y') as work_date_display,
                   o.work_date, o.expected_hours, o.reason, o.approved_by, o.status, o.created_at
            FROM ot_registrations o
            LEFT JOIN employees e ON o.employee_id COLLATE utf8mb4_unicode_ci = e.ma_nv COLLATE utf8mb4_unicode_ci
            WHERE MONTH(o.work_date) = ? AND YEAR(o.work_date) = ?
            ORDER BY o.work_date DESC, o.created_at DESC
            LIMIT ? OFFSET ?
        `;
        const rows = await query(sql, [m, y, limit, offset]);
        return rows || [];
    }

    async updateOtRegistrationStatus(id, status, current_user = null) {
        const normalizedStatus = String(status || '').trim().toLowerCase();
        if (!['approved', 'rejected'].includes(normalizedStatus)) {
            const error = new Error('Trạng thái phê duyệt không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        const approver = current_user ? (current_user.username || current_user.ma_nv) : 'admin';

        const reg = await withTransaction(async (txQuery) => {
            const rows = await txQuery('SELECT * FROM ot_registrations WHERE id = ? FOR UPDATE', [id]);
            if (!rows || rows.length === 0) {
                const error = new Error('Không tìm thấy đơn đăng ký làm thêm giờ!');
                error.statusCode = 404;
                throw error;
            }

            const row = rows[0];

            // Ngăn chặn tự duyệt OT của chính mình (Separation of Duties)
            if (current_user && current_user.ma_nv && current_user.ma_nv === row.employee_id && normalizedStatus === 'approved') {
                const error = new Error('Bảo mật: Bạn không thể tự phê duyệt đơn đăng ký làm thêm giờ của chính mình!');
                error.statusCode = 403;
                throw error;
            }

            if (String(row.status || '').toLowerCase() !== 'pending') {
                const error = new Error(`Đơn đăng ký OT này đã được xử lý (trạng thái: '${row.status}')!`);
                error.statusCode = 409;
                error.code = 'ALREADY_PROCESSED';
                throw error;
            }

            if (row.work_date) {
                const dObj = new Date(row.work_date);
                const m = dObj.getMonth() + 1;
                const y = dObj.getFullYear();
                const lockRows = await txQuery('SELECT is_locked FROM period_locks WHERE month = ? AND year = ? LIMIT 1', [m, y]);
                if (lockRows && lockRows.length > 0 && Boolean(lockRows[0].is_locked)) {
                    const error = new Error(`Kỳ công Tháng ${m}/${y} đã bị KHÓA SỔ. Không thể duyệt đơn OT!`);
                    error.statusCode = 400;
                    error.code = 'PERIOD_LOCKED';
                    throw error;
                }
            }

            const upd = await txQuery(
                "UPDATE ot_registrations SET status = ?, approved_by = ? WHERE id = ? AND status = 'pending'",
                [normalizedStatus, approver, id]
            );
            if (!upd || upd.affectedRows === 0) {
                const error = new Error('Đơn OT này đã được xử lý trước đó!');
                error.statusCode = 409;
                throw error;
            }

            if (normalizedStatus === 'approved' && row.work_date) {
                const dObj = new Date(row.work_date);
                const dateStr = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
                const logRes = await txQuery('SELECT status FROM attendance_logs WHERE employee_id = ? AND record_date = ? FOR UPDATE', [row.employee_id, dateStr]);
                let newStatus = 'OT';
                if (logRes && logRes.length > 0 && logRes[0].status === '1') {
                    newStatus = '1/OT';
                }
                const hours = Number(row.expected_hours) || 4;
                await txQuery(
                    `INSERT INTO attendance_logs (employee_id, record_date, status, ot_hours)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE status = ?, ot_hours = ?`,
                    [row.employee_id, dateStr, newStatus, hours, newStatus, hours]
                );
            }

            return row;
        });

        await logAuditEvent({
            actor_id: approver,
            actor_role: current_user ? current_user.role : 'admin',
            action: normalizedStatus === 'approved' ? 'APPROVE_OT_REGISTRATION' : 'REJECT_OT_REGISTRATION',
            resource: 'ot_registrations',
            details: { ot_reg_id: id, employee_id: reg.employee_id, status: normalizedStatus }
        });

        return { success: true, message: `Cập nhật trạng thái đăng ký OT thành '${normalizedStatus}' thành công!` };
    }

    async batchApproveRequests({ request_ids = [], current_user = null }) {
        if (!Array.isArray(request_ids) || request_ids.length === 0) {
            const error = new Error('Vui lòng chọn ít nhất 1 đơn cần duyệt!');
            error.statusCode = 400;
            throw error;
        }

        const uniqueIds = [...new Set(request_ids.map((v) => parseInt(v, 10)).filter((n) => !isNaN(n) && n > 0))];
        let approvedCount = 0;
        const skipped = [];

        for (const id of uniqueIds) {
            try {
                await this.updateRequestStatus(id, 'approved', current_user);
                approvedCount++;
            } catch (err) {
                skipped.push({ id, reason: err.message });
            }
        }

        return {
            success: true,
            approved_count: approvedCount,
            skipped_count: skipped.length,
            skipped,
            message: approvedCount > 0
                ? `Đã duyệt nhanh ${approvedCount} đơn hợp lệ${skipped.length > 0 ? ` (bỏ qua ${skipped.length} đơn trùng, đã xử lý hoặc khóa sổ)` : ''}!`
                : 'Không có đơn nào đủ điều kiện duyệt tự động!'
        };
    }
}

module.exports = new RequestService();
