/**
 * Safe Isolated Test Harness (NODE_ENV=test ONLY)
 * Targets local MySQL `sedinco_hr_test` on 127.0.0.1 and an ephemeral local HTTP server.
 * Snapshots & cleans up test data so seed baseline remains intact.
 */
process.env.NODE_ENV = 'test';

const path = require('path');
const http = require('http');
const assert = require('assert');
const crypto = require('crypto');

const backendRoot = path.resolve(__dirname, '../../sedinco_backend');
const env = require(path.join(backendRoot, 'src/config/env'));
const { query, pool, dbConfig } = require(path.join(backendRoot, 'src/config/db'));
const { initDatabase } = require(path.join(backendRoot, 'src/database/initDb'));
const app = require(path.join(backendRoot, 'src/app'));
const authMiddleware = require(path.join(backendRoot, 'src/middlewares/authMiddleware'));
const cloudinaryService = require(path.join(backendRoot, 'src/services/cloudinaryService'));
const cloudinaryUsageMonitor = require(path.join(backendRoot, 'src/services/cloudinaryUsageMonitor'));
const authService = require(path.join(backendRoot, 'src/services/authService'));

function assertSafeTestEnv() {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error(`ABORT: NODE_ENV must be 'test', got '${process.env.NODE_ENV}'`);
    }
    if (!dbConfig || dbConfig.host !== '127.0.0.1' || !String(dbConfig.database).includes('test')) {
        throw new Error(`ABORT: Unsafe DB target ${dbConfig?.host}/${dbConfig?.database}`);
    }
}

// Valid minimal 1x1 PNG (68 bytes)
const TINY_PNG_BUFFER = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
);

// Valid minimal JPEG (SOI + SOF0 1x1 + EOI)
const TINY_JPEG_BUFFER = Buffer.from(
    'ffd8ffe000104a46494600010101004800480000ffc0000b080001000101011100ffda0008010100003f00ffd9',
    'hex'
);

// Valid minimal PDF
const TINY_PDF_BUFFER = Buffer.from(
    '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
    'utf8'
);

function createMockCloudinaryAdapter() {
    const remoteStore = new Map();
    const calls = { uploads: [], deletes: [] };

    const adapter = {
        remoteStore,
        calls,
        async uploadStream(buffer, options = {}) {
            const publicId = options.public_id || `sedinco-hr/mock/${crypto.randomUUID()}`;
            const version = Math.floor(Date.now() / 1000);
            const fmt = options.format || (options.resource_type === 'raw' ? 'pdf' : 'png');
            const record = {
                public_id: publicId,
                asset_id: `mock_asset_${crypto.randomBytes(6).toString('hex')}`,
                secure_url: `https://res.cloudinary.com/sedinco-test/${options.resource_type || 'image'}/${options.type || 'authenticated'}/v${version}/${publicId}.${fmt}`,
                bytes: buffer.length,
                width: 100,
                height: 100,
                format: fmt,
                resource_type: options.resource_type || 'image',
                type: options.type || 'authenticated',
                asset_folder: options.asset_folder || options.folder || 'sedinco-hr/mock'
            };
            remoteStore.set(publicId, record);
            calls.uploads.push({ public_id: publicId, type: record.type, bytes: record.bytes, folder: record.asset_folder });
            return record;
        },
        async destroy(publicId, options = {}) {
            const existed = remoteStore.delete(publicId);
            calls.deletes.push({ public_id: publicId, existed, options });
            return { result: existed ? 'ok' : 'not found' };
        }
    };
    return adapter;
}

class TestHarness {
    constructor() {
        this.server = null;
        this.baseUrl = '';
        this.snapshots = null;
        this.mockCloudinary = null;
    }

    async setup({ withMockCloudinary = true } = {}) {
        assertSafeTestEnv();
        await initDatabase();

        this.snapshots = {
            company_settings: (await query('SELECT * FROM company_settings LIMIT 1'))[0] || null,
            accountant_permissions: await query('SELECT permission_key, is_enabled FROM accountant_permissions'),
            departments: await query('SELECT * FROM departments ORDER BY id'),
            employees: await query('SELECT ma_nv, status, is_locked, role, department, luong_cb, avatar_url, bound_device_id, known_devices_json, multi_device_alert, zalo_user_id, shift_type, annual_leave_quota, theme_preference, font_scale, bank_code, bank_account_number, bank_account_name, custom_allowances FROM employees')
        };

        if (withMockCloudinary) {
            this.mockCloudinary = createMockCloudinaryAdapter();
            cloudinaryService.setTransportAdapter(this.mockCloudinary);
            cloudinaryUsageMonitor.setUsageApiFetcher(async () => ({
                plan: 'Free',
                storage: { usage: 102400, limit: 26843545600 },
                bandwidth: { usage: 204800, limit: 26843545600 },
                transformations: { usage: 10, limit: 25000 },
                objects: { usage: this.mockCloudinary.remoteStore.size },
                credits: { usage: 0.1, limit: 25 }
            }));
        }

        await new Promise((resolve) => {
            this.server = http.createServer(app);
            this.server.listen(0, '127.0.0.1', () => {
                const addr = this.server.address();
                this.baseUrl = `http://127.0.0.1:${addr.port}/api`;
                resolve();
            });
        });
        return this;
    }

    async cleanupData() {
        assertSafeTestEnv();
        // Remove synthetic / future test artifacts created during test execution
        await query("DELETE FROM employees WHERE ma_nv LIKE 'TEST_%' OR ma_nv LIKE 'EMP_T%'").catch(() => {});
        await query("DELETE FROM admins WHERE username LIKE 'test_admin_%'").catch(() => {});
        await query("DELETE FROM departments WHERE name LIKE 'TEST_DEPT_%'").catch(() => {});
        await query("DELETE FROM public_holidays WHERE holiday_name LIKE 'TEST_HOL_%'").catch(() => {});
        await query("DELETE FROM attendance_logs WHERE employee_id LIKE 'TEST_%' OR record_date >= '2090-01-01'").catch(() => {});
        await query("DELETE FROM user_device_logs WHERE employee_id LIKE 'TEST_%'").catch(() => {});
        await query("DELETE FROM attendance WHERE ma_nv LIKE 'TEST_%' OR nam >= 2090").catch(() => {});
        await query("DELETE FROM requests WHERE employee_id LIKE 'TEST_%' OR request_date >= '2090-01-01' OR reason LIKE '[TEST]%'").catch(() => {});
        await query("DELETE FROM ot_registrations WHERE employee_id LIKE 'TEST_%' OR work_date >= '2090-01-01' OR reason LIKE '[TEST]%'").catch(() => {});
        await query("DELETE FROM period_locks WHERE year >= 2090").catch(() => {});
        await query("DELETE FROM payroll_periods WHERE year >= 2090").catch(() => {});
        await query("DELETE FROM user_notifications WHERE recipient_ma_nv LIKE 'TEST_%' OR ref_year >= 2090 OR title LIKE '[TEST]%'").catch(() => {});
        await query("DELETE FROM media_assets WHERE uploaded_by LIKE 'TEST_%' OR employee_id LIKE 'TEST_%' OR original_filename LIKE 'test_%'").catch(() => {});
        await query("DELETE FROM media_upload_events WHERE actor_id LIKE 'TEST_%' OR details LIKE '%[TEST]%'").catch(() => {});
        await query("DELETE FROM login_rate_limits WHERE identifier LIKE 'TEST_%' OR identifier LIKE 'attack_%' OR key_name LIKE '%198.51.100.%'").catch(() => {});
        await query("DELETE FROM idempotency_keys WHERE actor_id LIKE 'TEST_%' OR actor_id = 'test_actor'").catch(() => {});
        await query("DELETE FROM audit_logs WHERE actor_id LIKE 'TEST_%' OR details LIKE '%TEST_%' OR details LIKE '%2090%'").catch(() => {});

        if (this.snapshots) {
            for (const p of this.snapshots.accountant_permissions) {
                await query('UPDATE accountant_permissions SET is_enabled = ? WHERE permission_key = ?', [p.is_enabled ? 1 : 0, p.permission_key]).catch(() => {});
            }
            authMiddleware.invalidatePermissionCache();

            const cs = this.snapshots.company_settings;
            if (cs) {
                await query(
                    `UPDATE company_settings SET company_name=?, phone=?, address=?, latitude=?, longitude=?, radius_meters=?, allowed_locations=?, office_ip_whitelist=?, ot_calculation_mode=?, late_policy_type=?, monthly_paid_leave_limit=?, announcement_text=? WHERE id=?`,
                    [cs.company_name, cs.phone, cs.address, cs.latitude, cs.longitude, cs.radius_meters, cs.allowed_locations, cs.office_ip_whitelist, cs.ot_calculation_mode, cs.late_policy_type, cs.monthly_paid_leave_limit, cs.announcement_text, cs.id]
                ).catch(() => {});
            }

            for (const emp of this.snapshots.employees) {
                await query(
                    `UPDATE employees SET status=?, is_locked=?, role=?, department=?, luong_cb=?, avatar_url=?, bound_device_id=?, known_devices_json=?, multi_device_alert=?, zalo_user_id=?, shift_type=?, annual_leave_quota=?, theme_preference=?, font_scale=?, bank_code=?, bank_account_number=?, bank_account_name=?, custom_allowances=? WHERE ma_nv=?`,
                    [emp.status, emp.is_locked, emp.role, emp.department, emp.luong_cb, emp.avatar_url, emp.bound_device_id, emp.known_devices_json, emp.multi_device_alert, emp.zalo_user_id, emp.shift_type, emp.annual_leave_quota, emp.theme_preference, emp.font_scale, emp.bank_code, emp.bank_account_number, emp.bank_account_name, emp.custom_allowances, emp.ma_nv]
                ).catch(() => {});
            }
            authMiddleware.invalidateUserCache();
        }
        await authService.resetRateLimitState().catch(() => {});
    }

    async teardown({ closePool = true } = {}) {
        try {
            await this.cleanupData();
        } finally {
            cloudinaryService.setTransportAdapter(null);
            cloudinaryUsageMonitor.setUsageApiFetcher(null);
            if (this.server) {
                await new Promise((resolve) => this.server.close(() => resolve()));
                this.server = null;
            }
            if (closePool) {
                await new Promise((resolve) => pool.end(() => resolve()));
            }
        }
    }

    async tokenFor(identifier) {
        if (identifier === 'admin') {
            const rows = await query('SELECT id, username, ho_ten, COALESCE(token_version, 1) AS token_version FROM admins WHERE username = ? LIMIT 1', ['admin']);
            const adm = rows[0];
            assert(adm, 'Admin seed user not found');
            return authMiddleware.generateToken({
                id: adm.id,
                username: adm.username,
                ho_ten: adm.ho_ten,
                role: 'admin',
                token_version: adm.token_version
            });
        }
        const rows = await query('SELECT ma_nv, ho_ten, role, status, is_locked, COALESCE(token_version, 1) AS token_version FROM employees WHERE ma_nv = ? LIMIT 1', [identifier]);
        const emp = rows[0];
        assert(emp, `Employee ${identifier} not found`);
        return authMiddleware.generateToken({
            id: emp.ma_nv,
            ma_nv: emp.ma_nv,
            ho_ten: emp.ho_ten,
            role: emp.role || 'worker',
            token_version: emp.token_version
        });
    }

    async request(method, apiPath, { token = null, body = undefined, headers = {}, rawBody = null, timeoutMs = 15000 } = {}) {
        const url = `${this.baseUrl}${apiPath.startsWith('/') ? apiPath : '/' + apiPath}`;
        const reqHeaders = { ...headers };
        if (token) reqHeaders['Authorization'] = `Bearer ${token}`;

        let finalBody = rawBody;
        if (finalBody === null && body !== undefined) {
            reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
            finalBody = JSON.stringify(body);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                method,
                headers: reqHeaders,
                body: finalBody,
                signal: controller.signal
            });
            const ct = res.headers.get('content-type') || '';
            let parsed = null;
            let rawText = null;
            let rawBuffer = null;
            if (ct.includes('application/json')) {
                rawText = await res.text();
                try { parsed = JSON.parse(rawText); } catch { parsed = null; }
            } else {
                rawBuffer = Buffer.from(await res.arrayBuffer());
                rawText = rawBuffer.toString('utf8');
            }
            return {
                status: res.status,
                headers: Object.fromEntries(res.headers.entries()),
                body: parsed,
                text: rawText,
                buffer: rawBuffer
            };
        } finally {
            clearTimeout(timer);
        }
    }

    async uploadMultipart(apiPath, { token, fields = {}, files = [], headers = {} }) {
        const boundary = `----SedincoTestBoundary${crypto.randomBytes(8).toString('hex')}`;
        const chunks = [];
        for (const [k, v] of Object.entries(fields)) {
            if (v === undefined || v === null) continue;
            chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${String(v)}\r\n`));
        }
        for (const f of files) {
            chunks.push(Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="${f.fieldName || 'file'}"; filename="${f.filename || 'test_file.png'}"\r\nContent-Type: ${f.mimeType || 'image/png'}\r\n\r\n`
            ));
            chunks.push(f.buffer);
            chunks.push(Buffer.from('\r\n'));
        }
        chunks.push(Buffer.from(`--${boundary}--\r\n`));
        const rawBody = Buffer.concat(chunks);
        return this.request('POST', apiPath, {
            token,
            rawBody,
            headers: {
                ...headers,
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            }
        });
    }
}

module.exports = {
    TestHarness,
    TINY_PNG_BUFFER,
    TINY_JPEG_BUFFER,
    TINY_PDF_BUFFER,
    query,
    pool,
    backendRoot
};
