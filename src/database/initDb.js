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
            has_insurance BOOLEAN DEFAULT TRUE
        )`);
        await query("ALTER TABLE employees MODIFY COLUMN avatar_url LONGTEXT").catch(() => {});

        // 2. Bảng Cấu hình thông tin công ty (company_settings)
        await query(`CREATE TABLE IF NOT EXISTS company_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_name VARCHAR(255),
            phone VARCHAR(50),
            address TEXT,
            tax_code VARCHAR(50),
            logo_url LONGTEXT
        )`);
        await query("ALTER TABLE company_settings MODIFY COLUMN logo_url LONGTEXT").catch(() => {});
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

        console.log('✅ Khởi tạo cấu trúc Database (7 bảng quan hệ) thành công!');
    } catch (err) {
        console.error('❌ Lỗi khởi tạo cấu trúc Database:', err.message);
    }
}

module.exports = {
    initDatabase
};
