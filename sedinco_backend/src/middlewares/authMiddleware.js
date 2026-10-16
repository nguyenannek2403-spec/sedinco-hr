/**
 * Middleware & Tiện ích Xác thực & Phân quyền (Auth & RBAC)
 * Đã xác minh qua bộ test tự động TC-SEC-01 đến TC-SEC-03
 */

// Loại bỏ trường password nhạy cảm khỏi đối tượng người dùng trước khi gửi về client
function sanitizeUserResponse(user) {
    if (!user) return null;
    const safeUser = { ...user };
    delete safeUser.password;
    return safeUser;
}

// Phân loại vai trò người dùng dựa trên chức danh công việc
function resolveUserRole(emp) {
    if (!emp) return 'employee';
    const title = (emp.chuc_danh || '').toLowerCase();
    if (title.includes('giám đốc') || title.includes('giam doc')) {
        return 'admin';
    } else if (title.includes('kế toán') || title.includes('ke toan')) {
        return 'accountant';
    }
    return 'employee';
}

// Danh sách các cột an toàn khi SELECT bảng employees (không bao giờ SELECT password)
const SAFE_EMPLOYEE_FIELDS = `ma_nv, ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, 
    ngay_bat_dau_lam, ngay_chinh_thuc, avatar_url, luong_cb, 
    phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o, thuong_htcv, 
    phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance`;

module.exports = {
    sanitizeUserResponse,
    resolveUserRole,
    SAFE_EMPLOYEE_FIELDS
};
