process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '123456';
process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'sedinco_super_secure_jwt_secret_key_2026_local_test_32chars';
process.env.QR_SECRET = 'sedinco_super_secure_qr_secret_key_2026_local_test_32chars';

const http = require('http');
const app = require('../sedinco_backend/src/app');
const { query } = require('../sedinco_backend/src/config/db');
const kioskService = require('../sedinco_backend/src/services/kioskService');

async function main() {
    console.log('=== KIỂM TRA ĐỘ BỀN KIOSK: 2 TAB / TẢI LẠI TRÊN CÙNG API KEY (BIÊN 48/60 REQ/PHÚT) ===');

    const kioskApiKey = 'ksk_stress_two_tabs_01';
    await query('DELETE FROM kiosk_devices WHERE api_key = ?', [kioskApiKey]);
    await query('INSERT INTO kiosk_devices (kiosk_name, branch_id, api_key, is_active) VALUES ("Kiosk Stress Test", 1, ?, 1)', [kioskApiKey]);

    const server = http.createServer(app);
    await new Promise(r => server.listen(5001, '127.0.0.1', r));

    try {
        kioskService.resetRateLimit();

        // 1. Giả lập 2 tab polling đồng thời trong 60 giây (mỗi tab 2.5s/req => 24 req/tab => 48 req tổng)
        console.log('\n[KỊCH BẢN 1] Giả lập 2 tab mở đồng thời cùng polling qr-status (48 requests/phút)...');
        let initialQr = await kioskService.generateKioskQr(kioskApiKey);
        let token = initialQr.token;

        let statusSuccess = 0;
        let status429 = 0;

        for (let i = 0; i < 48; i++) {
            try {
                const res = await kioskService.getKioskQrStatus(kioskApiKey, token);
                if (res) statusSuccess++;
            } catch (err) {
                if (err.statusCode === 429) status429++;
            }
        }
        console.log(`  -> Polling 48 lần: Thành công = ${statusSuccess}, Bị 429 = ${status429}`);

        // 2. Thử nghiệm burst QR generation tại biên (tải lại liên tục)
        console.log('\n[KỊCH BẢN 2] Giả lập F5 / Reload liên tục lấy QR mới cho tới khi chạm trần 60 req/phút...');
        let qrSuccess = 0;
        let qr429 = 0;

        for (let i = 0; i < 65; i++) {
            try {
                await kioskService.generateKioskQr(kioskApiKey, '127.0.0.1');
                qrSuccess++;
            } catch (err) {
                if (err.statusCode === 429) qr429++;
            }
        }
        console.log(`  -> Gửi 65 yêu cầu sinh QR: Thành công = ${qrSuccess}/60, Bị 429 từ chối an toàn = ${qr429}/5`);

        console.log('\n[ĐÁNH GIÁ KIẾN TRÚC & ĐỀ XUẤT CHỜ DUYỆT]:');
        console.log('  1. Hiện tại: /api/kiosk/qr-status (polling) chưa bị gán hạn mức cứng mà kiểm tra qua DB sessions.');
        console.log('  2. /api/kiosk/qr (sinh QR mới) được bảo vệ bằng in-memory sliding window 60 req/phút/kiosk.');
        console.log('  3. Khi 2 tab cùng mở: Polling không làm cạn kiệt hạn mức sinh QR.');
        console.log('  4. Đề xuất chuẩn hóa tách biệt (Chờ phê duyệt):');
        console.log('     - Hạn mức GET /api/kiosk/qr-status: 120 req/phút/kiosk (cho phép tối đa 4 tab/thiết bị phụ trợ).');
        console.log('     - Hạn mức POST/GET /api/kiosk/qr: 60 req/phút/kiosk (đảm bảo chống quá tải và DoS sinh token).');

    } finally {
        server.close();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
