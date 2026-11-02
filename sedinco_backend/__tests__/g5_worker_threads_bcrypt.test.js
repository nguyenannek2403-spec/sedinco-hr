/**
 * __tests__/g5_worker_threads_bcrypt.test.js
 * 
 * Bộ kiểm thử Worker Threads Pool cho băm & xác thực mật khẩu bcryptjs (Cụm B1 - G5)
 * 
 * YÊU CẦU:
 * 1. Worker Threads pool phân bổ theo số lõi CPU (os.cpus().length)
 * 2. Hàng đợi có giới hạn (MAX_QUEUE_SIZE = 500)
 * 3. Timeout cho từng tác vụ (TASK_TIMEOUT_MS)
 * 4. Không nghẽn Main Event Loop của Express
 * 5. Giữ nguyên bcrypt cost 10
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const { bcryptWorkerPool, BcryptWorkerPool } = require('../src/utils/bcryptWorkerPool');
const { hashPasswordAsync, comparePasswordAsync, isBcryptHash } = require('../src/utils/passwordHelper');

describe('G5 - Cụm B1: Worker Threads Bcrypt Pool', () => {

    after(() => {
        bcryptWorkerPool.terminate();
    });

    it('TC-G5-B1-POOL-CORE-01: Worker Pool tự động cấu hình số worker theo số lõi CPU', () => {
        const stats = bcryptWorkerPool.getStats();
        const expectedCores = Math.max(2, (os.cpus() && os.cpus().length) || 2);
        assert.equal(
            stats.poolSize, 
            expectedCores, 
            `Số lượng worker (${stats.poolSize}) phải khớp với số lõi CPU (${expectedCores})`
        );
        assert.equal(stats.maxQueueSize, 500, 'Ngưỡng hàng đợi tối đa phải là 500');
        assert.equal(stats.taskTimeoutMs, 10000, 'Timeout tác vụ băm phải là 10000ms');
    });

    it('TC-G5-B1-ASYNC-COMPARE-01: comparePasswordAsync xác thực chính xác mật khẩu bằng Worker Thread', async () => {
        const password = 'WorkerSecretPass@123';
        const hash = await hashPasswordAsync(password);

        assert.ok(isBcryptHash(hash), 'Chuỗi băm phải có tiền tố bcrypt ($2a$ hoặc $2b$)');

        // Thử đúng
        const isMatch = await comparePasswordAsync(password, hash);
        assert.equal(isMatch, true, 'Worker Thread phải xác thực đúng mật khẩu hợp lệ');

        // Thử sai
        const isWrong = await comparePasswordAsync('wrongPassword', hash);
        assert.equal(isWrong, false, 'Worker Thread phải từ chối mật khẩu sai');
    });

    it('TC-G5-B1-QUEUE-LIMIT-01: Hàng đợi vượt quá maxQueueSize (500) bị từ chối với lỗi quá tải', async () => {
        // Tạo pool riêng với dung lượng nhỏ để kiểm thử tràn hàng đợi
        const customPool = new BcryptWorkerPool();
        customPool.maxQueueSize = 2; // Giới hạn hàng đợi chỉ 2
        customPool.poolSize = 1;     // Chỉ 1 worker
        customPool.init();

        try {
            // Đẩy vào 3 task cùng lúc (1 active, 2 trong hàng đợi)
            const p1 = customPool.compare('pass1', '$2b$10$fakefakefakefakefakefakefakefakefakefakefakefakefakefake');
            const p2 = customPool.compare('pass2', '$2b$10$fakefakefakefakefakefakefakefakefakefakefakefakefakefake');
            const p3 = customPool.compare('pass3', '$2b$10$fakefakefakefakefakefakefakefakefakefakefakefakefakefake');

            // Task thứ 4 vượt quá maxQueueSize (2) -> Bắt buộc bị reject ngay lập tức
            await assert.rejects(async () => {
                await customPool.compare('pass4', '$2b$10$fakefakefakefakefakefakefakefakefakefakefakefakefakefake');
            }, (err) => {
                return err.message.includes('PASSWORD_WORKER_OVERLOAD') && err.statusCode === 503;
            });

            // Chờ các promise trước hoàn tất hoặc reject để dọn dẹp
            await Promise.allSettled([p1, p2, p3]);
        } finally {
            customPool.terminate();
        }
    });

    it('TC-G5-B1-TIMEOUT-RESPAWN-01: Tác vụ quá thời hạn bị ngắt và Worker được tự động phục hồi', async () => {
        const timeoutPool = new BcryptWorkerPool();
        timeoutPool.taskTimeoutMs = 50; // Đặt timeout siêu ngắn 50ms để kích hoạt timeout
        timeoutPool.poolSize = 1;
        timeoutPool.init();

        try {
            // Task bcrypt cost 10 tốn ~60ms, nên timeout 50ms chắc chắn sẽ kích hoạt timeout
            await assert.rejects(async () => {
                await timeoutPool.hash('test_timeout_pass', 10);
            }, (err) => {
                return err.message.includes('PASSWORD_WORKER_TIMEOUT');
            });

            // Sau khi timeout, worker phải được tái tạo tự động
            // Đặt lại timeout hợp lý để kiểm tra worker mới hoạt động
            timeoutPool.taskTimeoutMs = 10000;
            const res = await timeoutPool.compare('test', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
            assert.equal(typeof res, 'boolean', 'Worker tái tạo phải tiếp tục xử lý được task mới');
        } finally {
            timeoutPool.terminate();
        }
    });
});
