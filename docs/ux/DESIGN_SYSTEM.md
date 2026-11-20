# SEDINCO HR V29 — DESIGN SYSTEM & SHARED UI KIT

- **Trạng thái**: Đã kiểm tra • Đã xác nhận (`vite build` + `UI-01..03`)

## 1. Thành phần Giao diện Dùng chung (`zalo-miniapp-frontend/src/components/ui/`)

| Component | Vai trò & Tiêu chuẩn bắt buộc | Trạng thái |
| :--- | :--- | :--- |
| `AppButton` | Khóa chống bấm đúp `useRef`, `Loader2`, `min-h-[46px]`, 6 biến thể màu Light/Dark tự động | Đã xác nhận |
| `AppModal` | `createPortal(..., document.body)`, khóa cuộn đa tầng, `Escape`, khôi phục focus khi đóng, Z-index stack 100/110/120 | Đã sửa & xác nhận |
| `ConfirmDialog` | Cảnh báo xác nhận hành động nhạy cảm (đăng xuất, hủy đơn, phát hành lương) | Đã xác nhận |
| `FormRow` | Nhãn rõ ràng gắn với control, tự xuống hàng trên màn hình hẹp 320px hoặc cỡ chữ 200% | Đã xác nhận |
| `StatusBadge` | Luôn kết hợp màu + nhãn chữ tiếng Việt / biểu tượng (không dựa màu đơn lẻ) | Đã xác nhận |
| `SkeletonList` / `EmptyState` | Hiển thị trạng thái đang tải & hướng dẫn rõ ràng khi chưa có dữ liệu | Đã xác nhận |
| `FontScaleSelector` | Chọn 6 mức cỡ chữ `100% / 110% / 125% / 150% / 175% / 200%` | Đã sửa & xác nhận |
| `NotificationCenterPanel` | Trung tâm thông báo thống nhất 3 lọc + trạng thái đọc/chưa đọc + phân trang | Đã sửa & xác nhận |

## 2. Token Màu Sáng/Tối & Typography

- **Nền Sáng (Light - ZaUI Doctor)**: `--surface-base: #f4f6f9`, `--surface-card: #ffffff`, `--text-primary: #0f172a`, `--text-secondary: #475569`.
- **Nền Tối (Dark)**: `--surface-base: #090d16`, `--surface-card: #0f172a`, `--text-primary: #f8fafc`, `--text-secondary: #94a3b8`.
- **Định dạng số Việt Nam (`viNumberFormat.js`)**: Hàng nghìn dùng dấu `.` (`1.000.000 đ`), ngày công lẻ dùng dấu `,` (`0,5 công`).
- **Focus & Motion (`app.scss`)**: `:focus-visible` viền `2px solid #0068ff` (`#60a5fa` ở Dark mode); tôn trọng `@media (prefers-reduced-motion: reduce)`.
