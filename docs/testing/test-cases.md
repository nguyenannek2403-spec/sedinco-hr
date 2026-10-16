# Sổ Theo Dõi Ca Kiểm Thử (Test Cases Specification) — Sedinco HR

> **Quy ước mã**: `TC-<MODULE>-<SỐ>`  
> **Phân loại**: Happy Path, Boundary (Biên), Negative (Tiêu cực), Security/Auth, Business Logic  
> **Ưu tiên**: P0 (Trọng yếu), P1 (Nghiệp vụ chính), P2 (Phụ trợ)

---

## Bảng Danh Mục Testcase

| ID | Module | Kịch bản kiểm thử | Loại kiểm thử | Ưu tiên | Kết quả mong đợi | Trạng thái | Ghi chú |
|---|---|---|---|---|---|---|---|
| **TC-AUTH-01** | Xác thực | Đăng nhập Admin với đúng tài khoản & mật khẩu | Happy Path | P0 | HTTP 200, `success: true`, trả về thông tin admin, không lộ mật khẩu | Pass | Endpoint `/api/admin/login` |
| **TC-AUTH-02** | Xác thực | Đăng nhập Admin với sai mật khẩu | Negative | P0 | HTTP 200, `success: false`, thông báo mật khẩu không chính xác | Pass | Trả về message lỗi rõ ràng |
| **TC-AUTH-03** | Xác thực | Đăng nhập Admin khi bỏ trống username hoặc password | Boundary | P0 | HTTP 200, `success: false`, yêu cầu nhập đầy đủ thông tin | Pass | Validate thiếu trường |
| **TC-AUTH-04** | Xác thực | Đăng nhập Nhân viên với mã NV tồn tại và đúng mật khẩu | Happy Path | P0 | HTTP 200, `success: true`, trả về dữ liệu nhân viên (đã loại bỏ field password) | Pass | Endpoint `/api/login` |
| **TC-AUTH-05** | Xác thực | Đăng nhập Nhân viên với mã NV không tồn tại trong hệ thống | Negative | P0 | HTTP 200, `success: false`, báo mã nhân viên không tồn tại | Pass | Ngăn chặn mã giả |
| **TC-AUTH-06** | Xác thực | Đổi mật khẩu nhân viên khi nhập đúng mật khẩu cũ | Happy Path | P0 | HTTP 200, `success: true`, cập nhật mật khẩu mới thành công | Pass | Endpoint `/api/change-password` |
| **TC-AUTH-07** | Xác thực | Đổi mật khẩu nhân viên khi nhập sai mật khẩu cũ | Negative | P0 | HTTP 200, `success: false`, từ chối cập nhật | Pass | Bảo vệ chống đổi trộm mật khẩu |
| **TC-ATT-01** | Chấm công | Cập nhật công đủ (status: '1') cho ngày hợp lệ | Happy Path | P0 | HTTP 200, `success: true`, ghi nhận 1 công vào `attendance_logs` | Pass | Endpoint `/api/attendance/update` |
| **TC-ATT-02** | Chấm công | Cập nhật công với trạng thái rỗng hoặc null | Boundary | P0 | HTTP 200, `success: true`, xóa bản ghi công ngày đó | Pass | Xóa công khi cần reset |
| **TC-ATT-03** | Chấm công | Cập nhật công với ngày không hợp lệ (day: 32 hoặc âm) | Negative / Boundary | P0 | HTTP 400 Bad Request, báo lỗi ngày tháng không hợp lệ | Pass | Chặn SQL crash |
| **TC-ATT-04** | Chấm công | Cập nhật công với tháng không hợp lệ (month: 13 hoặc 0) | Negative / Boundary | P0 | HTTP 400 Bad Request, báo lỗi ngày tháng không hợp lệ | Pass | Validate tháng [1, 12] |
| **TC-ATT-05** | Chấm công | Cập nhật số giờ OT vượt quá 24h (ví dụ: ot_hours: 99) | Boundary / Logic | P0 | Giới hạn tối đa 24h OT trên server, ngăn chặn làm vọt tiền lương phi lý | Pass | Đã xử lý giới hạn max 24h |
| **TC-ATT-06** | Chấm công | Lấy ma trận chấm công tháng của toàn bộ nhân viên | Happy Path | P0 | HTTP 200, trả về mảng danh sách nhân viên kèm mảng `days` đúng số ngày trong tháng | Pass | Endpoint `/api/attendance` |
| **TC-PAY-01** | Tính lương | Tính toán lương 1 ngày và lương 1 giờ theo công chuẩn 26 | Business Logic | P0 | `luong1Ngay = luong_cb / 26`, `luong1Gio = luong1Ngay / 8` | Pass | Công thức chuẩn công ty |
| **TC-PAY-02** | Tính lương | Phân tách công thử việc (hưởng 85%) và công chính thức (100%) | Business Logic | P0 | Công trước ngày chính thức hưởng hệ số 0.85, từ ngày chính thức hưởng 1.0 | Pass | Mốc `ngay_chinh_thuc` |
| **TC-PAY-03** | Tính lương | Tính tiền làm thêm giờ (OT) ngày thường với hệ số 1.5x | Business Logic | P0 | `tienOt = luong1Gio * ot_hours * 1.5` | Pass | Hệ số ngày thường |
| **TC-PAY-04** | Tính lương | Tính tiền làm thêm giờ (OT) ngày Chủ Nhật với hệ số 2.0x | Business Logic | P0 | `tienOt = luong1Gio * ot_hours * 2.0` | Pass | Hệ số ngày Chủ Nhật |
| **TC-PAY-05** | Tính lương | Tính tiền làm thêm giờ (OT) ngày Lễ trùng lịch `public_holidays` | Business Logic | P0 | `tienOt = luong1Gio * ot_hours * 3.0` | Pass | Hệ số ngày Lễ |
| **TC-PAY-06** | Tính lương | Trích trừ bảo hiểm xã hội 10.5% khi `has_insurance = true` | Business Logic | P0 | `totalInsurance = luong_cb * 0.105` | Pass | Luật lao động Việt Nam |
| **TC-PAY-07** | Tính lương | Miễn trừ bảo hiểm khi `has_insurance = false` (hoặc 0) | Boundary | P0 | `totalInsurance = 0` | Pass | Nhân sự thời vụ / thỏa thuận |
| **TC-PAY-08** | Tính lương | Tính lương thực lĩnh Net Salary không bị số âm hoặc NaN | Boundary / Math | P0 | `netSalary = round(salaryByWork + allowanceByWork + otAmount - totalInsurance)` | Pass | Làm tròn số nguyên VNĐ |
| **TC-REQ-01** | Đơn từ | Nhân viên nộp đơn xin nghỉ phép hợp lệ | Happy Path | P1 | HTTP 200, `success: true`, đơn lưu trạng thái `pending` | Pass | Endpoint `POST /api/requests` |
| **TC-REQ-02** | Đơn từ | Ban quản lý phê duyệt đơn nghỉ phép (`status: 'approved'`) | State Transition | P1 | HTTP 200, tự động ghi nhận ký hiệu 'P' vào `attendance_logs` của ngày xin phép | Pass | Cập nhật tự động |
| **TC-REQ-03** | Đơn từ | Ban quản lý phê duyệt đơn làm thêm giờ OT (`status: 'approved'`) | State Transition | P1 | HTTP 200, tự động ghi nhận ký hiệu 'OT' hoặc '1/OT' vào `attendance_logs` | Pass | Cập nhật tự động |
| **TC-REQ-04** | Đơn từ | Ban quản lý từ chối đơn (`status: 'rejected'`) | State Transition | P1 | HTTP 200, cập nhật `status: 'rejected'`, không can thiệp bảng công | Pass | Giữ nguyên hiện trạng |
| **TC-EMP-01** | Nhân sự | Lấy danh sách nhân viên không làm lộ mật khẩu | Security | P0 | HTTP 200, danh sách nhân viên KHÔNG chứa trường `password` | Pass | Endpoint `/api/employees` |
| **TC-EMP-02** | Nhân sự | Thêm nhân viên mới đầy đủ thông tin lương và phụ cấp | Happy Path | P1 | HTTP 200, `success: true`, nhân viên mới xuất hiện trong database | Pass | `POST /api/employees` |
| **TC-EMP-03** | Nhân sự | Cập nhật thông tin nhân viên theo mã `ma_nv` | Happy Path | P1 | HTTP 200, `success: true`, thông tin được cập nhật | Pass | `PUT /api/employees/:id` |
| **TC-HLD-01** | Ngày lễ | Lấy danh sách ngày lễ sắp xếp tăng dần theo `start_date` | Happy Path | P1 | HTTP 200, trả về danh sách các ngày lễ quốc gia | Pass | Endpoint `/api/holidays` |
| **TC-SYS-01** | Hệ thống | Kiểm tra Uptime & Health Check máy chủ | Infrastructure | P2 | HTTP 200, `status: 'healthy'`, uptime > 0, trả về timestamp chuẩn ISO | Pass | Endpoint `/api/health` |
| **TC-SEC-01** | Bảo mật | Kiểm thử payload JSON kích thước lớn (> 10MB) | Security / DoS | P0 | Server thiết lập limit an toàn, không gây crash Out-Of-Memory | Pass | Payload limits |
