const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKTREE_DIR = '/Users/an/.gemini/antigravity-ide/brain/d749f6a7-1d47-4498-bc81-b05d5c937170/scratch/worktree_g81';
const TESTS_DIR = path.join(WORKTREE_DIR, 'sedinco_backend/__tests__');
const LOGS_DIR = path.join(WORKTREE_DIR, 'test_logs');

if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const testFiles = fs.readdirSync(TESTS_DIR).filter(f => f.endsWith('.test.js')).sort();

console.log(`Tìm thấy ${testFiles.length} file kiểm thử tại commit f578675.`);

const summary = [];

for (const file of testFiles) {
    const filePath = path.join(TESTS_DIR, file);
    const logPath = path.join(LOGS_DIR, `${file}.log`);
    console.log(`\n======================================================`);
    console.log(`Đang chạy: ${file}...`);
    
    // Command
    const cmd = `NODE_ENV=test DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD=123456 DB_NAME=sedinco_hr_test DB_SSL=false JWT_SECRET=sedinco_super_secure_jwt_secret_key_2026_local_test_32chars QR_SECRET=sedinco_super_secure_qr_secret_key_2026_local_test_32chars node --test --test-force-exit --test-reporter=spec "${filePath}"`;

    let output = '';
    let exitCode = 0;
    try {
        output = execSync(cmd, { cwd: path.join(WORKTREE_DIR, 'sedinco_backend'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
        exitCode = err.status || 1;
        output = (err.stdout || '') + '\n' + (err.stderr || '');
    }

    fs.writeFileSync(logPath, output, 'utf8');

    // Parse pass/fail
    const lines = output.split('\n');
    const fails = [];
    let passCount = 0;
    let failCount = 0;

    for (const l of lines) {
        if (l.includes('✖') || l.includes('FAIL:')) {
            fails.push(l.trim());
            failCount++;
        } else if (l.includes('✔') || l.includes('PASS:')) {
            passCount++;
        }
    }

    summary.push({
        file,
        exitCode,
        passCount,
        failCount,
        fails
    });

    console.log(`Kết quả ${file}: ExitCode=${exitCode} | Pass=${passCount} | Fail=${failCount}`);
    if (fails.length > 0) {
        console.log(`  -> Danh sách fail trong ${file}:`);
        fails.forEach(f => console.log(`     * ${f}`));
    }
}

console.log(`\n======================================================`);
console.log(`TỔNG KẾT TÁI HIỆN TEST TẠI COMMIT f578675:`);
summary.forEach(s => {
    console.log(`- ${s.file}: ${s.exitCode === 0 ? 'TẤT CẢ PASS' : `CÓ ${s.failCount} TEST THẤT BẠI`} (Exit: ${s.exitCode})`);
});
