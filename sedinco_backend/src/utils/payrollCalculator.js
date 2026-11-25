/**
 * Thuật toán tính lương chuẩn (Sedinco HR Payroll Calculation Engine)
 * Đã xác minh qua bộ test tự động TC-PAY-01 đến TC-PAY-08
 */

const {
    calculateDailyEarnedAmount,
    buildDailyAttendanceNote,
    formatViDateWithWeekday
} = require('./misaWorkdayEngine');
const {
    getDaysInMonth,
    getMonthlyStandardWorkdays,
    isSundayIsoDate,
    normalizePureIsoDate
} = require('./timeHelper');
const { findHolidayForDate, buildHolidayDateMap } = require('./vnHolidaysCatalog');

const ALLOWANCE_DEFINITIONS = [
    { key: 'an_trua', label: 'Phụ cấp ăn trưa' },
    { key: 'xang_xe', label: 'Phụ cấp xăng xe' },
    { key: 'nha_o', label: 'Phụ cấp nhà ở' },
    { key: 'thuong_htcv', label: 'Thưởng hoàn thành công việc' },
    { key: 'trach_nhiem', label: 'Phụ cấp trách nhiệm' },
    { key: 'tiep_khach', label: 'Phụ cấp điện thoại / tiếp khách' }
];

function formatViMultiplier(m) {
    const n = Math.round((Number(m) || 3) * 100) / 100;
    return String(n).replace('.', ',');
}

function buildDailyStatusLabelVi({ status, workCredit = 0, isSunday = false } = {}) {
    const st = String(status || '').trim().toUpperCase();
    const credit = Number(workCredit) || 0;
    if (st === 'L' || st === 'HOLIDAY') return 'Nghỉ lễ hưởng lương';
    if (st === 'P' || st === 'PAID_LEAVE') return 'Nghỉ phép có lương';
    if (st === 'KL' || st === 'KP' || st === 'V' || st === 'ABSENT' || st === '0') {
        return isSunday ? 'Chủ nhật' : 'Nghỉ không lương';
    }
    if (st === 'OT') {
        if (credit >= 1) return 'Đủ 1 công';
        if (credit === 0.5) return 'Làm nửa công (0,5)';
        return isSunday ? 'Chủ nhật' : 'Tăng ca OT';
    }
    if (st === '1/OT' || st === '1' || st === 'FULL' || st === 'PRESENT' || credit >= 1) {
        return 'Đủ 1 công';
    }
    if (st === '0.5' || st === 'HALF' || credit === 0.5) {
        return 'Làm nửa công (0,5)';
    }
    return isSunday ? 'Chủ nhật' : 'Nghỉ không lương';
}

function reconcileDailyRoundingDelta(rows, field, targetTotal) {
    if (!Array.isArray(rows) || rows.length === 0) return;
    const sum = rows.reduce((acc, row) => acc + (Number(row[field]) || 0), 0);
    const delta = Math.round(targetTotal) - sum;
    if (delta === 0) return;
    for (let i = rows.length - 1; i >= 0; i--) {
        if ((Number(rows[i][field]) || 0) > 0) {
            rows[i][field] = Math.max(0, (Number(rows[i][field]) || 0) + delta);
            rows[i].daily_earned_amount =
                (Number(rows[i].daily_base_amount) || 0) +
                (Number(rows[i].daily_holiday_amount) || 0) +
                (Number(rows[i].daily_ot_amount) || 0) -
                (Number(rows[i].daily_penalty_amount) || 0);
            break;
        }
    }
}

function calculateEmployeeSalary({
    luong_cb,
    cong_chuan = null,
    month = null,
    year = null,
    ngay_chinh_thuc,
    status = 'active',
    chuc_danh = '',
    logs = [],
    holidays = [],
    allowances = {},
    custom_allowances = null,
    has_insurance = true,
    otRegistrations = null,
    companySettings = {},
    bonusAmount = 0,
    penaltyAmount = 0,
    advanceDeduction = 0
}) {
    const luongCb = Number(luong_cb) || 0;
    const hasExplicitPeriod = Boolean(month && year);
    const congChuan = hasExplicitPeriod
        ? getMonthlyStandardWorkdays(month, year)
        : (Number(cong_chuan) || getMonthlyStandardWorkdays());
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
    const rawMonthlyLeaveLimit = companySettings.monthly_paid_leave_limit;
    const monthlyPaidLeaveLimit = (rawMonthlyLeaveLimit !== undefined && rawMonthlyLeaveLimit !== null && rawMonthlyLeaveLimit !== '')
        ? Math.max(0, Math.min(31, Number(rawMonthlyLeaveLimit) || 0))
        : 1;
    const luong1Gio = customOtHourly > 0 ? customOtHourly : ((luongCb / congChuan) / 8);

    let warning = null;
    const isProbationProfile = (status === 'probation' || String(chuc_danh).toLowerCase().includes('thử việc'));
    if (isProbationProfile && !ngay_chinh_thuc) {
        warning = 'CẢNH BÁO: Nhân viên đang ở trạng thái thử việc nhưng thiếu ngày chính thức (ngay_chinh_thuc). Hệ thống đang tính 100% lương theo mặc định!';
    }

    const ngayChinhThucIso = ngay_chinh_thuc ? normalizePureIsoDate(ngay_chinh_thuc) : null;
    const approvedOtByIso = new Map();
    if (Array.isArray(otRegistrations)) {
        for (const r of otRegistrations) {
            if (r && r.status === 'approved') {
                const rIso = normalizePureIsoDate(r.work_date);
                if (rIso && !approvedOtByIso.has(rIso)) {
                    approvedOtByIso.set(rIso, r);
                }
            }
        }
    }

    let congThuViec = 0;
    let congChinhThuc = 0;
    let tienLamNgayLe = 0;
    let congLamNgayLe = 0;
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
    const seenIsoDates = new Set();

    const sortedLogs = Array.isArray(logs)
        ? [...logs].sort((a, b) => {
            const isoA = normalizePureIsoDate(a.record_date_iso || a.record_date) || String(a.record_date || '');
            const isoB = normalizePureIsoDate(b.record_date_iso || b.record_date) || String(b.record_date || '');
            return isoA.localeCompare(isoB);
        })
        : [];

    sortedLogs.forEach(log => {
        const cleanIsoDate = normalizePureIsoDate(log.record_date_iso || log.record_date);
        if (cleanIsoDate) seenIsoDates.add(cleanIsoDate);
        const logDate = cleanIsoDate ? new Date(`${cleanIsoDate}T00:00:00+07:00`) : new Date(log.record_date);

        const isAdminAdjustedFull = String(log.duration_status || '').trim().toUpperCase() === 'ADMIN_ADJUSTED_FULL';
        const lateMins = isAdminAdjustedFull ? 0 : (Number(log.late_minutes) || 0);
        let isExcessiveLateHalfDay = false;
        let dailyPenaltyAmount = 0;
        let dailyPenaltyReason = null;
        if (lateMins > 0) {
            totalLateMinutes += lateMins;
            lateOccurrences += 1;
            const withinFreeQuota = lateOccurrences <= freeLateOccurrences;
            if (!withinFreeQuota) {
                billableLateOccurrences += 1;
                billableLateMinutes += lateMins;
                if (latePolicyType === 'PER_MINUTE' && perMinRate > 0) {
                    dailyPenaltyAmount = Math.round(lateMins * perMinRate);
                    dailyPenaltyReason = `Đi muộn ${lateMins} phút`;
                } else if (latePolicyType === 'PER_OCCURRENCE' && perOccurrenceAmount > 0) {
                    dailyPenaltyAmount = Math.round(perOccurrenceAmount);
                    dailyPenaltyReason = `Đi muộn ${lateMins} phút (quá ${freeLateOccurrences} lần miễn)`;
                }
            }
            if (latePolicyType === 'DEDUCT_WORKDAY' && lateMins > maxLateHalfDay) {
                if (!withinFreeQuota || !freeLateExemptsHalfday) {
                    isExcessiveLateHalfDay = true;
                }
            }
        }

        const isSunday = cleanIsoDate ? isSundayIsoDate(cleanIsoDate) : (log.dow === 1);
        const matchedHoliday = findHolidayForDate(holidays, cleanIsoDate || logDate);
        const isHoliday = Boolean(matchedHoliday);
        const holidayMultiplier = isHoliday
            ? Math.max(1, Number(matchedHoliday?.salary_multiplier ?? matchedHoliday?.multiplier ?? otHoliday ?? 3.0) || 3.0)
            : 0;

        const isProbation = Boolean(ngayChinhThucIso && cleanIsoDate && (cleanIsoDate < ngayChinhThucIso));
        const unitDailyRateForDay = (!probationAllowanceFull && isProbation)
            ? ((luongCb / congChuan) * probationRatio)
            : (luongCb / congChuan);
        const dayCredit = (unit) => (isExcessiveLateHalfDay && unit > 0.5 ? 0.5 : unit);
        const hasExplicitCredit = log.work_credit !== undefined && log.work_credit !== null && log.work_credit !== '';
        let appliedDayCredit = 0;
        let appliedOtHours = 0;
        let dailyOtMultiplier = 0;
        let dailyOtAmount = 0;
        let dailyHolidayWorkCredit = 0;
        let dailyHolidayAmount = 0;

        let effectiveStatus = log.status;
        let customAttendanceNote = null;

        const matchedReg = cleanIsoDate ? (approvedOtByIso.get(cleanIsoDate) || null) : null;
        const resolveAllowedOtHours = (rawHrs) => {
            if (otCalculationMode === 'REQUIRE_APPROVAL') {
                return matchedReg ? Math.min(rawHrs, Number(matchedReg.expected_hours)) : 0;
            }
            if (otCalculationMode === 'APPROVED_OR_AUTO' && matchedReg) {
                return Math.min(rawHrs, Number(matchedReg.expected_hours));
            }
            return rawHrs;
        };
        const otBaseHourly = (!probationAllowanceFull && isProbation && customOtHourly <= 0)
            ? (luong1Gio * probationRatio)
            : luong1Gio;

        if (log.status === '0' || log.duration_status === 'INVALID_SHORT_DURATION') {
            appliedDayCredit = 0;
        } else if (log.status === '1' || log.status === '0.5') {
            const credit = log.status === '1'
                ? (hasExplicitCredit ? dayCredit(Math.max(0, Number(log.work_credit) || 0)) : dayCredit(1))
                : (hasExplicitCredit ? Math.max(0, Number(log.work_credit) || 0) : 0.5);
            if (!isHoliday) {
                appliedDayCredit = credit;
                workedDays += credit;
                if (isProbation) congThuViec += credit; else congChinhThuc += credit;
            } else {
                appliedDayCredit = !isSunday ? Math.max(1, credit) : credit;
                workedDays += credit;
                if (!isSunday) {
                    holidayDays += Math.max(0, 1 - credit);
                }
                if (isProbation) congThuViec += appliedDayCredit; else congChinhThuc += appliedDayCredit;
                if (credit > 0) {
                    dailyHolidayWorkCredit = credit;
                    congLamNgayLe += credit;
                    const rawHolExtra = Math.max(0, holidayMultiplier - 1) * credit * unitDailyRateForDay;
                    tienLamNgayLe += rawHolExtra;
                    dailyHolidayAmount = Math.round(rawHolExtra);
                    customAttendanceNote = `Đi làm ngày lễ (x${formatViMultiplier(holidayMultiplier)}) • ${matchedHoliday.holiday_name}`;
                }
            }
        } else if (log.status === 'P') {
            // V39: Tối đa 1 công nghỉ phép có lương/tháng; phát sinh vượt hạn mức tính là nghỉ không lương (KL)
            if (paidLeaveDays < monthlyPaidLeaveLimit) {
                const remainCap = Number((monthlyPaidLeaveLimit - paidLeaveDays).toFixed(2));
                const credit = Math.min(1, remainCap);
                appliedDayCredit = credit;
                paidLeaveDays += credit;
                if (isProbation) congThuViec += credit; else congChinhThuc += credit;
            } else {
                effectiveStatus = 'KL';
                appliedDayCredit = 0;
                customAttendanceNote = 'Nghỉ không lương (vượt định mức phép tháng)';
            }
        } else if (log.status === 'L') {
            // Nghỉ lễ/Tết hưởng nguyên lương (L) tính 1.0 công
            appliedDayCredit = 1;
            holidayDays += 1;
            if (isProbation) congThuViec += 1; else congChinhThuc += 1;
        } else if (log.status === 'OT' || log.status === '1/OT') {
            if (!isHoliday) {
                if (log.status === '1/OT') {
                    const credit = hasExplicitCredit ? dayCredit(Math.max(0, Number(log.work_credit) || 0)) : dayCredit(1);
                    appliedDayCredit = credit;
                    workedDays += credit;
                    if (isProbation) congThuViec += credit; else congChinhThuc += credit;
                }
                const heSo = isSunday ? otWeekend : otWeekday;
                const rawSoGioOT = Number(log.ot_hours) > 0 ? Number(log.ot_hours) : (isSunday ? 8 : 4);
                const soGioOT = resolveAllowedOtHours(rawSoGioOT);

                appliedOtHours = soGioOT;
                totalOtHours += soGioOT;

                const rawDayOt = otBaseHourly * soGioOT * heSo;
                tienOt += rawDayOt;
                dailyOtMultiplier = soGioOT > 0 ? heSo : 0;
                dailyOtAmount = Math.round(rawDayOt);
            } else if (log.status === '1/OT') {
                const credit = hasExplicitCredit ? dayCredit(Math.max(0, Number(log.work_credit) || 0)) : dayCredit(1);
                appliedDayCredit = !isSunday ? Math.max(1, credit) : credit;
                workedDays += credit;
                if (!isSunday) {
                    holidayDays += Math.max(0, 1 - credit);
                }
                if (isProbation) congThuViec += appliedDayCredit; else congChinhThuc += appliedDayCredit;

                if (credit > 0) {
                    dailyHolidayWorkCredit = credit;
                    congLamNgayLe += credit;
                    const rawHolExtra = Math.max(0, holidayMultiplier - 1) * credit * unitDailyRateForDay;
                    tienLamNgayLe += rawHolExtra;
                    dailyHolidayAmount = Math.round(rawHolExtra);
                    customAttendanceNote = `Đi làm ngày lễ (x${formatViMultiplier(holidayMultiplier)}) • ${matchedHoliday.holiday_name}`;
                }

                const extraOtHrs = resolveAllowedOtHours(Math.max(0, Number(log.ot_hours) || 0));
                if (extraOtHrs > 0) {
                    appliedOtHours = extraOtHrs;
                    totalOtHours += extraOtHrs;
                    const rawDayOt = otBaseHourly * extraOtHrs * holidayMultiplier;
                    tienOt += rawDayOt;
                    dailyOtMultiplier = holidayMultiplier;
                    dailyOtAmount = Math.round(rawDayOt);
                }
            } else {
                const rawSoGioOT = Number(log.ot_hours) > 0 ? Number(log.ot_hours) : 8;
                const soGioOT = resolveAllowedOtHours(rawSoGioOT);
                const credit = Math.min(1, Math.max(0, Number((soGioOT / 8).toFixed(4))));
                const extraOtHrs = Math.max(0, soGioOT - 8);

                appliedDayCredit = !isSunday ? 1 : credit;
                workedDays += credit;
                if (!isSunday) {
                    holidayDays += Math.max(0, 1 - credit);
                }
                if (isProbation) congThuViec += appliedDayCredit; else congChinhThuc += appliedDayCredit;

                if (credit > 0) {
                    dailyHolidayWorkCredit = credit;
                    congLamNgayLe += credit;
                    const rawHolExtra = Math.max(0, holidayMultiplier - 1) * credit * unitDailyRateForDay;
                    tienLamNgayLe += rawHolExtra;
                    dailyHolidayAmount = Math.round(rawHolExtra);
                    customAttendanceNote = `Đi làm ngày lễ (x${formatViMultiplier(holidayMultiplier)}) • ${matchedHoliday.holiday_name}`;
                }

                if (extraOtHrs > 0) {
                    appliedOtHours = extraOtHrs;
                    totalOtHours += extraOtHrs;
                    const rawDayOt = otBaseHourly * extraOtHrs * holidayMultiplier;
                    tienOt += rawDayOt;
                    dailyOtMultiplier = holidayMultiplier;
                    dailyOtAmount = Math.round(rawDayOt);
                }
            }
        }

        const dailyBaseAmount = calculateDailyEarnedAmount({
            luong_cb: luongCb,
            cong_chuan: congChuan,
            probationRatio: isProbation ? probationRatio : 1,
            workCredit: appliedDayCredit
        });
        const dailyEarnedAmount = dailyBaseAmount + dailyHolidayAmount + dailyOtAmount - dailyPenaltyAmount;

        const recordDateIso = cleanIsoDate || normalizePureIsoDate(log.record_date_iso || log.record_date);
        const computedStatusLabelVi = dailyHolidayWorkCredit > 0
            ? (dailyHolidayWorkCredit >= 1
                ? `Đi làm ngày lễ (x${formatViMultiplier(holidayMultiplier)})`
                : `Làm ngày lễ ${String(Number(dailyHolidayWorkCredit.toFixed(2))).replace('.', ',')} công (x${formatViMultiplier(holidayMultiplier)})`)
            : buildDailyStatusLabelVi({
                status: effectiveStatus,
                workCredit: appliedDayCredit,
                isSunday
            });

        daily_breakdown.push({
            ...log,
            status: effectiveStatus,
            status_label_vi: computedStatusLabelVi,
            record_date_iso: recordDateIso,
            date_label: formatViDateWithWeekday(recordDateIso),
            holiday_name: matchedHoliday ? matchedHoliday.holiday_name : null,
            holiday_multiplier: isHoliday ? holidayMultiplier : null,
            holiday_work_credit: dailyHolidayWorkCredit,
            attendance_note: customAttendanceNote || (matchedHoliday && effectiveStatus === 'L' ? `Nghỉ lễ hưởng nguyên lương (${matchedHoliday.holiday_name})` : buildDailyAttendanceNote({ ...log, status: effectiveStatus }, companySettings)),
            work_credit: appliedDayCredit,
            ot_hours_applied: appliedOtHours,
            ot_multiplier: dailyOtMultiplier,
            is_probation_day: Boolean(isProbation),
            daily_base_amount: dailyBaseAmount,
            daily_holiday_amount: dailyHolidayAmount,
            daily_ot_amount: dailyOtAmount,
            daily_penalty_amount: dailyPenaltyAmount,
            daily_penalty_reason: dailyPenaltyAmount > 0 ? dailyPenaltyReason : null,
            daily_earned_amount: dailyEarnedAmount
        });
    });

    // Tự động áp dụng 1.0 công hưởng nguyên lương cho các ngày lễ nằm trong ngày làm việc (T2-T7) chưa có log
    if (month && year && Array.isArray(holidays) && holidays.length > 0) {
        const holidayMap = buildHolidayDateMap(holidays, month, year);
        const totalDaysInMonth = getDaysInMonth(month, year);
        for (let d = 1; d <= totalDaysInMonth; d++) {
            const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            if (seenIsoDates.has(iso)) continue;
            const hol = holidayMap[iso];
            if (!hol) continue;
            const isSun = isSundayIsoDate(iso);
            if (!isSun) {
                const isProbHol = Boolean(ngayChinhThucIso && iso < ngayChinhThucIso);
                holidayDays += 1;
                if (isProbHol) congThuViec += 1; else congChinhThuc += 1;
                const earnedAmt = calculateDailyEarnedAmount({
                    luong_cb: luongCb,
                    cong_chuan: congChuan,
                    probationRatio: isProbHol ? probationRatio : 1,
                    workCredit: 1
                });
                daily_breakdown.push({
                    record_date: iso,
                    record_date_iso: iso,
                    status: 'L',
                    status_label_vi: 'Nghỉ lễ hưởng lương',
                    ot_hours: 0,
                    work_credit: 1,
                    ot_hours_applied: 0,
                    ot_multiplier: 0,
                    holiday_name: hol.holiday_name,
                    holiday_multiplier: Number(hol.salary_multiplier) || 3.0,
                    holiday_work_credit: 0,
                    date_label: formatViDateWithWeekday(iso),
                    attendance_note: `Nghỉ lễ hưởng nguyên lương (${hol.holiday_name})`,
                    is_probation_day: isProbHol,
                    is_auto_holiday: true,
                    daily_base_amount: earnedAmt,
                    daily_holiday_amount: 0,
                    daily_ot_amount: 0,
                    daily_penalty_amount: 0,
                    daily_penalty_reason: null,
                    daily_earned_amount: earnedAmt
                });
            }
        }
        daily_breakdown.sort((a, b) => String(a.record_date_iso || '').localeCompare(String(b.record_date_iso || '')));
    }

    const actualWorkDays = congThuViec + congChinhThuc;
    const effectiveDays = (congThuViec * probationRatio) + congChinhThuc;
    const allowanceWorkDays = probationAllowanceFull ? actualWorkDays : effectiveDays;
    const workRatio = congChuan > 0 ? (allowanceWorkDays / congChuan) : 0;

    let tongPhuCapCoDinh = 0;
    let allowances_breakdown = {};
    let activeAllowances = [];

    if (Array.isArray(custom_allowances)) {
        const validDynamic = custom_allowances
            .map((item, idx) => {
                if (!item || typeof item !== 'object') return null;
                const name = String(item.name || item.label || '').trim();
                const baseAmt = Math.max(0, Math.round(Number(item.amount) || 0));
                if (!name || baseAmt <= 0) return null;
                const key = String(item.id || item.key || `alw_${idx + 1}`).trim();
                return { id: key, key, name, label: name, base_amount: baseAmt };
            })
            .filter(Boolean);

        tongPhuCapCoDinh = validDynamic.reduce((sum, item) => sum + item.base_amount, 0);
        activeAllowances = validDynamic
            .map((item) => {
                const earnedAmt = Math.round(item.base_amount * workRatio);
                allowances_breakdown[item.key] = earnedAmt;
                return {
                    id: item.id,
                    key: item.key,
                    name: item.name,
                    label: item.label,
                    base_amount: item.base_amount,
                    amount: earnedAmt
                };
            })
            .filter((item) => item.amount > 0);
    } else {
        tongPhuCapCoDinh = (Number(allowances.an_trua) || 0) +
                           (Number(allowances.xang_xe) || 0) +
                           (Number(allowances.nha_o) || 0) +
                           (Number(allowances.thuong_htcv) || 0) +
                           (Number(allowances.trach_nhiem) || 0) +
                           (Number(allowances.tiep_khach) || 0);

        allowances_breakdown = {
            an_trua: Math.round((Number(allowances.an_trua) || 0) * workRatio),
            xang_xe: Math.round((Number(allowances.xang_xe) || 0) * workRatio),
            nha_o: Math.round((Number(allowances.nha_o) || 0) * workRatio),
            thuong_htcv: Math.round((Number(allowances.thuong_htcv) || 0) * workRatio),
            trach_nhiem: Math.round((Number(allowances.trach_nhiem) || 0) * workRatio),
            tiep_khach: Math.round((Number(allowances.tiep_khach) || 0) * workRatio)
        };
        activeAllowances = ALLOWANCE_DEFINITIONS
            .map((def) => ({
                id: def.key,
                key: def.key,
                name: def.label,
                label: def.label,
                amount: Number(allowances_breakdown[def.key]) || 0
            }))
            .filter((item) => item.amount > 0);
    }

    const salaryByWork = (luongCb / congChuan) * effectiveDays;
    const allowanceByWork = (tongPhuCapCoDinh / congChuan) * allowanceWorkDays;
    const totalAllowance = activeAllowances.length === 0 ? 0 : Math.round(allowanceByWork);

    const grossSalary = salaryByWork + allowanceByWork + tienLamNgayLe + tienOt;
    const cleanBonus = Math.max(0, Math.round(Number(bonusAmount) || 0));
    const cleanPenalty = Math.max(0, Math.round(Number(penaltyAmount) || 0));
    const cleanAdvance = Math.max(0, Math.round(Number(advanceDeduction) || 0));

    let latePenaltyAmount = 0;
    if (latePolicyType === 'PER_MINUTE') {
        latePenaltyAmount = Math.round(billableLateMinutes * perMinRate);
    } else if (latePolicyType === 'PER_OCCURRENCE') {
        latePenaltyAmount = Math.round(billableLateOccurrences * perOccurrenceAmount);
    }

    reconcileDailyRoundingDelta(daily_breakdown, 'daily_base_amount', salaryByWork);
    reconcileDailyRoundingDelta(daily_breakdown, 'daily_holiday_amount', tienLamNgayLe);
    reconcileDailyRoundingDelta(daily_breakdown, 'daily_ot_amount', tienOt);
    reconcileDailyRoundingDelta(daily_breakdown, 'daily_penalty_amount', latePenaltyAmount);

    const holidayWorkBreakdown = daily_breakdown
        .filter((r) => (Number(r.holiday_work_credit) || 0) > 0 || (Number(r.daily_holiday_amount) || 0) > 0)
        .map((r) => {
            const mult = Number(r.holiday_multiplier) || 3.0;
            return {
                date: r.record_date_iso,
                holiday_name: r.holiday_name || 'Ngày nghỉ lễ',
                work_credit: Number(r.holiday_work_credit) || 0,
                multiplier: mult,
                multiplier_label: `x${formatViMultiplier(mult)}`,
                amount: Number(r.daily_holiday_amount) || 0
            };
        });

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
        holidayWorkAmount: Math.round(tienLamNgayLe),
        holidayWorkDays: Number(congLamNgayLe.toFixed(2)),
        holidayWorkBreakdown,
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
