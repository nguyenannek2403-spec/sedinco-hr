/**
 * Tập trung đọc cấu hình Cloudinary & Upload Security từ biến môi trường (platform-agnostic).
 * Không hardcode thông tin bí mật hoặc giả định budget khi chưa cấu hình.
 */

function parsePositiveInt(rawVal, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
        return fallback;
    }
    const parsed = Number(rawVal);
    if (!Number.isFinite(parsed) || parsed < min) return fallback;
    return Math.min(max, Math.floor(parsed));
}

function parseOptionalPositiveInt(rawVal) {
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
        return null;
    }
    const parsed = Number(rawVal);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
}

function parseBooleanFlag(rawVal, fallback = true) {
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
        return fallback;
    }
    const normalized = String(rawVal).trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    return fallback;
}

function sanitizeFolderRoot(rawFolder) {
    const cleaned = String(rawFolder || 'sedinco-hr')
        .trim()
        .replace(/\\/g, '/')
        .replace(/[^a-zA-Z0-9_/-]/g, '')
        .replace(/^\/+|\/+$/g, '')
        .replace(/\/{2,}/g, '/');
    return cleaned || 'sedinco-hr';
}

function getCloudinaryCredentialsConfig() {
    const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
    const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
    const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
    const apiKeyName = String(process.env.CLOUDINARY_API_KEY_NAME || '').trim();
    const rootFolder = sanitizeFolderRoot(process.env.CLOUDINARY_FOLDER || 'sedinco-hr');

    const rawFolderMode = String(process.env.CLOUDINARY_FOLDER_MODE || 'auto').trim().toLowerCase();
    const folderMode = ['auto', 'dynamic', 'fixed'].includes(rawFolderMode) ? rawFolderMode : 'auto';

    const rawDeliveryType = String(process.env.CLOUDINARY_PRIVATE_DELIVERY_TYPE || 'authenticated').trim().toLowerCase();
    const privateDeliveryType = ['authenticated', 'private', 'upload'].includes(rawDeliveryType)
        ? rawDeliveryType
        : 'authenticated';

    return {
        configured: Boolean(cloudName && apiKey && apiSecret),
        cloudName,
        apiKey,
        apiSecret,
        apiKeyName,
        rootFolder,
        folderMode,
        privateDeliveryType
    };
}

function getUploadSecurityConfig() {
    const warningPercent = parsePositiveInt(process.env.CLOUDINARY_USAGE_WARNING_PERCENT, 70, { min: 10, max: 99 });
    const criticalPercent = parsePositiveInt(process.env.CLOUDINARY_USAGE_CRITICAL_PERCENT, 85, { min: 20, max: 99 });
    const blockPercent = parsePositiveInt(process.env.CLOUDINARY_USAGE_BLOCK_PERCENT, 95, { min: 50, max: 100 });

    return {
        maxFilesPerRequest: parsePositiveInt(process.env.UPLOAD_MAX_FILES_PER_REQUEST, 5, { min: 1, max: 20 }),
        maxImageSizeBytes: parsePositiveInt(process.env.UPLOAD_MAX_IMAGE_SIZE_BYTES, 10 * 1024 * 1024, { min: 1024, max: 50 * 1024 * 1024 }),
        maxDocumentSizeBytes: parsePositiveInt(process.env.UPLOAD_MAX_DOCUMENT_SIZE_BYTES, 15 * 1024 * 1024, { min: 1024, max: 50 * 1024 * 1024 }),
        maxVideoSizeBytes: parsePositiveInt(process.env.UPLOAD_MAX_VIDEO_SIZE_BYTES, 15 * 1024 * 1024, { min: 1024, max: 50 * 1024 * 1024 }),
        rateLimitWindowSeconds: parsePositiveInt(process.env.UPLOAD_RATE_LIMIT_WINDOW_SECONDS, 600, { min: 10, max: 86400 }),
        rateLimitMaxRequests: parsePositiveInt(process.env.UPLOAD_RATE_LIMIT_MAX_REQUESTS, 10, { min: 1, max: 500 }),
        dailyMaxFilesPerUser: parsePositiveInt(process.env.UPLOAD_DAILY_MAX_FILES_PER_USER, 30, { min: 1, max: 1000 }),
        dailyMaxBytesPerUser: parsePositiveInt(process.env.UPLOAD_DAILY_MAX_BYTES_PER_USER, 100 * 1024 * 1024, { min: 1024, max: 1024 * 1024 * 1024 }),
        maxConcurrentPerUser: parsePositiveInt(process.env.UPLOAD_MAX_CONCURRENT_PER_USER, 2, { min: 1, max: 10 }),
        globalMaxConcurrent: parsePositiveInt(process.env.UPLOAD_GLOBAL_MAX_CONCURRENT, 15, { min: 1, max: 100 }),
        duplicateCheckEnabled: parseBooleanFlag(process.env.UPLOAD_DUPLICATE_CHECK_ENABLED, true),
        storageBudgetBytes: parseOptionalPositiveInt(process.env.CLOUDINARY_STORAGE_BUDGET_BYTES),
        usageWarningPercent: warningPercent,
        usageCriticalPercent: Math.max(warningPercent, criticalPercent),
        usageBlockPercent: Math.max(criticalPercent, blockPercent),
        usageSyncEnabled: parseBooleanFlag(process.env.CLOUDINARY_USAGE_SYNC_ENABLED, true),
        orphanCleanupEnabled: parseBooleanFlag(process.env.UPLOAD_ORPHAN_CLEANUP_ENABLED, true),
        orphanRetentionHours: parsePositiveInt(process.env.UPLOAD_ORPHAN_RETENTION_HOURS, 24, { min: 1, max: 24 * 365 })
    };
}

module.exports = {
    getCloudinaryCredentialsConfig,
    getUploadSecurityConfig,
    sanitizeFolderRoot,
    parsePositiveInt,
    parseOptionalPositiveInt,
    parseBooleanFlag
};
