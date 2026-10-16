const { query } = require('../config/db');

class AttendanceService {
    async getAttendanceMatrix(month, year) {
        const emps = await query('SELECT ma_nv, ho_ten FROM employees ORDER BY ma_nv ASC');
        if (!emps || emps.length === 0) return [];

        const logs = await query(
            'SELECT employee_id, DAY(record_date) as day, status, ot_hours FROM attendance_logs WHERE MONTH(record_date)=? AND YEAR(record_date)=?',
            [month, year]
        );
        const safeLogs = logs || [];
        const daysInMonth = new Date(year, month, 0).getDate();

        return emps.map(emp => {
            const days = Array(daysInMonth).fill('');
            safeLogs
                .filter(l => l.employee_id === emp.ma_nv)
                .forEach(log => {
                    if (log.day > 0 && log.day <= daysInMonth) {
                        days[log.day - 1] = log.status;
                    }
                });
            return {
                ma_nv: emp.ma_nv,
                ho_ten: emp.ho_ten,
                days: days
            };
        });
    }

    async updateAttendanceDaily({ ma_nv, dateStr, status, hours, isDelete, check_in_time, check_out_time }) {
        if (isDelete) {
            await query('DELETE FROM attendance_logs WHERE employee_id=? AND record_date=?', [ma_nv, dateStr]);
            return { success: true };
        }

        const sql = `
            INSERT INTO attendance_logs (employee_id, record_date, status, ot_hours, check_in_time, check_out_time) 
            VALUES (?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
                status = VALUES(status), 
                ot_hours = VALUES(ot_hours),
                check_in_time = COALESCE(VALUES(check_in_time), check_in_time),
                check_out_time = COALESCE(VALUES(check_out_time), check_out_time)
        `;
        await query(sql, [ma_nv, dateStr, status, hours, check_in_time || null, check_out_time || null]);
        return { success: true };
    }
}

module.exports = new AttendanceService();
