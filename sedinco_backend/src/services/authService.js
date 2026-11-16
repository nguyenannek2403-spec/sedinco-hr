const { query } = require('../config/db');
const { 
    sanitizeUserResponse, 
    resolveUserRole, 
    generateToken, 
    logAuditEvent,
    getAccountantPermissions,
    invalidateUserCache
} = require('../middlewares/authMiddleware');
const { verifyZaloAccessToken } = require('../utils/zaloAdapter');
const { 
    hashPassword, 
    comparePassword, 
    comparePasswordAsync, 
    isBcryptHash, 
    isDefaultPassword 
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

const COMMON_PASSWORDS = new Set([
    '123456', '12345678', '123456789', '111111', '11111111', '000000', '00000000',
    'password', 'password123', 'admin123', 'sedinco123', 'sedinco@123', 'qwertyuiop',
    '654321', '87654321', 'iloveyou', 'welcome123'
]);

function validatePasswordPolicy(new_password, ma_nv = '') {
    if (!new_password || typeof new_password !== 'string') {
        return { valid: false, message: 'Vui lòng nhập mật khẩu mới!' };
    }
    const trimmed = new_password.trim();
    if (trimmed.length < 8) {
        return { valid: false, message: 'Mật khẩu mới phải có độ dài tối thiểu 8 ký tự!' };
    }
    const lower = trimmed.toLowerCase();
    if (COMMON_PASSWORDS.has(lower)) {
        return { valid: false, message: 'Mật khẩu này quá phổ biến và dễ đoán. Vui lòng thiết lập mật khẩu mạnh hơn!' };
    }
    if (ma_nv && typeof ma_nv === 'string') {
        const cleanMaNv = ma_nv.toLowerCase().trim();
        if (cleanMaNv.length >= 3 && lower.includes(cleanMaNv)) {
            return { valid: false, message: 'Mật khẩu mới không được trùng hoặc chứa mã nhân viên!' };
        }
    }
    return { valid: true };
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
        const isUnderAttack = globalAcctCheck.blocked || globalAcctCheck.count >= ACCOUNT_SOFT_LOCK_THRESHOLD;
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

    async employeeLogin(ma_nv, password, ip_address = '', { zalo_user_id = null, zalo_access_token = null, zalo_token = null, device_id = null } = {}) {
        if (!ma_nv || !password) {
            return { success: false, statusCode: 400, message: GENERIC_LOGIN_ERROR };
        }

        const normalizedIp = normalizeClientIp(ip_address);
        const compositeKey = `composite:${ma_nv}:${normalizedIp}`;
        const rateLimitBlocked = await this._checkLoginRateLimits(ma_nv, normalizedIp, 'unknown');
        if (rateLimitBlocked) {
            return rateLimitBlocked;
        }

        const results = await query('SELECT * FROM employees WHERE ma_nv = ?', [ma_nv]);
        if (!results || results.length === 0) {
            // V5 Unified Auto-Routing Login: Tự động kiểm tra bảng admins nếu không tìm thấy trong bảng employees
            const adminRows = await query('SELECT username FROM admins WHERE LOWER(username) = LOWER(?) LIMIT 1', [String(ma_nv).trim()]);
            if (adminRows && adminRows.length > 0) {
                return await this.adminLogin(adminRows[0].username, password, ip_address, {
                    skipPreCheck: adminRows[0].username === ma_nv
                });
            }

            await this._recordLoginFailure(ma_nv, normalizedIp);

            await logAuditEvent({
                actor_id: ma_nv,
                actor_role: 'unknown',
                action: 'LOGIN_FAILED',
                resource: 'auth',
                details: { reason: 'account_not_found' },
                ip_address: normalizedIp
            });

            return { success: false, message: GENERIC_LOGIN_ERROR };
        }

        const emp = results[0];

        // So sánh mật khẩu trước khi kiểm tra trạng thái khóa (chống Account Enumeration qua mã 403)
        const storedPass = emp.password;
        if (!storedPass || !isBcryptHash(storedPass)) {
            await this._recordLoginFailure(ma_nv, normalizedIp);

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
            await this._recordLoginFailure(ma_nv, normalizedIp);

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

        // ✅ Đăng nhập thành công → Reset rate limiter cho composite key này
        await resetCompositeAttemptsDb(compositeKey);
        await recordKnownLegitIp(ma_nv, normalizedIp);

        // V6 Zero-Password Zalo Auto-Login: CHỈ liên kết zalo_user_id khi có access token đã được server Zalo xác thực
        const loginZaloToken = zalo_access_token || zalo_token;
        let zaloLinked = false;
        if (loginZaloToken && typeof loginZaloToken === 'string' && loginZaloToken.trim().length > 0) {
            const verifiedZalo = await verifyZaloAccessToken(loginZaloToken);
            if (verifiedZalo && verifiedZalo.id) {
                const verifiedZaloId = String(verifiedZalo.id).trim().slice(0, 100);
                if (!zalo_user_id || String(zalo_user_id).trim() === verifiedZaloId) {
                    await query('UPDATE employees SET zalo_user_id = ?, zalo_id = ? WHERE ma_nv = ?', [verifiedZaloId, verifiedZaloId, emp.ma_nv]).catch(() => {});
                    emp.zalo_user_id = verifiedZaloId;
                    emp.zalo_id = verifiedZaloId;
                    zaloLinked = true;
                }
            }
        }
        if (device_id && String(device_id).trim().length > 0 && !emp.bound_device_id) {
            const cleanDevId = String(device_id).trim().slice(0, 140);
            await query('UPDATE employees SET bound_device_id = ? WHERE ma_nv = ?', [cleanDevId, emp.ma_nv]).catch(() => {});
            emp.bound_device_id = cleanDevId;
        }

        const role = resolveUserRole(emp);
        const safeEmp = sanitizeUserResponse(emp);
        safeEmp.role = role;
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
            details: { method: 'employee_login', zalo_linked: zaloLinked, device_id: device_id || null, bcrypt_upgraded: !isBcryptHash(storedPass) },
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

    async zaloAutoLogin({ zalo_user_id, zalo_access_token, zalo_token, device_id, ma_nv_hint = null }, ip_address = '') {
        const cleanZaloId = zalo_user_id ? String(zalo_user_id).trim() : '';
        const cleanDevId = device_id ? String(device_id).trim() : '';
        const cleanHint = ma_nv_hint ? String(ma_nv_hint).trim().toUpperCase() : '';
        const rawZaloToken = zalo_access_token || zalo_token || '';

        // BẮT BUỘC xác thực access token qua Zalo Graph API trên Server (chống giả mạo zalo_user_id)
        const verifiedZalo = rawZaloToken ? await verifyZaloAccessToken(rawZaloToken) : null;
        if (!verifiedZalo || !verifiedZalo.id) {
            return {
                success: false,
                statusCode: 401,
                message: 'Phiên xác thực Zalo không hợp lệ hoặc đã hết hạn, vui lòng mở lại ứng dụng từ Zalo'
            };
        }

        const verifiedZaloId = String(verifiedZalo.id).trim();
        if (cleanZaloId && cleanZaloId !== verifiedZaloId) {
            return {
                success: false,
                statusCode: 401,
                message: 'Phiên xác thực Zalo không hợp lệ hoặc đã hết hạn, vui lòng mở lại ứng dụng từ Zalo'
            };
        }

        let rows = [];
        if (cleanHint) {
            rows = await query(
                `SELECT * FROM employees WHERE ma_nv = ? AND (zalo_user_id = ? OR zalo_id = ?) LIMIT 1`,
                [cleanHint, verifiedZaloId, verifiedZaloId]
            );
        }
        if (!rows || rows.length === 0) {
            rows = await query('SELECT * FROM employees WHERE zalo_user_id = ? OR zalo_id = ? LIMIT 1', [verifiedZaloId, verifiedZaloId]);
        }

        if (!rows || rows.length === 0) {
            return {
                success: false,
                statusCode: 404,
                message: 'Thiết bị chưa được liên kết tài khoản Zalo. Vui lòng đăng nhập bằng Mã NV & Mật khẩu lần đầu để liên kết tự động!'
            };
        }

        const emp = rows[0];
        const isBlocked = emp.status === 'inactive' || emp.status === 'locked' || emp.is_locked === 1 || emp.is_locked === true;
        if (isBlocked) {
            return {
                success: false,
                statusCode: 403,
                message: 'Tài khoản nhân sự của bạn đã bị TẠM KHÓA bởi Quản trị viên!'
            };
        }

        // Nếu đang ở chế độ enforced và có bound_device_id nhưng không có hoặc sai device_id truyền lên
        if (emp.device_binding_mode === 'enforced' && emp.bound_device_id && (!cleanDevId || emp.bound_device_id !== cleanDevId)) {
            return {
                success: false,
                statusCode: 403,
                message: 'Thiết bị hiện tại không khớp với thiết bị đã đăng ký bảo mật!'
            };
        }

        const role = resolveUserRole(emp);
        const safeEmp = sanitizeUserResponse(emp);
        safeEmp.role = role;
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
            action: 'ZALO_AUTO_LOGIN_SUCCESS',
            resource: 'auth',
            details: { method: 'zalo_1touch_auto_login', zalo_user_id: verifiedZaloId, provider: verifiedZalo.provider, device_id: cleanDevId || null },
            ip_address
        });

        return {
            success: true,
            data: {
                ...safeEmp,
                token,
                role,
                must_change_password: Boolean(emp.must_change_password)
            }
        };
    }

    async adminLogin(username, password, ip_address = '', { skipPreCheck = false } = {}) {
        if (!username || !password) {
            return { success: false, message: GENERIC_LOGIN_ERROR };
        }

        // Rate limit theo (admin username, IP), IP rộng & phân tán nhiều IP — dùng chung helper với employeeLogin
        const normalizedIp = normalizeClientIp(ip_address);
        const adminAcctKey = `composite:${username}:${normalizedIp}`;
        if (!skipPreCheck) {
            const rateLimitBlocked = await this._checkLoginRateLimits(username, normalizedIp, 'admin');
            if (rateLimitBlocked) {
                return rateLimitBlocked;
            }
        }

        const results = await query('SELECT * FROM admins WHERE username = ?', [username]);
        if (!results || results.length === 0) {
            await this._recordLoginFailure(username, normalizedIp);

            await logAuditEvent({
                actor_id: username,
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
            await this._recordLoginFailure(username, normalizedIp);

            await logAuditEvent({
                actor_id: username,
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
            await this._recordLoginFailure(username, normalizedIp);

            await logAuditEvent({
                actor_id: username,
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
        await recordKnownLegitIp(username, normalizedIp);

        const safeAdmin = sanitizeUserResponse(admin);
        safeAdmin.role = 'admin';

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

    async changePassword(ma_nv, old_password, new_password, current_user = null) {
        if (!ma_nv) {
            return { success: false, statusCode: 400, message: 'Thiếu mã nhân viên cần đổi mật khẩu!' };
        }
        // Kiểm tra quyền: Chỉ chính nhân viên hoặc admin mới được đổi mật khẩu
        if (current_user && current_user.role !== 'admin' && current_user.ma_nv !== ma_nv) {
            return { success: false, statusCode: 403, message: 'Bạn không có quyền thay đổi mật khẩu của nhân viên khác!' };
        }

        const results = await query('SELECT password FROM employees WHERE ma_nv = ?', [ma_nv]);
        let isPureAdmin = false;
        let currentPass = null;
        if (results && results.length > 0) {
            currentPass = results[0].password;
        } else if (current_user && current_user.role === 'admin') {
            const admResults = await query('SELECT password FROM admins WHERE username = ?', [ma_nv]);
            if (admResults && admResults.length > 0) {
                currentPass = admResults[0].password;
                isPureAdmin = true;
            }
        }
        if (!currentPass) {
            return { success: false, statusCode: 404, message: 'Không tìm thấy tài khoản' };
        }
        if (!isBcryptHash(currentPass)) {
            return { success: false, statusCode: 400, message: 'Mật khẩu hiện tại không hợp lệ hoặc chưa được mã hóa an toàn!' };
        }
        
        // Nếu không phải admin thì bắt buộc phải nhập đúng mật khẩu cũ (dùng bcrypt compare qua Worker Threads)
        if (!current_user || current_user.role !== 'admin') {
            if (!old_password || typeof old_password !== 'string') {
                return { success: false, statusCode: 400, message: 'Vui lòng nhập mật khẩu cũ!' };
            }
            const isOldMatch = await comparePasswordAsync(old_password, currentPass);
            if (!isOldMatch) {
                return { success: false, statusCode: 400, message: 'Mật khẩu cũ không chính xác!' };
            }
        }

        const policyCheck = validatePasswordPolicy(new_password, ma_nv);
        if (!policyCheck.valid) {
            return { success: false, statusCode: 400, message: policyCheck.message };
        }

        // Mã hóa mật khẩu mới bằng bcrypt trước khi lưu & tăng token_version để thu hồi JWT cũ tức thì
        const hashedNew = hashPassword(new_password);
        if (isPureAdmin) {
            await query('UPDATE admins SET password = ?, must_change_password = 0, token_version = COALESCE(token_version, 1) + 1 WHERE username = ?', [hashedNew, ma_nv]);
        } else {
            await query('UPDATE employees SET password = ?, must_change_password = 0, token_version = COALESCE(token_version, 1) + 1 WHERE ma_nv = ?', [hashedNew, ma_nv]);
        }
        invalidateUserCache(ma_nv);

        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : ma_nv,
            actor_role: current_user ? current_user.role : 'worker',
            action: 'CHANGE_PASSWORD',
            resource: isPureAdmin ? 'admins' : 'employees',
            details: { target_ma_nv: ma_nv, token_revoked: true }
        });

        return { success: true, message: 'Đổi mật khẩu thành công!' };
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

    async bindZalo(ma_nv, zalo_token, current_user = null) {
        const employeeService = require('./employeeService');
        return employeeService.bindZalo(ma_nv, zalo_token, current_user);
    }

    async updateAvatar(ma_nv, avatar_url, current_user = null) {
        if (current_user && current_user.role !== 'admin' && current_user.ma_nv !== ma_nv) {
            return { success: false, message: 'Bạn không có quyền cập nhật ảnh đại diện của người khác!' };
        }
        await query('UPDATE employees SET avatar_url = ? WHERE ma_nv = ?', [avatar_url, ma_nv]);
        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : ma_nv,
            actor_role: current_user ? current_user.role : 'worker',
            action: 'UPDATE_AVATAR',
            resource: 'employees',
            details: { target_ma_nv: ma_nv }
        });
        return { success: true };
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
