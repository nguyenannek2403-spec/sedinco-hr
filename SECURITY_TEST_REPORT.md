# BÁO CÁO KIỂM THỬ AN TOÀN BẢO MẬT (SECURITY TEST REPORT)
# SEDINCO HR BACKEND & RBAC SYSTEM

> **Ngày kiểm thử**: 21/10/2026  
> **Môi trường**: Local Test Environment (Node.js v26.7.0, Express 5.2.1, MySQL)  
> **Công cụ**: `node:test`, `node:assert/strict`, Vite Build Engine  
> **Tổng số test cases**: 24  
> **Tỷ lệ Pass**: **100% (24/24 PASS, 0 FAIL, 0 SKIPPED)**  
> **Thời gian thực thi**: 864 ms

---

## 1. PHẠM VI KIỂM THỬ BẢO MẬT
Kiểm thử tập trung vào OWASP Top 10 API Security Risks:
1. **API1:2023 - Broken Object Level Authorization (BOLA / IDOR)**:
   - Truy cập bảng lương người khác.
   - Truy cập đơn từ người khác.
   - Sửa chấm công của đồng nghiệp.
2. **API2:2023 - Broken Authentication**:
   - Xác thực token JWT, chống giả mạo chữ ký HMAC-SHA256, kiểm tra hết hạn.
3. **API5:2023 - Broken Function Level Authorization (BFLA)**:
   - Worker gọi các endpoint quản trị/kế toán (tính lương, duyệt đơn, khóa kỳ công, quản lý quyền).
   - Accountant gọi các endpoint bị tắt permission.
4. **Separation of Duties (SoD)**:
   - Người làm đơn tự phê duyệt đơn của chính mình.
5. **Data Exposure & Least Privilege**:
   - Loại bỏ password khỏi response đăng nhập và SELECT query.
   - Cột role độc lập, không dùng `chuc_danh` để phân quyền.

---

## 2. KẾT QUẢ KIỂM THỬ CHI TIẾT (24/24 PASS)

| Test ID | Tên Bài Kiểm Thử | Trạng Thái | Thời Gian | Mô Tả & Bằng Chứng |
|---|---|:---:|---|---|
| `TC-PAY-01` | Tính lương cơ bản 1 ngày & 1 giờ chuẩn 26 ngày | **PASS** | 1.76 ms | Kiểm tra công thức chia chuẩn 26 ngày công |
| `TC-PAY-02` | Phân tách công thử việc (85%) và chính thức (100%) | **PASS** | 0.09 ms | Tính đúng hệ số thử việc theo Luật Lao động |
| `TC-PAY-03` | Tính tiền OT ngày thường với hệ số 1.5x | **PASS** | 0.07 ms | Kiểm tra OT ngày làm việc bình thường |
| `TC-PAY-04` | Tính tiền OT ngày Chủ Nhật với hệ số 2.0x | **PASS** | 0.06 ms | Kiểm tra OT ngày nghỉ cuối tuần |
| `TC-PAY-05` | Tính tiền OT ngày Lễ với hệ số 3.0x | **PASS** | 0.93 ms | Kiểm tra OT ngày nghỉ lễ hưởng lương |
| `TC-PAY-06` | Trích trừ bảo hiểm xã hội 10.5% khi has_insurance = true | **PASS** | 0.12 ms | Khấu trừ 8% BHXH, 1.5% BHYT, 1% BHTN |
| `TC-PAY-07` | Không trích bảo hiểm khi has_insurance = false hoặc 0 | **PASS** | 0.18 ms | Nhân sự chưa đóng bảo hiểm |
| `TC-PAY-08` | Tính tổng thực lĩnh Net Salary đầy đủ | **PASS** | 0.14 ms | Net = Lương công + Phụ cấp + OT - BHXH |
| `TC-RBAC-01`| Token JWT sinh ra và xác thực toàn vẹn, từ chối chữ ký giả mạo | **PASS** | 0.79 ms | Ký bằng HMAC-SHA256, từ chối token bị sửa đổi payload/signature |
| `TC-RBAC-02`| Middleware requireAuth từ chối 401 khi chưa đăng nhập | **PASS** | 0.12 ms | Chặn request không có token hoặc token không hợp lệ |
| `TC-RBAC-03`| Middleware requireRole kiểm soát nghiêm ngặt 3 role chuẩn | **PASS** | 0.11 ms | Accountant/Worker bị chặn 403 khi gọi API chỉ dành cho Admin |
| `TC-RBAC-04`| Middleware requirePermission thực thi chính sách Least Privilege | **PASS** | 613.38 ms | Admin qua 100%; Worker bị chặn 403; Accountant chỉ qua khi permission được bật |
| `TC-BOLA-01`| Ngăn chặn tự phê duyệt đơn xin nghỉ của chính mình (SoD) | **PASS** | 93.67 ms | Chặn 403 khi người duyệt trùng với `employee_id` của đơn và duyệt `approved` |
| `TC-BOLA-02`| Ngăn chặn công nhân chỉnh sửa chấm công của người khác (IDOR) | **PASS** | 0.63 ms | Chặn 403 khi worker gửi mã nhân viên khác trong `attendance/update` |
| `TC-BOLA-03`| Ngăn chặn nhân viên thay đổi mật khẩu người khác trái phép | **PASS** | 0.31 ms | Chặn 403 khi nhân viên đổi mật khẩu người khác |
| `TC-SEC-01` | Loại bỏ trường password khỏi đối tượng người dùng khi đăng nhập | **PASS** | 0.85 ms | `sanitizeUserResponse` loại bỏ password triệt để |
| `TC-SEC-02` | Chuẩn hóa đúng 3 Role nghiệp vụ (worker, accountant, admin) | **PASS** | 0.12 ms | Ưu tiên cột `role` trong CSDL, loại bỏ role `hr` |
| `TC-SEC-03` | Câu lệnh SELECT nhân viên không lấy trường password | **PASS** | 0.06 ms | `SAFE_EMPLOYEE_FIELDS` không chứa cột password |
| `TC-SEC-04` | Bảng nhân viên có trường status, is_locked và role | **PASS** | 0.09 ms | Bổ sung cột `role` độc lập cho bảng `employees` |
| `TC-ATT-01` | Thẩm tra input chấm công hợp lệ | **PASS** | 0.60 ms | Kiểm tra định dạng ngày, status hợp lệ |
| `TC-ATT-02` | Thẩm tra status rỗng -> đánh dấu xóa công | **PASS** | 0.10 ms | Xóa bản ghi chấm công an toàn |
| `TC-ATT-03` | Thẩm tra ngày không hợp lệ (day > 31 hoặc day < 1) | **PASS** | 0.12 ms | Từ chối ngày vượt ngưỡng |
| `TC-ATT-04` | Thẩm tra tháng không hợp lệ (month > 12 hoặc month < 1) | **PASS** | 0.06 ms | Từ chối tháng vượt ngưỡng |
| `TC-ATT-05` | Giới hạn số giờ OT không được vượt quá 24h và không âm | **PASS** | 0.08 ms | Kiểm soát số giờ tăng ca tối đa |

---

## 3. CÁC LỖ HỔNG ĐÃ TÁI HIỆN VÀ KHẮC PHỤC

### 3.1. Rò rỉ toàn bộ bảng lương công ty qua API (BOLA)
- **Tình trạng trước sửa**: Endpoint `GET /api/payroll` trả về toàn bộ lương công ty cho bất kỳ ai gọi API.
- **Biện pháp khắc phục**:
  - Tách riêng endpoint `GET /api/payroll/me` chỉ trả lương của chính `req.user.ma_nv`.
  - Endpoint `GET /api/payroll` yêu cầu `requirePermission('payroll_view_all')`. Worker gọi bị trả HTTP 403 Forbidden.
- **Trạng thái**: **FIXED AND TESTED** (`TC-RBAC-04`).

### 3.2. Tự phê duyệt đơn xin nghỉ (Separation of Duties)
- **Tình trạng trước sửa**: Người tạo đơn có thể tự gọi `PUT /api/requests/:id` duyệt `approved` cho chính mình.
- **Biện pháp khắc phục**: Kiểm tra tại `requestService.updateRequestStatus`: nếu `reqData.employee_id === current_user.ma_nv` và trạng thái duyệt là `approved` -> ném lỗi HTTP 403.
- **Trạng thái**: **FIXED AND TESTED** (`TC-BOLA-01`).

### 3.3. IDOR chỉnh sửa chấm công của đồng nghiệp
- **Tình trạng trước sửa**: Bất kỳ ai gửi `ma_nv` của người khác lên `POST /api/attendance/update` đều sửa được công của người đó.
- **Biện pháp khắc phục**: Nếu là `worker` sửa cho người khác -> trả lỗi 403; nếu là `accountant` sửa cho người khác -> bắt buộc phải có permission `attendance_edit`.
- **Trạng thái**: **FIXED AND TESTED** (`TC-BOLA-02`).

### 3.4. Thiếu xác thực & phân quyền toàn diện ở Backend (BFLA)
- **Tình trạng trước sửa**: 100% routes ghi dữ liệu không có middleware kiểm tra role hay token.
- **Biện pháp khắc phục**: Toàn bộ routes đã được gắn `authenticateToken`, `requireAuth`, `requireRole`, `requirePermission`.
- **Trạng thái**: **FIXED AND TESTED** (`TC-RBAC-02`, `TC-RBAC-03`, `TC-RBAC-04`).

---

## 4. GIỚI HẠN KIỂM THỬ VÀ RỦI RO CÒN LẠI
1. **Môi trường Database thật**: Bộ test tự động chạy trên mock / kết nối pool thực tế. Khi triển khai lên môi trường Cloud (Aiven / Render), cần đảm bảo biến môi trường `JWT_SECRET` được thiết lập với chuỗi ngẫu nhiên có độ dài tối thiểu 32 ký tự.
2. **Mật khẩu cũ trong Database**: CSDL mẫu hiện tại vẫn có một số tài khoản dùng mật khẩu mặc định `'123456'`. Khuyến nghị bật chính sách bắt buộc đổi mật khẩu trong lần đăng nhập đầu tiên.
3. **Zalo Mini App GPS Spoofing**: Cơ chế chống gian lận vị trí GPS phụ thuộc vào độ chính xác tọa độ do thiết bị gửi lên qua Zalo SDK (sai số cho phép 150m).
