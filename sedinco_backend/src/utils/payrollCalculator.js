/**
 * Thuật toán tính lương chuẩn (Sedinco HR Payroll Calculation Engine)
 * Đã xác minh qua bộ test tự động TC-PAY-01 đến TC-PAY-08
 */

const {
    calculateDailyEarnedAmount,
    buildDailyAttendanceNote,
    formatViDateWithWeekday
} = require('./misaWorkdayEngine');

const ALLOWANCE_DEFINITIONS = [
    { key: 'an_trua', label: 'Phụ cấp ăn trưa' },
    { key: 'xang_xe', label: 'Phụ cấp xăng xe' },
    { key: 'nha_o', label: 'Phụ cấp nhà ở' },
    { key: 'thuong_htcv', label: 'Thưởng hoàn thành công việc' },
    { key: 'trach_nhiem', label: 'Phụ cấp trách nhiệm' },
    { key: 'tiep_khach', label: 'Phụ cấp điện thoại / tiếp khách' }
];

function calculateEmployeeSalary({
    luong_cb,
    cong_chuan = 26,
    ngay_chinh_thuc,
    status = 'active',
    chuc_danh = '',
    logs = [],
    holidays = [],
    allowances = {},
    has_insurance = true,
    otRegistrations = null,
    companySettings = {},
    bonusAmount = 0,
    penaltyAmount = 0,
    advanceDeduction = 0
}) {
    const luongCb = Number(luong_cb) || 0;
    const congChuan = Number(companySettings.standard_work_days) || Number(cong_chuan) || 26;
    const probationPercent = Number(companySettings.probation_salary_percent) || 85;
    const probationRatio = probationPercent / 100;
    const otWeekday = Number(companySettings.ot_rate_weekday) || 1.5;
    const otWeekend = Number(companySettings.ot_rate_weekend) || 2.0;
    const otHoliday = Number(companySettings.ot_rate_holiday) || 3.0;
    const customOtHourly = Number(companySettings.custom_ot_hourly_rate) || 0;
    const insuranceRatePercent = companySettings.insurance_rate !== undefined && companySettings.insurance_rate !== null
        ? Number(companySettings.insurance_rate)
        : 10.5;
    const insuranceRatio = insuranceRatePercent / 100;
    const luong1Gio = customOtHourly > 0 ? customOtHourly : ((luongCb / congChuan) / 8);

    let warning = null;
    const isProbationProfile = (status === 'probation' || String(chuc_danh).toLowerCase().includes('thử việc'));
    if (isProbationProfile && !ngay_chinh_thuc) {
        warning = 'CẢNH BÁO: Nhân viên đang ở trạng thái thử việc nhưng thiếu ngày chính thức (ngay_chinh_thuc). Hệ thống đang tính 100% lương theo mặc định!';
    }

    const ngayChinhThuc = ngay_chinh_thuc ? new Date(ngay_chinh_thuc) : null;
    if (ngayChinhThuc) ngayChinhThuc.setHours(0, 0, 0, 0);

    let congThuViec = 0;
    let congChinhThuc = 0;
    let tienOt = 0;
    let totalLateMinutes = 0;
    let lateOccurrences = 0;
    let workedDays = 0;
    let paidLeaveDays = 0;
    let holidayDays = 0;
    let totalOtHours = 0;
    const daily_breakdown = [];

    // Chính sách đi trễ chuẩn hóa (MISA AMIS Smart Policy)
    const validLatePolicies = ['NONE', 'PER_MINUTE', 'PER_OCCURRENCE', 'DEDUCT_WORKDAY'];
    const rawPolicy = String(companySettings.late_policy_type || 'PER_MINUTE').toUpperCase();
    const latePolicyType = validLatePolicies.includes(rawPolicy) ? rawPolicy : 'PER_MINUTE';
    const freeLateOccurrences = companySettings.free_late_occurrences !== undefined && companySettings.free_late_occurrences !== null
        ? Math.max(0, Math.round(Number(companySettings.free_late_occurrences)))
        : 3;
    const perMinRate = Math.max(
        0,
        Number(
            companySettings.late_penalty_per_minute !== undefined && companySettings.late_penalty_per_minute !== null
                ? companySettings.late_penalty_per_minute
                : (companySettings.penalty_per_minute ?? 0)
        ) || 0
    );
    const perOccurrenceAmount = Math.max(
        0,
        Number(
            companySettings.late_penalty_amount !== undefined && companySettings.late_penalty_amount !== null
                ? companySettings.late_penalty_amount
                : (companySettings.penalty_fixed_block ?? 0)
        ) || 0
    );
    const maxLateHalfDay = Math.max(
        1,
        Math.round(Number(companySettings.max_late_minutes_for_half_day ?? 60) || 60)
    );
    const rawProbAllow = companySettings.probation_allowance_full;
    const probationAllowanceFull = (rawProbAllow === undefined || rawProbAllow === null)
        ? true
        : !(rawProbAllow === false || rawProbAllow === 0 || String(rawProbAllow) === '0' || String(rawProbAllow).toLowerCase() === 'false');
    const validOtModes = ['APPROVED_OR_AUTO', 'REQUIRE_APPROVAL', 'AUTO_ACTUAL'];
    const rawOtMode = String(companySettings.ot_calculation_mode || 'APPROVED_OR_AUTO').trim().toUpperCase();
    const otCalculationMode = validOtModes.includes(rawOtMode) ? rawOtMode : 'APPROVED_OR_AUTO';
    const rawFreeExemptsHalfDay = companySettings.free_late_exempts_halfday;
    const freeLateExemptsHalfday = Boolean(
        rawFreeExemptsHalfDay === true ||
        rawFreeExemptsHalfDay === 1 ||
        String(rawFreeExemptsHalfDay) === '1' ||
        String(rawFreeExemptsHalfDay).toLowerCase() === 'true'
    );
    const validNegPolicies = ['CLAMP_ZERO', 'SHOW_NEGATIVE'];
    const rawNegPolicy = String(companySettings.negative_salary_policy || 'CLAMP_ZERO').trim().toUpperCase();
    const negativeSalaryPolicy = validNegPolicies.includes(rawNegPolicy) ? rawNegPolicy : 'CLAMP_ZERO';
    let billableLateMinutes = 0;
    let billableLateOccurrences = 0;

    logs.forEach(log => {
        const logDate = new Date(log.record_date);
        logDate.setHours(0, 0, 0, 0);

        const lateMins = Number(log.late_minutes) || 0;
        let isExcessiveLateHalfDay = false;
        if (lateMins > 0) {
            totalLateMinutes += lateMins;
            lateOccurrences += 1;
            const withinFreeQuota = lateOccurrences <= freeLateOccurrences;
            if (!withinFreeQuota) {
                billableLateOccurrences += 1;
                billableLateMinutes += lateMins;
            }
            if (latePolicyType === 'DEDUCT_WORKDAY' && lateMins > maxLateHalfDay) {
                if (!withinFreeQuota || !freeLateExemptsHalfday) {
                    isExcessiveLateHalfDay = true;
                }
            }
        }

        const isSunday = (log.dow === 1);
        let isHoliday = false;
        for (let h of holidays) {
            const startDate = new Date(h.start_date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(h.end_date);
            endDate.setHours(23, 59, 59, 999);
            if (logDate >= startDate && logDate <= endDate) {
                isHoliday = true;
                break;
            }
        }

        const isProbation = ngayChinhThuc && (logDate < ngayChinhThuc);
        const dayCredit = (unit) => (isExcessiveLateHalfDay && unit > 0.5 ? 0.5 : unit);
        const hasExplicitCredit = log.work_credit !== undefined && log.work_credit !== null && log.work_credit !== '';
        let appliedDayCredit = 0;
        let appliedOtHours = 0;

        if (log.status === '0' || log.duration_status === 'INVALID_SHORT_DURATION') {
            appliedDayCredit = 0;
        } else if (log.status === '1') {
            const credit = hasExplicitCredit ? dayCredit(Math.max(0, Number(log.work_credit) || 0)) : dayCredit(1);
            appliedDayCredit = credit;
            workedDays += credit;
            if (isProbation) congThuViec += credit; else congChinhThuc += credit;
        } else if (log.status === '0.5') {
            const credit = hasExplicitCredit ? Math.max(0, Number(log.work_credit) || 0) : 0.5;
            appliedDayCredit = credit;
            workedDays += credit;
            if (isProbation) congThuViec += credit; else congChinhThuc += credit;
        } else if (log.status === 'P' || log.status === 'L') {
            // Nghỉ phép năm có hưởng lương (P) & Nghỉ lễ/Tết hưởng nguyên lương (L) tính 1.0 công
            appliedDayCredit = 1;
            if (log.status === 'P') paidLeaveDays += 1;
            else holidayDays += 1;
            if (isProbation) congThuViec += 1; else congChinhThuc += 1;
        } else if (log.status === 'OT' || log.status === '1/OT') {
            if (log.status === '1/OT') {
                const credit = hasExplicitCredit ? dayCredit(Math.max(0, Number(log.work_credit) || 0)) : dayCredit(1);
                appliedDayCredit = credit;
                workedDays += credit;
                if (isProbation) congThuViec += credit; else congChinhThuc += credit;
            }
            let heSo = isHoliday ? otHoliday : (isSunday ? otWeekend : otWeekday);
            let soGioOT = Number(log.ot_hours) > 0 ? Number(log.ot_hours) : ((isHoliday || isSunday) ? 8 : 4);

            // Kiểm soát OT theo chính sách công ty: APPROVED_OR_AUTO | REQUIRE_APPROVAL | AUTO_ACTUAL
            const matchedReg = Array.isArray(otRegistrations)
                ? otRegistrations.find(r => {
                    const rDate = new Date(r.work_date);
                    rDate.setHours(0, 0, 0, 0);
                    return rDate.getTime() === logDate.getTime() && r.status === 'approved';
                })
                : null;

            if (otCalculationMode === 'REQUIRE_APPROVAL') {
                soGioOT = matchedReg ? Math.min(soGioOT, Number(matchedReg.expected_hours)) : 0;
            } else if (otCalculationMode === 'APPROVED_OR_AUTO') {
                if (matchedReg) {
                    soGioOT = Math.min(soGioOT, Number(matchedReg.expected_hours));
                }
            }

            appliedOtHours = soGioOT;
            totalOtHours += soGioOT;

            const otBaseHourly = (!probationAllowanceFull && isProbation && customOtHourly <= 0)
                ? (luong1Gio * probationRatio)
                : luong1Gio;
            tienOt += (otBaseHourly * soGioOT * heSo);
        }

        const dailyEarnedAmount = calculateDailyEarnedAmount({
            luong_cb: luongCb,
            cong_chuan: congChuan,
            probationRatio: isProbation ? probationRatio : 1,
            workCredit: appliedDayCredit
        });

        const recordDateIso = log.record_date_iso || (
            log.record_date instanceof Date
                ? `${log.record_date.getFullYear()}-${String(log.record_date.getMonth() + 1).padStart(2, '0')}-${String(log.record_date.getDate()).padStart(2, '0')}`
                : String(log.record_date || '').slice(0, 10)
        );
        daily_breakdown.push({
            ...log,
            record_date_iso: recordDateIso,
            date_label: formatViDateWithWeekday(recordDateIso),
            attendance_note: buildDailyAttendanceNote(log, companySettings),
            work_credit: appliedDayCredit,
            ot_hours_applied: appliedOtHours,
            is_probation_day: Boolean(isProbation),
            daily_earned_amount: dailyEarnedAmount
        });
    });

    const tongPhuCapCoDinh = (Number(allowances.an_trua) || 0) +
                             (Number(allowances.xang_xe) || 0) +
                             (Number(allowances.nha_o) || 0) +
                             (Number(allowances.thuong_htcv) || 0) +
                             (Number(allowances.trach_nhiem) || 0) +
                             (Number(allowances.tiep_khach) || 0);

    const actualWorkDays = congThuViec + congChinhThuc;
    const effectiveDays = (congThuViec * probationRatio) + congChinhThuc;
    const allowanceWorkDays = probationAllowanceFull ? actualWorkDays : effectiveDays;
    const salaryByWork = (luongCb / congChuan) * effectiveDays;
    const allowanceByWork = (tongPhuCapCoDinh / congChuan) * allowanceWorkDays;

    // Chi tiết từng khoản phụ cấp thực nhận theo tỷ lệ ngày công
    const workRatio = congChuan > 0 ? (allowanceWorkDays / congChuan) : 0;
    const allowances_breakdown = {
        an_trua: Math.round((Number(allowances.an_trua) || 0) * workRatio),
        xang_xe: Math.round((Number(allowances.xang_xe) || 0) * workRatio),
        nha_o: Math.round((Number(allowances.nha_o) || 0) * workRatio),
        thuong_htcv: Math.round((Number(allowances.thuong_htcv) || 0) * workRatio),
        trach_nhiem: Math.round((Number(allowances.trach_nhiem) || 0) * workRatio),
        tiep_khach: Math.round((Number(allowances.tiep_khach) || 0) * workRatio)
    };
    const activeAllowances = ALLOWANCE_DEFINITIONS
        .map((def) => ({
            key: def.key,
            label: def.label,
            amount: Number(allowances_breakdown[def.key]) || 0
        }))
        .filter((item) => item.amount > 0);
    const totalAllowance = activeAllowances.length === 0 ? 0 : Math.round(allowanceByWork);

    const grossSalary = salaryByWork + allowanceByWork + tienOt;
    const cleanBonus = Math.max(0, Math.round(Number(bonusAmount) || 0));
    const cleanPenalty = Math.max(0, Math.round(Number(penaltyAmount) || 0));
    const cleanAdvance = Math.max(0, Math.round(Number(advanceDeduction) || 0));

    let latePenaltyAmount = 0;
    if (latePolicyType === 'PER_MINUTE') {
        latePenaltyAmount = Math.round(billableLateMinutes * perMinRate);
    } else if (latePolicyType === 'PER_OCCURRENCE') {
        latePenaltyAmount = Math.round(billableLateOccurrences * perOccurrenceAmount);
    }

    // Nếu nhân viên không đi làm ngày nào (0 ngày công), không trích trừ BHXH và chỉ tính các khoản thưởng/trừ phát sinh
    let baoHiem = 0;
    let rawNetSalary = 0;
    if (actualWorkDays === 0) {
        baoHiem = 0;
        rawNetSalary = Math.round(grossSalary + cleanBonus - cleanPenalty - latePenaltyAmount - cleanAdvance);
    } else {
        baoHiem = (has_insurance !== false && has_insurance !== 0) ? (luongCb * insuranceRatio) : 0;
        rawNetSalary = Math.round(grossSalary - baoHiem + cleanBonus - cleanPenalty - latePenaltyAmount - cleanAdvance);
    }

    const netSalary = negativeSalaryPolicy === 'SHOW_NEGATIVE'
        ? rawNetSalary
        : Math.max(0, rawNetSalary);
    const carryOverDebt = (negativeSalaryPolicy === 'CLAMP_ZERO' && rawNetSalary < 0)
        ? Math.abs(rawNetSalary)
        : 0;

    const unitDailyWage = congChuan > 0 ? Math.round(luongCb / congChuan) : 0;

    return {
        baseSalary: luongCb,
        standardWorkDays: congChuan,
        unitDailyWage,
        probationPercent: isProbationProfile || congThuViec > 0 ? probationPercent : 100,
        insuranceRatePercent,
        congThuViec,
        congChinhThuc,
        workedDays,
        paidLeaveDays,
        holidayDays,
        totalOtHours: Number(totalOtHours.toFixed(2)),
        totalWorkDays: actualWorkDays,
        actualWorkDays,
        effectiveDays,
        totalLateMinutes,
        lateOccurrences,
        billableLateOccurrences,
        latePolicyType,
        latePenaltyAmount,
        salaryByWork: Math.round(salaryByWork),
        totalAllowance,
        total_allowance: totalAllowance,
        allowances: activeAllowances,
        allowances_breakdown,
        otAmount: Math.round(tienOt),
        bonusAmount: cleanBonus,
        penaltyAmount: cleanPenalty,
        advanceDeduction: cleanAdvance,
        totalInsurance: Math.round(baoHiem),
        grossSalary: Math.round(grossSalary),
        rawNetSalary,
        netSalary,
        carryOverDebt,
        carry_over_debt: carryOverDebt,
        probationAllowanceFull,
        otCalculationMode,
        freeLateExemptsHalfday,
        negativeSalaryPolicy,
        daily_breakdown,
        warning
    };
}

module.exports = {
    calculateEmployeeSalary
};
