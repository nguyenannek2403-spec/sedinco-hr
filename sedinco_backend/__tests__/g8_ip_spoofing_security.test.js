/**
 * __tests__/g8_ip_spoofing_security.test.js
 * 
 * KIỂM THỬ BẢO MẬT CHỐNG GIẢ MẠO IP (IP SPOOFING & TRUST PROXY HARDENING - G8.4 MỤC A)
 * 
 * 5 Ca kiểm thử then chốt:
 * (a) TC-G8-IP-01: TRUST_PROXY=false, nhiều request sai cùng tài khoản với X-Forwarded-For khác nhau -> bị gom vào 1 IP thật và khóa 429
 * (b) TC-G8-IP-02: Kẻ tấn công đặt XFF = IP quen thuộc của nạn nhân rồi thử sai -> nạn nhân từ IP thật vẫn đăng nhập thành công
 * (c) TC-G8-IP-03: IP quen thuộc không thể bị giả mạo / lách luật bằng header X-Forwarded-For
 * (d) TC-G8-IP-04: TRUST_PROXY=1 với proxy giả lập: lấy đúng client IP do proxy thêm (phần tử cuối chuỗi), không lấy IP giả phía trước
 * (e) TC-G8-IP-05: Kiosk last_ip không bị giả mạo bằng header XFF khi TRUST_PROXY=false
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');

const DB_NAME = process.env.DB_NAME || 'sedinco_hr_test';
if (!DB_NAME.includes('test')) {
    throw new Error(`[CHỐT CHẶN BẢO MẬT] DB_NAME="${DB_NAME}" không chứa "test"! Hủy bỏ test.`);
}

const { query } = require('../src/config/db');
const authService = require('../src/services/authService');
const kioskService = require('../src/services/kioskService');
const { hashPassword } = require('../src/utils/passwordHelper');
const app = require('../src/app');

describe('G8.4 Mục A: IP Spoofing Prevention & Trust Proxy Hardening', () => {
    let testServer;
    let testBaseUrl;

    before(async () => {
        await new Promise((resolve) => {
            testServer = app.listen(0, () => {
                testBaseUrl = `http://127.0.0.1:${testServer.address().port}`;
                resolve();
            });
        });
    });

    after(async () => {
        if (testServer) {
            await new Promise((resolve) => testServer.close(resolve));
        }
    });

    beforeEach(async () => {
        await authService.resetRateLimitState();
    });

    it('(a) TC-G8-IP-01: TRUST_PROXY=false, 20 request sai với X-Forwarded-For ngẫu nhiên khác nhau -> Bị giới hạn như CÙNG MỘT IP thật (429 sau 5 lần)', async () => {
        const testMaNv = 'NV_IP_TEST_01';
        const correctPass = 'SedincoSecure2026!';
        const hash = hashPassword(correctPass);

        await query(`
            INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'NV Test IP 01', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password=VALUES(password), status='active', is_locked=0
        `, [testMaNv, hash]);

        try {
            let blockedCount = 0;
            let attemptCount = 0;

            // Bắn 20 request đăng nhập sai với 20 header X-Forwarded-For hoàn toàn khác nhau
            for (let i = 1; i <= 20; i++) {
                const fakeXff = `192.168.${Math.floor(i / 10)}.${i % 10}`;
                const res = await fetch(`${testBaseUrl}/api/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Forwarded-For': fakeXff
                    },
                    body: JSON.stringify({ ma_nv: testMaNv, password: `WrongPassword_${i}` })
                });

                attemptCount++;
                const data = await res.json();
                if (data.statusCode === 429 || (data.message && data.message.includes('quá 5 lần'))) {
                    blockedCount++;
                }
            }

            // Đúng 5 lần đầu thử sai -> 15 lần tiếp theo BẮT BUỘC bị 429 khóa tài khoản/IP
            assert.equal(blockedCount, 15, `Kỳ vọng 15 request sau cùng bị chặn 429 do cùng IP socket, thực tế bị chặn: ${blockedCount}`);
        } finally {
            await query('DELETE FROM employees WHERE ma_nv = ?', [testMaNv]);
        }
    });

    it('(b) TC-G8-IP-02: Kẻ tấn công đặt XFF = IP quen thuộc của nạn nhân rồi thử sai 5 lần -> Nạn nhân từ IP thật vẫn đăng nhập thành công', async () => {
        const victimMaNv = 'NV_IP_VICTIM_02';
        const correctPass = 'SedincoSecure2026!';
        const hash = hashPassword(correctPass);

        await query(`
            INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'NV Nan Nhan IP', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password=VALUES(password), status='active', is_locked=0
        `, [victimMaNv, hash]);

        // Giả lập nạn nhân có IP quen thuộc thật là 10.10.10.10 đã từng đăng nhập thành công
        const victimLegitIp = '10.10.10.10';
        await query(`
            INSERT INTO audit_logs (actor_id, actor_role, action, resource, ip_address, created_at)
            VALUES (?, 'worker', 'LOGIN_SUCCESS', 'auth', ?, NOW())
        `, [victimMaNv, victimLegitIp]);

        try {
            // Kẻ tấn công gửi request qua socket (127.0.0.1) giả mạo X-Forwarded-For = 10.10.10.10
            for (let i = 1; i <= 5; i++) {
                await fetch(`${testBaseUrl}/api/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Forwarded-For': victimLegitIp
                    },
                    body: JSON.stringify({ ma_nv: victimMaNv, password: `AttackerGuess_${i}` })
                });
            }

            // Nạn nhân thực tế đăng nhập từ IP thật (gọi trực tiếp service với IP thật của nạn nhân 10.10.10.10)
            const victimLogin = await authService.employeeLogin(victimMaNv, correctPass, victimLegitIp);
            assert.equal(victimLogin.success, true, 'Nạn nhân đăng nhập từ IP thật phải thành công, không bị ảnh hưởng bởi XFF giả mạo của kẻ tấn công!');
        } finally {
            await query('DELETE FROM employees WHERE ma_nv = ?', [victimMaNv]);
            await query('DELETE FROM audit_logs WHERE actor_id = ?', [victimMaNv]);
        }
    });

    it('(c) TC-G8-IP-03: IP quen thuộc không thể bị kích hoạt/giả mạo bằng header X-Forwarded-For', async () => {
        const testMaNv = 'NV_IP_TEST_03';
        const correctPass = 'SedincoSecure2026!';
        const hash = hashPassword(correctPass);

        await query(`
            INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'NV Test IP 03', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password=VALUES(password), status='active', is_locked=0
        `, [testMaNv, hash]);

        // Cấp IP quen thuộc 172.16.0.99 cho NV này
        const legitIp = '172.16.0.99';
        await query(`
            INSERT INTO audit_logs (actor_id, actor_role, action, resource, ip_address, created_at)
            VALUES (?, 'worker', 'LOGIN_SUCCESS', 'auth', ?, NOW())
        `, [testMaNv, legitIp]);

        try {
            // Kẻ tấn công từ socket IP (127.0.0.1) gửi XFF = 172.16.0.99
            // Server TRUST_PROXY=false sẽ nhận IP thực là 127.0.0.1
            const res = await fetch(`${testBaseUrl}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Forwarded-For': legitIp
                },
                body: JSON.stringify({ ma_nv: testMaNv, password: 'WrongPassword' })
            });

            // Kiểm tra rate limit log: key được lưu là composite:NV_IP_TEST_03:127.0.0.1 chứ KHÔNG PHẢI 172.16.0.99
            const rows = await query('SELECT key_name FROM login_rate_limits WHERE target_type = "composite" AND key_name LIKE ?', [`%${testMaNv}%`]);
            assert.ok(rows.length > 0);
            assert.ok(rows[0].key_name.includes('127.0.0.1'), `Key rate limit phải gắn với socket IP 127.0.0.1, nhận được: ${rows[0].key_name}`);
            assert.ok(!rows[0].key_name.includes('172.16.0.99'), 'Key rate limit tuyệt đối không được nhận IP giả 172.16.0.99 từ XFF!');
        } finally {
            await query('DELETE FROM employees WHERE ma_nv = ?', [testMaNv]);
            await query('DELETE FROM audit_logs WHERE actor_id = ?', [testMaNv]);
        }
    });

    it('(d) TC-G8-IP-04: TRUST_PROXY=1 với proxy giả lập: Express lấy đúng client IP do proxy thêm (phần tử cuối), không lấy IP giả phía trước', async () => {
        // Tạo một mini Express app cấu hình trust proxy = 1 để kiểm tra cơ chế phân giải proxy hop
        const proxyApp = express();
        proxyApp.set('trust proxy', 1); // Tin cậy 1 reverse proxy ở trước

        let capturedIp = '';
        proxyApp.use((req, res) => {
            req.clientIp = req.ip;
            capturedIp = req.clientIp;
            res.json({ ip: req.clientIp });
        });

        const proxyServer = proxyApp.listen(0);
        const proxyPort = proxyServer.address().port;

        try {
            // Kịch bản: Client gửi XFF giả mạo "198.51.100.1", reverse proxy nối thêm client IP thật "203.0.113.195"
            // Chuỗi X-Forwarded-For nhận được: "198.51.100.1, 203.0.113.195"
            const res = await fetch(`http://127.0.0.1:${proxyPort}/`, {
                headers: {
                    'X-Forwarded-For': '198.51.100.1, 203.0.113.195'
                }
            });
            const data = await res.json();

            // Với trust proxy = 1, Express bỏ qua hop cuối (socket kết nối) và lấy địa chỉ gần nhất được thêm vào chuỗi: 203.0.113.195
            assert.equal(data.ip, '203.0.113.195', 'Express trust proxy 1 phải lấy đúng IP client thực tế do proxy ghi nhận, không lấy IP giả 198.51.100.1!');
        } finally {
            await new Promise((res) => proxyServer.close(res));
        }
    });

    it('(e) TC-G8-IP-05: Kiosk last_ip không bị giả mạo bằng header XFF khi TRUST_PROXY=false', async () => {
        // Đăng ký Kiosk test
        const kioskName = `TEST_IP_SPOOF_KIOSK_${Date.now()}`;
        const kiosk = await kioskService.registerKiosk({
            kiosk_name: kioskName,
            branch_id: 1,
            created_by: 'admin'
        });

        try {
            // Gọi endpoint sinh QR kèm header X-Forwarded-For giả mạo
            const fakeIp = '203.0.113.99';
            const res = await fetch(`${testBaseUrl}/api/kiosk/qr`, {
                method: 'GET',
                headers: {
                    'x-kiosk-key': kiosk.api_key,
                    'X-Forwarded-For': fakeIp
                }
            });
            assert.equal(res.status, 200);

            // Kiểm tra last_ip trong CSDL kiosk_devices
            const rows = await query('SELECT last_ip FROM kiosk_devices WHERE id = ?', [kiosk.id]);
            assert.ok(rows.length > 0);
            const recordedIp = rows[0].last_ip;

            // Với TRUST_PROXY=false, recordedIp phải là socket IP 127.0.0.1 (hoặc ::1), tuyệt đối không được là 203.0.113.99
            assert.notEqual(recordedIp, fakeIp, `last_ip không được lưu IP giả mạo ${fakeIp}`);
            assert.ok(recordedIp === '127.0.0.1' || recordedIp === '::1' || recordedIp === '::ffff:127.0.0.1', `last_ip phải là loopback socket IP, nhận được: ${recordedIp}`);
        } finally {
            await query('DELETE FROM kiosk_devices WHERE id = ?', [kiosk.id]);
            await query('DELETE FROM dynamic_qr_sessions WHERE branch_id = 1 AND session_token LIKE "kiosk:%"');
            kioskService.resetRateLimit();
        }
    });
});
