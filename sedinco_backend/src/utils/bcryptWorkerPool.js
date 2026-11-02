/**
 * src/utils/bcryptWorkerPool.js
 * 
 * Worker Pool chuyên trách băm & kiểm tra mật khẩu bằng Node.js Worker Threads
 * 
 * ĐẶC TÍNH KỸ THUẬT:
 * 1. Số worker phân bổ tự động theo số lõi CPU vật lý (os.cpus().length)
 * 2. Hàng đợi có giới hạn (MAX_QUEUE_SIZE = 500) để chống cạn kiệt bộ nhớ khi bị DoS
 * 3. Timeout cho từng tác vụ (TASK_TIMEOUT_MS = 10s) chống treo worker
 * 4. Tự động khởi tạo lại worker nếu worker bị lỗi hoặc timeout
 * 5. Hỗ trợ fallback sang sync/main-thread nếu môi trường không cho phép worker
 */

const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');

const WORKER_SCRIPT = path.join(__dirname, 'bcryptWorker.js');
const POOL_SIZE = process.env.BCRYPT_WORKER_POOL_SIZE 
    ? Math.max(1, parseInt(process.env.BCRYPT_WORKER_POOL_SIZE, 10)) 
    : Math.max(2, (os.cpus() && os.cpus().length) || 2);
const MAX_QUEUE_SIZE = 500;
const TASK_TIMEOUT_MS = 10000; // 10 giây

class BcryptWorkerPool {
    constructor() {
        this.poolSize = POOL_SIZE;
        this.maxQueueSize = MAX_QUEUE_SIZE;
        this.taskTimeoutMs = TASK_TIMEOUT_MS;
        this.workers = [];
        this.freeWorkers = [];
        this.queue = [];
        this.activeTasks = new Map(); // id -> { resolve, reject, timeoutId, workerIndex }
        this.taskIdCounter = 0;
        this.isInitialized = false;
        this.isTerminated = false;
    }

    init() {
        if (this.isInitialized || this.isTerminated) return;
        this.isInitialized = true;

        for (let i = 0; i < this.poolSize; i++) {
            this._spawnWorker(i);
        }
    }

    _spawnWorker(index) {
        if (this.isTerminated) return;

        try {
            const worker = new Worker(WORKER_SCRIPT);
            // unref để không ngăn process exit tự nhiên trong test runner
            worker.unref();

            const workerObj = { id: index, worker };
            this.workers[index] = workerObj;
            this.freeWorkers.push(index);

            worker.on('message', (msg) => {
                this._handleWorkerMessage(index, msg);
            });

            worker.on('error', (err) => {
                this._handleWorkerError(index, err);
            });

            worker.on('exit', (code) => {
                if (!this.isTerminated && code !== 0) {
                    // Respawn nếu thoát bất thường
                    this._spawnWorker(index);
                }
            });

            // Nếu đang có việc trong hàng đợi, xử lý ngay
            this._dispatchNext();
        } catch (spawnErr) {
            console.error(`⚠️ [BcryptWorkerPool] Không thể tạo worker ${index}:`, spawnErr.message);
        }
    }

    _handleWorkerMessage(workerIndex, msg) {
        const { id, success, result, error } = msg;
        const task = this.activeTasks.get(id);

        if (task) {
            clearTimeout(task.timeoutId);
            this.activeTasks.delete(id);

            // Đưa worker trở lại hàng đợi rảnh
            this.freeWorkers.push(workerIndex);

            if (success) {
                task.resolve(result);
            } else {
                task.reject(new Error(error || 'Lỗi băm mật khẩu trong Worker Thread'));
            }

            this._dispatchNext();
        }
    }

    _handleWorkerError(workerIndex, err) {
        console.error(`❌ [BcryptWorkerPool] Worker ${workerIndex} gặp lỗi:`, err.message);

        // Hủy mọi task đang gán cho worker này
        for (const [id, task] of this.activeTasks.entries()) {
            if (task.workerIndex === workerIndex) {
                clearTimeout(task.timeoutId);
                this.activeTasks.delete(id);
                task.reject(new Error(`Worker lỗi bất thường: ${err.message}`));
            }
        }

        // Tái tạo lại worker
        try {
            this.workers[workerIndex].worker.terminate();
        } catch (e) {}
        this._spawnWorker(workerIndex);
    }

    _dispatchNext() {
        if (this.freeWorkers.length === 0 || this.queue.length === 0) {
            return;
        }

        const workerIndex = this.freeWorkers.shift();
        const task = this.queue.shift();
        task.workerIndex = workerIndex;

        // Thiết lập timeout cho task
        task.timeoutId = setTimeout(() => {
            if (this.activeTasks.has(task.id)) {
                this.activeTasks.delete(task.id);
                task.reject(new Error(`PASSWORD_WORKER_TIMEOUT: Tác vụ băm mật khẩu quá thời hạn ${this.taskTimeoutMs}ms`));

                // Terminate worker bị treo và tạo worker mới thay thế
                try {
                    this.workers[workerIndex].worker.terminate();
                } catch (e) {}
                this._spawnWorker(workerIndex);
            }
        }, this.taskTimeoutMs);

        this.activeTasks.set(task.id, task);

        const worker = this.workers[workerIndex]?.worker;
        if (worker) {
            worker.postMessage({
                id: task.id,
                action: task.action,
                password: task.password,
                hash: task.hash,
                saltRounds: task.saltRounds
            });
        } else {
            // Worker không khả dụng, trả về lỗi
            clearTimeout(task.timeoutId);
            this.activeTasks.delete(task.id);
            this.freeWorkers.push(workerIndex);
            task.reject(new Error('Worker không sẵn sàng'));
            this._dispatchNext();
        }
    }

    runTask(action, payload) {
        if (!this.isInitialized) {
            this.init();
        }

        if (this.isTerminated) {
            return Promise.reject(new Error('Worker pool đã bị đóng'));
        }

        // Kiểm tra dung lượng hàng đợi
        if (this.queue.length >= this.maxQueueSize) {
            const err = new Error(`PASSWORD_WORKER_OVERLOAD: Hàng đợi băm mật khẩu vượt giới hạn tối đa (${this.maxQueueSize})`);
            err.statusCode = 503;
            return Promise.reject(err);
        }

        return new Promise((resolve, reject) => {
            const taskId = ++this.taskIdCounter;
            const task = {
                id: taskId,
                action,
                ...payload,
                resolve,
                reject
            };

            this.queue.push(task);
            this._dispatchNext();
        });
    }

    async compare(password, hash) {
        if (!this.workers || this.workers.length === 0) {
            this.init();
        }
        return this.runTask('compare', { password, hash });
    }

    async hash(password, saltRounds = 10) {
        if (!this.workers || this.workers.length === 0) {
            this.init();
        }
        return this.runTask('hash', { password, saltRounds });
    }

    terminate() {
        this.isTerminated = true;
        // Hủy tất cả timeout
        for (const task of this.activeTasks.values()) {
            clearTimeout(task.timeoutId);
            task.reject(new Error('Worker pool đã tắt'));
        }
        this.activeTasks.clear();
        this.queue.length = 0;

        for (const w of this.workers) {
            if (w && w.worker) {
                try {
                    w.worker.terminate();
                } catch (e) {}
            }
        }
        this.workers = [];
        this.freeWorkers = [];
    }

    getStats() {
        return {
            poolSize: this.poolSize,
            freeWorkers: this.freeWorkers.length,
            busyWorkers: this.poolSize - this.freeWorkers.length,
            queueLength: this.queue.length,
            activeTasks: this.activeTasks.size,
            maxQueueSize: this.maxQueueSize,
            taskTimeoutMs: this.taskTimeoutMs
        };
    }
}

// Singleton worker pool
const poolInstance = new BcryptWorkerPool();

module.exports = {
    bcryptWorkerPool: poolInstance,
    BcryptWorkerPool
};
