/**
 * tools/purge_staging_data.js
 * 
 * Script dọn dẹp dữ liệu mô phỏng lớn gắn nhãn SIM (G9 Mục C.3):
 * - Hỗ trợ cờ --dry-run (chỉ đếm số dòng sẽ xóa, không thực thi)
 * - Thứ tự xóa tuân thủ nghiêm ngặt quan hệ khóa ngoại (Foreign Keys)
 * - Kiểm tra chốt chặn an toàn dbSafetyGuard (ALLOW_DESTRUCTIVE_DB phải khớp chính xác và chứa "test")
 * - Đếm số lượng trước/sau trên từng bảng để xác nhận không sót bản ghi
 */

const path = require('path');
const mysql = require(path.join(__dirname, '../sedinco_backend/node_modules/mysql2/promise'));
const { assertDestructiveDbAllowed, maskString } = require('./lib/dbSafetyGuard');

// Nạp cấu hình từ môi trường
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
const DB_SSL = process.env.DB_SSL === 'true';

const isDryRun = process.argv.includes('--dry-run');

async function purgeStagingData() {
    console.log('=== CÔNG CỤ DỌN DẸP DỮ LIỆU MÔ PHỎNG (PURGE SIM DATA) ===');
    console.log(`Chế độ: ${isDryRun ? 'DRY-RUN (Chỉ kiểm đếm, không xóa)' : 'EXECUTE (Xóa thực tế)'}`);

    // Chốt chặn an toàn: Từ chối nếu không có ALLOW_DESTRUCTIVE_DB hoặc không chứa "test"
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
        const tablesToPurge = [
            { name: 'attendance_logs', queryCount: "SELECT COUNT(*) as cnt FROM attendance_logs WHERE employee_id LIKE 'SIM%'", queryDelete: "DELETE FROM attendance_logs WHERE employee_id LIKE 'SIM%'" },
            { name: 'attendance', queryCount: "SELECT COUNT(*) as cnt FROM attendance WHERE ma_nv LIKE 'SIM%'", queryDelete: "DELETE FROM attendance WHERE ma_nv LIKE 'SIM%'" },
            { name: 'requests', queryCount: "SELECT COUNT(*) as cnt FROM requests WHERE employee_id LIKE 'SIM%'", queryDelete: "DELETE FROM requests WHERE employee_id LIKE 'SIM%'" },
            { name: 'ot_registrations', queryCount: "SELECT COUNT(*) as cnt FROM ot_registrations WHERE employee_id LIKE 'SIM%'", queryDelete: "DELETE FROM ot_registrations WHERE employee_id LIKE 'SIM%'" },
            { name: 'login_rate_limits', queryCount: "SELECT COUNT(*) as cnt FROM login_rate_limits WHERE key_name LIKE '%SIM%'", queryDelete: "DELETE FROM login_rate_limits WHERE key_name LIKE '%SIM%'" },
            { name: 'dynamic_qr_sessions', queryCount: "SELECT COUNT(*) as cnt FROM dynamic_qr_sessions WHERE session_token LIKE 'sim:%' OR session_token LIKE 'SIM%'", queryDelete: "DELETE FROM dynamic_qr_sessions WHERE session_token LIKE 'sim:%' OR session_token LIKE 'SIM%'" },
            { name: 'audit_logs', queryCount: "SELECT COUNT(*) as cnt FROM audit_logs WHERE actor_id LIKE 'SIM%'", queryDelete: "DELETE FROM audit_logs WHERE actor_id LIKE 'SIM%'" },
            { name: 'employees', queryCount: "SELECT COUNT(*) as cnt FROM employees WHERE ma_nv LIKE 'SIM%'", queryDelete: "DELETE FROM employees WHERE ma_nv LIKE 'SIM%'" }
        ];

        console.log('\n--- BÁO CÁO KIỂM ĐẾM TRƯỚC KHI XÓA ---');
        let totalRecords = 0;
        for (const t of tablesToPurge) {
            const [rows] = await conn.query(t.queryCount);
            const cnt = rows[0].cnt;
            totalRecords += cnt;
            console.log(`- Bảng ${t.name.padEnd(20)}: ${cnt} bản ghi mang nhãn SIM`);
        }

        console.log(`\nTổng số bản ghi mang nhãn SIM phát hiện: ${totalRecords}`);

        if (isDryRun) {
            console.log('\n[DRY-RUN] Hoàn tất quá trình đếm. Không có bản ghi nào bị thay đổi.');
            return;
        }

        if (totalRecords === 0) {
            console.log('\nKhông có bản ghi mang nhãn SIM nào cần xóa.');
            return;
        }

        console.log('\n--- ĐANG TIẾN HÀNH XÓA THEO THỨ TỰ RÀNG BUỘC KHÓA NGOẠI ---');
        for (const t of tablesToPurge) {
            const [delResult] = await conn.query(t.queryDelete);
            console.log(`✔ Đã xóa ${delResult.affectedRows} dòng từ bảng ${t.name}`);
        }

        console.log('\n--- ĐỐI SOÁT KIỂM KÊ SAU KHI XÓA ---');
        let remainingTotal = 0;
        for (const t of tablesToPurge) {
            const [rows] = await conn.query(t.queryCount);
            const cnt = rows[0].cnt;
            remainingTotal += cnt;
            console.log(`- Bảng ${t.name.padEnd(20)}: còn lại ${cnt} bản ghi`);
        }

        if (remainingTotal === 0) {
            console.log('\n✅ XÓA SẠCH DỮ LIỆU SIM THÀNH CÔNG: 0 bản ghi còn sót lại!');
        } else {
            console.error(`\n❌ CẢNH BÁO: Còn lại ${remainingTotal} bản ghi SIM chưa được xóa triệt để!`);
            process.exit(1);
        }

    } finally {
        await conn.end();
    }
}

if (require.main === module) {
    purgeStagingData().catch(err => {
        console.error('❌ LỖI PURGE:', err.message);
        process.exit(1);
    });
}

module.exports = { purgeStagingData };
