const { pool, query } = require('../config/db');

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
            password VARCHAR(100) DEFAULT '123456',
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
        
        // Migrate dữ liệu role ban đầu từ chức danh (chỉ thực hiện khi role chưa được thiết lập)
        await query(`
            UPDATE employees 
            SET role = 'accountant' 
            WHERE (role IS NULL OR role = '' OR role = 'worker') 
              AND (LOWER(chuc_danh) LIKE '%kế toán%' OR LOWER(chuc_danh) LIKE '%ke toan%')
        `).catch(() => {});
        await query(`
            UPDATE employees 
            SET role = 'admin' 
            WHERE (role IS NULL OR role = '' OR role = 'worker') 
              AND (LOWER(chuc_danh) LIKE '%giám đốc%' OR LOWER(chuc_danh) LIKE '%giam doc%')
        `).catch(() => {});
        await query(`
            UPDATE employees 
            SET role = 'worker' 
            WHERE role IS NULL OR role = '' OR role NOT IN ('admin', 'accountant', 'worker')
        `).catch(() => {});

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
        const companyCount = await query('SELECT COUNT(*) as cnt FROM company_settings');
        if (companyCount && companyCount[0].cnt === 0) {
            await query(`INSERT INTO company_settings (company_name, phone, address, tax_code, logo_url) VALUES 
                ('Công ty Cổ phần Vật Liệu Xây Dựng Sedinco', '02363123456', 'Số 1 Nguyễn Văn Linh, Đà Nẵng', '0400123456', 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200')`);
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
            UNIQUE KEY unique_emp_date (employee_id, record_date)
        )`);
        await query("ALTER TABLE attendance_logs ADD COLUMN check_in_time VARCHAR(20) DEFAULT NULL").catch(() => {});
        await query("ALTER TABLE attendance_logs ADD COLUMN check_out_time VARCHAR(20) DEFAULT NULL").catch(() => {});

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
        const holidayCount = await query('SELECT COUNT(*) as cnt FROM public_holidays');
        if (holidayCount && holidayCount[0].cnt === 0) {
            await query(`INSERT INTO public_holidays (holiday_name, start_date, end_date) VALUES 
                ('Tết Dương Lịch', '2026-01-01', '2026-01-01'),
                ('Giải phóng miền Nam & Quốc tế Lao Động', '2026-04-30', '2026-05-01'),
                ('Quốc Khánh', '2026-09-01', '2026-09-02')`);
        }

        // 7. Bảng Admin (admins)
        await query(`CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(100) NOT NULL,
            ho_ten VARCHAR(100)
        )`);
        const adminCount = await query('SELECT COUNT(*) as cnt FROM admins');
        if (adminCount && adminCount[0].cnt === 0) {
            await query(`INSERT INTO admins (username, password, ho_ten) VALUES ('admin', '123456', 'Giám đốc Điều hành')`);
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

        console.log('✅ Khởi tạo cấu trúc Database (10 bảng quan hệ + RBAC) thành công!');
    } catch (err) {
        console.error('❌ Lỗi khởi tạo cấu trúc Database:', err.message);
    }
}

module.exports = {
    initDatabase
};
