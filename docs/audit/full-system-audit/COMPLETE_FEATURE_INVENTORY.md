# SEDINCO HR — COMPLETE FEATURE INVENTORY (PHASE 2)

Tài liệu liệt kê toàn bộ tính năng hiện có của hệ thống trên cả **Frontend** và **Backend**, kèm đường dẫn nguồn, vai trò được phép và ghi chú trạng thái thực tế phát hiện trong code.

---

## 1. Nhóm tính năng Xác thực, Tài khoản & Tích hợp Zalo

| ID | Tính năng | Vai trò | Frontend Entry | Backend Entry | Trạng thái / Ghi chú |
|---|---|---|---|---|---|
| FEAT-AUTH-01 | Đăng nhập bằng SĐT / Tên ĐN / Mã NV + Mật khẩu | Worker, Accountant, Admin | `AuthView.jsx` -> `useAuth.login` | `POST /api/login` (`authService.employeeLogin`), fallback `POST /api/admin/login` | Hoạt động; rate limit toàn cục 30 lần chỉ delay 2s chưa chặn 429 |
| FEAT-AUTH-02 | Đăng nhập nhanh 1 chạm bằng Zalo | Worker, Accountant | `AuthView.jsx` -> `zalo-auth.service.requestZaloIdentityForLogin` | `POST /api/auth/zalo-auto-login` (`authService.zaloAutoLogin`) | Hoạt động (test dùng mock token); chưa gắn login rate limiter |
| FEAT-AUTH-03 | Bắt buộc đổi mật khẩu lần đầu & Đổi thông tin ĐN | All | `ForcePasswordChangeModal.jsx` | `POST /api/change-password`, `PUT /api/account/credentials` | Hoạt động; `new_username`/`phone` check trùng chéo `employees` & `admins` |
| FEAT-AUTH-04 | Liên kết / Hủy liên kết tài khoản Zalo & Xác minh SĐT Zalo | Worker, Accountant | `WorkerProfileTab.jsx` -> `zalo-auth.service` | `GET /api/auth/zalo/status`, `POST /api/auth/zalo/link|unlink|verify-phone` | Hoạt động (`zaloAdapter.js`) |
| FEAT-AUTH-05 | Khôi phục phiên JWT + Kiểm tra trạng thái DB thời gian thực | All | `useAuth.js` (`GET /api/me`) | `authMiddleware.authenticateToken` | **Rủi ro:** fail-open nếu DB lỗi; `userStatusCache` không được đọc/giải phóng |
| FEAT-AUTH-06 | Tùy chỉnh giao diện Sáng/Tối & Cỡ chữ lớn (`100%`–`200%`) | All | `ThemeContext.jsx`, `FontScaleContext.jsx`, `FontScaleSelector` | `PUT /api/account/theme`, `PUT /api/account/preferences` | Hoạt động; đồng bộ Zalo Storage + DB |
| FEAT-AUTH-07 | Cập nhật / Xóa Avatar cá nhân | All | `WorkerProfileTab.jsx`, `DesktopDashboard.jsx` -> `UserAvatar` | `PUT /api/account/avatar` / `POST /api/media/upload` | Tích hợp Cloudinary + vòng đời `orphan_candidate` |
| FEAT-AUTH-08 | Đăng ký Admin phụ | Admin | *Không có UI Frontend* | `POST /api/admin/register` | Backend-only endpoint |

---

## 2. Nhóm tính năng Chấm công & MISA Engine

| ID | Tính năng | Vai trò | Frontend Entry | Backend Entry | Trạng thái / Ghi chú |
|---|---|---|---|---|---|
| FEAT-ATT-01 | Kiểm tra trước khi chấm công (Precheck geofence/Wi-Fi/policy/lock) | Worker, Accountant | `attendance.service.executeSmartAttendanceFlow` | `POST /api/attendance/precheck` | Hoạt động |
| FEAT-ATT-02 | Chấm công 1 chạm (GPS / Wi-Fi / QR Động / Công trình) | Worker, Accountant | `OneTouchCheckIn.jsx` | `POST /api/attendance/check-in` (`attendanceService.checkInMultiFactor`) | Hoạt động; **Bug lệch tháng nếu `NIGHT_SHIFT` qua nửa đêm ngày mùng 1**; fallback `raw` GPS khi `zalo_location_token` lỗi |
| FEAT-ATT-03 | Xem lịch công cá nhân dạng Heatmap tháng & Chi tiết ngày | Worker, Accountant | `WorkerHistoryTab.jsx` | `GET /api/attendance/me`, `GET /api/attendance/today` | Hoạt động; khởi tạo tháng bằng local time trình duyệt |
| FEAT-ATT-04 | Xem Bảng công quản trị dạng Thẻ & Lịch 31 ngày từng nhân viên | Admin, Accountant (`attendance_view_all`) | `AttendanceMatrixTable.jsx` | `GET /api/attendance` | Đã tinh gọn dạng Thẻ (V48.1); query SQL `attendance_logs` đang lấy cả tháng thay vì lọc trang `emps` |
| FEAT-ATT-05 | Chấm / Sửa / Xóa công thủ công từng ô ngày + OT (SoD chặn tự sửa) | Admin, Accountant (`attendance_edit`) | `AttendanceMatrixTable.jsx` modal | `POST /api/attendance/update` | Hoạt động; có chặn khóa kỳ & tự sửa công chính mình; **thiếu validate ngày lịch thực (e.g. 31/02)** |
| FEAT-ATT-06 | Tạo mã QR Động theo Chi nhánh/Công trình | Admin, Accountant | `CompanySettingsTab.jsx` | `POST /api/attendance/qr-session` | Hoạt động (`SEDQR1` HMAC-SHA256, TTL 30–300s) |
| FEAT-ATT-07 | Khóa / Mở khóa kỳ chấm công & Cảnh báo log Low-Trust | Admin, Accountant (`attendance_lock` khi khóa; chỉ Admin mở khóa) | `PeriodLockModal.jsx` (gọi từ `PayrollGridTable.jsx`) | `GET /api/attendance/period-status`, `POST /lock-period`, `POST /unlock-period` | **BUG Frontend:** Kế toán không mở được modal Khóa kỳ dù có `attendance_lock` vì `roles.js` `canLockPeriod: false` |
| FEAT-ATT-08 | Giám sát log gian lận / ảnh chấm công / thống kê ngày | Admin, Accountant (`attendance_view_all`) | *Chưa gắn UI chi tiết riêng (một phần qua Notification Alerts)* | `GET /attendance/suspicious-logs`, `/logs/:id/image`, `/stats` | Chủ yếu Backend/Alerts |

---

## 3. Nhóm tính năng Đơn từ & Tăng ca (Requests & Pre-OT)

| ID | Tính năng | Vai trò | Frontend Entry | Backend Entry | Trạng thái / Ghi chú |
|---|---|---|---|---|---|
| FEAT-REQ-01 | Tạo đơn (Nghỉ phép, Không phép, Bổ sung công, Công tác, OT, Tạm ứng) + Đính kèm ảnh | Worker, Accountant | `SmartLeaveRequestModal.jsx` | `POST /api/requests`, `POST /api/media/upload` | Hoạt động; **Bug `WorkerDashboard` truyền `short_date` fallback vào `<input type="date">`** |
| FEAT-REQ-02 | Đăng ký tăng ca trước (`ot_registrations`) | Worker / Admin / Accountant | *Frontend chưa có form riêng cho `ot-pre-register` (đang gửi qua `request_type='ot'` ở `/requests`)* | `POST /requests/ot-pre-register`, `GET /ot-registrations`, `PUT /ot-registrations/:id` | Module `ot_registrations` hoạt động ở Backend & payrollCalculator, thiếu luồng tạo mới trên UI |
| FEAT-REQ-03 | Xem hạn mức phép có lương hàng tháng & Hủy đơn chờ duyệt | Worker, Accountant | `WorkerRequestsTab.jsx` | `GET /api/requests/leave-balance`, `GET /requests/me`, `PUT /requests/:id/cancel` | Hoạt động; `payrollCalculator.js` đang clamp limit tối đa `1` dù cấu hình > 1 |
| FEAT-REQ-04 | Duyệt / Từ chối đơn từ nhóm theo nhân viên (SoD chặn tự duyệt) | Admin, Accountant (`leave_approve`) | `RequestsManagementTab.jsx` | `GET /api/requests/by-employees`, `PUT /api/requests/:id` | Hoạt động; **Backend `LIMIT 600` không phân trang có thể ẩn đơn cũ** |
| FEAT-REQ-05 | Duyệt hàng loạt đơn | Admin, Accountant (`leave_approve`) | *Không gọi từ Frontend* | `POST /api/requests/batch-approve` | Backend-only (hỗ trợ API) |

---

## 4. Nhóm tính năng Tiền lương, Phiếu lương & Thanh toán VietQR

| ID | Tính năng | Vai trò | Frontend Entry | Backend Entry | Trạng thái / Ghi chú |
|---|---|---|---|---|---|
| FEAT-PAY-01 | Tính lương tự động & Hiển thị Thẻ lương theo tháng | Admin, Accountant (`payroll_view_all`) | `PayrollGridTable.jsx` | `GET /api/payroll` | Hoạt động; **Bug nghiêm trọng `payrollCalculator.js` `.setHours(0,0,0,0)` lệch -1 ngày trên server UTC** |
| FEAT-PAY-02 | Xem Phiếu lương 2 Tab (Tổng hợp lương + Thu nhập từng ngày) | All (Worker xem của mình) | `SalarySlipModal.jsx` | `GET /api/payroll/me`, `GET /api/payroll/employee/:ma_nv` | Hoạt động |
| FEAT-PAY-03 | Điều chỉnh Thưởng / Phạt / Tạm ứng theo tháng | Admin, Accountant (`payroll_calculate`) | `PayrollGridTable.jsx` modal | `POST /api/payroll/adjustments` | Hoạt động; khóa theo `period_locks` |
| FEAT-PAY-04 | Gửi báo cáo lương (từng người / tất cả) & Chia sẻ phiếu lương | Admin | `PayrollGridTable.jsx`, `SalaryReportModal.jsx` | `POST /api/payroll/send-report` | Hoạt động; **Backend N+1 SQL trong 1 transaction cho tối đa 5000 NV** |
| FEAT-PAY-05 | Xác nhận đọc báo cáo / Báo sai sót (khiếu nại + minh chứng) / Xác nhận đã nhận lương | Worker, Accountant | `SalarySlipModal.jsx`, `PayslipActionFooter.jsx` | `POST /api/payroll/confirm` | Hoạt động |
| FEAT-PAY-06 | Giải quyết khiếu nại lương (SoD chặn tự giải quyết) | Admin, Accountant (`payroll_approve`) | `PayrollGridTable.jsx`, `SalarySlipModal.jsx` | `POST /api/payroll/resolve-dispute` | Hoạt động |
| FEAT-PAY-07 | Chuyển khoản VietQR offline + Đánh dấu Đã chuyển khoản | Admin, Accountant (`payroll_payment_status_manage`) | `BankTransferModal.jsx` | `POST /api/payroll/mark-paid`, `POST /api/payroll/employee-payment-status` | Hoạt động; dùng QR tạo local bằng thư viện `qrcode` + `openOutApp` |
| FEAT-PAY-08 | Xuất phiếu lương ra Excel (`.xlsx`) | All (tùy quyền xem) | `salaryExcelExport.js` -> `SalarySlipModal.jsx` / `SalaryReportModal.jsx` | Client-side generation + `downloadFile` | Hoạt động |
| FEAT-PAY-09 | Thẻ ngân hàng cá nhân & Tra cứu tên chủ TK tự động (Casso Paykit) | Worker, Accountant (+ Admin cập nhật cho NV) | `BankCardModal.jsx`, `BankPickerDropdown.jsx`, `BankTransferModal.jsx` | `POST /api/account/lookup-bank`, `PUT /api/account/bank-card`, `PUT /api/employees/:id` | Hoạt động (khi có `CASSO_APP_ID/SECRET`) |

---

## 5. Nhóm tính năng Nhân sự, Thiết bị & Hồ sơ 360°

| ID | Tính năng | Vai trò | Frontend Entry | Backend Entry | Trạng thái / Ghi chú |
|---|---|---|---|---|---|
| FEAT-EMP-01 | Quản lý danh sách, Thêm mới, Sửa hồ sơ 360°, Phụ cấp tùy chỉnh, Ca làm việc | Admin, Accountant (`employee_view/create/edit/shift_manage`) | `EmployeeManagementTab.jsx` | `GET/POST /employees`, `PUT /employees/:id`, `PUT /employees/:ma_nv/shift` | **Rủi ro DDL:** `ensureAllowanceSchema` chạy `ALTER TABLE` ở runtime; Frontend `initialFilter` không hoạt động |
| FEAT-EMP-02 | Khóa / Mở khóa tài khoản & Phân vai trò (`worker`/`accountant`/`admin`) | Admin, Accountant (`employee_status_manage` chỉ khóa, đổi role Admin only) | `EmployeeManagementTab.jsx` | `PUT /employees/:ma_nv/status`, `PUT /employees/:ma_nv/role` | Hoạt động |
| FEAT-EMP-03 | Xóa nhân viên | Admin, Accountant (`employee_delete`) | *Không có nút xóa trên UI `EmployeeManagementTab`* | `DELETE /api/employees/:id` | **CRASH BUG:** `employeeService.deleteEmployee` lỗi `ReferenceError: avatar_url is not defined` |
| FEAT-EMP-04 | Kiểm soát đa thiết bị, Đổi thiết bị (Yêu cầu / Duyệt / Từ chối / Reset thiết bị) | Admin (duyệt/giải quyết), Worker (xem/gửi yêu cầu khi cần) | `EmployeeManagementTab.jsx`, `WorkerProfileTab.jsx` | `GET /pending-device-changes`, `POST /approve|reject-device-change`, `POST /resolve-devices`, `PUT /device-binding-mode`, `POST /request-device-change` | Hoạt động; Frontend chưa có form Worker chủ động gọi `/request-device-change` |
| FEAT-EMP-05 | Ép đổi mật khẩu hàng loạt theo nhóm | Admin | *Không có UI Frontend* | `POST /employees/staged-force-password` | Backend-only ops endpoint |

---

## 6. Nhóm tính năng Cài đặt Công ty, Phòng ban, Ngày lễ, Phân quyền & Media Admin

| ID | Tính năng | Vai trò | Frontend Entry | Backend Entry | Trạng thái / Ghi chú |
|---|---|---|---|---|---|
| FEAT-SET-01 | Cấu hình công ty, Giờ ca, Đa chi nhánh GPS/QR, Wi-Fi IP, Quy tắc phạt/OT/BHXH/Phép, Thông báo chung | Admin (đọc cho tất cả qua `/company`) | `CompanySettingsTab.jsx` | `GET/PUT /company`, `POST /save-wifi-ip`, `POST /reset-defaults`, `GET/POST /company/penalties` | Hoạt động; **Bug SQL:** update `announcement_text` thiếu `WHERE id = ?` |
| FEAT-SET-02 | Quản lý Phòng ban / Khối (CRUD + Default không thể xóa) | Admin (đọc cho tất cả) | `CompanySettingsTab.jsx`, `useDepartments.js` | `GET/POST /departments`, `PUT/DELETE /departments/:id` | Hoạt động trong `withTransaction` |
| FEAT-SET-03 | Quản lý Ngày nghỉ lễ linh hoạt (`x1.5`, `x2`, `x3`, tùy chỉnh) | Admin (đọc cho tất cả) | `HolidaysTab.jsx` | `GET/POST /holidays`, `PUT/DELETE /holidays/:id` | Hoạt động; `deleteHoliday` không check `affectedRows === 0` |
| FEAT-SET-04 | Phân quyền động cho Kế toán & Xem Audit Log | Admin | `AccountantPermissionView.jsx` | `GET/PUT /settings/accountant-permissions`, `GET /settings/audit-logs`, pin/keep/cleanup | Hoạt động; `getAuditLogs` tự chạy cleanup không await và thất bại ngầm trên staging |
| FEAT-MEDIA-01 | Upload / Xem / Tải tài liệu nhân viên (Ảnh / PDF / Excel / Video) | Worker (chứng từ của mình), Admin/Accountant | `EmployeeManagementTab.jsx`, `SalarySlipModal.jsx`, `SmartLeaveRequestModal.jsx`, `SecureMediaPreview.jsx` | `POST /media/upload`, `GET /media/employee/:ma_nv/documents`, `GET /media/:assetUuid/access`, `DELETE /media/:assetUuid` | **Bug Deduplication:** thiếu `employee_id` trong key dedup; fallback `public` delivery vẫn ghi `private` |
| FEAT-MEDIA-02 | Dashboard Quản trị Media Cloudinary, Đồng bộ Usage API & Dọn file mồ côi | Admin | `MediaStorageManagementTab.jsx` | `GET /media/admin/dashboard`, `GET /media/admin/assets`, `POST /media/admin/sync-usage`, `POST /media/admin/cleanup-orphans` | **UI Bug:** truyền sai prop `danger` & `maxWidth`; `countLiveReferences` chạy N+1 6 queries/asset |
| FEAT-NOTIF-01 | Trung tâm Thông báo cá nhân & Cảnh báo điều hành | All (cảnh báo riêng Admin/Accountant) | `NotificationCenterPanel.jsx`, `useNotifications.js` | `GET /notifications/my`, `GET /notifications/summary`, `PUT /notifications/:id/read`, `PUT /notifications/read-all` | Hoạt động; khóa lại kỳ lương gây nhân đôi thông báo |
| FEAT-OPS-01 | Chẩn đoán hệ thống & Báo lỗi Frontend | Admin (`diagnostics`), Public rate-limited (`client-errors`) | `utils/api.js` (`reportClientError`) | `/api/diagnostics/*`, `/api/client-errors`, `/api/health` | `diagnostics` dùng `execSync('git...')` chặn event loop |
