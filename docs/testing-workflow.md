# Quy Trình Kiểm Thử Chuẩn (Testing Workflow) — Sedinco HR

> **Mục tiêu**: Thiết lập phương pháp và công cụ kiểm thử tự động cho hệ thống Sedinco HR, tập trung vào các rủi ro cốt lõi về chấm công, tính tiền lương, xác thực và toàn vẹn dữ liệu.

---

## 1. Công Cụ & Môi Trường Kiểm Thử (Testing Stack)

- **Test Runner Backend**: Sử dụng `node:test` (Test Runner chuẩn tích hợp sẵn trong Node.js >= 18/20/24, không cần cài đặt thêm dependency bên ngoài).
- **Assertion Library**: Sử dụng `node:assert/strict` (thư viện kiểm tra điều kiện tiêu chuẩn của Node.js).
- **Thư mục chứa Test Code**: `sedinco_backend/__tests__/`.
- **Quy ước đặt tên file test**: `<module>.test.js` (ví dụ: `payroll.test.js`, `attendance.test.js`, `auth.test.js`, `requests.test.js`).
- **Quy ước gắn mã định danh**: Mỗi hàm test phải bắt đầu bằng mã `TC-<MODULE>-<SỐ>` (ví dụ: `test('TC-PAY-01: ...')`).

---

## 2. Lệnh Thực Thi Kiểm Thử

| Thao tác | Dòng lệnh thực thi |
|---|---|
| **Chạy toàn bộ test suite backend** | `npm --prefix sedinco_backend test` |
| **Chạy kiểm thử trực tiếp bằng Node** | `node --test sedinco_backend/__tests__/*.test.js` |
| **Chạy riêng từng file test** | `node --test sedinco_backend/__tests__/payroll.test.js` |
| **Kiểm tra cú pháp & Lint Frontend** | `npm --prefix admin-web run lint` |
| **Kiểm tra tính toàn vẹn Build** | `npm run build` |

---

## 3. Phân Cấp Mức Độ Ưu Tiên Kiểm Thử

- **Ưu tiên P0 (Khẩn cấp / Trọng yếu)**:
  - Xác thực người dùng (Login Admin, Login Nhân viên, Đổi mật khẩu).
  - Nghiệp vụ tính toán tiền lương (Lương 1 giờ, ngày thử việc 85%, hệ số OT 1.5x/2.0x/3.0x, trích bảo hiểm 10.5%).
  - Tính toàn vẹn của bảng chấm công (ngăn chặn chèn số giờ OT vô lý, ngăn chặn ngày không tồn tại).
- **Ưu tiên P1 (Nghiệp vụ lõi)**:
  - Quy trình nộp đơn và phê duyệt đơn (tự động cập nhật công khi `status = 'approved'`).
  - Quản lý hồ sơ nhân viên (Thêm mới, cập nhật, xóa nhân sự).
  - Lịch nghỉ lễ doanh nghiệp (Tính hệ số OT trùng ngày lễ).
- **Ưu tiên P2 (Giao diện & Tiện ích)**:
  - Cấu hình thông tin doanh nghiệp & Upload logo.
  - Phản hồi giao diện khi mạng lỗi hoặc dữ liệu rỗng.

---

## 4. Kỹ Thuật Kiểm Thử Áp Dụng

Mỗi module phải được kiểm thử qua đầy đủ các khía cạnh:
1. **Happy Path**: Dữ liệu chuẩn xác, luồng nghiệp vụ thông thường.
2. **Phân vùng tương đương & Giá trị biên (Boundary Values)**:
   - Số ngày công: 0, 13, 26, 31 ngày.
   - Giờ làm thêm OT: 0h, 0.5h, 4h, 8h, và giá trị âm / vượt quá 24h.
   - Tháng/Năm: Tháng 1 đến 12, năm 2000 đến 2100.
3. **Negative Testing**:
   - Thiếu trường bắt buộc (`ma_nv`, `password`, `day`, `month`, `year`).
   - Sai định dạng dữ liệu (chuỗi chữ gửi vào trường số, ngày 31/02).
4. **Phân quyền & Rào cản truy cập**:
   - Nhân viên thường không được xem dữ liệu cấu hình công ty.
   - Đổi mật khẩu với mật khẩu cũ không chính xác.
5. **Toàn vẹn trạng thái & Tính lũy đẳng (Idempotency)**:
   - Cập nhật công nhiều lần cho cùng một ngày (kiểm tra `ON DUPLICATE KEY UPDATE`).
   - Duyệt đơn đã ở trạng thái `approved`.

---

## 5. Vòng Lặp Test – Fix – Verify (Test-Fix Loop)

1. **Chạy Baseline**: Kiểm tra xem bộ test cũ hoặc trạng thái hiện tại đang ra sao.
2. **Phát hiện lỗi (Fail)**:
   - Phân loại lỗi: (i) Lỗi logic thật của code; (ii) Test viết sai giả định; (iii) Lỗi môi trường/DB.
3. **Thực hiện sửa nhỏ nhất**:
   - Sửa đúng nguyên nhân gốc, không thay đổi API contract hoặc hành vi nghiệp vụ mong đợi.
4. **Chạy lại toàn bộ test suite**:
   - Đảm bảo test mới pass VÀ không làm hỏng bất kỳ test cũ nào (Zero Regression).
5. **Cập nhật sổ theo dõi**:
   - Cập nhật file [docs/testing/test-cases.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/testing/test-cases.md) và [docs/testing/test-report.md](file:///Users/an/Desktop/anti%20gravity/sedinco-hr/docs/testing/test-report.md).
