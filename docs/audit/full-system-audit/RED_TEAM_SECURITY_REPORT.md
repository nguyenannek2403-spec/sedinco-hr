# SEDINCO HR — RED TEAM SECURITY REPORT (PHASE 6)

> **Nguyên tắc thực thi Phase 6:** Toàn bộ tấn công kiểm thử được thực thi trên môi trường cô lập `NODE_ENV=test` (`127.0.0.1 / sedinco_hr_test`) **TRƯỚC KHI SỬA BẤT KỲ DÒNG MÃ NÀO** để ghi nhận bằng chứng tái hiện chính xác.  
> **Script tái hiện tự động:** `tests/security/redTeamSuite.test.js` + script UTC `payrollCalculator`.

---

## 1. Tóm tắt kết quả tấn công Red Team

- **Tổng số vector kiểm thử thực tế trên HTTP API & Engine:** `14` vector (`13` trong `redTeamSuite.test.js` + `1` UTC Timezone Attack test).
- **Lỗ hổng tái hiện thành công (`VULNERABLE`):** **`7` lỗ hổng** (`2 Critical`, `3 High`, `2 Medium`).
- **Vector phòng thủ đạt chuẩn (`DEFENDED`):** **`7` vector**.

---

## 2. Chi tiết các lỗ hổng đã tái hiện với bằng chứng (Confirmed Exploits)

### `[RT-RBAC-01]` [CRITICAL] Accountant tự nâng lương & phụ cấp cho chính mình (`Privilege / Financial Escalation`)
- **Mô tả:** Khi Quản trị viên bật quyền `employee_edit` cho vai trò Kế toán (mục đích hỗ trợ sửa hồ sơ cho nhân viên), `employeeService.updateEmployee` không chặn Kế toán tự chỉnh sửa hồ sơ tài chính của chính tài khoản mình (Self-Modification SoD) và cho phép cập nhật `luong_cb`, các khoản phụ cấp, `custom_allowances`, `has_insurance`, `annual_leave_quota` trực tiếp.
- **Tái hiện (`redTeamSuite.test.js`):**
  - Tài khoản `TEST_RED_KT` (`role='accountant'`) gọi `PUT /api/employees/TEST_RED_KT` với `{ luong_cb: 999999999, phu_cap_trach_nhiem: 50000000 }`.
  - **Kết quả quan sát:** API trả **`HTTP 200 OK`**, Database bảng `employees` cập nhật thành **`luong_cb = 999999999.00`**.
- **Tác động:** Gian lận tài chính nội bộ nghiêm trọng (tự bơm lương/phụ cấp trước kỳ tính lương).

### `[RT-TZ-01]` [CRITICAL] Mất sạch tiền tăng ca (OT = 0) & sai ranh giới thử việc trên server chạy múi giờ UTC (`TZ=UTC`)
- **Mô tả:** `payrollCalculator.js` (L119–120, L194–195, L249–250, L443–444) khởi tạo `new Date('YYYY-MM-DDT00:00:00+07:00')` rồi gọi `.setHours(0, 0, 0, 0)` (dùng múi giờ hệ điều hành!). Trên cloud container mặc định chạy `UTC` (như Render), `+07:00` bị dịch ngược thành `17:00` ngày hôm trước rồi cắt về `00:00Z` ngày hôm trước (-1 ngày), khiến mọi phép so khớp `rDate.getTime() === logDate.getTime()` (với `ot_registrations`) và `logDate < ngayChinhThuc` bị lệch hoàn toàn 1 ngày.
- **Tái hiện (`TZ=UTC` Node test):**
  - Input: NV `ngay_chinh_thuc: '2026-11-02'`, log `'2026-11-02'` (`status: '1/OT', ot_hours: 2`), `ot_registrations: [{ work_date: '2026-11-02', expected_hours: 2, status: 'approved' }]`, `ot_calculation_mode: 'REQUIRE_APPROVAL'`.
  - **Kết quả quan sát dưới `TZ=UTC`:** `{ congThuViec: 0, congChinhThuc: 1, totalOtHours: 0, otAmount: 0 }` — **bị xóa sạch 100% tiền OT!**

### `[RT-AUTH-01]` [HIGH] Bypass khóa Brute-Force phân tán toàn cục (`ACCOUNT_GLOBAL_MAX_ATTEMPTS = 30`)
- **Mô tả:** `authService.js` định nghĩa hằng `ACCOUNT_GLOBAL_MAX_ATTEMPTS = 30` ("Ngưỡng chặn cứng toàn cục") và ghi `locked_until` vào bảng `login_rate_limits` cho key `account:<identifier>`. Tuy nhiên `_checkLoginRateLimits` (L300–319) chỉ kiểm tra `isUnderAttack` để `setTimeout` tối đa `2000ms` rồi vẫn `return null` cho phép thử mật khẩu tiếp, **không bao giờ trả `429` chặn yêu cầu**. Ngoài ra `zaloAutoLogin` chưa áp dụng rate limit.
- **Tái hiện (`redTeamSuite.test.js`):**
  - Tài khoản `TEST_RED_W1` có `account:TEST_RED_W1` (`attempt_count = 35`, `locked_until` ở tương lai).
  - Gửi `POST /api/login` -> **Kết quả quan sát:** Trả **`HTTP 401`** (`"Thông tin đăng nhập không hợp lệ!"`) chứng tỏ server vẫn thực hiện hash/kiểm tra mật khẩu thay vì chặn `429`.

### `[RT-CSRF-01]` [HIGH] Thao tác ghi dữ liệu DB thông qua HTTP `GET /api/payroll/calculate`
- **Mô tả:** `payrollRoutes.js` mở `GET /api/payroll/calculate` nối trực tiếp tới `payrollController.calculatePayroll`, hàm này chạy `autoResolveSalaryDisputes(...)` làm thay đổi trạng thái `attendance.dispute_status` và `salary_confirm_status` trong Database qua một request HTTP `GET`.
- **Tái hiện (`redTeamSuite.test.js`):**
  - Bản ghi lương có `salary_confirm_status='DISPUTED'`, `dispute_status='OPEN'`.
  - Gửi `GET /api/payroll/calculate?month=6&year=2095` -> **Kết quả quan sát:** Trả **`HTTP 200`**, dữ liệu DB bị đổi từ **`OPEN -> RESOLVED`**.

### `[RT-MED-01]` [HIGH] Rò rỉ liên kết Media chéo nhân viên qua cơ chế SHA-256 Deduplication
- **Mô tả:** `cloudinaryService.js:383-427` thực hiện chống upload trùng lặp theo `(checksum, uploaded_by, upload_category)` mà **không kiểm tra `employee_id`** và **không giới hạn cửa sổ 24h như comment**. Khi Quản trị viên/Kế toán upload cùng một tệp (ví dụ mẫu PDF hợp đồng/giấy tờ) cho Nhân viên A rồi upload cho Nhân viên B, hệ thống trả về `deduplicated: true` mang `asset_uuid` gắn với Nhân viên A (dẫn tới danh sách tài liệu của Nhân viên B không có bản ghi riêng và trỏ nhầm quyền sở hữu về NV A).
- **Tái hiện (`redTeamSuite.test.js`):**
  - Admin upload PDF `upA` (`target_employee_id: TEST_RED_W1`), sau đó upload cùng nội dung `upB` (`target_employee_id: TEST_RED_W2`).
  - **Kết quả quan sát:** `upB` trả `201`, `deduplicated=true`, và `upB.data.asset_uuid === upA.data.asset_uuid`!

### `[RT-ATT-01]` [MEDIUM] Hạ cấp im lặng sang GPS `raw` khi `zalo_location_token` không hợp lệ / bị giả mạo
- **Mô tả:** `attendanceService.js:1373-1377`: Khi client gửi kèm `zalo_location_token` nhưng hàm `verifyZaloLocationToken` trả `null` (token giả mạo, hết hạn, hoặc bị đánh cắp), thay vì từ chối token hỏng, backend giữ nguyên `isLowTrustLocation = true` (`raw`) và cho phép chấm công thành công `200 OK` (nếu `LOCATION_MODE` cho phép `raw`/`both`, như cấu hình `.env` hiện tại là `both`).
- **Tái hiện (`redTeamSuite.test.js`):**
  - Gửi `POST /api/attendance/check-in` kèm `zalo_location_token: 'tampered_invalid_zalo_token_xyz'`.
  - **Kết quả quan sát:** Trả **`HTTP 200 OK`** (`location_source = raw`).

### `[RT-BUG-01]` [MEDIUM — RELIABILITY/INTEGRITY] `DELETE /api/employees/:id` Crash `500` sau khi đã xóa nhân viên
- **Mô tả:** `employeeService.deleteEmployee` (`L777-794`) chứa đoạn code copy-paste lỗi tham chiếu biến chưa khai báo `avatar_url`, `sanitizedNextAvatar`, `previousAvatarUrl` ngay sau lệnh `DELETE FROM employees`.
- **Tái hiện (`redTeamSuite.test.js` & `apiCatalog.test.js`):**
  - Gửi `DELETE /api/employees/TEST_RED_DEL` -> **Kết quả quan sát:** Trả **`HTTP 500`** (`"avatar_url is not defined"`), nhân viên đã bị xóa (`remaining rows = 0`), toàn bộ media liên quan không được xử lý và audit log `DELETE_EMPLOYEE` không được ghi!

---

## 3. Các lỗ hổng phân tích tĩnh bổ sung (Code-Level Security Findings)

1. **`authMiddleware.js:74-76, 210-233` (Fail-Open khi DB lỗi & Rò rỉ RAM `userStatusCache`):** Nếu `verifyUserStatusInDb` gặp lỗi kết nối DB, hàm trả `null` làm `authenticateToken` vẫn gán `req.user = user` và cho qua (kể cả tài khoản đã bị khóa hoặc đổi role!). Đồng thời `userStatusCache` được `.set()` ở mọi request nhưng không bao giờ được đọc (`TTL = 0`) hoặc giải phóng.
2. **`validationMiddleware.js:28`:** Chấp nhận ngày lịch không tồn tại như `2026-02-31` hoặc `2026-04-31`.
3. **`cloudinaryService.js:455-473`:** Nếu Cloudinary trả lỗi gói Free chưa hỗ trợ `authenticated`, hệ thống fallback sang `delivery_type='upload'` (URL công khai CDN) nhưng DB vẫn có thể đánh dấu `access_level='private'`.

---

## 4. Các vector tấn công đã kiểm chứng phòng thủ tốt (`DEFENDED`)

| Vector | Kết quả thực tế | Bằng chứng |
|---|---|---|
| `RT-AUTH-02`: Header `x-user-role: admin` spoof & Forged JWT payload | **DEFENDED** | `401 / 401` — Bỏ qua hoàn toàn header giả, `timingSafeEqual` từ chối chữ ký sai |
| `RT-AUTH-03`: Dùng lại JWT cũ sau khi `token_version` tăng | **DEFENDED** | `401 (TOKEN_REVOKED)` — Thu hồi token tức thì |
| `RT-IDOR-01`: Worker W2 đọc media riêng tư, tài liệu hoặc hủy đơn của Worker W1 | **DEFENDED** | `403 / 403 / 403` |
| `RT-MED-02`: Upload `<svg onload>`, `MZ` `.exe` đổi tên `.jpg`, PDF chứa `/OpenAction /JavaScript`, và client truyền `folder`/`public_id` | **DEFENDED** | `400 / 400 / 400 / 400` — Chặn sạch tại `mediaValidator` & `mediaFolderPolicy` |
| `RT-MASS-01`: Mass Assignment `role: 'admin'` trong `/account/credentials` & Kế toán tự duyệt đơn (SoD) | **DEFENDED** | `400 / 403` — Role trong DB giữ nguyên `'worker'`; tự duyệt đơn bị chặn `403` |
| `RT-ATT-02`: Giả mạo GPS (`is_fake_gps: true`) & QR Token Replay | **DEFENDED** | `403 / 200 / 403` (`QR_TOKEN_REPLAYED` ở lần dùng thứ 2) |
| `RT-RACE-01`: 5 request nghỉ phép có lương đồng thời vượt quota 1 ngày/tháng | **DEFENDED** | `201, 400, 400, 400, 400` — Transaction `FOR UPDATE` chỉ cho qua đúng `1/5` |
