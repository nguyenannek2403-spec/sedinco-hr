# SEDINCO HR — UX / UI & MOBILE COMPATIBILITY AUDIT REPORT (PHASE 5)

Đánh giá trải nghiệm người dùng, khả năng sử dụng cho công nhân lớn tuổi (`font_scale` 100%–200%), tương thích màn hình nhỏ, Zalo Mini App Capsule & Safe Area (`iOS WKWebView` / `Android WebView`).

---

## 1. Đánh giá Kiến trúc Layout & Safe Area (`UniversalAppShell`, `layout-tokens.css`, `app.scss`)

### Điểm mạnh đạt chuẩn
- **Kiến trúc CSS Grid 3 hàng cố định (`UniversalAppShell.jsx`):** `height: var(--visual-vh)`, `gridTemplateRows: "auto minmax(0, 1fr) auto"` tách biệt Header (`row-start-1`), vùng cuộn chính duy nhất (`row-start-2`, `overflow-y-auto`), và Bottom Navigation nằm trong dòng chảy (`row-start-3`), triệt tiêu tình trạng che khuất nội dung cuối trang.
- **Zalo Capsule Safe Guard:** `UnifiedAppHeader` dành sẵn `[data-zalo-capsule-guard="true"]` rộng `var(--zalo-capsule-w)` (`clamp(96px, 26vw, 112px)`), và `.u-modal-header-safe` chừa đệm phải trên `<640px`.
- **Dynamic Viewport & Bàn phím ảo (`useAdaptiveViewport.js`):** Lắng nghe `window.visualViewport` cập nhật `--visual-vh` theo px thực tế và đặt `html[data-keyboard-open="true"]` để tự động ẩn Bottom Nav khi mở bàn phím ảo.
- **Chống phóng to tự động iOS & Vùng chạm thân thiện:** `app.scss` bắt buộc `min-height: 44px; min-width: 44px` trên nút/control và `font-size: max(16px, 1rem)` trên input date/time/number/select.
- **Modal Stacking & Focus Isolation (`useModalStack`):** Khóa cuộn nền đa tầng (`body-modal-open`), đặt `inert` & `aria-hidden="true"` lên `#app`, tăng `z-index` tự động cho modal lồng nhau.
- **Định dạng số & Chữ lớn cho người lớn tuổi:** Hỗ trợ scale 6 mức (`100%`–`200%`) đồng bộ từ pre-render `<script>` trong `index.html`, dùng dấu phẩy thập phân chuẩn Việt Nam (`0,5` công) và ngăn xếp số tiền rõ ràng.

---

## 2. Lỗi UX/UI & Bất cập cần xử lý

| Mức độ | Vấn đề | Vị trí cụ thể | Ảnh hưởng thực tế |
|---|---|---|---|
| **HIGH** | Kế toán không dùng được tính năng Khóa kỳ dù có quyền | `PayrollGridTable.jsx:53-55`, `roles.js:161-171` | Nút Khóa kỳ biến mất hoàn toàn với Kế toán ngay cả khi Admin đã bật `attendance_lock` |
| **MEDIUM** | Bottom Nav mobile của Kế toán thiếu tab `Hồ sơ` | `DesktopSidebar.jsx:28, 60-63` | Kế toán dùng điện thoại khó tìm nơi đổi cỡ chữ, đổi giao diện Sáng/Tối, cài đặt thẻ ngân hàng, liên kết Zalo hoặc Đăng xuất |
| **MEDIUM** | Sai prop `variant="danger"` và `maxWidthClass` ở Quản lý Media | `MediaStorageManagementTab.jsx:561,591,602` | Hộp thoại xác nhận xóa file vĩnh viễn / dọn file mồ côi không hiển thị nút đỏ cảnh báo (`danger`); modal xem trước bỏ qua `maxWidthClass` |
| **MEDIUM** | Click thông báo thiết bị từ Notification Panel không lọc đúng danh sách | `DesktopDashboard.jsx:288-291` -> `EmployeeManagementTab.jsx` | Admin bấm vào cảnh báo đa thiết bị được chuyển sang tab Nhân sự nhưng danh sách không tự lọc theo `"alerts"` |
| **MEDIUM** | Truyền `short_date` (`dd/mm`) vào `<input type="date">` khi sửa quên check-out | `WorkerDashboard.jsx:258` | Ngày bổ sung công có thể bị trống nếu thiếu `iso_date`/`work_date` |
| **MEDIUM** | Thông tin đầu trang `WorkerProfileTab` đọc `currentUser` cũ | `WorkerProfileTab.jsx:409-432` | Khi thông tin mới vừa tải từ `/auth/me`, giao diện vẫn giữ tên/SĐT/chức danh cũ |
| **MEDIUM** | Tiêu đề `DesktopHeader` sai cho sub-tab Media Storage | `DesktopHeader.jsx:106-109` | Hiển thị nhầm `"Cài Đặt • Công Ty & GPS"` thay vì `"Cài Đặt • Quản Lý Media"` |
| **LOW** | Tailwind CSS được biên dịch trùng lặp **2 lần** | `tailwind.scss` & `app.scss` | Tăng dung lượng CSS build (`229.26 kB` — `index-*.css`); dư `jotai` trong dependencies |
| **LOW** | Khoảng trắng thừa `pb-28`/`mb-24` ở cuối nhiều tab | `CompanySettingsTab`, `AttendanceMatrixTable`, `PayrollGridTable`, `HolidaysTab`, `AccountantPermissionView` | Do `UniversalAppShell` đã dành riêng `row-start-3` cho Bottom Nav, đệm dưới 100px tạo cảm giác trống trải khi kéo hết trang |
| **LOW** | Khởi tạo tháng/năm bằng local browser time thay vì `Asia/Ho_Chi_Minh` | `WorkerHistoryTab`, `WorkerRequestsTab`, `PayrollGridTable`, `SalarySlipModal`, `EmployeeManagementTab`, `DesktopDashboard` | Người dùng có thiết bị lệch múi giờ vào đêm cuối tháng / sáng mùng 1 bị mặc định sai tháng 1 đơn vị |
| **LOW** | Lệch màu `theme-color` meta tag giữa bootstrap HTML và React Context | `index.html` vs `ThemeContext.jsx` | Nháy nhẹ màu thanh trạng thái khi chuyển trang lần đầu |

---

## 3. Nhận định khả năng vận hành trên màn hình nhỏ (`320px–375px`) & Cỡ chữ lớn (`175%–200%`)

- Các màn hình Worker (`OneTouchCheckIn`, `WorkerHistoryTab` heatmap 7 cột, `SalarySlipModal` 2 tab, `WorkerRequestsTab`) dùng layout 1 cột co giãn linh hoạt (`min-w-0`, `flex-wrap`, `truncate`) và hạn chế bảng ngang nên thân thiện trên màn hình `360px–390px`.
- Tuy nhiên với `font_scale=200%` (22px root) trên chiều ngang hẹp `320px`, các nút hành động kép ngang hàng (ví dụ thanh lọc + nút `+ Tạo đơn` hoặc nút `Từ chối` / `Duyệt nhanh`) cần giữ `flex-wrap` chuẩn xác để không tràn ngang (`overflow-x`). *(Sẽ đưa vào danh sách test kiểm tra trực quan trong Phase 12 UAT trên thiết bị thật).*
