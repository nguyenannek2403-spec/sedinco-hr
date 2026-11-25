/**
 * Schema bảng quản lý Media tập trung (Cloudinary Metadata, Rate-Limit Events & Quota Usage Snapshots).
 * Thiết kế additive (CREATE TABLE IF NOT EXISTS) hoàn toàn tương thích MySQL 8 & TiDB Cloud,
 * tuyệt đối không lưu binary/API Secret vào Database.
 */

const MEDIA_ASSETS_DDL = `
CREATE TABLE IF NOT EXISTS media_assets (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    asset_uuid VARCHAR(36) NOT NULL,
    public_id VARCHAR(255) NULL,
    asset_id VARCHAR(120) NULL,
    secure_url TEXT NULL,
    delivery_type VARCHAR(24) NOT NULL DEFAULT 'authenticated',
    access_level VARCHAR(16) NOT NULL DEFAULT 'private',
    resource_type VARCHAR(16) NOT NULL DEFAULT 'image',
    format VARCHAR(24) NULL,
    bytes BIGINT NOT NULL DEFAULT 0,
    width INT NULL,
    height INT NULL,
    asset_folder VARCHAR(255) NOT NULL,
    folder_mode VARCHAR(16) NOT NULL DEFAULT 'dynamic',
    upload_category VARCHAR(64) NOT NULL,
    original_filename VARCHAR(255) NULL,
    mime_type VARCHAR(100) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    uploaded_by VARCHAR(50) NOT NULL,
    uploader_role VARCHAR(20) NOT NULL DEFAULT 'worker',
    employee_id VARCHAR(24) NULL,
    related_entity_type VARCHAR(50) NULL,
    related_entity_id VARCHAR(64) NULL,
    upload_status VARCHAR(24) NOT NULL DEFAULT 'uploading',
    orphan_since DATETIME NULL,
    deleted_at DATETIME NULL,
    deleted_by VARCHAR(50) NULL,
    delete_reason VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE INDEX uniq_ma_asset_uuid (asset_uuid),
    UNIQUE INDEX uniq_ma_public_id (public_id),
    INDEX idx_ma_emp_created (employee_id, created_at),
    INDEX idx_ma_uploader_created (uploaded_by, created_at),
    INDEX idx_ma_cat_status (upload_category, upload_status),
    INDEX idx_ma_checksum_user (checksum, uploaded_by, upload_status),
    INDEX idx_ma_orphan (upload_status, orphan_since),
    INDEX idx_ma_entity (related_entity_type, related_entity_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
`;

const MEDIA_UPLOAD_EVENTS_DDL = `
CREATE TABLE IF NOT EXISTS media_upload_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(32) NOT NULL,
    actor_id VARCHAR(50) NOT NULL,
    actor_role VARCHAR(20) NULL,
    ip_address VARCHAR(64) NULL,
    device_id_hash VARCHAR(64) NULL,
    upload_category VARCHAR(64) NULL,
    resource_type VARCHAR(20) NULL,
    bytes BIGINT NOT NULL DEFAULT 0,
    asset_uuid VARCHAR(36) NULL,
    error_code VARCHAR(64) NULL,
    details VARCHAR(500) NULL,
    in_flight TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    INDEX idx_mue_actor_time (actor_id, created_at),
    INDEX idx_mue_ip_time (ip_address, created_at),
    INDEX idx_mue_inflight (actor_id, in_flight, created_at),
    INDEX idx_mue_type_time (event_type, created_at)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
`;

const MEDIA_USAGE_SNAPSHOTS_DDL = `
CREATE TABLE IF NOT EXISTS media_usage_snapshots (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plan_name VARCHAR(64) NULL,
    folder_mode VARCHAR(20) NULL,
    cloud_storage_bytes BIGINT NOT NULL DEFAULT 0,
    cloud_storage_limit_bytes BIGINT NULL,
    cloud_bandwidth_bytes BIGINT NOT NULL DEFAULT 0,
    cloud_bandwidth_limit_bytes BIGINT NULL,
    cloud_transformations BIGINT NOT NULL DEFAULT 0,
    cloud_transformations_limit BIGINT NULL,
    cloud_objects BIGINT NOT NULL DEFAULT 0,
    cloud_credits_used DECIMAL(12,4) NULL,
    cloud_credits_limit DECIMAL(12,4) NULL,
    internal_active_bytes BIGINT NOT NULL DEFAULT 0,
    internal_active_assets BIGINT NOT NULL DEFAULT 0,
    raw_usage_json MEDIUMTEXT NULL,
    sync_source VARCHAR(32) NOT NULL DEFAULT 'scheduled',
    synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_mus_synced_at (synced_at)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
`;

const MEDIA_TABLE_DDLS = [
    MEDIA_ASSETS_DDL,
    MEDIA_UPLOAD_EVENTS_DDL,
    MEDIA_USAGE_SNAPSHOTS_DDL
];

async function ensureMediaSchema(execQuery) {
    for (const ddl of MEDIA_TABLE_DDLS) {
        await execQuery(ddl);
    }
}

module.exports = {
    MEDIA_ASSETS_DDL,
    MEDIA_UPLOAD_EVENTS_DDL,
    MEDIA_USAGE_SNAPSHOTS_DDL,
    MEDIA_TABLE_DDLS,
    ensureMediaSchema
};
