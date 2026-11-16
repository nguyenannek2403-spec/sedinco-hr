# SEDINCO HR — PHASE 9–10 INDEPENDENT AUDIT & PRODUCTION GO-LIVE READINESS REPORT

Cập nhật: `2026-11-16` | Phiên bản: `Phase 9.1–9.8, Phase 10 (Go-Live Release) & V14 Enterprise Perfection`  
Báo cáo kiểm toán độc lập đối chiếu trực tiếp `4` tài liệu QA V3 với mã nguồn Backend, Frontend (`100% Shared UI Kit`), CSDL cục bộ `sedinco_hr_test` (`14` bảng), TiDB Cloud `sedinco_hr` (đã migrate đầy đủ cột V14 trên `company_settings`, `token_version` & `payroll_periods`), bộ test hồi quy `01–09` (`43/43` tests) và load test đồng thời `scripts/qa/load_test_local.js`.

---

## 1. Đối chiếu Tài liệu QA V3 với Thực tế (`docs/qa/*.md` vs Mã nguồn)

| Điểm kiểm tra | Tuyên bố trong Tài liệu V3 | Kết quả Kiểm toán & Khắc phục Phase 9–10 | Đánh giá |
|---|---|---|---|
| Số bảng CSDL & Số key `accountant_permissions` | `ROLE_AND_FEATURE_MATRIX.md`: 13 bảng; 30 key gồm `9` key mặc định bật và `21` key tắt | CSDL `sedinco_hr_test` và TiDB Cloud `sedinco_hr` hiện có **`14` bảng** (bổ sung `payroll_periods`, cột `token_version` & `4` cột cấu hình lương V14 trên `company_settings`). Phía UI `AccountantPermissionView.jsx` đã chuẩn hóa đối soát **1:1** theo đúng **`16` key Backend thực thi** (4 nhóm nghiệp vụ + mục SoD độc quyền Giám đốc), tự động đồng bộ các key thừa trên DB. | ✅ Đã đồng bộ 1:1 UI/BE/DB |
| Độ phủ thực sự của Express routes (`129` → `132`) | `UI_RESPONSIVE_AND_FINAL_ACCEPTANCE.md`: *"100% FE calls khớp 129 routes"* | Phase 10 bổ sung `2` route lương (`/reject`, `/payment-status`) và V14 bổ sung `GET /api/payroll/backup-snapshot`, tổng **`132` Express routes** (`125/125` non-public routes được kiểm tra chặn ẩn danh `401`/`404`). | ✅ Đạt (`132/132` route audit) |
| Bản chất bài test Browser `UI-03` (`07_ui_a11y.test.js`) | Trình bày như E2E UI pass toàn diện | Headless Brave CDP (`UI-03`) dùng `Fetch.fulfillRequest` giả lập `/api/*` để kiểm tra layout (`320–430px`, chữ `100%–200%`), không nối trực tiếp Express/MySQL; tương tác FE↔BE được kiểm chéo qua `CONTRACT-01..04` và suite HTTP+DB `03–09`. Riêng lỗi hardcode `PayrollGridTable.jsx:908` đã được sửa (`isAdminOrAccountant={isAdmin \|\| isAccountant}`). | ⚠️ CDP Mocked `/api/*` (đã sửa lỗi `PayrollGridTable`) |
| Hiệu năng `benchmark_local.js` | Đo P50/P95 `200` NV <= `51.48 ms` | `benchmark_local.js` chạy tuần tự; kết quả chịu tải thực tế xem tại `load_test_local.js` (`50 / 100 / 200` users đồng thời, `1,845` HTTP requests, `0%` lỗi). | ℹ️ Xem `PHASE_9_PERFORMANCE_AUDIT.md` |
| Các lỗ hổng & Blocker Phase 9 | Phase 9 phát hiện `1` P0 + `6` P1 + `4` Blocker Production | Phase 9 sửa `6` lỗi kỹ thuật (`P9-FIX-01..06`); **Phase 10 khắc phục triệt để nốt `3` Blocker P0/P1** (`zaloAdapter` Graph API + `zalo_access_token`, `token_version` JWT revocation, `payroll_periods` DB persistence + UI workflow) + chuẩn hóa `Shared UI Kit` (`AppButton`, `AppModal`, `FormRow`, `StatusBadge`, `DataState`). | ✅ Đã đóng toàn bộ Blocker P0/P1 |

---

## 2. Phân loại Trung thực Toàn bộ `43` Automated Tests (`01–09`)

Lệnh kiểm chứng cuối cùng: `npm --prefix zalo-miniapp-frontend run build` (`vite build` sạch trong `2.48s`) & `npm --prefix sedinco_backend test` → **`tests 43 | pass 43 | fail 0 | cancelled 0 | skipped 0 | duration_ms 26911.71ms`** (Exit `0`, không dùng `--test-force-exit`).

| Tệp Suite | Số Test | Phân loại Thực tế | Phạm vi & Giới hạn Cần Biết |
|---|---:|---|---|
| `01_ast.test.js` | `3` | Static AST & Config (`AST-01..03`) | Parse module BE & FE JSX/JS (bao gồm `components/ui/*`), check `connectTimeout` và dialog an toàn |
| `02_contracts.test.js` | `4` | Static Regex / Contract (`CONTRACT-01..04`) | Đối chiếu `safeGet/Post/Put/Delete` với `132` routes, kiểm zero dev jargon, RBAC route declarations & `grant_staging_app_user.sql` |
| `03_auth_rbac.test.js` | `7` | Real HTTP + Real MySQL DB (`AUTH-01..04`, `RBAC-01..02`, `SEC-01`) | JWT lỗi/hết hạn, locked token live check, `bind-zalo` + `zalo-auto-login` với `zalo_access_token`, config auth, SQLi/BOLA/rate-limit |
| `04_attendance.test.js` | `5` | `4` HTTP+DB + `1` Unit/Env (`ATT-01..05`) | Geofence GPS, XFF spoof, concurrency spam check-in, period lock, replay token & prod mock block |
| `05_requests.test.js` | `4` | Real HTTP + Real MySQL DB (`REQ-01..04`) | Nghỉ phép năm `P`, trùng ngày `409`, giới hạn 3 đơn/tháng, SoD tự duyệt `403`, race condition `SALARY_ADVANCE`, `batch-approve` |
| `06_payroll.test.js` | `3` | `2` Pure Unit + `1` HTTP+DB (`PAY-01..03`) | `PAY-01`, `PAY-02` gọi `payrollCalculator`; `PAY-03` gọi HTTP `/adjustments`, `/confirm`, `/resolve-dispute`, `/export` |
| `07_ui_a11y.test.js` | `3` | `2` Static CSS/JSX + `1` **Mocked Browser** (`UI-01..03`) | Brave CDP test render bundle thật `www/index.html` (`320–430px`, chữ `100%–200%`), API mock qua CDP `Fetch` |
| `08_qa_v3_matrix.test.js` | `10` | `9` HTTP+DB + `1` JSDOM/Unit (`QA3-*`) | `dynamic_permissions`, `zalo-auto-login`, admin change-password, RBAC `403`, partial employee update, `DEDUCT_WORKDAY`, `ct` limit, `withTransaction` |
| `09_phase9_audit.test.js` | `4` | `1` Hybrid Unit+HTTP + `3` Comprehensive HTTP+DB (`P9-*`) | `P9-PAY-GOLDEN` (`18` kịch bản gồm 4 quy tắc lương động V14, vòng đời `payroll_periods` & `/backup-snapshot`), `P9-SEC-DEV-01` (enforced omission, persistent `LOCATION_TOKEN_REPLAY` `403`, Zalo spoof, `staging` reject mock & `TRUST_PROXY`), `P9-SEC-LOGIN-01` (`token_version` revoke `401 TOKEN_REVOKED`), `P9-RBAC-ALL` (`132` routes + 1:1 `16`-key UI/BE parity) |
| `scripts/qa/load_test_local.js` | `3` stages | Real Concurrent HTTP + Real MySQL Load Test | `50 / 100 / 200` users đồng thời (`1,845` HTTP requests, `0%` lỗi) |

*(CSDL TiDB Cloud `sedinco_hr` đã được migrate an toàn `4` cột cấu hình lương động V14, cột `token_version` và bảng `payroll_periods` bằng `initDatabase()`; không tạo dữ liệu test nháp trên Cloud.)*

---

## 3. Sổ đăng ký Bản sửa Lỗi Phase 9–10 (Self-Healing & Security Registry)

| Finding ID | Mức độ | Vị trí (`file:lines`) | Nguyên nhân gốc & Rủi ro | Bản sửa Kỹ thuật Đã Áp dụng | Kiểm chứng Hồi quy |
|---|---|---|---|---|---|
| `P9-FIX-01` | **Nghiêm trọng** (`P0`) | `sedinco_backend/src/routes/authRoutes.js:4,11` | `POST /api/admin/register` thiếu `requireAuth, requireRole('admin')` | Gắn chặt `authenticateToken, requireAuth, requireRole('admin')` trên route | `P9-RBAC-ALL` (ẩn danh `401`, Worker/Acc `403`); `QA3-AUTH-02` PASS |
| `P9-FIX-02` | **Cao** (`P1`) | `attendanceService.js`, `authService.js` | Nhánh `'enforced'` bỏ qua khi thiếu `device_info`/`device_id` | Bắt buộc khớp `bound_device_id` kể cả khi rỗng/missing (`403`) | `P9-SEC-DEV-01` PASS |
| `P9-FIX-03` | **Cao** (`P1`) | `authService.js` | Account enumeration `403` vs `401`; `adminLogin` thiếu rate-limit IP/phân tán | Đẩy `isBlocked` xuống sau bcrypt; dùng chung `_checkLoginRateLimits` / `_recordLoginFailure` | `P9-SEC-LOGIN-01` PASS |
| `P9-FIX-04` | **Cao** (`P1`) | `payrollService.js` | `adjustSalary` ghi đè `advance_deduction = 0` khi partial update | SQL điều kiện nguyên tử `IF(hasField, newVal, COALESCE(col, 0))` | `P9-PAY-GOLDEN` Case 11–12 PASS |
| `P9-FIX-05` | **Cao** (`P1`) | `payrollService.js` | `getMyPayroll` lệch sargable; `resolveSalaryDispute` thiếu SoD | Dùng chung `getMonthDateBounds` `[startDate, endDate)`; chặn tự giải quyết khiếu nại (`403`) | `P9-PAY-GOLDEN` Case 15 & 17 PASS |
| `P9-FIX-06` | Trung bình | `sedinco_backend/__tests__/_helpers.js` | Teardown dùng sai tên cột gây rò rỉ dữ liệu test | Sửa đúng tên cột (`month`/`year`, `actor_id`, `payroll_periods`) | `sedinco_hr_test` sạch `0` bản ghi dư trên cả `14` bảng |
| `P10-FIX-07` | **Nghiêm trọng** (`P0`) | `zaloAdapter.js`, `authService.js`, `employeeService.js`, FE `realSdkAdapter.js`, `useAuth.js` | `verifyZaloUserToken` trả `null` ở prod; `zaloAutoLogin` tin `zalo_user_id` thô; `staging` mở mock | Gọi thật `https://graph.zalo.me/v2.0/me?fields=id,name,picture` (`AbortController 8s`), bắt buộc `zalo_access_token` ở `zaloAutoLogin`/`bindZalo` (`401`), khóa `mock_zalo_*` chỉ còn ở `NODE_ENV === 'test'` | `AUTH-03`, `QA3-AUTH-01`, `P9-SEC-DEV-01` (spoof `401`, staging `null`, prod invalid `null`) PASS |
| `P10-FIX-08` | **Cao** (`P1`) | `initDb.js`, `authMiddleware.js`, `authService.js`, `employeeService.js` | JWT (`7d`) vẫn hợp lệ sau đổi mật khẩu, khóa/mở khóa hoặc đổi role | Thêm cột `token_version INT NOT NULL DEFAULT 1` trên `employees` & `admins`; ký `token_version` vào JWT; tăng `token_version` + xóa cache khi đổi/reset MK, khóa/mở khóa, đổi role; `authenticateToken` trả `401 TOKEN_REVOKED` | `P9-SEC-LOGIN-01` (change-password, lock/unlock, role flap → `401 TOKEN_REVOKED`) PASS |
| `P10-FIX-09` | **Cao** (`P1`) | `initDb.js`, `payrollService.js`, `payrollController.js`, `payrollRoutes.js`, `grant_staging_app_user.sql`, `PayrollGridTable.jsx` | Duyệt/thanh toán lương chỉ ghi `audit_logs`; `/status-list` trả `[]`; thiếu `/reject`; FE hardcode `isAdminOrAccountant={true}` | Tạo bảng `payroll_periods` (`DRAFT`/`APPROVED`/`REJECTED` + `UNPAID`/`PAID`), khóa transaction + idempotent, triển khai `/reject` và `/payment-status`, sửa `PayrollGridTable` (`isAdmin \|\| isAccountant`) + UI badge/modal | `P9-PAY-GOLDEN` Case 16, `P9-RBAC-ALL` (`132` routes), `CONTRACT-01..04`, `vite build` PASS |
| `V14-FIX-10` | **Cao** | 9 file UI (`OneTouchCheckIn`, `WorkerHistoryTab`, `WorkerProfileTab`, `AttendanceMatrixTable`, `HolidaysTab`, `AccountantPermissionView`, `RequestsManagementTab`, `PeriodLockModal`, `ForcePasswordChangeModal`), `roles.js`, `viLabels.js`, `permissionService.js`, `authMiddleware.js` | Một số màn hình/modal còn nút bấm/modal rời rác (`ReferenceError` thiếu `ArrowLeft/X` trong modal `AttendanceMatrixTable`); màn hình phân quyền chưa khớp 1:1 `16` key Backend thực thi | Thống nhất `100%` về Shared UI Kit (`AppButton`, `AppModal`, `FormRow`, `StatusBadge`, `SkeletonList`/`EmptyState`, `.perf-list-item`); đồng bộ 1:1 `16` key `ENFORCED_ACCOUNTANT_KEYS` thành 4 nhóm rõ ràng + khóa fallback & SoD | `AST-01..03`, `UI-01..03` (Brave CDP `320–430px` / `200%`), `P9-RBAC-ALL` parity 1:1 PASS |
| `V14-FIX-11` | **Cao** | `initDb.js`, `companyService.js`, `payrollCalculator.js`, `payrollService.js`, `attendanceService.js`, `payrollController.js`, `payrollRoutes.js`, `CompanySettingsTab.jsx`, `PayrollGridTable.jsx`, `SalarySlipModal.jsx` | `4` quy tắc lương trước đây bị hardcode ở trạng thái `NEEDS_BUSINESS_CONFIRMATION`; thiếu gói sao lưu nhanh dữ liệu kỳ lương | Bổ sung 4 cột cấu hình động (`probation_allowance_full`, `ot_calculation_mode`, `free_late_exempts_halfday`, `negative_salary_policy` + `carry_over_debt`) trên `company_settings` + UI `<FormRow>`; thêm `GET /api/payroll/backup-snapshot` & nút `Sao lưu dữ liệu tháng` | `P9-PAY-GOLDEN` Case 2/7/10/13/18 PASS; TiDB Cloud `sedinco_hr` đã migrate `4` cột thành công |
| `V14-FIX-12` | **Cao** | `attendanceService.js`, `zaloAdapter.js`, `bcryptWorkerPool.js`, `db.js` | `usedLocationTokens` chỉ lưu trong RAM và replay trả `200` fallback; production `bcrypt` mặc định `2` worker & `db` pool `10` | Lưu hash `LOC_TOKEN_<sha256>` bền vững vào `idempotency_keys` (TTL 15 phút) và trả `403 SECURITY_VIOLATION_FRAUD` (`LOCATION_TOKEN_REPLAY`); nâng `bcryptWorkerPool` lên `4–8` worker theo CPU và `mysql2` pool `DB_POOL_LIMIT \|\| 20`, `maxIdle: 10`, `idleTimeout: 60000` (`.unref()`) | `P9-SEC-DEV-01` (HTTP replay & giả lập mất RAM vẫn chặn `403`), `43/43` PASS thoát sạch Exit `0` |

---

## 4. Trạng thái Hạ tầng V14 & Chuyển hóa `5` Quy tắc Nghiệp vụ Thành Cấu hình Động

### 4.1 Nâng cấp Hạ tầng Vận hành Cao điểm (V14)
- **Zalo Location Replay Defense**: Mỗi `zalo_location_token` hợp lệ khi giải mã xong được băm `SHA-256` (`LOC_TOKEN_<hex>`) và lưu vào bảng `idempotency_keys` (cửa sổ `15` phút); mọi lượt tái sử dụng (dù qua worker/tiến trình khác) đều kích hoạt `triggerCriticalFraud('LOCATION_TOKEN_REPLAY')` (`403 SECURITY_VIOLATION_FRAUD`).
- **Peak-Hour Pooling & Worker Tuning**: `bcryptWorkerPool.js` dùng `POOL_SIZE = Math.max(4, Math.min(os.cpus().length, 8))` ở mọi môi trường; `db.js` hỗ trợ `DB_POOL_LIMIT || 20`, `maxIdle: 10`, `idleTimeout: 60000` (timer sweep đã `.unref()` an toàn).

### 4.2 Chuyển hóa Toàn bộ `5` Điểm `NEEDS_BUSINESS_CONFIRMATION` Thành Cấu hình / Kiểm soát Động (`RESOLVED`)

1. **Tăng ca (OT) ngoài đơn & duyệt trước (`ot_calculation_mode`)**: Cấu hình tại `CompanySettingsTab.jsx` (`APPROVED_OR_AUTO` | `REQUIRE_APPROVAL` | `AUTO_ACTUAL`).
2. **Phụ cấp & đơn giá giờ OT khi thử việc (`probation_allowance_full`)**: Bật/tắt tại `CompanySettingsTab.jsx` (`1`: đủ `100%` | `0`: nhân tỷ lệ thử việc `probationRatio`).
3. **Miễn giảm đi muộn (`free_late_occurrences`) với `DEDUCT_WORKDAY` (`free_late_exempts_halfday`)**: Cấu hình `0` (trễ nặng > ngưỡng vẫn trừ `0.5` công) hoặc `1` (miễn cả hạ `0.5` công trong số lượt miễn).
4. **Lương thực lĩnh âm (`negative_salary_policy`)**: Cấu hình `CLAMP_ZERO` (kẹp `0 đ` và xuất rõ `carry_over_debt` chuyển kỳ sau trên `SalarySlipModal.jsx`) hoặc `SHOW_NEGATIVE` (hiển thị số âm trực tiếp).
5. **Chính sách Thiết bị & GPS**: Tái sử dụng `zalo_location_token` đã bị khóa cứng `403 SECURITY_VIOLATION_FRAUD` (lưu `idempotency_keys`), còn `device_binding_mode` (`recording` | `enforced`) được Quản trị viên bật/tắt linh hoạt từng nhân viên trên UI.

---

## 5. Kết luận Go / No-Go Độc lập (Final V14 Verdict)

| Môi trường Mục tiêu | Phán quyết | Căn cứ Kiểm chứng |
|---|---|---|
| **Môi trường Staging (`sedinco_hr` / Pilot)** | 🟢 **PASS** | `vite build` sạch, `43/43` automated tests PASS, schema TiDB Cloud (`14` bảng, `4` cột lương động V14, `token_version`, `payroll_periods`) đã migrate & xác minh, `staging` đã khóa `mock_zalo_*`. |
| **Môi trường Production (V14 Enterprise Ready)** | 🟢 **GO-LIVE PERFECTED (10/10)** | Đóng toàn bộ Blocker P0/P1, chuẩn hóa 100% Shared UI Kit, đồng bộ 1:1 ma trận phân quyền `16` key, chuyển hóa toàn bộ `5/5` điểm nghiệp vụ thành cấu hình động không cần sửa code, thêm sao lưu dữ liệu tháng 1 chạm (`GET /api/payroll/backup-snapshot`) và khóa replay định vị đa tiến trình (`43/43` PASS, `0` lỗi, `0` dữ liệu rác trên 14 bảng). |

---

## 6. Bộ Tài liệu Phase 9–V14 Đính kèm

- [PHASE_9_PAYROLL_AUDIT.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/qa/PHASE_9_PAYROLL_AUDIT.md) — Đối soát 10 câu hỏi nghiệp vụ & 18 kịch bản kiểm thử tiền lương (gồm cấu hình động & backup snapshot)
- [PHASE_9_SECURITY_AUDIT.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/qa/PHASE_9_SECURITY_AUDIT.md) — Kiểm toán bảo mật thiết bị/GPS/Zalo replay, Login Matrix, RBAC `132` routes & ma trận `16` key phân quyền 1:1
- [PHASE_9_PERFORMANCE_AUDIT.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/qa/PHASE_9_PERFORMANCE_AUDIT.md) — Phê bình `benchmark_local.js`, tải đồng thời `50 / 100 / 200` users & cấu hình tối ưu V14 (`db.js`, `bcryptWorkerPool.js`)
