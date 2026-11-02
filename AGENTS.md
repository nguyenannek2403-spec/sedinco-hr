# Hướng Dẫn Tác Vụ Dành Cho AI Agent (Sedinco HR)

Tài liệu xác lập các quy tắc bắt buộc, lệnh thực thi và tiêu chuẩn hoàn thành cho mọi AI Agent hoạt động trên repository **Sedinco HR**.

---

## 🎯 1. Nguyên Tắc Cốt Lõi (Core Rules)
1. **Nguồn sự thật duy nhất**: Chỉ căn cứ vào mã nguồn thực tế, schema MySQL và output lệnh thực tế. Gắn nhãn `[ĐÃ XÁC MINH L?]`, `[SUY LUẬN]`, hoặc `[CHƯA XÁC MINH]`.
2. **Chuẩn hóa đúng 3 Role**: Hệ thống chỉ chấp nhận 3 vai trò: `worker` (công nhân / nhân viên), `accountant` (kế toán), `admin` (quản trị). Tuyệt đối không tạo role thứ 4 (`hr`, `manager`).
3. **Môi trường an toàn**: Chỉ thao tác trên môi trường local với CSDL test (`sedinco_hr_test`). Không bao giờ chạy lệnh phá hủy (`rm -rf`, `DROP DATABASE`, `git push --force`, `git reset --hard`).
4. **Không để lộ bí mật**: Tuyệt đối không đưa API secret, token, mật khẩu thật vào code, tài liệu `.md` hay git history.
5. **Bảo tồn phạm vi**: Chỉ chỉnh sửa frontend trong `zalo-miniapp-frontend/` khi phục vụ các thành phần Admin Web hoặc có yêu cầu trực tiếp từ người dùng; không làm sai lệch SDK Zalo Mini App.
6. **Chuẩn mực ngôn từ**: Cấm sử dụng các từ ngữ khẳng định tuyệt đối chưa qua kiểm chứng thực địa như "hoàn thiện", "triệt để", "100%", "sẵn sàng". Luôn phân loại 4 trạng thái: `PASS`, `FAIL`, `KHÔNG KIỂM CHỨNG ĐƯỢC`, `CẦN NGƯỜI THỬ`.

---

## ⚡ 2. Lệnh Vận Hành & Kiểm Thử Đã Xác Minh Thực Tế
Tất cả các lệnh dưới đây đều đã được chạy thử nghiệm trên máy phát triển:

```bash
# 1. Khởi động Backend REST API (Cổng 5001)
npm --prefix sedinco_backend start           # Chạy chế độ production
npm --prefix sedinco_backend run dev         # Chạy chế độ dev (node --watch)

# 2. Chạy Kiểm thử Backend Tự Động (Chạy tuần tự trên DB test)
npm --prefix sedinco_backend test
# Hoặc chạy trực tiếp từng file kiểm thử an toàn:
NODE_ENV=test DB_NAME=sedinco_hr_test DB_SSL=false node --test --test-force-exit sedinco_backend/__tests__/<ten_file>.test.js

# 3. Chạy Kiểm thử E2E Giao Diện DOM & Mạng L3 (Puppeteer Headless trên Brave Browser)
node tools/run_l3_e2e.js

# 4. Kiểm thử Tải Đồng Thời Đăng Nhập Giả Lập Cấu Hình Staging (2 vCPU)
BCRYPT_WORKER_POOL_SIZE=2 node tools/measure_staging_concurrency.js

# 5. Công Cụ Nạp Nhân Viên CSV (Có cờ --dry-run)
node tools/import_employees_csv.js --file data/employees_sample_pilot.csv --dry-run

# 6. Công Cụ Thiết Lập Tọa Độ GPS & Bán Kính Nhà Máy (Ghi Audit Log)
node tools/update_company_gps.js --lat <vĩ_độ> --lng <kinh_độ> --radius <bán_kính> --actor ADMIN_01

# 7. Đóng gói Frontend (Production bundle qua Vite)
npm --prefix zalo-miniapp-frontend run build
```

---

## 🚫 3. Điều Cấm Tuyệt Đối (Strict Don'ts)
- **Cấm chạm CSDL Cloud / Production**: Tuyệt đối không kết nối, không cấu hình, không thực thi lệnh trên database cloud/production; chỉ thao tác trên CSDL cục bộ `sedinco_hr_test`.
- **Cấm bật cờ enforced**: Giữ nguyên `device_binding_mode=recording`, chưa bật `enforced` để tránh khóa nhầm công nhân chưa đăng ký thiết bị.
- **Cấm gỡ bỏ đường dẫn raw**: Chưa gỡ bỏ endpoint fallback raw tọa độ trong giai đoạn chạy thử.
- **Cấm tạo thêm file `.md` mới**: Không tạo thêm bất kỳ tài liệu markdown nào mới ngoài các tài liệu hiện có trong repository.
- **Cấm thay đổi phiên bản phụ thuộc frontend**: Không tự ý nâng/hạ phiên bản các gói `zmp-sdk`, `zmp-ui`, `vite` khi chưa có phê duyệt bằng văn bản.
- **Không bypass test**: Tuyệt đối không sửa assertion, không skip test (`it.skip`), không hardcode dữ liệu giả để làm xanh test.
- **Không vi phạm phân tách nhiệm vụ (SoD)**: Cấm cho phép người tạo đơn tự phê duyệt đơn của chính mình.
- **Không phá vỡ cấu trúc CSDL**: Không xóa bảng, không drop cột mà không có migration tương thích ngược. Bảng `audit_logs` là Append-Only (chỉ cho phép SELECT, INSERT).
- **Không để lộ dữ liệu cá nhân (BOLA/IDOR)**: Luôn xác thực quyền sở hữu bản ghi dựa trên `req.user.ma_nv` từ token JWT, không tin cậy `employee_id` từ client request body.

---

## ✅ 4. Định Nghĩa "Xong" (Definition of Done - DoD)
Một tác vụ được coi là hoàn thành khi và chỉ khi:
1. Mã nguồn biên dịch sạch sẽ, không có lỗi runtime hay linter cảnh báo nghiêm trọng.
2. Các bài kiểm thử nghiệp vụ liên quan chạy đạt trạng thái PASS rõ ràng, có log đối chứng ĐỎ -> XANH nếu là bài vá bảo mật.
3. Frontend build thành công không lỗi (`npm run build` kết thúc với exit code 0).
4. Các quy tắc an toàn (OWASP Top 10, Hash bcrypt, Sanitization formula CSV) được tuân thủ đầy đủ.
5. Git commit nhỏ gọn, thông điệp rõ ràng theo chuẩn Conventional Commits.

---

## 🛑 5. Khi Nào Phải Dừng Lại Và Hỏi Người Dùng?
AI Agent **bắt buộc phải dừng thực thi và hỏi người dùng** trong các tình huống sau:
1. **Yêu cầu mơ hồ / mâu thuẫn**: Khi yêu cầu của người dùng xung đột với quy tắc nghiệp vụ cốt lõi hoặc kiến trúc hiện có.
2. **Cần thay đổi schema hoặc luồng đăng nhập**: Khi xuất hiện yêu cầu sửa cấu trúc bảng hoặc sửa đổi luồng xác thực đăng nhập ngoài phạm vi chỉ định.
3. **Cần bật enforced hoặc gỡ raw**: Khi có đề xuất kích hoạt chế độ khóa cứng thiết bị hoặc loại bỏ tọa độ raw.
4. **Cần secret thật hoặc CSDL cloud/production**: AI Agent tuyệt đối không tự ý xử lý mà phải dừng lại và yêu cầu người dùng định hướng.
5. **Môi trường bị chặn**: Khi lệnh kiểm thử hoặc trình duyệt gặp sự cố môi trường ngoài tầm kiểm soát.
