# Quy Trình & Luật Làm Việc Của AI Agent (Agent Workflow)

> **Mục tiêu**: Đảm bảo mọi AI Agent khi tham gia bảo trì, phát triển hoặc tối ưu hóa dự án Sedinco HR đều hành động nhất quán, an toàn, có bằng chứng thực nghiệm và không làm gián đoạn hệ thống.

---

## 1. Thứ Tự Đọc Tài Liệu Bắt Buộc

Khi bắt đầu một phiên làm việc mới, Agent PHẢI đọc tài liệu theo trình tự sau trước khi thực hiện bất kỳ lệnh can thiệp mã nguồn nào:
1. [AGENTS.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/AGENTS.md): Bản chỉ dẫn tóm tắt các nguyên tắc cấm và đường dẫn tài liệu.
2. [docs/agent-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/agent-workflow.md): Bản quy định luật làm việc này.
3. [docs/project.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/project.md): Chi tiết kiến trúc kỹ thuật, danh mục API và mô hình thực thể.
4. Tài liệu liên quan theo ngữ cảnh:
   - Nếu thực hiện kiểm thử: đọc [docs/testing-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/testing-workflow.md).
   - Nếu thực hiện rà soát an toàn thông tin: đọc [docs/security-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/security-workflow.md).

---

## 2. Danh Mục Lệnh Chuẩn Đã Xác Minh

Chỉ sử dụng các lệnh chuẩn đã được kiểm chứng sau:

| Mục đích | Lệnh chuẩn | Ghi chú |
|---|---|---|
| **Cài đặt thư viện** | `npm install` | Chạy tại root hoặc dùng cờ `--prefix <folder>` |
| **Chạy Backend** | `npm run backend` | Tương đương `node server.js` tại `sedinco_backend/` |
| **Chạy Admin Web** | `npm run admin` | Tương đương `vite` tại `admin-web/` |
| **Build Frontend** | `npm run build` | Thực hiện build bundle `dist/` chuẩn cho Cloudflare/Vercel |
| **Lint Frontend** | `npm --prefix admin-web run lint` | Chạy `oxlint` quét 5 files React |
| **Chạy Test Backend** | `npm --prefix sedinco_backend test` | Chạy bộ test tiêu chuẩn bằng `node --test` |
| **Quét Lỗ Hổng Dep** | `npm audit` | Quét kiểm tra bảo mật gói thư viện |

---

## 3. Quy Trình Thay Đổi Mã Nguồn (Change Workflow)

Mọi thay đổi code đều phải tuân theo 6 bước khép kín:
1. **Hiểu (Understand)**: Đọc kỹ code hiện hữu tại vị trí cần can thiệp. Xác minh luồng dữ liệu liên quan.
2. **Kế hoạch ngắn (Short Plan)**: Lập kế hoạch sửa đổi nhỏ nhất (minimal diff), không refactor ngoài phạm vi yêu cầu.
3. **Thực hiện sửa nhỏ nhất (Apply Minimal Fix)**: Sửa đúng vị trí, giữ nguyên convention và ghi chú hiện có.
4. **Kiểm chứng bằng lệnh (Verify with Commands)**: Chạy lại `test`, `build`, hoặc `lint`. Thu thập output thực tế làm bằng chứng.
5. **Cập nhật tài liệu (Sync Docs)**: Nếu thay đổi schema DB, API contract, hoặc logic nghiệp vụ, PHẢI cập nhật ngay `docs/project.md` và `docs/tongquanduan.md` trong cùng phiên làm việc.
6. **Báo cáo trung thực (Report)**: Báo cáo kết quả kèm file:dòng đã sửa và log thực thi.

---

## 4. Quy Trình Debug & Xử Lý Sự Cố (Debugging Standard)

Khi gặp lỗi, Agent phải tuân thủ nghiêm ngặt 5 bước:
1. **Triệu chứng (Symptom)**: Mô tả chính xác lỗi xuất hiện ở màn hình nào, API nào, mã lỗi HTTP hoặc stack trace là gì.
2. **Bằng chứng (Evidence)**: Cung cấp đoạn log thật từ terminal hoặc response thật của API.
3. **Nguyên nhân gốc (Root Cause)**: Phân tích chỉ rõ dòng code hoặc cấu hình sai lệch gây ra lỗi.
4. **Bản vá nhỏ nhất (Minimal Fix)**: Chỉ sửa đúng nguyên nhân gốc, không che đậy triệu chứng (ví dụ: không `try...catch` rỗng để giấu lỗi).
5. **Kiểm chứng độc lập (Independent Verification)**: Chạy lại kịch bản gây lỗi để chứng minh lỗi đã được giải quyết triệt để.

---

## 5. Quy Tắc Quản Lý Mã Nguồn Git

1. **Phân nhánh an toàn**: Mọi phiên làm việc bắt buộc tạo và chuyển sang nhánh riêng theo cú pháp:
   `agent/<chế-độ>-<yyyymmdd>` (ví dụ: `agent/full-20261014`).
2. **Commit phân đoạn (Atomic Commits)**: Commit nhỏ gọn theo từng lỗi/tính năng đã fix xong và đã verify. Không gom một commit khổng lồ chứa nhiều thay đổi không liên quan.
3. **Thông điệp Commit rõ ràng**: Sử dụng tiền tố chuẩn: `feat:`, `fix:`, `test:`, `docs:`, `security:`.

---

## 6. Tiêu Chuẩn Hoàn Thành (Definition of Done - DoD)

Một tác vụ chỉ được tuyên bố là **Hoàn thành** khi thỏa mãn TẤT CẢ các điều kiện sau:
- [x] Code chạy đúng logic yêu cầu và giữ nguyên các tính năng đang hoạt động bình thường khác.
- [x] Không còn lỗi lint nghiêm trọng (`0 errors`).
- [x] Bản build (`npm run build`) thành công 100% không cảnh báo cú pháp.
- [x] Bộ kiểm thử tự động tương ứng (`node --test`) chạy và vượt qua 100% (Pass).
- [x] Các tài liệu liên quan (`README.md`, `project.md`, `test-cases.md`, `security-audit.xlsx`) đã được đồng bộ.
- [x] Đã có output dòng lệnh chứng minh thực tế trong báo cáo.

---

## 7. Các Điều CẤM Tuyệt Đối (Strictly Prohibited)

1. **CẤM lệnh phá hủy**: Tuyệt đối không dùng `rm -rf`, `drop database`, `git push --force`, `git reset --hard` trừ khi có văn bản yêu cầu rõ ràng từ người dùng.
2. **CẤM tác động Production / Dịch vụ ngoài**: Không thực hiện scan cổng, brute-force hoặc tấn công vào các endpoint bên ngoài môi trường cục bộ/phạm vi dự án.
3. **CẤM làm xanh test giả mạo**: Nghiêm cấm xóa test, comment test, bỏ qua assertion (`skip`), mock lách kiểm tra, hoặc hardcode kết quả trả về để test trông như đang xanh.
4. **CẤM cam kết sự an toàn tuyệt đối**: Không bao giờ viết "hệ thống an toàn 100%" hay "không còn lỗi". Luôn báo cáo khách quan: đã kiểm tra những gì, chưa kiểm tra những gì, và các rủi ro còn lại.
5. **CẤM in Secret thật**: Tuyệt đối không in mật khẩu thật, chuỗi kết nối DB, API token ra màn hình chat hoặc tài liệu công khai. Luôn dùng ký tự che chắn (Mask: `********`).

---

## 8. Khi Nào Phải Hỏi Người Dùng (Escalation Triggers)

Agent chỉ dừng lại để xin ý kiến người dùng trong các trường hợp sau:
1. Thiếu thông tin cốt lõi làm chặn công việc (ví dụ: cần mật khẩu database hoặc quyền truy cập mới tiếp tục được).
2. Phát hiện mâu thuẫn lớn giữa logic nghiệp vụ và mong muốn người dùng mà code không thể tự suy luận.
3. Thay đổi có thể gây ảnh hưởng nghiêm trọng (Breaking changes) đến cấu trúc cơ sở dữ liệu hoặc API đang vận hành.
*(Khi hỏi: gom tối đa không quá 5 câu hỏi súc tích, kèm phương án đề xuất).*
