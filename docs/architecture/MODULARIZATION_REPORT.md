# SEDINCO HR V29 — BÁO CÁO TÁI CẤU TRÚC MODULE & ĐIỀU HƯỚNG (MODULARIZATION REPORT)

- **Trạng thái**: Đã sửa • Đã kiểm tra • Đã xác nhận (`AST-01`, `AST-02`, `CONTRACT-01..06`, `0` circular deps)

## 1. Các Phân hệ Đã Tái cấu trúc & Bổ sung

| Phân hệ | Thay đổi kiến trúc | Lý do & Lợi ích bảo trì |
| :--- | :--- | :--- |
| **Backend QA Center (`src/qa/`)** | Đóng gói `moduleCatalog.js`, `bugRegistry.json`, `qaCenterService.js`, `qaCenterController.js`, `qaCenterRoutes.js` gắn dưới `/api/qa-center`. | Tách hoàn toàn khỏi business logic nhân sự/chấm công/lương; đếm Express route qua `req.app` nên **0 circular dependency**. |
| **Thông báo hợp nhất (`modules/notifications/`)** | Tạo `useNotifications.js` và `NotificationCenterPanel.jsx` dùng chung giữa `DesktopHeader.jsx` và `WorkerDashboard.jsx`. | Một luồng trạng thái đọc/chưa đọc thống nhất, không trùng lặp code UI giữa Admin/Accountant/Worker. |
| **Tiền lương (`modules/payroll/`)** | Tách `payslipHelpers.js` và `PayslipActionFooter.jsx` khỏi `SalarySlipModal.jsx`. | Giảm gánh nặng file `SalarySlipModal.jsx`, tách rạch ròi nút bấm Admin vs Worker, hỗ trợ export cả Phần A + Phần B. |
| **Tổng quan (`modules/dashboard/`)** | Tạo `RoleOverviewDashboard.jsx` gắn vào tab `overview`. | Trang tổng quan nhẹ, chỉ hiển thị KPI đúng quyền của Admin hoặc Kế toán (`16` khóa). |
| **Trợ năng (`modules/accessibility/`)** | Tạo `FontScaleContext.jsx` + `<FontScaleSelector />` đồng bộ qua `PUT /api/account/preferences`. | Quản lý tập trung cỡ chữ 6 mức (100%–200%) trên toàn bộ UI. |

## 2. Tổ chức Menu & Điều hướng Phân nhóm

- **Nhóm Vận hành**: `Tổng quan` • `Bảng công` • `Xét duyệt đơn từ` • `Tính lương` (Kế toán).
- **Nhóm Quản trị & Nhân sự**: `Trung tâm Quản trị` (`Nhân sự & Thiết bị`, `Giám sát Lương`, `Nhật ký & An ninh`) hoặc `Nhân sự & Thiết bị` (Kế toán có `employee_view`).
- **Nhóm Hệ thống & Chất lượng**: `Cài đặt Hệ thống` • `QA Center` (chỉ Admin) • `Hồ sơ`.
- Cả **Kế toán** và **Nhân viên** không bao giờ nhìn thấy hoặc truy cập được menu quản trị trái phép (chặn đồng thời ở `constants/roles.js` + `requirePermission` / `requireRole(['admin'])` Backend).
