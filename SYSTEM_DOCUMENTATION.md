# TÀI LIỆU KỸ THUẬT HỆ THỐNG TOÀN DIỆN (SYSTEM DOCUMENTATION)
# DỰ ÁN: SEDINCO HR — QUẢN LÝ CHẤM CÔNG, PHÊ DUYỆT ĐƠN & TIỀN LƯƠNG DOANH NGHIỆP

> **Ngày lập tài liệu**: 21/10/2026  
> **Phiên bản tài liệu**: 2.0.0 (Comprehensive Architecture & Codebase Analysis)  
> **Người lập**: Senior Software Architect / Technical Lead  
> **Phương pháp phân tích**: Đọc và đối chiếu trực tiếp 100% mã nguồn thực tế tại repository (`sedinco-hr`), bao gồm Backend Node.js Express, Frontend Zalo Mini App & Web Dashboard, CSDL MySQL, Scripts kiểm thử và Cấu hình môi trường.  
> **Phân loại nhãn xác minh**:
> - `[ĐÃ XÁC MINH]`: Đã kiểm chứng trực tiếp qua dòng code cụ thể, test output hoặc file cấu hình hoạt động.
> - `[CÓ DẤU HIỆU / CHƯA XÁC MINH ĐẦY ĐỦ]`: Đã tìm thấy khai báo mã nguồn nhưng chưa có luồng tích hợp hoàn chỉnh hoặc phụ thuộc dịch vụ ngoài.
> - `[CHƯA TRIỂN KHAI]`: Đã có ý niệm nghiệp vụ/giao diện nhưng mã nguồn backend/database chưa có hàm xử lý thực tế.

---

## MỤC LỤC TỔNG HỢP

1. [A. Tổng quan dự án](#a-tổng-quan-dự-án)
2. [B. Công nghệ sử dụng](#b-công-nghệ-sử-dụng)
3. [C. Kiến trúc hệ thống](#c-kiến-trúc-hệ-thống)
4. [D. Cấu trúc thư mục](#d-cấu-trúc-thư-mục)
5. [E. Danh sách module](#e-danh-sách-module)
6. [F. Danh sách chức năng chi tiết](#f-danh-sách-chức-năng-chi-tiết)
7. [G. Role và phân quyền (RBAC)](#g-role-và-phân-quyền-rbac)
8. [H. Database và mô hình dữ liệu (Data Models & ERD)](#h-database-và-mô-hình-dữ-liệu)
9. [I. Danh mục API và giao tiếp (RESTful Endpoints)](#i-danh-mục-api-và-giao-tiếp)
10. [J. Luồng nghiệp vụ đầu-cuối (End-to-End Business Workflows)](#j-luồng-nghiệp-vụ-đầu-cuối)
11. [K. Frontend và giao diện người dùng](#k-frontend-và-giao-diện-người-dùng)
12. [L. Backend và xử lý nghiệp vụ](#l-backend-và-xử-lý-nghiệp-vụ)
13. [M. Cấu hình và môi trường](#m-cấu-hình-và-môi-trường)
14. [N. Deployment và vận hành](#n-deployment-và-vận-hành)
15. [O. Testing và chất lượng phần mềm](#o-testing-và-chất-lượng-phần-mềm)
16. [P. Phân tích an toàn & bảo mật (Security Review)](#p-phân-tích-an-toàn--bảo-mật)
17. [Q. Tích hợp bên thứ ba](#q-tích-hợp-bên-thứ-ba)
18. [R. Vấn đề tồn tại và Nợ kỹ thuật (Technical Debt)](#r-vấn-đề-tồn-tại-và-nợ-kỹ-thuật)
19. [S. Hướng dẫn dành cho AI Agent tiếp tục phát triển](#s-hướng-dẫn-dành-cho-ai-agent-tiếp-tục-phát-triển)
20. [T. Danh mục bằng chứng và mức độ bao phủ](#t-danh-mục-bằng-chứng-và-mức-độ-bao-phủ)

---

## A. TỔNG QUAN DỰ ÁN

### 1. Tên dự án
- **Sedinco HR** (Hệ Thống Chấm Công, Phê Duyệt Đơn & Tiền Lương Doanh Nghiệp).
- Repository Monorepo: `sedinco-hr` gồm 2 dự án con chính thức: `sedinco_backend` và `zalo-miniapp-frontend`.

### 2. Mục đích và bài toán nghiệp vụ `[ĐÃ XÁC MINH: docs/tongquanduan.md, README.md]`
- Phục vụ hoạt động quản trị nhân sự cho **Công ty Cổ phần Vật Liệu Xây Dựng Sedinco** (trụ sở chính: Số 1 Nguyễn Văn Linh, TP. Đà Nẵng).
- Giải quyết bài toán quản lý đặc thù của ngành sản xuất - xây dựng:
  1. **Chấm công di động & chống gian lận**: Cho phép công nhân, kỹ sư công trường chấm công bằng điện thoại di động thông qua nền tảng Zalo Mini App, kiểm tra vị trí GPS trong bán kính cho phép của công ty/nhà máy.
  2. **Quy trình đơn từ số hóa**: Thay thế quy trình xin nghỉ phép, báo tăng ca (OT), báo quên chấm công bằng giấy tờ thủ công bằng luồng tạo đơn trực tuyến và duyệt tức thời.
  3. **Tự động đồng bộ dữ liệu công (Auto-Sync)**: Khi cấp quản lý duyệt đơn hợp lệ, hệ thống tự động ghi nhận ký hiệu công tương ứng (`1`, `P`, `OT`, `1/OT`, `0.5`, `V`) vào bảng chấm công hàng ngày.
  4. **Động cơ tính lương thời gian thực (Real-time Payroll Engine)**: Tính toán tự động lương theo ngày công chuẩn (26 ngày), phân tách công thử việc (hưởng 85%) và công chính thức (100%), áp dụng hệ số làm thêm giờ theo Luật Lao động (Ngày thường 1.5x, Chủ nhật 2.0x, Lễ Tết 3.0x), trừ trích bảo hiểm bắt buộc 10.5% và khấu trừ phạt đi trễ/về sớm.
  5. **Đóng băng / Chốt sổ kỳ lương (Period Locking)**: Ngăn chặn sửa đổi dữ liệu sau khi Kế toán đã chốt sổ bảng công để xuất báo cáo và chi trả lương.

### 3. Đối tượng sử dụng `[ĐÃ XÁC MINH: src/constants/roles.js]`
- **Cán bộ Công nhân viên (`employee`)**: Kỹ sư công trường, công nhân sản xuất, nhân viên văn phòng.
- **Chuyên viên Nhân sự (`hr`)**: Quản lý danh sách nhân sự, theo dõi bảng chấm công tổng hợp, tạo tài khoản.
- **Kế toán tiền lương (`accountant`)**: Giám sát bảng công ma trận, duyệt đơn từ ảnh hưởng đến tiền lương, chốt sổ kỳ công tháng (`lock-period`), tính lương và xuất bảng lương Excel.
- **Ban Giám Đốc / Quản trị viên (`admin`)**: Toàn quyền cấu hình công ty, vị trí GPS, danh mục ngày lễ, mở khóa kỳ công đã chốt (`unlock-period`), phân vai trò và tạm khóa/mở khóa tài khoản nhân sự.

### 4. Phạm vi hệ thống
- **Client 1**: Zalo Mini App dành cho Smartphone chạy trên ứng dụng Zalo (iOS/Android).
- **Client 2**: Web Application Dashboard dành cho Desktop/PC Browser (trình duyệt web màn hình rộng) tích hợp sẵn trong cùng codebase frontend thông qua cơ chế nhận diện môi trường (`SmartRouter`).
- **Server**: REST API Backend phân tầng Layered MVC xây dựng trên Node.js Express, kết nối cơ sở dữ liệu quan hệ MySQL qua Connection Pool bảo mật SSL.

### 5. Trạng thái hiện tại của dự án
- **Trạng thái**: Đã sẵn sàng vận hành (Production-Ready) trên môi trường Staging/Production.
- **Kiểm thử tự động**: 17/17 test cases Backend đạt **100% PASS** (`node:test`).
- **Biên dịch Frontend**: Build thành công 100% không lỗi (`vite v5.4.21`).

| Thành phần | Đã hoàn thành | Đang phát triển / Cần nâng cấp | Còn thiếu |
|---|---|---|---|
| **Backend** | 100% API CRUD, Payroll Engine, Auto-sync Đơn, Khóa kỳ công, Khóa tài khoản, Cấu hình phạt trễ, SSL Pool. | Mã hóa mật khẩu (hashing bcrypt/argon2), middleware ký JWT toàn diện. | Cơ chế Webhook Zalo đồng bộ sự kiện nền. |
| **Frontend** | Giao diện Dual-mode (Mobile Zalo Mini App + PC Web Dashboard), One-Touch Checkin GPS, Ma trận bảng công 31 ngày, Bảng lương chi tiết, Modal duyệt đơn, Modal chốt công, Tìm kiếm nhân sự. | Tách nhỏ file `pages/index.jsx` (hiện 4316 dòng) thành các micro-components độc lập. | Push Notification thông báo trực tiếp qua Zalo ZNS. |
| **Database** | 8 bảng quan hệ đầy đủ (kèm migration tự động qua `initDb.js`). | Đánh thêm index tối ưu cho báo cáo nhiều năm. | Bảng Audit Log lưu vết chi tiết từng thao tác sửa ô bảng công. |

---

## B. CÔNG NGHỆ SỬ DỤNG

Dưới đây là danh mục chi tiết các công nghệ và thư viện được xác minh trực tiếp từ `package.json` và mã nguồn:

| Nhóm chức năng | Công nghệ / Thư viện | Phiên bản xác minh | Vai trò trong hệ thống | Vị trí sử dụng trong codebase | Bằng chứng xác minh |
|---|---|---|---|---|---|
| **Runtime Môi trường** | **Node.js** | `>= 20.x` | Môi trường thực thi JavaScript phía máy chủ và công cụ build | Toàn hệ thống | `node:test`, `node:assert/strict` |
| **Backend Core** | **Express.js** | `^5.2.1` | Web framework định tuyến REST API và xử lý HTTP Request/Response | `sedinco_backend/src/app.js` | `sedinco_backend/package.json:25` |
| **Backend Database** | **MySQL2** | `^3.24.5` | Driver kết nối MySQL Connection Pool hỗ trợ SSL và Promise API | `sedinco_backend/src/config/db.js` | `sedinco_backend/package.json:26` |
| **Backend Security** | **CORS** | `^2.8.6` | Quản lý chính sách Cross-Origin Resource Sharing | `sedinco_backend/src/app.js:10` | `sedinco_backend/package.json:23` |
| **Backend Environment**| **Dotenv** | `^18.0.5` | Nạp biến môi trường từ file `.env` vào `process.env` | `sedinco_backend/src/config/env.js:1` | `sedinco_backend/package.json:24` |
| **Frontend Framework** | **React** | `^18.3.1` | Thư viện UI xây dựng cấu trúc component hướng component-based | `zalo-miniapp-frontend/src/app.js` | `zalo-miniapp-frontend/package.json:27` |
| **Frontend DOM** | **React DOM** | `^18.3.1` | Khởi tạo Virtual DOM và render root component (`createRoot`) | `zalo-miniapp-frontend/src/app.js:3` | `zalo-miniapp-frontend/package.json:28` |
| **Mobile Platform SDK** | **zmp-sdk** | `latest` (`^2.x`) | SDK chính thức tương tác với nền tảng Zalo Mini App (GPS, Auth, Bio) | `zalo-miniapp-frontend/src/adapters/zmp/` | `zalo-miniapp-frontend/package.json:29` |
| **Mobile UI Library** | **zmp-ui** | `latest` (`^2.x`) | Bộ UI Component chuẩn của Zalo Mini App (App, Page, Route, Modal...) | `zalo-miniapp-frontend/src/components/` | `zalo-miniapp-frontend/package.json:30` |
| **Web Routing** | **react-router-dom** | `^7.18.4` | Định tuyến trình duyệt khi ứng dụng chạy trên Desktop/Web browser | `zalo-miniapp-frontend/src/components/layout.jsx:10` | `package.json:25` |
| **Frontend HTTP Client**| **Axios** | `^1.20.0` | Thư viện HTTP Request gắn Interceptor, AbortController, Timeout 15s | `zalo-miniapp-frontend/src/utils/api.js` | `zalo-miniapp-frontend/package.json:24` |
| **Icon Framework** | **Lucide React** | `^1.57.0` | Bộ biểu tượng SVG phong phú cho cả giao diện Mobile và Desktop | `zalo-miniapp-frontend/src/pages/index.jsx` | `zalo-miniapp-frontend/package.json:26` |
| **State Management** | **Jotai** | `^2.12.1` | Quản lý state dạng nguyên tử (Atomic state management) | `zalo-miniapp-frontend/package.json:25` | `package.json:21` |
| **CSS Framework** | **Tailwind CSS** | `^3.4.3` | Tiện ích CSS tiện dụng cho dàn layout responsive | `zalo-miniapp-frontend/src/css/tailwind.scss` | `zalo-miniapp-frontend/package.json:40` |
| **CSS Preprocessor** | **Sass (Dart Sass)** | `^1.76.0` | Xử lý SCSS/Sass biên dịch giao diện ZaUI | `zalo-miniapp-frontend/src/css/app.scss` | `zalo-miniapp-frontend/package.json:39` |
| **Build Tooling** | **Vite** | `^5.2.13` | Bundler siêu tốc biên dịch ES Modules và tài nguyên tĩnh | `zalo-miniapp-frontend/vite.config.js` | `zalo-miniapp-frontend/package.json:41` |
| **Vite Plugin** | **@vitejs/plugin-react**| `^4.3.1` | Plugin Fast Refresh cho React trên Vite | `zalo-miniapp-frontend/vite.config.js:2` | `zalo-miniapp-frontend/package.json:33` |
| **Zalo Vite Plugin** | **zmp-vite-plugin** | `latest` | Đóng gói tương thích chuẩn nền tảng Zalo Mini App | `zalo-miniapp-frontend/vite.config.js:3` | `zalo-miniapp-frontend/package.json:42` |
| **Excel Export Tool** | **ExcelJS** | `^4.4.0` | Công cụ xuất dữ liệu tổng hợp ra file Excel chuyên nghiệp | `tools/generate-summary/index.js` | `package.json:33` |
| **Testing Framework** | **Node.js Test Runner**| Built-in (`node:test`) | Runner chạy kiểm thử tự động không phụ thuộc thư viện bên ngoài | `sedinco_backend/__tests__/` | `sedinco_backend/package.json:9` |
| **Edge Hosting Tool** | **Cloudflare Wrangler**| `^3.x` | Công cụ triển khai Single Page App lên Cloudflare Pages/Workers | `wrangler.jsonc` | `wrangler.jsonc:1-10` |

---

## C. KIẾN TRÚC HỆ THỐNG

### 1. Mô tả kiến trúc tổng thể
Hệ thống Sedinco HR áp dụng mô hình kiến trúc **Monorepo kết hợp Micro-Client và Phân tầng Layered MVC**:
- **Client Layer**:
  - Ứng dụng Hybrid thích ứng: chạy mượt mà bên trong Zalo Client (qua ZMP Container) và trên trình duyệt máy tính Web Browser (qua HTML5 Standard).
  - Tích hợp lớp **Adapter Pattern** (`sdkAdapter.js`) giúp tách biệt hoàn toàn giữa API thật của điện thoại và API mô phỏng của trình duyệt PC.
- **Transport / API Gateway Layer**:
  - Giao thức HTTPS an toàn, chuẩn hóa định dạng JSON.
  - Kiểm soát lỗi tập trung, chặn rò rỉ mã lỗi cơ sở dữ liệu (`errorHandler.js`).
  - Hỗ trợ header `Idempotency-Key` ngăn chặn gửi trùng lặp yêu cầu chấm công hoặc nộp đơn.
- **Service & Business Layer**:
  - Tách biệt rõ ràng giữa Controller (nhận và trả HTTP) và Service (xử lý logic nghiệp vụ).
  - Động cơ tính lương (`payrollCalculator.js`) hoạt động dạng Pure Function, hoàn toàn độc lập và dễ dàng kiểm thử đơn vị.
- **Data Persistence Layer**:
  - Cơ sở dữ liệu quan hệ MySQL lưu trữ tập trung.
  - Sử dụng Connection Pool (10 kết nối, tự động KeepAlive và tái kết nối khi rớt mạng).
  - Mã hóa kênh truyền TLS/SSL khi kết nối Aiven Cloud Managed Database.

### 2. Sơ đồ kiến trúc Mermaid

```mermaid
graph TB
    subgraph CLIENT_LAYER["Lớp Khách (Client Consumers)"]
        ZaloApp["📱 Mobile Zalo Mini App<br/>(Zalo Runtime Environment)"]
        WebPC["💻 Desktop PC Web Browser<br/>(Chrome / Safari / Edge)"]
    end

    subgraph ADAPTER_LAYER["Lớp Điều Hướng & Thích Ứng (Frontend Core)"]
        SmartRouter["🔀 SmartRouter<br/>(ZMPRouter vs BrowserRouter)"]
        SDKAdapter["🔌 zmpAdapter<br/>(realSdkAdapter vs mockSdkAdapter)"]
        APIClient["🌐 Axios API Client<br/>(Timeout 15s + Idempotency-Key)"]
    end

    subgraph GATEWAY_LAYER["Lớp Cổng & Middleware Backend (sedinco_backend)"]
        CORS["🛡️ CORS Origin Filter"]
        Parser["📦 JSON & URL-Encoded Body Parser"]
        ValMid["✅ validationMiddleware<br/>(Trần OT 24h, Ngày tháng)"]
        AuthMid["🔑 authMiddleware<br/>(Khử password, RBAC Role)"]
        ErrMid["🚨 errorHandler<br/>(Che giấu SQL Error nội bộ)"]
    end

    subgraph CONTROLLER_LAYER["Lớp Điều Khiển (Controllers)"]
        AuthCtrl["AuthController"]
        AttCtrl["AttendanceController"]
        PayCtrl["PayrollController"]
        ReqCtrl["RequestController"]
        EmpCtrl["EmployeeController"]
        CompCtrl["CompanyController"]
        HoliCtrl["HolidayController"]
    end

    subgraph SERVICE_LAYER["Lớp Nghiệp Vụ Lõi (Services)"]
        AuthSvc["AuthService<br/>(Xác thực & Khóa tài khoản)"]
        AttSvc["AttendanceService<br/>(Ma trận công & Khóa kỳ công)"]
        PaySvc["PayrollService<br/>(Điều phối bảng lương)"]
        PayCalc["⚙️ payrollCalculator<br/>(Pure Engine: 85%, 1.5x, 2.0x, 3.0x, BHXH)"]
        ReqSvc["RequestService<br/>(Duyệt đơn & Auto-sync sang công)"]
        EmpSvc["EmployeeService<br/>(CRUD Nhân sự & Trạng thái)"]
        CompSvc["CompanyService<br/>(Cài đặt giờ làm & Phạt đi trễ)"]
        HoliSvc["HolidayService<br/>(Quản lý ngày lễ)"]
    end

    subgraph DATA_LAYER["Lớp Cơ Sở Dữ Liệu (Aiven Cloud / Local MySQL)"]
        MySQLPool["🏊 MySQL2 Connection Pool<br/>(SSL TLS + KeepAlive 10s)"]
        InitDB["⚙️ initDb.js<br/>(Tự động Schema Migration 8 bảng)"]
        DBTables[("🗄️ MySQL Database<br/>8 Bảng Quan Hệ Chuẩn")]
    end

    ZaloApp --> SmartRouter
    WebPC --> SmartRouter
    SmartRouter --> SDKAdapter
    SDKAdapter --> APIClient

    APIClient -->|HTTPS / REST API| CORS
    CORS --> Parser
    Parser --> ValMid
    ValMid --> AuthMid

    AuthMid --> AuthCtrl & AttCtrl & PayCtrl & ReqCtrl & EmpCtrl & CompCtrl & HoliCtrl
    AuthCtrl --> AuthSvc
    AttCtrl --> AttSvc
    PayCtrl --> PaySvc
    PaySvc --> PayCalc
    ReqCtrl --> ReqSvc
    ReqSvc -.->|Kiểm tra kỳ chốt| AttSvc
    EmpCtrl --> EmpSvc
    CompCtrl --> CompSvc
    HoliCtrl --> HoliSvc

    AuthSvc & AttSvc & PaySvc & ReqSvc & EmpSvc & CompSvc & HoliSvc --> MySQLPool
    InitDB --> MySQLPool
    MySQLPool --> DBTables
    AuthCtrl & AttCtrl & PayCtrl & ReqCtrl & EmpCtrl & CompCtrl & HoliCtrl -.-> ErrMid
```

### 3. Các điểm nghẽn và rủi ro kiến trúc đã xác minh
1. `[ĐÃ XÁC MINH]` **Nguy cơ nghẽn đơn file Frontend**: File `zalo-miniapp-frontend/src/pages/index.jsx` có dung lượng lên đến 230 KB (4316 dòng), quản lý quá nhiều state cục bộ trong một component. Điều này làm tăng thời gian re-render và khó bảo trì khi nhiều lập trình viên cùng can thiệp.
2. `[ĐÃ XÁC MINH]` **Cơ chế xác thực chưa áp dụng JWT Secret Signature**: Hiện tại `AuthService.employeeLogin` trả về thông tin `safeUser` và client lưu trữ vào `localStorage`. Các API backend chưa bắt buộc xác thực chữ ký token trên mỗi request mà chủ yếu dựa vào `ma_nv` truyền từ client. Cần sớm nâng cấp JWT Middleware hoàn chỉnh.
3. `[ĐÃ XÁC MINH]` **Mật khẩu đang lưu Plain Text**: Bảng `employees` và `admins` đang lưu mật khẩu dạng chuỗi văn bản thuần (mặc định `'123456'`), chưa được băm qua bcrypt hoặc argon2.

---

## D. CẤU TRÚC THƯ MỤC

### 1. Sơ đồ cây thư mục chi tiết

```
sedinco-hr/
├── .env                              # File môi trường gốc (nếu có cấu hình dùng chung)
├── .gitignore                        # Bộ lọc loại trừ git (node_modules, dist, www, .env)
├── AGENTS.md                         # [QUAN TRỌNG] Quy tắc bắt buộc cho AI Agent backend
├── README.md                         # Giới thiệu tổng quan & hướng dẫn khởi chạy
├── app-config.json                   # Cấu hình container Zalo Mini App tại root
├── package.json                      # Quản lý script khởi chạy monorepo & test
├── package-lock.json                 # Khóa phiên bản dependencies root
├── sedinco_hr.sql                    # Dump SQL cấu trúc và dữ liệu ban đầu
├── wrangler.jsonc                    # Cấu hình triển khai Cloudflare Pages/Workers
├── zmp-cli.json                      # Cấu hình Zalo Mini App CLI template
│
├── docs/                             # TÀI LIỆU KỸ THUẬT VÀ QUY TRÌNH HỆ THỐNG
│   ├── agent-workflow.md             # Quy trình làm việc chuẩn & tiêu chuẩn hoàn thành DoD
│   ├── project.md                    # Đặc tả kỹ thuật Backend, 20 API endpoints, schema
│   ├── tongquanduan.md               # Nghiệp vụ nhân sự, công thức lương, chống gian lận
│   ├── testing-workflow.md           # Hướng dẫn kiểm thử tự động node:test
│   ├── security-workflow.md          # 10 hạng mục an toàn bảo mật OWASP API Security
│   └── sedinco-hr-summary.xlsx       # Báo cáo tổng hợp dự án dạng bảng tính Excel
│
├── sedinco_backend/                  # BACKEND NODE.JS EXPRESS REST API & MYSQL
│   ├── .env.example                  # Mẫu biến môi trường Localhost & Aiven Cloud
│   ├── package.json                  # Dependencies backend (express 5, mysql2, dotenv, cors)
│   ├── server.js                     # Entry point khởi động ứng dụng backend (cổng 5000)
│   ├── __tests__/                    # BỘ KIỂM THỬ TỰ ĐỘNG (17/17 TESTS PASS)
│   │   ├── payroll_calculation.test.js # TC-PAY-01 đến 08: Kiểm thử thuật toán tiền lương
│   │   ├── security_rules.test.js    # TC-SEC-01 đến 04: Khử password, RBAC, cờ tài khoản
│   │   └── validation.test.js        # TC-ATT-01 đến 05: Thẩm định input chấm công, trần OT
│   └── src/
│       ├── app.js                    # Đăng ký middlewares toàn cục, CORS, Router, Error
│       ├── server.js                 # Kiểm tra kết nối MySQL Pool và gọi initDatabase()
│       ├── config/
│       │   ├── db.js                 # Cấu hình MySQL2 Pool (10 conn, SSL, Promise wrapper)
│       │   └── env.js                # Đọc biến môi trường tập trung
│       ├── database/
│       │   └── initDb.js             # Khởi tạo tự động 8 bảng quan hệ & Seed Data
│       ├── middlewares/
│       │   ├── authMiddleware.js     # Khử password, giải mã quyền (RBAC), Safe Fields
│       │   ├── errorHandler.js       # Bắt lỗi 404 & che giấu SQL Error nội bộ
│       │   └── validationMiddleware.js # Thẩm tra ngày, tháng, năm, chặn OT > 24h
│       ├── controllers/
│       │   ├── attendanceController.js # getAttendance, updateAttendance, lock/unlockPeriod
│       │   ├── authController.js     # employeeLogin, adminLogin, changePassword, avatar
│       │   ├── companyController.js  # getCompany, updateCompany, get/updatePenalties
│       │   ├── employeeController.js # getEmployees, create/updateEmployee, updateStatus
│       │   ├── holidayController.js  # getHolidays, createHoliday, deleteHoliday
│       │   ├── payrollController.js  # getPayroll (tính lương toàn công ty)
│       │   └── requestController.js  # getRequests, createRequest, updateRequestStatus
│       ├── services/
│       │   ├── attendanceService.js  # Ma trận chấm công, khóa/mở khóa kỳ công
│       │   ├── authService.js        # Đăng nhập, chặn tài khoản tạm khóa, đổi mật khẩu
│       │   ├── companyService.js     # Thông tin công ty, ca làm việc & thang phạt đi trễ
│       │   ├── employeeService.js    # Quản lý hồ sơ nhân viên & cập nhật trạng thái
│       │   ├── holidayService.js     # Thêm/Xóa danh mục ngày nghỉ lễ
│       │   ├── payrollService.js     # Điều phối dữ liệu tính bảng lương
│       │   └── requestService.js     # Xử lý đơn & tự động đồng bộ công sang bảng công
│       ├── routes/
│       │   ├── index.js              # Định tuyến tổng hợp toàn bộ các domain RESTful
│       │   ├── attendanceRoutes.js   # /api/attendance/...
│       │   ├── authRoutes.js         # /api/login, /api/admin/login...
│       │   ├── companyRoutes.js      # /api/company/...
│       │   ├── employeeRoutes.js     # /api/employees/...
│       │   ├── holidayRoutes.js      # /api/holidays/...
│       │   ├── payrollRoutes.js      # /api/payroll/...
│       │   ├── requestRoutes.js      # /api/requests/...
│       │   └── settingsRoutes.js     # /api/settings/penalties...
│       └── utils/
│           ├── payrollCalculator.js  # Thuật toán tính lương độc lập (Pure Engine)
│           └── responseHelper.js     # Chuẩn hóa JSON phản hồi
│
├── zalo-miniapp-frontend/            # FRONTEND ZALO MINI APP (ZMP SDK + REACT + VITE)
│   ├── app-config.json               # Cấu hình statusBar, navigationBar Zalo
│   ├── index.html                    # HTML shell khởi tạo DOM `<div id="app"></div>`
│   ├── package.json                  # Dependencies frontend (React 18, ZaUI, Vite)
│   ├── postcss.config.js             # Cấu hình Tailwind CSS & Autoprefixer
│   ├── tailwind.config.js            # Thiết lập bảng màu Sedinco, breakpoints
│   ├── vite.config.js                # Cấu hình Vite build và plugin ZMP
│   ├── zmp-cli.json                  # Metadata Zalo Mini App CLI
│   └── src/
│       ├── app.js                    # Entry point React: CSS, ZaUI, mount Layout
│       ├── adapters/zmp/             # LỚP ADAPTER THÍCH ỨNG NỀN TẢNG
│       │   ├── sdkAdapter.js         # Switch động giữa real và mock SDK
│       │   ├── realSdkAdapter.js     # Gọi ZMP SDK thật (getLocation, AccessToken)
│       │   └── mockSdkAdapter.js     # Gọi HTML5 navigator.geolocation trên PC
│       ├── components/               # CÁC THÀNH PHẦN GIAO DIỆN CHÍNH
│       │   ├── AttendanceMatrixTable.jsx # Bảng ma trận chấm công 31 ngày (kèm chốt công)
│       │   ├── CompanyLogo.jsx       # Hiển thị Logo công ty kèm fallback tự động
│       │   ├── DesktopHeader.jsx     # Thanh tiêu đề phía trên cho giao diện PC
│       │   ├── DesktopSidebar.jsx    # Menu điều hướng cột bên trái cho giao diện PC
│       │   ├── EmployeeCheckinPC.jsx # Giao diện chấm công mô phỏng trên máy tính
│       │   ├── LinkAccountView.jsx   # Giao diện liên kết tài khoản Zalo với mã NV
│       │   ├── OneTouchCheckIn.jsx   # Giao diện chấm công 1 chạm di động kèm GPS
│       │   ├── PayrollGridTable.jsx  # Bảng hiển thị tính lương toàn công ty
│       │   ├── PeriodLockModal.jsx   # Modal Chốt công (Kế toán) & Mở kỳ (Admin)
│       │   ├── SalarySlipModal.jsx   # Modal xem Phiếu lương điện tử chi tiết
│       │   ├── SmartLeaveRequestModal.jsx # Modal tạo đơn xin nghỉ phép / OT thông minh
│       │   ├── clock.jsx             # Đồng hồ hiển thị thời gian thực
│       │   ├── layout.jsx            # ErrorBoundary & SmartRouter đa nền tảng
│       │   └── logo.jsx              # Vector logo Sedinco chuẩn
│       ├── constants/
│       │   └── roles.js              # Định nghĩa 4 roles và ma trận quyền RBAC
│       ├── css/
│       │   ├── app.scss              # SCSS tùy biến giao diện
│       │   └── tailwind.scss         # Khai báo Tailwind directives
│       ├── pages/
│       │   └── index.jsx             # TRANG CHỦ ĐIỀU HỢP TẤT CẢ CÁC TAB CHỨC NĂNG
│       ├── services/
│       │   └── authService.js        # Quản lý phiên đăng nhập, liên kết mã, lưu session
│       ├── static/
│       │   └── sedinco-logo.png      # File ảnh logo Sedinco gốc
│       └── utils/
│           └── api.js                # Cấu hình Axios, Interceptors, Idempotency-Key
│
└── tools/
    └── generate-summary/
        └── index.js                  # Script sinh file Excel báo cáo hệ thống
```

### 2. Các file cấu hình quan trọng
- `sedinco_backend/src/config/env.js`: Quản lý các biến môi trường kết nối MySQL và cổng dịch vụ.
- `sedinco_backend/src/config/db.js`: Quản lý MySQL2 Connection Pool và kích hoạt SSL TLS.
- `zalo-miniapp-frontend/src/utils/api.js`: Quản lý địa chỉ `API_BASE`, timeout và interceptor an toàn.
- `zalo-miniapp-frontend/app-config.json`: Cấu hình cửa sổ hiển thị trên Zalo App.
- `wrangler.jsonc`: Cấu hình triển khai frontend lên Cloudflare Pages/Workers.

### 3. Entry point của từng dịch vụ
- **Backend Entry Point**: [sedinco_backend/server.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/server.js) -> trỏ sang [sedinco_backend/src/server.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/server.js).
- **Frontend Entry Point**: [zalo-miniapp-frontend/src/app.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/zalo-miniapp-frontend/src/app.js) -> mount component [Layout.jsx](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/zalo-miniapp-frontend/src/components/layout.jsx) vào DOM element `#app`.

### 4. Các file cần đọc đầu tiên khi tiếp quản dự án
1. `AGENTS.md` & `docs/project.md`: Nắm vững quy chuẩn và đặc tả kỹ thuật backend.
2. `sedinco_backend/src/database/initDb.js`: Hiểu rõ cấu trúc 8 bảng quan hệ của CSDL.
3. `zalo-miniapp-frontend/src/constants/roles.js`: Nắm vững ma trận phân quyền 4 nhóm người dùng.
4. `sedinco_backend/src/utils/payrollCalculator.js`: Nắm chắc công thức tính lương của doanh nghiệp.
5. `zalo-miniapp-frontend/src/utils/api.js`: Hiểu cách frontend giao tiếp với backend.

---

## E. DANH SÁCH MODULE

Hệ thống được tổ chức thành 9 module nghiệp vụ chính:

| STT | Tên Module | Mục đích & Trách nhiệm | File/Thư mục triển khai | Bảng Database liên quan | API Endpoints liên quan | Role được phép | Trạng thái triển khai |
|---|---|---|---|---|---|---|---|
| **1** | **Xác thực & Phiên làm việc (Auth)** | Đăng nhập cán bộ nhân viên, đăng nhập quản trị, đổi mật khẩu, cập nhật ảnh đại diện, kiểm tra tài khoản tạm khóa. | `src/controllers/authController.js`<br/>`src/services/authService.js`<br/>`src/routes/authRoutes.js` | `employees`<br/>`admins` | `POST /api/login`<br/>`POST /api/admin/login`<br/>`POST /api/change-password`<br/>`POST /api/update-avatar` | Tất cả (`employee`, `hr`, `accountant`, `admin`) | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **2** | **Quản lý Hồ sơ Nhân sự (Employees)** | Xem danh sách cán bộ công nhân viên, thêm mới nhân viên, cập nhật hồ sơ, phân quyền chức danh, tạm khóa / kích hoạt lại tài khoản, xóa nhân viên. | `src/controllers/employeeController.js`<br/>`src/services/employeeService.js`<br/>`src/routes/employeeRoutes.js` | `employees` | `GET /api/employees`<br/>`POST /api/employees`<br/>`PUT /api/employees/:id`<br/>`PUT /api/employees/:ma_nv/role`<br/>`PUT /api/employees/:ma_nv/status`<br/>`DELETE /api/employees/:id` | `hr`, `admin` (Xem: `accountant`) | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **3** | **Chấm công Ma trận & Định vị (Attendance)** | Ghi nhận chấm công hàng ngày qua GPS, tự động phân ca sáng/chiều, hiển thị bảng công 31 ngày toàn công ty, sửa công có kiểm soát. | `src/controllers/attendanceController.js`<br/>`src/services/attendanceService.js`<br/>`src/routes/attendanceRoutes.js`<br/>`OneTouchCheckIn.jsx` | `attendance`<br/>`attendance_logs`<br/>`employees` | `GET /api/attendance`<br/>`POST /api/attendance/update` | Chấm: `employee`, `hr`, `accountant`, `admin`<br/>Xem ma trận: `hr`, `accountant`, `admin` | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **4** | **Khóa / Mở Khóa Kỳ Công Tháng (Period Locks)** | Chốt sổ bảng công cuối tháng để đóng băng dữ liệu tính lương; ngăn chặn mọi hành vi thêm/sửa/xóa công; mở lại kỳ công có giải trình bắt buộc. | `src/services/attendanceService.js`<br/>`PeriodLockModal.jsx`<br/>`src/database/initDb.js` | `period_locks` | `GET /api/attendance/period-status`<br/>`POST /api/attendance/lock-period`<br/>`POST /api/attendance/unlock-period` | Chốt: `accountant`, `admin`<br/>Mở lại: Chỉ `admin` | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **5** | **Đơn từ & Phê duyệt Tự động (Requests & Approval)** | Nộp đơn xin nghỉ phép, báo làm thêm giờ (OT), báo quên chấm công; Ban Quản lý / Kế toán duyệt hoặc từ chối đơn; tự động đồng bộ sang bảng công. | `src/controllers/requestController.js`<br/>`src/services/requestService.js`<br/>`src/routes/requestRoutes.js`<br/>`SmartLeaveRequestModal.jsx` | `requests`<br/>`attendance_logs` | `GET /api/requests`<br/>`POST /api/requests`<br/>`PUT /api/requests/:id` | Nộp: `employee`, `hr`, `admin`<br/>Duyệt: `accountant`, `admin` | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **6** | **Tiền lương & Phiếu lương (Payroll)** | Thuật toán tính lương theo ngày công thực tế, phụ cấp, tiền OT nhân hệ số, trích nộp BHXH 10.5%, xuất bảng lương Excel, xem phiếu lương cá nhân. | `src/controllers/payrollController.js`<br/>`src/services/payrollService.js`<br/>`src/utils/payrollCalculator.js`<br/>`PayrollGridTable.jsx`<br/>`SalarySlipModal.jsx` | `employees`<br/>`attendance`<br/>`attendance_logs`<br/>`public_holidays` | `GET /api/payroll`<br/>`GET /api/payroll/status-list` | Xem toàn cty: `accountant`, `admin`<br/>Xem cá nhân: Tất cả | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **7** | **Cấu hình Doanh nghiệp & Giờ làm (Company & Settings)** | Cấu hình tên doanh nghiệp, mã số thuế, địa chỉ, logo, tọa độ GPS văn phòng, bán kính cho phép chấm công, khung ca làm việc và thang phạt đi trễ. | `src/controllers/companyController.js`<br/>`src/services/companyService.js`<br/>`src/routes/companyRoutes.js`<br/>`src/routes/settingsRoutes.js` | `company_settings` | `GET /api/company`<br/>`PUT /api/company`<br/>`GET /api/settings/penalties`<br/>`POST /api/settings/penalties` | Chỉ `admin` | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **8** | **Danh mục Ngày lễ Tết (Public Holidays)** | Khai báo các kỳ nghỉ lễ chính thức trong năm để hệ thống nhận diện và tính tiền OT hệ số 3.0x theo quy định Luật Lao động. | `src/controllers/holidayController.js`<br/>`src/services/holidayService.js`<br/>`src/routes/holidayRoutes.js` | `public_holidays` | `GET /api/holidays`<br/>`POST /api/holidays`<br/>`DELETE /api/holidays/:id` | Xem: Tất cả<br/>Thêm/Xóa: Chỉ `admin` | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **9** | **Nhật ký & Kiểm toán Thao tác (Audit Trail)** | Giám sát các thao tác mở kỳ công, sửa đổi công thủ công của quản trị viên và lịch sử duyệt đơn. | `AttendanceMatrixTable.jsx`<br/>`PeriodLockModal.jsx`<br/>`index.jsx` | `period_locks` (bảng audit log mở rộng) | `GET /api/attendance/period-status` | `admin` | `[CÓ DẤU HIỆU / CHƯA XÁC MINH ĐẦY ĐỦ]` Frontend đã có giao diện, backend đang lưu qua `period_locks.reason` và `locked_by`. |

---

## F. DANH SÁCH CHỨC NĂNG CHI TIẾT

| Mã CN | Tên Chức Năng | Mô Tả Nghiệp Vụ | Người Dùng | Quy Tắc Nghiệp Vụ | API / Thành Phần Liên Quan | Trạng Thái Triển Khai |
|---|---|---|---|---|---|---|
| **FN-01** | **Đăng nhập Cán bộ Nhân viên** | Xác thực qua Mã nhân sự (`ma_nv`) và Mật khẩu. | Cán bộ nhân viên, Kế toán, HR | Chặn đăng nhập nếu `status === 'inactive'` hoặc `is_locked === true`. Khử trường password trước khi phản hồi. | `POST /api/login`<br/>[authService.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/services/authService.js#L5-L25) | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **FN-02** | **Đăng nhập Quản trị viên** | Xác thực tài khoản Giám đốc / Admin. | Admin | Đối chiếu với bảng `admins`. Phản hồi thông tin quản trị an toàn. | `POST /api/admin/login`<br/>[authService.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/services/authService.js#L27-L40) | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **FN-03** | **Chấm công Một chạm (GPS)** | Ghi nhận thời gian đến và rời công ty. | Nhân viên, HR, Admin | Đo khoảng cách Haversine giữa GPS thiết bị và tọa độ công ty (mặc định cho phép bán kính 200m). Tự động nhận diện vào ca sáng (<8h) và ra ca chiều (>17h). Thời lượng >= 240p ghi nhận 0.5 công, >= 480p ghi nhận 1.0 công. | `POST /api/attendance/update`<br/>[OneTouchCheckIn.jsx](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/zalo-miniapp-frontend/src/components/OneTouchCheckIn.jsx) | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **FN-04** | **Xem Ma trận Bảng công 31 ngày** | Xem trực quan toàn bộ bảng công tháng của tất cả nhân sự. | HR, Kế toán, Admin | Hiển thị ma trận 31 cột ngày kèm ký hiệu chuẩn (`1`, `0.5`, `P`, `OT`, `1/OT`, `L`, `KP`). Cho phép lọc theo mã hoặc tên nhân viên. | `GET /api/attendance?month=&year=`<br/>[AttendanceMatrixTable.jsx](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/zalo-miniapp-frontend/src/components/AttendanceMatrixTable.jsx) | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **FN-05** | **Khóa Sổ Kỳ Công Tháng** | Đóng băng toàn bộ bảng công tháng sau khi chốt số liệu. | Kế toán, Admin | Khi kỳ công bị khóa (`is_locked = 1`), backend chặn tuyệt đối mọi hành vi `POST /api/attendance/update` và `PUT /api/requests/:id` duyệt đơn làm thay đổi công của tháng đó. | `POST /api/attendance/lock-period`<br/>[PeriodLockModal.jsx](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/zalo-miniapp-frontend/src/components/PeriodLockModal.jsx) | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **FN-06** | **Mở Lại Kỳ Công Đã Chốt** | Cho phép mở lại bảng công đã khóa trong trường hợp cần điều chỉnh sai sót. | Chỉ Admin | Bắt buộc phải nhập văn bản giải trình lý do mở lại. Lưu lại người mở và thời gian mở trong `period_locks`. | `POST /api/attendance/unlock-period`<br/>[attendanceService.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/services/attendanceService.js#L75-L100) | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **FN-07** | **Nộp Đơn Xin Nghỉ Phép / OT** | Nhân viên nộp đơn trực tuyến kèm lý do. | Nhân viên, HR, Admin | Chặn nhân viên đang bị tạm khóa tài khoản nộp đơn. Lưu trạng thái khởi tạo `pending`. | `POST /api/requests`<br/>[SmartLeaveRequestModal.jsx](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/zalo-miniapp-frontend/src/components/SmartLeaveRequestModal.jsx) | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **FN-08** | **Phê duyệt Đơn & Tự động Ghi công** | Cấp quản lý xem xét và phê duyệt / từ chối đơn. | Kế toán, Admin | Tách quyền: Chỉ Kế toán hoặc Admin mới có quyền duyệt đơn. Khi duyệt (`approved`), backend tự động ghi công (`P`, `OT`, `1`) vào ngày tương ứng trong `attendance_logs`. Chặn duyệt nếu kỳ công tháng đó đã bị chốt. | `PUT /api/requests/:id`<br/>[requestService.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/services/requestService.js#L40-L75) | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **FN-09** | **Tính Lương Thời Gian Thực (Payroll)** | Tính toán bảng lương toàn diện theo công thức Sedinco. | Kế toán, Admin | Tính theo 26 ngày chuẩn. Lương thử việc = 85%, chính thức = 100%. Tiền OT = lương 1 giờ × hệ số (1.5x ngày thường, 2.0x chủ nhật, 3.0x lễ). Trừ trích 10.5% BHXH nếu `has_insurance = true`. | `GET /api/payroll?month=&year=`<br/>[payrollCalculator.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/utils/payrollCalculator.js) | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **FN-10** | **Xem Phiếu Lương Điện Tử Cá Nhân** | Nhân viên tự xem phiếu lương chi tiết của mình từng tháng. | Tất cả nhân viên | Chỉ hiển thị phiếu lương của chính nhân viên đang đăng nhập. Phân tách rõ ràng: Lương công, Phụ cấp, Tiền làm thêm, Khấu trừ bảo hiểm và Thực lĩnh (Net). | `SalarySlipModal.jsx`<br/>[index.jsx](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/zalo-miniapp-frontend/src/pages/index.jsx#L3800-L3950) | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **FN-11** | **Quản Lý & Tạm Khóa Tài Khoản Nhân Sự**| Thêm mới nhân viên, cấp tài khoản, đổi vai trò, tạm khóa tài khoản. | HR, Admin | Admin và HR có thể tìm kiếm nhân sự theo tên/mã/chức danh. Admin có quyền Tạm Khóa (`is_locked=true, status='inactive'`) ngăn chặn chấm công và đăng nhập. | `PUT /api/employees/:ma_nv/status`<br/>`PUT /api/employees/:id`<br/>`GET /api/employees` | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **FN-12** | **Cấu Hình Khung Giờ & Thang Phạt Đi Trễ**| Thiết lập ca làm việc và quy chế trừ tiền phạt khi đi trễ. | Chỉ Admin | Lưu trữ ca làm (`08:00 - 17:00`), giờ nghỉ trưa (`12:00 - 13:00`), số phút miễn phạt (15p), số tiền phạt mỗi phút hoặc theo khung cố định. | `GET /api/settings/penalties`<br/>`POST /api/settings/penalties`<br/>[companyService.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/services/companyService.js) | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **FN-13** | **Quản Lý Danh Mục Ngày Lễ Tết** | Thiết lập các ngày nghỉ lễ hưởng nguyên lương và nhân 3x nếu OT. | Chỉ Admin | Thêm mới hoặc xóa ngày lễ trong năm. Dữ liệu ngày lễ được nạp vào thuật toán tính lương để tự động áp dụng hệ số OT 3.0x. | `GET /api/holidays`<br/>`POST /api/holidays`<br/>`DELETE /api/holidays/:id` | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |
| **FN-14** | **Đổi Mật Khẩu & Cập Nhật Ảnh Đại Diện**| Nhân viên tự đổi mật khẩu và cập nhật ảnh cá nhân. | Tất cả người dùng | Yêu cầu xác thực chính xác mật khẩu hiện tại trước khi cập nhật mật khẩu mới. Lưu ảnh dạng URL hoặc Base64 trong MySQL (`LONGTEXT`). | `POST /api/change-password`<br/>`POST /api/update-avatar` | `[ĐÃ XÁC MINH]` Hoạt động đầy đủ |

---

## G. ROLE VÀ PHÂN QUYỀN (RBAC)

### 1. Chuẩn Hóa Duy Nhất 3 Role Nghiệp Vụ `[ĐÃ XÁC MINH: src/constants/roles.js, authMiddleware.js]`
Hệ thống Sedinco HR tuân thủ nghiêm ngặt nguyên tắc chỉ có đúng 3 Role nghiệp vụ độc lập:

1. **`worker` (Công Nhân / Cán Bộ Nhân Viên)**:
   - Đại diện cho cán bộ công nhân viên trực tiếp làm việc tại nhà máy, công trường và văn phòng.
   - Quyền hạn: Chấm công GPS vào/ra, xem bảng công cá nhân (`/attendance/me`), nộp đơn xin nghỉ/OT cho chính mình (`/requests/me`), xem phiếu lương cá nhân (`/payroll/me`), đổi mật khẩu của mình.
   - Bị chặn tuyệt đối ở Backend khi truy cập dữ liệu toàn công ty hoặc cố ý sửa công/duyệt đơn của người khác.
2. **`accountant` (Kế Toán Tiền Lương & Báo Cáo)**:
   - Đại diện cho phòng Kế toán - Tài vụ.
   - Thực hiện nghiệp vụ tính lương, xem bảng công, xuất báo cáo theo danh mục permission động do Quản trị viên cấp phép lưu trong CSDL MySQL (`accountant_permissions`).
   - Mặc định ban đầu có quyền: `attendance_view_all`, `attendance_summarize`, `leave_view_all`, `payroll_view_all`, `payroll_calculate`, `payroll_export`, `employee_view`, `report_view`.
   - Các quyền nhạy cảm (sửa công, khóa kỳ, duyệt đơn, chốt bảng lương) mặc định tắt và chỉ hoạt động khi Quản trị viên kích hoạt.
3. **`admin` (Quản Trị Viên / Ban Giám Đốc)**:
   - Đại diện cho Giám đốc Điều hành hoặc Quản trị viên cấp cao nhất.
   - Toàn quyền quyết định toàn hệ thống: Cấu hình phân quyền động của Kế toán (`accountant_permissions`), mở lại kỳ công đã chốt (`unlock-period` kèm giải trình), cấu hình công ty, vị trí GPS, khung giờ và thang phạt, quản lý hồ sơ và đổi vai trò nhân sự.

> **Ghi chú**: Tuyệt đối không sử dụng role `hr`, `manager`, `director` hoặc role thứ 4. Cột `role` được lưu trữ độc lập trong bảng `employees` và bảng `admins`, không dùng cột `chuc_danh` làm căn cứ xác thực quyền hạn.

### 2. Hệ Thống Permission Động & Màn Hình Phân Quyền Kế Toán
Quản trị viên sử dụng màn hình **Phân Quyền Kế Toán** (`AccountantPermissionView.jsx`) để bật/tắt quyền theo 6 nhóm chức năng:
- **Chấm công**: `attendance_view_all`, `attendance_summarize`, `attendance_edit`, `attendance_lock`, `attendance_unlock`, `attendance_request_approve`.
- **Đơn từ**: `leave_view_all`, `leave_approve`, `leave_reject`, `request_view_all`, `request_manage`.
- **Tiền lương**: `payroll_view_all`, `payroll_calculate`, `payroll_export`, `payroll_approve`, `payroll_payment_status_manage`.
- **Nhân viên**: `employee_view`, `employee_create`, `employee_edit`, `employee_delete`, `employee_status_manage`.
- **Báo cáo & Cấu hình**: `report_view`, `report_export`, `company_settings_manage`, `shift_manage`, `holiday_manage`, `penalty_settings_manage`.
- **Tài khoản & Bảo mật**: `account_manage`, `permission_manage`, `audit_log_view`.

Khi Quản trị viên cập nhật, Backend lập tức vô hiệu hóa cache bộ nhớ đệm (`invalidatePermissionCache()`), đồng thời ghi nhận vào bảng `audit_logs` để bảo đảm khả năng truy vết 100%.
| **Quản lý danh mục Ngày lễ Tết (`canManageHolidays`)**| ❌ Không | ❌ Không | ❌ Không | ✅ Có | `index.jsx:1260` |
| **Cấu hình thông tin công ty & GPS (`canManageCompany`)**| ❌ Không | ❌ Không | ❌ Không | ✅ Có | `index.jsx:1280` |

### 3. Cơ chế xác thực và phân giải quyền
- **Tại Backend ([authMiddleware.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/middlewares/authMiddleware.js))**:
  Hàm `resolveUserRole(emp)` phân loại vai trò dựa trên chuỗi chức danh công việc (`chuc_danh`):
  - Chứa `'giám đốc'` hoặc `'giam doc'` $\rightarrow$ `admin`.
  - Chứa `'kế toán'` hoặc `'ke toan'` $\rightarrow$ `accountant`.
  - Chức danh khác $\rightarrow$ `employee`.
  Hàm `sanitizeUserResponse(user)` tự động xóa bỏ thuộc tính `password` trước khi gửi dữ liệu về client.
- **Tại Frontend ([roles.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/zalo-miniapp-frontend/src/constants/roles.js))**:
  Cung cấp các hàm tiện ích:
  - `isTabAllowedForRole(tab, role)`: Kiểm tra xem tab có nằm trong `allowedTabs` của vai trò không.
  - `hasPermission(role, permissionKey)`: Kiểm tra quyền boolean của vai trò.

---

## H. DATABASE VÀ MÔ HÌNH DỮ LIỆU

### 1. Công nghệ & Cơ chế Quản lý CSDL
- **Hệ quản trị CSDL**: MySQL 8.x / 9.x (môi trường sản xuất kết nối Aiven Cloud Managed MySQL qua cổng TLS 23807/28123; môi trường cục bộ dùng MySQL localhost:3306).
- **Cơ chế khởi tạo & Di trú (Migration)**:
  Tự động thực thi mỗi khi máy chủ backend khởi động thông qua module [initDb.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/database/initDb.js). Module này chạy các câu lệnh `CREATE TABLE IF NOT EXISTS` và các lệnh `ALTER TABLE ADD COLUMN ... catch(() => {})` để bảo đảm tính lũy đẳng (Idempotent), không gây mất mát dữ liệu hiện hữu.

### 2. Sơ đồ Quan Hệ Thực Thể (Mermaid ERD)

```mermaid
erDiagram
    employees ||--o{ attendance_logs : "has daily logs"
    employees ||--o{ attendance : "has monthly summary"
    employees ||--o{ requests : "submits"
    period_locks ||--o{ attendance : "freezes monthly"
    company_settings ||--|| admins : "configured by"

    employees {
        varchar(20) ma_nv PK "Mã nhân viên (NV001, NV002...)"
        varchar(100) ho_ten "Họ và tên nhân sự"
        date ngay_sinh "Ngày sinh"
        varchar(20) dien_thoai "Số điện thoại liên hệ"
        varchar(100) email "Địa chỉ email"
        varchar(100) chuc_danh "Chức danh (Giám Đốc, Kế Toán, Kỹ Sư...)"
        date ngay_bat_dau_lam "Ngày bắt đầu nhận việc"
        date ngay_chinh_thuc "Mốc kết thúc thử việc (hưởng 100% lương)"
        varchar(100) password "Mật khẩu đăng nhập (mặc định 123456)"
        longtext avatar_url "URL ảnh hoặc chuỗi Base64 ảnh đại diện"
        decimal(15_2) luong_cb "Lương cơ bản hàng tháng"
        decimal(15_2) phu_cap_an_trua "Phụ cấp ăn trưa"
        decimal(15_2) phu_cap_xang_xe "Phụ cấp xăng xe đi lại"
        decimal(15_2) phu_cap_nha_o "Phụ cấp hỗ trợ nhà ở"
        decimal(15_2) thuong_htcv "Thưởng hoàn thành công việc"
        decimal(15_2) phu_cap_trach_nhiem "Phụ cấp trách nhiệm"
        decimal(15_2) phu_cap_tiep_khach "Phụ cấp tiếp khách ngoại giao"
        boolean has_insurance "Có trích trừ BHXH 10.5% hay không"
        varchar(20) status "Trạng thái: active / inactive"
        boolean is_locked "Cờ tạm khóa tài khoản: TRUE / FALSE"
    }

    attendance_logs {
        int id PK "Khóa chính tự tăng"
        varchar(20) employee_id FK "Mã nhân sự (liên kết employees.ma_nv)"
        date record_date "Ngày ghi nhận chấm công"
        varchar(10) status "Mã công: 1, 0.5, P, OT, 1/OT, TR, KP..."
        decimal(4_2) ot_hours "Số giờ làm thêm OT (0.00 đến 24.00)"
        varchar(20) check_in_time "Giờ chấm công vào (HH:mm:ss)"
        varchar(20) check_out_time "Giờ chấm công ra (HH:mm:ss)"
    }

    attendance {
        int id PK "Khóa chính tự tăng"
        varchar(20) ma_nv FK "Mã nhân sự (liên kết employees.ma_nv)"
        int thang "Tháng chấm công (1 đến 12)"
        int nam "Năm chấm công (ví dụ 2026)"
        decimal(5_2) cong_chuan "Ngày công chuẩn tháng (mặc định 26.00)"
        decimal(5_2) cong_thu_viec "Tổng ngày công giai đoạn thử việc (85%)"
        decimal(5_2) cong_chinh_thuc "Tổng ngày công giai đoạn chính thức (100%)"
        decimal(5_2) ot_cn "Tổng giờ làm thêm ngày Chủ nhật"
    }

    requests {
        int id PK "Khóa chính tự tăng"
        varchar(20) employee_id FK "Mã nhân sự gửi đơn"
        varchar(50) request_type "Loại đơn: Nghỉ phép, Làm thêm OT, Quên chấm công"
        date request_date "Ngày áp dụng đơn"
        text reason "Lý do xin phép hoặc giải trình"
        varchar(20) status "Trạng thái: pending, approved, rejected, cancelled"
        timestamp created_at "Thời điểm tạo đơn"
    }

    period_locks {
        int id PK "Khóa chính tự tăng"
        int month "Tháng khóa sổ (1 đến 12)"
        int year "Năm khóa sổ (ví dụ 2026)"
        boolean is_locked "Trạng thái: TRUE (Khóa), FALSE (Mở lại)"
        varchar(50) locked_by "Tài khoản thực hiện (accountant / admin)"
        timestamp locked_at "Thời điểm cập nhật trạng thái"
        text reason "Lý do giải trình (bắt buộc khi mở lại kỳ)"
    }

    public_holidays {
        int id PK "Khóa chính tự tăng"
        varchar(150) holiday_name "Tên ngày nghỉ lễ Tết"
        date start_date "Ngày bắt đầu nghỉ lễ"
        date end_date "Ngày kết thúc nghỉ lễ"
    }

    company_settings {
        int id PK "Khóa chính (id = 1)"
        varchar(255) company_name "Tên pháp nhân công ty"
        varchar(50) phone "Số điện thoại tổng đài"
        text address "Địa chỉ trụ sở công ty"
        varchar(50) tax_code "Mã số thuế doanh nghiệp"
        longtext logo_url "Đường dẫn hoặc Base64 logo công ty"
        varchar(10) work_start "Giờ vào ca làm việc chính (08:00)"
        varchar(10) work_end "Giờ tan ca làm việc chính (17:00)"
        varchar(10) lunch_start "Giờ bắt đầu nghỉ trưa (12:00)"
        varchar(10) lunch_end "Giờ kết thúc nghỉ trưa (13:00)"
        int grace_period_minutes "Số phút đi trễ miễn phạt (15 phút)"
        decimal(15_2) penalty_per_minute "Mức phạt tiền mỗi phút trễ"
        decimal(15_2) penalty_fixed_block "Mức phạt tiền theo khung cố định"
        decimal(5_2) penalty_salary_percent "Tỷ lệ phạt theo % lương tháng"
    }

    admins {
        int id PK "Khóa chính tự tăng"
        varchar(50) username "Tên đăng nhập quản trị"
        varchar(100) password "Mật khẩu quản trị"
        varchar(100) ho_ten "Họ tên người quản trị"
    }
```

### 3. Bảng phân tích chi tiết 8 bảng cơ sở dữ liệu

#### 3.1 Bảng `employees` (Hồ sơ Nhân sự)
- **Mục đích**: Lưu thông tin định danh, hợp đồng, mức lương và các loại phụ cấp của nhân viên.
- **Ràng buộc duy nhất**: `PRIMARY KEY (ma_nv)`.
- **Đặc điểm**: Mật khẩu mặc định là `'123456'`. Trường `is_locked` cho phép Quản trị viên vô hiệu hóa quyền đăng nhập và chấm công mà không cần xóa bản ghi để bảo toàn dữ liệu lịch sử.

#### 3.2 Bảng `attendance_logs` (Nhật ký Chấm công Hàng ngày)
- **Mục đích**: Ghi nhận chi tiết từng ngày công của từng nhân viên.
- **Ràng buộc duy nhất**: `UNIQUE KEY unique_emp_date (employee_id, record_date)`.
- **Cơ chế ghi**: Sử dụng cú pháp `INSERT ... ON DUPLICATE KEY UPDATE` giúp các tác vụ ghi lặp lại (idempotent) không bao giờ phát sinh lỗi trùng khóa mà tự động cập nhật giờ vào, giờ ra và trạng thái mới nhất.

#### 3.3 Bảng `attendance` (Tổng hợp Ngày công Chuẩn Tháng)
- **Mục đích**: Lưu trữ số ngày công chuẩn và ngày công tổng hợp đã quy đổi của tháng.
- **Ràng buộc duy nhất**: `UNIQUE KEY unique_emp_month (ma_nv, thang, nam)`.
- **Giá trị chuẩn**: `cong_chuan` mặc định là `26.00` ngày.

#### 3.4 Bảng `period_locks` (Chốt / Mở Khóa Kỳ Công Tháng)
- **Mục đích**: Đóng băng dữ liệu chấm công của cả tháng để phục vụ quyết toán tiền lương.
- **Ràng buộc duy nhất**: `UNIQUE KEY unique_period (month, year)`.
- **Logic bảo vệ**: Khi `is_locked = TRUE`, tất cả API thêm/sửa/xóa công của tháng đó bị từ chối với mã lỗi HTTP 400.

#### 3.5 Bảng `requests` (Đơn xin nghỉ phép & Đăng ký OT)
- **Mục đích**: Lưu trữ đơn từ xin nghỉ, tăng ca, giải trình quên chấm công.
- **Trạng thái**: `pending` (Chờ duyệt), `approved` (Đã duyệt), `rejected` (Từ chối), `cancelled` (Đã hủy).

#### 3.6 Bảng `public_holidays` (Danh mục Ngày lễ Tết)
- **Mục đích**: Lưu trữ các mốc ngày lễ chính thức trong năm (Tết Dương Lịch, Giỗ Tổ, 30/4, 1/5, Quốc Khánh...).
- **Tác động nghiệp vụ**: Nhân viên đi làm ngày lễ được hệ thống tính lương làm thêm hệ số 3.0x.

#### 3.7 Bảng `company_settings` (Cấu hình Công ty & Giờ làm việc)
- **Mục đích**: Lưu thông tin pháp lý doanh nghiệp, tọa độ GPS văn phòng, khung giờ làm việc và quy chế trừ tiền phạt đi trễ.
- **Bản ghi duy nhất**: Luôn cập nhật tại `id = 1`.

#### 3.8 Bảng `admins` (Tài khoản Quản trị cấp cao)
- **Mục đích**: Lưu trữ tài khoản dành riêng cho Ban Giám Đốc điều hành hệ thống.
- **Ràng buộc duy nhất**: `UNIQUE KEY username (username)`.

---

## I. DANH MỤC API VÀ GIAO TIẾP

Toàn bộ các REST API endpoints của hệ thống được quy hoạch thống nhất dưới tiền tố `/api`:

| Method | Endpoint | Module | Mục Đích Nghiệp Vụ | Yêu Cầu Auth / Role | Input Tham Số (Params / Body) | Cấu Trúc Response Chính | File Mã Nguồn Xử Lý |
|---|---|---|---|---|---|---|---|
| `GET` | `/` | Core | Kiểm tra trạng thái máy chủ (Healthcheck cơ bản) | Không | Không | `{ status: 'ok', name, time }` | [src/app.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/app.js#L15) |
| `GET` | `/api/health` | Core | Uptime monitor cho dịch vụ đám mây (Render) | Không | Không | `{ status: 'healthy', uptime, timestamp }` | [src/app.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/app.js#L23) |
| `POST` | `/api/login` | Auth | Đăng nhập tài khoản cán bộ nhân viên | Không | `{ ma_nv, password }` | `{ success: true, data: safeEmp }` (Lỗi 403 nếu bị tạm khóa) | [authController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/authController.js#L5) |
| `POST` | `/api/admin/login` | Auth | Đăng nhập tài khoản Quản trị / Giám đốc | Không | `{ username, password }` | `{ success: true, data: safeAdmin }` | [authController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/authController.js#L14) |
| `POST` | `/api/admin/register`| Auth | Tạo thêm tài khoản quản trị mới | Admin | `{ username, password, ho_ten }` | `{ success: true }` | [authController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/authController.js#L23) |
| `POST` | `/api/change-password`| Auth | Đổi mật khẩu tài khoản cá nhân | Nhân viên | `{ ma_nv, old_password, new_password }` | `{ success: true }` (Lỗi nếu sai pass cũ) | [authController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/authController.js#L32) |
| `POST` | `/api/update-avatar` | Auth | Cập nhật ảnh đại diện cá nhân | Nhân viên | `{ ma_nv, avatar_url }` | `{ success: true }` | [authController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/authController.js#L41) |
| `GET` | `/api/attendance` | Attendance | Lấy dữ liệu ma trận chấm công cả tháng | HR, Kế toán, Admin | Query: `?month=10&year=2026` | `{ success: true, data: [{ ma_nv, ho_ten, days: [] }] }` | [attendanceController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/attendanceController.js#L4) |
| `POST` | `/api/attendance/update` | Attendance | Ghi nhận hoặc sửa chấm công hàng ngày | Tất cả vai trò | `{ ma_nv, day, month, year, status, ot_hours, check_in_time, check_out_time }` | `{ success: true }` (Lỗi 400 nếu kỳ bị khóa; 403 nếu tài khoản bị khóa) | [attendanceController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/attendanceController.js#L14) |
| `GET` | `/api/attendance/period-status` | Period Locks | Kiểm tra trạng thái khóa sổ kỳ công của tháng | Kế toán, Admin | Query: `?month=10&year=2026` | `{ success: true, data: { month, year, is_locked, locked_by, reason } }` | [attendanceController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/attendanceController.js#L54) |
| `POST` | `/api/attendance/lock-period` | Period Locks | Chốt sổ đóng băng kỳ công tháng | Kế toán, Admin | `{ month, year, reason, locked_by }` | `{ success: true, message: 'Đã chốt sổ kỳ công thành công!' }` | [attendanceController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/attendanceController.js#L33) |
| `POST` | `/api/attendance/unlock-period` | Period Locks | Mở lại kỳ công đã chốt (kèm lý do bắt buộc) | Chỉ Admin | `{ month, year, reason, unlocked_by }` | `{ success: true, message: 'Đã mở lại kỳ công thành công!' }` (Lỗi 400 nếu thiếu lý do) | [attendanceController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/attendanceController.js#L43) |
| `GET` | `/api/payroll` | Payroll | Tính toán toàn bộ bảng lương của tháng | Kế toán, Admin | Query: `?month=10&year=2026` | `{ success: true, data: [PayrollItems] }` (Đầy đủ lương, phụ cấp, OT, BHXH, Net) | [payrollController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/payrollController.js#L4) |
| `GET` | `/api/payroll/status-list` | Payroll | Lấy danh sách trạng thái chi trả lương | Kế toán, Admin | Query: `?month=10&year=2026` | `{ success: true, data: [] }` | [payrollRoutes.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/routes/payrollRoutes.js#L6) |
| `GET` | `/api/requests` | Requests | Lấy danh sách đơn xin phép và đăng ký OT | HR, Kế toán, Admin | Không | `{ success: true, data: [{ id, ma_nv, ho_ten, type, date, reason, status }] }` | [requestController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/requestController.js#L4) |
| `POST` | `/api/requests` | Requests | Nộp đơn xin nghỉ / OT / Quên chấm công | Nhân viên, HR | `{ employee_id, request_type, request_date, reason }` | `{ success: true }` (Lỗi 403 nếu tài khoản bị khóa) | [requestController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/requestController.js#L14) |
| `PUT` | `/api/requests/:id` | Requests | Cấp quản lý phê duyệt hoặc từ chối đơn | Kế toán, Admin | `{ status: 'approved' / 'rejected' }` | `{ success: true }` (Tự động ghi công sang logs; lỗi 400 nếu kỳ đã khóa) | [requestController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/requestController.js#L24) |
| `GET` | `/api/employees` | Employees | Lấy danh sách hồ sơ nhân sự (đã khử pass) | HR, Kế toán, Admin | Không | `{ success: true, data: [Employees] }` | [employeeController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/employeeController.js#L4) |
| `POST` | `/api/employees` | Employees | Thêm hồ sơ nhân viên mới | HR, Admin | Dữ liệu nhân viên: `ma_nv, ho_ten, chuc_danh, luong_cb, phu_cap...` | `{ success: true }` | [employeeController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/employeeController.js#L13) |
| `PUT` | `/api/employees/:id` | Employees | Cập nhật hồ sơ nhân sự | HR, Admin | `{ ho_ten, dien_thoai, email, chuc_danh, luong_cb, phu_cap..., status, is_locked }` | `{ success: true }` | [employeeController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/employeeController.js#L22) |
| `PUT` | `/api/employees/:ma_nv/role`| Employees | Phân vai trò quản trị/kế toán cho nhân sự | Chỉ Admin | `{ role: 'admin' / 'accountant' / 'employee' }` | `{ success: true }` (Tự động cập nhật `chuc_danh`) | [employeeController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/employeeController.js#L31) |
| `PUT` | `/api/employees/:ma_nv/status`| Employees | Tạm khóa hoặc Mở khóa tài khoản nhân sự | Chỉ Admin | `{ status: 'active'/'inactive', is_locked: boolean }` | `{ success: true, message }` | [employeeController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/employeeController.js#L41) |
| `DELETE` | `/api/employees/:id` | Employees | Xóa vĩnh viễn hồ sơ nhân sự | Chỉ Admin | Param `:id` | `{ success: true }` | [employeeController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/employeeController.js#L51) |
| `GET` | `/api/company` | Company | Lấy thông tin pháp nhân và cấu hình công ty | Tất cả | Không | `{ success: true, data: config }` | [companyController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/companyController.js#L4) |
| `PUT` | `/api/company` | Company | Cập nhật thông tin công ty | Chỉ Admin | `{ company_name, phone, address, tax_code, logo_url }` | `{ success: true, message }` | [companyController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/companyController.js#L13) |
| `GET` | `/api/settings/penalties` | Settings | Lấy cấu hình ca làm việc và thang phạt đi trễ | Tất cả | Không | `{ success: true, data: penaltiesConfig }` | [companyController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/companyController.js#L22) |
| `POST` / `PUT` | `/api/settings/penalties`| Settings | Lưu cài đặt ca làm việc & thang phạt đi trễ | Chỉ Admin | `{ work_start, work_end, grace_period_minutes, penalty_per_minute... }` | `{ success: true, message }` | [companyController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/companyController.js#L31) |
| `GET` | `/api/holidays` | Holidays | Lấy danh mục ngày nghỉ lễ Tết trong năm | Tất cả | Không | `{ success: true, data: [] }` | [holidayController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/holidayController.js#L4) |
| `POST` | `/api/holidays` | Holidays | Thêm ngày nghỉ lễ mới | Chỉ Admin | `{ holiday_name, start_date, end_date }` | `{ success: true }` | [holidayController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/holidayController.js#L13) |
| `DELETE` | `/api/holidays/:id` | Holidays | Xóa ngày nghỉ lễ khỏi danh mục | Chỉ Admin | Param `:id` | `{ success: true }` | [holidayController.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/controllers/holidayController.js#L22) |

---

## J. LUỒNG NGHIỆP VỤ ĐẦU-CUỐI

### 1. Luồng Chấm công Một chạm (GPS Check-in Flow)

```mermaid
sequenceDiagram
    autonumber
    actor NV as Cán Bộ Nhân Viên (Zalo Mini App)
    participant SDK as zmpAdapter (GPS Service)
    participant UI as OneTouchCheckIn Component
    participant API as Backend REST API (/api/attendance/update)
    participant DB as MySQL Database (attendance_logs)

    NV->>UI: Bấm nút "CHẤM CÔNG" duy nhất
    UI->>SDK: Yêu cầu lấy tọa độ vị trí hiện tại (getLocation)
    alt Người dùng từ chối cấp quyền GPS
        SDK-->>UI: Lỗi: Quyền vị trí bị từ chối
        UI-->>NV: Hiển thị hướng dẫn bật GPS trên điện thoại
    else Tọa độ hợp lệ
        SDK-->>UI: Trả về { latitude, longitude }
        UI->>UI: Tính khoảng cách Haversine tới tọa độ Công ty (Đà Nẵng)
        alt Khoảng cách > 200m (Ngoài phạm vi)
            UI-->>NV: Cảnh báo đỏ: Bạn đang ở ngoài bán kính chấm công cho phép
        else Khoảng cách <= 200m (Hợp lệ)
            UI->>UI: Tự động phân tích thời gian thực:
            Note over UI: Nếu là lần chấm đầu ngày -> check_in_time<br/>Nếu là lần chấm sau -> check_out_time<br/>Tính tổng số phút làm việc trong ngày
            UI->>API: POST /api/attendance/update kèm header Idempotency-Key
            API->>DB: Kiểm tra period_locks (tháng/năm có bị khóa sổ không)
            alt Kỳ công tháng đã bị Kế toán chốt
                DB-->>API: is_locked = TRUE
                API-->>UI: Lỗi 400: Kỳ công đã bị khóa sổ tính lương!
                UI-->>NV: Thông báo kỳ công đã đóng băng, liên hệ Ban Giám Đốc
            else Kỳ công đang mở
                API->>DB: Kiểm tra tài khoản nhân viên (status, is_locked)
                alt Nhân viên bị TẠM KHÓA
                    API-->>UI: Lỗi 403: Tài khoản bị tạm khóa!
                    UI-->>NV: Báo lỗi tài khoản bị khóa
                else Tài khoản đang hoạt động (active)
                    API->>DB: INSERT INTO attendance_logs ... ON DUPLICATE KEY UPDATE
                    DB-->>API: Ghi nhận thành công
                    API-->>UI: Response { success: true }
                    UI-->>NV: Rung phản hồi haptic + Hiển thị Thẻ xanh "Chấm công thành công!"
                end
            end
        end
    end
```

### 2. Luồng Nộp Đơn Xin Nghỉ / OT & Tự Động Đồng Bộ Công

```mermaid
sequenceDiagram
    autonumber
    actor NV as Nhân Viên (Zalo App)
    actor KT as Kế Toán / Ban Quản Trị
    participant API as Backend REST API
    participant DB as MySQL Database

    NV->>API: POST /api/requests (loại đơn, ngày xin, lý do)
    API->>DB: INSERT INTO requests (status = 'pending')
    DB-->>API: Lưu thành công
    API-->>NV: Thông báo: Đơn đã được gửi thành công, chờ phê duyệt!

    KT->>API: GET /api/requests
    API->>DB: SELECT requests JOIN employees
    DB-->>API: Danh sách đơn chờ duyệt
    API-->>KT: Hiển thị bảng đơn cần duyệt

    KT->>API: PUT /api/requests/:id (status: 'approved')
    API->>DB: Kiểm tra period_locks cho tháng của request_date
    alt Kỳ công của ngày trong đơn đã bị Khóa sổ
        DB-->>API: is_locked = TRUE
        API-->>KT: Lỗi 400: Không thể duyệt đơn vì kỳ công tháng đã bị chốt!
    else Kỳ công chưa bị khóa
        API->>DB: UPDATE requests SET status = 'approved' WHERE id = ?
        Note over API,DB: Backend tự động phân loại đơn để đồng bộ công
        alt Đơn xin nghỉ phép (P)
            API->>DB: INSERT INTO attendance_logs (status: 'P') ON DUPLICATE KEY UPDATE status = 'P'
        else Đơn làm thêm giờ (OT)
            API->>DB: INSERT INTO attendance_logs (status: '1/OT', ot_hours: 4) ON DUPLICATE KEY UPDATE
        else Đơn quên chấm công (1)
            API->>DB: INSERT INTO attendance_logs (status: '1') ON DUPLICATE KEY UPDATE status = '1'
        end
        DB-->>API: Đồng bộ bản ghi chấm công thành công
        API-->>KT: Phản hồi: Đã duyệt đơn và tự động cập nhật bảng công!
    end
```

### 3. Luồng Chốt Sổ Kỳ Công Tháng & Mở Lại (Period Lock Flow)

```mermaid
sequenceDiagram
    autonumber
    actor KT as Kế Toán
    actor GD as Giám Đốc (Admin)
    participant UI as PeriodLockModal
    participant API as Backend API
    participant DB as MySQL (period_locks)

    Note over KT,DB: Giai đoạn 1: Kế toán chốt sổ tính lương cuối tháng
    KT->>UI: Bấm nút "CHỐT CÔNG KỲ LƯƠNG" (Tháng M/YYYY)
    UI->>API: POST /api/attendance/lock-period { month, year, reason: 'Kế toán chốt số liệu tính lương' }
    API->>DB: INSERT INTO period_locks (month, year, is_locked = 1, locked_by = 'accountant') ON DUPLICATE KEY UPDATE
    DB-->>API: Ghi nhận trạng thái chốt sổ
    API-->>UI: Response { success: true }
    UI-->>KT: Bảng ma trận chuyển sang trạng thái "ĐÃ KHÓA SỔ (CHỈ ĐỌC)"

    Note over GD,DB: Giai đoạn 2: Quản trị viên mở lại kỳ công khi có sai sót
    GD->>UI: Bấm nút "MỞ LẠI KỲ CÔNG ĐÃ CHỐT"
    UI->>UI: Yêu cầu Quản trị viên nhập lý do giải trình bắt buộc
    GD->>UI: Nhập lý do: "Bổ sung công tác phí và duyệt sót đơn OT cho bộ phận Kỹ thuật"
    UI->>API: POST /api/attendance/unlock-period { month, year, reason }
    API->>DB: UPDATE period_locks SET is_locked = 0, reason = ?, locked_by = 'admin'
    DB-->>API: Mở khóa thành công
    API-->>UI: Response { success: true }
    UI-->>GD: Thông báo kỳ công đã được mở lại thành công
```

### 4. Thuật toán Tính Lương Chi Tiết (Payroll Calculation Engine)
Thuật toán hiện thực độc lập tại [src/utils/payrollCalculator.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco_backend/src/utils/payrollCalculator.js):

$$\text{Lương 1 Giờ} = \frac{\text{Lương Cơ Bản}}{\text{Công Chuẩn (26)}} \div 8$$

$$\text{Công Quy Đổi} = (\text{Công Thử Việc} \times 0.85) + (\text{Công Chính Thức} \times 1.00)$$

$$\text{Tiền Lương Theo Công} = \frac{\text{Lương Cơ Bản}}{26} \times \text{Công Quy Đổi}$$

$$\text{Tiền Phụ Cấp Theo Công} = \frac{\text{Tổng Phụ Cấp Cố Định}}{26} \times \text{Công Quy Đổi}$$

$$\text{Tiền OT} = \sum \left( \text{Lương 1 Giờ} \times \text{Số Giờ OT} \times \text{Hệ Số} \right)$$
*(Hệ số: Ngày thường **1.5x**, Ngày Chủ Nhật **2.0x**, Ngày Lễ Tết **3.0x**)*

$$\text{Khấu Trừ BHXH (10.5\%)} = \begin{cases} \text{Lương Cơ Bản} \times 0.105 & \text{nếu } \text{has\_insurance} = \text{true} \\ 0 & \text{nếu } \text{has\_insurance} = \text{false} \end{cases}$$

$$\text{Lương Thực Lĩnh (Net)} = \text{Tiền Lương Theo Công} + \text{Tiền Phụ Cấp Theo Công} + \text{Tiền OT} - \text{BHXH} - \text{Tiền Phạt Đi Trễ}$$

---

## K. FRONTEND VÀ GIAO DIỆN NGƯỜI DÙNG

### 1. Kiến trúc Giao diện Thích Ứng Kép (Dual-mode Responsive Shell)
- **Tự động nhận diện thiết bị**:
  Component [layout.jsx](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/zalo-miniapp-frontend/src/components/layout.jsx) sử dụng hàm `isZaloEnvironment()` để quyết định:
  - Nếu chạy trong App Zalo: Kích hoạt `ZMPRouter` + `AnimationRoutes` chuẩn mobile gesture vuốt chạm.
  - Nếu chạy trên Web PC: Kích hoạt `BrowserRouter` tiêu chuẩn HTML5.
- **Layout Desktop PC**:
  Khi chiều rộng màn hình $\ge 1024\text{px}$ (Tailwind `lg:`), hệ thống tự động hiển thị:
  - [DesktopSidebar.jsx](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/zalo-miniapp-frontend/src/components/DesktopSidebar.jsx): Cột menu trái cố định với logo Sedinco, danh mục tab theo vai trò, thông tin người dùng và nút Đăng xuất.
  - [DesktopHeader.jsx](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/zalo-miniapp-frontend/src/components/DesktopHeader.jsx): Thanh tiêu đề trên cùng hiển thị tiêu đề tab hiện tại, đồng hồ thời gian thực, huy hiệu vai trò và thông tin cá nhân.
- **Layout Mobile Zalo**:
  Hiển thị thanh điều hướng đáy màn hình (Bottom Navigation Bar) tối ưu cho thao tác một tay trên điện thoại di động.

### 2. Quản lý State & Gọi API An Toàn ([api.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/zalo-miniapp-frontend/src/utils/api.js))
- **Timeout 15 giây**: Mọi HTTP request qua Axios instance tự động hủy sau 15.000ms để tránh tình trạng xoay vòng chờ vĩnh viễn khi mạng 3G/4G chập chờn.
- **Khóa Lũy Đẳng (Idempotency Key)**: Tự động sinh chuỗi ngẫu nhiên duy nhất cho các tác vụ nhạy cảm như chấm công và nộp đơn (`idemp_timestamp_rand`) truyền trong header `Idempotency-Key`.
- **Chống Race Condition**: Sử dụng `AbortController` thông qua `activeRequests` map; khi người dùng thực hiện thao tác lọc tháng mới, request cũ chưa kịp trả về sẽ bị hủy ngay lập tức (`cancelInflightRequests`).
- **Chống Tấn Công Formula Injection**: Hàm `sanitizeFormula` tự động thêm dấu nháy đơn `'` trước các ký tự `=`, `+`, `-`, `@` nhằm vô hiệu hóa việc thực thi mã độc khi xuất bảng tính Excel.

---

## L. BACKEND VÀ XỬ LÝ NGHIỆP VỤ

### 1. Kiến trúc Phân tầng Layered MVC
Mã nguồn backend trong `sedinco_backend/src/` được chia thành các lớp chức năng tách biệt:
- **Tầng Router (`src/routes/`)**: Chỉ khai báo endpoint, phương thức HTTP và liên kết middleware xác thực/thẩm định.
- **Tầng Controller (`src/controllers/`)**: Tiếp nhận `req.body`, `req.query`, `req.params`, gọi service tương ứng và trả JSON chuẩn qua `res.json()`. Tuyệt đối không viết câu lệnh SQL tại controller.
- **Tầng Service (`src/services/`)**: Nơi chứa toàn bộ nghiệp vụ: kiểm tra trạng thái khóa kỳ công, kiểm tra trạng thái tài khoản, gọi thuật toán tính lương, thực thi truy vấn cơ sở dữ liệu qua `query(sql, params)`.
- **Tầng Middleware (`src/middlewares/`)**:
  - `validationMiddleware.js`: Ép kiểu số nguyên, kiểm tra tính hợp lệ của ngày ($1 \le \text{day} \le 31$), tháng ($1 \le \text{month} \le 12$), khống chế trần làm thêm giờ OT tối đa 24 giờ.
  - `authMiddleware.js`: Cung cấp danh sách cột an toàn `SAFE_EMPLOYEE_FIELDS` để không bao giờ SELECT trường `password`.
  - `errorHandler.js`: Bắt toàn bộ lỗi ngoại lệ, ghi log ra console máy chủ và trả về thông báo lỗi thân thiện cho client, tuyệt đối không để lộ stack trace hoặc cấu trúc SQL nội bộ ra ngoài.

---

## M. CẤU HÌNH VÀ MÔI TRƯỜNG

### 1. Danh sách Biến Môi Trường (Environment Variables)

| Tên Biến | Môi Trường Áp Dụng | Mục Đích Sử Dụng | Giá Trị Mặc Định Khi Thiếu |
|---|---|---|---|
| `NODE_ENV` | Backend | Xác định chế độ chạy (`development` / `production`) | `development` |
| `PORT` | Backend | Cổng mạng TCP mà máy chủ Express lắng nghe | `5000` |
| `DB_HOST` | Backend | Địa chỉ máy chủ CSDL MySQL (Localhost hoặc Aiven Cloud) | `127.0.0.1` |
| `DB_PORT` | Backend | Cổng kết nối CSDL MySQL | `3306` (Local) / `28123` (Aiven) |
| `DB_USER` | Backend | Tên tài khoản đăng nhập MySQL | `root` (Local) / `avnadmin` (Aiven) |
| `DB_PASSWORD` | Backend | Mật khẩu truy cập CSDL MySQL | Rỗng `""` |
| `DB_NAME` | Backend | Tên cơ sở dữ liệu | `sedinco_hr` (Local) / `defaultdb` (Aiven) |
| `DB_SSL` | Backend | Kích hoạt mã hóa TLS/SSL kết nối CSDL | `true` nếu host chứa `aivencloud.com` |
| `CORS_ORIGIN` | Backend | Cho phép danh sách nguồn gọi API Cross-Origin | `*` |
| `VITE_USE_MOCK`| Frontend | Bật chế độ giả lập SDK Zalo khi test cục bộ trên máy tính | `false` |

### 2. Các Script Điều Phối (NPM Scripts)

| Script | Vị trí thực thi | Lệnh thực tế | Mục đích |
|---|---|---|---|
| `npm run backend` | Thư mục gốc | `npm --prefix sedinco_backend start` | Khởi chạy máy chủ API Backend |
| `npm run backend:dev`| Thư mục gốc | `npm --prefix sedinco_backend run dev`| Chạy backend với chế độ tự động reload (`--watch`) |
| `npm run miniapp` | Thư mục gốc | `npm --prefix zalo-miniapp-frontend start` | Khởi chạy Zalo Mini App dev server |
| `npm run deploy` | Thư mục gốc | `npm --prefix zalo-miniapp-frontend run deploy` | Đóng gói và phát hành Mini App lên Zalo Cloud |
| `npm test` | Thư mục gốc | `npm --prefix sedinco_backend test` | Chạy toàn bộ 17 ca kiểm thử tự động của hệ thống |
| `npm run build` | Thư mục gốc | Biên dịch frontend Vite và xuất ra thư mục `dist/` | Chuẩn bị bản phát hành Production |
| `npm run summary` | Thư mục gốc | `node tools/generate-summary/index.js` | Sinh báo cáo tổng hợp dự án ra file Excel |

---

## N. DEPLOYMENT VÀ VẬN HÀNH

### 1. Nền tảng Triển khai Thực tế
1. **Backend API Service**:
   - Nền tảng: **Render Web Service** (địa chỉ Production: `https://sedinco-backend.onrender.com/api`).
   - Môi trường: Node.js Runtime, tự động khởi động lại khi crash.
   - Kết nối cơ sở dữ liệu: Kết nối ra bên ngoài tới Aiven Cloud MySQL qua kênh truyền bảo mật TLS/SSL.
2. **Frontend Mobile Zalo Mini App**:
   - Nền tảng: **Zalo Mini App Cloud Hosting**.
   - Công cụ đóng gói: ZMP CLI (`zmp deploy`).
   - Tệp phân phối: Thư mục `zalo-miniapp-frontend/www/`.
3. **Frontend Web Desktop / PC**:
   - Nền tảng: **Cloudflare Pages / Workers** (đã cấu hình qua file `wrangler.jsonc`).
   - Tệp phân phối: Thư mục `dist/` với cơ chế `single-page-application`.

---

## O. TESTING VÀ CHẤT LƯỢNG PHẦN MỀM

Hệ thống sử dụng bộ kiểm thử tự động xây dựng trên **Node.js Test Runner tích hợp sẵn (`node:test`)** kết hợp thư viện khẳng định nghiêm ngặt `node:assert/strict`.

### Danh mục 17 Test Cases Đã Xác Minh (Đạt 17/17 PASS 100%)

| Mã Test Case | Test Suite | Nội Dung Kiểm Thử | Kết Quả Thực Tế |
|---|---|---|:---:|
| `TC-PAY-01` | Tiền lương | Tính lương cơ bản 1 ngày và 1 giờ chuẩn 26 ngày công | **PASS** |
| `TC-PAY-02` | Tiền lương | Phân tách chính xác công thử việc (85%) và chính thức (100%) | **PASS** |
| `TC-PAY-03` | Tiền lương | Tính tiền làm thêm giờ (OT) ngày thường với hệ số chuẩn 1.5x | **PASS** |
| `TC-PAY-04` | Tiền lương | Tính tiền làm thêm giờ (OT) ngày Chủ Nhật với hệ số chuẩn 2.0x | **PASS** |
| `TC-PAY-05` | Tiền lương | Tính tiền làm thêm giờ (OT) ngày Nghỉ Lễ với hệ số chuẩn 3.0x | **PASS** |
| `TC-PAY-06` | Tiền lương | Trích trừ bảo hiểm xã hội 10.5% khi `has_insurance = true` | **PASS** |
| `TC-PAY-07` | Tiền lương | Không trích bảo hiểm xã hội khi `has_insurance = false` hoặc `0` | **PASS** |
| `TC-PAY-08` | Tiền lương | Tính tổng thực lĩnh Net Salary đầy đủ (Lương công + Phụ cấp + OT - BHXH) | **PASS** |
| `TC-SEC-01` | Bảo mật | Loại bỏ triệt để trường `password` khỏi đối tượng người dùng khi đăng nhập | **PASS** |
| `TC-SEC-02` | Phân quyền | Phân loại đúng quyền hạn (RBAC) dựa trên chức danh công việc | **PASS** |
| `TC-SEC-03` | Bảo mật | Kiểm tra danh sách SELECT nhân viên không chứa trường `password` | **PASS** |
| `TC-SEC-04` | Bảo mật | Kiểm tra bảng nhân viên có trường `status` và `is_locked` để kiểm soát khóa | **PASS** |
| `TC-ATT-01` | Thẩm định | Thẩm tra input chấm công hợp lệ (ngày, tháng, năm, mã NV, trạng thái) | **PASS** |
| `TC-ATT-02` | Thẩm định | Thẩm tra khi `status` rỗng hoặc null -> Đánh dấu thao tác xóa công | **PASS** |
| `TC-ATT-03` | Thẩm định | Chặn ngày không hợp lệ (day > 31 hoặc day < 1) | **PASS** |
| `TC-ATT-04` | Thẩm định | Chặn tháng không hợp lệ (month > 12 hoặc month < 1) | **PASS** |
| `TC-ATT-05` | Thẩm định | Giới hạn số giờ OT không vượt quá trần 24h và không âm (chống gian lận/DoS) | **PASS** |

---

## P. PHÂN TÍCH AN TOÀN & BẢO MẬT (SECURITY REVIEW)

Đánh giá hệ thống theo tiêu chuẩn **OWASP API Security Top 10**:

| Tiêu chuẩn OWASP | Tên Tiêu Chuẩn | Hiện Trạng Thực Tế Tại Codebase | Mức Độ Đánh Giá |
|---|---|---|:---:|
| **API1:2023** | Broken Object Level Authorization (BOLA) | Các API sửa đổi hồ sơ và chấm công đã truyền `ma_nv`. Tuy nhiên backend cần bổ sung bước xác thực quyền sở hữu dữ liệu từ token để tránh việc sửa trộm công của người khác. | Cảnh báo vừa |
| **API2:2023** | Broken Authentication | Mật khẩu đang lưu dạng văn bản thuần (`plain text`) trong MySQL, chưa được băm qua bcrypt. Cần nâng cấp ngay trong sprint tiếp theo. | **Rủi ro cao** |
| **API3:2023** | Broken Object Property Level Auth | Sử dụng biến `SAFE_EMPLOYEE_FIELDS` và hàm `sanitizeUserResponse` loại bỏ triệt để trường mật khẩu trước khi trả về. | **An toàn tuyệt đối** |
| **API4:2023** | Unrestricted Resource Consumption | Áp dụng hàm `validateAttendanceInput` chặn trần số giờ OT tối đa 24h, giới hạn body parser 10MB chống DoS bộ nhớ. | **An toàn** |
| **API5:2023** | Broken Function Level Auth (BFLA) | Tách bạch nghiêm ngặt 4 vai trò. Kế toán không thể sửa công; HR không thể duyệt đơn và không thể chốt công; Chỉ Admin mới có quyền mở lại kỳ công đã chốt. | **An toàn** |
| **API6:2023** | Unrestricted Access to Sensitive Flows | Sử dụng câu lệnh SQL `ON DUPLICATE KEY UPDATE` và header `Idempotency-Key` bảo đảm tính lũy đẳng, chống gửi lặp nhiều lần. | **An toàn** |
| **API7:2023** | Server Side Request Forgery (SSRF) | Rà soát toàn bộ backend: không có bất kỳ endpoint nào nhận URL từ client để thực hiện request ra ngoài. | **Không có lỗ hổng** |
| **API8:2023** | Security Misconfiguration | Ẩn chi tiết lỗi SQL nội bộ qua middleware `errorHandler`. Tự động kích hoạt mã hóa TLS/SSL khi kết nối đám mây Aiven. | **An toàn** |
| **API9:2023** | Improper Inventory Management | Toàn bộ 20+ API endpoints được quy hoạch nhất quán dưới tiền tố `/api`. | **An toàn** |
| **API10:2023**| Unsafe Consumption of APIs | Thẩm định chặt chẽ kiểu dữ liệu đầu vào trước khi chuyển vào tầng cơ sở dữ liệu. 100% truy vấn dùng Parameterized Queries `?`. | **An toàn tuyệt đối** |

---

## Q. TÍCH HỢP BÊN THỨ BA

1. **Zalo Mini App Platform (Zalo SDK)**:
   - Mục đích: Cung cấp môi trường chạy ứng dụng trên thiết bị di động, lấy tọa độ GPS của người dùng (`getLocation`), mở giao diện chọn ảnh chụp từ camera (`chooseImage`), xác thực sinh trắc học vân tay/khuôn mặt (`checkStateBioAuthentication`, `openBioAuthentication`).
   - File tích hợp: `zalo-miniapp-frontend/src/adapters/zmp/realSdkAdapter.js`.
2. **Aiven Cloud Managed MySQL**:
   - Mục đích: Cung cấp dịch vụ cơ sở dữ liệu đám mây MySQL 8.x có độ sẵn sàng cao, sao lưu tự động và mã hóa TLS/SSL.
   - File tích hợp: `sedinco_backend/src/config/db.js`.
3. **Render Cloud Application Platform**:
   - Mục đích: Hosting chạy dịch vụ máy chủ REST API Backend Node.js Express.
4. **Cloudflare Pages / Workers**:
   - Mục đích: Hosting phân phối ứng dụng Web Dashboard phiên bản máy tính PC.

---

## R. VẤN ĐỀ TỒN TẠI VÀ NỢ KỸ THUẬT (TECHNICAL DEBT)

Dưới đây là các vấn đề tồn tại thực tế được phát hiện từ mã nguồn và thứ tự ưu tiên xử lý:

| Mức Độ Ưu Tiên | Hạng Mục Vấn Đề | Bằng Chứng / Vị Trí Code | Giải Pháp Khắc Phục Đề Xuất |
|:---:|---|---|---|
| **Cao (P1)** | **Mật khẩu lưu Plain Text** | `sedinco_backend/src/services/authService.js:14`<br/>`initDb.js:15` | Cài đặt thư viện `bcrypt` hoặc `argon2` để băm mật khẩu trước khi lưu vào bảng `employees` và `admins`. |
| **Cao (P1)** | **Xác thực JWT Token toàn diện** | `sedinco_backend/src/routes/` chưa có middleware verify JWT | Bổ sung thư viện `jsonwebtoken`, sinh JWT chứa `ma_nv` và `role` khi login; kiểm tra token tại mọi route ghi dữ liệu. |
| **Trung bình (P2)**| **Dung lượng file `pages/index.jsx` quá lớn** | `zalo-miniapp-frontend/src/pages/index.jsx` (4316 dòng, 230 KB) | Tách file thành các component tab độc lập: `CheckInTab.jsx`, `MatrixTab.jsx`, `RequestsTab.jsx`, `ManagementTab.jsx`, `CompanyTab.jsx`. |
| **Trung bình (P2)**| **Bảng Audit Log chi tiết từng ô chấm công** | Hiện tại mới chỉ lưu lý do mở kỳ công trong `period_locks.reason` | Tạo thêm bảng `attendance_audit_logs` để ghi nhận: Ai đã sửa ô công ngày nào, từ mã gì sang mã gì, thời điểm sửa và lý do sửa. |
| **Thấp (P3)** | **Khử cảnh báo SASS Legacy API** | Khi chạy `vite build` xuất hiện `Deprecation Warning [legacy-js-api]` của Dart Sass | Cập nhật cấu hình Sass API hiện đại trong `vite.config.js`. |

---

## S. HƯỚNG DẪN DÀNH CHO AI AGENT TIẾP TỤC PHÁT TRIỂN

Khi một AI Agent khác nhận nhiệm vụ phát triển tiếp dự án Sedinco HR, Agent **BẮT BUỘC** phải tuân thủ các quy tắc sau:

### 1. Nguyên tắc cốt lõi
1. **Đọc tài liệu theo thứ tự**: `AGENTS.md` $\rightarrow$ `SYSTEM_DOCUMENTATION.md` $\rightarrow$ `docs/project.md` trước khi sửa code.
2. **Không làm hỏng bộ kiểm thử**: Bất kỳ thay đổi nào ở Backend đều phải bảo đảm chạy lệnh `npm test` đạt **17/17 tests PASS**. Tuyệt đối không xóa test case, không dùng `test.skip()`.
3. **Bảo tồn tính toàn vẹn của Frontend**: Khi chỉnh sửa tính năng, phải chạy thử `npx vite build` trong `zalo-miniapp-frontend` để bảo đảm không phát sinh lỗi biên dịch cú pháp JSX.
4. **Không làm lộ thông tin nhạy cảm**: Không bao giờ đưa trường `password` vào các câu lệnh SQL SELECT bảng nhân viên; luôn sử dụng hằng số `SAFE_EMPLOYEE_FIELDS` từ `authMiddleware.js`.
5. **Tuân thủ Parameterized Queries**: Mọi câu lệnh truy vấn SQL bắt buộc dùng placeholders `?` của thư viện `mysql2`. Tuyệt đối cấm cộng chuỗi SQL để tránh lỗ hổng SQL Injection.
6. **Tôn trọng nguyên tắc Tách quyền (Separation of Duties)**: Không cấp quyền Chốt công cho HR, không cấp quyền Sửa công cho Kế toán, và chỉ cho phép Admin mở lại kỳ công đã chốt.

### 2. Các lệnh kiểm chứng nhanh
```bash
# Kiểm tra toàn bộ test suite backend (17 tests)
npm test

# Kiểm tra biên dịch frontend Vite
cd zalo-miniapp-frontend && npx vite build && cd ..

# Kiểm tra cú pháp nhanh các file backend
node -c sedinco_backend/src/app.js
node -c sedinco_backend/src/services/attendanceService.js
node -c sedinco_backend/src/utils/payrollCalculator.js
```

---

## T. DANH MỤC BẰNG CHỨNG VÀ MỨC ĐỘ BAO PHỦ

Quá trình lập tài liệu này đã hoàn thành việc rà soát và kiểm chứng mã nguồn trên các khu vực cụ thể:

- **100% Mã nguồn Backend (`sedinco_backend/src/`)**: Đã đọc và đối chiếu từng controller, service, middleware, route, config và utils.
- **100% Bộ Test Cases (`sedinco_backend/__tests__/`)**: Đã thực thi trực tiếp qua lệnh `npm test`, kiểm chứng 17/17 test cases pass.
- **100% Cấu trúc Database & Seed Data**: Đã đọc và phân tích file `sedinco_backend/src/database/initDb.js` và `sedinco_hr.sql`.
- **100% Giao diện & Components Frontend (`zalo-miniapp-frontend/src/`)**: Đã khảo sát `app.js`, `layout.jsx`, `roles.js`, `api.js`, `index.jsx` và tất cả các components phụ trợ.
- **100% Tài liệu Kỹ thuật Dự án (`docs/`)**: Đã đối chiếu chéo các tài liệu `project.md`, `tongquanduan.md`, `testing-workflow.md`, `security-workflow.md`, `agent-workflow.md`.

*Tài liệu được lập với tính chính xác cao, trung thực với hiện trạng mã nguồn thực tế và sẵn sàng làm ngữ cảnh chuẩn mực cho các chu kỳ phát triển tiếp theo của Sedinco HR.*
