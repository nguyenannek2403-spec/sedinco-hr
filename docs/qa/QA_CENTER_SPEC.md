# SEDINCO HR V29 — ĐẶC TẢ MODULE QA CENTER (SPECIFICATION)

- **Trạng thái**: Đã xác nhận • Đã triển khai Backend + Frontend

## 1. Kiến trúc & Quyền truy cập

- **Phân quyền cứng**: CHỈ `role === 'admin'` được phép truy cập tab `qa_center` và mọi API dưới `/api/qa-center/*` (`authenticateToken, requireRole(['admin'])`). Cả `worker` lẫn `accountant` (kể cả khi bật full 30 khóa phân quyền DB) đều nhận HTTP `403`.
- **Khóa an toàn tải nặng**: `POST /api/qa-center/run-safe-checks` chặn `requestedMode === 'load_benchmark'` với HTTP `403 SAFE_MODE_LOCKED` để bảo vệ Cơ sở dữ liệu sản xuất / TiDB Cloud. Benchmark tải đồng thời 50/100/200 CCU chỉ được chạy qua CLI trên DB test cục bộ (`sedinco_hr_test`).

## 2. Endpoints Backend (`/api/qa-center`)

1. `GET /overview`: Tổng hợp số module đã kiểm, tổng test case, `PASS / FAIL / BLOCKED / NOT TESTED`, tỷ lệ PASS, phân bố lỗi Critical/High/Medium/Low, module thiếu test, tóm tắt hiệu năng (`V29_BENCHMARK_METRICS.json`), lịch sử chạy gần nhất và đánh giá trạng thái (`READY FOR FURTHER TESTING` / `READY FOR STAGING` / `NOT READY`).
2. `GET /test-cases`: Danh sách test case đầy đủ metadata theo 8 nhóm (A–H), phân hệ, trạng thái và phạm vi chạy (`dev_ci_only` / `runtime_safe` / `manual`).
3. `GET /bugs`: Đọc sổ lỗi `bugRegistry.json` có lọc theo mức độ (`P0`–`P3`), phân hệ và trạng thái.
4. `GET /history`: Đọc lịch sử chạy từ bảng `qa_test_runs` + so sánh qua các phiên bản (V24 -> V25 -> V29).
5. `POST /run-safe-checks`: Chạy trực tiếp 5 kiểm tra runtime an toàn read-only (`db_integrity`, `rbac_matrix`, `notification_lifecycle`, `route_inventory`, `architecture_health`) và ghi nhận kết quả thực tế vào `qa_test_runs`.
6. `GET /export`: Xuất toàn bộ báo cáo chất lượng dạng JSON.
