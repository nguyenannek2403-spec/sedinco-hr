/**
 * tools/test_verify_25_mutation.js
 * 
 * Kiểm chứng Mutation Testing cho công cụ verify_25_ui_functions.js:
 * 1. Mutation 1 (Gán sai test ID đơn vị TC-PAY-08) -> Phải BÁO ĐỎ (FAIL)
 * 2. Mutation 2 (Gán trùng tên ảnh giữa 2 chức năng) -> Phải BÁO ĐỎ (FAIL)
 * 3. Mutation 3 (Ảnh có mtime cũ hơn thời điểm chạy L3) -> Phải BÁO ĐỎ (FAIL)
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { verifyUiFunctions } = require('./verify_25_ui_functions');

const UI_FUNCTIONS_PATH = path.join(__dirname, '../tests/ui_functions.json');

function runMutationTests() {
    console.log('=== BẮT ĐẦU KIỂM CHỨNG MUTATION TESTING CHO 25 CHỨC NĂNG UI ===\n');

    const originalFunctions = JSON.parse(fs.readFileSync(UI_FUNCTIONS_PATH, 'utf8'));

    // -------------------------------------------------------------
    // MUTATION 1: Cố tình gán Test ID cấp đơn vị (TC-PAY-08) vào FN-07
    // -------------------------------------------------------------
    console.log('[MUTATION 1] Cố tình gán Test ID đơn vị "TC-PAY-08" vào FN-07...');
    const mut1Functions = JSON.parse(JSON.stringify(originalFunctions));
    mut1Functions[6].test_id = 'TC-PAY-08'; // FN-07

    const origError = console.error;
    const origLog = console.log;
    let mut1Caught = false;

    try {
        console.error = () => {};
        console.log = () => {};
        const pass = verifyUiFunctions(mut1Functions, { noExit: true });
        mut1Caught = !pass;
    } finally {
        console.error = origError;
        console.log = origLog;
    }

    assert.equal(mut1Caught, true, 'Mutation 1: verify_25_ui_functions PHẢI BÁO ĐỎ khi test_id không có tiền tố TC-L3-UI-!');
    console.log(' -> KẾT QUẢ MUTATION 1: ĐỎ THÀNH CÔNG (Phát hiện và chặn Test ID đơn vị TC-PAY-08)\n');

    // -------------------------------------------------------------
    // MUTATION 2: Cố tình gán trùng tên ảnh giữa FN-01 và FN-02
    // -------------------------------------------------------------
    console.log('[MUTATION 2] Cố tình gán trùng tên ảnh giữa FN-01 và FN-02...');
    const mut2Functions = JSON.parse(JSON.stringify(originalFunctions));
    mut2Functions[1].image = mut2Functions[0].image;

    let mut2Caught = false;
    try {
        console.error = () => {};
        console.log = () => {};
        const pass = verifyUiFunctions(mut2Functions, { noExit: true });
        mut2Caught = !pass;
    } finally {
        console.error = origError;
        console.log = origLog;
    }

    assert.equal(mut2Caught, true, 'Mutation 2: verify_25_ui_functions PHẢI BÁO ĐỎ khi có ảnh trùng nhau!');
    console.log(' -> KẾT QUẢ MUTATION 2: ĐỎ THÀNH CÔNG (Phát hiện và chặn ảnh trùng lặp)\n');

    // -------------------------------------------------------------
    // MUTATION 3: Cố tình đặt thời điểm bắt đầu chạy L3 ở tương lai (+1 giờ)
    // -------------------------------------------------------------
    console.log('[MUTATION 3] Cố tình đặt mốc bắt đầu L3 ở tương lai (mtime ảnh < run start)...');
    let mut3Caught = false;
    try {
        console.error = () => {};
        console.log = () => {};
        const futureTime = Date.now() + 3600 * 1000;
        const pass = verifyUiFunctions(originalFunctions, { noExit: true, startTime: futureTime });
        mut3Caught = !pass;
    } finally {
        console.error = origError;
        console.log = origLog;
    }

    assert.equal(mut3Caught, true, 'Mutation 3: verify_25_ui_functions PHẢI BÁO ĐỎ khi mtime ảnh nhỏ hơn thời điểm bắt đầu chạy L3!');
    console.log(' -> KẾT QUẢ MUTATION 3: ĐỎ THÀNH CÔNG (Phát hiện và chặn ảnh cũ từ các lần chạy trước)\n');

    console.log('✅✅ TOÀN BỘ 3 KỊCH BẢN MUTATION TESTING CHO 25 CHỨC NĂNG UI ĐỀU BÁO ĐỎ THEO ĐÚNG THIẾT KẾ!');
}

if (require.main === module) {
    runMutationTests();
}

module.exports = { runMutationTests };
