/**
 * tools/update_company_gps.js
 * 
 * Script cập nhật tọa độ GPS và bán kính chấm công của nhà máy (company_settings)
 * kèm ghi nhận Audit Log bắt buộc phục vụ Pilot.
 * 
 * QUY TẮC AN TOÀN:
 * 1. Chặn tọa độ mẫu (16.0544, 108.2022 hoặc 0, 0).
 * 2. Thẩm tra dải tọa độ Việt Nam (Lat: ~8.5 đến 23.5, Lng: ~102.0 đến 110.0).
 * 3. Ghi vết Audit Log (giá trị cũ -> giá trị mới, người thực hiện).
 * 
 * Cách dùng:
 *   node tools/update_company_gps.js --lat 10.762622 --lng 106.660172 --radius 150 --actor ADMIN_01
 */

const mysql = require('../sedinco_backend/node_modules/mysql2/promise');
const path = require('path');

require('../sedinco_backend/node_modules/dotenv').config({
    path: process.env.NODE_ENV === 'test'
        ? path.join(__dirname, '../sedinco_backend/.env.test')
        : path.join(__dirname, '../sedinco_backend/.env')
});

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT || 3306;
const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASSWORD || '123456';

const args = process.argv.slice(2);
function getArg(name) {
    const idx = args.indexOf(name);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const latStr = getArg('--lat');
const lngStr = getArg('--lng');
const radiusStr = getArg('--radius');
const actorId = getArg('--actor') || 'ADMIN_PILOT';

async function main() {
    console.log('=============================================================================');
    console.log('[SEDINCO HR] CÔNG CỤ THIẾT LẬP TỌA ĐỘ GPS NHÀ XƯỞNG (PILOT CALIBRATION)');
    console.log('=============================================================================');

    if (!latStr || !lngStr || !radiusStr) {
        console.log(`
HƯỚNG DẪN ĐO ĐẠC TỌA ĐỘ GPS THỰC TẾ TRƯỚC KHI CHẠY THỬ (PILOT):
-----------------------------------------------------------------------------
1. Phương pháp đo:
   - Dùng Google Maps hoặc ứng dụng GPS trên điện thoại (đã bật độ chính xác cao).
   - Đo tại ít nhất 3 vị trí:
     (a) Cổng chính ra vào nhà xưởng.
     (b) Tâm của xưởng sản xuất.
     (c) Góc làm việc xa nhất bên trong xưởng.
2. Lưu ý đặc thù nhà xưởng công nghiệp:
   - Nhà xưởng có kết cấu khung thép, mái tôn hoạt động tương tự lồng Faraday,
     gây suy hao tín hiệu GPS vệ tinh, độ chính xác (horizontal accuracy)
     có thể bị trôi từ 15m đến 50m.
   - Bán kính khuyên dùng cho Pilot: Khảo sát thực tế khoảng cách từ tâm xưởng
     đến cổng + dung sai 50m (thường từ 150m đến 250m). Không nên để quá hẹp (< 100m)
     khiến công nhân bị từ chối chấm công oan.
3. Cú pháp chạy lệnh:
   node tools/update_company_gps.js --lat <VĨ_ĐỘ> --lng <KINH_ĐỘ> --radius <BÁN_KÍNH_METERS> --actor <ADMIN_ID>

Ví dụ:
   node tools/update_company_gps.js --lat 10.8231 --lng 106.6297 --radius 180 --actor ADMIN_01
-----------------------------------------------------------------------------
`);
        process.exit(1);
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    const radius = parseInt(radiusStr, 10);

    // Chặn tọa độ mẫu hoặc tọa độ 0
    if ((lat === 16.0544 && lng === 108.2022) || (lat === 0 && lng === 0)) {
        throw new Error('LỖI AN TOÀN: Tọa độ nhập vào là tọa độ mẫu hoặc (0,0). Bắt buộc phải đo tọa độ thực tế của nhà máy!');
    }

    if (isNaN(lat) || lat < 8.0 || lat > 24.0) {
        throw new Error(`Vĩ độ (latitude) không hợp lệ tại Việt Nam: ${lat}. Giá trị hợp lệ nằm trong khoảng [8.0, 24.0]`);
    }
    if (isNaN(lng) || lng < 102.0 || lng > 110.0) {
        throw new Error(`Kinh độ (longitude) không hợp lệ tại Việt Nam: ${lng}. Giá trị hợp lệ nằm trong khoảng [102.0, 110.0]`);
    }
    if (isNaN(radius) || radius < 50 || radius > 2000) {
        throw new Error(`Bán kính cho phép (${radius}m) không hợp lý. Giá trị hợp lý cho Pilot là từ 50m đến 2000m.`);
    }

    const conn = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        database: DB_NAME,
        user: DB_USER,
        password: DB_PASS
    });

    const [rows] = await conn.query('SELECT id, latitude, longitude, radius_meters FROM company_settings LIMIT 1');
    if (rows.length === 0) {
        throw new Error('Bảng company_settings chưa có bản ghi cấu hình nào.');
    }
    const oldConfig = rows[0];

    console.log(`[HIỆN TẠI] Tọa độ cũ: Lat=${oldConfig.latitude}, Lng=${oldConfig.longitude}, Bán kính=${oldConfig.radius_meters}m`);
    console.log(`[CẬP NHẬT] Tọa độ mới: Lat=${lat.toFixed(6)}, Lng=${lng.toFixed(6)}, Bán kính=${radius}m`);

    await conn.query(`
        UPDATE company_settings 
        SET latitude = ?, longitude = ?, radius_meters = ?
        WHERE id = ?
    `, [lat, lng, radius, oldConfig.id]);

    // Ghi audit log
    await conn.query(`
        INSERT INTO audit_logs (actor_id, actor_role, action, resource, details, ip_address)
        VALUES (?, 'admin', 'UPDATE_COMPANY_SETTINGS', 'company_settings', ?, '127.0.0.1')
    `, [
        actorId,
        JSON.stringify({
            field: 'GPS_CONFIG',
            old_value: { lat: oldConfig.latitude, lng: oldConfig.longitude, radius: oldConfig.radius_meters },
            new_value: { lat, lng, radius }
        })
    ]);

    console.log(`[PASS] Đã cập nhật thành công cấu hình GPS và ghi nhận Audit Log.`);
    await conn.end();
}

main().catch(err => {
    console.error(`[THẤT BẠI] ${err.message}`);
    process.exit(1);
});
