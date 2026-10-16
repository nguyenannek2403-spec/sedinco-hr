const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeUserResponse, resolveUserRole, SAFE_EMPLOYEE_FIELDS } = require('../src/middlewares/authMiddleware');

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
    assert.equal(SAFE_EMPLOYEE_FIELDS.includes('password'), false, 'Cột password tuyệt đối không được xuất hiện trong danh sách SELECT!');
});
