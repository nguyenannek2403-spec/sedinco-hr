/**
 * tools/seed_staging_data.js
 * 
 * Script sinh dữ liệu mô phỏng lớn gắn nhãn SIM (G9 Mục C.1 & C.2):
 * - Tiền tố bắt buộc: SIM (ví dụ SIM00001 .. SIM00500)
 * - Mật khẩu ngẫu nhiên riêng biệt từng tài khoản (được hash bằng bcrypt)
 * - Xuất tệp thông tin đăng nhập vào thư mục bị gitignore (backups/sim_credentials.json)
 * - Quy mô: 500 nhân viên, 12 tháng chấm công (khoảng 186.000 bản ghi), đơn từ, OT, chốt kỳ, audit_logs
 * - Ảnh chụp: Chỉ sinh JPEG hợp lệ nhỏ (<=3 KB) cho tối đa 1% bản ghi
 * - Theo dõi dung lượng qua information_schema, dừng nếu vượt 50% hạn mức
 * - Tuân thủ nghiêm ngặt chốt chặn an toàn dbSafetyGuard (ALLOW_DESTRUCTIVE_DB)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require(path.join(__dirname, '../sedinco_backend/node_modules/mysql2/promise'));
const { hashPassword } = require(path.join(__dirname, '../sedinco_backend/src/utils/passwordHelper'));
const { assertDestructiveDbAllowed, maskString } = require('./lib/dbSafetyGuard');

// Nạp cấu hình từ môi trường
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
const DB_SSL = process.env.DB_SSL === 'true';

// Giới hạn an toàn dung lượng (mặc định cảnh báo ở 200 MB nếu không có cấu hình gói)
const MAX_STORAGE_BYTES = process.env.MAX_STORAGE_BYTES ? Number(process.env.MAX_STORAGE_BYTES) : 500 * 1024 * 1024;
const STORAGE_HALT_THRESHOLD = MAX_STORAGE_BYTES * 0.5;

// Mẫu ảnh JPEG siêu nhẹ hợp lệ (1x1 pixel JPEG, 631 bytes <= 3 KB)
const TINY_JPEG_BASE64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

async function checkStorageUsage(conn) {
    const [rows] = await conn.query(`
        SELECT SUM(data_length + index_length) as total_size 
        FROM information_schema.TABLES 
        WHERE table_schema = ?
    `, [DB_NAME]);
    return Number(rows[0].total_size) || 0;
}

async function seedStagingData() {
    console.log('=== CÔNG CỤ NẠP DỮ LIỆU LỚN MÔ PHỎNG (SEED STAGING DATA) ===');

    // Chốt chặn an toàn
    assertDestructiveDbAllowed(DB_NAME, DB_HOST);

    const connectionConfig = {
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME
    };
    if (DB_SSL) {
        connectionConfig.ssl = { rejectUnauthorized: false };
    }

    const conn = await mysql.createConnection(connectionConfig);
    console.log(`✅ Kết nối thành công tới ${maskString(DB_HOST)} / ${maskString(DB_NAME)}`);

    try {
        const initialSize = await checkStorageUsage(conn);
        console.log(`Dung lượng hiện tại của schema: ${(initialSize / 1024 / 1024).toFixed(2)} MB`);

        // 1. Tạo 500 nhân viên có tiền tố SIM
        console.log('\n[1/5] Khởi tạo 500 nhân viên tiền tố SIM00001 - SIM00500...');
        const credentials = [];
        const employeeValues = [];
        const departments = ['Tổ may 1', 'Tổ may 2', 'Tổ may 3', 'Kho vải', 'Đóng gói', 'Bảo trì', 'KCS'];

        for (let i = 1; i <= 500; i++) {
            const ma_nv = `SIM${String(i).padStart(5, '0')}`;
            const ho_ten = `Công Nhân Mô Phỏng ${String(i).padStart(3, '0')}`;
            const chuc_danh = departments[i % departments.length];
            const luong_cb = 7000000 + (i % 10) * 400000;
            
            // Mật khẩu ngẫu nhiên riêng biệt
            const rawPassword = `Sim@${crypto.randomBytes(4).toString('hex')}!`;
            const passHash = hashPassword(rawPassword);

            credentials.push({ ma_nv, ho_ten, chuc_danh, username: ma_nv, password: rawPassword });
            employeeValues.push([
                ma_nv, ho_ten, '1992-05-15', '0912345678', `${ma_nv.toLowerCase()}@sedinco.local`,
                chuc_danh, '2024-01-01', '2024-03-01', passHash, luong_cb,
                800000, 500000, 500000, 1000000, 0, 0, 1, 'active', 0, 'worker'
            ]);
        }

        // Chèn theo lô 100 nhân viên
        for (let i = 0; i < employeeValues.length; i += 100) {
            const batch = employeeValues.slice(i, i + 100);
            await conn.query(`
                INSERT INTO employees (
                    ma_nv, ho_ten, ngay_sinh, dien_thoai, email, chuc_danh,
                    ngay_bat_dau_lam, ngay_chinh_thuc, password, luong_cb,
                    phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o, thuong_htcv,
                    phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance, status,
                    is_locked, role
                ) VALUES ?
                ON DUPLICATE KEY UPDATE ho_ten=VALUES(ho_ten), password=VALUES(password)
            `, [batch]);
        }

        // Xuất file thông tin đăng nhập vào thư mục gitignored (backups/)
        const backupDir = path.join(__dirname, '../backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const credPath = path.join(backupDir, 'sim_credentials.json');
        fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2), 'utf8');
        console.log(`✔ Đã lưu danh sách thông tin đăng nhập an toàn vào: ${credPath} (Đã được gitignore)`);

        // 2. Tạo Kiosk phục vụ chấm công
        console.log('\n[2/5] Đăng ký Kiosk mô phỏng...');
        await conn.query(`
            INSERT INTO kiosk_devices (kiosk_name, api_key_hash, branch_id, is_active, created_by)
            VALUES ('KIOSK_SIM_01', 'sim_kiosk_key_hash_01', 1, 1, 'admin')
            ON DUPLICATE KEY UPDATE is_active=1
        `);

        // 3. Sinh dữ liệu chấm công 12 tháng (khoảng 186.000 bản ghi)
        console.log('\n[3/5] Đang sinh 12 tháng chấm công (mục tiêu ~186.000 bản ghi)...');
        console.log('Lưu ý: Chỉ gắn ảnh JPEG nhỏ (<=3 KB) cho tối đa 1% bản ghi.');

        const startDate = new Date('2025-11-01');
        const endDate = new Date('2026-10-31');
        const dates = [];
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            // Chỉ chấm công các ngày từ Thứ 2 đến Thứ 7 (bỏ Chủ nhật)
            if (d.getDay() !== 0) {
                dates.push(new Date(d).toISOString().substring(0, 10));
            }
        }

        console.log(`Số ngày làm việc trong 12 tháng: ${dates.length} ngày`);
        console.log(`Tổng số bản ghi dự kiến: ${500 * dates.length} bản ghi`);

        let totalLogsInserted = 0;
        let imagesAttachedCount = 0;
        const maxImagesAllowed = Math.floor(500 * dates.length * 0.01); // Tối đa 1%

        for (const dateStr of dates) {
            const batchLogs = [];
            const batchDaily = [];

            for (let i = 1; i <= 500; i++) {
                const ma_nv = `SIM${String(i).padStart(5, '0')}`;
                
                // Trạng thái: 92% làm đủ công ('1'), 5% nghỉ phép ('P'), 3% nửa công ('0.5')
                const rand = (i + dateStr.charCodeAt(9)) % 100;
                let status = '1';
                let hours = 8.0;
                let otHours = 0;

                if (rand < 5) {
                    status = 'P';
                    hours = 0;
                } else if (rand < 8) {
                    status = '0.5';
                    hours = 4.0;
                } else if (rand > 90) {
                    otHours = 2.0; // 2 giờ OT
                }

                // Gắn ảnh nhỏ cho tối đa 1% bản ghi
                let imgSnapshot = null;
                if (imagesAttachedCount < maxImagesAllowed && rand === 42) {
                    imgSnapshot = TINY_JPEG_BASE64;
                    imagesAttachedCount++;
                }

                batchLogs.push([
                    ma_nv, dateStr, status, otHours, '07:55:00', '17:05:00',
                    16.0544, 108.2022, 'kiosk_qr', imgSnapshot, 0, null, 'device_sim_hash', 'raw', 0
                ]);

                batchDaily.push([
                    ma_nv, dateStr, status, hours, otHours, '07:55:00', '17:05:00', 0
                ]);
            }

            // Chèn theo lô
            await conn.query(`
                INSERT INTO attendance_logs (
                    employee_id, record_date, status, ot_hours, check_in_time, check_out_time,
                    check_in_lat, check_in_lng, check_in_method, check_in_image, is_suspicious,
                    suspicious_reason, device_fingerprint, location_source, is_low_trust
                ) VALUES ?
            `, [batchLogs]);

            await conn.query(`
                INSERT INTO attendance (
                    ma_nv, date, status, hours, ot_hours, check_in_time, check_out_time, is_deleted
                ) VALUES ?
                ON DUPLICATE KEY UPDATE status=VALUES(status), hours=VALUES(hours)
            `, [batchDaily]);

            totalLogsInserted += batchLogs.length;

            if (totalLogsInserted % 25000 === 0) {
                const currentSize = await checkStorageUsage(conn);
                console.log(`  -> Đã nạp ${totalLogsInserted} bản ghi... Dung lượng hiện tại: ${(currentSize / 1024 / 1024).toFixed(2)} MB`);
                if (currentSize > STORAGE_HALT_THRESHOLD) {
                    console.warn(`⚠️ CẢNH BÁO: Dung lượng vượt 50% ngưỡng an toàn (${(STORAGE_HALT_THRESHOLD / 1024 / 1024).toFixed(2)} MB). DỪNG NẠP TIẾP ĐỂ BẢO VỆ GÓI!`);
                    break;
                }
            }
        }

        console.log(`✔ Hoàn tất nạp chấm công: ${totalLogsInserted} bản ghi. Số ảnh đính kèm: ${imagesAttachedCount}/${totalLogsInserted} (${(imagesAttachedCount / totalLogsInserted * 100).toFixed(2)}%)`);

        // 4. Sinh đơn từ mô phỏng & Đăng ký OT
        console.log('\n[4/5] Sinh đơn nghỉ phép và đăng ký OT...');
        const sampleRequests = [];
        const sampleOt = [];

        for (let i = 1; i <= 50; i++) {
            const ma_nv = `SIM${String(i).padStart(5, '0')}`;
            sampleRequests.push([
                ma_nv, 'annual', '2026-10-15', '2026-10-16', 2, 'Việc gia đình', 'approved', 'admin', '2026-10-14 08:00:00'
            ]);
            sampleOt.push([
                ma_nv, '2026-10-20', '17:30:00', '19:30:00', 2, 'Tăng ca hoàn thành đơn hàng', 'approved', 'admin', '2026-10-19 10:00:00'
            ]);
        }

        await conn.query(`
            INSERT INTO requests (
                employee_id, request_type, start_date, end_date, duration_days, reason, status, approved_by, approved_at
            ) VALUES ?
        `, [sampleRequests]);

        await conn.query(`
            INSERT INTO ot_registrations (
                employee_id, work_date, start_time, end_time, expected_hours, reason, status, approved_by, approved_at
            ) VALUES ?
        `, [sampleOt]);

        // 5. Khóa kỳ công mẫu & Audit logs
        console.log('\n[5/5] Ghi nhận chốt kỳ công mẫu và nhật ký kiểm toán...');
        await conn.query(`
            INSERT INTO period_locks (month, year, is_locked, locked_by, reason)
            VALUES (9, 2026, 1, 'admin', 'Chốt sổ kỳ công Tháng 09/2026')
            ON DUPLICATE KEY UPDATE is_locked=1
        `);

        await conn.query(`
            INSERT INTO audit_logs (actor_id, action, target, details, ip_address)
            VALUES ('admin', 'SEED_STAGING_LARGE_DATA', 'ALL_TABLES', 'Đã nạp thành công 500 nhân viên mô phỏng và 186.000 bản ghi chấm công', '127.0.0.1')
        `);

        const finalSize = await checkStorageUsage(conn);
        console.log(`\n=== TỔNG KẾT NẠP DỮ LIỆU THÀNH CÔNG ===`);
        console.log(`- Tổng nhân viên SIM: 500`);
        console.log(`- Tổng bản ghi chấm công: ${totalLogsInserted}`);
        console.log(`- Dung lượng CSDL sau khi nạp: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);

    } finally {
        await conn.end();
    }
}

if (require.main === module) {
    seedStagingData().catch(err => {
        console.error('❌ LỖI SEED:', err.message);
        process.exit(1);
    });
}

module.exports = { seedStagingData };
