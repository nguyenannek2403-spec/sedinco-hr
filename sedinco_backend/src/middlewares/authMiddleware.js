/**
 * Middleware & Tiện ích Xác thực & Phân quyền (Auth & RBAC)
 * Tuân thủ nghiêm ngặt 3 Role chuẩn: 'worker', 'accountant', 'admin'
 * Hỗ trợ JWT Token, Dynamic Accountant Permissions, Audit Logging
 */

const crypto = require('crypto');

// BẮT BUỘC: JWT_SECRET phải có độ dài tối thiểu 32 ký tự, tuyệt đối không dùng secret mặc định yếu ở môi trường chạy
const RAW_JWT_SECRET = process.env.JWT_SECRET;
if (!RAW_JWT_SECRET || RAW_JWT_SECRET.length < 32) {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error('[FATAL SECURITY ERROR] JWT_SECRET bắt buộc phải khai báo trong biến môi trường với độ dài tối thiểu 32 ký tự!');
    }
}
const JWT_SECRET = RAW_JWT_SECRET && RAW_JWT_SECRET.length >= 32
    ? RAW_JWT_SECRET 
    : (process.env.NODE_ENV === 'test' ? 'sedinco-secret-key-test-environment-min-32-chars!' : '');

// Cache quyền kế toán trong memory (TTL: 10 giây)
let permissionsCache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 10000;

function invalidateUserCache() {
    // No-op giữ tương thích API vì trạng thái user được kiểm tra trực tiếp trên DB mỗi request
}

async function verifyUserStatusInDb(user) {
    if (!user || (!user.id && !user.ma_nv && !user.username)) return null;

    try {
        const { query } = require('../config/db');
        if (user.role === 'worker' || user.role === 'accountant' || user.ma_nv) {
            const rows = await query('SELECT ma_nv, role, status, is_locked, COALESCE(token_version, 1) AS token_version FROM employees WHERE ma_nv = ? LIMIT 1', [user.ma_nv || user.id]);
            if (!rows || rows.length === 0) {
                return { notFound: true };
            }
            const emp = rows[0];
            return {
                isLocked: Boolean(emp.is_locked === 1 || emp.status === 'inactive' || emp.status === 'locked'),
                role: emp.role || resolveUserRole(emp),
                tokenVersion: Number(emp.token_version || 1)
            };
        } else if (user.role === 'admin' || user.username) {
            const rows = await query('SELECT id, username, COALESCE(token_version, 1) AS token_version FROM admins WHERE username = ? OR id = ? LIMIT 1', [user.username || user.id, user.id || 0]);
            if (!rows || rows.length === 0) {
                return { notFound: true };
            }
            return {
                isLocked: false,
                role: 'admin',
                tokenVersion: Number(rows[0].token_version || 1)
            };
        }
    } catch {
        return { dbError: true };
    }
    return null;
}

const DEFAULT_JWT_EXPIRES_SECONDS = 30 * 24 * 3600;

function parseJwtExpiresToSeconds(rawVal, fallbackSeconds = DEFAULT_JWT_EXPIRES_SECONDS) {
    if (typeof rawVal === 'number' && Number.isFinite(rawVal) && rawVal > 0) {
        return Math.floor(rawVal);
    }
    const str = String(rawVal || '').trim().toLowerCase();
    if (!str) return fallbackSeconds;
    if (/^\d+$/.test(str)) {
        const secs = Number(str);
        return secs > 0 ? Math.floor(secs) : fallbackSeconds;
    }
    const match = str.match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d)$/);
    if (!match) return fallbackSeconds;
    const val = Number(match[1]);
    const unit = match[2];
    const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
    const total = Math.floor(val * mult);
    return total > 0 ? total : fallbackSeconds;
}

// 1. Tạo JWT Token an toàn không dùng thư viện ngoài (Mặc định 30 ngày hoặc theo JWT_EXPIRES_IN)
function generateToken(payload, expiresInSeconds = null) {
    const resolvedSeconds = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
        ? Math.floor(expiresInSeconds)
        : parseJwtExpiresToSeconds(process.env.JWT_EXPIRES_IN, DEFAULT_JWT_EXPIRES_SECONDS);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + resolvedSeconds;
    const fullPayload = { ...payload, exp };
    const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
}

// 2. Xác minh JWT Token
function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    
    // Sử dụng crypto.timingSafeEqual để chống Timing Attack
    const sigBuf = Buffer.from(signature);
    const expectedSigBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return null; // Token hết hạn
        }
        return payload;
    } catch {
        return null;
    }
}

// 3. Loại bỏ trường password nhạy cảm khỏi đối tượng người dùng trước khi gửi về client
function sanitizeUserResponse(user) {
    if (!user) return null;
    const safeUser = { ...user };
    delete safeUser.password;
    return safeUser;
}

// 4. Phân loại vai trò người dùng chuẩn hóa đúng 3 Role ('worker', 'accountant', 'admin')
function resolveUserRole(emp) {
    if (!emp) return 'worker';
    
    // Ưu tiên trường role được lưu trong Database
    if (emp.role) {
        const r = String(emp.role).toLowerCase();
        if (r === 'admin') return 'admin';
        if (r === 'accountant') return 'accountant';
        if (r === 'worker' || r === 'employee') return 'worker';
    }

    // Fallback nếu role chưa có: Phân loại theo chức danh
    const title = (emp.chuc_danh || '').toLowerCase();
    if (title.includes('giám đốc') || title.includes('giam doc')) {
        return 'admin';
    } else if (title.includes('kế toán') || title.includes('ke toan')) {
        return 'accountant';
    }
    return 'worker';
}

// 5. Lấy danh sách quyền kế toán từ DB với bộ nhớ đệm
async function getAccountantPermissions(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && permissionsCache && (now - cacheTime < CACHE_TTL_MS)) {
        return permissionsCache;
    }
    try {
        const { query } = require('../config/db');
        const rows = await query('SELECT permission_key, is_enabled FROM accountant_permissions');
        const map = {
            accountant_manual_checkin: false
        };
        if (rows && rows.length > 0) {
            for (const r of rows) {
                map[r.permission_key] = Boolean(r.is_enabled);
            }
        }
        permissionsCache = map;
        cacheTime = now;
        return map;
    } catch (err) {
        // Cấu hình mặc định an toàn nếu DB chưa sẵn sàng (17 quyền thực thi chuẩn)
        return {
            attendance_view_all: true,
            attendance_edit: false,
            attendance_lock: false,
            accountant_manual_checkin: false,
            leave_view_all: true,
            leave_approve: false,
            employee_view: true,
            employee_create: false,
            employee_edit: false,
            employee_delete: false,
            employee_status_manage: false,
            shift_manage: false,
            payroll_view_all: true,
            payroll_calculate: true,
            payroll_approve: false,
            payroll_payment_status_manage: false,
            payroll_export: true
        };
    }
}

// 6. Xóa cache quyền kế toán khi Admin cập nhật
function invalidatePermissionCache() {
    permissionsCache = null;
    cacheTime = 0;
}

// 7. Middleware trích xuất và xác thực danh tính người dùng (CHỈ chấp nhận Bearer JWT Token hợp lệ)
// Tuyệt đối KHÔNG tin cậy x-user-role / x-user-id ở bất kỳ môi trường nào
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
    } else if (req.headers['x-access-token']) {
        token = req.headers['x-access-token'];
    }

    if (token) {
        const user = verifyToken(token);
        if (user) {
            // Xác thực tức thì trạng thái tài khoản từ CSDL (Fail-Closed: không cho qua nếu mất kết nối DB)
            const dbCheck = await verifyUserStatusInDb(user);
            if (!dbCheck || dbCheck.dbError) {
                return res.status(503).json({
                    success: false,
                    code: 'AUTH_VERIFICATION_UNAVAILABLE',
                    message: 'Hệ thống đang bận xác thực phiên đăng nhập. Vui lòng thử lại sau giây lát!'
                });
            }
            if (dbCheck.notFound || dbCheck.isLocked) {
                if (typeof req.app?.setCorsHeadersIfAllowed === 'function') {
                    req.app.setCorsHeadersIfAllowed(req, res);
                }
                return res.status(403).json({
                    success: false,
                    code: 'ACCOUNT_REVOKED',
                    message: 'Tài khoản của bạn đã bị TẠM KHÓA hoặc không còn tồn tại trên hệ thống!'
                });
            }
            if (Number(user.token_version || 1) !== Number(dbCheck.tokenVersion || 1)) {
                if (typeof req.app?.setCorsHeadersIfAllowed === 'function') {
                    req.app.setCorsHeadersIfAllowed(req, res);
                }
                return res.status(401).json({
                    success: false,
                    code: 'TOKEN_REVOKED',
                    message: 'Phiên đăng nhập đã hết hạn hoặc tài khoản vừa được cập nhật, vui lòng đăng nhập lại'
                });
            }
            const normalizedDbRole = dbCheck.role === 'employee' ? 'worker' : dbCheck.role;
            const normalizedTokenRole = user.role === 'employee' ? 'worker' : user.role;
            if (normalizedDbRole && normalizedDbRole !== normalizedTokenRole) {
                if (typeof req.app?.setCorsHeadersIfAllowed === 'function') {
                    req.app.setCorsHeadersIfAllowed(req, res);
                }
                return res.status(401).json({
                    success: false,
                    code: 'TOKEN_REVOKED',
                    message: 'Vai trò tài khoản của bạn đã thay đổi, vui lòng đăng nhập lại'
                });
            }
            req.user = user;
            return next();
        }
    }

    req.user = null;
    next();
}

// 8. Middleware bắt buộc phải đăng nhập
function requireAuth(req, res, next) {
    if (!req.user) {
        if (typeof req.app?.setCorsHeadersIfAllowed === 'function') {
            req.app.setCorsHeadersIfAllowed(req, res);
        }
        return res.status(401).json({
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Yêu cầu đăng nhập để truy cập tài nguyên này!',
            request_id: req.id || undefined
        });
    }
    next();
}

// 9. Middleware bắt buộc role
function requireRole(allowedRoles) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return (req, res, next) => {
        if (!req.user) {
            if (typeof req.app?.setCorsHeadersIfAllowed === 'function') {
                req.app.setCorsHeadersIfAllowed(req, res);
            }
            return res.status(401).json({
                success: false,
                code: 'UNAUTHORIZED',
                message: 'Yêu cầu đăng nhập để truy cập tài nguyên này!',
                request_id: req.id || undefined
            });
        }
        const userRole = req.user.role === 'employee' ? 'worker' : req.user.role;
        if (!roles.includes(userRole)) {
            if (typeof req.app?.setCorsHeadersIfAllowed === 'function') {
                req.app.setCorsHeadersIfAllowed(req, res);
            }
            return res.status(403).json({
                success: false,
                code: 'FORBIDDEN',
                message: 'Từ chối truy cập: Tài khoản hiện tại không có quyền thực hiện thao tác này.',
                request_id: req.id || undefined
            });
        }
        next();
    };
}

// 10. Middleware kiểm tra Permission động cho Kế toán
function requirePermission(permissionKey) {
    return async (req, res, next) => {
        if (!req.user) {
            if (typeof req.app?.setCorsHeadersIfAllowed === 'function') {
                req.app.setCorsHeadersIfAllowed(req, res);
            }
            return res.status(401).json({
                success: false,
                code: 'UNAUTHORIZED',
                message: 'Yêu cầu đăng nhập để truy cập tài nguyên này!',
                request_id: req.id || undefined
            });
        }

        const userRole = req.user.role === 'employee' ? 'worker' : req.user.role;

        // Quản trị viên (admin): Toàn quyền
        if (userRole === 'admin') {
            return next();
        }

        // Kế toán (accountant): Kiểm tra permission động do Admin cấu hình
        if (userRole === 'accountant') {
            const permissions = await getAccountantPermissions();
            if (permissions[permissionKey] === true || permissions[permissionKey] === 1) {
                return next();
            }
            if (typeof req.app?.setCorsHeadersIfAllowed === 'function') {
                req.app.setCorsHeadersIfAllowed(req, res);
            }
            return res.status(403).json({
                success: false,
                code: 'FORBIDDEN',
                message: 'Tài khoản Kế toán hiện chưa được Quản trị viên cấp quyền thực hiện nghiệp vụ này. Vui lòng liên hệ Quản trị viên.',
                request_id: req.id || undefined
            });
        }

        // Công nhân (worker): Mặc định không có quyền nghiệp vụ
        if (typeof req.app?.setCorsHeadersIfAllowed === 'function') {
            req.app.setCorsHeadersIfAllowed(req, res);
        }
        return res.status(403).json({
            success: false,
            code: 'FORBIDDEN',
            message: 'Bạn không có quyền thực hiện chức năng nghiệp vụ này. Vui lòng liên hệ Quản trị viên.',
            request_id: req.id || undefined
        });
    };
}

// 11. Helper ghi nhật ký kiểm toán (Audit Log)
async function logAuditEvent({ actor_id, actor_role, action, resource, details, ip_address }) {
    try {
        const { query } = require('../config/db');
        await query(`
            INSERT INTO audit_logs (actor_id, actor_role, action, resource, details, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            actor_id || 'system',
            actor_role || 'unknown',
            action,
            resource,
            typeof details === 'object' ? JSON.stringify(details) : (details || ''),
            ip_address || ''
        ]);
    } catch (err) {
        console.error('❌ Lỗi ghi audit log:', err.message);
    }
}

// Danh sách các cột an toàn khi SELECT bảng employees (không bao giờ SELECT password)
const SAFE_EMPLOYEE_FIELDS = `ma_nv, ho_ten, ngay_sinh, dien_thoai, phone, login_username, COALESCE(NULLIF(theme_preference, ''), 'light') as theme_preference, COALESCE(font_scale, 100) as font_scale, email, chuc_danh, COALESCE(NULLIF(department, ''), 'Khối Công trình') as department, role, 
    ngay_bat_dau_lam, ngay_chinh_thuc, avatar_url, luong_cb, 
    phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o, thuong_htcv, 
    phu_cap_trach_nhiem, phu_cap_tiep_khach, custom_allowances, has_insurance, status, is_locked, COALESCE(must_change_password, 0) as must_change_password,
    bound_device_id, bound_device_name, primary_device_set_at, last_login_device_id, last_login_device_name, last_login_at,
    device_binding_mode, pending_device_id, pending_device_name, device_change_reason, known_devices_json, COALESCE(multi_device_alert, 0) as multi_device_alert, keep_logs, zalo_user_id,
    annual_leave_quota, shift_type, custom_start_time, custom_end_time,
    bank_code, bank_name, bank_account_number, bank_account_name`;

module.exports = {
    generateToken,
    verifyToken,
    sanitizeUserResponse,
    resolveUserRole,
    getAccountantPermissions,
    invalidatePermissionCache,
    invalidateUserCache,
    authenticateToken,
    requireAuth,
    requireRole,
    requirePermission,
    logAuditEvent,
    SAFE_EMPLOYEE_FIELDS
};
