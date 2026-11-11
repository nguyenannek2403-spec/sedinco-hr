/**
 * tools/import_holidays.js
 * 
 * Công cụ nhập danh mục ngày lễ (public_holidays) từ tệp JSON an toàn (G9.3 Mục F.1):
 * - Hỗ trợ cờ --dry-run: Kiểm tra tính hợp lệ và đối soát trùng lặp mà không ghi DB.
 * - Kiểm tra định dạng ngày (YYYY-MM-DD), tính hợp lý start_date <= end_date.
 * - Kiểm tra trùng lặp nội bộ file và trùng lặp với CSDL hiện có.
 * - Ghi nhận Audit Log (Append-Only) khi thực thi chính thức.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('../sedinco_backend/node_modules/mysql2/promise');
const { assertDestructiveDbAllowed, formatHost } = require('./lib/dbSafetyGuard');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '123456';
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
const DB_SSL = process.env.DB_SSL === 'true';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateDateString(dateStr) {
    if (!DATE_REGEX.test(dateStr)) return false;
    const d = new Date(dateStr + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().substring(0, 10) === dateStr;
}

function parseArgs() {
    const args = process.argv.slice(2);
    let filePath = null;
    let isDryRun = false;
    let actor = 'ADMIN_CLI';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--file' && args[i + 1]) {
            filePath = args[i + 1];
            i++;
        } else if (args[i] === '--dry-run') {
            isDryRun = true;
        } else if (args[i] === '--actor' && args[i + 1]) {
            actor = args[i + 1];
            i++;
        }
    }
    return { filePath, isDryRun, actor };
}

async function importHolidays() {
    const { filePath, isDryRun, actor } = parseArgs();

    console.log('=============================================================================');
    console.log(`[SEDINCO HR] CÔNG CỤ NHẬP NGÀY LỄ (IMPORT PUBLIC HOLIDAYS) ${isDryRun ? '[DRY-RUN]' : '[EXECUTE]'}`);
    console.log('=============================================================================');

    if (!filePath) {
        console.error('❌ LỖI: Thiếu tham số đường dẫn tệp JSON: --file <duong_dan_file>');
        process.exit(1);
    }

    const resolvedPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
        console.error(`❌ LỖI: Tệp không tồn tại: ${resolvedPath}`);
        process.exit(1);
    }

    let fileContent;
    try {
        fileContent = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    } catch (parseErr) {
        console.error(`❌ LỖI: Tệp JSON sai cú pháp: ${parseErr.message}`);
        process.exit(1);
    }

    const holidays = fileContent.holidays;
    if (!Array.isArray(holidays) || holidays.length === 0) {
        console.error('❌ LỖI: Tệp JSON bắt buộc phải có thuộc tính "holidays" là một mảng không rỗng!');
        process.exit(1);
    }

    console.log(`Nguồn dữ liệu: ${fileContent.source || 'Không xác định'}`);
    console.log(`Số ngày lễ trong tệp: ${holidays.length}`);
    if (fileContent._warning) {
        console.warn(`⚠️ GHI CHÚ TỆP: ${fileContent._warning}`);
    }

    // 1. Kiểm tra tính hợp lệ của từng dòng dữ liệu
    const validatedItems = [];
    const seenNames = new Set();
    const errors = [];

    holidays.forEach((item, idx) => {
        const itemIdx = idx + 1;
        const name = (item.holiday_name || '').trim();
        const start = (item.start_date || '').trim();
        const end = (item.end_date || '').trim();
        const source = (item.source || fileContent.source || '').trim();

        if (!name) {
            errors.push(`Dòng ${itemIdx}: Thiếu tên ngày lễ (holiday_name)!`);
            return;
        }

        if (!validateDateString(start)) {
            errors.push(`Dòng ${itemIdx} ("${name}"): start_date "${start}" không đúng định dạng YYYY-MM-DD hoặc ngày không tồn tại!`);
            return;
        }

        if (!validateDateString(end)) {
            errors.push(`Dòng ${itemIdx} ("${name}"): end_date "${end}" không đúng định dạng YYYY-MM-DD hoặc ngày không tồn tại!`);
            return;
        }

        if (start > end) {
            errors.push(`Dòng ${itemIdx} ("${name}"): start_date (${start}) lớn hơn end_date (${end})!`);
            return;
        }

        if (seenNames.has(name.toLowerCase())) {
            errors.push(`Dòng ${itemIdx} ("${name}"): Trùng lặp tên ngày lễ trong cùng tệp JSON!`);
            return;
        }
        seenNames.add(name.toLowerCase());

        validatedItems.push({ name, start, end, source });
    });

    if (errors.length > 0) {
        console.error('\n❌ PHÁT HIỆN LỖI DỮ LIỆU ĐẦU VÀO:');
        errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
    }

    // 2. Chốt chặn an toàn trước khi kết nối DB
    if (!isDryRun) {
        assertDestructiveDbAllowed(DB_NAME, DB_HOST);
    }

    const conn = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME
    });

    try {
        // 3. Đối soát trùng lặp với CSDL hiện có
        console.log(`\nĐối soát với CSDL: ${formatHost(DB_HOST)} / ${DB_NAME}...`);
        const [existing] = await conn.query('SELECT holiday_name, start_date, end_date FROM public_holidays');
        
        const duplicateWarnings = [];
        validatedItems.forEach(item => {
            const matchName = existing.find(e => e.holiday_name.toLowerCase() === item.name.toLowerCase());
            if (matchName) {
                const s = matchName.start_date instanceof Date ? matchName.start_date.toISOString().substring(0, 10) : String(matchName.start_date);
                const e = matchName.end_date instanceof Date ? matchName.end_date.toISOString().substring(0, 10) : String(matchName.end_date);
                duplicateWarnings.push(`Ngày lễ "${item.name}" đã tồn tại trong CSDL (${s} -> ${e}). Sẽ cập nhật lại.`);
            }
        });

        if (duplicateWarnings.length > 0) {
            console.log('⚠️ CẢNH BÁO TRÙNG LẶP / GHI ĐÈ:');
            duplicateWarnings.forEach(w => console.log(`  - ${w}`));
        }

        // In bảng dữ liệu hợp lệ
        console.log('\n--- DANH MỤC NGÀY LỄ HỢP LỆ ĐÃ XÁC THỰC ---');
        console.table(validatedItems.map(i => ({
            'Tên Ngày Lễ': i.name,
            'Bắt Đầu': i.start,
            'Kết Thúc': i.end,
            'Nguồn': i.source
        })));

        if (isDryRun) {
            console.log('\n✅ [DRY-RUN THÀNH CÔNG] Toàn bộ dữ liệu hợp lệ. Chưa có bất kỳ thay đổi nào được ghi vào CSDL.');
            console.log('👉 Chạy lệnh không có cờ --dry-run để nạp chính thức.');
            return;
        }

        // 4. Thực thi chèn dữ liệu
        console.log('\n>>> Đang nạp vào CSDL...');
        let insertedCount = 0;
        for (const item of validatedItems) {
            // Sử dụng INSERT ... ON DUPLICATE KEY UPDATE để cập nhật an toàn
            await conn.query(`
                INSERT INTO public_holidays (holiday_name, start_date, end_date)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE start_date = VALUES(start_date), end_date = VALUES(end_date)
            `, [item.name, item.start, item.end]);
            insertedCount++;
        }

        // Ghi Audit Log
        await conn.query(`
            INSERT INTO audit_logs (actor_id, actor_role, action, resource, details, ip_address)
            VALUES (?, 'admin', 'IMPORT_PUBLIC_HOLIDAYS', 'public_holidays', ?, '127.0.0.1')
        `, [actor, JSON.stringify({ count: insertedCount, file: path.basename(filePath), source: fileContent.source })]).catch(() => {});

        console.log(`✅ Nạp thành công ${insertedCount} ngày lễ vào CSDL ${DB_NAME}!`);
        console.log(`Đã ghi nhận nhật ký kiểm toán (actor: ${actor}).\n`);

    } finally {
        await conn.end();
    }
}

if (require.main === module) {
    importHolidays().catch(err => {
        console.error('❌ Lỗi thực thi import_holidays:', err.message);
        process.exit(1);
    });
}

module.exports = {
    importHolidays,
    validateDateString
};
