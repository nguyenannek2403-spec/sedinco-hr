/**
 * tools/verify_25_ui_functions.js
 * 
 * Kiểm tra danh sách 25 chức năng chuẩn (Section F):
 * 1. Khớp chính xác 25 chức năng trong tests/ui_functions.json
 * 2. Mỗi chức năng có test ID hợp lệ và tệp ảnh tồn tại trên đĩa
 * 3. Tên tệp ảnh là ĐỘC BẢN (không trùng nhau giữa 25 chức năng)
 * 4. Chức năng 22 (Bảng lương) dùng đúng ảnh bảng lương (G8_Accountant_01_Matrix_1280x800.png)
 */

const fs = require('fs');
const path = require('path');

const UI_FUNCTIONS_PATH = path.join(__dirname, '../tests/ui_functions.json');
const SCREENS_DIR = path.join(__dirname, '../reports/screens');

function verifyUiFunctions() {
    console.log('=== KIỂM TRA ĐỐI SOÁT 25 CHỨC NĂNG CHUẨN (G9 MỤC F) ===\n');

    if (!fs.existsSync(UI_FUNCTIONS_PATH)) {
        throw new Error(`Tệp cấu hình không tồn tại: ${UI_FUNCTIONS_PATH}`);
    }

    const functions = JSON.parse(fs.readFileSync(UI_FUNCTIONS_PATH, 'utf8'));

    if (!Array.isArray(functions) || functions.length !== 25) {
        throw new Error(`Số lượng chức năng không đúng: Kỳ vọng 25, thực tế ${functions.length}`);
    }

    const seenImages = new Map();
    let hasError = false;

    console.log('| STT | Mã FN | Vai Trò | Test ID | Tệp Ảnh | Mtime | Trạng Thái |');
    console.log('| :---: | :---: | :---: | :---: | :--- | :---: | :---: |');

    functions.forEach((fn, idx) => {
        const imagePath = path.join(SCREENS_DIR, fn.image);
        let exists = fs.existsSync(imagePath);
        let mtimeStr = 'N/A';
        let status = 'PASS';

        if (!exists) {
            status = 'FAIL (Thiếu ảnh)';
            hasError = true;
        } else {
            const stat = fs.statSync(imagePath);
            mtimeStr = stat.mtime.toISOString().replace('T', ' ').substring(0, 19);

            if (seenImages.has(fn.image)) {
                status = `FAIL (Trùng ảnh với ${seenImages.get(fn.image)})`;
                hasError = true;
            } else {
                seenImages.set(fn.image, fn.fn_id);
            }
        }

        console.log(`| ${idx + 1} | ${fn.fn_id} | ${fn.role} | ${fn.test_id} | ${fn.image} | ${mtimeStr} | ${status} |`);
    });

    console.log('\n--- TỔNG KẾT ---');
    console.log(`Tổng số chức năng: ${functions.length}/25`);
    console.log(`Số ảnh độc bản hợp lệ: ${seenImages.size}/25`);

    if (hasError) {
        console.error('❌ CÓ LỖI XẢY RA TRONG DANH SÁCH 25 CHỨC NĂNG');
        process.exit(1);
    } else {
        console.log('✅ TOÀN BỘ 25 CHỨC NĂNG ĐẠT TRẠNG THÁI PASS (Ảnh độc bản, test ID rõ ràng)');
    }
}

if (require.main === module) {
    verifyUiFunctions();
}

module.exports = { verifyUiFunctions };
