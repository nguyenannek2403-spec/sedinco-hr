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

// B7 (G4): Xác thực trực tiếp trạng thái tài khoản và vai trò từ CSDL ở MỖI request (0-delay)
const userStatusCache = new Map();
const USER_CACHE_TTL_MS = 0; // Đọc trực tiếp từ CSDL tại mỗi request

function invalidateUserCache(identifier) {
    if (identifier) {
        userStatusCache.delete(String(identifier));
    } else {
        userStatusCache.clear();
    }
}

async function verifyUserStatusInDb(user) {
    if (!user || (!user.id && !user.ma_nv && !user.username)) return null;
    const identifier = user.ma_nv || user.id || user.username;
    const now = Date.now();

    try {
        const { query } = require('../config/db');
        if (user.role === 'worker' || user.role === 'accountant' || user.ma_nv) {
            const rows = await query('SELECT ma_nv, role, status, is_locked FROM employees WHERE ma_nv = ? LIMIT 1', [user.ma_nv || user.id]);
            if (!rows || rows.length === 0) {
                const data = { notFound: true };
                userStatusCache.set(String(identifier), { time: now, data });
                return data;
            }
            const emp = rows[0];
            const data = {
                isLocked: Boolean(emp.is_locked === 1 || emp.status === 'inactive' || emp.status === 'locked'),
                role: emp.role || resolveUserRole(emp)
            };
            userStatusCache.set(String(identifier), { time: now, data });
            return data;
        } else if (user.role === 'admin' || user.username) {
            const rows = await query('SELECT id, username FROM admins WHERE username = ? OR id = ? LIMIT 1', [user.username || user.id, user.id || 0]);
            if (!rows || rows.length === 0) {
                const data = { notFound: true };
                userStatusCache.set(String(identifier), { time: now, data });
                return data;
            }
            const data = { isLocked: false, role: 'admin' };
            userStatusCache.set(String(identifier), { time: now, data });
            return data;
        }
    } catch {
        return null;
    }
    return null;
}

// 1. Tạo JWT Token an toàn không dùng thư viện ngoài
function generateToken(payload, expiresInSeconds = 7 * 24 * 3600) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
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
        const map = {};
        if (rows && rows.length > 0) {
            for (const r of rows) {
                map[r.permission_key] = Boolean(r.is_enabled);
            }
        }
        permissionsCache = map;
        cacheTime = now;
        return map;
    } catch (err) {
        // Cấu hình mặc định an toàn nếu DB chưa sẵn sàng
        return {
            attendance_view_all: true,
            attendance_summarize: true,
            attendance_edit: false,
            attendance_lock: false,
            leave_view_all: true,
            leave_approve: false,
            attendance_request_approve: false,
            payroll_view_all: true,
            payroll_calculate: true,
            payroll_export: true,
            payroll_approve: false,
            employee_view: true,
            employee_edit: false,
            report_view: true
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
            // Xác thực tức thì trạng thái tài khoản từ CSDL (Chống dùng token cũ khi bị khóa hoặc đổi vai trò)
            const dbCheck = await verifyUserStatusInDb(user);
            if (dbCheck) {
                if (dbCheck.notFound || dbCheck.isLocked) {
                    return res.status(403).json({
                        success: false,
                        message: 'Tài khoản của bạn đã bị TẠM KHÓA hoặc không còn tồn tại trên hệ thống!'
                    });
                }
                if (dbCheck.role && dbCheck.role !== user.role) {
                    return res.status(403).json({
                        success: false,
                        message: 'Vai trò tài khoản của bạn đã thay đổi. Vui lòng đăng nhập lại!'
                    });
                }
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
const SAFE_EMPLOYEE_FIELDS = `ma_nv, ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, COALESCE(NULLIF(department, ''), 'Khối Công trình') as department, role, 
    ngay_bat_dau_lam, ngay_chinh_thuc, avatar_url, luong_cb, 
    phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o, thuong_htcv, 
    phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance, status, is_locked,
    bound_device_id, device_binding_mode, pending_device_id, device_change_reason, keep_logs, zalo_user_id,
    annual_leave_quota, shift_type, custom_start_time, custom_end_time`;

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
