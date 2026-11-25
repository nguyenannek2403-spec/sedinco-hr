# SEDINCO HR — API ENDPOINT INVENTORY (PHASE 2)

Tài liệu kiểm kê **100% API endpoints** của `sedinco_backend` (mount dưới `/api`), đối chiếu trực tiếp với các call sites trong `zalo-miniapp-frontend/src/` và phân loại bắt buộc thành 3 nhóm (không tự ý xóa endpoint chưa dùng trước khi xác minh ngữ cảnh).

---

## Tổng quan phân loại 3 nhóm

- **Nhóm A — Frontend đang gọi trực tiếp (`Frontend-Used`)**: Các endpoint được `zalo-miniapp-frontend/src/` gọi qua `apiClient` hoặc `fetch`.
- **Nhóm B — Dành cho External Integration, Ops / Monitoring / Admin Tool / Phase Extension (`External / Ops / Job / API-Ready`)**: Không có nút bấm tương ứng trên Frontend hiện tại, nhưng phục vụ vận hành hệ thống, chẩn đoán, healthcheck, bảo mật hoặc phần mở rộng API.
- **Nhóm C — Không còn dùng, Alias trùng lặp hoặc Đã khai tử (`Unused / Duplicate Aliases / 410 Gone`)**: Tồn tại song song qua nhiều mount path hoặc phương thức trùng lặp; giữ lại cho tương thích ngược nhưng cần đánh dấu rõ.

---

## Nhóm A: Endpoints Frontend đang sử dụng trực tiếp

| # | Method | Full Path (`/api/...`) | Auth / Middleware | Caller trong Frontend | Ghi chú kiểm định |
|---|---|---|---|---|---|
| 1 | `POST` | `/api/login` | Public | `useAuth.js`, `authService.js` | Đăng nhập NV/KT/Admin theo SĐT/Username/Mã NV |
| 2 | `POST` | `/api/admin/login` | Public | `useAuth.js` (khi `u === "ADMIN"`) | Đăng nhập quản trị viên từ bảng `admins` |
| 3 | `POST` | `/api/auth/zalo-auto-login` | Public | `zalo-auth.service.js` <- `useAuth.js` | Chưa gắn rate limiter đăng nhập |
| 4 | `GET` | `/api/me` | `requireAuth` | `useAuth.js` | Làm mới hồ sơ + `dynamic_permissions` |
| 5 | `GET` | `/api/auth/me` | `requireAuth` | `WorkerProfileTab.jsx` | Trùng với `/api/me` (chỉ khác path) |
| 6 | `GET` | `/api/auth/zalo/status` | `requireAuth` | `zalo-auth.service.js` <- `WorkerProfileTab.jsx` | Kiểm tra liên kết Zalo hiện tại |
| 7 | `POST` | `/api/auth/zalo/link` | `requireAuth` | `zalo-auth.service.js` | Liên kết Zalo vào tài khoản đang đăng nhập |
| 8 | `POST` | `/api/auth/zalo/unlink` | `requireAuth` | `zalo-auth.service.js` | Hủy liên kết Zalo |
| 9 | `POST` | `/api/auth/zalo/verify-phone` | `requireAuth` | `zalo-auth.service.js` | Đối chiếu phone_token từ Zalo |
| 10 | `POST` | `/api/change-password` | `requireAuth` | `ForcePasswordChangeModal.jsx` | Bắt buộc đổi MK (`!canClose`) |
| 11 | `PUT` | `/api/account/credentials` | `requireAuth` | `ForcePasswordChangeModal.jsx` | Tự nguyện đổi thông tin ĐN (`canClose`) |
| 12 | `PUT` | `/api/account/theme` | `requireAuth` | `ThemeContext.jsx` | Lưu `light`/`dark` |
| 13 | `PUT` | `/api/account/preferences` | `requireAuth` | `FontScaleContext.jsx` | Lưu `font_scale` (`100`..`200`) |
| 14 | `PUT` | `/api/account/avatar` | `requireAuth` | `WorkerProfileTab.jsx`, `DesktopDashboard.jsx` | Gắn `avatar_url` sau khi upload `/media/upload` |
| 15 | `POST` | `/api/account/lookup-bank` | `requireAuth` + 25 req/m RAM | `BankCardModal.jsx` | Gọi Casso Paykit |
| 16 | `PUT` | `/api/account/bank-card` | `requireAuth` | `BankCardModal.jsx` | Lưu thông tin ngân hàng cá nhân |
| 17 | `GET` | `/api/attendance/today` | `requireAuth` | `OneTouchCheckIn.jsx` | Trạng thái ca làm hôm nay |
| 18 | `GET` | `/api/attendance/me` | `requireAuth` | `OneTouchCheckIn.jsx`, `WorkerHistoryTab.jsx`, `WorkerProfileTab.jsx` | Lịch công tháng cá nhân |
| 19 | `POST` | `/api/attendance/precheck` | `requireAuth` | `attendance.service.js` | Kiểm tra GPS/Wi-Fi/QR policy trước khi chụp |
| 20 | `POST` | `/api/attendance/check-in` | `requireAuth, idempotency` | `attendance.service.js` | Chấm công 1 chạm + MISA engine |
| 21 | `POST` | `/api/attendance/qr-session` | `requireRole(['admin','accountant'])` | `attendance.service.js` <- `CompanySettingsTab.jsx` | Sinh mã QR Động chi nhánh |
| 22 | `GET` | `/api/attendance/` | `requirePermission('attendance_view_all')` | `AttendanceMatrixTable.jsx` | Ma trận chấm công toàn công ty |
| 23 | `POST` | `/api/attendance/update` | `requireAuth, validateAttendanceMiddleware` | `AttendanceMatrixTable.jsx` | Thiếu `idempotency`; RBAC xử lý trong service |
| 24 | `GET` | `/api/attendance/period-status` | `requireAuth` | `AttendanceMatrixTable.jsx`, `PayrollGridTable.jsx`, `PeriodLockModal.jsx` | Trạng thái khóa kỳ công |
| 25 | `POST` | `/api/attendance/lock-period` | `requirePermission('attendance_lock'), idempotency` | `PeriodLockModal.jsx` | Khóa kỳ công & phát thông báo |
| 26 | `POST` | `/api/attendance/unlock-period` | `requireRole(['admin'])` | `PeriodLockModal.jsx` | Thiếu `idempotency` |
| 27 | `GET` | `/api/requests/me` | `requireAuth` | `WorkerRequestsTab.jsx` | Danh sách đơn cá nhân |
| 28 | `GET` | `/api/requests/leave-balance` | `requireAuth` | `WorkerRequestsTab.jsx`, `SmartLeaveRequestModal.jsx` | Quỹ phép có lương còn lại |
| 29 | `POST` | `/api/requests/` | `requireAuth, idempotency` | `SmartLeaveRequestModal.jsx` | Gửi đơn mới |
| 30 | `PUT` | `/api/requests/:id/cancel` | `requireAuth` | `WorkerRequestsTab.jsx` | Hủy đơn chờ duyệt |
| 31 | `GET` | `/api/requests/by-employees` | `requirePermission('leave_view_all')` | `RequestsManagementTab.jsx` | Đơn gom nhóm theo nhân viên (`LIMIT 600`) |
| 32 | `PUT` | `/api/requests/:id` | `requirePermission('leave_approve'), idempotency` | `RequestsManagementTab.jsx` | Duyệt / Từ chối đơn |
| 33 | `GET` | `/api/payroll/` | `requirePermission('payroll_view_all')` | `PayrollGridTable.jsx` | Bảng lương tổng hợp tháng |
| 34 | `GET` | `/api/payroll/me` | `requireAuth` | `SalarySlipModal.jsx`, `WorkerProfileTab.jsx` | Phiếu lương cá nhân + `daily_breakdown` |
| 35 | `GET` | `/api/payroll/employee/:ma_nv` | `requirePermission('payroll_view_all')` | `SalarySlipModal.jsx` | Chi tiết phiếu lương NV cho Admin/KT |
| 36 | `POST` | `/api/payroll/confirm` | `requireAuth, idempotency` | `SalarySlipModal.jsx` | Xác nhận / Khiếu nại / Đã nhận lương |
| 37 | `POST` | `/api/payroll/resolve-dispute` | `requirePermission('payroll_approve'), idempotency` | `SalarySlipModal.jsx`, `PayrollGridTable.jsx` | Giải quyết khiếu nại lương |
| 38 | `POST` | `/api/payroll/adjustments` | `requirePermission('payroll_calculate'), idempotency` | `PayrollGridTable.jsx` | Thưởng / Phạt / Tạm ứng |
| 39 | `POST` | `/api/payroll/send-report` | `requireRole(['admin'])` | `PayrollGridTable.jsx`, `SalarySlipModal.jsx` | Thiếu `idempotency`; gửi phiếu lương |
| 40 | `POST` | `/api/payroll/mark-paid` | `requireRole(['admin']), idempotency` | `BankTransferModal.jsx` (Admin) | Đánh dấu Đã chuyển khoản (hardcode `PAID`) |
| 41 | `POST` | `/api/payroll/employee-payment-status` | `requirePermission('payroll_payment_status_manage'), idempotency` | `BankTransferModal.jsx` (Kế toán) | Đổi trạng thái thanh toán |
| 42 | `GET` | `/api/employees/` | `requirePermission('employee_view')` | `EmployeeManagementTab.jsx` | Danh sách nhân sự |
| 43 | `POST` | `/api/employees/` | `requirePermission('employee_create')` | `EmployeeManagementTab.jsx` | Thiếu `idempotency` |
| 44 | `PUT` | `/api/employees/:id` | `requirePermission('employee_edit')` | `EmployeeManagementTab.jsx`, `BankTransferModal.jsx` | Cập nhật hồ sơ / ngân hàng / phụ cấp |
| 45 | `PUT` | `/api/employees/:ma_nv/shift` | `requirePermission('shift_manage')` | `EmployeeManagementTab.jsx` | Cấu hình ca & hạn mức phép |
| 46 | `PUT` | `/api/employees/:ma_nv/status` | `requirePermission('employee_status_manage')` | `EmployeeManagementTab.jsx` | Khóa / Mở khóa tài khoản NV |
| 47 | `POST` | `/api/employees/:ma_nv/resolve-devices` | `requireRole(['admin'])` | `EmployeeManagementTab.jsx` | Reset hoặc xác nhận thiết bị hợp lệ |
| 48 | `POST` | `/api/employees/:ma_nv/approve-device-change` | `requireRole(['admin'])` | `EmployeeManagementTab.jsx` | Duyệt đổi thiết bị |
| 49 | `POST` | `/api/employees/:ma_nv/reject-device-change` | `requireRole(['admin'])` | `EmployeeManagementTab.jsx` | Từ chối đổi thiết bị |
| 50 | `GET` | `/api/notifications/my` | `requireAuth` | `useNotifications.js`, `WorkerProfileTab.jsx` | Hộp thư thông báo cá nhân |
| 51 | `GET` | `/api/notifications/summary` | `requireRole(['admin','accountant'])` | `DesktopDashboard.jsx` | Đồng bộ & đếm badge cảnh báo |
| 52 | `PUT` | `/api/notifications/:id/read` | `requireAuth` | `useNotifications.js`, `DesktopDashboard.jsx` | Đánh dấu 1 thông báo đã đọc |
| 53 | `PUT` | `/api/notifications/read-all` | `requireAuth` | `useNotifications.js` | Đánh dấu toàn bộ đã đọc |
| 54 | `GET` | `/api/company/` | `requireAuth` | `CompanySettingsTab.jsx`, `OneTouchCheckIn.jsx`, `attendance.service.js` | Cấu hình công ty & chi nhánh GPS |
| 55 | `PUT` | `/api/company/` | `requireRole(['admin']), idempotency` | `CompanySettingsTab.jsx` | Lưu cấu hình công ty |
| 56 | `POST` | `/api/company/save-wifi-ip` | `requireRole(['admin'])` | `CompanySettingsTab.jsx` | Lưu IP Wi-Fi văn phòng |
| 57 | `POST` | `/api/company/reset-defaults` | `requireRole(['admin'])` | `CompanySettingsTab.jsx` | Khôi phục mặc định |
| 58 | `GET` | `/api/departments/` | `requireAuth` | `useDepartments.js` | Danh sách phòng ban |
| 59 | `POST` | `/api/departments/` | `requireRole(['admin'])` | `CompanySettingsTab.jsx` | Thêm phòng ban |
| 60 | `PUT` | `/api/departments/:id` | `requireRole(['admin'])` | `CompanySettingsTab.jsx` | Đổi tên phòng ban |
| 61 | `DELETE` | `/api/departments/:id` | `requireRole(['admin'])` | `CompanySettingsTab.jsx` | Xóa phòng ban |
| 62 | `GET` | `/api/holidays/` | `requireAuth` | `HolidaysTab.jsx` | Danh sách ngày lễ |
| 63 | `POST` | `/api/holidays/` | `requireRole(['admin'])` | `HolidaysTab.jsx` | Tạo ngày lễ |
| 64 | `PUT` | `/api/holidays/:id` | `requireRole(['admin'])` | `HolidaysTab.jsx` | Sửa ngày lễ |
| 65 | `DELETE` | `/api/holidays/:id` | `requireRole(['admin'])` | `HolidaysTab.jsx` | Xóa ngày lễ |
| 66 | `GET` | `/api/settings/accountant-permissions` | `requireRole(['admin','accountant'])` | `AccountantPermissionView.jsx`, `DesktopDashboard.jsx` | Lấy 30/16 quyền động của Kế toán |
| 67 | `PUT` | `/api/settings/accountant-permissions` | `requireRole(['admin'])` | `AccountantPermissionView.jsx` | Lưu phân quyền Kế toán |
| 68 | `GET` | `/api/settings/audit-logs` | `requireRole(['admin'])` | `AccountantPermissionView.jsx` (`?limit=5`) | Xem nhật ký kiểm toán |
| 69 | `POST` | `/api/media/upload` | `requireAuth, idempotency` | `zalo-media.service.js` | Upload tập trung (Busboy + JSON fallback) |
| 70 | `GET` | `/api/media/:assetUuid/access` | `requireAuth` | `zalo-media.service.js` -> `SecureMediaPreview`, `UserAvatar` | Stream binary hoặc trả URL ký 300s |
| 71 | `GET` | `/api/media/employee/:ma_nv/documents` | `requireAuth` | `zalo-media.service.js` -> `EmployeeManagementTab.jsx` | Danh sách tài liệu NV |
| 72 | `DELETE` | `/api/media/:assetUuid` | `requireAuth` | `zalo-media.service.js` -> `EmployeeManagementTab.jsx`, `MediaStorageManagementTab.jsx` | Xóa media an toàn (check reference) |
| 73 | `GET` | `/api/media/admin/dashboard` | `requireRole(['admin'])` | `MediaStorageManagementTab.jsx` | Thống kê quota/upload |
| 74 | `GET` | `/api/media/admin/assets` | `requireRole(['admin'])` | `MediaStorageManagementTab.jsx` | Danh sách tài sản toàn hệ thống |
| 75 | `POST` | `/api/media/admin/sync-usage` | `requireRole(['admin'])` | `MediaStorageManagementTab.jsx` | Đồng bộ Cloudinary Usage API |
| 76 | `POST` | `/api/media/admin/cleanup-orphans` | `requireRole(['admin'])` | `MediaStorageManagementTab.jsx` | Quét & dọn file mồ côi |
| 77 | `POST` | `/api/client-errors/` | Public (10kb, 30 req/m/IP) | `utils/api.js` (`reportClientError`) | Thu thập lỗi runtime Frontend (nếu bật env) |

---

## Nhóm B: External Integration, Healthcheck, Diagnostics & Backend-Ready Endpoints

*(Chưa gọi từ Frontend UI nhưng phục vụ hạ tầng, admin ops hoặc API workflow mở rộng)*

| # | Method | Full Path (`/api/...`) | Auth / Middleware | Mục đích & Khuyến nghị |
|---|---|---|---|---|
| 1 | `GET` | `/api/health`, `GET /api` | Public | Uptime probe & metrics từ chối (Render/Monitoring) |
| 2 | `GET` | `/api/media/config` | `requireAuth` | Trả cấu hình 13 categories upload cho client/test (wrapper `getMediaConfig` có sẵn ở FE) |
| 3 | `GET` | `/api/diagnostics/status` | `requireRole(['admin'])` + `ENABLE_DIAGNOSTICS` | Kiểm tra env/CORS/DB/git commit trên staging (cảnh báo `execSync` block event loop) |
| 4 | `GET` | `/api/diagnostics/recent-logs` | `requireRole(['admin'])` + `ENABLE_DIAGNOSTICS` | Đọc `logs/staging_events.jsonl` gần nhất |
| 5 | `POST` | `/api/diagnostics/verify-zalo-user` | `requireRole(['admin'])` + `ENABLE_DIAGNOSTICS` | Debug token Zalo trên staging |
| 6 | `POST` | `/api/diagnostics/decode-location` | `requireRole(['admin'])` + `ENABLE_DIAGNOSTICS` | Debug `location_token` Zalo trên staging |
| 7 | `POST` | `/api/admin/register` | `requireRole(['admin'])` | Tạo thêm tài khoản Admin qua CLI/API |
| 8 | `GET` | `/api/payroll/slip` | `requireAuth` | API hợp nhất xem phiếu lương (`me` hoặc Admin/KT truyền `ma_nv`) |
| 9 | `POST` | `/api/payroll/calculate` | `requirePermission('payroll_calculate')` | Kích hoạt tính & auto-resolve dispute theo batch/script |
| 10 | `GET` | `/api/attendance/suspicious-logs` | `requirePermission('attendance_view_all')` | Truy vấn danh sách chấm công nghi vấn |
| 11 | `GET` | `/api/attendance/logs/:id/image` | `requirePermission('attendance_view_all')` | Đọc ảnh check-in từ log ID (hoặc secure media ref) |
| 12 | `GET` | `/api/attendance/stats` | `requirePermission('attendance_view_all')` | Thống kê điểm danh theo ngày |
| 13 | `GET` | `/api/requests/` | `requirePermission('leave_view_all')` | Danh sách đơn dạng phẳng (có phân trang) |
| 14 | `POST` | `/api/requests/ot-pre-register` | `requireAuth, idempotency` | Worker đăng ký OT trước (backend `ot_registrations` hoạt động đầy đủ) |
| 15 | `GET` | `/api/requests/ot-registrations` | `requirePermission('leave_view_all')` | Danh sách đơn OT đăng ký trước |
| 16 | `PUT` | `/api/requests/ot-registrations/:id` | `requirePermission('leave_approve'), idempotency` | Duyệt / Từ chối đơn OT đăng ký trước |
| 17 | `POST` | `/api/requests/batch-approve` | `requirePermission('leave_approve'), idempotency` | Duyệt hàng loạt đơn |
| 18 | `GET` | `/api/employees/:id` | `requirePermission('employee_view')` | Lấy chi tiết 1 nhân viên |
| 19 | `DELETE` | `/api/employees/:id` | `requirePermission('employee_delete')` | **LỖI CRASH** (`ReferenceError: avatar_url is not defined`) |
| 20 | `PUT` | `/api/employees/:ma_nv/role` | `requireRole(['admin'])` | Chuyển đổi role (hiện UI dùng `PUT /employees/:id` với field `role`) |
| 21 | `PUT` | `/api/employees/:ma_nv/device-binding-mode` | `requireRole(['admin'])` | Chuyển mode `strict`/`recording` cho từng NV |
| 22 | `POST` | `/api/employees/staged-force-password` | `requireRole(['admin'])` | Ép đổi mật khẩu hàng loạt có `dry_run` |
| 23 | `GET` | `/api/employees/pending-device-changes` | `requireRole(['admin'])` | Liệt kê danh sách chờ đổi thiết bị |
| 24 | `POST` | `/api/employees/request-device-change` | `requireAuth` | Worker chủ động gửi yêu cầu đổi thiết bị |
| 25 | `POST` | `/api/employees/bind-zalo` | `requireAuth` | API cũ/bổ sung gắn Zalo token từ employee flow |
| 26 | `PUT/POST` | `/api/settings/audit-logs/:id/pin`, `/keep-employee/:ma_nv`, `/cleanup` | `requireRole(['admin'])` | Quản trị ghim & dọn audit log |
| 27 | `GET` & `POST/PUT` | `/api/company/penalties` | `requireAuth` / `requireRole(['admin'])` | API tách riêng cho quy tắc phạt |

---

## Nhóm C: Endpoints Không dùng, Alias Trùng lặp & Đã Khai tử (`410 Gone`)

| Loại | Full Path (`/api/...`) | Thay thế chính thức đang dùng | Vấn đề & Ghi chú |
|---|---|---|---|
| **410 Gone** | `GET /api/attendance/dynamic-qr`, `GET /api/attendance/qr` | `POST /api/attendance/qr-session` | Kiosk QR V5 cũ đã loại bỏ |
| **HTTP GET Mutation (NGUY HIỂM)** | `GET /api/payroll/calculate` | `POST /api/payroll/calculate` | Cho phép ghi DB (`autoResolveSalaryDisputes`) qua phương thức `GET` |
| **Router Mount Trùng** | `/api/permissions/*` | `/api/settings/*` | `routes/index.js` mount cùng `settingsRoutes` ở cả 2 prefix |
| **Router Mount Trùng (x3)** | `/api/settings/departments/*`, `/api/permissions/departments/*` | `/api/departments/*` | `departmentRoutes` bị mount 3 lần |
| **Route Shortcut Trùng (x3)** | `/api/audit-logs*`, `/api/permissions/audit-logs*` | `/api/settings/audit-logs*` | Lặp ở `routes/index.js` và `settingsRoutes` (x2) |
| **Route Shortcut Trùng (x3)** | `/api/settings/alerts-summary`, `/api/permissions/alerts-summary` | `/api/notifications/summary` | 3 URL cùng trỏ `permissionController.getAlertsSummary` |
| **Route Trùng (x3)** | `/api/settings/penalties`, `/api/permissions/penalties` | `/api/company/penalties` (hoặc `GET/PUT /company`) | Mỗi nơi có cả `POST` và `PUT` |
| **Route Lỗi ngữ nghĩa** | `GET/PUT /api/employees/:id/permissions` | `GET/PUT /api/settings/accountant-permissions` | Bỏ qua hoàn toàn `:id`, sửa quyền global của role Kế toán |
| **Alias Auth Trùng** | `POST /api/zalo-auto-login`, `GET /api/profile`, `POST /api/update-avatar` | `/api/auth/zalo-auto-login`, `GET /api/me`, `PUT /api/account/avatar` | Duplicate endpoints |
| **Alias Attendance Trùng** | `GET /api/attendance/my-logs`, `/my-monthly`, `/period-lock-status`, `POST /lock`, `POST /attendance/` | `/me`, `/period-status`, `/lock-period`, `/update` | Duplicate endpoints |
| **Alias Payroll Trùng** | `GET /api/payroll/my-payslip`, `PUT /employee-payment-status`, `POST /employee-paid` | `/me`, `POST /employee-payment-status` | Trùng lặp; `/mark-paid` đọc nhầm `req.params?.ma_nv` không tồn tại |
| **Alias Requests Trùng** | `GET /api/requests/my`, `GET /all`, `DELETE /api/requests/:id` | `GET /me`, `GET /`, `PUT /:id/cancel` | Duplicate endpoints |
| **Alias Employees Trùng** | `GET /pending-device-requests`, `POST /approve-device-change`, `PUT /:ma_nv/approve-device-change`, `POST /:ma_nv/approve-device` (tương tự reject), `POST /:id/toggle-lock`, `POST /batch-require-password-change` | `POST /:ma_nv/approve-device-change`, `PUT /:ma_nv/status`, `POST /staged-force-password` | Tới **4 biến thể** approve/reject device change |
| **Alias Company/Diag Trùng** | `GET/PUT /api/company/settings`, `GET /api/diagnostics/system-status` | `GET/PUT /api/company/`, `GET /api/diagnostics/status` | Duplicate endpoints |
