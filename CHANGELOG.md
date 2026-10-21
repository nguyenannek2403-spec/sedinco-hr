# NHẬT KÝ THAY ĐỔI (CHANGELOG) — SEDINCO HR
# REFACTOR RBAC, SECURITY FIXES & CRUD PERFECTION

Tất cả các thay đổi đáng chú ý của dự án Sedinco HR trong đợt chuẩn hóa phân quyền RBAC và hoàn thiện bảo mật ngày 21/10/2026.

---

## [Phiên Bản 2.0.0] - 2026-10-21

### 1. Database & Schema Migration
- **`employees`**:
  - Thêm cột `role VARCHAR(20) NOT NULL DEFAULT 'worker'`.
  - Tự động di chuyển dữ liệu chức danh sang 3 role chuẩn: `worker`, `accountant`, `admin`.
- **`accountant_permissions`**:
  - Tạo mới bảng lưu trữ phân quyền động của Kế toán.
  - Tự động nạp sẵn 13 quyền mặc định theo tiêu chuẩn Least Privilege bằng `INSERT IGNORE` (bảo toàn cấu hình do Admin đã sửa).
- **`audit_logs`**:
  - Tạo mới bảng lưu vết kiểm toán hệ thống (`actor_id`, `actor_role`, `action`, `resource`, `details`, `ip_address`, `created_at`).

### 2. Core Authentication & RBAC Middleware
- **`src/middlewares/authMiddleware.js`**:
  - Thêm hàm tạo `generateToken` và xác minh `verifyToken` sử dụng chuẩn JWT RFC 7519 HMAC-SHA256 bảo mật cao.
  - Chuẩn hóa hàm `resolveUserRole()` ưu tiên cột `role` trong CSDL, loại bỏ role `hr`.
  - Thêm middleware `authenticateToken`: Trích xuất và giải mã Bearer Token.
  - Thêm middleware `requireAuth`: Bắt buộc đăng nhập (HTTP 401).
  - Thêm middleware `requireRole(allowedRoles)`: Kiểm soát vai trò (HTTP 403).
  - Thêm middleware `requirePermission(permissionKey)`: Kiểm tra quyền động của Kế toán từ CSDL với bộ nhớ đệm (Cache TTL 10s) và xóa cache tức thì khi Admin cập nhật.
  - Thêm helper `logAuditEvent`: Ghi nhật ký kiểm toán không đồng bộ, an toàn.
  - Bổ sung cột `role` vào `SAFE_EMPLOYEE_FIELDS`.

### 3. Bảo Vệ Endpoints & Khắc Phục Lỗ Hổng Bảo Mật
- **Bảng lương (`payrollRoutes.js`, `payrollController.js`, `payrollService.js`)**:
  - Thêm endpoint cá nhân `GET /api/payroll/me`: Trả về duy nhất lương của chính `req.user.ma_nv` (Khắc phục BOLA triệt để).
  - Bảo vệ endpoint toàn công ty `GET /api/payroll` với quyền `payroll_view_all`. Worker gọi bị trả 403.
  - Bảo vệ `POST /calculate` (`payroll_calculate`), `POST /approve` (`payroll_approve`), `PUT /payment-status` (`payroll_payment_status_manage`).
- **Đơn từ (`requestRoutes.js`, `requestController.js`, `requestService.js`)**:
  - Thêm endpoint cá nhân `GET /api/requests/me`: Trả về danh sách đơn của chính người gọi.
  - Bảo vệ `GET /api/requests` với quyền `leave_view_all`.
  - Chống tự phê duyệt đơn của chính mình trong `updateRequestStatus`: Ném lỗi HTTP 403 nếu `reqData.employee_id === current_user.ma_nv` khi duyệt `approved`.
  - Chống công nhân mạo danh người khác gửi đơn: Worker chỉ được tạo đơn cho chính mình.
- **Chấm công (`attendanceRoutes.js`, `attendanceController.js`, `attendanceService.js`)**:
  - Thêm endpoint cá nhân `GET /api/attendance/me`.
  - Bảo vệ `GET /api/attendance` với quyền `attendance_view_all`.
  - Bảo vệ `POST /attendance/update`: Worker chỉ sửa công mình; sửa công người khác bắt buộc có quyền `attendance_edit`.
  - Bảo vệ `POST /lock-period` (`attendance_lock`) và `POST /unlock-period` (chỉ Admin).
- **Nhân viên (`employeeRoutes.js`, `employeeController.js`, `employeeService.js`)**:
  - Bảo vệ các thao tác CRUD với các quyền tương ứng: `employee_view`, `employee_create`, `employee_edit`, `employee_delete`, `employee_status_manage`.
  - Chỉ Quản trị viên (`admin`) mới có quyền thay đổi vai trò qua `PUT /:ma_nv/role`.
- **Cấu hình & Phân quyền (`settingsRoutes.js`, `permissionController.js`, `permissionService.js`)**:
  - Thêm `GET /api/settings/accountant-permissions` (Admin & Accountant).
  - Thêm `PUT /api/settings/accountant-permissions` (Chỉ Admin, xóa cache tức thì, ghi audit log).
  - Thêm `GET /api/settings/audit-logs` (Chỉ Admin).

### 4. Đồng Bộ Frontend
- **`constants/roles.js`**:
  - Chuẩn hóa đúng 3 role: `ROLES.WORKER = "worker"`, `ROLES.ACCOUNTANT = "accountant"`, `ROLES.ADMIN = "admin"`.
  - Loại bỏ hoàn toàn role `hr`, giữ alias tương thích ngược `EMPLOYEE = "worker"`.
  - Cập nhật hàm `isTabAllowedForRole` và `hasPermission` hỗ trợ dynamic permission.
- **`DesktopSidebar.jsx`**:
  - Loại bỏ menu role HR.
  - Thêm menu "Phân Quyền Kế Toán" (tab `permissions`) cho Quản trị viên.
- **`AccountantPermissionView.jsx`**:
  - Tạo mới component giao diện cho Quản trị viên bật/tắt trực quan 6 nhóm quyền của Kế toán.
  - Nút nạp cấu hình mặc định (13 quyền chuẩn).
  - Tải và lưu bền vững vào CSDL, hiển thị nhật ký kiểm toán.
- **`pages/index.jsx`**:
  - Chống rò rỉ dữ liệu ở client: Chỉ gọi `/payroll` và `/requests` khi có quyền; người dùng thông thường chỉ gọi `/payroll/me` và `/requests/me`.
  - Gắn tab `permissions` cho Admin ở cả giao diện Desktop và Mobile Simulator.
- **`utils/api.js`**:
  - Tự động lấy Bearer token từ `localStorage` hoặc phiên người dùng để gửi trong mọi request.

### 5. Kiểm Thử Tự Động (QA)
- Tạo mới file test `__tests__/rbac_and_security_deep.test.js` kiểm thử chuyên sâu JWT, 3 roles, dynamic permissions, chống BOLA/IDOR và tự duyệt đơn.
- Nâng cấp `__tests__/security_rules.test.js` xác nhận 3 role chuẩn và cột role độc lập.
- Kết quả kiểm thử: **24/24 tests pass 100%**.
- Build kiểm tra Frontend: `npm run build` thành công 100% không lỗi.
