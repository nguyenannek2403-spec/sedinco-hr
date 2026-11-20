# SEDINCO HR V29 — KIỂM TOÁN UX/UI & CHẤT LƯỢNG GIAO DIỆN (UX/UI AUDIT)

- **Phiên bản**: V29
- **Phạm vi kiểm tra**: Cả 3 vai trò (`worker` trên Zalo Mini App mobile viewport `360px–430px`, `accountant` và `admin` trên Desktop & Mobile responsive `320px`, `360px`, `430px`, `768px`, `1024px`, `1440px`), chế độ Sáng/Tối (`light`/`dark`), cỡ chữ `100%` và `200%`.

## 1. Các vấn đề phát hiện trước V29 & Cách xử lý
| Vấn đề | Bối cảnh & Ảnh hưởng | Giải pháp V29 đã triển khai | Kết quả xác minh CDP (`UI-03`) |
| :--- | :--- | :--- | :--- |
| Chuông thông báo đứng yên badge `1` khi bấm xem | `DesktopHeader.jsx` và `WorkerDashboard.jsx` thiếu lịch sử đọc, thiếu bộ lọc và đếm trên mảng cảnh báo động. | Hợp nhất qua `useNotifications.js` + `NotificationCenterPanel.jsx` với 3 tab (`Tất cả`, `Chưa đọc`, `Đã đọc`), Optimistic UI, `Đánh dấu tất cả đã đọc` và `Xem thêm`. | **PASS** — Đã test click chuông & đánh dấu đọc thật trên Worker & Admin qua CDP (`UI-03`) và API (`V29-NOTIF-01`, `V29-NOTIF-02`). |
| Vùng nút đáy `SalarySlipModal.jsx` sai/thiếu theo vai trò | Admin thiếu thanh sticky `[← Đóng]`, `[✏️ Điều chỉnh Thưởng/Phạt/Ứng]`, `[📄 Tải / In Phiếu lương]`, nút Prev/Next NV; Worker lẫn nút vào vùng cuộn và hiện ở Bản nháp. | Tách `PayslipActionFooter.jsx` truyền qua prop `footer` cố định của `AppModal.jsx`; phân nhánh tuyệt đối Admin/Accountant vs Worker (`locked`, `confirmed`, `draft`). | **PASS** — Kiểm tra CDP trên Worker Payslip Modal và Admin Stacked 360° Payslip Modal (`UI-03`). |
| Header Tài khoản Worker ở cỡ chữ 200% bị bóp bề ngang | Ở `390px` và font scale `200%`, hàng header gồm nút `Trở về` + chừa capsule `pr-[96px]` khiến tiêu đề `"Tài khoản Cá nhân"` bị nén còn `39px`. | Thêm `isLargeFont = fontScale >= 150` trong `WorkerDashboard.jsx` & `WorkerProfileTab.jsx`: xếp nút quay lại tách dòng, dùng padding pixel cố định `14px` và `grid-cols-1` cho thống kê tháng. | **PASS** — `UI-03 [Worker Profile Tab @ 200% Font Scale]` đạt 0 crushed text, 0 horizontal overflow. |
| Thông báo kỹ thuật rò ra giao diện QA Center | Văn bản chứa từ khóa kỹ thuật bị `CHECK-5` chặn. | Chuẩn hóa ngôn ngữ thân thiện tiếng Việt trong `qaCenterService.js`, `bugRegistry.json` và ghi chú benchmark. | **PASS** — `UI-03 [Admin Tab: QA Center @ 360px]` đạt 0 lỗi DOM jargon. |

## 2. Kết quả quét đa kích thước & đa chế độ (`UI-01`, `UI-02`, `UI-03`)
- **Responsive Overflow Check (`RoleOverviewDashboard`)**: đã chạy quét CDP trên 5 độ phân giải `320x640`, `430x932`, `768x1024`, `1024x768`, `1440x900` — độ tràn ngang `scrollWidth - innerWidth <= 1px`.
- **Modal Scroll Physics & Focus**: 0px background scroll bleed, inner `.modal-scroll-area` cuộn độc lập, z-index tăng nghiêm ngặt cho stacked modal.
- **Sáng/Tối (`Light/Dark Parity`)**: Tự động xác nhận `colorScheme === 'light'` và độ tương phản bề mặt tối `.dark` trên tất cả các màn hình đã duyệt trong `UI-03`.

## 3. Hạng mục chưa kiểm tra thực địa
- `MANUAL-ZALO-DEVICE-01`: Hiển thị thật trên ứng dụng Zalo iOS/Android vật lý (tai thỏ, GPS phần cứng, capsule Zalo hệ thống) -> **NOT TESTED** trong môi trường CLI.
