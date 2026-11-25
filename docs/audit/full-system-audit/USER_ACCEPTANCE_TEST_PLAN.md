# SEDINCO HR — USER ACCEPTANCE TEST PLAN (PHASE 12 — UAT CHO NGƯỜI THẬT)

Tài liệu hướng dẫn đội ngũ QA / Product Owner kiểm thử chấp nhận thực tế (**Human UAT**) trên **Zalo Mini App Testing** (iOS & Android) và trình duyệt Web Admin/Kế toán đối với các tính năng phần cứng & bên thứ 3 mà test tự động không thể giả lập hoàn chỉnh.

---

## 1. Điều kiện tiên quyết trước khi UAT
1. Backend Staging đang chạy với đầy đủ biến môi trường: `NODE_ENV=staging`, `DB_HOST` trỏ DB Staging, `ENABLE_DIAGNOSTICS=false` (hoặc kiểm soát admin), `ZALO_APP_ID`, `ZALO_APP_SECRET`, `CASSO_APP_ID`, `CASSO_APP_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
2. Trên Zalo Mini App Portal đã cấu hình Allowlist Domain cho Backend HTTPS, `res.cloudinary.com`, `api.cloudinary.com`, `img.vietqr.io`, `api.vietqr.io`.
3. Tài khoản test trên Staging: `NV001` (Worker), `NV002` (Accountant), `admin` (Admin).

---

## 2. Kịch bản UAT Bắt Buộc trên Thiết bị Thật (iPhone & Android)

### Kịch bản UAT-01: Hiển thị Safe-Area, Capsule Zalo, Bàn phím ảo & Cỡ chữ lớn (Elderly UX)
- **Thiết bị:** 1 iPhone có Dynamic Island/Tai thỏ (`iPhone SE / 13 / 15`) + 1 Android (`360px` width, điều hướng cử chỉ/3 nút).
- **Thao tác:**
  1. Mở Zalo Mini App -> Kiểm tra góc trên bên phải không bị cụm nút `(•••) [X]` của Zalo đè lên nút Chuông thông báo hoặc nút Dark/Light.
  2. Chuyển sang **Chế độ Tối (Dark Mode)** và **Cỡ chữ 200%** trong `Hồ sơ` -> Kiểm tra toàn bộ 4 tab (`Chấm công`, `Lịch công`, `Đơn từ`, `Tài khoản`) không tràn ngang, chữ số `0,5` công và số tiền dễ đọc.
  3. Mở form tạo đơn hoặc sửa ghi chú -> Khi bàn phím ảo bật lên, Bottom Navigation phải tự ẩn không đè lên nút Gửi.
  4. Mở **Phiếu lương** -> Chuyển qua lại 2 tab `Tổng hợp lương` và `Thu nhập từng ngày`, kiểm tra cuộn mượt 1 lớp và không kéo cuộn trang nền phía sau.

### Kịch bản UAT-02: Zalo Identity Live & Xác minh SĐT (`NV001`)
- **Thao tác:**
  1. Ở màn hình Đăng nhập bấm `"Đăng nhập nhanh bằng Zalo"` (hoặc trong `Tài khoản` -> `"Liên kết Zalo hiện tại"`).
  2. Chấp nhận hộp thoại cấp quyền Zalo -> Xác nhận liên kết thành công, tên/ID Zalo lưu đúng.
  3. Bấm `"Xác minh SĐT từ Zalo"` -> Chấp nhận chia sẻ SĐT -> Backend trả kết quả khớp SĐT với hồ sơ nhân viên.
  4. Thoát app mở lại -> Bấm `"Đăng nhập nhanh bằng Zalo"` -> Tự động đăng nhập thẳng vào `NV001` không cần gõ mật khẩu.

### Kịch bản UAT-03: Chấm công GPS thật, QR Động & Từ chối quyền (Hardware + Zalo Location Token)
- **Thao tác:**
  1. Trên máy **Admin**: `Cài đặt -> Chi nhánh -> Hiển thị QR Động Chi nhánh`.
  2. Trên máy **NV001**: Đứng tại văn phòng (trong bán kính geofence) -> Bấm **CHẤM CÔNG VÀO** / **Quét QR** -> Xác nhận dùng `location_source = token` (Zalo verified), ảnh snapshot lưu về Cloudinary thành công, MISA hiển thị giờ vào chính xác.
  3. Thử nghiệm từ chối quyền GPS Zalo -> Màn hình phải hiện hướng dẫn mở cài đặt quyền Zalo và nút fallback Quét QR hoặc Đi công trình rõ ràng (không đơ, không trắng trang).

### Kịch bản UAT-04: Media Cloudinary Thật (Avatar, Đơn từ, Hồ sơ 360° & Dọn file mồ côi)
- **Thao tác:**
  1. **NV001** đổi Avatar A -> đổi sang Avatar B -> Kiểm tra `Hồ sơ` hiển thị Avatar B ngay (cả tên/SĐT vừa cập nhật nếu có).
  2. Tạo đơn nghỉ phép/bổ sung công đính kèm ảnh chụp từ Camera thật -> Admin duyệt đơn -> Bấm xem ảnh minh chứng từ `Duyệt đơn` (URL ký `/access` mở thành công, copy link sang trình duyệt ẩn danh không đăng nhập phải bị chặn `401/403`).
  3. **Admin** vào `Cài đặt -> Quản lý Media`: kiểm tra thống kê khớp dung lượng, bấm xem thử modal tài liệu và thử nút `Xóa` kiểm tra hộp thoại xác nhận hiển thị đúng màu đỏ cảnh báo (`variant="danger"`).

### Kịch bản UAT-05: Casso Tra cứu Ngân hàng + Chuyển khoản VietQR thật
- **Thao tác:**
  1. **NV001** vào `Hồ sơ -> Thẻ ngân hàng` -> Chọn ngân hàng + nhập STK thật -> Bấm `"Tra cứu tên"` -> Xác nhận Casso trả về đúng họ tên IN HOA không dấu -> Lưu thành công.
  2. **Admin** vào `Bảng lương` -> Gửi báo cáo cho `NV001` -> Mở `"Chuyển khoản"` -> Kiểm tra mã QR VietQR hiển thị chuẩn số tiền Net Pay -> Thử bấm `"Mở App Ngân hàng chuyển tiền"` trên điện thoại xem deeplink mở app ngân hàng đúng thông tin thụ hưởng -> Xác nhận đã chuyển khoản -> `NV001` xác nhận `"Đã nhận lương"`.

### Kịch bản UAT-06: Kế toán Phân quyền Động trên Mobile & Desktop (`NV002`)
- **Thao tác:**
  1. **Admin** bật `attendance_lock = true` và `attendance_edit = true` cho Kế toán.
  2. **NV002 (Kế toán)** đăng nhập trên điện thoại: Kiểm tra Bottom Nav có đủ tab nghiệp vụ + tab **`Hồ sơ`** ở cuối; vào `Bảng lương` xác nhận nút **Khóa kỳ công** hiển thị và hoạt động bình thường (nhưng không có nút Mở khóa kỳ — Admin SoD).
