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
    timezone: '+07:00', // Ép parse timestamp theo múi giờ Việt Nam
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

// Ép múi giờ '+07:00' ngay khi tạo kết nối MySQL để đồng bộ hoàn toàn với giờ Việt Nam (Asia/Ho_Chi_Minh)
pool.on('connection', (connection) => {
    connection.query("SET time_zone = '+07:00'");
});

// Helper thực thi truy vấn dạng Promise
function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        pool.query(sql, params, (err, results, fields) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

/**
 * Thực thi một chuỗi truy vấn trong một Transaction ACID duy nhất.
 * Tự động COMMIT khi thành công, hoặc ROLLBACK nếu có lỗi ném ra.
 */
function withTransaction(callback) {
    return new Promise((resolve, reject) => {
        pool.getConnection((connErr, connection) => {
            if (connErr) return reject(connErr);

            connection.beginTransaction(async (txErr) => {
                if (txErr) {
                    connection.release();
                    return reject(txErr);
                }

                const txQuery = (sql, params = []) => {
                    return new Promise((res, rej) => {
                        connection.query(sql, params, (qErr, results) => {
                            if (qErr) return rej(qErr);
                            res(results);
                        });
                    });
                };

                try {
                    const result = await callback(txQuery, connection);
                    connection.commit((commitErr) => {
                        if (commitErr) {
                            return connection.rollback(() => {
                                connection.release();
                                reject(commitErr);
                            });
                        }
                        connection.release();
                        resolve(result);
                    });
                } catch (actionErr) {
                    connection.rollback(() => {
                        connection.release();
                        reject(actionErr);
                    });
                }
            });
        });
    });
}

/**
 * Kiểm tra xác thực múi giờ CSDL khi khởi động
 */
async function verifyDatabaseTimezone() {
    try {
        const rows = await query("SELECT @@session.time_zone as session_tz, @@global.time_zone as global_tz, NOW() as current_db_time");
        const sessionTz = rows && rows[0] ? rows[0].session_tz : 'UNKNOWN';
        if (sessionTz !== '+07:00') {
            console.warn(`[CẢNH BÁO MÚI GIỜ] CSDL session time_zone là ${sessionTz}, khuyến nghị '+07:00'!`);
        }
        return rows[0];
    } catch (err) {
        console.error('[LỖI MÚI GIỜ] Không thể kiểm tra múi giờ CSDL:', err.message);
        return null;
    }
}

module.exports = {
    pool,
    query,
    withTransaction,
    verifyDatabaseTimezone,
    dbConfig
};
