# SEDINCO HR V29 — SƠ ĐỒ PHỤ THUỘC GIỮA CÁC MODULE (DEPENDENCY MAP)

- **Trạng thái**: Đã kiểm tra • Đã xác nhận (Static AST Require/Import Analysis)
- **Circular Dependencies**: Backend = **0 chu trình** • Frontend = **0 chu trình**

## 1. Luồng Phụ thuộc Hợp lệ Giữa Các Phân hệ

```text
[Auth & RBAC] ──> (Xác thực JWT + token_version + 16 keys Kế toán) ──> Mọi Controller/Route
       │
       ├──> [Employees & Devices] (Định danh thiết bị, trạng thái, ca làm việc, phụ cấp cơ sở)
       │         │
       ├──> [Attendance + MISA 8h Engine] <── [Shifts & Holidays]
       │         │        ▲ (Tự đồng bộ công P/L & bổ sung công khi duyệt)
       │         │   [Requests & Overtime]
       │         ▼
       └──> [Payroll Engine] (Tính công, OT, bảo hiểm, thưởng/phạt/ứng, xác nhận/khiếu nại)
                 │
                 ├──> [Period Lock + Notification Service] ──> (user_notifications) ──> [Worker & Admin Bell]
                 └──> [Reports CSV / Backup Snapshot]

[Admin QA Center] ──> (Đọc chỉ mục catalog, qa_test_runs, evidence JSON, Safe DB/RBAC/Route checks)
```

## 2. Điểm Phức tạp & Trộn lẫn Đã Phát hiện Cần Cô lập

1. **Thông báo phân mảnh (Đang khắc phục ở V29 Phase 3–5)**:
   - Trước V29: `WorkerDashboard` đọc `user_notifications`, còn `DesktopHeader` chỉ đọc `alertsSummary.actionable_alerts` tổng hợp động từ 4 bảng (`audit_logs`, `employees`, `attendance`, `requests`), khiến cảnh báo không lưu trạng thái `is_read` khi Admin/Kế toán bấm vào.
   - Giải pháp: Gom toàn bộ về `NotificationService` (`user_notifications` với `alert_key` duy nhất) làm Single Source of Truth cho cả 3 role.
2. **SalarySlipModal.jsx (1.155 dòng) gộp logic CSV, helper hiển thị và action theo vai trò**:
   - Giải pháp: Tách `payslipHelpers.js` (pure logic) và `PayslipActionFooter.jsx` (sticky action bar theo role Admin/Accountant vs Worker) sang `src/modules/payroll/`.
3. **Các file lớn khác chưa tách mạnh ở đợt này (giữ an toàn tránh gãy test)**:
   - `EmployeeManagementTab.jsx` (1.754L), `attendanceService.js` (1.684L), `PayrollGridTable.jsx` (1.474L), `authService.js` (1.154L): Giữ nguyên public interface, chỉ bổ sung props/hook sạch mà không xáo trộn đường dẫn import hiện hữu.
