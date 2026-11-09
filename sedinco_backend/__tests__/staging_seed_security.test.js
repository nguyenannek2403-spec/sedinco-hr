/**
 * sedinco_backend/__tests__/staging_seed_security.test.js
 * 
 * Kiểm thử nghiệp vụ Mục A.3:
 * 1. Migrate DB trống với NODE_ENV=staging -> employees = 0, admins = 0, public_holidays = 0
 * 2. Khởi tạo admin ban đầu bằng createInitialAdmin -> admins = 1
 * 3. bcrypt.compare với '123456' = false
 * 4. Đăng nhập admin với '123456' bị từ chối (success: false)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
const DB_NAME = 'sedinco_hr_staging_test';

describe('G9.3 - Mục A.3: Kiểm thử Seed & Mật khẩu Admin Môi Trường Staging', () => {
    let conn;

    before(async () => {
        conn = await mysql.createConnection({
            host: DB_HOST,
            port: DB_PORT,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_NAME,
            multipleStatements: true
        });

        // Làm sạch DB về trạng thái trống
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        const [tables] = await conn.query('SHOW TABLES');
        for (const r of tables) {
            const tbl = Object.values(r)[0];
            await conn.query(`DROP TABLE IF EXISTS \`${tbl}\``);
        }
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    });

    after(async () => {
        if (conn) await conn.end();
    });

    it('TC-G9-SEED-01: Migrate DB trống với NODE_ENV=staging không được seed nhân viên, admin hay ngày lễ', async () => {
        const originalEnv = process.env.NODE_ENV;
        const originalDb = process.env.DB_NAME;
        const originalAllow = process.env.ALLOW_DESTRUCTIVE_DB;
        const originalJwt = process.env.JWT_SECRET;

        try {
            process.env.NODE_ENV = 'staging';
            process.env.DB_NAME = DB_NAME;
            process.env.ALLOW_DESTRUCTIVE_DB = DB_NAME;
            process.env.JWT_SECRET = 'sedinco_super_secure_jwt_secret_key_2026_test_min_32_chars!';

            // Đóng pool hiện tại nếu có
            try {
                const oldDb = require('../src/config/db');
                if (oldDb.pool && oldDb.pool.end) {
                    await new Promise(r => oldDb.pool.end(r));
                }
            } catch (e) {}

            delete require.cache[require.resolve('../src/config/env')];
            delete require.cache[require.resolve('../src/config/db')];
            delete require.cache[require.resolve('../src/database/initDb')];

            const { initDatabase } = require('../src/database/initDb');
            await initDatabase();

            // Kiểm đếm
            const [empRows] = await conn.query('SELECT COUNT(*) as cnt FROM employees');
            assert.equal(empRows[0].cnt, 0, 'Số lượng nhân viên sau migrate staging phải bằng 0!');

            const [adminRows] = await conn.query('SELECT COUNT(*) as cnt FROM admins');
            assert.equal(adminRows[0].cnt, 0, 'Số lượng admin sau migrate staging phải bằng 0!');

            const [holidaysRows] = await conn.query('SELECT COUNT(*) as cnt FROM public_holidays');
            assert.equal(holidaysRows[0].cnt, 0, 'Số lượng ngày lễ sau migrate staging phải bằng 0!');

            // Bảng cấu hình công ty vẫn có nhưng tọa độ mẫu được bảo toàn
            const [companyRows] = await conn.query('SELECT COUNT(*) as cnt FROM company_settings');
            assert.equal(companyRows[0].cnt, 1, 'company_settings phải được tạo mặc định');

        } finally {
            process.env.NODE_ENV = originalEnv;
            process.env.DB_NAME = originalDb;
            process.env.ALLOW_DESTRUCTIVE_DB = originalAllow;
            process.env.JWT_SECRET = originalJwt;
        }
    });

    it('TC-G9-SEED-02: Chạy createInitialAdmin tạo admin đầu tiên với mật khẩu an toàn và must_change_password=1', async () => {
        const originalEnv = process.env.NODE_ENV;
        const originalDb = process.env.DB_NAME;
        const originalAllow = process.env.ALLOW_DESTRUCTIVE_DB;

        try {
            process.env.NODE_ENV = 'staging';
            process.env.DB_NAME = DB_NAME;
            process.env.ALLOW_DESTRUCTIVE_DB = DB_NAME;

            delete require.cache[require.resolve('../../scripts/create_initial_admin')];
            const { createInitialAdmin } = require('../../scripts/create_initial_admin');
            await createInitialAdmin();

            const [adminRows] = await conn.query('SELECT username, password, must_change_password FROM admins WHERE username = "admin"');
            assert.equal(adminRows.length, 1, 'Bảng admins phải có chính xác 1 tài khoản admin');
            
            const admin = adminRows[0];
            assert.equal(admin.must_change_password, 1, 'Cờ must_change_password phải bằng 1');

            // Kiểm tra mật khẩu không được trùng 123456
            const isMatch123456 = bcrypt.compareSync('123456', admin.password);
            assert.equal(isMatch123456, false, 'Mật khẩu admin ban đầu không được trùng 123456!');

            // Kiểm tra không được trùng danh sách mật khẩu phổ biến
            const COMMON_PWDS = ['123456', '12345678', 'password', 'admin123', 'admin', 'root'];
            for (const pwd of COMMON_PWDS) {
                assert.equal(bcrypt.compareSync(pwd, admin.password), false, `Mật khẩu admin không được trùng '${pwd}'!`);
            }

        } finally {
            process.env.NODE_ENV = originalEnv;
            process.env.DB_NAME = originalDb;
            process.env.ALLOW_DESTRUCTIVE_DB = originalAllow;
        }
    });

    it('TC-G9-SEED-03: Đăng nhập admin với mật khẩu mặc định 123456 phải bị từ chối hoàn toàn', async () => {
        const originalEnv = process.env.NODE_ENV;
        const originalDb = process.env.DB_NAME;
        const originalJwt = process.env.JWT_SECRET;

        try {
            process.env.NODE_ENV = 'staging';
            process.env.DB_NAME = DB_NAME;
            process.env.JWT_SECRET = 'sedinco_super_secure_jwt_secret_key_2026_test_min_32_chars!';

            // Đóng pool hiện tại nếu có
            try {
                const oldDb = require('../src/config/db');
                if (oldDb.pool && oldDb.pool.end) {
                    await new Promise(r => oldDb.pool.end(r));
                }
            } catch (e) {}

            delete require.cache[require.resolve('../src/config/env')];
            delete require.cache[require.resolve('../src/config/db')];
            delete require.cache[require.resolve('../src/middlewares/authMiddleware')];
            delete require.cache[require.resolve('../src/services/authService')];

            const authService = require('../src/services/authService');
            const authSvcInstance = typeof authService.adminLogin === 'function' ? authService : new authService();

            const loginRes = await authSvcInstance.adminLogin('admin', '123456', '127.0.0.1');
            assert.equal(loginRes.success, false, 'Đăng nhập admin với 123456 phải thất bại!');

        } finally {
            process.env.NODE_ENV = originalEnv;
            process.env.DB_NAME = originalDb;
            process.env.JWT_SECRET = originalJwt;
        }
    });
});
