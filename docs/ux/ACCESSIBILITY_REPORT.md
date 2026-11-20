# SEDINCO HR V29 — BÁO CÁO KHẢ NĂNG TIẾP CẬN (ACCESSIBILITY REPORT)

- **Phiên bản**: V29
- **Mục tiêu**: Hỗ trợ công nhân lớn tuổi, người thị lực kém trên di động/desktop và tuân thủ kiểm tra tự động WCAG AA/AAA cơ bản.

## 1. Hệ thống điều chỉnh Cỡ chữ 6 mức (100% – 200%)
- **Mức hỗ trợ**: `100%` (Mặc định `16px`), `110%`, `125%`, `150%`, `175%`, `200%`.
- **Cơ chế áp dụng**:
  - Frontend: `FontScaleContext.jsx` (`zalo-miniapp-frontend/src/modules/accessibility/FontScaleContext.jsx`) cập nhật `document.documentElement.style.fontSize = (16 * scale / 100) + 'px'` và thuộc tính `data-font-scale`.
  - Lưu trữ đa tầng: đồng bộ `localStorage`, Zalo SDK storage (`zaloBridge`) và PostgreSQL/MySQL/CSDL qua endpoint `PUT /api/account/preferences`.
  - Backend: Cột `font_scale INT NOT NULL DEFAULT 100` trên cả `employees` và `admins`; xác thực danh sách hợp lệ `VALID_FONT_SCALES = [100, 110, 125, 150, 175, 200]` (sai trả HTTP `400`).
- **Tác động bố cục tại 200%**:
  - `WorkerDashboard.jsx` và `WorkerProfileTab.jsx` tự động chuyển header và lưới thẻ thống kê sang bố cục dọc `1` cột khi `fontScale >= 150` để không vỡ chữ hay tràn ngang.
  - `FontScaleSelector` chuyển sang `grid-cols-2 md:grid-cols-6` khi `fontScale >= 125`.

## 2. Phím tắt, Focus Management & Motion Sensitivity
- **`AppModal.jsx`**:
  - Lưu `previousFocusRef` trước khi mở và trả focus về phần tử mở khi đóng Modal.
  - Lắng nghe phím `Escape` để đóng modal an toàn.
  - Hỗ trợ thuộc tính `role="dialog"`, `aria-modal="true"`, và tiêu đề có liên kết ARIA.
- **CSS (`app.scss` & `index.html`)**:
  - Bổ sung kiểu dáng `:focus-visible` rõ nét cho nút, liên kết và ô nhập liệu.
  - Thêm `@media (prefers-reduced-motion: reduce)` vô hiệu hóa chuyển động quá mức cho người nhạy cảm tiền đình.
  - `index.html` không khóa zoom (`UI-01`).

## 3. Kết quả kiểm thử liên quan
| Test ID | Mô tả kiểm tra | Kết quả |
| :--- | :--- | :--- |
| `UI-01` | Mở khóa zoom HTML (WCAG 1.4.4) & SCSS input tại 200% | **PASS** (`0.66ms`) |
| `UI-02` | Semantic A11y, Portal architecture, switches & scroll-lock | **PASS** (`2.71ms`) |
| `UI-03` | CDP `Worker Profile Tab @ 200% Font Scale` (0 crushed text, touch target >= 42px) | **PASS** (trong `UI-03`) |
| `V29-PREF-01` | API lưu `font_scale` (100%–200%) & `theme` bền vững cho 3 vai trò + chặn giá trị lỗi 400 | **PASS** (`218.33ms`) |
| `V29-ARCH-01` | Rà soát tĩnh `AppModal` Escape + khôi phục focus & `:focus-visible` | **PASS** (`9.51ms`) |
| `MANUAL-SR-01` | Đọc màn hình VoiceOver iOS & TalkBack Android thực tế toàn luồng | **NOT TESTED** |
