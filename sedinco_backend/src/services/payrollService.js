const { query, withTransaction } = require('../config/db');
const { calculateEmployeeSalary } = require('../utils/payrollCalculator');
const { logAuditEvent } = require('../middlewares/authMiddleware');

class PayrollService {
    async calculateMonthlyPayroll(month, year, pagination = {}) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();
        const limit = Math.min(200, Math.max(1, parseInt(pagination.limit, 10) || 200));
        const page = Math.max(1, parseInt(pagination.page, 10) || 1);
        const offset = (page - 1) * limit;

        const csRows = await query('SELECT * FROM company_settings LIMIT 1').catch(() => []);
        const companySettings = (csRows && csRows[0]) ? csRows[0] : {};
        const defaultStandardDays = Number(companySettings.standard_work_days) || 26;

        const sql = `
            SELECT e.*, IFNULL(a.cong_chuan, ?) as cong_chuan,
                   COALESCE(a.salary_confirm_status, 'PENDING') as salary_confirm_status,
                   a.dispute_reason, a.dispute_evidence_media, a.admin_response, a.confirmed_at
            FROM employees e 
            LEFT JOIN attendance a ON e.ma_nv = a.ma_nv AND a.thang = ? AND a.nam = ?
            ORDER BY e.ma_nv ASC
            LIMIT ? OFFSET ?
        `;
        const emps = await query(sql, [defaultStandardDays, m, y, limit, offset]);
        if (!emps || emps.length === 0) return [];

        const holidays = await query('SELECT start_date, end_date FROM public_holidays');
        const safeHolidays = holidays || [];

        const logs = await query(
            'SELECT employee_id, record_date, status, ot_hours, late_minutes, early_leave_minutes, work_hours, DAYOFWEEK(record_date) as dow FROM attendance_logs WHERE MONTH(record_date) = ? AND YEAR(record_date) = ?',
            [m, y]
        );
        const safeLogs = logs || [];

        const otRegs = await query(
            'SELECT employee_id, work_date, expected_hours, status FROM ot_registrations WHERE MONTH(work_date) = ? AND YEAR(work_date) = ? AND status = ?',
            [m, y, 'approved']
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
                status: emp.status,
                chuc_danh: emp.chuc_danh,
                logs: empLogs,
                holidays: safeHolidays,
                allowances: allowances,
                has_insurance: emp.has_insurance,
                otRegistrations: safeOtRegs.filter(r => r.employee_id === emp.ma_nv),
                companySettings
            });

            return {
                id_nhan_vien: emp.ma_nv,
                ma_nv: emp.ma_nv,
                ho_ten: emp.ho_ten,
                chuc_danh: emp.chuc_danh,
                role: emp.role,
                thang: m,
                nam: y,
                baseSalary: calc.baseSalary,
                standardWorkDays: calc.standardWorkDays,
                insuranceRatePercent: calc.insuranceRatePercent,
                congThuViec: calc.congThuViec,
                congChinhThuc: calc.congChinhThuc,
                totalWorkDays: calc.totalWorkDays,
                actualWorkDays: calc.actualWorkDays,
                totalLateMinutes: calc.totalLateMinutes,
                salaryByWork: calc.salaryByWork,
                totalAllowance: calc.totalAllowance,
                allowances_breakdown: calc.allowances_breakdown,
                otAmount: calc.otAmount,
                totalInsurance: calc.totalInsurance,
                grossSalary: calc.grossSalary,
                netSalary: calc.netSalary,
                salary_confirm_status: emp.salary_confirm_status || 'PENDING',
                dispute_reason: emp.dispute_reason || null,
                dispute_evidence_media: emp.dispute_evidence_media || null,
                admin_response: emp.admin_response || null,
                confirmed_at: emp.confirmed_at || null,
                warning: calc.warning || null
            };
        });
    }

    async getMyPayroll(ma_nv, month, year) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();

        const csRows = await query('SELECT * FROM company_settings LIMIT 1').catch(() => []);
        const companySettings = (csRows && csRows[0]) ? csRows[0] : {};
        const defaultStandardDays = Number(companySettings.standard_work_days) || 26;

        const sql = `
            SELECT e.*, IFNULL(a.cong_chuan, ?) as cong_chuan,
                   COALESCE(a.salary_confirm_status, 'PENDING') as salary_confirm_status,
                   a.dispute_reason, a.dispute_evidence_media, a.admin_response, a.confirmed_at
            FROM employees e 
            LEFT JOIN attendance a ON e.ma_nv = a.ma_nv AND a.thang = ? AND a.nam = ?
            WHERE e.ma_nv = ?
            LIMIT 1
        `;
        const emps = await query(sql, [defaultStandardDays, m, y, ma_nv]);
        if (!emps || emps.length === 0) return null;

        const emp = emps[0];
        const holidays = await query('SELECT start_date, end_date FROM public_holidays');
        const safeHolidays = holidays || [];

        const logs = await query(
            'SELECT employee_id, record_date, status, ot_hours, late_minutes, early_leave_minutes, work_hours, DAYOFWEEK(record_date) as dow FROM attendance_logs WHERE employee_id = ? AND MONTH(record_date) = ? AND YEAR(record_date) = ?',
            [ma_nv, m, y]
        );
        const safeLogs = logs || [];

        const otRegs = await query(
            'SELECT employee_id, work_date, expected_hours, status FROM ot_registrations WHERE employee_id = ? AND MONTH(work_date) = ? AND YEAR(work_date) = ? AND status = ?',
            [ma_nv, m, y, 'approved']
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
            status: emp.status,
            chuc_danh: emp.chuc_danh,
            logs: safeLogs,
            holidays: safeHolidays,
            allowances: allowances,
            has_insurance: emp.has_insurance,
            otRegistrations: safeOtRegs,
            companySettings
        });

        return {
            id_nhan_vien: emp.ma_nv,
            ma_nv: emp.ma_nv,
            ho_ten: emp.ho_ten,
            chuc_danh: emp.chuc_danh,
            thang: m,
            nam: y,
            baseSalary: calc.baseSalary,
            standardWorkDays: calc.standardWorkDays,
            insuranceRatePercent: calc.insuranceRatePercent,
            congThuViec: calc.congThuViec,
            congChinhThuc: calc.congChinhThuc,
            totalWorkDays: calc.totalWorkDays,
            actualWorkDays: calc.actualWorkDays,
            totalLateMinutes: calc.totalLateMinutes,
            salaryByWork: calc.salaryByWork,
            totalAllowance: calc.totalAllowance,
            allowances_breakdown: calc.allowances_breakdown,
            otAmount: calc.otAmount,
            totalInsurance: calc.totalInsurance,
            grossSalary: calc.grossSalary,
            netSalary: calc.netSalary,
            salary_confirm_status: emp.salary_confirm_status || 'PENDING',
            dispute_reason: emp.dispute_reason || null,
            dispute_evidence_media: emp.dispute_evidence_media || null,
            admin_response: emp.admin_response || null,
            confirmed_at: emp.confirmed_at || null,
            warning: calc.warning || null
        };
    }

    async confirmOrDisputeSalary({ ma_nv, month, year, status, dispute_reason, dispute_evidence_media, current_user = null }) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();
        const normalizedStatus = String(status || 'CONFIRMED').toUpperCase();
        if (!['CONFIRMED', 'DISPUTED'].includes(normalizedStatus)) {
            const err = new Error('Trạng thái xác nhận lương chỉ chấp nhận CONFIRMED hoặc DISPUTED!');
            err.statusCode = 400;
            throw err;
        }

        if (normalizedStatus === 'DISPUTED' && (!dispute_reason || !String(dispute_reason).trim())) {
            const err = new Error('Vui lòng nhập lý do khiếu nại sai lương!');
            err.statusCode = 400;
            throw err;
        }

        // Bảo vệ dung lượng TiDB Cloud: Giới hạn media minh chứng <= 800KB binary (~1.1MB chuỗi Base64)
        if (dispute_evidence_media && typeof dispute_evidence_media === 'string') {
            if (dispute_evidence_media.length > 1150000) {
                const err = new Error('Tệp hình ảnh / video minh chứng vượt quá giới hạn 800KB cho phép! Vui lòng chọn tệp ngắn hơn hoặc nén ảnh.');
                err.statusCode = 400;
                throw err;
            }
        }

        await withTransaction(async (txQuery) => {
            const existingRows = await txQuery(
                'SELECT salary_confirm_status FROM attendance WHERE ma_nv = ? AND thang = ? AND nam = ? FOR UPDATE',
                [ma_nv, m, y]
            );
            const currentStatus = existingRows && existingRows.length > 0 ? existingRows[0].salary_confirm_status : null;

            if (normalizedStatus === 'DISPUTED' && currentStatus === 'DISPUTED') {
                const err = new Error(`Bạn đã gửi khiếu nại bảng lương Tháng ${m}/${y} trước đó và đang chờ giải quyết. Vui lòng không gửi trùng!`);
                err.statusCode = 409;
                err.code = 'DUPLICATE_SALARY_DISPUTE';
                throw err;
            }

            await txQuery(`
                INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, salary_confirm_status, dispute_reason, dispute_evidence_media, confirmed_at)
                VALUES (?, ?, ?, 26, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    salary_confirm_status = VALUES(salary_confirm_status),
                    dispute_reason = VALUES(dispute_reason),
                    dispute_evidence_media = COALESCE(VALUES(dispute_evidence_media), dispute_evidence_media),
                    confirmed_at = NOW()
            `, [
                ma_nv,
                m,
                y,
                normalizedStatus,
                normalizedStatus === 'DISPUTED' ? String(dispute_reason).trim() : null,
                normalizedStatus === 'DISPUTED' ? (dispute_evidence_media || null) : null
            ]);
        });

        await logAuditEvent({
            actor_id: ma_nv,
            actor_role: current_user ? current_user.role : 'worker',
            action: normalizedStatus === 'DISPUTED' ? 'SALARY_DISPUTED' : 'SALARY_CONFIRMED',
            resource: 'payroll',
            details: {
                ma_nv,
                month: m,
                year: y,
                status: normalizedStatus,
                dispute_reason: normalizedStatus === 'DISPUTED' ? String(dispute_reason).trim() : undefined,
                has_evidence_media: Boolean(dispute_evidence_media)
            }
        });

        return {
            success: true,
            salary_confirm_status: normalizedStatus,
            message: normalizedStatus === 'CONFIRMED'
                ? `Đã xác nhận đúng bảng lương Tháng ${m}/${y}!`
                : `Đã gửi báo cáo sai lương Tháng ${m}/${y} kèm minh chứng tới Phòng Kế Toán & Ban Giám Đốc!`
        };
    }

    async resolveSalaryDispute({ ma_nv, month, year, admin_response, new_status = 'CONFIRMED', current_user = null }) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();

        await query(`
            INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, salary_confirm_status, admin_response)
            VALUES (?, ?, ?, 26, ?, ?)
            ON DUPLICATE KEY UPDATE
                salary_confirm_status = VALUES(salary_confirm_status),
                admin_response = VALUES(admin_response)
        `, [ma_nv, m, y, new_status, admin_response || 'Đã kiểm tra và xử lý điều chỉnh lương.']);

        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'RESOLVE_SALARY_DISPUTE',
            resource: 'payroll',
            details: { target_ma_nv: ma_nv, month: m, year: y, new_status, admin_response }
        });

        return {
            success: true,
            message: `Đã phản hồi và xử lý khiếu nại lương của nhân viên ${ma_nv} (Tháng ${m}/${y})!`
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
