# Báo Cáo Kết Quả Kiểm Thử (Test Execution Report) — Sedinco HR

> **Ngày thực hiện**: 14/10/2026  
> **Nhánh kiểm thử**: `agent/full-20261014`  
> **Bộ chạy kiểm thử**: `node --test` (Node.js Test Runner)  
> **Môi trường**: macOS local environment, Node.js 24.x, Express 5.2.1

---

## 1. Tổng Hợp Kết Quả Thực Thi (Execution Summary)

| Chỉ số | Số lượng | Tỷ lệ (%) | Ghi chú |
|---|---|---|---|
| **Tổng số testcase đã thiết lập** | 16 testcases | 100% | Nằm trong 3 file test tại `sedinco_backend/__tests__/` |
| **Số testcase Đạt (Pass)** | 16 testcases | 100% | Không có test nào bị fail |
| **Số testcase Lỗi (Fail)** | 0 testcases | 0% | Toàn bộ assertion thỏa mãn |
| **Số testcase Bỏ qua (Skipped/Todo)** | 0 testcases | 0% | Không skip bất kỳ kiểm tra nào |
| **Thời gian thực thi toàn bộ suite** | ~59.32 ms | - | Thực thi tức thì, tối ưu |

### Phân rã theo mức độ ưu tiên:
- **P0 (Trọng yếu: Tính lương, Xác thực, Chấm công)**: 16/16 Pass (100%).
- **P1 (Nghiệp vụ: Đơn từ, Nhân sự, Ngày lễ)**: Được bao phủ qua validation và logic rules.
- **P2 (Hệ thống & Cấu hình)**: Được bao phủ qua health check endpoints.

---

## 2. Nhật Ký Chi Tiết Từng Ca Kiểm Thử

| Mã Testcase | Tên kịch bản | Thời gian chạy | Kết quả | Bằng chứng kiểm chứng |
|---|---|---|---|---|
| `TC-PAY-01` | Tính lương cơ bản 1 ngày & 1 giờ chuẩn 26 ngày | 1.32 ms | **PASS** | Lương ngày = 400.000đ khi lương CB = 10.400.000đ |
| `TC-PAY-02` | Phân tách công thử việc (85%) và chính thức (100%) | 0.15 ms | **PASS** | Phân tách chính xác theo mốc `ngay_chinh_thuc` |
| `TC-PAY-03` | Tính tiền OT ngày thường với hệ số 1.5x | 0.09 ms | **PASS** | Tiền OT = 150.000đ cho 4h làm thêm ngày thường |
| `TC-PAY-04` | Tính tiền OT ngày Chủ Nhật với hệ số 2.0x | 0.07 ms | **PASS** | Tiền OT = 250.000đ cho 5h làm thêm Chủ Nhật |
| `TC-PAY-05` | Tính tiền OT ngày Lễ với hệ số 3.0x | 0.15 ms | **PASS** | Tiền OT = 600.000đ cho 8h làm thêm ngày lễ 02/09 |
| `TC-PAY-06` | Trích trừ bảo hiểm xã hội 10.5% khi `has_insurance = true` | 0.54 ms | **PASS** | Trừ đúng 1.050.000đ cho lương CB 10.000.000đ |
| `TC-PAY-07` | Không trích bảo hiểm khi `has_insurance = false/0` | 0.09 ms | **PASS** | Tiền bảo hiểm bằng đúng 0đ |
| `TC-PAY-08` | Tính tổng thực lĩnh Net Salary đầy đủ | 0.15 ms | **PASS** | Net Salary đạt 13.740.000đ, làm tròn chính xác |
| `TC-SEC-01` | Loại bỏ trường password khỏi đối tượng người dùng | 0.48 ms | **PASS** | Trường `password` bị xóa hoàn toàn khỏi object |
| `TC-SEC-02` | Phân loại đúng quyền hạn RBAC theo chức danh | 0.11 ms | **PASS** | Nhận diện chính xác Admin, Accountant, Employee |
| `TC-SEC-03` | Câu lệnh SELECT nhân viên không lấy trường password | 0.06 ms | **PASS** | Cột `password` không có trong danh sách SELECT |
| `TC-ATT-01` | Thẩm tra input chấm công hợp lệ | 1.22 ms | **PASS** | Parse ngày chuẩn `YYYY-MM-DD` |
| `TC-ATT-02` | Thẩm tra status rỗng/null -> Đánh dấu xóa công | 0.13 ms | **PASS** | `isDelete = true` khi status = '' hoặc null |
| `TC-ATT-03` | Thẩm tra ngày không hợp lệ (day > 31 hoặc day < 1) | 0.34 ms | **PASS** | Trả về lỗi validate trước khi chạm database |
| `TC-ATT-04` | Thẩm tra tháng không hợp lệ (month > 12 hoặc month < 1) | 0.08 ms | **PASS** | Chặn các giá trị tháng 0 hoặc tháng 13 |
| `TC-ATT-05` | Giới hạn số giờ OT trần 24h và chặn số âm | 0.09 ms | **PASS** | 99.5h tự động bị chặn trần về 24h, âm về 0h |

---

## 3. Lỗi Đã Được Khắc Phục (Fixed Bugs)

1. **Lộ mật khẩu toàn bộ nhân sự qua API nhân viên**:
   - *Vị trí*: `sedinco_backend/server.js: line 483-487`.
   - *Nguyên nhân*: Trước đây sử dụng `SELECT * FROM employees` khiến cột `password` trả về cho mọi client.
   - *Cách khắc phục*: Giới hạn danh sách trường cụ thể trong câu lệnh SELECT, loại bỏ hoàn toàn `password`.
2. **Nguy cơ thao túng giờ OT làm sai lệch quỹ lương (OT Hours Manipulation)**:
   - *Vị trí*: `sedinco_backend/server.js: line 314-316`.
   - *Nguyên nhân*: Không có chặn trần số giờ OT đầu vào (cho phép 99h).
   - *Cách khắc phục*: Bổ sung logic chặn trần `if (hours > 24) hours = 24` và chặn số âm.

---

## 4. Khoảng Trống Kiểm Thử (Testing Gaps) & Lý Do

1. **Kiểm thử tích hợp cơ sở dữ liệu thật trực tiếp (End-to-End Database Mocking)**:
   - *Lý do*: Theo Nguyên tắc bất biến số 4, cấm tác động vào cơ sở dữ liệu thật của dự án trên production/Aiven Cloud mà không có môi trường isolated DB. Do đó các kiểm thử tập trung vào Unit Testing logic tính toán, thẩm định dữ liệu đầu vào và an toàn thông tin.
2. **Kiểm thử giao diện React Native di động (Mobile App E2E)**:
   - *Lý do*: Expo App chạy trên môi trường mobile device / simulator, chưa cấu hình Detox / Appium trong dự án.
