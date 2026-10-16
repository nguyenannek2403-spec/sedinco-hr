const app = require('./app');
const env = require('./config/env');
const { pool, dbConfig } = require('./config/db');
const { initDatabase } = require('./database/initDb');

// Kiểm tra kết nối ban đầu tới MySQL Pool
pool.getConnection((err, conn) => {
    if (err) {
        console.error('❌ Lỗi kết nối MySQL Pool:', err.message);
        return;
    }
    console.log(`✅ Đã kết nối MySQL Pool thành công (${dbConfig.host}:${dbConfig.port}/${dbConfig.database})!`);
    conn.release();
    initDatabase();
});

const server = app.listen(env.PORT, () => {
    console.log(`🚀 Sedinco HR Backend API đang chạy tại cổng ${env.PORT} [${env.NODE_ENV}]`);
});

module.exports = server;
