# SEDINCO HR V29 — DANH MỤC KIỂM TRA BẢO MẬT (SECURITY CHECKLIST)

- **Trạng thái**: Đã kiểm tra • Đã xác nhận (Suites `02`, `03`, `08`, `09`, `12`)

| Kiểm soát bảo mật | Chi tiết xác minh trong V29 | Trạng thái |
| :--- | :--- | :--- |
| **RBAC QA Center** | Toàn bộ 6 route `/api/qa-center/*` từ chối unauth (`401`), Worker (`403`) và Accountant bật full 30 key DB (`403`). | Đã xác nhận |
| **Notification Isolation** | `markAsRead` kiểm tra `WHERE id = ? AND recipient_ma_nv = ?`; nhân viên khác đọc chéo trả `404`; Accountant không nhận alert `fraud`/`device`. | Đã xác nhận |
| **Preferences Validation** | `PUT /api/account/preferences` chỉ chấp nhận `font_scale` trong `[100,110,125,150,175,200]` và `theme_preference` trong `['light','dark']`, sai trả `400`. | Đã xác nhận |
| **Safe-Mode Load Lock** | `POST /api/qa-center/run-safe-checks` chặn `load_benchmark`/`load_stress` trả `403 SAFE_MODE_LOCKED`. | Đã xác nhận |
| **Existing Core Security** | JWT secret >= 32 ký tự, `token_version` revocation, composite rate limit login (429), SQLi/XSS sanitization, `TRUST_PROXY=true` fatal guard ở staging/prod, replay guard GPS token trong `idempotency_keys`. | Đã xác nhận |
