# SEDINCO HR — TEST CATALOG & EXECUTION REPORT

Cập nhật lần cuối: `2026-11-14` | Nền tảng chạy: Node `v26.13.0`, MySQL local `sedinco_hr_test` (`127.0.0.1:3306`), Headless Brave CDP.

---

## 1. Danh mục 8 Bộ Kiểm thử Tự động Cục bộ (`sedinco_backend/__tests__/`)

Lệnh thực thi trong `sedinco_backend/package.json`:  
`NODE_ENV=test DB_HOST=${DB_HOST:-127.0.0.1} DB_NAME=${DB_NAME:-sedinco_hr_test} DB_SSL=false node --test --test-concurrency=1 --test-reporter=spec __tests__/*.test.js`  
*(Đã gỡ hoàn toàn `--test-force-exit`; toàn bộ DB pool, HTTP server và `bcryptWorkerPool` tự đóng sạch sau khi chạy.)*

| Suite File | Test ID | Tên / Phạm vi kiểm thử | Trạng thái sau bản sửa cuối | Thời lượng (ms) |
|---|---|---|---|---|
| `01_ast.test.js` | `AST-01` | Parse all Backend JS modules (`48` files) and resolve local `require()` paths | ✔ PASS | `53.93` |
| `01_ast.test.js` | `AST-02` | Parse all Frontend JS/JSX modules (`41` files) and verify local imports & safe dialogs | ✔ PASS | `55.54` |
| `01_ast.test.js` | `AST-03` | Anti-Hang & Production Hardening — DB `connectTimeout` configured & zero dead auth routes in FE | ✔ PASS | `0.26` |
| `02_contracts.test.js` | `CONTRACT-01` | Every FE API call (`safeGet/Post/Put/Delete`) matches a real mounted BE Express route | ✔ PASS | `4.06` |
| `02_contracts.test.js` | `CONTRACT-02` | FE `proxy-check-in` (`work_location_type`) parity & `DesktopDashboard` `isTabAllowedForRole` guard | ✔ PASS | `0.16` |
| `02_contracts.test.js` | `CONTRACT-03` | Zero Developer Jargon in rendered FE text | ✔ PASS | `0.15` |
| `02_contracts.test.js` | `CONTRACT-04` | BE permission route alignment, SoD UI transparency & `grant_staging_app_user.sql` consistency | ✔ PASS | `0.57` |
| `03_auth_rbac.test.js` | `AUTH-01` | Reject unauthenticated, malformed, `alg=none`, expired, and tampered JWTs | ✔ PASS | `1033.46` |
| `03_auth_rbac.test.js` | `AUTH-02` | Locked/Inactive user rejected at login and live token revocation (0-delay DB check) | ✔ PASS | `216.86` |
| `03_auth_rbac.test.js` | `AUTH-03` | Zalo `bind-zalo` + `zalo-auto-login` roundtrip must succeed end-to-end | ✔ PASS | `4.07` |
| `03_auth_rbac.test.js` | `AUTH-04` | Public config/holidays/period-status routes must require authentication (no factory GPS leak) | ✔ PASS | `9.76` |
| `03_auth_rbac.test.js` | `RBAC-01` | Worker cannot access Accountant or Admin endpoints + No privilege escalation via claim spoofing | ✔ PASS | `12.41` |
| `03_auth_rbac.test.js` | `RBAC-02` | Strict SoD for Accountant + Exact dynamic permission key enforcement | ✔ PASS | `7.13` |
| `03_auth_rbac.test.js` | `SEC-01` | BOLA/IDOR, SQL Injection, XSS sanitization, and composite login rate limiting (`429`) | ✔ PASS | `722.07` |
| `04_attendance.test.js` | `ATT-01` | GPS Geofence check-in inside radius + out-of-range flagged + field work raw fallback | ✔ PASS | `881.34` |
| `04_attendance.test.js` | `ATT-02` | Single-use location token replay protection & production mock token blocking | ✔ PASS | `0.33` |
| `04_attendance.test.js` | `ATT-03` | IP Spoofing via forged `X-Forwarded-For` must NOT bypass geofence or pollute Wi-Fi whitelist | ✔ PASS | `131.29` |
| `04_attendance.test.js` | `ATT-04` | Concurrency spam check-in produces at most 1 row + Idempotency replay returns consistent result | ✔ PASS | `183.23` |
| `04_attendance.test.js` | `ATT-05` | Period lock blocks worker/admin mutations until admin unlocks + Holiday & Cleanup audit logging | ✔ PASS | `17.99` |
| `05_requests.test.js` | `REQ-01` | Leave balance tracking, duplicate-date conflict (`409`), 3/month comp limit & Paid leave (`P`) sync | ✔ PASS | `796.08` |
| `05_requests.test.js` | `REQ-02` | Strict SoD — Accountant cannot self-approve own request or OT pre-registration | ✔ PASS | `12.48` |
| `05_requests.test.js` | `REQ-03` | Concurrency & Double-Approval Defense on Salary Advance (no duplicate `advance_deduction`) | ✔ PASS | `21.20` |
| `05_requests.test.js` | `REQ-04` | Batch-approve atomic behavior skips invalid/self-requests safely | ✔ PASS | `17.38` |
| `06_payroll.test.js` | `PAY-01` | Paid Annual Leave (`P`) & Public Holiday (`L`) credit `1.0` workday in `payrollCalculator` | ✔ PASS | `758.31` |
| `06_payroll.test.js` | `PAY-02` | Probation 85% split, OT weekday/Sunday/Holiday multipliers & Zero-day 0 insurance boundary | ✔ PASS | `0.17` |
| `06_payroll.test.js` | `PAY-03` | Late Policy `DEDUCT_WORKDAY`, Adjustments, Confirm/Dispute SoD & Export CSV Formula Sanitization | ✔ PASS | `52.44` |
| `07_ui_a11y.test.js` | `UI-01` | Index HTML zoom unlocked (`WCAG 1.4.4`) & SCSS scales input text at `200%` | ✔ PASS | `0.84` |
| `07_ui_a11y.test.js` | `UI-02` | Semantic A11y — switches, attendance cells, icon `aria-label`s, micro-fonts & contrast | ✔ PASS | `1.08` |
| `07_ui_a11y.test.js` | `UI-03` | Headless Brave CDP Matrix (`320-430px` viewports, `100%-200%` font scale, Worker/Accountant/Admin DOM polling) | ✔ PASS | `12587.33` |
| `08_qa_v3_matrix.test.js` | `QA3-AUTH-01` | Accountant login & `zalo-auto-login` must include `dynamic_permissions` map | ✔ PASS | `1047.08` |
| `08_qa_v3_matrix.test.js` | `QA3-AUTH-02` | Admin register enforces password policy & pure admin user can `change-password` | ✔ PASS | `349.71` |
| `08_qa_v3_matrix.test.js` | `QA3-RBAC-01` | Dynamic Accountant permissions negative `403` matrix & immutable Admin SoD boundaries | ✔ PASS | `15.98` |
| `08_qa_v3_matrix.test.js` | `QA3-EMP-01` | Employee partial `PUT /employees/:id` update & missing employee `404` checks | ✔ PASS | `10.40` |
| `08_qa_v3_matrix.test.js` | `QA3-ATT-01` | Attendance manual update/delete audit log (`DELETE_ATTENDANCE`) & `404` checks | ✔ PASS | `70.60` |
| `08_qa_v3_matrix.test.js` | `QA3-ATT-02` | Late policy `DEDUCT_WORKDAY` checkout preserves `0.5` & enforces `<= 4.5h` cap | ✔ PASS | `5.68` |
| `08_qa_v3_matrix.test.js` | `QA3-REQ-01` | Monthly 3-request limit includes `"ct"` attendance compensation & rejected OT preserves `'1'` log | ✔ PASS | `21.29` |
| `08_qa_v3_matrix.test.js` | `QA3-PAY-01` | `resolve-dispute` validates `new_status` & unknown employee (`400`/`404`) + Golden Payroll Oracle parity | ✔ PASS | `4.56` |
| `08_qa_v3_matrix.test.js` | `QA3-DB-01` | Database sargable range & schema/data integrity checks (`08_qa_v3_matrix.test.js`) | ✔ PASS | `3.70` |
| `08_qa_v3_matrix.test.js` | `QA3-FE-01` | `safeGet` `cancelPrevious` guards `activeRequests` deletion so superseded `finally` cannot drop newer controller | ✔ PASS | `156.51` |

**Tổng kết `npm --prefix sedinco_backend test` (sau bản sửa cuối)**: **`39` tests | `39` pass | `0` fail | `0` cancelled | `0` skipped | `20,663.62 ms`** (Exit code `0`, không cần `--test-force-exit`).

---

## 2. Benchmark Hiệu năng Cục bộ (`scripts/qa/benchmark_local.js`) & Phân tích `EXPLAIN`

Lệnh chạy: `NODE_ENV=test DB_HOST=127.0.0.1 DB_NAME=sedinco_hr_test DB_SSL=false node scripts/qa/benchmark_local.js`  
Kết quả chạy thực tế: **Exit `0`** | `test_run_id`: `BMFUU8W8`.

| Quy mô nhân sự (Local MySQL `sedinco_hr_test`) | `attendance_matrix` (P50 / P95 / P99) | `payroll_calculate` (P50 / P95 / P99) | `batch_approve_10` (P50 / P95 / P99) | `audit_logs_p1` (P50 / P95 / P99) |
|---|---|---|---|---|
| **50 nhân viên** | `7.3 ms` / `8.64 ms` / `8.64 ms` | `17.69 ms` / `28.45 ms` / `28.45 ms` | `16.88 ms` / `22.54 ms` / `22.54 ms` | `48.22 ms` / `53.14 ms` / `53.14 ms` |
| **100 nhân viên** | `6.09 ms` / `11.28 ms` / — | `16.34 ms` / `22.66 ms` / — | `12.2 ms` / `13.79 ms` / — | `45.23 ms` / `48.12 ms` / — |
| **200 nhân viên** | `12.45 ms` / `14.1 ms` / `14.1 ms` | `29.74 ms` / `34.72 ms` / `34.72 ms` | `11.7 ms` / `12.69 ms` / `12.69 ms` | `48.18 ms` / `51.48 ms` / `51.48 ms` |

**Kết quả `EXPLAIN` truy vấn trọng yếu (Local `sedinco_hr_test`)**:
- `attendance_logs_sargable_range`: `Index range scan on attendance_logs using unique_emp_date` (`cost=2.11 rows=3`) — cải thiện vượt trội so với `attendance_logs_month_year_fn` (`Table scan on attendance_logs`, `cost=440 rows=4394`).
- `audit_logs_actor_created` trên local `sedinco_hr_test`: `Table scan on a` (`cost=5476 rows=52932`).
- `requests_emp_status_created` trên local `sedinco_hr_test`: `Table scan on requests` (`cost=20.8 rows=205`).
- *(Ghi chú: CSDL `sedinco_hr_test` cục bộ chưa tạo 4 composite index của TiDB Cloud nên 2 truy vấn sau còn hiện table scan trên bản dump local.)*

---

## 3. Phạm vi TiDB Cloud & Trạng thái Sạch CSDL Kiểm thử

1. **Benchmark TiDB Cloud (`sedinco_hr`)**: **`NOT_MEASURED` / `BLOCKED` theo guardrail** — không bơm dữ liệu benchmark hay gây tải lên TiDB Cloud trong đợt QA V3.
2. **Safe Cloud E2E (`scripts/qa/run_e2e_cloud.js`)**: Đã đạt **`PASS` ở đợt V2** (`actualWorkDays === 2`, `0` bản ghi `QA_TEST_` / `2099` còn sót), nhưng **`NOT_RE_RUN_AFTER_V3_EDITS`** (chưa chạy lại sau các bản sửa V3; cần chạy xác nhận nếu muốn nghiệm thu thêm riêng trên Cloud).
3. **Kiểm tra độ sạch `sedinco_hr_test` sau V3 test + benchmark**:
   - Toàn bộ suite `03..08` và `benchmark_local.js` đã tự dọn `0` bản ghi dư tại `employees`, `admins`, `requests`, `ot_registrations`, `period_locks`, `public_holidays`.
   - Kiểm tra chi tiết phát hiện tồn dư cục bộ từ bài chạy kiểm thử/benchmark (`1` dòng `NO_SUCH_EMP_QV3` tại `attendance_logs`, `53` dòng `QV3_*` tại `idempotency_keys`, và `BM*` / `QV3_*` / `ADM_P_QV3_*` tại `audit_logs`); đã dọn sạch trực tiếp trên `sedinco_hr_test` và kiểm chứng toàn bộ `remainingSynthetic = 0`.
