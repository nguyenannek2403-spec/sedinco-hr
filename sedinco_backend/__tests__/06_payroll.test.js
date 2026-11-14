/**
 * Suite 06 — Payroll Calculation Engine (P/L Paid Leave, Probation, OT, Late Policy, Dispute, CSV Formula Safety)
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateEmployeeSalary } = require('../src/utils/payrollCalculator');
const {
    startTestServer,
    apiRequest,
    createQaEmployee,
    cleanupQaData,
    snapshotSettings,
    restoreSettings,
    query
} = require('./_helpers');

let srv;
let baseUrl;
let snap;
let workerToken;
let accToken;
let adminToken;

test.before(async () => {
    srv = await startTestServer();
    baseUrl = srv.baseUrl;
    snap = await snapshotSettings();
    await cleanupQaData('QA_', 2099);

    await createQaEmployee({
        ma_nv: 'QA_PAY_W1',
        ho_ten: '=CMD|"QA_PAY_W1"', // Formula injection probe in employee name!
        role: 'worker',
        luong_cb: 13000000, // 500,000/day on 26 std work days
        has_insurance: 1,
        ngay_chinh_thuc: '2024-01-01'
    });
    await createQaEmployee({ ma_nv: 'QA_PAY_ACC', ho_ten: 'QA Kế Toán Lương', role: 'accountant' });
    await createQaEmployee({ ma_nv: 'QA_PAY_ADM', ho_ten: 'QA Giám Đốc Lương', role: 'admin' });

    const rW = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_PAY_W1', password: 'QaPass@2026!' } });
    workerToken = rW.json?.data?.token;
    const rAcc = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_PAY_ACC', password: 'QaPass@2026!' } });
    accToken = rAcc.json?.data?.token;
    const rAdm = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_PAY_ADM', password: 'QaPass@2026!' } });
    adminToken = rAdm.json?.data?.token;

    await query("UPDATE company_settings SET standard_work_days = 26, insurance_rate = 10.5, probation_salary_percent = 85, ot_rate_weekday = 1.5, ot_rate_weekend = 2.0, ot_rate_holiday = 3.0");
});

test.after(async () => {
    await restoreSettings(snap);
    await cleanupQaData('QA_', 2099);
    if (srv) await srv.close();
});

test('PAY-01: Paid Annual Leave (P) & Public Holiday (L) credit 1.0 workday in payrollCalculator', () => {
    const res = calculateEmployeeSalary({
        luong_cb: 13000000,
        cong_chuan: 26,
        ngay_chinh_thuc: '2024-01-01',
        has_insurance: false,
        logs: [
            { record_date: '2099-05-02', status: '1', ot_hours: 0, late_minutes: 0, dow: 7 },
            { record_date: '2099-05-03', status: 'P', ot_hours: 0, late_minutes: 0, dow: 2 },
            { record_date: '2099-05-04', status: 'L', ot_hours: 0, late_minutes: 0, dow: 3 }
        ],
        holidays: [],
        companySettings: { standard_work_days: 26, insurance_rate: 10.5 }
    });
    assert.equal(res.actualWorkDays, 3, 'Expected 1 normal + 1 P + 1 L = 3 paid work days');
    assert.equal(res.salaryByWork, 1500000, 'Expected 3 * 500,000 = 1,500,000');
    assert.equal(res.netSalary, 1500000);
});

test('PAY-02: Probation 85% split, OT weekday/Sunday/Holiday multipliers & Zero-day 0 insurance boundary', () => {
    // 0 workdays -> 0 insurance, net >= 0
    const zeroRes = calculateEmployeeSalary({
        luong_cb: 10400000,
        cong_chuan: 26,
        ngay_chinh_thuc: '2024-01-01',
        has_insurance: true,
        logs: [],
        companySettings: { standard_work_days: 26, insurance_rate: 10.5 }
    });
    assert.equal(zeroRes.totalInsurance, 0);
    assert.equal(zeroRes.netSalary, 0);

    // Probation vs Official split + OT capped by approved ot_registrations
    const splitRes = calculateEmployeeSalary({
        luong_cb: 20800000, // 800,000/day -> 100,000/hour
        cong_chuan: 26,
        ngay_chinh_thuc: '2099-05-10',
        has_insurance: true,
        logs: [
            { record_date: '2099-05-05', status: '1', ot_hours: 0, late_minutes: 0, dow: 2 }, // probation (0.85)
            { record_date: '2099-05-12', status: '1/OT', ot_hours: 6, late_minutes: 0, dow: 3 }, // official + 6h OT capped to 2h approved * 1.5
            { record_date: '2099-05-15', status: 'OT', ot_hours: 4, late_minutes: 0, dow: 1 } // Sunday 4h * 2.0
        ],
        holidays: [],
        otRegistrations: [{ work_date: '2099-05-12', expected_hours: 2, status: 'approved' }],
        companySettings: { standard_work_days: 26, probation_salary_percent: 85, ot_rate_weekday: 1.5, ot_rate_weekend: 2.0, insurance_rate: 10.5 }
    });
    assert.equal(splitRes.congThuViec, 1);
    assert.equal(splitRes.congChinhThuc, 1);
    assert.equal(splitRes.salaryByWork, Math.round(800000 * 1.85));
    // OT = (100,000 * 2 * 1.5) + (100,000 * 4 * 2.0) = 300,000 + 800,000 = 1,100,000
    assert.equal(splitRes.otAmount, 1100000);
});

test('PAY-03: Late Policy DEDUCT_WORKDAY, Adjustments, Confirm/Dispute SoD & Export CSV Formula Sanitization', async () => {
    await query(
        `INSERT INTO attendance_logs (employee_id, record_date, status) VALUES
         ('QA_PAY_W1', '2099-09-02', '1'),
         ('QA_PAY_W1', '2099-09-03', 'P')`
    );

    await apiRequest(baseUrl, 'PUT', '/api/settings/accountant-permissions', {
        token: adminToken,
        body: { permissions: { payroll_view_all: true, payroll_calculate: true, payroll_export: true, payroll_approve: false } }
    });

    const adjRes = await apiRequest(baseUrl, 'POST', '/api/payroll/adjustments', {
        token: accToken,
        headers: { 'X-Idempotency-Key': `qa-adj-${Date.now()}` },
        body: { ma_nv: 'QA_PAY_W1', month: 9, year: 2099, bonus_amount: 500000, penalty_amount: 100000, advance_deduction: 200000, adjustment_note: 'QA Adjust' }
    });
    assert.equal(adjRes.status, 200);

    const slipRes = await apiRequest(baseUrl, 'GET', '/api/payroll/me?month=9&year=2099', { token: workerToken });
    assert.equal(slipRes.status, 200);
    assert.equal(Number(slipRes.json?.data?.actualWorkDays), 2);
    assert.equal(Number(slipRes.json?.data?.bonusAmount), 500000);

    // Worker disputes payslip
    const dispRes = await apiRequest(baseUrl, 'POST', '/api/payroll/confirm', {
        token: workerToken,
        headers: { 'X-Idempotency-Key': `qa-disp-${Date.now()}` },
        body: { month: 9, year: 2099, status: 'DISPUTED', dispute_reason: 'Kiểm tra ngày công phép P' }
    });
    assert.equal(dispRes.status, 200);

    // Accountant without payroll_approve CANNOT resolve dispute (SoD)
    const accResolve = await apiRequest(baseUrl, 'POST', '/api/payroll/resolve-dispute', {
        token: accToken,
        headers: { 'X-Idempotency-Key': `qa-res-acc-${Date.now()}` },
        body: { ma_nv: 'QA_PAY_W1', month: 9, year: 2099, admin_response: 'Kế toán tự xử lý', status: 'CONFIRMED' }
    });
    assert.equal(accResolve.status, 403);

    // Admin CAN resolve dispute
    const admResolve = await apiRequest(baseUrl, 'POST', '/api/payroll/resolve-dispute', {
        token: adminToken,
        headers: { 'X-Idempotency-Key': `qa-res-adm-${Date.now()}` },
        body: { ma_nv: 'QA_PAY_W1', month: 9, year: 2099, admin_response: 'Admin đã xác nhận đúng công phép P', status: 'CONFIRMED' }
    });
    assert.equal(admResolve.status, 200);

    // Export CSV formula injection protection (=CMD|... must be prefixed with ')
    const csvRes = await apiRequest(baseUrl, 'GET', '/api/payroll/export?month=9&year=2099', { token: accToken });
    assert.equal(csvRes.status, 200);
    assert.ok(!csvRes.raw.includes(',"=CMD|'), 'Exported CSV must sanitize leading = formula characters');
    assert.ok(csvRes.raw.includes("'=CMD|"), 'Exported CSV must escape dangerous formula prefix with single quote');
});

