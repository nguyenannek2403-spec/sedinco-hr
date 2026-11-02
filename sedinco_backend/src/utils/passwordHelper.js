/**
 * Tiện ích mã hóa & thẩm tra mật khẩu an toàn với bcryptjs
 * Hỗ trợ:
 * 1. Worker Threads Pool: Đẩy tác vụ nặng sang pool Worker Thread để không nghẽn Event Loop.
 * 2. Đồng bộ & Bất đồng bộ: Giữ nguyên các hàm sync cho unit test và migration script.
 * 3. Chuẩn bảo mật B7 (G4): Từ chối hoàn toàn mật khẩu không có hash bcrypt.
 */

const bcrypt = require('bcryptjs');
const { bcryptWorkerPool } = require('./bcryptWorkerPool');
const SALT_ROUNDS = 10;

function hashPassword(password) {
    if (!password || typeof password !== 'string') {
        throw new Error('Mật khẩu không hợp lệ để băm!');
    }
    return bcrypt.hashSync(password, SALT_ROUNDS);
}

async function hashPasswordAsync(password) {
    if (!password || typeof password !== 'string') {
        throw new Error('Mật khẩu không hợp lệ để băm!');
    }
    try {
        return await bcryptWorkerPool.hash(password, SALT_ROUNDS);
    } catch (e) {
        // Fallback sync nếu worker pool gặp sự cố
        return bcrypt.hashSync(password, SALT_ROUNDS);
    }
}

function isBcryptHash(str) {
    if (!str || typeof str !== 'string') return false;
    return str.startsWith('$2a$') || str.startsWith('$2b$') || str.startsWith('$2y$');
}

function comparePassword(inputPassword, storedHashOrPlain) {
    if (!inputPassword || !storedHashOrPlain) return false;

    if (isBcryptHash(storedHashOrPlain)) {
        return bcrypt.compareSync(inputPassword, storedHashOrPlain);
    }

    return false;
}

async function comparePasswordAsync(inputPassword, storedHashOrPlain) {
    if (!inputPassword || !storedHashOrPlain) return false;

    if (isBcryptHash(storedHashOrPlain)) {
        try {
            return await bcryptWorkerPool.compare(inputPassword, storedHashOrPlain);
        } catch (workerErr) {
            // Fallback sync nếu worker thread pool lỗi
            return bcrypt.compareSync(inputPassword, storedHashOrPlain);
        }
    }

    return false;
}

function isDefaultPassword(password) {
    return password === '123456';
}

module.exports = {
    hashPassword,
    hashPasswordAsync,
    comparePassword,
    comparePasswordAsync,
    isBcryptHash,
    isDefaultPassword,
    bcryptWorkerPool
};
