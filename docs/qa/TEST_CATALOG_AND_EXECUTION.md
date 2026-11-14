# SEDINCO HR — TEST CATALOG & EXECUTION REPORT

Cập nhật lần cuối: `2026-11-14` | Nền tảng chạy: Node `v26.13.0`, MySQL local `sedinco_hr_test` (`127.0.0.1:3306`), TiDB Cloud `sedinco_hr`, Brave Headless CDP.

---

## 1. Danh mục 7 Bộ Kiểm thử Tự động Cục bộ (`sedinco_backend/__tests__/`)

Lệnh thực thi toàn bộ: `npm test` (`NODE_ENV=test DB_HOST=127.0.0.1 DB_NAME=sedinco_hr_test DB_SSL=false node --test --test-concurrency=1 --test-reporter=spec --test-force-exit __tests__/*.test.js`).

| Suite File | Test ID | Tên kiểm thử | Trạng thái sau bản sửa cuối | Thời lượng (ms) |
|---|---|---|---|---|
| `01_ast.test.js` | `AST-01` | Parse all Backend JS modules (`48` files) and resolve local `require()` paths | ✔ PASS | `54.49` |
| `01_ast.test.js` | `AST-02` | Parse all Frontend JS/JSX modules (`41` files) and verify local imports & safe dialogs | ✔ PASS | `59.05` |
| `01_ast.test.js` | `AST-03` | Anti-Hang & Production Hardening — DB `connectTimeout` configured & zero dead auth routes in FE | ✔ PASS | `0.28` |
| `02_contracts.test.js` | `CONTRACT-01` | Every FE API call (`safeGet/Post/Put/Delete`) matches a real mounted BE Express route | ✔ PASS | `3.88` |
| `02_contracts.test.js` | `CONTRACT-02` | FE `proxy-check-in` (`work_location_type`) parity & `DesktopDashboard` `isTabAllowedForRole` guard | ✔ PASS | `0.16` |
| `02_contracts.test.js` | `CONTRACT-03` | Zero Developer Jargon in rendered FE text | ✔ PASS | `0.15` |
| `02_contracts.test.js` | `CONTRACT-04` | BE permission route alignment, SoD UI transparency & `grant_staging_app_user.sql` consistency | ✔ PASS | `0.47` |
| `03_auth_rbac.test.js` | `AUTH-01` | Reject unauthenticated, malformed, `alg=none`, expired, and tampered JWTs | ✔ PASS | `1281.45` |
| `03_auth_rbac.test.js` | `AUTH-02` | Locked/Inactive user rejected at login and live token revocation (0-delay DB check) | ✔ PASS | `254.80` |
| `03_auth_rbac.test.js` | `AUTH-03` | Zalo `bind-zalo` + `zalo-auto-login` roundtrip must succeed end-to-end | ✔ PASS | `7.08` |
| `03_auth_rbac.test.js` | `AUTH-04` | Public config/holidays/period-status routes must require authentication (no factory GPS leak) | ✔ PASS | `8.37` |
| `03_auth_rbac.test.js` | `RBAC-01` | Worker cannot access Accountant or Admin endpoints + No privilege escalation via claim spoofing | ✔ PASS | `12.67` |
| `03_auth_rbac.test.js` | `RBAC-02` | Strict SoD for Accountant + Exact dynamic permission key enforcement | ✔ PASS | `7.73` |
| `03_auth_rbac.test.js` | `SEC-01` | BOLA/IDOR, SQL Injection, XSS sanitization, and composite login rate limiting (`429`) | ✔ PASS | `753.18` |
| `04_attendance.test.js` | `ATT-01` | GPS Geofence check-in inside radius + out-of-range flagged + field work raw fallback | ✔ PASS | `958.83` |
| `04_attendance.test.js` | `ATT-02` | Single-use location token replay protection & production mock token blocking | ✔ PASS | `0.52` |
| `04_attendance.test.js` | `ATT-03` | IP Spoofing via forged `X-Forwarded-For` must NOT bypass geofence or pollute Wi-Fi whitelist | ✔ PASS | `148.66` |
| `04_attendance.test.js` | `ATT-04` | Concurrency spam check-in produces at most 1 row + Idempotency replay returns consistent result | ✔ PASS | `192.56` |
| `04_attendance.test.js` | `ATT-05` | Period lock blocks worker/admin mutations until admin unlocks + Holiday & Cleanup audit logging | ✔ PASS | `18.81` |
| `05_requests.test.js` | `REQ-01` | Leave balance tracking, duplicate-date conflict (`409`), 3/month comp limit & Paid leave (`P`) sync | ✔ PASS | `1062.22` |
| `05_requests.test.js` | `REQ-02` | Strict SoD — Accountant cannot self-approve own request or OT pre-registration | ✔ PASS | `19.12` |
| `05_requests.test.js` | `REQ-03` | Concurrency & Double-Approval Defense on Salary Advance (no duplicate `advance_deduction`) | ✔ PASS | `35.46` |
| `05_requests.test.js` | `REQ-04` | Batch-approve atomic behavior skips invalid/self-requests safely | ✔ PASS | `29.15` |
| `06_payroll.test.js` | `PAY-01` | Paid Annual Leave (`P`) & Public Holiday (`L`) credit `1.0` workday in `payrollCalculator` | ✔ PASS | `788.79` |
| `06_payroll.test.js` | `PAY-02` | Probation 85% split, OT weekday/Sunday/Holiday multipliers & Zero-day 0 insurance boundary | ✔ PASS | `0.30` |
| `06_payroll.test.js` | `PAY-03` | Late Policy `DEDUCT_WORKDAY`, Adjustments, Confirm/Dispute SoD & Export CSV Formula Sanitization | ✔ PASS | `44.18` |
| `07_ui_a11y.test.js` | `UI-01` | Index HTML zoom unlocked (`WCAG 1.4.4`) & SCSS scales input text at `200%` | ✔ PASS | `1.13` |
| `07_ui_a11y.test.js` | `UI-02` | Semantic A11y — switches, attendance cells, icon `aria-label`s, micro-fonts & contrast | ✔ PASS | `0.63` |
| `07_ui_a11y.test.js` | `UI-03` | Headless Brave CDP Matrix (`320-430px` viewports & `100%-200%` font scale) zero overflow, `>=44px` targets & clean console | ✔ PASS | `10931.20` |

**Tổng kết `npm test`**: **`29` tests | `29` pass | `0` fail | `0` cancelled | `0` skipped | `17,872.40 ms`**.

---

## 2. Kiểm thử Safe Cloud E2E trên TiDB Cloud (`npm run test:e2e-full`)

Script thực thi: `scripts/qa/run_e2e_cloud.js` (chỉ tạo tài khoản `QA_TEST_WKR`, `QA_TEST_ACC`, `QA_TEST_ADM` và dữ liệu tháng `10/2099`, tuyệt đối không sửa dữ liệu thật hay đổi schema TiDB Cloud).

Các luồng đã xác minh trực tiếp trên TiDB Cloud:
1. Đăng nhập thật cả 3 vai trò (`POST /api/login`) và thu JWT hợp lệ.
2. Bảo vệ endpoint nhạy cảm: ẩn danh `GET /api/company` trả `401`; Worker `GET /api/attendance?month=10&year=2099` trả `403`.
3. Cross-role luồng đầy đủ: `POST /api/employees/bind-zalo` → `POST /api/auth/zalo-auto-login` → Admin `POST /api/attendance/proxy-check-in` ngày `2099-10-02` (`work_location_type: 'FIELD_WORK'`) → Worker gửi đơn nghỉ phép `P` ngày `2099-10-03` (`POST /api/requests` -> `201`) → Admin duyệt đơn (`PUT /api/requests/:id` -> `200`) → Worker kiểm tra phiếu lương `GET /api/payroll/me?month=10&year=2099` xác nhận `actualWorkDays === 2` (`1` ngày đi làm + `1` ngày nghỉ phép `P`).
4. Khóa / mở khóa kỳ công & SoD: Admin `lock-period` (`200`) → Accountant thử `unlock-period` bị chặn (`403`) → Admin `unlock-period` (`200`).
5. Dọn dẹp toàn bộ `QA_TEST_%` và năm `2099` qua `cleanupCloudQa()` trong `finally` + đóng pool `pool.end(() => process.exit(exitCode))`.

**Kết quả thực tế**:
- `E2E CLOUD FULL PASS: All 3-role cross-interaction flows verified on TiDB Cloud!`
- `TiDB Cloud QA_TEST_ leftover count: 0`
- Kiểm tra chéo sau chạy trên 6 bảng (`employees`, `attendance_logs`, `attendance`, `requests`, `period_locks`, `audit_logs` với điều kiện `QA_TEST_%` hoặc `2099`): **tất cả `= 0` bản ghi dư**.
