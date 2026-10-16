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
