/**
 * scripts/create_initial_admin.js
 * 
 * Script khởi tạo tài khoản Quản trị viên (Admin) đầu tiên cho môi trường Staging/Production:
 * - Chỉ tạo khi bảng admins chưa có tài khoản nào.
 * - Mật khẩu:
 *   + Sinh ngẫu nhiên >= 16 ký tự, in MỘT LẦN ra terminal, không ghi log/file, must_change_password = 1.
 *   + Hoặc đọc từ biến môi trường ADMIN_INITIAL_PASSWORD nếu có (không in lại).
 * - Sử dụng bcrypt băm an toàn (cost factor 10).
 * - Ghi nhận Audit Log hệ thống (Append-Only).
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const mysql = require('../sedinco_backend/node_modules/mysql2/promise');
const bcrypt = require('../sedinco_backend/node_modules/bcryptjs');

// Nạp biến môi trường phù hợp
process.env.NODE_ENV = process.env.NODE_ENV || 'staging';
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

const { maskString, formatHost } = require('./lib/dbSafetyGuard');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '123456';
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
const DB_SSL = process.env.DB_SSL === 'true';

async function createInitialAdmin() {
    console.log('=============================================================================');
    console.log('[SEDINCO HR] KHỞI TẠO TÀI KHOẢN QUẢN TRỊ VIÊN ĐẦU TIÊN (INITIAL ADMIN)');
    console.log('=============================================================================');
    console.log(`Kết nối máy chủ: ${formatHost(DB_HOST)} | CSDL: ${DB_NAME}`);

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

    try {
        // 1. Kiểm tra số lượng admin hiện có
        const [rows] = await conn.query('SELECT COUNT(*) as cnt FROM admins');
        const adminCount = rows[0]?.cnt || 0;

        if (adminCount > 0) {
            console.error(`❌ [TỪ CHỐI] Bảng admins đã có ${adminCount} tài khoản quản trị!`);
            console.error('👉 Script này chỉ được phép chạy khi hệ thống chưa có tài khoản Admin nào.');
            process.exit(1);
        }

        // 2. Xác định mật khẩu ban đầu
        let rawPassword = '';
        let isRandomGenerated = false;

        if (process.env.ADMIN_INITIAL_PASSWORD && process.env.ADMIN_INITIAL_PASSWORD.trim().length >= 8) {
            rawPassword = process.env.ADMIN_INITIAL_PASSWORD.trim();
            console.log('🔒 Mật khẩu được nạp từ biến môi trường ADMIN_INITIAL_PASSWORD (được che bảo mật, không hiển thị lại).');
        } else {
            // Sinh ngẫu nhiên >= 16 ký tự đủ tiêu chuẩn
            const randBytes = crypto.randomBytes(12).toString('base64url');
            rawPassword = `${randBytes}!A9z`;
            isRandomGenerated = true;
        }

        // 3. Băm mật khẩu bằng bcrypt
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        // 4. Chèn tài khoản Admin với must_change_password = 1
        await conn.query(`
            INSERT INTO admins (username, password, ho_ten, must_change_password)
            VALUES (?, ?, ?, 1)
        `, ['admin', hashedPassword, 'Giám đốc Điều hành']);

        // 5. Ghi nhận Audit Log
        await conn.query(`
            INSERT INTO audit_logs (actor_id, actor_role, action, resource, details, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            'SYSTEM_INIT',
            'admin',
            'CREATE_INITIAL_ADMIN',
            'admins',
            JSON.stringify({ username: 'admin', must_change_password: 1, method: isRandomGenerated ? 'random_generated' : 'env_var' }),
            '127.0.0.1'
        ]).catch(() => {});

        console.log('\n✅ Tạo tài khoản Quản trị viên đầu tiên thành công!');
        console.log('-----------------------------------------------------------------------------');
        console.log('Tên tài khoản: admin');
        console.log('Vai trò:       Quản trị viên tối cao (admin)');
        console.log('Cờ bảo mật:    must_change_password = 1 (Bắt buộc đổi mật khẩu ở lần đăng nhập đầu)');
        
        if (isRandomGenerated) {
            console.log('-----------------------------------------------------------------------------');
            console.log('🔑 MẬT KHẨU TẠM THỜI (CHỈ XUẤT HIỆN MỘT LẦN DUY NHẤT TRÊN TERMINAL NÀY):');
            console.log(`   ${rawPassword}`);
            console.log('-----------------------------------------------------------------------------');
            console.log('⚠️  LƯU Ý QUAN TRỌNG: Hãy sao chép và lưu trữ mật khẩu trên vào trình quản lý mật');
            console.log('    khẩu an toàn ngay bây giờ. Mật khẩu KHÔNG được lưu trữ dưới dạng thô ở bất kỳ file/log nào.');
        }
        console.log('=============================================================================\n');

    } finally {
        await conn.end();
    }
}

if (require.main === module) {
    createInitialAdmin().catch(err => {
        console.error('❌ Lỗi khởi tạo admin:', err.message);
        process.exit(1);
    });
}

module.exports = {
    createInitialAdmin
};
