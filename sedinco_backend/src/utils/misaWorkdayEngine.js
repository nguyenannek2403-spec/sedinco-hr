/**
 * Động cơ Tính Công 8 Giờ Chuẩn MISA AMIS (Buổi Sáng 0,5 + Buổi Chiều 0,5 = 1,0 công)
 * - Khung Buổi Sáng: work_start_time -> lunch_start_time (mặc định 08:00 - 12:00 = 240 phút = 0,5 công)
 * - Khung Nghỉ Trưa: lunch_start_time -> lunch_end_time (mặc định 12:00 - 13:30, không tính công)
 * - Khung Buổi Chiều: lunch_end_time -> work_end_time (mặc định 13:30 - 17:30 = 240 phút = 0,5 công)
 * - Chặn tuyệt đối lỗi chấm công vài phút (< 15 phút hoặc < 120 phút/buổi) nhưng vẫn cộng 0,5 công/tiền
 * - Chặn tuyệt đối tự cộng OT khống khi quên check-out rồi tối quay lại công ty bấm ra mà chưa có đơn OT duyệt
 */

const MIN_VALID_CHECK_MINUTES = 15;
const MIN_SESSION_MINUTES = 120;

function parseTimeToMinutes(timeStr, fallback = null) {
    if (!timeStr || typeof timeStr !== 'string') return fallback;
    const parts = timeStr.trim().split(':');
    const hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1] || '0', 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return fallback;
    return hh * 60 + mm;
}

function overlapMinutes(startA, endA, startB, endB) {
    if (startA === null || endA === null || startB === null || endB === null) return 0;
    const s = Math.max(startA, startB);
    const e = Math.min(endA, endB);
    return Math.max(0, e - s);
}

function formatViWorkdayText(val) {
    const num = Number(val) || 0;
    if (num === 0.5) return '0,5';
    if (Number.isInteger(num)) return String(num);
    return String(num).replace('.', ',');
}

function evaluateMisaDailyAttendance({
    checkInTime,
    checkOutTime,
    workStartStr = '08:00',
    lunchStartStr = '12:00',
    lunchEndStr = '13:30',
    workEndStr = '17:30',
    shiftCode = 'FULL_DAY',
    hasMorningPaidHalfLeave = false,
    hasAfternoonPaidHalfLeave = false,
    wasDeductedHalfDayLate = false,
    hasApprovedOt = false,
    approvedOtHours = 0,
    existingOtHours = 0
} = {}) {
    const rawInMins = parseTimeToMinutes(checkInTime, null);
    let rawOutMins = parseTimeToMinutes(checkOutTime, null);

    if (rawInMins === null || rawOutMins === null) {
        return {
            morning_worked_minutes: 0,
            afternoon_worked_minutes: 0,
            total_valid_minutes: 0,
            morning_credit: 0,
            afternoon_credit: 0,
            worked_credit: 0,
            paid_leave_credit: 0,
            work_credit: 0,
            work_hours: 0,
            early_leave_minutes: 0,
            ot_hours: Number(existingOtHours) || 0,
            status: '0',
            duration_status: 'INVALID_SHORT_DURATION',
            session_summary: 'Chưa đủ dữ liệu giờ vào/ra',
            shift_evaluation: 'Chưa đủ dữ liệu giờ vào/ra'
        };
    }

    const workStartMins = parseTimeToMinutes(workStartStr, 480);
    const lunchStartMins = parseTimeToMinutes(lunchStartStr, 720);
    const lunchEndMins = parseTimeToMinutes(lunchEndStr, 810);
    const workEndMins = parseTimeToMinutes(workEndStr, 1050);

    // Nếu là Ca Tối (NIGHT_SHIFT) qua nửa đêm (VD 18:00 -> 22:00 hoặc 22:00 -> 02:00)
    if (rawOutMins < rawInMins && shiftCode === 'NIGHT_SHIFT') {
        rawOutMins += 1440;
    }

    const rawSpanMinutes = Math.max(0, rawOutMins - rawInMins);

    let morning_worked_minutes = 0;
    let afternoon_worked_minutes = 0;
    let effectiveWorkEndMins = workEndMins;

    if (shiftCode === 'MORNING_SHIFT') {
        morning_worked_minutes = overlapMinutes(rawInMins, rawOutMins, workStartMins, workEndMins);
        afternoon_worked_minutes = 0;
    } else if (shiftCode === 'AFTERNOON_SHIFT') {
        // Trường hợp có đơn nghỉ sáng (đã chuyển schedule bắt đầu từ lunchEnd/workStart chiều) hoặc gán ca chiều
        const aftStart = Math.max(workStartMins, lunchEndMins);
        const aftEnd = Math.max(aftStart, workEndMins);
        morning_worked_minutes = 0;
        afternoon_worked_minutes = overlapMinutes(rawInMins, rawOutMins, workStartMins <= lunchEndMins ? workStartMins : aftStart, aftEnd);
    } else if (shiftCode === 'NIGHT_SHIFT') {
        const shiftEnd = workEndMins < workStartMins ? workEndMins + 1440 : workEndMins;
        effectiveWorkEndMins = shiftEnd;
        const nightMins = overlapMinutes(rawInMins, rawOutMins, workStartMins, shiftEnd);
        morning_worked_minutes = Math.min(240, nightMins);
        afternoon_worked_minutes = Math.max(0, nightMins - 240);
    } else {
        // FULL_DAY: tách rõ Buổi Sáng (08:00-12:00) & Buổi Chiều (13:30-17:30), bỏ qua giờ nghỉ trưa
        const mStart = workStartMins;
        const mEnd = Math.max(mStart, lunchStartMins);
        const aStart = Math.max(mEnd, lunchEndMins);
        const aEnd = Math.max(aStart, workEndMins);
        morning_worked_minutes = overlapMinutes(rawInMins, rawOutMins, mStart, mEnd);
        afternoon_worked_minutes = overlapMinutes(rawInMins, rawOutMins, aStart, aEnd);
    }

    const total_valid_minutes = morning_worked_minutes + afternoon_worked_minutes;
    const paid_leave_credit = (hasMorningPaidHalfLeave ? 0.5 : 0) + (hasAfternoonPaidHalfLeave ? 0.5 : 0);

    // Chặn tuyệt đối thao tác bấm nhầm < 15 phút (VD 5 phút, 14 phút)
    if (rawSpanMinutes < MIN_VALID_CHECK_MINUTES || total_valid_minutes < MIN_VALID_CHECK_MINUTES) {
        const workCreditOnlyLeave = Math.min(1, paid_leave_credit);
        const durationText = `Thời gian làm việc quá ngắn (${Math.min(rawSpanMinutes, total_valid_minutes)} phút), chưa đủ điều kiện tính công`;
        return {
            morning_worked_minutes: 0,
            afternoon_worked_minutes: 0,
            total_valid_minutes: 0,
            morning_credit: 0,
            afternoon_credit: 0,
            worked_credit: 0,
            paid_leave_credit,
            work_credit: workCreditOnlyLeave,
            work_hours: 0,
            early_leave_minutes: Math.max(0, effectiveWorkEndMins - rawOutMins),
            ot_hours: 0,
            status: workCreditOnlyLeave >= 1 ? '1' : workCreditOnlyLeave === 0.5 ? '0.5' : '0',
            duration_status: 'INVALID_SHORT_DURATION',
            session_summary: `0 công (${durationText})`,
            shift_evaluation: durationText
        };
    }

    let morning_credit = 0;
    let afternoon_credit = 0;

    if (shiftCode === 'NIGHT_SHIFT') {
        const totalNight = morning_worked_minutes + afternoon_worked_minutes;
        if (totalNight >= 240) {
            morning_credit = 0.5;
            afternoon_credit = 0.5;
        } else if (totalNight >= MIN_SESSION_MINUTES) {
            morning_credit = 0.5;
        }
    } else {
        if (morning_worked_minutes >= MIN_SESSION_MINUTES) {
            morning_credit = 0.5;
        }
        if (afternoon_worked_minutes >= MIN_SESSION_MINUTES) {
            afternoon_credit = 0.5;
        }
    }

    const worked_credit = Math.min(1, morning_credit + afternoon_credit);
    let work_credit = Math.min(1, worked_credit + paid_leave_credit);

    if (wasDeductedHalfDayLate && work_credit > 0.5) {
        work_credit = 0.5;
    }

    const work_hours = Number((total_valid_minutes / 60).toFixed(2));
    const early_leave_minutes = rawOutMins < effectiveWorkEndMins ? (effectiveWorkEndMins - rawOutMins) : 0;

    // Chỉ tính OT khi có đơn OT đã được duyệt cho ngày đó (chống ăn gian OT khi quên check-out tối quay lại bấm)
    let ot_hours = 0;
    const baseExistingOt = Number(existingOtHours) || 0;
    if (hasApprovedOt) {
        const extraMins = Math.max(0, rawOutMins - effectiveWorkEndMins);
        const capApproved = Math.max(0, Number(approvedOtHours) || 0);
        if (extraMins >= 30 && capApproved > 0) {
            ot_hours = Math.min(capApproved, Number((extraMins / 60).toFixed(2)));
        } else {
            ot_hours = Math.max(baseExistingOt, capApproved);
        }
    } else if (baseExistingOt > 0) {
        ot_hours = baseExistingOt;
    }

    let status = '0';
    if (work_credit >= 1) {
        status = ot_hours > 0 ? '1/OT' : '1';
    } else if (work_credit === 0.5) {
        status = '0.5';
    } else {
        status = ot_hours > 0 ? 'OT' : '0';
    }

    let duration_status = 'INSUFFICIENT_SESSION_DURATION';
    if (work_credit >= 1) {
        duration_status = 'FULL_DAY';
    } else if (morning_credit === 0.5 && afternoon_credit === 0) {
        duration_status = 'MORNING_ONLY';
    } else if (afternoon_credit === 0.5 && morning_credit === 0) {
        duration_status = 'AFTERNOON_ONLY';
    }

    let sessionDetail = '';
    if (work_credit === 0) {
        sessionDetail = `Chưa đủ ngưỡng tối thiểu ${MIN_SESSION_MINUTES} phút/buổi (${total_valid_minutes} phút hợp lệ)`;
    } else if (wasDeductedHalfDayLate) {
        sessionDetail = 'Giữ 0,5 công do đi trễ vượt ngưỡng';
    } else if (hasMorningPaidHalfLeave && afternoon_credit === 0.5) {
        sessionDetail = 'Nghỉ phép sáng (0,5) + Ca chiều (0,5)';
    } else if (morning_credit === 0.5 && afternoon_credit === 0.5) {
        sessionDetail = `Cả ngày (${work_hours}h)`;
    } else if (morning_credit === 0.5) {
        sessionDetail = `Ca sáng (${Math.round((morning_worked_minutes / 60) * 10) / 10}h)`;
    } else if (afternoon_credit === 0.5) {
        sessionDetail = `Ca chiều (${Math.round((afternoon_worked_minutes / 60) * 10) / 10}h)`;
    } else {
        sessionDetail = `${total_valid_minutes} phút hợp lệ`;
    }

    const session_summary = `${formatViWorkdayText(work_credit)} công (${sessionDetail})`;
    const shift_evaluation = early_leave_minutes > 0
        ? `Về sớm ${early_leave_minutes} phút • ${session_summary}`
        : ot_hours > 0
            ? `${session_summary} • +${formatViWorkdayText(ot_hours)}h OT`
            : session_summary;

    return {
        morning_worked_minutes,
        afternoon_worked_minutes,
        total_valid_minutes,
        morning_credit,
        afternoon_credit,
        worked_credit,
        paid_leave_credit,
        work_credit,
        work_hours,
        early_leave_minutes,
        ot_hours,
        status,
        duration_status,
        session_summary,
        shift_evaluation
    };
}

function calculateDailyEarnedAmount({
    luong_cb = 0,
    cong_chuan = 26,
    probationRatio = 1,
    workCredit = 0
} = {}) {
    const base = Number(luong_cb) || 0;
    const stdDays = Math.max(1, Number(cong_chuan) || 26);
    const ratio = Number.isFinite(Number(probationRatio)) ? Number(probationRatio) : 1;
    const credit = Math.max(0, Number(workCredit) || 0);
    return Math.round(((base * ratio) / stdDays) * credit);
}

const VI_WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function formatViDateWithWeekday(isoDateStr) {
    const raw = String(isoDateStr || '').trim().slice(0, 10);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return raw;
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(utcDate.getTime())) return raw;
    const wd = VI_WEEKDAYS[utcDate.getUTCDay()] || '';
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')} (${wd})`;
}

/**
 * Sinh chuỗi ghi chú chấm công tiếng Việt chuẩn hóa cho từng ngày làm việc.
 */
function buildDailyAttendanceNote(log = {}, _settings = {}) {
    if (!log || typeof log !== 'object') return '';
    const status = String(log.status || '').trim().toUpperCase();
    const durationStatus = String(log.duration_status || '').trim().toUpperCase();
    const lateMins = Math.max(0, Math.round(Number(log.late_minutes) || 0));
    const earlyMins = Math.max(0, Math.round(Number(log.early_leave_minutes) || 0));
    const suppressEarly = Boolean(log.has_approved_half_leave || Number(log.paid_leave_credit) >= 0.5);

    let lateLabel = '';
    if (lateMins >= 60) {
        const h = Math.floor(lateMins / 60);
        const m = lateMins % 60;
        lateLabel = m > 0
            ? `Vào muộn ${h} giờ ${m} phút (${lateMins} phút)`
            : `Vào muộn ${h} giờ (${lateMins} phút)`;
    } else if (lateMins > 0) {
        lateLabel = `Vào muộn ${lateMins} phút`;
    }

    const earlyLabel = (earlyMins > 0 && !suppressEarly) ? `Ra sớm ${earlyMins} phút` : '';

    let baseNote = '';
    if (status === 'P') {
        baseNote = 'Nghỉ phép hưởng lương (P)';
    } else if (status === 'L') {
        baseNote = 'Nghỉ lễ hưởng lương (L)';
    } else if (status === 'KP' || status === 'V') {
        baseNote = 'Vắng / Nghỉ không lương';
    } else if (durationStatus === 'AUTO_ACCOUNTANT') {
        baseNote = 'Tự động tính công Kế toán (1 công)';
    } else if (durationStatus === 'ADMIN_ADJUSTED_FULL' && lateMins === 0 && earlyMins === 0) {
        baseNote = 'Đúng giờ • Đủ công';
    } else if (durationStatus === 'INVALID_SHORT_DURATION') {
        const inMins = parseTimeToMinutes(log.check_in_time, null);
        const outMins = parseTimeToMinutes(log.check_out_time, null);
        const rawSpan = (inMins !== null && outMins !== null) ? Math.max(0, outMins - inMins) : null;
        const workedSum = (Number(log.morning_worked_minutes) || 0) + (Number(log.afternoon_worked_minutes) || 0);
        const shortMins = rawSpan !== null ? rawSpan : Math.max(0, workedSum);
        baseNote = `Thời gian làm quá ngắn (${shortMins} phút) - Không tính công`;
    } else if (log.check_in_time && !log.check_out_time) {
        const { getVietnamDateString } = require('./timeHelper');
        const todayVn = getVietnamDateString(new Date());
        const logDateIso = String(log.record_date_iso || log.record_date || '').trim().slice(0, 10);
        const unclosedText = (logDateIso && logDateIso < todayVn)
            ? 'Chưa chấm công ra (Quên check-out)'
            : 'Đang trong ca làm việc';
        baseNote = [lateLabel, unclosedText].filter(Boolean).join(' • ');
    } else if (
        durationStatus === 'MORNING_ONLY' ||
        durationStatus === 'AFTERNOON_ONLY' ||
        (status === '0.5' && log.check_in_time && log.check_out_time)
    ) {
        const mornMins = Number(log.morning_worked_minutes) || 0;
        const aftMins = Number(log.afternoon_worked_minutes) || 0;
        const isMorningOnly = durationStatus === 'MORNING_ONLY' || (durationStatus !== 'AFTERNOON_ONLY' && mornMins >= 120 && aftMins < 120);
        const isAfternoonOnly = durationStatus === 'AFTERNOON_ONLY' || (durationStatus !== 'MORNING_ONLY' && aftMins >= 120 && mornMins < 120);
        const sessionLabel = isMorningOnly
            ? 'Làm ca sáng (0,5 công)'
            : isAfternoonOnly
                ? 'Làm ca chiều (0,5 công)'
                : 'Làm nửa ngày (0,5 công)';
        baseNote = [sessionLabel, lateLabel, earlyLabel].filter(Boolean).join(' • ');
    } else if (lateLabel || earlyLabel) {
        baseNote = [lateLabel, earlyLabel].filter(Boolean).join(' • ');
    } else if (status === '0') {
        baseNote = 'Chưa đủ thời gian tính công';
    } else {
        baseNote = 'Đúng giờ • Đủ công';
    }

    if (log.proxy_by) {
        baseNote = `${baseNote} (Chấm công hộ)`;
    }
    return baseNote;
}

module.exports = {
    MIN_VALID_CHECK_MINUTES,
    MIN_SESSION_MINUTES,
    parseTimeToMinutes,
    overlapMinutes,
    evaluateMisaDailyAttendance,
    calculateDailyEarnedAmount,
    formatViDateWithWeekday,
    buildDailyAttendanceNote
};
