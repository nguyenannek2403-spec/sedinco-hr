# KẾ HOẠCH VÀ KẾT QUẢ TRIỂN KHAI PHÂN QUYỀN RBAC (SEDINCO HR)
# RBAC IMPLEMENTATION PLAN & EXECUTION REPORT

> **Phiên bản**: 2.0 (Post-Refactor)  
> **Thời điểm cập nhật**: 21/10/2026  
> **Trạng thái**: ĐÃ HOÀN THÀNH TRIỂN KHAI & PASS TOÀN BỘ 24/24 TESTS

---

## 1. MỤC TIÊU TRIỂN KHAI
1. **Chuẩn hóa hệ thống chỉ có đúng 3 Role nghiệp vụ**:
   - `worker`: Công nhân / Nhân viên sử dụng các chức năng cá nhân.
   - `accountant`: Kế toán thực hiện nghiệp vụ chấm công, tính lương, báo cáo theo quyền được cấp.
   - `admin`: Quản trị viên / Ban Giám Đốc toàn quyền hệ thống.
   - Loại bỏ hoàn toàn role `hr`, `manager`, `director` hoặc role thứ 4.
2. **Cơ chế Phân quyền Kế toán Động (Dynamic Accountant Permissions)**:
   - Quản trị viên có toàn quyền bật/tắt từng permission của Kế toán lưu bền vững trong CSDL MySQL.
   - Khi quyền bị thu hồi, Backend lập tức chặn các API tương ứng (Invalidate Cache ngay lập tức).
3. **Thực thi phân quyền tại Backend (Server-side Enforcement)**:
   - 100% các endpoint được bảo vệ bởi middleware `authenticateToken`, `requireAuth`, `requireRole`, `requirePermission`.
   - Khắc phục triệt để các lỗ hổng BOLA/IDOR/BFLA.
4. **Kiểm thử tự động & Bằng chứng thực nghiệm**:
   - Viết và chạy bộ test tự động sử dụng `node:test` và `node:assert/strict`.
   - Kết quả: **24/24 bài test đạt 100%**, frontend build thành công.

---

## 2. MA TRẬN PHÂN QUYỀN VÀ BẢO VỆ API

| Module | Method + Endpoint | Role Được Phép | Permission / Điều Kiện | Data Scope | Ghi Chú Bảo Mật & Validation |
|---|---|---|---|---|---|
| **Xác thực** | `POST /api/login` | Public | Không yêu cầu | Cá nhân | Trả token JWT + role chuẩn (`worker`, `accountant`, `admin`), ghi audit log |
| **Xác thực** | `POST /api/admin/login` | Public | Không yêu cầu | Hệ thống | Trả token JWT + role `admin`, ghi audit log |
| **Xác thực** | `GET /api/me` | Mọi role đã đăng nhập | `requireAuth` | Cá nhân | Trả profile user từ token JWT |
| **Xác thực** | `POST /api/change-password` | `worker`, `accountant`, `admin` | `requireAuth` | Cá nhân / Admin | Chặn đổi mật khẩu của người khác (IDOR Fix) |
| **Bảng lương** | `GET /api/payroll/me` | `worker`, `accountant`, `admin` | `requireAuth` | Cá nhân (`ma_nv`) | Chỉ trả lương của chính người gọi, không lộ toàn công ty |
| **Bảng lương** | `GET /api/payroll` | `accountant`, `admin` | `payroll_view_all` | Toàn công ty | Chặn Worker truy cập (403 Forbidden) |
| **Bảng lương** | `POST /api/payroll/calculate` | `accountant`, `admin` | `payroll_calculate` | Toàn công ty | Tính toán lại bảng lương tháng |
| **Bảng lương** | `POST /api/payroll/approve` | `accountant`, `admin` | `payroll_approve` | Toàn công ty | Mặc định Kế toán bị tắt quyền duyệt lương |
| **Bảng lương** | `PUT /api/payroll/payment-status` | `accountant`, `admin` | `payroll_payment_status_manage` | Toàn công ty | Đánh dấu trạng thái thanh toán |
| **Đơn từ** | `GET /api/requests/me` | `worker`, `accountant`, `admin` | `requireAuth` | Cá nhân (`ma_nv`) | Chỉ xem đơn của chính mình, bảo vệ dữ liệu riêng tư |
| **Đơn từ** | `GET /api/requests` | `accountant`, `admin` | `leave_view_all` | Toàn công ty | Chặn Worker xem đơn người khác (403) |
| **Đơn từ** | `POST /api/requests` | `worker`, `accountant`, `admin` | `requireAuth` | Cá nhân | Worker chỉ được tạo đơn cho chính mình |
| **Đơn từ** | `PUT /api/requests/:id` | `accountant`, `admin` | `leave_approve` | Toàn công ty | **Chặn tự phê duyệt đơn của chính mình (Separation of Duties)** |
| **Chấm công** | `GET /api/attendance/me` | `worker`, `accountant`, `admin` | `requireAuth` | Cá nhân | Xem lịch sử công cá nhân |
| **Chấm công** | `GET /api/attendance` | `accountant`, `admin` | `attendance_view_all` | Toàn công ty | Xem ma trận công 31 ngày |
| **Chấm công** | `POST /api/attendance/update` | Mọi role (có kiểm soát) | `attendance_edit` | Cá nhân / Khác | Worker chỉ sửa công mình; sửa công người khác cần `attendance_edit` |
| **Chấm công** | `POST /api/attendance/lock-period` | `accountant`, `admin` | `attendance_lock` | Kỳ công tháng | Khóa kỳ công chống sửa đổi |
| **Chấm công** | `POST /api/attendance/unlock-period` | `admin` | `requireRole(['admin'])` | Kỳ công tháng | Mở kỳ công đã khóa, yêu cầu lý do |
| **Nhân viên** | `GET /api/employees` | `accountant`, `admin` | `employee_view` | Toàn công ty | Xem danh sách nhân viên |
| **Nhân viên** | `POST /api/employees` | `accountant`, `admin` | `employee_create` | Toàn công ty | Thêm mới nhân sự |
| **Nhân viên** | `PUT /api/employees/:ma_nv/role`| `admin` | `requireRole(['admin'])` | Nhân viên | Chỉ Admin được đổi vai trò |
| **Nhân viên** | `PUT /api/employees/:ma_nv/status`| `accountant`, `admin` | `employee_status_manage` | Nhân viên | Khóa / mở khóa tài khoản |
| **Nhân viên** | `PUT /api/employees/:id` | `accountant`, `admin` | `employee_edit` | Nhân viên | Cập nhật hồ sơ |
| **Nhân viên** | `DELETE /api/employees/:id` | `accountant`, `admin` | `employee_delete` | Nhân viên | Xóa hồ sơ |
| **Cấu hình RBAC**| `GET /api/settings/accountant-permissions` | `accountant`, `admin` | `requireRole(['admin','accountant'])` | Toàn hệ thống | Xem danh sách cấu hình quyền |
| **Cấu hình RBAC**| `PUT /api/settings/accountant-permissions` | `admin` | `requireRole(['admin'])` | Toàn hệ thống | Cập nhật bật/tắt quyền Kế toán, ghi audit log |
| **Kiểm toán** | `GET /api/settings/audit-logs` | `admin` | `requireRole(['admin'])` | Toàn hệ thống | Xem lịch sử kiểm toán |

---

## 3. THAY ĐỔI CƠ SỞ DỮ LIỆU & MIGRATION

1. **Bảng `employees`**:
   - Thêm cột: `role VARCHAR(20) NOT NULL DEFAULT 'worker'`.
   - Migration script tự động chạy khi khởi động server:
     - Nếu chức danh có `"giám đốc"` -> `role = 'admin'`.
     - Nếu chức danh có `"kế toán"` -> `role = 'accountant'`.
     - Còn lại -> `role = 'worker'`.
2. **Bảng `accountant_permissions`**:
   - Lưu trữ danh mục quyền động và trạng thái bật/tắt của Kế toán.
   - Nạp sẵn 13 quyền mặc định an toàn theo đặc tả bằng `INSERT IGNORE` (không ghi đè cấu hình do Admin đã sửa).
3. **Bảng `audit_logs`**:
   - Lưu vết kiểm toán: `id`, `actor_id`, `actor_role`, `action`, `resource`, `details`, `ip_address`, `created_at`.

---

## 4. KẾT QUẢ KIỂM THỬ THỰC TẾ
- **Backend Test Runner**: `node --test __tests__/*.test.js`
- **Số lượng tests**: 24 tests
- **Kết quả**: 24 PASS, 0 FAIL, 0 SKIPPED.
- **Frontend Build**: `npm run build` hoàn thành trong 2.08s, không có lỗi cú pháp hay đóng gói.
