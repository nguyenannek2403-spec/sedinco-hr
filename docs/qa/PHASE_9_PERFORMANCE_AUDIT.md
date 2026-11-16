# SEDINCO HR — PHASE 9 PERFORMANCE & CONCURRENCY AUDIT

Cập nhật: `2026-11-16` | Phiên bản: `Phase 9.6 & V14 Enterprise Pool/Worker Tuning`  
Mục tiêu kiểm thử: Express app thật + MySQL cục bộ `sedinco_hr_test` (`127.0.0.1:3306`) — tuyệt đối không tạo tải lên TiDB Cloud `sedinco_hr`.

---

## 1. Phê bình `scripts/qa/benchmark_local.js` (V3)

| Hạng mục | Thực tế của `benchmark_local.js` | Tại sao số đo V3 chưa phản ánh tải Production |
|---|---|---|
| **Tầng giao thức** | Gọi trực tiếp hàm JS (`attendanceService`, `payrollService`, `requestService`, `permissionService`) | Bỏ qua toàn bộ HTTP keep-alive/TLS, Express routing, JSON parser, JWT verify, `checkPermission` + `verifyUserStatusInDb` (DB lookup mỗi request) và `idempotencyMiddleware` |
| **Luồng Bcrypt & Đăng nhập** | Không kiểm thử `POST /api/login` / `POST /api/admin/login` | Không đo được nút thắt CPU và hàng đợi `bcryptWorkerPool` (trong production mặc định chỉ có **`2` worker threads**) |
| **Mức đồng thời (Concurrency)** | Chạy tuần tự (`for` từng iteration `8`/`5`), concurrency = **`1`** | Không gây tranh chấp `mysql2` pool (`connectionLimit = 10`) hay row lock / gap lock trên `attendance_logs` và `requests` |
| **Nhiễu số đo & Dọn rác sai cột** | `audit_logs_p1` gộp việc `DELETE` dọn `audit_logs` ngay trong luồng lặp đo; `cleanupScaleCohort` xóa `audit_logs` với cột không tồn tại `target_id` và nuốt lỗi qua `.catch(() => {})` | Làm phồng nhân tạo P50/P95 của `audit_logs_p1` (`~45–53 ms`) và làm rò rỉ dữ liệu `audit_logs` sau benchmark |
| **Thiếu chỉ số hệ thống** | Chỉ in P50/P95/P99 của vài hàm service | Thiếu throughput (RPS), tỷ lệ lỗi `4xx`/`5xx`/timeout, CPU user/sys, Peak RSS, `dbPoolEnqueueEvents` và độ sâu hàng đợi Bcrypt |

---

## 2. Kết quả Kiểm thử Tải Đồng thời Thực tế (`scripts/qa/load_test_local.js`)

Lệnh thực thi thực tế: `NODE_PATH=./sedinco_backend/node_modules node scripts/qa/load_test_local.js` (Exit `0`)  
Môi trường thực thi: Node `v26.13.0`, MySQL `127.0.0.1` (`sedinco_hr_test`), `mysqlConnectionLimit = 10`, `queueLimit = 0`, `connectTimeout = 10000 ms`, `bcryptWorkers = 10` (môi trường `NODE_ENV=test` dùng `os.cpus().length`, khác với **`2` worker** mặc định khi `NODE_ENV=production` nếu chưa đặt `BCRYPT_WORKER_POOL_SIZE`).  
Kịch bản mỗi user đồng thời: `POST /api/login` → bắn song song 4 API `[POST /api/attendance/check-in, GET /api/attendance/me, GET /api/payroll/me, POST /api/requests]` kèm song song manager `PUT /api/requests/:id` (`20` luồng) và `GET /api/attendance` (`5 / 10 / 20` luồng).

### 2.1 Tổng hợp 3 Mức Tải (`50 / 100 / 200` Concurrent Users)

| Chỉ số Tổng quan | `50` Concurrent Users | `100` Concurrent Users | `200` Concurrent Users |
|---|---:|---:|---:|
| Tổng số HTTP Request | `275` | `530` | `1,040` |
| Tổng thời gian tường (`wallMs`) | `1,805.61 ms` | `2,993.85 ms` | `5,997.29 ms` |
| Throughput (`throughputRps`) | `152.30 req/s` | `177.03 req/s` | `173.41 req/s` |
| Lỗi `4xx` / `5xx` / Timeout | `0` / `0` / `0` (`0%`) | `0` / `0` / `0` (`0%`) | `0` / `0` / `0` (`0%`) |
| Overall `avgMs` / `P50` | `469.52 ms` / `348.22 ms` | `920.49 ms` / `832.43 ms` | `2,013.19 ms` / `1,696.19 ms` |
| Overall `P95` / `P99` / `Max` | `988.46` / `1,018.36` / `1,020.82 ms` | `1,420.60` / `1,541.44` / `1,561.77 ms` | `3,261.05` / `3,309.10` / `3,336.73 ms` |
| Số request `> 250 ms` / `> 1,000 ms` | `165` / `8` | `516` / `228` | `1,040` (`100%`) / `1,010` (`97.1%`) |
| CPU (`user` / `system` ms) | `4,311.42` / `112.70 ms` | `8,445.03` / `205.50 ms` | `16,677.90` / `381.00 ms` |
| Peak RSS Memory (`peakRssMb`) | `348.0 MB` | `506.8 MB` | `663.4 MB` |
| **MySQL Pool `enqueue` Events** (`limit=10`) | **`1,974` lần chờ** | **`3,850` lần chờ** | **`7,681` lần chờ** |
| **Peak Bcrypt Queue Depth** (`10` workers) | **`15` tác vụ** | **`90` tác vụ** | **`134` tác vụ** |
| MySQL `Threads_connected` / `Running` | `23` / `2` | `23` / `2` | `23` / `2` |

*(Ghi chú minh bạch về phép đo: Trong `load_test_local.js:186-187`, sampler đọc thuộc tính nội bộ `_allConnections` và `_connectionQueue` trên promise wrapper `pool` thay vì `pool.pool`, nên hai bộ đếm `peakAllDbConns` và `peakDbQueue` in ra `0`; tuy nhiên sự kiện `pool.on('enqueue')` ủy quyền trực tiếp xuống underlying pool và đã ghi nhận chính xác **`1,974` -> `3,850` -> `7,681` lần xếp hàng chờ kết nối MySQL**.)*

### 2.2 Độ trễ Chi tiết theo Từng Endpoint (`50 / 100 / 200` Users)

| Endpoint | `50` Users (`avg / P50 / P95 / Max ms`) | `100` Users (`avg / P50 / P95 / Max ms`) | `200` Users (`avg / P50 / P95 / Max ms`) | Tỷ lệ thành công |
|---|---|---|---|---|
| `POST /api/login` | `900.36 / 968.25 / 1,018.36 / 1,020.82` | `1,261.88 / 1,389.21 / 1,435.94 / 1,455.88` | `2,350.92 / 2,427.01 / 2,719.42 / 2,951.32` | `100%` |
| `POST /api/attendance/check-in` | `767.83 / 800.57 / 829.78 / 844.53` | `1,324.49 / 1,358.95 / 1,541.44 / 1,561.77` | `3,135.67 / 3,131.90 / 3,309.10 / 3,336.73` | `100%` |
| `GET /api/attendance/me` | `211.01 / 183.43 / 385.59 / 410.84` | `612.99 / 654.56 / 820.54 / 823.67` | `1,446.34 / 1,478.74 / 1,638.13 / 1,694.52` | `100%` |
| `GET /api/payroll/me` | `248.11 / 222.89 / 405.68 / 428.47` | `773.42 / 763.51 / 1,031.70 / 1,035.16` | `1,686.37 / 1,665.53 / 1,861.23 / 1,915.73` | `100%` |
| `POST /api/requests` | `254.64 / 225.10 / 416.27 / 453.99` | `811.82 / 797.30 / 1,041.59 / 1,052.16` | `1,701.10 / 1,678.64 / 1,882.54 / 1,918.68` | `100%` |
| `PUT /api/requests/:id` | `494.62 / 494.81 / 495.78 / 495.95` | `383.99 / 350.81 / 418.56 / 418.57` | `913.77 / 807.24 / 1,166.71 / 1,167.39` | `100%` |
| `GET /api/attendance` (Matrix) | `25.92 / 25.24 / 28.11 / 28.11` | `172.23 / 172.75 / 175.52 / 175.52` | `568.22 / 570.14 / 573.45 / 573.56` | `100%` |

---

## 3. Phân tích Nút thắt Cổ chai (Bottlenecks) & Ranh giới Local vs TiDB Cloud

| Finding ID | Mức độ | Vị trí (`file:lines`) | Nguyên nhân gốc (Root Cause) | Ảnh hưởng thực tế | Khắc phục đã triển khai (V14) & Hướng tối ưu tiếp |
|---|---|---|---|---|---|
| `P9-PERF-01` | Cao | `sedinco_backend/src/config/db.js:5-20` | Trước V14: `connectionLimit: 10` và mọi request auth đều gọi `verifyUserStatusInDb` + query nối tiếp | Trong baseline `200` NV đồng thời với `limit=10`, phát sinh **`7,681` lần xếp hàng chờ pool**, đẩy `check-in` P95 lên `3,309 ms` | 🔧 **V14**: Nâng `connectionLimit` lên `Math.max(10, parseInt(process.env.DB_POOL_LIMIT, 10) || 20)`, bổ sung `maxIdle: 10`, `idleTimeout: 60000` (kèm `.unref()` cho timer sweep của `mysql2`) nhằm giảm xếp hàng kết nối giờ cao điểm |
| `P9-PERF-02` | Cao | `sedinco_backend/src/utils/bcryptWorkerPool.js:20-22` | Trước V14: `POOL_SIZE` ở production/staging mặc định là **`2` worker threads** | Nếu giữ `2` worker khi 200 công nhân đăng nhập đầu ca cùng lúc, hàng đợi bcrypt phình lớn (`MAX_QUEUE_SIZE = 500`, `TASK_TIMEOUT_MS = 10s`) | 🔧 **V14**: Nâng mặc định `POOL_SIZE = Math.max(4, Math.min(os.cpus().length \|\| 4, 8))` ở mọi môi trường (vẫn hỗ trợ override qua `BCRYPT_WORKER_POOL_SIZE`) |
| `P9-PERF-03` | Trung bình | TiDB Cloud vs Local `sedinco_hr_test` | Độ trễ thực trên TiDB Cloud chịu thêm TLS + WAN RTT (~`15–40 ms`/query so với `<1 ms` localhost), trong khi `sedinco_hr_test` cục bộ thiếu 4 composite index của Cloud nên `EXPLAIN` của `audit_logs` & `requests` còn hiện table scan | Không được dùng con số `check-in P95 = 3.31s` trên localhost để kết luận Production sẽ nhanh tương đương; trên Cloud với RTT WAN, mỗi roundtrip tăng tổng độ trễ | Kiểm tra kế hoạch thực thi `EXPLAIN` trên TiDB Staging khi chạy tải thật (read-only), tiếp tục gộp query trong `checkInMultiFactor` nếu mở rộng vượt ngưỡng hiện tại |

**Xác nhận sạch dữ liệu sau Load Test**: Cả `load_test_local.js` lẫn truy vấn kiểm tra chéo 11 bảng trên `sedinco_hr_test` đều cho thấy `remainingEmployees = 0`, `remainingAttendanceLogs = 0`, `remainingRequests = 0`, `audit_logs = 0`, `idempotency_keys = 0`.

