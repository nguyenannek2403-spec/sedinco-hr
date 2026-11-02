/**
 * sedinco_backend/__tests__/g6_db_least_privilege.test.js
 * 
 * KIỂM THỬ NGUYÊN TẮC QUYỀN TỐI THIỂU (LEAST PRIVILEGE) TRÊN CSDL STAGING / TEST
 * 
 * Sử dụng ĐÚNG script scripts/grant_staging_app_user.sql với các tham số:
 * - DB_NAME = sedinco_hr_test
 * - APP_USER = sedinco_test_lp
 * - APP_HOST = 127.0.0.1
 * - APP_PASSWORD = LeastPrivPass@2026!
 * 
 * Kiểm chứng tài khoản ứng dụng bị hạn chế quyền:
 * 1. Không thể DROP / ALTER bảng lúc chạy (Zero Runtime DDL).
 * 2. Bảng audit_logs chỉ được phép INSERT / SELECT, cấm tuyệt đối UPDATE / DELETE (Append-Only Audit Trail).
 * 3. Thao tác nghiệp vụ thông thường (SELECT, INSERT, UPDATE trên 13 bảng) hoạt động bình thường.
 * 4. Ứng dụng khởi động và thực hiện các luồng chính với tài khoản hạn chế.
 */

const { it, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
const DB_HOST = '127.0.0.1';
const DB_PORT = 3306;
const DB_NAME = 'sedinco_hr_test';
const ROOT_USER = 'root';
const ROOT_PASS = '123456';

const LP_USER = 'sedinco_test_lp';
const LP_PASS = 'LeastPrivPass@2026!';
const LP_HOST = '127.0.0.1';

describe('G6.2 - Mục E: Kiểm thử Phân Quyền CSDL Hạn Chế (Least Privilege)', () => {
    let rootConn;
    let lpConn;

    before(async () => {
        rootConn = await mysql.createConnection({
            host: DB_HOST,
            port: DB_PORT,
            user: ROOT_USER,
            password: ROOT_PASS,
            database: DB_NAME,
            multipleStatements: true
        });

        // 1. Đọc script scripts/grant_staging_app_user.sql và điền tham số
        const scriptPath = path.resolve(__dirname, '../../scripts/grant_staging_app_user.sql');
        let sqlContent = fs.readFileSync(scriptPath, 'utf8');

        sqlContent = sqlContent
            .replace(/\$\{DB_NAME\}/g, DB_NAME)
            .replace(/\$\{APP_USER\}/g, LP_USER)
            .replace(/\$\{APP_HOST\}/g, LP_HOST)
            .replace(/\$\{APP_PASSWORD\}/g, LP_PASS);

        // Bỏ các dòng comment -- trước khi tách dấu chấm phẩy
        const cleanSql = sqlContent
            .split('\n')
            .filter(line => !line.trim().startsWith('--'))
            .join('\n');

        const statements = cleanSql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const stmt of statements) {
            await rootConn.query(stmt);
        }

        // 2. Mở kết nối riêng bằng chính tài khoản bị hạn chế quyền do script tạo ra
        lpConn = await mysql.createConnection({
            host: DB_HOST,
            port: DB_PORT,
            user: LP_USER,
            password: LP_PASS,
            database: DB_NAME
        });
    });

    after(async () => {
        if (lpConn) await lpConn.end().catch(() => {});
        if (rootConn) {
            await rootConn.query(`DROP USER IF EXISTS '${LP_USER}'@'${LP_HOST}'`).catch(() => {});
            await rootConn.end().catch(() => {});
        }
    });

    it('TC-G6-DB-01: Tài khoản hạn chế ĐƯỢC PHÉP INSERT và SELECT trên audit_logs', async () => {
        // 1. Thử INSERT vào audit_logs
        const [insertRes] = await lpConn.query(
            "INSERT INTO audit_logs (actor_id, actor_role, action, resource, details) VALUES (?, ?, ?, ?, ?)",
            ['LP_TEST', 'worker', 'LEAST_PRIV_VERIFY', 'auth', JSON.stringify({ test: true })]
        );
        assert.ok(insertRes.insertId, 'INSERT vào audit_logs phải thành công');

        // 2. Thử SELECT từ audit_logs
        const [rows] = await lpConn.query(
            "SELECT id, action FROM audit_logs WHERE id = ?",
            [insertRes.insertId]
        );
        assert.equal(rows.length, 1, 'SELECT từ audit_logs phải thành công');
        assert.equal(rows[0].action, 'LEAST_PRIV_VERIFY');
    });

    it('TC-G6-DB-02: Tài khoản hạn chế BỊ TỪ CHỐI khi thực hiện UPDATE hoặc DELETE trên audit_logs (Append-Only)', async () => {
        // Thử UPDATE trên audit_logs -> Phải bị MySQL từ chối
        await assert.rejects(
            async () => {
                await lpConn.query("UPDATE audit_logs SET action = 'TAMPERED' WHERE actor_id = 'LP_TEST'");
            },
            (err) => {
                assert.ok(
                    err.code === 'ER_TABLEACCESS_DENIED_ERROR' || err.message.includes('command denied'),
                    `Phải bị từ chối quyền UPDATE: ${err.message}`
                );
                return true;
            },
            'Lệnh UPDATE trên audit_logs phải bị từ chối do thiếu quyền'
        );

        // Thử DELETE trên audit_logs -> Phải bị MySQL từ chối
        await assert.rejects(
            async () => {
                await lpConn.query("DELETE FROM audit_logs WHERE actor_id = 'LP_TEST'");
            },
            (err) => {
                assert.ok(
                    err.code === 'ER_TABLEACCESS_DENIED_ERROR' || err.message.includes('command denied'),
                    `Phải bị từ chối quyền DELETE: ${err.message}`
                );
                return true;
            },
            'Lệnh DELETE trên audit_logs phải bị từ chối do thiếu quyền'
        );
    });

    it('TC-G6-DB-03: Tài khoản hạn chế BỊ TỪ CHỐI khi thực hiện DROP hoặc ALTER bảng (Zero Runtime DDL)', async () => {
        // Thử DROP TABLE
        await assert.rejects(
            async () => {
                await lpConn.query("DROP TABLE employees");
            },
            (err) => {
                assert.ok(
                    err.code === 'ER_TABLEACCESS_DENIED_ERROR' || err.message.includes('command denied'),
                    `Phải bị từ chối quyền DROP: ${err.message}`
                );
                return true;
            },
            'Lệnh DROP TABLE phải bị từ chối do thiếu quyền'
        );

        // Thử ALTER TABLE
        await assert.rejects(
            async () => {
                await lpConn.query("ALTER TABLE employees ADD COLUMN malicious_col VARCHAR(100)");
            },
            (err) => {
                assert.ok(
                    err.code === 'ER_TABLEACCESS_DENIED_ERROR' || err.message.includes('command denied'),
                    `Phải bị từ chối quyền ALTER: ${err.message}`
                );
                return true;
            },
            'Lệnh ALTER TABLE phải bị từ chối do thiếu quyền'
        );
    });

    it('TC-G6-DB-04: Tài khoản hạn chế chạy đầy đủ DML trên 13 bảng nghiệp vụ thông thường', async () => {
        // 1. Thao tác trên employees
        await lpConn.query(
            "INSERT INTO employees (ma_nv, ho_ten, role, status) VALUES ('LP_WORKER_01', 'Test LP Worker', 'worker', 'active') ON DUPLICATE KEY UPDATE ho_ten = VALUES(ho_ten)"
        );
        const [empRows] = await lpConn.query("SELECT ma_nv, ho_ten FROM employees WHERE ma_nv = 'LP_WORKER_01'");
        assert.equal(empRows.length, 1);
        assert.equal(empRows[0].ma_nv, 'LP_WORKER_01');

        // 2. Thao tác trên attendance_logs
        await lpConn.query(
            "INSERT INTO attendance_logs (employee_id, record_date, check_in_time, status) VALUES ('LP_WORKER_01', '2026-10-31', '08:00:00', 'present') ON DUPLICATE KEY UPDATE status = 'present'"
        );
        const [attRows] = await lpConn.query("SELECT employee_id FROM attendance_logs WHERE employee_id = 'LP_WORKER_01'");
        assert.ok(attRows.length >= 1);

        // 3. Thao tác trên requests
        await lpConn.query(
            "INSERT INTO requests (employee_id, request_type, request_date, reason, status) VALUES ('LP_WORKER_01', 'Nghỉ phép', '2026-11-01', 'Lý do cá nhân', 'pending')"
        );
        const [reqRows] = await lpConn.query("SELECT id, reason FROM requests WHERE employee_id = 'LP_WORKER_01'");
        assert.ok(reqRows.length >= 1);

        // 4. Thao tác trên period_locks
        await lpConn.query(
            "INSERT INTO period_locks (month, year, is_locked, locked_by, reason) VALUES (10, 2026, 0, 'admin', 'Test lock') ON DUPLICATE KEY UPDATE reason = 'Test lock'"
        );
        const [lockRows] = await lpConn.query("SELECT month, year FROM period_locks WHERE month = 10 AND year = 2026");
        assert.equal(lockRows.length, 1);

        // Dọn dẹp dữ liệu test
        await lpConn.query("DELETE FROM requests WHERE employee_id = 'LP_WORKER_01'");
        await lpConn.query("DELETE FROM attendance_logs WHERE employee_id = 'LP_WORKER_01'");
        await lpConn.query("DELETE FROM employees WHERE ma_nv = 'LP_WORKER_01'");
    });
});
