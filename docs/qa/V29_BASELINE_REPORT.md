# SEDINCO HR V29 — PHASE 0 BASELINE REPORT

- **Trạng thái kiểm kê**: Đã kiểm tra • Đã xác nhận
- **Commit nền tảng**: `031982c` (`main` = `origin/main` = `staging/g9`, working tree sạch)
- **Thời điểm đánh giá**: 2026-11-20

## 1. Kiểm kê Quy mô Mã nguồn & Build/Test Ban đầu

| Thành phần | Số liệu thực tế V29 Baseline | Trạng thái |
| :--- | :--- | :--- |
| Backend source (`sedinco_backend/src/**/*.js`) | **52 files** | Đã kiểm tra |
| Frontend source (`zalo-miniapp-frontend/src/**/*`) | **52 files** | Đã kiểm tra |
| Express mounted routes (`listExpressRoutes(app)`) | **140 routes** | Đã xác nhận |
| Circular dependencies (BE & FE AST graph) | **0 BE / 0 FE** | Đã xác nhận |
| FE `TODO` / `FIXME` / `console.log` scan | **0 kết quả** | Đã xác nhận |
| Frontend Vite build (`vite build`) | **2525 modules**, **2.56s**, exit `0` | Đã xác nhận |
| Backend + CDP Test Suite (`__tests__/*.test.js`) | **11 suites / 84 cases PASS** (`0` fail, `137.58s`) | Đã xác nhận |
| Database tables (`sedinco_hr_test` & `sedinco_hr`) | **15 bảng** (`accountant_permissions`, `admins`, `attendance`, `attendance_logs`, `audit_logs`, `company_settings`, `employees`, `idempotency_keys`, `login_rate_limits`, `ot_registrations`, `payroll_periods`, `period_locks`, `public_holidays`, `requests`, `user_notifications`) | Đã xác nhận |

## 2. Phân bổ 3 Vai trò RBAC & 16 Khóa Kế toán Thực thi

- **`worker`** (Công nhân / Nhân viên): Màn hình mobile 4 tab (`checkin`, `history`, `requests`, `profile`) + modal thống nhất `SalarySlipModal`.
- **`accountant`** (Kế toán): Màn hình desktop/mobile thích ứng (`matrix`, `payroll`, `requests`, `management` khi có `employee_view`, `profile`), ràng buộc 1:1 theo **16 khóa `ENFORCED_ACCOUNTANT_KEYS`** trong DB (`accountant_permissions`) — khớp hoàn toàn giữa Backend `permissionService.js`, Frontend `constants/roles.js` và `utils/viLabels.js`.
- **`admin`** (Quản trị viên / Ban Giám Đốc): Cách ly vai trò quản lý thuần (`Pure Manager`), không chấm công cá nhân, không tính lương, không khóa thiết bị; truy cập `matrix`, `requests`, `management` (`employees`, `payroll`, `audit_logs`), `settings` (`company`, `permissions`, `holidays`), `profile`.

## 3. Các Điểm Lớn / Nợ Kỹ thuật Quan sát Được

- **File kích thước lớn**:
  - `zalo-miniapp-frontend/src/views/desktop/EmployeeManagementTab.jsx` (**1.754 dòng**)
  - `sedinco_backend/src/services/attendanceService.js` (**1.684 dòng**)
  - `zalo-miniapp-frontend/src/components/PayrollGridTable.jsx` (**1.474 dòng**)
  - `zalo-miniapp-frontend/src/components/SalarySlipModal.jsx` (**1.155 dòng**)
  - `sedinco_backend/src/services/authService.js` (**1.154 dòng**)
- **Lỗi thực tế người dùng báo cáo (cần ưu tiên P1)**:
  1. Chuông thông báo (`DesktopHeader.jsx` + `permissionService.js` + `WorkerDashboard.jsx`): Bấm vào cảnh báo không trừ badge đỏ (kẹt ở `1` với cảnh báo `fraud`/`device`/`salary_dispute`/`pending_request` vì không đồng bộ bền vững `user_notifications`), thiếu lịch sử đã đọc, bộ lọc `Tất cả / Chưa đọc / Đã đọc` và nút `✓ Đánh dấu tất cả đã đọc` / `Đánh dấu đã đọc`.
  2. Vùng nút đáy `SalarySlipModal.jsx`: Thiếu Sticky Bottom Action Bar phân biệt đúng vai trò Admin/Kế toán vs Worker (Admin hiện đang không có thanh thao tác đáy riêng `[← Đóng]`, `[✏️ Điều chỉnh Thưởng/Phạt/Ứng]`, `[📄 Tải / In Phiếu lương]`; Worker bị chôn nút trong scroll body và hiện nút xác nhận ngay cả khi kỳ lương còn là Bản nháp).
- **Khoảng trống kiến trúc & chất lượng chưa kiểm tra ở baseline**:
  - Chưa có Dashboard Tổng quan (`overview`) cho Admin/Kế toán.
  - Chưa có cơ chế Cỡ chữ 6 mức (100%–200%) lưu bền vững trong DB & đồng bộ đa thiết bị.
  - Chưa có số liệu benchmark tải đồng thời 50 / 100 / 200 CCU cục bộ (**Chưa kiểm tra** ở baseline).
  - Chưa có module QA Center thực tế cho Admin (**Chưa sửa**).
