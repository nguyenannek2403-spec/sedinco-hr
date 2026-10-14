# Tài Liệu Kỹ Thuật Dự Án (Project Specification) — Sedinco HR

> **Trạng thái tài liệu**: [ĐÃ XÁC MINH] theo mã nguồn và cấu hình tại ngày 14/10/2026.  
> **Phạm vi**: Backend Express, Frontend React Vite Admin Web, Mobile Expo App, Cơ sở dữ liệu MySQL.

---

## 1. Kiến Trúc & Luồng Dữ Liệu (Architecture & Data Flow)

### 1.1 Sơ đồ kiến trúc tổng thể
```
┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│  Trình duyệt Web Quản Trị            │       │  Ứng Dụng Di Động Nhân Viên          │
│  (admin-web: React 19 + Vite)        │       │  (sedinco-zalo-app: Expo React Nat.) │
└──────────────────┬───────────────────┘       └──────────────────┬───────────────────┘
                   │ HTTPS / JSON                                 │ HTTP / JSON
                   └───────────────────────┬──────────────────────┘
                                           ▼
                       ┌──────────────────────────────────────┐
                       │  Dịch vụ Máy Chủ REST API             │
                       │  (sedinco_backend: Node.js Express)   │
                       └──────────────────┬───────────────────┘
                                           │ MySQL Protocol (SSL)
                                           ▼
                       ┌──────────────────────────────────────┐
                       │  Cơ sở dữ liệu Quan Hệ               │
                       │  (MySQL 8.x / Aiven Cloud MySQL)     │
                       └──────────────────────────────────────┘
```

### 1.2 Luồng dữ liệu thực tế (Data Flow)
Mã nguồn backend hiện tại được tổ chức nguyên khối (monolithic router) trong một file duy nhất [server.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/server.js):
`UI (React / React Native Component)`  
➔ `State (useState, useEffect, Axios HTTP call)`  
➔ `Express Router / Handler (app.get, app.post, app.put, app.delete trong server.js)`  
➔ `MySQL Connection Pool (mysql2 pool query)`  
➔ `Cơ sở dữ liệu MySQL (sedinco_hr / defaultdb)`  
➔ `JSON Response ({ success: boolean, data?: any, message?: string })`  
➔ `UI State Update (setAttendanceData, setPayroll, setEmployees...)`  
➔ `Render DOM / Mobile Screens`

> [!NOTE]
> Hệ thống hiện tại **chưa có tầng Service/Controller tách biệt**, không có hệ thống Realtime WebSocket và không có hàng đợi (Queue/Job) [ĐÃ XÁC MINH: server.js lines 1-535].

---

## 2. Bảng Danh Mục Module (Modules & Packages)

| Tên Module | Thư mục & File chính | Mục đích chức năng | Thư viện & Phụ thuộc chính |
|---|---|---|---|
| **Backend API** | `sedinco_backend/` <br>[server.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/server.js) | Cung cấp toàn bộ 14 REST endpoints cho xác thực, chấm công, bảng lương, nhân sự, đơn từ và cấu hình doanh nghiệp. | `express@5.2.1`, `mysql2@3.24.5`, `cors@2.8.6`, `dotenv@18.0.5` |
| **Admin Web Dashboard** | `admin-web/` <br>[App.jsx](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/admin-web/src/App.jsx) | Giao diện quản trị web phục vụ Ban Giám Đốc, Kế toán và Cán bộ nhân viên (Bảng chấm công ma trận, Bảng lương, Quản lý đơn từ, Cấu hình). | `react@19.2.8`, `vite@8.3.0`, `tailwindcss@4.3.3`, `lucide-react@1.52.0`, `axios@1.20.0` |
| **Mobile / Zalo App** | `sedinco-zalo-app/` <br>[App.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco-zalo-app/App.js) | Ứng dụng di động dành cho nhân viên chấm công hàng ngày, xem phiếu lương, gửi đơn xin phép/OT. | `expo@57.0.27`, `react-native@0.86.3`, `lucide-react-native@1.52.0`, `axios@1.20.0` |
| **Database Schema** | [sedinco_hr.sql](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_hr.sql) | Cấu trúc 7 bảng dữ liệu quan hệ, dữ liệu hạt giống (seed data) ban đầu. | MySQL Engine InnoDB, Charset `utf8mb4` |

---

## 3. Mô Hình Dữ Liệu (Data Model & Schema)

### 3.1 Bảng `admins` (Tài khoản Quản trị cấp cao)
- **Cấu trúc** [server.js: L132-143, sedinco_hr.sql: L25-32]:
  - `id`: INT AUTO_INCREMENT PRIMARY KEY
  - `username`: VARCHAR(50) UNIQUE NOT NULL
  - `password`: VARCHAR(100) NOT NULL (hiện lưu plaintext '123456')
  - `ho_ten`: VARCHAR(100) DEFAULT NULL

### 3.2 Bảng `employees` (Hồ sơ Nhân sự)
- **Cấu trúc** [server.js: L34-55, sedinco_hr.sql: L133-157]:
  - `ma_nv`: VARCHAR(20) PRIMARY KEY (ví dụ: 'NV001', 'NV002')
  - `ho_ten`: VARCHAR(100) NOT NULL
  - `ngay_sinh`: DATE
  - `dien_thoai`: VARCHAR(20)
  - `email`: VARCHAR(100)
  - `chuc_danh`: VARCHAR(100) (được dùng để nhận diện vai trò: Giám đốc, Kế toán, Bảo vệ...)
  - `ngay_bat_dau_lam`: DATE
  - `ngay_chinh_thuc`: DATE (mốc phân biệt thử việc vs chính thức trong tính lương)
  - `password`: VARCHAR(100) DEFAULT '123456'
  - `avatar_url`: LONGTEXT
  - `luong_cb`: DECIMAL(15,2) DEFAULT 0
  - `phu_cap_an_trua`, `phu_cap_xang_xe`, `phu_cap_nha_o`, `thuong_htcv`, `phu_cap_trach_nhiem`, `phu_cap_tiep_khach`: DECIMAL(15,2) DEFAULT 0
  - `has_insurance`: BOOLEAN DEFAULT TRUE

### 3.3 Bảng `attendance` (Công chuẩn theo tháng)
- **Cấu trúc** [server.js: L76-86, sedinco_hr.sql: L52-63]:
  - `id`: INT AUTO_INCREMENT PRIMARY KEY
  - `ma_nv`: VARCHAR(20)
  - `thang`: INT, `nam`: INT
  - `cong_chuan`: DECIMAL(5,2) DEFAULT 26.00
  - `cong_thu_viec`, `cong_chinh_thuc`, `ot_cn`: DECIMAL(5,2) DEFAULT 0
  - Ràng buộc: `UNIQUE KEY unique_emp_month (ma_nv, thang, nam)`

### 3.4 Bảng `attendance_logs` (Nhật ký chấm công từng ngày)
- **Cấu trúc** [server.js: L89-101, sedinco_hr.sql: L83-94]:
  - `id`: INT AUTO_INCREMENT PRIMARY KEY
  - `employee_id`: VARCHAR(20) NOT NULL
  - `record_date`: DATE NOT NULL
  - `status`: VARCHAR(10) NOT NULL ('1', '0.5', 'P', 'OT', '1/OT', 'KP', 'ERR')
  - `ot_hours`: DECIMAL(4,2) DEFAULT 0
  - `check_in_time`: VARCHAR(20) DEFAULT NULL (ghi nhận thời gian 'HH:mm:ss')
  - `check_out_time`: VARCHAR(20) DEFAULT NULL
  - Ràng buộc: `UNIQUE KEY unique_emp_date (employee_id, record_date)`

### 3.5 Bảng `requests` (Đơn xin phép & Đăng ký OT)
- **Cấu trúc** [server.js: L104-112, sedinco_hr.sql: L197-207]:
  - `id`: INT AUTO_INCREMENT PRIMARY KEY
  - `employee_id`: VARCHAR(20) NOT NULL
  - `request_type`: VARCHAR(50) NOT NULL ('Nghỉ phép', 'Làm thêm giờ (OT)', 'Quên chấm công'...)
  - `request_date`: DATE NOT NULL
  - `reason`: TEXT
  - `status`: VARCHAR(20) DEFAULT 'pending' ('pending', 'approved', 'rejected')
  - `created_at`: TIMESTAMP DEFAULT CURRENT_TIMESTAMP

### 3.6 Bảng `public_holidays` (Danh mục Ngày lễ)
- **Cấu trúc** [server.js: L115-129, sedinco_hr.sql: L175-184]:
  - `id`: INT AUTO_INCREMENT PRIMARY KEY
  - `holiday_name`: VARCHAR(150) NOT NULL
  - `start_date`: DATE NOT NULL, `end_date`: DATE NOT NULL

### 3.7 Bảng `company_settings` (Cấu hình Doanh nghiệp)
- **Cấu trúc** [server.js: L58-73, sedinco_hr.sql: L111-120]:
  - `id`: INT AUTO_INCREMENT PRIMARY KEY
  - `company_name`: VARCHAR(255), `phone`: VARCHAR(50), `address`: TEXT, `tax_code`: VARCHAR(50), `logo_url`: LONGTEXT

---

## 4. Danh Sách Endpoint REST API

| Method | Path | Xác thực (Auth) | Tham số đầu vào (Input) | Dữ liệu trả về (Output) | Ghi chú / File:Line |
|---|---|---|---|---|---|
| `GET` | `/` | Không | Không | `{ status, name, time }` | Healthcheck gốc [server.js:518] |
| `GET` | `/api/health` | Không | Không | `{ status, uptime, timestamp }` | Uptime check [server.js:526] |
| `POST` | `/api/admin/login` | Không | `{ username, password }` | `{ success, data: adminUser }` | Đăng nhập Ban Giám Đốc [server.js:196] |
| `POST` | `/api/login` | Không | `{ ma_nv, password }` | `{ success, data: empUser }` | Đăng nhập Nhân viên [server.js:174] |
| `POST` | `/api/admin/register` | Không | `{ username, password, ho_ten }` | `{ success }` | Tạo tài khoản admin [server.js:217] |
| `POST` | `/api/change-password` | Không | `{ ma_nv, old_password, new_password }`| `{ success }` | Đổi mật khẩu nhân viên [server.js:234] |
| `POST` | `/api/update-avatar` | Không | `{ ma_nv, avatar_url }` | `{ success }` | Đổi avatar Base64 [server.js:248] |
| `GET` | `/api/company` | Không | Không | `{ success, data: config }` | Lấy cấu hình công ty [server.js:158] |
| `PUT` | `/api/company` | Không | `{ company_name, phone, address, tax_code, logo_url }` | `{ success }` | Cập nhật cấu hình [server.js:164] |
| `GET` | `/api/holidays` | Không | Không | `{ success, data: [] }` | Lấy danh sách ngày lễ [server.js:257] |
| `POST` | `/api/holidays` | Không | `{ holiday_name, start_date, end_date }` | `{ success }` | Thêm ngày lễ [server.js:263] |
| `DELETE` | `/api/holidays/:id` | Không | URL param `:id` | `{ success }` | Xóa ngày lễ [server.js:270] |
| `GET` | `/api/attendance` | Không | Query: `?month=&year=` | `{ success, data: [{ ma_nv, ho_ten, days: [] }] }` | Lấy ma trận công tháng [server.js:277] |
| `POST` | `/api/attendance/update` | Không | `{ ma_nv, day, month, year, status, ot_hours }` | `{ success }` | Cập nhật công từng ngày [server.js:299] |
| `GET` | `/api/payroll` | Không | Query: `?month=&year=` | `{ success, data: [PayrollItems] }` | Bảng tính lương tự động [server.js:340] |
| `GET` | `/api/requests` | Không | Không | `{ success, data: [Requests] }` | Danh sách đơn từ [server.js:429] |
| `POST` | `/api/requests` | Không | `{ employee_id, request_type, request_date, reason }` | `{ success }` | Nộp đơn xin phép/OT [server.js:434] |
| `PUT` | `/api/requests/:id` | Không | Body: `{ status: 'approved'/'rejected' }` | `{ success }` | Duyệt đơn & cập nhật công [server.js:441] |
| `GET` | `/api/employees` | Không | Không | `{ success, data: [Employees] }` | Danh sách nhân sự [server.js:482] |
| `POST` | `/api/employees` | Không | Thông tin nhân viên đầy đủ | `{ success }` | Thêm nhân viên mới [server.js:493] |
| `PUT` | `/api/employees/:id` | Không | Thông tin nhân viên cập nhật | `{ success }` | Sửa hồ sơ nhân viên [server.js:503] |
| `DELETE` | `/api/employees/:id` | Không | URL param `:id` | `{ success }` | Xóa nhân viên [server.js:513] |

---

## 5. Xác Thực & Phân Quyền (Auth & RBAC)

### 5.1 Cơ chế xác thực hiện tại [ĐÃ XÁC MINH]
- **Frontend State**: Khi người dùng đăng nhập thành công qua `/api/admin/login` hoặc `/api/login`, đối tượng người dùng được lưu vào `localStorage` dưới khóa `sedinco_auth_user` [App.jsx: L18, L126, L161].
- **Phân loại vai trò (Role Mapping)**:
  - Nếu đăng nhập tab Admin ➔ `roleType: 'admin'`.
  - Nếu đăng nhập tab Nhân viên ➔ Kiểm tra `chuc_danh`:
    * Chứa từ "giám đốc" ➔ `roleType: 'admin'`
    * Chứa từ "kế toán" ➔ `roleType: 'accountant'`
    * Khác ➔ `roleType: 'employee'` [App.jsx: L145-159].
- **Hạn chế bảo mật lớn [CHƯA XÁC MINH JWT/SESSION]**: Backend **hoàn toàn chưa có middleware kiểm tra Token/Session** trên các route API. Bất kỳ ai biết endpoint đều có thể gọi trực tiếp bằng curl/Postman.

---

## 6. Nghiệp Vụ Tính Lương (Payroll Business Logic)

Được hiện thực tại `GET /api/payroll` [server.js: L340-426]:
1. **Lương cơ bản 1 ngày**: `luong1Ngay = luong_cb / cong_chuan` (mặc định công chuẩn = 26 ngày).
2. **Lương 1 giờ**: `luong1Gio = luong1Ngay / 8`.
3. **Phân loại công**:
   - Ngày công diễn ra trước `ngay_chinh_thuc` ➔ tính là `congThuViec` (hưởng 85% lương: `congThuViec * 0.85`).
   - Ngày công diễn ra từ `ngay_chinh_thuc` trở đi ➔ tính là `congChinhThuc` (hưởng 100% lương).
   - Tổng công hiệu lực: `effectiveDays = (congThuViec * 0.85) + congChinhThuc`.
4. **Làm thêm giờ (OT)**:
   - Ngày thường: hệ số **1.5x**.
   - Ngày Chủ Nhật (`dow === 1`): hệ số **2.0x**.
   - Ngày Lễ (trùng khoảng `public_holidays`): hệ số **3.0x**.
   - Tiền OT: `tienOt = luong1Gio * soGioOT * heSo`.
5. **Phụ cấp cố định**:
   - `tongPhuCap = an_trua + xang_xe + nha_o + thuong_htcv + trach_nhiem + tiep_khach`.
   - Phụ cấp hưởng theo công thực tế: `allowanceByWork = (tongPhuCap / cong_chuan) * effectiveDays`.
6. **Bảo hiểm trích nộp**:
   - Nếu `has_insurance === 1`: `baoHiem = luong_cb * 10.5%`.
7. **Lương thực lĩnh (Net Salary)**:
   - `netSalary = round(salaryByWork + allowanceByWork + tienOt - baoHiem)`.

---

## 7. Vùng Nhạy Cảm & Dễ Vỡ (Fragile & Critical Areas)

1. **`server.js` - `PUT /api/requests/:id` (Tự động cập nhật công khi duyệt đơn)**:
   - Khi `status === 'approved'`, hàm này chạy query lồng nhau để tìm và chèn vào `attendance_logs`. Nếu chuỗi ngày tháng bị lệch múi giờ UTC/GMT+7, ngày công sẽ bị ghi sang ngày hôm trước.
2. **`App.jsx` - Ma trận chấm công & tính mảng ngày**:
   - `daysInMonth = new Date(year, month, 0).getDate()`: Chú ý index tháng trong JavaScript (0-indexed) so với MySQL (1-indexed).
3. **Mã hóa chuỗi ảnh Base64 trong database**:
   - Các cột `avatar_url` và `logo_url` có kiểu `LONGTEXT`. Nếu client gửi ảnh chất lượng cao 5-10MB, thao tác SELECT có thể gây tràn bộ nhớ hoặc làm nghẽn kết nối MySQL pool.

---

## 8. Nợ Kỹ Thuật (Technical Debt)

1. **Chưa có cơ chế băm mật khẩu (Hashing)**: Cần nâng cấp sang `bcrypt` để băm mật khẩu `password` trong bảng `admins` và `employees`.
2. **Chưa có Middleware Token (JWT/Session)**: Backend cần bổ sung `verifyToken` và `requireRole('admin')` để bảo vệ các thao tác nhạy cảm.
3. **Cấu trúc Monolith 1 file**: `server.js` chứa hơn 535 dòng, nên được module hóa thành `controllers/`, `routes/`, `services/`, `middleware/` trong các phiên bản tương lai.
4. **CORS Wildcard & Thiếu Rate Limiter**: Cần cấu hình CORS theo danh sách domain cho phép và tích hợp `express-rate-limit` để chặn tấn công brute-force.
