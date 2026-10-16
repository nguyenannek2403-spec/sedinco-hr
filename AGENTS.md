# Hướng Dẫn Tác Vụ Dành Cho AI Agent (Sedinco HR — Backend)

Tài liệu này xác lập các nguyên tắc và chỉ dẫn bắt buộc cho mọi AI Agent hoạt động trên repository **Sedinco HR Backend** (Dịch vụ máy chủ REST API Node.js Express, kết nối cơ sở dữ liệu quan hệ MySQL).

---

## 🎯 Định Vị Vai Trò & Phạm Vi (Backend Agent Scope)
- **Vai trò của Agent**: Backend Developer & System Engineer phụ trách phát triển, bảo trì, tối ưu hiệu năng và kiểm soát an toàn bảo mật cho lõi REST API của Sedinco HR.
- **Khách hàng tiêu thụ API (Clients)**:
  1. **Zalo Mini App Frontend** (`zalo-miniapp-frontend/`): Ứng dụng di động của cán bộ công nhân viên (Chấm công GPS, xem công, nộp đơn, xem phiếu lương). *TUYỆT ĐỐI KHÔNG SỬA ĐỔI THƯ MỤC NÀY*.
  2. **Admin Web Management** (lưu trữ tại `fullstack/admin-web/`): Bảng điều khiển quản trị web dành cho Ban Giám Đốc và Kế toán.
- **Cấu trúc Backend chuẩn**: Mã nguồn backend được tổ chức phân tầng rõ ràng trong thư mục `src/`:
  - `src/config/`: Cấu hình kết nối MySQL Pool, biến môi trường, SSL.
  - `src/controllers/`: Tiếp nhận HTTP Request, gọi tầng Service và trả kết quả chuẩn hóa JSON.
  - `src/services/`: Nghiệp vụ tính lương tự động, ma trận chấm công, quy trình duyệt đơn, logic phân quyền.
  - `src/routes/`: Định tuyến các nhóm API RESTful chuẩn (`/api/...`).
  - `src/middlewares/`: Thẩm tra dữ liệu đầu vào (Validation), kiểm tra quyền (RBAC), làm sạch dữ liệu và xử lý lỗi tập trung.
  - `src/database/`: Tự động khởi tạo schema (7 bảng quan hệ), dữ liệu mẫu ban đầu.
  - `src/utils/`: Công cụ tính toán tiền lương độc lập, helper phản hồi.

---

## ⚠️ Nguyên Tắc Bắt Buộc (Core Rules)
1. **Đọc tài liệu theo thứ tự**: `AGENTS.md` → `docs/agent-workflow.md` → `docs/project.md` trước khi sửa code.
2. **Nguồn sự thật duy nhất**: Chỉ căn cứ vào code backend thực tế, config, schema SQL và output lệnh thực tế. Gắn nhãn `[ĐÃ XÁC MINH]`, `[SUY LUẬN]`, hoặc `[CHƯA XÁC MINH]`.
3. **Môi trường an toàn**: Chỉ thao tác trên môi trường LOCAL repo. Tuyệt đối KHÔNG gọi lệnh phá hủy (`rm -rf`, `drop database`, `git push --force`, `git reset --hard`).
4. **Quy tắc Git**: Luôn tạo nhánh `agent/<chế-độ>-<yyyymmdd>` và commit nhỏ theo từng bản vá.
5. **Chất lượng kiểm thử**: Không làm xanh test bằng cách bypass/skip/hardcode. Mọi thay đổi phải có output `npm test` (`node:test`) làm bằng chứng (đạt 16/16 tests).
6. **Bảo toàn giao diện Frontend Zalo Mini App**: Tuyệt đối không can thiệp hoặc sửa đổi bất kỳ file nào trong thư mục `zalo-miniapp-frontend/`.

---

## 📚 Tài Liệu Dự Án Backend (Tham Chiếu Bắt Buộc)
- [docs/agent-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/agent-workflow.md): Quy trình làm việc chuẩn & tiêu chuẩn hoàn thành DoD của Backend Agent.
- [docs/project.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/project.md): Kiến trúc kỹ thuật backend phân tầng, đặc tả 14 REST API endpoints, schema database.
- [docs/tongquanduan.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/tongquanduan.md): Tổng quan nghiệp vụ nhân sự, công thức tính lương, chống gian lận chấm công.
- [docs/testing-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/testing-workflow.md): Tiêu chuẩn kiểm thử tự động backend bằng `node:test` và `node:assert/strict`.
- [docs/security-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/security-workflow.md): Danh mục kiểm soát an toàn bảo mật OWASP API Security Top 10.
- [fullstack/](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/fullstack): Thư mục lưu trữ các ứng dụng frontend web, mobile cũ và tài liệu full-stack tham khảo.
