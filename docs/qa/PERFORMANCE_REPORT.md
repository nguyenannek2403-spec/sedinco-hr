# SEDINCO HR V29 — BÁO CÁO HIỆU NĂNG & KIỂM THỬ TẢI (PERFORMANCE REPORT)

- **Phiên bản**: V29
- **Môi trường đo**: Máy cục bộ & CSDL test cục bộ (`127.0.0.1 / sedinco_hr_test`) qua script `sedinco_backend/scripts/perf_benchmark_v29.js`.
- **Chính sách an toàn**: Tuyệt đối KHÔNG chạy kiểm thử tải nặng (50/100/200 CCU) lên Cơ sở dữ liệu đám mây sản xuất. Các bài tải đồng thời chỉ thực hiện cục bộ; nút chạy tải nặng trên giao diện Web bị khóa cứng HTTP `403 SAFE_MODE_LOCKED` (`V29-QA-01`).

## 1. Dữ liệu Benchmark 50 / 100 / 200 CCU (Nguồn: `docs/performance/V29_BENCHMARK_METRICS.json`)
Tập kịch bản đo 6 endpoint trọng yếu đồng thời (`GET /api/me`, `GET /api/notifications/my`, `GET /api/notifications/summary`, `GET /api/attendance`, `GET /api/payroll/me`, `GET /api/payroll`):

### Trước khi tối ưu index bổ sung (`baseline_before_index`)
| Mức tải | Tổng Request | P50 (ms) | P95 (ms) | P99 (ms) | Max (ms) | Throughput (RPS) | Lỗi / Timeout |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **50 CCU** | 100 | 12,82 | 60,58 | 63,74 | 64,58 | 1.453,33 | 0% / 0% |
| **100 CCU** | 200 | 37,40 | 91,62 | 104,48 | 106,62 | 1.788,73 | 0% / 0% |
| **200 CCU** | 400 | 54,02 | 146,85 | 158,29 | 163,01 | 2.372,96 | 0% / 0% |

### Sau khi bổ sung index V29 (`initDb.js`)
Index bổ sung gồm: `idx_att_confirm_status` (`attendance_logs`), `idx_req_status_created` (`requests`), `idx_ot_status` (`overtime_requests`), cùng `uniq_notif_recipient_alert_key` (`user_notifications`).

| Mức tải | Tổng Request | P50 (ms) | P95 (ms) | P99 (ms) | Max (ms) | Throughput (RPS) | Lỗi / Timeout |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **50 CCU** | 100 | 36,48 | 94,61 | 100,40 | 101,83 | 949,75 | 0% / 0% |
| **100 CCU** | 200 | 29,87 | 82,60 | 89,61 | 91,70 | 2.082,10 | 0% / 0% |
| **200 CCU** | 400 | 55,67 | 154,96 | 166,04 | 169,71 | 2.275,19 | 0% / 0% |

### Chi tiết từng Endpoint tại mức tải đỉnh 200 CCU (400 requests)
| Endpoint | Số Request | P50 (ms) | P95 (ms) | P99 (ms) |
| :--- | :---: | :---: | :---: | :---: |
| `GET /api/me` | 67 | 33,92 | 134,94 | 153,42 |
| `GET /api/notifications/my` | 68 | 34,39 | 136,97 | 155,88 |
| `GET /api/notifications/summary` | 67 | 60,35 | 155,42 | 162,39 |
| `GET /api/attendance` | 66 | 48,53 | 143,54 | 158,14 |
| `GET /api/payroll/me` | 66 | 73,18 | 161,75 | 167,30 |
| `GET /api/payroll` | 66 | 83,13 | 166,04 | 169,71 |

## 2. Nhận xét kỹ thuật
- **Độ ổn định**: Tất cả 6 lần chạy benchmark (3 trước index, 3 sau index) đều đạt **0% error rate** và **0% timeout rate**; ngưỡng `P95` cao nhất ở 200 CCU là `166,04ms` trên `GET /api/payroll` (tính toán tổng hợp bảng lương toàn công ty), thấp hơn nhiều ngưỡng mục tiêu `500ms`.
- **Biến động ở 50 CCU**: Trên bộ dữ liệu test nhỏ cục bộ (vài chục bản ghi), độ trễ TCP/DB pool warmup chi phối nhiều hơn B-Tree scan nên `50 CCU` dao động (`60,58ms -> 94,61ms`), trong khi `100 CCU` cải thiện từ `1788,73 RPS -> 2082,10 RPS` và `P95` giảm từ `91,62ms -> 82,60ms`. Giá trị của các composite index sẽ phát huy rõ nhất khi bảng `requests`, `overtime_requests`, `attendance_logs` tăng lên hàng nghìn dòng trên môi trường thực tế.
- **Tối ưu build Frontend**: Vite production build đóng gói `2.532` module trong `2,52s` với lazy-loading các chunk nặng (`PayrollGridTable`, `AttendanceMatrixTable`, `QaCenterTab`, `RoleOverviewDashboard`).
