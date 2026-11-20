# SEDINCO HR V29 — BÁO CÁO TÁI CẤU TRÚC DASHBOARD & SIDEBAR

- **Phiên bản**: V29
- **Mục tiêu**: Khắc phục tình trạng màn hình quản trị mở thẳng vào bảng ma trận công 31 ngày nặng nề, gom nhóm điều hướng khoa học theo RBAC và bổ sung trang Tổng quan theo vai trò.

## 1. Kiến trúc Trang Tổng quan (`RoleOverviewDashboard.jsx`)
- **Vị trí**: `zalo-miniapp-frontend/src/modules/dashboard/RoleOverviewDashboard.jsx`, đăng ký làm tab mặc định `overview` cho `admin` và `accountant` khi có quyền.
- **Nội dung hiển thị & Lọc RBAC**:
  - Thống kê nhanh theo ngày: Quân số đi làm, Chờ duyệt đơn, Cảnh báo gian lận/đa thiết bị, Kỳ lương hiện tại và trạng thái khóa kỳ (`Đã chốt` / `Bản nháp`).
  - Lọc nghiêm ngặt theo 16 khóa phân quyền động đối với vai trò `accountant`: chỉ hiển thị thẻ và lối tắt tới đúng các phân hệ được Admin cấp phép (`attendance_view_all`, `requests_view_all`, `payroll_view_all`, v.v.); Kế toán không nhìn thấy khu vực QA Center hay cấu hình hệ thống.
  - Quản trị viên (`admin`) nhìn thấy đầy đủ thẻ tổng quan và lối tắt nhanh sang Nhân sự, Bảng lương, Yêu cầu đổi thiết bị, Đơn từ và QA Center.

## 2. Phân nhóm Sidebar (`DesktopSidebar.jsx` & `roles.js`)
Sidebar Desktop được chia theo nhóm nghiệp vụ rõ ràng (hỗ trợ nhóm thu gọn / phân tách trực quan trên mobile drawer và desktop rail):
1. **Tổng quan**: `Tổng quan` (`overview`).
2. **Chấm công & Nghỉ phép**: `Bảng công` (`matrix`), `Đơn từ & OT` (`requests`).
3. **Nhân sự & Tiền lương**: `Quản lý` (`management` — gồm Nhân sự & Thiết bị, Giám sát Lương, Phân quyền Kế toán), `Cấu hình` (`settings` — Admin only).
4. **Kiểm soát Chất lượng & Cá nhân**: `QA Center` (`qa_center` — **Admin only**), `Tài khoản & Cài đặt` (`account`).

## 3. Kiểm chứng đáp ứng & Phân quyền
- **Đáp ứng đa màn hình (`320px–1440px`)**: Kiểm thử qua CDP trong `UI-03` không có tràn ngang trên cả 5 độ phân giải (`320x640`, `430x932`, `768x1024`, `1024x768`, `1440x900`).
- **Tách quyền RBAC**: Được xác nhận qua `CONTRACT-02`, `RBAC-01`, `RBAC-02`, `V29-QA-01` và CDP Admin/Accountant session trong `UI-03`.
