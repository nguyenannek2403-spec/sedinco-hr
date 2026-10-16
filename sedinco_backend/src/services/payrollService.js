const { query } = require('../config/db');
const { calculateEmployeeSalary } = require('../utils/payrollCalculator');

class PayrollService {
    async calculateMonthlyPayroll(month, year) {
        const m = parseInt(month, 10) || 10;
        const y = parseInt(year, 10) || 2026;

        const sql = `
            SELECT e.*, IFNULL(a.cong_chuan, 26) as cong_chuan
            FROM employees e 
            LEFT JOIN attendance a ON e.ma_nv = a.ma_nv AND a.thang = ? AND a.nam = ?
            ORDER BY e.ma_nv ASC
        `;
        const emps = await query(sql, [m, y]);
        if (!emps || emps.length === 0) return [];

        const holidays = await query('SELECT start_date, end_date FROM public_holidays');
        const safeHolidays = holidays || [];

        const logs = await query(
            'SELECT employee_id, record_date, status, ot_hours, DAYOFWEEK(record_date) as dow FROM attendance_logs WHERE MONTH(record_date) = ? AND YEAR(record_date) = ?',
            [m, y]
        );
        const safeLogs = logs || [];

        return emps.map(emp => {
            const empLogs = safeLogs.filter(l => l.employee_id === emp.ma_nv);
            const allowances = {
                an_trua: emp.phu_cap_an_trua,
                xang_xe: emp.phu_cap_xang_xe,
                nha_o: emp.phu_cap_nha_o,
                thuong_htcv: emp.thuong_htcv,
                trach_nhiem: emp.phu_cap_trach_nhiem,
                tiep_khach: emp.phu_cap_tiep_khach
            };

            const calc = calculateEmployeeSalary({
                luong_cb: emp.luong_cb,
                cong_chuan: emp.cong_chuan,
                ngay_chinh_thuc: emp.ngay_chinh_thuc,
                logs: empLogs,
                holidays: safeHolidays,
                allowances: allowances,
                has_insurance: emp.has_insurance
            });

            return {
                id_nhan_vien: emp.ma_nv,
                ho_ten: emp.ho_ten,
                baseSalary: calc.baseSalary,
                congThuViec: calc.congThuViec,
                congChinhThuc: calc.congChinhThuc,
                totalWorkDays: calc.totalWorkDays,
                salaryByWork: calc.salaryByWork,
                totalAllowance: calc.totalAllowance,
                otAmount: calc.otAmount,
                totalInsurance: calc.totalInsurance,
                netSalary: calc.netSalary
            };
        });
    }
}

module.exports = new PayrollService();
