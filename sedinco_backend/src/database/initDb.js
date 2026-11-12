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
            avatar_url LONGTEXT,
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
        await query("ALTER TABLE employees MODIFY COLUMN avatar_url LONGTEXT").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN status VARCHAR(20) DEFAULT 'active'").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN is_locked BOOLEAN DEFAULT FALSE").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN role VARCHAR(20) DEFAULT 'worker'").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE").catch(() => {});
        await query("ALTER TABLE employees MODIFY COLUMN password VARCHAR(255) NULL").catch(() => {});
        await query("ALTER TABLE employees ALTER COLUMN password DROP DEFAULT").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN zalo_id VARCHAR(100) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN bound_device_id VARCHAR(100) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN device_binding_mode VARCHAR(20) DEFAULT 'recording'").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN pending_device_id VARCHAR(100) NULL").catch(() => {});
        await query("ALTER TABLE employees ADD COLUMN device_change_reason TEXT NULL").catch(() => {});
        
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
        await query("CREATE INDEX idx_att_record_date ON attendance_logs (record_date)").catch(() => {});

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
            end_date DATE NOT NULL
        )`);
        if (process.env.NODE_ENV === 'test') {
            const holidayCount = await query('SELECT COUNT(*) as cnt FROM public_holidays');
            if (holidayCount && holidayCount[0].cnt === 0) {
                await query(`INSERT INTO public_holidays (holiday_name, start_date, end_date) VALUES 
                    ('Tết Dương Lịch', '2026-01-01', '2026-01-01'),
                    ('Giải phóng miền Nam & Quốc tế Lao Động', '2026-04-30', '2026-05-01'),
                    ('Quốc Khánh', '2026-09-01', '2026-09-02')`);
            }
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
            ['attendance_lock', 'Khóa kỳ chấm công', 'attendance', false, 'Cho phép khóa bảng chấm công tháng'],
            ['attendance_unlock', 'Mở khóa kỳ chấm công', 'attendance', false, 'Cho phép mở lại kỳ công đã khóa (ưu tiên chỉ Admin)'],
            ['attendance_request_approve', 'Duyệt yêu cầu chấm công', 'attendance', false, 'Cho phép phê duyệt yêu cầu quên chấm công / bổ sung công'],
            
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

        // 11. Bảng Phiên Mã QR Động (dynamic_qr_sessions - Anti-Replay / Nonce TOTP)
        await query(`CREATE TABLE IF NOT EXISTS dynamic_qr_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            session_token VARCHAR(128) UNIQUE NOT NULL,
            branch_id INT DEFAULT 1,
            expires_at DATETIME NOT NULL,
            is_used BOOLEAN DEFAULT FALSE,
            used_by VARCHAR(20) NULL,
            used_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // 12. Bảng Đăng Ký Làm Thêm Giờ Duyệt Trước (ot_registrations - Anti-OT Fraud)
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

        // 13. Bảng Thiết bị Kiosk QR (kiosk_devices - Kiosk Token Isolation)
        await query(`CREATE TABLE IF NOT EXISTS kiosk_devices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            kiosk_name VARCHAR(100) NOT NULL,
            branch_id INT DEFAULT 1,
            api_key VARCHAR(128) NOT NULL UNIQUE,
            is_active BOOLEAN DEFAULT TRUE,
            created_by VARCHAR(50) NULL,
            last_seen_at DATETIME NULL,
            last_ip VARCHAR(45) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await query('ALTER TABLE kiosk_devices ADD COLUMN last_ip VARCHAR(45) NULL').catch(() => {});

        // 14. Bảng Bộ đếm Rate Limit Dùng Chung (login_rate_limits - Distributed / Multi-process Shared Store)
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

        console.log('✅ Khởi tạo cấu trúc Database (14 bảng quan hệ + V5 Enterprise Schema) thành công!');
    } catch (err) {
        console.error('❌ Lỗi khởi tạo cấu trúc Database:', err.message);
    }
}

module.exports = {
    initDatabase
};
