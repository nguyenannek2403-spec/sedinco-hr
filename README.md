# Sedinco HR — Hệ Thống Chấm Công & Tiền Lương Doanh Nghiệp

Dự án Sedinco HR được tổ chức theo mô hình **Monorepo chuẩn hóa**, bao gồm hai thành phần cốt lõi sẵn sàng vận hành và triển khai lên môi trường Production / Cloud:

```
sedinco-hr/
├── sedinco_backend/         # Máy chủ REST API (Node.js Express + MySQL)
├── zalo-miniapp-frontend/   # Ứng dụng di động Zalo Mini App (ZMP SDK + React)
├── package.json             # Lệnh điều phối khởi chạy & kiểm thử toàn dự án
├── .gitignore               # Bộ lọc bỏ qua node_modules, build & env bảo mật
├── sedinco_hr.sql           # Cấu trúc CSDL và dữ liệu hạt giống ban đầu
├── README.md                # Tài liệu tổng quan dự án
├── AGENTS.md                # Quy chuẩn hoạt động cho AI Agent
└── docs/
    └── PROJECT.md           # Tài liệu kỹ thuật, kiến trúc & nghiệp vụ toàn diện
```

---

## 🚀 1. Cấu Trúc Các Thành Phần

### 📦 Backend (`sedinco_backend/`)
- **Công nghệ**: Node.js, Express 5.x, MySQL2 Connection Pool, CORS, Dotenv.
- **Kiến trúc phân tầng**:
  - `src/config/`: Cấu hình kết nối MySQL và biến môi trường.
  - `src/controllers/`: Tiếp nhận HTTP Request và điều hướng JSON Response.
  - `src/services/`: Nghiệp vụ tính lương tự động, ma trận công, quy trình duyệt đơn.
  - `src/routes/`: 25 REST API endpoints (`/api/...`).
  - `src/middlewares/`: Thẩm tra dữ liệu đầu vào, phân quyền RBAC 3 role, kiểm soát bảo mật và xử lý lỗi tập trung.
  - `src/database/`: Tự động khởi tạo schema 10 bảng (`initDb.js`) và nạp seed data.
  - `src/utils/`: Công thức tính lương độc lập (`payrollCalculator.js`), hỗ trợ GPS (`geoHelper.js`), Dynamic QR (`dynamicQrHelper.js`).
  - `__tests__/`: 41 test cases tự động (`node:test`) kiểm thử chống gian lận, tiền lương, RBAC và chu trình mô phỏng 3 roles.
- **Triển khai Cloud**: Render Web Service (kết nối Aiven Cloud MySQL qua TLS/SSL).

### 📱 Frontend (`zalo-miniapp-frontend/`)
- **Công nghệ**: Zalo Mini App SDK (`zmp-sdk`, `zmp-ui`), React 18, Vite, Tailwind CSS, Lucide React.
- **Chức năng người dùng**:
  - Chấm công vào/ra hàng ngày, định vị GPS an toàn & quét Dynamic QR.
  - Theo dõi ma trận bảng công tháng cá nhân.
  - Xem chi tiết phiếu lương tự động hàng tháng.
  - Nộp đơn xin nghỉ phép, báo làm thêm giờ (OT), báo quên chấm công.
  - Bảng quản trị Web PC duyệt đơn, quản lý nhân sự & phân quyền Kế toán dành cho Ban Giám Đốc.
- **Triển khai**: Đóng gói và phát hành trực tiếp qua Zalo Mini App CLI (`zmp deploy`).

---

## ⚙️ 2. Hướng Dẫn Cài Đặt & Khởi Chạy

### Cài đặt dependencies cho cả hai thành phần
```bash
# 1. Cài đặt phụ thuộc Backend
cd sedinco_backend && npm install && cd ..

# 2. Cài đặt phụ thuộc Frontend
cd zalo-miniapp-frontend && npm install && cd ..
```

### Khởi chạy dịch vụ từ thư mục gốc
- **Khởi chạy Backend API** (cổng 5001 / 5000):
  ```bash
  npm run backend
  ```
- **Khởi chạy Frontend Zalo Mini App & Admin Web**:
  ```bash
  npm run miniapp
  ```
- **Chạy toàn bộ 41 ca kiểm thử tự động Backend**:
  ```bash
  npm test
  ```

---

## 🔑 3. Cấu Hình Biến Môi Trường (.env)

- **Backend** (`sedinco_backend/.env`):
  ```env
  PORT=5000
  DB_HOST=mysql-xxxx.aivencloud.com
  DB_PORT=23807
  DB_USER=avnadmin
  DB_PASSWORD=your_password
  DB_NAME=defaultdb
  DB_SSL=true
  CORS_ORIGIN=*
  ```
- **Frontend** (`zalo-miniapp-frontend/src/utils/api.js`):
  Mặc định kết nối tới Backend Production: `https://sedinco-backend.onrender.com/api` hoặc `http://localhost:5000/api` khi chạy cục bộ.

---

## 📚 4. Tài Liệu Dự Án
- [docs/PROJECT.md](docs/PROJECT.md): Tài liệu kỹ thuật, kiến trúc phân tầng, 14 chức năng, 10 bảng CSDL và checklist kiểm thử.
- [AGENTS.md](AGENTS.md): Quy chuẩn tác vụ, lệnh thực thi và tiêu chuẩn hoàn thành DoD cho AI Agent.
- [CHANGELOG.md](CHANGELOG.md): Nhật ký phiên bản và lịch sử phát hành.

