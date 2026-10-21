const test = require('node:test');
const assert = require('node:assert/strict');
const { 
    sanitizeUserResponse, 
    resolveUserRole, 
    SAFE_EMPLOYEE_FIELDS 
} = require('../src/middlewares/authMiddleware');

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

test('TC-SEC-02: Chuẩn hóa đúng 3 Role nghiệp vụ (worker, accountant, admin)', () => {
    // 1. Ưu tiên trường role được cấu hình trực tiếp từ Database
    assert.equal(resolveUserRole({ role: 'admin', chuc_danh: 'Bảo vệ' }), 'admin');
    assert.equal(resolveUserRole({ role: 'accountant', chuc_danh: 'Công nhân' }), 'accountant');
    assert.equal(resolveUserRole({ role: 'worker', chuc_danh: 'Giám đốc chi nhánh' }), 'worker');

    // 2. Fallback dựa trên chức danh nếu chưa có trường role
    assert.equal(resolveUserRole({ chuc_danh: 'Giám Đốc Điều Hành' }), 'admin');
    assert.equal(resolveUserRole({ chuc_danh: 'Phó Giám Đốc Kỹ Thuật' }), 'admin');
    assert.equal(resolveUserRole({ chuc_danh: 'Kế toán trưởng' }), 'accountant');
    assert.equal(resolveUserRole({ chuc_danh: 'Kế toán tiền lương' }), 'accountant');
    assert.equal(resolveUserRole({ chuc_danh: 'Nhân viên bảo vệ' }), 'worker');
    assert.equal(resolveUserRole({ chuc_danh: 'Kỹ sư công trường' }), 'worker');
    assert.equal(resolveUserRole({}), 'worker');
});

test('TC-SEC-03: Kiểm tra câu lệnh SELECT nhân viên không lấy trường password', () => {
    assert.equal(SAFE_EMPLOYEE_FIELDS.includes('password'), false, 'Cột password tuyệt đối không được xuất hiện trong danh sách SELECT!');
});

test('TC-SEC-04: Bảng nhân viên có trường status, is_locked và role', () => {
    assert.equal(SAFE_EMPLOYEE_FIELDS.includes('status'), true, 'Phải có trường status để quản lý trạng thái tài khoản!');
    assert.equal(SAFE_EMPLOYEE_FIELDS.includes('is_locked'), true, 'Phải có trường is_locked để kiểm soát tạm khóa tài khoản!');
    assert.equal(SAFE_EMPLOYEE_FIELDS.includes('role'), true, 'Phải có trường role độc lập để phân quyền chính xác!');
});
