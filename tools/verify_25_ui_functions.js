/**
 * tools/verify_25_ui_functions.js
 * 
 * KIỂM TRA ĐỐI SOÁT 25 CHỨC NĂNG UI CHUẨN (G9.3 MỤC G):
 * 1. Khớp chính xác 25 chức năng trong tests/ui_functions.json
 * 2. Tất cả test ID bắt buộc là Test ID Giao diện L3 thật (tiền tố TC-L3-UI-...)
 *    Tuyệt đối không chấp nhận test ID cấp đơn vị (TC-PAY, TC-ATT, TC-SEC, TC-EMP) hoặc cấp API.
 * 3. Tên tệp ảnh là ĐỘC BẢN (100% không trùng nhau giữa 25 chức năng)
 * 4. Tất cả tệp ảnh phải tồn tại trên đĩa và có thời gian tạo mới (mtime >= thời điểm bắt đầu lần chạy L3)
 */

const fs = require('fs');
const path = require('path');

const UI_FUNCTIONS_PATH = path.join(__dirname, '../tests/ui_functions.json');
const SCREENS_DIR = path.join(__dirname, '../reports/screens');
const START_TIME_FILE = path.join(SCREENS_DIR, '.l3_run_start');

function verifyUiFunctions(customFunctions = null, options = {}) {
    console.log('=== KIỂM TRA ĐỐI SOÁT 25 CHỨC NĂNG UI CHUẨN (G9.3 MỤC G) ===\n');

    let functions = customFunctions;
    if (!functions) {
        if (!fs.existsSync(UI_FUNCTIONS_PATH)) {
            throw new Error(`Tệp cấu hình không tồn tại: ${UI_FUNCTIONS_PATH}`);
        }
        functions = JSON.parse(fs.readFileSync(UI_FUNCTIONS_PATH, 'utf8'));
    }

    if (!Array.isArray(functions) || functions.length !== 25) {
        throw new Error(`Số lượng chức năng không đúng: Kỳ vọng 25, thực tế ${functions?.length}`);
    }

    // Đọc thời điểm bắt đầu chạy L3 nếu có
    let runStartTime = options.startTime || 0;
    if (!runStartTime && fs.existsSync(START_TIME_FILE)) {
        try {
            const raw = fs.readFileSync(START_TIME_FILE, 'utf8').trim();
            runStartTime = Number(raw) || 0;
        } catch (e) {}
    }

    const seenImages = new Map();
    let hasError = false;
    const errors = [];

    console.log('| STT | Mã FN | Vai Trò | Test ID | Tệp Ảnh | Mtime | Kiểm Tra Thời Gian | Trạng Thái |');
    console.log('| :---: | :---: | :---: | :---: | :--- | :---: | :---: | :---: |');

    functions.forEach((fn, idx) => {
        const imagePath = path.join(SCREENS_DIR, fn.image);
        let exists = fs.existsSync(imagePath);
        let mtimeStr = 'N/A';
        let status = 'PASS';
        let mtimeCheck = 'BỎ QUA';

        // 1. Kiểm tra tiền tố Test ID bắt buộc phải là TC-L3-UI-
        if (!fn.test_id || !fn.test_id.startsWith('TC-L3-UI-')) {
            status = `FAIL (Test ID không hợp lệ: ${fn.test_id} - Phải là TC-L3-UI-*)`;
            hasError = true;
            errors.push(`${fn.fn_id}: Test ID ${fn.test_id} không phải là test giao diện L3!`);
        }

        // 2. Kiểm tra tồn tại ảnh
        if (!exists) {
            status = 'FAIL (Thiếu ảnh)';
            hasError = true;
            errors.push(`${fn.fn_id}: Ảnh ${fn.image} không tồn tại trên đĩa!`);
        } else {
            const stat = fs.statSync(imagePath);
            mtimeStr = stat.mtime.toISOString().replace('T', ' ').substring(0, 19);

            // 3. Kiểm tra tính độc bản của tên ảnh
            if (seenImages.has(fn.image)) {
                status = `FAIL (Trùng ảnh với ${seenImages.get(fn.image)})`;
                hasError = true;
                errors.push(`${fn.fn_id}: Trùng ảnh với ${seenImages.get(fn.image)} (${fn.image})!`);
            } else {
                seenImages.set(fn.image, fn.fn_id);
            }

            // 4. Kiểm tra mtime >= bắt đầu lần chạy
            if (runStartTime > 0) {
                // Cho phép dung sai 1000ms do độ trễ ghi filesystem
                if (stat.mtimeMs < runStartTime - 1000) {
                    mtimeCheck = 'FAIL (< run start)';
                    status = `FAIL (Ảnh cũ từ lần chạy trước)`;
                    hasError = true;
                    errors.push(`${fn.fn_id}: Ảnh ${fn.image} có mtime (${mtimeStr}) nhỏ hơn thời điểm bắt đầu lần chạy!`);
                } else {
                    mtimeCheck = 'PASS (>= start)';
                }
            }
        }

        console.log(`| ${idx + 1} | ${fn.fn_id} | ${fn.role} | ${fn.test_id} | ${fn.image} | ${mtimeStr} | ${mtimeCheck} | ${status} |`);
    });

    console.log('\n--- TỔNG KẾT ĐỐI SOÁT 25 CHỨC NĂNG ---');
    console.log(`Tổng số chức năng: ${functions.length}/25`);
    console.log(`Số ảnh độc bản hợp lệ: ${seenImages.size}/25`);
    if (runStartTime > 0) {
        console.log(`Thời điểm mốc bắt đầu L3: ${new Date(runStartTime).toISOString().replace('T', ' ').substring(0, 19)}`);
    }

    if (hasError) {
        console.error(`❌ CÓ ${errors.length} LỖI XẢY RA TRONG DANH SÁCH 25 CHỨC NĂNG:`);
        errors.forEach(err => console.error(`  - ${err}`));
        if (!options.noExit) {
            process.exit(1);
        }
        return false;
    } else {
        console.log('✅ TOÀN BỘ 25 CHỨC NĂNG ĐẠT TRẠNG THÁI PASS (Ảnh độc bản, Test ID L3 UI chuẩn, Mtime hợp lệ)');
        return true;
    }
}

if (require.main === module) {
    verifyUiFunctions();
}

module.exports = { verifyUiFunctions };
