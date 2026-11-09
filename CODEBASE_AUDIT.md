# BÁO CÁO TOÀN DIỆN KIẾN TRÚC MÃ NGUỒN & ĐỐI SOÁT HỆ THỐNG
## DỰ ÁN: SEDINCO HR (BACKEND + FRONTEND + DATABASE)
> **Ngày lập báo cáo**: 09/11/2026  
> **Người thực hiện**: Chuyên gia Kiểm thử & Tối ưu Hệ thống (System Architect & Code Auditor)  
> **Mục tiêu**: Đánh giá thực trạng mã nguồn, lưu trữ, các điểm phình to bất thường, đối soát 54 API chuẩn, thống kê kho hàm tái sử dụng và chỉ ra các lỗi logic/mã rác.  
> **Cam kết**: Tuyệt đối KHÔNG sửa đổi mã nguồn tại bước này; chỉ phản ánh trung thực hiện trạng thực tế.

---

## 1. CẤU TRÚC THƯ MỤC THỰC TẾ & KÍCH THƯỚC (PROJECT TREE & STORAGE AUDIT)

### 1.1 Cây Thư Mục Thực Tế (Tối thiểu Cấp 3 - Bỏ qua `node_modules`, `.git`, `dist`, `build`, `www`, `.cache`, `package-lock.json`)
```
sedinco-hr/
├── .env.staging.example
├── .gitignore
├── .nvmrc
├── AGENTS.md
├── CHANGELOG.md
├── README.md
├── package.json
├── vite.config.js
├── wrangler.jsonc
├── zmp-cli.json
├── sedinco_hr.sql                          [1.4 MB - SQL dump CSDL gốc]
├── data/
│   ├── employees_sample_pilot.csv
│   └── holidays_2026.json
├── docs/
│   ├── PROJECT.md                         [Tài liệu đặc tả kiến trúc v7.0]
│   ├── sedinco-hr-summary.xlsx
│   └── security/
│       └── security-audit.xlsx
├── reports/                               [21 MB - Báo cáo & ảnh chụp màn hình]
│   ├── screens/                           [15 MB - Ảnh chụp E2E L3 PNG]
│   ├── screenshots/                       [4.7 MB - Ảnh chụp E2E cũ]
│   ├── sim/                               [Logs & timeline mô phỏng]
│   ├── backup/
│   └── verification-2026-10-27.xlsx
├── scripts/
│   ├── backup_db.sh
│   ├── create_initial_admin.js
│   ├── grant_staging_app_user.sql
│   └── migrate_staging_schema.js
├── sedinco_backend/                       [11 MB - Mã nguồn Backend API]
│   ├── package.json
│   ├── server.js
│   ├── logs/
│   │   └── staging_events.jsonl
│   ├── __tests__/                         [24 files kiểm thử tự động, 174 test cases]
│   │   ├── anti_fraud_attendance.test.js
│   │   ├── cors_and_topology.test.js
│   │   ├── g2_bcrypt_login.test.js
│   │   ├── g2_kiosk_qr.test.js
│   │   ├── g5_worker_threads_bcrypt.test.js
│   │   ├── g6_db_least_privilege.test.js
│   │   ├── g8_ip_spoofing_security.test.js
│   │   └── ...
│   └── src/
│       ├── app.js                         [11 KB - Express app core & middlewares]
│       ├── server.js
│       ├── config/
│       │   ├── db.js                      [MySQL connection pool & Transaction helper]
│       │   └── env.js                     [Biến môi trường tập trung]
│       ├── controllers/                   [9 controllers xử lý HTTP request]
│       │   ├── attendanceController.js
│       │   ├── authController.js
│       │   ├── companyController.js
│       │   ├── diagnosticsController.js
│       │   ├── employeeController.js
│       │   ├── holidayController.js
│       │   ├── kioskController.js
│       │   ├── payrollController.js
│       │   ├── permissionController.js
│       │   └── requestController.js
│       ├── database/
│       │   ├── initDb.js                  [Schema DDL 14 bảng quan hệ]
│       │   └── sedinco_hr.sql             [1.4 MB - Trùng lặp với file ngoài root]
│       ├── middlewares/
│       │   ├── authMiddleware.js          [JWT & Instant Revocation & RBAC]
│       │   ├── errorHandler.js            [Xử lý lỗi tập trung & CORS header]
│       │   └── validationMiddleware.js
│       ├── routes/                        [11 router module + index.js]
│       │   ├── attendanceRoutes.js
│       │   ├── authRoutes.js
│       │   ├── clientErrorRoutes.js
│       │   ├── companyRoutes.js
│       │   ├── diagnosticsRoutes.js
│       │   ├── employeeRoutes.js
│       │   ├── holidayRoutes.js
│       │   ├── kioskRoutes.js
│       │   ├── payrollRoutes.js
│       │   ├── requestRoutes.js
│       │   ├── settingsRoutes.js
│       │   └── index.js
│       ├── services/                      [9 business services]
│       │   ├── attendanceService.js       [31 KB - Logic chấm công đa lớp & Geofence]
│       │   ├── authService.js             [27 KB - Đăng nhập & Rate limit]
│       │   ├── companyService.js
│       │   ├── employeeService.js         [20 KB - CRUD nhân sự & Device binding]
│       │   ├── holidayService.js
│       │   ├── kioskService.js            [12 KB - Quản lý Kiosk Hardware]
│       │   ├── payrollService.js
│       │   ├── permissionService.js
│       │   └── requestService.js          [15 KB - Quy trình duyệt đơn & SoD]
│       └── utils/                         [12 tiện ích kỹ thuật]
│           ├── anomalyDetector.js
│           ├── bcryptWorker.js
│           ├── bcryptWorkerPool.js
│           ├── dynamicQrHelper.js
│           ├── geoHelper.js
│           ├── passwordHelper.js
│           ├── payrollCalculator.js
│           ├── responseHelper.js
│           ├── stagingLogStore.js
│           ├── structuredLogger.js
│           ├── timeHelper.js
│           └── zaloAdapter.js
├── tests/
│   └── ui_functions.json
├── tools/                                 [38 CLI scripts phục vụ test, benchmark, audit]
│   ├── lib/
│   │   └── dbSafetyGuard.js               [Chốt chặn an toàn DB test vs cloud]
│   ├── compare_schemas.js
│   ├── generate-summary/
│   ├── import_employees_csv.js
│   ├── import_holidays.js
│   ├── independent_payroll_verifier.js
│   ├── measure_staging_concurrency.js
│   ├── purge_staging_data.js
│   ├── read_staging_logs.js
│   ├── run_g8_simulation.js
│   ├── run_l3_e2e.js                      [57 KB - Kịch bản E2E Puppeteer]
│   ├── serve_static_frontend.js
│   ├── smoke_staging.js
│   ├── update_company_gps.js
│   ├── verify_20_employees_payroll.js
│   ├── verify_25_ui_functions.js
│   └── verify_build_target.js
└── zalo-miniapp-frontend/                 [177 MB - Frontend React Zalo Mini App]
    ├── app-config.json
    ├── index.html
    ├── package.json
    ├── postcss.config.js
    ├── tailwind.config.js
    ├── vite.config.js
    ├── zmp-cli.json
    ├── public/
    │   └── sedinco-logo.png               [291 KB - Trùng lặp logo]
    └── src/
        ├── app.js                         [Entrypoint render React]
        ├── adapters/
        │   └── zmp/
        │       ├── mockSdkAdapter.js
        │       ├── realSdkAdapter.js
        │       └── sdkAdapter.js
        ├── components/                    [20 shared UI components]
        │   ├── AccountantPermissionView.jsx
        │   ├── AdminDeviceApproval.jsx
        │   ├── AttendanceMatrixTable.jsx  [26 KB]
        │   ├── CompanyLogo.jsx
        │   ├── DesktopHeader.jsx
        │   ├── DesktopSidebar.jsx
        │   ├── DeviceChangeModal.jsx      [DEAD CODE - không dùng]
        │   ├── DiagnosticsView.jsx        [18 KB]
        │   ├── EmployeeCheckinPC.jsx      [12 KB]
        │   ├── ForcePasswordChangeModal.jsx
        │   ├── KioskDisplayView.jsx       [10 KB]
        │   ├── LinkAccountView.jsx        [DEAD CODE - không dùng]
        │   ├── OneTouchCheckIn.jsx        [21 KB]
        │   ├── PayrollGridTable.jsx       [19 KB]
        │   ├── PeriodLockModal.jsx
        │   ├── SalarySlipModal.jsx        [12 KB]
        │   ├── SmartLeaveRequestModal.jsx [12 KB]
        │   ├── clock.jsx                  [DEAD CODE - không dùng]
        │   ├── layout.jsx
        │   └── logo.jsx                   [9.8 KB SVG]
        ├── constants/
        │   └── roles.js                   [RBAC permissions matrix]
        ├── css/
        │   ├── app.scss
        │   └── tailwind.scss
        ├── pages/
        │   └── index.jsx                  [239 KB / 4.497 DÒNG - Monolithic Page]
        ├── services/
        │   └── authService.js
        ├── static/
        │   └── sedinco-logo.png           [291 KB - Trùng lặp logo]
        └── utils/
            ├── api.js                     [10 KB - Axios interceptor & config]
            ├── holidayUtils.js
            └── imageHelper.js
```

---

### 1.2 Phân Tích Nguyên Nhân Kích Thước Repo Lên Tới ~466MB - 500MB
Thống kê thực tế bằng lệnh `du -sh`:
- **Tổng dung lượng toàn repository**: **466 MB**

| Thành phần chiếm dung lượng | Kích thước | Tỷ lệ | Nguyên nhân kỹ thuật cụ thể |
| :--- | :---: | :---: | :--- |
| **`node_modules` (3 cấp nhân bản)** | **428.8 MB** | **92.0%** | Có tới 3 thư mục `node_modules` tồn tại song song:<br>1. Thư mục gốc `/node_modules`: **245 MB** (Puppeteer, chromium deps, Babel, Vite)<br>2. `/zalo-miniapp-frontend/node_modules`: **175 MB** (React, ZMP SDK, Tailwind, Postcss)<br>3. `/sedinco_backend/node_modules`: **8.8 MB** (Express, MySQL2, bcryptjs)<br>$\rightarrow$ *Sự trùng lặp dependencies giữa root `package.json` và frontend `package.json` khiến dung lượng phình to gấp đôi.* |
| **Ảnh chụp kiểm thử (`reports/screens/` & `reports/screenshots/`)** | **19.7 MB** | **4.2%** | Hàng trăm tệp ảnh PNG sinh ra tự động từ các đợt chạy Puppeteer L3 E2E không được tự động dọn dẹp (đặc biệt là các bản chụp nhiều độ phân giải 360x640, 375x812, 414x896). |
| **Tệp CSDL Dump trùng lặp (`.sql`)** | **2.8 MB** | **0.6%** | Tệp `sedinco_hr.sql` (1.4MB) bị nhân bản ở 2 nơi: thư mục gốc `/sedinco_hr.sql` và trong `/sedinco_backend/src/database/sedinco_hr.sql`. |
| **Thư mục sao lưu `backups/`** | **2.6 MB** | **0.5%** | Các bản sao lưu DB tar/sql cũ không được đưa vào `.gitignore`. |
| **Thư mục build tĩnh (`dist/` & `zalo-miniapp-frontend/www/`)** | **3.3 MB** | **0.7%** | Thư mục `dist/` (1.8MB) ở root và `www/` (1.5MB) của Vite chưa được dọn dẹp định kỳ. |
| **Tệp mã nguồn khổng lồ (`index.jsx`) & Assets ảnh** | **1.2 MB** | **0.3%** | File `pages/index.jsx` phình to tới **239 KB (4.497 dòng)**; logo `sedinco-logo.png` (291KB) bị nhân bản ở cả `src/static/` và `public/`. |

---

## 2. DANH MỤC THƯ VIỆN & CẤU HÌNH DEPLOYMENT

### 2.1 Backend (Node.js & Express API)
- **Vị trí file cấu hình**: `sedinco_backend/package.json`
- **Phiên bản Node quy định**: `"node": ">=26.0.0 <27.0.0"` *(Lưu ý rủi ro: Render Web Service thường dùng Node 20 LTS hoặc Node 22 LTS; nếu Render không hỗ trợ Node 26 sẽ gặp cảnh báo hoặc thất bại khi cài đặt)*.
- **Danh sách Dependencies**:
  - `express`: `^5.2.1` (Web server core, hỗ trợ Promise native)
  - `mysql2`: `^3.24.5` (Driver kết nối MySQL Connection Pool)
  - `bcryptjs`: `^3.0.3` (Mật mã băm mật khẩu)
  - `cors`: `^2.8.6` (Quản lý CORS headers)
  - `dotenv`: `^18.0.5` (Đọc file cấu hình môi trường)
- **Danh sách Biến Môi Trường (Environment Variables) cho Render & Aiven MySQL**:

| Tên Biến | Mục Đích Sử Dụng | Môi Trường Áp Dụng | Giá Trị Mẫu / Lưu Ý |
| :--- | :--- | :---: | :--- |
| `NODE_ENV` | Chế độ chạy ứng dụng | Render / Local | `staging` hoặc `production` |
| `PORT` | Cổng HTTP lắng nghe | Local (Render tự gán) | `5001` (Không hardcode trên Render) |
| `DB_HOST` | Địa chỉ máy chủ CSDL Aiven | Render | `*.aivencloud.com` |
| `DB_PORT` | Cổng kết nối CSDL Aiven | Render | Ví dụ `13306` hoặc cổng Aiven cấp |
| `DB_USER` | Tên người dùng MySQL DML | Render | `sedinco_app_dml` (chỉ cấp quyền DML) |
| `DB_PASSWORD` | Mật khẩu kết nối CSDL | Render | `[ĐÃ ẨN BÍ MẬT]` |
| `DB_NAME` | Tên cơ sở dữ liệu | Render | `sedinco_hr_staging_test` |
| `DB_SSL` | Bật mã hóa TLS kết nối CSDL | Render | `true` (Bắt buộc với Aiven Cloud) |
| `ALLOW_RUNTIME_DDL`| Chặn DDL lúc chạy app | Render | `false` (Bảo đảm Least Privilege) |
| `JWT_SECRET` | Khóa bí mật ký token JWT | Render | `[ĐÃ ẨN - Tối thiểu 32 ký tự]` |
| `QR_SECRET` | Khóa bí mật ký Dynamic QR | Render | `[ĐÃ ẨN - Tối thiểu 32 ký tự]` |
| `TRUST_PROXY` | Số hop reverse proxy tin cậy | Render | `1` (Vì nằm sau Render Load Balancer) |
| `BCRYPT_WORKER_POOL_SIZE` | Số luồng tính băm mật khẩu | Render | `2` (Khớp với 2 vCPU của gói Staging) |
| `CORS_ORIGIN` | Danh sách URL Frontend được phép | Render | `https://sedinco.pages.dev` (tách dấu phẩy) |
| `ENABLE_DIAGNOSTICS` | Bật endpoint tự chẩn đoán | Render | `true` (Chỉ bật trên Staging, cấm Prod) |
| `ENABLE_CLIENT_ERROR_REPORTING` | Nhận báo cáo lỗi UI | Render | `true` (Kích hoạt `/api/client-errors`) |
| `ZALO_APP_ID` | App ID Zalo Mini App | Render | ID ứng dụng đăng ký trên Zalo |
| `ZALO_APP_SECRET` | Secret giải mã token Zalo | Render | `[ĐÃ ẨN BÍ MẬT]` |

---

### 2.2 Frontend (React & Vite & Zalo Mini App)
- **Vị trí file cấu hình**: `zalo-miniapp-frontend/package.json` và `wrangler.jsonc`
- **Dependencies chính**:
  - `react`: `^18.3.1` & `react-dom`: `^18.3.1`
  - `zmp-sdk`: `latest` (SDK tương tác nền tảng Zalo)
  - `zmp-ui`: `latest` (Bộ component giao diện Zalo)
  - `axios`: `^1.20.0` (HTTP client gọi REST API)
  - `lucide-react`: `^1.57.0` (Icon đồ họa)
  - `jotai`: `^2.12.1` (State management)
- **Cấu hình Build cho Cloudflare Pages & Zalo Mini App**:
  - `wrangler.jsonc`:
    ```jsonc
    {
      "name": "sedinco-hr",
      "compatibility_date": "2024-09-23",
      "assets": {
        "directory": "./dist",
        "html_handling": "auto-trailing-slash",
        "not_found_handling": "single-page-application"
      }
    }
    ```
  - **Lệnh đóng gói Cloudflare**:
    `npm run build` tại root $\rightarrow$ `cd zalo-miniapp-frontend && npm install && npx vite build && mkdir -p ../dist && cp -r www/* ../dist/`
  - **Chốt chặn an toàn Staging trong `zalo-miniapp-frontend/vite.config.js`**:
    Khi chạy với cờ `mode === "staging"`, Vite kiểm tra nếu thiếu `VITE_API_URL` sẽ ném ngoại lệ dừng build ngay lập tức để ngăn việc bundle nhầm endpoint Production.

---

## 3. KHO HÀM & TIỆN ÍCH HIỆN CÓ ĐỂ TÁI SỬ DỤNG (REUSABLE CODE REGISTRY)

Nhằm chấm dứt tình trạng viết lại hàm mới gây phân mảnh mã nguồn, dưới đây là danh bạ toàn bộ các hàm tiện ích, middleware và model đã sẵn sàng trong repository:

### 3.1 Danh Sách Middlewares
| Tên Middleware / Hàm | File Chứa | Đầu Vào (Input) | Đầu Ra (Output) / Hành Vi |
| :--- | :--- | :--- | :--- |
| `authenticateToken` | `sedinco_backend/src/middlewares/authMiddleware.js` | `req.headers.authorization` (Bearer JWT) | Gán `req.user`; kiểm tra ngay tức thì CSDL (`is_locked=1`, đổi role) $\rightarrow$ ngắt phiên ngay nếu tài khoản bị khóa. |
| `requireAuth` | `sedinco_backend/src/middlewares/authMiddleware.js` | `req.user` | Nếu chưa xác thực $\rightarrow$ trả HTTP `401 Unauthorized`. |
| `requireRole` | `sedinco_backend/src/middlewares/authMiddleware.js` | `allowedRoles` (Array/String: `worker`, `accountant`, `admin`) | Chặn truy cập nếu không khớp vai trò $\rightarrow$ trả HTTP `403 Forbidden`. |
| `requirePermission` | `sedinco_backend/src/middlewares/authMiddleware.js` | `permissionKey` (String) | Tra cứu động bảng `accountant_permissions` theo mô-đun đối với vai trò kế toán; admin được bypass toàn quyền. |
| `logAuditEvent` | `sedinco_backend/src/middlewares/authMiddleware.js` | `{ actor_id, actor_role, action, resource, details, ip_address }` | Ghi bản ghi bất biến vào bảng `audit_logs` (Append-Only). |
| `errorHandler` | `sedinco_backend/src/middlewares/errorHandler.js` | `(err, req, res, next)` | Bắt lỗi tập trung, đính kèm `X-Request-Id`, log lỗi, bảo đảm luôn gắn header CORS để frontend đọc được JSON lỗi. |
| `notFoundHandler` | `sedinco_backend/src/middlewares/errorHandler.js` | `(req, res)` | Xử lý route 404, gắn header CORS và `request_id`. |
| `validateAttendanceMiddleware`| `sedinco_backend/src/middlewares/validationMiddleware.js`| `req.body` | Thẩm tra dữ liệu chấm công: `ma_nv`, `day`, `month`, `year`, `status`, `ot_hours`. |

---

### 3.2 Danh Sách Helpers & Utils Kỹ Thuật
| Tên Hàm | File Chứa | Đầu Vào (Input) | Đầu Ra (Output) |
| :--- | :--- | :--- | :--- |
| `calculateDistanceMeters` | `sedinco_backend/src/utils/geoHelper.js` | `(lat1, lon1, lat2, lon2)` | Trả về khoảng cách theo cung tròn (mét) theo công thức Haversine. Trả về `Infinity` nếu tham số lỗi. |
| `isWithinGeofence` | `sedinco_backend/src/utils/geoHelper.js` | `(userLat, userLng, targetLat, targetLng, radiusMeters = 100)` | Trả về `{ isInside: Boolean, distanceMeters: Number, allowedRadius: Number }`. |
| `generateDynamicQrToken` | `sedinco_backend/src/utils/dynamicQrHelper.js` | `(branchId=1, ttlSeconds=30, kioskId=null)` | Sinh mã QR động HMAC-SHA256 v2 gắn `kioskId` và nonce; trả về `{ token, expiresAt, ttlSeconds }`. |
| `verifyDynamicQrToken` | `sedinco_backend/src/utils/dynamicQrHelper.js` | `(token, maxAgeSeconds=30)` | Thẩm tra chữ ký, định dạng v1/v2, tính hợp lệ và thời gian hết hạn của token QR. |
| `hashPassword` / `hashPasswordAsync` | `sedinco_backend/src/utils/passwordHelper.js` | `(password: String)` | Băm mật khẩu bằng bcrypt (cost factor 10); bản async đẩy qua `bcryptWorkerPool` offload Event Loop. |
| `comparePassword` / `comparePasswordAsync`| `sedinco_backend/src/utils/passwordHelper.js` | `(inputPassword, storedHash)` | So sánh mật khẩu an toàn với chuỗi hash bcrypt. Từ chối chuỗi plain text. |
| `calculateEmployeeSalary` | `sedinco_backend/src/utils/payrollCalculator.js` | `{ luong_cb, cong_chuan, ngay_chinh_thuc, status, logs, holidays, allowances, has_insurance, otRegistrations }` | Động cơ tính lương đầy đủ: chia lương ngày, công thử việc (85%), chính thức, phụ cấp, OT (1.5x/2.0x/3.0x), trừ BHXH (10.5%), thực lĩnh (Net). |
| `getVietnamDateString` | `sedinco_backend/src/utils/timeHelper.js` | `(date: Date)` | Format ngày chuẩn Việt Nam: `YYYY-MM-DD` (Timezone +07:00). |
| `getVietnamTimeString` | `sedinco_backend/src/utils/timeHelper.js` | `(date: Date)` | Format giờ chuẩn Việt Nam: `HH:mm:ss`. |
| `logRejection` | `sedinco_backend/src/utils/structuredLogger.js` | `{ code, message, actor_id, ip, details }` | Ghi log JSON có cấu trúc khi có từ chối bảo mật; cập nhật bộ đếm metrics. |
| `recordStagingEvent` | `sedinco_backend/src/utils/stagingLogStore.js` | `(event: Object)` | Khử toàn bộ secret/PII/password; lưu sự kiện vào buffer in-memory và file `staging_events.jsonl`. |
| `getRecentEvents` | `sedinco_backend/src/utils/stagingLogStore.js` | `(hours = 1)` | Tổng hợp số lỗi, phân bổ theo Route và phân bổ theo Role trong N giờ gần nhất. |
| `verifyZaloLocationToken` | `sedinco_backend/src/utils/zaloAdapter.js` | `(token: String)` | Gọi API Zalo giải mã `location_token` ra `{ lat, lng, verified: true }`. |

---

### 3.3 Danh Sách Database Services & Models
| Service Class / File | Hàm Nghiệp Vụ Cốt Lõi | Mô Tả & Tương Tác CSDL |
| :--- | :--- | :--- |
| `config/db.js` | `query(sql, params)` | Thực thi câu lệnh SQL với Prepared Statement qua MySQL Pool (Connection limit 10, timezone +07:00). |
| `config/db.js` | `withTransaction(callback)` | Thực thi ACID Transaction: tự động `COMMIT` hoặc `ROLLBACK` và release connection an toàn. |
| `config/db.js` | `verifySchemaReadiness()` | Kiểm tra sự tồn tại của 14 bảng quan hệ trên tài khoản DML (Zero Runtime DDL). |
| `attendanceService.js` | `checkInMultiFactor(...)` | Giao dịch nguyên khối tiêu thụ QR (`dynamic_qr_sessions`) và ghi log (`attendance_logs`), kiểm tra Geofence, device fingerprint. |
| `attendanceService.js` | `updateAttendanceDaily(...)` | Cập nhật công ngày, kiểm tra chốt sổ `period_locks`, chốt chặn SoD không cho tự sửa công của chính mình. |
| `attendanceService.js` | `lockPeriod(...)` / `unlockPeriod(...)` | Đóng băng/mở khóa kỳ công tháng; kiểm soát cảnh báo bản ghi `is_low_trust`. |
| `authService.js` | `login(...)` / `adminLogin(...)` | Đăng nhập tài khoản, kiểm soát rate limit phân tầng IP và User trong `login_rate_limits`, sinh JWT token. |
| `employeeService.js` | `createEmployee` / `updateEmployeeStatus` / `approveDeviceChange` | Quản lý hồ sơ nhân viên, trạng thái khóa, chế độ thiết bị (`recording`/`enforced`). |
| `kioskService.js` | `generateKioskQr` / `revokeKiosk` / `rotateKioskKey` | Quản lý mã Dynamic QR và khóa phần cứng Kiosk đặt tại cổng xưởng. |
| `payrollService.js` | `calculateMonthlyPayroll` / `getMyPayroll` | Lấy dữ liệu công, đăng ký OT, ngày lễ, tính lương tổng hợp toàn công ty hoặc cá nhân. |
| `requestService.js` | `createRequest` / `updateRequestStatus` / `cancelRequest` | Quy trình nộp đơn nghỉ/OT, chốt chặn SoD ngăn tự duyệt, tự động đồng bộ ký hiệu `P` vào bảng công. |

---

## 4. BẢN ĐỒ ROUTER & ENDPOINTS HIỆN TẠI (BACKEND DRIFT AUDIT)

### 4.1 Bảng Đối Soát 54 Endpoints Tiêu Chuẩn (DOCS/PROJECT.MD v7.0) Với Mã Nguồn Thực Tế
Sau khi quét toàn bộ thư mục `sedinco_backend/src/routes/`, ghi nhận hiện trạng:
- **Khớp hoàn toàn**: 36 / 54 endpoints.
- **Bị lệch pha (Drift - khác Method / Path / Param)**: 12 / 54 endpoints.
- **Thiếu trên Backend (Chưa viết hoặc gộp)**: 6 / 54 endpoints.
- **Endpoints viết thêm ngoài đặc tả 54**: 10 endpoints.

| STT Doc | Endpoint Trong DOCS/PROJECT.MD | Trạng Thái Trong Code Thực Tế | Endpoint Thực Tế Đang Khai Báo | Ghi Chú Kỹ Thuật (Drift / Sai Lệch) |
| :---: | :--- | :---: | :--- | :--- |
| **Nhóm 1** | **Xác Thực & Tài Khoản** | | | |
| 1 | `POST /api/login` | **KHỚP** | `POST /api/login` | `authRoutes.js` (Worker/Accountant login) |
| 2 | `POST /api/admin/login` | **KHỚP** | `POST /api/admin/login` | `authRoutes.js` (Admin login) |
| 3 | `POST /api/admin/register` | **KHỚP** | `POST /api/admin/register` | `authRoutes.js` |
| 4 | `GET /api/me` | **KHỚP** | `GET /api/me` | `authRoutes.js` |
| 5 | `GET /api/profile` | **KHỚP** | `GET /api/profile` | `authRoutes.js` |
| 6 | `POST /api/change-password` | **KHỚP** | `POST /api/change-password` | `authRoutes.js` |
| 7 | `POST /api/update-avatar` | **KHỚP** | `POST /api/update-avatar` | `authRoutes.js` |
| **Nhóm 2** | **Chấm Công** | | | |
| 8 | `POST /api/attendance` | **LỆCH PATH** | `POST /api/attendance/update` | Doc ghi `/attendance`, code thực tế là `/attendance/update`. |
| 9 | `GET /api/attendance` | **KHỚP** | `GET /api/attendance` | Lấy ma trận công 31 ngày toàn công ty. |
| 10 | `POST /api/attendance/check-in` | **KHỚP** | `POST /api/attendance/check-in` | Chấm công đa lớp (QR + GPS + Photo). |
| 11 | `GET /api/attendance/my-logs` | **LỆCH PATH** | `GET /api/attendance/me` | Doc ghi `my-logs`, code thực tế dùng endpoint `/attendance/me`. |
| 12 | `GET /api/attendance/my-monthly` | **THIẾU** | *(Dùng chung `/attendance/me`)* | Chưa có endpoint riêng `my-monthly`. |
| 13 | `GET /api/attendance/qr` | **LỆCH PATH** | `GET /api/attendance/dynamic-qr` | Doc ghi `qr`, code là `dynamic-qr` (hoặc `GET /api/kiosk/qr`). |
| 14 | `POST /api/attendance/lock-period` | **KHỚP** | `POST /api/attendance/lock-period` | Khóa sổ kỳ công tháng. |
| 15 | `POST /api/attendance/unlock-period` | **KHỚP** | `POST /api/attendance/unlock-period` | Mở khóa sổ kỳ công (Chỉ Admin). |
| 16 | `GET /api/attendance/period-lock-status`| **LỆCH PATH** | `GET /api/attendance/period-status` | Doc ghi `period-lock-status`, code thực tế là `period-status`. |
| 17 | `GET /api/attendance/suspicious-logs` | **KHỚP** | `GET /api/attendance/suspicious-logs`| Lấy danh sách chấm công nghi vấn. |
| 18 | `GET /api/attendance/stats` | **THIẾU** | *(Chưa khai báo trong router)* | Chưa có endpoint thống kê tỷ lệ đi làm theo ngày. |
| **Nhóm 3** | **Tiền Lương** | | | |
| 19 | `GET /api/payroll/calculate` | **LỆCH METHOD**| `POST /api/payroll/calculate` | Doc ghi `GET`, code thực tế khai báo `POST`. |
| 20 | `GET /api/payroll/my-payslip` | **LỆCH PATH** | `GET /api/payroll/me` | Doc ghi `my-payslip`, code thực tế là `payroll/me`. |
| 21 | `POST /api/payroll/save` | **THIẾU** | `POST /api/payroll/approve` | Doc ghi `save`, code thực tế là `approve`. |
| 22 | `GET /api/payroll/export` | **THIẾU** | *(Client-side export)* | Backend KHÔNG có API xuất CSV; Frontend tự sinh CSV trong `PayrollGridTable.jsx`. |
| **Nhóm 4** | **Quản Lý Đơn Từ** | | | |
| 23 | `POST /api/requests` | **KHỚP** | `POST /api/requests` | Nộp đơn từ mới. |
| 24 | `GET /api/requests/my` | **LỆCH PATH** | `GET /api/requests/me` | Doc ghi `/my`, code thực tế là `/me`. |
| 25 | `GET /api/requests/all` | **LỆCH PATH** | `GET /api/requests` | Doc ghi `/all`, code thực tế là root `GET /api/requests`. |
| 26 | `PUT /api/requests/:id` | **KHỚP** | `PUT /api/requests/:id` | Phê duyệt hoặc từ chối đơn. |
| 27 | `DELETE /api/requests/:id` | **LỆCH METHOD**| `PUT /api/requests/:id/cancel` | Doc ghi `DELETE /:id`, code là `PUT /:id/cancel`. |
| **Nhóm 5** | **Quản Lý Nhân Sự** | | | |
| 28 | `GET /api/employees` | **KHỚP** | `GET /api/employees` | Danh sách nhân viên. |
| 29 | `POST /api/employees` | **KHỚP** | `POST /api/employees` | Tạo mới nhân viên. |
| 30 | `PUT /api/employees/:id` | **KHỚP** | `PUT /api/employees/:id` | Sửa thông tin nhân viên. |
| 31 | `DELETE /api/employees/:id` | **KHỚP** | `DELETE /api/employees/:id` | Xóa nhân viên. |
| 32 | `POST /api/employees/:id/toggle-lock`| **LỆCH** | `PUT /api/employees/:ma_nv/status`| Doc ghi `POST /:id/toggle-lock`, code là `PUT /:ma_nv/status`. |
| 33 | `POST /api/employees/batch-require-password-change`| **LỆCH PATH** | `POST /api/employees/staged-force-password`| Khác tên endpoint. |
| 34 | `POST /api/employees/request-device-change`| **KHỚP** | `POST /api/employees/request-device-change`| Worker yêu cầu đổi thiết bị. |
| 35 | `GET /api/employees/pending-device-requests`| **LỆCH PATH** | `GET /api/employees/pending-device-changes`| Doc ghi `requests`, code ghi `changes`. |
| 36 | `POST /api/employees/approve-device-change`| **LỆCH PARAM** | `PUT/POST /api/employees/:ma_nv/approve-device-change`| Code yêu cầu `:ma_nv` trên URL path. |
| 37 | `POST /api/employees/reject-device-change`| **LỆCH PARAM** | `PUT/POST /api/employees/:ma_nv/reject-device-change` | Code yêu cầu `:ma_nv` trên URL path. |
| **Nhóm 6** | **Phân Quyền Kế Toán** | | | |
| 38 | `GET /api/employees/:id/permissions`| **LỆCH ROUTE**| `GET /api/settings/accountant-permissions`| Di chuyển từ `employees` sang `settings`. |
| 39 | `PUT /api/employees/:id/permissions`| **LỆCH ROUTE**| `PUT /api/settings/accountant-permissions`| Di chuyển từ `employees` sang `settings`. |
| **Nhóm 7** | **Cấu Hình Nhà Xưởng & GPS** | | | |
| 40 | `GET /api/company/settings` | **LỆCH PATH** | `GET /api/company` | Code lắng nghe tại root `GET /api/company`. |
| 41 | `PUT /api/company/settings` | **LỆCH PATH** | `PUT /api/company` | Code lắng nghe tại root `PUT /api/company`. |
| **Nhóm 8** | **Lịch Nghỉ Lễ** | | | |
| 42 | `GET /api/holidays` | **KHỚP** | `GET /api/holidays` | Danh sách ngày nghỉ lễ. |
| 43 | `POST /api/holidays` | **KHỚP** | `POST /api/holidays` | Thêm ngày nghỉ lễ. |
| 44 | `DELETE /api/holidays/:id` | **KHỚP** | `DELETE /api/holidays/:id` | Xóa ngày nghỉ lễ. |
| **Nhóm 9** | **Cài Đặt Mức Phạt** | | | |
| 45 | `GET /api/settings/penalties` | **KHỚP** | `GET /api/settings/penalties` | Lấy cấu hình phạt đi muộn. |
| 46 | `PUT /api/settings/penalties` | **KHỚP** | `PUT /api/settings/penalties` | Cập nhật cấu hình phạt. |
| **Nhóm 10**| **Thiết Bị Kiosk Chuyên Dụng** | | | |
| 47 | `POST /api/kiosk/register` | **KHỚP** | `POST /api/kiosk/register` | Đăng ký Kiosk mới nhận API key. |
| 48 | `GET /api/kiosk/list` | **KHỚP** | `GET /api/kiosk/list` | Danh sách Kiosk. |
| 49 | `POST /api/kiosk/revoke/:id` | **LỆCH METHOD**| `PUT /api/kiosk/:id/revoke` | Doc ghi `POST`, code dùng `PUT`. |
| 50 | `GET /api/kiosk/qr` | **KHỚP** | `GET /api/kiosk/qr` | Kiosk lấy mã Dynamic QR v2 (`x-kiosk-key`). |
| 51 | `POST /api/kiosk/rotate-key/:id` | **LỆCH PARAM** | `POST /api/kiosk/:id/rotate-key` | Khác vị trí param `:id`. |
| **Nhóm 11**| **Màn Hình Chẩn Đoán Kỹ Thuật** | | | |
| 52 | `GET /api/diagnostics/system-status`| **KHỚP** | `GET /api/diagnostics/system-status`| (Kèm alias `/api/diagnostics/status`). |
| 53 | `POST /api/diagnostics/verify-zalo-user`| **KHỚP** | `POST /api/diagnostics/verify-zalo-user` | Xác minh token người dùng Zalo. |
| 54 | `POST /api/diagnostics/decode-location` | **KHỚP** | `POST /api/diagnostics/decode-location`  | Thẩm tra giải mã vị trí Zalo. |

---

### 4.2 Danh Sách 10 Endpoints Viết Thêm Ngoài Đặc Tả 54
1. `GET /api/attendance/logs/:id/image` - Lấy chuỗi ảnh snapshot Base64 chi tiết của một lượt chấm công nghi vấn.
2. `POST /api/requests/ot-pre-register` - Công nhân đăng ký làm thêm giờ duyệt trước (Pre-Approval OT).
3. `GET /api/requests/ot-registrations` - Quản lý xem danh sách đăng ký OT.
4. `PUT /api/requests/ot-registrations/:id` - Duyệt/từ chối đăng ký làm thêm giờ.
5. `POST /api/employees/bind-zalo` - Liên kết tài khoản Zalo Mini App.
6. `PUT /api/employees/:ma_nv/device-binding-mode` - Cài đặt chế độ khóa thiết bị (`recording` hoặc `enforced`).
7. `GET /api/kiosk/qr-status` - Kiosk polling trạng thái mã QR (phương án đổi mã ngay khi có người quét).
8. `GET /api/settings/audit-logs` - Quản trị viên truy vấn nhật ký kiểm toán hệ thống.
9. `GET /api/diagnostics/recent-logs` - Tóm tắt lỗi hệ thống theo Route và Role trong 1-24 giờ gần nhất.
10. `POST /api/client-errors` - Tiếp nhận sự kiện lỗi từ client (window.onerror, axios rejection).

---

## 5. BẢN ĐỒ GIAO DIỆN & COMPONENT (FRONTEND AUDIT)

### 5.1 Các Màn Hình & Trạng Thái Giao Diện
Toàn bộ frontend hiện tại được gói gọn trong **DUY NHẤT một file monolithic**: `zalo-miniapp-frontend/src/pages/index.jsx` (239 KB / 4.497 dòng).  
File này chia làm 2 chế độ hiển thị dựa trên kích thước màn hình và vai trò:

#### A. Giao Diện Web PC (Dành cho Admin & Accountant - `isDesktop = true`):
- **Header & Sidebar**: Sử dụng `DesktopHeader.jsx` và `DesktopSidebar.jsx`.
- **Tab Ma Trận Chấm Công (`matrix`)**: Render component `AttendanceMatrixTable.jsx`.
- **Tab Quản Lý Lương (`payroll`)**: Render component `PayrollGridTable.jsx`.
- **Tab Duyệt Đơn Từ (`requests`)**: Giao diện bảng danh sách đơn pending, nút duyệt/từ chối (viết inline).
- **Tab Hồ Sơ Nhân Sự (`management`)**: Bảng nhân viên, modal thêm/sửa nhân viên (viết inline).
- **Tab Vị Trí Trụ Sở & Bán Kính GPS (`company`)**: Bản đồ/tọa độ công ty, chỉnh sửa bán kính (viết inline).
- **Tab Quản Lý Ngày Nghỉ Lễ (`holidays`)**: Danh sách ngày lễ, form thêm/xóa ngày lễ (viết inline).
- **Tab Nhật Ký Kiểm Toán (`audit_logs`)**: Bảng audit log (viết inline).
- **Tab Phân Quyền Kế Toán (`permissions`)**: Render `AccountantPermissionView.jsx`.
- **Tab Duyệt Thiết Bị (`devices`)**: Render `AdminDeviceApproval.jsx`.
- **Tab Kiosk Điểm Danh (`kiosk`)**: Render `KioskDisplayView.jsx`.
- **Tab Tự Chẩn Đoán (`diagnostics`)**: Render `DiagnosticsView.jsx`.

#### B. Giao Diện Zalo Mini App Di Động (Dành cho Worker - `isDesktop = false`):
- **Tab Chấm Công (`checkin`)**: Render `OneTouchCheckIn.jsx` (hoặc `EmployeeCheckinPC.jsx`).
- **Tab Lịch Sử Công Cá Nhân (`history`)**: Danh sách chấm công cá nhân theo tháng (viết inline).
- **Tab Đơn Nghỉ Phép / OT (`requests`)**: Danh sách đơn cá nhân, modal nộp đơn `SmartLeaveRequestModal.jsx`.
- **Tab Phiếu Lương Cá Nhân (`payroll` -> `profile`)**: Render `SalarySlipModal.jsx`.
- **Tab Thông Tin Cá Nhân & Đổi Thiết Bị (`profile`)**: Đổi mật khẩu, xem thông tin thiết bị (viết inline).

---

### 5.2 Danh Sách Shared UI Components
| Component | Kích Thước | Trạng Thái Sử Dụng | Mục Đích |
| :--- | :---: | :---: | :--- |
| `AttendanceMatrixTable.jsx` | 26 KB | Đang dùng | Bảng ma trận công 31 ngày toàn xưởng |
| `PayrollGridTable.jsx` | 19 KB | Đang dùng | Bảng lương tổng hợp, KPI và xuất file CSV |
| `OneTouchCheckIn.jsx` | 21 KB | Đang dùng | Giao diện chấm công 1 chạm trên di động |
| `DiagnosticsView.jsx` | 18 KB | Đang dùng | Màn hình chẩn đoán server, Zalo SDK và CSDL |
| `SalarySlipModal.jsx` | 12 KB | Đang dùng | Modal phiếu lương điện tử và nút in |
| `SmartLeaveRequestModal.jsx`| 12 KB | Đang dùng | Modal nộp đơn xin nghỉ thông minh |
| `EmployeeCheckinPC.jsx` | 12 KB | Đang dùng | Giao diện chấm công giả lập trên PC |
| `AccountantPermissionView.jsx`| 11 KB | Đang dùng | Giao diện bật/tắt quyền động cho kế toán |
| `PeriodLockModal.jsx` | 11 KB | Đang dùng trong Matrix | Modal chốt khóa sổ kỳ công tháng |
| `KioskDisplayView.jsx` | 10 KB | Đang dùng | Màn hình hiển thị mã QR động Kiosk |
| `DesktopSidebar.jsx` | 7.8 KB | Đang dùng | Thanh điều hướng bên trái cho Web PC |
| `AdminDeviceApproval.jsx` | 6.0 KB | Đang dùng | Duyệt danh sách đổi thiết bị nhân viên |
| `ForcePasswordChangeModal.jsx`| 5.5 KB | Đang dùng | Modal bắt buộc đổi mật khẩu lần đầu |
| `DesktopHeader.jsx` | 4.4 KB | Đang dùng | Thanh tiêu đề trên của Web PC |
| `CompanyLogo.jsx` | 2.3 KB | Đang dùng | Component hiển thị Logo công ty |
| `logo.jsx` | 9.8 KB | Đang dùng | Component chứa SVG logo Sedinco lớn |
| `layout.jsx` | 5.7 KB | Đang dùng | Bộ bọc ErrorBoundary & SmartRouter |
| `DeviceChangeModal.jsx` | 6.5 KB | **KHÔNG DÙNG (DEAD)** | Modal gửi yêu cầu đổi thiết bị |
| `LinkAccountView.jsx` | 9.6 KB | **KHÔNG DÙNG (DEAD)** | Màn hình liên kết tài khoản Zalo |
| `clock.jsx` | 0.7 KB | **KHÔNG DÙNG (DEAD)** | Đồng hồ hiển thị thời gian thực |

---

### 5.3 Các Đoạn Code UI Đang Bị Copy-Paste Trùng Lặp Giữa Các Trang
1. **Trùng lặp cấu trúc hiển thị giữa Desktop và Mobile**:
   Trong `pages/index.jsx`, logic hiển thị của các tab `management`, `requests`, `profile`, `company` bị viết 2 lần: một lần trong cây DOM Desktop (dòng 1578 - 2657) và một lần trong cây DOM Mobile (dòng 3401 - 4434). Cả hai khối này dùng chung hầu hết logic fetch, state quản lý form, nhưng lại copy-paste JSX riêng rẽ.
2. **Trùng lặp Hardcode Phụ Cấp**:
   Cả `PayrollGridTable.jsx` (hàm xuất CSV) và `SalarySlipModal.jsx` (hiển thị phiếu lương) đều copy-paste nguyên văn cụm số phụ cấp hardcode:
   ```javascript
   const allowanceLunch = 730000;
   const allowanceFuel = 500000;
   const allowanceHousing = 1000000;
   const allowanceBonus = 1500000;
   const allowanceResponsibility = totalAllowance > 3730000 ? totalAllowance - 3730000 : 0;
   ```
3. **Trùng lặp Logo**:
   Có 4 cách biểu diễn logo trong dự án: `static/sedinco-logo.png` (291KB), `public/sedinco-logo.png` (291KB), `CompanyLogo.jsx` và `logo.jsx` (chứa chuỗi SVG thô 9.8KB).
4. **Trùng lặp Logic Chấm Công**:
   Logic xử lý chấm công và chụp ảnh webcam/camera xuất hiện ở 3 nơi: `OneTouchCheckIn.jsx`, `EmployeeCheckinPC.jsx`, và một đoạn xử lý inline trong `index.jsx`.

---

## 6. BÁO CÁO CÁC LỖI LOGIC & MÃ RÁC PHÁT HIỆN ĐƯỢC (BUGS & DEAD CODE)

### 6.1 Danh Sách Tệp Chết (Dead Code / Unreferenced Files)
Qua quét tham chiếu chéo toàn diện, các file sau hoàn toàn không được import ở bất kỳ đâu trong dự án:
1. `zalo-miniapp-frontend/src/components/clock.jsx`: Đồng hồ hiển thị thời gian, 0 lượt import.
2. `zalo-miniapp-frontend/src/components/DeviceChangeModal.jsx`: Modal gửi yêu cầu đổi máy của worker, 0 lượt import (chức năng này đang được viết dở hoặc inline trong `index.jsx`).
3. `zalo-miniapp-frontend/src/components/LinkAccountView.jsx`: Màn hình liên kết tài khoản Zalo, 0 lượt import.
4. `sedinco_backend/src/database/sedinco_hr.sql`: Tệp dump CSDL nặng 1.4 MB, trùng lặp hoàn toàn với `sedinco_hr.sql` tại thư mục gốc.
5. Thư mục `reports/screenshots/` (4.7 MB) và hàng loạt ảnh PNG trong `reports/screens/` (15 MB): Ảnh chụp từ các lần kiểm thử cũ từ tháng 10/2026 không còn giá trị hồi quy.

---

### 6.2 Các Vị Trí Tính Toán Sai / Lệch Chuẩn Nghiệp Vụ
1. **Lương Thử Việc (85%) Bị Trừ Oan Vào Khoản Phụ Cấp**:
   - Vị trí: `sedinco_backend/src/utils/payrollCalculator.js` (dòng 86-88).
   - Mã nguồn hiện tại:
     ```javascript
     const effectiveDays = (congThuViec * 0.85) + congChinhThuc;
     const salaryByWork = (luongCb / congChuan) * effectiveDays;
     const allowanceByWork = (tongPhuCapCoDinh / congChuan) * effectiveDays;
     ```
   - **Vấn đề**: `allowanceByWork` (phụ cấp ăn trưa, xăng xe...) bị nhân với `effectiveDays` (đã giảm 15% của ngày thử việc). Theo quy chuẩn kế toán và luật lao động, các khoản phụ cấp đi lại/ăn trưa theo ngày công thực tế người lao động có mặt làm việc, không được khấu trừ 15% như lương cơ bản.
2. **Nhân Viên 0 Ngày Công Bị Lương Thực Lĩnh Âm**:
   - Vị trí: `sedinco_backend/src/utils/payrollCalculator.js` (dòng 89-101).
   - Mã nguồn hiện tại:
     ```javascript
     let baoHiem = (has_insurance !== false && has_insurance !== 0) ? (luongCb * 0.105) : 0;
     netSalary = Math.round(salaryByWork + allowanceByWork + tienOt - baoHiem);
     ```
   - **Vấn đề**: Khi nhân viên nghỉ không lương cả tháng (`totalWorkDays = 0`), `salaryByWork = 0`, `allowance = 0`, nhưng hệ thống vẫn trừ cố định `luongCb * 10.5%` $\rightarrow$ `netSalary` trả về số âm! Trong thực tế, tháng nghỉ không lương không phát sinh công thì không trích nộp BHXH qua bảng lương tháng đó hoặc phải xử lý theo quy định tạm hoãn đóng.
3. **Hardcode Phụ Cấp Khi Xuất CSV & In Phiếu Lương**:
   - Vị trí: `PayrollGridTable.jsx` (dòng 77-81) và `SalarySlipModal.jsx` (dòng 17-21).
   - **Vấn đề**: Backend API `/api/payroll` chỉ trả về tổng phụ cấp `totalAllowance`, không trả về chi tiết phụ cấp ăn trưa, xăng xe, nhà ở. Để có số liệu hiển thị, Frontend đã **tự ý gán cố định**: Ăn trưa: 730.000đ, Xăng xe: 500.000đ, Nhà ở: 1.000.000đ, Thưởng HTCV: 1.500.000đ. Nếu nhân viên không có phụ cấp xăng xe/nhà ở, phiếu lương và file CSV vẫn in các con số trên, dẫn đến sai lệch kế toán nghiêm trọng.

---

### 6.3 Đánh Giá Luồng Chấm Công Kỹ Thuật (GPS, Zalo Token, Base64)

#### A. Tọa Độ Geofence (Khoanh Vùng Trụ Sở):
- **Hiện trạng**: Toàn bộ hệ thống phụ thuộc vào 1 bản ghi duy nhất trong bảng `company_settings` (`latitude: 16.0544`, `longitude: 108.2022`, `radius_meters: 100`).
- **Hạn chế**: Bảng `branches` hoàn toàn không tồn tại trong CSDL. Hệ thống không thể hỗ trợ doanh nghiệp có nhiều xưởng, nhiều chi nhánh hoặc công trường phụ cận.

#### B. Xử Lý Token Zalo vs Raw GPS (Chống Hạ Cấp):
- **Hiện trạng**: Trong `attendanceService.js`, hệ thống đã có logic chống hạ cấp (nếu từng dùng Token Zalo mà chuyển sang Raw GPS thì gắn `is_low_trust = 2`).
- **Lỗ hổng vận hành**: Cờ môi trường `REJECT_DOWNGRADE_TO_RAW` hiện vẫn đang đặt mặc định là `false`. Điều này có nghĩa là công nhân dùng phần mềm Fake GPS vẫn có thể gửi tọa độ Raw và chấm công thành công (chỉ bị gắn cờ âm thầm vào bảng quản trị mà không bị chặn ngay tại thời điểm bấm nút).

#### C. Lưu Trữ Ảnh Base64 Trực Tiếp Trong MySQL:
- **Vị trí**: Cột `check_in_image` trong bảng `attendance_logs` (kiểu dữ liệu `LONGTEXT` hoặc `MEDIUMTEXT`).
- **Nguy cơ phình to CSDL (Storage Explosion)**:
  - Hàm `validateImageSnapshot` cho phép chuỗi Base64 tối đa 2MB. Một chuỗi Base64 2MB chiếm khoảng 2.7MB dung lượng bộ nhớ text.
  - Với quy mô xưởng 500 công nhân, 2 lượt chấm công/ngày $\times$ 26 ngày = 26.000 bản ghi/tháng.
  - Nếu chỉ 20% bản ghi có chụp ảnh: $5.200 \times 1.5\text{ MB} \approx \mathbf{7.8\text{ GB}}$ dữ liệu ảnh nhồi thẳng vào MySQL mỗi tháng!
  - CSDL MySQL trên Aiven (đặc biệt các gói Staging/Test dung lượng đĩa 5GB - 10GB) sẽ bị đầy ổ đĩa (Disk Full) chỉ sau vài tuần, gây crash toàn bộ hệ thống.
  - **Khuyến nghị kiến trúc**: Tách ảnh ra khỏi CSDL, chuyển sang lưu trữ trên Cloud Object Storage (Cloudflare R2 hoặc AWS S3) và chỉ lưu URL đường dẫn trong MySQL.

---

## 7. BẢNG TỔNG HỢP KIẾN NGHỊ TỐI ƯU HÓA (ACTIONABLE RECOMMENDATIONS)

| STT | Vấn Đề Phát Hiện | Mức Độ | Giải Pháp Kỹ Thuật Kiến Nghị |
| :---: | :--- | :---: | :--- |
| 1 | `node_modules` nhân bản 3 cấp (~428 MB) | **CAO** | Dọn dẹp `package.json` ở root; chỉ giữ lại công cụ test/script ở root; chuyển thành chuẩn npm workspaces hoặc tách biệt hoàn toàn frontend/backend. |
| 2 | Ảnh test E2E tích tụ trong `reports/` (~20 MB) | **TRUNG BÌNH**| Thêm thư mục `reports/screens/` và `reports/screenshots/` vào `.gitignore` để không đẩy lên git repository. |
| 3 | File `pages/index.jsx` monolithic (4.497 dòng) | **CAO** | Tách `index.jsx` thành các trang con riêng biệt: `pages/worker/`, `pages/accountant/`, `pages/admin/` và tách các form modal inline thành component độc lập. |
| 4 | Xóa các file chết (`clock.jsx`, `DeviceChangeModal.jsx`, `LinkAccountView.jsx`) | **THẤP** | Xóa bỏ các component không được tham chiếu để giải phóng dung lượng và tránh gây nhầm lẫn khi bảo trì. |
| 5 | Lệch pha 12 API giữa `DOCS/PROJECT.MD` và Code | **CAO** | Chuẩn hóa lại tài liệu API spec hoặc refactor lại endpoint router để đồng nhất 100% giữa đặc tả và mã nguồn. |
| 6 | Hardcode phụ cấp ở Frontend khi xuất CSV / In phiếu lương | **NGHIÊM TRỌNG**| Bổ sung Backend API `/api/payroll` trả về object chi tiết `allowances_breakdown`; Frontend đọc trực tiếp từ API thay vì gán số cứng. |
| 7 | Lưu ảnh Base64 trong MySQL | **NGHIÊM TRỌNG**| Kiến trúc lại tầng lưu trữ ảnh: Tích hợp Cloudflare R2 (tương thích S3, miễn phí egress) để lưu ảnh selfie, MySQL chỉ lưu URL string. |

---
*Báo cáo được khởi tạo tự động dựa trên mã nguồn thực tế tại commit `c348cec` nhánh `staging/g9`.*
