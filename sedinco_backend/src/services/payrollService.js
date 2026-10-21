const { query } = require('../config/db');
const { calculateEmployeeSalary } = require('../utils/payrollCalculator');
const { logAuditEvent } = require('../middlewares/authMiddleware');

class PayrollService {
    async calculateMonthlyPayroll(month, year) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();

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

        const otRegs = await query(
            'SELECT employee_id, work_date, expected_hours, status FROM ot_registrations WHERE MONTH(work_date) = ? AND YEAR(work_date) = ? AND status = "approved"',
            [m, y]
        );
        const safeOtRegs = otRegs || [];

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
                has_insurance: emp.has_insurance,
                otRegistrations: safeOtRegs.filter(r => r.employee_id === emp.ma_nv)
            });

            return {
                id_nhan_vien: emp.ma_nv,
                ho_ten: emp.ho_ten,
                chuc_danh: emp.chuc_danh,
                role: emp.role,
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

    async getMyPayroll(ma_nv, month, year) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();

        const sql = `
            SELECT e.*, IFNULL(a.cong_chuan, 26) as cong_chuan
            FROM employees e 
            LEFT JOIN attendance a ON e.ma_nv = a.ma_nv AND a.thang = ? AND a.nam = ?
            WHERE e.ma_nv = ?
            LIMIT 1
        `;
        const emps = await query(sql, [m, y, ma_nv]);
        if (!emps || emps.length === 0) return null;

        const emp = emps[0];
        const holidays = await query('SELECT start_date, end_date FROM public_holidays');
        const safeHolidays = holidays || [];

        const logs = await query(
            'SELECT employee_id, record_date, status, ot_hours, DAYOFWEEK(record_date) as dow FROM attendance_logs WHERE employee_id = ? AND MONTH(record_date) = ? AND YEAR(record_date) = ?',
            [ma_nv, m, y]
        );
        const safeLogs = logs || [];

        const otRegs = await query(
            'SELECT employee_id, work_date, expected_hours, status FROM ot_registrations WHERE employee_id = ? AND MONTH(work_date) = ? AND YEAR(work_date) = ? AND status = "approved"',
            [ma_nv, m, y]
        );
        const safeOtRegs = otRegs || [];

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
            logs: safeLogs,
            holidays: safeHolidays,
            allowances: allowances,
            has_insurance: emp.has_insurance,
            otRegistrations: safeOtRegs
        });

        return {
            id_nhan_vien: emp.ma_nv,
            ho_ten: emp.ho_ten,
            chuc_danh: emp.chuc_danh,
            thang: m,
            nam: y,
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
    }

    async approvePayroll(month, year, user) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        await logAuditEvent({
            actor_id: user.ma_nv || user.username || user.id,
            actor_role: user.role,
            action: 'APPROVE_PAYROLL',
            resource: 'payroll',
            details: { month: m, year: y }
        });
        return { success: true, message: `Phê duyệt bảng lương tháng ${m}/${y} thành công!` };
    }

    async updatePaymentStatus(month, year, status, user) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        await logAuditEvent({
            actor_id: user.ma_nv || user.username || user.id,
            actor_role: user.role,
            action: 'UPDATE_PAYMENT_STATUS',
            resource: 'payroll',
            details: { month: m, year: y, status }
        });
        return { success: true, message: `Cập nhật trạng thái chi trả lương tháng ${m}/${y} thành công!` };
    }
}

module.exports = new PayrollService();
