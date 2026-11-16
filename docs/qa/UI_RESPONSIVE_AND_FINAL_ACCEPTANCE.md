# SEDINCO HR — UI/UX RESPONSIVE, ACCESSIBILITY & FINAL ACCEPTANCE

Cập nhật lần cuối: `2026-11-14` | Phiên bản build sau bản sửa cuối: `npm --prefix zalo-miniapp-frontend run build` -> `2515 modules`, `2.17s` (`www/index.html`, `www/assets/index-B7VYAiRJ.css` `174.15 kB`, `www/assets/index.CaZhrsPI.module.js` `730.36 kB`).

---

## 1. Báo cáo Kiểm thử Trình duyệt Thật (Headless Brave CDP — `UI-03`)

Kiểm thử chạy trực tiếp trên bundle build thật `zalo-miniapp-frontend/www/index.html` thông qua Headless Brave (`--headless=new`) và Chrome DevTools Protocol (`Emulation`, `Fetch`, `Runtime`, `Page`):

| Màn hình / Luồng | Bề rộng viewport (px) | Tỷ lệ chữ gốc (`html font-size`) | Kiểm tra tràn ngang (`scrollWidth <= clientWidth + 1`) | Kích thước nút chạm (`>= 44px` / Auth `>= 42px`) | Yêu cầu A11y chuyên biệt | Kết quả |
|---|---|---|---|---|---|---|
| `AuthView` (Đăng nhập 1 chạm + form + Làm mới bộ nhớ tạm) | `320px` | `16px` (`100%`) | `overflowX === false` | Toàn bộ nút hiển thị `>= 42px`, nút toggle mật khẩu có `aria-label` + `44px` | Không còn `max-scale=1`, `user-scalable=no` | ✔ PASS |
| `WorkerDashboard` + `OneTouchCheckIn` | `320, 360, 375, 390, 412, 430` (6 mốc) | `16px` (`100%`) & `32px` (`200%` — 12 tổ hợp) | `overflowX === false` trên toàn bộ 12/12 tổ hợp | Nút Bottom Nav `>= 44px`; nút Check-in tròn dãn tự nhiên `circleClipped === false` | Chữ input `max(16px, 1rem)` tránh iOS auto-zoom, không cắt chữ ở `200%`, có camera file fallback + thông báo lỗi rõ ràng | ✔ PASS |
| `WorkerHistoryTab` (Lịch công Heatmap) | `375px` | `16px` (`100%`) | `overflowX === false` | Toàn bộ ô ngày `minHeight >= 44px` (`min-h-[48px]`) | Ký hiệu văn bản phi màu sắc (`1`, `0.5`, `P`, `L`, `OT`, `V`, `KP`, `CN` `"Cuối tuần"`) hiển thị rõ | ✔ PASS |
| `DesktopDashboard` + `AccountantPermissionView` (Accountant/Admin) | `360px` & `1280px` | `16px` (`100%`) | Sạch bố cục mobile `360px` (`hasHeader === true`) & desktop `1280px` | `button[role="switch"]` có vùng chạm `>= 44px` | Đọc được `>= 2` công tắc ngữ nghĩa `<button role="switch" aria-checked>`, polling DOM readiness ổn định sau reload | ✔ PASS |
| Toàn bộ quá trình chạy trình duyệt CDP | Tất cả mốc trên | `100%` & `200%` | — | — | `failed4xx === []` (0 dead routes), `pageErrors === []` (0 unhandled exceptions / rejections) | ✔ PASS |

---

## 2. Tổng hợp Tối ưu Cho Người Lớn Tuổi, Công Nhân Hiện Trường & Kế Toán

- **Phóng to & Cỡ chữ 200% (`WCAG 1.4.4`)**: Loại bỏ `maximum-scale=1, minimum-scale=1, user-scalable=no` khỏi `zalo-miniapp-frontend/index.html`; chuẩn hóa `font-size: max(16px, 1rem)` trong `src/css/app.scss`; xóa chữ siêu nhỏ `<12px` trên tất cả màn hình Worker, Desktop và Modal (`>= text-xs`), nâng đồng bộ toàn bộ nút/input/link chạm lên `min-h-[44px]` / `min-w-[44px]`.
- **Hỗ trợ mù màu, Chủ nhật & Camera WebView**: Heatmap công tháng gắn ký hiệu chữ ngay trong ô ngày, xử lý đúng ngày Chủ nhật quá khứ chưa có log (`"CN"` / `"Cuối tuần"`); `OneTouchCheckIn` bổ sung `<input type="file" accept="image/*" capture="environment" />` kèm `compressAndResizeImage` khi thiết bị không mở được WebRTC camera và hiển thị `errorMessage` trực quan, không còn `"(< 50KB)"`.
- **Ngôn ngữ phổ thông & Đồng bộ quyền trên UI**: Loại bỏ hoàn toàn thuật ngữ kỹ thuật còn sót (`"Sổ lỗi P1"` -> `"Lưu ý nghiệp vụ tiền lương"`, `"TiDB Cloud"` -> `"hệ thống"`, `"Dọn Log Quá Hạn"` -> `"Dọn nhật ký cũ"`, `"13 quyền"` -> đếm động `14 quyền`); nối chặt `dynamicPerms` & `isAdmin` vào `DesktopDashboard`, `AttendanceMatrixTable`, `PayrollGridTable`, `RequestsManagementTab`, `EmployeeManagementTab` và sửa `ConfirmDialog` `variant="danger"` trong `HolidaysTab` & `EmployeeManagementTab`.

---

## 3. Bảng Đánh giá Nghiệm thu Cuối cùng (21 Tiêu chí Go / No-Go)

| STT | Tiêu chí Nghiệm thu | Kết quả đo thực tế sau bản sửa cuối | Đạt |
|---|---|---|---|
| 1 | Phân tích AST toàn bộ Backend (`AST-01`) | `48` module Backend parse sạch, 0 lỗi `require()` cục bộ | ✅ PASS |
| 2 | Phân tích AST & Dialog an toàn Frontend (`AST-02`) | `41` module Frontend JSX/JS parse sạch, 0 `window.confirm`/`alert`/`prompt` | ✅ PASS |
| 3 | Anti-Hang DB Pool, Clean Exit & Zero Dead Auth Routes (`AST-03`) | `connectTimeout: 10000`; `npm test` thoát Exit `0` không dùng `--test-force-exit`; 0 route chết | ✅ PASS |
| 4 | Đối soát 100% API Frontend ↔ Express Backend (`CONTRACT-01`) | 100% `safeGet/Post/Put/Delete` khớp với `129` Express route handlers đang mount | ✅ PASS |
| 5 | Đồng bộ Proxy Check-in, Tab Guard & RBAC UI (`CONTRACT-02`, `CONTRACT-04`) | `LiveAttendanceBoardModal` gửi `work_location_type`; 3 roles chuẩn (`worker`/`accountant`/`admin`, hết `ROLES.HR`), SoD & `dynamicPerms` đồng bộ | ✅ PASS |
| 6 | Không lọt ngôn ngữ lập trình viên lên UI (`CONTRACT-03`) | Sạch 0 jargon kỹ thuật trong UI chính thức và các modal V3 | ✅ PASS |
| 7 | Xác thực JWT, Dynamic Perms khi Login & Admin Change Password (`AUTH-01`, `AUTH-02`, `QA3-AUTH-01..02`) | Chặn `401/403` tức thì; login & `zalo-auto-login` trả đủ `dynamic_permissions`; policy & đổi mật khẩu admin hoạt động | ✅ PASS |
| 8 | Liên kết Zalo & Bảo vệ Endpoint Cấu hình (`AUTH-03`, `AUTH-04`) | `bind-zalo` + `zalo-auto-login` roundtrip `200`; endpoint cấu hình/ngày lễ/kỳ công trả `401` khi ẩn danh | ✅ PASS |
| 9 | Phân quyền 3 Role, Ma trận 403 Kế toán & SoD Cốt lõi (`RBAC-01`, `RBAC-02`, `QA3-RBAC-01`) | Mọi nhánh thiếu `dynamic_permissions` trả `403`; mở khóa kỳ công / đổi role / `PUT /company` / audit-logs khóa chặt Admin | ✅ PASS |
| 10 | Phòng thủ BOLA/IDOR, SQLi, XSS, Brute-force & Partial Employee Update (`SEC-01`, `QA3-EMP-01`) | Hủy đơn người khác bị chặn; login rate limit trả `429`; `PUT /employees/:id` hỗ trợ partial & trả `404` | ✅ PASS |
| 11 | Geofence GPS, Chống IP Spoof & Khóa Token vị trí (`ATT-01`..`ATT-03`) | Mock token bị chặn ở `production`; header `X-Forwarded-For` giả bị bỏ qua | ✅ PASS |
| 12 | Race Condition, Khóa Kỳ Công, `DEDUCT_WORKDAY` & Xóa Công Audit (`ATT-04`, `ATT-05`, `QA3-ATT-01..02`) | Trùng check-in chỉ sinh 1 dòng; `DEDUCT_WORKDAY` giữ `0.5` & trần `<=4.5h`; xóa công trả `404` + ghi `DELETE_ATTENDANCE` | ✅ PASS |
| 13 | Nghiệp vụ Đơn từ, Giới hạn 3 lần gồm `'ct'`, Chống Tự duyệt & Bảo toàn `'1'` khi Từ chối OT (`REQ-01`..`REQ-04`, `QA3-REQ-01`) | Trùng ngày `409`; `'ct'` tính chung 3 đơn/tháng; Kế toán/Admin bị chặn `403` tự duyệt; từ chối OT giữ nguyên `'1'` | ✅ PASS |
| 14 | Tính lương, `resolve-dispute` 400/404, Golden Oracle & Xuất CSV >200 NV (`PAY-01`..`PAY-03`, `QA3-PAY-01`) | Cộng đủ `1.0` công cho `P`/`L`; `resolve-dispute` kiểm tra `new_status` (`400`) & NV (`404`); CSV chống formula injection | ✅ PASS |
| 15 | Sargable DB Query (`QA3-DB-01`) & Benchmark Cục bộ (`benchmark_local.js`) | `attendance_logs_sargable_range` quét bằng `unique_emp_date` (`cost=2.11`); P95 `200` NV <= `51.48 ms` | ✅ PASS |
| 16 | Chống Race Condition Cancel Request Frontend (`QA3-FE-01`) | `safeGet(..., { cancelPrevious: true })` chỉ xóa đúng controller của request vừa kết thúc | ✅ PASS |
| 17 | Kiểm thử Responsive 6 Viewport x 2 Mức chữ 100%-200% (`UI-01`..`UI-03`) | `0` tràn ngang qua 12 tổ hợp Worker + kiểm tra `360px`/`1280px` Desktop, mọi nút chạm `>= 44px` (`AuthView >= 42px`) | ✅ PASS |
| 18 | Heatmap Phi-màu sắc, Switch ARIA & Sạch Runtime Browser (`UI-03`) | `shortCode` (gồm `CN`) hiển thị rõ; `button[role="switch"] >= 2`; `0` dead route & `0` pageErrors | ✅ PASS |
| 19 | Build Sản phẩm Frontend (`vite build`) & Toàn Bộ Suite Cục bộ (`npm test`) | `vite build` xanh (`2.17s`); `npm test` đạt **`39/39 PASS`** (`20,663.62 ms`, `0` fail, `0` skipped, Exit `0`) | ✅ PASS |
| 20 | Độ sạch CSDL Kiểm thử Local (`sedinco_hr_test`) | Đã dọn sạch tồn dư test/benchmark cục bộ về `0` ở tất cả bảng kiểm tra | ✅ CLEAN |
| 21 | Phạm vi TiDB Cloud (`run_e2e_cloud.js` & Cloud Benchmark) | V2 Cloud E2E đã PASS (`actualWorkDays === 2`, `0` bản ghi dư); **V3 Cloud E2E: `NOT_RE_RUN_AFTER_V3_EDITS`** \| **Cloud Benchmark: `NOT_MEASURED` (`BLOCKED` theo guardrail)** | ⚠️ GUARDRAIL BOUNDARY |

---

## 4. Điểm Nghiệp vụ Chờ Xác nhận (`NEEDS_BUSINESS_CONFIRMATION`)

1. Chốt quy tắc trả lương đối với OT phát sinh nhưng chưa có đơn `ot_registrations` được duyệt trước (`payrollCalculator.js`).
2. Xác nhận lộ trình lưu trạng thái chốt/thanh toán lương thay cho việc chỉ ghi Audit Log hiện tại (`approvePayroll`, `updatePaymentStatus`, `/payroll/status-list`).
3. Rà soát ~15 key dư trong `accountant_permissions` chưa hiển thị trong danh sách 14 preset của `AccountantPermissionView.jsx`.
4. Chốt thời điểm chuyển `device_binding_mode` mặc định từ `'recording'` sang chế độ kiểm soát chặt hơn và quy trình staging token (`NODE_ENV=staging`).
5. Chốt cách hiển thị/kết chuyển khi tổng khấu trừ lớn hơn thu nhập dẫn đến lương thực lãnh âm (`PayrollGridTable.jsx`).
