# SEDINCO HR V29 — BÁO CÁO TRIỂN KHAI QA CENTER NỘI BỘ

- **Phiên bản**: V29
- **Đối tượng sử dụng**: Duy nhất **Quản trị viên (`admin`)** qua tab `QA Center` (`qa_center`) trong thanh Sidebar nhóm *Kiểm soát Chất lượng & Cá nhân*.

## 1. Kiến trúc Backend (`sedinco_backend/src/qa/`)
- `moduleCatalog.js`: Danh mục 11 phân hệ nghiệp vụ kèm mô tả, các endpoint chính, quyền liên quan và danh sách tệp test phủ sóng.
- `bugRegistry.json`: Kho lưu trữ lỗi V29 (`BUG-V29-001`..`BUG-V29-005`) với đầy đủ bước tái hiện, nguyên nhân gốc, file liên quan, trạng thái (`VERIFIED`) và kết quả kiểm thử lại.
- `qaCenterService.js`:
  - Đọc dữ liệu thực tế từ `docs/qa/qa_latest_evidence.json`, `docs/performance/V29_BENCHMARK_METRICS.json` và lịch sử `qa_test_runs` trong DB.
  - Quét tĩnh đồ thị phụ thuộc (`0 circular dependencies`) không cần khởi tạo lại Express instance (nhận `expressApp` từ `req.app`).
  - Thực thi nhóm kiểm thử an toàn tại runtime (`runSafeChecks`) gồm: `db_integrity`, `rbac_matrix`, `notification_lifecycle`, `route_inventory`, `architecture_health`.
  - Khóa cứng chế độ tải nặng (`load_benchmark` / `stress`) từ giao diện Web với mã `403 SAFE_MODE_LOCKED`.
- `qaCenterRoutes.js` & `qaCenterController.js`: 6 API Admin-only:
  - `GET /api/qa-center/overview`
  - `GET /api/qa-center/test-cases`
  - `GET /api/qa-center/bugs`
  - `GET /api/qa-center/runs`
  - `POST /api/qa-center/run-safe-checks`
  - `GET /api/qa-center/reports`

## 2. Giao diện Frontend (`zalo-miniapp-frontend/src/modules/qa-center/QaCenterTab.jsx`)
- Hiển thị tổng quan tỷ lệ Pass/Fail thực tế, trạng thái sẵn sàng (`READY FOR STAGING` khi chưa có test thiết bị vật lý), số lỗi mở, biểu đồ phân nhóm test (8 nhóm `A–H`), lịch sử V24 -> V25 -> V29, bộ lọc test cases theo nhóm/module/trạng thái, danh sách Bug Registry, số liệu benchmark 50/100/200 CCU, trình xem báo cáo Markdown `docs/`, và nút kích hoạt Safe Runtime Checks (`qa-run-safe-checks-btn`).
- **Xác minh thực tế**: `V29-QA-01` (API & Safe Mode) và `UI-03 [Admin Tab: QA Center @ 360px]` (CDP render & bấm nút chạy kiểm tra an toàn thật) đều đạt **PASS**.
