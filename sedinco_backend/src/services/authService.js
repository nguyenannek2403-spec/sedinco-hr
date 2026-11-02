const { query } = require('../config/db');
const { 
    sanitizeUserResponse, 
    resolveUserRole, 
    generateToken, 
    logAuditEvent 
} = require('../middlewares/authMiddleware');
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

// Bộ nhớ đệm fallback và mock
const accountAttempts = new Map();
const ipAttempts = new Map();

// Thông báo lỗi đăng nhập chung chung — chống User Enumeration
const GENERIC_LOGIN_ERROR = 'Thông tin đăng nhập không hợp lệ!';

function normalizeClientIp(ip_address) {
    if (!ip_address) return 'unknown';
    return String(ip_address).split(',')[0].trim();
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
    async employeeLogin(ma_nv, password, ip_address = '') {
        if (!ma_nv || !password) {
            return { success: false, message: GENERIC_LOGIN_ERROR };
        }

        const normalizedIp = normalizeClientIp(ip_address);
        const compositeKey = `composite:${ma_nv}:${normalizedIp}`;
        const acctKey = `account:${ma_nv}`;
        const ipKey = `ip:${normalizedIp}`;

        // 1. Kiểm tra khóa Composite (TÀI KHOẢN, IP) — Chống DoS Lockout & Chống Brute-force tại IP NAT
        const isKnownIpEarly = await isKnownLegitIp(ma_nv, normalizedIp);
        const acctCheck = await checkRateLimitDb(compositeKey, ACCOUNT_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);
        if (acctCheck.blocked) {
            await logAuditEvent({
                actor_id: ma_nv,
                actor_role: 'unknown',
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

        // 3. Kiểm tra IP quen thuộc (Known Legit IP đã từng đăng nhập thành công)
        const isKnownIp = await isKnownLegitIp(ma_nv, normalizedIp);

        // 4. Kiểm tra bảo vệ toàn cục tài khoản (Tấn công Brute-force phân tán nhiều IP)
        const globalAcctCheck = await checkRateLimitDb(acctKey, ACCOUNT_GLOBAL_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);

        // NGUYÊN TẮC CHỐNG DOS (G6 / G6.1):
        // Khi tài khoản đang bị tấn công dồn dập (>= global threshold):
        // Áp dụng độ trễ điều tiết (throttle delay) đối với IP lạ để triệt tiêu năng lực brute-force.
        // Tuyệt đối KHÔNG khóa cứng từ chối trước mật khẩu ĐÚNG, tránh kẻ xấu khóa hộ tài khoản công nhân.
        const isUnderAttack = globalAcctCheck.blocked || globalAcctCheck.count >= ACCOUNT_SOFT_LOCK_THRESHOLD;
        if (isUnderAttack) {
            const delayMs = process.env.NODE_ENV === 'test' 
                ? (isKnownIp ? 0 : 5) 
                : (isKnownIp ? 0 : Math.min(2000, 500 + (globalAcctCheck.count - ACCOUNT_SOFT_LOCK_THRESHOLD) * 100));
            if (delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            await logAuditEvent({
                actor_id: ma_nv,
                actor_role: 'unknown',
                action: 'ACCOUNT_UNDER_DISTRIBUTED_ATTACK',
                resource: 'auth',
                details: { total_attempts: globalAcctCheck.count, delay_ms: delayMs, ip: normalizedIp, is_known_ip: isKnownIp },
                ip_address: normalizedIp
            });
        }

        const results = await query('SELECT * FROM employees WHERE ma_nv = ?', [ma_nv]);
        if (!results || results.length === 0) {
            // Ghi nhận thất bại vào rate limiter MySQL
            await recordFailedAttemptDb(compositeKey, 'composite', `${ma_nv}:${normalizedIp}`, ACCOUNT_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);
            await recordFailedAttemptDb(acctKey, 'account', ma_nv, ACCOUNT_GLOBAL_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);
            if (normalizedIp && normalizedIp !== 'unknown') {
                await recordFailedAttemptDb(ipKey, 'ip', normalizedIp, IP_MAX_ATTEMPTS, IP_LOCKOUT_SEC);
            }

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
        
        // Kiểm tra xem tài khoản có bị tạm khóa bởi Quản trị viên hay không
        const isBlocked = emp.status === 'inactive' || emp.status === 'locked' || emp.is_locked === 1 || emp.is_locked === true;
        if (isBlocked) {
            return {
                success: false,
                message: 'Tài khoản nhân sự của bạn đã bị TẠM KHÓA bởi Quản trị viên. Vui lòng liên hệ bộ phận Nhân sự hoặc Ban giám đốc!'
            };
        }

        // So sánh mật khẩu bằng bcrypt qua Worker Threads pool
        const storedPass = emp.password;
        if (!storedPass || !isBcryptHash(storedPass)) {
            await recordFailedAttemptDb(compositeKey, 'composite', `${ma_nv}:${normalizedIp}`, ACCOUNT_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);
            await recordFailedAttemptDb(acctKey, 'account', ma_nv, ACCOUNT_GLOBAL_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);
            if (normalizedIp && normalizedIp !== 'unknown') {
                await recordFailedAttemptDb(ipKey, 'ip', normalizedIp, IP_MAX_ATTEMPTS, IP_LOCKOUT_SEC);
            }

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
            // Ghi nhận thất bại vào rate limiter MySQL
            await recordFailedAttemptDb(compositeKey, 'composite', `${ma_nv}:${normalizedIp}`, ACCOUNT_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);
            await recordFailedAttemptDb(acctKey, 'account', ma_nv, ACCOUNT_GLOBAL_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);
            if (normalizedIp && normalizedIp !== 'unknown') {
                await recordFailedAttemptDb(ipKey, 'ip', normalizedIp, IP_MAX_ATTEMPTS, IP_LOCKOUT_SEC);
            }

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

        // ✅ Đăng nhập thành công → Reset rate limiter cho composite key này
        await resetCompositeAttemptsDb(compositeKey);
        await recordKnownLegitIp(ma_nv, normalizedIp);

        const role = resolveUserRole(emp);
        const safeEmp = sanitizeUserResponse(emp);
        safeEmp.role = role;
        
        const token = generateToken({
            id: emp.ma_nv,
            ma_nv: emp.ma_nv,
            role: role,
            ho_ten: emp.ho_ten
        });

        await logAuditEvent({
            actor_id: emp.ma_nv,
            actor_role: role,
            action: 'LOGIN_SUCCESS',
            resource: 'auth',
            details: { method: 'employee_login', bcrypt_upgraded: !isBcryptHash(storedPass) },
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

    async adminLogin(username, password, ip_address = '') {
        if (!username || !password) {
            return { success: false, message: GENERIC_LOGIN_ERROR };
        }

        // Rate limit theo (admin username, IP) — composite key trong MySQL
        const normalizedIp = normalizeClientIp(ip_address);
        const adminAcctKey = `composite:${username}:${normalizedIp}`;
        const acctCheck = await checkRateLimitDb(adminAcctKey, ACCOUNT_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);
        if (acctCheck.blocked) {
            return { 
                success: false, 
                statusCode: 429,
                message: `Tài khoản đã bị tạm khóa đăng nhập do nhập sai quá ${ACCOUNT_MAX_ATTEMPTS} lần. Vui lòng thử lại sau ${acctCheck.remainSec} giây!`
            };
        }

        const results = await query('SELECT * FROM admins WHERE username = ?', [username]);
        if (!results || results.length === 0) {
            await recordFailedAttemptDb(adminAcctKey, 'composite', `${username}:${normalizedIp}`, ACCOUNT_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);

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
            await recordFailedAttemptDb(adminAcctKey, 'composite', `${username}:${normalizedIp}`, ACCOUNT_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);

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
            await recordFailedAttemptDb(adminAcctKey, 'composite', `${username}:${normalizedIp}`, ACCOUNT_MAX_ATTEMPTS, ACCOUNT_LOCKOUT_SEC);

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

        // ✅ Đăng nhập thành công → Reset rate limiter cho composite key
        await resetCompositeAttemptsDb(adminAcctKey);

        const safeAdmin = sanitizeUserResponse(admin);
        safeAdmin.role = 'admin';

        const token = generateToken({
            id: admin.id,
            username: admin.username,
            role: 'admin',
            ho_ten: admin.ho_ten
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
        // Kiểm tra quyền: Chỉ chính nhân viên hoặc admin mới được đổi mật khẩu
        if (current_user && current_user.role !== 'admin' && current_user.ma_nv !== ma_nv) {
            return { success: false, message: 'Bạn không có quyền thay đổi mật khẩu của nhân viên khác!' };
        }

        const results = await query('SELECT password FROM employees WHERE ma_nv = ?', [ma_nv]);
        if (!results || results.length === 0) {
            return { success: false, message: 'Không tìm thấy nhân viên' };
        }
        const currentPass = results[0].password;
        if (!currentPass || !isBcryptHash(currentPass)) {
            return { success: false, message: 'Mật khẩu hiện tại không hợp lệ hoặc chưa được mã hóa an toàn!' };
        }
        
        // Nếu không phải admin thì bắt buộc phải nhập đúng mật khẩu cũ (dùng bcrypt compare qua Worker Threads)
        if (!current_user || current_user.role !== 'admin') {
            const isOldMatch = await comparePasswordAsync(old_password, currentPass);
            if (!isOldMatch) {
                return { success: false, message: 'Mật khẩu cũ không chính xác!' };
            }
        }

        const policyCheck = validatePasswordPolicy(new_password, ma_nv);
        if (!policyCheck.valid) {
            return { success: false, message: policyCheck.message };
        }

        // Mã hóa mật khẩu mới bằng bcrypt trước khi lưu
        const hashedNew = hashPassword(new_password);
        await query('UPDATE employees SET password = ?, must_change_password = 0 WHERE ma_nv = ?', [hashedNew, ma_nv]);

        await logAuditEvent({
            actor_id: current_user ? (current_user.ma_nv || current_user.username) : ma_nv,
            actor_role: current_user ? current_user.role : 'worker',
            action: 'CHANGE_PASSWORD',
            resource: 'employees',
            details: { target_ma_nv: ma_nv }
        });

        return { success: true, message: 'Đổi mật khẩu thành công!' };
    }

    async updateAvatar(ma_nv, avatar_url, current_user = null) {
        if (current_user && current_user.role !== 'admin' && current_user.ma_nv !== ma_nv) {
            return { success: false, message: 'Bạn không có quyền cập nhật ảnh đại diện của người khác!' };
        }
        await query('UPDATE employees SET avatar_url = ? WHERE ma_nv = ?', [avatar_url, ma_nv]);
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

module.exports = new AuthService();
module.exports.validatePasswordPolicy = validatePasswordPolicy;
module.exports.GENERIC_LOGIN_ERROR = GENERIC_LOGIN_ERROR;
