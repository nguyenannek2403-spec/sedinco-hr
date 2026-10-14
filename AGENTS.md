# Hướng Dẫn Tác Vụ Dành Cho AI Agent (Sedinco HR)

Tài liệu này xác lập các nguyên tắc và chỉ dẫn bắt buộc cho mọi AI Agent hoạt động trên repository Sedinco HR.

## ⚠️ Nguyên Tắc Bắt Buộc
1. **Đọc tài liệu theo thứ tự**: `AGENTS.md` → `docs/agent-workflow.md` → `docs/project.md` trước khi sửa code.
2. **Nguồn sự thật duy nhất**: Chỉ căn cứ vào code, config, schema SQL và output lệnh thực tế. Gắn nhãn `[ĐÃ XÁC MINH]`, `[SUY LUẬN]`, hoặc `[CHƯA XÁC MINH]`.
3. **Môi trường an toàn**: Chỉ thao tác trên môi trường LOCAL repo. Tuyệt đối KHÔNG gọi lệnh phá hủy (`rm -rf`, `drop database`, `git push --force`, `git reset --hard`).
4. **Quy tắc Git**: Luôn tạo nhánh `agent/<chế-độ>-<yyyymmdd>` và commit nhỏ theo từng bản vá.
5. **Chất lượng kiểm thử**: Không làm xanh test bằng cách bypass/skip/hardcode. Mọi thay đổi phải có output `test`, `build`, `lint` làm bằng chứng.

## 📚 Tài Liệu Dự Án (Tham Chiếu Bắt Buộc)
- [docs/agent-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/agent-workflow.md): Luật làm việc, quy trình sửa đổi & debug chuẩn.
- [docs/project.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/project.md): Kiến trúc kỹ thuật, API specs, thực thể dữ liệu.
- [docs/tongquanduan.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/tongquanduan.md): Tổng quan nghiệp vụ nhân sự và tiền lương.
- [docs/testing-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/testing-workflow.md): Tiêu chuẩn kiểm thử và testcase.
- [docs/security-workflow.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/security-workflow.md): Danh mục kiểm soát an toàn bảo mật OWASP.
