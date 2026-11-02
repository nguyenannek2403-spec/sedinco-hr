-- =============================================================================
-- SEDINCO HR - LEAST PRIVILEGE DATABASE USER SCRIPT (STAGING / APP RUNTIME)
-- =============================================================================
-- Mục đích: Cấp quyền tối thiểu (Least Privilege) cho tài khoản ứng dụng (Runtime User).
-- 
-- RÀNG BUỘC BẢO MẬT:
-- 1. Tham số hóa: Tên schema, tên user, host và mật khẩu dùng placeholder:
--    ${DB_NAME}, ${APP_USER}, ${APP_HOST}, ${APP_PASSWORD}.
--    Tuyệt đối không lưu mật khẩu cứng trong repository.
-- 2. Giới hạn IP/Host: Thay thế '%' bằng host/IP cụ thể của máy chủ ứng dụng (${APP_HOST}).
-- 3. Tách biệt DDL vs DML:
--    - Migration User (chạy lúc triển khai / deploy): Cần DDL (CREATE, ALTER, INDEX, DROP).
--    - Runtime App User (chạy thường nhật): CHỈ CẤP DML, không có quyền DDL để triệt tiêu
--      rủi ro SQL Injection phá hoại schema (Zero Runtime DDL).
-- 4. Bất biến Audit Trail: Bảng audit_logs CHỈ CÓ QUYỀN SELECT, INSERT (Append-Only).
--    CẤM TUYỆT ĐỐI UPDATE và DELETE.
-- 5. Đối chiếu danh mục bảng: Khớp chính xác 14 bảng hiện hữu theo SHOW TABLES.
-- =============================================================================

-- 1. Tạo tài khoản ứng dụng với host cụ thể và mật khẩu bảo mật
CREATE USER IF NOT EXISTS '${APP_USER}'@'${APP_HOST}' IDENTIFIED BY '${APP_PASSWORD}';

-- 2. Thu hồi toàn bộ quyền trước khi cấp (Clean slate)
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${APP_USER}'@'${APP_HOST}';

-- 3. Cấp quyền DML (SELECT, INSERT, UPDATE, DELETE) trên 13 bảng nghiệp vụ thông thường
GRANT SELECT, INSERT, UPDATE, DELETE ON `${DB_NAME}`.`accountant_permissions` TO '${APP_USER}'@'${APP_HOST}';
GRANT SELECT, INSERT, UPDATE, DELETE ON `${DB_NAME}`.`admins`                 TO '${APP_USER}'@'${APP_HOST}';
GRANT SELECT, INSERT, UPDATE, DELETE ON `${DB_NAME}`.`attendance`             TO '${APP_USER}'@'${APP_HOST}';
GRANT SELECT, INSERT, UPDATE, DELETE ON `${DB_NAME}`.`attendance_logs`        TO '${APP_USER}'@'${APP_HOST}';
GRANT SELECT, INSERT, UPDATE, DELETE ON `${DB_NAME}`.`company_settings`       TO '${APP_USER}'@'${APP_HOST}';
GRANT SELECT, INSERT, UPDATE, DELETE ON `${DB_NAME}`.`dynamic_qr_sessions`    TO '${APP_USER}'@'${APP_HOST}';
GRANT SELECT, INSERT, UPDATE, DELETE ON `${DB_NAME}`.`employees`              TO '${APP_USER}'@'${APP_HOST}';
GRANT SELECT, INSERT, UPDATE, DELETE ON `${DB_NAME}`.`kiosk_devices`          TO '${APP_USER}'@'${APP_HOST}';
GRANT SELECT, INSERT, UPDATE, DELETE ON `${DB_NAME}`.`login_rate_limits`      TO '${APP_USER}'@'${APP_HOST}';
GRANT SELECT, INSERT, UPDATE, DELETE ON `${DB_NAME}`.`ot_registrations`       TO '${APP_USER}'@'${APP_HOST}';
GRANT SELECT, INSERT, UPDATE, DELETE ON `${DB_NAME}`.`period_locks`           TO '${APP_USER}'@'${APP_HOST}';
GRANT SELECT, INSERT, UPDATE, DELETE ON `${DB_NAME}`.`public_holidays`        TO '${APP_USER}'@'${APP_HOST}';
GRANT SELECT, INSERT, UPDATE, DELETE ON `${DB_NAME}`.`requests`               TO '${APP_USER}'@'${APP_HOST}';

-- 4. BẢO VỆ ĐẶC BIỆT BẢNG AUDIT_LOGS (BẢNG THỨ 14):
-- CHỈ CẤP QUYỀN SELECT VÀ INSERT (APPEND-ONLY). CẤM TUYỆT ĐỐI UPDATE VÀ DELETE!
GRANT SELECT, INSERT ON `${DB_NAME}`.`audit_logs` TO '${APP_USER}'@'${APP_HOST}';

-- 5. Áp dụng bảng phân quyền MySQL
FLUSH PRIVILEGES;

-- =============================================================================
-- HẾT SCRIPT. KHÔNG CHẠY TRỰC TIẾP LÊN DB PRODUCTION / CLOUD.
-- =============================================================================
