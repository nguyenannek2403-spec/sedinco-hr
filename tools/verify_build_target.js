#!/usr/bin/env node

/**
 * tools/verify_build_target.js
 * 
 * Kiểm tra bản build Mini App / Web xem nhúng endpoint HOST API nào (Mục B.5).
 * Từ chối bản build (Exit code 1) nếu đang kiểm thử Staging nhưng bản build trỏ vào Host Production.
 * TUYỆT ĐỐI KHÔNG IN SECRET / TOKEN / MẬT KHẨU.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
        return args[idx + 1];
    }
    return defaultValue;
}

const targetMode = getArg('--mode', 'staging').toLowerCase();
const wwwDir = path.resolve(__dirname, '../zalo-miniapp-frontend/www');
const assetsDir = path.join(wwwDir, 'assets');

console.log(`======================================================================`);
console.log(`🔍 KIỂM TRA MỤC TIÊU HOST API TRONG BẢN BUILD (${targetMode.toUpperCase()})`);
console.log(`======================================================================\n`);

if (!fs.existsSync(wwwDir)) {
    console.error(`❌ Thư mục build không tồn tại: ${wwwDir}`);
    console.error(`👉 Vui lòng chạy lệnh đóng gói frontend trước: npm --prefix zalo-miniapp-frontend run build`);
    process.exit(1);
}

// Thu thập toàn bộ file js trong www/ và www/assets/
const jsFiles = [];
function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const fullPath = path.join(dir, e.name);
        if (e.isDirectory()) {
            scanDir(fullPath);
        } else if (e.isFile() && e.name.endsWith('.js')) {
            jsFiles.push(fullPath);
        }
    }
}
scanDir(wwwDir);

if (jsFiles.length === 0) {
    console.error(`❌ Không tìm thấy file JavaScript nào trong thư mục build: ${wwwDir}`);
    process.exit(1);
}

// Regex quét URL API backend
const urlRegex = /https?:\/\/([a-zA-Z0-9.-]+(?::[0-9]+)?)(?:\/[a-zA-Z0-9_.-]*)*/g;
const ignoredDomains = [
    'w3.org', 'schema.org', 'images.unsplash.com', 'api.qrserver.com',
    'maps.google.com', 'google.com', 'zalo.me', 'cdnjs.cloudflare.com',
    'unpkg.com', 'cdn.jsdelivr.net'
];

const foundHosts = new Set();

for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = urlRegex.exec(content)) !== null) {
        const fullUrl = match[0];
        const host = match[1];

        if (ignoredDomains.some(d => host.includes(d))) continue;

        // Chỉ quan tâm các host liên quan tới backend hoặc API
        if (
            host.includes('localhost') ||
            host.includes('127.0.0.1') ||
            host.includes('render.com') ||
            host.includes('onrender.com') ||
            host.includes('sedinco') ||
            fullUrl.includes('/api')
        ) {
            foundHosts.add(host);
        }
    }
}

const detectedHosts = Array.from(foundHosts);

console.log(`📦 Các file bundle đã quét: ${jsFiles.length} files`);
if (detectedHosts.length === 0) {
    console.log(`ℹ️  Không phát hiện URL backend tuyệt đối hardcode trong bundle (bundle dùng cấu hình tương đối hoặc resolveApiBase).`);
    console.log(`✅ [XÁC MINH TARGET THÀNH CÔNG] An toàn: Không phát hiện Host Production nhúng tĩnh.`);
    process.exit(0);
}

console.log(`🌐 Các HOST API phát hiện trong bản build:`);
detectedHosts.forEach(h => console.log(`   - ${h}`));
console.log('');

// Kiểm tra logic bảo vệ theo mode
const PROD_HOST = 'sedinco-backend.onrender.com';
const hasProdHost = detectedHosts.some(h => h.toLowerCase() === PROD_HOST);
const hasStagingOrLocal = detectedHosts.some(h =>
    h.includes('staging') ||
    h.includes('localhost') ||
    h.includes('127.0.0.1')
);

if (targetMode === 'staging') {
    if (hasProdHost && !hasStagingOrLocal) {
        console.error(`🚨 [BẢO VỆ STAGING THẤT BẠI]`);
        console.error(`   Bản build đang trỏ trực tiếp vào HOST PRODUCTION: ${PROD_HOST}`);
        console.error(`   Tuyệt đối không deploy bản build này lên môi trường Staging/Testing!`);
        console.error(`   👉 Khắc phục: Khai báo VITE_API_URL=<url_staging> trong .env.production.local rồi build lại.`);
        process.exit(1);
    } else if (hasProdHost && hasStagingOrLocal) {
        console.warn(`⚠️ [CẢNH BÁO] Phát hiện cả host staging/local và chuỗi tham chiếu production trong bundle.`);
        console.log(`✅ [XÁC MINH TARGET HỢP LỆ] Đã có host staging: ${detectedHosts.filter(h => h !== PROD_HOST).join(', ')}`);
        process.exit(0);
    } else {
        console.log(`✅ [XÁC MINH TARGET THÀNH CÔNG] Toàn bộ HOST API đều thuộc môi trường Staging/Local.`);
        process.exit(0);
    }
} else if (targetMode === 'production') {
    if (!hasProdHost) {
        console.warn(`⚠️ [CẢNH BÁO] Chế độ Production nhưng không phát hiện HOST Production (${PROD_HOST}).`);
    } else {
        console.log(`✅ [XÁC MINH TARGET THÀNH CÔNG] Đã xác nhận HOST Production: ${PROD_HOST}`);
    }
    process.exit(0);
} else {
    console.log(`✅ [XÁC MINH HOÀN TẤT] Mode: ${targetMode}`);
    process.exit(0);
}
