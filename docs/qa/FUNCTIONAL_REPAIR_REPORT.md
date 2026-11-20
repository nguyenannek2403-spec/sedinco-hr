# SEDINCO HR V29 — BÁO CÁO SỬA LỖI NGHIỆP VỤ (FUNCTIONAL REPAIR REPORT)

- **Phiên bản**: V29
- **Trọng tâm**: Xử lý triệt để 2 lỗi thực tế P1 được phát hiện ngay trước khi đóng gói V29 (`BUG-V29-001` và `BUG-V29-002`) cùng các hạng mục đồng bộ đi kèm.

## 1. `BUG-V29-001` — Vòng đời Chuông Thông Báo (`🔔`) cho cả 3 Vai trò (`admin`, `accountant`, `worker`)
### Vấn đề trước sửa
1. Cảnh báo hệ thống (gian lận, đa thiết bị, khiếu nại lương, đơn chờ duyệt) được dựng động trong `permissionService.getAlertsSummary` mà không lưu DB nên khi bấm vào thông báo, số badge đỏ vẫn giữ nguyên `1`.
2. Không có tab lịch sử Đã đọc / Chưa đọc, không có nút Đánh dấu từng mục hoặc Đánh dấu tất cả đã đọc, chưa phân trang lịch sử cũ.
3. Trong quá trình tích hợp V29, phát hiện thêm lỗi `P9-V17-01`: truy vấn `adminNotifRows` lấy cả dòng `SYSTEM_ALERT_REQUEST` gán nhầm thành `category: 'period_locked'`.

### Giải pháp đã triển khai
- **Schema (`initDb.js`)**: Mở rộng bảng `user_notifications` thêm `alert_key VARCHAR(120)`, `category VARCHAR(50)`, `severity VARCHAR(20)`, `target_tab`, `target_subtab`, `target_id`, `read_at DATETIME`, cùng khóa duy nhất `uniq_notif_recipient_alert_key (recipient_ma_nv, alert_key)`.
- **Backend Sync (`notificationService.js` & `permissionService.js`)**:
  - Viết `syncSystemAlertsForUser(user)` đồng bộ cảnh báo vào `user_notifications` bằng `ON DUPLICATE KEY UPDATE` và **tuyệt đối không ghi đè `is_read` hoặc `read_at`** khi đồng bộ lại.
  - Sửa `permissionService.js` bổ sung `AND type = 'PERIOD_LOCKED_PAYROLL'` cho truy vấn `adminNotifRows` để tách bạch cảnh báo chốt kỳ và cảnh báo hệ thống.
  - Hỗ trợ bộ lọc `filter=all|unread|read`, phân trang `limit`, `offset`, `has_more`, trả `unread_count` chính xác theo từng vai trò (Kế toán chỉ nhận cảnh báo đúng khóa quyền).
- **Frontend (`useNotifications.js` + `NotificationCenterPanel.jsx` + `DesktopHeader.jsx` + `WorkerDashboard.jsx`)**:
  - 3 tab lọc (`Tất cả`, `Chưa đọc (N)`, `Đã đọc`), nút `✓ Đánh dấu tất cả đã đọc`, nút đánh dấu từng dòng, Optimistic UI giảm badge đỏ ngay lập tức, và nút `Xem thêm thông báo cũ`.

### Bằng chứng xác minh
- `V29-NOTIF-01`: `PASS (476.65ms)` — Sync alert_key, đánh dấu đọc lưu `is_read = 1` & `read_at`, resync không bị revert về chưa đọc.
- `V29-NOTIF-02`: `PASS (10.71ms)` — Bộ lọc `all/unread/read`, phân trang, `read-all` và cô lập quyền Kế toán.
- `P9-V17-01`, `V25-T1`, `V25-T2`: Đều `PASS` hoàn toàn.
- `UI-03`: CDP click chuông thật trên Worker & Admin chuyển tab deep-link, giảm badge ngay lập tức.

## 2. `BUG-V29-002` — Thanh Thao Tác Đáy `SalarySlipModal` Theo Vai Trò & Điều Hướng Nhanh
### Vấn đề trước sửa
`SalarySlipModal.jsx` truyền footer rỗng xuống `AppModal.jsx`; Admin/Kế toán không có bộ nút điều chỉnh/in ấn cố định ở đáy và thiếu chuyển NV trước/sau; Worker có nút xác nhận nằm trong phần cuộn và hiện nút ở cả kỳ Bản nháp.

### Giải pháp đã triển khai
- Tạo `zalo-miniapp-frontend/src/modules/payroll/payslipHelpers.js` và `PayslipActionFooter.jsx`, truyền vào prop `footer` cố định của `AppModal.jsx`:
  - **Admin / Accountant**: Hiển thị `[← Đóng]`, `[✏️ Điều chỉnh Thưởng/Phạt/Ứng]` (kết nối thẳng modal điều chỉnh từ `PayrollGridTable.jsx`), `[📄 Tải / In Phiếu lương]` + bộ chọn Kỳ Tháng/Năm và nút `NV trước / NV sau`. Không chứa nút Xác nhận hay Báo sai sót của nhân viên.
  - **Worker**: Khi kỳ đã chốt và chưa xác nhận hiện `[✓ Xác nhận đúng lương & công]` + `[⚠️ Báo sai sót]` + `[Đóng]`; sau khi xác nhận hiện huy hiệu xanh xác nhận + `[Đóng]`; khi kỳ còn là Bản nháp hiện ghi chú `Bảng lương tạm tính — Đang chờ Quản trị viên chốt kỳ` + `[Đóng]`.

### Bằng chứng xác minh
- `V29-ARCH-01`: `PASS (9.51ms)` — Kiểm tra cấu trúc tách bạch nút `payslip-admin-footer` và `payslip-worker-footer`.
- `UI-03`: CDP mở `SalarySlipModal` từ Worker & từ Admin Modal 360° (`emp-360-payslip-btn`), xác nhận hiển thị, cuộn và đóng an toàn.
