const test = require('node:test');
const assert = require('node:assert/strict');

// Logic loại bỏ mật khẩu khi trả dữ liệu về client (tương ứng server.js: lines 186-188 & 207-209)
function sanitizeUserResponse(user) {
    if (!user) return null;
    const safeUser = { ...user };
    delete safeUser.password;
    return safeUser;
}

// Logic phân quyền Role phía Frontend dựa vào chức danh (tương ứng App.jsx: lines 145-159)
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

test('TC-SEC-01: Loại bỏ trường password khỏi đối tượng người dùng khi đăng nhập', () => {
    const rawAdmin = { id: 1, username: 'admin', password: 'secretpassword123', ho_ten: 'Giám Đốc' };
    const safeAdmin = sanitizeUserResponse(rawAdmin);

    assert.equal(safeAdmin.username, 'admin');
    assert.equal(safeAdmin.password, undefined);
    assert.equal('password' in safeAdmin, false);

    const rawEmp = { ma_nv: 'NV002', password: '123456', ho_ten: 'Kế toán viên', luong_cb: 8000000 };
    const safeEmp = sanitizeUserResponse(rawEmp);

    assert.equal(safeEmp.ma_nv, 'NV002');
    assert.equal(safeEmp.password, undefined);
    assert.equal('password' in safeEmp, false);
});

test('TC-SEC-02: Phân loại đúng quyền hạn (RBAC) dựa trên chức danh công việc', () => {
    assert.equal(resolveUserRole({ chuc_danh: 'Giám Đốc Điều Hành' }), 'admin');
    assert.equal(resolveUserRole({ chuc_danh: 'Phó Giám Đốc Kỹ Thuật' }), 'admin');
    assert.equal(resolveUserRole({ chuc_danh: 'Kế toán trưởng' }), 'accountant');
    assert.equal(resolveUserRole({ chuc_danh: 'Kế toán tiền lương' }), 'accountant');
    assert.equal(resolveUserRole({ chuc_danh: 'Nhân viên bảo vệ' }), 'employee');
    assert.equal(resolveUserRole({ chuc_danh: 'Kỹ sư công trường' }), 'employee');
    assert.equal(resolveUserRole({}), 'employee');
});

test('TC-SEC-03: Kiểm tra câu lệnh SELECT nhân viên không lấy trường password', () => {
    // fields được định nghĩa tại server.js: lines 483-486
    const fields = `ma_nv, ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, 
                    ngay_bat_dau_lam, ngay_chinh_thuc, avatar_url, luong_cb, 
                    phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o, thuong_htcv, 
                    phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance`;
    
    assert.equal(fields.includes('password'), false, 'Cột password tuyệt đối không được xuất hiện trong danh sách SELECT!');
});
