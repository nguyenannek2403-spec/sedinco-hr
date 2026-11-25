const { query, withTransaction } = require('../config/db');
const attendanceService = require('./attendanceService');
const { logAuditEvent } = require('../middlewares/authMiddleware');
const { getVietnamDateString, formatVietnamDateTime } = require('../utils/timeHelper');
const { evaluateMisaDailyAttendance } = require('../utils/misaWorkdayEngine');
const { validateMediaReference } = require('../utils/mediaValidator');

function serializeRequestTimestamps(row) {
    if (!row) return row;
    const createdAtIso = row.created_at instanceof Date
        ? row.created_at.toISOString()
        : (row.created_at ? String(row.created_at) : null);
    const processedAtIso = row.processed_at instanceof Date
        ? row.processed_at.toISOString()
        : (row.processed_at ? String(row.processed_at) : null);
    return {
        ...row,
        created_at: createdAtIso,
        created_at_vn: formatVietnamDateTime(row.created_at),
        processed_at: processedAtIso,
        processed_at_vn: formatVietnamDateTime(row.processed_at),
        processed_by: row.processed_by || null,
        reject_reason: row.reject_reason || null
    };
}

function extractIsoDateStr(val) {
    if (!val) return null;
    if (typeof val === 'string') {
        const m = val.trim().match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
    }
    return getVietnamDateString(new Date(val));
}

function classifyRequestCategory(requestType) {
    const t = String(requestType || '').trim().toLowerCase();
    if (!t) return 'OTHER';
    if (t === 'cong_tac' || t === 'business_trip' || t.includes('công tác')) {
        return 'BUSINESS_TRIP';
    }
    if (
        t === 'ot' ||
        t.includes('overtime') ||
        t.includes('tăng ca') ||
        t.includes('làm thêm')
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
        t === 'salary_advance' ||
        t === 'advance' ||
        t.includes('ứng lương') ||
        t.includes('tạm ứng')
    ) {
        return 'SALARY_ADVANCE';
    }
    if (
        t === 'p' ||
        t === 'kp' ||
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

function normalizeOptionalReqTime(val) {
    if (!val || typeof val !== 'string') return null;
    const match = val.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    const ss = match[3] ? Number(match[3]) : 0;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function isPaidLeaveRequestType(requestType) {
    const raw = String(requestType || '').trim().toLowerCase();
    if (!raw) return false;
    if (
        raw === 'kp' ||
        raw === 'unpaid' ||
        raw === 'om' ||
        raw === 'ct' ||
        raw === 'ot' ||
        raw === 'salary_advance' ||
        raw === 'advance'
    ) {
        return false;
    }
    if (
        raw.includes('không lương') ||
        raw.includes('unpaid') ||
        raw.includes('ốm') ||
        raw.includes('bổ sung') ||
        raw.includes('tăng ca') ||
        raw.includes('làm thêm') ||
        raw.includes('công tác') ||
        raw.includes('ứng lương') ||
        raw.includes('tạm ứng')
    ) {
        return false;
    }
    return (
        raw === 'p' ||
        raw === 'paid_leave' ||
        raw === 'nghi_phep' ||
        raw === 'leave' ||
        raw === 'leave_annual' ||
        raw === '0.5' ||
        raw.includes('phép') ||
        raw.includes('leave') ||
        raw.includes('có lương')
    );
}

async function getMonthlyLeaveQuota(queryFn = query) {
    const rows = await queryFn('SELECT monthly_paid_leave_limit FROM company_settings LIMIT 1').catch(() => []);
    const raw = rows?.[0]?.monthly_paid_leave_limit;
    if (raw === undefined || raw === null || raw === '') return 1;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(31, parsed)) : 1;
}

async function getMonthlyPaidLeaveUsage(queryFn, ma_nv, month, year, { lockRows = false, excludeReqId = null } = {}) {
    const lockClause = lockRows ? ' FOR UPDATE' : '';
    const logRows = await queryFn(
        `SELECT DATE_FORMAT(record_date, '%Y-%m-%d') as d
         FROM attendance_logs
         WHERE employee_id = ? AND MONTH(record_date) = ? AND YEAR(record_date) = ? AND status = 'P'${lockClause}`,
        [ma_nv, month, year]
    );
    const reqRows = await queryFn(
        `SELECT id, request_type, status, DATE_FORMAT(request_date, '%Y-%m-%d') as d
         FROM requests
         WHERE employee_id = ? AND MONTH(request_date) = ? AND YEAR(request_date) = ? AND status IN ('pending', 'approved')${lockClause}`,
        [ma_nv, month, year]
    );
    const approvedDates = new Set((logRows || []).map((r) => r.d).filter(Boolean));
    const pendingDates = new Set();
    for (const r of reqRows || []) {
        if (excludeReqId && Number(r.id) === Number(excludeReqId)) continue;
        if (!isPaidLeaveRequestType(r.request_type)) continue;
        const st = String(r.status || '').toLowerCase();
        if (st === 'approved' && r.d) {
            approvedDates.add(r.d);
        } else if (st === 'pending' && r.d) {
            pendingDates.add(r.d);
        }
    }
    for (const d of approvedDates) {
        pendingDates.delete(d);
    }
    const approvedCount = approvedDates.size;
    const pendingCount = pendingDates.size;
    return {
        approvedCount,
        pendingCount,
        committedCount: approvedCount + pendingCount
    };
}

async function buildPaidLeaveUsageMap(empIds = []) {
    const usageByKey = new Map();
    if (!Array.isArray(empIds) || empIds.length === 0) return usageByKey;
    const ph = empIds.map(() => '?').join(',');
    const [paidLogs, paidReqs] = await Promise.all([
        query(
            `SELECT employee_id, MONTH(record_date) as m, YEAR(record_date) as y, DATE_FORMAT(record_date, '%Y-%m-%d') as d
             FROM attendance_logs
             WHERE employee_id IN (${ph}) AND status = 'P'`,
            empIds
        ).catch(() => []),
        query(
            `SELECT employee_id, request_type, status, MONTH(request_date) as m, YEAR(request_date) as y, DATE_FORMAT(request_date, '%Y-%m-%d') as d
             FROM requests
             WHERE employee_id IN (${ph}) AND status IN ('approved', 'pending')`,
            empIds
        ).catch(() => [])
    ]);
    const getEntry = (empId, m, y) => {
        const k = `${empId}|${y}-${m}`;
        if (!usageByKey.has(k)) usageByKey.set(k, { approved: new Set(), pending: new Set() });
        return usageByKey.get(k);
    };
    for (const row of paidLogs || []) {
        if (row.d) getEntry(row.employee_id, row.m, row.y).approved.add(row.d);
    }
    for (const row of paidReqs || []) {
        if (!row.d || !isPaidLeaveRequestType(row.request_type)) continue;
        const entry = getEntry(row.employee_id, row.m, row.y);
        if (String(row.status).toLowerCase() === 'approved') {
            entry.approved.add(row.d);
        } else {
            entry.pending.add(row.d);
        }
    }
    return usageByKey;
}

function attachMonthlyLeaveMeta(reqRow, usageByKey, monthlyQuota) {
    const serialized = serializeRequestTimestamps(reqRow);
    const k = `${reqRow.ma_nv}|${reqRow.request_year}-${reqRow.request_month}`;
    const entry = usageByKey.get(k);
    const approvedCount = entry ? entry.approved.size : 0;
    const pendingCount = entry
        ? [...entry.pending].filter((d) => !entry.approved.has(d)).length
        : 0;
    return {
        ...serialized,
        monthly_paid_leave_used: approvedCount,
        monthly_paid_leave_pending: pendingCount,
        monthly_paid_leave_committed: approvedCount + pendingCount,
        monthly_paid_leave_limit: monthlyQuota,
        is_paid_leave: isPaidLeaveRequestType(reqRow.request_type)
    };
}

class RequestService {
    async getAllRequests(pagination = {}) {
        const limit = Math.min(200, Math.max(1, parseInt(pagination.limit, 10) || 100));
        const page = Math.max(1, parseInt(pagination.page, 10) || 1);
        const offset = (page - 1) * limit;

        const sql = `
            SELECT r.id, r.employee_id as ma_nv, e.ho_ten, e.avatar_url, r.request_type as type, r.request_type,
                   COALESCE(r.advance_amount, 0) as advance_amount,
                   r.correction_mode, r.check_in_time, r.check_out_time, r.evidence_image,
                   DATE_FORMAT(r.request_date, '%d/%m/%Y') as date,
                   DATE_FORMAT(r.request_date, '%Y-%m-%d') as request_date_iso,
                   MONTH(r.request_date) as request_month,
                   YEAR(r.request_date) as request_year,
                   r.reason, r.status, r.created_at,
                   r.processed_at, r.processed_by, r.reject_reason
            FROM requests r 
            LEFT JOIN employees e ON r.employee_id = e.ma_nv 
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT ? OFFSET ?
        `;
        const results = (await query(sql, [limit, offset])) || [];
        if (results.length === 0) return [];

        const monthlyQuota = await getMonthlyLeaveQuota(query);
        const empIds = [...new Set(results.map((r) => r.ma_nv).filter(Boolean))];
        const usageByKey = await buildPaidLeaveUsageMap(empIds);

        return results.map((r) => attachMonthlyLeaveMeta(r, usageByKey, monthlyQuota));
    }

    async getRequestsGroupedByEmployee() {
        const [employeesRows, requestRows, monthlyQuota] = await Promise.all([
            query(
                `SELECT ma_nv, ho_ten, chuc_danh,
                        COALESCE(NULLIF(department, ''), 'Khối Công trình') as department,
                        avatar_url, status, is_locked
                 FROM employees
                 WHERE (role IS NULL OR role != 'admin')
                 ORDER BY ma_nv ASC`
            ).catch(() => []),
            query(
                `SELECT r.id, r.employee_id as ma_nv, e.ho_ten, r.request_type as type, r.request_type,
                        COALESCE(r.advance_amount, 0) as advance_amount,
                        r.correction_mode, r.check_in_time, r.check_out_time, r.evidence_image,
                        DATE_FORMAT(r.request_date, '%d/%m/%Y') as date,
                        DATE_FORMAT(r.request_date, '%Y-%m-%d') as request_date_iso,
                        MONTH(r.request_date) as request_month,
                        YEAR(r.request_date) as request_year,
                        r.reason, r.status, r.created_at,
                        r.processed_at, r.processed_by, r.reject_reason
                 FROM requests r
                 LEFT JOIN employees e ON r.employee_id = e.ma_nv
                 ORDER BY r.created_at DESC, r.id DESC
                 LIMIT 600`
            ).catch(() => []),
            getMonthlyLeaveQuota(query)
        ]);

        const empIds = (employeesRows || []).map((e) => e.ma_nv).filter(Boolean);
        const usageByKey = await buildPaidLeaveUsageMap(empIds);
        const { month: curMonth, year: curYear } = require('../utils/timeHelper').getVietnamDateParts(new Date());

        const requestsByEmp = new Map();
        for (const r of requestRows || []) {
            if (!r.ma_nv) continue;
            const enriched = attachMonthlyLeaveMeta(r, usageByKey, monthlyQuota);
            if (!requestsByEmp.has(r.ma_nv)) requestsByEmp.set(r.ma_nv, []);
            requestsByEmp.get(r.ma_nv).push(enriched);
        }

        const grouped = (employeesRows || []).map((emp) => {
            const empReqs = requestsByEmp.get(emp.ma_nv) || [];
            let pendingCount = 0;
            let approvedCount = 0;
            let rejectedCount = 0;
            let latestPendingTs = 0;
            let latestAnyTs = 0;
            for (const reqItem of empReqs) {
                const st = String(reqItem.status || '').toLowerCase();
                const ts = reqItem.created_at ? new Date(reqItem.created_at).getTime() || 0 : 0;
                if (ts > latestAnyTs) latestAnyTs = ts;
                if (st === 'pending') {
                    pendingCount++;
                    if (ts > latestPendingTs) latestPendingTs = ts;
                } else if (st === 'approved') {
                    approvedCount++;
                } else if (st === 'rejected') {
                    rejectedCount++;
                }
            }
            const curKey = `${emp.ma_nv}|${curYear}-${curMonth}`;
            const curEntry = usageByKey.get(curKey);
            const curApproved = curEntry ? curEntry.approved.size : 0;
            const curPending = curEntry
                ? [...curEntry.pending].filter((d) => !curEntry.approved.has(d)).length
                : 0;

            return {
                ma_nv: emp.ma_nv,
                ho_ten: emp.ho_ten,
                chuc_danh: emp.chuc_danh || '',
                department: emp.department || 'Khối Công trình',
                avatar_url: emp.avatar_url || null,
                status: emp.status || 'active',
                is_locked: Boolean(emp.is_locked),
                total_requests: empReqs.length,
                pending_count: pendingCount,
                approved_count: approvedCount,
                rejected_count: rejectedCount,
                latest_request: empReqs[0] || null,
                requests: empReqs,
                monthly_paid_leave_limit: monthlyQuota,
                current_month_paid_leave_used: curApproved,
                current_month_paid_leave_pending: curPending,
                _latestPendingTs: latestPendingTs,
                _latestAnyTs: latestAnyTs
            };
        });

        grouped.sort((a, b) => {
            if ((b.pending_count > 0) !== (a.pending_count > 0)) {
                return b.pending_count > 0 ? 1 : -1;
            }
            if (b.pending_count > 0 && a.pending_count > 0 && b._latestPendingTs !== a._latestPendingTs) {
                return b._latestPendingTs - a._latestPendingTs;
            }
            if ((b.total_requests > 0) !== (a.total_requests > 0)) {
                return b.total_requests > 0 ? 1 : -1;
            }
            if (b._latestAnyTs !== a._latestAnyTs) {
                return b._latestAnyTs - a._latestAnyTs;
            }
            return String(a.ma_nv).localeCompare(String(b.ma_nv));
        });

        return grouped.map(({ _latestPendingTs, _latestAnyTs, ...item }) => item);
    }

    async getMyRequests(employee_id, pagination = {}) {
        if (!employee_id) return [];
        const limit = Math.min(200, Math.max(1, parseInt(pagination.limit, 10) || 100));
        const page = Math.max(1, parseInt(pagination.page, 10) || 1);
        const offset = (page - 1) * limit;

        const sql = `
            SELECT r.id, r.employee_id as ma_nv, e.ho_ten, e.avatar_url, r.request_type as type, r.request_type,
                   COALESCE(r.advance_amount, 0) as advance_amount,
                   r.correction_mode, r.check_in_time, r.check_out_time, r.evidence_image,
                   DATE_FORMAT(r.request_date, '%d/%m/%Y') as date, r.reason, r.status, r.created_at,
                   r.processed_at, r.processed_by, r.reject_reason
            FROM requests r 
            LEFT JOIN employees e ON r.employee_id = e.ma_nv 
            WHERE r.employee_id = ?
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT ? OFFSET ?
        `;
        const results = (await query(sql, [employee_id, limit, offset])) || [];
        return results.map(serializeRequestTimestamps);
    }

    async getLeaveBalance(ma_nv, year = new Date().getFullYear(), month = new Date().getMonth() + 1) {
        const now = new Date();
        const targetYear = parseInt(year, 10) || now.getFullYear();
        const targetMonth = parseInt(month, 10) || (now.getMonth() + 1);
        const empRows = await query(
            'SELECT ma_nv, ho_ten FROM employees WHERE ma_nv = ? LIMIT 1',
            [ma_nv]
        );
        if (!empRows || empRows.length === 0) {
            const error = new Error(`Không tìm thấy nhân viên ${ma_nv}!`);
            error.statusCode = 404;
            throw error;
        }
        const quota = await getMonthlyLeaveQuota(query);
        const usage = await getMonthlyPaidLeaveUsage(query, ma_nv, targetMonth, targetYear);
        const remaining = Number(Math.max(0, quota - usage.committedCount).toFixed(1));

        return {
            employee_id: ma_nv,
            month: targetMonth,
            year: targetYear,
            quota,
            used: usage.approvedCount,
            pending: usage.pendingCount,
            committed: usage.committedCount,
            remaining,
            approved_remaining: Number(Math.max(0, quota - usage.approvedCount).toFixed(1)),
            is_monthly_quota: true
        };
    }

    async createRequest({
        employee_id,
        request_type,
        request_date,
        from_date,
        to_date,
        reason,
        advance_amount = 0,
        correction_mode = null,
        check_in_time = null,
        check_out_time = null,
        evidence_image = null,
        current_user = null
    }) {
        // Chỉ Admin mới được tạo đơn hộ nhân viên khác
        const targetId = (current_user && current_user.role !== 'admin')
            ? current_user.ma_nv
            : (employee_id || current_user?.ma_nv);

        if (!targetId) {
            const error = new Error('Thiếu mã nhân viên nộp đơn!');
            error.statusCode = 400;
            throw error;
        }

        const empTargetRows = await query('SELECT role FROM employees WHERE ma_nv = ? LIMIT 1', [targetId]);
        if (empTargetRows && empTargetRows[0] && empTargetRows[0].role === 'admin') {
            const error = new Error('Tài khoản Quản trị viên chỉ dùng để điều hành, không tạo đơn từ chấm công cá nhân!');
            error.statusCode = 403;
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
        const parsedAdvanceAmount = reqCategory === 'SALARY_ADVANCE' ? Math.round(Number(advance_amount) || 0) : 0;

        const allowedModes = ['CHECK_IN', 'CHECK_OUT', 'BOTH', 'SHIFT_CHANGE'];
        const rawMode = correction_mode ? String(correction_mode).trim().toUpperCase() : null;
        const cleanCorrectionMode = (reqCategory === 'ATTENDANCE_COMPENSATION' && rawMode && allowedModes.includes(rawMode))
            ? rawMode
            : null;
        const cleanCheckIn = reqCategory === 'ATTENDANCE_COMPENSATION' ? normalizeOptionalReqTime(check_in_time) : null;
        const cleanCheckOut = reqCategory === 'ATTENDANCE_COMPENSATION' ? normalizeOptionalReqTime(check_out_time) : null;

        const cleanEvidenceImage = validateMediaReference(evidence_image, {
            maxInlineBytes: 185 * 1024,
            allowNull: true
        });
        if (reqCategory === 'SALARY_ADVANCE') {
            if (!Number.isFinite(parsedAdvanceAmount) || parsedAdvanceAmount < 10000 || parsedAdvanceAmount > 500000000) {
                const error = new Error('Vui lòng nhập số tiền xin ứng lương hợp lệ (tối thiểu 10.000 đ)!');
                error.statusCode = 400;
                throw error;
            }
            // Đơn xin ứng lương chỉ gắn với 1 ngày lập đơn
            datesList.splice(1);
        }

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
                const isAdvanceDuplicate =
                    reqCategory === 'SALARY_ADVANCE' && existingCat === 'SALARY_ADVANCE' && String(row.status || '').toLowerCase() === 'pending';
                const isRegularConflict =
                    reqCategory !== 'SALARY_ADVANCE' &&
                    (existingCat === reqCategory ||
                    (reqCategory === 'OTHER' && String(row.request_type || '').toLowerCase() === cleanType.toLowerCase()));

                if (isAdvanceDuplicate || isRegularConflict) {
                    const error = new Error(
                        isAdvanceDuplicate
                            ? 'Bạn đang có một đơn xin ứng lương ngày này chờ duyệt, vui lòng chờ xử lý trước khi gửi thêm!'
                            : 'Bạn đã có đơn cho ngày này đang chờ duyệt hoặc đã được duyệt, không thể gửi trùng!'
                    );
                    error.statusCode = 409;
                    error.code = 'DUPLICATE_REQUEST';
                    throw error;
                }
            }

            // V39: Khóa hạn mức tối đa 1 đơn/ngày nghỉ có lương mỗi tháng (không cộng dồn)
            if (isPaidLeaveRequestType(cleanType)) {
                const monthlyQuota = await getMonthlyLeaveQuota(txQuery);
                const datesByMonth = new Map();
                for (const iso of datesList) {
                    const [yStr, mStr] = iso.split('-');
                    const ymKey = `${yStr}-${mStr}`;
                    if (!datesByMonth.has(ymKey)) {
                        datesByMonth.set(ymKey, { y: Number(yStr), m: Number(mStr), dates: [] });
                    }
                    datesByMonth.get(ymKey).dates.push(iso);
                }
                for (const { y, m, dates } of datesByMonth.values()) {
                    const usage = await getMonthlyPaidLeaveUsage(txQuery, targetId, m, y, { lockRows: true });
                    if (usage.committedCount >= monthlyQuota || (usage.committedCount + dates.length) > monthlyQuota) {
                        const error = new Error(
                            `Bạn đã dùng hết ${monthlyQuota} lượt nghỉ có lương trong tháng ${m}/${y}. Vui lòng chọn Nghỉ không lương nếu cần nghỉ thêm.`
                        );
                        error.statusCode = 400;
                        error.code = 'MONTHLY_PAID_LEAVE_EXCEEDED';
                        throw error;
                    }
                }
            }

            const insertedIds = [];
            for (const iso of datesList) {
                const insertRes = await txQuery(
                    'INSERT INTO requests (employee_id, request_type, request_date, reason, status, advance_amount, correction_mode, check_in_time, check_out_time, evidence_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        targetId,
                        cleanType,
                        iso,
                        cleanReason,
                        'pending',
                        parsedAdvanceAmount,
                        cleanCorrectionMode,
                        cleanCheckIn,
                        cleanCheckOut,
                        cleanEvidenceImage
                    ]
                );
                if (insertRes && insertRes.insertId) {
                    insertedIds.push(insertRes.insertId);
                }
            }

            if (cleanEvidenceImage && insertedIds.length > 0) {
                const mediaLifecycleService = require('./mediaLifecycleService');
                await mediaLifecycleService.bindAssetToEntity({
                    mediaRef: cleanEvidenceImage,
                    entityType: 'request',
                    entityId: String(insertedIds[0]),
                    employeeId: targetId,
                    txQuery
                });
            }

            return {
                id: insertedIds[0] || null,
                ids: insertedIds,
                dates: datesList,
                advance_amount: parsedAdvanceAmount,
                correction_mode: cleanCorrectionMode,
                check_in_time: cleanCheckIn,
                check_out_time: cleanCheckOut
            };
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

    async updateRequestStatus(reqId, status, current_user = null, reject_reason = null) {
        const normalizedStatus = String(status || '').trim().toLowerCase();
        if (!['approved', 'rejected'].includes(normalizedStatus)) {
            const error = new Error('Trạng thái xử lý đơn không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        const actorId = current_user ? (current_user.ma_nv || current_user.username) : null;
        const cleanRejectReason = normalizedStatus === 'rejected' && reject_reason
            ? String(reject_reason).trim().slice(0, 500)
            : null;

        const reqData = await withTransaction(async (txQuery) => {
            const results = await txQuery('SELECT * FROM requests WHERE id = ? FOR UPDATE', [reqId]);
            if (!results || results.length === 0) {
                const error = new Error('Không tìm thấy đơn từ yêu cầu!');
                error.statusCode = 404;
                throw error;
            }

            const row = results[0];

            // 1. Ngăn chặn tự phê duyệt đơn của chính mình
            if (actorId && actorId === row.employee_id && normalizedStatus === 'approved') {
                const error = new Error('Theo quy định kiểm soát nội bộ, bạn không thể tự phê duyệt đơn từ của chính mình!');
                error.statusCode = 403;
                throw error;
            }

            // 2. Chống duyệt 2 lần (Double-Approval Guard)
            if (String(row.status || '').toLowerCase() !== 'pending') {
                const error = new Error('Đơn từ này đã được xử lý trước đó. Không thể thao tác lại!');
                error.statusCode = 409;
                error.code = 'ALREADY_PROCESSED';
                throw error;
            }

            const dateStr = extractIsoDateStr(row.request_date);
            const [year, month, day] = dateStr.split('-').map(Number);

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

            // V39: Khóa hàng nhân viên để serialize phê duyệt đơn và kiểm tra hạn mức phép tháng
            await txQuery('SELECT ma_nv FROM employees WHERE ma_nv = ? FOR UPDATE', [row.employee_id]);
            if (normalizedStatus === 'approved' && isPaidLeaveRequestType(row.request_type)) {
                const monthlyQuota = await getMonthlyLeaveQuota(txQuery);
                const usage = await getMonthlyPaidLeaveUsage(txQuery, row.employee_id, month, year, {
                    lockRows: true,
                    excludeReqId: row.id
                });
                if (usage.approvedCount >= monthlyQuota) {
                    const error = new Error(
                        `Nhân viên ${row.employee_id} đã sử dụng hết ${monthlyQuota} lượt nghỉ có lương trong tháng ${month}/${year}. Chỉ có thể duyệt Nghỉ không lương!`
                    );
                    error.statusCode = 400;
                    error.code = 'MONTHLY_PAID_LEAVE_EXCEEDED';
                    throw error;
                }
            }

            const updateRes = await txQuery(
                "UPDATE requests SET status = ?, processed_at = NOW(), processed_by = ?, reject_reason = ? WHERE id = ? AND status = 'pending'",
                [normalizedStatus, actorId || null, cleanRejectReason, reqId]
            );
            if (!updateRes || updateRes.affectedRows === 0) {
                const error = new Error('Đơn từ này vừa được xử lý trước đó!');
                error.statusCode = 409;
                error.code = 'ALREADY_PROCESSED';
                throw error;
            }

            const type = (row.request_type || '').toLowerCase();
            const reqCategoryApproved = classifyRequestCategory(row.request_type);
            const isSalaryAdvance = type === 'salary_advance' || type.includes('ứng lương') || type.includes('tạm ứng');
            const isUnpaidLeave = type === 'kp' || type.includes('không lương') || type.includes('unpaid');

            if (normalizedStatus === 'approved') {
                if (isSalaryAdvance) {
                    const advAmt = Math.max(0, Math.round(Number(row.advance_amount) || 0));
                    if (advAmt > 0) {
                        const { getMonthlyStandardWorkdays } = require('../utils/timeHelper');
                        const stdDays = getMonthlyStandardWorkdays(month, year);
                        await txQuery(
                            `INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, advance_deduction, adjustment_note)
                             VALUES (?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE
                                 advance_deduction = COALESCE(advance_deduction, 0) + VALUES(advance_deduction),
                                 adjustment_note = CASE
                                     WHEN adjustment_note IS NULL OR adjustment_note = '' THEN VALUES(adjustment_note)
                                     ELSE CONCAT(LEFT(adjustment_note, 180), '; ', VALUES(adjustment_note))
                                 END`,
                            [row.employee_id, month, year, stdDays, advAmt, `Ứng lương (${dateStr}): ${advAmt.toLocaleString('vi-VN')}đ`]
                        );
                    }
                } else if (reqCategoryApproved === 'BUSINESS_TRIP') {
                    await txQuery(
                        `INSERT INTO attendance_logs (employee_id, record_date, status, work_credit, work_location_type, field_note, location_name, is_suspicious, is_low_trust)
                         VALUES (?, ?, '1', 1, 'FIELD_WORK', ?, 'Đi công tác (Đơn đã duyệt)', 0, 0)
                         ON DUPLICATE KEY UPDATE
                            status = CASE WHEN status IN ('1/OT', 'P', 'L') THEN status ELSE '1' END,
                            work_credit = GREATEST(COALESCE(work_credit, 0), 1),
                            work_location_type = 'FIELD_WORK',
                            field_note = COALESCE(NULLIF(?, ''), field_note),
                            location_name = COALESCE(NULLIF(location_name, ''), 'Đi công tác (Đơn đã duyệt)'),
                            is_suspicious = 0,
                            is_low_trust = 0`,
                        [row.employee_id, dateStr, String(row.reason || 'Đi công tác').slice(0, 350), String(row.reason || '').slice(0, 350)]
                    );
                } else if (reqCategoryApproved === 'OVERTIME') {
                    const logRes = await txQuery(
                        'SELECT status FROM attendance_logs WHERE employee_id = ? AND record_date = ? FOR UPDATE',
                        [row.employee_id, dateStr]
                    );
                    let newStatus = 'OT';
                    if (logRes && logRes.length > 0 && logRes[0].status === '1') {
                        newStatus = '1/OT';
                    }
                    const otMatch = String(row.reason || '').match(/(\d+(?:\.\d+)?)\s*(?:giờ|h\b)/i);
                    const approvedOtHours = otMatch ? Math.min(12, Math.max(0.5, Number(otMatch[1]))) : 4;
                    await txQuery(
                        `INSERT INTO attendance_logs (employee_id, record_date, status, ot_hours)
                         VALUES (?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE status = ?, ot_hours = GREATEST(IFNULL(ot_hours, 0), ?)`,
                        [row.employee_id, dateStr, newStatus, approvedOtHours, newStatus, approvedOtHours]
                    );
                    await txQuery(
                        `INSERT INTO ot_registrations (employee_id, work_date, expected_hours, reason, approved_by, status)
                         VALUES (?, ?, ?, ?, ?, 'approved')
                         ON DUPLICATE KEY UPDATE status = 'approved', expected_hours = GREATEST(expected_hours, VALUES(expected_hours)), approved_by = VALUES(approved_by)`,
                        [row.employee_id, dateStr, approvedOtHours, row.reason || 'Duyệt từ đơn tăng ca', actorId || 'admin']
                    );
                } else if (isUnpaidLeave) {
                    const isHalfDayUnpaid = type.includes('nửa ngày') || type.includes('0.5') || type.includes('buổi');
                    if (isHalfDayUnpaid) {
                        await txQuery(
                            `INSERT INTO attendance_logs (employee_id, record_date, status, work_credit)
                             VALUES (?, ?, 'KP', 0)
                             ON DUPLICATE KEY UPDATE
                                status = CASE
                                    WHEN check_in_time IS NOT NULL AND check_out_time IS NOT NULL AND status IN ('0.5', '1') THEN status
                                    ELSE 'KP'
                                END,
                                work_credit = CASE
                                    WHEN check_in_time IS NOT NULL AND check_out_time IS NOT NULL AND COALESCE(work_credit, 0) > 0 THEN work_credit
                                    ELSE 0
                                END`,
                            [row.employee_id, dateStr]
                        );
                    } else {
                        await txQuery(
                            `INSERT INTO attendance_logs (employee_id, record_date, status, work_credit)
                             VALUES (?, ?, 'KP', 0)
                             ON DUPLICATE KEY UPDATE status = 'KP', work_credit = 0`,
                            [row.employee_id, dateStr]
                        );
                    }
                } else if (type.includes('nửa ngày') || type.includes('0.5')) {
                    const existingHalf = await txQuery(
                        'SELECT status, check_in_time, check_out_time, work_credit FROM attendance_logs WHERE employee_id = ? AND record_date = ? FOR UPDATE',
                        [row.employee_id, dateStr]
                    );
                    const ex = existingHalf && existingHalf[0];
                    const hasHalfWorked = Boolean(ex && ex.check_in_time && (ex.status === '0.5' || Number(ex.work_credit) === 0.5));
                    const nextSt = hasHalfWorked ? '1' : '0.5';
                    const nextCred = hasHalfWorked ? 1 : 0.5;
                    await txQuery(
                        `INSERT INTO attendance_logs (employee_id, record_date, status, work_credit)
                         VALUES (?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE status = ?, work_credit = ?`,
                        [row.employee_id, dateStr, nextSt, nextCred, nextSt, nextCred]
                    );
                } else if (isPaidLeaveRequestType(row.request_type)) {
                    await txQuery(
                        `INSERT INTO attendance_logs (employee_id, record_date, status, work_credit)
                         VALUES (?, ?, 'P', 1)
                         ON DUPLICATE KEY UPDATE status = 'P', work_credit = 1`,
                        [row.employee_id, dateStr]
                    );
                } else if (type === 'ct' || type.includes('cập nhật công') || type.includes('bổ sung') || type.includes('quên chấm công') || type.includes('giờ ra') || type.includes('forgot_checkin') || type.includes('late_early')) {
                    const mode = String(row.correction_mode || '').toUpperCase();
                    const reqIn = row.check_in_time || null;
                    const reqOut = row.check_out_time || null;

                    const existingRows = await txQuery(
                        'SELECT check_in_time, check_out_time, ot_hours, shift_type FROM attendance_logs WHERE employee_id = ? AND record_date = ? FOR UPDATE',
                        [row.employee_id, dateStr]
                    );
                    const existingAtt = existingRows && existingRows.length > 0 ? existingRows[0] : null;
                    const csRows = await txQuery('SELECT work_start, lunch_start, lunch_end, work_end FROM company_settings LIMIT 1').catch(() => []);
                    const cs = (csRows && csRows[0]) ? csRows[0] : {};

                    let finalIn = existingAtt?.check_in_time || null;
                    let finalOut = existingAtt?.check_out_time || null;
                    if (mode === 'BOTH' || mode === 'SHIFT_CHANGE') {
                        finalIn = reqIn || finalIn || '08:00:00';
                        finalOut = reqOut || finalOut || '17:30:00';
                    } else if (mode === 'CHECK_IN' || (!mode && type.includes('giờ vào'))) {
                        finalIn = reqIn || finalIn || '08:00:00';
                    } else {
                        finalOut = reqOut || finalOut || '17:30:00';
                    }

                    if (finalIn && finalOut) {
                        const approvedOtRows = await txQuery(
                            "SELECT expected_hours FROM ot_registrations WHERE employee_id = ? AND work_date = ? AND status = 'approved' LIMIT 1",
                            [row.employee_id, dateStr]
                        );
                        const hasApprovedOt = Boolean(approvedOtRows && approvedOtRows.length > 0);
                        const approvedOtHours = hasApprovedOt ? (Number(approvedOtRows[0].expected_hours) || 0) : 0;

                        const misaEval = evaluateMisaDailyAttendance({
                            checkInTime: finalIn,
                            checkOutTime: finalOut,
                            workStartStr: cs.work_start || '08:00',
                            lunchStartStr: cs.lunch_start || '12:00',
                            lunchEndStr: cs.lunch_end || '13:30',
                            workEndStr: cs.work_end || '17:30',
                            shiftCode: existingAtt?.shift_type || 'FULL_DAY',
                            hasApprovedOt,
                            approvedOtHours,
                            existingOtHours: existingAtt?.ot_hours || 0
                        });

                        await txQuery(
                            `INSERT INTO attendance_logs (
                                employee_id, record_date, status, check_in_time, check_out_time,
                                late_minutes, early_leave_minutes, work_hours,
                                morning_worked_minutes, afternoon_worked_minutes, work_credit, duration_status,
                                is_suspicious, is_low_trust
                             ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0, 0)
                             ON DUPLICATE KEY UPDATE
                                status = VALUES(status),
                                check_in_time = VALUES(check_in_time),
                                check_out_time = VALUES(check_out_time),
                                late_minutes = 0,
                                early_leave_minutes = VALUES(early_leave_minutes),
                                work_hours = VALUES(work_hours),
                                morning_worked_minutes = VALUES(morning_worked_minutes),
                                afternoon_worked_minutes = VALUES(afternoon_worked_minutes),
                                work_credit = VALUES(work_credit),
                                duration_status = VALUES(duration_status),
                                is_suspicious = 0,
                                is_low_trust = 0`,
                            [
                                row.employee_id,
                                dateStr,
                                misaEval.status,
                                finalIn,
                                finalOut,
                                misaEval.early_leave_minutes,
                                misaEval.work_hours,
                                misaEval.morning_worked_minutes,
                                misaEval.afternoon_worked_minutes,
                                misaEval.work_credit,
                                misaEval.duration_status
                            ]
                        );
                    } else if (finalIn && !finalOut) {
                        await txQuery(
                            `INSERT INTO attendance_logs (employee_id, record_date, status, check_in_time, late_minutes, is_suspicious, is_low_trust)
                             VALUES (?, ?, '1', ?, 0, 0, 0)
                             ON DUPLICATE KEY UPDATE
                                status = '1',
                                check_in_time = ?,
                                late_minutes = 0,
                                is_suspicious = 0,
                                is_low_trust = 0`,
                            [row.employee_id, dateStr, finalIn, finalIn]
                        );
                    } else {
                        const fallbackOut = finalOut || '17:30:00';
                        await txQuery(
                            `INSERT INTO attendance_logs (employee_id, record_date, status, check_out_time, is_suspicious, is_low_trust)
                             VALUES (?, ?, '1', ?, 0, 0)
                             ON DUPLICATE KEY UPDATE
                                status = '1',
                                check_out_time = COALESCE(NULLIF(?, ''), NULLIF(check_out_time, ''), '17:30:00'),
                                is_suspicious = 0,
                                is_low_trust = 0`,
                            [row.employee_id, dateStr, fallbackOut, fallbackOut]
                        );
                    }
                }
            } else if (normalizedStatus === 'rejected') {
                const reqCat = classifyRequestCategory(row.request_type);
                if (!isSalaryAdvance && reqCat === 'LEAVE') {
                    const isHalfDay = type.includes('nửa ngày') || type.includes('0.5') || type.includes('buổi');
                    const absentStatus = isHalfDay ? '0.5' : 'V';
                    await txQuery(
                        `INSERT INTO attendance_logs (employee_id, record_date, status)
                         VALUES (?, ?, ?)
                         ON DUPLICATE KEY UPDATE status = CASE
                            WHEN check_in_time IS NOT NULL OR status IN ('1', '1/OT', 'OT', 'P', 'L') THEN status
                            ELSE VALUES(status)
                         END`,
                        [row.employee_id, dateStr, absentStatus]
                    );
                }
            }

            return row;
        });

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'unknown',
                actor_role: current_user.role || 'unknown',
                action: normalizedStatus === 'approved' ? 'APPROVE_REQUEST' : 'REJECT_REQUEST',
                resource: 'requests',
                details: {
                    request_id: reqId,
                    target_employee: reqData.employee_id,
                    status: normalizedStatus,
                    ...(cleanRejectReason ? { reject_reason: cleanRejectReason } : {})
                }
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
                const wdStr = extractIsoDateStr(row.work_date);
                const [y, m] = wdStr.split('-').map(Number);
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
                const dateStr = extractIsoDateStr(row.work_date);
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
