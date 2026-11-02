const fs = require('fs');
const path = require('path');

const testDir = path.join(__dirname, '../sedinco_backend/__tests__');
const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js')).sort();

let grandTotal = 0;
const results = {};

for (const file of files) {
    const content = fs.readFileSync(path.join(testDir, file), 'utf-8');
    // Bắt các it(...) hoặc test(...) với single quote, double quote hoặc backtick
    const regex = /(?:it|test)\s*\(\s*(['"`])(.*?)\1/gs;
    let match;
    const testNames = [];
    while ((match = regex.exec(content)) !== null) {
        // làm sạch xuống dòng nếu tên test nhiều dòng
        const cleanName = match[2].replace(/\s+/g, ' ').trim();
        testNames.push(cleanName);
    }
    results[file] = testNames;
    grandTotal += testNames.length;
}

console.log(`TỔNG SỐ TEST THẬT ĐƯỢC ĐỊNH NGHĨA TRONG 19 FILE: ${grandTotal}\n`);
for (const [file, names] of Object.entries(results)) {
    console.log(`### ${file} (${names.length} tests):`);
    names.forEach((t, i) => console.log(`  ${i+1}. ${t}`));
    console.log('');
}
