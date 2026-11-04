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

    it('(f) TC-G8-IP-06: Khóa toàn cục (B.2) - 100 IP khác nhau tấn công sai pass -> Kẻ thứ 3 không thể khóa công nhân từ IP quen thuộc với pass đúng', async () => {
        const victimMaNv = 'NV_SEC_GLOBAL_01';
        const correctPass = 'SedincoPass2026!';
        const hash = hashPassword(correctPass);

        await query(`
            INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'NV Global Lockout Test', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password=VALUES(password), status='active', is_locked=0
        `, [victimMaNv, hash]);

        const legitIp = '10.20.30.40';
        await query(`
            INSERT INTO audit_logs (actor_id, actor_role, action, resource, ip_address, created_at)
            VALUES (?, 'worker', 'LOGIN_SUCCESS', 'auth', ?, NOW())
        `, [victimMaNv, legitIp]);

        try {
            // Xác nhận hằng số cấu hình
            assert.equal(authService.ACCOUNT_SOFT_LOCK_THRESHOLD, 10);
            assert.equal(authService.ACCOUNT_GLOBAL_MAX_ATTEMPTS, 30);

            // Giả lập kẻ thứ 3 tấn công phân tán từ 100 IP thật khác nhau (mô phỏng req.ip)
            for (let i = 1; i <= 100; i++) {
                const attackerIp = `198.51.100.${i}`;
                const res = await authService.employeeLogin(victimMaNv, `WrongPass_${i}`, attackerIp);
                assert.equal(res.success, false, `Attacker thử sai lần ${i} phải thất bại`);
            }

            // Kiểm tra bộ đếm toàn cục trong DB: đã đạt 100 lần (> ngưỡng 30)
            const globalRows = await query('SELECT attempt_count, locked_until FROM login_rate_limits WHERE key_name = ?', [`account:${victimMaNv}`]);
            assert.ok(globalRows.length > 0);
            assert.equal(globalRows[0].attempt_count, 100, 'Bộ đếm toàn cục tài khoản phải tích lũy đủ 100 lần thử sai');
            assert.ok(globalRows[0].locked_until !== null, 'Trạng thái locked_until toàn cục phải được kích hoạt');

            // 1. Kiểm tra hành vi đối với công nhân: Đăng nhập từ IP QUEN THUỘC với mật khẩu ĐÚNG
            const legitLogin = await authService.employeeLogin(victimMaNv, correctPass, legitIp);
            assert.equal(legitLogin.success, true, 'Công nhân từ IP quen thuộc với mật khẩu ĐÚNG không bao giờ bị khóa cứng!');
            assert.equal(legitLogin.statusCode, undefined, 'Không được trả về HTTP 429');
            assert.ok(legitLogin.data && legitLogin.data.token, 'Phải sinh JWT token hợp lệ');

            // 2. Kiểm tra hành vi đối với mật khẩu ĐÚNG từ một IP MỚI lạ (172.16.99.1)
            const newIpLogin = await authService.employeeLogin(victimMaNv, correctPass, '172.16.99.1');
            assert.equal(newIpLogin.success, true, 'Mật khẩu đúng từ IP mới vẫn thành công (chỉ bị làm chậm/throttle, không bị khóa cứng)!');
            assert.ok(newIpLogin.data && newIpLogin.data.token);
        } finally {
            await query('DELETE FROM employees WHERE ma_nv = ?', [victimMaNv]);
            await query('DELETE FROM audit_logs WHERE actor_id = ?', [victimMaNv]);
            await query('DELETE FROM login_rate_limits WHERE key_name LIKE ?', [`%${victimMaNv}%`]);
        }
    });

    it('(g) TC-G8-IP-07: Chuẩn hóa IPv6 Subnet /64 & IPv4-mapped IPv6 (B.3) - 100 địa chỉ IPv6 cùng prefix /64 tính chung 1 quota', async () => {
        // 1. Kiểm tra 100 địa chỉ IPv6 khác nhau cùng nằm trong subnet 2001:db8:abcd:12::/64
        const expectedPrefix = '2001:db8:abcd:12::/64';
        for (let i = 1; i <= 100; i++) {
            const hexSuffix = i.toString(16).padStart(4, '0');
            const ipv6Addr = `2001:db8:abcd:0012:0000:0000:0000:${hexSuffix}`;
            const normalized = authService.normalizeClientIp(ipv6Addr);
            assert.equal(normalized, expectedPrefix, `IPv6 ${ipv6Addr} phải chuẩn hóa về subnet prefix ${expectedPrefix}`);
        }

        // 2. Kiểm tra IPv4-mapped IPv6
        assert.equal(authService.normalizeClientIp('::ffff:192.0.2.1'), '192.0.2.1');
        assert.equal(authService.normalizeClientIp('::ffff:127.0.0.1'), '127.0.0.1');

        // 3. Kiểm tra tính chung quota rate limit trên cùng subnet /64
        const testMaNv = 'NV_SEC_IPV6_01';
        const correctPass = 'SedincoIPv6Pass2026!';
        const hash = hashPassword(correctPass);

        await query(`
            INSERT INTO employees (ma_nv, ho_ten, password, role, status, is_locked)
            VALUES (?, 'NV IPv6 Test', ?, 'worker', 'active', 0)
            ON DUPLICATE KEY UPDATE password=VALUES(password), status='active', is_locked=0
        `, [testMaNv, hash]);

        try {
            // Thử sai 5 lần từ 5 địa chỉ IPv6 khác nhau trong cùng subnet /64
            for (let i = 1; i <= 5; i++) {
                const ip = `2001:db8:abcd:0012:0000:0000:0000:000${i}`;
                const res = await authService.employeeLogin(testMaNv, `WrongPass_${i}`, ip);
                assert.equal(res.success, false);
            }

            // Lần thứ 6 thử từ một địa chỉ IPv6 THỨ 6 KHÁC BIỆT nhưng cùng subnet /64
            const ip6 = '2001:db8:abcd:0012:ffff:eeee:dddd:0006';
            const res6 = await authService.employeeLogin(testMaNv, 'WrongPass_6', ip6);
            assert.equal(res6.success, false);
            assert.equal(res6.statusCode, 429, 'Lần thứ 6 từ cùng subnet IPv6 /64 phải bị chặn 429 vì chung quota');
            assert.ok(res6.message.includes('quá 5 lần'));
        } finally {
            await query('DELETE FROM employees WHERE ma_nv = ?', [testMaNv]);
            await query('DELETE FROM login_rate_limits WHERE key_name LIKE ?', [`%${testMaNv}%`]);
        }
    });

    it('(h) TC-G8-IP-08: TRUST_PROXY cấu hình chuỗi từ process.env (B.4) - test hợp lệ và ném lỗi khi không hợp lệ', () => {
        // Các giá trị chuỗi hợp lệ
        assert.equal(app.parseAndValidateTrustProxy('false'), false);
        assert.equal(app.parseAndValidateTrustProxy('true'), true);
        assert.equal(app.parseAndValidateTrustProxy('1'), 1);
        assert.equal(app.parseAndValidateTrustProxy('2'), 2);
        assert.equal(app.parseAndValidateTrustProxy('0'), 0);
        assert.equal(app.parseAndValidateTrustProxy('loopback'), 'loopback');
        assert.equal(app.parseAndValidateTrustProxy('linklocal'), 'linklocal');
        assert.equal(app.parseAndValidateTrustProxy('uniquelocal'), 'uniquelocal');
        assert.equal(app.parseAndValidateTrustProxy('127.0.0.1'), '127.0.0.1');
        assert.equal(app.parseAndValidateTrustProxy('10.0.0.0/8, 192.168.0.0/16'), '10.0.0.0/8, 192.168.0.0/16');

        // Các giá trị không hợp lệ phải ném lỗi rõ ràng
        assert.throws(() => app.parseAndValidateTrustProxy('invalid_proxy'), /FATAL: Cấu hình TRUST_PROXY không hợp lệ/);
        assert.throws(() => app.parseAndValidateTrustProxy('-1'), /FATAL: Cấu hình TRUST_PROXY không hợp lệ/);
        assert.throws(() => app.parseAndValidateTrustProxy('evil;drop table'), /FATAL: Cấu hình TRUST_PROXY không hợp lệ/);
        assert.throws(() => app.parseAndValidateTrustProxy('999.999.999.999'), /FATAL: Cấu hình TRUST_PROXY không hợp lệ/);
    });

    it('(i) TC-G8-IP-09: Cảnh báo XFF (B.5) - sanitize control chars, max 100 ký tự và rate limit 1 lần/phút/IP socket', async () => {
        // 1. Kiểm tra làm sạch chuỗi và cắt ngắn
        const rawMalicious = 'XFF\x00\x1b[31m_evil_\r\n_header_' + 'A'.repeat(120);
        const sanitized = app.sanitizeLogString(rawMalicious, 100);
        assert.ok(!sanitized.includes('\x00'), 'Không được chứa null byte');
        assert.ok(!sanitized.includes('\x1b'), 'Không được chứa ESC byte');
        assert.ok(!sanitized.includes('\r') && !sanitized.includes('\n'), 'Không được chứa ký tự xuống dòng');
        assert.ok(sanitized.endsWith('...'), 'Phải kết thúc bằng dấu chấm lửng khi quá 100 ký tự');
        assert.ok(sanitized.length <= 103, `Độ dài không được vượt quá maxLen + 3, thực tế: ${sanitized.length}`);

        // 2. Kiểm tra rate limit log cảnh báo: 50 request liên tiếp từ cùng IP socket chỉ in cảnh báo tối đa 1 lần/phút
        const origWarn = console.warn;
        let warnCount = 0;
        app.lastXffWarnBySocketIp.clear(); // Xóa sạch state trước test
        console.warn = (...args) => {
            const msg = args.join(' ');
            if (msg.includes('Bỏ qua header X-Forwarded-For')) {
                warnCount++;
            }
        };

        try {
            for (let i = 0; i < 50; i++) {
                await fetch(`${testBaseUrl}/api/health`, {
                    headers: { 'X-Forwarded-For': `10.0.0.${i}` }
                });
            }
            assert.equal(warnCount, 1, `Cảnh báo XFF chỉ được log đúng 1 lần cho cùng IP socket trong 1 phút, thực tế log: ${warnCount}`);
        } finally {
            console.warn = origWarn;
        }
    });
});
