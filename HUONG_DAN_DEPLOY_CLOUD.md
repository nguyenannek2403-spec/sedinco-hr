# HƯỚNG DẪN TRIỂN KHAI HỆ THỐNG SEDINCO HR LÊN CLOUD
*(Frontend: Vercel | Backend: Render | Database: Aiven for MySQL)*

---

## MỤC LỤC
1. [Tổng quan Kiến trúc Hệ thống](#1-tổng-quan-kiến-trúc-hệ-thống)
2. [Bước 1: Khởi tạo & Cấu hình Database trên Aiven](#bước-1-khởi-tạo--cấu-hình-database-trên-aiven)
3. [Bước 2: Triển khai Backend API lên Render](#bước-2-triển-khai-backend-api-lên-render)
4. [Bước 3: Triển khai Frontend Admin Web lên Vercel](#bước-3-triển-khai-frontend-admin-web-lên-vercel)
5. [Bước 4: Cấu hình Zalo App / Mobile App (Nếu dùng)](#bước-4-cấu-hình-zalo-app--mobile-app-nếu-dùng)
6. [Các lưu ý quan trọng khi vận hành Cloud Free Tier](#các-lưu-ý-quan-trọng-khi-vận-hành-cloud-free-tier)

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG

```
[Trình duyệt Web Admin]  --->  Vercel (Frontend React Vite)
       |                              |
       | (Gọi API qua HTTPS)          | (Rewrite SPA qua vercel.json)
       v                              v
[Render Web Service]    <---  Node.js + Express Backend (sedinco_backend)
       |
       | (Kết nối SSL Pool an toàn)
       v
[Aiven Cloud]           <---  Managed MySQL Database (sedinco_hr / defaultdb)
```

---

## BƯỚC 1: KHỞI TẠO & CẤU HÌNH DATABASE TRÊN AIVEN

Aiven cung cấp dịch vụ Managed MySQL trên nền tảng đám mây với độ bảo mật cao, hỗ trợ kết nối SSL mã hóa.

### 1.1. Tạo tài khoản & Khởi tạo MySQL Service
1. Truy cập [https://aiven.io](https://aiven.io) và đăng ký tài khoản (bằng Google hoặc GitHub).
2. Tại màn hình Dashboard, nhấn **Create Service**.
3. Chọn loại dịch vụ: **MySQL**.
4. Chọn Cloud Provider & Vùng (Region):
   - **Provider**: AWS hoặc Google Cloud.
   - **Region**: Chọn **Singapore (ap-southeast-1)** để có tốc độ kết nối về Việt Nam nhanh nhất và độ trễ thấp nhất.
5. Chọn Gói dịch vụ (Service Plan):
   - Chọn gói **Free** (nếu tài khoản mới có ưu đãi dùng thử) hoặc gói **Startup / Hobbyist**.
6. Đặt tên Service: `sedinco-mysql` -> Nhấn **Create Service**.
7. Chờ 2 - 3 phút để trạng thái chuyển từ *Rebuilding* sang **RUNNING**.

### 1.2. Lấy thông tin kết nối (Connection Parameters)
Tại trang **Overview** của Service vừa tạo trên Aiven, bạn sẽ thấy mục **Connection parameters**:
- **Host**: Ví dụ `mysql-xxxx-yourname.a.aivencloud.com`
- **Port**: Ví dụ `28123` (Cổng Aiven ngẫu nhiên, không phải 3306 mặc định)
- **User**: Thường mặc định là `avnadmin`
- **Password**: Bấm nút con mắt hoặc nút **Copy password**
- **Database**: Thường mặc định là `defaultdb`

> 💡 *Lưu ý: Backend của chúng ta đã được nâng cấp tự động kích hoạt chế độ mã hóa SSL khi phát hiện tên miền `aivencloud.com` hoặc có biến môi trường `DB_SSL=true`.*

### 1.3. Import Cấu trúc & Dữ liệu (`sedinco_hr.sql`) vào Aiven
Mở Terminal trên máy tính của bạn và chạy lệnh sau để nạp dữ liệu từ file `sedinco_hr.sql` vào cơ sở dữ liệu Aiven:

```bash
mysql -h <HOST_AIVEN> -P <PORT_AIVEN> -u avnadmin -p --ssl-mode=REQUIRED defaultdb < sedinco_hr.sql
```
*(Nhập mật khẩu Aiven khi được yêu cầu)*

**Hoặc dùng phần mềm giao diện đồ họa (DBeaver / Navicat / HeidiSQL):**
1. Mở DBeaver -> Tạo kết nối **MySQL**.
2. Điền `Host`, `Port`, `Database` (`defaultdb`), `Username` (`avnadmin`), `Password`.
3. Tab **SSL**: Tích chọn **Use SSL** (chọn Trust server certificate).
4. Nhấn **Test Connection** -> Khi báo thành công, mở database -> Chuột phải chọn **Tools** -> **Execute Script** -> Chọn file `sedinco_hr.sql` và nhấn Start.

---

## BƯỚC 2: TRIỂN KHAI BACKEND API LÊN RENDER

Render là nền tảng máy chủ đám mây rất phù hợp để chạy ứng dụng Node.js Express.

### 2.1. Đẩy code lên GitHub
Nếu dự án chưa có trên GitHub:
```bash
git init
git add .
git commit -m "Deploy Sedinco HR to Cloud"
git remote add origin https://github.com/your-username/sedinco-hr.git
git branch -M main
git push -u origin main
```

### 2.2. Tạo Web Service trên Render
1. Truy cập [https://render.com](https://render.com) và đăng nhập bằng GitHub.
2. Bấm nút **New +** ở góc trên bên phải -> Chọn **Web Service**.
3. Chọn kho mã nguồn (Repository) `sedinco-hr` vừa đẩy lên -> Nhấn **Connect**.

### 2.3. Thiết lập thông số cấu hình Web Service
Điền chính xác các mục sau:
- **Name**: `sedinco-backend`
- **Region**: `Singapore` (trùng với vùng Aiven MySQL để tốc độ nhanh nhất)
- **Branch**: `main`
- **Root Directory**: `sedinco_backend` *(⚠️ Cực kỳ quan trọng: Phải điền mục này vì mã nguồn backend nằm trong thư mục con!)*
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Instance Type**: `Free`

### 2.4. Khai báo Biến Môi trường (Environment Variables)
Kéo xuống phần **Environment Variables**, bấm **Add Environment Variable** và thêm các biến tương ứng từ Aiven:

| Tên biến (Key) | Giá trị (Value) | Giải thích |
|---|---|---|
| `DB_HOST` | `mysql-xxxx-yourname.a.aivencloud.com` | Host từ Aiven |
| `DB_PORT` | `28123` | Port từ Aiven |
| `DB_USER` | `avnadmin` | User Aiven |
| `DB_PASSWORD` | `mật_khẩu_aiven_của_bạn` | Password Aiven |
| `DB_NAME` | `defaultdb` | Tên database trên Aiven |
| `DB_SSL` | `true` | Bật chứng chỉ SSL cho MySQL |
| `PORT` | `5000` | Port chạy backend trên Render |

### 2.5. Bấm Create Web Service & Kiểm tra
1. Nhấn nút **Create Web Service**. Render sẽ bắt đầu build và khởi động ứng dụng.
2. Theo dõi tab **Logs**, khi thấy 2 dòng sau là thành công:
   ```
   ✅ Server Backend đang chạy tại cổng 5000
   ✅ Đã kết nối MySQL Pool thành công (...aivencloud.com:28123/defaultdb)!
   ```
3. Copy đường link Backend mà Render cấp cho bạn (nằm ngay dưới tên dịch vụ), ví dụ:
   `https://sedinco-backend.onrender.com`
4. Kiểm tra trên trình duyệt: Truy cập `https://sedinco-backend.onrender.com/api/health`
   Nếu nhận về `{ "status": "healthy", "uptime": ... }` là Backend đã sẵn sàng 100%!

---

## BƯỚC 3: TRIỂN KHAI FRONTEND ADMIN WEB LÊN VERCEL

Vercel là nền tảng tối ưu hàng đầu cho các ứng dụng React + Vite, hỗ trợ CDN toàn cầu và SSL tự động.

### 3.1. Tạo dự án mới trên Vercel
1. Truy cập [https://vercel.com](https://vercel.com) và đăng nhập bằng tài khoản GitHub.
2. Tại màn hình Dashboard, nhấn nút **Add New...** -> Chọn **Project**.
3. Tìm và chọn repository `sedinco-hr` -> Nhấn **Import**.

### 3.2. Cấu hình cài đặt trên Vercel
1. **Framework Preset**: Chọn `Vite` (Vercel thường sẽ tự nhận diện).
2. **Root Directory**:
   - Nhấn nút **Edit** bên cạnh mục Root Directory.
   - Chọn thư mục **`admin-web`** -> Nhấn **Continue**.
   *(⚠️ Bắt buộc: Giúp Vercel biết mã nguồn frontend nằm trong folder `admin-web`)*.
3. **Build Command**: Giữ mặc định `npm run build`.
4. **Output Directory**: Giữ mặc định `dist`.

### 3.3. Cấu hình Biến Môi trường (Environment Variables)
Mở mục **Environment Variables** và thêm biến sau:
- **Key**: `VITE_API_URL`
- **Value**: `https://sedinco-backend.onrender.com/api` *(Dán URL Render Backend của bạn vào, lưu ý có thêm đuôi `/api` ở cuối)*.

### 3.4. Bấm Deploy & Trải nghiệm
1. Nhấn nút **Deploy**. Vercel sẽ tự động cài đặt thư viện và build dự án (~30-60 giây).
2. Khi hoàn tất, Vercel sẽ hiển thị hiệu ứng pháo hoa chúc mừng và cấp tên miền cho bạn (ví dụ: `https://sedinco-admin.vercel.app`).
3. Truy cập link:
   - Đăng nhập bằng tài khoản Quản trị:
     - Tên đăng nhập: `admin`
     - Mật khẩu: `123456`
   - Kiểm tra các trang: Bảng Chấm Công, Danh Sách Nhân Sự, Bảng Lương, Quản Lý Đơn Từ.
   - Nhờ file cấu hình `admin-web/vercel.json` đã được chuẩn bị sẵn, bạn có thể thoải mái F5 hoặc chia sẻ link trực tiếp mà không bao giờ bị lỗi `404: Page Not Found`.

---

## BƯỚC 4: CẤU HÌNH ZALO APP / MOBILE APP (NẾU DÙNG)

Nếu bạn xuất bản hoặc chạy ứng dụng nhân viên `sedinco-zalo-app`:
1. Mở file [sedinco-zalo-app/App.js](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/sedinco-zalo-app/App.js)
2. Cập nhật biến `API_BASE` ở dòng 40 trỏ về Render Backend:
   ```javascript
   const API_BASE = "https://sedinco-backend.onrender.com/api";
   ```
3. Chạy lệnh deploy Zalo Mini App theo quy trình Zalo Mini App CLI (`zmp deploy`).

---

## CÁC LƯU Ý QUAN TRỌNG KHI VẬN HÀNH CLOUD FREE TIER

1. **Hiện tượng "Cold Start" (Ngủ đông) của Render Free:**
   - Trên gói Free của Render, nếu không có request trong vòng 15 phút, server sẽ tạm dừng (Sleep).
   - Lần đầu tiên truy cập lại sau khi ngủ, trang sẽ mất khoảng 30 - 50 giây để "thức dậy". Sau đó hệ thống sẽ phản hồi rất nhanh bình thường.
   - *Mẹo giữ server luôn thức miễn phí:* Dùng dịch vụ miễn phí như [UptimeRobot](https://uptimerobot.com) hoặc [Cron-job.org](https://cron-job.org) để gửi 1 request GET mỗi 10 phút tới URL `https://sedinco-backend.onrender.com/api/health`.

2. **Dung lượng & Kết nối của Aiven Free:**
   - Aiven giới hạn số kết nối đồng thời. Hệ thống Backend của bạn đã được tối ưu hóa với `connectionLimit: 10` và giải phóng connection tự động, đảm bảo không bao giờ bị nghẽn pool.

3. **Bảo mật CORS:**
   - Backend hiện tại đã cho phép tất cả các nguồn gốc (`cors()`), giúp Frontend Vercel và Zalo Mini App gọi API mượt mà không gặp rào cản domain.

---
*Bản quyền tài liệu: Hệ thống Quản trị Nhân sự & Chấm công Sedinco HR*
