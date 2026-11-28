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

const COMMON_PASSWORDS = new Set([
    '123456', '12345678', '123456789', '111111', '11111111', '000000', '00000000',
    'password', 'password123', 'admin123', 'sedinco123', 'sedinco@123', 'qwertyuiop',
    '654321', '87654321', 'iloveyou', 'welcome123'
]);

function validatePasswordPolicy(new_password, ma_nv = '') {
    if (!new_password || typeof new_password !== 'string') {
        return { valid: false, message: 'Vui lòng nhập mật khẩu mới!' };
    }
    const trimmed = new_password.trim();
    if (trimmed.length < 8) {
        return { valid: false, message: 'Mật khẩu mới phải có độ dài tối thiểu 8 ký tự!' };
    }
    const lower = trimmed.toLowerCase();
    if (COMMON_PASSWORDS.has(lower)) {
        return { valid: false, message: 'Mật khẩu này quá phổ biến và dễ đoán. Vui lòng thiết lập mật khẩu mạnh hơn!' };
    }
    if (ma_nv && typeof ma_nv === 'string') {
        const cleanMaNv = ma_nv.toLowerCase().trim();
        if (cleanMaNv.length >= 3 && lower.includes(cleanMaNv)) {
            return { valid: false, message: 'Mật khẩu mới không được trùng hoặc chứa mã nhân viên!' };
        }
    }
    return { valid: true };
}

module.exports = {
    hashPassword,
    hashPasswordAsync,
    comparePassword,
    comparePasswordAsync,
    isBcryptHash,
    isDefaultPassword,
    validatePasswordPolicy,
    bcryptWorkerPool
};
