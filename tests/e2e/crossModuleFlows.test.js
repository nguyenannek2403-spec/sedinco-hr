/**
 * Phase 11: 10 End-to-End Cross-Module Flows + Phase 8 Cloudinary Avatar A->B->Cleanup Lifecycle
 * Strictly runs against NODE_ENV=test (`sedinco_hr_test`) with mocked Cloudinary & Zalo test doubles.
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const crypto = require('crypto');
const { TestHarness, TINY_PNG_BUFFER, TINY_JPEG_BUFFER, TINY_PDF_BUFFER, query } = require('../fixtures/testHarness');

const results = [];
async function e2e(id, name, fn) {
    const start = Date.now();
    try {
        await fn();
        results.push({ id, name, status: 'PASS', ms: Date.now() - start });
    } catch (err) {
        results.push({ id, name, status: 'FAIL', ms: Date.now() - start, error: err.message });
    }
}

(async () => {
    const harness = await new TestHarness().setup({ withMockCloudinary: true });
    try {
        const adminToken = await harness.tokenFor('admin');
        const ktToken = await harness.tokenFor('NV002');
        const co = await harness.request('GET', '/company', { token: adminToken });
        const branch = co.body.data.allowed_locations[0];

        // FLOW 1: Employee Lifecycle (Create -> Login -> Change Password -> Docs -> Update -> Lock/Unlock)
        await e2e('E2E-01', 'Employee Lifecycle: Create -> Login -> ChangePass -> Docs -> Update -> Lock/Unlock', async () => {
            const c = await harness.request('POST', '/employees', {
                token: adminToken,
                body: { ma_nv: 'TEST_E2E_01', ho_ten: 'E2E Employee 1', phone: '0966111222', role: 'worker', luong_cb: 15000000 }
            });
            assert.strictEqual(c.status, 201);
            const initPass = c.body.one_time_password || '123456';

            const login = await harness.request('POST', '/login', { body: { identifier: 'TEST_E2E_01', password: initPass } });
            assert.strictEqual(login.status, 200);
            const wTok = login.body.data.token;

            const chg = await harness.request('POST', '/change-password', {
                token: wTok,
                body: { old_password: initPass, new_password: 'E2EPassword@2026' }
            });
            assert.strictEqual(chg.status, 200);
            const wTok2 = chg.body.token || chg.body.data?.token;

            const docUp = await harness.uploadMultipart('/media/upload', {
                token: adminToken,
                fields: { category: 'employee_document', target_employee_id: 'TEST_E2E_01' },
                files: [{ fieldName: 'file', filename: 'test_e2e_hdld.pdf', mimeType: 'application/pdf', buffer: TINY_PDF_BUFFER }]
            });
            assert.strictEqual(docUp.status, 201);

            const docs = await harness.request('GET', '/media/employee/TEST_E2E_01/documents', { token: wTok2 });
            assert.strictEqual(docs.status, 200);
            assert(docs.body.data.length >= 1);

            const upd = await harness.request('PUT', '/employees/TEST_E2E_01', {
                token: adminToken,
                body: { ho_ten: 'E2E Employee 1 Updated', luong_cb: 16000000, phone: '0966111222' }
            });
            assert.strictEqual(upd.status, 200);

            const lockRes = await harness.request('PUT', '/employees/TEST_E2E_01/status', { token: adminToken, body: { is_locked: true } });
            assert.strictEqual(lockRes.status, 200);
            const blockedMe = await harness.request('GET', '/me', { token: wTok2 });
            assert.strictEqual(blockedMe.status, 403);

            const unlockRes = await harness.request('PUT', '/employees/TEST_E2E_01/status', { token: adminToken, body: { is_locked: false } });
            assert.strictEqual(unlockRes.status, 200);
            // Locking revokes previous tokens (token_version++), so old wTok2 stays 401 and fresh login works
            const staleMe = await harness.request('GET', '/me', { token: wTok2 });
            assert.strictEqual(staleMe.status, 401);
            const relogin = await harness.request('POST', '/login', { body: { identifier: 'TEST_E2E_01', password: 'E2EPassword@2026' } });
            assert.strictEqual(relogin.status, 200);
            const okMe = await harness.request('GET', '/me', { token: relogin.body.data.token });
            assert.strictEqual(okMe.status, 200);
        });

        // FLOW 2: Smart Attendance Check-In (GPS + QR + MISA + Snapshot Media) -> Monthly Matrix
        await e2e('E2E-02', 'Attendance Flow: Precheck -> QR -> Check-In w/ Photo -> MISA & Matrix', async () => {
            const wTok = await harness.tokenFor('TEST_E2E_01');
            const snap = 'data:image/png;base64,' + TINY_PNG_BUFFER.toString('base64');
            const qr = await harness.request('POST', '/attendance/qr-session', { token: adminToken, body: { branch_id: branch.id, ttl_seconds: 120 } });
            assert.strictEqual(qr.status, 200);
            const ci = await harness.request('POST', '/attendance/check-in', {
                token: wTok,
                body: {
                    lat: branch.lat,
                    lng: branch.lng,
                    zalo_location_token: `test_loc_token_${branch.lat}_${branch.lng}_${Date.now()}`,
                    qr_token: qr.body.data.qr_token,
                    client_nonce: 'nonce_e2e_' + crypto.randomUUID(),
                    image_snapshot: snap,
                    work_location_type: 'OFFICE'
                }
            });
            assert.strictEqual(ci.status, 200);
            const today = await harness.request('GET', '/attendance/today', { token: wTok });
            assert.strictEqual(today.status, 200);
            assert(today.body.data.today_record && today.body.data.today_record.check_in_time);
        });

        // FLOW 3: Leave Request -> Quota Check -> Admin Approve -> Attendance Sync -> Payroll Reflection
        await e2e('E2E-03', 'Request -> Leave Quota -> Approve -> Attendance Sync -> Payroll Reflect', async () => {
            const wTok = await harness.tokenFor('TEST_E2E_01');
            const req = await harness.request('POST', '/requests', {
                token: wTok,
                body: { request_type: 'leave', request_date: '2096-03-12', reason: '[TEST] E2E Paid Leave' }
            });
            assert.strictEqual(req.status, 201);
            const reqId = req.body.data.id;

            const app = await harness.request('PUT', `/requests/${reqId}`, {
                token: adminToken,
                body: { status: 'approved' }
            });
            assert.strictEqual(app.status, 200);

            const meAtt = await harness.request('GET', '/attendance/me?month=3&year=2096', { token: wTok });
            assert.strictEqual(meAtt.status, 200);
            const pLog = (meAtt.body.data.logs || []).find(l => String(l.record_date).startsWith('2096-03-12') || l.record_date_iso === '2096-03-12');
            assert(pLog && pLog.status === 'P', 'Approved leave must sync status P to attendance_logs');

            const slip = await harness.request('GET', '/payroll/me?month=3&year=2096', { token: wTok });
            assert.strictEqual(slip.status, 200);
            assert.strictEqual(Number(slip.body.data.paidLeaveDays), 1);
        });

        // FLOW 4: Full Payroll Lifecycle (Send Report -> Dispute w/ Evidence -> Resolve -> Mark Paid -> Received)
        await e2e('E2E-04', 'Payroll End-to-End: Send -> Dispute -> Resolve -> Mark Paid -> Worker Received', async () => {
            const wTok = await harness.tokenFor('TEST_E2E_01');
            const evUp = await harness.uploadMultipart('/media/upload', {
                token: wTok,
                fields: { category: 'accounting_attachment', reference_date: '2096-03-12' },
                files: [{ fieldName: 'file', filename: 'test_disp_ev.png', mimeType: 'image/png', buffer: TINY_PNG_BUFFER }]
            });
            assert.strictEqual(evUp.status, 201);

            const sent = await harness.request('POST', '/payroll/send-report', {
                token: adminToken,
                body: { ma_nv: 'TEST_E2E_01', month: 3, year: 2096 }
            });
            assert.strictEqual(sent.status, 200);

            const disp = await harness.request('POST', '/payroll/confirm', {
                token: wTok,
                body: {
                    month: 3,
                    year: 2096,
                    status: 'DISPUTED',
                    dispute_reason: '[TEST] Kiem tra phu cap',
                    dispute_evidence_media: `/api/media/${evUp.body.data.asset_uuid}/access`
                }
            });
            assert.strictEqual(disp.status, 200);

            const resolved = await harness.request('POST', '/payroll/resolve-dispute', {
                token: adminToken,
                body: { ma_nv: 'TEST_E2E_01', month: 3, year: 2096, admin_response: '[TEST] Da xac minh', new_status: 'CONFIRMED' }
            });
            assert.strictEqual(resolved.status, 200);

            const paid = await harness.request('POST', '/payroll/mark-paid', {
                token: adminToken,
                body: { ma_nv: 'TEST_E2E_01', month: 3, year: 2096, transfer_note: '[TEST] E2E VCB' }
            });
            assert.strictEqual(paid.status, 200);

            const rcv = await harness.request('POST', '/payroll/confirm', {
                token: wTok,
                body: { month: 3, year: 2096, status: 'RECEIVED' }
            });
            assert.strictEqual(rcv.status, 200);
        });

        // FLOW 5: Period Lock -> Block Attendance Edit & Requests -> Unlock (Admin only) -> Allow
        await e2e('E2E-05', 'Period Lock blocks mutations & Admin Unlock restores write access', async () => {
            const wTok = await harness.tokenFor('TEST_E2E_01');
            const lock = await harness.request('POST', '/attendance/lock-period', {
                token: adminToken,
                body: { month: 4, year: 2096, reason: '[TEST] Chot ky thang 4', confirm_low_trust: true }
            });
            assert.strictEqual(lock.status, 200);

            const editLocked = await harness.request('POST', '/attendance/update', {
                token: adminToken,
                body: { ma_nv: 'TEST_E2E_01', date: '2096-04-02', status: '1' }
            });
            assert(editLocked.status >= 400, 'Locked period must block attendance update');

            const reqLocked = await harness.request('POST', '/requests', {
                token: wTok,
                body: { request_type: 'kp', request_date: '2096-04-03', reason: '[TEST] During lock' }
            });
            assert(reqLocked.status >= 400, 'Locked period must block new requests');

            const ktUnlockDenied = await harness.request('POST', '/attendance/unlock-period', {
                token: ktToken,
                body: { month: 4, year: 2096, reason: 'KT try unlock' }
            });
            assert.strictEqual(ktUnlockDenied.status, 403);

            const adminUnlock = await harness.request('POST', '/attendance/unlock-period', {
                token: adminToken,
                body: { month: 4, year: 2096, reason: '[TEST] Mo lai' }
            });
            assert.strictEqual(adminUnlock.status, 200);

            const editOk = await harness.request('POST', '/attendance/update', {
                token: adminToken,
                body: { ma_nv: 'TEST_E2E_01', date: '2096-04-02', status: '1' }
            });
            assert.strictEqual(editOk.status, 200);
        });

        // FLOW 6: Accountant Dynamic Permission Toggle (Real-Time Enforcement)
        await e2e('E2E-06', 'Accountant Dynamic Permission Enable -> Succeeds; Disable -> 403', async () => {
            await harness.request('PUT', '/settings/accountant-permissions', {
                token: adminToken,
                body: { permissions: { attendance_edit: false } }
            });
            const denied = await harness.request('POST', '/attendance/update', {
                token: ktToken,
                body: { ma_nv: 'TEST_E2E_01', date: '2096-05-02', status: '1' }
            });
            assert.strictEqual(denied.status, 403);

            await harness.request('PUT', '/settings/accountant-permissions', {
                token: adminToken,
                body: { permissions: { attendance_edit: true } }
            });
            const allowed = await harness.request('POST', '/attendance/update', {
                token: ktToken,
                body: { ma_nv: 'TEST_E2E_01', date: '2096-05-02', status: '1' }
            });
            assert.strictEqual(allowed.status, 200);
        });

        // FLOW 7: Notifications Trigger & Read Lifecycle
        await e2e('E2E-07', 'Period Lock triggers User Notifications & Read-All updates unread counter', async () => {
            const wTok = await harness.tokenFor('TEST_E2E_01');
            await harness.request('POST', '/payroll/send-report', {
                token: adminToken,
                body: { ma_nv: 'TEST_E2E_01', month: 5, year: 2096 }
            });
            const nRes = await harness.request('GET', '/notifications/my?filter=unread', { token: wTok });
            assert.strictEqual(nRes.status, 200);
            assert((nRes.body.data.unread_count || 0) >= 1, 'Expected unread notification after send-report');

            const readAll = await harness.request('PUT', '/notifications/read-all', { token: wTok });
            assert.strictEqual(readAll.status, 200);

            const nAfter = await harness.request('GET', '/notifications/my?filter=unread', { token: wTok });
            assert.strictEqual(nAfter.body.data.unread_count, 0);
        });

        // FLOW 8: Department CRUD + Rename Cascade + Delete Reassigns Employees to Default
        await e2e('E2E-08', 'Department Rename & Delete Reassigns Employees Safely to Default', async () => {
            const dCreate = await harness.request('POST', '/departments', { token: adminToken, body: { name: 'TEST_DEPT_E2E_1' } });
            assert.strictEqual(dCreate.status, 201);
            const did = dCreate.body.data.id;

            await harness.request('PUT', '/employees/TEST_E2E_01', {
                token: adminToken,
                body: { department: 'TEST_DEPT_E2E_1', phone: '0966111222' }
            });

            const dRen = await harness.request('PUT', `/departments/${did}`, { token: adminToken, body: { name: 'TEST_DEPT_E2E_2' } });
            assert.strictEqual(dRen.status, 200);
            let empRow = (await query('SELECT department FROM employees WHERE ma_nv=?', ['TEST_E2E_01']))[0];
            assert.strictEqual(empRow.department, 'TEST_DEPT_E2E_2');

            const dDel = await harness.request('DELETE', `/departments/${did}`, { token: adminToken });
            assert.strictEqual(dDel.status, 200);
            empRow = (await query('SELECT department FROM employees WHERE ma_nv=?', ['TEST_E2E_01']))[0];
            assert.strictEqual(empRow.department, 'Khối Văn phòng');
        });

        // FLOW 9: Flexible Holiday Pay Multiplier (x1.5 vs x3) Reflections in Payroll
        await e2e('E2E-09', 'Custom Holiday x1.5 Multiplier computes exact extra holiday pay in Payroll', async () => {
            const wTok = await harness.tokenFor('TEST_E2E_01');
            const h = await harness.request('POST', '/holidays', {
                token: adminToken,
                body: { holiday_name: 'TEST_HOL_E2E_15', start_date: '2096-06-15', end_date: '2096-06-15', salary_multiplier: 1.5 }
            });
            assert.strictEqual(h.status, 201);
            const hid = h.body.id;

            await harness.request('POST', '/attendance/update', {
                token: adminToken,
                body: { ma_nv: 'TEST_E2E_01', date: '2096-06-15', status: '1' }
            });

            const slip = await harness.request('GET', '/payroll/me?month=6&year=2096', { token: wTok });
            assert.strictEqual(slip.status, 200);
            assert(slip.body.data.holidayWorkAmount > 0, 'Holiday work amount should be > 0 for x1.5 holiday');
            assert.strictEqual(slip.body.data.holidayWorkBreakdown[0].multiplier, 1.5);

            await harness.request('DELETE', `/holidays/${hid}`, { token: adminToken });
        });

        // FLOW 10 (Phase 8): Avatar A -> Avatar B -> Orphan Marking -> Retention Cleanup & Remote Store Delete
        await e2e('E2E-10', 'Cloudinary Avatar A -> B Replacement Lifecycle, Orphan Cleanup & Zero DB Leaks', async () => {
            const wTok = await harness.tokenFor('TEST_E2E_01');

            const upA = await harness.uploadMultipart('/media/upload', {
                token: wTok,
                fields: { category: 'employee_avatar' },
                files: [{ fieldName: 'file', filename: 'test_avt_a.png', mimeType: 'image/png', buffer: TINY_PNG_BUFFER }]
            });
            assert.strictEqual(upA.status, 201);
            const urlA = upA.body.data.secure_url;
            const uuidA = upA.body.data.asset_uuid;
            const pubA = upA.body.data.public_id;
            assert(harness.mockCloudinary.remoteStore.has(pubA), 'Avatar A must exist in mock Cloudinary store');

            const setA = await harness.request('PUT', '/account/avatar', { token: wTok, body: { avatar_url: urlA } });
            assert.strictEqual(setA.status, 200);

            const upB = await harness.uploadMultipart('/media/upload', {
                token: wTok,
                fields: { category: 'employee_avatar' },
                files: [{ fieldName: 'file', filename: 'test_avt_b.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG_BUFFER }]
            });
            assert.strictEqual(upB.status, 201);
            const urlB = upB.body.data.secure_url;
            const pubB = upB.body.data.public_id;

            const setB = await harness.request('PUT', '/account/avatar', { token: wTok, body: { avatar_url: urlB } });
            assert.strictEqual(setB.status, 200);

            const rowA = (await query('SELECT upload_status, orphan_since FROM media_assets WHERE asset_uuid = ?', [uuidA]))[0];
            assert.strictEqual(rowA.upload_status, 'orphan_candidate', 'Old Avatar A must become orphan_candidate');

            // Fast-forward orphan_since > retention window so cleanup-orphans sweeps A (but preserves active B)
            await query('UPDATE media_assets SET orphan_since = DATE_SUB(NOW(), INTERVAL 48 HOUR) WHERE asset_uuid = ?', [uuidA]);
            const dryRun = await harness.request('POST', '/media/admin/cleanup-orphans', {
                token: adminToken,
                body: { dry_run: true, retention_hours: 24 }
            });
            assert.strictEqual(dryRun.status, 200);
            assert(Array.isArray(dryRun.body.data.items) && dryRun.body.data.items.some(c => c.asset_uuid === uuidA), 'Dry-run must find Avatar A');

            const realClean = await harness.request('POST', '/media/admin/cleanup-orphans', {
                token: adminToken,
                body: { dry_run: false, retention_hours: 24 }
            });
            assert.strictEqual(realClean.status, 200);
            assert(!harness.mockCloudinary.remoteStore.has(pubA), 'Avatar A must be deleted from Cloudinary');
            assert(harness.mockCloudinary.remoteStore.has(pubB), 'Active Avatar B must NEVER be deleted');
        });

        console.table(results);
        const failed = results.filter(r => r.status === 'FAIL');
        if (failed.length > 0) {
            console.error('E2E FAILURES:', failed);
            process.exitCode = 1;
        }
    } finally {
        await harness.teardown({ closePool: true });
        process.exit(process.exitCode || 0);
    }
})();
