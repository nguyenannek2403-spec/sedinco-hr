# Tài Liệu Kỹ Thuật Dự Án (Backend Specification) — Sedinco HR

> **Trạng thái tài liệu**: [ĐÃ XÁC MINH] theo mã nguồn và cấu trúc Layered MVC tại ngày 16/10/2026.  
> **Phạm vi tài liệu**: Dịch vụ máy chủ Backend Node.js Express, Cơ sở dữ liệu MySQL, Tầng Middleware kiểm soát, Danh mục REST API phục vụ Zalo Mini App Frontend và Web Admin.

---

## 1. Kiến Trúc Backend & Luồng Dữ Liệu (Backend Architecture & Data Flow)

### 1.1 Sơ đồ phân tầng phần mềm (Layered Architecture)
Hệ thống Backend được tổ chức phân tầng rõ rệt theo mô hình tiêu chuẩn công nghiệp nhằm đảm bảo tính độc lập, khả năng mở rộng và dễ kiểm thử:

```
┌─────────────────────────────────────────────────────────────┐
│                   HTTP CLIENTS / CONSUMERS                  │
│   • Zalo Mini App Frontend (zalo-miniapp-frontend)          │
│   • Admin Web Dashboard (fullstack/admin-web)               │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / JSON Requests
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 TẦNG ENTRY & CONFIG (server.js, src/app.js) │
│   • express.json (10MB limit), express.urlencoded           │
│   • CORS Origin Management, Uptime Healthcheck              │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 TẦNG ĐỊNH TUYẾN (src/routes/)               │
│   • authRoutes, attendanceRoutes, payrollRoutes             │
│   • requestRoutes, employeeRoutes, companyRoutes, holidays   │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 TẦNG MIDDLEWARES (src/middlewares/)         │
│   • validationMiddleware (Thẩm tra ngày/tháng, trần OT 24h) │
│   • authMiddleware (Khử mật khẩu, RBAC resolution)          │
│   • errorHandler (Ẩn lỗi SQL table/column nội bộ)          │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 TẦNG ĐIỀU KHIỂN (src/controllers/)          │
│   • Tiếp nhận Request Params/Body/Query                     │
│   • Ủy quyền xử lý cho tầng Service                         │
│   • Phản hồi định dạng JSON chuẩn hóa                       │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 TẦNG NGHIỆP VỤ LÕI (src/services/)          │
│   • payrollService & payrollCalculator (Tính lương tự động) │
│   • attendanceService (Ma trận công, ghi nhận log)          │
│   • requestService (Phê duyệt & tự động đồng bộ công)        │
│   • authService, employeeService, companyService            │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 TẦNG CƠ SỞ DỮ LIỆU (src/config/db.js)       │
│   • MySQL2 Connection Pool (10 connections, KeepAlive)      │
│   • Tự động kích hoạt SSL TLS (Aiven Cloud Managed MySQL)   │
│   • Tự động migration schema 7 bảng (src/database/initDb.js)│
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Bảng Danh Mục Các Module Backend

| Thư mục / File | Trách nhiệm chính | Thư viện & Phụ thuộc |
|---|---|---|
| `src/server.js` | Khởi động HTTP listener, kiểm tra kết nối MySQL Pool, gọi tự động migration schema. | `http`, `express` |
| `src/app.js` | Đăng ký middleware toàn cục, healthcheck endpoints, gắn router `/api`, bắt lỗi 404 và 500. | `express`, `cors` |
| `src/config/db.js` | Quản lý kết nối MySQL Pool, hỗ trợ hàm `query(sql, params)` trả về Promise, tự động bật SSL cho Aiven Cloud. | `mysql2` |
| `src/config/env.js` | Quản lý tập trung các biến môi trường (`PORT`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_SSL`, `CORS_ORIGIN`). | `dotenv` |
| `src/routes/` | Khai báo các đường dẫn RESTful API tách theo từng domain chức năng. | `express.Router` |
| `src/controllers/` | Tiếp nhận và điều hướng HTTP Request, trả về JSON response. | Controllers |
| `src/services/` | Chứa logic nghiệp vụ tính toán, xử lý dữ liệu và truy vấn CSDL. | Services |
| `src/middlewares/` | Thẩm tra dữ liệu đầu vào (Validation), xử lý lỗi (Error Handling), bảo vệ an toàn thông tin (Data Sanitization). | Custom Middlewares |
| `src/database/` | File schema SQL gốc (`sedinco_hr.sql`) và module tự động khởi tạo bảng (`initDb.js`). | `mysql2` |
| `src/utils/` | Thuật toán tính lương độc lập (`payrollCalculator.js`), tiện ích chuẩn hóa phản hồi (`responseHelper.js`). | Pure Functions |

---

## 3. Mô Hình Dữ Liệu CSDL Quan Hệ (Database Schema)

### 3.1 Bảng `admins` (Tài khoản Quản trị)
- `id`: INT AUTO_INCREMENT PRIMARY KEY
- `username`: VARCHAR(50) UNIQUE NOT NULL
- `password`: VARCHAR(100) NOT NULL
- `ho_ten`: VARCHAR(100) DEFAULT NULL

### 3.2 Bảng `employees` (Hồ sơ Nhân sự)
- `ma_nv`: VARCHAR(20) PRIMARY KEY (ví dụ: 'NV001', 'NV002')
- `ho_ten`: VARCHAR(100) NOT NULL
- `ngay_sinh`: DATE
- `dien_thoai`: VARCHAR(20)
- `email`: VARCHAR(100)
- `chuc_danh`: VARCHAR(100) (Nhận diện vai trò: Giám đốc, Kế toán, Nhân viên...)
- `ngay_bat_dau_lam`: DATE
- `ngay_chinh_thuc`: DATE (Mốc phân biệt công thử việc 85% và công chính thức 100%)
- `password`: VARCHAR(100) DEFAULT '123456'
- `avatar_url`: LONGTEXT (Lưu URL ảnh hoặc chuỗi Base64)
- `luong_cb`: DECIMAL(15,2) DEFAULT 0
- `phu_cap_an_trua`, `phu_cap_xang_xe`, `phu_cap_nha_o`, `thuong_htcv`, `phu_cap_trach_nhiem`, `phu_cap_tiep_khach`: DECIMAL(15,2) DEFAULT 0
- `has_insurance`: BOOLEAN DEFAULT TRUE

### 3.3 Bảng `attendance` (Công chuẩn theo tháng)
- `id`: INT AUTO_INCREMENT PRIMARY KEY
- `ma_nv`: VARCHAR(20)
- `thang`: INT, `nam`: INT
- `cong_chuan`: DECIMAL(5,2) DEFAULT 26.00
- `cong_thu_viec`, `cong_chinh_thuc`, `ot_cn`: DECIMAL(5,2) DEFAULT 0
- Ràng buộc duy nhất: `UNIQUE KEY unique_emp_month (ma_nv, thang, nam)`

### 3.4 Bảng `attendance_logs` (Nhật ký chấm công hàng ngày)
- `id`: INT AUTO_INCREMENT PRIMARY KEY
- `employee_id`: VARCHAR(20) NOT NULL
- `record_date`: DATE NOT NULL
- `status`: VARCHAR(10) NOT NULL ('1', '0.5', 'P', 'OT', '1/OT', 'KP', 'ERR')
- `ot_hours`: DECIMAL(4,2) DEFAULT 0 (Giới hạn trần trạm 0h - 24h)
- `check_in_time`: VARCHAR(20) DEFAULT NULL ('HH:mm:ss')
- `check_out_time`: VARCHAR(20) DEFAULT NULL ('HH:mm:ss')
- Ràng buộc duy nhất: `UNIQUE KEY unique_emp_date (employee_id, record_date)`

### 3.5 Bảng `requests` (Đơn xin phép & Đăng ký OT)
- `id`: INT AUTO_INCREMENT PRIMARY KEY
- `employee_id`: VARCHAR(20) NOT NULL
- `request_type`: VARCHAR(50) NOT NULL ('Nghỉ phép', 'Làm thêm giờ (OT)', 'Quên chấm công'...)
- `request_date`: DATE NOT NULL
- `reason`: TEXT
- `status`: VARCHAR(20) DEFAULT 'pending' ('pending', 'approved', 'rejected')
- `created_at`: TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### 3.6 Bảng `public_holidays` (Danh mục Ngày lễ)
- `id`: INT AUTO_INCREMENT PRIMARY KEY
- `holiday_name`: VARCHAR(150) NOT NULL
- `start_date`: DATE NOT NULL, `end_date`: DATE NOT NULL

### 3.7 Bảng `company_settings` (Cấu hình Doanh nghiệp)
- `id`: INT AUTO_INCREMENT PRIMARY KEY
- `company_name`: VARCHAR(255), `phone`: VARCHAR(50), `address`: TEXT, `tax_code`: VARCHAR(50), `logo_url`: LONGTEXT

---

## 4. Danh Sách Endpoint REST API Đầy Đủ

| Method | Endpoint | Xác thực | Tham số đầu vào (Input) | Dữ liệu trả về (Output) | Xử lý tại Backend |
|---|---|---|---|---|---|
| `GET` | `/` | Không | Không | `{ status: 'ok', name: 'Sedinco HR Backend API', time }` | [src/app.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/app.js) |
| `GET` | `/api/health` | Không | Không | `{ status: 'healthy', uptime, timestamp }` | [src/app.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/app.js) |
| `POST` | `/api/admin/login` | Không | `{ username, password }` | `{ success, data: safeAdmin }` | [src/controllers/authController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/authController.js) |
| `POST` | `/api/login` | Không | `{ ma_nv, password }` | `{ success, data: safeEmp }` | [src/controllers/authController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/authController.js) |
| `POST` | `/api/admin/register` | Không | `{ username, password, ho_ten }` | `{ success }` | [src/controllers/authController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/authController.js) |
| `POST` | `/api/change-password` | Không | `{ ma_nv, old_password, new_password }` | `{ success }` | [src/controllers/authController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/authController.js) |
| `POST` | `/api/update-avatar` | Không | `{ ma_nv, avatar_url }` | `{ success }` | [src/controllers/authController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/authController.js) |
| `GET` | `/api/company` | Không | Không | `{ success, data: config }` | [src/controllers/companyController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/companyController.js) |
| `PUT` | `/api/company` | Không | `{ company_name, phone, address, tax_code, logo_url }` | `{ success }` | [src/controllers/companyController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/companyController.js) |
| `GET` | `/api/holidays` | Không | Không | `{ success, data: [] }` | [src/controllers/holidayController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/holidayController.js) |
| `POST` | `/api/holidays` | Không | `{ holiday_name, start_date, end_date }` | `{ success }` | [src/controllers/holidayController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/holidayController.js) |
| `DELETE` | `/api/holidays/:id` | Không | URL param `:id` | `{ success }` | [src/controllers/holidayController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/holidayController.js) |
| `GET` | `/api/attendance` | Không | Query: `?month=&year=` | `{ success, data: [{ ma_nv, ho_ten, days: [] }] }` | [src/controllers/attendanceController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/attendanceController.js) |
| `POST` | `/api/attendance/update` | Không | `{ ma_nv, day, month, year, status, ot_hours }` | `{ success }` | [src/controllers/attendanceController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/attendanceController.js) |
| `GET` | `/api/payroll` | Không | Query: `?month=&year=` | `{ success, data: [PayrollItems] }` | [src/controllers/payrollController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/payrollController.js) |
| `GET` | `/api/requests` | Không | Không | `{ success, data: [Requests] }` | [src/controllers/requestController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/requestController.js) |
| `POST` | `/api/requests` | Không | `{ employee_id, request_type, request_date, reason }` | `{ success }` | [src/controllers/requestController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/requestController.js) |
| `PUT` | `/api/requests/:id` | Không | Body: `{ status: 'approved'/'rejected' }` | `{ success }` | [src/controllers/requestController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/requestController.js) |
| `GET` | `/api/employees` | Không | Không | `{ success, data: [Employees] }` *(Không có password)* | [src/controllers/employeeController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/employeeController.js) |
| `POST` | `/api/employees` | Không | Hồ sơ nhân viên mới | `{ success }` | [src/controllers/employeeController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/employeeController.js) |
| `PUT` | `/api/employees/:id` | Không | Hồ sơ nhân viên cập nhật | `{ success }` | [src/controllers/employeeController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/employeeController.js) |
| `PUT` | `/api/employees/:ma_nv/role` | Không | Body: `{ role: 'admin'/'accountant'/'employee' }` | `{ success }` | [src/controllers/employeeController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/employeeController.js) |
| `DELETE` | `/api/employees/:id` | Không | URL param `:id` | `{ success }` | [src/controllers/employeeController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/controllers/employeeController.js) |

---

## 5. Thuật Toán Nghiệp Vụ Tiền Lương (Payroll Engine)

Hiện thực độc lập tại [src/utils/payrollCalculator.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/utils/payrollCalculator.js):
1. **Lương cơ bản 1 ngày & 1 giờ**:
   - `luong1Ngay = luong_cb / cong_chuan` (mặc định công chuẩn = 26 ngày).
   - `luong1Gio = luong1Ngay / 8`.
2. **Phân loại thời điểm hưởng lương**:
   - Ngày công diễn ra trước `ngay_chinh_thuc` ➔ tính là `congThuViec` (hưởng 85% lương: `congThuViec * 0.85`).
   - Ngày công diễn ra từ `ngay_chinh_thuc` trở đi ➔ tính là `congChinhThuc` (hưởng 100% lương).
   - Tổng công hiệu lực quy đổi: `effectiveDays = (congThuViec * 0.85) + congChinhThuc`.
3. **Làm thêm giờ (OT)**:
   - Ngày thường: hệ số **1.5x**.
   - Ngày Chủ Nhật (`dow === 1`): hệ số **2.0x**.
   - Ngày Lễ (trùng khoảng thời gian `public_holidays`): hệ số **3.0x**.
   - Tiền làm thêm giờ: `tienOt = luong1Gio * soGioOT * heSo`.
4. **Phụ cấp tính theo công thực tế**:
   - `tongPhuCapCoDinh = an_trua + xang_xe + nha_o + thuong_htcv + trach_nhiem + tiep_khach`.
   - `allowanceByWork = (tongPhuCapCoDinh / cong_chuan) * effectiveDays`.
5. **Trích nộp Bảo hiểm xã hội**:
   - Nếu `has_insurance === true` hoặc `has_insurance === 1`: `baoHiem = luong_cb * 10.5%`.
6. **Lương thực lĩnh (Net Salary)**:
   - `netSalary = Math.round(salaryByWork + allowanceByWork + tienOt - baoHiem)`.

---

## 6. Cơ Chế Thẩm Định Dữ Liệu & Phòng Chống Gian Lận

Hiện thực tại [src/middlewares/validationMiddleware.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/src/middlewares/validationMiddleware.js):
1. **Chặn gian lận số giờ OT**:
   - `ot_hours` âm (< 0) tự động đưa về 0.
   - `ot_hours` lớn hơn 24 tự động bị trần tại 24h.
2. **Kiểm tra tính hợp lệ của ngày tháng**:
   - `day`: 1 đến 31 (báo lỗi HTTP 400 nếu vượt biên).
   - `month`: 1 đến 12.
   - `year`: 2000 đến 2100.
3. **Tính lũy đẳng khi cập nhật công (Idempotency)**:
   - Sử dụng cú pháp `INSERT ... ON DUPLICATE KEY UPDATE` giúp việc gọi API nhiều lần không bị nhân bản dữ liệu.
