# SEDINCO HR — ROLE & FEATURE MATRIX (4-SOURCE RECONCILED)

Cập nhật lần cuối: `2026-11-14` | Phiên bản kiểm toán: `V3 Full-Stack QA & Self-Healing`  
Phạm vi kiểm kê đo trực tiếp trên mã nguồn: **3 vai trò nghiệp vụ** (`worker`, `accountant`, `admin`; loại bỏ hoàn toàn `ROLES.HR` / `ROLES.EMPLOYEE`), **41 file `.js/.jsx` Frontend** (`zalo-miniapp-frontend/src/`), **48 file `.js` Backend** (`sedinco_backend/src/`), **129 Express route handlers** (`METHOD + path`), và **13 bảng MySQL/TiDB Cloud** (`accountant_permissions`, `admins`, `attendance`, `attendance_logs`, `audit_logs`, `company_settings`, `employees`, `idempotency_keys`, `login_rate_limits`, `ot_registrations`, `period_locks`, `public_holidays`, `requests`).

---

## 1. Ma trận 3 Vai trò & Phạm vi Giao diện (`zalo-miniapp-frontend/src/constants/roles.js`)

| Vai trò (`ROLES`) | Tên hiển thị | Giao diện gốc | Tab mặc định | Tab được phép (`ROLE_PERMISSIONS.allowedTabs`) |
|---|---|---|---|---|
| `worker` (`employee` chuẩn hóa về `worker`) | Công Nhân / Nhân Viên | `WorkerDashboard.jsx` | `checkin` | `checkin`, `history`, `requests`, `payroll`, `profile` |
| `accountant` | Kế Toán | `DesktopDashboard.jsx` | `matrix` | `matrix`, `requests`, `payroll`, `profile` (+ mở rộng `management` khi có dynamic permission `employee_view`) |
| `admin` | Quản Trị Viên (Giám Đốc) | `DesktopDashboard.jsx` | `matrix` | Toàn bộ: `matrix`, `payroll`, `requests`, `management`, `devices`, `diagnostics`, `company`, `holidays`, `permissions`, `audit_logs`, `profile` |

> [!IMPORTANT]
> `DesktopDashboard.jsx` thực thi đồng bộ route/tab guard qua `isTabAllowedForRole(currentTab, resolvedRole, dynamicPerms)` (redirect ngay về `getDefaultTabForRole(resolvedRole)` qua cả render guard `effectiveTab` lẫn `useEffect`). Cả `POST /api/login` và `POST /api/auth/zalo-auto-login` đều trả `data.dynamic_permissions` để UI kế toán đồng bộ quyền tức thì ngay từ lúc đăng nhập.

---

## 2. Phân tách Quyền Động (`accountant_permissions`) & SoD Cốt lõi (Admin-Only Core)

Hệ thống áp dụng **Separation of Duties (SoD)** kết hợp bảng `accountant_permissions` (hiện có **30 key** trong CSDL cục bộ `sedinco_hr_test` với 9 key mặc định bật và 21 key tắt; `AccountantPermissionView.jsx` quản lý **14 key preset** hiển thị và `invalidatePermissionCache()` xóa cache ngay khi Admin cập nhật):

| Phân hệ / Hành động | `worker` | `accountant` | `admin` | Cơ chế thực thi Backend & UI |
|---|---|---|---|---|
| Tự chấm công 1 chạm (`POST /api/attendance/check-in`) | ✅ | ✅ (chấm công bản thân) | ❌ / Chế độ Worker riêng | `requireAuth` + `idempotencyMiddleware()` |
| Xem lịch sử & Heatmap bản thân (`GET /api/attendance/me`, `payroll/me`, `requests/me`, `leave-balance`) | ✅ | ✅ | ✅ | `requireAuth`, truy vấn khóa chặt theo `req.user.ma_nv` |
| Khiếu nại / Xác nhận phiếu lương cá nhân (`POST /api/payroll/confirm`) | ✅ | ✅ | ✅ | `requireAuth` + `idempotencyMiddleware()` |
| Xem bảng công toàn công ty (`GET /api/attendance`, `stats`, `suspicious-logs`, `logs/:id/image`) | ❌ (`403`) | 🔁 (`attendance_view_all`) | ✅ | `requirePermission('attendance_view_all')` |
| Sửa công trực tiếp trên lưới (`AttendanceMatrixTable.jsx`, `POST /api/attendance/update`) | ❌ (`403`) | 🔁 (`attendance_edit` khi kỳ chưa khóa) | ✅ (khi kỳ chưa khóa) | `canEdit = !isLocked && (effectiveRole === ROLES.ADMIN \|\| (effectiveRole === ROLES.ACCOUNTANT && dynamicPerms?.attendance_edit === true))` + chặn `handleCellClick` |
| Chấm công hộ (`POST /api/attendance/proxy-check-in`) | ❌ (`403`) | ✅ BE / UI theo quyền bảng công | ✅ | `requireRole(['admin', 'accountant'])` + truyền `work_location_type` (`OFFICE` / `FIELD_WORK`) |
| Khóa sổ kỳ công (`POST /api/attendance/lock-period`) | ❌ (`403`) | 🔁 (`attendance_lock`) | ✅ | `requirePermission('attendance_lock')` + `idempotencyMiddleware()` + UI `canLockPeriod` |
| **Mở khóa kỳ công (`POST /api/attendance/unlock-period`)** | ❌ (`403`) | ❌ **Cấm vĩnh viễn (`403`)** | ✅ | `requireRole(['admin'])` + UI `canUnlockPeriod` (**Admin-only SoD Core**) |
| Xem / Quản lý nhân sự (`EmployeeManagementTab.jsx`, `GET/POST/PUT/DELETE /api/employees*`) | ❌ (`403`) | 🔁 Theo từng key `employee_view` / `create` / `edit` (`canEditEmployees`) / `delete` / `shift_manage` | ✅ | BE `requirePermission(...)`; FE `EmployeeManagementTab` ẩn/khóa Thêm, Sửa, Đổi ca, Lịch riêng, Lưu chi tiết khi thiếu `employee_edit` |
| **Đổi Role, Duyệt thiết bị, Chế độ thiết bị, Ép đổi mật khẩu hàng loạt** | ❌ (`403`) | ❌ **Cấm vĩnh viễn (`403`)** | ✅ | BE `requireRole(['admin'])` trên `employeeRoutes.js`; FE khóa tab Thiết bị, Đổi Role, Khóa TK, Batch Force Password theo `isAdmin` |
| Duyệt / Từ chối đơn từ & OT (`RequestsManagementTab.jsx`, `PUT /api/requests/:id`, `ot-registrations/:id`, `batch-approve`) | ❌ (`403`) | 🔁 (`leave_approve` / `attendance_request_approve`, **cấm tự duyệt đơn chính mình — `403`**) | ✅ (cũng bị chặn tự duyệt) | BE `requirePermission('leave_approve')` + SoD self-approval block; FE `canApproveRequest(req)` & lọc `eligiblePendingIds` + thông báo chỉ-xem |
| Tính lương, điều chỉnh & xuất CSV (`PayrollGridTable.jsx`, `GET/POST /api/payroll/calculate`, `adjustments`, `export`) | ❌ (`403`) | 🔁 (`payroll_calculate`, `payroll_export`) | ✅ | BE `requirePermission(...)`, export CSV `{ exportAll: true }` (`<= 5000` NV) + chống CSV formula injection; FE khóa nút Tính lương / Điều chỉnh / Xuất theo `dynamicPerms` |
| **Phê duyệt & Chốt bảng lương / Giải quyết khiếu nại lương** (`POST /api/payroll/approve`, `save`, `resolve-dispute`) | ❌ (`403`) | 🔁 Khóa theo `payroll_approve` + gắn huy hiệu `"Quyền phê duyệt Giám đốc"` trên UI | ✅ | BE `requirePermission('payroll_approve')`; FE `PayrollGridTable.jsx` kiểm tra `payroll_approve` trước khi hiện nút Chốt/Duyệt |
| **Cấu hình công ty, Chi nhánh GPS, IP Wi-Fi, Ngày lễ, Phân quyền Kế toán, Audit Logs, Đăng ký Admin (`POST /api/admin/register`)** | ❌ (`403`; chỉ được `GET` đọc cấu hình & ngày lễ khi đã đăng nhập) | ❌ **Cấm ghi (`403`)** | ✅ | `requireAuth` cho `GET`; `requireRole(['admin'])` cho toàn bộ thao tác ghi/xóa/cleanup và tạo Admin |

---

## 3. Kiểm kê Đầu mối API Backend (`sedinco_backend/src/routes/`)

Tổng số kiểm kê trực tiếp trên Express `app._router`: **129 route handlers** (`METHOD + path`) trải trên các router trong `sedinco_backend/src/routes/`:

1. **Auth & Profile (`authRoutes.js`)**: `POST /api/login`, `/api/admin/login`, `/api/admin/register` (siết password policy + hash), `/api/auth/zalo-auto-login` (alias `/api/zalo-auto-login`), `GET /api/me` (`/api/profile`), `POST /api/change-password` (hỗ trợ cả user trong bảng `employees` và thuần bảng `admins`), `POST /api/update-avatar`.
2. **Attendance (`attendanceRoutes.js`)**: `GET /me`, `/my-logs`, `/my-monthly`, `/period-status`, `/period-lock-status`, `/dynamic-qr`, `/qr` (`requireAuth`); `GET /`, `/suspicious-logs`, `/logs/:id/image`, `/stats` (`requirePermission('attendance_view_all')`); `POST /check-in`, `/update`, `/`, `DELETE /:id` (trả `404` nếu không tồn tại & ghi `DELETE_ATTENDANCE` audit log); `POST /lock-period` (`attendance_lock`); `POST /unlock-period` (`admin`); `POST /proxy-check-in` (`admin`, `accountant`).
3. **Requests & OT (`requestRoutes.js`)**: `GET /leave-balance`, `/me`, `/my`, `POST /` (giới hạn 3 đơn bù công/tháng gồm alias `'ct'`, bảo toàn log `'1'` nếu đơn OT bị từ chối), `PUT /:id/cancel`, `DELETE /:id` (`requireAuth`); `GET/PUT` toàn danh sách, `ot-registrations`, `batch-approve` (`requirePermission('leave_view_all' | 'leave_approve')` + SoD).
4. **Payroll (`payrollRoutes.js`)**: `GET /me`, `/my-payslip`, `POST /confirm` (`requireAuth`); `GET /`, `/status-list` (`payroll_view_all`); `GET/POST /calculate`, `POST /adjustments` (`payroll_calculate`); `POST /approve`, `/save`, `/resolve-dispute` (`payroll_approve`, kiểm tra hợp lệ `new_status` -> `400` và nhân viên tồn tại -> `404`); `GET /export` (`payroll_export`); `PUT /payment-status` (`payroll_payment_status_manage`).
5. **Employees (`employeeRoutes.js`)**: `/bind-zalo` & `/request-device-change` (`requireAuth`); `/:id/permissions` GET (`admin`, `accountant`) & PUT (`admin`); `/:ma_nv/shift` (`shift_manage`); `/:id` (`employee_view` / `create` / `edit` — hỗ trợ cập nhật từng phần & trả `404` khi thiếu mã NV — / `delete` / `status_manage`); các endpoint thiết bị, đổi role, staged-force-password (`admin`).
6. **Company / Holidays / Settings / Client Errors (`companyRoutes.js`, `holidayRoutes.js`, `settingsRoutes.js`, `clientErrorRoutes.js`)**: Toàn bộ endpoint đọc cấu hình (`GET /company`, `GET /company/settings`, `GET /company/penalties`, `GET /holidays`, `GET /settings/penalties`) yêu cầu `authenticateToken + requireAuth`. Toàn bộ mutation & quản trị `audit-logs`, `accountant-permissions` khóa chặt bằng `requireRole(['admin'])`.

---

## 4. Điểm Nghiệp vụ Chưa Chốt / Bán Hoàn Thiện (`NEEDS_BUSINESS_CONFIRMATION`)

- **OT ngày thường chưa đăng ký trước trong `payrollCalculator.js`**: Công thức hiện tại vẫn tính tiền giờ OT kể cả khi không có bản ghi `ot_registrations` duyệt trước — cần xác nhận nghiệp vụ xem có chặn trả lương OT ngoài đơn hay giữ cơ chế hiện tại.
- **`approvePayroll` / `updatePaymentStatus` / `GET /payroll/status-list` (`PARTIALLY_IMPLEMENTED`)**: Chủ yếu ghi Audit Log, chưa lưu bảng trạng thái thanh toán/chốt sổ lương tách biệt trong CSDL (tuân thủ nguyên tắc không thêm bảng mới trên TiDB Cloud).
- **~15 key dư trong bảng `accountant_permissions`**: Chỉ `14` key nằm trong danh sách preset của `AccountantPermissionView.jsx`; các key còn lại cần xác nhận ẩn vĩnh viễn hay gán route bổ sung.
- **Chính sách `device_binding_mode = 'recording'` mặc định & staging `zaloAdapter`**: Staging (`NODE_ENV=staging`) vẫn cho phép mock token và chế độ thiết bị mặc định là `recording` (không chặn cứng khi đổi máy cho tới khi Admin chuyển sang strict).
- **Lương thực lãnh âm khi khoản khấu trừ vượt thu nhập (`PayrollGridTable.jsx`)**: Cần Kế toán trưởng chốt quy tắc có chặn xuống `0 đ` hay giữ số âm để kết chuyển kỳ sau.
