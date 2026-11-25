# SEDINCO HR — FULL TEST CASE CATALOG (PHASE 10)

Danh mục toàn bộ test cases được tổ chức trong thư mục `tests/` của dự án, bao gồm cả kiểm thử tự động đã thực thi (`PASS`) và danh sách ca kiểm thử UAT thủ công (`USER_ACCEPTANCE_TEST_PLAN.md`).

---

## 1. Cấu trúc Bộ Kiểm Thử (`tests/`)

```text
tests/
├── fixtures/testHarness.js            # Harness cô lập NODE_ENV=test, snapshot/restore DB, Mock Cloudinary/Usage, HTTP & Multipart helpers
├── unit/domainEngines.test.js         # 12 Unit tests: MISA engine, Timezone/Sundays, Payroll calc, Validation, Media/QR/Bank security
├── api/apiCatalog.test.js             # 16 API contract & edge-case tests trên toàn bộ phân hệ Express + MySQL Test DB
├── security/redTeamSuite.test.js      # 13 Red Team exploit & re-attack tests (Auth, RBAC/SoD, CSRF GET, IDOR, Dedup, Upload, Fraud, Race)
├── e2e/crossModuleFlows.test.js       # 10 Cross-Module End-to-End business flow tests (gồm Cloudinary Avatar A->B->Cleanup)
└── performance/loadAndQueryBench.test.js # Load benchmark (20 concurrent) + EXPLAIN query plans
```

---

## 2. Danh mục Chi tiết các Test Case Tự Động (`51 Automated Cases + 1 UTC Standalone Proof`)

### 2.1 Unit Tests (`tests/unit/domainEngines.test.js` — 12 cases + `TZ=UTC` proof)
| ID | Mô tả | Dữ liệu & Điều kiện | Kỳ vọng | Trạng thái |
|---|---|---|---|---|
| `UNIT-MISA-01` | Công đủ ngày 08:00–17:30 | FULL_DAY chuẩn | `work_credit=1`, `status='1'`, 240p sáng + 240p chiều | PASS |
| `UNIT-MISA-02` | Chấm nhầm dưới 15 phút | 08:00–08:10 | `work_credit=0`, `INVALID_SHORT_DURATION` | PASS |
| `UNIT-MISA-03` | Nửa công sáng | 08:00–12:00 | `work_credit=0.5`, `status='0.5'` | PASS |
| `UNIT-MISA-04` | Ca đêm xuyên nửa đêm | NIGHT_SHIFT 22:00–06:00 | `work_credit=1` | PASS |
| `UNIT-MISA-05` | Tính tiền công ngày | `13,000,000 / 26 * 0.5` | `250,000` | PASS |
| `UNIT-TIME-01` | Công chuẩn tự động trừ Chủ nhật | Tháng 11/2026 | `25` công (30 - 5 CN) | PASS |
| `UNIT-PAY-01` | Tính lương có OT duyệt + lễ x1.5 + đối soát tổng ngày | `luong_cb=12.5M`, 2h OT, 1 ngày lễ | `otAmount=187,500`, `sum(daily) == grossSalary` | PASS |
| `UNIT-PAY-UTC` | Tính lương dưới `TZ=UTC` (Cloud server) | `ngay_chinh_thuc='2026-11-02'`, OT đã duyệt `'2026-11-02'` | `totalOtHours=2`, `otAmount=187,500`, `congThuViec=0` | PASS |
| `UNIT-VAL-01` | Chặn ngày lịch không tồn tại | `2026-02-31` | `valid === false` | PASS |
| `UNIT-MEDIA-01` | Chặn tệp `MZ` giả `.png` & `<svg onload>` XSS | Buffer độc hại | Ném lỗi bảo mật, từ chối buffer | PASS |
| `UNIT-MEDIA-02` | Chặn client override `folder`/`public_id` & sinh đường dẫn an toàn | Payload `{ folder, public_id }` | Bắt lỗi override; folder dạng `sedinco-hr/employees/documents/...` | PASS |
| `UNIT-QR-01` | Ký QR HMAC `SEDQR1` & từ chối chữ ký sửa đổi | Token hợp lệ vs sửa 4 ký tự cuối | Valid / Throw lỗi chữ ký | PASS |
| `UNIT-BANK-01` | Chặn lưu `qr_image` vào DB thẻ ngân hàng & parse Data URL | Payload kèm `qr_image` | Throw `QR_IMAGE_STORAGE_FORBIDDEN` | PASS |

### 2.2 API Contract & Edge-Case Tests (`tests/api/apiCatalog.test.js` — 16 suites)
- `API-SYS-01`..`04`: Health, 404 JSON, 410 Gone legacy QR, XSS client-errors rejection.
- `API-AUTH-01`..`04`: 401 unauthorized, `/me`=`/auth/me`=`/profile` không lộ hash MK, Lifecycle tài khoản + BankCard + Preferences, Zalo link/status/auto-login/unlink.
- `API-ORG-01`..`02`: Company config + Departments CRUD + Default delete block (400) + Holidays x1.5/x2.5 CRUD.
- `API-ATT-01`, `API-REQ-01`, `API-PAY-01`, `API-MED-01`, `API-SET-01`, `API-EMP-DELETE`: Toàn bộ luồng CRUD/Idempotency/Notifications/Permissions/Audit + Xóa nhân viên sạch (`200` + audit log).

### 2.3 Red Team Security Tests (`tests/security/redTeamSuite.test.js` — 13 suites)
- `RT-AUTH-01`..`03`: Global Brute-Force `429`, Header spoof/Forged JWT `401`, Token revocation `401 TOKEN_REVOKED`.
- `RT-CSRF-01`: `GET /payroll/calculate` chặn `405` không sửa DB.
- `RT-RBAC-01`: Accountant tự sửa lương mình chặn `403`.
- `RT-IDOR-01`: Horizontal IDOR đọc file / hủy đơn của đồng nghiệp chặn `403`.
- `RT-MED-01`..`02`: Cross-Employee SHA-256 Dedup cô lập theo `employee_id`; Chặn SVG/EXE/JS-PDF/FolderOverride `400`.
- `RT-MASS-01`: Mass assignment `role='admin'` & SoD self-approve bị chặn `400`/`403`.
- `RT-ATT-01`..`02`: Chặn invalid `zalo_location_token` (`403`), Fake GPS (`403`), QR Replay (`403`).
- `RT-RACE-01`: 5 concurrent paid-leave requests trong Transaction chỉ cho qua tối đa `1`.
- `RT-BUG-01`: `DELETE /employees/:id` không crash `500`, ghi đủ audit.

### 2.4 Cross-Module End-to-End Flows (`tests/e2e/crossModuleFlows.test.js` — 10 flows)
- `E2E-01`: Employee Lifecycle (`Create -> Login -> ChangePass -> Docs -> Update -> Lock (revokes JWT) -> Re-login`).
- `E2E-02`: Smart Attendance (`Precheck -> QR -> Check-in w/ Photo -> MISA Today Status`).
- `E2E-03`: Leave Request -> Monthly Paid Leave Quota -> Approve -> Attendance Sync (`P`) -> Payroll `paidLeaveDays = 1`.
- `E2E-04`: Payroll Send Report -> Worker Dispute w/ Evidence -> Admin Resolve -> Mark Paid -> Worker Received.
- `E2E-05`: Period Lock chặn sửa công & nộp đơn -> KT unlock bị `403` -> Admin unlock cho phép sửa lại.
- `E2E-06`: Bật/tắt quyền động `attendance_edit` của Kế toán có hiệu lực tức thì (`403` <-> `200`).
- `E2E-07`: Gửi báo cáo lương kích hoạt `user_notifications` -> Read-all đưa `unread_count` về `0`.
- `E2E-08`: Đổi tên & xóa phòng ban tự động điều chuyển nhân viên về `Khối Văn phòng`.
- `E2E-09`: Ngày lễ tùy chỉnh `x1.5` tính đúng tiền lễ trong phiếu lương.
- `E2E-10`: Cloudinary Avatar `A -> B -> Orphan Candidate -> Dry-Run Cleanup -> Delete Remote A & Keep B`.
