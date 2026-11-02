/**
 * tools/verify_dml_user_runtime.js
 * 
 * Mục đích: Chứng minh ứng dụng hoạt động bình thường với tài khoản chỉ có DML
 * theo script scripts/grant_staging_app_user.sql trên database sedinco_hr_test.
 * Kiểm tra:
 *  1. Tạo và cấp quyền Least Privilege cho app_dml_test theo grant_staging_app_user.sql
 *  2. Kết nối bằng app_dml_test (chỉ DML)
 *  3. Khởi động / Kiểm tra cấu hình hệ thống
 *  4. Luồng 1: Đăng nhập (SELECT employees, INSERT/UPDATE login_rate_limits, INSERT audit_logs)
 *  5. Luồng 2: Chấm công (INSERT attendance_logs, INSERT dynamic_qr_sessions, INSERT attendance)
 *  6. Luồng 3: Đơn từ (INSERT requests, UPDATE requests)
 *  7. Luồng 4: Chốt công (INSERT/UPDATE period_locks)
 *  8. Chặn DDL: Cố tình chạy DROP TABLE -> Bị từ chối
 *  9. Chặn sửa/xóa audit_logs: Cố tình chạy DELETE/UPDATE audit_logs -> Bị từ chối
 * 10. Dọn dẹp tài khoản test
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT || 3306;
const DB_NAME = 'sedinco_hr_test';
const ROOT_USER = process.env.DB_USER || 'root';
const ROOT_PASS = process.env.DB_PASSWORD || '123456';

const DML_USER = 'app_dml_test';
const DML_PASS = 'TestDml_SecurePass_2026';
const DML_HOST = '127.0.0.1';

async function main() {
    console.log('[XÁC MINH DML RUNTIME] Bắt đầu kiểm chứng Least Privilege App User trên DB test...');

    // Bước 1: Kết nối bằng quyền root để áp dụng grant_staging_app_user.sql
    const rootConn = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        database: DB_NAME,
        user: ROOT_USER,
        password: ROOT_PASS,
        multipleStatements: true
    });
    console.log('[ROOT] Kết nối DB thành công. Chuẩn bị chạy scripts/grant_staging_app_user.sql');

    const grantSqlTemplate = fs.readFileSync(path.join(__dirname, '../scripts/grant_staging_app_user.sql'), 'utf-8');
    const renderedSql = grantSqlTemplate
        .replace(/\$\{DB_NAME\}/g, DB_NAME)
        .replace(/\$\{APP_USER\}/g, DML_USER)
        .replace(/\$\{APP_HOST\}/g, DML_HOST)
        .replace(/\$\{APP_PASSWORD\}/g, DML_PASS);

    // Loại bỏ tất cả comment dạng -- ...
    const sqlWithoutComments = renderedSql
        .split('\n')
        .map(line => line.trim().startsWith('--') ? '' : line)
        .join('\n');

    const statements = sqlWithoutComments
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    for (const stmt of statements) {
        await rootConn.query(stmt);
    }
    console.log(`[ROOT] Đã cấp quyền Least Privilege thành công cho user: '${DML_USER}'@'${DML_HOST}'`);
    await rootConn.end();

    // Bước 2: Tạo kết nối độc lập hoàn toàn bằng DML_USER
    console.log(`\n[DML_USER] Kết nối DB bằng tài khoản runtime '${DML_USER}'@'${DML_HOST}'...`);
    const dmlConn = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        database: DB_NAME,
        user: DML_USER,
        password: DML_PASS
    });
    console.log('[DML_USER] Kết nối thành công! Bắt đầu kiểm tra các luồng nghiệp vụ chính:');

    // Bước 3: Khởi động / Đọc cấu hình công ty (SELECT)
    const [settings] = await dmlConn.query('SELECT * FROM company_settings LIMIT 1');
    console.log(`[PASS] Khởi động ứng dụng: Đọc company_settings thành công (Số dòng: ${settings.length})`);

    // Bước 4: Luồng Đăng nhập (SELECT + INSERT/UPDATE rate_limits + INSERT audit_logs)
    const testMaNv = 'DML_TEST_01';
    await dmlConn.query(`
        INSERT INTO employees (ma_nv, ho_ten, chuc_danh, password, role, status)
        VALUES (?, 'DML Test Worker', 'CongNhan', '$2b$10$abcdefghijklmnopqrstuu', 'worker', 'ACTIVE')
        ON DUPLICATE KEY UPDATE ho_ten = VALUES(ho_ten)
    `, [testMaNv]);
    
    // Ghi nhận rate limits
    await dmlConn.query(`
        INSERT INTO login_rate_limits (key_name, target_type, identifier, attempt_count, first_attempt, last_attempt)
        VALUES ('ip:127.0.0.1', 'IP', '127.0.0.1', 1, NOW(), NOW())
        ON DUPLICATE KEY UPDATE attempt_count = attempt_count + 1, last_attempt = NOW()
    `);

    // Ghi audit log
    await dmlConn.query(`
        INSERT INTO audit_logs (actor_id, actor_role, action, resource, details, ip_address)
        VALUES (?, 'worker', 'LOGIN_ATTEMPT', 'auth', '{"status":"success","user_agent":"verify_dml"}', '127.0.0.1')
    `, [testMaNv]);
    console.log('[PASS] Luồng 1 - Đăng nhập: Đọc/ghi user, rate limit và audit_logs thành công');

    // Bước 5: Luồng Chấm công (INSERT attendance_logs, INSERT dynamic_qr_sessions, INSERT attendance)
    const sessionToken = 'dml_qr_session_' + Date.now();
    await dmlConn.query(`
        INSERT INTO dynamic_qr_sessions (session_token, expires_at, created_at)
        VALUES (?, DATE_ADD(NOW(), INTERVAL 1 MINUTE), NOW())
    `, [sessionToken]);

    await dmlConn.query(`
        INSERT INTO attendance_logs (employee_id, record_date, check_in_time, check_in_method, status)
        VALUES (?, CURDATE(), NOW(), 'QR', 'VALID')
    `, [testMaNv]);

    await dmlConn.query(`
        INSERT INTO attendance (ma_nv, thang, nam, cong_chuan, cong_chinh_thuc)
        VALUES (?, 11, 2026, 26, 1)
        ON DUPLICATE KEY UPDATE cong_chinh_thuc = VALUES(cong_chinh_thuc)
    `, [testMaNv]);
    console.log('[PASS] Luồng 2 - Chấm công: Ghi nhận dynamic QR, attendance_logs, attendance thành công');

    // Bước 6: Luồng Đơn từ (INSERT requests, UPDATE requests)
    const [reqRes] = await dmlConn.query(`
        INSERT INTO requests (employee_id, request_type, request_date, reason, status)
        VALUES (?, 'LEAVE', CURDATE(), 'Nghi phep DML test', 'PENDING')
    `, [testMaNv]);
    const reqId = reqRes.insertId;

    await dmlConn.query(`
        UPDATE requests SET status = 'APPROVED'
        WHERE id = ?
    `, [reqId]);
    console.log(`[PASS] Luồng 3 - Đơn từ: Tạo đơn (ID: ${reqId}) và phê duyệt đơn thành công`);

    // Bước 7: Luồng Chốt công (INSERT/UPDATE period_locks)
    await dmlConn.query(`
        INSERT INTO period_locks (month, year, is_locked, locked_by, locked_at, reason)
        VALUES (11, 2026, 1, 'ACCOUNTANT_01', NOW(), 'Chot cong test DML')
        ON DUPLICATE KEY UPDATE is_locked = 1, locked_at = NOW()
    `);
    console.log('[PASS] Luồng 4 - Chốt công: Khóa kỳ công 11/2026 thành công');

    // Bước 8: Kiểm chứng CHẶN DDL (DROP TABLE)
    console.log('\n[KIỂM CHỨNG BẢO MẬT] Thử nghiệm thực thi DDL trái phép bằng tài khoản DML...');
    let ddlBlocked = false;
    try {
        await dmlConn.query('DROP TABLE public_holidays');
    } catch (err) {
        if (err.code === 'ER_TABLEACCESS_DENIED_ERROR' || err.code === 'ER_SPECIFIC_ACCESS_DENIED_ERROR') {
            ddlBlocked = true;
            console.log(`[PASS - BẢO MẬT] MySQL đã từ chối DDL DROP TABLE chính xác: [${err.code}] ${err.sqlMessage}`);
        } else {
            console.error(`[CẢNH BÁO] Lỗi không mong muốn: ${err.message}`);
        }
    }
    if (!ddlBlocked) {
        throw new Error('FAIL: Tài khoản DML lại có thể thực thi DDL DROP TABLE!');
    }

    // Bước 9: Kiểm chứng CHẶN UPDATE/DELETE trên audit_logs (Append-Only)
    console.log('\n[KIỂM CHỨNG BẢO MẬT] Thử nghiệm UPDATE / DELETE trên bảng audit_logs...');
    let auditUpdateBlocked = false;
    try {
        await dmlConn.query('UPDATE audit_logs SET action = "TAMPERED" WHERE actor_id = ?', [testMaNv]);
    } catch (err) {
        if (err.code === 'ER_TABLEACCESS_DENIED_ERROR' || err.code === 'ER_COLUMNACCESS_DENIED_ERROR') {
            auditUpdateBlocked = true;
            console.log(`[PASS - BẢO MẬT] MySQL đã từ chối UPDATE audit_logs chính xác: [${err.code}] ${err.sqlMessage}`);
        }
    }
    if (!auditUpdateBlocked) {
        throw new Error('FAIL: Tài khoản DML lại có thể UPDATE bảng audit_logs!');
    }

    let auditDeleteBlocked = false;
    try {
        await dmlConn.query('DELETE FROM audit_logs WHERE actor_id = ?', [testMaNv]);
    } catch (err) {
        if (err.code === 'ER_TABLEACCESS_DENIED_ERROR' || err.code === 'ER_COLUMNACCESS_DENIED_ERROR') {
            auditDeleteBlocked = true;
            console.log(`[PASS - BẢO MẬT] MySQL đã từ chối DELETE audit_logs chính xác: [${err.code}] ${err.sqlMessage}`);
        }
    }
    if (!auditDeleteBlocked) {
        throw new Error('FAIL: Tài khoản DML lại có thể DELETE bảng audit_logs!');
    }

    // Bước 10: Dọn dẹp dữ liệu test và tài khoản test
    await dmlConn.query('DELETE FROM requests WHERE id = ?', [reqId]);
    await dmlConn.query('DELETE FROM dynamic_qr_sessions WHERE session_token = ?', [sessionToken]);
    await dmlConn.query('DELETE FROM attendance WHERE ma_nv = ?', [testMaNv]);
    await dmlConn.query('DELETE FROM attendance_logs WHERE employee_id = ?', [testMaNv]);
    await dmlConn.query('DELETE FROM employees WHERE ma_nv = ?', [testMaNv]);
    await dmlConn.end();

    const cleanupConn = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        database: DB_NAME,
        user: ROOT_USER,
        password: ROOT_PASS
    });
    // Xóa record test trong audit_logs bằng root để sạch sẽ
    await cleanupConn.query('DELETE FROM audit_logs WHERE actor_id = ?', [testMaNv]);
    await cleanupConn.query(`DROP USER '${DML_USER}'@'${DML_HOST}'`);
    await cleanupConn.end();

    console.log(`\n[HOÀN TẤT] Đã dọn dẹp dữ liệu test và xóa tài khoản test '${DML_USER}'.`);
    console.log('[KẾT LUẬN] Tài khoản chỉ có quyền DML vận hành trơn tru mọi luồng chính và được chốt chặn DDL/Audit bất biến.');
}

main().catch(err => {
    console.error('[THẤT BẠI]', err);
    process.exit(1);
});
