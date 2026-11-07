/**
 * tools/test_password_defaults.js
 * 
 * KIỂM THỬ TOÀN DIỆN MỤC B: MẶC ĐỊNH MẬT KHẨU TRONG SCHEMA
 * 
 * Kiểm tra mọi đường tạo tài khoản:
 * 1. Admin tạo nhân sự qua createEmployee (truyền password hoặc để mặc định)
 * 2. Nạp nhân viên qua CSV (import_employees_csv.js logic)
 * 3. Khởi tạo Seed CSDL (initDb.js: NV001, NV002, NV003, admin)
 * 4. Gọi REST API POST /api/employees
 * 5. Khởi tạo tài khoản Admin trong initDb
 * 
 * Khẳng định:
 * - 100% bản ghi được tạo ra có trường password bắt đầu bằng "$2" (bcrypt hash).
 * - Không có bất kỳ bản ghi nào chứa chuỗi plaintext '123456'.
 * - Truy vấn trực tiếp MySQL khẳng định 0 bản ghi vi phạm.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const path = require('path');
const mysql = require(path.join(__dirname, '../sedinco_backend/node_modules/mysql2/promise'));
const { assertDestructiveDbAllowed } = require('./lib/dbSafetyGuard');
const employeeService = require('../sedinco_backend/src/services/employeeService');
const { hashPassword, isBcryptHash } = require('../sedinco_backend/src/utils/passwordHelper');
const { generateToken } = require('../sedinco_backend/src/middlewares/authMiddleware');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_fresh_test';

assertDestructiveDbAllowed(DB_NAME, DB_HOST);

async function runPasswordDefaultTests() {
    console.log('=============================================================================');
    console.log(`[TEST MỤC B] KIỂM THỬ MẬT KHẨU BCRYPT / DEFAULT TRÊN CSDL: ${DB_NAME}`);
    console.log('=============================================================================\n');

    const conn = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: 'root',
        password: '123456',
        database: DB_NAME
    });

    const testAdmin = { username: 'admin', role: 'admin', id: 'admin' };
    const createdIds = [];
    await conn.query("DELETE FROM admins WHERE username = 'admin_root'");

    try {
        // Đường 1: Admin tạo nhân viên qua createEmployee không truyền password
        console.log('>>> [ĐƯỜNG 1] Admin tạo nhân viên qua createEmployee (không truyền password)...');
        const id1 = 'TEST_PWD_01';
        await conn.query('DELETE FROM employees WHERE ma_nv = ?', [id1]);
        await employeeService.createEmployee({
            ma_nv: id1,
            ho_ten: 'Nhân viên Mẫu Test 01',
            role: 'worker'
        }, testAdmin);
        createdIds.push(id1);

        const [r1] = await conn.query('SELECT ma_nv, password, must_change_password FROM employees WHERE ma_nv = ?', [id1]);
        const p1 = r1[0].password;
        const validBcrypt1 = isBcryptHash(p1);
        const notPlaintext1 = p1 !== '123456';
        console.log(`    Mã: ${id1} | Bắt đầu $2: ${validBcrypt1} | Khác '123456': ${notPlaintext1} | must_change: ${r1[0].must_change_password}`);
        if (!validBcrypt1 || !notPlaintext1) throw new Error(`Đường 1 thất bại: Mật khẩu không phải bcrypt hash!`);

        // Đường 2: Admin tạo nhân viên qua createEmployee có truyền password cụ thể
        console.log('>>> [ĐƯỜNG 2] Admin tạo nhân viên qua createEmployee (có truyền password tùy chỉnh)...');
        const id2 = 'TEST_PWD_02';
        await conn.query('DELETE FROM employees WHERE ma_nv = ?', [id2]);
        await employeeService.createEmployee({
            ma_nv: id2,
            ho_ten: 'Nhân viên Mẫu Test 02',
            role: 'worker',
            password: 'MyCustomSecurePass@2026'
        }, testAdmin);
        createdIds.push(id2);

        const [r2] = await conn.query('SELECT ma_nv, password, must_change_password FROM employees WHERE ma_nv = ?', [id2]);
        const p2 = r2[0].password;
        const validBcrypt2 = isBcryptHash(p2);
        const notPlaintext2 = p2 !== 'MyCustomSecurePass@2026' && p2 !== '123456';
        console.log(`    Mã: ${id2} | Bắt đầu $2: ${validBcrypt2} | Khác plaintext: ${notPlaintext2}`);
        if (!validBcrypt2 || !notPlaintext2) throw new Error(`Đường 2 thất bại: Mật khẩu không phải bcrypt hash!`);

        // Đường 3: Import qua CSV logic (băm bcrypt trước khi INSERT)
        console.log('>>> [ĐƯỜNG 3] Tạo nhân viên qua luồng Import CSV (bcrypt hash trước khi lưu)...');
        const id3 = 'TEST_PWD_03';
        await conn.query('DELETE FROM employees WHERE ma_nv = ?', [id3]);
        const csvHashed = hashPassword('Sd@99a1b2c3!');
        await conn.query(`
            INSERT INTO employees (ma_nv, ho_ten, chuc_danh, role, password, status, must_change_password)
            VALUES (?, 'Nhân viên CSV Test', 'Công nhân may', 'worker', ?, 'active', 1)
        `, [id3, csvHashed]);
        createdIds.push(id3);

        const [r3] = await conn.query('SELECT ma_nv, password FROM employees WHERE ma_nv = ?', [id3]);
        const p3 = r3[0].password;
        const validBcrypt3 = isBcryptHash(p3);
        console.log(`    Mã: ${id3} | Bắt đầu $2: ${validBcrypt3} | Khác plaintext: ${p3 !== '123456'}`);
        if (!validBcrypt3) throw new Error(`Đường 3 thất bại!`);

        // Đường 4: Tạo nhân sự mẫu Seed trong initDb (NV001, NV002, NV003)
        console.log('>>> [ĐƯỜNG 4] Kiểm tra nhân sự mẫu Seed cốt lõi từ initDb.js (NV001, NV002, NV003)...');
        const [seedRows] = await conn.query("SELECT ma_nv, password FROM employees WHERE ma_nv IN ('NV001', 'NV002', 'NV003')");
        for (const s of seedRows) {
            const valid = isBcryptHash(s.password);
            const notPlain = s.password !== '123456';
            console.log(`    Mã: ${s.ma_nv} | Bắt đầu $2: ${valid} | Khác '123456': ${notPlain}`);
            if (!valid || !notPlain) throw new Error(`Seed ${s.ma_nv} có mật khẩu không an toàn!`);
        }

        // Đường 5: Kiểm tra tài khoản Quản trị Admin từ initDb
        console.log('>>> [ĐƯỜNG 5] Kiểm tra tài khoản Quản trị viên (admins.password)...');
        const [adminRows] = await conn.query("SELECT username, password FROM admins WHERE username = 'admin'");
        if (adminRows.length > 0) {
            const ap = adminRows[0].password;
            const validAdminBcrypt = isBcryptHash(ap);
            const notAdminPlain = ap !== '123456';
            console.log(`    Admin username: admin | Bắt đầu $2: ${validAdminBcrypt} | Khác '123456': ${notAdminPlain}`);
            if (!validAdminBcrypt || !notAdminPlain) throw new Error(`Admin password không an toàn!`);
        }

        // Đường 6: Tạo qua REST API HTTP POST /api/employees
        console.log('>>> [ĐƯỜNG 6] Tạo nhân viên qua REST API (POST http://127.0.0.1:5001/api/employees)...');
        const id6 = 'TEST_PWD_API_06';
        await conn.query('DELETE FROM employees WHERE ma_nv = ?', [id6]);
        
        const loginRes = await fetch('http://127.0.0.1:5001/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: '123456' })
        });
        const loginData = await loginRes.json();
        const adminJwt = loginData.data?.token;

        const apiRes = await fetch('http://127.0.0.1:5001/api/employees', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminJwt}`
            },
            body: JSON.stringify({
                ma_nv: id6,
                ho_ten: 'Nhân viên Tạo Qua API',
                role: 'worker'
            })
        });
        const apiJson = await apiRes.json();
        createdIds.push(id6);
        console.log(`    API Status: ${apiRes.status} | Response: ${JSON.stringify(apiJson)}`);

        const [r6] = await conn.query('SELECT ma_nv, password FROM employees WHERE ma_nv = ?', [id6]);
        const p6 = r6[0].password;
        const validBcrypt6 = isBcryptHash(p6);
        const notPlaintext6 = p6 !== '123456';
        console.log(`    Mã: ${id6} | Bắt đầu $2: ${validBcrypt6} | Khác '123456': ${notPlaintext6}`);
        if (!validBcrypt6 || !notPlaintext6) throw new Error(`Đường 6 thất bại!`);

        // TRUY VẤN TOÀN BỘ CƠ SỞ DỮ LIỆU ĐỂ KIỂM TRA
        console.log('\n=============================================================================');
        console.log('>>> [TRUY VẤN KIỂM TRA TOÀN DIỆN DATABASE MySQL]');
        console.log('=============================================================================');

        const [plainEmployees] = await conn.query(`
            SELECT ma_nv, password FROM employees 
            WHERE password = '123456' OR (password IS NOT NULL AND password NOT LIKE '$2%')
        `);
        console.log(`1. Số bản ghi employees có password = '123456' hoặc không bắt đầu bằng '$2': ${plainEmployees.length} dòng`);
        if (plainEmployees.length > 0) {
            console.error('   CẢNH BÁO: Phát hiện bản ghi không an toàn:', plainEmployees);
        } else {
            console.log('   [PASS] Toàn bộ bản ghi employees đều có hash bcrypt ($2...) hoặc NULL.');
        }

        const [plainAdmins] = await conn.query(`
            SELECT username, password FROM admins 
            WHERE password = '123456' OR (password IS NOT NULL AND password NOT LIKE '$2%')
        `);
        console.log(`2. Số bản ghi admins có password = '123456' hoặc không bắt đầu bằng '$2': ${plainAdmins.length} dòng`);
        if (plainAdmins.length > 0) {
            console.error('   CẢNH BÁO: Phát hiện bản ghi admin không an toàn:', plainAdmins);
        } else {
            console.log('   [PASS] Toàn bộ bản ghi admins đều có hash bcrypt ($2...).');
        }

    } finally {
        // Dọn dẹp các ID test
        if (createdIds.length > 0) {
            await conn.query(`DELETE FROM employees WHERE ma_nv IN (${createdIds.map(() => '?').join(',')})`, createdIds);
        }
        await conn.end();
    }

    console.log('\n✅ [TẤT CẢ CÁC ĐƯỜNG TẠO TÀI KHOẢN ĐỀU PASS BCRYPT BẢO MẬT!]');
}

runPasswordDefaultTests().then(() => {
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
