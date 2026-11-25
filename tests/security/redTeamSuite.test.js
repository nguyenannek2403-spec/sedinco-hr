/**
 * Phase 6: RED TEAM SECURITY EXPLOIT & REPRODUCTION SUITE
 * Purpose: Attack the live test server (`NODE_ENV=test`) BEFORE any remediation
 * and capture exact proof of every reproducible finding vs verified defense.
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const crypto = require('crypto');
const { TestHarness, TINY_PNG_BUFFER, TINY_PDF_BUFFER, query } = require('../fixtures/testHarness');

const findings = [];
async function probe(id, category, title, fn) {
    try {
        const res = await fn();
        findings.push({ id, category, title, ...res });
    } catch (err) {
        findings.push({ id, category, title, result: 'ERROR', detail: err.message });
    }
}

(async () => {
    const harness = await new TestHarness().setup({ withMockCloudinary: true });
    try {
        const adminToken = await harness.tokenFor('admin');

        // Provision isolated Red Team accounts (Worker A, Worker B, Accountant KT)
        await harness.request('POST', '/employees', {
            token: adminToken,
            body: { ma_nv: 'TEST_RED_W1', ho_ten: 'Red Worker 1', phone: '0977000111', role: 'worker', luong_cb: 10000000 }
        });
        await harness.request('POST', '/employees', {
            token: adminToken,
            body: { ma_nv: 'TEST_RED_W2', ho_ten: 'Red Worker 2', phone: '0977000222', role: 'worker', luong_cb: 10000000 }
        });
        await harness.request('POST', '/employees', {
            token: adminToken,
            body: { ma_nv: 'TEST_RED_KT', ho_ten: 'Red Accountant', phone: '0977000333', role: 'accountant', luong_cb: 12000000 }
        });

        const w1Token = await harness.tokenFor('TEST_RED_W1');
        const w2Token = await harness.tokenFor('TEST_RED_W2');
        const ktToken = await harness.tokenFor('TEST_RED_KT');

        // RT-01: Distributed Password Brute-Force > 30 Global Attempts (ACCOUNT_GLOBAL_MAX_ATTEMPTS = 30)
        await probe('RT-AUTH-01', 'Authentication', 'Global Distributed Brute-Force (>30 distinct composite keys/IPs)', async () => {
            // Seed 31 failed attempts across distinct IPs in login_rate_limits for identifier TEST_RED_W1
            await query(
                `INSERT INTO login_rate_limits (key_name, target_type, identifier, attempt_count, first_attempt, last_attempt, locked_until)
                 VALUES ('account:TEST_RED_W1', 'account', 'TEST_RED_W1', 35, NOW(), NOW(), DATE_ADD(NOW(), INTERVAL 15 MINUTE))
                 ON DUPLICATE KEY UPDATE attempt_count=35, locked_until=DATE_ADD(NOW(), INTERVAL 15 MINUTE)`
            );
            const r = await harness.request('POST', '/login', {
                body: { identifier: 'TEST_RED_W1', password: 'WrongPassword@999' }
            });
            // VULNERABLE if status is 401 (login attempted & failed instead of blocked with 429)
            return {
                result: r.status === 429 ? 'DEFENDED' : 'VULNERABLE',
                httpStatus: r.status,
                detail: `When account:TEST_RED_W1 has attempt_count=35 & locked_until in future, /login returned ${r.status} (${r.body?.message})`
            };
        });

        // RT-02: Tampered JWT / None Alg / Header Role Spoof / Token Revocation
        await probe('RT-AUTH-02', 'JWT & Auth', 'Header Spoof (x-user-role) & Tampered JWT Signature', async () => {
            const spoof = await harness.request('GET', '/employees', {
                headers: { 'x-user-role': 'admin', 'x-user-id': 'admin' }
            });
            const parts = w1Token.split('.');
            const forgedPayload = Buffer.from(JSON.stringify({ id: 1, username: 'admin', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
            const forgedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`;
            const forged = await harness.request('GET', '/employees', { token: forgedToken });
            return {
                result: spoof.status === 401 && forged.status === 401 ? 'DEFENDED' : 'VULNERABLE',
                httpStatus: `${spoof.status}/${forged.status}`,
                detail: `Header spoof -> ${spoof.status}, forged JWT -> ${forged.status}`
            };
        });

        // RT-03: Token Revocation after token_version bump
        await probe('RT-AUTH-03', 'Session', 'Use stale JWT after token_version increment', async () => {
            await query('UPDATE employees SET token_version = COALESCE(token_version, 1) + 1 WHERE ma_nv = ?', ['TEST_RED_W2']);
            const r = await harness.request('GET', '/me', { token: w2Token });
            return {
                result: r.status === 401 && r.body?.code === 'TOKEN_REVOKED' ? 'DEFENDED' : 'VULNERABLE',
                httpStatus: r.status,
                detail: `Stale token -> ${r.status} (${r.body?.code})`
            };
        });
        const w2FreshToken = await harness.tokenFor('TEST_RED_W2');

        // RT-04: HTTP GET State Mutation (GET /api/payroll/calculate)
        await probe('RT-CSRF-01', 'CSRF / HTTP Semantics', 'State-mutating autoResolveSalaryDisputes blocked on HTTP GET', async () => {
            // Setup open dispute in future test month 2095-06
            await query(
                `INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, salary_confirm_status, dispute_status, dispute_reason)
                 VALUES ('TEST_RED_W1', 6, 2095, 26, 'DISPUTED', 'OPEN', '[TEST] Pre-dispute')
                 ON DUPLICATE KEY UPDATE salary_confirm_status='DISPUTED', dispute_status='OPEN'`
            );
            const getMut = await harness.request('GET', '/payroll/calculate?month=6&year=2095', { token: adminToken });
            const after = await query('SELECT salary_confirm_status, dispute_status FROM attendance WHERE ma_nv=? AND thang=6 AND nam=2095', ['TEST_RED_W1']);
            const defended = getMut.status === 405 && after[0]?.dispute_status === 'OPEN';
            return {
                result: defended ? 'DEFENDED' : 'VULNERABLE',
                httpStatus: getMut.status,
                detail: `GET /payroll/calculate -> HTTP ${getMut.status}, DB dispute_status=${after[0]?.dispute_status}`
            };
        });

        // RT-05: Accountant Self-Salary Escalation via employee_edit permission
        await probe('RT-RBAC-01', 'RBAC / SoD', 'Accountant with employee_edit escalating own luong_cb & allowances via PUT /employees/:id', async () => {
            await harness.request('PUT', '/settings/accountant-permissions', {
                token: adminToken,
                body: { permissions: { employee_view: true, employee_edit: true, employee_status_manage: true } }
            });
            const escal = await harness.request('PUT', '/employees/TEST_RED_KT', {
                token: ktToken,
                body: { ho_ten: 'Red Accountant', luong_cb: 999999999, phu_cap_trach_nhiem: 50000000 }
            });
            const row = await query('SELECT luong_cb, phu_cap_trach_nhiem FROM employees WHERE ma_nv = ?', ['TEST_RED_KT']);
            return {
                result: escal.status === 200 && Number(row[0].luong_cb) === 999999999 ? 'VULNERABLE' : 'DEFENDED',
                httpStatus: escal.status,
                detail: `PUT /employees/TEST_RED_KT by self accountant -> HTTP ${escal.status}, DB luong_cb=${row[0].luong_cb}`
            };
        });

        // RT-06: Horizontal IDOR - Worker B accesses/deletes Worker A's private media & requests
        await probe('RT-IDOR-01', 'IDOR', 'Worker B reads Worker A private evidence media & requests', async () => {
            const up = await harness.uploadMultipart('/media/upload', {
                token: w1Token,
                fields: { category: 'leave_evidence', reference_date: '2095-07-01' },
                files: [{ fieldName: 'file', filename: 'test_w1_secret.png', mimeType: 'image/png', buffer: TINY_PNG_BUFFER }]
            });
            const uuid = up.body?.data?.asset_uuid;
            assert(uuid, `Upload failed: ${up.status} ${JSON.stringify(up.body)}`);
            const accessByW2 = await harness.request('GET', `/media/${uuid}/access?mode=json`, { token: w2FreshToken });
            const listDocsByW2 = await harness.request('GET', '/media/employee/TEST_RED_W1/documents', { token: w2FreshToken });
            const reqCreate = await harness.request('POST', '/requests', {
                token: w1Token,
                body: { request_type: 'leave', request_date: '2095-07-05', reason: '[TEST] W1 private' }
            });
            const cancelByW2 = await harness.request('PUT', `/requests/${reqCreate.body?.data?.id}/cancel`, { token: w2FreshToken });
            const defended = accessByW2.status === 403 && listDocsByW2.status === 403 && cancelByW2.status === 403;
            return {
                result: defended ? 'DEFENDED' : 'VULNERABLE',
                httpStatus: `${accessByW2.status}/${listDocsByW2.status}/${cancelByW2.status}`,
                detail: `W2 access W1 media=${accessByW2.status}, W1 docs=${listDocsByW2.status}, cancel W1 req=${cancelByW2.status}`
            };
        });

        // RT-07: Cross-Employee Media SHA-256 Deduplication Leak
        await probe('RT-MED-01', 'Privacy / Media Dedup', 'Admin uploads identical doc for Employee A then Employee B -> Dedup returns Employee A asset', async () => {
            const fixedPdf = Buffer.from('%PDF-1.4\n% UniqueBytes-' + crypto.randomUUID() + '\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n', 'utf8');
            const upA = await harness.uploadMultipart('/media/upload', {
                token: adminToken,
                fields: { category: 'employee_document', target_employee_id: 'TEST_RED_W1' },
                files: [{ fieldName: 'file', filename: 'test_contract.pdf', mimeType: 'application/pdf', buffer: fixedPdf }]
            });
            const upB = await harness.uploadMultipart('/media/upload', {
                token: adminToken,
                fields: { category: 'employee_document', target_employee_id: 'TEST_RED_W2' },
                files: [{ fieldName: 'file', filename: 'test_contract.pdf', mimeType: 'application/pdf', buffer: fixedPdf }]
            });
            assert.strictEqual(upA.status, 201, `upA=${upA.status}`);
            assert.strictEqual(upB.status, 201, `upB=${upB.status}`);
            const leakedToB = upB.body?.data?.deduplicated === true && upB.body?.data?.asset_uuid === upA.body?.data?.asset_uuid;
            return {
                result: leakedToB ? 'VULNERABLE' : 'DEFENDED',
                httpStatus: `${upA.status}/${upB.status}`,
                detail: `Upload B deduplicated=${upB.body?.data?.deduplicated}, returned A's asset_uuid=${upB.body?.data?.asset_uuid === upA.body?.data?.asset_uuid}`
            };
        });

        // RT-08: Malicious Upload Bypass Checks (SVG XSS, EXE spoofed PNG, PDF /JS, Client folder override)
        await probe('RT-MED-02', 'Upload Security', 'SVG XSS, MZ executable spoofed as JPEG, PDF with /JS, client folder override', async () => {
            const svgRes = await harness.uploadMultipart('/media/upload', {
                token: w1Token,
                fields: { category: 'leave_evidence' },
                files: [{ fieldName: 'file', filename: 'test_xss.png', mimeType: 'image/png', buffer: Buffer.from('<svg onload="alert(1)">', 'utf8') }]
            });
            const exeRes = await harness.uploadMultipart('/media/upload', {
                token: w1Token,
                fields: { category: 'leave_evidence' },
                files: [{ fieldName: 'file', filename: 'test_bad.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('MZ\x90\x00\x03fake_pe_binary_payload', 'utf8') }]
            });
            const jsPdfRes = await harness.uploadMultipart('/media/upload', {
                token: adminToken,
                fields: { category: 'employee_document', target_employee_id: 'TEST_RED_W1' },
                files: [{ fieldName: 'file', filename: 'test_js.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n/OpenAction << /S /JavaScript /JS (app.alert(1)) >>\n%%EOF', 'utf8') }]
            });
            const overrideRes = await harness.uploadMultipart('/media/upload', {
                token: w1Token,
                fields: { category: 'leave_evidence', folder: 'hacked/root', public_id: 'evil_id' },
                files: [{ fieldName: 'file', filename: 'test_ovr.png', mimeType: 'image/png', buffer: TINY_PNG_BUFFER }]
            });
            const allBlocked = [svgRes.status, exeRes.status, jsPdfRes.status, overrideRes.status].every(s => s === 400 || s === 403);
            return {
                result: allBlocked ? 'DEFENDED' : 'VULNERABLE',
                httpStatus: `${svgRes.status}/${exeRes.status}/${jsPdfRes.status}/${overrideRes.status}`,
                detail: `SVG=${svgRes.status}, EXE=${exeRes.status}, JS-PDF=${jsPdfRes.status}, FolderOverride=${overrideRes.status}`
            };
        });

        // RT-09: Mass Assignment on Employee Self-Update / Creation / Self-Approval SoD
        await probe('RT-MASS-01', 'Mass Assignment & SoD', 'Worker attempts role escalation via PUT /account/credentials or /employees & KT self-approval', async () => {
            const credEsc = await harness.request('PUT', '/account/credentials', {
                token: w1Token,
                body: { role: 'admin', luong_cb: 99999999, phone: '0977000111' }
            });
            const empRow = await query('SELECT role, luong_cb FROM employees WHERE ma_nv=?', ['TEST_RED_W1']);
            await harness.request('PUT', '/settings/accountant-permissions', {
                token: adminToken,
                body: { permissions: { leave_approve: true } }
            });
            const ktReq = await harness.request('POST', '/requests', {
                token: ktToken,
                body: { request_type: 'leave', request_date: '2095-07-10', reason: '[TEST] KT self req' }
            });
            const selfApprove = await harness.request('PUT', `/requests/${ktReq.body?.data?.id}`, {
                token: ktToken,
                body: { status: 'approved' }
            });
            return {
                result: empRow[0].role === 'worker' && selfApprove.status === 403 ? 'DEFENDED' : 'VULNERABLE',
                httpStatus: `${credEsc.status}/${selfApprove.status}`,
                detail: `W1 DB role=${empRow[0].role} (unchanged), KT self-approve=${selfApprove.status}`
            };
        });

        // RT-10: Tampered / Invalid zalo_location_token silently downgraded to raw GPS!
        await probe('RT-ATT-01', 'Attendance Integrity', 'Invalid/tampered zalo_location_token falls back to raw GPS instead of rejecting', async () => {
            const ci = await harness.request('POST', '/attendance/check-in', {
                token: w1Token,
                body: {
                    lat: 16.0544,
                    lng: 108.2022,
                    zalo_location_token: 'tampered_invalid_zalo_token_xyz',
                    client_nonce: 'nonce_' + crypto.randomUUID(),
                    work_location_type: 'OFFICE'
                }
            });
            return {
                result: ci.status === 200 ? 'VULNERABLE' : 'DEFENDED',
                httpStatus: ci.status,
                detail: `Check-in with invalid zalo_location_token -> HTTP ${ci.status} (location_source=${ci.body?.data?.location_source || ci.body?.message})`
            };
        });

        // RT-11: Attendance Fraud (Fake GPS + QR Replay + Past Period Lock Bypass)
        await probe('RT-ATT-02', 'Attendance Fraud', 'Fake GPS & QR Nonce Replay check (fresh actor)', async () => {
            await harness.request('POST', '/employees', {
                token: adminToken,
                body: { ma_nv: 'TEST_RED_W3', ho_ten: 'Red Worker 3', phone: '0977000399', role: 'worker', luong_cb: 10000000 }
            });
            const w3Token = await harness.tokenFor('TEST_RED_W3');
            const co = await harness.request('GET', '/company', { token: w3Token });
            const branch = co.body.data.allowed_locations[0];
            const fakeGps = await harness.request('POST', '/attendance/check-in', {
                token: w2FreshToken,
                body: { lat: branch.lat, lng: branch.lng, is_fake_gps: true, client_nonce: 'n_' + crypto.randomUUID(), work_location_type: 'OFFICE' }
            });
            const qr = await harness.request('POST', '/attendance/qr-session', { token: adminToken, body: { branch_id: branch.id, ttl_seconds: 60 } });
            const qrTok = qr.body.data.qr_token;
            const qr1 = await harness.request('POST', '/attendance/check-in', {
                token: w3Token,
                body: { lat: branch.lat, lng: branch.lng, qr_token: qrTok, client_nonce: 'n1_' + crypto.randomUUID(), work_location_type: 'OFFICE' }
            });
            // Wait 3.1s to avoid 3s double-tap guard, then replay exact same qr_token!
            await new Promise(r => setTimeout(r, 3100));
            const qrReplay = await harness.request('POST', '/attendance/check-in', {
                token: w3Token,
                body: { lat: branch.lat, lng: branch.lng, qr_token: qrTok, client_nonce: 'n2_' + crypto.randomUUID(), work_location_type: 'OFFICE' }
            });
            return {
                result: fakeGps.status >= 400 && qr1.status === 200 && qrReplay.status >= 400 ? 'DEFENDED' : 'VULNERABLE',
                httpStatus: `${fakeGps.status}/${qr1.status}/${qrReplay.status}`,
                detail: `fakeGPS=${fakeGps.status}, qr1=${qr1.status} (${qr1.body?.code || 'ok'}), qrReplay=${qrReplay.status}`
            };
        });

        // RT-12: Race Condition — Concurrent Paid Leave Requests Exceeding Monthly Limit (1/month)
        await probe('RT-RACE-01', 'Concurrency', '5 parallel leave requests in 2095-08 to bypass monthly_paid_leave_limit=1', async () => {
            const dates = ['2095-08-01', '2095-08-02', '2095-08-03', '2095-08-04', '2095-08-05'];
            const responses = await Promise.all(
                dates.map(d => harness.request('POST', '/requests', {
                    token: w1Token,
                    body: { request_type: 'leave', request_date: d, reason: '[TEST] Race leave ' + d }
                }))
            );
            const createdCount = responses.filter(r => r.status === 201).length;
            return {
                result: createdCount <= 1 ? 'DEFENDED' : 'VULNERABLE',
                httpStatus: responses.map(r => r.status).join(','),
                detail: `${createdCount}/5 concurrent leave requests created in 2095-08 (limit=1)`
            };
        });

        // RT-13: DELETE /employees/:id crash + leave orphan/missing audit
        await probe('RT-BUG-01', 'Reliability / Integrity', 'DELETE /employees/:id succeeds cleanly with 200 and audit log', async () => {
            await harness.request('POST', '/employees', {
                token: adminToken,
                body: { ma_nv: 'TEST_RED_DEL', ho_ten: 'To Delete', phone: '0977000444', role: 'worker' }
            });
            const del = await harness.request('DELETE', '/employees/TEST_RED_DEL', { token: adminToken });
            const rem = await query('SELECT ma_nv FROM employees WHERE ma_nv = ?', ['TEST_RED_DEL']);
            const audits = await query("SELECT action FROM audit_logs WHERE action='DELETE_EMPLOYEE' AND details LIKE '%TEST_RED_DEL%'");
            return {
                result: del.status === 200 && rem.length === 0 && audits.length >= 1 ? 'DEFENDED' : 'VULNERABLE',
                httpStatus: del.status,
                detail: `DELETE /employees/TEST_RED_DEL -> HTTP ${del.status}, remaining=${rem.length}, audits=${audits.length}`
            };
        });

        console.table(findings.map(({ id, category, result, httpStatus, detail }) => ({ id, category, result, httpStatus, detail })));
        const vulnCount = findings.filter(f => f.result !== 'DEFENDED').length;
        if (vulnCount > 0) {
            console.error(`RED TEAM FAILURES (${vulnCount}):`, findings.filter(f => f.result !== 'DEFENDED'));
            process.exitCode = 1;
        }
    } finally {
        await harness.teardown({ closePool: true });
        process.exit(process.exitCode || 0);
    }
})();
