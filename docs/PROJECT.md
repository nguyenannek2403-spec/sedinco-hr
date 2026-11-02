# TÀI LIỆU KỸ THUẬT & KIẾN TRÚC HỆ THỐNG SEDINCO HR (DOCS/PROJECT.MD)
> **Phiên bản tài liệu**: 7.0 (Đóng băng phạm vi phục vụ chạy thử có kiểm soát - G7)  
> **Ngày cập nhật**: 02/11/2026  
> **Trạng thái**: [ĐÃ XÁC MINH L2] Khớp với mã nguồn thực tế và kết quả kiểm thử trên CSDL `sedinco_hr_test`.  
> **Cờ vận hành thử nghiệm**: `LOCATION_MODE=both`, `REJECT_DOWNGRADE_TO_RAW=false`, `device_binding_mode=recording`, `ALLOW_LEGACY_ADMIN_QR=false`.

---

## 📌 MỤC LỤC TỔNG HỢP
1. [Tổng Quan Nghiệp Vụ & 3 Vai Trò Chuẩn Hóa](#1-tổng-quan-nghiệp-vụ--3-vai-trò-chuẩn-hóa)
2. [Kiến Trúc Kỹ Thuật & Ngăn Xếp Công Nghệ](#2-kiến-trúc-kỹ-thuật--ngăn-xếp-công-nghệ)
3. [Mô Hình Dữ Liệu Thực Tế (14 Bảng MySQL)](#3-mô-hình-dữ-liệu-thực-tế-14-bảng-mysql)
4. [Các Luồng Nghiệp Vụ Cốt Lõi](#4-các-luồng-nghiệp-vụ-cốt-lõi)
5. [Cơ Chế Bảo Mật & Phòng Thủ Đa Lớp](#5-cơ-chế-bảo-mật--phòng-thủ-đa-lớp)
6. [Danh Mục 54 REST API Endpoints Thực Tế](#6-danh-mục-54-rest-api-endpoints-thực-tế)
7. [Môi Trường Vận Hành & Khuyến Nghị Phiên Bản Node.js](#7-môi-trường-vận-hành--khuyến-nghị-phiên-bản-nodejs)
8. [Các Giới Hạn Đã Biết (Known Limitations)](#8-các-giới-hạn-đã-biết-known-limitations)

---

## 1. TỔNG QUAN NGHIỆP VỤ & 3 VAI TRÒ CHUẨN HÓA

### 1.1 Bối Cảnh Nghiệp Vụ [ĐÃ XÁC MINH L2]
**Sedinco HR** là giải pháp số hóa công tác chấm công, quản lý đơn từ và tiền lương cho cán bộ nhân viên, đặc thù gồm công nhân sản xuất tại xưởng và khối văn phòng/kế toán:
1. **Chấm công phòng thủ gian lận**: Kết hợp định vị địa lý (Geofencing Haversine) và mã Dynamic QR Code v2 đổi mới mỗi 30 giây hiển thị tại thiết bị Kiosk chuyên dụng.
2. **Quy trình đơn từ tự động**: Đơn nghỉ phép (`LEAVE`), làm thêm giờ (`OT`), báo quên chấm công (`ATTENDANCE_COMPENSATION`) sau khi được phê duyệt sẽ tự động cập nhật vào ma trận chấm công ngày.
3. **Tính lương tự động**: Chu kỳ công chuẩn 26 ngày, lương thử việc (85%), chính thức (100%), hệ số OT (1.5x ngày thường, 2.0x chủ nhật, 3.0x ngày lễ) và trích nộp bảo hiểm xã hội 10.5%.

### 1.2 Ba Vai Trò Duy Nhất Được Chấp Nhận [ĐÃ XÁC MINH L2]
Hệ thống chuẩn hóa đúng 3 vai trò, từ chối mọi vai trò thứ 4 (`manager`, `hr`):
- **`worker` (Công Nhân / Nhân Viên)**:
  - Nền tảng: Zalo Mini App trên điện thoại thông minh.
  - Chức năng: Chấm công (GPS + QR), xem lịch sử công cá nhân, nộp đơn từ, đổi mật khẩu, xem phiếu lương.
- **`accountant` (Kế Toán Tiền Lương & Báo Cáo)**:
  - Nền tảng: Web Dashboard trên máy tính.
  - Chức năng: Đối soát bảng công ma trận toàn công ty, chốt khóa kỳ công tháng (`period_locks`), tính toán và xuất bảng lương CSV/Excel (đã khử formula injection).
  - Phân quyền: Cấp quyền động qua bảng `accountant_permissions` theo chuẩn Least Privilege.
- **`admin` (Quản Trị Hệ Thống / Ban Giám Đốc)**:
  - Nền tảng: Web Dashboard trên máy tính.
  - Chức năng: Quản lý hồ sơ nhân viên, phê duyệt đơn từ, duyệt yêu cầu đổi thiết bị, đăng ký/thu hồi khóa Kiosk, mở khóa kỳ công có giải trình, cấu hình tọa độ GPS, xem nhật ký kiểm toán bất biến (`audit_logs`).

---

## 2. KIẾN TRÚC KỸ THUẬT & NGĂN XẾP CÔNG NGHỆ

### 2.1 Sơ Đồ Kiến Trúc Hệ Thống [ĐÃ XÁC MINH L2]
```
+------------------------------------+        +------------------------------------+
|  📱 Zalo Mini App Client (Worker)  |        | 💻 Admin Web PC (Admin/Accountant) |
|     (ZMP-SDK, ZMP-UI, React 18)    |        |      (React 18, Tailwind, Vite)    |
+-----------------+------------------+        +-----------------+------------------+
                  |                                             |
                  +----------------------+----------------------+
                                         | HTTP REST API + JWT Bearer
                                         v
+----------------------------------------------------------------------------------+
|                     Node.js Express API Server (Cổng 5001)                       |
|                                                                                  |
|  [Security Middlewares]                                                          |
|  ├── Trust Proxy Validator (req.ip / X-Forwarded-For)                            |
|  ├── Composite Rate Limiter (MySQL login_rate_limits: IP + Account)              |
|  ├── JWT Authentication & Instant Revocation Check (is_locked=1, 0-delay)        |
|  └── RBAC (requireRole: worker | accountant | admin, requirePermission)          |
|                                                                                  |
|  [Worker Threads Pool]                                                           |
|  └── bcryptWorkerPool (Offload bcrypt sang Worker Threads theo số CPU server)    |
+----------------------------------------+-----------------------------------------+
                                         |
                                         | Connection Pool (mysql2/promise)
                                         v
+----------------------------------------------------------------------------------+
|                      MySQL Database (sedinco_hr_test)                            |
|                                                                                  |
|  [Runtime App User: Least Privilege DML Only]                                    |
|  ├── 13 Bảng Nghiệp Vụ: SELECT, INSERT, UPDATE, DELETE                           |
|  └── Bảng audit_logs: APPEND-ONLY (CHỈ SELECT, INSERT; CẤM UPDATE, DELETE)       |
+----------------------------------------------------------------------------------+
```

### 2.2 Ngăn Xếp Công Nghệ Thực Tế [ĐÃ XÁC MINH L1]
- **Backend API**:
  - Runtime: Node.js (hỗ trợ `>=20.18.0 <=26.x`, khuyến nghị Node 22 LTS cho server).
  - Framework: Express.js v5.2.1.
  - Database Driver: `mysql2` v3.24.5 (Connection Pool).
  - Mật mã học: `bcryptjs` v3.0.3, `crypto` gốc (HMAC SHA-256).
  - Đa luồng: Node.js `worker_threads` (Worker Pool xử lý băm mật khẩu).
  - Kiểm thử: Framework gốc `node:test` và `node:assert/strict`.
- **Frontend**:
  - Giao diện Zalo Mini App: `zmp-sdk`, `zmp-ui` (gói bản quyền Zalo).
  - Giao diện Quản trị PC: React 18.3.1, TailwindCSS 3.4.3, Lucide React, Vite 5.2.13.

---

## 3. MÔ HÌNH DỮ LIỆU THỰC TẾ (14 BẢNG MYSQL)

Qua lệnh `SHOW TABLES` trên CSDL thực tế `sedinco_hr_test`, hệ thống có **chính xác 14 bảng quan hệ** `[ĐÃ XÁC MINH L2]`.  
**Lưu ý đặc biệt**: Bảng `branches` **KHÔNG TỒN TẠI** trong CSDL thực tế.

| STT | Tên Bảng | Mục Đích Lưu Trữ | Quyền Cấp Cho Runtime User |
|:---:|---|---|---|
| 1 | `accountant_permissions` | Phân quyền động chi tiết theo mô-đun cho vai trò kế toán | SELECT, INSERT, UPDATE, DELETE |
| 2 | `admins` | Tài khoản quản trị viên và ban giám đốc | SELECT, INSERT, UPDATE, DELETE |
| 3 | `attendance` | Bảng tổng hợp công tháng (công chuẩn, công thử việc, chính thức, OT) | SELECT, INSERT, UPDATE, DELETE |
| 4 | `attendance_logs` | Nhật ký từng lần chấm công (giờ vào/ra, GPS, ảnh, cờ nghi vấn, is_low_trust) | SELECT, INSERT, UPDATE, DELETE |
| 5 | `audit_logs` | Nhật ký kiểm toán các thao tác quan trọng (đăng nhập, đổi quyền, khóa sổ) | **CHỈ SELECT, INSERT (Append-Only)** |
| 6 | `company_settings` | Tọa độ GPS trụ sở, bán kính cho phép, giờ làm việc, mức phạt | SELECT, INSERT, UPDATE, DELETE |
| 7 | `dynamic_qr_sessions` | Phiên mã QR động dùng một lần (session_token, expires_at, is_used) | SELECT, INSERT, UPDATE, DELETE |
| 8 | `employees` | Hồ sơ nhân viên, mật khẩu bcrypt hash, cờ must_change_password, bound_device_id | SELECT, INSERT, UPDATE, DELETE |
| 9 | `kiosk_devices` | Danh sách thiết bị Kiosk đặt tại cổng, API key băm, IP giám sát | SELECT, INSERT, UPDATE, DELETE |
| 10 | `login_rate_limits` | Bộ đếm thất bại đăng nhập phân tầng IP và Tài khoản (MySQL shared state) | SELECT, INSERT, UPDATE, DELETE |
| 11 | `ot_registrations` | Đăng ký làm thêm giờ trước khi thực hiện để đối soát giờ công | SELECT, INSERT, UPDATE, DELETE |
| 12 | `period_locks` | Trạng thái chốt sổ kỳ công tháng (is_locked, locked_by, lý do) | SELECT, INSERT, UPDATE, DELETE |
| 13 | `public_holidays` | Lịch ngày nghỉ lễ quốc gia dùng để tính hệ số lương OT 3.0x | SELECT, INSERT, UPDATE, DELETE |
| 14 | `requests` | Đơn xin nghỉ phép, bổ sung công, làm thêm giờ của người lao động | SELECT, INSERT, UPDATE, DELETE |

---

## 4. CÁC LUỒNG NGHIỆP VỤ CỐT LÕI

### 4.1 Luồng Đăng Nhập & Bảo Vệ Mật Khẩu [ĐÃ XÁC MINH L2]
1. Client gửi `POST /api/login` với `{ ma_nv, password }`.
2. Kiểm tra bộ đếm brute-force trong `login_rate_limits` (IP composite lock ở lần 5 sai, IP lock ở 50 lần).
3. Truy vấn `employees`:
   - Nếu `!emp || !emp.password || !isBcryptHash(emp.password)`: Trả ngay lỗi chung `Tài khoản hoặc mật khẩu không chính xác`, ghi nhận `audit_logs` vi phạm, kích hoạt rate limit `[ĐÃ XÁC MINH L2]`.
   - Tuyệt đối không còn nhánh so sánh chuỗi thô hay fallback `'123456'`.
4. So sánh mật khẩu bằng Worker Threads Pool (`comparePasswordAsync`):
   - Mật khẩu đúng: Reset bộ đếm thất bại, sinh JWT token (chứa `ma_nv`, `role`).
   - Nếu `emp.must_change_password = 1`: Trả kèm cờ `must_change_password: true`, UI hiển thị modal bắt buộc đổi mật khẩu và khóa các điều hướng khác.

### 4.2 Luồng Chấm Công Đa Lớp (GPS + QR v2) [ĐÃ XÁC MINH L2]
1. **Thiết bị Kiosk tại cổng**:
   - Gửi `GET /api/kiosk/qr` kèm header `x-kiosk-key`.
   - Server sinh Dynamic QR Token v2 (HMAC SHA-256 ký với `QR_SECRET`, chứa `kiosk_id`, `ts`, `nonce`, TTL 30 giây).
2. **Công nhân quét mã trên Zalo Mini App**:
   - Ứng dụng lấy vị trí qua Zalo SDK:
     - Nhánh Token Zalo: Gửi `location_token` lên server -> server gọi API Zalo giải mã -> ghi `location_source='token'`, `is_low_trust=0`.
     - Nhánh Raw Fallback: Gửi tọa độ thô `{ latitude, longitude }` -> ghi `location_source='raw'`, `is_low_trust=1`.
     - Nhánh Chống Hạ Cấp: Nếu công nhân đã từng chấm công bằng Token Zalo thành công mà lần này gửi tọa độ raw -> Server gắn `is_low_trust=2` (hoặc từ chối 403 nếu bật `REJECT_DOWNGRADE_TO_RAW=true`).
   - Kiểm tra Geofence: Tính khoảng cách Haversine tới tọa độ trong `company_settings`. Nếu vượt quá bán kính quy định (mặc định 100m - 200m) -> Từ chối HTTP 400.
   - Kiểm tra mã QR: Xác minh chữ ký token, kiểm tra phiên trong `dynamic_qr_sessions`. Nếu mã đã quét rồi hoặc quá 30 giây -> Từ chối (Replay Attack Prevention).
   - Kiểm tra ràng buộc thiết bị (`bound_device_id`): Ở chế độ `recording`, tự động ghi nhận thiết bị lần đầu. Thiết bị lạ gắn cờ cảnh báo `is_suspicious=1`.
   - Ghi nhận bản ghi vào `attendance_logs` và cập nhật bảng `attendance`.

### 4.3 Luồng Duyệt Đơn Từ & Đồng Bộ Ký Hiệu Công [ĐÃ XÁC MINH L2]
1. Worker gửi `POST /api/requests` (loại đơn: `LEAVE`, `OVERTIME`, `ATTENDANCE_COMPENSATION`).
2. Quản lý / Admin duyệt đơn (`PUT /api/requests/:id` -> `APPROVED`):
   - Chốt chặn Phân tách nhiệm vụ (SoD): Người tạo đơn bị từ chối 403 nếu cố tình tự phê duyệt đơn của chính mình `[ĐÃ XÁC MINH L2]`.
   - Nếu kỳ công của ngày nộp đơn đã bị khóa (`is_locked=1` trong `period_locks`): Hệ thống từ chối cập nhật để bảo vệ kỳ lương đã chốt.
   - Khi duyệt đơn nghỉ phép `LEAVE` thành công: Bảng ma trận công ngày tương ứng tự động ghi nhận ký hiệu `P` (Nghỉ phép có hưởng lương).

### 4.4 Luồng Chốt Sổ Kỳ Công Tháng [ĐÃ XÁC MINH L2]
1. Kế toán kiểm tra danh sách bản ghi có cờ `is_low_trust` (tọa độ raw hoặc nghi vấn hạ cấp).
2. Gửi `POST /api/attendance/lock-period` kèm `month`, `year`.
3. Nếu có bản ghi `is_low_trust` mà chưa xác nhận `confirm_low_trust=true`: Hệ thống yêu cầu kế toán đối soát.
4. Khi đã chốt (`is_locked=1`): Toàn bộ API sửa đổi chấm công (`POST /api/attendance`, `PUT /api/requests`) thuộc kỳ đó bị khóa. Mở khóa bắt buộc dùng tài khoản Admin kèm lý do giải trình.

---

## 5. CƠ CHẾ BẢO MẬT & PHÒNG THỦ ĐA LỚP

1. **Khử BOLA / IDOR [ĐÃ XÁC MINH L2]**: Toàn bộ thao tác cá nhân (chấm công, xem lương, nộp đơn) căn cứ vào `req.user.ma_nv` từ JWT token, loại bỏ hoàn toàn việc tin cậy tham số `employee_id` từ body/query.
2. **Thu hồi quyền tức thì (0-delay Instant Revocation) [ĐÃ XÁC MINH L2]**: Middleware `authMiddleware` đối soát trực tiếp cờ `is_locked=1` và vai trò thực tế trong MySQL ở mỗi request. Khi tài khoản bị vô hiệu hóa trong CSDL, phiên làm việc bị ngắt ngay lập tức mà không cần chờ JWT hết hạn.
3. **Phân Tách DDL và DML (Least Privilege Database User) [ĐÃ XÁC MINH L2]**:
   - Tài khoản ứng dụng chạy thường nhật chỉ có quyền DML trên 13 bảng.
   - Cấm hoàn toàn quyền DDL (`DROP`, `ALTER`, `CREATE`).
   - Bảng `audit_logs` là Append-Only (chỉ cho phép SELECT, INSERT; cấm UPDATE, DELETE).
4. **Bcrypt Worker Threads Pool [ĐÃ XÁC MINH L2]**:
   - Đẩy toàn bộ chi phí tính toán băm mật khẩu ra khỏi Node.js Event Loop.
   - Hạn chế hàng đợi (tối đa 500 yêu cầu) và cơ chế tự phục hồi worker khi bị ngắt.
5. **Chống Tấn Công DoS Khóa Hộ (Split Rate Limiting) [ĐÃ XÁC MINH L2]**:
   - Tách biệt bộ đếm IP lạ và IP quen thuộc trong `login_rate_limits`.
   - Kẻ tấn công đổi nhiều IP dò mật khẩu không làm khóa tài khoản của người dùng hợp lệ đang truy cập từ IP công ty.

---

## 6. DANH MỤC 54 REST API ENDPOINTS THỰC TẾ

Qua rà soát mã nguồn router tại `sedinco_backend/src/routes/`, hệ thống định nghĩa chính xác **54 endpoints** `[ĐÃ XÁC MINH L1]`:

### Nhóm 1: Xác Thực & Tài Khoản (`/api`)
1. `POST /api/login` - Đăng nhập nhân viên (Worker / Accountant)
2. `POST /api/admin/login` - Đăng nhập Quản trị viên
3. `POST /api/admin/register` - Đăng ký tài khoản Admin nội bộ
4. `GET /api/me` - Lấy thông tin cá nhân hiện hành
5. `GET /api/profile` - Lấy hồ sơ người dùng
6. `POST /api/change-password` - Đổi mật khẩu cá nhân
7. `POST /api/update-avatar` - Cập nhật ảnh đại diện

### Nhóm 2: Chấm Công (`/api/attendance`)
8. `POST /api/attendance` - Cập nhật dữ liệu công hàng ngày (Kế toán/Admin)
9. `GET /api/attendance` - Lấy ma trận công 31 ngày toàn công ty
10. `POST /api/attendance/check-in` - Chấm công một chạm (Worker)
11. `GET /api/attendance/my-logs` - Lịch sử chấm công của cá nhân
12. `GET /api/attendance/my-monthly` - Bảng công tháng cá nhân
13. `GET /api/attendance/qr` - Lấy mã QR động từ Web Admin cũ (ALLOW_LEGACY_ADMIN_QR)
14. `POST /api/attendance/lock-period` - Khóa kỳ công tháng
15. `POST /api/attendance/unlock-period` - Mở khóa kỳ công kèm giải trình
16. `GET /api/attendance/period-lock-status` - Tra cứu trạng thái khóa sổ kỳ công
17. `GET /api/attendance/suspicious-logs` - Danh sách bản ghi chấm công nghi vấn
18. `GET /api/attendance/stats` - Thống kê tỷ lệ đi làm theo ngày

### Nhóm 3: Tiền Lương (`/api/payroll`)
19. `GET /api/payroll/calculate` - Tính toán bảng lương toàn doanh nghiệp
20. `GET /api/payroll/my-payslip` - Xem phiếu lương cá nhân
21. `POST /api/payroll/save` - Lưu bảng lương đã duyệt vào CSDL
22. `GET /api/payroll/export` - Xuất file bảng lương chi trả

### Nhóm 4: Quản Lý Đơn Từ (`/api/requests`)
23. `POST /api/requests` - Nộp đơn từ mới (Nghỉ phép, OT, Bổ sung công)
24. `GET /api/requests/my` - Danh sách đơn từ cá nhân đã gửi
25. `GET /api/requests/all` - Danh sách toàn bộ đơn từ (Admin/Accountant)
26. `PUT /api/requests/:id` - Phê duyệt hoặc từ chối đơn
27. `DELETE /api/requests/:id` - Hủy đơn khi còn trạng thái PENDING

### Nhóm 5: Quản Lý Nhân Sự (`/api/employees`)
28. `GET /api/employees` - Danh sách nhân viên
29. `POST /api/employees` - Tạo hồ sơ nhân viên mới
30. `PUT /api/employees/:id` - Cập nhật thông tin nhân viên
31. `DELETE /api/employees/:id` - Xóa/Ngừng hoạt động nhân viên
32. `POST /api/employees/:id/toggle-lock` - Tạm khóa / Mở khóa tài khoản
33. `POST /api/employees/batch-require-password-change` - Yêu cầu đổi mật khẩu theo đợt
34. `POST /api/employees/request-device-change` - Gửi yêu cầu đổi thiết bị
35. `GET /api/employees/pending-device-requests` - Danh sách chờ duyệt thiết bị
36. `POST /api/employees/approve-device-change` - Phê duyệt đổi thiết bị
37. `POST /api/employees/reject-device-change` - Từ chối đổi thiết bị

### Nhóm 6: Phân Quyền Kế Toán (`/api/employees/permissions`)
38. `GET /api/employees/:id/permissions` - Xem quyền kế toán
39. `PUT /api/employees/:id/permissions` - Cập nhật phân quyền Least Privilege

### Nhóm 7: Cấu Hình Nhà Xưởng & GPS (`/api/company`)
40. `GET /api/company/settings` - Lấy tọa độ GPS và thông tin công ty
41. `PUT /api/company/settings` - Cập nhật vị trí và bán kính nhà máy

### Nhóm 8: Lịch Nghỉ Lễ (`/api/holidays`)
42. `GET /api/holidays` - Danh sách ngày nghỉ lễ
43. `POST /api/holidays` - Thêm ngày nghỉ lễ
44. `DELETE /api/holidays/:id` - Xóa ngày nghỉ lễ

### Nhóm 9: Cài Đặt Mức Phạt (`/api/settings`)
45. `GET /api/settings/penalties` - Cấu hình phạt đi muộn/về sớm
46. `PUT /api/settings/penalties` - Cập nhật mức phạt

### Nhóm 10: Thiết Bị Kiosk Chuyên Dụng (`/api/kiosk`)
47. `POST /api/kiosk/register` - Đăng ký Kiosk mới nhận API key
48. `GET /api/kiosk/list` - Danh sách các Kiosk hoạt động
49. `POST /api/kiosk/revoke/:id` - Thu hồi quyền hoạt động của Kiosk
50. `GET /api/kiosk/qr` - Kiosk lấy mã Dynamic QR v2 (xác thực `x-kiosk-key`)
51. `POST /api/kiosk/rotate-key/:id` - Xoay khóa API key cho Kiosk

### Nhóm 11: Màn Hình Chẩn Đoán Kỹ Thuật (`/api/diagnostics` - Staging Only)
52. `GET /api/diagnostics/system-status` - Kiểm tra kết nối CSDL và Commit hash
53. `POST /api/diagnostics/verify-zalo-user` - Thẩm tra User ID với Zalo
54. `POST /api/diagnostics/decode-location` - Thẩm tra giải mã tọa độ Zalo

---

## 7. MÔI TRƯỜNG VẬN HÀNH & KHUYẾN NGHỊ PHIÊN BẢN NODE.JS

### 7.1 Phiên Bản Node.js [ĐÃ XÁC MINH L1]
- Thuộc tính `"engines"` trong `package.json`: `"node": ">=20.18.0 <=26.x"`.
- **Khuyến nghị cho Máy Chủ Staging / Production**:
  - Bản LTS khuyến nghị: **Node.js v22 LTS (Active LTS - Codename: Jod, phiên bản khuyến nghị: v22.23.4+)** hoặc **Node.js v24 LTS (Krypton, v24.22.2+)**.
  - Lý do: Bản Active LTS đảm bảo tính ổn định cao nhất, tương thích rộng rãi với các native addon, driver MySQL connection pool và các thư viện mã hóa.
- **Môi trường phát triển cục bộ**: Đang vận hành trên Node.js `v26.7.0` (Lithium).

---

## 8. CÁC GIỚI HẠN ĐÃ BIẾT (KNOWN LIMITATIONS) [ĐÃ XÁC MINH L2]

Hệ thống ghi nhận trung thực các giới hạn hiện hành để làm căn cứ quản lý rủi ro trong giai đoạn chạy thử có kiểm soát:
1. **Một điểm làm việc duy nhất**: Toàn bộ quy tắc Geofencing hiện tại phụ thuộc vào 1 bản ghi trong `company_settings`. Bảng `branches` không tồn tại; chưa hỗ trợ nhiều chi nhánh hoặc công trường độc lập.
2. **Không có ca làm việc xoay tua**: Hệ thống chỉ thiết kế cho một ca làm việc hành chính cố định (08:00 - 17:00). Chưa có cơ chế phân ca ngày/đêm, ca gãy, đổi ca linh hoạt.
3. **Lưu trữ ảnh Base64 trong CSDL**: Ảnh selfie chụp lúc chấm công được lưu chuỗi Base64 trực tiếp vào cột `check_in_image` của bảng `attendance_logs`. Điều này làm dung lượng CSDL tăng trưởng nhanh theo thời gian, chưa có chính sách chuyển đổi sang Object Storage (S3/GCS) và chưa có chính sách tự động xóa sau 60/90 ngày.
4. **Phụ thuộc Wi-Fi chung (IP NAT)**: Khi toàn bộ công nhân cùng kết nối mạng Wi-Fi công ty ra ngoài internet qua 1 IP tĩnh duy nhất, nếu có kẻ cố ý nhập sai mật khẩu để phá hoại, cơ chế khóa IP có thể ảnh hưởng đến trải nghiệm của những người khác nếu không cấu hình đúng whitelist hoặc ngưỡng IP.
5. **Rủi ro Fake GPS cấp hệ điều hành**: Dù có token Zalo và Dynamic QR, nếu thiết bị bị root/jailbreak hoặc can thiệp sâu vào mock location cấp OS, việc định vị vẫn có rủi ro bị đánh lừa. Cần kết hợp ảnh chụp khuôn mặt và giám sát của Kiosk tại cổng.
