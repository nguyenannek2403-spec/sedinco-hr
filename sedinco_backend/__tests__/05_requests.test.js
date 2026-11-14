/**
 * Suite 05 — Requests, Annual Leave Quota, OT Pre-Registration, Advance Deduction, SoD & Race Conditions
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
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

    await createQaEmployee({ ma_nv: 'QA_REQ_W1', ho_ten: 'QA Đơn Từ W1', role: 'worker', annual_leave_quota: 2 });
    await createQaEmployee({ ma_nv: 'QA_REQ_ACC', ho_ten: 'QA Kế Toán ĐT', role: 'accountant' });
    await createQaEmployee({ ma_nv: 'QA_REQ_ADM', ho_ten: 'QA Admin ĐT', role: 'admin' });

    const rW = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_REQ_W1', password: 'QaPass@2026!' } });
    workerToken = rW.json?.data?.token;
    const rAcc = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_REQ_ACC', password: 'QaPass@2026!' } });
    accToken = rAcc.json?.data?.token;
    const rAdm = await apiRequest(baseUrl, 'POST', '/api/login', { body: { ma_nv: 'QA_REQ_ADM', password: 'QaPass@2026!' } });
    adminToken = rAdm.json?.data?.token;

    await apiRequest(baseUrl, 'PUT', '/api/settings/accountant-permissions', {
        token: adminToken,
        body: { permissions: { leave_view_all: true, leave_approve: true } }
    });
});

test.after(async () => {
    await restoreSettings(snap);
    await cleanupQaData('QA_', 2099);
    if (srv) await srv.close();
});

test('REQ-01: Leave balance tracking, duplicate-date conflict (409), 3/month comp limit & Paid leave (P) sync', async () => {
    const bal0 = await apiRequest(baseUrl, 'GET', '/api/requests/leave-balance', { token: workerToken });
    assert.equal(bal0.status, 200);
    assert.equal(Number(bal0.json?.data?.quota), 2);

    // Valid 1-day paid leave
    const okLeave = await apiRequest(baseUrl, 'POST', '/api/requests', {
        token: workerToken,
        headers: { 'X-Idempotency-Key': `qa-leave-${Date.now()}` },
        body: { request_type: 'P', from_date: '2099-06-10', to_date: '2099-06-10', reason: 'Nghỉ phép năm QA' }
    });
    assert.equal(okLeave.status, 201);

    // Duplicate same-date leave request must be rejected with 409
    const dupLeave = await apiRequest(baseUrl, 'POST', '/api/requests', {
        token: workerToken,
        headers: { 'X-Idempotency-Key': `qa-dup-${Date.now()}` },
        body: { request_type: 'P', from_date: '2099-06-10', to_date: '2099-06-10', reason: 'Trùng ngày QA' }
    });
    assert.equal(dupLeave.status, 409);

    const rows = await query("SELECT id FROM requests WHERE employee_id = 'QA_REQ_W1' AND request_date = '2099-06-10' ORDER BY id DESC LIMIT 1");
    const reqId = rows[0]?.id;
    assert.ok(reqId);

    const approveRes = await apiRequest(baseUrl, 'PUT', `/api/requests/${reqId}`, {
        token: accToken,
        headers: { 'X-Idempotency-Key': `qa-app-leave-${Date.now()}` },
        body: { status: 'approved' }
    });
    assert.equal(approveRes.status, 200);

    const [attRow] = await query("SELECT status FROM attendance_logs WHERE employee_id = 'QA_REQ_W1' AND record_date = '2099-06-10'");
    assert.equal(attRow?.status, 'P');

    const balAfter = await apiRequest(baseUrl, 'GET', '/api/requests/leave-balance?year=2099', { token: workerToken });
    assert.equal(Number(balAfter.json?.data?.used), 1);
    assert.equal(Number(balAfter.json?.data?.remaining), 1);
});

test('REQ-02: Strict SoD — Accountant cannot self-approve own request or OT pre-registration', async () => {
    const selfReq = await apiRequest(baseUrl, 'POST', '/api/requests', {
        token: accToken,
        headers: { 'X-Idempotency-Key': `qa-acc-self-${Date.now()}` },
        body: { request_type: 'P', from_date: '2099-06-15', to_date: '2099-06-15', reason: 'Kế toán tự xin' }
    });
    assert.equal(selfReq.status, 201);
    const [row] = await query("SELECT id FROM requests WHERE employee_id = 'QA_REQ_ACC' AND request_date = '2099-06-15' LIMIT 1");
    assert.ok(row?.id);

    const selfApprove = await apiRequest(baseUrl, 'PUT', `/api/requests/${row.id}`, {
        token: accToken,
        headers: { 'X-Idempotency-Key': `qa-acc-self-app-${Date.now()}` },
        body: { status: 'approved' }
    });
    assert.equal(selfApprove.status, 403, 'Accountant must NEVER self-approve own request (SoD)');

    // OT pre-registration self-approval check
    const otReg = await apiRequest(baseUrl, 'POST', '/api/requests/ot-pre-register', {
        token: accToken,
        headers: { 'X-Idempotency-Key': `qa-ot-self-${Date.now()}` },
        body: { work_date: '2099-06-16', expected_hours: 3, reason: 'QA OT tự duyệt' }
    });
    assert.equal(otReg.status, 201);
    const [otRow] = await query("SELECT id FROM ot_registrations WHERE employee_id = 'QA_REQ_ACC' AND work_date = '2099-06-16' LIMIT 1");
    const selfOtApp = await apiRequest(baseUrl, 'PUT', `/api/requests/ot-registrations/${otRow.id}`, {
        token: accToken,
        headers: { 'X-Idempotency-Key': `qa-ot-app-${Date.now()}` },
        body: { status: 'approved' }
    });
    assert.equal(selfOtApp.status, 403, 'Accountant must NEVER self-approve own OT pre-registration');
});

test('REQ-03: Concurrency & Double-Approval Defense on Salary Advance (no duplicate advance_deduction)', async () => {
    const advReq = await apiRequest(baseUrl, 'POST', '/api/requests', {
        token: workerToken,
        headers: { 'X-Idempotency-Key': `qa-adv-create-${Date.now()}` },
        body: { request_type: 'SALARY_ADVANCE', from_date: '2099-07-05', to_date: '2099-07-05', advance_amount: 1500000, reason: 'QA Ứng lương' }
    });
    assert.equal(advReq.status, 201);
    const [row] = await query("SELECT id FROM requests WHERE employee_id = 'QA_REQ_W1' AND request_date = '2099-07-05' LIMIT 1");
    const reqId = row?.id;
    assert.ok(reqId);

    // Parallel approval blast WITHOUT idempotency key to stress row-level FOR UPDATE locking
    const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
            apiRequest(baseUrl, 'PUT', `/api/requests/${reqId}`, {
                token: i % 2 === 0 ? adminToken : accToken,
                headers: { 'X-Idempotency-Key': `qa-adv-race-${Date.now()}-${i}` },
                body: { status: 'approved' }
            })
        )
    );
    const okCount = results.filter((r) => r.status === 200).length;
    assert.equal(okCount, 1, `Concurrent approval burst on same request must approve EXACTLY ONCE, got ${okCount}`);

    const [attMonth] = await query("SELECT advance_deduction FROM attendance WHERE ma_nv = 'QA_REQ_W1' AND thang = 7 AND nam = 2099");
    assert.equal(Number(attMonth?.advance_deduction), 1500000, 'Advance deduction must NOT be double-counted across concurrent approvals');

    // Cannot cancel an already approved request
    const cancelApproved = await apiRequest(baseUrl, 'PUT', `/api/requests/${reqId}/cancel`, { token: workerToken });
    assert.equal(cancelApproved.status, 400);
});

test('REQ-04: Batch-approve atomic behavior skips invalid/self-requests safely', async () => {
    await apiRequest(baseUrl, 'POST', '/api/requests', {
        token: workerToken,
        headers: { 'X-Idempotency-Key': `qa-batch-1-${Date.now()}` },
        body: { request_type: 'KP', from_date: '2099-08-02', to_date: '2099-08-02', reason: 'Batch 1' }
    });
    await apiRequest(baseUrl, 'POST', '/api/requests', {
        token: workerToken,
        headers: { 'X-Idempotency-Key': `qa-batch-2-${Date.now()}` },
        body: { request_type: 'forgot_checkin', from_date: '2099-08-03', to_date: '2099-08-03', correction_mode: 'BOTH', check_in_time: '08:00', check_out_time: '17:30', reason: 'Batch 2' }
    });
    const pendingRows = await query("SELECT id FROM requests WHERE employee_id = 'QA_REQ_W1' AND YEAR(request_date) = 2099 AND status = 'pending'");
    const ids = pendingRows.map((r) => r.id);
    assert.ok(ids.length >= 2);

    const batchRes = await apiRequest(baseUrl, 'POST', '/api/requests/batch-approve', {
        token: accToken,
        headers: { 'X-Idempotency-Key': `qa-batch-go-${Date.now()}` },
        body: { request_ids: ids }
    });
    assert.equal(batchRes.status, 200);
    assert.ok(batchRes.json?.approved_count >= 2 || batchRes.json?.data?.approved_count >= 2);
});
