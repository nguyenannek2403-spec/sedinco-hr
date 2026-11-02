/**
 * sedinco_backend/__tests__/g6_diagnostics.test.js
 * 
 * Kiểm thử tự động tính năng tự chẩn đoán /diagnostics (G6.1 - Mục C)
 *   (a) Cờ tắt (ENABLE_DIAGNOSTICS=false/undefined) -> HTTP 404
 *   (b) Vai trò khác admin (worker, accountant) -> HTTP 403
 *   (c) Phản hồi tuyệt đối KHÔNG chứa ZALO_APP_SECRET hay token đầy đủ
 */

const { it, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '123456';
process.env.DB_NAME = 'sedinco_hr_test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'sedinco_super_secure_jwt_secret_key_2026_local_test_32chars';
process.env.QR_SECRET = 'sedinco_super_secure_qr_secret_key_2026_local_test_32chars';
process.env.ZALO_APP_SECRET = 'real_super_secret_zalo_app_key_never_leak_to_client';

const diagnosticsController = require('../src/controllers/diagnosticsController');
const { generateToken } = require('../src/middlewares/authMiddleware');

function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
}

describe('G6.1 - Mục C: Kiểm thử An Toàn /diagnostics', () => {
    // (a) Cờ tắt -> HTTP 404
    it('TC-G6-DIAG-01: Cờ ENABLE_DIAGNOSTICS tắt -> Trả về HTTP 404', async () => {
        delete process.env.ENABLE_DIAGNOSTICS;
        const req = { user: { role: 'admin', username: 'admin' } };
        const res = createMockRes();
        let nextCalled = false;

        diagnosticsController.checkDiagnosticsAccess(req, res, () => { nextCalled = true; });

        assert.equal(res.statusCode, 404, 'Khi cờ tắt, phải trả về HTTP 404');
        assert.equal(nextCalled, false, 'Không được phép gọi next()');
        assert.ok(res.body.message.includes('vô hiệu hóa') || res.body.message.includes('không khả dụng'));
    });

    // (b) Vai trò khác admin -> HTTP 403
    it('TC-G6-DIAG-02: Vai trò không phải Admin (worker, accountant) -> Trả về HTTP 403', async () => {
        process.env.ENABLE_DIAGNOSTICS = 'true';

        for (const badRole of ['worker', 'accountant']) {
            const req = { user: { role: badRole, ma_nv: 'EMP001' } };
            const res = createMockRes();
            let nextCalled = false;

            diagnosticsController.checkDiagnosticsAccess(req, res, () => { nextCalled = true; });

            assert.equal(res.statusCode, 403, `Role ${badRole} phải bị từ chối HTTP 403`);
            assert.equal(nextCalled, false);
            assert.ok(res.body.message.includes('Chỉ Quản trị viên') || res.body.message.includes('bị từ chối'));
        }
    });

    // (c) Phản hồi an toàn: không chứa ZALO_APP_SECRET hay token đầy đủ
    it('TC-G6-DIAG-03: Phản hồi tuyệt đối KHÔNG chứa ZALO_APP_SECRET hay access token đầy đủ', async () => {
        process.env.ENABLE_DIAGNOSTICS = 'true';
        const rawSecret = process.env.ZALO_APP_SECRET;
        const dummyToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_access_token_full_secret';

        const reqStatus = { user: { role: 'admin', username: 'admin' } };
        const resStatus = createMockRes();
        await diagnosticsController.getSystemStatus(reqStatus, resStatus);

        const statusStr = JSON.stringify(resStatus.body);
        assert.equal(statusStr.includes(rawSecret), false, 'getSystemStatus không được chứa ZALO_APP_SECRET');

        const reqVerify = {
            user: { role: 'admin', username: 'admin' },
            body: { access_token: dummyToken }
        };
        const resVerify = createMockRes();
        await diagnosticsController.verifyZaloUser(reqVerify, resVerify);

        const verifyStr = JSON.stringify(resVerify.body);
        assert.equal(verifyStr.includes(rawSecret), false, 'verifyZaloUser không được chứa ZALO_APP_SECRET');
        assert.equal(verifyStr.includes(dummyToken), false, 'verifyZaloUser không được để lộ access_token đầy đủ');
        assert.ok(verifyStr.includes('masked_token'), 'Phải che token (masked_token)');
    });

    // (d) Khởi động phải từ chối nếu NODE_ENV=production và ENABLE_DIAGNOSTICS=true
    it('TC-G6-DIAG-STARTUP-01: Khởi động phải từ chối ném lỗi Fatal nếu NODE_ENV=production và ENABLE_DIAGNOSTICS=true', () => {
        const prevEnv = process.env.NODE_ENV;
        const prevDiag = process.env.ENABLE_DIAGNOSTICS;
        try {
            process.env.NODE_ENV = 'production';
            process.env.ENABLE_DIAGNOSTICS = 'true';
            assert.throws(() => {
                diagnosticsController.assertDiagnosticsAllowedAtStartup();
            }, /Tuyệt đối không được kích hoạt ENABLE_DIAGNOSTICS trong môi trường production/);
        } finally {
            process.env.NODE_ENV = prevEnv;
            process.env.ENABLE_DIAGNOSTICS = prevDiag;
        }
    });
});

