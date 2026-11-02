/**
 * tools/run_all_specs_by_file.js
 * 
 * Chạy test runner thật với spec reporter cho từng file test trong sedinco_backend/__tests__/
 * Đảm bảo:
 * - Không bị nghẽn deadlock DB (chạy tuần tự từng file)
 * - Thu thập chính xác output thật từ Node.js test spec reporter
 * - Ghi nhận trung thực kết quả PASS/FAIL của từng test
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const testsDir = path.join(__dirname, '../sedinco_backend/__tests__');
const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js')).sort();

console.log('=============================================================================');
console.log(`[SPEC REPORTER] BẮT ĐẦU CHẠY THẬT TỪNG FILE TEST BẰNG NODE.JS TEST RUNNER`);
console.log(`- Thư mục test: ${testsDir}`);
console.log(`- Số lượng file: ${files.length}`);
console.log('=============================================================================\n');

const fileSummaries = [];

for (const file of files) {
    const fullPath = path.join(testsDir, file);
    const cmd = `NODE_ENV=test DB_NAME=sedinco_hr_test DB_SSL=false node --test --test-reporter=spec --test-force-exit "${fullPath}"`;
    
    console.log(`>>> CHẠY FILE: ${file} ...`);
    let output = '';
    let isSuccess = false;
    try {
        output = execSync(cmd, {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf-8',
            timeout: 60000,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        isSuccess = true;
    } catch (err) {
        output = (err.stdout || '') + '\n' + (err.stderr || '');
        isSuccess = false;
    }

    // Lọc các dòng spec output (✔ hoặc ✖)
    const lines = output.split('\n');
    const testCases = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('✔') || trimmed.startsWith('✖')) {
            testCases.push(trimmed);
        }
    }

    console.log(`    -> Kết quả: ${isSuccess ? 'PASS' : 'FAIL / CÓ TEST LỖI'} (${testCases.length} tests tìm thấy trong spec output)`);
    fileSummaries.push({
        file,
        isSuccess,
        testCases,
        rawOutput: output
    });
}

// In báo cáo tổng hợp
console.log('\n=============================================================================');
console.log('[BÁO CÁO CHI TIẾT TÊN TEST THẬT TỪ TEST RUNNER (SPEC REPORTER) THEO FILE]');
console.log('=============================================================================\n');

let totalSpecTests = 0;
let totalPassedTests = 0;
let totalFailedTests = 0;

for (const summary of fileSummaries) {
    console.log(`### File: ${summary.file} (${summary.testCases.length} tests) [${summary.isSuccess ? 'ALL PASS' : 'CONTAINS FAILS'}]`);
    if (summary.testCases.length === 0) {
        console.log('   (Không bắt được dòng ✔/✖ trực tiếp trong stdout; có thể file gặp lỗi crash khi import hoặc cú pháp)');
    } else {
        for (const tc of summary.testCases) {
            console.log(`  ${tc}`);
            if (tc.startsWith('✔')) totalPassedTests++;
            if (tc.startsWith('✖')) totalFailedTests++;
            totalSpecTests++;
        }
    }
    console.log('');
}

console.log('-----------------------------------------------------------------------------');
console.log(`TỔNG KẾT:`);
console.log(`- Tổng số tests ghi nhận từ spec reporter: ${totalSpecTests}`);
console.log(`- Số tests PASS (✔): ${totalPassedTests}`);
console.log(`- Số tests FAIL (✖): ${totalFailedTests}`);
console.log('-----------------------------------------------------------------------------');
