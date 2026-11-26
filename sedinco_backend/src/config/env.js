const path = require('path');
const dotenv = require('dotenv');

if (process.env.NODE_ENV === 'test') {
    // Chế độ test: CHỈ nạp .env.test, TUYỆT ĐỐI KHÔNG nạp .env
    dotenv.config({ path: path.resolve(__dirname, '../../.env.test'), quiet: true });
    dotenv.config({ path: path.resolve(__dirname, '../../../.env.test'), quiet: true });
} else if (process.env.NODE_ENV === 'staging') {
    // Chế độ staging: Nạp .env.staging
    dotenv.config({ path: path.resolve(__dirname, '../../.env.staging'), quiet: true });
    dotenv.config({ path: path.resolve(__dirname, '../../../.env.staging'), quiet: true });
} else {
    dotenv.config();
}

const {
    getCloudinaryCredentialsConfig,
    getUploadSecurityConfig
} = require('./cloudinaryConfig');

const cloudinaryCfg = getCloudinaryCredentialsConfig();
const uploadSecurityCfg = getUploadSecurityConfig();

const env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT ? Number(process.env.PORT) : 5000,
    DB_HOST: process.env.DB_HOST || '127.0.0.1',
    DB_PORT: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    DB_USER: process.env.DB_USER || 'root',
    DB_PASSWORD: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '123456',
    DB_NAME: process.env.DB_NAME || 'sedinco_hr',
    DB_SSL: process.env.DB_SSL === 'true' || Boolean(process.env.DB_HOST && (process.env.DB_HOST.includes('aivencloud.com') || process.env.DB_HOST.includes('tidbcloud.com'))),
    DB_SSL_CA: process.env.DB_SSL_CA || '',
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
    // TRUST_PROXY: số hop proxy tin cậy (1 = trực tiếp sau 1 reverse proxy như Nginx/Render)
    // false = không tin cậy X-Forwarded-For (default local), 1 = Render/Nginx, 'loopback' = chỉ local
    TRUST_PROXY: process.env.TRUST_PROXY !== undefined ? process.env.TRUST_PROXY : false,
    ALLOW_RUNTIME_DDL: process.env.ALLOW_RUNTIME_DDL === 'true',
    ENABLE_CLIENT_ERROR_REPORTING: process.env.ENABLE_CLIENT_ERROR_REPORTING === 'true',
    ENABLE_DIAGNOSTICS: process.env.ENABLE_DIAGNOSTICS === 'true',
    BCRYPT_WORKER_POOL_SIZE: process.env.BCRYPT_WORKER_POOL_SIZE ? Number(process.env.BCRYPT_WORKER_POOL_SIZE) : 2,
    DEVICE_BINDING_MODE: process.env.DEVICE_BINDING_MODE || 'recording',
    LOCATION_MODE: process.env.LOCATION_MODE || 'WARN',
    REJECT_DOWNGRADE_TO_RAW: process.env.REJECT_DOWNGRADE_TO_RAW === 'true',
    ZALO_APP_ID: process.env.ZALO_APP_ID || '',
    ZALO_APP_SECRET: process.env.ZALO_APP_SECRET || '',
    ZALO_OPEN_API_KEY: process.env.ZALO_OPEN_API_KEY || '',
    ZALO_WEBHOOK_SECRET: process.env.ZALO_WEBHOOK_SECRET || '',
    QR_SECRET: process.env.QR_SECRET || '',
    CASSO_APP_ID: process.env.CASSO_APP_ID || '',
    CASSO_APP_SECRET: process.env.CASSO_APP_SECRET || '',
    CLOUDINARY_CLOUD_NAME: cloudinaryCfg.cloudName,
    CLOUDINARY_API_KEY: cloudinaryCfg.apiKey,
    CLOUDINARY_API_SECRET: cloudinaryCfg.apiSecret,
    CLOUDINARY_API_KEY_NAME: cloudinaryCfg.apiKeyName,
    CLOUDINARY_FOLDER: cloudinaryCfg.rootFolder,
    CLOUDINARY_FOLDER_MODE: cloudinaryCfg.folderMode,
    CLOUDINARY_PRIVATE_DELIVERY_TYPE: cloudinaryCfg.privateDeliveryType,
    ...uploadSecurityCfg
};

module.exports = env;
