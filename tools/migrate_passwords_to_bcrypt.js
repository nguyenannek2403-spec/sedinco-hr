/**
 * tools/migrate_passwords_to_bcrypt.js
 * 
 * Script di trú mật khẩu plaintext sang bcrypt hash cho Sedinco HR
 * Áp dụng Đề xuất 5 (Đã duyệt): bcrypt + must_change_password
 * 
 * Chế độ an toàn:
 * - CHỈ CHẠY TRÊN CƠ SỞ DỮ LIỆU TEST LOCAL (DB_NAME chứa "test")
 * - Cờ --dry-run: Chỉ kiểm tra và in thống kê, KHÔNG thay đổi DB
 * - Cờ --backup: Tự động sao lưu thông tin tài khoản ra file JSON trước khi hash
 * - Cờ --execute: Thực hiện cập nhật thực tế vào DB
 * - Cờ --rollback --file=<backup_file.json>: Khôi phục mật khẩu từ file backup
 */

const fs = require('fs');
const path = require('path');
const mysql = require(path.join(__dirname, '../sedinco_backend/node_modules/mysql2/promise'));
const { hashPassword, isBcryptHash, isDefaultPassword } = require('../sedinco_backend/src/utils/passwordHelper');

process.env.NODE_ENV = 'test';

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const doBackup = args.includes('--backup');
const doExecute = args.includes('--execute');
const doRollback = args.includes('--rollback');
const fileArg = args.find(a => a.startsWith('--file='));
const rollbackFilePath = fileArg ? fileArg.split('=')[1] : null;

async function rollback(connection, backupPath) {
    if (!backupPath || !fs.existsSync(backupPath)) {
        throw new Error(`File backup không tồn tại: ${backupPath}`);
    }
    const raw = fs.readFileSync(backupPath, 'utf8');
    const data = JSON.parse(raw);

    console.log(`\n⏪ BẮT ĐẦU ROLLBACK TỪ FILE: ${backupPath}`);
    console.log(`Thời điểm tạo backup: ${data.timestamp} | CSDL: ${data.db_name}`);

    let empRestored = 0;
    if (Array.isArray(data.employees)) {
        for (const emp of data.employees) {
            await connection.query('UPDATE employees SET password = ? WHERE ma_nv = ?', [emp.password, emp.ma_nv]);
            empRestored++;
        }
    }

    let admRestored = 0;
    if (Array.isArray(data.admins)) {
        for (const adm of data.admins) {
            await connection.query('UPDATE admins SET password = ? WHERE username = ?', [adm.password, adm.username]);
            admRestored++;
        }
    }

    console.log(`✅ ROLLBACK THÀNH CÔNG: Đã khôi phục ${empRestored} nhân viên và ${admRestored} admin về mật khẩu ban đầu.\n`);
}

async function migratePasswords() {
    console.log(`================================================================`);
    console.log(`🔐 BẮT ĐẦU QUÁ TRÌNH DI TRÚ MẬT KHẨU SANG BCRYPT HASH`);
    console.log(`Mục tiêu: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);
    console.log(`Chế độ: ${doRollback ? '⏪ ROLLBACK' : (isDryRun ? '🔍 DRY-RUN (Chỉ quét, không sửa DB)' : (doExecute ? '⚡ EXECUTE (Cập nhật thực tế)' : '⚠️ Cần thêm cờ'))}`);
    console.log(`Sao lưu: ${doBackup ? '✅ Có sao lưu ra file JSON' : '❌ Không yêu cầu sao lưu'}`);
    console.log(`================================================================\n`);

    // Chốt chặn an toàn tuyệt đối
    if (!DB_NAME.toLowerCase().includes('test')) {
        throw new Error(`[CHỐT CHẶN AN TOÀN] Từ chối thực thi: Tên CSDL "${DB_NAME}" không chứa chữ "test"!`);
    }
    if (DB_HOST.includes('aivencloud.com') || DB_HOST.includes('render.com')) {
        throw new Error(`[CHỐT CHẶN AN TOÀN] Từ chối thực thi: Máy chủ DB "${DB_HOST}" là môi trường Cloud/Production!`);
    }

    if (!isDryRun && !doExecute && !doRollback) {
        console.log(`💡 Lưu ý: Vui lòng chạy lệnh với một trong các cờ:`);
        console.log(`   --dry-run             : Xem trước các bản ghi cần chuyển đổi`);
        console.log(`   --execute             : Tiến hành cập nhật thực tế vào DB`);
        console.log(`   --backup              : Sao lưu bảng mật khẩu trước khi di trú`);
        console.log(`   --rollback --file=... : Khôi phục dữ liệu từ file backup JSON`);
        process.exit(0);
    }

    const connection = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME
    });

    try {
        if (doRollback) {
            await rollback(connection, rollbackFilePath);
            return;
        }

        const startTime = Date.now();

        // 1. Quét bảng employees
        console.log(`1. Đang quét bảng employees...`);
        const [employees] = await connection.query('SELECT ma_nv, ho_ten, password, role, must_change_password FROM employees');
        
        let empTotal = employees.length;
        let empAlreadyHashed = 0;
        let empNeedMigration = 0;
        let empDefaultCount = 0;
        const empMigrationList = [];

        for (const emp of employees) {
            if (isBcryptHash(emp.password)) {
                empAlreadyHashed++;
            } else {
                empNeedMigration++;
                const isDefault = isDefaultPassword(emp.password);
                if (isDefault) empDefaultCount++;
                empMigrationList.push({
                    ma_nv: emp.ma_nv,
                    ho_ten: emp.ho_ten,
                    oldPassword: emp.password,
                    must_change_password: isDefault ? 1 : (emp.must_change_password || 0)
                });
            }
        }

        console.log(`   - Tổng số nhân viên: ${empTotal}`);
        console.log(`   - Đã băm bcrypt: ${empAlreadyHashed}`);
        console.log(`   - Cần di trú: ${empNeedMigration} (trong đó ${empDefaultCount} dùng mật khẩu mặc định)`);

        // 2. Quét bảng admins
        console.log(`\n2. Đang quét bảng admins...`);
        const [admins] = await connection.query('SELECT username, ho_ten, password, must_change_password FROM admins');
        
        let admTotal = admins.length;
        let admAlreadyHashed = 0;
        let admNeedMigration = 0;
        let admDefaultCount = 0;
        const admMigrationList = [];

        for (const adm of admins) {
            if (isBcryptHash(adm.password)) {
                admAlreadyHashed++;
            } else {
                admNeedMigration++;
                const isDefault = isDefaultPassword(adm.password);
                if (isDefault) admDefaultCount++;
                admMigrationList.push({
                    username: adm.username,
                    ho_ten: adm.ho_ten,
                    oldPassword: adm.password,
                    must_change_password: isDefault ? 1 : (adm.must_change_password || 0)
                });
            }
        }

        console.log(`   - Tổng số admin: ${admTotal}`);
        console.log(`   - Đã băm bcrypt: ${admAlreadyHashed}`);
        console.log(`   - Cần di trú: ${admNeedMigration} (trong đó ${admDefaultCount} dùng mật khẩu mặc định)`);

        // 3. Sao lưu nếu được yêu cầu
        if (doBackup) {
            const backupDir = path.join(__dirname, '../reports/backup');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            const backupFile = path.join(backupDir, `passwords_backup_${Date.now()}.json`);
            const backupData = {
                timestamp: new Date().toISOString(),
                db_name: DB_NAME,
                employees: employees.map(e => ({ ma_nv: e.ma_nv, password: e.password })),
                admins: admins.map(a => ({ username: a.username, password: a.password }))
            };
            fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf-8');
            console.log(`\n💾 Đã sao lưu dữ liệu mật khẩu ra: ${backupFile}`);
        }

        // 4. Thực thi cập nhật nếu doExecute
        if (doExecute) {
            console.log(`\n3. Đang cập nhật cơ sở dữ liệu...`);

            // Cập nhật employees
            let empUpdated = 0;
            for (const item of empMigrationList) {
                const newHash = hashPassword(item.oldPassword);
                await connection.query(
                    'UPDATE employees SET password = ?, must_change_password = ? WHERE ma_nv = ?',
                    [newHash, item.must_change_password, item.ma_nv]
                );
                empUpdated++;
            }
            console.log(`   ✅ Đã cập nhật ${empUpdated} nhân viên sang bcrypt.`);

            // Cập nhật admins
            let admUpdated = 0;
            for (const item of admMigrationList) {
                const newHash = hashPassword(item.oldPassword);
                await connection.query(
                    'UPDATE admins SET password = ?, must_change_password = ? WHERE username = ?',
                    [newHash, item.must_change_password, item.username]
                );
                admUpdated++;
            }
            console.log(`   ✅ Đã cập nhật ${admUpdated} admin sang bcrypt.`);
        } else if (isDryRun) {
            console.log(`\n[DRY RUN] Không có thay đổi nào được ghi vào cơ sở dữ liệu.`);
        }

        const elapsedMs = Date.now() - startTime;
        console.log(`\n================================================================`);
        console.log(`📊 TỔNG KẾT QUÁ TRÌNH DI TRÚ:`);
        console.log(`- Trạng thái: ${isDryRun ? 'DRY RUN HOÀN TẤT' : 'DI TRÚ THÀNH CÔNG'}`);
        console.log(`- Thời gian thực thi: ${elapsedMs}ms`);
        console.log(`- Tổng nhân viên đã bcrypt: ${isDryRun ? empAlreadyHashed : empTotal}`);
        console.log(`- Tổng admin đã bcrypt: ${isDryRun ? admAlreadyHashed : admTotal}`);
        console.log(`================================================================`);

    } finally {
        await connection.end();
    }
}

migratePasswords().catch(err => {
    console.error(`❌ Lỗi di trú mật khẩu:`, err.message);
    process.exit(1);
});
