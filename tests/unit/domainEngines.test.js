/**
 * Phase 10 Unit Tests: Domain Engines, Timezone, MISA Workday, Payroll, Media Security, QR, Validators
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const path = require('path');

const backendRoot = path.resolve(__dirname, '../../sedinco_backend');
const { evaluateMisaDailyAttendance, calculateDailyEarnedAmount } = require(path.join(backendRoot, 'src/utils/misaWorkdayEngine'));
const { calculateEmployeeSalary } = require(path.join(backendRoot, 'src/utils/payrollCalculator'));
const { getMonthlyStandardWorkdays, normalizePureIsoDate, isSundayIsoDate } = require(path.join(backendRoot, 'src/utils/timeHelper'));
const { validateAttendanceInput } = require(path.join(backendRoot, 'src/middlewares/validationMiddleware'));
const { detectExecutableOrScriptDanger, inspectUploadedBuffer, parseBase64ImageDataUrl } = require(path.join(backendRoot, 'src/utils/mediaValidator'));
const { detectForbiddenUploadParams, resolveCategoryPolicy, resolveTargetAssetFolder } = require(path.join(backendRoot, 'src/utils/mediaFolderPolicy'));
const { generateAttendanceQrToken, verifyAttendanceQrToken } = require(path.join(backendRoot, 'src/utils/qrTokenHelper'));
const { sanitizeBankCardInput } = require(path.join(backendRoot, 'src/utils/bankValidator'));

const TINY_PNG = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
);

const results = [];
function runCase(id, name, fn) {
    try {
        fn();
        results.push({ id, name, status: 'PASS' });
    } catch (err) {
        results.push({ id, name, status: 'FAIL', error: err.message });
    }
}

// 1. MISA Workday Engine
runCase('UNIT-MISA-01', 'Full day 08:00-17:30 yields 1.0 credit & status 1', () => {
    const res = evaluateMisaDailyAttendance({ checkInTime: '08:00:00', checkOutTime: '17:30:00' });
    assert.strictEqual(res.work_credit, 1);
    assert.strictEqual(res.status, '1');
    assert.strictEqual(res.morning_worked_minutes, 240);
    assert.strictEqual(res.afternoon_worked_minutes, 240);
});

runCase('UNIT-MISA-02', 'Short check < 15 minutes yields 0 credit (INVALID_SHORT_DURATION)', () => {
    const res = evaluateMisaDailyAttendance({ checkInTime: '08:00:00', checkOutTime: '08:10:00' });
    assert.strictEqual(res.work_credit, 0);
    assert.strictEqual(res.duration_status, 'INVALID_SHORT_DURATION');
});

runCase('UNIT-MISA-03', 'Half-day morning only 08:00-12:00 yields 0.5 credit', () => {
    const res = evaluateMisaDailyAttendance({ checkInTime: '08:00:00', checkOutTime: '12:00:00' });
    assert.strictEqual(res.work_credit, 0.5);
    assert.strictEqual(res.status, '0.5');
});

runCase('UNIT-MISA-04', 'Night shift crossing midnight 22:00-06:00 yields 1.0 credit', () => {
    const res = evaluateMisaDailyAttendance({
        checkInTime: '22:00:00',
        checkOutTime: '06:00:00',
        workStartStr: '22:00',
        workEndStr: '06:00',
        shiftCode: 'NIGHT_SHIFT'
    });
    assert.strictEqual(res.work_credit, 1);
});

runCase('UNIT-MISA-05', 'Daily earned calculation rounds cleanly', () => {
    assert.strictEqual(calculateDailyEarnedAmount({ luong_cb: 13000000, congChuan: 26, workCredit: 0.5 }), 250000);
});

// 2. Timezone & Standard Workdays
runCase('UNIT-TIME-01', 'Standard workdays auto-subtracts Sundays (2026-11 = 30 - 5 = 25)', () => {
    assert.strictEqual(getMonthlyStandardWorkdays(11, 2026), 25);
    assert.strictEqual(isSundayIsoDate('2026-11-01'), true);
    assert.strictEqual(isSundayIsoDate('2026-11-02'), false);
    assert.strictEqual(normalizePureIsoDate('2026-11-05T00:00:00.000Z') !== null, true);
});

// 3. Payroll Calculator
runCase('UNIT-PAY-01', 'Payroll normal month with custom holiday multiplier & reconciliation', () => {
    const out = calculateEmployeeSalary({
        luong_cb: 12500000,
        status: 'active',
        has_insurance: false,
        cong_chuan: 25,
        companySettings: { ot_rate_weekday: 1.5, ot_rate_weekend: 2.0, ot_rate_holiday: 3.0, ot_calculation_mode: 'REQUIRE_APPROVAL', late_policy_type: 'NONE' },
        logs: [
            { record_date: '2026-11-02', record_date_iso: '2026-11-02', status: '1/OT', ot_hours: 2, work_credit: 1 },
            { record_date: '2026-11-03', record_date_iso: '2026-11-03', status: 'L', ot_hours: 0, work_credit: 1 }
        ],
        holidays: [{ holiday_name: 'Le Test', start_date: '2026-11-03', end_date: '2026-11-03', salary_multiplier: 1.5 }],
        otRegistrations: [{ work_date: '2026-11-02', expected_hours: 2, status: 'approved' }],
        month: 11,
        year: 2026
    });
    assert.strictEqual(out.standardWorkDays, 25);
    assert.strictEqual(out.congChinhThuc, 2);
    assert.strictEqual(out.totalOtHours, 2);
    assert.strictEqual(out.otAmount, 187500);
    const sumDaily = out.daily_breakdown.reduce((s, d) => s + Number(d.daily_earned_amount || 0), 0);
    assert.strictEqual(Math.round(sumDaily), Math.round(out.grossSalary));
});

// 4. Calendar Date Validation & Media Security
runCase('UNIT-VAL-01', 'validationMiddleware rejects impossible calendar date 2026-02-31', () => {
    const r = validateAttendanceInput({ ma_nv: 'NV001', date: '2026-02-31', status: '1' });
    assert.strictEqual(r.valid, false);
});

runCase('UNIT-MEDIA-01', 'Blocks MZ executable spoofed as PNG & SVG XSS', () => {
    const fakeExe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00this is an exe', 'utf8');
    const danger = detectExecutableOrScriptDanger(fakeExe, '.png');
    assert(typeof danger === 'string' && danger.length > 0);

    const svgXss = Buffer.from('<svg onload="alert(1)"></svg>', 'utf8');
    const dangerSvg = detectExecutableOrScriptDanger(svgXss, '.png');
    assert(typeof dangerSvg === 'string' && dangerSvg.length > 0);

    assert.throws(() => inspectUploadedBuffer(fakeExe, { originalFilename: 'bad.png', allowedMimes: ['image/png', 'image/jpeg'], maxBytes: 100000 }));
});

runCase('UNIT-MEDIA-02', 'Blocks client folder/public_id overrides and computes safe path', () => {
    const forbidden = detectForbiddenUploadParams({ folder: 'evil', public_id: '../root', category: 'employee_avatar' });
    assert(forbidden.length >= 2);
    const policy = resolveCategoryPolicy('employee_document');
    const folder = resolveTargetAssetFolder(policy, { employeeId: 'NV001', referenceDate: '2026-11-25' });
    assert(folder.includes('sedinco-hr/employees/documents'));
});

runCase('UNIT-QR-01', 'QR HMAC token generation & tamper rejection', () => {
    const issued = generateAttendanceQrToken({ branchId: 'BR_1', branchName: 'HQ', ttlSeconds: 60 });
    const ok = verifyAttendanceQrToken(issued.qr_token);
    assert.strictEqual(ok.valid, true);
    const tampered = issued.qr_token.slice(0, -4) + 'AAAA';
    assert.throws(() => verifyAttendanceQrToken(tampered), /Chữ ký mã QR|INVALID_QR/);
});

runCase('UNIT-BANK-01', 'Rejects QR base64 persistence inside bank card payload & parses valid data URL', () => {
    assert.throws(() => sanitizeBankCardInput({ bank_code: 'VCB', bank_account_number: '123456', qr_image: 'data:image/png;base64,AAA' }));
    const dataUrl = 'data:image/png;base64,' + TINY_PNG.toString('base64');
    const parsed = parseBase64ImageDataUrl(dataUrl);
    assert.strictEqual(parsed.declaredMime, 'image/png');
    assert.strictEqual(Buffer.isBuffer(parsed.buffer), true);
});

console.table(results);
const failed = results.filter(r => r.status === 'FAIL');
if (failed.length > 0) {
    console.error('UNIT FAILURES:', failed);
    process.exit(1);
}
process.exit(0);
