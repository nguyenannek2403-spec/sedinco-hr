/**
 * tools/test_csv_export_bom.js
 * 
 * Kiểm tra xuất file CSV lương theo chuẩn RFC 4180 & Chống Formula Injection:
 * 1. Mở file CSV, trích xuất và hiển thị byte đầu (BOM UTF-8: EF BB BF)
 * 2. So sánh dòng lỗi cũ (không nhân đôi nháy kép) vs chuẩn RFC 4180
 * 3. Chống công thức cho ký tự đầu: =, +, -, @, \t, \r
 * 4. Test vòng tròn (Roundtrip): Xuất ra file -> Đọc lại bằng parser RFC 4180:
 *    - Xác minh số cột đúng ở MỌI dòng (15 cột)
 *    - Khôi phục nguyên vẹn 100% giá trị gốc ác ý không bị biến dạng
 */

const fs = require('fs');
const path = require('path');

// Logic chuẩn RFC 4180 từ zalo-miniapp-frontend/src/utils/api.js
const sanitizeFormula = (val) => {
    if (val === null || val === undefined) return "";
    let str = String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
    }
    return str.replace(/"/g, '""');
};

const formatCsvCellRFC4180 = (val) => {
    return `"${sanitizeFormula(val)}"`;
};

// Dữ liệu kiểm thử chứa các payload Formula Injection ác ý đa dạng
const sampleData = [
    { ma_nv: 'NV001', ho_ten: 'Nguyễn Văn An', chuc_danh: 'Công nhân may', baseSalary: 7500000, totalWorkDays: 26, salaryByWork: 7500000, totalAllowance: 2730000, otAmount: 0, totalInsurance: 787500, netSalary: 9442500 },
    { ma_nv: '=1+1', ho_ten: '=cmd|"/C calc"!A0', chuc_danh: 'Hacker Formula 1', baseSalary: 8000000, totalWorkDays: 26, salaryByWork: 8000000, totalAllowance: 2500000, otAmount: 0, totalInsurance: 840000, netSalary: 9660000 },
    { ma_nv: '+9999', ho_ten: '+SUM(1+1)', chuc_danh: 'Hacker Formula 2', baseSalary: 7000000, totalWorkDays: 26, salaryByWork: 7000000, totalAllowance: 2000000, otAmount: 0, totalInsurance: 735000, netSalary: 8265000 },
    { ma_nv: '-1234', ho_ten: '-AVERAGE(A1:A10)', chuc_danh: 'Hacker Formula 3', baseSalary: 7200000, totalWorkDays: 26, salaryByWork: 7200000, totalAllowance: 2100000, otAmount: 0, totalInsurance: 756000, netSalary: 8544000 },
    { ma_nv: '@SUM', ho_ten: '@SUM(B1:B10)', chuc_danh: 'Hacker Formula 4', baseSalary: 6800000, totalWorkDays: 26, salaryByWork: 6800000, totalAllowance: 1800000, otAmount: 0, totalInsurance: 714000, netSalary: 7886000 },
    { ma_nv: '\tTAB_INJECT', ho_ten: '\rCR_INJECT', chuc_danh: 'Hacker Tab/CR', baseSalary: 6500000, totalWorkDays: 26, salaryByWork: 6500000, totalAllowance: 1500000, otAmount: 0, totalInsurance: 682500, netSalary: 7317500 }
];

const headers = [
    "Mã NV", "Họ và Tên", "Chức Danh", "Lương Cơ Bản", "Ngày Công", "Lương Theo Công",
    "Phụ Cấp Ăn Trưa", "Phụ Cấp Xăng Xe", "Phụ Cấp Nhà Ở", "Thưởng HTCV", "Phụ Cấp Trách Nhiệm",
    "Tổng Phụ Cấp", "Tiền Tăng Ca (OT)", "Khấu Trừ BHXH (10.5%)", "Thực Lĩnh (Net)"
];

const rows = sampleData.map(item => {
    return [
        formatCsvCellRFC4180(item.ma_nv),
        formatCsvCellRFC4180(item.ho_ten),
        formatCsvCellRFC4180(item.chuc_danh),
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
const csvContent = "\uFEFF" + [headers.map(h => `"${h}"`).join(","), ...rows.map(r => r.join(","))].join("\n");

const outputPath = path.join(__dirname, '../reports/test_export_payroll_bom.csv');
fs.writeFileSync(outputPath, csvContent, 'utf8');

// Đọc lại file dưới dạng Buffer nhị phân
const fileBuffer = fs.readFileSync(outputPath);
const firstBytes = fileBuffer.slice(0, 3);
const firstBytesHex = Array.from(firstBytes).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

console.log('══════════════════════════════════════════════════════════════════════════');
console.log('  KẾT QUẢ KIỂM TRA FILE CSV XUẤT LƯƠNG & CHUẨN RFC 4180 ROUNDTRIP');
console.log('══════════════════════════════════════════════════════════════════════════\n');

console.log(`1. ĐƯỜNG DẪN FILE CSV: ${outputPath}`);
console.log(`2. DUNG LƯỢNG FILE: ${fileBuffer.length} bytes`);
console.log(`3. 3 BYTES ĐẦU TIÊN CỦA FILE (BOM UTF-8):`);
console.log(`   - Hex values: ${firstBytesHex}`);
console.log(`   - Kỳ vọng BOM UTF-8: 0xEF 0xBB 0xBF (U+FEFF)`);
const hasValidBom = (firstBytes[0] === 0xEF && firstBytes[1] === 0xBB && firstBytes[2] === 0xBF);
console.log(`   - Kết luận BOM: ${hasValidBom ? 'PASS' : 'FAIL'}\n`);

console.log(`4. ĐỐI CHỨNG DÒNG LỖI CŨ VS CHUẨN RFC 4180 MỚI:`);
const oldBuggyField = `"'=cmd|"/C calc"!A0"`;
const newRfc4180Field = formatCsvCellRFC4180('=cmd|"/C calc"!A0');
console.log(`   - Dòng lỗi cũ (Không escape nháy đôi bên trong): ${oldBuggyField} -> ❌ VỠ CỘT KHI PARSE CSV`);
console.log(`   - Dòng chuẩn RFC 4180 (Nhân đôi nháy kép ""):     ${newRfc4180Field} -> ✅ HỢP LỆ THEO RFC 4180\n`);

console.log(`5. CÁC DÒNG CSV ĐÃ XUẤT RA FILE THỰC TẾ:`);
const rawLines = fs.readFileSync(outputPath, 'utf8').split('\n');
rawLines.slice(1).forEach((line, idx) => {
    console.log(`   Dòng ${idx + 2}: ${line}`);
});

// Trình phân tích RFC 4180 độc lập
function parseRFC4180Csv(csvString) {
    const cleanStr = csvString.startsWith('\uFEFF') ? csvString.slice(1) : csvString;
    const parsedRows = [];
    let currentRow = [];
    let currentField = '';
    let insideQuotes = false;
    let i = 0;

    while (i < cleanStr.length) {
        const char = cleanStr[i];
        const nextChar = cleanStr[i + 1];

        if (insideQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i += 2;
                continue;
            } else if (char === '"') {
                insideQuotes = false;
                i++;
                continue;
            } else {
                currentField += char;
                i++;
                continue;
            }
        } else {
            if (char === '"') {
                insideQuotes = true;
                i++;
                continue;
            } else if (char === ',') {
                currentRow.push(currentField);
                currentField = '';
                i++;
                continue;
            } else if (char === '\r') {
                if (nextChar === '\n') i++;
                currentRow.push(currentField);
                parsedRows.push(currentRow);
                currentRow = [];
                currentField = '';
                i++;
                continue;
            } else if (char === '\n') {
                currentRow.push(currentField);
                parsedRows.push(currentRow);
                currentRow = [];
                currentField = '';
                i++;
                continue;
            } else {
                currentField += char;
                i++;
                continue;
            }
        }
    }
    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField);
        parsedRows.push(currentRow);
    }
    return parsedRows;
}

function restoreOriginalValue(val) {
    if (typeof val === 'string' && /^'[=+\-@\t\r]/.test(val)) {
        return val.slice(1);
    }
    return val;
}

console.log('\n6. KIỂM THỬ VÒNG TRÒN (ROUNDTRIP RFC 4180 PARSER):');
const parsed = parseRFC4180Csv(fs.readFileSync(outputPath, 'utf8'));
const expectedCols = headers.length;
let allColumnsValid = true;
let allValuesRestored = true;

parsed.forEach((row, rowIdx) => {
    if (row.length !== expectedCols) {
        console.error(`   ❌ Dòng ${rowIdx + 1} có ${row.length} cột (kỳ vọng ${expectedCols})`);
        allColumnsValid = false;
    }
});

if (allColumnsValid) {
    console.log(`   - Toàn bộ ${parsed.length} dòng đều có đúng chính xác ${expectedCols} cột (Không bị vỡ cột nào)`);
}

// Kiểm tra khôi phục giá trị gốc
sampleData.forEach((orig, idx) => {
    const parsedRow = parsed[idx + 1]; // Bỏ dòng header
    const restoredMa = restoreOriginalValue(parsedRow[0]);
    const restoredTen = restoreOriginalValue(parsedRow[1]);

    if (restoredMa !== orig.ma_nv || restoredTen !== orig.ho_ten) {
        console.error(`   ❌ Mẫu ${idx + 1} không khớp: Gốc ("${orig.ma_nv}", "${orig.ho_ten}") vs Khôi phục ("${restoredMa}", "${restoredTen}")`);
        allValuesRestored = false;
    } else {
        console.log(`   - Mẫu ${idx + 1} (${orig.ma_nv} | ${orig.ho_ten}): ✅ Khôi phục nguyên vẹn 100%`);
    }
});

const isPass = hasValidBom && allColumnsValid && allValuesRestored;
console.log(`\n>>> KẾT LUẬN CUỐI CÙNG: ${isPass ? 'PASS' : 'FAIL'}`);

if (!isPass) {
    process.exit(1);
}
