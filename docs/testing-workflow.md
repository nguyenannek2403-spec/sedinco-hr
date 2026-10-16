# Quy Trình Kiểm Thử Tự Động Backend (Testing Workflow) — Sedinco HR

> **Mục tiêu**: Thiết lập phương pháp, công cụ và quy chuẩn kiểm thử tự động cho hệ thống Backend REST API Sedinco HR, tập trung vào tính toán tiền lương, an toàn dữ liệu mật khẩu, thẩm định đầu vào và chống gian lận chấm công.

---

## 1. Công Cụ & Môi Trường Kiểm Thử Backend (Testing Stack)

- **Test Runner**: Sử dụng `node:test` (Test Runner chuẩn tích hợp sẵn trong Node.js >= 20/22/24, không cần cài đặt thêm dependency nặng như Jest/Mocha).
- **Assertion Library**: Sử dụng `node:assert/strict` (thư viện kiểm tra điều kiện tiêu chuẩn của Node.js).
- **Thư mục chứa Test Code**: `__tests__/` tại repo root.
- **Quy ước đặt tên file test**: `<domain>.test.js`.
- **Quy ước mã định danh test case**: Bắt đầu bằng mã chuẩn `TC-<MODULE>-<SỐ>` (ví dụ: `TC-PAY-01`, `TC-SEC-01`, `TC-ATT-01`).

---

## 2. Lệnh Thực Thi Kiểm Thử Đã Xác Minh

| Thao tác | Dòng lệnh thực thi |
|---|---|
| **Chạy toàn bộ test suite backend** | `npm test` |
| **Chạy trực tiếp bằng Node Test Runner** | `node --test __tests__/*.test.js` |
| **Chạy riêng test tính lương** | `node --test __tests__/payroll_calculation.test.js` |
| **Chạy riêng test an toàn bảo mật** | `node --test __tests__/security_rules.test.js` |
| **Chạy riêng test thẩm định đầu vào** | `node --test __tests__/validation.test.js` |
| **Kiểm tra tương thích ngược script cũ** | `npm --prefix sedinco_backend test` |

---

## 3. Danh Mục Các Test Suite & Test Case Hiện Hành (16/16 Pass)

### 3.1 Suite Tính Lương (`__tests__/payroll_calculation.test.js`)
- `TC-PAY-01`: Tính lương cơ bản 1 ngày & 1 giờ chuẩn 26 ngày (10,400,000 / 26 = 400,000 đ/ngày).
- `TC-PAY-02`: Phân tách công thử việc (hưởng 85%) và chính thức (hưởng 100%) dựa trên `ngay_chinh_thuc`.
- `TC-PAY-03`: Tính tiền làm thêm giờ (OT) ngày thường với hệ số chuẩn **1.5x**.
- `TC-PAY-04`: Tính tiền làm thêm giờ (OT) ngày Chủ Nhật với hệ số **2.0x**.
- `TC-PAY-05`: Tính tiền làm thêm giờ (OT) ngày Lễ với hệ số **3.0x**.
- `TC-PAY-06`: Trích trừ bảo hiểm xã hội 10.5% khi `has_insurance = true`.
- `TC-PAY-07`: Không trích bảo hiểm khi `has_insurance = false` hoặc `0`.
- `TC-PAY-08`: Tính tổng thực lĩnh Net Salary đầy đủ (Lương công + Phụ cấp theo công + Tiền OT - BHXH).

### 3.2 Suite An Toàn Bảo Mật & RBAC (`__tests__/security_rules.test.js`)
- `TC-SEC-01`: Loại bỏ triệt để trường `password` khỏi đối tượng người dùng khi trả về qua API.
- `TC-SEC-02`: Phân loại đúng quyền hạn (RBAC: Admin, Accountant, Employee) dựa trên chức danh công việc.
- `TC-SEC-03`: Kiểm tra câu lệnh SELECT nhân viên không lấy trường `password` (`SAFE_EMPLOYEE_FIELDS`).

### 3.3 Suite Thẩm Định Đầu Vào Chấm Công (`__tests__/validation.test.js`)
- `TC-ATT-01`: Thẩm tra input chấm công hợp lệ (ngày, tháng, năm, mã nhân viên, trạng thái).
- `TC-ATT-02`: Thẩm tra khi `status` rỗng hoặc null -> Đánh dấu thao tác xóa công.
- `TC-ATT-03`: Chặn ngày không hợp lệ (day > 31 hoặc day < 1).
- `TC-ATT-04`: Chặn tháng không hợp lệ (month > 12 hoặc month < 1).
- `TC-ATT-05`: Giới hạn số giờ OT không được vượt quá 24h và không âm (chống DoS & gian lận bảng lương).

---

## 4. Tiêu Chuẩn Duyệt Test (Pass Criteria)
1. 100% test case trong bộ test phải chạy thành công (Pass rate: 16/16).
2. Thời gian chạy toàn bộ suite không vượt quá 500ms.
3. Không sử dụng `test.skip()`, không comment test case, không hardcode giá trị mock để vượt qua bài kiểm tra.
