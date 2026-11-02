/**
 * tools/import_employees_csv.js
 * 
 * Script nạp danh sách nhân viên từ CSV vào Sedinco HR phục vụ giai đoạn Pilot.
 * 
 * CÁC QUY TẮC BẢO MẬT & VẬN HÀNH:
 * 1. Hỗ trợ cờ --dry-run: Chỉ kiểm tra cú pháp, trường dữ liệu, trùng lặp mà KHÔNG ghi CSDL.
 * 2. Kiểm tra trùng ma_nv (trong file CSV và trong CSDL).
 * 3. Chuẩn hóa đúng 3 Role: 'worker', 'accountant', 'admin'.
 * 4. Băm mật khẩu ban đầu bằng bcrypt, bắt buộc gán must_change_password = 1.
 * 5. TUYỆT ĐỐI KHÔNG IN / LƯU MẬT KHẨU VÀO LOG HOẶC CONSOLE.
 * 6. Ghi nhận audit log khi thực hiện nạp thật.
 * 
 * Cách dùng:
 *   node tools/import_employees_csv.js --file data/employees_pilot.csv --dry-run
 *   node tools/import_employees_csv.js --file data/employees_pilot.csv --default-password "Sedinco@2026"
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('../sedinco_backend/node_modules/mysql2/promise');
const bcrypt = require('../sedinco_backend/node_modules/bcryptjs');

// Nạp cấu hình môi trường
require('../sedinco_backend/node_modules/dotenv').config({
    path: process.env.NODE_ENV === 'test'
        ? path.join(__dirname, '../sedinco_backend/.env.test')
        : path.join(__dirname, '../sedinco_backend/.env')
});

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT || 3306;
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASSWORD || '123456';

// Phân tích tham số CLI
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const fileArgIdx = args.indexOf('--file');
const pwdArgIdx = args.indexOf('--default-password');
const useRandomPasswords = args.includes('--random-passwords') || pwdArgIdx === -1;

const filePath = fileArgIdx !== -1 && args[fileArgIdx + 1] ? args[fileArgIdx + 1] : path.join(__dirname, '../data/employees_sample_pilot.csv');
const initialPassword = pwdArgIdx !== -1 && args[pwdArgIdx + 1] ? args[pwdArgIdx + 1] : null;

function parseCsv(content) {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
        throw new Error('File CSV không hợp lệ hoặc không có dữ liệu (cần ít nhất dòng tiêu đề và 1 dòng dữ liệu).');
    }
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        // Tách CSV cơ bản theo dấu phẩy, xử lý dấu ngoặc kép
        const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g;
        let match;
        const row = [];
        while ((match = regex.exec(lines[i])) !== null) {
            let val = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2];
            row.push(val ? val.trim() : '');
        }
        if (row.length >= headers.length) {
            const rowObj = {};
            headers.forEach((h, idx) => {
                rowObj[h] = row[idx] || '';
            });
            rows.push({ lineIndex: i + 1, data: rowObj });
        }
    }
    return { headers, rows };
}

async function run() {
    console.log('=============================================================================');
    console.log(`[SEDINCO HR] CÔNG CỤ NẠP NHÂN VIÊN CSV (PILOT IMPORT)`);
    console.log(`- Tập tin CSV: ${filePath}`);
    console.log(`- Chế độ: ${isDryRun ? 'DRY-RUN (CHỈ KIỂM TRA, KHÔNG GHI CSDL)' : 'THỰC THI THẬT (GHI CSDL)'}`);
    console.log(`- Database mục tiêu: ${DB_NAME}@${DB_HOST}:${DB_PORT}`);
    console.log(`- Mật khẩu khởi tạo: ${useRandomPasswords ? 'Sinh ngẫu nhiên bảo mật riêng từng người (Một lần)' : `[ĐÃ CHE - ĐỘ DÀI: ${initialPassword ? initialPassword.length : 0} KÝ TỰ]`}`);
    console.log('=============================================================================\n');

    if (!fs.existsSync(filePath)) {
        throw new Error(`Không tìm thấy file CSV tại đường dẫn: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const { headers, rows } = parseCsv(content);

    console.log(`[CSV] Đã đọc ${rows.length} dòng dữ liệu nhân viên. Đang thẩm tra tính hợp lệ...`);

    const validRoles = new Set(['worker', 'accountant', 'admin']);
    const seenMaNvInFile = new Set();
    const errors = [];
    const warnings = [];
    const validRecords = [];

    // Kết nối CSDL để kiểm tra trùng trong DB
    const pool = await mysql.createPool({
        host: DB_HOST,
        port: DB_PORT,
        database: DB_NAME,
        user: DB_USER,
        password: DB_PASS,
        waitForConnections: true,
        connectionLimit: 5
    });

    const [existingRows] = await pool.query('SELECT ma_nv FROM employees');
    const existingDbMaNv = new Set(existingRows.map(r => r.ma_nv));

    for (const { lineIndex, data } of rows) {
        const ma_nv = data.ma_nv ? data.ma_nv.trim() : '';
        const ho_ten = data.ho_ten ? data.ho_ten.trim() : '';
        const chuc_danh = data.chuc_danh ? data.chuc_danh.trim() : 'Công nhân';
        const role = data.role ? data.role.trim().toLowerCase() : 'worker';
        const dien_thoai = data.dien_thoai ? data.dien_thoai.trim() : null;
        const email = data.email ? data.email.trim() : null;
        const luong_cb = parseFloat(data.luong_cb) || 0;

        // 1. Kiểm tra trường bắt buộc
        if (!ma_nv) {
            errors.push(`Dòng ${lineIndex}: Thiếu mã nhân viên (ma_nv).`);
            continue;
        }
        if (!ho_ten) {
            errors.push(`Dòng ${lineIndex}: Thiếu họ tên cho nhân viên [${ma_nv}].`);
            continue;
        }

        // 2. Kiểm tra role
        if (!validRoles.has(role)) {
            errors.push(`Dòng ${lineIndex}: Vai trò không hợp lệ '${role}' cho nhân viên [${ma_nv}]. Chỉ chấp nhận: worker, accountant, admin.`);
            continue;
        }

        // 3. Kiểm tra trùng trong file
        if (seenMaNvInFile.has(ma_nv)) {
            errors.push(`Dòng ${lineIndex}: Mã nhân viên [${ma_nv}] bị trùng lặp ngay trong file CSV.`);
            continue;
        }
        seenMaNvInFile.add(ma_nv);

        // 4. Kiểm tra trùng trong DB
        const isExistedInDb = existingDbMaNv.has(ma_nv);

        // 5. Cảnh báo thử việc thiếu ngay_chinh_thuc (Mục E - P1)
        const empStatus = data.status ? data.status.trim().toLowerCase() : 'active';
        const ngay_chinh_thuc = data.ngay_chinh_thuc ? data.ngay_chinh_thuc.trim() : null;
        if ((empStatus === 'probation' || chuc_danh.toLowerCase().includes('thử việc')) && !ngay_chinh_thuc) {
            warnings.push(`Dòng ${lineIndex}: Nhân viên [${ma_nv}] - ${ho_ten} đang ở trạng thái/chức danh THỬ VIỆC nhưng THIẾU ngay_chinh_thuc. Nếu không bổ sung, hệ thống sẽ tính 100% lương thay vì hệ số thử việc 85%!`);
        }

        validRecords.push({
            lineIndex,
            isExistedInDb,
            ma_nv,
            ho_ten,
            chuc_danh,
            role,
            dien_thoai,
            email,
            luong_cb
        });
    }

    console.log(`\n[KẾT QUẢ KIỂM TRA]`);
    console.log(`- Tổng số dòng: ${rows.length}`);
    console.log(`- Số dòng hợp lệ: ${validRecords.length}`);
    console.log(`- Số dòng lỗi: ${errors.length}`);
    console.log(`- Số cảnh báo: ${warnings.length}`);
    if (warnings.length > 0) {
        console.log(`\nDANH SÁCH CẢNH BÁO (WARNINGS):`);
        warnings.forEach(w => console.log(`  ⚠️  ${w}`));
    }
    if (errors.length > 0) {
        console.log(`\nDANH SÁCH LỖI:`);
        errors.forEach(e => console.log(`  ❌ ${e}`));
    }

    const newRecords = validRecords.filter(r => !r.isExistedInDb);
    const updateRecords = validRecords.filter(r => r.isExistedInDb);
    console.log(`- Bản ghi mới sẽ thêm: ${newRecords.length}`);
    console.log(`- Bản ghi trùng sẽ cập nhật (ON DUPLICATE KEY): ${updateRecords.length}`);

    if (isDryRun) {
        console.log(`\n[DRY-RUN HOÀN TẤT] Không có thay đổi nào được ghi vào CSDL.`);
        await pool.end();
        return;
    }

    if (errors.length > 0) {
        console.log(`\n[CẢNH BÁO] Phát hiện ${errors.length} lỗi trong file CSV. Bạn cần khắc phục trước khi nạp dữ liệu thật!`);
        await pool.end();
        process.exit(1);
    }

    // Thực hiện nạp thật
    console.log(`\n[TIẾN HÀNH NẠP THỰC TẾ] Đang tạo mật khẩu và băm bcrypt an toàn...`);
    
    let insertedCount = 0;
    let updatedCount = 0;
    const distributionList = [];

    for (const rec of validRecords) {
        // Sinh mật khẩu riêng cho từng nhân viên hoặc dùng mật khẩu được chỉ định
        const oneTimePass = useRandomPasswords 
            ? 'Sd@' + crypto.randomBytes(4).toString('hex') + '!' 
            : initialPassword;

        const hashedPass = await bcrypt.hash(oneTimePass, 10);

        const [res] = await pool.query(`
            INSERT INTO employees (
                ma_nv, ho_ten, chuc_danh, role, dien_thoai, email, luong_cb,
                password, status, must_change_password
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1)
            ON DUPLICATE KEY UPDATE
                ho_ten = VALUES(ho_ten),
                chuc_danh = VALUES(chuc_danh),
                role = VALUES(role),
                dien_thoai = VALUES(dien_thoai),
                email = VALUES(email),
                luong_cb = VALUES(luong_cb)
        `, [
            rec.ma_nv, rec.ho_ten, rec.chuc_danh, rec.role, rec.dien_thoai, rec.email, rec.luong_cb,
            hashedPass
        ]);

        if (res.affectedRows === 1) {
            insertedCount++;
        } else if (res.affectedRows === 2) {
            updatedCount++;
        }

        distributionList.push({
            ma_nv: rec.ma_nv,
            ho_ten: rec.ho_ten,
            chuc_danh: rec.chuc_danh,
            role: rec.role,
            initial_password: oneTimePass
        });
    }

    // Xuất file bàn giao thông tin đăng nhập riêng biệt có phân quyền 0600
    const distributionFilePath = path.join(__dirname, '../data/pilot_credentials_distribution.csv');
    const csvLines = ['ma_nv,ho_ten,chuc_danh,role,initial_password,status,note'];
    for (const d of distributionList) {
        csvLines.push(`"${d.ma_nv}","${d.ho_ten}","${d.chuc_danh}","${d.role}","${d.initial_password}","CHUA_BAN_GIAO","Yeu cau doi mat khau ngay lan dau"`);
    }
    fs.writeFileSync(distributionFilePath, '\uFEFF' + csvLines.join('\n'), { mode: 0o600 });

    // Ghi audit log
    await pool.query(`
        INSERT INTO audit_logs (actor_id, actor_role, action, resource, details, ip_address)
        VALUES ('SYSTEM_ADMIN', 'admin', 'IMPORT_EMPLOYEES_CSV', 'employees', ?, '127.0.0.1')
    `, [JSON.stringify({
        total_rows: rows.length,
        inserted: insertedCount,
        updated: updatedCount,
        file: path.basename(filePath),
        use_random_passwords: useRandomPasswords,
        distribution_file: 'pilot_credentials_distribution.csv'
    })]);

    console.log(`\n[THÀNH CÔNG] Đã nạp thành công dữ liệu nhân viên:`);
    console.log(`  + Nhân viên mới thêm: ${insertedCount}`);
    console.log(`  + Nhân viên cập nhật thông tin: ${updatedCount}`);
    console.log(`  + Toàn bộ nhân viên mới có: must_change_password = 1`);
    console.log(`  + Mật khẩu khởi tạo ngẫu nhiên riêng cho từng người: ${useRandomPasswords ? 'CÓ (ĐÃ BẢO MẬT)' : 'KHÔNG'}`);
    console.log(`  + File phân phối thông tin đăng nhập: ${distributionFilePath} (chmod 0600)`);
    console.log(`  + Đã ghi nhận lịch sử vào bảng audit_logs.`);
    console.log(`\nLƯU Ý QUAN TRỌNG: Mật khẩu ban đầu được lưu riêng biệt tại file phân phối an toàn (đã ignore khỏi git). Quản trị viên bàn giao trực tiếp hoặc qua phong bì niêm phong cho từng công nhân.`);

    await pool.end();
}

run().catch(err => {
    console.error('[THẤT BẠI]', err);
    process.exit(1);
});
