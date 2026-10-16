# Quy Trình & Luật Làm Việc Của AI Agent Backend (Backend Agent Workflow)

> **Mục tiêu**: Đảm bảo mọi AI Agent khi tham gia bảo trì, phát triển hoặc tối ưu hóa hệ thống Backend REST API của Sedinco HR đều hành động nhất quán, an toàn, có bằng chứng thực nghiệm qua test tự động và không làm gián đoạn API của các ứng dụng khách.

---

## 1. Thứ Tự Đọc Tài Liệu Bắt Buộc

Khi bắt đầu một phiên làm việc mới, Agent PHẢI đọc tài liệu theo trình tự sau:
1. [AGENTS.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/AGENTS.md): Bản chỉ dẫn tóm tắt các nguyên tắc cấm và định vị vai trò Backend Agent.
2. [docs/agent-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/agent-workflow.md): Bản quy định luật làm việc và các lệnh chuẩn này.
3. [docs/project.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/project.md): Chi tiết kiến trúc phân tầng Layered MVC, danh mục 14 REST API và schema CSDL.
4. Tài liệu liên quan theo ngữ cảnh:
   - Nếu thực hiện kiểm thử: đọc [docs/testing-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/testing-workflow.md).
   - Nếu thực hiện rà soát an toàn thông tin: đọc [docs/security-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/security-workflow.md).

---

## 2. Danh Mục Lệnh Chuẩn Đã Xác Minh (Backend Commands)

Chỉ sử dụng các lệnh chuẩn đã được kiểm chứng sau tại repo root:

| Mục đích | Lệnh chuẩn | Ghi chú |
|---|---|---|
| **Cài đặt thư viện** | `npm install` | Cài đặt các gói phụ thuộc Backend (`express`, `mysql2`, `cors`, `dotenv`) |
| **Khởi chạy Backend** | `npm start` hoặc `npm run backend` | Chạy máy chủ `server.js` (cổng 5000) |
| **Phát triển (Dev Mode)** | `npm run dev` | Tự động tải lại máy chủ khi sửa file bằng `node --watch` |
| **Chạy Test Backend** | `npm test` | Chạy bộ test tự động tiêu chuẩn bằng `node:test` (16 test cases) |
| **Chạy Test Trực tiếp** | `node --test __tests__/*.test.js` | Thực thi trực tiếp qua Node Test Runner |
| **Quét Lỗ Hổng Dep** | `npm audit` | Quét kiểm tra bảo mật gói thư viện |
| **Xuất Báo Cáo Kiểm Toán** | `python3 scripts/generate_security_audit_excel.py` | Tạo báo cáo kiểm toán Excel tự động |

---

## 3. Quy Trình Thay Đổi Mã Nguồn Backend (Change Workflow)

Mọi thay đổi code đều phải tuân theo 6 bước khép kín:
1. **Hiểu (Understand)**: Đọc kỹ code hiện hữu tại các tầng liên quan (`src/controllers/`, `src/services/`, `src/middlewares/`, `src/routes/`).
2. **Kế hoạch ngắn (Short Plan)**: Lập kế hoạch sửa đổi nhỏ nhất (minimal diff), tuân thủ phân tách trách nhiệm giữa Controller và Service.
3. **Thực hiện sửa nhỏ nhất (Apply Minimal Fix)**: Sửa đúng vị trí, giữ nguyên convention và ghi chú hiện có.
4. **Kiểm chứng bằng lệnh (Verify with Commands)**: Chạy lại `npm test` để xác minh không gây hồi quy (Regression). Thu thập output thực tế làm bằng chứng.
5. **Cập nhật tài liệu (Sync Docs)**: Nếu thay đổi schema DB, API contract, hoặc logic nghiệp vụ, PHẢI cập nhật ngay `docs/project.md` và `docs/tongquanduan.md` trong cùng phiên làm việc.
6. **Báo cáo trung thực (Report)**: Báo cáo kết quả kèm file:dòng đã sửa và log thực thi.

---

## 4. Quy Trình Debug & Xử Lý Sự Cố (Debugging Standard)

Khi gặp lỗi, Agent phải tuân thủ nghiêm ngặt 5 bước:
1. **Triệu chứng (Symptom)**: Mô tả chính xác lỗi xuất hiện ở API nào, method nào, mã lỗi HTTP là gì.
2. **Bằng chứng (Evidence)**: Cung cấp đoạn log thật từ terminal hoặc response thật của API.
3. **Nguyên nhân gốc (Root Cause)**: Phân tích chỉ rõ dòng code hoặc cấu hình sai lệch gây ra lỗi.
4. **Bản vá nhỏ nhất (Minimal Fix)**: Chỉ sửa đúng nguyên nhân gốc, không che đậy triệu chứng (ví dụ: không `try...catch` rỗng để giấu lỗi).
5. **Kiểm chứng độc lập (Independent Verification)**: Chạy lại kịch bản gây lỗi để chứng minh lỗi đã được giải quyết triệt để.

---

## 5. Quy Tắc Quản Lý Mã Nguồn Git

1. **Phân nhánh an toàn**: Mọi phiên làm việc bắt buộc tạo và chuyển sang nhánh riêng theo cú pháp:
   `agent/<chế-độ>-<yyyymmdd>` (ví dụ: `agent/backend-refactor-20261016`).
2. **Commit phân đoạn (Atomic Commits)**: Commit nhỏ gọn theo từng lỗi/tính năng đã fix xong và đã verify.
3. **Thông điệp Commit rõ ràng**: Sử dụng tiền tố chuẩn: `feat:`, `fix:`, `test:`, `docs:`, `security:`.

---

## 6. Tiêu Chuẩn Hoàn Thành (Definition of Done - DoD)

Một tác vụ chỉ được tuyên bố là **Hoàn thành** khi thỏa mãn TẤT CẢ các điều kiện sau:
- [x] Code chạy đúng logic yêu cầu và giữ nguyên các tính năng đang hoạt động bình thường khác.
- [x] Thư mục `zalo-miniapp-frontend/` được bảo toàn nguyên vẹn 100% không bị thay đổi.
- [x] Bộ kiểm thử tự động (`npm test`) chạy và vượt qua 100% (16/16 Pass).
- [x] Không làm rò rỉ thông tin mật khẩu hoặc cấu trúc SQL ra ngoài response API.
- [x] Các tài liệu liên quan (`README.md`, `project.md`, `test-cases.md`, `security-audit.xlsx`) đã được đồng bộ.
- [x] Đã có output dòng lệnh chứng minh thực tế trong báo cáo.

---

## 7. Các Điều CẤM Tuyệt Đối (Strictly Prohibited)

1. **CẤM lệnh phá hủy**: Tuyệt đối không dùng `rm -rf`, `drop database`, `git push --force`, `git reset --hard`.
2. **CẤM sửa thư mục Frontend Zalo Mini App**: Tuyệt đối không chỉnh sửa file trong `zalo-miniapp-frontend/`.
3. **CẤM làm xanh test giả mạo**: Nghiêm cấm xóa test, comment test, bỏ qua assertion (`skip`), mock lách kiểm tra, hoặc hardcode kết quả trả về.
4. **CẤM in Secret thật**: Tuyệt đối không in mật khẩu thật, chuỗi kết nối DB, API token ra màn hình chat hoặc tài liệu công khai (dùng ký tự che chắn `********`).
