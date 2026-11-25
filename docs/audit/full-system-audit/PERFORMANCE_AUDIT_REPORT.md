# SEDINCO HR — PERFORMANCE, LOAD & DATABASE AUDIT REPORT (PHASE 9)

**Tài liệu kiểm thử hiệu năng & truy vấn SQL thực tế trên `NODE_ENV=test` (`127.0.0.1:3306 / sedinco_hr_test`).**  
**Script thực thi:** `tests/performance/loadAndQueryBench.test.js` + kết quả build `zalo-miniapp-frontend` (`vite build`).

---

## 1. Kết quả Benchmark API dưới tải đồng thời (Concurrency Load Test)

| Endpoint | Concurrency | Tổng số Request | Lỗi (`!=200`) | Avg Latency (ms) | p95 Latency (ms) | Max Latency (ms) |
|---|---|---|---|---|---|---|
| `GET /api/health` | 20 | 60 | `0` | `8.56 ms` | `19.34 ms` | `25.78 ms` |
| `GET /api/me` (JWT + DB user check) | 15 | 45 | `0` | `7.95 ms` | `14.38 ms` | `14.58 ms` |
| `GET /api/payroll?month=11&year=2026` | 10 | 20 | `0` | `29.58 ms` | `39.74 ms` | `39.74 ms` |
| `GET /api/attendance?month=11&year=2026` | 10 | 20 | `0` | `6.33 ms` | `7.66 ms` | `7.66 ms` |
| `GET /api/notifications/summary` | 10 | 20 | `0` | `16.55 ms` | `20.23 ms` | `20.23 ms` |

- **Heap Delta sau 165 concurrent HTTP requests:** `+34.29 MB` (trước khi GC chạy, không còn giữ reference rò rỉ trong `userStatusCache` sau bản vá Phase 7).

> **Lưu ý giải thích số liệu:** Tải chạy trên localhost MySQL với dữ liệu seed (`3–4` nhân viên). Trên dữ liệu lớn hơn (`1.000+` nhân viên, `30.000+` log/tháng) qua mạng WAN tới TiDB Cloud, các điểm nghẽn SQL `EXPLAIN` bên dưới sẽ khuếch đại rõ rệt.

---

## 2. Phân tích `EXPLAIN` & Điểm nghẽn Truy vấn CSDL (`loadAndQueryBench.test.js`)

1. **Truy vấn `MONTH(record_date) = ? AND YEAR(record_date) = ?` (Non-sargable):**
   - **Vị trí:** `attendanceService.js` (`L198, L281, L606, L652, L1810`), `requestService.js` (`L193, L199, L1187`), `employeeService.js` (`L275, L281`).
   - **Kết quả `EXPLAIN` thực tế:** `-> Table scan on attendance_logs (cost=0.65 rows=4)` — **Không thể dùng index `idx_att_record_date`!**
   - **Đối chứng Sargable Range (`record_date >= '2026-11-01' AND record_date < '2026-12-01'`):** `-> Index range scan on attendance_logs using idx_att_record_date`.
   - **Khuyến nghị:** Chuẩn hóa toàn bộ điều kiện lọc tháng sang khoảng `[YYYY-MM-01, nextYYYY-MM-01)`.

2. **Truy vấn `LOWER(TRIM(department))`:**
   - **Vị trí:** `departmentService.js` (`L27, L109, L171`).
   - **Kết quả `EXPLAIN` thực tế:** `-> Table scan on employees` — bỏ qua mọi B-Tree index nếu có.

3. **Truy vấn `audit_logs ORDER BY is_pinned DESC, created_at DESC LIMIT 50`:**
   - **Kết quả `EXPLAIN` thực tế:** `-> Sort: audit_logs.is_pinned DESC, audit_logs.created_at DESC -> Table scan on audit_logs (rows=359)`. Vì index `idx_audit_created` đang là `(created_at, is_pinned)` (thứ tự cột ngược với `ORDER BY`), MySQL phải quét toàn bảng để sắp xếp lại.

4. **Index dư thừa & N+1 Pattern đã xác định:**
   - `attendance_logs`: tồn tại `idx_att_logs_emp_date (employee_id, record_date)` trùng lặp với unique constraint `unique_emp_date (employee_id, record_date)`.
   - `payrollService.sendSalaryReport`: Vòng lặp gọi 2–4 query/nhân viên bên trong một `withTransaction` duy nhất (gây lock lâu nếu danh sách hàng trăm NV) và tính toán thừa toàn bộ công ty khi gửi cho 1 NV.
   - `permissionService.getAlertsSummary` & `notificationService.syncSystemAlertsForUser`: Gọi nối tiếp 17 queries trên mỗi lần mở/đồng bộ chuông thông báo cho Admin/Kế toán.
   - `mediaLifecycleService.countLiveReferences`: N+1 tối đa `6 * 100 = 600` truy vấn `COUNT(*)` khi chạy `cleanup-orphans`.
   - `diagnosticsController.getSystemStatus`: Gọi `execSync('git rev-parse --short HEAD')` đồng bộ gây chặn event loop khi route diagnostics bật.

---

## 3. Hiệu năng Frontend Bundle (`vite build`)

- **Kết quả build:** `✓ 2629 modules transformed`, build hoàn tất trong **`3.03s`**.
- **Kích thước sản phẩm (`zalo-miniapp-frontend/www/assets/`):**
  - `index.8ijOwggR.module.js`: **`1,402.41 kB`** (gzip: `423.90 kB`) — Vượt cảnh báo `500 kB` của Rollup/Vite chủ yếu do gộp `xlsx`, `qrcode`, `jsqr`, `zmp-ui` và các view dashboard trong chunk chính (dù một số view như `PayrollGridTable`, `AttendanceMatrixTable`, `MediaStorageManagementTab`, `AccountantPermissionView`, `ForcePasswordChangeModal` đã tách lazy chunk).
  - `index-DaReZrZt.css`: **`229.26 kB`** (gzip: `32.29 kB`) — Đã loại bỏ khai báo `@tailwind` trùng lặp trong `src/css/app.scss`. *(Lưu ý: `zmp-ui/zaui.css` + custom utilities vẫn chiếm phần lớn kích thước CSS; tổng kích thước chunk JS chính là điểm cần tối ưu bằng `manualChunks` hoặc lazy-load `xlsx`/`BankTransferModal` ở phase tối ưu tiếp theo).*
