/**
 * src/utils/bcryptWorker.js
 * 
 * Worker Thread chuyên trách xử lý mã hóa CPU-bound (bcryptjs cost 10)
 * Chạy độc lập trên thread pool để không làm block Main Event Loop của Express.
 */

const { parentPort } = require('worker_threads');
const bcrypt = require('bcryptjs');

if (parentPort) {
    parentPort.on('message', (task) => {
        const { id, action, password, hash, saltRounds } = task;
        try {
            if (action === 'compare') {
                const result = bcrypt.compareSync(password, hash);
                parentPort.postMessage({ id, success: true, result });
            } else if (action === 'hash') {
                const result = bcrypt.hashSync(password, saltRounds || 10);
                parentPort.postMessage({ id, success: true, result });
            } else {
                parentPort.postMessage({ id, success: false, error: `Hành động không xác định: ${action}` });
            }
        } catch (err) {
            parentPort.postMessage({ id, success: false, error: err.message });
        }
    });
}
