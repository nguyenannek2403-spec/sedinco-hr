# Quy Trình Rà Soát & Kiểm Toán Bảo Mật (Security Workflow) — Sedinco HR

> **Mục tiêu**: Thiết lập quy trình rà soát an toàn thông tin định kỳ cho hệ thống Sedinco HR theo chuẩn OWASP Top 10 và Best Practices của Node.js / React, đồng thời quản lý các lỗ hổng bằng bảng tính kiểm toán Excel đa chiều.

---

## 1. Phạm Vi & Nguyên Tắc Bảo Vệ An Toàn

- **Chỉ thực hiện trong môi trường LOCAL**: Không quét cổng, không gửi tải trọng tấn công (fuzzing/DoS) vào các máy chủ Cloud bên ngoài.
- **Phòng thủ & Tái hiện tối thiểu**: Kịch bản tái hiện chỉ ở mức tối thiểu để xác minh sự tồn tại của lỗ hổng và kiểm chứng hiệu quả sau khi vá.
- **Bảo mật Secret**: Tuyệt đối không lưu giá trị mật khẩu thật, khóa API hoặc chuỗi kết nối vào báo cáo kiểm toán hay git history.

---

## 2. Công Cụ Kiểm Toán Khả Dụng & Lệnh Thực Thi

| Công cụ | Mục đích | Lệnh thực thi | Ghi chú |
|---|---|---|---|
| **npm audit** | Quét lỗ hổng phụ thuộc bên thứ ba | `npm audit` | Chạy tại root, `sedinco_backend/`, `admin-web/` |
| **oxlint** | Quét cú pháp & lỗ hổng tĩnh frontend | `npm --prefix admin-web run lint` | Rà soát biến không dùng, lỗi React Hooks |
| **Python openpyxl** | Xuất báo cáo kiểm toán đa sheet | `python3 scripts/export_security_audit.py` | Tạo `docs/security/security-audit.xlsx` |
| **Static Review** | Rà soát mã nguồn thủ công theo OWASP | Kiểm tra trực tiếp file `server.js`, `App.jsx` | Đối chiếu 10 nhóm nguy cơ OWASP Top 10 |

---

## 3. Danh Mục Kiểm Tra An Toàn Theo Stack (OWASP Top 10 Mapping)

1. **A01: Broken Access Control**:
   - Kiểm tra các endpoint quản trị: Liệu người dùng chưa đăng nhập hoặc nhân viên thường có thể gọi API sửa nhân viên, sửa lương, xóa ngày lễ hay không?
   - Nguy cơ BOLA/IDOR: Nhân viên A có thể xem/sửa bảng công của nhân viên B hay không?
2. **A02: Cryptographic Failures**:
   - Kiểm tra cách lưu trữ mật khẩu: Mật khẩu có bị lưu dạng văn bản thô (Plaintext) hay không?
   - Kết nối cơ sở dữ liệu có được mã hóa qua SSL/TLS hay không?
3. **A03: Injection (SQL Injection / Command Injection)**:
   - Các câu lệnh SQL trong `server.js` có sử dụng cú pháp tham số hóa (Parameterized Queries `?`) hay ghép chuỗi trực tiếp?
4. **A04: Insecure Design & Business Logic Flaws**:
   - Cho phép chèn số giờ OT vô lý (ví dụ: 99h/ngày) làm sai lệch tiền lương.
   - Cho phép gửi ngày chấm công không hợp lệ (ngày 31 tháng 2, ngày trong tương lai).
   - Thiếu cơ chế khóa số liệu sau khi kế toán đã chốt lương tháng.
5. **A05: Security Misconfiguration**:
   - CORS cho phép wildcard `*` hay có giới hạn domain nguồn?
   - Cấu hình dung lượng JSON body parser: Có đặt giới hạn an toàn để chống tràn bộ nhớ (DoS via large payload) không?
6. **A07: Identification and Authentication Failures**:
   - Thiếu cơ chế giới hạn tần suất yêu cầu (Rate Limiting) trên các endpoint đăng nhập, dẫn đến nguy cơ dò quét mật khẩu (Brute Force).
7. **A08: Software and Data Integrity Failures**:
   - Các gói phụ thuộc lỗi thời trong lockfile có chứa lỗ hổng CVE đã công bố.

---

## 4. Cấu Trúc Bảng Tính Kiểm Toán `docs/security/security-audit.xlsx`

File Excel báo cáo kiểm toán bắt buộc có 5 Sheet tiêu chuẩn:
1. **Summary**: Thống kê số lượng lỗ hổng theo mức độ (Critical, High, Medium, Low) và trạng thái xử lý; phạm vi kiểm toán; công cụ đã chạy.
2. **Findings**: Danh sách chi tiết từng phát hiện an ninh:
   - Cột: `ID (SEC-xxx)` | `Tiêu đề` | `Hạng mục OWASP/CWE` | `Mức độ` | `Khả năng khai thác` | `Tác động` | `File:Dòng` | `Mô tả & Bằng chứng` | `Cách tái hiện` | `Khuyến nghị` | `Trạng thái` | `Cách kiểm chứng` | `Ngày sửa`.
3. **Checklist**: Bảng đối chiếu toàn bộ các hạng mục an toàn đã được kiểm tra (kể cả các mục đã an toàn/sạch).
4. **Dependencies**: Nhật ký quét lỗ hổng từ `npm audit` với gói, phiên bản, CVE, mức độ và trạng thái.
5. **Retest-Log**: Lịch sử kiểm tra lại sau khi áp dụng bản vá, ghi rõ thời gian, kết quả và bằng chứng.

---

## 5. Quy Trình Khắc Phục Lỗ Hổng & Kiểm Thử Hồi Quy

1. **Thứ tự ưu tiên**: Critical ➔ High ➔ Medium ➔ Low.
2. **Nguyên tắc vá lỗi**:
   - Sửa đúng nguyên nhân gốc tại tầng máy chủ (Server-side validation), không chỉ chặn trên giao diện người dùng (Client-side).
   - Viết test kiểm chứng bảo mật (Security regression test) trong `sedinco_backend/__tests__/` để đảm bảo lỗi không bao giờ tái xuất hiện.
   - Chạy lại toàn bộ test suite và build để đảm bảo không phát sinh lỗi phụ.
3. **Cập nhật trạng thái**: Chuyển trạng thái từ `Open` sang `Fixed` hoặc `Needs User Action` (nếu liên quan đến việc người dùng tự đổi secret/mật khẩu).
