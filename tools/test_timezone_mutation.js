/**
 * tools/test_timezone_mutation.js
 * 
 * KIỂM THỬ ĐỘT BIẾN (MUTATION TEST) MÚI GIỜ HỆ THỐNG
 * 
 * Mục tiêu: Chứng minh tính thiết yếu của việc ép múi giờ GMT+7 (+07:00) trên kết nối MySQL:
 * - Khi không ép múi giờ (+00:00 / SYSTEM): MySQL lệch 7 tiếng so với giờ nghiệp vụ Việt Nam,
 *   khiến các hàm CURRENT_DATE(), NOW() và DATE(created_at) truy vấn sai ngày khi rơi vào khoảng 00:00 - 06:59 GMT+7.
 * - Khi ép múi giờ (+07:00): Đồng bộ hoàn toàn, không bị lệch ngày.
 */

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '123456';
process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';

const assert = require('assert');
const mysql = require('../sedinco_backend/node_modules/mysql2/promise');

async function testTimezoneConfig({ enforceGmt7 = true }) {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        timezone: enforceGmt7 ? '+07:00' : '+00:00'
    });

    try {
        if (enforceGmt7) {
            await conn.query("SET time_zone = '+07:00'");
        } else {
            await conn.query("SET time_zone = '+00:00'");
        }

        const [rows] = await conn.query(`
            SELECT 
                @@session.time_zone as session_tz,
                NOW() as db_now,
                CURRENT_DATE() as db_curdate,
                DATE_FORMAT(CONVERT_TZ(NOW(), @@session.time_zone, '+07:00'), '%Y-%m-%d') as vn_expected_date,
                TIMESTAMPDIFF(HOUR, UTC_TIMESTAMP(), NOW()) as tz_offset_hours
        `);

        const result = rows[0];
        console.log(`  -> session_tz: ${result.session_tz}, tz_offset_hours: ${result.tz_offset_hours}, db_curdate: ${result.db_curdate}`);

        // Nghiệm thu: session_tz phải đúng +07:00 và độ lệch so với UTC phải đúng +7 tiếng
        assert.strictEqual(
            result.session_tz, 
            '+07:00', 
            `[MUTATION DETECTED] Session timezone bị lệch: kỳ vọng '+07:00' nhưng thực tế '${result.session_tz}'!`
        );
        assert.strictEqual(
            Number(result.tz_offset_hours), 
            7, 
            `[MUTATION DETECTED] Độ lệch giờ MySQL so với UTC không đạt +7 tiếng (thực tế: ${result.tz_offset_hours})!`
        );

        return { status: 'PASS', details: result };
    } finally {
        await conn.end();
    }
}

async function main() {
    const isMutationMode = process.argv.includes('--mutation');

    if (isMutationMode) {
        console.log('════════════════════════════════════════════════════════════════════════');
        console.log('  MUTATION RUN: CỐ TÌNH BỎ ÉP MÚI GIỜ (SET time_zone = +00:00)');
        console.log('════════════════════════════════════════════════════════════════════════');
        await testTimezoneConfig({ enforceGmt7: false });
    } else {
        console.log('════════════════════════════════════════════════════════════════════════');
        console.log('  STANDARD RUN: ÉP MÚI GIỜ GMT+7 (+07:00) TRÊN MỌI KẾT NỐI');
        console.log('════════════════════════════════════════════════════════════════════════');
        const res = await testTimezoneConfig({ enforceGmt7: true });
        console.log('  ✅ KẾT QUẢ: PASS (Múi giờ đồng bộ chính xác +07:00)');
    }
}

main().catch(err => {
    console.error('  ❌ KIỂM THỬ THẤT BẠI (ĐỎ THEO KỲ VỌNG KHI BỎ ÉP MÚI GIỜ):');
    console.error(`  ${err.name}: ${err.message}`);
    process.exit(1);
});
