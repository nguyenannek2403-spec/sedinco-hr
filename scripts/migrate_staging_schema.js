/**
 * scripts/migrate_staging_schema.js
 * 
 * Script nạp Schema DDL cho CSDL Staging an toàn (G9.1 Mục B.1):
 * - Đọc DB_NAME từ biến môi trường.
 * - Tuyệt đối không chứa câu lệnh USE, CREATE DATABASE, DROP DATABASE.
 * - Có chốt chặn an toàn: Tên DB bắt buộc chứa "test", từ chối database production (sedinco_hr).
 * - Sử dụng tài khoản Migration (có quyền DDL).
 */

const mysql = require('../sedinco_backend/node_modules/mysql2/promise');
const path = require('path');
const fs = require('fs');

// Môi trường an toàn: mặc định test nếu không chỉ định, tránh nạp .env
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
if (process.env.NODE_ENV === 'staging') {
    const dotenv = require('../sedinco_backend/node_modules/dotenv');
    const stagingPath = path.resolve(__dirname, '../.env.staging');
    if (fs.existsSync(stagingPath)) {
        dotenv.config({ path: stagingPath, quiet: true });
    }
} else if (process.env.NODE_ENV === 'test') {
    const dotenv = require('../sedinco_backend/node_modules/dotenv');
    const testPath = path.resolve(__dirname, '../sedinco_backend/.env.test');
    if (fs.existsSync(testPath)) {
        dotenv.config({ path: testPath, quiet: true });
    }
}

const { assertDestructiveDbAllowed, maskString, formatHost } = require('../tools/lib/dbSafetyGuard');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
const DB_SSL = process.env.DB_SSL === 'true';

async function runStagingMigration() {
    console.log('=============================================================================');
    console.log('[SEDINCO HR] MIGRATION SCHEMA DDL CHO CSDL STAGING AN TOÀN');
    console.log('=============================================================================');

    // 1. Chốt chặn an toàn
    assertDestructiveDbAllowed(DB_NAME, DB_HOST);

    console.log(`Kết nối máy chủ: ${formatHost(DB_HOST)} | CSDL: ${DB_NAME}`);

    const connectionConfig = {
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        multipleStatements: true
    };
    if (DB_SSL) {
        connectionConfig.ssl = { rejectUnauthorized: false };
    }

    const conn = await mysql.createConnection(connectionConfig);

    try {
        console.log('>>> [1/3] Kiểm tra quyền DDL trên CSDL...');
        await conn.query(`CREATE TABLE IF NOT EXISTS __migration_check_g9 (id INT PRIMARY KEY)`);
        await conn.query(`DROP TABLE IF EXISTS __migration_check_g9`);
        console.log('    Quyền DDL: HỢP LỆ (Tài khoản Migration có quyền tạo/xóa bảng)');

        console.log('>>> [2/3] Thực thi nạp / cập nhật cấu trúc schema (Zero USE, Zero CREATE DATABASE)...');
        
        // Gọi initDatabase để khởi tạo 14 bảng và các cột bổ sung
        const { initDatabase } = require('../sedinco_backend/src/database/initDb');
        await initDatabase();

        console.log('>>> [3/3] Kiểm đếm danh mục bảng sau migration...');
        const [tables] = await conn.query('SHOW TABLES');
        const tableNames = tables.map(r => Object.values(r)[0]);
        console.log(`    Tổng số bảng hiện hữu: ${tableNames.length}`);
        console.log(`    Danh sách bảng: ${tableNames.join(', ')}`);

        if (tableNames.length < 13) {
            throw new Error(`Số lượng bảng sau migration (${tableNames.length}) không đạt chuẩn tối thiểu!`);
        }

        console.log('\n✅ MIGRATION SCHEMA STAGING HOÀN TẤT THÀNH CÔNG VỚI CHỐT CHẶN AN TOÀN!');
        console.log('=============================================================================');

    } finally {
        await conn.end();
        try {
            const { pool } = require('../sedinco_backend/src/config/db');
            if (pool && pool.end) {
                await new Promise((res) => pool.end(res));
            }
        } catch (e) {}
    }
}

if (require.main === module) {
    runStagingMigration().catch(err => {
        console.error('❌ LỖI MIGRATION:', err.message);
        process.exit(1);
    });
}

module.exports = { runStagingMigration };
