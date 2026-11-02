const mysql = require('mysql2');
const env = require('./env');

const dbConfig = {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
};

if (env.DB_SSL) {
    dbConfig.ssl = { rejectUnauthorized: false };
}

// CHỐT CHẶN BẢO MẬT: Tuyệt đối không cho phép chạy test hoặc tấn công trên Database production / Cloud
if (process.env.NODE_ENV === 'test' || env.NODE_ENV === 'test') {
    if (!env.DB_NAME || !env.DB_NAME.toLowerCase().includes('test')) {
        throw new Error(`[CHỐT CHẶN AN TOÀN] Từ chối chạy test: DB_NAME "${env.DB_NAME}" không chứa chữ "test"! Hãy sử dụng DB test local (ví dụ: sedinco_hr_test).`);
    }
    if (env.DB_HOST && (env.DB_HOST.includes('aivencloud.com') || env.DB_HOST.includes('render.com') || env.DB_SSL === true)) {
        throw new Error(`[CHỐT CHẶN AN TOÀN] Từ chối chạy test: DB_HOST "${env.DB_HOST}" trỏ tới Cloud / Production. Tuyệt đối chỉ dùng localhost/127.0.0.1.`);
    }
}

const pool = mysql.createPool(dbConfig);

// Helper thực thi truy vấn dạng Promise
function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        pool.query(sql, params, (err, results, fields) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

module.exports = {
    pool,
    query,
    dbConfig
};
