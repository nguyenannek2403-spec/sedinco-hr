const { query } = require('../config/db');

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

    async createRequest({ employee_id, request_type, request_date, reason }) {
        await query(
            'INSERT INTO requests (employee_id, request_type, request_date, reason) VALUES (?, ?, ?, ?)',
            [employee_id, request_type, request_date, reason]
        );
        return { success: true };
    }

    async updateRequestStatus(reqId, status) {
        await query('UPDATE requests SET status = ? WHERE id = ?', [status, reqId]);

        if (status === 'approved') {
            const results = await query('SELECT employee_id, request_date, request_type FROM requests WHERE id = ?', [reqId]);
            if (results && results.length > 0) {
                const reqData = results[0];
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
            }
        }

        return { success: true };
    }
}

module.exports = new RequestService();
