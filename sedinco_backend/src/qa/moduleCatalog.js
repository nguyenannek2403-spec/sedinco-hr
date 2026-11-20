/**
 * Danh mục chính thức 11 phân hệ nghiệp vụ & 8 nhóm kiểm thử chuẩn V29 của SEDINCO HR.
 * Phản ánh 100% cấu trúc mã nguồn thực tế — không tự bịa phân hệ không tồn tại.
 */

const QA_TEST_GROUPS = [
    { key: 'A_UI_UX', code: 'A', name: 'UI/UX Testing', description: 'Bố cục, responsive 320px–1440px, Light/Dark, trạng thái loading/empty/error' },
    { key: 'B_ACCESSIBILITY', code: 'B', name: 'Accessibility Testing', description: 'Cỡ chữ 100%–200%, tương phản WCAG AA, touch target >=44px, keyboard, focus, reduced-motion' },
    { key: 'C_FUNCTIONAL', code: 'C', name: 'Functional Testing', description: 'Nút bấm, form validation, tìm kiếm, bộ lọc, xuất CSV, điều hướng, CRUD' },
    { key: 'D_BUSINESS_LOGIC', code: 'D', name: 'Business Logic Testing', description: 'Chấm công 8h Sáng/Chiều MISA, ca làm, nghỉ phép, tăng ca OT, bảng lương, phụ cấp có điều kiện' },
    { key: 'E_API_INTEGRATION', code: 'E', name: 'API & Integration Testing', description: 'Contract FE-BE, HTTP status, transaction rollback, đồng bộ dữ liệu giữa các module' },
    { key: 'F_SECURITY', code: 'F', name: 'Security Testing', description: 'Auth JWT, token_version, RBAC 16 khóa Kế toán, SoD Admin, IDOR, SQLi, XSS, Rate Limit' },
    { key: 'G_PERFORMANCE', code: 'G', name: 'Performance Testing', description: 'P50/P95/P99, Throughput, Error rate, Timeout rate ở tải 50/100/200 CCU cục bộ & kích thước bundle' },
    { key: 'H_ARCHITECTURE', code: 'H', name: 'Architecture & Maintainability', description: 'Phụ thuộc chéo, 0 circular dependencies, tách logic theo phân hệ, phát hiện file/component quá lớn' }
];

const MODULE_CATALOG = [
    {
        id: 'overview',
        name: 'Tổng quan (Dashboard)',
        roles: ['worker', 'accountant', 'admin'],
        features: ['KPI trực tiếp theo quyền', 'Chuyển nhanh tới phân hệ', 'Bảng sĩ số live hôm nay'],
        apis: ['GET /api/notifications/summary'],
        db_tables: ['employees', 'attendance_logs', 'requests', 'ot_registrations', 'payroll_periods', 'period_locks'],
        permissions: ['attendance_view_all', 'payroll_view_all', 'leave_view_all', 'employee_view'],
        fe_files: ['src/modules/dashboard/RoleOverviewDashboard.jsx', 'src/views/desktop/DesktopDashboard.jsx', 'src/components/LiveAttendanceBoardModal.jsx'],
        be_files: ['src/services/permissionService.js', 'src/controllers/permissionController.js'],
        test_suites: ['09_phase9_audit.test.js', '12_v29_quality_notif_payslip_qa_center.test.js', '07_ui_a11y.test.js']
    },
    {
        id: 'notifications',
        name: 'Thông báo (Notification Center)',
        roles: ['worker', 'accountant', 'admin'],
        features: ['Đồng bộ cảnh báo hệ thống vào user_notifications', 'Lịch sử Chưa đọc / Đã đọc', 'Nút Đánh dấu đã đọc & Đọc tất cả', 'Deep-link mở phiếu lương/mục xử lý'],
        apis: ['GET /api/notifications/my', 'PUT /api/notifications/:id/read', 'PUT /api/notifications/read-all', 'GET /api/notifications/summary'],
        db_tables: ['user_notifications'],
        permissions: ['authenticated'],
        fe_files: ['src/modules/notifications/NotificationCenterPanel.jsx', 'src/modules/notifications/useNotifications.js', 'src/components/DesktopHeader.jsx', 'src/views/worker/WorkerDashboard.jsx'],
        be_files: ['src/services/notificationService.js', 'src/controllers/notificationController.js', 'src/routes/notificationRoutes.js'],
        test_suites: ['11_period_lock_notif_payslip_v25.test.js', '12_v29_quality_notif_payslip_qa_center.test.js', '07_ui_a11y.test.js']
    },
    {
        id: 'employees',
        name: 'Nhân sự & Thiết bị (360°)',
        roles: ['admin', 'accountant'],
        features: ['Quản lý nhân viên', 'Hồ sơ 360°', 'Nhận diện 1 model thiết bị cố định', 'Cảnh báo đa thiết bị & khóa/duyệt máy'],
        apis: ['GET /api/employees', 'POST /api/employees', 'PUT /api/employees/:ma_nv', 'POST /api/employees/:ma_nv/resolve-devices', 'PUT /api/employees/:ma_nv/status'],
        db_tables: ['employees', 'audit_logs'],
        permissions: ['employee_view', 'employee_create', 'employee_edit', 'employee_delete', 'employee_status_manage'],
        fe_files: ['src/views/desktop/EmployeeManagementTab.jsx', 'src/utils/deviceIdentity.js'],
        be_files: ['src/services/employeeService.js', 'src/controllers/employeeController.js', 'src/routes/employeeRoutes.js', 'src/utils/deviceIdentityHelper.js'],
        test_suites: ['03_auth_rbac.test.js', '08_qa_v3_matrix.test.js', '09_phase9_audit.test.js', '07_ui_a11y.test.js']
    },
    {
        id: 'attendance',
        name: 'Chấm công & Ma trận 31 ngày',
        roles: ['worker', 'accountant', 'admin'],
        features: ['Chấm công 2 nút GPS/Wi-Fi', 'Logic 8h Sáng/Chiều MISA', 'Chỉnh sửa công 1 chạm', 'Chốt/Mở kỳ công'],
        apis: ['POST /api/attendance/check-in', 'POST /api/attendance/check-out', 'GET /api/attendance/me', 'GET /api/attendance', 'POST /api/attendance/update', 'POST /api/attendance/lock', 'POST /api/attendance/unlock-period'],
        db_tables: ['attendance_logs', 'period_locks', 'idempotency_keys'],
        permissions: ['attendance_view_all', 'attendance_edit', 'attendance_lock'],
        fe_files: ['src/components/OneTouchCheckIn.jsx', 'src/components/AttendanceMatrixTable.jsx', 'src/components/PeriodLockModal.jsx', 'src/views/worker/WorkerHistoryTab.jsx', 'src/hooks/useAttendanceCheckIn.js'],
        be_files: ['src/services/attendanceService.js', 'src/controllers/attendanceController.js', 'src/routes/attendanceRoutes.js', 'src/utils/misaWorkdayEngine.js', 'src/utils/geoHelper.js'],
        test_suites: ['04_attendance.test.js', '08_qa_v3_matrix.test.js', '10_misa_workday_payroll_v24.test.js', '11_period_lock_notif_payslip_v25.test.js', '07_ui_a11y.test.js']
    },
    {
        id: 'shifts',
        name: 'Ca làm việc & Ngày lễ',
        roles: ['admin', 'accountant'],
        features: ['Cấu hình giờ chuẩn & giờ cá nhân', 'Lịch nghỉ lễ quốc gia & công ty (hệ số x3)', 'Quy định phạt đi muộn'],
        apis: ['PUT /api/employees/:ma_nv/shift', 'GET /api/holidays', 'POST /api/holidays', 'DELETE /api/holidays/:id', 'GET /api/company/settings'],
        db_tables: ['public_holidays', 'company_settings', 'employees'],
        permissions: ['shift_manage'],
        fe_files: ['src/views/desktop/HolidaysTab.jsx', 'src/views/desktop/CompanySettingsTab.jsx', 'src/utils/holidayUtils.js'],
        be_files: ['src/services/holidayService.js', 'src/services/companyService.js', 'src/routes/holidayRoutes.js'],
        test_suites: ['04_attendance.test.js', '09_phase9_audit.test.js', '10_misa_workday_payroll_v24.test.js']
    },
    {
        id: 'requests',
        name: 'Đơn từ & Phép năm',
        roles: ['worker', 'accountant', 'admin'],
        features: ['Nghỉ phép có lương (P) / không lương (KP)', 'Giải trình bổ sung công', 'Tạm ứng lương', 'Phê duyệt hàng loạt & SoD chống tự duyệt'],
        apis: ['POST /api/requests', 'GET /api/requests/me', 'GET /api/requests', 'PUT /api/requests/:id', 'POST /api/requests/batch-approve', 'PUT /api/requests/:id/cancel'],
        db_tables: ['requests', 'attendance_logs'],
        permissions: ['leave_view_all', 'leave_approve'],
        fe_files: ['src/views/worker/WorkerRequestsTab.jsx', 'src/components/SmartLeaveRequestModal.jsx', 'src/views/desktop/RequestsManagementTab.jsx'],
        be_files: ['src/services/requestService.js', 'src/controllers/requestController.js', 'src/routes/requestRoutes.js'],
        test_suites: ['05_requests.test.js', '08_qa_v3_matrix.test.js', '10_misa_workday_payroll_v24.test.js', '07_ui_a11y.test.js']
    },
    {
        id: 'overtime',
        name: 'Tăng ca (OT)',
        roles: ['worker', 'accountant', 'admin'],
        features: ['Đăng ký giờ tăng ca', 'Phê duyệt OT', 'Áp dụng hệ số ngày thường/CN/Lễ vào lương'],
        apis: ['POST /api/requests/ot', 'GET /api/requests/ot-registrations', 'PUT /api/requests/ot-registrations/:id'],
        db_tables: ['ot_registrations', 'attendance_logs'],
        permissions: ['leave_view_all', 'leave_approve'],
        fe_files: ['src/views/worker/WorkerRequestsTab.jsx', 'src/views/desktop/RequestsManagementTab.jsx'],
        be_files: ['src/services/requestService.js', 'src/utils/misaWorkdayEngine.js', 'src/utils/payrollCalculator.js'],
        test_suites: ['05_requests.test.js', '10_misa_workday_payroll_v24.test.js', '07_ui_a11y.test.js']
    },
    {
        id: 'payroll',
        name: 'Tiền lương & Phiếu lương Chi tiết',
        roles: ['worker', 'accountant', 'admin'],
        features: ['Bảng lương Tổng quan & Chi tiết Admin', 'Phiếu lương lịch sử + Bảng công từng ngày', 'Sticky Action Bar theo vai trò', 'Phụ cấp có điều kiện (>0)', 'Xác nhận & Khiếu nại minh chứng'],
        apis: ['GET /api/payroll', 'GET /api/payroll/me', 'GET /api/payroll/employee/:ma_nv', 'POST /api/payroll/calculate', 'POST /api/payroll/adjustments', 'POST /api/payroll/approve', 'POST /api/payroll/confirm', 'POST /api/payroll/resolve-dispute'],
        db_tables: ['attendance', 'payroll_periods', 'attendance_logs', 'period_locks'],
        permissions: ['payroll_view_all', 'payroll_calculate', 'payroll_approve', 'payroll_payment_status_manage'],
        fe_files: ['src/components/PayrollGridTable.jsx', 'src/components/SalarySlipModal.jsx', 'src/modules/payroll/PayslipActionFooter.jsx', 'src/modules/payroll/payslipHelpers.js'],
        be_files: ['src/services/payrollService.js', 'src/controllers/payrollController.js', 'src/routes/payrollRoutes.js', 'src/utils/payrollCalculator.js'],
        test_suites: ['06_payroll.test.js', '09_phase9_audit.test.js', '10_misa_workday_payroll_v24.test.js', '11_period_lock_notif_payslip_v25.test.js', '12_v29_quality_notif_payslip_qa_center.test.js', '07_ui_a11y.test.js']
    },
    {
        id: 'reports',
        name: 'Báo cáo & Sao lưu',
        roles: ['admin', 'accountant'],
        features: ['Xuất bảng lương CSV chống Formula Injection', 'Sao lưu Snapshot cuối tháng JSON', 'Xuất Phiếu lương đơn kèm bảng công từng ngày'],
        apis: ['GET /api/payroll/export', 'GET /api/payroll/backup-snapshot'],
        db_tables: ['attendance', 'attendance_logs', 'payroll_periods'],
        permissions: ['payroll_export'],
        fe_files: ['src/components/PayrollGridTable.jsx', 'src/components/SalarySlipModal.jsx', 'src/modules/payroll/payslipHelpers.js'],
        be_files: ['src/services/payrollService.js', 'src/controllers/payrollController.js'],
        test_suites: ['06_payroll.test.js', '09_phase9_audit.test.js', '02_contracts.test.js']
    },
    {
        id: 'administration',
        name: 'Quản trị, Phân quyền & Trợ năng',
        roles: ['admin', 'accountant', 'worker'],
        features: ['Đăng nhập đa phương thức (SĐT/Tài khoản/Mã NV/Zalo)', 'Phân quyền 16 khóa Kế toán', 'Nhật ký An ninh', 'Cấu hình GPS/Wi-Fi', 'Giao diện Sáng/Tối & Cỡ chữ 100%–200%'],
        apis: ['POST /api/login', 'POST /api/admin/login', 'PUT /api/account/credentials', 'PUT /api/account/preferences', 'PUT /api/settings/accountant-permissions', 'GET /api/audit-logs'],
        db_tables: ['admins', 'employees', 'accountant_permissions', 'audit_logs', 'company_settings', 'login_rate_limits'],
        permissions: ['admin_only'],
        fe_files: ['src/views/AuthView.jsx', 'src/components/ForcePasswordChangeModal.jsx', 'src/components/AccountantPermissionView.jsx', 'src/views/desktop/AuditLogsTab.jsx', 'src/context/ThemeContext.jsx', 'src/modules/accessibility/FontScaleContext.jsx'],
        be_files: ['src/services/authService.js', 'src/services/permissionService.js', 'src/middlewares/authMiddleware.js'],
        test_suites: ['03_auth_rbac.test.js', '08_qa_v3_matrix.test.js', '09_phase9_audit.test.js', '12_v29_quality_notif_payslip_qa_center.test.js', '07_ui_a11y.test.js']
    },
    {
        id: 'quality-assurance',
        name: 'QA Center (Trung tâm Kiểm thử)',
        roles: ['admin'],
        features: ['Dashboard chất lượng thực tế', '8 nhóm test case', 'Sổ Quản lý Lỗi (Bug Registry)', 'Lịch sử & So sánh phiên bản', 'Chạy kiểm tra an toàn Runtime'],
        apis: ['GET /api/qa-center/overview', 'GET /api/qa-center/test-cases', 'GET /api/qa-center/bugs', 'GET /api/qa-center/history', 'POST /api/qa-center/run-safe-checks', 'GET /api/qa-center/export'],
        db_tables: ['qa_test_runs'],
        permissions: ['admin_only'],
        fe_files: ['src/modules/qa-center/QaCenterTab.jsx', 'src/modules/index.js'],
        be_files: ['src/qa/moduleCatalog.js', 'src/qa/qaCenterService.js', 'src/qa/qaCenterController.js', 'src/qa/qaCenterRoutes.js', 'src/qa/bugRegistry.json'],
        test_suites: ['02_contracts.test.js', '09_phase9_audit.test.js', '12_v29_quality_notif_payslip_qa_center.test.js', '07_ui_a11y.test.js']
    }
];

module.exports = {
    QA_TEST_GROUPS,
    MODULE_CATALOG
};
