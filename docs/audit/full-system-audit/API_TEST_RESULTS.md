# SEDINCO HR — API TEST RESULTS (PHASE 3 & 10 BASELINE)

**Môi trường thực thi:** `NODE_ENV=test` (`127.0.0.1:3306 / sedinco_hr_test`), Express HTTP ephemeral test server, Cloudinary Mock Transport (`setTransportAdapter`), Zalo Test Doubles (`NODE_ENV=test` strictly gated).  
**Thời điểm chạy baseline:** Trước khi áp dụng các bản vá Phase 7/13.

---

## 1. Tổng hợp kết quả thực thi tự động (`tests/`)

| Bộ kiểm thử | File thực thi | Số ca | Kết quả | Ghi chú quan trọng |
|---|---|---|---|---|
| **Unit Tests** (`domainEngines.test.js`) | `tests/unit/domainEngines.test.js` | 12 | **12 PASS / 0 FAIL** | `UNIT-VAL-01` xác nhận bug tiền-vá: `validateAttendanceInput` cho qua ngày `2026-02-31`. Thử nghiệm `TZ=UTC` tách riêng tái hiện 100% bug `payrollCalculator` mất sạch tiền OT (`otAmount = 0`). |
| **API Catalog** (`apiCatalog.test.js`) | `tests/api/apiCatalog.test.js` | 16 | **16 PASS / 0 FAIL** | Bao phủ System/410, Auth/Zalo/Profile, Company/Dept/Holiday, Attendance/QR/Idempotency, Requests/Pre-OT, Payroll/Dispute/Paid, Media Pipeline, Permissions/AuditLogs. `API-EMP-BUG-CHECK` ghi nhận `DELETE /employees/:id` trả `500 ReferenceError: avatar_url is not defined`. |
| **Cross-Module E2E** (`crossModuleFlows.test.js`) | `tests/e2e/crossModuleFlows.test.js` | 10 | **10 PASS / 0 FAIL** | Toàn bộ 10 luồng nghiệp vụ liên module chạy thông suốt (gồm khóa tài khoản thu hồi JWT qua `token_version++`, `cleanup-orphans` giữ nguyên Avatar B và xóa Avatar A). |
| **Red Team Suite** (`redTeamSuite.test.js`) | `tests/security/redTeamSuite.test.js` | 13 | **6 VULNERABLE / 7 DEFENDED** | Chi tiết chứng cứ tái hiện trong `RED_TEAM_SECURITY_REPORT.md`. |

---

## 2. Chi tiết 16 Nhóm ca kiểm thử API Catalog (`tests/api/apiCatalog.test.js`)

| ID | Nội dung kiểm thử | HTTP Status quan sát | Độ trễ (ms) | Kết quả |
|---|---|---|---|---|
| `API-SYS-01` | `GET /api/health` trả `healthy` & `uptime` | `200` | 33ms | PASS |
| `API-SYS-02` | `GET /api/definitely-missing-route` trả JSON `404 NOT_FOUND` | `404` | 3ms | PASS |
| `API-SYS-03` | `GET /api/attendance/dynamic-qr` & `/qr` trả `410 Gone` | `410 / 410` | 3ms | PASS |
| `API-SYS-04` | `POST /api/client-errors` từ chối payload `<script>` | `400` / `404` | 3ms | PASS |
| `API-AUTH-01` | Route cần đăng nhập không token trả `401 UNAUTHORIZED` | `401` | 1ms | PASS |
| `API-AUTH-02` | `GET /me`, `/auth/me`, `/profile` trả hồ sơ đã loại trường `password` | `200 / 200 / 200` | 5ms | PASS |
| `API-AUTH-03` | Tạo NV -> Login -> Login sai (401) -> Đổi MK -> Theme/FontScale -> BankCard chặn QR (400) -> BankCard hợp lệ (200) | `201/200/401/200/400/200` | 380ms | PASS |
| `API-AUTH-04` | Zalo `/auth/zalo/link` -> `/status` -> `/zalo-auto-login` -> `/unlink` | `200 / 200 / 200 / 200` | 34ms | PASS |
| `API-ORG-01` | Company read + Worker chặn update (403) + Department CRUD + chặn xóa default id=1 (400) | `200/403/201/200/400/200` | 58ms | PASS |
| `API-ORG-02` | Holiday CRUD với `salary_multiplier=1.5`, chặn `end_date < start_date` (400) | `201/400/200/200` | 6ms | PASS |
| `API-ATT-01` | Precheck -> QR Session -> Check-in kèm `X-Idempotency-Key` -> Replay `X-Idempotency-Replay: true` -> Update công -> Today/Me/Matrix | `200` | 33ms | PASS |
| `API-REQ-01` | Tạo đơn phép -> Hủy -> Tạo lại -> Admin duyệt -> Tạo & Duyệt Pre-OT | `201/200/201/200/201/200` | 24ms | PASS |
| `API-PAY-01` | Adjustments -> Send-report -> Worker Dispute -> Resolve -> Mark-paid -> Worker Received -> `GET /payroll/me` (`daily_logs`) | `200` | 56ms | PASS |
| `API-MED-01` | `GET /media/config` -> Multipart Upload (`leave_evidence`) -> Signed URL access -> Admin Dashboard -> Safe Delete | `200/201/200/200/200` | 28ms | PASS |
| `API-SET-01` | `GET /notifications/my`, `PUT /read-all`, `GET /notifications/summary`, `GET /settings/accountant-permissions`, `GET /settings/audit-logs` | `200` | 21ms | PASS |
| `API-EMP-BUG-CHECK` | Kiểm chứng lỗi hiện hữu `DELETE /employees/TEST_API_W1` ném `500` (`avatar_url is not defined`) | `500` | 3ms | PASS (Bug Confirmed) |

---

## 3. Hạng mục phụ thuộc tích hợp bên ngoài (`Mocked` vs `Not Executed Live`)

| Thành phần | Trạng thái trong Audit | Lý do & Ranh giới an toàn |
|---|---|---|
| **Cloudinary Live Cloud API** (`upload_stream`, `destroy`, `api.usage`) | **PASS (Mocked via `setTransportAdapter` & `setUsageApiFetcher`)** | `.env.test` không chứa key Cloudinary thật; tuyệt đối không ghi/xóa file trên tài khoản Cloudinary thật khi chạy test tự động. |
| **Zalo Graph API Live** (`graph.zalo.me/v2.0/me`, `/me/info`) | **PASS (Test Double in `NODE_ENV=test`)** | Đã kiểm chứng replay protection & TTL logic; chữ ký live với máy chủ Zalo cần người thật xác minh trên Zalo Mini App testing (xem `USER_ACCEPTANCE_TEST_PLAN.md`). |
| **Casso Bank Lookup API** (`openapi.casso.vn`) | **BLOCKED (No live call in offline test)** | Không thực hiện gọi Casso thật trong bộ test tự động; đã audit validation, token cache 14 phút, retry 401 và rate-limit 25 req/phút trong `bankLookupService.js` & `authController.js`. |
