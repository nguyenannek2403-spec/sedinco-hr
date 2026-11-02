/**
 * Script sinh dữ liệu mô phỏng tải lớn cho kiểm thử hiệu năng
 * CHỈ CHẠY TRÊN CƠ SỞ DỮ LIỆU TEST LOCAL (DB_NAME chứa "test")
 * Tuyệt đối từ chối chạy nếu trỏ tới Production hoặc Aiven Cloud
 */

const path = require('path');
const mysql = require(path.join(__dirname, '../sedinco_backend/node_modules/mysql2/promise'));

// Ép buộc môi trường test
process.env.NODE_ENV = 'test';

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';

async function seedSimulationData() {
    console.log(`[SAFETY CHECK] Đang kiểm tra an toàn DB...`);
    console.log(`Target: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);

    if (!DB_NAME.toLowerCase().includes('test')) {
        throw new Error(`[CHỐT CHẶN AN TOÀN] Từ chối thực thi: Tên CSDL "${DB_NAME}" không chứa chữ "test"!`);
    }
    if (DB_HOST.includes('aivencloud.com') || DB_HOST.includes('render.com')) {
        throw new Error(`[CHỐT CHẶN AN TOÀN] Từ chối thực thi: Máy chủ DB "${DB_HOST}" là môi trường Cloud/Production!`);
    }

    const connection = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME
    });

    console.log(`✅ Kết nối thành công tới CSDL TEST: ${DB_NAME}`);

    try {
        console.log('1. Đang dọn dẹp dữ liệu mô phỏng cũ (giữ lại 3 nhân viên gốc NV001, NV002, NV003)...');
        await connection.query("DELETE FROM attendance_logs WHERE employee_id NOT IN ('NV001', 'NV002', 'NV003')");
        await connection.query("DELETE FROM attendance WHERE ma_nv NOT IN ('NV001', 'NV002', 'NV003')");
        await connection.query("DELETE FROM requests WHERE employee_id NOT IN ('NV001', 'NV002', 'NV003')");
        await connection.query("DELETE FROM employees WHERE ma_nv NOT IN ('NV001', 'NV002', 'NV003')");

        console.log('2. Đang tạo 500 nhân viên mô phỏng...');
        const employees = [];
        const departments = ['Công trường', 'Kho vận', 'Sản xuất', 'Bảo trì', 'Kỹ thuật'];
        
        for (let i = 4; i <= 500; i++) {
            const idStr = String(i).padStart(4, '0');
            const ma_nv = `NV${idStr}`;
            const ho_ten = `Công nhân Mô phỏng ${idStr}`;
            const chuc_danh = departments[i % departments.length];
            const luong_cb = 7000000 + (i % 10) * 500000;
            employees.push([
                ma_nv, ho_ten, '1990-01-01', '0901234567', `${ma_nv.toLowerCase()}@sedinco.local`,
                chuc_danh, '2024-01-01', '2024-03-01', '123456', luong_cb,
                800000, 500000, 500000, 1000000, 0, 0, 1, 'active', 0, 'worker'
            ]);
        }

        const empSql = `
            INSERT INTO employees (
                ma_nv, ho_ten, ngay_sinh, dien_thoai, email,
                chuc_danh, ngay_bat_dau_lam, ngay_chinh_thuc, password, luong_cb,
                phu_cap_an_trua, phu_cap_xang_xe, phu_cap_nha_o, thuong_htcv,
                phu_cap_trach_nhiem, phu_cap_tiep_khach, has_insurance, status, is_locked, role
            ) VALUES ?
        `;
        // Chèn theo lô 100
        for (let k = 0; k < employees.length; k += 100) {
            const batch = employees.slice(k, k + 100);
            await connection.query(empSql, [batch]);
        }
        console.log('✅ Đã tạo đủ 500 nhân viên trong CSDL test.');

        console.log('3. Đang tạo nhật ký chấm công mô phỏng cho 12 tháng (Tháng 1/2026 - Tháng 12/2026)...');
        // Để đo đạc chính xác bảng chấm công ma trận 31 ngày (tháng hiện tại) và các tháng quá khứ:
        // Ta tạo dữ liệu chi tiết cho 500 nhân viên x 31 ngày của Tháng 10/2026 (khoảng 15.500 logs)
        // và bảng tổng hợp attendance cho 12 tháng x 500 nhân viên (6.000 bản ghi)
        const currentYear = 2026;
        const targetMonth = 10;
        const daysInMonth = 31;
        const attendanceLogsBatch = [];
        
        for (let i = 1; i <= 500; i++) {
            const ma_nv = i <= 3 ? `NV00${i}` : `NV${String(i).padStart(4, '0')}`;
            for (let d = 1; d <= daysInMonth; d++) {
                // Giả lập: Chủ nhật nghỉ ('CN'), ngày thường đi làm ('1' hoặc 'CD')
                const date = new Date(currentYear, targetMonth - 1, d);
                const dayOfWeek = date.getDay();
                let status = '1';
                let ot = 0;
                if (dayOfWeek === 0) {
                    status = 'CN';
                } else if (d % 15 === 0) {
                    status = 'P'; // Nghỉ phép
                } else if (d % 10 === 0) {
                    status = '1';
                    ot = 2.0; // Làm thêm 2h
                }
                const dateStr = `${currentYear}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const checkIn = status === '1' ? '07:55:00' : null;
                const checkOut = status === '1' ? (ot > 0 ? '19:00:00' : '17:05:00') : null;
                
                attendanceLogsBatch.push([
                    ma_nv, dateStr, status, ot, checkIn, checkOut, 16.0544, 108.2022, 'dynamic_qr', 0
                ]);
            }
        }

        console.log(`Đang nạp ${attendanceLogsBatch.length} bản ghi attendance_logs...`);
        const logSql = `
            INSERT INTO attendance_logs (
                employee_id, record_date, status, ot_hours, check_in_time, check_out_time,
                check_in_lat, check_in_lng, check_in_method, is_suspicious
            ) VALUES ?
            ON DUPLICATE KEY UPDATE status = VALUES(status)
        `;
        for (let k = 0; k < attendanceLogsBatch.length; k += 1000) {
            const batch = attendanceLogsBatch.slice(k, k + 1000);
            await connection.query(logSql, [batch]);
        }
        console.log(`✅ Đã nạp thành công ${attendanceLogsBatch.length} bản ghi attendance_logs.`);

        console.log('4. Đang nạp bảng tổng hợp công chuẩn 12 tháng (attendance)...');
        const summaryBatch = [];
        for (let i = 1; i <= 500; i++) {
            const ma_nv = i <= 3 ? `NV00${i}` : `NV${String(i).padStart(4, '0')}`;
            for (let m = 1; m <= 12; m++) {
                summaryBatch.push([
                    ma_nv, m, currentYear, 26, 0, 24.5, 4.0
                ]);
            }
        }
        const summarySql = `
            INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, cong_thu_viec, cong_chinh_thuc, ot_cn)
            VALUES ?
            ON DUPLICATE KEY UPDATE cong_chinh_thuc = VALUES(cong_chinh_thuc)
        `;
        for (let k = 0; k < summaryBatch.length; k += 1000) {
            const batch = summaryBatch.slice(k, k + 1000);
            await connection.query(summarySql, [batch]);
        }
        console.log(`✅ Đã nạp ${summaryBatch.length} bản ghi bảng công tổng hợp.`);

        console.log('5. Đang nạp đơn từ mô phỏng (requests)...');
        const requestBatch = [];
        for (let i = 1; i <= 500; i++) {
            const ma_nv = i <= 3 ? `NV00${i}` : `NV${String(i).padStart(4, '0')}`;
            requestBatch.push([
                ma_nv, 'leave', `${currentYear}-10-15`, 'Nghỉ việc gia đình', 'approved', '2026-10-10 08:00:00'
            ]);
            if (i % 5 === 0) {
                requestBatch.push([
                    ma_nv, 'attendance_supplement', `${currentYear}-10-18`, 'Quên quét mã QR khi ra về', 'pending', '2026-10-18 17:30:00'
                ]);
            }
        }
        const reqSql = `
            INSERT INTO requests (employee_id, request_type, request_date, reason, status, created_at)
            VALUES ?
        `;
        for (let k = 0; k < requestBatch.length; k += 500) {
            const batch = requestBatch.slice(k, k + 500);
            await connection.query(reqSql, [batch]);
        }
        console.log(`✅ Đã nạp ${requestBatch.length} đơn từ mô phỏng.`);

        console.log('\n======================================================');
        console.log('🎉 TẠO DỮ LIỆU MÔ PHỎNG KIỂM THỬ HIỆU NĂNG HOÀN TẤT!');
        console.log('======================================================');
    } finally {
        await connection.end();
    }
}

seedSimulationData().catch(err => {
    console.error('❌ LỖI KHI SEED DỮ LIỆU TEST:', err);
    process.exit(1);
});
