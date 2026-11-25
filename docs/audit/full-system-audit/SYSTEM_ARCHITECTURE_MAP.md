# SEDINCO HR — SYSTEM ARCHITECTURE MAP (PHASE 1)

Tài liệu này mô tả bản đồ kiến trúc hệ thống thực tế dựa trên mã nguồn hiện hữu (`main` @ `f648470`), bao gồm toàn bộ các thành phần đang chạy và ghi rõ những thành phần không sử dụng.

> **Xác nhận hạ tầng không tồn tại trong kiến trúc hiện tại:**  
> - **Redis:** Không có (Rate limit & Idempotency lưu trên MySQL/TiDB + Map RAM nội bộ tiến trình).  
> - **Socket.IO / WebSocket:** Không có (Thông báo & cảnh báo dùng HTTP GET đồng bộ khi mở app/tab).  
> - **Email / SMTP:** Không có.  
> - **Prisma / ORM:** Không có (Truy vấn SQL thuần tham số hóa qua `mysql2/promise`).

---

## 1. Sơ đồ kiến trúc tổng quan (Component & Integration Flow)

```mermaid
flowchart TB
    subgraph Clients["Frontend Clients (zalo-miniapp-frontend — React 18 + Vite + ZMP UI)"]
        WorkerUI["Worker Role\n(1-Touch Check-in, History Heatmap,\nRequests, Profile & Payslip)"]
        AccountantUI["Accountant Role\n(Dynamic RBAC 16+ permissions:\nMatrix, Requests, Payroll, HR, Profile)"]
        AdminUI["Admin Role\n(Full HR, Matrix, Requests, Payroll,\nCompany/GPS, Permissions, Holidays, Media)"]
        ZmpBridge["ZMP SDK Adapter Bridge\n(adapters/zmp/sdkAdapter.js -> Web Fallback)"]
        OfflineQR["VietQR Generator & Scanner\n(qrcode + jsqr + api.vietqr.io assets)"]
    end

    subgraph ExternalZalo["Zalo Platform"]
        ZaloRuntime["Zalo App Client Runtime\n(getAccessToken, getPhoneNumber,\ngetLocation, openMediaPicker, scanQRCode,\nopenShareSheet, openOutApp)"]
        ZaloGraph["Zalo Graph API\nhttps://graph.zalo.me/v2.0/me & /me/info"]
    end

    subgraph Backend["Core REST API (sedinco_backend — Node.js + Express v5)"]
        ExpressGate["Express App Gateway (app.js)\nTrust Proxy | X-Request-Id | CORS Allowlist\nTiered Body Limits (100kb / 512kb / 3mb / 7mb)"]
        Middlewares["Middlewares\nauthMiddleware (JWT HS256 + DB Status Check)\nidempotencyMiddleware (POST/PUT/PATCH/DELETE)\nvalidationMiddleware | errorHandler"]
        Controllers["14 Route Modules -> 12 Controllers\n(auth, attendance, payroll, requests, employees,\ncompany, departments, holidays, settings,\nnotifications, media, diagnostics, clientErrors)"]
        Services["15 Domain Services & Engines\n(MISA Workday Engine, Payroll Calculator,\nBcrypt Worker Pool, Rate Limiter, Media Pipeline)"]
        BgScheduler["In-Process 24h Timer\n(cloudinaryUsageMonitor — skipped in NODE_ENV=test)"]
    end

    subgraph DataLayer["Persistence Layer (mysql2/promise — NO ORM, NO FK Constraints)"]
        MySQL[("MySQL 8 / TiDB Cloud (19 Tables)\nCore: employees, admins, company_settings,\ndepartments, public_holidays\nAttendance & Payroll: attendance_logs, attendance,\nrequests, ot_registrations, period_locks, payroll_periods\nSecurity & Ops: accountant_permissions, audit_logs,\nuser_notifications, login_rate_limits, idempotency_keys\nMedia: media_assets, media_upload_events, media_usage_snapshots")]
    end

    subgraph ExternalCloud["External Cloud & Banking Services (Backend-Mediated)"]
        Cloudinary["Cloudinary Cloud (SDK v2)\nUpload Stream (authenticated / public)\nSigned URL (300s TTL) & Admin Usage API"]
        Casso["Casso Open Platform\nOAuth2 + Paykit v1 Bank Account Lookup\n(14-min RAM JWT Cache)"]
    end

    WorkerUI --> ZmpBridge
    AccountantUI --> ZmpBridge
    AdminUI --> ZmpBridge
    ZmpBridge <--> ZaloRuntime
    AccountantUI --> OfflineQR
    AdminUI --> OfflineQR

    WorkerUI -->|"HTTPS JSON / Multipart (Bearer JWT)"| ExpressGate
    AccountantUI -->|"HTTPS JSON / Multipart (Bearer JWT)"| ExpressGate
    AdminUI -->|"HTTPS JSON / Multipart (Bearer JWT)"| ExpressGate

    ExpressGate --> Middlewares --> Controllers --> Services
    Services <-->|"Parameterized SQL & withTransaction"| MySQL
    BgScheduler -.->|"Every 24h (staging/prod)"| Cloudinary
    BgScheduler -.-> MySQL

    Services -->|"Verify Access/Location/Phone Token"| ZaloGraph
    Services -->|"Server-Side Signed Upload/Delete/Usage"| Cloudinary
    Services -->|"Server-Side Bank Owner Lookup"| Casso
```

---

## 2. Luồng nghiệp vụ xuyên suốt (End-to-End Sequence Diagrams)

### 2.1 Luồng Chấm công đa lớp & Lưu minh chứng Cloudinary (Smart Attendance + Media)

```mermaid
sequenceDiagram
    actor W as Worker (Zalo Mini App)
    participant FE as OneTouchCheckIn / attendance.service
    participant ZMP as Zalo SDK (Location / QR / Camera)
    participant API as Backend (/api/attendance/*)
    participant ZAPI as Zalo Graph API
    participant CLD as Cloudinary SDK v2
    participant DB as MySQL / TiDB

    W->>FE: Bấm "Chấm công" / "Về thôi" / Quét QR
    FE->>API: POST /attendance/precheck (GPS lat/lng, work_location_type)
    API->>DB: Read company_settings, period_locks, attendance_logs
    API-->>FE: Branch policy (GPS / GPS_AND_QR / QR_ONLY), distance, locked status

    FE->>ZMP: Lấy vị trí (getLocation) & Quét QR/Chụp ảnh (nếu yêu cầu)
    ZMP-->>FE: lat/lng, zalo_location_token, qr_token, image/snapshot

    FE->>API: POST /attendance/check-in (+ Idempotency-Key)
    API->>API: Auth JWT + Check DB User Status + Idempotency Claim
    opt Có zalo_location_token
        API->>ZAPI: GET /v2.0/me/info (verify location token <=120s)
        ZAPI-->>API: Decoded GPS / Error
    end
    opt Có ảnh minh chứng (Check-in snapshot)
        API->>CLD: Upload stream (authenticated) / Fallback <=155KB compact
        CLD-->>API: public_id, asset_id, secure_url
    end

    API->>DB: BEGIN TRANSACTION
    API->>DB: SELECT employees / attendance_logs FOR UPDATE
    API->>DB: Kiểm tra double-tap 3s, QR nonce, MISA workday engine
    API->>DB: INSERT/UPDATE attendance_logs + INSERT media_assets + idempotency_keys + audit_logs
    API->>DB: COMMIT
    API-->>FE: 200 OK (work_credit, late_minutes, duration_status, alerts)
```

### 2.2 Luồng Khóa kỳ -> Phát phiếu lương -> Khiếu nại / Thanh toán VietQR

```mermaid
sequenceDiagram
    actor AD as Admin / Accountant
    actor WK as Worker
    participant BE as Backend (/api/attendance & /api/payroll)
    participant DB as MySQL / TiDB
    participant VQR as Offline VietQR & OpenOutApp

    AD->>BE: POST /attendance/lock-period (month, year)
    BE->>DB: INSERT/UPDATE period_locks + Sync payroll + Broadcast user_notifications
    BE-->>AD: Kỳ công đã khóa (chặn sửa công & nộp đơn mới trong kỳ)

    AD->>BE: POST /payroll/send-report (Admin only)
    BE->>DB: Tx: Upsert attendance (payout_status='SENT') + Upsert user_notifications
    BE-->>WK: Hộp thư thông báo có báo cáo lương mới

    WK->>BE: GET /payroll/me -> Xem phiếu lương 2 tab (Tổng hợp + Thu nhập từng ngày)
    alt Có sai sót
        WK->>BE: POST /media/upload (optional evidence) -> POST /payroll/confirm (DISPUTED)
        BE->>DB: Tx: Update attendance (DISPUTED) + media_assets + audit_logs
        AD->>BE: POST /payroll/resolve-dispute (RESOLVED / CONFIRMED)
    else Đúng số liệu
        WK->>BE: POST /payroll/confirm (CONFIRMED)
    end

    AD->>VQR: Tạo mã VietQR tại Client (bank_code, STK, Net Pay, transfer_note)
    AD->>VQR: Mở App Ngân hàng / Share Zalo -> Chuyển khoản thực tế
    AD->>BE: POST /payroll/mark-paid (hoặc /employee-payment-status)
    BE->>DB: Tx: Update attendance (payment_status='PAID') + Notify Worker
    WK->>BE: POST /payroll/confirm (RECEIVED)
    BE->>DB: Tx: Update attendance (salary_confirm_status='RECEIVED')
```

---

## 3. Ranh giới an toàn & Chính sách Triển khai Hiện tại

- **Trust Boundary 1 (Zalo Client vs Backend):** Frontend tuyệt đối không giữ `ZALO_APP_SECRET`, `CASSO_APP_SECRET`, `CLOUDINARY_API_SECRET`, `JWT_SECRET`, `QR_SECRET`. Mọi xác minh token Zalo, tra cứu Casso, ký URL Cloudinary và tính lương chính thức đều nằm ở Backend.
- **Trust Boundary 2 (Client Upload vs Media Storage Policy):** Client chỉ gửi file buffer (`multipart/form-data`) và category; Backend quyết định `asset_folder`, `public_id`, `delivery_type` (`authenticated` cho chứng từ/ảnh chấm công/đơn từ/khiếu nại, `upload` cho avatar/logo), giới hạn kích thước và chống thực thi qua `mediaValidator.js`.
- **Trust Boundary 3 (Test vs Production DB Isolation):** `sedinco_backend/src/config/db.js` chặn cứng mọi cấu hình `NODE_ENV=test` nếu host chứa `aivencloud.com`, `tidbcloud.com`, `render.com`, bật `DB_SSL=true`, hoặc tên DB không chứa `test`. Staging/Production tắt Runtime DDL (`verifySchemaReadiness` yêu cầu chạy `scripts/migrate_staging_schema.js` trước bằng tài khoản migration).
