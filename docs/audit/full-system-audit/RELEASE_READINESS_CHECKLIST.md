# SEDINCO HR — RELEASE READINESS CHECKLIST (PHASE 14 QUALITY GATE)

**Phán quyết tổng thể:** **CONDITIONAL GO (Đạt chuẩn phát hành sau khi hoàn tất cấu hình biến môi trường Production & 6 ca Human UAT trên thiết bị thật)**

---

## 1. Cổng kiểm soát Chất lượng Đã Đạt (Verified PASS)

- [x] **Tái dựng & Hiểu toàn bộ mã nguồn:** Đọc và kiểm kê 100% Frontend (`68` files), Backend (`67` files), Scripts (`8` files) và `19` bảng DB.
- [x] **Toàn bộ lỗ hổng Critical & High đã được vá và tái tấn công chứng minh `DEFENDED`:**
  - [x] Chặn Kế toán tự tăng lương (`RT-RBAC-01: 403`)
  - [x] Sửa tính OT & mốc thử việc dưới `TZ=UTC` (`UNIT-PAY-UTC: otAmount=187,500`)
  - [x] Sửa crash `DELETE /employees/:id` (`API-EMP-DELETE: 200` + audit log)
  - [x] Chặn brute-force toàn cục >30 lần (`RT-AUTH-01: 429`)
  - [x] Chuyển kiểm tra phiên DB sang Fail-Closed (`503`) & xóa memory leak `userStatusCache`
  - [x] Chặn ghi DB qua `GET /payroll/calculate` (`RT-CSRF-01: 405`)
  - [x] Cô lập SHA-256 deduplication theo `employee_id` & 24h (`RT-MED-01`)
  - [x] Từ chối `zalo_location_token` hỏng/giả thay vì hạ cấp `raw` (`RT-ATT-01: 403`)
- [x] **Toàn bộ 51+ ca kiểm thử tự động & Frontend Build đều PASS (`0 errors`):**
  - `tests/unit/domainEngines.test.js`: **12/12 PASS**
  - `tests/api/apiCatalog.test.js`: **16/16 PASS**
  - `tests/security/redTeamSuite.test.js`: **13/13 DEFENDED**
  - `tests/e2e/crossModuleFlows.test.js`: **10/10 PASS** (gồm Cloudinary Avatar A->B->Cleanup)
  - `zalo-miniapp-frontend`: `npm run build` -> **PASS (`3.03s`)**
- [x] **An toàn Production Database:** Toàn bộ test chỉ chạy trên `127.0.0.1 / sedinco_hr_test`; DB test đã được khôi phục sạch về trạng thái seed (`NV001`, `NV002`, `NV003`, `admin`).

---

## 2. Điều kiện Bắt buộc Trước Khi Đưa Lên Production (Pre-Release Gates)

- [ ] **Gate 1 — Hardening Biến Môi Trường Production (`sedinco_backend` trên Render/Server):**
  - `NODE_ENV=production`
  - `ENABLE_DIAGNOSTICS=false` (bắt buộc — app sẽ tự từ chối khởi động nếu bật trên production)
  - `ENABLE_CLIENT_ERROR_REPORTING=false` (hoặc cấu hình kiểm soát chặt)
  - `LOCATION_MODE=STRICT` (hoặc `WARN` có chủ đích nếu cho phép chấm công Wi-Fi/Web không có token Zalo) và **`REJECT_DOWNGRADE_TO_RAW=true`**
  - `JWT_SECRET` & `QR_SECRET` tối thiểu 32 ký tự ngẫu nhiên mạnh
  - Cấu hình đủ `ZALO_APP_ID`, `ZALO_APP_SECRET`, `CASSO_APP_ID`, `CASSO_APP_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - `CORS_ORIGIN=https://h5.zdn.vn,https://zapps.vn` (và domain Admin Web chính thức nếu có — tuyệt đối không để `*`)
  - `ALLOW_RUNTIME_DDL=false` (và chạy trước migration nếu nâng cấp schema mới, cấp quyền app user khớp đủ **19 bảng** theo `scripts/grant_staging_app_user.sql` đã cập nhật)
- [ ] **Gate 2 — Hoàn thành Human UAT trên Zalo Mini App thật (`USER_ACCEPTANCE_TEST_PLAN.md`):**
  - [ ] Xác nhận Allowlist Domain trên Zalo Developer Portal (`Backend HTTPS`, `res.cloudinary.com`, `api.cloudinary.com`, `img.vietqr.io`, `api.vietqr.io`)
  - [ ] Test trực tiếp UAT-01..UAT-06 trên iOS & Android thật (GPS thật, Camera QR, Cloudinary thật, Casso & VietQR deeplink, Kế toán `canLockPeriod` + Bottom Nav `Hồ sơ`).
- [ ] **Gate 3 — Đồng bộ Git & Triển khai có kiểm soát:**
  - Review `git diff` toàn bộ các bản vá Phase 7, commit sạch lên nhánh kiểm toán / `main`, deploy Backend lên Staging kiểm tra healthcheck (`/api/health`) rồi mới promote lên Production.
