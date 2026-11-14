# SEDINCO HR — ROLE & FEATURE MATRIX (4-SOURCE RECONCILED)

Cập nhật lần cuối: `2026-11-14` | Phiên bản nhánh QA: `qa/full-audit-self-heal`  
Phạm vi kiểm kê: **3 vai trò nghiệp vụ** (`worker`, `accountant`, `admin`), **41 module Frontend** (`zalo-miniapp-frontend/src/`), **48 module Backend** (`sedinco_backend/src/`), **115 Express route handlers**, và **13 bảng MySQL/TiDB Cloud chủ lực**.

---

## 1. Ma trận 3 Vai trò & Phạm vi Giao diện (`zalo-miniapp-frontend/src/constants/roles.js`)

| Vai trò (`ROLES`) | Tên hiển thị | Giao diện gốc | Tab mặc định | Tab được phép (`ROLE_PERMISSIONS.allowedTabs`) |
|---|---|---|---|---|
| `worker` (`employee` alias) | Công Nhân / Nhân Viên | `WorkerDashboard.jsx` | `checkin` | `checkin`, `history`, `requests`, `payroll`, `profile` |
| `accountant` | Kế Toán | `DesktopDashboard.jsx` | `matrix` | `matrix`, `requests`, `payroll`, `profile` (+ mở rộng `management` nếu có dynamic permission `employee_view`) |
| `admin` | Quản Trị Viên (Giám Đốc) | `DesktopDashboard.jsx` | `matrix` | Toàn bộ: `matrix`, `payroll`, `requests`, `management`, `devices`, `diagnostics`, `company`, `holidays`, `permissions`, `audit_logs`, `profile` |

> [!IMPORTANT]
> `DesktopDashboard.jsx` thực thi đồng bộ route/tab guard qua `isTabAllowedForRole(currentTab, resolvedRole, dynamicPerms)` (redirect ngay về `getDefaultTabForRole(resolvedRole)` bằng cả render guard `effectiveTab` lẫn `useEffect` khi chuyển vai trò hoặc nhận tab không hợp lệ).

---

## 2. Phân tách Quyền Động (`accountant_permissions`) & SoD Cốt lõi (Admin-Only Core)

Hệ thống áp dụng **Separation of Duties (SoD)** nghiêm ngặt kết hợp kiểm tra động không cache trễ (`invalidatePermissionCache()` ngay khi Admin lưu phân quyền trong `PermissionService.updateAccountantPermissions`):

| Phân hệ / Hành động | `worker` | `accountant` | `admin` | Cơ chế thực thi Backend & UI |
|---|---|---|---|---|
| Tự chấm công 1 chạm (`POST /api/attendance/check-in`) | ✅ | ✅ (chấm công bản thân) | ❌ / Chế độ Worker riêng | `requireAuth` + `idempotencyMiddleware()` |
| Xem lịch sử & Heatmap bản thân (`GET /api/attendance/me`, `payroll/me`, `requests/me`, `leave-balance`) | ✅ | ✅ | ✅ | `requireAuth`, truy vấn khóa chặt theo `req.user.ma_nv` |
| Khiếu nại / Xác nhận phiếu lương cá nhân (`POST /api/payroll/confirm`) | ✅ | ✅ | ✅ | `requireAuth` + `idempotencyMiddleware()` |
| Xem bảng công toàn công ty (`GET /api/attendance`, `stats`, `suspicious-logs`, `logs/:id/image`) | ❌ (`403`) | 🔁 (`attendance_view_all`) | ✅ | `requirePermission('attendance_view_all')` |
| Chấm công hộ (`POST /api/attendance/proxy-check-in`) | ❌ (`403`) | ✅ | ✅ | `requireRole(['admin', 'accountant'])` + hỗ trợ `work_location_type` (`OFFICE` / `FIELD_WORK`) |
| Khóa sổ kỳ công (`POST /api/attendance/lock-period`) | ❌ (`403`) | 🔁 (`attendance_lock`) | ✅ | `requirePermission('attendance_lock')` + `idempotencyMiddleware()` |
| **Mở khóa kỳ công (`POST /api/attendance/unlock-period`)** | ❌ (`403`) | ❌ **Cấm vĩnh viễn (`403`)** | ✅ | `requireRole(['admin'])` — **Admin-only SoD Core** |
| Xem / Quản lý nhân sự (`GET/POST/PUT/DELETE /api/employees*`) | ❌ (`403`) | 🔁 Theo từng key `employee_*` / `shift_manage` | ✅ | `requirePermission(...)`; đổi `shift` yêu cầu `shift_manage` |
| **Đổi Role, Duyệt thiết bị, Chế độ thiết bị, Ép đổi mật khẩu hàng loạt** | ❌ (`403`) | ❌ **Cấm vĩnh viễn (`403`)** | ✅ | `requireRole(['admin'])` trên `employeeRoutes.js` |
| Duyệt / Từ chối đơn từ & OT (`PUT /api/requests/:id`, `ot-registrations/:id`, `batch-approve`) | ❌ (`403`) | 🔁 (`leave_approve`, **cấm tự duyệt đơn chính mình — 403**) | ✅ (cũng bị chặn tự duyệt) | `requirePermission('leave_approve')` + SoD self-approval block |
| Tính lương, điều chỉnh & xuất CSV (`GET/POST /api/payroll/calculate`, `adjustments`, `export`) | ❌ (`403`) | 🔁 (`payroll_calculate`, `payroll_export`) | ✅ | `requirePermission(...)`, export CSV dùng `{ exportAll: true }` (`<= 5000` NV) + chống CSV formula injection |
| **Phê duyệt & Chốt bảng lương / Giải quyết khiếu nại lương** (`POST /api/payroll/approve`, `save`, `resolve-dispute`) | ❌ (`403`) | 🔁 Cấm theo SoD core hoặc khóa quyền `payroll_approve` trên route + gắn huy hiệu `"Quyền phê duyệt Giám đốc"` trên UI | ✅ | `requirePermission('payroll_approve')` + `AccountantPermissionView.jsx` |
| **Cấu hình công ty, Chi nhánh GPS, IP Wi-Fi, Ngày lễ, Phân quyền Kế toán, Audit Logs** | ❌ (`403`; chỉ được `GET` đọc cấu hình & ngày lễ khi đã đăng nhập) | ❌ **Cấm ghi (`403`)** | ✅ | `requireAuth` cho `GET`; `requireRole(['admin'])` cho toàn bộ thao tác ghi/xóa/cleanup |

---

## 3. Kiểm kê Đầu mối API Backend (`sedinco_backend/src/routes/`)

Tổng số: **115 route handlers** trải trên 8 router (`authRoutes.js`, `attendanceRoutes.js`, `companyRoutes.js`, `employeeRoutes.js`, `holidayRoutes.js`, `payrollRoutes.js`, `requestRoutes.js`, `settingsRoutes.js` + `clientErrorRoutes.js`):

1. **Auth & Profile (`authRoutes.js`)**: `POST /api/login`, `/api/admin/login`, `/api/admin/register`, `/api/auth/zalo-auto-login` (alias `/api/zalo-auto-login`), `GET /api/me` (`/api/profile`), `POST /api/change-password`, `POST /api/update-avatar` (đều qua `authenticateToken + requireAuth`, riêng admin/login kiểm tra nghiêm role).
2. **Attendance (`attendanceRoutes.js`)**: `GET /me`, `/my-logs`, `/my-monthly`, `/period-status`, `/period-lock-status`, `/dynamic-qr`, `/qr` (`requireAuth`); `GET /`, `/suspicious-logs`, `/logs/:id/image`, `/stats` (`requirePermission('attendance_view_all')`); `POST /check-in`, `/update`, `/` (`requireAuth` + period lock guard); `POST /lock-period` (`attendance_lock`); `POST /unlock-period` (`admin`); `POST /proxy-check-in` (`admin`, `accountant`).
3. **Requests & OT (`requestRoutes.js`)**: `GET /leave-balance`, `/me`, `/my`, `POST /`, `PUT /:id/cancel`, `DELETE /:id` (`requireAuth`); `GET/PUT` toàn danh sách, `ot-registrations`, `batch-approve` (`requirePermission('leave_view_all' | 'leave_approve')` + SoD).
4. **Payroll (`payrollRoutes.js`)**: `GET /me`, `/my-payslip`, `POST /confirm` (`requireAuth`); `GET /`, `/status-list` (`payroll_view_all`); `GET/POST /calculate`, `POST /adjustments` (`payroll_calculate`); `POST /approve`, `/save`, `/resolve-dispute` (`payroll_approve`); `GET /export` (`payroll_export`); `PUT /payment-status` (`payroll_payment_status_manage`).
5. **Employees (`employeeRoutes.js`)**: `/bind-zalo` & `/request-device-change` (`requireAuth`); `/:id/permissions` GET (`admin`, `accountant`) & PUT (`admin`); `/:ma_nv/shift` (`shift_manage`); `/:id` & danh sách (`employee_view` / `create` / `edit` / `delete` / `status_manage`); các endpoint thiết bị, đổi role, staged-force-password (`admin`).
6. **Company / Holidays / Settings (`companyRoutes.js`, `holidayRoutes.js`, `settingsRoutes.js`)**: Toàn bộ endpoint đọc cấu hình (`GET /company`, `GET /company/settings`, `GET /company/penalties`, `GET /holidays`, `GET /settings/penalties`) yêu cầu `authenticateToken + requireAuth` (chống rò rỉ GPS nhà máy & Wi-Fi IP cho người lạ). Toàn bộ mutation & quản trị `audit-logs`, `accountant-permissions` khóa chặt bằng `requireRole(['admin'])`.
