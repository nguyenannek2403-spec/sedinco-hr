const { query, withTransaction } = require('../config/db');
const { calculateEmployeeSalary } = require('../utils/payrollCalculator');
const { logAuditEvent } = require('../middlewares/authMiddleware');
const { formatVietnamDateTime } = require('../utils/timeHelper');

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

function resolveEffectivePayoutStatus(row = {}, periodRow = null) {
    const payoutRaw = String(row.payout_status || '').trim().toUpperCase();
    const payRaw = String(row.employee_payment_status || row.payment_status || '').trim().toUpperCase();
    const confirmRaw = String(row.salary_confirm_status || '').trim().toUpperCase();
    if (payoutRaw === 'PAID' || payRaw === 'PAID' || periodRow?.payment_status === 'PAID') return 'PAID';
    if (payoutRaw === 'CONFIRMED' || confirmRaw === 'CONFIRMED') return 'CONFIRMED';
    if (payoutRaw === 'DISPUTED' || confirmRaw === 'DISPUTED') return 'DISPUTED';
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
        const defaultStandardDays = Number(companySettings.standard_work_days) || 26;

        const sql = `
            SELECT e.*, IFNULL(a.cong_chuan, ?) as cong_chuan,
                   COALESCE(a.salary_confirm_status, 'PENDING') as salary_confirm_status,
                   COALESCE(a.payout_status, 'DRAFT') as payout_status,
                   a.report_sent_at, a.dispute_note, a.transfer_note,
                   a.dispute_reason, a.dispute_evidence_media, a.admin_response, a.confirmed_at,
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

        const holidays = await query('SELECT start_date, end_date FROM public_holidays');
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
                cong_chuan: emp.cong_chuan,
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
                report_sent_at: emp.report_sent_at || null,
                report_sent_at_vn: formatVietnamDateTime(emp.report_sent_at),
                dispute_reason: emp.dispute_reason || emp.dispute_note || null,
                dispute_note: emp.dispute_note || emp.dispute_reason || null,
                dispute_evidence_media: emp.dispute_evidence_media || null,
                admin_response: emp.admin_response || null,
                confirmed_at: emp.confirmed_at || null,
                confirmed_at_vn: formatVietnamDateTime(emp.confirmed_at),
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
        const defaultStandardDays = Number(companySettings.standard_work_days) || 26;

        const sql = `
            SELECT e.*, IFNULL(a.cong_chuan, ?) as cong_chuan,
                   COALESCE(a.salary_confirm_status, 'PENDING') as salary_confirm_status,
                   COALESCE(a.payout_status, 'DRAFT') as payout_status,
                   a.report_sent_at, a.dispute_note, a.transfer_note,
                   a.dispute_reason, a.dispute_evidence_media, a.admin_response, a.confirmed_at,
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
        const holidays = await query('SELECT start_date, end_date FROM public_holidays');
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
            cong_chuan: emp.cong_chuan,
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
            report_sent_at: emp.report_sent_at || null,
            report_sent_at_vn: formatVietnamDateTime(emp.report_sent_at),
            dispute_reason: emp.dispute_reason || emp.dispute_note || null,
            dispute_note: emp.dispute_note || emp.dispute_reason || null,
            dispute_evidence_media: emp.dispute_evidence_media || null,
            admin_response: emp.admin_response || null,
            confirmed_at: emp.confirmed_at || null,
            confirmed_at_vn: formatVietnamDateTime(emp.confirmed_at),
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

        const rawAction = String(action || status || 'CONFIRM').trim().toUpperCase();
        const normalizedStatus = (rawAction === 'CONFIRM' || rawAction === 'CONFIRMED')
            ? 'CONFIRMED'
            : (rawAction === 'DISPUTE' || rawAction === 'DISPUTED')
                ? 'DISPUTED'
                : rawAction;

        if (!['CONFIRMED', 'DISPUTED'].includes(normalizedStatus)) {
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

        // Bảo vệ dung lượng TiDB Cloud: Giới hạn media minh chứng <= 800KB binary (~1.1MB chuỗi Base64)
        if (dispute_evidence_media && typeof dispute_evidence_media === 'string') {
            if (dispute_evidence_media.length > 1150000) {
                const err = new Error('Tệp hình ảnh / video minh chứng vượt quá giới hạn 800KB cho phép! Vui lòng chọn tệp ngắn hơn hoặc nén ảnh.');
                err.statusCode = 400;
                throw err;
            }
        }

        const csRows = await query('SELECT standard_work_days FROM company_settings LIMIT 1').catch(() => []);
        const stdDays = (csRows && csRows[0] && Number(csRows[0].standard_work_days)) || 26;

        let finalPayoutStatus = normalizedStatus;
        await withTransaction(async (txQuery) => {
            const existingRows = await txQuery(
                'SELECT salary_confirm_status, payout_status, payment_status FROM attendance WHERE ma_nv = ? AND thang = ? AND nam = ? FOR UPDATE',
                [ma_nv, m, y]
            );
            const existing = existingRows && existingRows[0] ? existingRows[0] : null;
            const currentStatus = existing ? existing.salary_confirm_status : null;
            const currentPayout = existing ? existing.payout_status : null;
            const alreadyPaid = existing && (existing.payout_status === 'PAID' || existing.payment_status === 'PAID');

            if (normalizedStatus === 'DISPUTED' && currentStatus === 'DISPUTED' && currentPayout === 'DISPUTED') {
                const err = new Error(`Bạn đã gửi khiếu nại bảng lương Tháng ${m}/${y} trước đó và đang chờ giải quyết. Vui lòng không gửi trùng!`);
                err.statusCode = 409;
                err.code = 'DUPLICATE_SALARY_DISPUTE';
                throw err;
            }

            finalPayoutStatus = alreadyPaid ? 'PAID' : normalizedStatus;
            const cleanDisputeNote = normalizedStatus === 'DISPUTED' ? rawNoteText : null;

            await txQuery(`
                INSERT INTO attendance (
                    ma_nv, thang, nam, cong_chuan,
                    salary_confirm_status, payout_status,
                    dispute_reason, dispute_note, dispute_evidence_media, confirmed_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    salary_confirm_status = VALUES(salary_confirm_status),
                    payout_status = CASE WHEN payout_status = 'PAID' OR payment_status = 'PAID' THEN 'PAID' ELSE VALUES(payout_status) END,
                    dispute_reason = VALUES(dispute_reason),
                    dispute_note = VALUES(dispute_note),
                    dispute_evidence_media = COALESCE(VALUES(dispute_evidence_media), dispute_evidence_media),
                    confirmed_at = NOW()
            `, [
                ma_nv,
                m,
                y,
                stdDays,
                normalizedStatus,
                finalPayoutStatus,
                cleanDisputeNote,
                cleanDisputeNote,
                normalizedStatus === 'DISPUTED' ? (dispute_evidence_media || null) : null
            ]);

            const notifTitle = normalizedStatus === 'CONFIRMED'
                ? `✓ ${empName} (${ma_nv}) đã xác nhận lương T${m}/${y}`
                : `⚠️ ${empName} (${ma_nv}) báo sai sót lương T${m}/${y}`;
            const notifMessage = normalizedStatus === 'CONFIRMED'
                ? `${empName} (${ma_nv}) đã xác nhận đúng báo cáo lương Tháng ${m}/${y}. Sẵn sàng chuyển khoản.`
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
                `salary_confirm_admin_${m}_${y}_${ma_nv}`,
                normalizedStatus === 'CONFIRMED' ? 'SALARY_CONFIRMED' : 'SALARY_DISPUTED',
                normalizedStatus === 'CONFIRMED' ? 'salary_confirm' : 'salary_dispute',
                normalizedStatus === 'CONFIRMED' ? 'info' : 'high',
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
            action: normalizedStatus === 'DISPUTED' ? 'SALARY_DISPUTED' : 'SALARY_CONFIRMED',
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
            salary_confirm_status: normalizedStatus,
            payout_status: finalPayoutStatus,
            message: normalizedStatus === 'CONFIRMED'
                ? `Đã xác nhận đúng bảng lương Tháng ${m}/${y}!`
                : `Đã gửi báo cáo sai lương Tháng ${m}/${y} kèm minh chứng tới Phòng Kế Toán & Ban Giám Đốc!`
        };
    }

    async resolveSalaryDispute({ ma_nv, month, year, admin_response, new_status = 'CONFIRMED', current_user = null }) {
        const cleanMaNv = String(ma_nv || '').trim();
        if (current_user && current_user.ma_nv && current_user.ma_nv === cleanMaNv) {
            const error = new Error('Theo quy định kiểm soát nội bộ, bạn không thể tự xử lý khiếu nại lương của chính mình!');
            error.statusCode = 403;
            throw error;
        }
        const cleanStatus = String(new_status || '').trim().toUpperCase();
        if (!['PENDING', 'CONFIRMED', 'DISPUTED'].includes(cleanStatus)) {
            const error = new Error('Trạng thái xác nhận lương không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }
        const empRows = await query('SELECT ma_nv, role FROM employees WHERE ma_nv = ? LIMIT 1', [ma_nv]);
        if (!empRows || empRows.length === 0) {
            const error = new Error(`Không tìm thấy nhân viên ${ma_nv}!`);
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

        const mappedPayout = cleanStatus === 'PENDING' ? 'REPORT_SENT' : cleanStatus;
        await query(`
            INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, salary_confirm_status, payout_status, admin_response)
            VALUES (?, ?, ?, 26, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                salary_confirm_status = VALUES(salary_confirm_status),
                payout_status = CASE WHEN payout_status = 'PAID' OR payment_status = 'PAID' THEN 'PAID' ELSE VALUES(payout_status) END,
                admin_response = VALUES(admin_response)
        `, [ma_nv, m, y, cleanStatus, mappedPayout, admin_response || 'Đã kiểm tra và xử lý điều chỉnh lương.']);

        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'RESOLVE_SALARY_DISPUTE',
            resource: 'payroll',
            details: { target_ma_nv: ma_nv, month: m, year: y, new_status: cleanStatus, admin_response }
        });

        return {
            success: true,
            message: `Đã phản hồi và xử lý khiếu nại lương của nhân viên ${ma_nv} (Tháng ${m}/${y})!`
        };
    }

    async approvePayroll(month, year, user) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2000 || y > 2200) {
            const err = new Error('Tháng hoặc năm kỳ lương không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }
        const actorId = user?.ma_nv || user?.username || user?.id || 'admin';

        const periodRow = await withTransaction(async (txQuery) => {
            await txQuery(`
                INSERT INTO payroll_periods (month, year, status, payment_status, approved_by, approved_at, rejected_by, rejected_reason, rejected_at)
                VALUES (?, ?, 'APPROVED', 'UNPAID', ?, NOW(), NULL, NULL, NULL)
                ON DUPLICATE KEY UPDATE
                    status = 'APPROVED',
                    approved_by = VALUES(approved_by),
                    approved_at = NOW(),
                    rejected_by = NULL,
                    rejected_reason = NULL,
                    rejected_at = NULL
            `, [m, y, actorId]);
            const rows = await txQuery('SELECT * FROM payroll_periods WHERE month = ? AND year = ? LIMIT 1', [m, y]);
            return rows && rows[0] ? rows[0] : null;
        });

        await logAuditEvent({
            actor_id: actorId,
            actor_role: user?.role || 'admin',
            action: 'APPROVE_PAYROLL',
            resource: 'payroll',
            details: { month: m, year: y, status: 'APPROVED' }
        });
        return { success: true, message: `Phê duyệt bảng lương tháng ${m}/${y} thành công!`, data: periodRow };
    }

    async rejectPayroll(month, year, reason, user) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2000 || y > 2200) {
            const err = new Error('Tháng hoặc năm kỳ lương không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }
        const cleanReason = String(reason || '').trim();
        if (!cleanReason) {
            const err = new Error('Vui lòng nhập lý do trả lại bảng lương cho Kế toán!');
            err.statusCode = 400;
            throw err;
        }
        const actorId = user?.ma_nv || user?.username || user?.id || 'admin';

        const periodRow = await withTransaction(async (txQuery) => {
            const existing = await txQuery('SELECT * FROM payroll_periods WHERE month = ? AND year = ? FOR UPDATE', [m, y]);
            if (existing && existing[0] && existing[0].payment_status === 'PAID') {
                const err = new Error(`Kỳ lương tháng ${m}/${y} đã xác nhận chi trả, không thể trả lại!`);
                err.statusCode = 400;
                throw err;
            }
            await txQuery(`
                INSERT INTO payroll_periods (month, year, status, payment_status, rejected_by, rejected_reason, rejected_at)
                VALUES (?, ?, 'REJECTED', 'UNPAID', ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    status = 'REJECTED',
                    rejected_by = VALUES(rejected_by),
                    rejected_reason = VALUES(rejected_reason),
                    rejected_at = NOW()
            `, [m, y, actorId, cleanReason]);
            const rows = await txQuery('SELECT * FROM payroll_periods WHERE month = ? AND year = ? LIMIT 1', [m, y]);
            return rows && rows[0] ? rows[0] : null;
        });

        await logAuditEvent({
            actor_id: actorId,
            actor_role: user?.role || 'admin',
            action: 'REJECT_PAYROLL',
            resource: 'payroll',
            details: { month: m, year: y, status: 'REJECTED', reason: cleanReason }
        });
        return { success: true, message: `Đã trả lại bảng lương tháng ${m}/${y} cho Kế toán chỉnh sửa!`, data: periodRow };
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

        const csRows = await query('SELECT standard_work_days FROM company_settings LIMIT 1').catch(() => []);
        const stdDays = (csRows && csRows[0] && Number(csRows[0].standard_work_days)) || 26;

        // Bảo toàn các khoản điều chỉnh/tạm ứng đã duyệt trước đó nếu client chỉ gửi cập nhật một phần
        await query(`
            INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, bonus_amount, penalty_amount, advance_deduction, adjustment_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
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

    async updatePaymentStatus(month, year, status, user) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2000 || y > 2200) {
            const err = new Error('Tháng hoặc năm kỳ lương không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }
        const cleanStatus = String(status || 'PAID').trim().toUpperCase();
        if (!['PAID', 'UNPAID'].includes(cleanStatus)) {
            const err = new Error('Trạng thái chi trả lương phải là PAID hoặc UNPAID!');
            err.statusCode = 400;
            throw err;
        }
        const actorId = user?.ma_nv || user?.username || user?.id || 'admin';

        const periodRow = await withTransaction(async (txQuery) => {
            const existing = await txQuery('SELECT * FROM payroll_periods WHERE month = ? AND year = ? FOR UPDATE', [m, y]);
            if (cleanStatus === 'PAID' && (!existing || !existing[0] || existing[0].status !== 'APPROVED')) {
                const err = new Error(`Vui lòng phê duyệt bảng lương tháng ${m}/${y} trước khi xác nhận đã chi trả!`);
                err.statusCode = 400;
                throw err;
            }
            const nextStatus = existing && existing[0] ? existing[0].status : 'DRAFT';
            await txQuery(`
                INSERT INTO payroll_periods (month, year, status, payment_status, paid_by, paid_at)
                VALUES (?, ?, ?, ?, ?, ${cleanStatus === 'PAID' ? 'NOW()' : 'NULL'})
                ON DUPLICATE KEY UPDATE
                    payment_status = VALUES(payment_status),
                    paid_by = ${cleanStatus === 'PAID' ? 'VALUES(paid_by)' : 'NULL'},
                    paid_at = ${cleanStatus === 'PAID' ? 'NOW()' : 'NULL'}
            `, [m, y, nextStatus, cleanStatus, cleanStatus === 'PAID' ? actorId : null]);
            const rows = await txQuery('SELECT * FROM payroll_periods WHERE month = ? AND year = ? LIMIT 1', [m, y]);
            return rows && rows[0] ? rows[0] : null;
        });

        await logAuditEvent({
            actor_id: actorId,
            actor_role: user?.role || 'admin',
            action: 'UPDATE_PAYMENT_STATUS',
            resource: 'payroll',
            details: { month: m, year: y, payment_status: cleanStatus }
        });
        return {
            success: true,
            message: cleanStatus === 'PAID'
                ? `Đã xác nhận chi trả lương tháng ${m}/${y} thành công!`
                : `Đã chuyển trạng thái chi trả lương tháng ${m}/${y} về chưa thanh toán!`,
            data: periodRow
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

        const csRows = await query('SELECT standard_work_days FROM company_settings LIMIT 1').catch(() => []);
        const stdDays = (csRows && csRows[0] && Number(csRows[0].standard_work_days)) || 26;
        const actorId = current_user ? (current_user.ma_nv || current_user.username || 'admin') : 'admin';

        await withTransaction(async (txQuery) => {
            for (const row of targets) {
                const targetId = row.ma_nv || row.id_nhan_vien;
                await txQuery(`
                    INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, payout_status, salary_confirm_status, report_sent_at)
                    VALUES (?, ?, ?, ?, 'REPORT_SENT', 'PENDING', NOW())
                    ON DUPLICATE KEY UPDATE
                        payout_status = CASE
                            WHEN payout_status = 'PAID' OR payment_status = 'PAID' THEN 'PAID'
                            ELSE 'REPORT_SENT'
                        END,
                        salary_confirm_status = CASE
                            WHEN payout_status = 'PAID' OR payment_status = 'PAID' THEN salary_confirm_status
                            ELSE 'PENDING'
                        END,
                        report_sent_at = NOW()
                `, [targetId, m, y, stdDays]);

                const netStr = formatViCurrencyServer(row.netSalary || 0);
                const notifTitle = `📩 Báo cáo lương Tháng ${m}/${y} đang chờ xác nhận`;
                const notifMessage = `Báo cáo lương Tháng ${m}/${y} đã sẵn sàng (Thực lĩnh: ${netStr}). Vui lòng kiểm tra và xác nhận.`;

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
                    payout_status: t.employee_payment_status === 'PAID' || t.payout_status === 'PAID' ? 'PAID' : 'REPORT_SENT'
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
            const csRows = await txQuery('SELECT standard_work_days FROM company_settings LIMIT 1').catch(() => []);
            const stdDays = (csRows && csRows[0] && Number(csRows[0].standard_work_days)) || 26;

            const existingAtt = await txQuery(
                'SELECT id, payment_status, payout_status, paid_at, paid_by, transfer_note, salary_confirm_status FROM attendance WHERE ma_nv = ? AND thang = ? AND nam = ? LIMIT 1 FOR UPDATE',
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
                    payout_status: 'PAID',
                    transfer_note: existingRow.transfer_note || cleanTransferNote,
                    employee_paid_at: existingRow.paid_at || null,
                    employee_paid_at_vn: formatVietnamDateTime(existingRow.paid_at),
                    employee_paid_by: existingRow.paid_by || actorId,
                    already_paid: true
                };
            }

            if (cleanStatus === 'PAID') {
                await txQuery(`
                    INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, payment_status, payout_status, paid_at, paid_by, transfer_note)
                    VALUES (?, ?, ?, ?, 'PAID', 'PAID', NOW(), ?, ?)
                    ON DUPLICATE KEY UPDATE
                        payment_status = 'PAID',
                        payout_status = 'PAID',
                        paid_at = NOW(),
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
                    `Công ty SEDINCO đã chuyển khoản lương Tháng ${m}/${y} (Số tiền: ${paidAmtStr}).`,
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
                    INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, payment_status, payout_status, paid_at, paid_by, transfer_note)
                    VALUES (?, ?, ?, ?, 'UNPAID', ?, NULL, NULL, NULL)
                    ON DUPLICATE KEY UPDATE
                        payment_status = 'UNPAID',
                        payout_status = ?,
                        paid_at = NULL,
                        paid_by = NULL,
                        transfer_note = NULL
                `, [cleanMaNv, m, y, stdDays, fallbackPayout, fallbackPayout]);
            }

            const refreshed = await txQuery(
                'SELECT payment_status, payout_status, paid_at, paid_by, transfer_note FROM attendance WHERE ma_nv = ? AND thang = ? AND nam = ? LIMIT 1',
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

    async getPayrollStatusList({ month = null, year = null } = {}) {
        const conditions = [];
        const params = [];
        if (month !== null && month !== undefined && month !== '') {
            const m = parseInt(month, 10);
            if (Number.isInteger(m)) {
                conditions.push('month = ?');
                params.push(m);
            }
        }
        if (year !== null && year !== undefined && year !== '') {
            const y = parseInt(year, 10);
            if (Number.isInteger(y)) {
                conditions.push('year = ?');
                params.push(y);
            }
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const rows = await query(
            `SELECT id, month, year, status, payment_status, approved_by, approved_at, rejected_by, rejected_reason, rejected_at, paid_by, paid_at, updated_at FROM payroll_periods ${whereClause} ORDER BY year DESC, month DESC`,
            params
        );
        return rows || [];
    }

    async getBackupSnapshot(month, year, user = null) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();
        if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2000 || y > 2200) {
            const err = new Error('Tháng hoặc năm sao lưu không hợp lệ!');
            err.statusCode = 400;
            throw err;
        }
        const companyService = require('./companyService');
        const { startDateStr, endDateStr } = getMonthDateBounds(m, y);

        const [
            payrollRows,
            companyConfig,
            periodRows,
            holidays,
            attendanceLogs,
            requestRows
        ] = await Promise.all([
            this.calculateMonthlyPayroll(m, y, { exportAll: true }),
            companyService.getCompanyConfig(),
            query('SELECT id, month, year, status, payment_status, approved_by, approved_at, rejected_by, rejected_reason, rejected_at, paid_by, paid_at, updated_at FROM payroll_periods WHERE month = ? AND year = ? LIMIT 1', [m, y]).catch(() => []),
            query('SELECT id, holiday_name, start_date, end_date FROM public_holidays ORDER BY start_date ASC').catch(() => []),
            query(
                `SELECT id, employee_id, DATE_FORMAT(record_date, "%Y-%m-%d") as record_date, status, ot_hours, check_in_time, check_out_time, check_in_lat, check_in_lng, check_in_method, is_suspicious, suspicious_reason, late_minutes, early_leave_minutes, work_hours, location_name, work_location_type, shift_type
                 FROM attendance_logs
                 WHERE record_date >= ? AND record_date < ?
                 ORDER BY employee_id ASC, record_date ASC`,
                [startDateStr, endDateStr]
            ).catch(() => []),
            query(
                `SELECT * FROM requests
                 WHERE request_date >= ? AND request_date < ?
                 ORDER BY id ASC`,
                [startDateStr, endDateStr]
            ).catch(() => [])
        ]);

        const actorId = user?.ma_nv || user?.username || user?.id || 'admin';
        await logAuditEvent({
            actor_id: actorId,
            actor_role: user?.role || 'admin',
            action: 'EXPORT_PAYROLL_BACKUP_SNAPSHOT',
            resource: 'payroll',
            details: {
                month: m,
                year: y,
                payroll_count: (payrollRows || []).length,
                attendance_logs_count: (attendanceLogs || []).length,
                requests_count: (requestRows || []).length
            }
        });

        return {
            meta: {
                version: 'sedinco-hr-v14-snapshot',
                generated_at: new Date().toISOString(),
                generated_by: actorId,
                month: m,
                year: y
            },
            company_settings: companyConfig,
            period_status: (periodRows && periodRows[0]) ? periodRows[0] : null,
            holidays: holidays || [],
            payroll_rows: payrollRows || [],
            attendance_logs: attendanceLogs || [],
            requests: requestRows || []
        };
    }
}

module.exports = new PayrollService();
