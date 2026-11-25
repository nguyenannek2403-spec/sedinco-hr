# SEDINCO HR — CLOUDINARY LIFECYCLE & MEDIA SECURITY AUDIT (PHASE 8)

Kiểm toán toàn diện hệ thống quản lý Media tập trung (`cloudinaryService.js`, `mediaLifecycleService.js`, `cloudinaryUsageMonitor.js`, `uploadRateLimiter.js`, `mediaFolderPolicy.js`, `mediaValidator.js`, `MediaStorageManagementTab.jsx`, `SecureMediaPreview.jsx`).

---

## 1. Cấu hình & Ranh giới môi trường

- **Production/Staging Env vs Local Test Env:**
  - Bộ test tự động (`tests/`) thực thi trên `NODE_ENV=test` sử dụng mock transport (`cloudinaryService.setTransportAdapter`) và mock usage fetcher (`cloudinaryUsageMonitor.setUsageApiFetcher`) được khóa cứng chỉ cho phép kích hoạt trong `NODE_ENV=test`. **Không tạo rác hay xóa bất kỳ file nào trên Cloudinary thật.**
  - Ghi nhận môi trường cục bộ `sedinco_backend/.env` hiện **không khai báo** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Nếu thiếu 3 biến này trên server Staging/Production, ảnh nhỏ <= 155KB rơi vào `inline_compact_fallback` (Data URL), còn PDF/Video/ảnh > 155KB trả `503 CLOUDINARY_NOT_CONFIGURED`.
- **An toàn khóa bí mật:** `CLOUDINARY_API_SECRET` không tồn tại ở bất kỳ file nào trong `zalo-miniapp-frontend/`; toàn bộ chữ ký URL (`sign_url: true`, TTL 300s) và Admin Usage API thực thi server-side.

---

## 2. Xác minh Vòng đời Avatar A -> B -> Thay thế -> Dọn file mồ côi (`E2E-10`)

Luồng vòng đời hoàn chỉnh đã được thực thi & kiểm chứng tự động qua `tests/e2e/crossModuleFlows.test.js` (`E2E-10: PASS`):

1. **Upload Avatar A (`POST /api/media/upload`, `category: 'employee_avatar'`):**
   - Magic bytes PNG hợp lệ -> upload vào mock Cloudinary (`type: 'upload'`, `access_level: 'public'`), tạo bản ghi `media_assets` (`upload_status='active'`).
2. **Gán Avatar A vào tài khoản (`PUT /api/account/avatar`):**
   - `mediaLifecycleService.bindAssetToEntity` liên kết `related_entity_type='employee_avatar'`, `related_entity_id=ma_nv`.
3. **Upload Avatar B & Gán thay thế Avatar A:**
   - Upload Avatar B (JPEG) -> tạo bản ghi `media_assets` mới cho B -> gọi `PUT /api/account/avatar` với URL của B.
   - `mediaLifecycleService.handleMediaReplacement` tự động chuyển Avatar A sang **`upload_status = 'orphan_candidate'`** và đặt `orphan_since = NOW()`, trong khi Avatar B là **`active`**.
4. **Dry-Run & Cleanup Retention (`POST /api/media/admin/cleanup-orphans`):**
   - Với `retention_hours: 24`, khi giả lập A quá hạn 48 giờ:
     - `dry_run: true` liệt kê chính xác `uuidA` trong `items`, **không đụng tới Avatar B**.
     - `dry_run: false` gọi `deleteResource` xóa `pubA` trên store Cloudinary, chuyển DB `upload_status='deleted'`, ghi `delete_reason='ORPHAN_RETENTION_CLEANUP'` và ghi audit log `MEDIA_ORPHAN_CLEANUP`, **giữ nguyên Avatar B đang dùng**.

---

## 3. Kiểm soát Quyền truy cập & Chống Tấn công Upload (Phase 6 & 7)

- **Kiểm tra chữ ký nhị phân & Active Content (`RT-MED-02`):** Đã xác minh chặn `400`:
  - Tệp `MZ` (Windows `.exe`) đổi tên `.jpg` -> Bị chặn `UNSAFE_ACTIVE_CONTENT`.
  - Tệp `<svg onload="alert(1)">` đổi tên `.png` -> Bị chặn `UNSAFE_ACTIVE_CONTENT`.
  - Tệp `.pdf` chứa `/OpenAction /JavaScript` -> Bị chặn `UNSAFE_PDF_ACTIVE_CONTENT`. *(Lưu ý bảo mật mức sâu: quét chuỗi ASCII chưa giải nén object stream `/FlateDecode` trong PDF).*
  - Client gửi tham số `folder`, `public_id` hòng ghi đè đường dẫn -> Bị chặn `UNTRUSTED_UPLOAD_PARAMETER`.
- **Kiểm soát truy cập Media riêng tư (`RT-IDOR-01`):** Worker B gọi `/api/media/:uuid_cua_A/access` bị từ chối `403 MEDIA_ACCESS_FORBIDDEN`.
- **Sửa lỗi Rò rỉ Deduplication chéo nhân viên (`BUG-006 / RT-MED-01`):**
  - Trước sửa: Admin upload cùng file PDF cho NV A rồi NV B nhận lại `asset_uuid` của NV A.
  - Sau sửa (Phase 7): Câu truy vấn SHA-256 kiểm tra thêm `AND COALESCE(employee_id, '') = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)` -> Upload B tạo bản ghi độc lập cho NV B (`deduplicated: false`).
- **Tối ưu hiệu năng ghi nhận thêm:** `mediaLifecycleService.countLiveReferences` chạy 6 truy vấn `COUNT(*)` tuần tự cho mỗi candidate trong `runOrphanCleanup` (tối đa 100 assets = ~600 queries) trên cột `TEXT`; khuyến nghị tối ưu gộp query hoặc đánh dấu trước nếu kho asset phình to hàng chục nghìn tệp.
