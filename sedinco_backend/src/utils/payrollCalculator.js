/**
 * Thuật toán tính lương chuẩn (Sedinco HR Payroll Calculation Engine)
 * Đã xác minh qua bộ test tự động TC-PAY-01 đến TC-PAY-08
 */

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
            if (lateOccurrences > freeLateOccurrences) {
                billableLateOccurrences += 1;
                billableLateMinutes += lateMins;
                if (latePolicyType === 'DEDUCT_WORKDAY' && lateMins > maxLateHalfDay) {
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

        if (log.status === '1') {
            const credit = dayCredit(1);
            if (isProbation) congThuViec += credit; else congChinhThuc += credit;
        } else if (log.status === '0.5') {
            if (isProbation) congThuViec += 0.5; else congChinhThuc += 0.5;
        } else if (log.status === 'OT' || log.status === '1/OT') {
            if (log.status === '1/OT') {
                const credit = dayCredit(1);
                if (isProbation) congThuViec += credit; else congChinhThuc += credit;
            }
            let heSo = isHoliday ? otHoliday : (isSunday ? otWeekend : otWeekday);
            let soGioOT = Number(log.ot_hours) > 0 ? Number(log.ot_hours) : ((isHoliday || isSunday) ? 8 : 4);

            // Kiểm soát OT duyệt trước (Anti-OT Fraud): Nếu có đơn duyệt trước hoặc giờ OT đã ghi nhận trực tiếp từ Check-out
            if (Array.isArray(otRegistrations) && otRegistrations.length > 0) {
                const reg = otRegistrations.find(r => {
                    const rDate = new Date(r.work_date);
                    rDate.setHours(0, 0, 0, 0);
                    return rDate.getTime() === logDate.getTime() && r.status === 'approved';
                });
                if (reg) {
                    soGioOT = Math.min(soGioOT, Number(reg.expected_hours));
                }
            }

            tienOt += (luong1Gio * soGioOT * heSo);
        }
    });

    const tongPhuCapCoDinh = (Number(allowances.an_trua) || 0) +
                             (Number(allowances.xang_xe) || 0) +
                             (Number(allowances.nha_o) || 0) +
                             (Number(allowances.thuong_htcv) || 0) +
                             (Number(allowances.trach_nhiem) || 0) +
                             (Number(allowances.tiep_khach) || 0);

    const actualWorkDays = congThuViec + congChinhThuc;
    const effectiveDays = (congThuViec * probationRatio) + congChinhThuc;
    const salaryByWork = (luongCb / congChuan) * effectiveDays;
    const allowanceByWork = (tongPhuCapCoDinh / congChuan) * actualWorkDays;

    // Chi tiết từng khoản phụ cấp thực nhận theo tỷ lệ ngày công thực tế
    const workRatio = congChuan > 0 ? (actualWorkDays / congChuan) : 0;
    const allowances_breakdown = {
        an_trua: Math.round((Number(allowances.an_trua) || 0) * workRatio),
        xang_xe: Math.round((Number(allowances.xang_xe) || 0) * workRatio),
        nha_o: Math.round((Number(allowances.nha_o) || 0) * workRatio),
        thuong_htcv: Math.round((Number(allowances.thuong_htcv) || 0) * workRatio),
        trach_nhiem: Math.round((Number(allowances.trach_nhiem) || 0) * workRatio),
        tiep_khach: Math.round((Number(allowances.tiep_khach) || 0) * workRatio)
    };

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

    // Nếu nhân viên không đi làm ngày nào (0 ngày công), không trích trừ BHXH và chỉ tính các khoản thưởng/trừ phát sinh (không âm)
    let baoHiem = 0;
    let netSalary = 0;
    if (actualWorkDays === 0) {
        baoHiem = 0;
        netSalary = Math.max(0, Math.round(grossSalary + cleanBonus - cleanPenalty - latePenaltyAmount - cleanAdvance));
    } else {
        baoHiem = (has_insurance !== false && has_insurance !== 0) ? (luongCb * insuranceRatio) : 0;
        netSalary = Math.max(0, Math.round(grossSalary - baoHiem + cleanBonus - cleanPenalty - latePenaltyAmount - cleanAdvance));
    }

    return {
        baseSalary: luongCb,
        standardWorkDays: congChuan,
        insuranceRatePercent,
        congThuViec,
        congChinhThuc,
        totalWorkDays: actualWorkDays,
        actualWorkDays,
        effectiveDays,
        totalLateMinutes,
        lateOccurrences,
        billableLateOccurrences,
        latePolicyType,
        latePenaltyAmount,
        salaryByWork: Math.round(salaryByWork),
        totalAllowance: Math.round(allowanceByWork),
        allowances_breakdown,
        otAmount: Math.round(tienOt),
        bonusAmount: cleanBonus,
        penaltyAmount: cleanPenalty,
        advanceDeduction: cleanAdvance,
        totalInsurance: Math.round(baoHiem),
        grossSalary: Math.round(grossSalary),
        netSalary,
        warning
    };
}

module.exports = {
    calculateEmployeeSalary
};
