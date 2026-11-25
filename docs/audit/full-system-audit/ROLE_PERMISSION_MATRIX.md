# SEDINCO HR — ROLE & PERMISSION MATRIX (PHASE 2)

Đối chiếu phân quyền thực tế trên cả **Backend** (`authMiddleware.js`, routes, services) và **Frontend** (`src/constants/roles.js`, các tab/nút bấm).

---

## 1. Ma trận quyền theo Vai trò & Quyền động (RBAC + SoD Matrix)

| Nghiệp vụ / Tài nguyên | Worker (`worker`) | Accountant (`accountant`) | Admin (`admin`) | Cơ chế kiểm soát (Middleware / Service / Frontend) |
|---|---|---|---|---|
| **Đăng nhập & Tài khoản cá nhân** | | | | |
| Đăng nhập / Tự đổi MK / Zalo Link & Unlink | Cho phép | Cho phép | Cho phép (Zalo Link không áp dụng cho bảng `admins`) | `requireAuth` |
| Cập nhật thẻ ngân hàng cá nhân | Cho phép | Cho phép | Chặn ở `authService.updateBankCard` (`403`) | Backend check `role === 'admin'` |
| **Chấm công (Attendance)** | | | | |
| Chấm công 1 chạm (GPS / QR / Công trình) | Cho phép | Cho phép | Chặn (`403` - Admin không thuộc diện chấm công) | `attendanceService.checkInMultiFactor` |
| Xem công & lịch sử cá nhân (`/me`, `/today`) | Cho phép | Cho phép | Trả empty/401 nếu không có `ma_nv` | `requireAuth` + `req.user.ma_nv` |
| Xem bảng công toàn công ty | Cấm (`403`) | Động: `attendance_view_all` | Toàn quyền | BE `requirePermission('attendance_view_all')`; FE `DesktopDashboard` |
| Chấm / Sửa / Xóa công NV khác | Cấm (`403`) | Động: `attendance_edit` (SoD: cấm tự sửa công mình) | Cho phép (SoD: cấm tự sửa nếu có `ma_nv`) | BE `attendanceService.updateAttendanceDaily` |
| Khóa kỳ công (`lock-period`) | Cấm (`403`) | Động: `attendance_lock` ở BE; **BUG FE luôn `false`** | Toàn quyền | BE `requirePermission('attendance_lock')`; FE `PayrollGridTable.jsx:53-55` (LỖI) |
| Mở khóa kỳ công (`unlock-period`) | Cấm (`403`) | **Cấm cứng (Admin SoD Exclusive)** | Toàn quyền | BE `requireRole(['admin'])` |
| **Đơn từ & Tăng ca (Requests & Pre-OT)** | | | | |
| Tạo đơn & Hủy đơn của chính mình | Cho phép | Cho phép | Không tạo cho NV khác nếu target là admin (`403`) | BE `requestService.createRequest`, `cancelRequest` |
| Xem danh sách đơn toàn công ty | Cấm (`403`) | Động: `leave_view_all` | Toàn quyền | BE `requirePermission('leave_view_all')` |
| Duyệt / Từ chối đơn & Pre-OT | Cấm (`403`) | Động: `leave_approve` (SoD: cấm tự duyệt) | Toàn quyền (SoD: cấm tự duyệt) | BE `requirePermission('leave_approve')` + SoD check |
| **Tiền lương & Thanh toán (Payroll)** | | | | |
| Xem phiếu lương cá nhân (`/payroll/me`) | Cho phép (của mình) | Cho phép (của mình) | Chỉ khi truy vấn `/employee/:ma_nv` | `requireAuth` (`ma_nv` scoping) |
| Xác nhận / Báo sai sót / Đã nhận lương | Cho phép (của mình) | Cho phép (của mình) | Cấm (`403`) | `payrollService.confirmOrDisputeSalary` |
| Xem bảng lương toàn công ty | Cấm (`403`) | Động: `payroll_view_all` | Toàn quyền | BE `requirePermission('payroll_view_all')` |
| Điều chỉnh Thưởng/Phạt/Tạm ứng | Cấm (`403`) | Động: `payroll_calculate` (khi kỳ chưa khóa) | Toàn quyền | BE `requirePermission('payroll_calculate')` |
| Giải quyết khiếu nại lương | Cấm (`403`) | Động: `payroll_approve` (SoD: cấm tự giải quyết) | Toàn quyền (SoD: cấm tự giải quyết) | BE `requirePermission('payroll_approve')` + SoD |
| Đánh dấu chuyển khoản (`PAID` / `UNPAID`) | Cấm (`403`) | Động: `payroll_payment_status_manage` | Toàn quyền (`/mark-paid`) | BE `requirePermission` / `requireRole(['admin'])` |
| Gửi báo cáo lương (`send-report`) | Cấm (`403`) | **Cấm cứng (Admin SoD Exclusive)** | Toàn quyền | BE `requireRole(['admin'])` |
| **Nhân sự & Thiết bị (HR & Devices)** | | | | |
| Xem danh sách & chi tiết NV | Cấm (`403`) | Động: `employee_view` | Toàn quyền | BE `requirePermission('employee_view')` |
| Tạo / Sửa hồ sơ NV | Cấm (`403`) | Động: `employee_create` / `employee_edit` | Toàn quyền | BE `requirePermission`; lưu ý KT không gán role `admin`/`accountant` |
| Phân ca & hạn mức phép NV | Cấm (`403`) | Động: `shift_manage` | Toàn quyền | BE `requirePermission('shift_manage')` |
| Khóa / Mở khóa tài khoản NV | Cấm (`403`) | Động: `employee_status_manage` (cảnh báo: KT có thể khóa/mở TK?) | Toàn quyền | BE `requirePermission('employee_status_manage')` |
| Xóa NV (`DELETE /employees/:id`) | Cấm (`403`) | Động: `employee_delete` (lưu ý: API hiện crash) | Toàn quyền (lưu ý: API hiện crash) | BE `requirePermission('employee_delete')` |
| Đổi Role, Duyệt đổi thiết bị, Reset thiết bị, Ép đổi MK | Cấm (`403`) | **Cấm cứng (Admin SoD Exclusive)** | Toàn quyền | BE `requireRole(['admin'])` |
| **Cấu hình Hệ thống, Audit & Media** | | | | |
| Sửa cấu hình Công ty, GPS, Phòng ban, Ngày lễ | Cấm (`403`) | **Cấm cứng (Admin SoD Exclusive)** | Toàn quyền | BE `requireRole(['admin'])` |
| Cấu hình Phân quyền Kế toán & Xem/Ghim/Dọn Audit Log | Cấm (`403`) | Chỉ `GET /settings/accountant-permissions` | Toàn quyền | BE `requireRole(['admin'])` |
| Upload Media (`POST /media/upload`) | Chỉ danh mục tự phục vụ (`avatar_self`, `attendance_snapshot`, `request_evidence`, `salary_dispute_evidence`) | Theo `policy.allowedRoles` + dynamic perm (`employee_edit`, `payroll_view_all`, v.v.) | Mọi danh mục | BE `cloudinaryService.verifyActorActiveAndAuthorized` |
| Xem Media riêng tư (`GET /media/:uuid/access`) | Chỉ file của mình hoặc do mình upload | Xem file của nhân sự công ty (nếu có quyền HR/Payroll/Leave) | Toàn quyền | BE `cloudinaryService.verifyAccessPermission` |
| Xóa Media (`DELETE /media/:uuid`) | Chỉ file draft chưa gắn entity do mình upload | Chỉ file draft do mình upload | Xóa mọi file không còn `liveRefs > 0` | BE `mediaLifecycleService.deleteAssetWithSafetyCheck` |
| Media Dashboard / Usage Sync / Cleanup Orphans | Cấm (`403`) | **Cấm cứng (Admin SoD Exclusive)** | Toàn quyền | BE `requireRole(['admin'])` |
| Diagnostics (`/api/diagnostics/*`) | Cấm (`403`/`404`) | Cấm (`403`/`404`) | Chỉ khi `ENABLE_DIAGNOSTICS === 'true'` | BE `checkDiagnosticsAccess` |

---

## 2. Phân tích 30 Keys DB vs 16 Keys Enforced trên Frontend & Fallback Middleware

- **`initDb.js` seed `30` permission keys** vào bảng `accountant_permissions`.
- **Frontend `AccountantPermissionView.jsx` & `roles.js` (`ACCOUNTANT_ENFORCED_PERMISSION_KEYS`) & Backend `permissionService.js` (`ENFORCED_ACCOUNTANT_KEYS`) & `authMiddleware.js:166` fallback** hiện chuẩn hóa về **16 quyền thực thi thực tế**:
  1. `attendance_view_all`, `attendance_edit`, `attendance_lock`
  2. `leave_view_all`, `leave_approve`
  3. `employee_view`, `employee_create`, `employee_edit`, `employee_delete`, `employee_status_manage`, `shift_manage`
  4. `payroll_view_all`, `payroll_calculate`, `payroll_approve`, `payroll_payment_status_manage`, `payroll_export`
- **14 keys còn lại trong DB** (`attendance_summarize`, `attendance_unlock`, `attendance_request_approve`, `leave_reject`, `request_view_all`, `request_manage`, `report_view`, `report_export`, `company_settings_manage`, `holiday_manage`, `penalty_settings_manage`, `account_manage`, `permission_manage`, `audit_log_view`) tồn tại như di sản/legacy trong `accountant_permissions`, không được route nào kiểm tra qua `requirePermission(...)` và bị ẩn khỏi giao diện phân quyền.

---

## 3. Các lỗ hổng / Bất đồng bộ RBAC cần kiểm chứng (Chuyển sang Phase 3 & Phase 6)

1. **`PayrollGridTable.jsx:53-55` (`canLockPeriod`):** Luôn trả `false` cho Accountant dù Admin đã bật `attendance_lock = true`.
2. **`authMiddleware.js:74-76, 210-233`:** `verifyUserStatusInDb` fail-open khi DB throw error; đồng thời so sánh `dbCheck.role !== user.role` không normalize `'employee'`.
3. **`cloudinaryService.js:383-427` (Cross-Employee Media Dedup Leak):** Khi Admin/Accountant upload cùng 1 file ảnh/PDF cho 2 nhân viên khác nhau (`employee_id` A rồi B), kiểm tra trùng lặp SHA-256 thiếu `employee_id`, trả lại `asset_uuid` của nhân viên A.
4. **`attendanceRoutes.js` + `payrollRoutes.js` (`GET /payroll/calculate`):** Mutation (auto-resolve disputes & calculate) chạy trên HTTP `GET`.
5. **Kế toán có `employee_status_manage` / `employee_edit`:** Kiểm tra xem Kế toán có thể sửa/khóa tài khoản của nhân viên có `role = 'admin'` trong bảng `employees` (nếu có) hay tự chỉnh sửa lương/quyền của chính mình (`employee_edit` self-salary escalation!) không — **sẽ kiểm thử tấn công trực tiếp ở Phase 6 (Red Team)!**
