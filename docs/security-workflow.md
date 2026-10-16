# Tiêu Chuẩn An Toàn & Bảo Mật Backend API (Security Workflow) — Sedinco HR

> **Mục tiêu**: Thiết lập và duy trì các cơ chế phòng thủ chuyên sâu cho hệ thống Backend REST API Sedinco HR theo tiêu chuẩn **OWASP API Security Top 10**, bảo vệ toàn vẹn dữ liệu chấm công, tiền lương và thông tin nhân sự.

---

## 1. Danh Mục Kiểm Soát An Toàn Backend (OWASP API Top 10)

| Mã OWASP | Tên Hạng Mục | Biện Pháp Đã Hiện Thực Tại Backend | File Mã Nguồn Xử Lý | Trạng Thái |
|---|---|---|---|---|
| **API1:2023** | Broken Object Level Authorization (BOLA) | Kiểm tra quyền truy cập tài nguyên theo mã nhân viên (`ma_nv`). | [src/middlewares/authMiddleware.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/middlewares/authMiddleware.js) | Đã áp dụng cơ sở |
| **API2:2023** | Broken Authentication | Đăng nhập tài khoản, xác thực mật khẩu cũ khi đổi mật khẩu mới. | [src/services/authService.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/services/authService.js) | Đạt (Cần thêm JWT) |
| **API3:2023** | Broken Object Property Level Auth | Sử dụng `SAFE_EMPLOYEE_FIELDS` loại bỏ triệt để trường `password` khỏi response. | [src/middlewares/authMiddleware.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/middlewares/authMiddleware.js) | **SẠCH (Fixed)** |
| **API4:2023** | Unrestricted Resource Consumption | Khống chế trần làm thêm giờ OT tối đa 24h/ngày, cấu hình giới hạn kích thước JSON body parser. | [src/middlewares/validationMiddleware.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/middlewares/validationMiddleware.js) | **SẠCH (Fixed)** |
| **API5:2023** | Broken Function Level Auth (BFLA) | Phân định quyền quản trị (Admin), kế toán (Accountant), nhân viên (Employee) dựa trên chức danh. | [src/middlewares/authMiddleware.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/middlewares/authMiddleware.js) | **SẠCH (Fixed)** |
| **API6:2023** | Unrestricted Access to Sensitive Flows | Sử dụng câu lệnh SQL `ON DUPLICATE KEY UPDATE` bảo đảm tính lũy đẳng (Idempotency) khi cập nhật công. | [src/services/attendanceService.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/services/attendanceService.js) | **SẠCH (Fixed)** |
| **API7:2023** | Server Side Request Forgery (SSRF) | Rà soát toàn bộ source code backend: không có hàm nào thực hiện gọi URL động ra bên ngoài. | [src/](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src) | **SẠCH (Clean)** |
| **API8:2023** | Security Misconfiguration | Ẩn chi tiết lỗi SQL table/column nội bộ qua `errorHandler`, tự động kích hoạt mã hóa SSL kết nối Aiven Cloud. | [src/middlewares/errorHandler.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/middlewares/errorHandler.js) | **SẠCH (Fixed)** |
| **API9:2023** | Improper Inventory Management | Danh mục 14 REST API endpoints được quy hoạch nhất quán dưới tiền tố `/api`. | [src/routes/index.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/routes/index.js) | **SẠCH (Fixed)** |
| **API10:2023**| Unsafe Consumption of APIs | Thẩm định chặt chẽ kiểu dữ liệu đầu vào (ép kiểu số nguyên, kiểm tra khoảng ngày tháng). | [src/middlewares/validationMiddleware.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/middlewares/validationMiddleware.js) | **SẠCH (Fixed)** |

---

## 2. Các Quy Tắc Bảo Mật Bắt Buộc Dành Cho Lập Trình Viên Backend

1. **Tuyệt đối dùng Parameterized Queries**:
   - Mọi câu lệnh SQL truy vấn vào database bắt buộc phải sử dụng placeholders `?` của thư viện `mysql2` để ngăn chặn triệt để lỗ hổng SQL Injection.
   - *Ví dụ đúng*: `db.query('SELECT * FROM employees WHERE ma_nv = ?', [ma_nv])`
   - *Nghiêm cấm*: `db.query('SELECT * FROM employees WHERE ma_nv = "' + ma_nv + '"')`

2. **Khử trường thông tin nhạy cảm trước khi trả về**:
   - Khi SELECT dữ liệu từ bảng `employees`, luôn dùng hằng số `SAFE_EMPLOYEE_FIELDS` hoặc gọi hàm `sanitizeUserResponse(user)` để xóa trường `password`.

3. **Chặn lỗi SQL thô rò rỉ ra client**:
   - Không bao giờ trả trực tiếp `err.message` của MySQL về cho client trong môi trường production, vì kẻ tấn công có thể lợi dụng tên bảng, tên cột hoặc stack trace để tấn công hệ thống.
   - Luôn sử dụng middleware `errorHandler` tập trung.

4. **Kiểm tra biên (Boundary Check) mọi dữ liệu số**:
   - Dữ liệu ngày, tháng, năm và số giờ OT luôn phải đi qua hàm kiểm tra `validateAttendanceInput` trước khi chạm vào tầng cơ sở dữ liệu.
