/**
 * Shared test utilities for SEDINCO HR backend & contract test suites.
 * Enforces strict NODE_ENV=test isolation against local sedinco_hr_test.
 */
process.env.NODE_ENV = 'test';

const http = require('http');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');
const { initDatabase } = require('../src/database/initDb');
const { invalidatePermissionCache } = require('../src/middlewares/authMiddleware');

/**
 * Starts an ephemeral HTTP server wrapping the Express app on 127.0.0.1.
 */
async function startTestServer() {
    await initDatabase();
    return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            resolve({
                server,
                baseUrl: `http://127.0.0.1:${addr.port}`,
                close: () => new Promise((resClose) => server.close(() => resClose()))
            });
        });
    });
}

/**
 * Performs an HTTP JSON/Text request against the ephemeral test server.
 */
async function apiRequest(baseUrl, method, path, { token, body, headers = {} } = {}) {
    const reqHeaders = { ...headers };
    if (token) reqHeaders.Authorization = `Bearer ${token}`;
    if (body !== undefined && !reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: reqHeaders,
        body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    });
    const raw = await res.text();
    let json = null;
    try {
        json = JSON.parse(raw);
    } catch {
        // Non-JSON payload (e.g. CSV export)
    }
    return { status: res.status, headers: res.headers, raw, json };
}

/**
 * Signs a custom HMAC-SHA256 JWT token using test secret (for expiry / claim tests).
 */
function signCustomJwt(payload, secret = process.env.JWT_SECRET || 'sedinco-secret-key-test-environment-min-32-chars!') {
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
    return `${h}.${b}.${sig}`;
}

/**
 * Seeds isolated QA users (`QA_TEST_*`) without mutating seeded core accounts.
 */
async function createQaEmployee({
    ma_nv,
    ho_ten = 'QA Nhân Sự',
    role = 'worker',
    password = 'QaPass@2026!',
    chuc_danh = 'Công nhân công trình',
    department = 'Khối Công trình',
    luong_cb = 10400000,
    ngay_chinh_thuc = '2024-01-01',
    has_insurance = 1,
    annual_leave_quota = 12,
    status = 'active',
    is_locked = 0,
    shift_type = 'FULL_DAY',
    must_change_password = 0
}) {
    const pwHash = bcrypt.hashSync(password, 10);
    await query(
        `INSERT INTO employees (
            ma_nv, ho_ten, chuc_danh, department, ngay_bat_dau_lam, ngay_chinh_thuc,
            password, must_change_password, luong_cb, has_insurance, status, is_locked,
            role, annual_leave_quota, shift_type
        ) VALUES (?, ?, ?, ?, '2023-01-01', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            ho_ten = VALUES(ho_ten),
            password = VALUES(password),
            role = VALUES(role),
            status = VALUES(status),
            is_locked = VALUES(is_locked),
            must_change_password = VALUES(must_change_password),
            luong_cb = VALUES(luong_cb),
            annual_leave_quota = VALUES(annual_leave_quota),
            shift_type = VALUES(shift_type),
            zalo_id = NULL,
            zalo_user_id = NULL,
            pending_device_id = NULL,
            bound_device_id = NULL`,
        [ma_nv, ho_ten, chuc_danh, department, ngay_chinh_thuc, pwHash, must_change_password, luong_cb, has_insurance, status, is_locked, role, annual_leave_quota, shift_type]
    );
}

/**
 * Cleans all synthetic QA_* test data and test period year records safely.
 */
async function cleanupQaData(prefix = 'QA_', testYear = 2099) {
    const likePattern = `${prefix}%`;
    await query('DELETE FROM attendance_logs WHERE employee_id LIKE ? OR YEAR(record_date) = ?', [likePattern, testYear]).catch(() => {});
    await query('DELETE FROM attendance WHERE ma_nv LIKE ? OR nam = ?', [likePattern, testYear]).catch(() => {});
    await query('DELETE FROM requests WHERE employee_id LIKE ? OR YEAR(request_date) = ?', [likePattern, testYear]).catch(() => {});
    await query('DELETE FROM ot_registrations WHERE employee_id LIKE ? OR YEAR(work_date) = ?', [likePattern, testYear]).catch(() => {});
    await query('DELETE FROM period_locks WHERE year = ?', [testYear]).catch(() => {});
    await query('DELETE FROM public_holidays WHERE holiday_name LIKE ?', [likePattern]).catch(() => {});
    await query('DELETE FROM audit_logs WHERE actor_id LIKE ? OR details LIKE ?', [likePattern, `%${prefix}%`]).catch(() => {});
    await query('DELETE FROM login_rate_limits WHERE identifier LIKE ? OR key_name LIKE ?', [likePattern, `%${prefix}%`]).catch(() => {});
    await query('DELETE FROM idempotency_keys WHERE actor_id LIKE ?', [likePattern]).catch(() => {});
    await query('DELETE FROM employees WHERE ma_nv LIKE ?', [likePattern]).catch(() => {});
    await query('DELETE FROM admins WHERE username LIKE ?', [likePattern]).catch(() => {});
    invalidatePermissionCache();
}

/**
 * Captures and restores company_settings + accountant_permissions snapshots around tests.
 */
async function snapshotSettings() {
    const [cs] = await query('SELECT * FROM company_settings LIMIT 1');
    const perms = await query('SELECT permission_key, is_enabled FROM accountant_permissions');
    return { companySettings: cs || null, permissions: perms || [] };
}

async function restoreSettings(snapshot) {
    if (!snapshot) return;
    if (snapshot.companySettings) {
        const s = snapshot.companySettings;
        await query(
            `UPDATE company_settings SET
                company_name=?, phone=?, address=?, tax_code=?, work_start=?, work_end=?,
                lunch_start=?, lunch_end=?, grace_period_minutes=?, penalty_per_minute=?,
                penalty_fixed_block=?, penalty_salary_percent=?, latitude=?, longitude=?,
                radius_meters=?, standard_work_days=?, probation_salary_percent=?,
                ot_rate_weekday=?, ot_rate_weekend=?, ot_rate_holiday=?, custom_ot_hourly_rate=?,
                insurance_rate=?, log_retention_days=?, allowed_locations=?, office_ip_whitelist=?,
                late_policy_type=?, free_late_occurrences=?, late_penalty_per_minute=?,
                late_penalty_amount=?, max_late_minutes_for_half_day=?
             WHERE id = ?`,
            [
                s.company_name, s.phone, s.address, s.tax_code, s.work_start, s.work_end,
                s.lunch_start, s.lunch_end, s.grace_period_minutes, s.penalty_per_minute,
                s.penalty_fixed_block, s.penalty_salary_percent, s.latitude, s.longitude,
                s.radius_meters, s.standard_work_days, s.probation_salary_percent,
                s.ot_rate_weekday, s.ot_rate_weekend, s.ot_rate_holiday, s.custom_ot_hourly_rate,
                s.insurance_rate, s.log_retention_days, s.allowed_locations, s.office_ip_whitelist,
                s.late_policy_type, s.free_late_occurrences, s.late_penalty_per_minute,
                s.late_penalty_amount, s.max_late_minutes_for_half_day, s.id
            ]
        ).catch(() => {});
    }
    if (Array.isArray(snapshot.permissions)) {
        for (const p of snapshot.permissions) {
            await query('UPDATE accountant_permissions SET is_enabled = ? WHERE permission_key = ?', [p.is_enabled ? 1 : 0, p.permission_key]).catch(() => {});
        }
    }
    invalidatePermissionCache();
}

/**
 * Recursively walks Express router middleware stacks to extract mounted route entries.
 */
function listExpressRoutes(appInstance) {
    const routes = [];
    const rootStack = (appInstance.router && appInstance.router.stack) || (appInstance._router && appInstance._router.stack) || [];

    function extractMountPrefix(layer) {
        if (layer.path && layer.path !== '/') return layer.path;
        if (Array.isArray(layer.matchers) && layer.matchers.length > 0) {
            const probes = [
                '/api', '/attendance', '/payroll', '/requests', '/employees',
                '/company', '/holidays', '/settings', '/permissions',
                '/diagnostics', '/client-errors', '/auth', '/admin'
            ];
            for (const p of probes) {
                try {
                    const m = layer.matchers[0](p);
                    if (m && m.path) return m.path;
                } catch { /* ignore */ }
            }
        }
        return '';
    }

    function walk(stack, prefix = '') {
        for (const layer of stack) {
            if (layer.route && layer.route.path) {
                const subPaths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
                const methods = Object.keys(layer.route.methods || {}).filter((m) => layer.route.methods[m]).map((m) => m.toUpperCase());
                for (const sp of subPaths) {
                    const full = `${prefix}${sp === '/' ? '' : sp}` || '/';
                    for (const method of methods) {
                        routes.push({ method, path: full.replace(/\/+/g, '/') });
                    }
                }
            } else if (layer.name === 'router' && layer.handle && Array.isArray(layer.handle.stack)) {
                const subPrefix = extractMountPrefix(layer);
                walk(layer.handle.stack, `${prefix}${subPrefix}`);
            }
        }
    }

    walk(rootStack, '');
    return routes;
}

module.exports = {
    app,
    query,
    pool,
    startTestServer,
    apiRequest,
    signCustomJwt,
    createQaEmployee,
    cleanupQaData,
    snapshotSettings,
    restoreSettings,
    listExpressRoutes
};
