# SEDINCO HR — REGRESSION TEST REPORT (PHASE 13 — POST-REMEDIATION)

**Thời điểm thực thi:** Sau khi hoàn thành toàn bộ các bản vá Phase 7 (`Blue Team Security & Bug Fixes` trên cả Backend & Frontend).  
**Môi trường kiểm thử:** `NODE_ENV=test` (`127.0.0.1:3306 / sedinco_hr_test`), Mock Cloudinary Transport, Zalo Test Doubles, plus standalone `TZ=UTC` calculation check and Frontend `vite build`.

---

## 1. Bảng tổng hợp kết quả hồi quy cuối cùng (`100% EXECUTABLE SUITES PASSED`)

| Bộ kiểm thử | Lệnh chạy | Tổng ca | Đạt (`PASS` / `DEFENDED`) | Thất bại (`FAIL` / `VULNERABLE`) | Lưu ý / Scope |
|---|---|---|---|---|---|
| **Timezone UTC Calculation Proof** | `TZ=UTC NODE_ENV=test node -e "..."` | 1 | **1 PASS** | 0 | Xác minh `ngay_chinh_thuc='2026-11-02'` + `ot_registrations='2026-11-02'` dưới `TZ=UTC`: `congThuViec=0, congChinhThuc=1, totalOtHours=2, otAmount=187500`. |
| **Unit Tests** | `node tests/unit/domainEngines.test.js` | 12 | **12 PASS** | 0 | Bao gồm MISA 8h/ca đêm, chuẩn Chủ nhật, tính lương lễ x1.5 + OT + đối soát ngày, chặn `2026-02-31`, Media EXE/SVG/override, QR HMAC, Bank QR block. |
| **API Catalog** | `node tests/api/apiCatalog.test.js` | 16 | **16 PASS** | 0 | Toàn bộ phân hệ REST API hợp lệ/lỗi/idempotency + `API-EMP-DELETE` trả `200` sạch và ghi `DELETE_EMPLOYEE`. |
| **Red Team Re-Attack** | `node tests/security/redTeamSuite.test.js` | 13 | **13 DEFENDED** | 0 | **6/6** lỗ hổng tái hiện trước đây (`RT-AUTH-01`, `RT-CSRF-01`, `RT-RBAC-01`, `RT-MED-01`, `RT-ATT-01`, `RT-BUG-01`) đều đã chuyển sang **`DEFENDED`**. |
| **Cross-Module E2E** | `node tests/e2e/crossModuleFlows.test.js` | 10 | **10 PASS** | 0 | Đủ 10 luồng nghiệp vụ liên module (`E2E-01`..`E2E-10`, bao gồm Cloudinary Avatar `A -> B -> Orphan Cleanup`). |
| **Load & SQL Explain** | `node tests/performance/loadAndQueryBench.test.js` | 5 bench + 5 EXPLAIN | **5/5 PASS (0 errors)** | 0 | Concurrency `10–20`, tổng `165` requests không lỗi (`0 errors`), ghi nhận các điểm tối ưu SQL index cho backlog. |
| **Frontend Production Build** | `cd zalo-miniapp-frontend && npm run build` | Build | **PASS (`3.03s`)** | 0 | 2629 modules transformed; xuất `www/assets/` hợp lệ. |

---

## 2. Xác nhận khôi phục sạch dữ liệu kiểm thử (`Test Data Isolation`)

Sau khi các suite kết thúc `teardown()`:
- Bảng `employees` chỉ còn nguyên vẹn 3 tài khoản gốc (`NV001`, `NV002`, `NV003`), mọi tài khoản `TEST_*` đã bị dọn sạch.
- Bảng `departments` giữ nguyên 4 khối gốc (`Khối Văn phòng` là default id=1).
- Bảng `media_assets` có `0` bản ghi mồ côi test.
- Production Database (`sedinco_hr` trên TiDB Cloud) hoàn toàn không bị đụng chạm.

---

## 3. Các hạng mục KHÔNG thực thi trực tiếp (Honest Gap Disclosure)

- **Cloudinary Cloud Live API (`upload_stream` / `destroy` / `api.usage` thật):** Đã kiểm chứng qua Mock Transport (`setTransportAdapter`); chưa upload/xóa trực tiếp lên Cloudinary Cloud thật vì `.env` test/local không chứa key thật và quy định tránh tạo file rác ngoài test double.
- **Zalo Graph API Live & ZMP Native UI trên điện thoại thật:** Phần xác thực token Zalo dùng test doubles nội bộ (`NODE_ENV=test`); giao diện cảm ứng, GPS/Camera/QR native trong Zalo App iOS & Android cần người thật xác minh theo `USER_ACCEPTANCE_TEST_PLAN.md`.
- **Casso Paykit API Live (`openapi.casso.vn`):** Không thực hiện gọi mạng thực tế trong suite tự động; cần kiểm thử tra cứu số tài khoản thật trên môi trường Staging có mạng.
