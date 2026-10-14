const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sedinco_hr',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
};

// Tự động bật SSL cho Aiven Cloud MySQL hoặc khi có biến môi trường DB_SSL=true
if (process.env.DB_SSL === 'true' || (process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud.com'))) {
    dbConfig.ssl = { rejectUnauthorized: false };
}

const db = mysql.createPool(dbConfig);

function initDatabase() {
    
    // 1. Bảng Nhân sự
    db.query(`CREATE TABLE IF NOT EXISTS employees (
        ma_nv VARCHAR(20) PRIMARY KEY,
        ho_ten VARCHAR(100),
        ngay_sinh DATE,
        dien_thoai VARCHAR(20),
        email VARCHAR(100),
        chuc_danh VARCHAR(100),
        ngay_bat_dau_lam DATE,
        ngay_chinh_thuc DATE,
        password VARCHAR(100) DEFAULT '123456',
        avatar_url LONGTEXT DEFAULT 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
        luong_cb DECIMAL(15,2) DEFAULT 0,
        phu_cap_an_trua DECIMAL(15,2) DEFAULT 0,
        phu_cap_xang_xe DECIMAL(15,2) DEFAULT 0,
        phu_cap_nha_o DECIMAL(15,2) DEFAULT 0,
        thuong_htcv DECIMAL(15,2) DEFAULT 0,
        phu_cap_trach_nhiem DECIMAL(15,2) DEFAULT 0,
        phu_cap_tiep_khach DECIMAL(15,2) DEFAULT 0,
        has_insurance BOOLEAN DEFAULT TRUE
    )`, () => {
        db.query("ALTER TABLE employees MODIFY COLUMN avatar_url LONGTEXT", () => {});
    });

    // 2. Bảng Cấu hình thông tin công ty
    db.query(`CREATE TABLE IF NOT EXISTS company_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_name VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        tax_code VARCHAR(50),
        logo_url LONGTEXT
    )`, () => {
        db.query("ALTER TABLE company_settings MODIFY COLUMN logo_url LONGTEXT", () => {});
        db.query('SELECT COUNT(*) as cnt FROM company_settings', (err, res) => {
            if(res && res[0].cnt === 0) {
                db.query(`INSERT INTO company_settings (company_name, phone, address, tax_code, logo_url) VALUES 
                    ('Công ty Cổ phần Vật Liệu Xây Dựng Sedinco', '02363123456', 'Số 1 Nguyễn Văn Linh, Đà Nẵng', '0400123456', 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200')`);
            }
        });
    });

    // 3. Bảng Chấm công chuẩn tháng
    db.query(`CREATE TABLE IF NOT EXISTS attendance (
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

    // 4. Bảng Nhật ký chấm công hàng ngày
    db.query(`CREATE TABLE IF NOT EXISTS attendance_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id VARCHAR(20) NOT NULL,
        record_date DATE NOT NULL,
        status VARCHAR(10) NOT NULL,
        ot_hours DECIMAL(4,2) DEFAULT 0,
        check_in_time VARCHAR(20) DEFAULT NULL,
        check_out_time VARCHAR(20) DEFAULT NULL,
        UNIQUE KEY unique_emp_date (employee_id, record_date)
    )`, () => {
        db.query("ALTER TABLE attendance_logs ADD COLUMN check_in_time VARCHAR(20) DEFAULT NULL", () => {});
        db.query("ALTER TABLE attendance_logs ADD COLUMN check_out_time VARCHAR(20) DEFAULT NULL", () => {});
    });

    // 5. Bảng Đơn từ
    db.query(`CREATE TABLE IF NOT EXISTS requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id VARCHAR(20) NOT NULL,
        request_type VARCHAR(50) NOT NULL,
        request_date DATE NOT NULL,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // 6. Bảng Ngày lễ
    db.query(`CREATE TABLE IF NOT EXISTS public_holidays (
        id INT AUTO_INCREMENT PRIMARY KEY,
        holiday_name VARCHAR(150) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL
    )`, () => {
        db.query('SELECT COUNT(*) as cnt FROM public_holidays', (err, res) => {
            if(res && res[0].cnt === 0) {
                db.query(`INSERT INTO public_holidays (holiday_name, start_date, end_date) VALUES 
                    ('Tết Dương Lịch', '2026-01-01', '2026-01-01'),
                    ('Giải phóng miền Nam & Quốc tế Lao Động', '2026-04-30', '2026-05-01'),
                    ('Quốc Khánh', '2026-09-01', '2026-09-02')`);
            }
        });
    });

    // 7. Bảng Admin
    db.query(`CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        ho_ten VARCHAR(100)
    )`, () => {
        db.query('SELECT COUNT(*) as cnt FROM admins', (err, res) => {
            if(res && res[0].cnt === 0) {
                db.query(`INSERT INTO admins (username, password, ho_ten) VALUES ('admin', '123456', 'Giám đốc Điều hành')`);
            }
        });
    });
}

// Kiểm tra kết nối ban đầu tới MySQL Pool
db.getConnection((err, conn) => {
    if (err) {
        console.error('❌ Lỗi kết nối MySQL Pool:', err.message);
        return;
    }
    console.log(`✅ Đã kết nối MySQL Pool thành công (${dbConfig.host}:${dbConfig.port}/${dbConfig.database})!`);
    conn.release();
    initDatabase();
});

// API Cấu hình công ty
app.get('/api/company', (req, res) => {
    db.query('SELECT * FROM company_settings LIMIT 1', (err, results) => {
        res.json({ success: true, data: results?.[0] || {} });
    });
});

app.put('/api/company', (req, res) => {
    const { company_name, phone, address, tax_code, logo_url } = req.body;
    db.query('UPDATE company_settings SET company_name=?, phone=?, address=?, tax_code=?, logo_url=? WHERE id=1', 
        [company_name, phone, address, tax_code, logo_url], (err) => {
        if (err) {
            console.error('Lỗi cập nhật công ty:', err.message);
            return res.status(500).json({ success: false, message: 'Lỗi cập nhật cấu hình công ty!' });
        }
        res.json({ success: true });
    });
});

// API Đăng nhập Nhân viên
app.post('/api/login', (req, res) => {
    const { ma_nv, password } = req.body;
    if (!ma_nv || !password) {
        return res.json({ success: false, message: 'Vui lòng nhập đầy đủ mã nhân viên và mật khẩu!' });
    }
    db.query('SELECT * FROM employees WHERE ma_nv = ?', [ma_nv], (err, results) => {
        if (err || !results || results.length === 0) {
            return res.json({ success: false, message: 'Mã nhân viên không tồn tại!' });
        }
        const emp = results[0];
        const defaultPass = emp.password || '123456';
        if (password === defaultPass) {
            const safeEmp = { ...emp };
            delete safeEmp.password;
            res.json({ success: true, data: safeEmp });
        } else {
            res.json({ success: false, message: 'Mật khẩu không chính xác!' });
        }
    });
});

// API Đăng nhập Admin
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu quản trị!' });
    }
    db.query('SELECT * FROM admins WHERE username = ?', [username], (err, results) => {
        if (err || !results || results.length === 0) {
            return res.json({ success: false, message: 'Tài khoản quản trị không tồn tại!' });
        }
        const admin = results[0];
        if (admin.password === password) {
            const safeAdmin = { ...admin };
            delete safeAdmin.password;
            res.json({ success: true, data: safeAdmin });
        } else {
            res.json({ success: false, message: 'Mật khẩu quản trị không chính xác!' });
        }
    });
});

// API Đăng ký Admin
app.post('/api/admin/register', (req, res) => {
    const { username, password, ho_ten } = req.body;
    if (!username || !password) {
        return res.json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu!' });
    }
    db.query('SELECT * FROM admins WHERE username = ?', [username], (err, results) => {
        if (results && results.length > 0) {
            return res.json({ success: false, message: 'Tên đăng nhập này đã tồn tại!' });
        }
        db.query('INSERT INTO admins (username, password, ho_ten) VALUES (?, ?, ?)', [username, password, ho_ten || 'Quản trị viên'], (err2) => {
            if (err2) {
                console.error('Lỗi đăng ký admin:', err2.message);
                return res.status(500).json({ success: false, message: 'Lỗi đăng ký tài khoản quản trị!' });
            }
            res.json({ success: true });
        });
    });
});

// API Đổi mật khẩu
app.post('/api/change-password', (req, res) => {
    const { ma_nv, old_password, new_password } = req.body;
    db.query('SELECT password FROM employees WHERE ma_nv = ?', [ma_nv], (err, results) => {
        if (err || !results || results.length === 0) return res.json({ success: false, message: 'Không tìm thấy nhân viên' });
        const currentPass = results[0].password || '123456';
        if (old_password !== currentPass) return res.json({ success: false, message: 'Mật khẩu cũ không chính xác' });

        db.query('UPDATE employees SET password = ? WHERE ma_nv = ?', [new_password, ma_nv], (err2) => {
            res.json({ success: !err2 });
        });
    });
});

// API Cập nhật Avatar
app.post('/api/update-avatar', (req, res) => {
    const { ma_nv, avatar_url } = req.body;
    db.query('UPDATE employees SET avatar_url = ? WHERE ma_nv = ?', [avatar_url, ma_nv], (err) => {
        if (err) {
            console.error('Lỗi cập nhật avatar:', err.message);
            return res.status(500).json({ success: false, message: 'Lỗi cập nhật ảnh đại diện!' });
        }
        res.json({ success: true });
    });
});

// API Ngày lễ
app.get('/api/holidays', (req, res) => {
    db.query('SELECT * FROM public_holidays ORDER BY start_date ASC', (err, results) => {
        res.json({ success: true, data: results || [] });
    });
});

app.post('/api/holidays', (req, res) => {
    const { holiday_name, start_date, end_date } = req.body;
    db.query('INSERT INTO public_holidays (holiday_name, start_date, end_date) VALUES (?, ?, ?)', [holiday_name, start_date, end_date], (err) => {
        res.json({ success: !err });
    });
});

app.delete('/api/holidays/:id', (req, res) => {
    db.query('DELETE FROM public_holidays WHERE id = ?', [req.params.id], (err) => {
        res.json({ success: !err });
    });
});

// API Chấm công
app.get('/api/attendance', (req, res) => {
    const { month, year } = req.query;
    db.query('SELECT ma_nv, ho_ten FROM employees ORDER BY ma_nv ASC', (err, emps) => {
        if (err || !emps) return res.json({ success: true, data: [] });
        
        db.query('SELECT employee_id, DAY(record_date) as day, status, ot_hours FROM attendance_logs WHERE MONTH(record_date)=? AND YEAR(record_date)=?', [month, year], (err2, logs) => {
            const safeLogs = logs || [];
            const daysInMonth = new Date(year, month, 0).getDate();
            const result = emps.map(emp => {
                const days = Array(daysInMonth).fill('');
                safeLogs.filter(l => l.employee_id === emp.ma_nv).forEach(log => {
                    if(log.day > 0 && log.day <= daysInMonth) {
                        days[log.day - 1] = log.status;
                    }
                });
                return { ma_nv: emp.ma_nv, ho_ten: emp.ho_ten, days: days };
            });
            res.json({ success: true, data: result });
        });
    });
});

app.post('/api/attendance/update', (req, res) => {
    const { ma_nv, day, month, year, status, ot_hours, check_in_time, check_out_time } = req.body;
    
    if (!ma_nv || day === undefined || month === undefined || year === undefined) {
        return res.status(400).json({ success: false, message: 'Thiếu mã nhân viên hoặc thời gian chấm công!' });
    }

    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (isNaN(d) || d < 1 || d > 31 || isNaN(m) || m < 1 || m > 12 || isNaN(y) || y < 2000 || y > 2100) {
        return res.status(400).json({ success: false, message: 'Ngày tháng năm không hợp lệ!' });
    }

    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    let hours = ot_hours !== undefined ? Number(ot_hours) : 0;
    if (isNaN(hours) || hours < 0) hours = 0;
    if (hours > 24) hours = 24; // Giới hạn tối đa 24h OT tránh DoS
    
    if (!status || status === '') {
        db.query('DELETE FROM attendance_logs WHERE employee_id=? AND record_date=?', [ma_nv, dateStr], (err) => {
            res.json({ success: !err });
        });
    } else {
        const query = `
            INSERT INTO attendance_logs (employee_id, record_date, status, ot_hours, check_in_time, check_out_time) 
            VALUES (?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
                status = VALUES(status), 
                ot_hours = VALUES(ot_hours),
                check_in_time = COALESCE(VALUES(check_in_time), check_in_time),
                check_out_time = COALESCE(VALUES(check_out_time), check_out_time)
        `;
        db.query(query, [ma_nv, dateStr, status, hours, check_in_time || null, check_out_time || null], (err) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true });
        });
    }
});

// API Tính lương
app.get('/api/payroll', (req, res) => {
    const { month, year } = req.query;
    const m = month || 10;
    const y = year || 2026;

    const query = `
        SELECT e.*, IFNULL(a.cong_chuan, 26) as cong_chuan
        FROM employees e LEFT JOIN attendance a ON e.ma_nv = a.ma_nv AND a.thang = ? AND a.nam = ?
    `;
    db.query(query, [m, y], (err, emps) => {
        if (err || !emps) return res.json({ success: true, data: [] });
        
        db.query('SELECT start_date, end_date FROM public_holidays', (errHolidays, holidays) => {
            const safeHolidays = holidays || [];

            db.query('SELECT employee_id, record_date, status, ot_hours, DAYOFWEEK(record_date) as dow FROM attendance_logs WHERE MONTH(record_date) = ? AND YEAR(record_date) = ?', [m, y], (err2, logs) => {
                const safeLogs = logs || [];

                const data = emps.map(emp => {
                    const empLogs = safeLogs.filter(l => l.employee_id === emp.ma_nv);
                    let congThuViec = 0;
                    let congChinhThuc = 0;
                    let tienOt = 0;

                    const luongCb = Number(emp.luong_cb) || 0;
                    const congChuan = Number(emp.cong_chuan) || 26;
                    const luong1Gio = (luongCb / congChuan) / 8;

                    const ngayChinhThuc = emp.ngay_chinh_thuc ? new Date(emp.ngay_chinh_thuc) : null;
                    if(ngayChinhThuc) ngayChinhThuc.setHours(0,0,0,0);

                    empLogs.forEach(log => {
                        const logDate = new Date(log.record_date);
                        logDate.setHours(0,0,0,0);
                        
                        const isSunday = (log.dow === 1);
                        let isHoliday = false;
                        for (let h of safeHolidays) {
                            const startDate = new Date(h.start_date);
                            startDate.setHours(0,0,0,0);
                            const endDate = new Date(h.end_date);
                            endDate.setHours(23,59,59,999);
                            if (logDate >= startDate && logDate <= endDate) {
                                isHoliday = true;
                                break;
                            }
                        }

                        const isProbation = ngayChinhThuc && (logDate < ngayChinhThuc);

                        if (log.status === '1') {
                            if (isProbation) congThuViec += 1; else congChinhThuc += 1;
                        } else if (log.status === '0.5') {
                            if (isProbation) congThuViec += 0.5; else congChinhThuc += 0.5;
                        } else if (log.status === 'OT') {
                            let heSo = isHoliday ? 3.0 : (isSunday ? 2.0 : 1.5);
                            let soGioOT = Number(log.ot_hours) > 0 ? Number(log.ot_hours) : ((isHoliday || isSunday) ? 8 : 4);
                            tienOt += (luong1Gio * soGioOT * heSo);
                        } else if (log.status === '1/OT') {
                            if (isProbation) congThuViec += 1; else congChinhThuc += 1;
                            let heSo = isHoliday ? 3.0 : (isSunday ? 2.0 : 1.5);
                            let soGioOT = Number(log.ot_hours) > 0 ? Number(log.ot_hours) : ((isHoliday || isSunday) ? 8 : 4);
                            tienOt += (luong1Gio * soGioOT * heSo);
                        }
                    });

                    const tongPhuCapCoDinh = (Number(emp.phu_cap_an_trua) || 0) + (Number(emp.phu_cap_xang_xe) || 0) + (Number(emp.phu_cap_nha_o) || 0) + (Number(emp.thuong_htcv) || 0) + (Number(emp.phu_cap_trach_nhiem) || 0) + (Number(emp.phu_cap_tiep_khach) || 0);
                    
                    const effectiveDays = (congThuViec * 0.85) + congChinhThuc;
                    const salaryByWork = (luongCb / congChuan) * effectiveDays;
                    const allowanceByWork = (tongPhuCapCoDinh / congChuan) * effectiveDays;
                    let baoHiem = (emp.has_insurance !== 0) ? (luongCb * 0.105) : 0;
                    
                    return {
                        id_nhan_vien: emp.ma_nv, ho_ten: emp.ho_ten, baseSalary: luongCb, 
                        congThuViec: congThuViec, congChinhThuc: congChinhThuc,
                        totalWorkDays: congThuViec + congChinhThuc,
                        salaryByWork: Math.round(salaryByWork),
                        totalAllowance: Math.round(allowanceByWork), otAmount: Math.round(tienOt),
                        totalInsurance: Math.round(baoHiem), netSalary: Math.round(salaryByWork + allowanceByWork + tienOt - baoHiem)
                    };
                });
                res.json({ success: true, data: data });
            });
        });
    });
});

// API Đơn từ & Duyệt đơn cập nhật công
app.get('/api/requests', (req, res) => {
    db.query(`SELECT r.id, r.employee_id as ma_nv, e.ho_ten, r.request_type as type, DATE_FORMAT(r.request_date, '%d/%m/%Y') as date, r.reason, r.status FROM requests r LEFT JOIN employees e ON r.employee_id = e.ma_nv ORDER BY r.created_at DESC`, 
    (err, results) => res.json({ success: true, data: results || [] }));
});

app.post('/api/requests', (req, res) => {
    const { employee_id, request_type, request_date, reason } = req.body;
    db.query('INSERT INTO requests (employee_id, request_type, request_date, reason) VALUES (?, ?, ?, ?)', [employee_id, request_type, request_date, reason], (err) => {
        res.json({ success: !err });
    });
});

app.put('/api/requests/:id', (req, res) => {
    const { status } = req.body;
    const reqId = req.params.id;
    db.query('UPDATE requests SET status = ? WHERE id = ?', [status, reqId], (err) => {
        if (err) return res.json({ success: false });
        
        if (status === 'approved') {
            db.query('SELECT employee_id, request_date, request_type FROM requests WHERE id = ?', [reqId], (err, results) => {
                if (results && results.length > 0) {
                    const reqData = results[0];
                    const dateObj = new Date(reqData.request_date);
                    const year = dateObj.getFullYear();
                    const month = dateObj.getMonth() + 1;
                    const day = dateObj.getDate();
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const type = reqData.request_type.toLowerCase();
                    
                    if (type.includes('làm thêm') || type.includes('công tác') || type.includes('ot')) {
                        db.query('SELECT status FROM attendance_logs WHERE employee_id = ? AND record_date = ?', [reqData.employee_id, dateStr], (err2, logRes) => {
                            let newStatus = 'OT';
                            if (logRes && logRes.length > 0 && logRes[0].status === '1') {
                                newStatus = '1/OT';
                            }
                            const query = `INSERT INTO attendance_logs (employee_id, record_date, status, ot_hours) VALUES (?, ?, ?, 4) ON DUPLICATE KEY UPDATE status = ?`;
                            db.query(query, [reqData.employee_id, dateStr, newStatus, newStatus]);
                        });
                    } else if (type.includes('phép')) {
                        const query = `INSERT INTO attendance_logs (employee_id, record_date, status) VALUES (?, ?, 'P') ON DUPLICATE KEY UPDATE status = 'P'`;
                        db.query(query, [reqData.employee_id, dateStr]);
                    } else if (type.includes('cập nhật công')) {
                        const query = `INSERT INTO attendance_logs (employee_id, record_date, status) VALUES (?, ?, '1') ON DUPLICATE KEY UPDATE status = '1'`;
                        db.query(query, [reqData.employee_id, dateStr]);
                    }
                }
            });
        }
        res.json({ success: true });
    });
});

// API Nhân sự
app.get('/api/employees', (req, res) => {
    const fields = `ma_nv, ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, 
                    ngay_bat_dau_lam, ngay_chinh_thuc, avatar_url, luong_cb, 
                    phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o, thuong_htcv, 
                    phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance`;
    db.query(`SELECT ${fields} FROM employees ORDER BY ma_nv ASC`, (err, results) => {
        if (err) {
            console.error('Lỗi lấy danh sách nhân viên:', err.message);
            return res.status(500).json({ success: false, message: 'Lỗi tải danh sách nhân sự!' });
        }
        res.json({ success: true, data: results || [] });
    });
});

app.post('/api/employees', (req, res) => {
    const { ma_nv, ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, ngay_bat_dau_lam, ngay_chinh_thuc, luong_cb, phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o, thuong_htcv, phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance } = req.body;
    const query = `INSERT INTO employees (ma_nv, ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, ngay_bat_dau_lam, ngay_chinh_thuc, luong_cb, phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o, thuong_htcv, phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [ma_nv, ho_ten, ngay_sinh || null, dien_thoai || '', email || '', chuc_danh || '', ngay_bat_dau_lam || null, ngay_chinh_thuc || null, luong_cb || 0, phu_cap_an_trua || 0, phu_cap_xang_xe || 0, phu_cap_nha_o || 0, thuong_htcv || 0, phu_cap_trach_nhiem || 0, phu_cap_tiep_khach || 0, has_insurance ? 1 : 0];
    db.query(query, values, (err) => {
        if (err) {
            console.error('Lỗi thêm nhân viên:', err.message);
            return res.status(500).json({ success: false, message: 'Lỗi tạo mới hồ sơ nhân sự!' });
        }
        res.json({ success: true });
    });
});

app.put('/api/employees/:id', (req, res) => {
    const { ho_ten, ngay_sinh, dien_thoai, email, chuc_danh, ngay_bat_dau_lam, ngay_chinh_thuc, luong_cb, phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o, thuong_htcv, phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance } = req.body;
    const query = `UPDATE employees SET ho_ten=?, ngay_sinh=?, dien_thoai=?, email=?, chuc_danh=?, ngay_bat_dau_lam=?, ngay_chinh_thuc=?, luong_cb=?, phu_cap_an_trua=?, phu_cap_xang_xe=?, phu_cap_nha_o=?, thuong_htcv=?, phu_cap_trach_nhiem=?, phu_cap_tiep_khach=?, has_insurance=? WHERE ma_nv=?`;
    const values = [ho_ten, ngay_sinh || null, dien_thoai || '', email || '', chuc_danh || '', ngay_bat_dau_lam || null, ngay_chinh_thuc || null, luong_cb || 0, phu_cap_an_trua || 0, phu_cap_xang_xe || 0, phu_cap_nha_o || 0, thuong_htcv || 0, phu_cap_trach_nhiem || 0, phu_cap_tiep_khach || 0, has_insurance ? 1 : 0, req.params.id];
    db.query(query, values, (err) => {
        if (err) {
            console.error('Lỗi cập nhật nhân viên:', err.message);
            return res.status(500).json({ success: false, message: 'Lỗi cập nhật thông tin nhân viên!' });
        }
        res.json({ success: true });
    });
});

app.delete('/api/employees/:id', (req, res) => {
    db.query('DELETE FROM employees WHERE ma_nv=?', [req.params.id], () => res.json({ success: true }));
});

// Health check endpoints cho Render Web Service và uptime monitors
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        name: 'Sedinco HR Backend API', 
        time: new Date().toISOString() 
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString() 
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server Backend đang chạy tại cổng ${PORT}`));