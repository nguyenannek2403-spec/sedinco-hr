#!/usr/bin/env node
/**
 * tools/staged_password_change.js
 * 
 * Công cụ kích hoạt đổi mật khẩu theo đợt (Staged Rollout) - B2 (G5)
 * 
 * SỬ DỤNG:
 *   node tools/staged_password_change.js --dry-run
 *   node tools/staged_password_change.js --role=worker --limit=50 --dry-run
 *   node tools/staged_password_change.js --role=worker --chuc-danh="Tổ may" --limit=30
 *   node tools/staged_password_change.js --employees=NV001,NV002,NV003
 */

const path = require('path');
require(path.join(__dirname, '../sedinco_backend/node_modules/dotenv')).config({
    path: path.join(__dirname, '../sedinco_backend/.env')
});

const employeeService = require('../sedinco_backend/src/services/employeeService');

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        role: null,
        chuc_danh: null,
        ma_nv_list: null,
        limit: 50,
        offset: 0,
        dry_run: false
    };

    for (const arg of args) {
        if (arg === '--dry-run') {
            options.dry_run = true;
        } else if (arg.startsWith('--role=')) {
            options.role = arg.split('=')[1].trim();
        } else if (arg.startsWith('--chuc-danh=')) {
            options.chuc_danh = arg.split('=')[1].trim();
        } else if (arg.startsWith('--employees=')) {
            options.ma_nv_list = arg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean);
        } else if (arg.startsWith('--limit=')) {
            options.limit = parseInt(arg.split('=')[1], 10);
        } else if (arg.startsWith('--offset=')) {
            options.offset = parseInt(arg.split('=')[1], 10);
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Công cụ Kích Hoạt Đổi Mật Khẩu Theo Đợt (Sedinco HR - Staged Rollout)
Các tùy chọn:
  --dry-run             Chỉ liệt kê danh sách nhân viên sẽ bị ảnh hưởng, không ghi DB
  --role=<worker|accountant|admin>   Lọc theo vai trò
  --chuc-danh=<tên>     Lọc theo chức danh / tổ / phân xưởng
  --employees=ID1,ID2   Danh sách mã nhân viên cụ thể
  --limit=<số lượng>    Số lượng tối đa mỗi đợt (mặc định 50)
  --offset=<vị trí>     Vị trí bắt đầu
            `);
            process.exit(0);
        }
    }

    return options;
}

async function run() {
    const opts = parseArgs();
    console.log(`================================================================`);
    console.log(`🔐 CÔNG CỤ KÍCH HOẠT ĐỔI MẬT KHẨU THEO ĐỢT (STAGED ROLLOUT)`);
    console.log(`Chế độ: ${opts.dry_run ? '🔍 DRY-RUN (THỬ NGHIỆM - KHÔNG GHI DB)' : '⚡ THỰC THI THẬT'}`);
    console.log(`Bộ lọc: role=${opts.role || 'ALL'} | chuc_danh=${opts.chuc_danh || 'ALL'} | limit=${opts.limit} | offset=${opts.offset}`);
    console.log(`================================================================\n`);

    const result = await employeeService.stagedForcePasswordChange({
        ...opts,
        current_user: { username: 'CLI_ADMIN', role: 'admin' }
    });

    if (result.dry_run) {
        console.log(`[DRY-RUN HOÀN TẤT] Tìm thấy ${result.target_count} nhân viên phù hợp:`);
        console.table(result.target_employees);
        console.log(`\n💡 Để thực thi cập nhật thật, hãy chạy lại lệnh trên mà BỎ cờ --dry-run.`);
    } else {
        console.log(`✅ [THỰC THI THÀNH CÔNG] Đã đặt cờ must_change_password=1 cho ${result.updated_count} nhân viên.`);
        console.log(`Danh sách mã NV đã cập nhật:`, result.target_employees.join(', '));
    }

    process.exit(0);
}

run().catch(err => {
    console.error('❌ Lỗi thực thi staged password change:', err);
    process.exit(1);
});
