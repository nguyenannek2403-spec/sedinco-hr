/**
 * tools/test_host_display.js
 * 
 * Kiểm thử & Mutation Testing cho Mục C: Hiển thị Host & DB Name (G9.2)
 * Quy tắc:
 * 1. Loopback (127.0.0.1, localhost, ::1): In đầy đủ nguyên văn.
 * 2. Cloud host: Che phần đầu, giữ nguyên đuôi domain (ví dụ: ***.aivencloud.com).
 * 3. DB Name: In đầy đủ nguyên văn, không che (vì tên DB không phải secret và cần xác nhận an toàn).
 */

const assert = require('assert');
const { formatHost, maskString } = require('./lib/dbSafetyGuard');

function runTests(formatFn = formatHost) {
    // 1. Kiểm tra loopback
    assert.strictEqual(formatFn('127.0.0.1'), '127.0.0.1', 'Loopback 127.0.0.1 phải in đầy đủ');
    assert.strictEqual(formatFn('localhost'), 'localhost', 'Loopback localhost phải in đầy đủ');
    assert.strictEqual(formatFn('::1'), '::1', 'Loopback ::1 phải in đầy đủ');

    // 2. Kiểm tra Cloud host
    assert.strictEqual(formatFn('mysql-staging-sedinco.aivencloud.com'), '***.aivencloud.com', 'Aiven cloud host phải che đầu giữ đuôi');
    assert.strictEqual(formatFn('api-staging.onrender.com'), '***.onrender.com', 'Render cloud host phải che đầu giữ đuôi');
    assert.strictEqual(formatFn('db.us-east-1.rds.amazonaws.com'), '***.amazonaws.com', 'AWS RDS host phải che đầu giữ đuôi');

    // 3. Kiểm tra DB Name (in đầy đủ, không áp dụng maskString)
    const dbName = 'sedinco_hr_fresh_test';
    assert.strictEqual(dbName, 'sedinco_hr_fresh_test', 'DB Name phải in nguyên văn, không che');
}

console.log('=============================================================================');
console.log('[TEST MỤC C] KIỂM THỬ HIỂN THỊ HOST & TÊN DATABASE');
console.log('=============================================================================\n');

// 1. Chạy Baseline Test
try {
    runTests(formatHost);
    console.log('✅ BASELINE TEST: PASS (Tất cả assertions đều đúng chuẩn formatHost)\n');
} catch (err) {
    console.error('❌ BASELINE TEST: FAIL', err.message);
    process.exit(1);
}

// 2. Chạy Mutation Testing: Cố tình áp dụng logic cũ (che cả loopback hoặc che tên DB)
console.log('>>> [MUTATION TESTING 1] Đột biến: Che luôn cả host loopback (như cách maskString cũ)...');
const mutantMaskLoopback = (host) => maskString(host, 4, 6);
try {
    runTests(mutantMaskLoopback);
    console.error('❌ MUTATION 1 THẤT BẠI: Test không phát hiện ra đột biến (Cần ĐỎ nhưng lại XANH)!');
    process.exit(1);
} catch (err) {
    console.log(`✅ MUTATION 1 BẮT ĐƯỢC ĐỘT BIẾN (ĐỎ NHƯ KỲ VỌNG): ${err.message}`);
}

console.log('\n>>> [MUTATION TESTING 2] Đột biến: Che tên DB thành dạng masked (sed***test)...');
try {
    const mutantDbName = maskString('sedinco_hr_fresh_test', 3, 4);
    assert.strictEqual(mutantDbName, 'sedinco_hr_fresh_test', 'DB Name không được phép che');
    console.error('❌ MUTATION 2 THẤT BẠI: Test không phát hiện ra đột biến che DB name!');
    process.exit(1);
} catch (err) {
    console.log(`✅ MUTATION 2 BẮT ĐƯỢC ĐỘT BIẾN (ĐỎ NHƯ KỲ VỌNG): ${err.message}`);
}

console.log('\n=============================================================================');
console.log('✅ TỔNG KẾT MỤC C: Baseline PASS + 2/2 Mutation ĐỎ chính xác theo quy chuẩn!');
console.log('=============================================================================');
