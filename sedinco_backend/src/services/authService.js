const { query } = require('../config/db');
const { sanitizeBankCardInput } = require('../utils/bankValidator');
const { sanitizeAvatarInput } = require('../utils/avatarValidator');
const {
    sanitizeUserResponse,
    resolveUserRole,
    generateToken,
    logAuditEvent,
    getAccountantPermissions,
    invalidateUserCache,
    SAFE_EMPLOYEE_FIELDS
} = require('../middlewares/authMiddleware');
const {
    recordEmployeeDeviceActivity,
    sanitizeSingleDeviceModelName,
    safeParseKnownDevices
} = require('../utils/deviceIdentityHelper');

function attachDbDeviceState(safeTarget, rawEmp, isPureAdmin) {
    if (!safeTarget) return safeTarget;
    if (isPureAdmin) {
        safeTarget.bound_device_id = null;
        safeTarget.bound_device_name = null;
        safeTarget.current_device = null;
        safeTarget.known_devices = [];
        safeTarget.device_history = [];
        safeTarget.multi_device_alert = false;
        safeTarget.device_binding_enforced = false;
        safeTarget.pending_device_id = null;
        safeTarget.pending_device_name = null;
        return safeTarget;
    }
    const deviceHistory = safeParseKnownDevices(rawEmp?.known_devices_json);
    const dbBoundName = rawEmp?.bound_device_name
        ? sanitizeSingleDeviceModelName(rawEmp.bound_device_name)
        : null;
    const latestHistName = deviceHistory.length > 0 && deviceHistory[deviceHistory.length - 1]?.device_name
        ? sanitizeSingleDeviceModelName(deviceHistory[deviceHistory.length - 1].device_name)
        : null;
    safeTarget.bound_device_name = dbBoundName;
    safeTarget.device_history = deviceHistory;
    safeTarget.current_device = dbBoundName || latestHistName || null;
    return safeTarget;
}
const {
    hashPassword,
    comparePassword,
    comparePasswordAsync,
    isBcryptHash,
    isDefaultPassword,
    validatePasswordPolicy
} = require('../utils/passwordHelper');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rate Limiter In-Memory (B1 — Chống DoS + Brute-force)
//
// THIẾT KẾ:
//   - Khóa theo khóa COMPOSITE: "ma_nv:IP" → kẻ tấn công từ IP khác
//     không thể khóa tài khoản của người dùng hợp lệ từ IP của họ.
//   - IP rộng (ipAttempts): bắt brute-force hàng loạt từ cùng một nguồn.
//
// HẠN CHẾ CẦN GHI NHẬN:
//   - Trạng thái khóa nằm trong RAM (Map). Mất khi tiến trình khởi động lại.
//   - KHÔNG chia sẻ giữa nhiều tiến trình (PM2 cluster workers).
//   → Kế hoạch nâng cấp: chuyển sang Redis/DB nếu triển khai multi-process.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rate Limiter MySQL Dùng Chung (B2 — Chống DoS + Brute-force Đa Tiến Trình)
//
// THIẾT KẾ:
//   - Khóa theo COMPOSITE: "composite:ma_nv:IP" → kẻ tấn công từ IP khác
//     không thể khóa tài khoản của người dùng hợp lệ từ IP của họ.
//   - Bộ đếm toàn cục TÀI KHOẢN: "account:ma_nv" → soft-lock tăng độ trễ
//     khi phát hiện tấn công phân tán từ nhiều IP (>= 10 lần), chặn cứng (>= 30 lần).
//   - IP rộng: "ip:IP" → CHỈ ĐẾM LẦN THẤT BẠI, đăng nhập thành công KHÔNG tăng bộ đếm,
//     cho phép hàng trăm công nhân cùng một địa chỉ IP NAT công ty đăng nhập bình thường.
//   - Trạng thái lưu trong bảng `login_rate_limits` của MySQL, tự động chia sẻ
//     giữa mọi tiến trình Node.js (cluster/PM2).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const ACCOUNT_MAX_ATTEMPTS = 5;            // Số lần sai tối đa mỗi (tài khoản, IP)
const ACCOUNT_LOCKOUT_MS = 15 * 60 * 1000; // 15 phút
const ACCOUNT_LOCKOUT_SEC = 15 * 60;
const ACCOUNT_SOFT_LOCK_THRESHOLD = 10;    // Bắt đầu áp dụng soft-lock độ trễ
const ACCOUNT_GLOBAL_MAX_ATTEMPTS = 30;    // Ngưỡng chặn cứng toàn cục
const IP_MAX_ATTEMPTS = 50;                // Số lần thất bại tối đa mỗi IP
const IP_LOCKOUT_MS = 15 * 60 * 1000;
const IP_LOCKOUT_SEC = 15 * 60;

const net = require('net');
const VALID_FONT_SCALES = [100, 110, 125, 150, 175, 200];

function normalizeFontScale(val) {
    const n = Number(val);
    return VALID_FONT_SCALES.includes(n) ? n : 100;
}

// Bộ nhớ đệm fallback và mock
const accountAttempts = new Map();
const ipAttempts = new Map();

// Thông báo lỗi đăng nhập chung chung — chống User Enumeration
const GENERIC_LOGIN_ERROR = 'Thông tin đăng nhập không hợp lệ!';

function expandIpv6(ip) {
    if (net.isIP(ip) !== 6) return null;
    let [main, v4] = ip.includes('.') ? [ip.substring(0, ip.lastIndexOf(':')), ip.substring(ip.lastIndexOf(':') + 1)] : [ip, null];
    let parts = main.split('::');
    let left = parts[0] ? parts[0].split(':').filter(Boolean) : [];
    let right = parts[1] ? parts[1].split(':').filter(Boolean) : [];
    let totalNeeded = 8 - (v4 ? 2 : 0);
    let middle = new Array(Math.max(0, totalNeeded - (left.length + right.length))).fill('0');
    let full = [...left, ...middle, ...right];
    if (v4) {
        let v4Nums = v4.split('.').map(Number);
        full.push(((v4Nums[0] << 8) + v4Nums[1]).toString(16));
        full.push(((v4Nums[2] << 8) + v4Nums[3]).toString(16));
    }
    return full.map(p => p.padStart(4, '0').toLowerCase());
}

function normalizeClientIp(ip_address) {
    if (!ip_address) return 'unknown';
    // Chuẩn hóa chuỗi IP: nếu có danh sách IP phân tách bởi dấu phẩy, lấy phần tử cuối (client IP do proxy thêm)
    const raw = String(ip_address).trim();
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    const candidate = parts.length > 0 ? parts[parts.length - 1] : raw;
    // Bỏ tiền tố IPv6-mapped IPv4 nếu có (::ffff:127.0.0.1 -> 127.0.0.1)
    const stripped = candidate.replace(/^::ffff:/i, '');

    // Nếu là IPv4 chuẩn
    if (net.isIP(stripped) === 4) {
        return stripped;
    }

    // Nếu là IPv6 chuẩn: chuẩn hóa về subnet prefix /64 (cấu hình qua biến môi trường IPV6_SUBNET_MASK)
    if (net.isIP(stripped) === 6) {
        const prefixLen = Number(process.env.IPV6_SUBNET_MASK) || 64;
        const full = expandIpv6(stripped);
        if (full) {
            const words = Math.min(8, Math.max(1, Math.floor(prefixLen / 16)));
            const prefixWords = full.slice(0, words).map(w => parseInt(w, 16).toString(16));
            return `${prefixWords.join(':')}::/${prefixLen}`;
        }
    }

    return stripped;
}

/**
 * Tạo khóa composite "tài khoản:IP"
 */
function makeAccountKey(ma_nv, ip_address) {
    const normalizedIp = normalizeClientIp(ip_address);
    return `composite:${ma_nv}:${normalizedIp}`;
}

async function checkRateLimitDb(keyName, maxAttempts, lockoutSec = 900) {
    const rows = await query(
        `SELECT attempt_count, locked_until, TIMESTAMPDIFF(SECOND, first_attempt, NOW()) as age_sec
         FROM login_rate_limits WHERE key_name = ? LIMIT 1`,
        [keyName]
    );

    if (!rows || rows.length === 0) {
        return { blocked: false, count: 0 };
    }

    const rec = rows[0];
    if (rec.locked_until) {
        const lockedUntilTime = new Date(rec.locked_until).getTime();
        const now = Date.now();
        if (now < lockedUntilTime) {
            const remainSec = Math.ceil((lockedUntilTime - now) / 1000);
            return { blocked: true, remainSec, count: rec.attempt_count };
        }
        await query('DELETE FROM login_rate_limits WHERE key_name = ?', [keyName]).catch(() => {});
        return { blocked: false, count: 0 };
    }

    if (rec.age_sec > lockoutSec) {
        await query('DELETE FROM login_rate_limits WHERE key_name = ?', [keyName]).catch(() => {});
        return { blocked: false, count: 0 };
    }

    return { blocked: false, count: rec.attempt_count };
}

async function recordFailedAttemptDb(keyName, targetType, identifier, maxAttempts, lockoutSec = 900) {
    const sql = `
        INSERT INTO login_rate_limits (key_name, target_type, identifier, attempt_count, first_attempt, last_attempt, locked_until)
        VALUES (?, ?, ?, 1, NOW(), NOW(), NULL)
        ON DUPLICATE KEY UPDATE 
            attempt_count = attempt_count + 1,
            last_attempt = NOW(),
            locked_until = CASE 
                WHEN attempt_count >= ? THEN DATE_ADD(NOW(), INTERVAL ? SECOND)
                ELSE locked_until 
            END
    `;
    await query(sql, [keyName, targetType, identifier, maxAttempts, lockoutSec]);
}

async function resetCompositeAttemptsDb(keyName) {
    await query('DELETE FROM login_rate_limits WHERE key_name = ?', [keyName]).catch(() => {});
}

async function isKnownLegitIp(ma_nv, normalizedIp) {
    if (!normalizedIp || normalizedIp === 'unknown') return false;
    const knownKey = `known:${ma_nv}:${normalizedIp}`;
    const rows = await query("SELECT 1 FROM login_rate_limits WHERE key_name = ? LIMIT 1", [knownKey]).catch(() => []);
    if (rows && rows.length > 0) return true;
    const auditRows = await query(
        "SELECT 1 FROM audit_logs WHERE actor_id = ? AND ip_address = ? AND action = 'LOGIN_SUCCESS' LIMIT 1",
        [ma_nv, normalizedIp]
    ).catch(() => []);
    return Boolean(auditRows && auditRows.length > 0);
}

async function recordKnownLegitIp(ma_nv, normalizedIp) {
    if (!normalizedIp || normalizedIp === 'unknown') return;
    const knownKey = `known:${ma_nv}:${normalizedIp}`;
    await query(`
        INSERT INTO login_rate_limits (key_name, target_type, identifier, attempt_count, first_attempt, last_attempt, locked_until)
        VALUES (?, 'known_ip', ?, 0, NOW(), NOW(), NULL)
        ON DUPLICATE KEY UPDATE last_attempt = NOW()
    `, [knownKey, ma_nv]).catch(() => {});
}

async function resetRateLimitState() {
    accountAttempts.clear();
    ipAttempts.clear();
    await query('DELETE FROM login_rate_limits').catch(() => {});
}

class AuthService {
    async _checkLoginRateLimits(identifier, normalizedIp, actorRole = 'unknown', { skipDelay = false } = {}) {
        const compositeKey = `composite:${identifier}:${normalizedIp}`;
        const acctKey = `account:${identifier}`;
        const ipKey = `ip:${normalizedIp}`;

        // 1. Kiểm tra khóa Composite (TÀI KHOẢN, IP) — Chống DoS Lockout & Chống Brute-force tại IP NAT
        const acctCheck = await checkRateLimitDb(compositeKey, ACCOUNT_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);
        if (acctCheck.blocked) {
            await logAuditEvent({
                actor_id: identifier,
                actor_role: actorRole,
                action: 'LOGIN_RATE_LIMITED',
                resource: 'auth',
                details: { reason: 'account_ip_locked', remain_seconds: acctCheck.remainSec, ip: normalizedIp },
                ip_address: normalizedIp
            });
            return {
                success: false,
                statusCode: 429,
                message: `Tài khoản đã bị tạm khóa đăng nhập do nhập sai quá ${ACCOUNT_MAX_ATTEMPTS} lần. Vui lòng thử lại sau ${acctCheck.remainSec} giây!`
            };
        }

        // 2. Kiểm tra khóa IP rộng (Chỉ tính số lần THẤT BẠI)
        if (normalizedIp && normalizedIp !== 'unknown') {
            const ipCheck = await checkRateLimitDb(ipKey, IP_MAX_ATTEMPTS, IP_LOCKOUT_SEC);
            if (ipCheck.blocked) {
                return {
                    success: false,
                    statusCode: 429,
                    message: `Quá nhiều yêu cầu đăng nhập từ địa chỉ IP này. Vui lòng thử lại sau ${ipCheck.remainSec} giây!`
                };
            }
        }

        // 3. Kiểm tra IP quen thuộc & bảo vệ toàn cục tài khoản (Tấn công phân tán nhiều IP)
        const isKnownIp = await isKnownLegitIp(identifier, normalizedIp);
        const globalAcctCheck = await checkRateLimitDb(acctKey, ACCOUNT_GLOBAL_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);
        if (globalAcctCheck.blocked) {
            await logAuditEvent({
                actor_id: identifier,
                actor_role: actorRole,
                action: 'LOGIN_RATE_LIMITED',
                resource: 'auth',
                details: { reason: 'global_account_locked', total_attempts: globalAcctCheck.count, remain_seconds: globalAcctCheck.remainSec, ip: normalizedIp },
                ip_address: normalizedIp
            });
            return {
                success: false,
                statusCode: 429,
                message: `Tài khoản đang tạm khóa do phát hiện quá ${ACCOUNT_GLOBAL_MAX_ATTEMPTS} lần đăng nhập sai từ nhiều thiết bị/IP. Vui lòng thử lại sau ${globalAcctCheck.remainSec} giây!`
            };
        }
        const isUnderAttack = globalAcctCheck.count >= ACCOUNT_SOFT_LOCK_THRESHOLD;
        if (isUnderAttack) {
            const delayMs = skipDelay
                ? 0
                : (process.env.NODE_ENV === 'test'
                    ? (isKnownIp ? 0 : 5)
                    : (isKnownIp ? 0 : Math.min(2000, 500 + (globalAcctCheck.count - ACCOUNT_SOFT_LOCK_THRESHOLD) * 100)));
            if (delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            await logAuditEvent({
                actor_id: identifier,
                actor_role: actorRole,
                action: 'ACCOUNT_UNDER_DISTRIBUTED_ATTACK',
                resource: 'auth',
                details: { total_attempts: globalAcctCheck.count, delay_ms: delayMs, ip: normalizedIp, is_known_ip: isKnownIp },
                ip_address: normalizedIp
            });
        }
        return null;
    }

    async _recordLoginFailure(identifier, normalizedIp) {
        const compositeKey = `composite:${identifier}:${normalizedIp}`;
        const acctKey = `account:${identifier}`;
        const ipKey = `ip:${normalizedIp}`;
        await recordFailedAttemptDb(compositeKey, 'composite', `${identifier}:${normalizedIp}`, ACCOUNT_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);
        await recordFailedAttemptDb(acctKey, 'account', identifier, ACCOUNT_GLOBAL_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);
        if (normalizedIp && normalizedIp !== 'unknown') {
            await recordFailedAttemptDb(ipKey, 'ip', normalizedIp, IP_MAX_ATTEMPTS, IP_LOCKOUT_SEC);
        }
    }

    async employeeLogin(identifierInput, password, ip_address = '', { device_id = null, device_name = null, device_info = null, user_agent = '' } = {}) {
        const cleanId = String(identifierInput || '').trim();
        if (!cleanId || !password) {
            return { success: false, statusCode: 400, message: GENERIC_LOGIN_ERROR };
        }

        const normalizedIp = normalizeClientIp(ip_address);
        const compositeKey = `composite:${cleanId}:${normalizedIp}`;
        const rateLimitBlocked = await this._checkLoginRateLimits(cleanId, normalizedIp, 'unknown');
        if (rateLimitBlocked) {
            return rateLimitBlocked;
        }

        const results = await query(
            'SELECT * FROM employees WHERE ma_nv = ? OR LOWER(login_username) = LOWER(?) OR phone = ? OR dien_thoai = ? LIMIT 1',
            [cleanId, cleanId, cleanId, cleanId]
        );
        if (!results || results.length === 0) {
            // V5 Unified Auto-Routing Login: Tự động kiểm tra bảng admins nếu không tìm thấy trong bảng employees
            const adminRows = await query(
                'SELECT username FROM admins WHERE LOWER(username) = LOWER(?) OR LOWER(login_username) = LOWER(?) OR phone = ? LIMIT 1',
                [cleanId, cleanId, cleanId]
            );
            if (adminRows && adminRows.length > 0) {
                return await this.adminLogin(adminRows[0].username, password, ip_address, {
                    skipPreCheck: adminRows[0].username === cleanId
                });
            }

            await this._recordLoginFailure(cleanId, normalizedIp);

            await logAuditEvent({
                actor_id: cleanId,
                actor_role: 'unknown',
                action: 'LOGIN_FAILED',
                resource: 'auth',
                details: { reason: 'account_not_found' },
                ip_address: normalizedIp
            });

            return { success: false, message: GENERIC_LOGIN_ERROR };
        }

        const emp = results[0];
        const ma_nv = emp.ma_nv;

        // So sánh mật khẩu trước khi kiểm tra trạng thái khóa (chống Account Enumeration qua mã 403)
        const storedPass = emp.password;
        if (!storedPass || !isBcryptHash(storedPass)) {
            await this._recordLoginFailure(cleanId, normalizedIp);

            await logAuditEvent({
                actor_id: ma_nv,
                actor_role: resolveUserRole(emp),
                action: 'LOGIN_FAILED',
                resource: 'auth',
                details: { reason: 'invalid_password_hash' },
                ip_address: normalizedIp
            });

            return { success: false, message: GENERIC_LOGIN_ERROR };
        }

        const isMatch = await comparePasswordAsync(password, storedPass);

        if (!isMatch) {
            await this._recordLoginFailure(cleanId, normalizedIp);

            await logAuditEvent({
                actor_id: ma_nv,
                actor_role: resolveUserRole(emp),
                action: 'LOGIN_FAILED',
                resource: 'auth',
                details: { reason: 'wrong_password' },
                ip_address: normalizedIp
            });

            return { success: false, message: GENERIC_LOGIN_ERROR };
        }

        // Kiểm tra xem tài khoản có bị tạm khóa bởi Quản trị viên hay không (sau khi xác thực mật khẩu)
        const isBlocked = emp.status === 'inactive' || emp.status === 'locked' || emp.is_locked === 1 || emp.is_locked === true;
        if (isBlocked) {
            return {
                success: false,
                statusCode: 403,
                message: 'Tài khoản nhân sự của bạn đã bị TẠM KHÓA bởi Quản trị viên. Vui lòng liên hệ bộ phận Nhân sự hoặc Ban giám đốc!'
            };
        }

        // ✅ Đăng nhập thành công → Reset rate limiter cho composite key & ghi nhận IP tin cậy
        await resetCompositeAttemptsDb(compositeKey);
        if (ma_nv !== cleanId) {
            await resetCompositeAttemptsDb(`composite:${ma_nv}:${normalizedIp}`).catch(() => {});
        }
        await recordKnownLegitIp(ma_nv, normalizedIp);
        const role = resolveUserRole(emp);
        const isPureAdmin = role === 'admin';

        if (!isPureAdmin) {
            await recordEmployeeDeviceActivity(emp, {
                device_id,
                device_name,
                device_info,
                user_agent,
                ip_address: normalizedIp,
                source: 'login'
            });
        }

        const safeEmp = sanitizeUserResponse(emp);
        safeEmp.role = role;
        safeEmp.phone = emp.phone || emp.dien_thoai || null;
        safeEmp.login_username = emp.login_username || emp.phone || emp.ma_nv;
        safeEmp.theme_preference = emp.theme_preference === 'dark' ? 'dark' : 'light';
        safeEmp.font_scale = normalizeFontScale(emp.font_scale);
        safeEmp.bank_code = emp.bank_code || null;
        safeEmp.bank_name = emp.bank_name || null;
        safeEmp.bank_account_number = emp.bank_account_number || null;
        safeEmp.bank_account_name = emp.bank_account_name || null;
        attachDbDeviceState(safeEmp, emp, isPureAdmin);
        if (role === 'accountant') {
            safeEmp.dynamic_permissions = await getAccountantPermissions();
        }
        
        const token = generateToken({
            id: emp.ma_nv,
            ma_nv: emp.ma_nv,
            role: role,
            ho_ten: emp.ho_ten,
            token_version: Number(emp.token_version || 1)
        });

        await logAuditEvent({
            actor_id: emp.ma_nv,
            actor_role: role,
            action: 'LOGIN_SUCCESS',
            resource: 'auth',
            details: { method: 'employee_login', device_id: device_id || null, bcrypt_upgraded: !isBcryptHash(storedPass) },
            ip_address
        });

        // Kiểm tra cờ must_change_password
        const mustChange = Boolean(emp.must_change_password);

        return { 
            success: true, 
            data: {
                ...safeEmp,
                token,
                role,
                must_change_password: mustChange
            }
        };
    }

    async adminLogin(username, password, ip_address = '', { skipPreCheck = false } = {}) {
        const cleanAdminId = String(username || '').trim();
        if (!cleanAdminId || !password) {
            return { success: false, message: GENERIC_LOGIN_ERROR };
        }

        // Rate limit theo (admin username, IP), IP rộng & phân tán nhiều IP — dùng chung helper với employeeLogin
        const normalizedIp = normalizeClientIp(ip_address);
        const adminAcctKey = `composite:${cleanAdminId}:${normalizedIp}`;
        if (!skipPreCheck) {
            const rateLimitBlocked = await this._checkLoginRateLimits(cleanAdminId, normalizedIp, 'admin');
            if (rateLimitBlocked) {
                return rateLimitBlocked;
            }
        }

        const results = await query(
            'SELECT * FROM admins WHERE LOWER(username) = LOWER(?) OR LOWER(login_username) = LOWER(?) OR phone = ? LIMIT 1',
            [cleanAdminId, cleanAdminId, cleanAdminId]
        );
        if (!results || results.length === 0) {
            await this._recordLoginFailure(cleanAdminId, normalizedIp);

            await logAuditEvent({
                actor_id: cleanAdminId,
                actor_role: 'admin',
                action: 'ADMIN_LOGIN_FAILED',
                resource: 'auth',
                details: { reason: 'admin_not_found' },
                ip_address: normalizedIp
            });

            return { success: false, message: GENERIC_LOGIN_ERROR };
        }

        const admin = results[0];
        const storedPass = admin.password;
        if (!storedPass || !isBcryptHash(storedPass)) {
            await this._recordLoginFailure(cleanAdminId, normalizedIp);

            await logAuditEvent({
                actor_id: admin.username,
                actor_role: 'admin',
                action: 'ADMIN_LOGIN_FAILED',
                resource: 'auth',
                details: { reason: 'invalid_password_hash' },
                ip_address: normalizedIp
            });

            return { success: false, message: GENERIC_LOGIN_ERROR };
        }

        const isMatch = await comparePasswordAsync(password, storedPass);

        if (!isMatch) {
            await this._recordLoginFailure(cleanAdminId, normalizedIp);

            await logAuditEvent({
                actor_id: admin.username,
                actor_role: 'admin',
                action: 'ADMIN_LOGIN_FAILED',
                resource: 'auth',
                details: { reason: 'wrong_admin_password' },
                ip_address: normalizedIp
            });

            return { success: false, message: GENERIC_LOGIN_ERROR };
        }

        // ✅ Đăng nhập thành công → Reset rate limiter cho composite key & ghi nhận IP tin cậy
        await resetCompositeAttemptsDb(adminAcctKey);
        if (admin.username !== cleanAdminId) {
            await resetCompositeAttemptsDb(`composite:${admin.username}:${normalizedIp}`).catch(() => {});
        }
        await recordKnownLegitIp(admin.username, normalizedIp);

        const safeAdmin = sanitizeUserResponse(admin);
        safeAdmin.role = 'admin';
        safeAdmin.login_username = admin.login_username || admin.username;
        safeAdmin.phone = admin.phone || null;
        safeAdmin.avatar_url = admin.avatar_url || null;
        safeAdmin.theme_preference = admin.theme_preference === 'dark' ? 'dark' : 'light';
        safeAdmin.font_scale = normalizeFontScale(admin.font_scale);

        const token = generateToken({
            id: admin.id,
            username: admin.username,
            role: 'admin',
            ho_ten: admin.ho_ten,
            token_version: Number(admin.token_version || 1)
        });

        await logAuditEvent({
            actor_id: admin.username,
            actor_role: 'admin',
            action: 'ADMIN_LOGIN_SUCCESS',
            resource: 'auth',
            details: { method: 'admin_login' },
            ip_address
        });

        const mustChange = Boolean(admin.must_change_password);

        return { 
            success: true, 
            data: {
                ...safeAdmin,
                token,
                role: 'admin',
                must_change_password: mustChange
            }
        };
    }

    async adminRegister(username, password, ho_ten, current_user = null) {
        if (!username || !password) {
            return { success: false, message: 'Vui lòng nhập tài khoản và mật khẩu!' };
        }

        // Kiểm tra số lượng tài khoản quản trị hiện tại trong hệ thống
        const adminCountRes = await query('SELECT COUNT(*) as count FROM admins');
        const adminCount = (adminCountRes && adminCountRes[0]) ? adminCountRes[0].count : 0;

        // Nếu đã có quản trị viên, BẮT BUỘC chỉ Quản trị viên mới được tạo thêm (Least Privilege)
        if (adminCount > 0) {
            if (!current_user || current_user.role !== 'admin') {
                return { 
                    success: false, 
                    statusCode: 403, 
                    message: 'Từ chối quyền: Chỉ Quản trị viên hệ thống mới có thể tạo thêm tài khoản Quản trị!' 
                };
            }
        }

        const existing = await query('SELECT * FROM admins WHERE username = ?', [username]);
        if (existing && existing.length > 0) {
            return { success: false, message: 'Tên đăng nhập này đã tồn tại!' };
        }

        // Mã hóa mật khẩu bằng bcrypt trước khi lưu
        const policyCheck = validatePasswordPolicy(password, username);
        if (!policyCheck.valid) {
            return { success: false, statusCode: 400, message: policyCheck.message };
        }
        const hashedPw = hashPassword(password);

        await query('INSERT INTO admins (username, password, ho_ten) VALUES (?, ?, ?)', [
            username,
            hashedPw,
            ho_ten || 'Quản trị viên'
        ]);

        await logAuditEvent({
            actor_id: current_user ? (current_user.username || current_user.ma_nv) : username,
            actor_role: current_user ? current_user.role : 'admin',
            action: 'ADMIN_REGISTER',
            resource: 'admins',
            details: { new_admin_username: username }
        });

        return { success: true };
    }

    async changePassword(ma_nv, old_password, new_password, current_user = null, options = {}) {
        if (!ma_nv) {
            return { success: false, statusCode: 400, message: 'Thiếu mã nhân viên cần đổi mật khẩu!' };
        }
        const currentActorId = current_user ? (current_user.ma_nv || current_user.username) : null;
        // Kiểm tra quyền: Chỉ chính chủ tài khoản hoặc admin mới được đổi mật khẩu
        if (current_user && current_user.role !== 'admin' && currentActorId !== ma_nv) {
            return { success: false, statusCode: 403, message: 'Bạn không có quyền thay đổi mật khẩu của nhân viên khác!' };
        }

        const results = await query(`SELECT ${SAFE_EMPLOYEE_FIELDS}, password FROM employees WHERE ma_nv = ?`, [ma_nv]);
        let isPureAdmin = false;
        let accountRow = null;
        if (results && results.length > 0) {
            accountRow = results[0];
        } else if (!current_user || current_user.role === 'admin') {
            const admResults = await query('SELECT id, username, ho_ten, password, phone, login_username, theme_preference, must_change_password, token_version FROM admins WHERE username = ?', [ma_nv]);
            if (admResults && admResults.length > 0) {
                accountRow = admResults[0];
                isPureAdmin = true;
            }
        }
        if (!accountRow || !accountRow.password) {
            return { success: false, statusCode: 404, message: 'Không tìm thấy tài khoản' };
        }
        const currentPass = accountRow.password;
        if (!isBcryptHash(currentPass)) {
            return { success: false, statusCode: 400, message: 'Mật khẩu hiện tại không hợp lệ hoặc chưa được mã hóa an toàn!' };
        }

        // Non-admin bắt buộc nhập mật khẩu cũ; admin chỉ kiểm tra nếu đang cung cấp mật khẩu cũ hoặc tự sửa tài khoản của mình
        const isSelfAction = Boolean(current_user && currentActorId === ma_nv);
        if (!current_user || current_user.role !== 'admin' || (isSelfAction && old_password !== undefined && old_password !== null && old_password !== '')) {
            if (!old_password || typeof old_password !== 'string') {
                return { success: false, statusCode: 400, message: 'Vui lòng nhập mật khẩu cũ!' };
            }
            const isOldMatch = await comparePasswordAsync(old_password, currentPass);
            if (!isOldMatch) {
                return { success: false, statusCode: 400, message: 'Mật khẩu cũ không chính xác!' };
            }
        }

        const { normalizePhone, normalizeUsername, assertUniqueLoginIdentity } = require('./employeeService');
        const hasNewPassword = typeof new_password === 'string' && new_password.length > 0;
        const hasNewUsername = options && options.new_username !== undefined;
        const hasPhone = options && options.phone !== undefined;

        if (!hasNewPassword && !hasNewUsername && !hasPhone) {
            return { success: false, statusCode: 400, message: 'Vui lòng nhập mật khẩu mới!' };
        }

        let hashedNew = null;
        if (hasNewPassword) {
            const policyCheck = validatePasswordPolicy(new_password, ma_nv);
            if (!policyCheck.valid) {
                return { success: false, statusCode: 400, message: policyCheck.message };
            }
            hashedNew = hashPassword(new_password);
        }

        const nextUsername = hasNewUsername ? normalizeUsername(options.new_username) : undefined;
        const nextPhone = hasPhone ? normalizePhone(options.phone) : undefined;

        if (hasNewUsername && !nextUsername) {
            return { success: false, statusCode: 400, message: 'Tên tài khoản đăng nhập không được để trống!' };
        }

        if (hasNewUsername || hasPhone) {
            try {
                await assertUniqueLoginIdentity({
                    phone: hasPhone ? nextPhone : null,
                    login_username: hasNewUsername ? nextUsername : null,
                    excludeMaNv: isPureAdmin ? null : ma_nv,
                    excludeAdminUsername: isPureAdmin ? ma_nv : null
                });
            } catch (uniqErr) {
                return {
                    success: false,
                    statusCode: uniqErr.statusCode || 409,
                    message: uniqErr.message || 'Tài khoản hoặc số điện thoại đã được sử dụng!'
                };
            }
        }

        const setParts = [];
        const params = [];
        const shouldBumpTokenVersion = Boolean(hashedNew || hasNewUsername);
        if (hashedNew) {
            setParts.push('password = ?', 'must_change_password = 0');
            params.push(hashedNew);
        }
        if (hasNewUsername) {
            setParts.push('login_username = ?');
            params.push(nextUsername);
        }
        if (shouldBumpTokenVersion) {
            setParts.push('token_version = COALESCE(token_version, 1) + 1');
        }
        if (hasPhone) {
            setParts.push('phone = ?');
            params.push(nextPhone);
            if (!isPureAdmin) {
                setParts.push('dien_thoai = ?');
                params.push(nextPhone);
            }
        }

        if (isPureAdmin) {
            params.push(ma_nv);
            await query(`UPDATE admins SET ${setParts.join(', ')} WHERE username = ?`, params);
        } else {
            params.push(ma_nv);
            await query(`UPDATE employees SET ${setParts.join(', ')} WHERE ma_nv = ?`, params);
        }
        invalidateUserCache(ma_nv);

        await logAuditEvent({
            actor_id: currentActorId || ma_nv,
            actor_role: current_user ? current_user.role : 'worker',
            action: hashedNew ? 'CHANGE_PASSWORD' : 'UPDATE_ACCOUNT_CREDENTIALS',
            resource: isPureAdmin ? 'admins' : 'employees',
            details: { target_ma_nv: ma_nv, token_revoked: shouldBumpTokenVersion, updated_username: hasNewUsername || false, updated_phone: hasPhone || false }
        });

        let freshUser = null;
        let freshToken = null;
        if (!current_user || isSelfAction) {
            freshUser = await this.getProfile({
                ...(current_user || {}),
                ma_nv: isPureAdmin ? undefined : ma_nv,
                username: isPureAdmin ? ma_nv : undefined,
                role: isPureAdmin ? 'admin' : resolveUserRole(accountRow)
            });
            if (freshUser) {
                const tv = Number(accountRow.token_version || 1) + (shouldBumpTokenVersion ? 1 : 0);
                if (isPureAdmin) {
                    freshToken = generateToken({
                        id: accountRow.id,
                        username: accountRow.username,
                        role: 'admin',
                        ho_ten: freshUser.ho_ten,
                        token_version: tv
                    });
                } else {
                    freshToken = generateToken({
                        id: accountRow.ma_nv,
                        ma_nv: accountRow.ma_nv,
                        role: freshUser.role,
                        ho_ten: freshUser.ho_ten,
                        token_version: tv
                    });
                }
            }
        }

        return {
            success: true,
            message: hashedNew ? 'Đổi mật khẩu thành công!' : 'Cập nhật tài khoản thành công!',
            ...(freshUser ? { data: freshUser } : {}),
            ...(freshToken ? { token: freshToken } : {})
        };
    }

    async updateAccountCredentials(current_user, { old_password, new_password, new_username, phone } = {}) {
        if (!current_user) {
            return { success: false, statusCode: 401, message: 'Chưa đăng nhập!' };
        }
        const targetId = current_user.ma_nv || current_user.username;
        if (!targetId) {
            return { success: false, statusCode: 400, message: 'Không xác định được tài khoản hiện tại!' };
        }
        if (!old_password || typeof old_password !== 'string') {
            return { success: false, statusCode: 400, message: 'Vui lòng nhập mật khẩu hiện tại để xác thực!' };
        }

        const empRows = current_user.ma_nv
            ? await query(`SELECT ${SAFE_EMPLOYEE_FIELDS}, password FROM employees WHERE ma_nv = ?`, [current_user.ma_nv])
            : [];
        let isPureAdmin = false;
        let accountRow = (empRows && empRows[0]) || null;
        if (!accountRow && current_user.username) {
            const admRows = await query(
                'SELECT id, username, ho_ten, password, phone, login_username, theme_preference, must_change_password, token_version FROM admins WHERE username = ?',
                [current_user.username]
            );
            if (admRows && admRows[0]) {
                accountRow = admRows[0];
                isPureAdmin = true;
            }
        }
        if (!accountRow) {
            return { success: false, statusCode: 404, message: 'Không tìm thấy tài khoản!' };
        }
        if (!isBcryptHash(accountRow.password)) {
            return { success: false, statusCode: 400, message: 'Mật khẩu tài khoản chưa đạt chuẩn bảo mật!' };
        }

        const okPass = await comparePasswordAsync(old_password, accountRow.password);
        if (!okPass) {
            return { success: false, statusCode: 400, message: 'Mật khẩu hiện tại không chính xác!' };
        }

        const opts = {};
        if (new_username !== undefined) opts.new_username = new_username;
        if (phone !== undefined) opts.phone = phone;
        const passToSet = typeof new_password === 'string' && new_password.length > 0 ? new_password : null;

        if (!passToSet && new_username === undefined && phone === undefined) {
            return { success: false, statusCode: 400, message: 'Vui lòng nhập thông tin mới cần cập nhật!' };
        }

        return this.changePassword(
            isPureAdmin ? accountRow.username : accountRow.ma_nv,
            old_password,
            passToSet,
            current_user,
            opts
        );
    }

    async updateThemePreference(current_user, rawTheme) {
        if (!current_user) {
            return { success: false, statusCode: 401, message: 'Chưa đăng nhập!' };
        }
        const normalizedTheme = String(rawTheme || '').trim().toLowerCase();
        if (normalizedTheme !== 'light' && normalizedTheme !== 'dark') {
            return { success: false, statusCode: 400, message: 'Giao diện không hợp lệ (chỉ nhận light hoặc dark)!' };
        }

        if (current_user.ma_nv) {
            await query('UPDATE employees SET theme_preference = ? WHERE ma_nv = ?', [normalizedTheme, current_user.ma_nv]);
            invalidateUserCache(current_user.ma_nv);
        } else if (current_user.username) {
            await query('UPDATE admins SET theme_preference = ? WHERE username = ?', [normalizedTheme, current_user.username]);
            invalidateUserCache(current_user.username);
        } else {
            return { success: false, statusCode: 400, message: 'Không xác định được tài khoản!' };
        }

        return {
            success: true,
            data: { theme_preference: normalizedTheme }
        };
    }

    async updateUserPreferences(current_user, { theme_preference, font_scale } = {}) {
        if (!current_user) {
            return { success: false, statusCode: 401, message: 'Chưa đăng nhập!' };
        }
        const updates = [];
        const params = [];
        const responseData = {};

        if (theme_preference !== undefined) {
            const normalizedTheme = String(theme_preference || '').trim().toLowerCase();
            if (normalizedTheme !== 'light' && normalizedTheme !== 'dark') {
                return { success: false, statusCode: 400, message: 'Giao diện không hợp lệ (chỉ nhận light hoặc dark)!' };
            }
            updates.push('theme_preference = ?');
            params.push(normalizedTheme);
            responseData.theme_preference = normalizedTheme;
        }

        if (font_scale !== undefined) {
            const parsedScale = Number(font_scale);
            if (!VALID_FONT_SCALES.includes(parsedScale)) {
                return {
                    success: false,
                    statusCode: 400,
                    message: 'Cỡ chữ không hợp lệ! Chỉ hỗ trợ 100%, 110%, 125%, 150%, 175%, 200%.'
                };
            }
            updates.push('font_scale = ?');
            params.push(parsedScale);
            responseData.font_scale = parsedScale;
        }

        if (updates.length === 0) {
            return { success: false, statusCode: 400, message: 'Không có tùy chọn nào cần cập nhật!' };
        }

        if (current_user.ma_nv) {
            await query(`UPDATE employees SET ${updates.join(', ')} WHERE ma_nv = ?`, [...params, current_user.ma_nv]);
            invalidateUserCache(current_user.ma_nv);
        } else if (current_user.username) {
            await query(`UPDATE admins SET ${updates.join(', ')} WHERE username = ?`, [...params, current_user.username]);
            invalidateUserCache(current_user.username);
        } else {
            return { success: false, statusCode: 400, message: 'Không xác định được tài khoản!' };
        }

        return {
            success: true,
            data: responseData
        };
    }

    async updateBankCard(current_user, payload = {}) {
        if (!current_user) {
            const err = new Error('Chưa đăng nhập!');
            err.statusCode = 401;
            throw err;
        }
        if (!current_user.ma_nv || current_user.role === 'admin') {
            const err = new Error('Tài khoản Quản trị viên không sử dụng thẻ ngân hàng nhận lương!');
            err.statusCode = 400;
            throw err;
        }
        const cleanBank = sanitizeBankCardInput(payload);
        const updRes = await query(
            `UPDATE employees
             SET bank_code = ?, bank_name = ?, bank_account_number = ?, bank_account_name = ?
             WHERE ma_nv = ?`,
            [
                cleanBank.bank_code,
                cleanBank.bank_name,
                cleanBank.bank_account_number,
                cleanBank.bank_account_name,
                current_user.ma_nv
            ]
        );
        if (!updRes || updRes.affectedRows === 0) {
            const err = new Error('Không tìm thấy hồ sơ nhân sự để lưu thẻ ngân hàng!');
            err.statusCode = 404;
            throw err;
        }
        invalidateUserCache(current_user.ma_nv);
        await logAuditEvent({
            actor_id: current_user.ma_nv,
            actor_role: current_user.role || 'worker',
            action: 'UPDATE_BANK_CARD',
            resource: 'employees',
            details: {
                ma_nv: current_user.ma_nv,
                bank_code: cleanBank.bank_code,
                bank_name: cleanBank.bank_name,
                bank_account_number: cleanBank.bank_account_number,
                bank_account_name: cleanBank.bank_account_name
            }
        });
        return {
            success: true,
            message: 'Đã lưu thẻ ngân hàng nhận lương!',
            data: cleanBank
        };
    }

    async getProfile(current_user) {
        if (!current_user) return null;
        if (current_user.ma_nv) {
            const rows = await query(`SELECT ${SAFE_EMPLOYEE_FIELDS} FROM employees WHERE ma_nv = ? LIMIT 1`, [current_user.ma_nv]);
            if (rows && rows.length > 0) {
                const emp = rows[0];
                const role = resolveUserRole(emp);
                const safe = sanitizeUserResponse(emp);
                safe.role = role;
                safe.phone = emp.phone || emp.dien_thoai || null;
                safe.login_username = emp.login_username || emp.phone || emp.ma_nv;
                safe.theme_preference = emp.theme_preference === 'dark' ? 'dark' : 'light';
                safe.font_scale = normalizeFontScale(emp.font_scale);
                safe.bank_code = emp.bank_code || null;
                safe.bank_name = emp.bank_name || null;
                safe.bank_account_number = emp.bank_account_number || null;
                safe.bank_account_name = emp.bank_account_name || null;
                attachDbDeviceState(safe, emp, role === 'admin');
                if (role === 'accountant') {
                    safe.dynamic_permissions = await getAccountantPermissions();
                }
                return safe;
            }
        }
        const admKey = current_user.username || current_user.ma_nv;
        if (admKey) {
            const admRows = await query(
                'SELECT id, username, ho_ten, avatar_url, phone, login_username, theme_preference, COALESCE(font_scale, 100) as font_scale, must_change_password FROM admins WHERE username = ? LIMIT 1',
                [admKey]
            );
            if (admRows && admRows.length > 0) {
                const adm = admRows[0];
                const safeAdm = sanitizeUserResponse(adm);
                safeAdm.role = 'admin';
                safeAdm.phone = adm.phone || null;
                safeAdm.avatar_url = adm.avatar_url || null;
                safeAdm.login_username = adm.login_username || adm.username;
                safeAdm.theme_preference = adm.theme_preference === 'dark' ? 'dark' : 'light';
                safeAdm.font_scale = normalizeFontScale(adm.font_scale);
                safeAdm.must_change_password = Boolean(adm.must_change_password);
                attachDbDeviceState(safeAdm, adm, true);
                return safeAdm;
            }
        }
        return current_user;
    }

    async forcePasswordChange(ma_nv, current_user = null) {
        if (!ma_nv) {
            return { success: false, statusCode: 400, message: 'Thiếu mã nhân viên!' };
        }
        const updRes = await query(
            'UPDATE employees SET must_change_password = 1, token_version = COALESCE(token_version, 1) + 1 WHERE ma_nv = ?',
            [ma_nv]
        );
        if (!updRes || updRes.affectedRows === 0) {
            return { success: false, statusCode: 404, message: 'Không tìm thấy nhân viên!' };
        }
        invalidateUserCache(ma_nv);
        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'FORCE_PASSWORD_CHANGE',
            resource: 'employees',
            details: { target_ma_nv: ma_nv, token_revoked: true }
        });
        return { success: true, message: 'Đã kích hoạt đổi mật khẩu bắt buộc và thu hồi phiên đăng nhập cũ!' };
    }

    async adminResetPassword(ma_nv, new_password, current_user = null) {
        if (!ma_nv || !new_password) {
            return { success: false, statusCode: 400, message: 'Thiếu mã nhân viên hoặc mật khẩu mới!' };
        }
        const policyCheck = validatePasswordPolicy(new_password, ma_nv);
        if (!policyCheck.valid) {
            return { success: false, statusCode: 400, message: policyCheck.message };
        }
        const hashedNew = hashPassword(new_password);
        const updRes = await query(
            'UPDATE employees SET password = ?, must_change_password = 1, token_version = COALESCE(token_version, 1) + 1 WHERE ma_nv = ?',
            [hashedNew, ma_nv]
        );
        if (!updRes || updRes.affectedRows === 0) {
            return { success: false, statusCode: 404, message: 'Không tìm thấy nhân viên!' };
        }
        invalidateUserCache(ma_nv);
        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : 'admin',
            actor_role: current_user ? current_user.role : 'admin',
            action: 'ADMIN_RESET_PASSWORD',
            resource: 'employees',
            details: { target_ma_nv: ma_nv, token_revoked: true }
        });
        return { success: true, message: 'Đã đặt lại mật khẩu và thu hồi phiên đăng nhập cũ!' };
    }

    async updateSelfAvatar(current_user, rawAvatarUrl) {
        if (!current_user) {
            const err = new Error('Chưa đăng nhập!');
            err.statusCode = 401;
            throw err;
        }
        const cleanAvatar = sanitizeAvatarInput(rawAvatarUrl);
        const mediaLifecycleService = require('./mediaLifecycleService');
        let prevAvatar = null;

        if (current_user.ma_nv) {
            const prevRows = await query('SELECT avatar_url FROM employees WHERE ma_nv = ? LIMIT 1', [current_user.ma_nv]).catch(() => []);
            if (!prevRows || prevRows.length === 0) {
                const err = new Error('Không tìm thấy tài khoản nhân viên!');
                err.statusCode = 404;
                throw err;
            }
            prevAvatar = prevRows[0].avatar_url || null;
            await query('UPDATE employees SET avatar_url = ? WHERE ma_nv = ?', [cleanAvatar, current_user.ma_nv]);
            invalidateUserCache(current_user.ma_nv);
            if (cleanAvatar) {
                await mediaLifecycleService.bindAssetToEntity({
                    mediaRef: cleanAvatar,
                    entityType: 'employee_avatar',
                    entityId: current_user.ma_nv,
                    employeeId: current_user.ma_nv
                });
            }
            if (prevAvatar && prevAvatar !== cleanAvatar) {
                await mediaLifecycleService.handleMediaReplacement({
                    oldMediaRef: prevAvatar,
                    newMediaRef: cleanAvatar,
                    actor: current_user
                });
            }
        } else if (current_user.username) {
            const prevRows = await query('SELECT avatar_url FROM admins WHERE username = ? LIMIT 1', [current_user.username]).catch(() => []);
            if (!prevRows || prevRows.length === 0) {
                const err = new Error('Không tìm thấy tài khoản quản trị!');
                err.statusCode = 404;
                throw err;
            }
            prevAvatar = prevRows[0].avatar_url || null;
            await query('UPDATE admins SET avatar_url = ? WHERE username = ?', [cleanAvatar, current_user.username]);
            invalidateUserCache(current_user.username);
            if (cleanAvatar) {
                await mediaLifecycleService.bindAssetToEntity({
                    mediaRef: cleanAvatar,
                    entityType: 'admin_avatar',
                    entityId: current_user.username,
                    employeeId: current_user.username
                });
            }
            if (prevAvatar && prevAvatar !== cleanAvatar) {
                await mediaLifecycleService.handleMediaReplacement({
                    oldMediaRef: prevAvatar,
                    newMediaRef: cleanAvatar,
                    actor: current_user
                });
            }
        } else {
            const err = new Error('Không xác định được tài khoản!');
            err.statusCode = 400;
            throw err;
        }

        await logAuditEvent({
            actor_id: current_user.ma_nv || current_user.username,
            actor_role: current_user.role || 'worker',
            action: cleanAvatar ? 'UPDATE_AVATAR' : 'DELETE_AVATAR',
            resource: current_user.ma_nv ? 'employees' : 'admins',
            details: { has_avatar: Boolean(cleanAvatar), is_remote_url: Boolean(cleanAvatar && !cleanAvatar.startsWith('data:')) }
        });

        return {
            success: true,
            message: cleanAvatar ? 'Đã cập nhật ảnh đại diện!' : 'Đã xóa ảnh đại diện!',
            data: { avatar_url: cleanAvatar }
        };
    }

    async updateAvatar(ma_nv, avatar_url, current_user = null) {
        if (current_user && current_user.role !== 'admin' && current_user.ma_nv !== ma_nv) {
            return { success: false, message: 'Bạn không có quyền cập nhật ảnh đại diện của người khác!' };
        }
        const cleanAvatar = sanitizeAvatarInput(avatar_url);
        const prevRows = await query('SELECT avatar_url FROM employees WHERE ma_nv = ? LIMIT 1', [ma_nv]).catch(() => []);
        const prevAvatar = prevRows?.[0]?.avatar_url || null;
        await query('UPDATE employees SET avatar_url = ? WHERE ma_nv = ?', [cleanAvatar, ma_nv]);
        invalidateUserCache(ma_nv);
        const mediaLifecycleService = require('./mediaLifecycleService');
        if (cleanAvatar) {
            await mediaLifecycleService.bindAssetToEntity({
                mediaRef: cleanAvatar,
                entityType: 'employee_avatar',
                entityId: ma_nv,
                employeeId: ma_nv
            });
        }
        if (prevAvatar && prevAvatar !== cleanAvatar) {
            await mediaLifecycleService.handleMediaReplacement({
                oldMediaRef: prevAvatar,
                newMediaRef: cleanAvatar,
                actor: current_user
            });
        }
        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : ma_nv,
            actor_role: current_user ? current_user.role : 'worker',
            action: cleanAvatar ? 'UPDATE_AVATAR' : 'DELETE_AVATAR',
            resource: 'employees',
            details: { target_ma_nv: ma_nv, has_avatar: Boolean(cleanAvatar) }
        });
        return { success: true, data: { avatar_url: cleanAvatar } };
    }

    validatePasswordPolicy(new_password, ma_nv) {
        return validatePasswordPolicy(new_password, ma_nv);
    }

    async recordKnownLegitIp(ma_nv, ip) {
        return recordKnownLegitIp(ma_nv, ip);
    }

    // Expose cho test: reset toàn bộ state rate limiter
    async resetRateLimitState() {
        accountAttempts.clear();
        ipAttempts.clear();
        await query('DELETE FROM login_rate_limits').catch(() => {});
    }
}

const authServiceInstance = new AuthService();
authServiceInstance.validatePasswordPolicy = validatePasswordPolicy;
authServiceInstance.GENERIC_LOGIN_ERROR = GENERIC_LOGIN_ERROR;
authServiceInstance.normalizeClientIp = normalizeClientIp;
authServiceInstance.expandIpv6 = expandIpv6;
authServiceInstance.ACCOUNT_MAX_ATTEMPTS = ACCOUNT_MAX_ATTEMPTS;
authServiceInstance.ACCOUNT_SOFT_LOCK_THRESHOLD = ACCOUNT_SOFT_LOCK_THRESHOLD;
authServiceInstance.ACCOUNT_GLOBAL_MAX_ATTEMPTS = ACCOUNT_GLOBAL_MAX_ATTEMPTS;
authServiceInstance.IP_MAX_ATTEMPTS = IP_MAX_ATTEMPTS;

module.exports = authServiceInstance;
