# SEDINCO HR V29 — MA TRẬN BAO PHỦ KIỂM THỬ (TEST COVERAGE MATRIX)

- **Trạng thái**: Đã kiểm tra baseline (11 suites / 84 cases PASS) + Kế hoạch bổ sung Suite 12 & Benchmark tải cục bộ

| Phân hệ | Suites Hiện có | Nhóm QA (A–H) đã phủ | Khoảng trống cần bổ sung ở V29 |
| :--- | :--- | :--- | :--- |
| **Tổng quan & Điều hướng** | `02`, `07`, `09` | A, B, C, E, F | Coverage cho tab `overview` mới theo quyền Admin vs Accountant (`12`, `07`) |
| **Thông báo (`🔔`)** | `11`, `09`, `07` | C, D, E, F | Test vòng đời đồng bộ `alert_key`, optimistic decrement, giữ lịch sử đã đọc, lọc 3 tab, phân trang, nút đọc từng dòng/tất cả (`12`, `07`) |
| **Tiền lương (`SalarySlipModal`)** | `06`, `09`, `10`, `11`, `07` | A, C, D, E, F | Test Sticky Footer Admin vs Worker (Published vs Confirmed vs Draft), nút chuyển NV trước/sau, mở nhanh điều chỉnh (`12`, `07`) |
| **Accessibility & Responsive** | `07` (`UI-01..03`) | A, B | Test UI 6 mức cỡ chữ 100%–200% + lưu `/api/account/preferences` + sweep 320px/360px/390px/430px/768px/1024px/1440px + Escape/focus restore (`12`, `07`) |
| **Chấm công & MISA 8h** | `04`, `08`, `10`, `07` | C, D, E, F | Benchmark hiệu năng 50/100/200 CCU trên local DB |
| **Đơn từ & Tăng ca** | `05`, `08`, `10`, `07` | C, D, E, F | Kiểm tra hồi quy toàn phần |
| **Nhân sự & Phân quyền** | `03`, `08`, `09`, `02`, `07` | C, D, E, F | Guard 147 Express routes & Admin-only QA Center |
| **QA Center** | (Chưa có -> `12`, `07`) | E, F, H | Test RBAC 401/403 Admin-only, safe checks, khóa `load_benchmark` (403) |
| **Hiệu năng & Tải đồng thời** | Chưa kiểm tra baseline | G | `scripts/perf_benchmark_v29.js` (P50/P95/P99, Throughput, Error/Timeout @ 50/100/200 CCU local) |
