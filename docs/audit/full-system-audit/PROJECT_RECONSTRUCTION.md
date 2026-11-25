# SEDINCO HR — PROJECT RECONSTRUCTION (PHASE 1)

**Audit Scope:** Full Monorepo (`/Users/an/Desktop/anti gravity/sedinco-hr`) — Backend (`sedinco_backend/`), Frontend (`zalo-miniapp-frontend/`), Database (`mysql2/promise` against local MySQL `sedinco_hr_test` & TiDB Cloud `sedinco_hr`), Operational Scripts (`scripts/`), and External Integrations (Zalo Mini App SDK & Graph API, Cloudinary SDK v2, Casso Paykit, VietQR).  
**Git Baseline:** Branch `main` at commit `f648470` (clean working tree at audit start).

---

## 1. Kiến trúc tổng thể (System Architecture Summary)

SEDINCO HR là một Monorepo quản trị nhân sự, chấm công đa lớp và tính lương tối ưu cho **Zalo Mini App** (`zmp-sdk` + `zmp-ui` + React 18 + Tailwind CSS v3) kết hợp giao diện Web Responsive cho Quản trị viên và Kế toán:

- **Frontend (`zalo-miniapp-frontend/`):** React 18.3.1, Vite 5.2.13 + `zmp-vite-plugin`, `zmp-ui`, `zmp-sdk`, `axios` ^1.20.0, `lucide-react`, `jsqr`, `qrcode`, `xlsx`, Tailwind CSS 3.4.3. Note: `jotai` (^2.12.1) có mặt trong `package.json` và `zmp-cli.json` nhưng không được sử dụng trong `src/`; state dùng React Context (`ThemeContext`, `FontScaleContext`) + custom hooks (`useAuth`, `useDepartments`, `useNotifications`, `useAdaptiveViewport`, `useModalStack`). Build output mặc định ra `zalo-miniapp-frontend/www/` (được Backend serve fallback nếu tồn tại). Root `wrangler.jsonc` cấu hình deploy SPA static assets `./dist`.
- **Backend (`sedinco_backend/`):** Node.js CommonJS (`>=20.18.0 <=26.x`), Express v5 (`^5.2.1`), `mysql2` (`^3.24.5`), `bcryptjs` (`^3.0.3` chạy qua `worker_threads` pool), `busboy` (`^1.6.0`), `cloudinary` (`^2.11.0`), `cors` (`^2.8.6`), `dotenv` (`^18.0.5`).
- **Database Engine:** Raw parameterized SQL qua `mysql2/promise` (`src/config/db.js`). **Không sử dụng Prisma hay ORM nào.**
- **Thành phần KHÔNG tồn tại trong dự án (đã xác minh toàn repo):**
  - **Không có Prisma** (`schema.prisma` không tồn tại).
  - **Không có Redis** (`redis`/`ioredis` không có; chỉ có comment nâng cấp trong `authService.js:65`). Rate limiting và idempotency dùng bảng MySQL (`login_rate_limits`, `idempotency_keys`, `media_upload_events`) và RAM `Map` cục bộ.
  - **Không có Socket.IO / WebSocket** (cập nhật thời gian thực dựa trên HTTP request polling/refresh thủ công & khi mở Notification/Alerts panel).
  - **Không có Email / SMTP / Nodemailer** (`email` chỉ là cột metadata trong `employees`).
  - **Không có `sedinco_backend/scripts/`** (thư mục scripts nằm ở root monorepo `/scripts/`).

---

## 2. Cấu trúc thư mục & Chức năng từng phần

```text
sedinco-hr/
├── package.json                      # Root scripts (start, dev, backend, miniapp, deploy, build)
├── app-config.json / wrangler.jsonc  # ZMP config & Cloudflare Workers static config
├── .env.example / .env.staging.example
├── scripts/                          # CLI vận hành, migration, import & DB safety guard
│   ├── backup_db.sh
│   ├── create_initial_admin.js
│   ├── grant_staging_app_user.sql
│   ├── import_employees_csv.js
│   ├── import_holidays.js
│   ├── migrate_staging_schema.js
│   ├── update_company_gps.js
│   └── lib/dbSafetyGuard.js
├── sedinco_backend/                  # Core REST API Backend (Express v5 + mysql2)
│   ├── server.js                     # Entry wrapper -> src/server.js
│   ├── .env / .env.example / .env.test / .env.test.example
│   └── src/
│       ├── app.js                    # Express app, trust proxy, X-Request-Id, CORS, tiered JSON limits
│       ├── server.js                 # DB readiness check (Zero DDL on staging/prod) + 24h Cloudinary usage scheduler
│       ├── config/                   # env.js, db.js (pool connectTimeout=10000, withTransaction ACID, test guard)
│       ├── database/                 # initDb.js (16 core tables + migrations), mediaSchema.js (3 media tables)
│       ├── middlewares/              # authMiddleware.js, errorHandler.js, idempotencyMiddleware.js, validationMiddleware.js
│       ├── routes/ (14 files)        # index.js + auth, attendance, payroll, requests, employees, company, departments, holidays, settings, diagnostics, clientErrors, notifications, media
│       ├── controllers/ (12 files)   # Thin controller wrappers (trừ diagnosticsController & companyController có xử lý riêng)
│       ├── services/ (15 files)      # Nghiệp vụ lõi
│       └── utils/ (18 files)         # MISA engine, Payroll calculator, Crypto/JWT/QR, Validators, Zalo adapter
└── zalo-miniapp-frontend/            # React + Vite + ZMP UI Mini App & Web Admin
    ├── index.html / vite.config.js / tailwind.config.js / app-config.json / zmp-cli.json
    └── src/
        ├── app.js / pages/index.jsx
        ├── adapters/zmp/             # sdkAdapter.js, realSdkAdapter.js (bọc zmp-sdk/apis với Web fallback)
        ├── constants/roles.js        # ROLES, ROLE_PERMISSIONS, ACCOUNTANT_ENFORCED_PERMISSION_KEYS, ADMIN_SOD_EXCLUSIVE_ITEMS
        ├── context/                  # ThemeContext.jsx, FontScaleContext.jsx
        ├── hooks/                    # useAuth.js, useAdaptiveViewport.js, useDepartments.js, useLockBodyScroll.js, useNotifications.js
        ├── services/                 # attendance.service.js, zalo-auth.service.js, zalo-location.service.js, zalo-media.service.js, zalo-qr.service.js, zalo-sdk-core.js, authService.js
        ├── utils/                    # api.js, deviceIdentity.js, payslipHelpers.js, salaryExcelExport.js, time.js, uploadErrorMapper.js, vietQrUtils.js, vietnamBanks.js, zmpRuntimeGuard.js
        ├── views/                    # AuthView.jsx, worker/ (4 files), desktop/ (6 files)
        └── components/               # UniversalAppShell, Modals, Tables, NotificationCenter, ui/
```

---

## 3. Luồng dữ liệu chính (Core Data Flows)

1. **Authentication & Session:**
   - **Credential Login (`POST /api/login` / `POST /api/admin/login`):** `authService` chuẩn hóa IP, kiểm tra 3 lớp rate limit trong `login_rate_limits` (composite `account+ip`, `ip`, `account`), đối chiếu mật khẩu qua `bcryptWorkerPool`, kiểm tra khóa tài khoản, cấp HMAC-SHA256 JWT (`exp` 7 ngày, mang `token_version`). Nếu không phải `NODE_ENV=test`, `verifyUserStatusInDb` chạy ở **mỗi** request có token để kiểm tra `is_locked`, `role`, `token_version`.
   - **Zalo One-Touch Login & Identity (`POST /api/auth/zalo-auto-login`, `/api/auth/zalo/*`):** Frontend gọi `zmp-sdk` lấy `access_token` / `phone_token` -> Backend xác minh qua `https://graph.zalo.me/v2.0/me` & `/me/info` (`zaloAdapter.js`).
2. **Smart Attendance (GPS / Wi-Fi / Dynamic QR / Field Work -> MISA Engine):**
   - `POST /api/attendance/precheck` kiểm tra GPS geofence (`calculateDistanceMeters`) / Office IP whitelist / chính sách chi nhánh (`GPS`, `GPS_AND_QR`, `QR_ONLY`) / trạng thái khóa kỳ công trước khi chụp ảnh.
   - `POST /api/attendance/check-in` thực thi trong `withTransaction` (`FOR UPDATE` trên `employees` & `attendance_logs`): xác minh `zalo_location_token` (`120s` max age), `client_nonce` & `qr_token` HMAC-SHA256 (`SEDQR1`, replay check qua `idempotency_keys`), phát hiện giả lập GPS/teleport (`>20km / 10p`)/dùng chung thiết bị (`audit_logs`), upload ảnh snapshot qua `cloudinaryService`, tính công MISA (`misaWorkdayEngine.js`: sáng `>=120p = 0.5`, chiều `>=120p = 0.5`, `<15p` từ chối công, ca đêm bắc cầu), ràng buộc `media_assets`, ghi `attendance_logs` & `audit_logs`.
3. **Requests, Leave Quota & Period Lock:**
   - Worker tạo đơn (`leave`, `kp`, `ct`, `ot`, `business_trip`, `salary_advance`) hoặc đăng ký tăng ca trước (`ot_registrations`) qua `POST /api/requests*`.
   - `requestService` kiểm tra Period Lock, trùng ngày, hạn mức phép có lương hàng tháng (`monthly_paid_leave_limit`), tách biệt nhiệm vụ SoD (không tự duyệt đơn của mình), khi duyệt tự đồng bộ sang `attendance_logs` / `attendance`.
   - `POST /api/attendance/lock-period` khóa kỳ công, kích hoạt tính lương/đồng bộ bảng lương & phát thông báo `user_notifications` tới nhân viên.
4. **Payroll Engine & Payout Lifecycle:**
   - `payrollCalculator.js` tính công chuẩn (`tổng ngày tháng - Chủ nhật`), công thử việc (`probationRatio` trước `ngay_chinh_thuc`), phụ cấp, thưởng/phạt đi muộn (4 policy: `NONE`, `PER_MINUTE`, `PER_OCCURRENCE`, `DEDUCT_WORKDAY`), OT theo đăng ký/chế độ, lễ (`salary_multiplier` từng ngày lễ), BHXH (`insurance_rate`), tạm ứng, và sinh mảng `daily_breakdown` khớp tròn từng đồng với Net Pay.
   - Chu trình đối soát lương: `DRAFT/PENDING` -> Admin `POST /api/payroll/send-report` -> Worker `CONFIRMED` hoặc `DISPUTED` (kèm minh chứng media) -> Admin/Accountant `resolve-dispute` hoặc tự động giải quyết khi tính lại lương -> Chi trả qua VietQR offline (`BankTransferModal`) & xác nhận `PAID` -> Worker xác nhận `RECEIVED`.
5. **Centralized Media Lifecycle (Cloudinary):**
   - Upload `POST /api/media/upload` (Busboy multipart hoặc JSON Data URL fallback) qua pipeline 10 bước: kiểm tra trạng thái user, RBAC danh mục (`mediaFolderPolicy.js` — 13 categories), chặn override tham số client, DB rate limit & concurrency slot (`media_upload_events`), magic bytes & chặn thực thi/XSS (`mediaValidator.js`), kiểm tra quota (`media_usage_snapshots` — 70%/85%/95%/100%), dedup SHA-256, upload Cloudinary (`authenticated` cho chứng từ nhạy cảm, `upload` cho avatar/logo) hoặc compact fallback inline DB `<=155KB`, lưu `media_assets`.
   - Truy cập media riêng tư đi qua `GET /api/media/:assetUuid/access` kiểm tra quyền sở hữu/RBAC rồi cấp URL có chữ ký 300s hoặc stream binary qua backend.

---

## 4. Database Schema Map (19 Bảng Thực Tế Đã Xác Minh)

> **Cảnh báo kiến trúc quan trọng:** Toàn bộ **19 bảng** trên cả MySQL Test (`sedinco_hr_test`) và TiDB Cloud Staging (`sedinco_hr`) **KHÔNG CÓ BẤT KỲ `FOREIGN KEY` NÀO (`0` FK constraints)**. Toàn vẹn tham chiếu hoàn toàn phụ thuộc code ứng dụng.

| # | Bảng | Nhóm | Khóa chính & Unique chính | Vai trò & Mối quan hệ logic |
|---|---|---|---|---|
| 1 | `employees` | Core HR | PK `ma_nv`; Unique `phone`, `login_username` | Hồ sơ nhân sự, lương, phụ cấp (`custom_allowances`), Zalo ID, thiết bị, ngân hàng, role (`worker`/`accountant`/`admin`) |
| 2 | `admins` | Core Auth | PK `id`; Unique `username`, `phone`, `login_username` | Tài khoản quản trị viên tối cao |
| 3 | `company_settings` | Config | PK `id` (singleton qua `LIMIT 1`) | Giờ làm, tọa độ GPS mặc định + JSON `allowed_locations`, Wi-Fi IP whitelist, luật phạt, OT, BHXH, phép, thông báo chung |
| 4 | `departments` | Org | PK `id`; Unique `name` | Danh mục phòng ban/khối (`is_default` chống xóa) |
| 5 | `attendance` | Payroll/Month | PK `id`; Unique `(ma_nv, thang, nam)` | Tổng hợp tháng, điều chỉnh thưởng/phạt/ứng, trạng thái xác nhận/khiếu nại/thanh toán lương |
| 6 | `attendance_logs` | Attendance | PK `id`; Unique `(employee_id, record_date)` | Nhật ký chấm công từng ngày (giờ vào/ra, công MISA, OT, vị trí, fraud flags) |
| 7 | `requests` | Workflow | PK `id` | Đơn từ (nghỉ phép, không phép, bổ sung công, công tác, OT, tạm ứng) |
| 8 | `ot_registrations` | Workflow | PK `id`; Unique `(employee_id, work_date)` | Đăng ký tăng ca trước giờ làm |
| 9 | `public_holidays` | Config | PK `id` | Ngày nghỉ lễ & `salary_multiplier` linh hoạt (`x1.5`, `x2`, `x3`, tùy chỉnh) |
| 10 | `period_locks` | Control | PK `id`; Unique `(month, year)` | Khóa/mở khóa kỳ chấm công-bảng lương theo tháng |
| 11 | `payroll_periods` | Control | PK `id`; Unique `(month, year)` | Trạng thái phê duyệt/thanh toán cấp kỳ lương |
| 12 | `accountant_permissions` | RBAC | PK `permission_key` (30 keys seeded) | Bật/tắt quyền động cho vai trò `accountant` |
| 13 | `audit_logs` | Security | PK `id` | Nhật ký kiểm toán hành động (append-only trên staging app user; hỗ trợ ghim `is_pinned`) |
| 14 | `user_notifications` | Inbox | PK `id`; Unique `(recipient_ma_nv, alert_key)` | Hộp thư thông báo cá nhân & cảnh báo điều hành (dạng poll/sync) |
| 15 | `login_rate_limits` | Security | PK `key_name` | Bộ đếm brute-force theo composite/IP/tài khoản |
| 16 | `idempotency_keys` | Reliability | PK `key_hash` | Chống gửi trùng API (`__IN_FLIGHT__` & replay 24h) + chống replay nonce/QR/location/phone token |
| 17 | `media_assets` | Media | PK `id`; Unique `asset_uuid`, `public_id` | Kho quản lý media Cloudinary tập trung, lifecycle (`orphan_candidate`, `deleted_at`) |
| 18 | `media_upload_events` | Media Sec | PK `id` | Nhật ký upload, slot đồng thời & quota/rate-limit chống spam upload |
| 19 | `media_usage_snapshots` | Media Ops | PK `id` | Cache snapshot dung lượng/credits Cloudinary API + cảnh báo 70/85/95/100% |

---

## 5. RBAC Architecture (Backend + Frontend)

- **3 Vai trò chuẩn (`ROLES`):** `worker`, `accountant`, `admin` (chuẩn hóa `'employee' -> 'worker'` ở middleware & frontend).
- **Quy tắc bất biến (SoD — Separation of Duties):**
  - Dù bật quyền động, `accountant` **tuyệt đối không thể** thực hiện nhóm đặc quyền Admin (`ADMIN_SOD_EXCLUSIVE_ITEMS`): sửa cấu hình công ty/GPS/phòng ban/ngày lễ, mở khóa kỳ công (`unlock-period`), thay đổi phân quyền/khóa tài khoản/chỉnh vai trò, xem audit log/quản lý media admin, phê duyệt đổi thiết bị/reset mật khẩu hàng loạt, hay gửi báo cáo lương hàng loạt.
  - Không ai được **tự duyệt đơn**, **tự chấm/sửa công cho chính mình** (ngoài check-in 1 chạm), hoặc **tự giải quyết khiếu nại lương của chính mình** (kể cả Admin/Accountant có mã nhân viên).
- **Điểm bất đồng bộ RBAC phát hiện khi đọc code (sẽ kiểm chứng chi tiết ở Phase 2–6):**
  1. `PayrollGridTable.jsx:53-55` + `roles.js:161-171`: `canLockPeriod` luôn trả về `false` cho `accountant` ở Frontend ngay cả khi Admin đã bật `attendance_lock` ở Backend!
  2. `authMiddleware.js:166-183` fallback DB lỗi chỉ khai báo 16/30 permission keys (trong khi `initDb.js` seed 30 keys), và `verifyUserStatusInDb` so sánh `dbCheck.role !== user.role` không normalize `'employee' -> 'worker'`.
  3. `DesktopDashboard.jsx:99-118` gọi `GET /settings/accountant-permissions` cho accountant; mặc dù route hiện cho phép `['admin', 'accountant']`, đây là sự phụ thuộc dễ gãy nếu siết `/settings/*`.
  4. `employeeRoutes.js:30-31` có `GET/PUT /employees/:id/permissions` bỏ qua hoàn toàn `:id` và chỉnh quyền chung cho cả role Accountant.

---

## 6. Môi trường, Cấu hình Hạ tầng & Dị biệt Phát hiện (Phase 0 + Phase 1)

| Hạng mục | Cấu hình hiện tại trong Workspace / Repo | Đánh giá rủi ro & Ghi chú Audit |
|---|---|---|
| `sedinco_backend/.env` | `NODE_ENV="staging"`, `DB_HOST=gateway01.ap-southeast-1.prod.aws.tidbcloud.com`, `DB_NAME=sedinco_hr`, `ENABLE_DIAGNOSTICS="true"`, `ENABLE_CLIENT_ERROR_REPORTING="true"`, `LOCATION_MODE="both"`, `REJECT_DOWNGRADE_TO_RAW="false"` | Không có biến `CLOUDINARY_*` trong `.env` local (hiện upload sẽ rơi về compact inline fallback <=155KB nếu thiếu env trên server). `ENABLE_DIAGNOSTICS="true"` trên staging có chủ đích nhưng bị chặn cứng khi `NODE_ENV=production`. |
| `sedinco_backend/.env.test` | `NODE_ENV="test"`, `DB_HOST="127.0.0.1"`, `DB_NAME="sedinco_hr_test"`, `DB_SSL="false"` | An toàn tuyệt đối với Production TiDB nhờ guard trong `db.js`. |
| `zalo-miniapp-frontend/.env` | `VITE_API_URL="https://sedinco-backend.onrender.com/api"` | Frontend mặc định trỏ Render Production API; staging build dùng `.env.staging` (`sedinco-backend-staging.onrender.com`). |
| `src/server.js` `REQUIRED_TABLES` | Chỉ kiểm tra 14/19 bảng khi khởi động `staging`/`production` | Thiếu 5 bảng mới: `payroll_periods`, `user_notifications`, `media_assets`, `media_upload_events`, `media_usage_snapshots`. |
| `scripts/grant_staging_app_user.sql` | Chỉ cấp quyền DML cho 14 bảng | Thiếu 5 bảng mới; đồng thời `audit_logs` chỉ cho `SELECT, INSERT` nhưng `permissionService.getAuditLogs` chạy `DELETE` nền (fail thầm lặng). |

---

## 7. Danh sách Defect/Legacy Sơ Bộ Phát Hiện Từ Việc Đọc Toàn Bộ Mã Nguồn

*(Sẽ được tái hiện có bằng chứng trong Phase 3–6 trước khi sửa ở Phase 7)*

1. **[CRITICAL - Functional Crash]** `employeeService.deleteEmployee` (`sedinco_backend/src/services/employeeService.js:777-794`) tham chiếu biến chưa khai báo `avatar_url`, `sanitizedNextAvatar`, `previousAvatarUrl` -> ném `ReferenceError` sau khi đã `DELETE FROM employees`.
2. **[CRITICAL - Correctness / Timezone]** `payrollCalculator.js:119-120, 194-195, 249-250, 443-444` gọi `.setHours(0, 0, 0, 0)` (theo timezone máy chủ) trên ngày `+07:00` / `DATE`, làm lệch -1 ngày khi chạy trên server UTC (ví dụ Render).
3. **[HIGH - Security / DoS]** `authService.js:300-319`: `_checkLoginRateLimits` kiểm tra `ACCOUNT_GLOBAL_MAX_ATTEMPTS = 30` (`globalAcctCheck.blocked`) nhưng chỉ `setTimeout` tối đa 2 giây chứ **không trả HTTP 429 chặn brute-force phân tán**.
4. **[HIGH - Security / Fail-Open]** `authMiddleware.js:74-76, 210-233`: `verifyUserStatusInDb` khi gặp lỗi DB trả `null`, làm `authenticateToken` bỏ qua kiểm tra khóa/thu hồi token/đổi role (fail-open). Đồng thời `userStatusCache` Map không bao giờ được đọc hoặc giới hạn kích thước (rò rỉ RAM chậm).
5. **[HIGH - Data Leakage / Dedup]** `cloudinaryService.js:383-427`: Deduplication file chỉ lọc `(checksum, uploaded_by, upload_category)` mà không lọc `employee_id` và không giới hạn 24h như comment; Admin upload trùng file cho NV B có thể trả về bản ghi gắn với NV A.
6. **[HIGH - HTTP Semantics / CSRF]** `GET /api/payroll/calculate` cho phép kích hoạt ghi DB (`autoResolveSalaryDisputes`) qua HTTP `GET`.
7. **[HIGH - RBAC Frontend]** `PayrollGridTable.jsx:53-55` khiến Kế toán không bao giờ thấy/dùng được nút Khóa kỳ công (`canLockPeriod` luôn `false`).
8. **[MEDIUM - Security / Low-Trust Fallback]** `attendanceService.js:1373-1377`: Khi `zalo_location_token` gửi lên nhưng verify thất bại, hệ thống fallback sang GPS `raw` thay vì từ chối token giả mạo.
9. **[MEDIUM - Timezone Month Rollback]** `attendanceService.js:1618 vs 1733`: Ca đêm (`NIGHT_SHIFT`) lùi `targetRecordDate` sang ngày hôm trước *sau* khi đã lấy `currentMonth`/`currentYear` để check period lock và giới hạn miễn phạt đi muộn.
10. **[MEDIUM - Frontend UI Bugs]** `MediaStorageManagementTab.jsx:561,591,602` truyền sai prop (`danger` thay vì `variant="danger"`, `maxWidth` thay vì `maxWidthClass`); `WorkerDashboard.jsx:258` fallback `short_date` vào input `date`; `WorkerProfileTab.jsx:409-432` hiển thị `currentUser` cũ thay vì `profileUser`; `DesktopSidebar.jsx` thiếu tab `profile` trong mobile bottom nav của Kế toán.
11. **[LOW - Dead Code & Redundant Routes]** `validateImageSnapshot` (`attendanceService.js`), `isWithinGeofence` (`geoHelper.js`), `loginWithCredentials`/`confirmLinkAccount`/`sedinco_auth_session` (`authService.js`), `getResourceInfo` (`cloudinaryService.js`), unused exports (`passwordHelper.js`, `zaloAdapter.js`, `zalo-qr.service.js`, `payslipHelpers.js`), `jotai` dependency thừa, CSS Tailwind biên dịch trùng 2 lần (`tailwind.scss` + `app.scss`), và hàng loạt alias route trùng lặp (`/settings` vs `/permissions`, 3 mount `/departments`, 4 biến thể approve/reject device).
