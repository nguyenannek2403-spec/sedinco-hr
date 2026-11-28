const { pool, query } = require('../config/db');
const bcrypt = require('bcryptjs');

async function initDatabase() {
    try {
        // 1. Bảng Nhân sự (employees)
        await query(`CREATE TABLE IF NOT EXISTS employees (
            ma_nv VARCHAR(20) PRIMARY KEY,
            ho_ten VARCHAR(100),
            ngay_sinh DATE,
            dien_thoai VARCHAR(20),
            email VARCHAR(100),
            chuc_danh VARCHAR(100),
            ngay_bat_dau_lam DATE,
            ngay_chinh_thuc DATE,
            password VARCHAR(255) NULL,
            avatar_url TEXT NULL,
            luong_cb DECIMAL(15,2) DEFAULT 0,
            phu_cap_an_trua DECIMAL(15,2) DEFAULT 0,
            phu_cap_xang_xe DECIMAL(15,2) DEFAULT 0,
            phu_cap_nha_o DECIMAL(15,2) DEFAULT 0,
            thuong_htcv DECIMAL(15,2) DEFAULT 0,
            phu_cap_trach_nhiem DECIMAL(15,2) DEFAULT 0,
            phu_cap_tiep_khach DECIMAL(15,2) DEFAULT 0,
            has_insurance BOOLEAN DEFAULT TRUE,
            status VARCHAR(20) DEFAULT 'active',
            is_locked BOOLEAN DEFAULT FALSE,
            role VARCHAR(20) DEFAULT 'worker'
        )`);
        await query("ALTER TABLE employees MODIFY COLUMN avatar_url TEXT NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN status VARCHAR(20) DEFAULT 'active'").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN is_locked BOOLEAN DEFAULT FALSE").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN role VARCHAR(20) DEFAULT 'worker'").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE").catch(() => {});
        await query("ALTER TABLE employees MODIFY COLUMN password VARCHAR(255) NULL").catch(() => {});
        await query("ALTER TABLE employees ALTER COLUMN password DROP DEFAULT").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN zalo_id VARCHAR(100) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN bound_device_id VARCHAR(100) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN bound_device_name VARCHAR(150) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN device_binding_mode VARCHAR(20) DEFAULT 'recording'").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN pending_device_id VARCHAR(100) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN pending_device_name VARCHAR(150) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN device_change_reason TEXT NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN known_devices_json TEXT NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN multi_device_alert TINYINT(1) DEFAULT 0").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN token_version INT NOT NULL DEFAULT 1").catch(() => {});
        // V70: Persistent Primary Device timestamps & Last Login Device tracking (reusing bound_device_id/name)
        await query("ALTER TABLE employees ADD COLUMN primary_device_set_at DATETIME NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN last_login_device_id VARCHAR(128) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN last_login_device_name VARCHAR(255) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN last_login_at DATETIME NULL").catch(() => {});
        
        // Migrate dữ liệu role ban đầu từ chức danh (CHỈ thực hiện một lần khi role chưa được thiết lập)
        await query(`
            UPDATE employees 
            SET role = 'accountant' 
            WHERE (role IS NULL OR role = '') 
              AND (LOWER(chuc_danh) LIKE '%kế toán%' OR LOWER(chuc_danh) LIKE '%ke toan%')
        `).catch(() => {});
        await query(`
            UPDATE employees 
            SET role = 'admin' 
            WHERE (role IS NULL OR role = '') 
              AND (LOWER(chuc_danh) LIKE '%giám đốc%' OR LOWER(chuc_danh) LIKE '%giam doc%')
        `).catch(() => {});
        await query(`
            UPDATE employees 
            SET role = 'worker' 
            WHERE role IS NULL OR role = '' OR role NOT IN ('admin', 'accountant', 'worker')
        `).catch(() => {});

        // Đảm bảo nhân sự mẫu cốt lõi (NV001, NV002, NV003) CHỈ seed khi NODE_ENV=test
        if (process.env.NODE_ENV === 'test') {
            const empCount = await query("SELECT COUNT(*) as cnt FROM employees WHERE ma_nv IN ('NV001', 'NV002', 'NV003')");
            if (empCount && empCount[0].cnt < 3) {
                const hash123456 = bcrypt.hashSync('123456', 10);
                await query(`
                    INSERT INTO employees (ma_nv, ho_ten, chuc_danh, role, status, password, luong_cb, has_insurance) VALUES
                    ('NV001', 'Nguyễn Văn An', 'Kỹ sư công trường', 'worker', 'active', ?, 10000000, 1),
                    ('NV002', 'Trần Thị Bình', 'Kế toán viên', 'accountant', 'active', ?, 12000000, 1),
                    ('NV003', 'Lê Văn Cường', 'Công nhân vận hành', 'worker', 'active', ?, 8000000, 1)
                    ON DUPLICATE KEY UPDATE status = 'active', password = VALUES(password)
                `, [hash123456, hash123456, hash123456]).catch(() => {});
            }
        }

        // 2. Bảng Cấu hình thông tin công ty (company_settings)
        await query(`CREATE TABLE IF NOT EXISTS company_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_name VARCHAR(255),
            phone VARCHAR(50),
            address TEXT,
            tax_code VARCHAR(50),
            logo_url LONGTEXT,
            work_start VARCHAR(10) DEFAULT '08:00',
            work_end VARCHAR(10) DEFAULT '17:00',
            lunch_start VARCHAR(10) DEFAULT '12:00',
            lunch_end VARCHAR(10) DEFAULT '13:00',
            grace_period_minutes INT DEFAULT 15,
            penalty_per_minute DECIMAL(15,2) DEFAULT 2000,
            penalty_fixed_block DECIMAL(15,2) DEFAULT 50000,
            penalty_salary_percent DECIMAL(5,2) DEFAULT 0
        )`);
        await query("ALTER TABLE company_settings MODIFY COLUMN logo_url LONGTEXT").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN work_start VARCHAR(10) DEFAULT '08:00'").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN work_end VARCHAR(10) DEFAULT '17:00'").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN lunch_start VARCHAR(10) DEFAULT '12:00'").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN lunch_end VARCHAR(10) DEFAULT '13:00'").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN grace_period_minutes INT DEFAULT 15").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN penalty_per_minute DECIMAL(15,2) DEFAULT 2000").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN penalty_fixed_block DECIMAL(15,2) DEFAULT 50000").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN penalty_salary_percent DECIMAL(5,2) DEFAULT 0").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN latitude DECIMAL(10,8) DEFAULT 16.054400").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN longitude DECIMAL(11,8) DEFAULT 108.202200").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN radius_meters INT DEFAULT 100").catch(() => {});
        const companyCount = await query('SELECT COUNT(*) as cnt FROM company_settings');
        if (companyCount && companyCount[0].cnt === 0) {
            await query(`INSERT INTO company_settings (company_name, phone, address, tax_code, logo_url, latitude, longitude, radius_meters) VALUES 
                ('Công ty Cổ phần Vật Liệu Xây Dựng Sedinco', '02363123456', 'Số 1 Nguyễn Văn Linh, Đà Nẵng', '0400123456', 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200', 16.054400, 108.202200, 100)`);
            console.warn('⚠️ [CẢNH BÁO TỌA ĐỘ MẪU] company_settings đang sử dụng tọa độ mẫu (16.054400, 108.202200, bán kính 100m). Phải thiết lập lại tọa độ thực tế qua tools/update_company_gps.js trước khi vận hành.');
        }

        // 3. Bảng Chấm công chuẩn tháng (attendance)
        await query(`CREATE TABLE IF NOT EXISTS attendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ma_nv VARCHAR(20),
            thang INT,
            nam INT,
            cong_chuan DECIMAL(5,2) DEFAULT 26,
            cong_thu_viec DECIMAL(5,2) DEFAULT 0,
            cong_chinh_thuc DECIMAL(5,2) DEFAULT 0,
            ot_cn DECIMAL(5,2) DEFAULT 0,
            UNIQUE KEY unique_emp_month (ma_nv, thang, nam)
        )`);

        // 4. Bảng Nhật ký chấm công hàng ngày (attendance_logs)
        await query(`CREATE TABLE IF NOT EXISTS attendance_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id VARCHAR(20) NOT NULL,
            record_date DATE NOT NULL,
            status VARCHAR(10) NOT NULL,
            ot_hours DECIMAL(4,2) DEFAULT 0,
            check_in_time VARCHAR(20) DEFAULT NULL,
            check_out_time VARCHAR(20) DEFAULT NULL,
            check_in_lat DECIMAL(10,8) NULL,
            check_in_lng DECIMAL(11,8) NULL,
            check_in_method VARCHAR(30) DEFAULT 'dynamic_qr',
            check_in_image LONGTEXT NULL,
            is_suspicious BOOLEAN DEFAULT FALSE,
            suspicious_reason VARCHAR(255) NULL,
            device_fingerprint VARCHAR(150) NULL,
            INDEX idx_att_record_date (record_date),
            UNIQUE KEY unique_emp_date (employee_id, record_date)
        )`);
        await query("ALTER TABLE attendance_logs ADD COLUMN check_in_time VARCHAR(20) DEFAULT NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN check_out_time VARCHAR(20) DEFAULT NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN check_in_lat DECIMAL(10,8) NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN check_in_lng DECIMAL(11,8) NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN check_in_method VARCHAR(30) DEFAULT 'dynamic_qr'").catch(() => {});
        await query("ALTER TABLE attendance_logs MODIFY COLUMN check_in_image LONGTEXT NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN check_in_image LONGTEXT NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN suspicious_reason TEXT NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs MODIFY COLUMN suspicious_reason TEXT NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN device_fingerprint VARCHAR(150) NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN morning_worked_minutes INT DEFAULT 0").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN afternoon_worked_minutes INT DEFAULT 0").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN work_credit DECIMAL(4,2) DEFAULT NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN duration_status VARCHAR(40) DEFAULT NULL").catch(() => {});
        // V70: Separate check-in / check-out device tracking & soft warning metadata
        await query("ALTER TABLE attendance_logs ADD COLUMN check_in_device_id VARCHAR(128) NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN check_in_device_name VARCHAR(255) NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN check_in_device_warning VARCHAR(64) NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN check_out_device_id VARCHAR(128) NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN check_out_device_name VARCHAR(255) NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN check_out_device_warning VARCHAR(64) NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN device_warning_note VARCHAR(500) NULL").catch(() => {});
        await query("CREATE INDEX idx_att_record_date ON attendance_logs (record_date)").catch(() => {});

        // V70: Detailed device history & anomaly log table (user_device_logs)
        await query(`CREATE TABLE IF NOT EXISTS user_device_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            employee_id VARCHAR(20) NOT NULL,
            device_id VARCHAR(128) NOT NULL,
            device_name VARCHAR(255) NULL,
            action_type VARCHAR(20) NOT NULL DEFAULT 'LOGIN',
            warning_type VARCHAR(40) NOT NULL DEFAULT 'NONE',
            shared_with_user_id VARCHAR(20) NULL,
            shared_with_user_label VARCHAR(255) NULL,
            ip_address VARCHAR(64) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_udl_emp_created (employee_id, created_at),
            INDEX idx_udl_dev_created (device_id, created_at)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

        // 5. Bảng Đơn từ (requests)
        await query(`CREATE TABLE IF NOT EXISTS requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id VARCHAR(20) NOT NULL,
            request_type VARCHAR(50) NOT NULL,
            request_date DATE NOT NULL,
            reason TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // 6. Bảng Ngày lễ (public_holidays)
        await query(`CREATE TABLE IF NOT EXISTS public_holidays (
            id INT AUTO_INCREMENT PRIMARY KEY,
            holiday_name VARCHAR(150) NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            salary_multiplier DECIMAL(4,2) NOT NULL DEFAULT 3.00
        )`);
        await query("ALTER TABLE public_holidays ADD COLUMN salary_multiplier DECIMAL(4,2) NOT NULL DEFAULT 3.00").catch(() => {});
        await query("UPDATE public_holidays SET salary_multiplier = 3.00 WHERE salary_multiplier IS NULL OR salary_multiplier < 1.00").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN holidays_v47_synced TINYINT(1) DEFAULT 0").catch(() => {});
        const holSyncRow = await query('SELECT holidays_v47_synced FROM company_settings LIMIT 1').catch(() => []);
        const alreadySyncedHolidays = holSyncRow && holSyncRow[0] && Number(holSyncRow[0].holidays_v47_synced) === 1;
        if (!alreadySyncedHolidays) {
            const { VIETNAM_PRIVATE_HOLIDAYS_2026_2030 } = require('../utils/vnHolidaysCatalog');
            // Loại bỏ các ngày kỷ niệm không áp dụng nghỉ cho doanh nghiệp tư nhân (20/11, 24/11) & seed cũ sai dải 2026
            await query(`
                DELETE FROM public_holidays
                WHERE (MONTH(start_date) = 11 AND DAY(start_date) IN (20, 24) AND start_date = end_date)
                   OR LOWER(holiday_name) LIKE '%nhà giáo%'
                   OR LOWER(holiday_name) LIKE '%văn hóa việt nam%'
                   OR (start_date = '2026-02-15' AND end_date = '2026-02-23')
                   OR (start_date = '2026-04-30' AND end_date = '2026-05-01')
                   OR (start_date = '2026-01-01' AND end_date = '2026-01-01')
                   OR (start_date = '2026-09-01' AND end_date = '2026-09-02')
            `).catch(() => {});
            for (const h of VIETNAM_PRIVATE_HOLIDAYS_2026_2030) {
                const dup = await query(
                    'SELECT id FROM public_holidays WHERE start_date = ? AND end_date = ? LIMIT 1',
                    [h.start_date, h.end_date]
                ).catch(() => []);
                if (!dup || dup.length === 0) {
                    await query(
                        'INSERT INTO public_holidays (holiday_name, start_date, end_date, salary_multiplier) VALUES (?, ?, ?, ?)',
                        [h.holiday_name, h.start_date, h.end_date, h.salary_multiplier || 3.00]
                    ).catch(() => {});
                }
            }
            await query('UPDATE company_settings SET holidays_v47_synced = 1').catch(() => {});
        }

        // 7. Bảng Admin (admins)
        await query(`CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(100) NOT NULL,
            ho_ten VARCHAR(100),
            must_change_password BOOLEAN DEFAULT FALSE
        )`);
        await query("ALTER TABLE admins MODIFY COLUMN password VARCHAR(255) NOT NULL").catch(() => {});
        await query("ALTER TABLE admins ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE").catch(() => {});
        await query("ALTER TABLE admins ADD COLUMN token_version INT NOT NULL DEFAULT 1").catch(() => {});
        await query("ALTER TABLE admins ADD COLUMN avatar_url TEXT NULL").catch(() => {});
        if (process.env.NODE_ENV === 'test') {
            const adminCount = await query('SELECT COUNT(*) as cnt FROM admins');
            if (adminCount && adminCount[0].cnt === 0) {
                const adminHash = bcrypt.hashSync('123456', 10);
                await query(`INSERT INTO admins (username, password, ho_ten) VALUES ('admin', ?, 'Giám đốc Điều hành')`, [adminHash]);
            }
        }

        // 8. Bảng Khóa/Mở Khóa Kỳ Công Tháng (period_locks)
        await query(`CREATE TABLE IF NOT EXISTS period_locks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            month INT NOT NULL,
            year INT NOT NULL,
            is_locked BOOLEAN DEFAULT TRUE,
            locked_by VARCHAR(50) DEFAULT 'admin',
            locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            reason TEXT,
            UNIQUE KEY unique_period (month, year)
        )`);

        // 9. Bảng Cấu hình Phân quyền Kế toán động (accountant_permissions)
        await query(`CREATE TABLE IF NOT EXISTS accountant_permissions (
            permission_key VARCHAR(100) PRIMARY KEY,
            permission_name VARCHAR(255) NOT NULL,
            category VARCHAR(50) NOT NULL,
            is_enabled BOOLEAN DEFAULT FALSE,
            description TEXT,
            updated_by VARCHAR(50) DEFAULT 'system',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`);

        // Seed cấu hình quyền mặc định cho Kế toán (Dùng INSERT IGNORE để bảo toàn cấu hình do Admin đã chỉnh)
        const defaultPermissions = [
            // Nhóm Chấm công
            ['attendance_view_all', 'Xem bảng chấm công toàn công ty', 'attendance', true, 'Cho phép xem dữ liệu chấm công của toàn bộ nhân viên'],
            ['attendance_summarize', 'Tổng hợp công tháng', 'attendance', true, 'Cho phép chạy tổng hợp công chuẩn và công thực tế theo tháng'],
            ['attendance_edit', 'Điều chỉnh chấm công', 'attendance', false, 'Cho phép sửa giờ vào ra và trạng thái chấm công của nhân viên'],
            ['attendance_lock', 'Khóa sổ kỳ chấm công', 'attendance', false, 'Cho phép khóa bảng chấm công tháng'],
            ['attendance_unlock', 'Mở khóa kỳ chấm công', 'attendance', false, 'Cho phép mở lại kỳ công đã khóa (ưu tiên chỉ Admin)'],
            ['attendance_request_approve', 'Duyệt yêu cầu chấm công', 'attendance', false, 'Cho phép phê duyệt yêu cầu quên chấm công / bổ sung công'],
            ['accountant_manual_checkin', 'Bật chấm công cho Kế toán', 'attendance', false, 'Mặc định tắt: hệ thống tự động lưu 1 công mỗi ngày làm việc (trừ Chủ nhật). Khi bật: Kế toán tự chấm công Vào/Ra như nhân viên bình thường và vẫn giữ nguyên toàn bộ ngày công tự động đã lưu trước đó.'],
            
            // Nhóm Đơn từ
            ['leave_view_all', 'Xem tất cả đơn từ', 'requests', true, 'Cho phép xem toàn bộ đơn xin nghỉ phép, công tác của nhân sự'],
            ['leave_approve', 'Phê duyệt đơn nghỉ phép', 'requests', false, 'Cho phép duyệt đơn xin nghỉ phép của nhân sự'],
            ['leave_reject', 'Từ chối đơn nghỉ phép', 'requests', false, 'Cho phép từ chối đơn xin nghỉ phép'],
            ['request_view_all', 'Xem danh sách yêu cầu', 'requests', true, 'Cho phép xem tất cả yêu cầu hỗ trợ và khiếu nại'],
            ['request_manage', 'Xử lý yêu cầu', 'requests', false, 'Cho phép xử lý và điều phối các yêu cầu nhân sự'],

            // Nhóm Tiền lương
            ['payroll_view_all', 'Xem bảng lương toàn công ty', 'payroll', true, 'Cho phép xem bảng tính lương tổng hợp của toàn bộ nhân viên'],
            ['payroll_calculate', 'Tính toán bảng lương', 'payroll', true, 'Cho phép chạy lệnh tính lương tự động theo công thức'],
            ['payroll_export', 'Xuất bảng lương Excel', 'payroll', true, 'Cho phép xuất dữ liệu bảng lương ra file Excel'],
            ['payroll_approve', 'Phê duyệt bảng lương', 'payroll', false, 'Cho phép duyệt và chốt bảng lương chính thức'],
            ['payroll_payment_status_manage', 'Cập nhật trạng thái chi trả', 'payroll', false, 'Cho phép đánh dấu đã thanh toán lương cho nhân viên'],

            // Nhóm Nhân viên
            ['employee_view', 'Xem danh sách nhân viên', 'employee', true, 'Cho phép xem danh sách và thông tin hồ sơ nhân viên'],
            ['employee_create', 'Thêm mới nhân viên', 'employee', false, 'Cho phép tạo hồ sơ nhân viên mới'],
            ['employee_edit', 'Chỉnh sửa thông tin nhân viên', 'employee', false, 'Cho phép cập nhật thông tin hồ sơ nhân sự'],
            ['employee_delete', 'Xóa hồ sơ nhân viên', 'employee', false, 'Cho phép xóa hoặc vô hiệu hóa nhân sự'],
            ['employee_status_manage', 'Khóa/mở khóa tài khoản nhân sự', 'employee', false, 'Cho phép tạm khóa hoặc kích hoạt lại tài khoản nhân viên'],

            // Nhóm Báo cáo & Cấu hình
            ['report_view', 'Xem báo cáo nhân sự & chi phí', 'reports', true, 'Cho phép xem biểu đồ và thống kê tổng hợp'],
            ['report_export', 'Xuất báo cáo tổng hợp', 'reports', true, 'Cho phép xuất các file báo cáo định kỳ'],
            ['company_settings_manage', 'Quản lý thông tin công ty', 'settings', false, 'Cho phép cập nhật thông tin pháp lý công ty'],
            ['shift_manage', 'Quản lý ca làm việc', 'settings', false, 'Cho phép cấu hình giờ làm việc, giờ nghỉ trưa'],
            ['holiday_manage', 'Quản lý ngày nghỉ lễ', 'settings', false, 'Cho phép thêm hoặc xóa ngày nghỉ lễ hưởng lương'],
            ['penalty_settings_manage', 'Quản lý thang phạt đi trễ', 'settings', false, 'Cho phép cấu hình mức phạt đi trễ về sớm'],

            // Nhóm Tài khoản & Bảo mật
            ['account_manage', 'Quản lý tài khoản quản trị', 'security', false, 'Cho phép quản lý tài khoản admin'],
            ['permission_manage', 'Cấu hình phân quyền kế toán', 'security', false, 'Cho phép thay đổi quyền hạn của kế toán'],
            ['audit_log_view', 'Xem nhật ký kiểm toán', 'security', false, 'Cho phép xem lịch sử thao tác nhạy cảm']
        ];

        for (const [key, name, cat, enabled, desc] of defaultPermissions) {
            await query(`
                INSERT INTO accountant_permissions (permission_key, permission_name, category, is_enabled, description, updated_by)
                VALUES (?, ?, ?, ?, ?, 'system')
                ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name), category = VALUES(category), description = VALUES(description)
            `, [key, name, cat, enabled ? 1 : 0, desc]).catch(() => {});
        }

        // 10. Bảng Nhật ký Kiểm toán (audit_logs)
        await query(`CREATE TABLE IF NOT EXISTS audit_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            actor_id VARCHAR(50) NOT NULL,
            actor_role VARCHAR(20) NOT NULL,
            action VARCHAR(100) NOT NULL,
            resource VARCHAR(100) NOT NULL,
            details TEXT,
            ip_address VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // 11. Bảng Đăng Ký Làm Thêm Giờ Duyệt Trước (ot_registrations - Anti-OT Fraud)
        await query(`CREATE TABLE IF NOT EXISTS ot_registrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id VARCHAR(20) NOT NULL,
            work_date DATE NOT NULL,
            expected_hours DECIMAL(4,2) NOT NULL,
            reason TEXT NULL,
            approved_by VARCHAR(50) NULL,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_emp_ot_date (employee_id, work_date)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await query('ALTER TABLE ot_registrations CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci').catch(() => {});

        // V6 Cleanup: Xóa bỏ 2 bảng Kiosk dư thừa không còn sử dụng để tiết kiệm dung lượng TiDB Cloud
        await query('DROP TABLE IF EXISTS dynamic_qr_sessions').catch(() => {});
        await query('DROP TABLE IF EXISTS kiosk_devices').catch(() => {});

        // 12. Bảng Bộ đếm Rate Limit Dùng Chung (login_rate_limits - Distributed / Multi-process Shared Store)
        await query(`CREATE TABLE IF NOT EXISTS login_rate_limits (
            key_name VARCHAR(191) PRIMARY KEY,
            target_type VARCHAR(20) NOT NULL,
            identifier VARCHAR(100) NOT NULL,
            attempt_count INT DEFAULT 1,
            first_attempt DATETIME NOT NULL,
            last_attempt DATETIME NOT NULL,
            locked_until DATETIME NULL,
            INDEX idx_rate_lookup (target_type, identifier),
            INDEX idx_rate_expires (locked_until)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

        // 13. Bảng Idempotency Keys (Chống bấm đúp & replay trên đa tiến trình)
        await query(`CREATE TABLE IF NOT EXISTS idempotency_keys (
            key_hash VARCHAR(64) PRIMARY KEY,
            actor_id VARCHAR(50) NOT NULL,
            endpoint VARCHAR(150) NOT NULL,
            response_status INT NOT NULL DEFAULT 0,
            response_body MEDIUMTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_idem_created (created_at)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

        await query("ALTER TABLE attendance_logs ADD COLUMN location_source VARCHAR(20) DEFAULT 'raw'").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN is_low_trust TINYINT(1) DEFAULT 0").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN late_minutes INT DEFAULT 0").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN early_leave_minutes INT DEFAULT 0").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN work_hours DECIMAL(5,2) DEFAULT 0").catch(() => {});

        // V5 Schema Additions: Employees, Audit Logs, Company Settings, Monthly Attendance/Payroll Confirmation
        await query("ALTER TABLE employees ADD COLUMN keep_logs TINYINT(1) DEFAULT 0").catch(() => {});
        await query("ALTER TABLE audit_logs ADD COLUMN is_pinned TINYINT(1) DEFAULT 0").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN standard_work_days DECIMAL(5,2) DEFAULT 26").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN probation_salary_percent DECIMAL(5,2) DEFAULT 85").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN ot_rate_weekday DECIMAL(4,2) DEFAULT 1.5").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN ot_rate_weekend DECIMAL(4,2) DEFAULT 2.0").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN ot_rate_holiday DECIMAL(4,2) DEFAULT 3.0").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN custom_ot_hourly_rate DECIMAL(15,2) DEFAULT 0").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN insurance_rate DECIMAL(5,2) DEFAULT 10.5").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN log_retention_days INT DEFAULT 30").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN salary_confirm_status VARCHAR(20) DEFAULT 'PENDING'").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN dispute_reason TEXT NULL").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN dispute_evidence_media MEDIUMTEXT NULL").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN admin_response TEXT NULL").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN confirmed_at DATETIME NULL").catch(() => {});

        // V6 Schema Additions: Zero-Password Zalo Auto-Login, Multi-Branch Locations, Office IP Whitelist & Field Work
        await query("ALTER TABLE employees ADD COLUMN zalo_user_id VARCHAR(100) NULL").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN allowed_locations TEXT NULL").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN office_ip_whitelist VARCHAR(500) DEFAULT ''").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN location_name VARCHAR(150) NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN field_note TEXT NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN work_location_type VARCHAR(30) DEFAULT 'OFFICE'").catch(() => {});
        // V7 / V10 Feature Upgrades: Leave Balance, Salary Advance & Adjustments, Flexible Shifts, Announcements
        await query("ALTER TABLE employees ADD COLUMN annual_leave_quota DECIMAL(4,1) DEFAULT 1.0").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN shift_type VARCHAR(30) DEFAULT 'FULL_DAY'").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN shift_type VARCHAR(30) DEFAULT 'FULL_DAY'").catch(() => {});
        await query("ALTER TABLE requests ADD COLUMN advance_amount DECIMAL(12,0) DEFAULT 0").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN advance_deduction DECIMAL(12,0) DEFAULT 0").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN bonus_amount DECIMAL(12,0) DEFAULT 0").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN penalty_amount DECIMAL(12,0) DEFAULT 0").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN adjustment_note VARCHAR(255) NULL").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN announcement_text TEXT NULL").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN announcement_updated_at DATETIME NULL").catch(() => {});

        // V11 MISA AMIS Smart Attendance: Custom Employee Hours + Late Policy Config
        await query("ALTER TABLE employees ADD COLUMN custom_start_time VARCHAR(10) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN custom_end_time VARCHAR(10) NULL").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN late_policy_type VARCHAR(30) DEFAULT 'PER_MINUTE'").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN free_late_occurrences INT DEFAULT 3").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN late_penalty_per_minute DECIMAL(15,2) NULL").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN late_penalty_amount DECIMAL(15,2) NULL").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN max_late_minutes_for_half_day INT DEFAULT 60").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN probation_allowance_full TINYINT(1) DEFAULT 1").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN ot_calculation_mode VARCHAR(30) DEFAULT 'APPROVED_OR_AUTO'").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN free_late_exempts_halfday TINYINT(1) DEFAULT 0").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN negative_salary_policy VARCHAR(30) DEFAULT 'CLAMP_ZERO'").catch(() => {});

        // V12 MISA Parity & Comprehensive Requests: Department, Explanation Times/Evidence, Proxy Check-in
        await query("ALTER TABLE employees ADD COLUMN department VARCHAR(120) NULL DEFAULT 'Khối Công trình'").catch(() => {});
        await query("ALTER TABLE employees MODIFY COLUMN department VARCHAR(120) NULL DEFAULT 'Khối Công trình'").catch(() => {});
        await query(`CREATE TABLE IF NOT EXISTS departments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(120) NOT NULL UNIQUE,
            is_default TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        try {
            const existingDepts = await query('SELECT id, name, is_default FROM departments ORDER BY id ASC');
            const empDeptRows = await query("SELECT DISTINCT TRIM(department) AS dept FROM employees WHERE department IS NOT NULL AND TRIM(department) != ''").catch(() => []);
            if (!existingDepts || existingDepts.length === 0) {
                const seedNames = ['Khối Văn phòng', 'Khối Công trình', 'Khối Kho bãi', 'Khối Kinh doanh - Showroom'];
                const seenLower = new Set(seedNames.map((n) => n.toLowerCase()));
                for (const r of empDeptRows || []) {
                    const clean = String(r.dept || '').trim().replace(/\s+/g, ' ').slice(0, 120);
                    if (clean && !seenLower.has(clean.toLowerCase())) {
                        seenLower.add(clean.toLowerCase());
                        seedNames.push(clean);
                    }
                }
                for (let idx = 0; idx < seedNames.length; idx++) {
                    await query(
                        'INSERT IGNORE INTO departments (name, is_default) VALUES (?, ?)',
                        [seedNames[idx], idx === 0 ? 1 : 0]
                    ).catch(() => {});
                }
            } else {
                const seenLower = new Set(existingDepts.map((d) => String(d.name || '').trim().toLowerCase()));
                for (const r of empDeptRows || []) {
                    const clean = String(r.dept || '').trim().replace(/\s+/g, ' ').slice(0, 120);
                    if (clean && !seenLower.has(clean.toLowerCase())) {
                        seenLower.add(clean.toLowerCase());
                        await query('INSERT IGNORE INTO departments (name, is_default) VALUES (?, 0)', [clean]).catch(() => {});
                    }
                }
            }
            const refreshedDepts = await query('SELECT id, name, is_default FROM departments ORDER BY id ASC');
            const defaultDepts = (refreshedDepts || []).filter((d) => Number(d.is_default) === 1);
            let defaultDeptName = 'Khối Văn phòng';
            if (defaultDepts.length === 0 && refreshedDepts && refreshedDepts.length > 0) {
                await query('UPDATE departments SET is_default = 1 WHERE id = ?', [refreshedDepts[0].id]);
                defaultDeptName = refreshedDepts[0].name;
            } else if (defaultDepts.length > 1) {
                const keepId = defaultDepts[0].id;
                defaultDeptName = defaultDepts[0].name;
                await query('UPDATE departments SET is_default = 0 WHERE id != ? AND is_default = 1', [keepId]);
            } else if (defaultDepts.length === 1) {
                defaultDeptName = defaultDepts[0].name;
            }
            await query("UPDATE employees SET department = ? WHERE department IS NULL OR TRIM(department) = ''", [defaultDeptName]).catch(() => {});
        } catch (deptMigErr) {
            console.warn('⚠️ Lỗi khởi tạo bảng departments:', deptMigErr.message);
        }
        await query("ALTER TABLE requests ADD COLUMN correction_mode VARCHAR(30) NULL").catch(() => {});
        await query("ALTER TABLE requests ADD COLUMN check_in_time VARCHAR(10) NULL").catch(() => {});
        await query("ALTER TABLE requests ADD COLUMN check_out_time VARCHAR(10) NULL").catch(() => {});
        await query("ALTER TABLE requests ADD COLUMN evidence_image MEDIUMTEXT NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN proxy_by VARCHAR(50) NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN proxy_note VARCHAR(255) NULL").catch(() => {});

        // V13 Production Release: Bảng lưu bền vững Trạng thái Kỳ lương & Chi trả lương (payroll_periods)
        await query(`CREATE TABLE IF NOT EXISTS payroll_periods (
            id INT AUTO_INCREMENT PRIMARY KEY,
            month INT NOT NULL,
            year INT NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
            payment_status VARCHAR(30) NOT NULL DEFAULT 'UNPAID',
            approved_by VARCHAR(50) NULL,
            approved_at DATETIME NULL,
            rejected_by VARCHAR(50) NULL,
            rejected_reason TEXT NULL,
            rejected_at DATETIME NULL,
            paid_by VARCHAR(50) NULL,
            paid_at DATETIME NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_payroll_period (month, year)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

        // V25: Bảng lưu thông báo bền vững tới từng Nhân viên & Quản trị viên (Chốt kỳ công, Bảng lương...)
        await query(`CREATE TABLE IF NOT EXISTS user_notifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            recipient_ma_nv VARCHAR(50) NOT NULL,
            alert_key VARCHAR(120) NULL,
            type VARCHAR(50) NOT NULL,
            category VARCHAR(50) NOT NULL DEFAULT 'general',
            severity VARCHAR(20) NOT NULL DEFAULT 'info',
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            ref_month INT NULL,
            ref_year INT NULL,
            target_ma_nv VARCHAR(50) NULL,
            target_tab VARCHAR(50) NULL,
            target_subtab VARCHAR(50) NULL,
            target_id VARCHAR(64) NULL,
            is_read TINYINT(1) NOT NULL DEFAULT 0,
            read_at DATETIME NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_notif_recipient_read (recipient_ma_nv, is_read, created_at),
            UNIQUE INDEX uniq_notif_recipient_alert_key (recipient_ma_nv, alert_key)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await query('CREATE INDEX idx_notif_recipient_read ON user_notifications (recipient_ma_nv, is_read, created_at)').catch(() => {});

        // V29: Bổ sung cột vòng đời thông báo (alert_key, read_at, category, severity, target_tab/subtab/id) + font_scale + bảng qa_test_runs
        await query("ALTER TABLE user_notifications ADD COLUMN alert_key VARCHAR(120) NULL").catch(() => {});
        await query("ALTER TABLE user_notifications ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'general'").catch(() => {});
        await query("ALTER TABLE user_notifications ADD COLUMN severity VARCHAR(20) NOT NULL DEFAULT 'info'").catch(() => {});
        await query("ALTER TABLE user_notifications ADD COLUMN target_tab VARCHAR(50) NULL").catch(() => {});
        await query("ALTER TABLE user_notifications ADD COLUMN target_subtab VARCHAR(50) NULL").catch(() => {});
        await query("ALTER TABLE user_notifications ADD COLUMN target_id VARCHAR(64) NULL").catch(() => {});
        await query("ALTER TABLE user_notifications ADD COLUMN read_at DATETIME NULL").catch(() => {});
        await query("CREATE UNIQUE INDEX uniq_notif_recipient_alert_key ON user_notifications (recipient_ma_nv, alert_key)").catch(() => {});

        await query("ALTER TABLE employees ADD COLUMN font_scale INT NOT NULL DEFAULT 100").catch(() => {});
        await query("ALTER TABLE admins ADD COLUMN font_scale INT NOT NULL DEFAULT 100").catch(() => {});
        await query('DROP TABLE IF EXISTS qa_test_runs').catch(() => {});

        // V40: Audit timestamps xử lý đơn + Thẻ ngân hàng nhận lương (chỉ lưu 4 trường text) + Trạng thái chi trả từng nhân viên
        await query("ALTER TABLE requests ADD COLUMN processed_at DATETIME NULL").catch(() => {});
        await query("ALTER TABLE requests ADD COLUMN processed_by VARCHAR(50) NULL").catch(() => {});
        await query("ALTER TABLE requests ADD COLUMN reject_reason TEXT NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN bank_code VARCHAR(32) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN bank_name VARCHAR(120) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN bank_account_number VARCHAR(50) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN bank_account_name VARCHAR(120) NULL").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN payment_status VARCHAR(20) DEFAULT 'UNPAID'").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN paid_at DATETIME NULL").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN paid_by VARCHAR(50) NULL").catch(() => {});

        // V45: Vòng đời Báo cáo Xác nhận Lương 4 bước (DRAFT -> REPORT_SENT -> CONFIRMED/DISPUTED -> PAID)
        await query("ALTER TABLE attendance ADD COLUMN payout_status VARCHAR(32) DEFAULT 'DRAFT'").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN report_sent_at DATETIME NULL").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN dispute_note TEXT NULL").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN transfer_note VARCHAR(255) NULL").catch(() => {});
        // V47: Xác nhận nhận đủ lương bước 5 (PAID -> RECEIVED)
        await query("ALTER TABLE attendance ADD COLUMN received_at DATETIME NULL").catch(() => {});

        // V46: Vòng đời xử lý & tự động dọn dẹp khiếu nại lương/công (OPEN -> RESOLVED)
        await query("ALTER TABLE attendance ADD COLUMN dispute_status VARCHAR(20) NULL").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN dispute_resolved_at DATETIME NULL").catch(() => {});
        await query("ALTER TABLE attendance ADD COLUMN dispute_resolved_note VARCHAR(255) NULL").catch(() => {});
        await query(`
            UPDATE attendance
            SET dispute_status = 'OPEN'
            WHERE (salary_confirm_status = 'DISPUTED' OR payout_status = 'DISPUTED')
              AND (dispute_status IS NULL OR dispute_status = '')
        `).catch(() => {});
        await query(`
            UPDATE attendance
            SET dispute_status = 'RESOLVED',
                dispute_resolved_at = COALESCE(dispute_resolved_at, confirmed_at, NOW()),
                dispute_resolved_note = COALESCE(dispute_resolved_note, NULLIF(admin_response, ''), 'Đã kiểm tra và xử lý xong'),
                dispute_reason = NULL,
                dispute_note = NULL,
                dispute_evidence_media = NULL
            WHERE salary_confirm_status != 'DISPUTED'
              AND (payout_status IS NULL OR payout_status != 'DISPUTED')
              AND (dispute_reason IS NOT NULL OR dispute_note IS NOT NULL OR dispute_status = 'OPEN')
        `).catch(() => {});

        // V18: Account Phone/Custom Username & Persistent Theme Preference + Cleanup Legacy Multi-Model Device Names
        await query("ALTER TABLE employees ADD COLUMN phone VARCHAR(30) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN login_username VARCHAR(100) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN theme_preference VARCHAR(15) NOT NULL DEFAULT 'light'").catch(() => {});
        await query("ALTER TABLE admins ADD COLUMN phone VARCHAR(30) NULL").catch(() => {});
        await query("ALTER TABLE admins ADD COLUMN login_username VARCHAR(100) NULL").catch(() => {});
        await query("ALTER TABLE admins ADD COLUMN theme_preference VARCHAR(15) NOT NULL DEFAULT 'light'").catch(() => {});
        await query("UPDATE employees SET phone = NULL WHERE phone = ''").catch(() => {});
        await query("UPDATE employees SET login_username = NULL WHERE login_username = ''").catch(() => {});
        await query("UPDATE admins SET phone = NULL WHERE phone = ''").catch(() => {});
        await query("UPDATE admins SET login_username = NULL WHERE login_username = ''").catch(() => {});
        await query("CREATE UNIQUE INDEX idx_emp_login_username ON employees (login_username)").catch(() => {});
        await query("CREATE UNIQUE INDEX idx_emp_phone ON employees (phone)").catch(() => {});
        await query("CREATE UNIQUE INDEX idx_adm_login_username ON admins (login_username)").catch(() => {});
        await query("CREATE UNIQUE INDEX idx_adm_phone ON admins (phone)").catch(() => {});

        // V18 Device Model Single-Name Normalization in DB
        try {
            const { sanitizeSingleDeviceModelName, safeParseKnownDevices } = require('../utils/deviceIdentityHelper');
            const dirtyRows = await query(
                "SELECT ma_nv, bound_device_name, pending_device_name, known_devices_json FROM employees WHERE bound_device_name LIKE '%/%' OR pending_device_name LIKE '%/%' OR known_devices_json LIKE '%/%' OR bound_device_name = 'Thiết bị di động' OR known_devices_json LIKE '%Thiết bị di động%'"
            ).catch(() => []);
            for (const row of dirtyRows || []) {
                const nextBound = row.bound_device_name ? sanitizeSingleDeviceModelName(row.bound_device_name) : row.bound_device_name;
                const nextPending = row.pending_device_name ? sanitizeSingleDeviceModelName(row.pending_device_name) : row.pending_device_name;
                let nextKnownJson = row.known_devices_json;
                if (row.known_devices_json) {
                    const arr = safeParseKnownDevices(row.known_devices_json);
                    if (arr.length > 0) {
                        const cleanedArr = arr.map((d) => ({
                            ...d,
                            device_name: d?.device_name ? sanitizeSingleDeviceModelName(d.device_name) : 'Thiết bị không rõ'
                        }));
                        nextKnownJson = JSON.stringify(cleanedArr);
                    }
                }
                await query(
                    'UPDATE employees SET bound_device_name = ?, pending_device_name = ?, known_devices_json = ? WHERE ma_nv = ?',
                    [nextBound, nextPending, nextKnownJson, row.ma_nv]
                ).catch(() => {});
            }
        } catch {}

        // V36: Phụ cấp động linh hoạt theo từng nhân viên (custom_allowances) & Danh mục gợi ý phụ cấp (allowance_presets)
        await query("ALTER TABLE employees ADD COLUMN custom_allowances TEXT NULL").catch(() => {});
        await query("ALTER TABLE company_settings ADD COLUMN allowance_presets TEXT NULL").catch(() => {});
        await query("UPDATE employees SET device_binding_mode = 'recording' WHERE device_binding_mode = 'enforced'").catch(() => {});

        // V39: Chuyển định mức nghỉ có lương từ phép năm (12 ngày) sang phép tháng (mặc định 1 lượt/tháng, không cộng dồn)
        await query("ALTER TABLE company_settings ADD COLUMN monthly_paid_leave_limit DECIMAL(4,1) NOT NULL DEFAULT 1.0").catch(() => {});
        await query("ALTER TABLE company_settings MODIFY COLUMN announcement_text MEDIUMTEXT NULL").catch(() => {});
        await query("ALTER TABLE employees MODIFY COLUMN annual_leave_quota DECIMAL(4,1) DEFAULT 1.0").catch(() => {});
        await query("UPDATE company_settings SET monthly_paid_leave_limit = 1.0 WHERE monthly_paid_leave_limit IS NULL").catch(() => {});
        await query("UPDATE employees SET annual_leave_quota = 1.0 WHERE annual_leave_quota = 12.0 OR annual_leave_quota IS NULL").catch(() => {});

        // Khởi tạo Điểm 1 mặc định trong allowed_locations và allowance_presets mặc định nếu chưa có
        const csRows = await query("SELECT id, latitude, longitude, radius_meters, allowed_locations, allowance_presets FROM company_settings LIMIT 1").catch(() => []);
        if (csRows && csRows.length > 0) {
            const cs = csRows[0];
            if (!cs.allowed_locations || String(cs.allowed_locations).trim() === '') {
                const defaultLocations = JSON.stringify([
                    {
                        id: 'loc_hq_1',
                        name: 'Trụ sở chính Đà Nẵng',
                        lat: Number(cs.latitude) || 16.0544,
                        lng: Number(cs.longitude) || 108.2022,
                        radius: Number(cs.radius_meters) || 500
                    }
                ]);
                await query("UPDATE company_settings SET allowed_locations = ? WHERE id = ?", [defaultLocations, cs.id]).catch(() => {});
            }
            if (!cs.allowance_presets || String(cs.allowance_presets).trim() === '') {
                const defaultPresets = JSON.stringify([
                    'Phụ cấp ăn trưa',
                    'Phụ cấp xăng xe',
                    'Phụ cấp nhà ở',
                    'Phụ cấp điện thoại',
                    'Phụ cấp công trình',
                    'Phụ cấp trách nhiệm'
                ]);
                await query("UPDATE company_settings SET allowance_presets = ? WHERE id = ?", [defaultPresets, cs.id]).catch(() => {});
            }
        }

        // V23 + V29: Composite Indexes & Auto-Prune để tối ưu hiệu năng và dung lượng TiDB Cloud
        const { ensureMediaSchema } = require('./mediaSchema');
        await ensureMediaSchema(query);
        await query("CREATE INDEX idx_att_logs_emp_date ON attendance_logs (employee_id, record_date)").catch(() => {});
        await query("CREATE INDEX idx_att_emp_period ON attendance (ma_nv, nam, thang)").catch(() => {});
        await query("CREATE INDEX idx_att_confirm_status ON attendance (salary_confirm_status, nam, thang)").catch(() => {});
        await query("CREATE INDEX idx_req_emp_status ON requests (employee_id, status, created_at)").catch(() => {});
        await query("CREATE INDEX idx_req_status_created ON requests (status, created_at)").catch(() => {});
        await query("CREATE INDEX idx_ot_status ON ot_registrations (status)").catch(() => {});
        await query("CREATE INDEX idx_audit_created ON audit_logs (created_at, is_pinned)").catch(() => {});
        await query("UPDATE attendance_logs SET check_in_image = NULL WHERE check_in_image IS NOT NULL").catch(() => {});
        await query("DELETE FROM idempotency_keys WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)").catch(() => {});

        console.log('✅ Khởi tạo cấu trúc Database (12 bảng tinh gọn + V6 Enterprise Schema) thành công!');
    } catch (err) {
        console.error('❌ Lỗi khởi tạo cấu trúc Database:', err.message);
    }
}

module.exports = {
    initDatabase
};
