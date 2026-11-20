# SEDINCO HR V29 — KIẾN TRÚC MỤC TIÊU (TARGET ARCHITECTURE)

- **Trạng thái**: Đã xác nhận (Áp dụng từng bước tương thích ngược 100%)

## 1. Nguyên tắc Tổ chức "Mỗi Chức Năng Là Một Ngăn Riêng"

1. **Không phá vỡ import hiện có**: Bảo toàn cấu trúc chạy ổn định của `sedinco_backend/src/{routes,controllers,services,middlewares,utils,config,database}` và `zalo-miniapp-frontend/src/{components,views,hooks,utils,constants,context,adapters}`.
2. **Mở rộng theo module độc lập (`modules/` & `src/qa/`)**:
   - **Frontend (`zalo-miniapp-frontend/src/`)**:
     - `modules/accessibility/`: `FontScaleContext.jsx` (cỡ chữ 100%–200% tập trung + đồng bộ DB).
     - `modules/notifications/`: `useNotifications.js` + `NotificationCenterPanel.jsx` (chung cho Worker, Accountant, Admin).
     - `modules/payroll/`: `payslipHelpers.js` + `PayslipActionFooter.jsx` (tách khỏi `SalarySlipModal.jsx`).
     - `modules/dashboard/`: `RoleOverviewDashboard.jsx` (Tổng quan KPI theo vai trò & quyền).
     - `modules/qa-center/`: `QaCenterTab.jsx` (Trung tâm kiểm thử chất lượng cho Admin).
     - `modules/index.js`: Manifest khai báo cấu trúc phân hệ cho nhóm điều hướng & QA.
     - `components/ui/`: Shared UI Kit chuẩn ZaUI (`AppButton`, `AppModal` hỗ trợ Escape + focus restoration, `FormRow`, `StatusBadge`, `SkeletonList`, `EmptyState`, `ConfirmDialog`).
   - **Backend (`sedinco_backend/src/`)**:
     - `qa/`: `moduleCatalog.js`, `bugRegistry.json`, `qaCenterService.js`, `qaCenterController.js`, `qaCenterRoutes.js`.
     - `scripts/perf_benchmark_v29.js` & `scripts/generate_qa_evidence.js`: Công cụ đo tải thực tế (chỉ local test DB) và sinh JSON bằng chứng không giả mạo.
3. **Điều hướng phân nhóm trên Desktop/Tablet & Mobile**:
   - **Nhóm Vận hành**: `Tổng quan` • `Bảng công` • `Xét duyệt đơn từ` • `Tính lương` (Kế toán).
   - **Nhóm Quản trị & Nhân sự**: `Trung tâm Quản trị` (`Nhân sự & Thiết bị`, `Giám sát Lương`, `Nhật ký & An ninh`) hoặc `Nhân sự & Thiết bị` (Kế toán khi được cấp `employee_view`).
   - **Nhóm Hệ thống & Chất lượng**: `Cài đặt Hệ thống` • `QA Center` (chỉ Admin) • `Hồ sơ`.
