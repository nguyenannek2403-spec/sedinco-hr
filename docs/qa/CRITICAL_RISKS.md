# SEDINCO HR V29 — RỦI RO TRỌNG YẾU & BIỆN PHÁP KIỂM SOÁT

- **Trạng thái**: Đã kiểm tra • Đã xác nhận

| Mã rủi ro | Hạng mục | Mức độ | Biện pháp kiểm soát bắt buộc trong V29 |
| :--- | :--- | :--- | :--- |
| **RISK-01** | Đồng bộ lại cảnh báo hệ thống ghi đè `is_read = 1` thành `0` | P1 | Dùng `INSERT ... ON DUPLICATE KEY UPDATE` trên `(recipient_ma_nv, alert_key)` chỉ cập nhật tiêu đề/nội dung, TUYỆT ĐỐI KHÔNG chạm cột `is_read` và `read_at`. |
| **RISK-02** | Admin/Kế toán bấm nhầm hoặc thấy nút xác nhận lương của công nhân | P1 | Tách `PayslipActionFooter` theo `isAdminOrAccountant`, kiểm chứng bằng E2E CDP & AST/Unit test. |
| **RISK-03** | Chạy stress test 50–200 CCU nhầm lên TiDB Cloud thật | P0 | `perf_benchmark_v29.js` khóa cứng `NODE_ENV=test`, từ chối khởi chạy nếu `DB_HOST` không phải `127.0.0.1`/`localhost` hoặc `DB_NAME` không chứa `test`. `POST /api/qa-center/run-safe-checks` trả 403 cho `load_benchmark`. |
| **RISK-04** | Suy yếu RBAC khi thêm `/api/qa-center/*` và `/api/account/preferences` | P0 | Toàn bộ `/api/qa-center/*` gắn `requireRole(['admin'])`; kiểm chứng trong `09_phase9_audit.test.js` với cả Worker (403) lẫn Accountant khi bật full 30 key DB (403). |
| **RISK-05** | Phá dữ liệu TiDB Cloud hoặc để sót dữ liệu QA sau kiểm thử | P0 | Chỉ dùng DDL bổ sung `IF NOT EXISTS` / `ADD COLUMN` bắt lỗi trùng an toàn; cuối quy trình chạy script dọn sạch 100% dữ liệu test nháp, bảo toàn `admin`, `NV001`, `NV002`, `NV003`, `company_settings`, và `attendance_logs` thực tế. |
