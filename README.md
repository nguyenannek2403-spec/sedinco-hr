# Sedinco HR — Hệ Thống Quản Trị Nhân Sự & Chấm Công Doanh Nghiệp

Sedinco HR là hệ thống quản trị nhân sự, chấm công ma trận hàng ngày, tính lương tự động và quản lý đơn từ phê duyệt dành cho Công ty Cổ phần Vật Liệu Xây Dựng Sedinco. Hệ thống bao gồm Web Dashboard quản trị đa vai trò (Admin, Kế toán, Nhân viên) xây dựng trên React + Vite, dịch vụ Backend REST API trên Node.js Express kết nối MySQL, và ứng dụng di động cán bộ nhân viên trên Expo React Native.

---

## 🚀 Tính Năng Chính (Hiện Có Trong Code)

- **Xác thực & Phân quyền Đa Vai Trò (RBAC)**:
  - Ban Giám Đốc (Admin): Toàn quyền xem KPI tổng thể, quản lý nhân sự, chấm công toàn công ty, duyệt đơn từ, tính lương và cấu hình doanh nghiệp.
  - Kế Toán: Quản lý chấm công, duyệt đơn cập nhật công, quản lý bảng lương chi tiết và danh sách nhân sự (ẩn cài đặt cấu hình công ty).
  - Cán Bộ Nhân Viên: Xem bảng chấm công cá nhân, theo dõi phiếu lương cá nhân, gửi đơn xin nghỉ phép/OT/báo quên chấm công.
- **Bảng Chấm Công Ma Trận (Attendance Matrix)**: Ghi nhận công chuẩn hàng ngày (1, 0.5, P, OT, 1/OT), hỗ trợ cập nhật từng ô và chỉnh sửa hàng loạt (Bulk edit).
- **Tính Lương Tự Động (Automated Payroll)**: Tự động tính lương dựa trên công chuẩn (26 ngày), phân tách công thử việc (hưởng 85%) và chính thức, tính hệ số làm thêm giờ (ngày thường 1.5x, Chủ nhật 2.0x, Lễ 3.0x), phụ cấp và trích nộp bảo hiểm (10.5%).
- **Quản Lý Đơn Từ (Request Approval Workflow)**: Nhân viên tạo đơn (nghỉ phép, làm thêm, quên chấm công); khi duyệt trạng thái `approved`, hệ thống tự động cập nhật nhật ký chấm công tương ứng.
- **Hồ Sơ Nhân Sự & Cấu Hình Công Ty**: Quản lý thông tin định danh, ngày vào làm/ngày chính thức, mức lương, phụ cấp, lịch nghỉ lễ và logo công ty.

---

## 🛠️ Công Nghệ & Phiên Bản

| Thành phần | Công nghệ chính | Phiên bản (Manifest/Lockfile) |
|---|---|---|
| **Root Workspace** | Node.js Monorepo, npm | Node.js >= 20, npm >= 10 |
| **Backend API** | Node.js, Express, mysql2, cors, dotenv | Express 5.2.1, mysql2 3.24.5 |
| **Admin Web** | React, Vite, Tailwind CSS, Lucide React, Axios | React 19.2.8, Vite 8.3.0, Tailwind 4.3.3 |
| **Mobile / Zalo App** | Expo, React Native, TypeScript, Lucide | Expo 57.0.27, React Native 0.86.3 |
| **Database** | MySQL | MySQL >= 8.0 (Hỗ trợ Aiven Cloud SSL) |

---

## 📋 Yêu Cầu Hệ Thống

- **Node.js**: Phiên bản 20.x trở lên (khuyên dùng Node 22 hoặc Node 24).
- **npm**: Phiên bản 10.x trở lên.
- **MySQL Server**: Cục bộ (Localhost cổng 3306) hoặc Cloud Managed MySQL (Aiven, Render, Railway).

---

## ⚙️ Cài Đặt & Khởi Chạy

### 1. Cài đặt dependencies
Chạy lệnh cài đặt tại thư mục gốc và từng thư mục con:
```bash
npm install
npm --prefix sedinco_backend install
npm --prefix admin-web install
npm --prefix sedinco-zalo-app install
```

### 2. Cấu hình biến môi trường
Sao chép file mẫu và điền thông tin kết nối phù hợp:
```bash
cp sedinco_backend/.env.example sedinco_backend/.env
cp admin-web/.env.example admin-web/.env
```

### 3. Nạp dữ liệu cơ sở dữ liệu mẫu
```bash
mysql -u root -p sedinco_hr < sedinco_hr.sql
```

### 4. Lệnh chạy dịch vụ (Development)
- **Khởi chạy Backend API** (cổng 5000 / 5001):
  ```bash
  npm run backend
  # hoặc: npm --prefix sedinco_backend start
  ```
- **Khởi chạy Admin Web Dashboard** (cổng 5173):
  ```bash
  npm run admin
  # hoặc: npm --prefix admin-web run dev
  ```
- **Khởi chạy Zalo / Mobile App**:
  ```bash
  npm run zalo
  # hoặc: npm --prefix sedinco-zalo-app run web
  ```

### 5. Build đóng gói cho môi trường Production
```bash
npm run build
```

---

## 🔑 Biến Môi Trường (Environment Variables)

### Backend (`sedinco_backend/.env`)
- `DB_HOST`: Địa chỉ host máy chủ MySQL (ví dụ: `127.0.0.1` hoặc endpoint Aiven Cloud).
- `DB_PORT`: Cổng kết nối MySQL (mặc định: `3306` hoặc cổng Aiven ngẫu nhiên).
- `DB_USER`: Tên tài khoản kết nối MySQL.
- `DB_PASSWORD`: Mật khẩu tài khoản kết nối MySQL.
- `DB_NAME`: Tên cơ sở dữ liệu (`sedinco_hr` hoặc `defaultdb`).
- `DB_SSL`: Thiết lập `true` để kích hoạt kết nối bảo mật SSL (bắt buộc khi dùng Aiven Cloud).
- `PORT`: Cổng lắng nghe của máy chủ Express (mặc định: `5000`).

### Frontend Admin (`admin-web/.env`)
- `VITE_API_URL`: Đường dẫn gốc tới Backend API (ví dụ: `http://localhost:5000/api` hoặc URL Cloud).

---

## 🧪 Kiểm Thử & Kiểm Tra Mã Nguồn (Testing & Linting)

- **Chạy kiểm thử Backend**:
  ```bash
  npm --prefix sedinco_backend test
  ```
- **Kiểm tra cú pháp & Lint Frontend**:
  ```bash
  npm --prefix admin-web run lint
  ```

---

## 📁 Cấu Trúc Thư Mục Rút Gọn

```
sedinco-hr/
├── admin-web/              # Ứng dụng Dashboard Quản trị (React + Vite)
│   ├── src/
│   │   ├── App.jsx         # Giao diện chính: Login, Bảng công, Lương, Đơn từ, Nhân sự
│   │   └── main.jsx        # Điểm khởi đầu ứng dụng React
│   └── package.json
├── sedinco_backend/        # Dịch vụ Backend REST API (Express + MySQL)
│   ├── server.js           # Định nghĩa toàn bộ API routes, kết nối DB & tính toán
│   ├── __tests__/          # Bộ kiểm thử tự động (Unit & Integration tests)
│   └── package.json
├── sedinco-zalo-app/       # Ứng dụng Di động / Zalo Mini App (Expo React Native)
│   ├── App.js              # Màn hình chấm công di động, xem phiếu lương nhân viên
│   └── package.json
├── docs/                   # Tài liệu kỹ thuật, quy trình và báo cáo kiểm toán
│   ├── project.md          # Chi tiết kỹ thuật hệ thống, API, Data Models
│   ├── tongquanduan.md     # Tổng quan dự án, sơ đồ luồng nghiệp vụ
│   ├── agent-workflow.md   # Quy tắc làm việc chuẩn dành cho AI Agent
│   ├── testing-workflow.md # Quy trình kiểm thử và kịch bản testcase
│   ├── security-workflow.md# Quy trình rà soát an toàn thông tin & OWASP
│   ├── testing/            # Sổ testcase và báo cáo kết quả kiểm thử
│   └── security/           # Báo cáo kiểm toán an ninh mạng & file Excel
├── sedinco_hr.sql          # Bản xuất cấu trúc và dữ liệu mẫu MySQL
├── AGENTS.md               # Chỉ dẫn nhập môn nhanh dành cho AI Agent
└── package.json            # Root manifest điều phối scripts toàn dự án
```

---

## 📚 Tài Liệu Bổ Sung Trong `docs/`

- [docs/project.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/project.md): Chi tiết kiến trúc, API, mô hình dữ liệu và các vùng nhạy cảm.
- [docs/tongquanduan.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/tongquanduan.md): Bản thuyết minh dự án và sơ đồ luồng quy trình nghiệp vụ.
- [docs/agent-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/agent-workflow.md): Hướng dẫn tiêu chuẩn phát triển và quy trình bảo vệ mã nguồn.
- [docs/testing-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/testing-workflow.md): Phương pháp kiểm thử, danh mục testcase P0/P1/P2.
- [docs/security-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/security-workflow.md): Quy trình kiểm tra bảo mật OWASP và sổ theo dõi an toàn thông tin.
