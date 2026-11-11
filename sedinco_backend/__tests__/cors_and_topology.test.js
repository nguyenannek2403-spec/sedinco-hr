/**
 * sedinco_backend/__tests__/cors_and_topology.test.js
 * 
 * Kiểm thử toàn diện:
 * 1. Topo hai địa chỉ & CORS (Mục B.2, B.4)
 * 2. Header X-Request-Id & Structured Log lỗi (Mục C.1)
 * 3. Báo cáo lỗi client /api/client-errors (Mục C.2)
 * 4. Tóm tắt lỗi /api/diagnostics/recent-logs (Mục C.3)
 */

const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

describe('CORS, Topo Hai Địa Chỉ & Giám Sát Staging (Mục B & C)', () => {
    let app;
    let server;
    let baseUrl;
    let allowedOrigin1 = 'http://localhost:4173';
    let allowedOrigin2 = 'https://sedinco.pages.dev';
    let disallowedOrigin = 'https://malicious-attacker.com';

    before(async () => {
        process.env.NODE_ENV = 'staging';
        process.env.JWT_SECRET = 'sedinco_jwt_secret_dev_local_123456789_at_least_32_chars';
        process.env.CORS_ORIGIN = `${allowedOrigin1},${allowedOrigin2}`;
        process.env.ENABLE_DIAGNOSTICS = 'true';
        process.env.ENABLE_CLIENT_ERROR_REPORTING = 'true';

        app = require('../src/app');

        await new Promise((resolve) => {
            server = http.createServer(app);
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    const { after } = require('node:test');
    after(() => {
        if (server) server.close();
    });

    beforeEach(() => {
        const { resetStagingEvents } = require('../src/utils/stagingLogStore');
        resetStagingEvents();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Kiểm tra CORS: Preflight, Origins, Headers, Error States (Mục B.2)
    // ─────────────────────────────────────────────────────────────────────────
    test('B.2.1: Preflight (OPTIONS) từ origin được phép thành công và mang đủ headers', async () => {
        const res = await fetch(`${baseUrl}/api/health`, {
            method: 'OPTIONS',
            headers: {
                'Origin': allowedOrigin1,
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type, Authorization, x-kiosk-key, X-Request-Id'
            }
        });

        assert.equal(res.status === 204 || res.status === 200, true, 'Preflight phải trả về 200 hoặc 204');
        assert.equal(res.headers.get('access-control-allow-origin'), allowedOrigin1);
        assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
        const allowedHeaders = res.headers.get('access-control-allow-headers') || '';
        assert.equal(allowedHeaders.toLowerCase().includes('authorization'), true);
        assert.equal(allowedHeaders.toLowerCase().includes('content-type'), true);
    });

    test('B.2.2: Yêu cầu GET thật từ origin được phép 2 thành công và mang header CORS', async () => {
        const res = await fetch(`${baseUrl}/api/health`, {
            headers: { 'Origin': allowedOrigin2 }
        });

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('access-control-allow-origin'), allowedOrigin2);
        assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    });

    test('B.2.3: Yêu cầu từ origin lạ bị từ chối / không được cấp phép CORS', async () => {
        const res = await fetch(`${baseUrl}/api/health`, {
            headers: { 'Origin': disallowedOrigin }
        });

        // Bị chặn bởi CORS middleware: status 403 hoặc không có access-control-allow-origin
        const allowOriginHeader = res.headers.get('access-control-allow-origin');
        assert.notEqual(allowOriginHeader, disallowedOrigin, 'Tuyệt đối không cấp phép cho origin lạ');
    });

    test('B.2.4: Phản hồi lỗi 404 VẪN mang header CORS nếu origin hợp lệ', async () => {
        const res = await fetch(`${baseUrl}/api/non-existent-route-12345`, {
            headers: { 'Origin': allowedOrigin1 }
        });

        assert.equal(res.status, 404);
        assert.equal(res.headers.get('access-control-allow-origin'), allowedOrigin1);
        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(typeof data.request_id, 'string');
    });

    test('B.2.5: Phản hồi lỗi 401 Unauthorized VẪN mang header CORS để frontend đọc được', async () => {
        // Gọi route /api/employees yêu cầu auth mà không có token
        const res = await fetch(`${baseUrl}/api/employees`, {
            headers: { 'Origin': allowedOrigin1 }
        });

        assert.equal(res.status, 401);
        assert.equal(res.headers.get('access-control-allow-origin'), allowedOrigin1);
        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(typeof data.request_id, 'string');
    });

    test('B.2.6: Luồng đăng nhập POST /api/auth/login qua CORS mang đủ header CORS', async () => {
        // 1. Thử đăng nhập sai mật khẩu qua CORS
        const badRes = await fetch(`${baseUrl}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': allowedOrigin1
            },
            body: JSON.stringify({ ma_nv: 'NV_TEST_NOT_FOUND', password: 'wrongpassword' })
        });

        assert.equal(badRes.status, 200);
        assert.equal(badRes.headers.get('access-control-allow-origin'), allowedOrigin1);
        assert.equal(badRes.headers.get('access-control-allow-credentials'), 'true');
        const badData = await badRes.json();
        assert.equal(badData.success, false);
        assert.equal(typeof badData.request_id, 'string');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Kiểm tra X-Request-Id (Mục C.1)
    // ─────────────────────────────────────────────────────────────────────────
    test('C.1.1: Mọi yêu cầu đều tự sinh X-Request-Id nếu client không gửi', async () => {
        const res = await fetch(`${baseUrl}/api/health`);
        const reqId = res.headers.get('x-request-id');
        assert.ok(reqId, 'Header X-Request-Id phải luôn tồn tại');
        assert.equal(reqId.length >= 8, true);
    });

    test('C.1.2: Server tôn trọng X-Request-Id hợp lệ từ client gửi lên', async () => {
        const customId = 'custom-request-id-abcdef-12345';
        const res = await fetch(`${baseUrl}/api/health`, {
            headers: { 'X-Request-Id': customId }
        });
        assert.equal(res.headers.get('x-request-id'), customId);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Kiểm tra Diagnostics Origin & Logs (Mục B.4 & C.3)
    // ─────────────────────────────────────────────────────────────────────────
    test('B.4.1: Endpoint diagnostics hiển thị request_origin server nhìn thấy', async () => {
        const { generateToken } = require('../src/middlewares/authMiddleware');
        const adminToken = generateToken({ ma_nv: 'NV_ADM01', role: 'admin' });

        const testOrigin = 'https://sedinco.pages.dev';
        const res = await fetch(`${baseUrl}/api/diagnostics/status`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Origin': testOrigin
            }
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.success, true);
        assert.equal(data.request_origin, testOrigin);
        assert.ok(Array.isArray(data.cors_origins_configured));
        assert.equal(data.cors_origins_configured.includes(testOrigin), true);

        // Kiểm tra thêm /api/diagnostics/recent-logs
        const logsRes = await fetch(`${baseUrl}/api/diagnostics/recent-logs?hours=1`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Origin': testOrigin
            }
        });
        assert.equal(logsRes.status, 200);
        const logsData = await logsRes.json();
        assert.equal(logsData.success, true);
        assert.equal(typeof logsData.total, 'number');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Kiểm tra Endpoint Client Errors (Mục C.2, C.3)
    // ─────────────────────────────────────────────────────────────────────────
    test('C.2.1: Tiếp nhận báo cáo lỗi hợp lệ từ client, làm sạch và ghi nhận', async () => {
        const payload = {
            route: '/attendance/checkin',
            error_message: 'Lỗi GPS ngoài bán kính công ty 120m',
            api_code: 'OUT_OF_BOUNDS',
            api_status: 400,
            role: 'worker'
        };

        const res = await fetch(`${baseUrl}/api/client-errors`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': allowedOrigin1
            },
            body: JSON.stringify(payload)
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.success, true);
        assert.equal(data.reported, true);
        assert.ok(data.request_id);

        // Kiểm tra trong log store
        const { getRecentEvents } = require('../src/utils/stagingLogStore');
        const summary = getRecentEvents(1);
        assert.equal(summary.total, 1);
        assert.equal(summary.by_route['/attendance/checkin'], 1);
        assert.equal(summary.by_role['worker'], 1);
        assert.equal(summary.recent_items[0].error_message, 'Lỗi GPS ngoài bán kính công ty 120m');
    });

    test('C.2.2: Từ chối payload chứa script nguy hiểm (XSS injection attempt)', async () => {
        const payload = {
            route: '/test',
            error_message: '<script>alert("hacked")</script>',
            role: 'anonymous'
        };

        const res = await fetch(`${baseUrl}/api/client-errors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(data.code, 'INVALID_PAYLOAD');
    });

    test('C.2.3: Khi cờ ENABLE_CLIENT_ERROR_REPORTING=false thì endpoint trả về 404', async () => {
        process.env.ENABLE_CLIENT_ERROR_REPORTING = 'false';

        const res = await fetch(`${baseUrl}/api/client-errors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ route: '/test', error_message: 'Test' })
        });

        assert.equal(res.status, 404);
        process.env.ENABLE_CLIENT_ERROR_REPORTING = 'true';
    });
});
