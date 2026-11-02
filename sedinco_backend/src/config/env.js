const path = require('path');
const dotenv = require('dotenv');

if (process.env.NODE_ENV === 'test') {
    dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
    dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });
}
dotenv.config();

const env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT ? Number(process.env.PORT) : 5000,
    DB_HOST: process.env.DB_HOST || '127.0.0.1',
    DB_PORT: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    DB_USER: process.env.DB_USER || 'root',
    DB_PASSWORD: process.env.DB_PASSWORD || '',
    DB_NAME: process.env.DB_NAME || 'sedinco_hr',
    DB_SSL: process.env.DB_SSL === 'true' || Boolean(process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud.com')),
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
    // TRUST_PROXY: số hop proxy tin cậy (1 = trực tiếp sau 1 reverse proxy như Nginx/Render)
    // false = không tin cậy X-Forwarded-For (default local), 1 = Render/Nginx, 'loopback' = chỉ local
    TRUST_PROXY: process.env.TRUST_PROXY !== undefined ? process.env.TRUST_PROXY : false
};

module.exports = env;

