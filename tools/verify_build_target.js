#!/usr/bin/env node

/**
 * tools/verify_build_target.js
 * 
 * Kiểm tra tính toàn vẹn đích đến API trong bản build frontend (www/assets/*.js).
 * - Trích xuất Host API đích (tuyệt đối không in giá trị secret / token).
 * - Cờ --staging: Bắt buộc API đích KHÔNG ĐƯỢC trỏ vào production (sedinco-backend.onrender.com).
 * - Cờ --production: Đảm bảo không chứa localhost / 127.0.0.1.
 */

const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../zalo-miniapp-frontend/www/assets');
const args = process.argv.slice(2);
const isStagingCheck = args.includes('--staging');
const isProductionCheck = args.includes('--production');

function runCheck() {
    console.log('=== KIỂM TRA ĐÍCH ĐẾN BẢN BUILD FRONTEND (VERIFY BUILD TARGET) ===');

    if (!fs.existsSync(ASSETS_DIR)) {
        console.error(`❌ [LỖI] Thư mục bản build không tồn tại: ${ASSETS_DIR}`);
        console.error('   Vui lòng thực thi "npm --prefix zalo-miniapp-frontend run build" trước.');
        process.exit(1);
    }

    const files = fs.readdirSync(ASSETS_DIR).filter(f => f.endsWith('.js'));
    if (files.length === 0) {
        console.error('❌ [LỖI] Không tìm thấy tệp JavaScript nào trong www/assets!');
        process.exit(1);
    }

    const detectedHosts = new Set();
    const urlPattern = /https?:\/\/([a-zA-Z0-9.-]+)(?::([0-9]+))?/g;

    for (const file of files) {
        const filePath = path.join(ASSETS_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8');

        let match;
        while ((match = urlPattern.exec(content)) !== null) {
            const host = match[1];
            // Lọc bớt các domain schema hoặc thư viện phổ biến không phải backend API
            if (!['www.w3.org', 'reactjs.org', 'reactrouter.com'].includes(host)) {
                detectedHosts.add(host + (match[2] ? `:${match[2]}` : ''));
            }
        }
    }

    console.log(`🔍 Các host được phát hiện trong bundle frontend (${files.length} tệp JS):`);
    for (const h of detectedHosts) {
        console.log(`   - ${h}`);
    }

    let hasViolation = false;

    if (isStagingCheck) {
        console.log('\n[CỜ --staging] Kiểm tra bảo vệ môi trường Staging:');
        const productionHosts = ['sedinco-backend.onrender.com'];
        for (const badHost of productionHosts) {
            if (detectedHosts.has(badHost)) {
                console.error(`❌ [LỖI ĐỎ] Phát hiện host PRODUCTION (${badHost}) nằm trong bản build Staging!`);
                hasViolation = true;
            }
        }
        if (!hasViolation) {
            console.log('✅ ĐẠT: Không phát hiện host production trong bản build staging.');
        }
    }

    if (isProductionCheck) {
        console.log('\n[CỜ --production] Kiểm tra bảo vệ môi trường Production:');
        const devApiHosts = ['localhost:5001', '127.0.0.1:5001', 'localhost:5000', '127.0.0.1:5000', 'localhost:3000', '127.0.0.1:3000'];
        for (const badHost of devApiHosts) {
            for (const h of detectedHosts) {
                if (h === badHost || h.startsWith(badHost)) {
                    console.error(`❌ [LỖI ĐỎ] Phát hiện host nội bộ/dev (${h}) nằm trong bản build Production!`);
                    hasViolation = true;
                }
            }
        }
        const officialHost = 'sedinco-backend.onrender.com';
        if (detectedHosts.has(officialHost)) {
            console.log(`✅ HỢP LỆ: Đã phát hiện URL Backend chính thức của hệ thống (${officialHost}) trong bản build.`);
        }
        if (!hasViolation) {
            console.log('✅ ĐẠT: Không phát hiện host dev nội bộ trong bản build production.');
        }
    }

    if (hasViolation) {
        console.error('\n🚨 KIỂM TRA ĐÍCH ĐẾN THẤT BẠI: Bản build vi phạm quy tắc phân tách môi trường!');
        process.exit(1);
    }

    console.log('\n✅ KIỂM TRA ĐÍCH ĐẾN BẢN BUILD THÀNH CÔNG: Hoàn toàn hợp lệ.');
    process.exit(0);
}

runCheck();
