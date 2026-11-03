/**
 * tools/test_csv_export_bom.js
 * 
 * Kiểm tra xuất file CSV lương:
 * 1. Mở file CSV, trích xuất và hiển thị byte đầu (BOM UTF-8: EF BB BF)
 * 2. Kiểm tra các dòng có ký tự độc hại formula injection: =, +, -, @
 * 3. Chứng minh các ký tự này đã được vô hiệu hóa an toàn bằng dấu nháy đơn '
 */

const fs = require('fs');
const path = require('path');

// Logic sanitizeFormula lấy nguyên văn từ zalo-miniapp-frontend/src/utils/api.js
const sanitizeFormula = (val) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
        return `'${str}`;
    }
    return str;
};

// Dữ liệu kiểm thử chứa các payload Formula Injection ác ý
const sampleData = [
    { ma_nv: 'NV001', ho_ten: 'Nguyễn Văn An', chuc_danh: 'Công nhân may', baseSalary: 7500000, totalWorkDays: 26, salaryByWork: 7500000, totalAllowance: 2730000, otAmount: 0, totalInsurance: 787500, netSalary: 9442500 },
    { ma_nv: '=1+1', ho_ten: '=cmd|"/C calc"!A0', chuc_danh: 'Hacker Formula 1', baseSalary: 8000000, totalWorkDays: 26, salaryByWork: 8000000, totalAllowance: 2500000, otAmount: 0, totalInsurance: 840000, netSalary: 9660000 },
    { ma_nv: '+9999', ho_ten: '+SUM(1+1)', chuc_danh: 'Hacker Formula 2', baseSalary: 7000000, totalWorkDays: 26, salaryByWork: 7000000, totalAllowance: 2000000, otAmount: 0, totalInsurance: 735000, netSalary: 8265000 },
    { ma_nv: '-1234', ho_ten: '-AVERAGE(A1:A10)', chuc_danh: 'Hacker Formula 3', baseSalary: 7200000, totalWorkDays: 26, salaryByWork: 7200000, totalAllowance: 2100000, otAmount: 0, totalInsurance: 756000, netSalary: 8544000 },
    { ma_nv: '@SUM', ho_ten: '@SUM(B1:B10)', chuc_danh: 'Hacker Formula 4', baseSalary: 6800000, totalWorkDays: 26, salaryByWork: 6800000, totalAllowance: 1800000, otAmount: 0, totalInsurance: 714000, netSalary: 7886000 }
];

const headers = [
    "Mã NV", "Họ và Tên", "Chức Danh", "Lương Cơ Bản", "Ngày Công", "Lương Theo Công",
    "Phụ Cấp Ăn Trưa", "Phụ Cấp Xăng Xe", "Phụ Cấp Nhà Ở", "Thưởng HTCV", "Phụ Cấp Trách Nhiệm",
    "Tổng Phụ Cấp", "Tiền Tăng Ca (OT)", "Khấu Trừ BHXH (10.5%)", "Thực Lĩnh (Net)"
];

const rows = sampleData.map(item => {
    return [
        `"${sanitizeFormula(item.ma_nv)}"`,
        `"${sanitizeFormula(item.ho_ten)}"`,
        `"${sanitizeFormula(item.chuc_danh)}"`,
        item.baseSalary,
        item.totalWorkDays,
        item.salaryByWork,
        730000,
        500000,
        1000000,
        1500000,
        0,
        item.totalAllowance,
        item.otAmount,
        item.totalInsurance,
        item.netSalary
    ];
});

// Nội dung CSV đúng chuẩn UTF-8 BOM
const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

const outputPath = path.join(__dirname, '../reports/test_export_payroll_bom.csv');
fs.writeFileSync(outputPath, csvContent, 'utf8');

// Đọc lại file dưới dạng Buffer nhị phân
const fileBuffer = fs.readFileSync(outputPath);
const firstBytes = fileBuffer.slice(0, 3);
const firstBytesHex = Array.from(firstBytes).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

console.log('══════════════════════════════════════════════════════════════════════════');
console.log('  KẾT QUẢ KIỂM TRA FILE CSV XUẤT LƯƠNG & CHỐNG FORMULA INJECTION');
console.log('══════════════════════════════════════════════════════════════════════════\n');

console.log(`1. ĐƯỜNG DẪN FILE CSV: ${outputPath}`);
console.log(`2. DUNG LƯỢNG FILE: ${fileBuffer.length} bytes`);
console.log(`3. 3 BYTES ĐẦU TIÊN CỦA FILE (BOM UTF-8):`);
console.log(`   - Hex values: ${firstBytesHex}`);
console.log(`   - Kỳ vọng BOM UTF-8: 0xEF 0xBB 0xBF (U+FEFF)`);
const hasValidBom = (firstBytes[0] === 0xEF && firstBytes[1] === 0xBB && firstBytes[2] === 0xBF);
console.log(`   - Kết luận BOM: ${hasValidBom ? '✅ HỢP LỆ (Chuẩn UTF-8 BOM cho Excel tiếng Việt)' : '❌ THIẾU BOM'}\n`);

console.log(`4. CÁC DÒNG CHỨA KÝ TỰ ĐỘC HẠI = + - @ ĐÃ ĐƯỢC VÔ HIỆU HÓA:`);
const lines = fs.readFileSync(outputPath, 'utf8').split('\n');
lines.slice(1).forEach((line, idx) => {
    console.log(`   Dòng ${idx + 2}: ${line}`);
});

console.log('\n5. ĐÁNH GIÁ AN TOÀN FORMULA INJECTION:');
let allSanitized = true;
sampleData.slice(1).forEach((item, idx) => {
    const sanitizedMa = sanitizeFormula(item.ma_nv);
    const sanitizedTen = sanitizeFormula(item.ho_ten);
    const safe = sanitizedMa.startsWith("'") && sanitizedTen.startsWith("'");
    console.log(`   - Mẫu ${idx + 1} (${item.ma_nv} | ${item.ho_ten}): ${safe ? '✅ ĐÃ THÊM DẤU NHÁY ĐƠN VÔ HIỆU HÓA' : '❌ CHƯA AN TOÀN'}`);
    if (!safe) allSanitized = false;
});

console.log(`\n>>> KẾT LUẬN CUỐI CÙNG: ${hasValidBom && allSanitized ? 'PASS' : 'FAIL'}`);
