const app = require('./app');
const env = require('./config/env');
const { pool, dbConfig } = require('./config/db');
const { initDatabase } = require('./database/initDb');

const REQUIRED_TABLES = [
    'employees',
    'company_settings',
    'attendance',
    'attendance_logs',
    'requests',
    'public_holidays',
    'admins',
    'period_locks',
    'accountant_permissions',
    'audit_logs',
    'dynamic_qr_sessions',
    'ot_registrations',
    'kiosk_devices',
    'login_rate_limits'
];

async function verifySchemaReadiness(conn) {
    const [rows] = await conn.promise().query('SHOW TABLES');
    const existingTables = rows.map(r => Object.values(r)[0].toLowerCase());
    const missingTables = REQUIRED_TABLES.filter(t => !existingTables.includes(t.toLowerCase()));
    if (missingTables.length > 0) {
        console.error('=============================================================================');
        console.error(`❌ [LỖI KHỞI ĐỘNG CSDL] THIẾU BẢNG BẮT BUỘC TRÊN MÔI TRƯỜNG ${String(env.NODE_ENV).toUpperCase()}`);
        console.error(`   Các bảng còn thiếu (${missingTables.length}/${REQUIRED_TABLES.length}): ${missingTables.join(', ')}`);
        console.error('👉 Runtime App User chạy bằng tài khoản DML (Zero Runtime DDL) không có quyền tạo bảng.');
        console.error('👉 Vui lòng sử dụng tài khoản Migration để chạy script nạp schema trước khi khởi động:');
        console.error('   NODE_ENV=staging node scripts/migrate_staging_schema.js');
        console.error('=============================================================================');
        process.exit(1);
    }
    console.log(`✅ [ZERO DDL] CSDL hợp lệ: Đủ ${REQUIRED_TABLES.length}/${REQUIRED_TABLES.length} bảng quan hệ. Không thực thi DDL runtime.`);
}

// Kiểm tra kết nối ban đầu tới MySQL Pool
pool.getConnection(async (err, conn) => {
    if (err) {
        console.error('❌ Lỗi kết nối MySQL Pool:', err.message);
        return;
    }
    console.log(`✅ Đã kết nối MySQL Pool thành công (${dbConfig.host}:${dbConfig.port}/${dbConfig.database})!`);
    
    if (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') {
        try {
            await verifySchemaReadiness(conn);
        } catch (verifyErr) {
            console.error('❌ Lỗi kiểm tra schema:', verifyErr.message);
            conn.release();
            process.exit(1);
        }
        conn.release();
    } else {
        conn.release();
        initDatabase();
    }
});

const server = app.listen(env.PORT, () => {
    console.log(`🚀 Sedinco HR Backend API đang chạy tại cổng ${env.PORT} [${env.NODE_ENV}]`);
});

module.exports = server;
