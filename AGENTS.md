# Hướng Dẫn Tác Vụ Dành Cho AI Agent (Sedinco HR)

Tài liệu xác lập các quy tắc bắt buộc, lệnh thực thi và tiêu chuẩn hoàn thành cho mọi AI Agent hoạt động trên repository **Sedinco HR**.

---

## 🎯 1. Nguyên Tắc Cốt Lõi (Core Rules)
1. **Nguồn sự thật duy nhất**: Chỉ căn cứ vào mã nguồn thực tế, schema MySQL và output lệnh thực tế. Gắn nhãn `[ĐÃ XÁC MINH]`, `[SUY LUẬN]`, hoặc `[CHƯA XÁC MINH]`.
2. **Chuẩn hóa đúng 3 Role**: Hệ thống chỉ chấp nhận 3 vai trò: `worker` (công nhân / nhân viên), `accountant` (kế toán), `admin` (quản trị). Tuyệt đối không tạo role thứ 4 (`hr`, `manager`).
3. **Môi trường an toàn**: Chỉ thao tác trên môi trường local. Không bao giờ chạy lệnh phá hủy (`rm -rf`, `DROP DATABASE`, `git push --force`, `git reset --hard`).
4. **Không để lộ bí mật**: Tuyệt đối không đưa API secret, token, mật khẩu thật vào code, tài liệu `.md` hay git history.
5. **Bảo tồn phạm vi**: Chỉ chỉnh sửa frontend trong `zalo-miniapp-frontend/` khi phục vụ các thành phần Admin Web hoặc có yêu cầu trực tiếp từ người dùng; không làm sai lệch SDK Zalo Mini App.

---

## ⚡ 2. Lệnh Vận Hành & Kiểm Thử Đã Xác Minh
Tất cả các lệnh dưới đây đều đã được chạy thử nghiệm thành công 100%:

```bash
# 1. Chạy Backend REST API (Cổng 5001 / 5000)
npm --prefix sedinco_backend start           # Chạy production mode
npm --prefix sedinco_backend run dev         # Chạy dev mode (nodemon)

# 2. Chạy Kiểm thử Tự động Backend (41/41 tests pass)
npm --prefix sedinco_backend test
# Hoặc lệnh trực tiếp:
node --test --test-force-exit sedinco_backend/__tests__/*.test.js

# 3. Chạy & Đóng gói Frontend (Zalo Mini App & Admin Web)
npm --prefix zalo-miniapp-frontend start     # Chạy dev server qua zmp-cli (cổng 3000 / 2999)
npm --prefix zalo-miniapp-frontend run build # Đóng gói production bundle bằng Vite
```

---

## 🚫 3. Điều Cấm Tuyệt Đối (Strict Don'ts)
- **Không bypass test**: Tuyệt đối không sửa assertion, không skip test (`it.skip`), không hardcode dữ liệu giả để làm xanh test.
- **Không vi phạm phân tách nhiệm vụ (SoD)**: Cấm cho phép người tạo đơn tự phê duyệt đơn của chính mình.
- **Không phá vỡ cấu trúc CSDL**: Không xóa bảng, không drop cột mà không có migration tương thích ngược.
- **Không để lộ dữ liệu cá nhân (BOLA/IDOR)**: Luôn xác thực quyền sở hữu bản ghi dựa trên `req.user.ma_nv` từ token JWT, không tin cậy `employee_id` từ client request body.

---

## ✅ 4. Định Nghĩa "Xong" (Definition of Done - DoD)
Một tác vụ được coi là hoàn thành khi và chỉ khi:
1. Mã nguồn biên dịch sạch sẽ, không có lỗi runtime hay linter cảnh báo nghiêm trọng.
2. Bộ kiểm thử tự động backend chạy đạt **41/41 tests PASS (100%)**.
3. Frontend build thành công không lỗi (`npm run build` kết thúc với exit code 0).
4. Các quy tắc an toàn (OWASP Top 10, Hash bcrypt, Sanitization formula CSV) được tuân thủ đầy đủ.
5. Git commit nhỏ gọn, thông điệp rõ ràng theo chuẩn Conventional Commits.

---

## 🛑 5. Khi Nào Phải Dừng Lại Và Hỏi Người Dùng?
AI Agent **bắt buộc phải dừng thực thi và hỏi người dùng** trong các tình huống sau:
1. **Yêu cầu mơ hồ / mâu thuẫn**: Khi yêu cầu của người dùng xung đột với quy tắc nghiệp vụ cốt lõi hoặc kiến trúc hiện có.
2. **Thao tác có nguy cơ cao**: Khi cần xóa file, sửa đổi schema CSDL có dữ liệu hoặc tái cấu trúc quy mô lớn.
3. **Môi trường bị chặn**: Khi lệnh kiểm thử hoặc trình duyệt gặp sự cố môi trường ngoài tầm kiểm soát (lỗi cổng, thiếu driver offline).
4. **Quyết định thiết kế**: Khi có từ 2 giải pháp kiến trúc trở lên cần người dùng định hướng nghiệp vụ.
