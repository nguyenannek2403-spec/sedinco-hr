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
                   a.dispute_reason, a.dispute_evidence_media, a.admin_response, a.confirmed_at,
                   COALESCE(a.bonus_amount, 0) as bonus_amount,
                   COALESCE(a.penalty_amount, 0) as penalty_amount,
                   COALESCE(a.advance_deduction, 0) as advance_deduction,
                   a.adjustment_note
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
                companySettings,
                bonusAmount: Number(emp.bonus_amount) || 0,
                penaltyAmount: Number(emp.penalty_amount) || 0,
                advanceDeduction: Number(emp.advance_deduction) || 0
            });

            const bonusAmount = Number(emp.bonus_amount) || 0;
            const penaltyAmount = Number(emp.penalty_amount) || 0;
            const advanceDeduction = Number(emp.advance_deduction) || 0;
            const hasManualNet = calc.bonusAmount !== undefined;
            const finalNetSalary = hasManualNet
                ? calc.netSalary
                : Math.max(0, Math.round((calc.netSalary || 0) + bonusAmount - penaltyAmount - advanceDeduction));

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
                lateOccurrences: calc.lateOccurrences || 0,
                billableLateOccurrences: calc.billableLateOccurrences || 0,
                latePolicyType: calc.latePolicyType || 'PER_MINUTE',
                latePenaltyAmount: calc.latePenaltyAmount || 0,
                salaryByWork: calc.salaryByWork,
                totalAllowance: calc.totalAllowance,
                allowances_breakdown: calc.allowances_breakdown,
                otAmount: calc.otAmount,
                bonusAmount,
                penaltyAmount,
                advanceDeduction,
                adjustment_note: emp.adjustment_note || null,
                totalInsurance: calc.totalInsurance,
                grossSalary: calc.grossSalary,
                netSalary: finalNetSalary,
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
                   a.dispute_reason, a.dispute_evidence_media, a.admin_response, a.confirmed_at,
                   COALESCE(a.bonus_amount, 0) as bonus_amount,
                   COALESCE(a.penalty_amount, 0) as penalty_amount,
                   COALESCE(a.advance_deduction, 0) as advance_deduction,
                   a.adjustment_note
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
            companySettings,
            bonusAmount: Number(emp.bonus_amount) || 0,
            penaltyAmount: Number(emp.penalty_amount) || 0,
            advanceDeduction: Number(emp.advance_deduction) || 0
        });

        const bonusAmount = Number(emp.bonus_amount) || 0;
        const penaltyAmount = Number(emp.penalty_amount) || 0;
        const advanceDeduction = Number(emp.advance_deduction) || 0;
        const hasManualNet = calc.bonusAmount !== undefined;
        const finalNetSalary = hasManualNet
            ? calc.netSalary
            : Math.max(0, Math.round((calc.netSalary || 0) + bonusAmount - penaltyAmount - advanceDeduction));

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
            lateOccurrences: calc.lateOccurrences || 0,
            billableLateOccurrences: calc.billableLateOccurrences || 0,
            latePolicyType: calc.latePolicyType || 'PER_MINUTE',
            latePenaltyAmount: calc.latePenaltyAmount || 0,
            salaryByWork: calc.salaryByWork,
            totalAllowance: calc.totalAllowance,
            allowances_breakdown: calc.allowances_breakdown,
            otAmount: calc.otAmount,
            bonusAmount,
            penaltyAmount,
            advanceDeduction,
            adjustment_note: emp.adjustment_note || null,
            totalInsurance: calc.totalInsurance,
            grossSalary: calc.grossSalary,
            netSalary: finalNetSalary,
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

    async adjustSalary({ ma_nv, month, year, bonus_amount = 0, penalty_amount = 0, advance_deduction = 0, adjustment_note = '', current_user = null }) {
        if (!ma_nv) {
            const err = new Error('Thiếu mã nhân viên cần điều chỉnh lương!');
            err.statusCode = 400;
            throw err;
        }
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();

        const empRows = await query('SELECT ma_nv FROM employees WHERE ma_nv = ? LIMIT 1', [ma_nv]);
        if (!empRows || empRows.length === 0) {
            const err = new Error(`Không tìm thấy nhân viên ${ma_nv}!`);
            err.statusCode = 404;
            throw err;
        }

        const lockRows = await query('SELECT is_locked FROM period_locks WHERE month = ? AND year = ? LIMIT 1', [m, y]);
        if (lockRows && lockRows.length > 0 && Boolean(lockRows[0].is_locked)) {
            const err = new Error(`Kỳ công Tháng ${m}/${y} đã bị KHÓA SỔ. Không thể điều chỉnh thưởng/phạt!`);
            err.statusCode = 400;
            err.code = 'PERIOD_LOCKED';
            throw err;
        }

        const cleanBonus = Math.max(0, Math.round(Number(bonus_amount) || 0));
        const cleanPenalty = Math.max(0, Math.round(Number(penalty_amount) || 0));
        const cleanAdvance = Math.max(0, Math.round(Number(advance_deduction) || 0));
        const cleanNote = adjustment_note ? String(adjustment_note).trim().slice(0, 255) : null;

        const csRows = await query('SELECT standard_work_days FROM company_settings LIMIT 1').catch(() => []);
        const stdDays = (csRows && csRows[0] && Number(csRows[0].standard_work_days)) || 26;

        await query(`
            INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, bonus_amount, penalty_amount, advance_deduction, adjustment_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                bonus_amount = VALUES(bonus_amount),
                penalty_amount = VALUES(penalty_amount),
                advance_deduction = VALUES(advance_deduction),
                adjustment_note = VALUES(adjustment_note)
        `, [ma_nv, m, y, stdDays, cleanBonus, cleanPenalty, cleanAdvance, cleanNote]);

        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'ADJUST_PAYROLL_ITEM',
            resource: 'payroll',
            details: {
                target_ma_nv: ma_nv,
                month: m,
                year: y,
                bonus_amount: cleanBonus,
                penalty_amount: cleanPenalty,
                advance_deduction: cleanAdvance,
                adjustment_note: cleanNote
            }
        });

        const updatedSlip = await this.getMyPayroll(ma_nv, m, y);
        return {
            success: true,
            message: `Đã lưu điều chỉnh lương cho ${ma_nv} (Tháng ${m}/${y})!`,
            data: updatedSlip
        };
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
