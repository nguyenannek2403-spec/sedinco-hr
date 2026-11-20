# SEDINCO HR V29 — BÁO CÁO BẢO MẬT & KIỂM SOÁT TRUY CẬP (SECURITY REPORT)

- **Phiên bản**: V29
- **Chuẩn kiểm tra**: OWASP API Top 10 (BOLA/IDOR, AuthN/AuthZ, SoD, Rate Limiting, Formula/SQL/XSS Injection) & Strict RBAC (`worker`, `accountant`, `admin`).

## 1. Kiểm soát Bảo mật theo Thành phần Mới V29
| Hạng mục | Cơ chế bảo vệ | Bằng chứng kiểm thử |
| :--- | :--- | :--- |
| **QA Center (`/api/qa-center/*`)** | Tất cả 6 route gắn `authMiddleware` + `requireRoles('admin')`. Tài khoản `worker` hoặc `accountant` (kể cả có nhiều khóa quyền động) đều bị chặn HTTP `403`; yêu cầu không token trả `401`. | `V29-QA-01`, `RBAC-01` |
| **QA Safe Mode Protection** | `POST /api/qa-center/run-safe-checks` kiểm tra tham số `mode`/`requestedMode`; mọi yêu cầu chạy `load_benchmark`, `stress`, `heavy` qua Web đều bị từ chối HTTP `403` với mã `SAFE_MODE_LOCKED` để bảo vệ CSDL đám mây thật. | `V29-QA-01` |
| **Tài khoản & Cỡ chữ (`/api/account/preferences`)** | Chỉ cho phép user tự cập nhật `theme`/`font_scale` của chính `req.user.ma_nv` qua JWT đã xác thực; `font_scale` kiểm duyệt danh sách trắng `[100, 110, 125, 150, 175, 200]` (`400` nếu sai). | `V29-PREF-01` |
| **Thông báo (`/api/notifications/*`)** | Truy vấn và cập nhật `is_read` luôn ràng buộc `WHERE id = ? AND recipient_ma_nv = ?`; nhân viên khác gửi request đọc thông báo không thuộc về mình nhận `404`/`403`. Danh sách cảnh báo Kế toán lọc theo 16 khóa phân quyền động (`payroll_*`, `requests_*`, `attendance_*`). | `V29-NOTIF-01`, `V29-NOTIF-02`, `V25-T2` |
| **Phiếu lương & Xuất CSV** | Admin không thể tự trả lương cho Admin (`400`), Worker không thể phê duyệt/chỉnh sửa bảng lương hoặc báo sai sót thay người khác (SoD + BOLA). Export CSV đi qua `escapeCsvCell` chống Formula Injection. | `PAY-03`, `V25-T3`, `SEC-01`, `QA3-RBAC-01` |

## 2. Tổng hợp Kết quả Các Bài Test Bảo mật V29
- `AUTH-01`..`AUTH-04`: `PASS` (từ chối JWT sai/`alg=none`/hết hạn, thu hồi phiên tức thì 0-delay DB check, bắt buộc xác thực các route config/holidays).
- `RBAC-01`, `RBAC-02`, `QA3-RBAC-01`, `P9-RBAC-ALL`, `P9-SEC-DEV-01`, `P9-SEC-BOLA-01`: Đều `PASS`.
- `SEC-01`: `PASS` — BOLA/IDOR, SQLi, XSS và Rate limiting đăng nhập (`429`).
- `V29-QA-01`: `PASS` — Chặn `worker`/`accountant` vào QA Center (`403`) và khóa tải nặng trên web (`403 SAFE_MODE_LOCKED`).
- Tổng số route Express hiện hành kiểm tra qua `CONTRACT-01`: **147** route, không có dead auth route hoặc leak route công khai nhạy cảm (`AST-03`).
