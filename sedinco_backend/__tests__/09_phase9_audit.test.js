/**
 * Suite 09 — Phase 9 Independent Audit:
 *   1) Payroll Golden Matrix (18 scenarios incl. V14 dynamic switches & monthly backup snapshot)
 *   2) Device Binding, Persistent GPS Token Replay Guard, Staging vs Production Token Safety, TRUST_PROXY Hardening
 *   3) Login Security Matrix (Unicode/Special chars, SQLi, Account Enumeration, Admin & Distributed Rate Limits, JWT Revocation Check)
 *   4) Complete 132-Route RBAC & 1:1 16-Key Permission Matrix / SoD Verification
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { calculateEmployeeSalary } = require('../src/utils/payrollCalculator');
const authService = require('../src/services/authService');
const { ENFORCED_ACCOUNTANT_KEYS } = require('../src/services/permissionService');
const { verifyZaloLocationToken, verifyZaloUserToken, resetMockZaloTokens } = require('../src/utils/zaloAdapter');
const {
    app,
    startTestServer,
    apiRequest,
    signCustomJwt,
    createQaEmployee,
    snapshotSettings,
    restoreSettings,
    listExpressRoutes,
    query,
    closeTestRuntime
} = require('./_helpers');
const { invalidatePermissionCache } = require('../src/middlewares/authMiddleware');

const ROOT_DIR = path.resolve(__dirname, '../..');
const TEST_YEAR = 2097;

let srv;
let baseUrl;
let snap;

const W1 = 'P9_WKR_1';
const W2 = 'P9_WKR_2';
const LOCK_W = 'P9_LOCK_1';
const SPEC_W = 'P9_SPEC_1';
const ACC1 = 'P9_ACC_1';
const ADM1 = 'P9_ADM_1';
const PURE_ADM = 'P9_PURE_ADM';
const CREATED_IDS = new Set([W1, W2, LOCK_W, SPEC_W, ACC1, ADM1, 'P9_RBAC_TEMP', 'P9_ATT_EMP']);
const CREATED_ADMINS = new Set([PURE_ADM]);
const CREATED_REQ_IDS = new Set();
const CREATED_OT_IDS = new Set();

let w1Token;
let w2Token;
let accToken;
let admToken;

async function cleanupPhase9Data() {
    const empIds = [...CREATED_IDS];
    const empPh = empIds.map(() => '?').join(',');
    const admIds = [...CREATED_ADMINS];
    const allActors = [...empIds, ...admIds, 'P9_UNKNOWN_USER', "' OR '1'='1", 'admin\'--', '" UNION SELECT 1,2--', 'O\'Neil;--'];
    const actPh = allActors.map(() => '?').join(',');

    if (CREATED_REQ_IDS.size > 0) {
        const reqPh = [...CREATED_REQ_IDS].map(() => '?').join(',');
        await query(`DELETE FROM requests WHERE id IN (${reqPh})`, [...CREATED_REQ_IDS]);
    }
    if (CREATED_OT_IDS.size > 0) {
        const otPh = [...CREATED_OT_IDS].map(() => '?').join(',');
        await query(`DELETE FROM ot_registrations WHERE id IN (${otPh})`, [...CREATED_OT_IDS]);
    }
    await query('DELETE FROM attendance_logs WHERE YEAR(record_date) = ? OR employee_id LIKE ?', [TEST_YEAR, 'P9_%']);
    await query(`DELETE FROM attendance_logs WHERE employee_id IN (${empPh})`, empIds);
    await query('DELETE FROM attendance WHERE nam = ? OR ma_nv LIKE ?', [TEST_YEAR, 'P9_%']);
    await query('DELETE FROM requests WHERE YEAR(request_date) = ? OR employee_id LIKE ?', [TEST_YEAR, 'P9_%']);
    await query('DELETE FROM ot_registrations WHERE YEAR(work_date) = ? OR employee_id LIKE ?', [TEST_YEAR, 'P9_%']);
    await query('DELETE FROM period_locks WHERE year = ?', [TEST_YEAR]);
    await query('DELETE FROM payroll_periods WHERE year = ? OR year >= 2090', [TEST_YEAR]);
    await query('DELETE FROM public_holidays WHERE holiday_name LIKE ?', ['P9_%']);
    await query(`DELETE FROM idempotency_keys WHERE actor_id IN (${actPh}) OR actor_id LIKE ? OR key_hash LIKE 'LOC_TOKEN_%'`, [...allActors, 'P9_%']);
    await query(`DELETE FROM login_rate_limits WHERE identifier IN (${actPh}) OR identifier LIKE ? OR key_name LIKE ?`, [...allActors, 'P9_%', '%P9_%']);
    await query(`DELETE FROM audit_logs WHERE actor_id IN (${actPh}) OR actor_id LIKE ? OR details LIKE ?`, [...allActors, 'P9_%', '%P9_%']);
    await query('DELETE FROM employees WHERE ma_nv LIKE ?', ['P9_%']);
    await query('DELETE FROM admins WHERE username LIKE ?', ['P9_%']);
    invalidatePermissionCache();
}

async function setAllAccountantPerms(enabledBool) {
    const val = enabledBool ? 1 : 0;
    await query('UPDATE accountant_permissions SET is_enabled = ?', [val]);
    invalidatePermissionCache();
}

test.before(async () => {
    srv = await startTestServer();
    baseUrl = srv.baseUrl;
    snap = await snapshotSettings();
    await cleanupPhase9Data();
    resetMockZaloTokens();

    await createQaEmployee({ ma_nv: W1, ho_ten: 'Phase9 Công Nhân 1', role: 'worker', luong_cb: 13000000, has_insurance: 1, ngay_chinh_thuc: '2024-01-01' });
    await createQaEmployee({ ma_nv: W2, ho_ten: 'Phase9 Công Nhân 2', role: 'worker', luong_cb: 10400000, has_insurance: 1, ngay_chinh_thuc: '2024-01-01' });
    await createQaEmployee({ ma_nv: LOCK_W, ho_ten: 'Phase9 Bị Khóa', role: 'worker', status: 'inactive', is_locked: 1 });
    await createQaEmployee({ ma_nv: ACC1, ho_ten: 'Phase9 Kế Toán', role: 'accountant', luong_cb: 15600000, has_insurance: 1 });
    await createQaEmployee({ ma_nv: ADM1, ho_ten: 'Phase9 Admin', role: 'admin', luong_cb: 26000000, has_insurance: 1 });

    // Create pure admin account in admins table for admin login security matrix
    await query('UPDATE company_settings SET latitude = 16.0544, longitude = 108.2022, radius_meters = 200, standard_work_days = 26, insurance_rate = 10.5, probation_salary_percent = 85, ot_rate_weekday = 1.5, ot_rate_weekend = 2.0, ot_rate_holiday = 3.0');

    w1Token = (await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: W1, password: 'QaPass@2026!' } })).json?.data?.token;
    w2Token = (await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: W2, password: 'QaPass@2026!' } })).json?.data?.token;
    accToken = (await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: ACC1, password: 'QaPass@2026!' } })).json?.data?.token;
    admToken = (await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: ADM1, password: 'QaPass@2026!' } })).json?.data?.token;

    const regAdm = await apiRequest(baseUrl, 'POST', '/api/admin/register', {
        token: admToken,
        body: { username: PURE_ADM, password: 'QaAdmin@2026!', ho_ten: 'Phase9 Pure Admin' }
    });
    assert.ok([200, 201].includes(regAdm.status), `Seed pure admin failed: ${regAdm.raw}`);
});

test.after(async () => {
    try {
        await restoreSettings(snap);
        await cleanupPhase9Data();
    } finally {
        if (srv) await srv.close();
        await closeTestRuntime();
    }
});

// =========================================================================
// GROUP 1: PAYROLL GOLDEN MATRIX (ALL 17 SCENARIOS)
// =========================================================================
test('P9-PAY-GOLDEN: 17 Payroll Business Logic Scenarios & Audit Verification', async () => {
    const stdSettings = {
        standard_work_days: 26,
        probation_salary_percent: 85,
        ot_rate_weekday: 1.5,
        ot_rate_weekend: 2.0,
        ot_rate_holiday: 3.0,
        custom_ot_hourly_rate: 0,
        insurance_rate: 10.5,
        late_policy_type: 'PER_MINUTE',
        free_late_occurrences: 1,
        late_penalty_per_minute: 2000,
        late_penalty_amount: 50000,
        max_late_minutes_for_half_day: 60
    };

    // Case 1: Normal workday + allowances + BHXH 10.5%
    const c1 = calculateEmployeeSalary({
        luong_cb: 13000000, // 500k/day
        cong_chuan: 26,
        ngay_chinh_thuc: '2024-01-01',
        has_insurance: true,
        allowances: { an_trua: 780000, xang_xe: 520000 }, // 1,300,000 -> 100,000 for 2/26 days
        logs: [
            { record_date: `${TEST_YEAR}-03-01`, status: '1', ot_hours: 0, late_minutes: 0, dow: 6 },
            { record_date: `${TEST_YEAR}-03-02`, status: '1', ot_hours: 0, late_minutes: 0, dow: 7 }
        ],
        companySettings: stdSettings
    });
    assert.equal(c1.actualWorkDays, 2);
    assert.equal(c1.salaryByWork, 1000000);
    assert.equal(c1.totalAllowance, 100000);
    assert.equal(c1.totalInsurance, 1365000);
    assert.equal(c1.netSalary, 0, 'With 1.1M gross and 1.365M BHXH, net clamps to 0');

    // Case 2: Probation 85% + dynamic probation_allowance_full switch (full vs scaled allowance & OT rate)
    const c2 = calculateEmployeeSalary({
        luong_cb: 26000000, // 1,000,000/day, 125,000/hr
        cong_chuan: 26,
        ngay_chinh_thuc: `${TEST_YEAR}-03-10`,
        has_insurance: false,
        allowances: { an_trua: 2600000 }, // 100k/day at 100%, 85k/day at 85%
        logs: [
            { record_date: `${TEST_YEAR}-03-05`, status: '1/OT', ot_hours: 2, late_minutes: 0, dow: 3 },
            { record_date: `${TEST_YEAR}-03-10`, status: '1', ot_hours: 0, late_minutes: 0, dow: 1 }
        ],
        companySettings: { ...stdSettings, probation_allowance_full: 1 }
    });
    assert.equal(c2.congThuViec, 1);
    assert.equal(c2.congChinhThuc, 1);
    assert.equal(c2.salaryByWork, 1850000);
    assert.equal(c2.totalAllowance, 200000, 'probation_allowance_full=1 pays full allowance on probation day');
    assert.equal(c2.otAmount, 375000, 'probation_allowance_full=1 uses 100% hourly rate for probation OT');

    const c2Scaled = calculateEmployeeSalary({
        luong_cb: 26000000,
        cong_chuan: 26,
        ngay_chinh_thuc: `${TEST_YEAR}-03-10`,
        has_insurance: false,
        allowances: { an_trua: 2600000 },
        logs: [
            { record_date: `${TEST_YEAR}-03-05`, status: '1/OT', ot_hours: 2, late_minutes: 0, dow: 3 },
            { record_date: `${TEST_YEAR}-03-10`, status: '1', ot_hours: 0, late_minutes: 0, dow: 1 }
        ],
        companySettings: { ...stdSettings, probation_allowance_full: 0 }
    });
    assert.equal(c2Scaled.totalAllowance, 185000, 'probation_allowance_full=0 scales probation allowance by 85%');
    assert.equal(c2Scaled.otAmount, 318750, 'probation_allowance_full=0 scales probation OT hourly rate by 85%');

    // Case 3: Half workday (0.5), Paid Leave (P), Holiday (L), KP/V (unpaid 0)
    const c3 = calculateEmployeeSalary({
        luong_cb: 13000000,
        cong_chuan: 26,
        ngay_chinh_thuc: '2024-01-01',
        has_insurance: false,
        logs: [
            { record_date: `${TEST_YEAR}-03-03`, status: '0.5', ot_hours: 0, late_minutes: 0, dow: 2 },
            { record_date: `${TEST_YEAR}-03-04`, status: 'P', ot_hours: 0, late_minutes: 0, dow: 3 },
            { record_date: `${TEST_YEAR}-03-05`, status: 'L', ot_hours: 0, late_minutes: 0, dow: 4 },
            { record_date: `${TEST_YEAR}-03-06`, status: 'KP', ot_hours: 0, late_minutes: 0, dow: 5 },
            { record_date: `${TEST_YEAR}-03-07`, status: 'V', ot_hours: 0, late_minutes: 0, dow: 6 }
        ],
        companySettings: stdSettings
    });
    assert.equal(c3.actualWorkDays, 2.5);
    assert.equal(c3.salaryByWork, 1250000);

    // Cases 4, 5, 6: Weekday OT (1.5x), Sunday OT (2.0x), Holiday OT (3.0x)
    // 20,800,000 / 26 / 8 = 100,000 / hour
    const c456 = calculateEmployeeSalary({
        luong_cb: 20800000,
        cong_chuan: 26,
        ngay_chinh_thuc: '2024-01-01',
        has_insurance: false,
        holidays: [{ start_date: `${TEST_YEAR}-03-20`, end_date: `${TEST_YEAR}-03-20` }],
        logs: [
            { record_date: `${TEST_YEAR}-03-11`, status: '1/OT', ot_hours: 2, late_minutes: 0, dow: 2 }, // 800k + 2*100k*1.5 = 1.1M
            { record_date: `${TEST_YEAR}-03-17`, status: 'OT', ot_hours: 3, late_minutes: 0, dow: 1 },   // Sun: 3*100k*2.0 = 600k
            { record_date: `${TEST_YEAR}-03-20`, status: 'OT', ot_hours: 4, late_minutes: 0, dow: 4 }    // Holiday: 4*100k*3.0 = 1.2M
        ],
        otRegistrations: [
            { work_date: `${TEST_YEAR}-03-11`, expected_hours: 2, status: 'approved' },
            { work_date: `${TEST_YEAR}-03-17`, expected_hours: 3, status: 'approved' },
            { work_date: `${TEST_YEAR}-03-20`, expected_hours: 4, status: 'approved' }
        ],
        companySettings: stdSettings
    });
    assert.equal(c456.salaryByWork, 800000);
    assert.equal(c456.otAmount, 300000 + 600000 + 1200000);

    // Case 7: Dynamic ot_calculation_mode (APPROVED_OR_AUTO | REQUIRE_APPROVAL | AUTO_ACTUAL)
    const c7AutoFallback = calculateEmployeeSalary({
        luong_cb: 20800000,
        cong_chuan: 26,
        ngay_chinh_thuc: '2024-01-01',
        has_insurance: false,
        logs: [{ record_date: `${TEST_YEAR}-03-12`, status: '1/OT', ot_hours: 3, late_minutes: 0, dow: 3 }],
        otRegistrations: [],
        companySettings: { ...stdSettings, ot_calculation_mode: 'APPROVED_OR_AUTO' }
    });
    assert.equal(c7AutoFallback.otAmount, 450000, 'APPROVED_OR_AUTO computes OT when no otRegistrations exist');

    const c7StrictNoReg = calculateEmployeeSalary({
        luong_cb: 20800000,
        cong_chuan: 26,
        ngay_chinh_thuc: '2024-01-01',
        has_insurance: false,
        logs: [{ record_date: `${TEST_YEAR}-03-12`, status: '1/OT', ot_hours: 3, late_minutes: 0, dow: 3 }],
        otRegistrations: [],
        companySettings: { ...stdSettings, ot_calculation_mode: 'REQUIRE_APPROVAL' }
    });
    assert.equal(c7StrictNoReg.otAmount, 0, 'REQUIRE_APPROVAL yields 0 OT pay without approved OT registration');

    const c7StrictWithReg = calculateEmployeeSalary({
        luong_cb: 20800000,
        cong_chuan: 26,
        ngay_chinh_thuc: '2024-01-01',
        has_insurance: false,
        logs: [{ record_date: `${TEST_YEAR}-03-12`, status: '1/OT', ot_hours: 3, late_minutes: 0, dow: 3 }],
        otRegistrations: [{ work_date: `${TEST_YEAR}-03-12`, expected_hours: 2, status: 'approved' }],
        companySettings: { ...stdSettings, ot_calculation_mode: 'REQUIRE_APPROVAL' }
    });
    assert.equal(c7StrictWithReg.otAmount, 300000, 'REQUIRE_APPROVAL caps OT hours to approved expected_hours (2h)');

    const c7AutoActual = calculateEmployeeSalary({
        luong_cb: 20800000,
        cong_chuan: 26,
        ngay_chinh_thuc: '2024-01-01',
        has_insurance: false,
        logs: [{ record_date: `${TEST_YEAR}-03-12`, status: '1/OT', ot_hours: 3, late_minutes: 0, dow: 3 }],
        otRegistrations: [{ work_date: `${TEST_YEAR}-03-12`, expected_hours: 2, status: 'approved' }],
        companySettings: { ...stdSettings, ot_calculation_mode: 'AUTO_ACTUAL' }
    });
    assert.equal(c7AutoActual.otAmount, 450000, 'AUTO_ACTUAL pays actual worked OT hours without capping');

    // Cases 8, 9, 10: Late policies (PER_MINUTE, PER_OCCURRENCE, DEDUCT_WORKDAY + free_late_exempts_halfday)
    const lateLogs = [
        { record_date: `${TEST_YEAR}-03-02`, status: '1', ot_hours: 0, late_minutes: 10, dow: 2 }, // free #1 (skipped)
        { record_date: `${TEST_YEAR}-03-03`, status: '1', ot_hours: 0, late_minutes: 25, dow: 3 }  // charged #2
    ];
    const c8PerMin = calculateEmployeeSalary({
        luong_cb: 13000000, cong_chuan: 26, ngay_chinh_thuc: '2024-01-01', has_insurance: false,
        logs: lateLogs,
        companySettings: { ...stdSettings, late_policy_type: 'PER_MINUTE', free_late_occurrences: 1, late_penalty_per_minute: 2000 }
    });
    assert.equal(c8PerMin.latePenaltyAmount, 25 * 2000);

    const c9PerOcc = calculateEmployeeSalary({
        luong_cb: 13000000, cong_chuan: 26, ngay_chinh_thuc: '2024-01-01', has_insurance: false,
        logs: lateLogs,
        companySettings: { ...stdSettings, late_policy_type: 'PER_OCCURRENCE', free_late_occurrences: 1, late_penalty_amount: 50000 }
    });
    assert.equal(c9PerOcc.latePenaltyAmount, 50000);

    const c10DeductStrict = calculateEmployeeSalary({
        luong_cb: 13000000, cong_chuan: 26, ngay_chinh_thuc: '2024-01-01', has_insurance: false,
        logs: [{ record_date: `${TEST_YEAR}-03-04`, status: '1', ot_hours: 0, late_minutes: 75, dow: 4 }],
        companySettings: { ...stdSettings, late_policy_type: 'DEDUCT_WORKDAY', free_late_occurrences: 1, max_late_minutes_for_half_day: 60, free_late_exempts_halfday: 0 }
    });
    assert.equal(c10DeductStrict.actualWorkDays, 0.5, 'free_late_exempts_halfday=0 deducts severe late (>60m) to 0.5 even within free quota');

    const c10DeductFree = calculateEmployeeSalary({
        luong_cb: 13000000, cong_chuan: 26, ngay_chinh_thuc: '2024-01-01', has_insurance: false,
        logs: [{ record_date: `${TEST_YEAR}-03-04`, status: '1', ot_hours: 0, late_minutes: 75, dow: 4 }],
        companySettings: { ...stdSettings, late_policy_type: 'DEDUCT_WORKDAY', free_late_occurrences: 1, max_late_minutes_for_half_day: 60, free_late_exempts_halfday: 1 }
    });
    assert.equal(c10DeductFree.actualWorkDays, 1, 'free_late_exempts_halfday=1 exempts severe late within free_late_occurrences=1');

    const c10DeductCharged = calculateEmployeeSalary({
        luong_cb: 13000000, cong_chuan: 26, ngay_chinh_thuc: '2024-01-01', has_insurance: false,
        logs: [{ record_date: `${TEST_YEAR}-03-04`, status: '1', ot_hours: 0, late_minutes: 75, dow: 4 }],
        companySettings: { ...stdSettings, late_policy_type: 'DEDUCT_WORKDAY', free_late_occurrences: 0, max_late_minutes_for_half_day: 60 }
    });
    assert.equal(c10DeductCharged.actualWorkDays, 0.5);
    assert.equal(c10DeductCharged.latePenaltyAmount, 0);

    // Cases 11 & 12: Salary advance request approval -> reflected in /api/payroll/me + Manual adjustments
    await setAllAccountantPerms(true);
    await query("INSERT INTO attendance_logs (employee_id, record_date, status) VALUES (?, ?, '1'), (?, ?, '1'), (?, ?, '1')", [W1, `${TEST_YEAR}-04-02`, W1, `${TEST_YEAR}-04-03`, W1, `${TEST_YEAR}-04-04`]);
    const advCreate = await apiRequest(baseUrl, 'POST', '/api/requests', {
        token: w1Token,
        headers: { 'X-Idempotency-Key': `p9-adv-${Date.now()}` },
        body: { request_type: 'SALARY_ADVANCE', from_date: `${TEST_YEAR}-04-05`, to_date: `${TEST_YEAR}-04-05`, advance_amount: 400000, reason: 'P9 Advance Test' }
    });
    assert.equal(advCreate.status, 201);
    const [advRow] = await query('SELECT id FROM requests WHERE employee_id = ? AND request_date = ? ORDER BY id DESC LIMIT 1', [W1, `${TEST_YEAR}-04-05`]);
    CREATED_REQ_IDS.add(advRow.id);
    const advApprove = await apiRequest(baseUrl, 'PUT', `/api/requests/${advRow.id}`, {
        token: admToken,
        headers: { 'X-Idempotency-Key': `p9-adv-app-${Date.now()}` },
        body: { status: 'approved' }
    });
    assert.equal(advApprove.status, 200);

    const adjRes = await apiRequest(baseUrl, 'POST', '/api/payroll/adjustments', {
        token: accToken,
        headers: { 'X-Idempotency-Key': `p9-adj-${Date.now()}` },
        body: { ma_nv: W1, month: 4, year: TEST_YEAR, bonus_amount: 600000, penalty_amount: 50000, adjustment_note: 'P9 Bonus' }
    });
    assert.equal(adjRes.status, 200);

    // Case 17 (also verifying sargable /api/payroll/me vs /api/payroll parity after P1 fix!)
    const slipMe = await apiRequest(baseUrl, 'GET', `/api/payroll/me?month=4&year=${TEST_YEAR}`, { token: w1Token });
    assert.equal(slipMe.status, 200);
    assert.equal(Number(slipMe.json?.data?.actualWorkDays), 3);
    assert.equal(Number(slipMe.json?.data?.advanceDeduction), 400000);
    assert.equal(Number(slipMe.json?.data?.bonusAmount), 600000);
    assert.equal(Number(slipMe.json?.data?.penaltyAmount), 50000);

    let w1Grid = null;
    for (let page = 1; page <= 10 && !w1Grid; page += 1) {
        const gridPage = await apiRequest(baseUrl, 'GET', `/api/payroll?month=4&year=${TEST_YEAR}&limit=200&page=${page}`, { token: accToken });
        const list = gridPage.json?.data || [];
        w1Grid = list.find((x) => x.ma_nv === W1) || null;
        if (list.length < 200) break;
    }
    assert.ok(w1Grid, 'P9_WKR_1 should appear in paginated GET /api/payroll results');
    assert.equal(Number(w1Grid.netSalary), Number(slipMe.json?.data?.netSalary), 'getMyPayroll sargable query MUST match calculateMonthlyPayroll');

    // Case 13 & 14: Dynamic negative_salary_policy (CLAMP_ZERO + carryOverDebt vs SHOW_NEGATIVE) & 0 workdays = 0 insurance
    const c13Clamp = calculateEmployeeSalary({
        luong_cb: 13000000, cong_chuan: 26, ngay_chinh_thuc: '2024-01-01', has_insurance: false,
        logs: [{ record_date: `${TEST_YEAR}-04-02`, status: '1', ot_hours: 0, late_minutes: 0, dow: 2 }], // 500k
        penaltyAmount: 900000,
        companySettings: { ...stdSettings, negative_salary_policy: 'CLAMP_ZERO' }
    });
    assert.equal(c13Clamp.netSalary, 0, 'CLAMP_ZERO clamps negative net salary to 0');
    assert.equal(c13Clamp.carry_over_debt, 400000, 'CLAMP_ZERO exposes carry_over_debt=400000');

    const c13Negative = calculateEmployeeSalary({
        luong_cb: 13000000, cong_chuan: 26, ngay_chinh_thuc: '2024-01-01', has_insurance: false,
        logs: [{ record_date: `${TEST_YEAR}-04-02`, status: '1', ot_hours: 0, late_minutes: 0, dow: 2 }],
        penaltyAmount: 900000,
        companySettings: { ...stdSettings, negative_salary_policy: 'SHOW_NEGATIVE' }
    });
    assert.equal(c13Negative.netSalary, -400000, 'SHOW_NEGATIVE displays negative netSalary directly');
    assert.equal(c13Negative.carry_over_debt, 0, 'SHOW_NEGATIVE does not split carry_over_debt separately');

    const c14Zero = calculateEmployeeSalary({
        luong_cb: 13000000, cong_chuan: 26, ngay_chinh_thuc: '2024-01-01', has_insurance: true,
        logs: [],
        companySettings: stdSettings
    });
    assert.equal(c14Zero.totalInsurance, 0);

    // Case 15: Worker Confirm / Dispute + P1 SoD Fix: Accountant CANNOT self-resolve own dispute!
    const accDisp = await apiRequest(baseUrl, 'POST', '/api/payroll/confirm', {
        token: accToken,
        headers: { 'X-Idempotency-Key': `p9-acc-disp-${Date.now()}` },
        body: { month: 4, year: TEST_YEAR, status: 'DISPUTED', dispute_reason: 'P9 Self dispute probe' }
    });
    assert.equal(accDisp.status, 200);
    const accSelfResolve = await apiRequest(baseUrl, 'POST', '/api/payroll/resolve-dispute', {
        token: accToken,
        headers: { 'X-Idempotency-Key': `p9-acc-self-res-${Date.now()}` },
        body: { ma_nv: ACC1, month: 4, year: TEST_YEAR, new_status: 'CONFIRMED', admin_response: 'Self approve attempt' }
    });
    assert.equal(accSelfResolve.status, 403, 'Accountant with payroll_approve MUST NOT self-resolve own salary dispute (P1 SoD fix)');

    // Case 16: Persistent payroll_periods workflow (DRAFT -> APPROVED -> REJECTED -> APPROVED -> PAID)
    const payBeforeApprove = await apiRequest(baseUrl, 'PUT', '/api/payroll/payment-status', {
        token: admToken,
        body: { month: 4, year: TEST_YEAR, status: 'PAID' }
    });
    assert.equal(payBeforeApprove.status, 400, 'Paying payroll before APPROVED status must return 400');

    const app1 = await apiRequest(baseUrl, 'POST', '/api/payroll/approve', { token: admToken, body: { month: 4, year: TEST_YEAR } });
    assert.equal(app1.status, 200, `First approvePayroll must return 200, got ${app1.status}: ${app1.raw}`);
    const app2 = await apiRequest(baseUrl, 'POST', '/api/payroll/approve', { token: admToken, body: { month: 4, year: TEST_YEAR } });
    assert.equal(app2.status, 200, 'Repeat approvePayroll on APPROVED period should be idempotent');

    const stList = await apiRequest(baseUrl, 'GET', `/api/payroll/status-list?month=4&year=${TEST_YEAR}`, { token: admToken });
    assert.equal(stList.status, 200);
    assert.ok(Array.isArray(stList.json?.data), 'GET /api/payroll/status-list must return an array');
    const approvedPeriod = stList.json.data.find((p) => Number(p.month) === 4 && Number(p.year) === TEST_YEAR);
    assert.ok(approvedPeriod, 'Persisted payroll_periods row must appear in status-list');
    assert.equal(approvedPeriod.status, 'APPROVED');
    assert.equal(approvedPeriod.payment_status, 'UNPAID');

    const rejRes = await apiRequest(baseUrl, 'POST', '/api/payroll/reject', {
        token: admToken,
        body: { month: 4, year: TEST_YEAR, reason: 'Sai phụ cấp ca đêm' }
    });
    assert.equal(rejRes.status, 200, `rejectPayroll must return 200, got ${rejRes.status}: ${rejRes.raw}`);
    const stListRej = await apiRequest(baseUrl, 'GET', `/api/payroll/status-list?month=4&year=${TEST_YEAR}`, { token: admToken });
    const rejectedPeriod = (stListRej.json?.data || []).find((p) => Number(p.month) === 4 && Number(p.year) === TEST_YEAR);
    assert.equal(rejectedPeriod?.status, 'REJECTED');
    assert.equal(rejectedPeriod?.rejected_reason, 'Sai phụ cấp ca đêm');

    const reApp = await apiRequest(baseUrl, 'POST', '/api/payroll/approve', { token: admToken, body: { month: 4, year: TEST_YEAR } });
    assert.equal(reApp.status, 200, 'Re-approving a REJECTED payroll period must succeed');

    const paidRes = await apiRequest(baseUrl, 'POST', '/api/payroll/payment-status', {
        token: admToken,
        body: { month: 4, year: TEST_YEAR, status: 'PAID' }
    });
    assert.equal(paidRes.status, 200, `Marking APPROVED period PAID must return 200, got ${paidRes.status}: ${paidRes.raw}`);
    const stListPaid = await apiRequest(baseUrl, 'GET', `/api/payroll/status-list?month=4&year=${TEST_YEAR}`, { token: admToken });
    const paidPeriod = (stListPaid.json?.data || []).find((p) => Number(p.month) === 4 && Number(p.year) === TEST_YEAR);
    assert.equal(paidPeriod?.payment_status, 'PAID');
    assert.equal(paidPeriod?.status, 'APPROVED');

    const rejPaid = await apiRequest(baseUrl, 'POST', '/api/payroll/reject', {
        token: admToken,
        body: { month: 4, year: TEST_YEAR, reason: 'Late edit attempt' }
    });
    assert.equal(rejPaid.status, 400, 'Rejecting an already PAID payroll period must return 400');

    // Case 18: V14 Dynamic Settings E2E + Monthly JSON Backup Snapshot (GET /api/payroll/backup-snapshot)
    const dynPut = await apiRequest(baseUrl, 'PUT', '/api/company', {
        token: admToken,
        body: {
            probation_allowance_full: 0,
            ot_calculation_mode: 'REQUIRE_APPROVAL',
            free_late_exempts_halfday: 0,
            negative_salary_policy: 'SHOW_NEGATIVE'
        }
    });
    assert.equal(dynPut.status, 200);
    assert.equal(Number(dynPut.json?.data?.probation_allowance_full), 0);
    assert.equal(dynPut.json?.data?.ot_calculation_mode, 'REQUIRE_APPROVAL');
    assert.equal(Number(dynPut.json?.data?.free_late_exempts_halfday), 0);
    assert.equal(dynPut.json?.data?.negative_salary_policy, 'SHOW_NEGATIVE');

    const penGet = await apiRequest(baseUrl, 'GET', '/api/settings/penalties', { token: admToken });
    assert.equal(penGet.status, 200);
    assert.equal(penGet.json?.data?.ot_calculation_mode, 'REQUIRE_APPROVAL');
    assert.equal(penGet.json?.data?.negative_salary_policy, 'SHOW_NEGATIVE');

    const snapAdm = await apiRequest(baseUrl, 'GET', `/api/payroll/backup-snapshot?month=4&year=${TEST_YEAR}`, { token: admToken });
    assert.equal(snapAdm.status, 200, `Admin backup-snapshot failed: ${snapAdm.raw}`);
    assert.equal(snapAdm.json?.data?.meta?.month, 4);
    assert.equal(snapAdm.json?.data?.meta?.year, TEST_YEAR);
    assert.ok(Array.isArray(snapAdm.json?.data?.payroll_rows), 'Snapshot must include payroll_rows array');
    assert.ok(Array.isArray(snapAdm.json?.data?.attendance_logs), 'Snapshot must include attendance_logs array');
    assert.ok(Array.isArray(snapAdm.json?.data?.requests), 'Snapshot must include requests array');
    assert.equal(snapAdm.json?.data?.company_settings?.negative_salary_policy, 'SHOW_NEGATIVE');
    assert.equal((await apiRequest(baseUrl, 'GET', `/api/payroll/backup-snapshot?month=4&year=${TEST_YEAR}`, { token: w1Token })).status, 403);
    // Restore default negative_salary_policy before later groups
    await apiRequest(baseUrl, 'PUT', '/api/company', {
        token: admToken,
        body: { probation_allowance_full: 1, ot_calculation_mode: 'APPROVED_OR_AUTO', free_late_exempts_halfday: 0, negative_salary_policy: 'CLAMP_ZERO' }
    });
});

// =========================================================================
// GROUP 2: DEVICE BINDING, GPS TOKEN REPLAY, STAGING VS PROD, TRUST_PROXY
// =========================================================================
test('P9-SEC-DEV-01: Enforced device binding blocks omitted device_info/device_id (P1 Fix), strict/warning unimplemented, staging mock & TRUST_PROXY checks', async () => {
    await setAllAccountantPerms(true);
    const badMode = await apiRequest(baseUrl, 'PUT', `/api/employees/${W2}/device-binding-mode`, {
        token: admToken,
        body: { mode: 'strict' }
    });
    assert.equal(badMode.status, 400, "'strict' mode alias is not supported; backend accepts only 'recording' and 'enforced'");

    const warnMode = await apiRequest(baseUrl, 'PUT', `/api/employees/${W2}/device-binding-mode`, {
        token: admToken,
        body: { mode: 'warning' }
    });
    assert.equal(warnMode.status, 400, "'warning' mode is NOT_IMPLEMENTED on backend");

    // Recording mode binds first device and flags mismatch without blocking
    const recIn1 = await apiRequest(baseUrl, 'POST', '/api/attendance/check-in', {
        token: w2Token,
        headers: { 'X-Idempotency-Key': `p9-rec-1-${Date.now()}` },
        body: { lat: 16.0544, lng: 108.2022, device_info: 'P9_DEV_PRIMARY' }
    });
    assert.equal(recIn1.status, 200);
    // Reset today's log to isolate device-binding behavior from 60s double-tap cooldown
    await query('DELETE FROM attendance_logs WHERE employee_id = ?', [W2]);

    const recMismatch = await apiRequest(baseUrl, 'POST', '/api/attendance/check-in', {
        token: w2Token,
        headers: { 'X-Idempotency-Key': `p9-rec-2-${Date.now()}` },
        body: { lat: 16.0544, lng: 108.2022, device_info: 'P9_DEV_OTHER' }
    });
    assert.equal(recMismatch.status, 200, 'Recording mode allows check-in with mismatch and flags is_suspicious');
    await query('DELETE FROM attendance_logs WHERE employee_id = ?', [W2]);

    // Switch W2 to enforced mode + bind zalo
    await apiRequest(baseUrl, 'PUT', `/api/employees/${W2}/device-binding-mode`, {
        token: admToken,
        body: { mode: 'enforced' }
    });
    await apiRequest(baseUrl, 'POST', '/api/employees/bind-zalo', {
        token: w2Token,
        body: { zalo_token: 'mock_zalo_user_p9_w2_enforced' }
    });

    // P1 Fix Verification 1: Omitting device_info in enforced check-in MUST return 403 (previously bypassed!)
    const omitDevCheckin = await apiRequest(baseUrl, 'POST', '/api/attendance/check-in', {
        token: w2Token,
        headers: { 'X-Idempotency-Key': `p9-enf-omit-${Date.now()}` },
        body: { lat: 16.0544, lng: 108.2022 }
    });
    assert.equal(omitDevCheckin.status, 403, `Enforced check-in omitting device_info MUST return 403, got ${omitDevCheckin.status}: ${omitDevCheckin.raw}`);

    // Wrong device_info -> 403
    const wrongDevCheckin = await apiRequest(baseUrl, 'POST', '/api/attendance/check-in', {
        token: w2Token,
        headers: { 'X-Idempotency-Key': `p9-enf-wrong-${Date.now()}` },
        body: { lat: 16.0544, lng: 108.2022, device_info: 'P9_DEV_ATTACKER' }
    });
    assert.equal(wrongDevCheckin.status, 403);

    // P1 Fix Verification 2: Omitting device_id in enforced zalo-auto-login MUST return 403
    const omitAuto = await apiRequest(baseUrl, 'POST', '/api/auth/zalo-auto-login', {
        body: {
            zalo_access_token: 'mock_zalo_user_p9_w2_enforced',
            zalo_user_id: 'p9_w2_enforced',
            ma_nv: W2
        }
    });
    assert.equal(omitAuto.status, 403, `Enforced zalo-auto-login omitting device_id MUST return 403, got ${omitAuto.status}`);

    // Matching device_id + verified zalo_access_token in enforced zalo-auto-login -> 200
    const matchAuto = await apiRequest(baseUrl, 'POST', '/api/auth/zalo-auto-login', {
        body: {
            zalo_access_token: 'mock_zalo_user_p9_w2_enforced',
            zalo_user_id: 'p9_w2_enforced',
            ma_nv: W2,
            device_id: 'P9_DEV_PRIMARY'
        }
    });
    assert.equal(matchAuto.status, 200);

    // P0 Fix Verification: Spoofed zalo-auto-login without zalo_access_token or mismatched token MUST return 401
    const noTokAuto = await apiRequest(baseUrl, 'POST', '/api/auth/zalo-auto-login', {
        body: { zalo_user_id: 'p9_w2_enforced', ma_nv: W2, device_id: 'P9_DEV_PRIMARY' }
    });
    assert.equal(noTokAuto.status, 401, `zalo-auto-login without zalo_access_token MUST return 401, got ${noTokAuto.status}`);

    const spoofTokAuto = await apiRequest(baseUrl, 'POST', '/api/auth/zalo-auto-login', {
        body: {
            zalo_access_token: 'mock_zalo_user_attacker_other',
            zalo_user_id: 'p9_w2_enforced',
            ma_nv: W2,
            device_id: 'P9_DEV_PRIMARY'
        }
    });
    assert.equal(spoofTokAuto.status, 401, `zalo-auto-login with mismatched zalo_access_token MUST return 401, got ${spoofTokAuto.status}`);

    // Replay location token in HTTP check-in MUST hard-reject with 403 SECURITY_VIOLATION_FRAUD (V14 Persistent Guard)
    const replayLocTok = `mock_zalo_loc_p9_replay_${crypto.randomBytes(3).toString('hex')}`;
    const firstLocCheckIn = await apiRequest(baseUrl, 'POST', '/api/attendance/check-in', {
        token: w2Token,
        headers: { 'X-Idempotency-Key': `p9-loc-first-${Date.now()}` },
        body: { lat: 16.0544, lng: 108.2022, device_info: 'P9_DEV_PRIMARY', zalo_location_token: replayLocTok }
    });
    assert.equal(firstLocCheckIn.status, 200, `First use of location token must succeed, got ${firstLocCheckIn.status}: ${firstLocCheckIn.raw}`);
    const [storedLocGuard] = await query(
        "SELECT key_hash FROM idempotency_keys WHERE endpoint = 'LOC_TOKEN_REPLAY_GUARD' AND actor_id = ? ORDER BY created_at DESC LIMIT 1",
        [W2]
    );
    assert.ok(storedLocGuard, 'First verified zalo_location_token must persist LOC_TOKEN_REPLAY_GUARD row in idempotency_keys');

    await query('DELETE FROM attendance_logs WHERE employee_id = ?', [W2]);
    const replayCheckInMem = await apiRequest(baseUrl, 'POST', '/api/attendance/check-in', {
        token: w2Token,
        headers: { 'X-Idempotency-Key': `p9-loc-rep1-${Date.now()}` },
        body: { lat: 16.0544, lng: 108.2022, device_info: 'P9_DEV_PRIMARY', zalo_location_token: replayLocTok }
    });
    assert.equal(replayCheckInMem.status, 403, `Replayed zalo_location_token MUST return 403, got ${replayCheckInMem.status}`);
    assert.equal(replayCheckInMem.json?.code, 'SECURITY_VIOLATION_FRAUD');

    // Simulate server restart clearing in-memory cache while DB idempotency_keys still holds token hash
    resetMockZaloTokens();
    await query('DELETE FROM attendance_logs WHERE employee_id = ?', [W2]);
    const replayCheckInDb = await apiRequest(baseUrl, 'POST', '/api/attendance/check-in', {
        token: w2Token,
        headers: { 'X-Idempotency-Key': `p9-loc-rep2-${Date.now()}` },
        body: { lat: 16.0544, lng: 108.2022, device_info: 'P9_DEV_PRIMARY', zalo_location_token: replayLocTok }
    });
    assert.equal(replayCheckInDb.status, 403, 'Persistent idempotency_keys store MUST continue blocking replayed token after in-memory reset');
    assert.equal(replayCheckInDb.json?.code, 'SECURITY_VIOLATION_FRAUD');

    const [replayAudit] = await query(
        "SELECT id FROM audit_logs WHERE actor_id = ? AND action = 'CRITICAL_FRAUD' AND details LIKE '%LOCATION_TOKEN_REPLAY%' ORDER BY id DESC LIMIT 1",
        [W2]
    );
    assert.ok(replayAudit, 'LOCATION_TOKEN_REPLAY must record CRITICAL_FRAUD audit event');

    // V16: Same-model Multi-Device Detection (2 physical iPhone 8 devices with distinct device_id) & 1-Tap Admin Lock/Revoke
    const MD_W = 'P9_V16_MD';
    await createQaEmployee({ ma_nv: MD_W, ho_ten: 'Nguyễn Văn Máy Đôi', role: 'worker', luong_cb: 9000000 });
    const loginIphone1 = await apiRequest(baseUrl, 'POST', '/api/login', {
        body: {
            ma_nv: MD_W,
            password: 'QaPass@2026!',
            device_id: 'DEV_IPHONE8_HW_FIRST_8F2A',
            device_name: 'iPhone 8',
            device_info: { deviceId: 'DEV_IPHONE8_HW_FIRST_8F2A', deviceName: 'iPhone 8', platform: 'iOS', screenWidth: 375, screenHeight: 667, pixelRatio: 2 }
        }
    });
    assert.equal(loginIphone1.status, 200);
    const tokenIphone1 = loginIphone1.json?.data?.token;
    assert.equal(loginIphone1.json?.data?.bound_device_name, 'iPhone 8');
    assert.equal(Boolean(loginIphone1.json?.data?.multi_device_alert), false);

    // Same user logs in from a SECOND physical iPhone 8 (same commercial name 'iPhone 8', different hardware device_id)
    const loginIphone2 = await apiRequest(baseUrl, 'POST', '/api/login', {
        body: {
            ma_nv: MD_W,
            password: 'QaPass@2026!',
            device_id: 'DEV_IPHONE8_HW_SECOND_3C9D',
            device_name: 'iPhone 8',
            device_info: { deviceId: 'DEV_IPHONE8_HW_SECOND_3C9D', deviceName: 'iPhone 8', platform: 'iOS', screenWidth: 375, screenHeight: 667, pixelRatio: 2 }
        }
    });
    assert.equal(loginIphone2.status, 200);
    const tokenIphone2 = loginIphone2.json?.data?.token;
    assert.equal(Boolean(loginIphone2.json?.data?.multi_device_alert), true, 'Logging in from 2nd iPhone 8 must trigger multi_device_alert = 1');

    const [mdEmpRow] = await query('SELECT bound_device_id, bound_device_name, known_devices_json, multi_device_alert FROM employees WHERE ma_nv = ?', [MD_W]);
    const knownList = JSON.parse(mdEmpRow.known_devices_json || '[]');
    assert.equal(knownList.length, 2, 'known_devices_json must preserve both distinct iPhone 8 entries');
    assert.notEqual(knownList[0].short_tag, knownList[1].short_tag, 'Two same-model iPhone 8 phones must have distinct #short_tag identifiers');
    assert.equal(Number(mdEmpRow.multi_device_alert), 1);

    const [mdAudit] = await query(
        "SELECT action, details FROM audit_logs WHERE actor_id = ? AND action = 'MULTI_DEVICE_DETECTED' ORDER BY id DESC LIMIT 1",
        [MD_W]
    );
    assert.ok(mdAudit, '2nd device login must write MULTI_DEVICE_DETECTED audit log');

    // Admin 1-tap locks strictly to iPhone 8 #1, clears #2, enables enforced & increments token_version to kick iPhone 8 #2
    const lockPrimaryRes = await apiRequest(baseUrl, 'POST', `/api/employees/${MD_W}/resolve-devices`, {
        token: admToken,
        body: { action: 'lock_primary', target_device_id: 'DEV_IPHONE8_HW_FIRST_8F2A', target_device_name: 'iPhone 8' }
    });
    assert.equal(lockPrimaryRes.status, 200, `Admin resolve-devices failed: ${lockPrimaryRes.raw}`);
    assert.equal(lockPrimaryRes.json?.data?.device_binding_mode, 'enforced');
    assert.equal(lockPrimaryRes.json?.data?.multi_device_alert, 0);
    assert.equal(lockPrimaryRes.json?.data?.known_devices?.length, 1);

    // Token issued before resolve-devices (including iPhone 8 #2) MUST immediately return 401 due to bumped token_version
    const kickedCheck = await apiRequest(baseUrl, 'GET', '/api/me', { token: tokenIphone2 });
    assert.equal(kickedCheck.status, 401, `Previous session on 2nd iPhone 8 must be kicked with 401 after lock_primary, got ${kickedCheck.status}`);
    const kickedCheck1 = await apiRequest(baseUrl, 'GET', '/api/me', { token: tokenIphone1 });
    assert.equal(kickedCheck1.status, 401, 'Old JWT tokens are revoked when token_version increments');

    // Enforced login from iPhone 8 #2 MUST now be rejected 403, while iPhone 8 #1 succeeds 200
    const blockedReLogin2 = await apiRequest(baseUrl, 'POST', '/api/login', {
        body: { ma_nv: MD_W, password: 'QaPass@2026!', device_id: 'DEV_IPHONE8_HW_SECOND_3C9D', device_name: 'iPhone 8' }
    });
    assert.equal(blockedReLogin2.status, 403, 'Secondary iPhone 8 must be blocked 403 once enforced lock_primary is active');
    const allowedReLogin1 = await apiRequest(baseUrl, 'POST', '/api/login', {
        body: { ma_nv: MD_W, password: 'QaPass@2026!', device_id: 'DEV_IPHONE8_HW_FIRST_8F2A', device_name: 'iPhone 8' }
    });
    assert.equal(allowedReLogin1.status, 200);

    // Staging vs Production Zalo token hardening audit (mocks strictly allowed ONLY in NODE_ENV=test)
    const prevEnv = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = 'staging';
        const stgUser = await verifyZaloUserToken('mock_zalo_user_staging_probe');
        const stgLoc = await verifyZaloLocationToken({ locationToken: 'web_gps_staging_probe' });
        assert.equal(stgUser, null, 'P0 fix: staging environment MUST reject mock_zalo_user_* tokens');
        assert.equal(stgLoc, null, 'P0 fix: staging environment MUST reject web_gps_* mock location tokens');

        process.env.NODE_ENV = 'production';
        const prodInvalidUser = await verifyZaloUserToken('invalid_zalo_oauth_token_12345', 'invalid_zalo_oauth_token_12345');
        assert.equal(prodInvalidUser, null, 'verifyZaloUserToken calls Zalo Graph API in production and rejects invalid tokens');
    } finally {
        process.env.NODE_ENV = prevEnv;
    }

    // TRUST_PROXY=true MUST throw FATAL on boot in production and staging
    for (const envName of ['production', 'staging']) {
        assert.throws(() => {
            execFileSync(process.execPath, ['-e', "require('./sedinco_backend/src/app')"], {
                cwd: ROOT_DIR,
                env: {
                    ...process.env,
                    NODE_ENV: envName,
                    TRUST_PROXY: 'true',
                    JWT_SECRET: 'test-secret-minimum-32-characters-long-1234'
                },
                stdio: 'pipe'
            });
        }, /TRUST_PROXY=true/, `NODE_ENV=${envName} with TRUST_PROXY=true must crash fatally on startup`);
    }
});

// =========================================================================
// GROUP 3: LOGIN SECURITY MATRIX
// =========================================================================
test('P9-SEC-LOGIN-01: Special/Unicode passwords, SQLi, Account Enumeration (P1 Fix), Admin Rate-Limits & JWT Revocation check', async () => {
    const specialPw = 'MậtKhẩu#2026!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~€';
    await createQaEmployee({ ma_nv: SPEC_W, ho_ten: 'Phase9 Unicode Pass', role: 'worker', password: specialPw });
    const specLogin = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: SPEC_W, password: specialPw } });
    assert.equal(specLogin.status, 200, 'Special/Unicode password must hash and login identically');
    const specTok = specLogin.json?.data?.token;

    // 1. SQL injection payloads
    for (const sqliId of ["' OR '1'='1", "admin'--", "\" UNION SELECT 1,2--"]) {
        const sqliEmp = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: sqliId, password: 'x' } });
        assert.equal(sqliEmp.status, 401);
        assert.ok(!/sql|syntax|mysql/i.test(sqliEmp.raw));
        const sqliAdm = await apiRequest(baseUrl, 'POST', '/api/admin/login', { body: { username: sqliId, password: 'x' } });
        assert.equal(sqliAdm.status, 401);
        assert.ok(!/sql|syntax|mysql/i.test(sqliAdm.raw));
    }

    // 2. P1 Fix: Locked employee wrong-password must NOT leak 403 oracle; valid-password still gets 403
    const wrongLocked = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: LOCK_W, password: 'WrongPassword!' } });
    const wrongMissing = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'P9_UNKNOWN_USER', password: 'WrongPassword!' } });
    assert.equal(wrongLocked.status, 401, 'Locked account with wrong password must return 401 (no account enumeration)');
    assert.equal(wrongLocked.json?.message, wrongMissing.json?.message, 'Error message must match non-existent account on wrong password');

    const validLocked = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: LOCK_W, password: 'QaPass@2026!' } });
    assert.equal(validLocked.status, 403, 'Locked account with valid password still returns 403 account locked');

    // 3. Admin Login brute-force lockout (5 attempts -> 6th returns 429) & multi-IP distributed protection
    await authService.resetRateLimitState();
    for (let i = 0; i < 5; i += 1) {
        const failAdm = await apiRequest(baseUrl, 'POST', '/api/admin/login', { body: { username: PURE_ADM, password: `WrongAdm_${i}` } });
        assert.equal(failAdm.status, 401);
    }
    const lockedAdm = await apiRequest(baseUrl, 'POST', '/api/admin/login', { body: { username: PURE_ADM, password: 'QaAdmin@2026!' } });
    assert.equal(lockedAdm.status, 429, `Admin brute force on 6th attempt must return 429, got ${lockedAdm.status}`);

    // Simulate expired locked_until cleanup -> login succeeds
    await query('UPDATE login_rate_limits SET locked_until = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE identifier LIKE ?', [`${PURE_ADM}%`]);
    const okAdm = await apiRequest(baseUrl, 'POST', '/api/admin/login', { body: { username: PURE_ADM, password: 'QaAdmin@2026!' } });
    assert.equal(okAdm.status, 200, 'Expired rate limit lock must allow valid login');

    // Multi-IP distributed attack against admin triggers ACCOUNT_UNDER_DISTRIBUTED_ATTACK audit event (P1 Fix)
    for (let i = 1; i <= 11; i += 1) {
        await authService.adminLogin(PURE_ADM, `WrongMulti_${i}`, `198.51.100.${i}`);
    }
    const [distAudit] = await query(
        "SELECT id FROM audit_logs WHERE actor_id = ? AND action = 'ACCOUNT_UNDER_DISTRIBUTED_ATTACK' ORDER BY id DESC LIMIT 1",
        [PURE_ADM]
    );
    assert.ok(distAudit, 'Admin multi-IP brute-force must trigger ACCOUNT_UNDER_DISTRIBUTED_ATTACK');

    // Multi-account valid login from same NAT IP must succeed cleanly without IP blocking
    await authService.resetRateLimitState();
    for (const [id, pw] of [[W1, 'QaPass@2026!'], [SPEC_W, specialPw], [ACC1, 'QaPass@2026!'], [ADM1, 'QaPass@2026!']]) {
        const r = await authService.employeeLogin(id, pw, '203.0.113.44');
        assert.equal(r.success, true, `Valid login from shared NAT IP for ${id} should succeed`);
    }

    // 4. Expired & tampered JWT
    const expJwt = signCustomJwt({ ma_nv: W1, role: 'worker', exp: Math.floor(Date.now() / 1000) - 60 });
    assert.equal((await apiRequest(baseUrl, 'GET', '/api/me', { token: expJwt })).status, 401);
    const badJwt = signCustomJwt({ ma_nv: W1, role: 'admin', exp: Math.floor(Date.now() / 1000) + 300 }, 'wrong-secret-key');
    assert.equal((await apiRequest(baseUrl, 'GET', '/api/me', { token: badJwt })).status, 401);

    // 5. P1 Fix: Immediate JWT revocation via token_version (change-password, status lock/unlock, role change)
    const newSpecialPw = 'MậtKhẩuMới#2027!@';
    const chgRes = await apiRequest(baseUrl, 'POST', '/api/change-password', {
        token: specTok,
        body: { old_password: specialPw, new_password: newSpecialPw }
    });
    assert.equal(chgRes.status, 200);
    assert.equal((await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: SPEC_W, password: specialPw } })).status, 401);
    const reLoginSpec = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: SPEC_W, password: newSpecialPw } });
    assert.equal(reLoginSpec.status, 200);
    const freshSpecTok = reLoginSpec.json?.data?.token;
    assert.ok(freshSpecTok);

    const staleJwtRes = await apiRequest(baseUrl, 'GET', '/api/me', { token: specTok });
    assert.equal(staleJwtRes.status, 401, `Prior JWT MUST be revoked after password change, got ${staleJwtRes.status}`);
    assert.equal(staleJwtRes.json?.code, 'TOKEN_REVOKED');
    assert.equal((await apiRequest(baseUrl, 'GET', '/api/me', { token: freshSpecTok })).status, 200);

    // Lock then unlock account -> old JWT MUST remain revoked (TOKEN_REVOKED) even after unlock
    const lockRes = await apiRequest(baseUrl, 'PUT', `/api/employees/${SPEC_W}/status`, { token: admToken, body: { is_locked: 1 } });
    assert.equal(lockRes.status, 200);
    const unlockRes = await apiRequest(baseUrl, 'PUT', `/api/employees/${SPEC_W}/status`, { token: admToken, body: { is_locked: 0 } });
    assert.equal(unlockRes.status, 200);
    const postUnlockOldJwt = await apiRequest(baseUrl, 'GET', '/api/me', { token: freshSpecTok });
    assert.equal(postUnlockOldJwt.status, 401, 'JWT issued before lock/unlock MUST remain revoked via token_version');
    assert.equal(postUnlockOldJwt.json?.code, 'TOKEN_REVOKED');

    // Re-login then change role -> immediate rejection (403 role mismatch) & stays revoked (401 TOKEN_REVOKED) even if reverted
    const preRoleTok = (await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: SPEC_W, password: newSpecialPw } })).json?.data?.token;
    const roleRes = await apiRequest(baseUrl, 'PUT', `/api/employees/${SPEC_W}/role`, { token: admToken, body: { role: 'accountant' } });
    assert.equal(roleRes.status, 200);
    const staleRoleDirect = await apiRequest(baseUrl, 'GET', '/api/me', { token: preRoleTok });
    assert.ok([401, 403].includes(staleRoleDirect.status), `JWT issued before role update MUST be rejected, got ${staleRoleDirect.status}`);
    await apiRequest(baseUrl, 'PUT', `/api/employees/${SPEC_W}/role`, { token: admToken, body: { role: 'worker' } });
    const staleRoleRestored = await apiRequest(baseUrl, 'GET', '/api/me', { token: preRoleTok });
    assert.equal(staleRoleRestored.status, 401, 'JWT issued before role flap MUST remain revoked via token_version');
    assert.equal(staleRoleRestored.json?.code, 'TOKEN_REVOKED');
});

// =========================================================================
// GROUP 4: COMPLETE 132-ROUTE RBAC, 1:1 16-KEY PERMISSION MATRIX & SOD
// =========================================================================
test('P9-RBAC-ALL: Route Inventory (133 Routes), Auth Boundaries, 16-Key 1:1 Matrix & SoD Verification', async () => {
    const routes = listExpressRoutes(app);
    assert.equal(routes.length, 133, `Expected 133 Express routes, observed ${routes.length}`);

    const publicWhitelist = new Set([
        'GET /api/health',
        'GET /api',
        'POST /api/login',
        'POST /api/auth/zalo-auto-login',
        'POST /api/zalo-auto-login',
        'POST /api/admin/login',
        'POST /api/client-errors'
    ]);

    // Unauthenticated POST /api/admin/register with full body MUST also return 401 (P0 authRoutes guard)
    const unauthRegFull = await apiRequest(baseUrl, 'POST', '/api/admin/register', {
        body: { username: 'P9_UNAUTH_ADM', password: 'QaPassword@2026!' }
    });
    assert.equal(unauthRegFull.status, 401, `Unauthenticated admin/register MUST return 401, got ${unauthRegFull.status}`);

    // Every non-whitelisted route must reject unauthenticated requests (401, or 404 for disabled diagnostics)
    for (const r of routes) {
        const sig = `${r.method} ${r.path}`;
        if (publicWhitelist.has(sig)) continue;
        const concretePath = r.path
            .replace(':ma_nv', W1)
            .replace(':id', '999999');
        const res = await apiRequest(baseUrl, r.method, concretePath, { body: r.method === 'GET' ? undefined : {} });
        if (r.path.startsWith('/api/diagnostics')) {
            assert.equal(res.status, 404, `Disabled diagnostics ${sig} MUST hide behind 404, got ${res.status}`);
        } else {
            assert.equal(res.status, 401, `Unauthenticated ${sig} MUST return 401, got ${res.status}`);
        }
    }

    // Worker enforcement across all protected & diagnostics endpoints
    const prevDiag = process.env.ENABLE_DIAGNOSTICS;
    process.env.ENABLE_DIAGNOSTICS = 'true';
    try {
        for (const diagPath of ['/api/diagnostics/status', '/api/diagnostics/system-status', '/api/diagnostics/recent-logs']) {
            const wDiag = await apiRequest(baseUrl, 'GET', diagPath, { token: w1Token });
            assert.equal(wDiag.status, 403, `Enabled diagnostics GET ${diagPath} MUST reject Worker with 403, got ${wDiag.status}`);
        }
    } finally {
        if (prevDiag === undefined) delete process.env.ENABLE_DIAGNOSTICS;
        else process.env.ENABLE_DIAGNOSTICS = prevDiag;
    }

    // Worker 403 enforcement across all Admin/Accountant protected endpoints
    const nonWorkerRoutes = [
        ['GET', `/api/attendance?month=4&year=${TEST_YEAR}`],
        ['POST', '/api/attendance/lock-period', { month: 4, year: TEST_YEAR }],
        ['POST', '/api/attendance/unlock-period', { month: 4, year: TEST_YEAR, reason: 'x' }],
        ['POST', '/api/attendance/proxy-check-in', { ma_nv: W2, record_date: `${TEST_YEAR}-04-08`, status: '1' }],
        ['GET', '/api/attendance/suspicious-logs'],
        ['GET', '/api/attendance/logs/1/image'],
        ['GET', `/api/attendance/stats?month=4&year=${TEST_YEAR}`],
        ['POST', '/api/payroll/resolve-dispute', { ma_nv: W2, month: 4, year: TEST_YEAR, new_status: 'CONFIRMED' }],
        ['GET', `/api/payroll?month=4&year=${TEST_YEAR}`],
        ['POST', '/api/payroll/calculate', { month: 4, year: TEST_YEAR }],
        ['GET', `/api/payroll/calculate?month=4&year=${TEST_YEAR}`],
        ['POST', '/api/payroll/adjustments', { ma_nv: W2, month: 4, year: TEST_YEAR }],
        ['POST', '/api/payroll/approve', { month: 4, year: TEST_YEAR }],
        ['POST', '/api/payroll/reject', { month: 4, year: TEST_YEAR, reason: 'x' }],
        ['POST', '/api/payroll/save', { month: 4, year: TEST_YEAR }],
        ['GET', `/api/payroll/export?month=4&year=${TEST_YEAR}`],
        ['GET', `/api/payroll/backup-snapshot?month=4&year=${TEST_YEAR}`],
        ['PUT', '/api/payroll/payment-status', { month: 4, year: TEST_YEAR, status: 'PAID' }],
        ['POST', '/api/payroll/payment-status', { month: 4, year: TEST_YEAR, status: 'PAID' }],
        ['GET', `/api/payroll/status-list?month=4&year=${TEST_YEAR}`],
        ['GET', '/api/requests'],
        ['GET', '/api/requests/all'],
        ['GET', '/api/requests/ot-registrations'],
        ['PUT', '/api/requests/ot-registrations/999999', { status: 'approved' }],
        ['POST', '/api/requests/batch-approve', { request_ids: [] }],
        ['PUT', '/api/requests/999999', { status: 'approved' }],
        ['GET', '/api/employees'],
        ['GET', '/api/employees/pending-device-changes'],
        ['GET', '/api/employees/pending-device-requests'],
        ['POST', '/api/employees/approve-device-change', { ma_nv: W2 }],
        ['POST', '/api/employees/reject-device-change', { ma_nv: W2 }],
        ['GET', `/api/employees/${W2}/permissions`],
        ['PUT', `/api/employees/${W2}/permissions`, { permissions: {} }],
        ['GET', `/api/employees/${W2}`],
        ['POST', '/api/employees', { ma_nv: 'P9_RBAC_TEMP', ho_ten: 'Temp', role: 'worker' }],
        ['PUT', `/api/employees/${W2}/role`, { role: 'admin' }],
        ['PUT', `/api/employees/${W2}/shift`, { shift_type: 'FULL_DAY' }],
        ['PUT', `/api/employees/${W2}/approve-device-change`],
        ['POST', `/api/employees/${W2}/approve-device-change`],
        ['POST', `/api/employees/${W2}/approve-device`],
        ['PUT', `/api/employees/${W2}/reject-device-change`],
        ['POST', `/api/employees/${W2}/reject-device-change`],
        ['POST', `/api/employees/${W2}/reject-device`],
        ['PUT', `/api/employees/${W2}/device-binding-mode`, { mode: 'recording' }],
        ['POST', `/api/employees/${W2}/resolve-devices`, { action: 'lock_primary' }],
        ['PUT', `/api/employees/${W2}/status`, { is_locked: 1 }],
        ['POST', `/api/employees/${W2}/toggle-lock`, { is_locked: 1 }],
        ['PUT', `/api/employees/${W2}`, { ho_ten: 'Nope' }],
        ['DELETE', `/api/employees/${W2}`],
        ['POST', '/api/employees/staged-force-password', { ma_nv: W2 }],
        ['POST', '/api/employees/batch-require-password-change', { ma_nvs: [W2] }],
        ['PUT', '/api/company', { company_name: 'Hacked' }],
        ['PUT', '/api/company/settings', { company_name: 'Hacked' }],
        ['POST', '/api/company/save-wifi-ip'],
        ['POST', '/api/company/reset-defaults'],
        ['POST', '/api/company/penalties', {}],
        ['PUT', '/api/company/penalties', {}],
        ['POST', '/api/holidays', { holiday_name: 'P9_NOPE', start_date: `${TEST_YEAR}-01-01`, end_date: `${TEST_YEAR}-01-01` }],
        ['DELETE', '/api/holidays/999999'],
        ['POST', '/api/settings/penalties', {}],
        ['PUT', '/api/settings/penalties', {}],
        ['GET', '/api/settings/accountant-permissions'],
        ['PUT', '/api/settings/accountant-permissions', { permissions: {} }],
        ['GET', '/api/settings/audit-logs'],
        ['PUT', '/api/settings/audit-logs/1/pin'],
        ['POST', '/api/settings/audit-logs/1/pin'],
        ['PUT', `/api/settings/audit-logs/keep-employee/${W2}`],
        ['POST', `/api/settings/audit-logs/keep-employee/${W2}`],
        ['POST', '/api/settings/audit-logs/cleanup'],
        ['GET', '/api/settings/alerts-summary'],
        ['POST', '/api/permissions/penalties', {}],
        ['PUT', '/api/permissions/penalties', {}],
        ['GET', '/api/permissions/accountant-permissions'],
        ['PUT', '/api/permissions/accountant-permissions', { permissions: {} }],
        ['GET', '/api/permissions/audit-logs'],
        ['PUT', '/api/permissions/audit-logs/1/pin'],
        ['POST', '/api/permissions/audit-logs/1/pin'],
        ['PUT', `/api/permissions/audit-logs/keep-employee/${W2}`],
        ['POST', `/api/permissions/audit-logs/keep-employee/${W2}`],
        ['POST', '/api/permissions/audit-logs/cleanup'],
        ['GET', '/api/permissions/alerts-summary'],
        ['GET', '/api/audit-logs'],
        ['PUT', '/api/audit-logs/1/pin'],
        ['POST', '/api/audit-logs/1/pin'],
        ['PUT', `/api/audit-logs/keep-employee/${W2}`],
        ['POST', `/api/audit-logs/keep-employee/${W2}`],
        ['POST', '/api/audit-logs/cleanup'],
        ['GET', '/api/notifications/summary']
    ];
    for (const [method, endpoint, body] of nonWorkerRoutes) {
        const res = await apiRequest(baseUrl, method, endpoint, { token: w1Token, body });
        assert.equal(res.status, 403, `Worker ${method} ${endpoint} MUST return 403, got ${res.status}`);
    }

    // Zero-perm Accountant: Disable ALL 30 keys -> every permissioned & admin route MUST return 403
    await setAllAccountantPerms(false);
    const accountantPermGatedRoutes = [
        ['GET', `/api/attendance?month=4&year=${TEST_YEAR}`],
        ['POST', '/api/attendance/lock-period', { month: 4, year: TEST_YEAR }],
        ['GET', '/api/attendance/suspicious-logs'],
        ['GET', `/api/attendance/stats?month=4&year=${TEST_YEAR}`],
        ['POST', '/api/attendance/proxy-check-in', { ma_nv: W2, record_date: `${TEST_YEAR}-04-08`, status: '1' }],
        ['GET', `/api/payroll?month=4&year=${TEST_YEAR}`],
        ['POST', '/api/payroll/calculate', { month: 4, year: TEST_YEAR }],
        ['POST', '/api/payroll/adjustments', { ma_nv: W2, month: 4, year: TEST_YEAR }],
        ['POST', '/api/payroll/approve', { month: 4, year: TEST_YEAR }],
        ['POST', '/api/payroll/reject', { month: 4, year: TEST_YEAR, reason: 'x' }],
        ['POST', '/api/payroll/resolve-dispute', { ma_nv: W2, month: 4, year: TEST_YEAR, new_status: 'CONFIRMED' }],
        ['GET', `/api/payroll/export?month=4&year=${TEST_YEAR}`],
        ['GET', `/api/payroll/backup-snapshot?month=4&year=${TEST_YEAR}`],
        ['PUT', '/api/payroll/payment-status', { month: 4, year: TEST_YEAR, status: 'PAID' }],
        ['POST', '/api/payroll/payment-status', { month: 4, year: TEST_YEAR, status: 'PAID' }],
        ['GET', `/api/payroll/status-list?month=4&year=${TEST_YEAR}`],
        ['GET', '/api/requests'],
        ['GET', '/api/requests/ot-registrations'],
        ['PUT', '/api/requests/999999', { status: 'approved' }],
        ['POST', '/api/requests/batch-approve', { request_ids: [] }],
        ['GET', '/api/employees'],
        ['GET', `/api/employees/${W2}`],
        ['POST', '/api/employees', { ma_nv: 'P9_RBAC_TEMP', ho_ten: 'Temp', role: 'worker' }],
        ['PUT', `/api/employees/${W2}`, { ho_ten: 'Blocked' }],
        ['PUT', `/api/employees/${W2}/status`, { is_locked: 1 }],
        ['DELETE', `/api/employees/${W2}`],
        ['PUT', `/api/employees/${W2}/shift`, { shift_type: 'FULL_DAY' }]
    ];
    for (const [method, endpoint, body] of accountantPermGatedRoutes) {
        const res = await apiRequest(baseUrl, method, endpoint, { token: accToken, body });
        assert.equal(res.status, 403, `Zero-perm Accountant ${method} ${endpoint} MUST return 403, got ${res.status}`);
    }

    // Grant ALL 30 keys -> verify immutable Admin-only endpoints STILL reject Accountant with 403!
    await setAllAccountantPerms(true);
    const adminImmutableRoutes = [
        ['POST', '/api/admin/register', { username: 'P9_BAD_ADM', password: 'QaPass@2026!' }],
        ['POST', '/api/attendance/unlock-period', { month: 4, year: TEST_YEAR, reason: 'Bypass' }],
        ['PUT', `/api/employees/${W2}/role`, { role: 'admin' }],
        ['PUT', `/api/employees/${W2}/device-binding-mode`, { mode: 'enforced' }],
        ['POST', `/api/employees/${W2}/resolve-devices`, { action: 'lock_primary' }],
        ['PUT', `/api/employees/${W2}/permissions`, { permissions: {} }],
        ['POST', '/api/employees/approve-device-change', { ma_nv: W2 }],
        ['POST', '/api/employees/staged-force-password', { ma_nv: W2 }],
        ['PUT', '/api/company', { company_name: 'Hacked' }],
        ['POST', '/api/company/save-wifi-ip'],
        ['POST', '/api/company/reset-defaults'],
        ['PUT', '/api/company/penalties', {}],
        ['POST', '/api/holidays', { holiday_name: 'P9_ACC_HOL', start_date: `${TEST_YEAR}-01-01`, end_date: `${TEST_YEAR}-01-01` }],
        ['DELETE', '/api/holidays/999999'],
        ['PUT', '/api/settings/penalties', {}],
        ['PUT', '/api/settings/accountant-permissions', { permissions: {} }],
        ['GET', '/api/audit-logs'],
        ['POST', '/api/audit-logs/cleanup']
    ];
    for (const [method, endpoint, body] of adminImmutableRoutes) {
        const res = await apiRequest(baseUrl, method, endpoint, { token: accToken, body });
        assert.equal(res.status, 403, `Even with all 30 DB perms ON, Accountant ${method} ${endpoint} MUST remain 403, got ${res.status}`);
    }

    // Legacy/read permission endpoints explicitly permit ['admin', 'accountant'] per route comments
    const accPermRead = await apiRequest(baseUrl, 'GET', `/api/employees/${W2}/permissions`, { token: accToken });
    assert.equal(accPermRead.status, 200, 'GET /api/employees/:id/permissions permits accountant per employeeRoutes.js:30');
    const accSetPermRead = await apiRequest(baseUrl, 'GET', '/api/settings/accountant-permissions', { token: accToken });
    assert.equal(accSetPermRead.status, 200, 'GET /api/settings/accountant-permissions permits accountant per settingsRoutes.js:18');

    // With ENABLE_DIAGNOSTICS=true, Accountant also gets 403 on all /api/diagnostics/* endpoints
    const prevDiagAcc = process.env.ENABLE_DIAGNOSTICS;
    process.env.ENABLE_DIAGNOSTICS = 'true';
    try {
        for (const [method, endpoint, body] of [
            ['GET', '/api/diagnostics/status'],
            ['GET', '/api/diagnostics/system-status'],
            ['GET', '/api/diagnostics/recent-logs'],
            ['POST', '/api/diagnostics/verify-zalo-user', { zalo_token: 'mock' }],
            ['POST', '/api/diagnostics/decode-location', { location_token: 'mock' }]
        ]) {
            const res = await apiRequest(baseUrl, method, endpoint, { token: accToken, body });
            assert.equal(res.status, 403, `Enabled diagnostics Accountant ${method} ${endpoint} MUST return 403, got ${res.status}`);
        }
    } finally {
        if (prevDiagAcc === undefined) delete process.env.ENABLE_DIAGNOSTICS;
        else process.env.ENABLE_DIAGNOSTICS = prevDiagAcc;
    }

    // V14 1:1 Permission Matrix Reconciliation: Backend ENFORCED_ACCOUNTANT_KEYS (16 keys) <-> FE roles.js <-> FE viLabels.js
    assert.equal(ENFORCED_ACCOUNTANT_KEYS.length, 16, 'Backend ENFORCED_ACCOUNTANT_KEYS must contain exact 16 enforced keys');
    const rolesSrc = fs.readFileSync(path.join(ROOT_DIR, 'zalo-miniapp-frontend/src/constants/roles.js'), 'utf8');
    const viLabelsSrc = fs.readFileSync(path.join(ROOT_DIR, 'zalo-miniapp-frontend/src/utils/viLabels.js'), 'utf8');
    const feRolesBlockMatch = rolesSrc.match(/export const ACCOUNTANT_ENFORCED_PERMISSION_KEYS = \[([\s\S]*?)\];/);
    assert.ok(feRolesBlockMatch, 'roles.js must export ACCOUNTANT_ENFORCED_PERMISSION_KEYS');
    const feRoleKeys = [...feRolesBlockMatch[1].matchAll(/['"]([a-z_]+)['"]/g)].map((m) => m[1]);

    const viGroupBlockMatch = viLabelsSrc.match(/export const ACCOUNTANT_PERMISSION_GROUPS = \[([\s\S]*?)\];\s*\n\s*export const ADMIN_SOD_EXCLUSIVE_ITEMS/);
    assert.ok(viGroupBlockMatch, 'viLabels.js must export ACCOUNTANT_PERMISSION_GROUPS');
    const viGroupKeys = [...viGroupBlockMatch[1].matchAll(/key:\s*['"]([a-z_]+)['"]/g)].map((m) => m[1]);

    assert.deepEqual([...feRoleKeys].sort(), [...ENFORCED_ACCOUNTANT_KEYS].sort(), 'roles.js must match Backend ENFORCED_ACCOUNTANT_KEYS 1:1');
    assert.deepEqual([...viGroupKeys].sort(), [...ENFORCED_ACCOUNTANT_KEYS].sort(), 'viLabels.js ACCOUNTANT_PERMISSION_GROUPS must cover all 16 Backend enforced keys 1:1');

    // Granular toggle check: Enable ONLY employee_create + payroll_export; ensure create works (201) & delete remains 403
    await setAllAccountantPerms(false);
    const granPut = await apiRequest(baseUrl, 'PUT', '/api/settings/accountant-permissions', {
        token: admToken,
        body: { permissions: { employee_create: true, payroll_export: true } }
    });
    assert.equal(granPut.status, 200);
    const createEmpAllowed = await apiRequest(baseUrl, 'POST', '/api/employees', {
        token: accToken,
        body: { ma_nv: 'P9_RBAC_TEMP', ho_ten: 'Phase9 Granular Temp', chuc_danh: 'Thợ', role: 'worker' }
    });
    assert.ok([200, 201].includes(createEmpAllowed.status), `Accountant with employee_create=true MUST create employee, got ${createEmpAllowed.status}: ${createEmpAllowed.raw}`);
    const delEmpBlocked = await apiRequest(baseUrl, 'DELETE', '/api/employees/P9_RBAC_TEMP', { token: accToken });
    assert.equal(delEmpBlocked.status, 403, 'Accountant without employee_delete MUST remain 403 on DELETE /api/employees/:ma_nv');
    const snapAccAllowed = await apiRequest(baseUrl, 'GET', `/api/payroll/backup-snapshot?month=4&year=${TEST_YEAR}`, { token: accToken });
    assert.equal(snapAccAllowed.status, 200, 'Accountant with payroll_export=true MUST access GET /api/payroll/backup-snapshot');
});

test('P9-V17-01: Pure Manager Role Isolation & Deep-Link Actionable Alerts Summary', async () => {
    // 1. Admin logins from multiple devices MUST NEVER bind device_id or trigger multi_device_alert
    const admDevLogin1 = await apiRequest(baseUrl, 'POST', '/api/login', {
        body: { ma_nv: ADM1, password: 'QaPass@2026!', device_info: 'ADM_DEVICE_IPHONE_15', device_name: 'iPhone 15 Pro' }
    });
    assert.equal(admDevLogin1.status, 200);
    assert.equal(admDevLogin1.json?.data?.bound_device_id, null, 'Admin login must not bind device_id');
    assert.equal(admDevLogin1.json?.data?.multi_device_alert, false, 'Admin login must not flag multi_device_alert');

    const admDevLogin2 = await apiRequest(baseUrl, 'POST', '/api/login', {
        body: { ma_nv: ADM1, password: 'QaPass@2026!', device_info: 'ADM_DEVICE_SAMSUNG_S24', device_name: 'Samsung S24' }
    });
    assert.equal(admDevLogin2.status, 200);
    assert.equal(admDevLogin2.json?.data?.multi_device_alert, false, 'Admin multi-device login must never flag alert');

    const [admRow] = await query('SELECT bound_device_id, multi_device_alert FROM employees WHERE ma_nv = ?', [ADM1]);
    assert.equal(admRow.bound_device_id, null, 'DB bound_device_id must remain NULL for Admin');
    assert.equal(Number(admRow.multi_device_alert || 0), 0, 'DB multi_device_alert must remain 0 for Admin');

    // 2. Admin excluded from attendance check-in, proxy check-in, matrix, stats, payroll, my-payslip, device binding & personal requests
    const admCheckIn = await apiRequest(baseUrl, 'POST', '/api/attendance/check-in', {
        token: admToken,
        headers: { 'X-Idempotency-Key': `p9-adm-ci-${Date.now()}` },
        body: { lat: 16.0544, lng: 108.2022, device_info: 'ADM_DEV' }
    });
    assert.equal(admCheckIn.status, 403, 'Admin account must be blocked from personal check-in');

    const pureAdmLogin = await apiRequest(baseUrl, 'POST', '/api/admin/login', {
        body: { username: PURE_ADM, password: 'QaAdmin@2026!' }
    });
    assert.equal(pureAdmLogin.status, 200);
    const pureAdmToken = pureAdmLogin.json?.data?.token;

    const admSelfProxy = await apiRequest(baseUrl, 'POST', '/api/attendance/proxy-check-in', {
        token: admToken,
        headers: { 'X-Idempotency-Key': `p9-adm-self-proxy-${Date.now()}` },
        body: { ma_nv: ADM1, record_date: `${TEST_YEAR}-04-15`, check_in_time: '08:00', work_location_type: 'OFFICE' }
    });
    assert.equal(admSelfProxy.status, 403, 'Admin self proxy check-in must remain blocked (403)');

    const admProxyTarget = await apiRequest(baseUrl, 'POST', '/api/attendance/proxy-check-in', {
        token: pureAdmToken,
        headers: { 'X-Idempotency-Key': `p9-adm-proxy-${Date.now()}` },
        body: { ma_nv: ADM1, record_date: `${TEST_YEAR}-04-15`, check_in_time: '08:00', work_location_type: 'OFFICE' }
    });
    assert.equal(admProxyTarget.status, 400, 'Proxy check-in targeting Admin account must return 400');

    const admSelfPay = await apiRequest(baseUrl, 'GET', `/api/payroll/me?month=4&year=${TEST_YEAR}`, { token: admToken });
    assert.equal(admSelfPay.status, 200);
    assert.equal(admSelfPay.json?.data, null, 'GET /payroll/me for Admin must return null');

    const admConfirmPay = await apiRequest(baseUrl, 'POST', '/api/payroll/confirm', {
        token: admToken,
        body: { month: 4, year: TEST_YEAR, status: 'CONFIRMED' }
    });
    assert.equal(admConfirmPay.status, 403, 'POST /payroll/confirm for Admin must return 403');

    const admAdjTarget = await apiRequest(baseUrl, 'POST', '/api/payroll/adjustments', {
        token: admToken,
        body: { ma_nv: ADM1, month: 4, year: TEST_YEAR, bonus_amount: 100000 }
    });
    assert.equal(admAdjTarget.status, 400, 'POST /payroll/adjustments targeting Admin must return 400');

    const admDevLock = await apiRequest(baseUrl, 'PUT', `/api/employees/${ADM1}/device-binding-mode`, {
        token: admToken,
        body: { mode: 'enforced' }
    });
    assert.equal(admDevLock.status, 400, 'Device binding mode targeting Admin must return 400');

    const payList = await apiRequest(baseUrl, 'GET', `/api/payroll?month=4&year=${TEST_YEAR}`, { token: admToken });
    assert.equal(payList.status, 200);
    assert.ok(!(payList.json?.data || []).some((e) => e.ma_nv === ADM1), 'Admin must be excluded from payroll list');

    const matrixList = await apiRequest(baseUrl, 'GET', `/api/attendance?month=4&year=${TEST_YEAR}`, { token: admToken });
    assert.equal(matrixList.status, 200);
    assert.ok(!(matrixList.json?.data || []).some((e) => e.ma_nv === ADM1), 'Admin must be excluded from attendance matrix');

    // 3. Notifications Summary returns deep-linkable actionable_alerts & excludes Admin from headcount
    const reqSeed = await apiRequest(baseUrl, 'POST', '/api/requests', {
        token: w2Token,
        body: { request_type: 'P', from_date: `${TEST_YEAR}-04-20`, to_date: `${TEST_YEAR}-04-20`, reason: 'P9_V17 bell deep link check' }
    });
    assert.ok([200, 201].includes(reqSeed.status), `Seed request for bell alert failed: ${reqSeed.raw}`);

    const notifRes = await apiRequest(baseUrl, 'GET', '/api/notifications/summary', { token: admToken });
    assert.equal(notifRes.status, 200);
    const notif = notifRes.json?.data;
    assert.ok(Array.isArray(notif?.actionable_alerts), 'notifications/summary must return actionable_alerts array');
    const seededBellItem = notif.actionable_alerts.find((a) => a.category === 'pending_request' && a.target_ma_nv === W2);
    assert.ok(seededBellItem, `notifications/summary actionable_alerts must contain pending_request for ${W2}`);
    for (const a of notif.actionable_alerts) {
        assert.ok(a.id && a.category && a.target_tab && a.target_ma_nv, `Alert entry missing deep-link fields: ${JSON.stringify(a)}`);
    }
    const absentIds = (notif?.headcount_today?.live_board?.absent_list || []).map((x) => x.ma_nv);
    assert.ok(!absentIds.includes(ADM1), 'Admin must not appear in live_board absent_list');
});

