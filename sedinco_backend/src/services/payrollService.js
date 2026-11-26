const { query, withTransaction } = require('../config/db');
const { calculateEmployeeSalary } = require('../utils/payrollCalculator');
const { logAuditEvent } = require('../middlewares/authMiddleware');
const { formatVietnamDateTime, getMonthlyStandardWorkdays } = require('../utils/timeHelper');

function parseEmployeeCustomAllowances(emp) {
    if (!emp || emp.custom_allowances === undefined || emp.custom_allowances === null) return null;
    if (Array.isArray(emp.custom_allowances)) return emp.custom_allowances;
    if (typeof emp.custom_allowances === 'string' && emp.custom_allowances.trim()) {
        try {
            const parsed = JSON.parse(emp.custom_allowances);
            return Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }
    return null;
}

function getMonthDateBounds(month, year) {
    const mm = String(month).padStart(2, '0');
    const startDateStr = `${year}-${mm}-01`;
    const nextM = month === 12 ? 1 : month + 1;
    const nextY = month === 12 ? year + 1 : year;
    const endDateStr = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
    return { startDateStr, endDateStr };
}

function formatViCurrencyServer(amount) {
    const rounded = Math.round(Number(amount) || 0);
    const sign = rounded < 0 ? '-' : '';
    const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${digits} đ`;
}

function resolveIsOpenDispute(row = {}) {
    const disputeStatusRaw = String(row.dispute_status || '').trim().toUpperCase();
    if (disputeStatusRaw === 'RESOLVED') return false;
    if (disputeStatusRaw === 'OPEN') return true;
    const payoutRaw = String(row.payout_status || '').trim().toUpperCase();
    const confirmRaw = String(row.salary_confirm_status || '').trim().toUpperCase();
    return payoutRaw === 'DISPUTED' || confirmRaw === 'DISPUTED';
}

function resolveEffectivePayoutStatus(row = {}, periodRow = null) {
    const payoutRaw = String(row.payout_status || '').trim().toUpperCase();
    const payRaw = String(row.employee_payment_status || row.payment_status || '').trim().toUpperCase();
    const confirmRaw = String(row.salary_confirm_status || '').trim().toUpperCase();
    const isResolved = String(row.dispute_status || '').trim().toUpperCase() === 'RESOLVED';
    if (payoutRaw === 'RECEIVED' || Boolean(row.received_at)) return 'RECEIVED';
    if (payoutRaw === 'PAID' || payRaw === 'PAID' || periodRow?.payment_status === 'PAID') return 'PAID';
    if (!isResolved && (payoutRaw === 'DISPUTED' || confirmRaw === 'DISPUTED')) return 'DISPUTED';
    if (payoutRaw === 'CONFIRMED' || confirmRaw === 'CONFIRMED') return 'CONFIRMED';
    if (payoutRaw === 'REPORT_SENT') return 'REPORT_SENT';
    return 'DRAFT';
}

class PayrollService {
    async calculateMonthlyPayroll(month, year, pagination = {}) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();
        const maxCap = pagination.exportAll ? 5000 : 200;
        const limit = Math.min(maxCap, Math.max(1, parseInt(pagination.limit, 10) || maxCap));
        const page = Math.max(1, parseInt(pagination.page, 10) || 1);
        const offset = (page - 1) * limit;

        const csRows = await query('SELECT * FROM company_settings LIMIT 1').catch(() => []);
        const companySettings = (csRows && csRows[0]) ? csRows[0] : {};
        const defaultStandardDays = getMonthlyStandardWorkdays(m, y);

        // V66: Nếu chế độ chấm công thủ công của Kế toán đang TẮT, đồng bộ an toàn các ngày tự động còn thiếu trước khi tính bảng lương tháng
        await require('./attendanceService').ensureAccountantAutoAttendanceForPeriod(m, y).catch(() => {});

        const sql = `
            SELECT e.*, ? as cong_chuan,
                   COALESCE(a.salary_confirm_status, 'PENDING') as salary_confirm_status,
                   COALESCE(a.payout_status, 'DRAFT') as payout_status,
                   a.report_sent_at, a.dispute_note, a.transfer_note, a.received_at,
                   a.dispute_reason, a.dispute_evidence_media, a.admin_response, a.confirmed_at,
                   a.dispute_status, a.dispute_resolved_at, a.dispute_resolved_note,
                   COALESCE(a.bonus_amount, 0) as bonus_amount,
                   COALESCE(a.penalty_amount, 0) as penalty_amount,
                   COALESCE(a.advance_deduction, 0) as advance_deduction,
                   a.adjustment_note,
                   COALESCE(a.payment_status, 'UNPAID') as employee_payment_status,
                   a.paid_at as employee_paid_at,
                   a.paid_by as employee_paid_by
            FROM employees e 
            LEFT JOIN attendance a ON e.ma_nv = a.ma_nv AND a.thang = ? AND a.nam = ?
            WHERE (e.role IS NULL OR e.role != 'admin')
            ORDER BY e.ma_nv ASC
            LIMIT ? OFFSET ?
        `;
        const emps = await query(sql, [defaultStandardDays, m, y, limit, offset]);
        if (!emps || emps.length === 0) return [];

        const periodRows = await query(
            'SELECT status, payment_status FROM payroll_periods WHERE month = ? AND year = ? LIMIT 1',
            [m, y]
        ).catch(() => []);
        const periodRow = (periodRows && periodRows[0]) ? periodRows[0] : null;

        const holidays = await query("SELECT id, holiday_name, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date, COALESCE(salary_multiplier, 3.00) as salary_multiplier FROM public_holidays ORDER BY start_date ASC");
        const safeHolidays = holidays || [];

        const { startDateStr, endDateStr } = getMonthDateBounds(m, y);
        const maNvs = emps.map((e) => e.ma_nv);
        const placeholders = maNvs.map(() => '?').join(',');

        const logs = await query(
            `SELECT employee_id, DATE_FORMAT(record_date, "%Y-%m-%d") as record_date_iso, record_date,
                    status, ot_hours, check_in_time, check_out_time, late_minutes, early_leave_minutes, work_hours,
                    COALESCE(morning_worked_minutes, 0) as morning_worked_minutes,
                    COALESCE(afternoon_worked_minutes, 0) as afternoon_worked_minutes,
                    work_credit, duration_status, location_name, work_location_type,
                    proxy_by, proxy_note,
                    DAYOFWEEK(record_date) as dow
             FROM attendance_logs
             WHERE employee_id IN (${placeholders}) AND record_date >= ? AND record_date < ?
             ORDER BY record_date ASC`,
            [...maNvs, startDateStr, endDateStr]
        );
        const safeLogs = logs || [];

        const otRegs = await query(
            `SELECT employee_id, work_date, expected_hours, status FROM ot_registrations WHERE employee_id IN (${placeholders}) AND work_date >= ? AND work_date < ? AND status = ?`,
            [...maNvs, startDateStr, endDateStr, 'approved']
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
                cong_chuan: defaultStandardDays,
                month: m,
                year: y,
                ngay_chinh_thuc: emp.ngay_chinh_thuc,
                status: emp.status,
                chuc_danh: emp.chuc_danh,
                logs: empLogs,
                holidays: safeHolidays,
                allowances: allowances,
                custom_allowances: parseEmployeeCustomAllowances(emp),
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
            const allowNegative = calc.negativeSalaryPolicy === 'SHOW_NEGATIVE';
            const fallbackRawNet = Math.round((calc.netSalary || 0) + bonusAmount - penaltyAmount - advanceDeduction);
            const finalNetSalary = hasManualNet
                ? calc.netSalary
                : (allowNegative ? fallbackRawNet : Math.max(0, fallbackRawNet));

            return {
                id_nhan_vien: emp.ma_nv,
                ma_nv: emp.ma_nv,
                ho_ten: emp.ho_ten,
                chuc_danh: emp.chuc_danh,
                department: emp.department || 'Khối Công trình',
                role: emp.role,
                avatar_url: emp.avatar_url || null,
                thang: m,
                nam: y,
                baseSalary: calc.baseSalary,
                standardWorkDays: calc.standardWorkDays,
                unitDailyWage: calc.unitDailyWage,
                probationPercent: calc.probationPercent,
                insuranceRatePercent: calc.insuranceRatePercent,
                otRateWeekday: calc.otRateWeekday,
                otRateWeekend: calc.otRateWeekend,
                congThuViec: calc.congThuViec,
                congChinhThuc: calc.congChinhThuc,
                workedDays: calc.workedDays,
                paidLeaveDays: calc.paidLeaveDays,
                holidayDays: calc.holidayDays,
                totalOtHours: calc.totalOtHours,
                totalWorkDays: calc.totalWorkDays,
                actualWorkDays: calc.actualWorkDays,
                daily_logs: calc.daily_breakdown || empLogs,
                totalLateMinutes: calc.totalLateMinutes,
                lateOccurrences: calc.lateOccurrences || 0,
                billableLateOccurrences: calc.billableLateOccurrences || 0,
                latePolicyType: calc.latePolicyType || 'PER_MINUTE',
                latePenaltyAmount: calc.latePenaltyAmount || 0,
                salaryByWork: calc.salaryByWork,
                totalAllowance: calc.totalAllowance,
                total_allowance: calc.total_allowance ?? calc.totalAllowance ?? 0,
                allowances: calc.allowances || [],
                allowances_breakdown: calc.allowances_breakdown,
                holidayWorkAmount: calc.holidayWorkAmount || 0,
                holidayWorkDays: calc.holidayWorkDays || 0,
                holidayWorkBreakdown: calc.holidayWorkBreakdown || [],
                otAmount: calc.otAmount,
                bonusAmount,
                penaltyAmount,
                advanceDeduction,
                adjustment_note: emp.adjustment_note || null,
                totalInsurance: calc.totalInsurance,
                grossSalary: calc.grossSalary,
                rawNetSalary: calc.rawNetSalary !== undefined ? calc.rawNetSalary : finalNetSalary,
                netSalary: finalNetSalary,
                carryOverDebt: calc.carryOverDebt || 0,
                carry_over_debt: calc.carry_over_debt || 0,
                probationAllowanceFull: calc.probationAllowanceFull,
                otCalculationMode: calc.otCalculationMode,
                freeLateExemptsHalfday: calc.freeLateExemptsHalfday,
                negativeSalaryPolicy: calc.negativeSalaryPolicy,
                salary_confirm_status: emp.salary_confirm_status || 'PENDING',
                payout_status: resolveEffectivePayoutStatus(emp, periodRow),
                dispute_status: resolveIsOpenDispute(emp) ? 'OPEN' : (emp.dispute_status || null),
                dispute_resolved_at: emp.dispute_resolved_at || null,
                dispute_resolved_note: emp.dispute_resolved_note || null,
                report_sent_at: emp.report_sent_at || null,
                report_sent_at_vn: formatVietnamDateTime(emp.report_sent_at),
                dispute_reason: resolveIsOpenDispute(emp) ? (emp.dispute_reason || emp.dispute_note || null) : null,
                dispute_note: resolveIsOpenDispute(emp) ? (emp.dispute_note || emp.dispute_reason || null) : null,
                dispute_evidence_media: resolveIsOpenDispute(emp) ? (emp.dispute_evidence_media || null) : null,
                admin_response: resolveIsOpenDispute(emp) ? (emp.admin_response || null) : null,
                confirmed_at: emp.confirmed_at || null,
                confirmed_at_vn: formatVietnamDateTime(emp.confirmed_at),
                received_at: emp.received_at || null,
                received_at_vn: formatVietnamDateTime(emp.received_at),
                transfer_note: emp.transfer_note || null,
                bank_code: emp.bank_code || null,
                bank_name: emp.bank_name || null,
                bank_account_number: emp.bank_account_number || null,
                bank_account_name: emp.bank_account_name || null,
                payroll_period_status: periodRow?.status || 'DRAFT',
                payment_status: periodRow?.payment_status || 'UNPAID',
                employee_payment_status:
                    emp.employee_payment_status === 'PAID' || periodRow?.payment_status === 'PAID'
                        ? 'PAID'
                        : 'UNPAID',
                employee_paid_at: emp.employee_paid_at || null,
                employee_paid_at_vn: formatVietnamDateTime(emp.employee_paid_at),
                employee_paid_by: emp.employee_paid_by || null,
                warning: calc.warning || null
            };
        });
    }

    async getMyPayroll(ma_nv, month, year) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();

        const csRows = await query('SELECT * FROM company_settings LIMIT 1').catch(() => []);
        const companySettings = (csRows && csRows[0]) ? csRows[0] : {};
        const defaultStandardDays = getMonthlyStandardWorkdays(m, y);

        // V66: Nếu chế độ chấm công thủ công của Kế toán đang TẮT, đồng bộ an toàn các ngày tự động còn thiếu trước khi tính bảng lương tháng
        await require('./attendanceService').ensureAccountantAutoAttendanceForPeriod(m, y).catch(() => {});

        const sql = `
            SELECT e.*, ? as cong_chuan,
                   COALESCE(a.salary_confirm_status, 'PENDING') as salary_confirm_status,
                   COALESCE(a.payout_status, 'DRAFT') as payout_status,
                   a.report_sent_at, a.dispute_note, a.transfer_note, a.received_at,
                   a.dispute_reason, a.dispute_evidence_media, a.admin_response, a.confirmed_at,
                   a.dispute_status, a.dispute_resolved_at, a.dispute_resolved_note,
                   COALESCE(a.bonus_amount, 0) as bonus_amount,
                   COALESCE(a.penalty_amount, 0) as penalty_amount,
                   COALESCE(a.advance_deduction, 0) as advance_deduction,
                   a.adjustment_note,
                   COALESCE(a.payment_status, 'UNPAID') as employee_payment_status,
                   a.paid_at as employee_paid_at,
                   a.paid_by as employee_paid_by
            FROM employees e 
            LEFT JOIN attendance a ON e.ma_nv = a.ma_nv AND a.thang = ? AND a.nam = ?
            WHERE e.ma_nv = ?
            LIMIT 1
        `;
        const emps = await query(sql, [defaultStandardDays, m, y, ma_nv]);
        if (!emps || emps.length === 0) return null;

        const emp = emps[0];
        if (emp.role === 'admin') return null;
        if (emp.role === 'accountant') {
            await require('./attendanceService').ensureAccountantAutoAttendanceForPeriod(m, y, emp.ma_nv).catch(() => {});
        }
        const holidays = await query("SELECT id, holiday_name, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date, COALESCE(salary_multiplier, 3.00) as salary_multiplier FROM public_holidays ORDER BY start_date ASC");
        const safeHolidays = holidays || [];

        const { startDateStr, endDateStr } = getMonthDateBounds(m, y);

        const [logs, otRegs, lockRows, periodRows] = await Promise.all([
            query(
                `SELECT employee_id, DATE_FORMAT(record_date, "%Y-%m-%d") as record_date_iso, record_date,
                        status, ot_hours, check_in_time, check_out_time, late_minutes, early_leave_minutes, work_hours,
                        COALESCE(morning_worked_minutes, 0) as morning_worked_minutes,
                        COALESCE(afternoon_worked_minutes, 0) as afternoon_worked_minutes,
                        work_credit, duration_status, location_name, work_location_type,
                        proxy_by, proxy_note,
                        DAYOFWEEK(record_date) as dow
                 FROM attendance_logs
                 WHERE employee_id = ? AND record_date >= ? AND record_date < ?
                 ORDER BY record_date ASC`,
                [ma_nv, startDateStr, endDateStr]
            ),
            query(
                'SELECT employee_id, work_date, expected_hours, status FROM ot_registrations WHERE employee_id = ? AND work_date >= ? AND work_date < ? AND status = ?',
                [ma_nv, startDateStr, endDateStr, 'approved']
            ),
            query('SELECT is_locked, locked_by, locked_at FROM period_locks WHERE month = ? AND year = ? LIMIT 1', [m, y]).catch(() => []),
            query('SELECT status, payment_status FROM payroll_periods WHERE month = ? AND year = ? LIMIT 1', [m, y]).catch(() => [])
        ]);
        const safeLogs = logs || [];
        const safeOtRegs = otRegs || [];
        const lockRow = (lockRows && lockRows[0]) ? lockRows[0] : null;
        const periodRow = (periodRows && periodRows[0]) ? periodRows[0] : null;

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
            cong_chuan: defaultStandardDays,
            month: m,
            year: y,
            ngay_chinh_thuc: emp.ngay_chinh_thuc,
            status: emp.status,
            chuc_danh: emp.chuc_danh,
            logs: safeLogs,
            holidays: safeHolidays,
            allowances: allowances,
            custom_allowances: parseEmployeeCustomAllowances(emp),
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
        const allowNegative = calc.negativeSalaryPolicy === 'SHOW_NEGATIVE';
        const fallbackRawNet = Math.round((calc.netSalary || 0) + bonusAmount - penaltyAmount - advanceDeduction);
        const finalNetSalary = hasManualNet
            ? calc.netSalary
            : (allowNegative ? fallbackRawNet : Math.max(0, fallbackRawNet));

        return {
            id_nhan_vien: emp.ma_nv,
            ma_nv: emp.ma_nv,
            ho_ten: emp.ho_ten,
            chuc_danh: emp.chuc_danh,
            department: emp.department || 'Khối Công trình',
            avatar_url: emp.avatar_url || null,
            thang: m,
            nam: y,
            baseSalary: calc.baseSalary,
            standardWorkDays: calc.standardWorkDays,
            unitDailyWage: calc.unitDailyWage,
            probationPercent: calc.probationPercent,
            insuranceRatePercent: calc.insuranceRatePercent,
            congThuViec: calc.congThuViec,
            congChinhThuc: calc.congChinhThuc,
            workedDays: calc.workedDays,
            paidLeaveDays: calc.paidLeaveDays,
            holidayDays: calc.holidayDays,
            totalOtHours: calc.totalOtHours,
            totalWorkDays: calc.totalWorkDays,
            actualWorkDays: calc.actualWorkDays,
            totalLateMinutes: calc.totalLateMinutes,
            lateOccurrences: calc.lateOccurrences || 0,
            billableLateOccurrences: calc.billableLateOccurrences || 0,
            latePolicyType: calc.latePolicyType || 'PER_MINUTE',
            latePenaltyAmount: calc.latePenaltyAmount || 0,
            salaryByWork: calc.salaryByWork,
            totalAllowance: calc.totalAllowance,
            total_allowance: calc.total_allowance ?? calc.totalAllowance ?? 0,
            allowances: calc.allowances || [],
            allowances_breakdown: calc.allowances_breakdown,
            holidayWorkAmount: calc.holidayWorkAmount || 0,
            holidayWorkDays: calc.holidayWorkDays || 0,
            holidayWorkBreakdown: calc.holidayWorkBreakdown || [],
            period_locked: Boolean(lockRow && lockRow.is_locked),
            payroll_period_status: periodRow?.status || 'DRAFT',
            payment_status: periodRow?.payment_status || 'UNPAID',
            otAmount: calc.otAmount,
            bonusAmount,
            penaltyAmount,
            advanceDeduction,
            adjustment_note: emp.adjustment_note || null,
            totalInsurance: calc.totalInsurance,
            grossSalary: calc.grossSalary,
            rawNetSalary: calc.rawNetSalary !== undefined ? calc.rawNetSalary : finalNetSalary,
            netSalary: finalNetSalary,
            carryOverDebt: calc.carryOverDebt || 0,
            carry_over_debt: calc.carry_over_debt || 0,
            probationAllowanceFull: calc.probationAllowanceFull,
            otCalculationMode: calc.otCalculationMode,
            freeLateExemptsHalfday: calc.freeLateExemptsHalfday,
            negativeSalaryPolicy: calc.negativeSalaryPolicy,
            salary_confirm_status: emp.salary_confirm_status || 'PENDING',
            payout_status: resolveEffectivePayoutStatus(emp, periodRow),
            dispute_status: resolveIsOpenDispute(emp) ? 'OPEN' : (emp.dispute_status || null),
            dispute_resolved_at: emp.dispute_resolved_at || null,
            dispute_resolved_note: emp.dispute_resolved_note || null,
            report_sent_at: emp.report_sent_at || null,
            report_sent_at_vn: formatVietnamDateTime(emp.report_sent_at),
            dispute_reason: resolveIsOpenDispute(emp) ? (emp.dispute_reason || emp.dispute_note || null) : null,
            dispute_note: resolveIsOpenDispute(emp) ? (emp.dispute_note || emp.dispute_reason || null) : null,
            dispute_evidence_media: resolveIsOpenDispute(emp) ? (emp.dispute_evidence_media || null) : null,
            admin_response: resolveIsOpenDispute(emp) ? (emp.admin_response || null) : null,
            confirmed_at: emp.confirmed_at || null,
            confirmed_at_vn: formatVietnamDateTime(emp.confirmed_at),
            received_at: emp.received_at || null,
            received_at_vn: formatVietnamDateTime(emp.received_at),
            transfer_note: emp.transfer_note || null,
            bank_code: emp.bank_code || null,
            bank_name: emp.bank_name || null,
            bank_account_number: emp.bank_account_number || null,
            bank_account_name: emp.bank_account_name || null,
            employee_payment_status:
                emp.employee_payment_status === 'PAID' || periodRow?.payment_status === 'PAID'
                    ? 'PAID'
                    : 'UNPAID',
            employee_paid_at: emp.employee_paid_at || null,
            employee_paid_at_vn: formatVietnamDateTime(emp.employee_paid_at),
            employee_paid_by: emp.employee_paid_by || null,
            warning: calc.warning || null,
            daily_logs: calc.daily_breakdown || safeLogs
        };
    }

    async getEmployeePayrollDetail(ma_nv, month, year) {
        const cleanMaNv = String(ma_nv || '').trim();
        if (!cleanMaNv) {
            const err = new Error('Thiếu mã nhân viên cần tra cứu phiếu lương!');
            err.statusCode = 400;
            throw err;
        }
        const empRows = await query('SELECT ma_nv, role FROM employees WHERE ma_nv = ? LIMIT 1', [cleanMaNv]);
        if (!empRows || empRows.length === 0) {
            const err = new Error(`Không tìm thấy nhân viên ${cleanMaNv}!`);
            err.statusCode = 404;
            throw err;
        }
        if (empRows[0].role === 'admin') {
            const err = new Error('Tài khoản Quản trị viên không tham gia bảng lương cá nhân!');
            err.statusCode = 400;
            throw err;
        }
        return this.getMyPayroll(cleanMaNv, month, year);
    }

    async confirmOrDisputeSalary({ ma_nv, month, year, status, action, note, dispute_reason, dispute_evidence_media, current_user = null }) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();

        const targetEmpRows = await query('SELECT ma_nv, ho_ten, role FROM employees WHERE ma_nv = ? LIMIT 1', [ma_nv]);
        if (targetEmpRows && targetEmpRows[0] && targetEmpRows[0].role === 'admin') {
            const err = new Error('Tài khoản Quản trị viên không tham gia bảng lương cá nhân!');
            err.statusCode = 403;
            throw err;
        }
        const empName = (targetEmpRows && targetEmpRows[0] && targetEmpRows[0].ho_ten) || ma_nv;

        const rawAction = String(action || status || 'CONFIRM_REPORT').trim().toUpperCase();
        const isConfirmReceived = rawAction === 'CONFIRM_RECEIVED' || rawAction === 'RECEIVED';
        const isConfirmReport = rawAction === 'CONFIRM_REPORT' || rawAction === 'CONFIRM' || rawAction === 'CONFIRMED';
        const normalizedStatus = isConfirmReceived
            ? 'RECEIVED'
            : isConfirmReport
                ? 'CONFIRMED'
                : (rawAction === 'DISPUTE' || rawAction === 'DISPUTED')
                    ? 'DISPUTED'
                    : rawAction;

        if (!['CONFIRMED', 'DISPUTED', 'RECEIVED'].includes(normalizedStatus)) {
            const err = new Error('Trạng thái xác nhận lương không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }

        const rawNoteText = (note !== undefined && note !== null && String(note).trim())
            ? String(note).trim()
            : (dispute_reason ? String(dispute_reason).trim() : '');

        if (normalizedStatus === 'DISPUTED' && !rawNoteText) {
            const err = new Error('Vui lòng nhập lý do khiếu nại sai lương!');
            err.statusCode = 400;
            throw err;
        }

        // Bảo vệ dung lượng TiDB Cloud & xác thực tệp minh chứng:
        // Video / ảnh / tài liệu phải đi qua /api/media/upload (Cloudinary hoặc compact image fallback), không lưu data:video thô vào DB.
        let validatedDisputeMedia = null;
        if (dispute_evidence_media && typeof dispute_evidence_media === 'string') {
            const { validateMediaReference } = require('../utils/mediaValidator');
            validatedDisputeMedia = validateMediaReference(dispute_evidence_media, {
                maxInlineBytes: 185 * 1024,
                allowNull: true
            });
        }

        const stdDays = getMonthlyStandardWorkdays(m, y);

        let finalPayoutStatus = normalizedStatus;
        let savedReceivedAt = null;
        await withTransaction(async (txQuery) => {
            const existingRows = await txQuery(
                'SELECT id, salary_confirm_status, payout_status, payment_status, dispute_status, received_at FROM attendance WHERE ma_nv = ? AND thang = ? AND nam = ? FOR UPDATE',
                [ma_nv, m, y]
            );
            const existing = existingRows && existingRows[0] ? existingRows[0] : null;
            const periodRows = await txQuery('SELECT payment_status FROM payroll_periods WHERE month = ? AND year = ? LIMIT 1', [m, y]).catch(() => []);
            const periodPaid = Boolean(periodRows && periodRows[0] && periodRows[0].payment_status === 'PAID');
            const currentStatus = existing ? existing.salary_confirm_status : null;
            const currentPayout = existing ? existing.payout_status : null;
            const alreadyReceived = Boolean(existing && (existing.payout_status === 'RECEIVED' || existing.received_at));
            const alreadyPaid = Boolean(periodPaid || (existing && (existing.payout_status === 'PAID' || existing.payment_status === 'PAID' || alreadyReceived)));

            if (normalizedStatus === 'RECEIVED' && !alreadyPaid) {
                const err = new Error(`Khoản lương Tháng ${m}/${y} chưa được Quản trị viên xác nhận chuyển khoản!`);
                err.statusCode = 400;
                err.code = 'SALARY_NOT_PAID_YET';
                throw err;
            }

            if (normalizedStatus === 'DISPUTED' && resolveIsOpenDispute(existing || {}) && currentStatus === 'DISPUTED' && currentPayout === 'DISPUTED') {
                const err = new Error(`Bạn đã gửi khiếu nại bảng lương Tháng ${m}/${y} trước đó và đang chờ giải quyết. Vui lòng không gửi trùng!`);
                err.statusCode = 409;
                err.code = 'DUPLICATE_SALARY_DISPUTE';
                throw err;
            }

            const dbConfirmStatus = normalizedStatus === 'DISPUTED' ? 'DISPUTED' : 'CONFIRMED';
            finalPayoutStatus = normalizedStatus === 'RECEIVED'
                ? 'RECEIVED'
                : alreadyReceived
                    ? 'RECEIVED'
                    : alreadyPaid
                        ? 'PAID'
                        : normalizedStatus;
            const cleanDisputeNote = normalizedStatus === 'DISPUTED' ? rawNoteText : null;
            const nextDisputeStatus = normalizedStatus === 'DISPUTED' ? 'OPEN' : 'RESOLVED';
            const nowTs = new Date();
            if (normalizedStatus === 'RECEIVED') {
                savedReceivedAt = existing?.received_at || nowTs;
            } else if (existing?.received_at) {
                savedReceivedAt = existing.received_at;
            }

            await txQuery(`
                INSERT INTO attendance (
                    ma_nv, thang, nam, cong_chuan,
                    salary_confirm_status, payout_status,
                    dispute_status, dispute_resolved_at, dispute_resolved_note,
                    dispute_reason, dispute_note, dispute_evidence_media, confirmed_at, received_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
                ON DUPLICATE KEY UPDATE
                    cong_chuan = VALUES(cong_chuan),
                    salary_confirm_status = VALUES(salary_confirm_status),
                    payout_status = CASE
                        WHEN VALUES(payout_status) = 'RECEIVED' OR payout_status = 'RECEIVED' OR received_at IS NOT NULL THEN 'RECEIVED'
                        WHEN payout_status = 'PAID' OR payment_status = 'PAID' THEN 'PAID'
                        ELSE VALUES(payout_status)
                    END,
                    received_at = CASE
                        WHEN VALUES(received_at) IS NOT NULL THEN COALESCE(received_at, VALUES(received_at))
                        ELSE received_at
                    END,
                    dispute_status = CASE WHEN VALUES(salary_confirm_status) = 'DISPUTED' THEN 'OPEN' WHEN dispute_status = 'OPEN' THEN 'RESOLVED' ELSE dispute_status END,
                    dispute_resolved_at = CASE WHEN VALUES(salary_confirm_status) = 'DISPUTED' THEN NULL WHEN dispute_status = 'OPEN' THEN NOW() ELSE dispute_resolved_at END,
                    dispute_resolved_note = CASE WHEN VALUES(salary_confirm_status) = 'DISPUTED' THEN NULL ELSE dispute_resolved_note END,
                    dispute_reason = VALUES(dispute_reason),
                    dispute_note = VALUES(dispute_note),
                    dispute_evidence_media = CASE WHEN VALUES(salary_confirm_status) = 'DISPUTED' THEN COALESCE(VALUES(dispute_evidence_media), dispute_evidence_media) ELSE NULL END,
                    confirmed_at = COALESCE(confirmed_at, NOW())
            `, [
                ma_nv,
                m,
                y,
                stdDays,
                dbConfirmStatus,
                finalPayoutStatus,
                nextDisputeStatus,
                normalizedStatus === 'DISPUTED' ? null : nowTs,
                normalizedStatus !== 'DISPUTED' && existing && resolveIsOpenDispute(existing) ? 'Nhân viên đã xác nhận lại bảng lương' : null,
                cleanDisputeNote,
                cleanDisputeNote,
                normalizedStatus === 'DISPUTED' ? (validatedDisputeMedia || null) : null,
                normalizedStatus === 'RECEIVED' ? savedReceivedAt : null
            ]);

            if (normalizedStatus === 'DISPUTED' && validatedDisputeMedia) {
                const mediaLifecycleService = require('./mediaLifecycleService');
                await mediaLifecycleService.bindAssetToEntity({
                    mediaRef: validatedDisputeMedia,
                    entityType: 'salary_dispute',
                    entityId: `${ma_nv}_${y}_${m}`,
                    employeeId: ma_nv,
                    txQuery
                });
            }

            if (normalizedStatus !== 'DISPUTED' && existing?.id) {
                await txQuery(
                    `UPDATE user_notifications SET is_read = 1, read_at = NOW() WHERE alert_key IN (?, ?) AND is_read = 0`,
                    [`dispute:${existing.id}`, `salary_confirm_admin_${m}_${y}_${ma_nv}`]
                ).catch(() => {});
            }

            const notifAlertKey = normalizedStatus === 'RECEIVED'
                ? `salary_received_admin_${m}_${y}_${ma_nv}`
                : `salary_confirm_admin_${m}_${y}_${ma_nv}`;
            const notifType = normalizedStatus === 'RECEIVED'
                ? 'SALARY_RECEIVED'
                : normalizedStatus === 'CONFIRMED'
                    ? 'SALARY_CONFIRMED'
                    : 'SALARY_DISPUTED';
            const notifTitle = normalizedStatus === 'RECEIVED'
                ? `💰 ${empName} (${ma_nv}) đã nhận đủ lương T${m}/${y}`
                : normalizedStatus === 'CONFIRMED'
                    ? `✓ ${empName} (${ma_nv}) đã đọc báo cáo lương T${m}/${y}`
                    : `⚠️ ${empName} (${ma_nv}) báo sai sót lương T${m}/${y}`;
            const notifMessage = normalizedStatus === 'RECEIVED'
                ? `${empName} (${ma_nv}) đã xác nhận nhận đủ lương Tháng ${m}/${y}.`
                : normalizedStatus === 'CONFIRMED'
                    ? `${empName} (${ma_nv}) đã xác nhận đã đọc báo cáo lương Tháng ${m}/${y}.`
                    : `${empName} (${ma_nv}) báo sai sót lương Tháng ${m}/${y}: "${cleanDisputeNote}"`;

            await txQuery(`
                INSERT INTO user_notifications (
                    recipient_ma_nv, alert_key, type, category, severity,
                    title, message, ref_month, ref_year,
                    target_ma_nv, target_tab, target_subtab, target_id, is_read, read_at, created_at
                )
                VALUES ('ADMIN', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'management', 'payroll', ?, 0, NULL, NOW())
                ON DUPLICATE KEY UPDATE
                    type = VALUES(type),
                    category = VALUES(category),
                    severity = VALUES(severity),
                    title = VALUES(title),
                    message = VALUES(message),
                    target_tab = VALUES(target_tab),
                    target_subtab = VALUES(target_subtab),
                    target_id = VALUES(target_id),
                    is_read = 0,
                    read_at = NULL,
                    created_at = NOW()
            `, [
                notifAlertKey,
                notifType,
                normalizedStatus === 'DISPUTED' ? 'salary_dispute' : 'salary_confirm',
                normalizedStatus === 'DISPUTED' ? 'high' : 'info',
                notifTitle.slice(0, 255),
                notifMessage.slice(0, 1000),
                m,
                y,
                ma_nv,
                `${m}-${y}`
            ]);
        });

        await logAuditEvent({
            actor_id: ma_nv,
            actor_role: current_user ? current_user.role : 'worker',
            action: normalizedStatus === 'RECEIVED'
                ? 'SALARY_RECEIVED'
                : normalizedStatus === 'DISPUTED'
                    ? 'SALARY_DISPUTED'
                    : 'SALARY_CONFIRMED',
            resource: 'payroll',
            details: {
                ma_nv,
                month: m,
                year: y,
                status: normalizedStatus,
                payout_status: finalPayoutStatus,
                dispute_reason: normalizedStatus === 'DISPUTED' ? rawNoteText : undefined,
                has_evidence_media: Boolean(dispute_evidence_media)
            }
        });

        return {
            success: true,
            salary_confirm_status: normalizedStatus === 'DISPUTED' ? 'DISPUTED' : 'CONFIRMED',
            payout_status: finalPayoutStatus,
            received_at: savedReceivedAt || null,
            received_at_vn: formatVietnamDateTime(savedReceivedAt),
            message: normalizedStatus === 'RECEIVED'
                ? `Đã xác nhận nhận đủ lương Tháng ${m}/${y}!`
                : normalizedStatus === 'CONFIRMED'
                    ? `Đã xác nhận đã đọc báo cáo lương Tháng ${m}/${y}!`
                    : `Đã gửi báo cáo sai lương Tháng ${m}/${y} kèm minh chứng tới Phòng Kế Toán & Ban Giám Đốc!`
        };
    }

    async autoResolveSalaryDisputes({
        ma_nv = null,
        month,
        year,
        resolved_note = null,
        notifyEmployee = true,
        nextPayoutStatus = 'DRAFT',
        current_user = null
    } = {}) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2000 || y > 2200) {
            return { resolvedCount: 0, affectedEmployees: [] };
        }
        const cleanMaNv = ma_nv ? String(ma_nv).trim() : null;
        const cleanNote = (resolved_note && String(resolved_note).trim())
            ? String(resolved_note).trim().slice(0, 255)
            : `Phản ánh sai lệch lương/công Tháng ${m}/${y} đã được Quản trị viên kiểm tra và cập nhật.`;
        const cleanNextPayout = ['DRAFT', 'REPORT_SENT', 'CONFIRMED'].includes(String(nextPayoutStatus || '').toUpperCase())
            ? String(nextPayoutStatus).toUpperCase()
            : 'DRAFT';

        const openRows = await query(
            cleanMaNv
                ? `SELECT id, ma_nv FROM attendance WHERE ma_nv = ? AND thang = ? AND nam = ? AND (dispute_status = 'OPEN' OR salary_confirm_status = 'DISPUTED' OR payout_status = 'DISPUTED')`
                : `SELECT id, ma_nv FROM attendance WHERE thang = ? AND nam = ? AND (dispute_status = 'OPEN' OR salary_confirm_status = 'DISPUTED' OR payout_status = 'DISPUTED')`,
            cleanMaNv ? [cleanMaNv, m, y] : [m, y]
        ).catch(() => []);

        if (!openRows || openRows.length === 0) {
            return { resolvedCount: 0, affectedEmployees: [] };
        }

        await withTransaction(async (txQuery) => {
            await txQuery(
                cleanMaNv
                    ? `UPDATE attendance
                       SET dispute_status = 'RESOLVED',
                           dispute_resolved_at = NOW(),
                           dispute_resolved_note = ?,
                           salary_confirm_status = CASE WHEN payout_status = 'PAID' OR payment_status = 'PAID' THEN 'CONFIRMED' ELSE 'PENDING' END,
                           payout_status = CASE WHEN payout_status = 'PAID' OR payment_status = 'PAID' THEN 'PAID' ELSE ? END,
                           dispute_reason = NULL,
                           dispute_note = NULL,
                           dispute_evidence_media = NULL,
                           admin_response = NULL
                       WHERE ma_nv = ? AND thang = ? AND nam = ?
                         AND (dispute_status = 'OPEN' OR salary_confirm_status = 'DISPUTED' OR payout_status = 'DISPUTED')`
                    : `UPDATE attendance
                       SET dispute_status = 'RESOLVED',
                           dispute_resolved_at = NOW(),
                           dispute_resolved_note = ?,
                           salary_confirm_status = CASE WHEN payout_status = 'PAID' OR payment_status = 'PAID' THEN 'CONFIRMED' ELSE 'PENDING' END,
                           payout_status = CASE WHEN payout_status = 'PAID' OR payment_status = 'PAID' THEN 'PAID' ELSE ? END,
                           dispute_reason = NULL,
                           dispute_note = NULL,
                           dispute_evidence_media = NULL,
                           admin_response = NULL
                       WHERE thang = ? AND nam = ?
                         AND (dispute_status = 'OPEN' OR salary_confirm_status = 'DISPUTED' OR payout_status = 'DISPUTED')`,
                cleanMaNv ? [cleanNote, cleanNextPayout, cleanMaNv, m, y] : [cleanNote, cleanNextPayout, m, y]
            );

            for (const row of openRows) {
                await txQuery(
                    `UPDATE user_notifications SET is_read = 1, read_at = NOW() WHERE alert_key IN (?, ?) AND is_read = 0`,
                    [`dispute:${row.id}`, `salary_confirm_admin_${m}_${y}_${row.ma_nv}`]
                ).catch(() => {});

                if (notifyEmployee) {
                    const notifTitle = `✅ Đã cập nhật phản ánh lương/công T${m}/${y}`;
                    const notifMsg = `Phản ánh sai lệch lương/công Tháng ${m}/${y} đã được Quản trị viên kiểm tra và cập nhật.`;
                    await txQuery(`
                        INSERT INTO user_notifications (
                            recipient_ma_nv, alert_key, type, category, severity,
                            title, message, ref_month, ref_year,
                            target_ma_nv, target_tab, target_subtab, target_id, is_read, read_at, created_at
                        )
                        VALUES (?, ?, 'SALARY_DISPUTE_RESOLVED', 'salary_report', 'info', ?, ?, ?, ?, ?, 'payslip', NULL, ?, 0, NULL, NOW())
                        ON DUPLICATE KEY UPDATE
                            type = VALUES(type),
                            category = VALUES(category),
                            title = VALUES(title),
                            message = VALUES(message),
                            is_read = 0,
                            read_at = NULL,
                            created_at = NOW()
                    `, [
                        row.ma_nv,
                        `salary_dispute_resolved_${m}_${y}_${row.ma_nv}`,
                        notifTitle.slice(0, 255),
                        notifMsg.slice(0, 1000),
                        m,
                        y,
                        row.ma_nv,
                        `${m}-${y}`
                    ]).catch(() => {});
                }
            }
        });

        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'system',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'AUTO_RESOLVE_SALARY_DISPUTES',
            resource: 'payroll',
            details: {
                month: m,
                year: y,
                ma_nv: cleanMaNv,
                resolved_count: openRows.length,
                affected_employees: openRows.map((r) => r.ma_nv),
                resolved_note: cleanNote
            }
        }).catch(() => {});

        return {
            resolvedCount: openRows.length,
            affectedEmployees: openRows.map((r) => r.ma_nv)
        };
    }

    async resolveSalaryDispute({ ma_nv, month, year, admin_response, new_status = 'RESOLVED', current_user = null }) {
        const cleanMaNv = String(ma_nv || '').trim();
        if (current_user && current_user.ma_nv && current_user.ma_nv === cleanMaNv) {
            const error = new Error('Theo quy định kiểm soát nội bộ, bạn không thể tự xử lý khiếu nại lương của chính mình!');
            error.statusCode = 403;
            throw error;
        }
        const rawInputStatus = String(new_status || 'RESOLVED').trim().toUpperCase();
        if (!['PENDING', 'CONFIRMED', 'DISPUTED', 'RESOLVED'].includes(rawInputStatus)) {
            const error = new Error('Trạng thái xác nhận lương không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }
        const empRows = await query('SELECT ma_nv, role FROM employees WHERE ma_nv = ? LIMIT 1', [cleanMaNv]);
        if (!empRows || empRows.length === 0) {
            const error = new Error(`Không tìm thấy nhân viên ${cleanMaNv}!`);
            error.statusCode = 404;
            throw error;
        }
        if (empRows[0].role === 'admin') {
            const error = new Error('Tài khoản Quản trị viên không thuộc danh sách nhận lương!');
            error.statusCode = 400;
            throw error;
        }

        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();
        const stdDays = getMonthlyStandardWorkdays(m, y);

        const isKeepingDispute = rawInputStatus === 'DISPUTED';
        const cleanConfirmStatus = rawInputStatus === 'RESOLVED' ? 'CONFIRMED' : rawInputStatus;
        const mappedPayout = cleanConfirmStatus === 'PENDING' ? 'REPORT_SENT' : cleanConfirmStatus;
        const cleanResponse = (admin_response && String(admin_response).trim())
            ? String(admin_response).trim().slice(0, 255)
            : 'Quản trị viên đã kiểm tra và đánh dấu đã giải quyết';

        await withTransaction(async (txQuery) => {
            const existingRows = await txQuery(
                'SELECT id FROM attendance WHERE ma_nv = ? AND thang = ? AND nam = ? LIMIT 1 FOR UPDATE',
                [cleanMaNv, m, y]
            );
            const attId = existingRows && existingRows[0] ? existingRows[0].id : null;

            await txQuery(`
                INSERT INTO attendance (
                    ma_nv, thang, nam, cong_chuan,
                    salary_confirm_status, payout_status,
                    dispute_status, dispute_resolved_at, dispute_resolved_note,
                    dispute_reason, dispute_note, dispute_evidence_media, admin_response
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
                ON DUPLICATE KEY UPDATE
                    cong_chuan = VALUES(cong_chuan),
                    salary_confirm_status = VALUES(salary_confirm_status),
                    payout_status = CASE WHEN payout_status = 'PAID' OR payment_status = 'PAID' THEN 'PAID' ELSE VALUES(payout_status) END,
                    dispute_status = VALUES(dispute_status),
                    dispute_resolved_at = VALUES(dispute_resolved_at),
                    dispute_resolved_note = VALUES(dispute_resolved_note),
                    dispute_reason = IF(? = 1, dispute_reason, NULL),
                    dispute_note = IF(? = 1, dispute_note, NULL),
                    dispute_evidence_media = IF(? = 1, dispute_evidence_media, NULL),
                    admin_response = IF(? = 1, VALUES(admin_response), NULL)
            `, [
                cleanMaNv,
                m,
                y,
                stdDays,
                cleanConfirmStatus,
                mappedPayout,
                isKeepingDispute ? 'OPEN' : 'RESOLVED',
                isKeepingDispute ? null : new Date(),
                isKeepingDispute ? null : cleanResponse,
                isKeepingDispute ? cleanResponse : null,
                isKeepingDispute ? 1 : 0,
                isKeepingDispute ? 1 : 0,
                isKeepingDispute ? 1 : 0,
                isKeepingDispute ? 1 : 0
            ]);

            if (!isKeepingDispute) {
                if (attId) {
                    await txQuery(
                        `UPDATE user_notifications SET is_read = 1, read_at = NOW() WHERE alert_key IN (?, ?) AND is_read = 0`,
                        [`dispute:${attId}`, `salary_confirm_admin_${m}_${y}_${cleanMaNv}`]
                    ).catch(() => {});
                }
                const notifTitle = `✅ Đã giải quyết phản ánh lương T${m}/${y}`;
                const notifMessage = `Phản ánh sai lệch lương/công Tháng ${m}/${y} đã được Quản trị viên kiểm tra và cập nhật.`;
                await txQuery(`
                    INSERT INTO user_notifications (
                        recipient_ma_nv, alert_key, type, category, severity,
                        title, message, ref_month, ref_year,
                        target_ma_nv, target_tab, target_subtab, target_id, is_read, read_at, created_at
                    )
                    VALUES (?, ?, 'SALARY_DISPUTE_RESOLVED', 'salary_report', 'info', ?, ?, ?, ?, ?, 'payslip', NULL, ?, 0, NULL, NOW())
                    ON DUPLICATE KEY UPDATE
                        type = VALUES(type),
                        category = VALUES(category),
                        title = VALUES(title),
                        message = VALUES(message),
                        is_read = 0,
                        read_at = NULL,
                        created_at = NOW()
                `, [
                    cleanMaNv,
                    `salary_dispute_resolved_${m}_${y}_${cleanMaNv}`,
                    notifTitle.slice(0, 255),
                    notifMessage.slice(0, 1000),
                    m,
                    y,
                    cleanMaNv,
                    `${m}-${y}`
                ]).catch(() => {});
            }
        });

        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'RESOLVE_SALARY_DISPUTE',
            resource: 'payroll',
            details: { target_ma_nv: cleanMaNv, month: m, year: y, new_status: cleanConfirmStatus, dispute_status: isKeepingDispute ? 'OPEN' : 'RESOLVED', admin_response: cleanResponse }
        });

        return {
            success: true,
            dispute_status: isKeepingDispute ? 'OPEN' : 'RESOLVED',
            salary_confirm_status: cleanConfirmStatus,
            message: isKeepingDispute
                ? `Đã gửi phản hồi xử lý cho nhân viên ${cleanMaNv} (Tháng ${m}/${y})!`
                : `Đã giải quyết khiếu nại lương của nhân viên ${cleanMaNv} (Tháng ${m}/${y})!`
        };
    }

    async adjustSalary({ ma_nv, month, year, bonus_amount, penalty_amount, advance_deduction, adjustment_note, current_user = null }) {
        if (!ma_nv) {
            const err = new Error('Thiếu mã nhân viên cần điều chỉnh lương!');
            err.statusCode = 400;
            throw err;
        }
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();

        const empRows = await query('SELECT ma_nv, role FROM employees WHERE ma_nv = ? LIMIT 1', [ma_nv]);
        if (!empRows || empRows.length === 0) {
            const err = new Error(`Không tìm thấy nhân viên ${ma_nv}!`);
            err.statusCode = 404;
            throw err;
        }
        if (empRows[0].role === 'admin') {
            const err = new Error('Tài khoản Quản trị viên không thuộc danh sách tính lương!');
            err.statusCode = 400;
            throw err;
        }

        const lockRows = await query('SELECT is_locked FROM period_locks WHERE month = ? AND year = ? LIMIT 1', [m, y]);
        if (lockRows && lockRows.length > 0 && Boolean(lockRows[0].is_locked)) {
            const err = new Error(`Kỳ công Tháng ${m}/${y} đã bị KHÓA SỔ. Không thể điều chỉnh thưởng/phạt!`);
            err.statusCode = 400;
            err.code = 'PERIOD_LOCKED';
            throw err;
        }

        const hasBonus = bonus_amount !== undefined ? 1 : 0;
        const hasPenalty = penalty_amount !== undefined ? 1 : 0;
        const hasAdvance = advance_deduction !== undefined ? 1 : 0;
        const hasNote = adjustment_note !== undefined ? 1 : 0;

        const cleanBonus = Math.max(0, Math.round(Number(bonus_amount) || 0));
        const cleanPenalty = Math.max(0, Math.round(Number(penalty_amount) || 0));
        const cleanAdvance = Math.max(0, Math.round(Number(advance_deduction) || 0));
        const cleanNote = adjustment_note ? String(adjustment_note).trim().slice(0, 255) : null;

        const stdDays = getMonthlyStandardWorkdays(m, y);

        // Bảo toàn các khoản điều chỉnh/tạm ứng đã duyệt trước đó nếu client chỉ gửi cập nhật một phần
        await query(`
            INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, bonus_amount, penalty_amount, advance_deduction, adjustment_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                cong_chuan = VALUES(cong_chuan),
                bonus_amount = IF(?, ?, COALESCE(bonus_amount, 0)),
                penalty_amount = IF(?, ?, COALESCE(penalty_amount, 0)),
                advance_deduction = IF(?, ?, COALESCE(advance_deduction, 0)),
                adjustment_note = IF(?, ?, adjustment_note)
        `, [
            ma_nv, m, y, stdDays, cleanBonus, cleanPenalty, cleanAdvance, cleanNote,
            hasBonus, cleanBonus,
            hasPenalty, cleanPenalty,
            hasAdvance, cleanAdvance,
            hasNote, cleanNote
        ]);

        await this.autoResolveSalaryDisputes({
            ma_nv,
            month: m,
            year: y,
            resolved_note: 'Đã điều chỉnh thưởng / phạt / tạm ứng kỳ lương',
            current_user
        }).catch(() => {});

        const updatedSlip = await this.getMyPayroll(ma_nv, m, y);

        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'ADJUST_PAYROLL_ITEM',
            resource: 'payroll',
            details: {
                target_ma_nv: ma_nv,
                month: m,
                year: y,
                bonus_amount: updatedSlip ? updatedSlip.bonusAmount : cleanBonus,
                penalty_amount: updatedSlip ? updatedSlip.penaltyAmount : cleanPenalty,
                advance_deduction: updatedSlip ? updatedSlip.advanceDeduction : cleanAdvance,
                adjustment_note: updatedSlip ? updatedSlip.adjustment_note : cleanNote
            }
        });

        return {
            success: true,
            message: `Đã lưu điều chỉnh lương cho ${ma_nv} (Tháng ${m}/${y})!`,
            data: updatedSlip
        };
    }

    async sendSalaryReport({ month, year, ma_nv = null, send_all = false, current_user = null } = {}) {
        if (current_user && current_user.role !== 'admin') {
            const err = new Error('Chỉ Quản trị viên mới có quyền gửi báo cáo xác nhận lương!');
            err.statusCode = 403;
            throw err;
        }
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();
        if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2000 || y > 2200) {
            const err = new Error('Tháng hoặc năm kỳ lương không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }

        const isBatch = Boolean(send_all);
        const cleanMaNv = String(ma_nv || '').trim();
        if (!isBatch && !cleanMaNv) {
            const err = new Error('Vui lòng chọn nhân viên nhận báo cáo hoặc chọn gửi tất cả!');
            err.statusCode = 400;
            throw err;
        }

        const allPayrollRows = await this.calculateMonthlyPayroll(m, y, { exportAll: true });
        let targets = [];

        if (isBatch) {
            targets = (allPayrollRows || []).filter((r) => r && r.role !== 'admin');
        } else {
            const empRows = await query('SELECT ma_nv, ho_ten, role FROM employees WHERE ma_nv = ? LIMIT 1', [cleanMaNv]);
            if (!empRows || empRows.length === 0) {
                const err = new Error(`Không tìm thấy nhân viên ${cleanMaNv}!`);
                err.statusCode = 404;
                throw err;
            }
            if (empRows[0].role === 'admin') {
                const err = new Error('Tài khoản Quản trị viên không tham gia nhận báo cáo lương!');
                err.statusCode = 400;
                throw err;
            }
            const found = (allPayrollRows || []).find((r) => (r.ma_nv || r.id_nhan_vien) === cleanMaNv);
            if (found) {
                targets = [found];
            } else {
                const single = await this.getMyPayroll(cleanMaNv, m, y);
                if (single) targets = [single];
            }
        }

        if (targets.length === 0) {
            const err = new Error(`Chưa có dữ liệu nhân viên trong bảng lương Tháng ${m}/${y}!`);
            err.statusCode = 404;
            throw err;
        }

        const stdDays = getMonthlyStandardWorkdays(m, y);
        const actorId = current_user ? (current_user.ma_nv || current_user.username || 'admin') : 'admin';

        await withTransaction(async (txQuery) => {
            for (const row of targets) {
                const targetId = row.ma_nv || row.id_nhan_vien;
                const hadOpenDispute = resolveIsOpenDispute(row);
                await txQuery(`
                    INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, payout_status, salary_confirm_status, report_sent_at)
                    VALUES (?, ?, ?, ?, 'REPORT_SENT', 'PENDING', NOW())
                    ON DUPLICATE KEY UPDATE
                        cong_chuan = VALUES(cong_chuan),
                        payout_status = CASE
                            WHEN payout_status = 'RECEIVED' OR received_at IS NOT NULL THEN 'RECEIVED'
                            WHEN payout_status = 'PAID' OR payment_status = 'PAID' THEN 'PAID'
                            ELSE 'REPORT_SENT'
                        END,
                        salary_confirm_status = CASE
                            WHEN payout_status IN ('PAID', 'RECEIVED') OR payment_status = 'PAID' THEN salary_confirm_status
                            ELSE 'PENDING'
                        END,
                        dispute_status = CASE
                            WHEN dispute_status = 'OPEN' OR salary_confirm_status = 'DISPUTED' OR payout_status = 'DISPUTED' THEN 'RESOLVED'
                            ELSE dispute_status
                        END,
                        dispute_resolved_at = CASE
                            WHEN dispute_status = 'OPEN' OR salary_confirm_status = 'DISPUTED' OR payout_status = 'DISPUTED' THEN NOW()
                            ELSE dispute_resolved_at
                        END,
                        dispute_resolved_note = CASE
                            WHEN dispute_status = 'OPEN' OR salary_confirm_status = 'DISPUTED' OR payout_status = 'DISPUTED' THEN 'Đã gửi lại báo cáo lương mới sau khi kiểm tra'
                            ELSE dispute_resolved_note
                        END,
                        dispute_reason = NULL,
                        dispute_note = NULL,
                        dispute_evidence_media = NULL,
                        admin_response = NULL,
                        report_sent_at = NOW()
                `, [targetId, m, y, stdDays]);

                if (hadOpenDispute) {
                    const attRows = await txQuery('SELECT id FROM attendance WHERE ma_nv = ? AND thang = ? AND nam = ? LIMIT 1', [targetId, m, y]).catch(() => []);
                    const attId = attRows && attRows[0] ? attRows[0].id : null;
                    await txQuery(
                        `UPDATE user_notifications SET is_read = 1, read_at = NOW() WHERE alert_key IN (?, ?) AND is_read = 0`,
                        [attId ? `dispute:${attId}` : '', `salary_confirm_admin_${m}_${y}_${targetId}`]
                    ).catch(() => {});
                }

                const netStr = formatViCurrencyServer(row.netSalary || 0);
                const notifTitle = hadOpenDispute
                    ? `📩 Đã cập nhật & gửi lại báo cáo lương T${m}/${y}`
                    : `📩 Báo cáo lương Tháng ${m}/${y} đang chờ xác nhận`;
                const notifMessage = hadOpenDispute
                    ? `Phản ánh sai lệch lương/công Tháng ${m}/${y} đã được Quản trị viên kiểm tra và cập nhật (Thực lĩnh mới: ${netStr}). Vui lòng kiểm tra và xác nhận.`
                    : `Báo cáo lương Tháng ${m}/${y} đã sẵn sàng (Thực lĩnh: ${netStr}). Vui lòng kiểm tra và xác nhận.`;

                await txQuery(`
                    INSERT INTO user_notifications (
                        recipient_ma_nv, alert_key, type, category, severity,
                        title, message, ref_month, ref_year,
                        target_ma_nv, target_tab, target_subtab, target_id, is_read, read_at, created_at
                    )
                    VALUES (?, ?, 'SALARY_REPORT_SENT', 'salary_report', 'info', ?, ?, ?, ?, ?, 'payslip', NULL, ?, 0, NULL, NOW())
                    ON DUPLICATE KEY UPDATE
                        type = VALUES(type),
                        category = VALUES(category),
                        severity = VALUES(severity),
                        title = VALUES(title),
                        message = VALUES(message),
                        target_tab = VALUES(target_tab),
                        target_id = VALUES(target_id),
                        is_read = 0,
                        read_at = NULL,
                        created_at = NOW()
                `, [
                    targetId,
                    `salary_report_${m}_${y}_${targetId}`,
                    notifTitle.slice(0, 255),
                    notifMessage.slice(0, 1000),
                    m,
                    y,
                    targetId,
                    `${m}-${y}`
                ]);
            }
        });

        await logAuditEvent({
            actor_id: actorId,
            actor_role: current_user ? current_user.role : 'admin',
            action: 'SEND_SALARY_REPORT',
            resource: 'payroll',
            details: {
                month: m,
                year: y,
                send_all: isBatch,
                ma_nv: isBatch ? null : cleanMaNv,
                sent_count: targets.length
            }
        });

        const sentNowVn = formatVietnamDateTime(new Date());
        return {
            success: true,
            message: isBatch
                ? `Đã gửi báo cáo xác nhận lương Tháng ${m}/${y} tới tất cả ${targets.length} nhân viên & kế toán!`
                : `Đã gửi báo cáo xác nhận lương Tháng ${m}/${y} cho ${targets[0].ho_ten || cleanMaNv}!`,
            data: {
                month: m,
                year: y,
                send_all: isBatch,
                sent_count: targets.length,
                report_sent_at_vn: sentNowVn,
                recipients: targets.map((t) => ({
                    ma_nv: t.ma_nv || t.id_nhan_vien,
                    ho_ten: t.ho_ten,
                    payout_status: t.payout_status === 'RECEIVED' ? 'RECEIVED' : (t.employee_payment_status === 'PAID' || t.payout_status === 'PAID' ? 'PAID' : 'REPORT_SENT')
                }))
            }
        };
    }

    async updateEmployeePaymentStatus({ ma_nv, month, year, status = 'PAID', transfer_note = null, current_user = null }) {
        const cleanMaNv = String(ma_nv || '').trim();
        if (!cleanMaNv) {
            const err = new Error('Thiếu mã nhân viên cần xác nhận chuyển khoản lương!');
            err.statusCode = 400;
            throw err;
        }
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2000 || y > 2200) {
            const err = new Error('Tháng hoặc năm kỳ lương không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }
        const cleanStatus = String(status || 'PAID').trim().toUpperCase();
        if (!['PAID', 'UNPAID'].includes(cleanStatus)) {
            const err = new Error('Trạng thái chuyển khoản phải là PAID hoặc UNPAID!');
            err.statusCode = 400;
            throw err;
        }
        const actorId = current_user ? (current_user.ma_nv || current_user.username || 'admin') : 'admin';
        const defaultTransferNote = `SEDINCO TRA LUONG T${String(m).padStart(2, '0')} ${y} ${cleanMaNv}`;
        const cleanTransferNote = (transfer_note && String(transfer_note).trim())
            ? String(transfer_note).trim().slice(0, 255)
            : defaultTransferNote;

        const slipSnapshot = cleanStatus === 'PAID'
            ? await this.getMyPayroll(cleanMaNv, m, y).catch(() => null)
            : null;
        const paidAmountNum = slipSnapshot ? Math.max(0, Math.round(Number(slipSnapshot.netSalary) || 0)) : 0;

        const payoutRow = await withTransaction(async (txQuery) => {
            const empRows = await txQuery('SELECT ma_nv, ho_ten, role FROM employees WHERE ma_nv = ? FOR UPDATE', [cleanMaNv]);
            if (!empRows || empRows.length === 0) {
                const err = new Error(`Không tìm thấy nhân viên ${cleanMaNv}!`);
                err.statusCode = 404;
                throw err;
            }
            if (empRows[0].role === 'admin') {
                const err = new Error('Tài khoản Quản trị viên không thuộc danh sách chi trả lương!');
                err.statusCode = 400;
                throw err;
            }
            const stdDays = getMonthlyStandardWorkdays(m, y);

            const existingAtt = await txQuery(
                'SELECT id, payment_status, payout_status, paid_at, paid_by, transfer_note, salary_confirm_status, received_at FROM attendance WHERE ma_nv = ? AND thang = ? AND nam = ? LIMIT 1 FOR UPDATE',
                [cleanMaNv, m, y]
            );
            const existingRow = existingAtt && existingAtt[0] ? existingAtt[0] : null;
            if (cleanStatus === 'PAID' && existingRow && existingRow.payment_status === 'PAID') {
                return {
                    ma_nv: cleanMaNv,
                    ho_ten: empRows[0].ho_ten,
                    month: m,
                    year: y,
                    employee_payment_status: 'PAID',
                    payout_status: existingRow.payout_status === 'RECEIVED' || existingRow.received_at ? 'RECEIVED' : 'PAID',
                    transfer_note: existingRow.transfer_note || cleanTransferNote,
                    employee_paid_at: existingRow.paid_at || null,
                    employee_paid_at_vn: formatVietnamDateTime(existingRow.paid_at),
                    employee_paid_by: existingRow.paid_by || actorId,
                    received_at: existingRow.received_at || null,
                    received_at_vn: formatVietnamDateTime(existingRow.received_at),
                    already_paid: true
                };
            }

            if (cleanStatus === 'PAID') {
                await txQuery(`
                    INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, payment_status, payout_status, paid_at, paid_by, transfer_note)
                    VALUES (?, ?, ?, ?, 'PAID', 'PAID', NOW(), ?, ?)
                    ON DUPLICATE KEY UPDATE
                        cong_chuan = VALUES(cong_chuan),
                        payment_status = 'PAID',
                        payout_status = CASE WHEN payout_status = 'RECEIVED' OR received_at IS NOT NULL THEN 'RECEIVED' ELSE 'PAID' END,
                        paid_at = COALESCE(paid_at, NOW()),
                        paid_by = VALUES(paid_by),
                        transfer_note = VALUES(transfer_note)
                `, [cleanMaNv, m, y, stdDays, actorId, cleanTransferNote]);

                const paidAmtStr = formatViCurrencyServer(paidAmountNum);
                await txQuery(`
                    INSERT INTO user_notifications (
                        recipient_ma_nv, alert_key, type, category, severity,
                        title, message, ref_month, ref_year,
                        target_ma_nv, target_tab, target_subtab, target_id, is_read, read_at, created_at
                    )
                    VALUES (?, ?, 'SALARY_PAID', 'salary_paid', 'info', ?, ?, ?, ?, ?, 'payslip', NULL, ?, 0, NULL, NOW())
                    ON DUPLICATE KEY UPDATE
                        title = VALUES(title),
                        message = VALUES(message),
                        target_tab = VALUES(target_tab),
                        target_id = VALUES(target_id),
                        is_read = 0,
                        read_at = NULL,
                        created_at = NOW()
                `, [
                    cleanMaNv,
                    `salary_paid_${m}_${y}_${cleanMaNv}`,
                    `💸 Đã chuyển khoản lương Tháng ${m}/${y}`,
                    `Công ty SEDINCO đã chuyển khoản lương Tháng ${m}/${y} (Số tiền: ${paidAmtStr}). Vui lòng mở phiếu lương để bấm Xác nhận đã nhận lương.`,
                    m,
                    y,
                    cleanMaNv,
                    `${m}-${y}`
                ]);
            } else {
                const fallbackPayout = existingRow?.salary_confirm_status === 'CONFIRMED'
                    ? 'CONFIRMED'
                    : existingRow?.salary_confirm_status === 'DISPUTED'
                        ? 'DISPUTED'
                        : existingRow?.report_sent_at
                            ? 'REPORT_SENT'
                            : 'DRAFT';
                await txQuery(`
                    INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, payment_status, payout_status, paid_at, paid_by, transfer_note, received_at)
                    VALUES (?, ?, ?, ?, 'UNPAID', ?, NULL, NULL, NULL, NULL)
                    ON DUPLICATE KEY UPDATE
                        payment_status = 'UNPAID',
                        payout_status = ?,
                        paid_at = NULL,
                        paid_by = NULL,
                        transfer_note = NULL,
                        received_at = NULL
                `, [cleanMaNv, m, y, stdDays, fallbackPayout, fallbackPayout]);
            }

            const refreshed = await txQuery(
                'SELECT payment_status, payout_status, paid_at, paid_by, transfer_note, received_at FROM attendance WHERE ma_nv = ? AND thang = ? AND nam = ? LIMIT 1',
                [cleanMaNv, m, y]
            );
            const saved = refreshed && refreshed[0] ? refreshed[0] : {};
            return {
                ma_nv: cleanMaNv,
                ho_ten: empRows[0].ho_ten,
                month: m,
                year: y,
                employee_payment_status: saved.payment_status || cleanStatus,
                payout_status: saved.payout_status || (cleanStatus === 'PAID' ? 'PAID' : 'DRAFT'),
                transfer_note: saved.transfer_note || null,
                employee_paid_at: saved.paid_at || null,
                employee_paid_at_vn: formatVietnamDateTime(saved.paid_at),
                employee_paid_by: saved.paid_by || null,
                received_at: saved.received_at || null,
                received_at_vn: formatVietnamDateTime(saved.received_at),
                already_paid: false
            };
        });

        if (!payoutRow.already_paid) {
            await logAuditEvent({
                actor_id: actorId,
                actor_role: current_user ? current_user.role : 'admin',
                action: cleanStatus === 'PAID' ? 'MARK_EMPLOYEE_SALARY_PAID' : 'MARK_EMPLOYEE_SALARY_UNPAID',
                resource: 'payroll',
                details: {
                    target_ma_nv: cleanMaNv,
                    month: m,
                    year: y,
                    status: cleanStatus,
                    transfer_note: cleanStatus === 'PAID' ? cleanTransferNote : null
                }
            });
        }

        return {
            success: true,
            message: payoutRow.already_paid
                ? `Nhân viên ${payoutRow.ho_ten || cleanMaNv} đã được xác nhận chuyển khoản lương tháng ${m}/${y} trước đó.`
                : cleanStatus === 'PAID'
                    ? `Đã xác nhận chuyển khoản lương tháng ${m}/${y} cho ${payoutRow.ho_ten || cleanMaNv}!`
                    : `Đã đặt lại trạng thái chưa chuyển khoản cho ${payoutRow.ho_ten || cleanMaNv}.`,
            data: payoutRow
        };
    }
}

module.exports = new PayrollService();
