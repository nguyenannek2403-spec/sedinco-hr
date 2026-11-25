# SEDINCO HR — BUTTON & INTERACTION AUDIT (PHASE 4 & 5)

Bản kiểm kê toàn bộ màn hình, tab, modal, nút bấm, biểu mẫu và trạng thái tương tác trên `zalo-miniapp-frontend/src/`.

---

## 1. Màn hình Đăng nhập & Khung ứng dụng chung (`AuthView.jsx`, `pages/index.jsx`, `DesktopHeader.jsx`, `DesktopSidebar.jsx`)

| Vị trí | Control / Nút bấm | Hành động mong đợi | Tình trạng thực tế & Lỗi phát hiện |
|---|---|---|---|
| `AuthView` | `#auth-username`, `#auth-password`, nút ẩn/hiện MK, `"Đăng nhập"`, `"Đăng nhập nhanh bằng Zalo"` | Đăng nhập Credential hoặc Zalo 1 chạm | Đủ loading/error state; `AuthView` nhận prop `onClearCache` từ `HomePage` nhưng không sử dụng |
| `AuthView` / Headers | `<ThemeToggleButton compact />` | Chuyển Sáng/Tối và đồng bộ `PUT /account/theme` | Hoạt động; `theme-color` meta khác mã HEX nhỏ giữa `index.html` (`#090d16`/`#f9f9ff`) và `ThemeContext.jsx` (`#0b1120`/`#f1f5f9`) |
| `DesktopHeader` | Nút Menu Hamburger (`lg:hidden`), Avatar -> Profile, Chuông (`desktop-bell-btn`), Refresh, `"Mật khẩu"`, `"Đăng xuất"` | Điều hướng, mở Notification Panel, refresh tab hiện tại | **Bug Title (`DesktopHeader.jsx:106-109`):** sub-tab `"media_storage"` hiển thị sai tiêu đề `"Cài Đặt • Công Ty & GPS"`; tồn tại nhánh chết `settingsSubTab === "audit_logs"` |
| `DesktopSidebar` (Mobile Bottom Nav) | Bottom bar cho Admin (5 tab) & Accountant | Điều hướng nhanh trên mobile | **UX Bug (`DesktopSidebar.jsx:28, 60-63`):** Mobile bottom nav của **Accountant thiếu tab `"profile"`** dù comment mô tả có; Accountant phải bấm avatar nhỏ trên header hoặc mở drawer |

---

## 2. Giao diện Nhân viên (`WorkerDashboard`, `OneTouchCheckIn`, `WorkerHistoryTab`, `WorkerRequestsTab`, `WorkerProfileTab`)

| Màn hình / Modal | Control / Nút bấm | Hành động mong đợi | Tình trạng thực tế & Lỗi phát hiện |
|---|---|---|---|
| `OneTouchCheckIn` | Nút `[data-testid="btn-checkin"]`, `[data-testid="btn-checkout"]`, `"Quét mã QR chấm công"`, `"Đi công trình (GPS)"`, Banner quên check-out | Chấm công vào/ra theo GPS/QR/Wi-Fi, nhắc quên check-out | `STAGES.SUBMITTING` được check ở UI JSX nhưng `setStage(STAGES.SUBMITTING)` chưa bao giờ được gọi; `fetchTodayStatus` nuốt lỗi không báo banner; `keepScreenOn(true)` bật suốt thời gian ở tab checkin |
| `WorkerDashboard` -> `SmartLeaveRequestModal` | Banner quên check-out mở modal bổ sung công | Gán sẵn ngày quên check-out `YYYY-MM-DD` | **Bug (`WorkerDashboard.jsx:258`):** Fallback `fixCheckoutInfo.short_date` (dạng `25/11`) truyền vào `<input type="date">` khiến ô ngày rỗng/không hợp lệ nếu thiếu `iso_date`/`work_date` |
| `WorkerHistoryTab` | `<` Tháng `>`, nút Refresh, Heatmap Grid (`worker-heatmap-cell-*`), nút chi tiết -> `"Gửi đơn bổ sung công cho ngày này"`, CTA `"Xem phiếu lương"` | Xem lịch công tháng & chi tiết từng ngày | Khởi tạo tháng/năm bằng `new Date()` theo giờ máy thay vì `Asia/Ho_Chi_Minh` |
| `WorkerRequestsTab` | `"+ Tạo đơn"`, Filter pills (`all`, `PENDING`, `APPROVED`, `REJECTED`), `"Hủy đơn"` (`ConfirmDialog`) | Tạo / lọc / hủy đơn từ | Hoạt động tốt; nhận prop `prefillFixDate`/`prefillCheckInTime`/`onClearPrefill` nhưng `WorkerDashboard` không truyền |
| `WorkerProfileTab` | Upload/Xóa Avatar, Toggle lịch sử thiết bị, `"Xem phiếu lương"`, `<BankCardModal>`, `<FontScaleSelector />`, Liên kết/Hủy liên kết/Xác minh SĐT Zalo, `"Tài khoản & Mật khẩu"`, `"Đăng xuất"` | Quản lý hồ sơ & Zalo cá nhân | **Bug (`WorkerProfileTab.jsx:409-432`):** Phần đầu trang hiển thị `currentUser` cũ thay vì `profileUser` mới fetch từ `/auth/me`; `useEffect` nuốt lỗi `.catch(() => null)` không có loading/error banner; huy hiệu `"Đang hoạt động"` gắn cứng |

---

## 3. Giao diện Quản trị & Kế toán (`EmployeeManagementTab`, `AttendanceMatrixTable`, `RequestsManagementTab`, `PayrollGridTable`, `Settings`)

| Màn hình / Modal | Control / Nút bấm | Hành động mong đợi | Tình trạng thực tế & Lỗi phát hiện |
|---|---|---|---|
| `EmployeeManagementTab` | Tìm kiếm, `"Thêm nhân viên"`, Thẻ NV -> Modal 360°, Upload/Xóa avatar & tài liệu, Phê duyệt/Từ chối đổi thiết bị, Reset thiết bị, `"Tạm khóa/Mở khóa"`, `"Phiếu lương & Bảng công chi tiết"` | Quản trị nhân sự toàn diện | **Bug Alert Filter:** Nhận & đọc sai — `DesktopDashboard` truyền `initialFilter="alerts"` khi bấm thông báo thiết bị nhưng `EmployeeManagementTab` không nhận/xử lý prop `initialFilter`; nút Xóa nhân viên không có trên UI (chỉ tồn tại API backend đang lỗi 500) |
| `AttendanceMatrixTable` | `<MonthYearPicker>`, Lọc phòng ban, Tìm kiếm, Card NV -> Lịch 31 ngày -> Ô ngày (`1`, `0.5`, `P`, `KL`, `OT`, `1/OT`, `L`, Xóa) | Sửa công thủ công từng ngày | Tinh gọn dạng Thẻ đúng chuẩn V48.1 |
| `RequestsManagementTab` | Lọc trạng thái (`pending`/`all`/`processed`), Phòng ban, `"Từ chối"`, `"✓ Duyệt nhanh"`, Modal lịch sử chi tiết | Duyệt/từ chối đơn (chặn tự duyệt) | Hoạt động đúng SoD; phụ thuộc `GET /requests/by-employees` có giới hạn `LIMIT 600` ở backend |
| `PayrollGridTable` | Tìm kiếm, `<MonthYearPicker>`, Lọc phòng ban, Nút Khóa/Mở kỳ (`payroll-period-lock-btn`), `"📨 Gửi báo cáo tất cả"`, Banner khiếu nại mở, Nút `"Xem phiếu"`, `"Chuyển khoản"`, `"Điều chỉnh"` | Điều hành bảng lương & chuyển khoản | **CRITICAL UI RBAC BUG (`PayrollGridTable.jsx:53-55` + `roles.js:161-171`):** `canLockPeriod` cho Accountant luôn bằng `false` vì `hasPermission(effectiveRole, "canLockPeriod")` kiểm tra key tĩnh `false`, chặn Kế toán khóa kỳ dù Admin đã cấp quyền `attendance_lock`! |
| `CompanySettingsTab` | 4 Accordion (Giờ/Công ty, Phòng ban CRUD, Chi nhánh GPS/Wi-Fi + Dynamic QR modal, Quy tắc lương/phạt/OT), `"Khôi phục mặc định"`, `"Lưu cấu hình"` | Cấu hình hệ thống | Hoạt động đầy đủ; nhiều class `pb-28`/`mb-24` dư thừa tạo khoảng trống cuộn thừa cuối trang |
| `AccountantPermissionView` | `"Cấu hình mặc định"`, 16 toggle `role="switch"`, `"Lưu phân quyền"`, 5 audit log gần nhất | Phân quyền động cho Kế toán | Đồng bộ 16/16 quyền enforced |
| `HolidaysTab` | `"Thêm ngày lễ"`, Sửa, Xóa (`x1,5`/`x2`/`x3`/tùy chỉnh) | CRUD ngày lễ linh hoạt | Hoạt động đúng |
| `MediaStorageManagementTab` | `"Đồng bộ Usage API"`, `"Quét & Dọn file mồ côi"`, 6 bộ lọc, `"Xem"`, `"Xóa"` | Quản trị kho media Cloudinary | **UI Prop Bugs:** Line 591 & 602 truyền `danger={true}` (sai, `<ConfirmDialog>` cần `variant="danger"`); Line 561 truyền `maxWidth="max-w-lg"` (sai, `<AppModal>` cần `maxWidthClass="max-w-lg"`) |

---

## 4. Modal Dùng Chung (`SalarySlipModal`, `BankCardModal`, `BankTransferModal`, `PeriodLockModal`, `NotificationCenterPanel`)

| Component | Chức năng & Tương tác | Đánh giá |
|---|---|---|
| `SalarySlipModal` + `PayslipActionFooter` | 2 tab tức thì (`Tổng hợp lương` & `Thu nhập từng ngày`), ẩn dòng `0 đ`, xuất `.xlsx`, báo sai sót + upload ảnh, giải quyết khiếu nại, chuyển NV trước/sau | Cấu trúc single-layer fullScreenSheet mượt mà, nút hành động ergonomic |
| `BankCardModal` | Quét ảnh VietQR (`jsqr`), tra cứu chủ TK (`POST /account/lookup-bank`), chỉ lưu 4 trường text | An toàn (chặn lưu ảnh QR) |
| `BankTransferModal` | Tạo ảnh VietQR offline (`qrcode`), Copy STK/Ghi chú, mở app ngân hàng (`openOutApp`) hoặc chia sẻ Zalo (`openShareSheet`), cảnh báo nếu NV chưa xác nhận phiếu | Đầy đủ UX & nhắc nhở an toàn; dùng `document.execCommand("copy")` làm fallback cũ |
| `NotificationCenterPanel` | Tab `all`/`unread`/`read`, đánh dấu đọc 1/tất cả, phân trang `"Xem thêm"`, click điều hướng tới mục tương ứng | `handleClickNotification` thiếu phản hồi lỗi nếu network fail |
