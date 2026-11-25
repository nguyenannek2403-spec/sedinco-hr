/**
 * CloudinaryUsageMonitor:
 * - Theo dõi dung lượng nội bộ (ảnh, tài liệu, video, theo folder, theo ngày/tháng, theo nhân viên).
 * - Đối chiếu định kỳ (tối đa 1 lần / 24h hoặc Admin sync có cooldown) với Cloudinary Admin Usage API.
 * - KHÔNG bao giờ gọi Cloudinary Admin API sau mỗi lần upload để bảo vệ hạn mức Admin API.
 * - Áp dụng ngưỡng cảnh báo 70% / 85% / 95% / 100% dựa trên CLOUDINARY_STORAGE_BUDGET_BYTES (hoặc giới hạn gói đã sync).
 */

const { query } = require('../config/db');
const { getCloudinaryCredentialsConfig, getUploadSecurityConfig } = require('../config/cloudinaryConfig');
const { logAuditEvent } = require('../middlewares/authMiddleware');
const { getVietnamDateString } = require('../utils/timeHelper');

const SYNC_COOLDOWN_SECONDS = 300; // 5 phút cho Admin sync thủ công
const AUTO_SYNC_INTERVAL_MS = 24 * 3600 * 1000; // 24 giờ cho auto-sync nền
let schedulerStarted = false;
let lastCriticalAuditAt = 0;

function getVietnamMonthStartUtc() {
    const vnDate = getVietnamDateString(new Date());
    const [y, m] = vnDate.split('-');
    return new Date(`${y}-${m}-01T00:00:00+07:00`);
}

function getVietnamDayStartUtc() {
    const vnDate = getVietnamDateString(new Date());
    return new Date(`${vnDate}T00:00:00+07:00`);
}

class CloudinaryUsageMonitor {
    constructor() {
        this.usageApiFetcher = null;
    }

    setUsageApiFetcher(fn) {
        this.usageApiFetcher = typeof fn === 'function' ? fn : null;
    }

    async getLatestSnapshot() {
        const rows = await query(
            `SELECT * FROM media_usage_snapshots ORDER BY synced_at DESC, id DESC LIMIT 1`
        ).catch(() => []);
        return rows?.[0] || null;
    }

    async getBudgetEvaluation({ additionalBytes = 0 } = {}) {
        const secCfg = getUploadSecurityConfig();
        const credCfg = getCloudinaryCredentialsConfig();

        const [activeRows, latestSnapshot] = await Promise.all([
            query(
                `SELECT COUNT(*) AS active_count, COALESCE(SUM(bytes), 0) AS active_bytes
                 FROM media_assets
                 WHERE upload_status IN ('active', 'orphan_candidate')`
            ).catch(() => [{ active_count: 0, active_bytes: 0 }]),
            this.getLatestSnapshot()
        ]);

        const internalActiveAssets = Number(activeRows?.[0]?.active_count || 0);
        const internalActiveBytes = Number(activeRows?.[0]?.active_bytes || 0);
        const cloudStorageBytes = latestSnapshot ? Number(latestSnapshot.cloud_storage_bytes || 0) : 0;

        // Ưu tiên so khớp dung lượng lớn hơn giữa bộ đếm nội bộ và snapshot Cloudinary (nếu có)
        const effectiveUsedBytes = credCfg.configured
            ? Math.max(internalActiveBytes, cloudStorageBytes)
            : internalActiveBytes;

        let budgetBytes = null;
        let budgetSource = 'unconfigured';
        if (secCfg.storageBudgetBytes && secCfg.storageBudgetBytes > 0) {
            budgetBytes = secCfg.storageBudgetBytes;
            budgetSource = 'configured_env_budget';
        } else if (latestSnapshot?.cloud_storage_limit_bytes && Number(latestSnapshot.cloud_storage_limit_bytes) > 0) {
            budgetBytes = Number(latestSnapshot.cloud_storage_limit_bytes);
            budgetSource = 'cloudinary_plan_limit';
        }

        const currentPercent = budgetBytes ? Number(((effectiveUsedBytes / budgetBytes) * 100).toFixed(2)) : null;
        const projectedUsedBytes = effectiveUsedBytes + Math.max(0, Number(additionalBytes) || 0);
        const projectedPercent = budgetBytes ? Number(((projectedUsedBytes / budgetBytes) * 100).toFixed(2)) : null;

        let thresholdState = 'UNBOUNDED_MONITORING';
        if (budgetBytes !== null && currentPercent !== null) {
            if (currentPercent >= 100) thresholdState = 'EXHAUSTED';
            else if (currentPercent >= secCfg.usageBlockPercent) thresholdState = 'RESTRICTED';
            else if (currentPercent >= secCfg.usageCriticalPercent) thresholdState = 'CRITICAL';
            else if (currentPercent >= secCfg.usageWarningPercent) thresholdState = 'WARNING';
            else thresholdState = 'NORMAL';
        }

        let projectedThresholdState = thresholdState;
        if (budgetBytes !== null && projectedPercent !== null) {
            if (projectedPercent >= 100) projectedThresholdState = 'EXHAUSTED';
            else if (projectedPercent >= secCfg.usageBlockPercent) projectedThresholdState = 'RESTRICTED';
            else if (projectedPercent >= secCfg.usageCriticalPercent) projectedThresholdState = 'CRITICAL';
            else if (projectedPercent >= secCfg.usageWarningPercent) projectedThresholdState = 'WARNING';
            else projectedThresholdState = 'NORMAL';
        }

        return {
            budget_bytes: budgetBytes,
            budget_source: budgetSource,
            internal_active_assets: internalActiveAssets,
            internal_active_bytes: internalActiveBytes,
            cloud_storage_bytes: cloudStorageBytes,
            effective_used_bytes: effectiveUsedBytes,
            projected_used_bytes: projectedUsedBytes,
            current_percent: currentPercent,
            projected_percent: projectedPercent,
            threshold_state: thresholdState,
            projected_threshold_state: projectedThresholdState,
            thresholds: {
                warning_percent: secCfg.usageWarningPercent,
                critical_percent: secCfg.usageCriticalPercent,
                block_percent: secCfg.usageBlockPercent
            },
            latest_snapshot: latestSnapshot
        };
    }

    async evaluateQuotaBeforeUpload({ incomingBytes = 0, policy, actor = null } = {}) {
        const evalResult = await this.getBudgetEvaluation({ additionalBytes: incomingBytes });
        if (evalResult.budget_bytes === null) {
            return evalResult;
        }

        const {
            current_percent: curPct,
            projected_percent: projPct,
            projected_threshold_state: projState,
            threshold_state: curState,
            thresholds
        } = evalResult;

        // Cảnh báo mức nghiêm trọng >= 85%: ghi audit log (throttle 1 lần/giờ để không spam audit_logs)
        if ((curState === 'CRITICAL' || curState === 'RESTRICTED' || curState === 'EXHAUSTED') &&
            Date.now() - lastCriticalAuditAt > 3600 * 1000) {
            lastCriticalAuditAt = Date.now();
            await logAuditEvent({
                actor_id: actor?.ma_nv || actor?.username || 'system',
                actor_role: actor?.role || 'system',
                action: 'CLOUDINARY_QUOTA_CRITICAL_ALERT',
                resource: 'media_storage',
                details: {
                    current_percent: curPct,
                    threshold_state: curState,
                    effective_used_bytes: evalResult.effective_used_bytes,
                    budget_bytes: evalResult.budget_bytes
                }
            }).catch(() => {});
        }

        if (projState === 'EXHAUSTED' || curPct >= 100 || projPct > 100) {
            const err = new Error(
                `Dung lượng lưu trữ media đã chạm ngưỡng 100% hạn mức cho phép (${curPct}%). Hệ thống tạm ngừng tiếp nhận tệp mới, vui lòng liên hệ Quản trị viên!`
            );
            err.statusCode = 507;
            err.code = 'STORAGE_QUOTA_EXHAUSTED';
            throw err;
        }

        if ((projState === 'RESTRICTED' || curPct >= thresholds.block_percent) && !policy?.essential) {
            const err = new Error(
                `Dung lượng lưu trữ media đã đạt ${Math.max(curPct, projPct).toFixed(1)}% (>= ${thresholds.block_percent}%). Hệ thống tạm hạn chế tải lên tệp không thiết yếu (${policy?.label || 'Media'}) để ưu tiên minh chứng chấm công và đơn từ!`
            );
            err.statusCode = 507;
            err.code = 'STORAGE_QUOTA_RESTRICTED';
            throw err;
        }

        return evalResult;
    }

    async syncWithCloudinaryAdminApi({ force = false, syncSource = 'manual', currentUser = null } = {}) {
        const secCfg = getUploadSecurityConfig();
        const credCfg = getCloudinaryCredentialsConfig();

        if (!secCfg.usageSyncEnabled && !force) {
            return { synced: false, skipped: true, reason: 'CLOUDINARY_USAGE_SYNC_DISABLED' };
        }

        if (!credCfg.configured && !this.usageApiFetcher) {
            return {
                synced: false,
                skipped: true,
                reason: 'CLOUDINARY_NOT_CONFIGURED',
                message: 'Chưa cấu hình CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET.'
            };
        }

        const latest = await this.getLatestSnapshot();
        if (latest && latest.synced_at) {
            const ageSeconds = (Date.now() - new Date(latest.synced_at).getTime()) / 1000;
            if (!force && ageSeconds < 24 * 3600) {
                return { synced: false, cached: true, snapshot: latest };
            }
            if (force && ageSeconds < SYNC_COOLDOWN_SECONDS && !this.usageApiFetcher) {
                const waitSec = Math.ceil(SYNC_COOLDOWN_SECONDS - ageSeconds);
                const err = new Error(`Vui lòng đợi ${waitSec} giây trước khi đồng bộ lại Cloudinary Usage API (bảo vệ giới hạn Admin API).`);
                err.statusCode = 429;
                err.code = 'USAGE_SYNC_COOLDOWN';
                err.retryAfterSeconds = waitSec;
                throw err;
            }
        }

        let usagePayload = null;
        if (this.usageApiFetcher) {
            usagePayload = await this.usageApiFetcher();
        } else {
            const cloudinary = require('cloudinary').v2;
            cloudinary.config({
                cloud_name: credCfg.cloudName,
                api_key: credCfg.apiKey,
                api_secret: credCfg.apiSecret,
                secure: true
            });
            usagePayload = await cloudinary.api.usage();
        }

        const activeStats = await query(
            `SELECT COUNT(*) AS cnt, COALESCE(SUM(bytes), 0) AS total_bytes
             FROM media_assets
             WHERE upload_status IN ('active', 'orphan_candidate')`
        ).catch(() => [{ cnt: 0, total_bytes: 0 }]);

        const planName = String(usagePayload?.plan || 'Free/Unknown').slice(0, 64);
        const cloudStorageBytes = Number(usagePayload?.storage?.usage ?? 0);
        const cloudStorageLimit = usagePayload?.storage?.limit !== undefined && usagePayload?.storage?.limit !== null
            ? Number(usagePayload.storage.limit)
            : null;
        const cloudBandwidthBytes = Number(usagePayload?.bandwidth?.usage ?? 0);
        const cloudBandwidthLimit = usagePayload?.bandwidth?.limit !== undefined && usagePayload?.bandwidth?.limit !== null
            ? Number(usagePayload.bandwidth.limit)
            : null;
        const cloudTransformations = Number(usagePayload?.transformations?.usage ?? 0);
        const cloudTransformationsLimit = usagePayload?.transformations?.limit !== undefined && usagePayload?.transformations?.limit !== null
            ? Number(usagePayload.transformations.limit)
            : null;
        const cloudObjects = Number(usagePayload?.objects?.usage ?? usagePayload?.resources ?? 0);
        const creditsUsed = usagePayload?.credits?.usage !== undefined ? Number(usagePayload.credits.usage) : null;
        const creditsLimit = usagePayload?.credits?.limit !== undefined ? Number(usagePayload.credits.limit) : null;

        let detectedFolderMode = credCfg.folderMode;
        if (detectedFolderMode === 'auto') {
            detectedFolderMode = usagePayload?.media_limits ? 'dynamic' : 'dynamic';
        }

        const sanitizedJson = JSON.stringify({
            plan: planName,
            last_updated: usagePayload?.last_updated || new Date().toISOString(),
            storage: usagePayload?.storage || null,
            bandwidth: usagePayload?.bandwidth || null,
            transformations: usagePayload?.transformations || null,
            objects: usagePayload?.objects || null,
            credits: usagePayload?.credits || null
        }).slice(0, 32000);

        const insRes = await query(
            `INSERT INTO media_usage_snapshots (
                plan_name, folder_mode, cloud_storage_bytes, cloud_storage_limit_bytes,
                cloud_bandwidth_bytes, cloud_bandwidth_limit_bytes,
                cloud_transformations, cloud_transformations_limit, cloud_objects,
                cloud_credits_used, cloud_credits_limit,
                internal_active_bytes, internal_active_assets,
                raw_usage_json, sync_source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                planName,
                detectedFolderMode,
                cloudStorageBytes,
                cloudStorageLimit,
                cloudBandwidthBytes,
                cloudBandwidthLimit,
                cloudTransformations,
                cloudTransformationsLimit,
                cloudObjects,
                creditsUsed,
                creditsLimit,
                Number(activeStats?.[0]?.total_bytes || 0),
                Number(activeStats?.[0]?.cnt || 0),
                sanitizedJson,
                syncSource
            ]
        );

        if (currentUser) {
            await logAuditEvent({
                actor_id: currentUser.ma_nv || currentUser.username || 'admin',
                actor_role: currentUser.role || 'admin',
                action: 'MEDIA_USAGE_SYNC',
                resource: 'media_storage',
                details: { plan: planName, cloud_storage_bytes: cloudStorageBytes, cloud_objects: cloudObjects }
            }).catch(() => {});
        }

        const snapshot = await this.getLatestSnapshot();
        return { synced: true, id: insRes?.insertId || null, snapshot };
    }

    async getAdminDashboardMetrics(filters = {}) {
        const credCfg = getCloudinaryCredentialsConfig();
        const secCfg = getUploadSecurityConfig();
        const dayStart = getVietnamDayStartUtc();
        const monthStart = getVietnamMonthStartUtc();

        const whereClauses = ['1=1'];
        const params = [];
        if (filters.startDate) {
            whereClauses.push('created_at >= ?');
            params.push(`${String(filters.startDate).slice(0, 10)} 00:00:00`);
        }
        if (filters.endDate) {
            whereClauses.push('created_at <= ?');
            params.push(`${String(filters.endDate).slice(0, 10)} 23:59:59`);
        }
        if (filters.category) {
            whereClauses.push('upload_category = ?');
            params.push(String(filters.category).trim());
        }
        if (filters.ma_nv) {
            whereClauses.push('(employee_id = ? OR uploaded_by = ?)');
            params.push(String(filters.ma_nv).trim(), String(filters.ma_nv).trim());
        }
        if (filters.resourceType) {
            whereClauses.push('resource_type = ?');
            params.push(String(filters.resourceType).trim());
        }
        if (filters.status) {
            whereClauses.push('upload_status = ?');
            params.push(String(filters.status).trim());
        }

        const whereSql = whereClauses.join(' AND ');

        const [
            quotaEval,
            summaryRows,
            todayMonthRows,
            folderRows,
            topUploaderRows,
            eventSummaryRows,
            orphanCandidateRows,
            cleanupHistoryRows,
            anomalyUserRows
        ] = await Promise.all([
            this.getBudgetEvaluation(),
            query(
                `SELECT
                    COUNT(*) AS total_records,
                    SUM(CASE WHEN upload_status IN ('active', 'orphan_candidate') THEN 1 ELSE 0 END) AS active_files,
                    COALESCE(SUM(CASE WHEN upload_status IN ('active', 'orphan_candidate') THEN bytes ELSE 0 END), 0) AS active_bytes,
                    SUM(CASE WHEN upload_status IN ('active', 'orphan_candidate') AND resource_type = 'image' THEN 1 ELSE 0 END) AS image_files,
                    COALESCE(SUM(CASE WHEN upload_status IN ('active', 'orphan_candidate') AND resource_type = 'image' THEN bytes ELSE 0 END), 0) AS image_bytes,
                    SUM(CASE WHEN upload_status IN ('active', 'orphan_candidate') AND resource_type = 'raw' THEN 1 ELSE 0 END) AS document_files,
                    COALESCE(SUM(CASE WHEN upload_status IN ('active', 'orphan_candidate') AND resource_type = 'raw' THEN bytes ELSE 0 END), 0) AS document_bytes,
                    SUM(CASE WHEN upload_status IN ('active', 'orphan_candidate') AND resource_type = 'video' THEN 1 ELSE 0 END) AS video_files,
                    COALESCE(SUM(CASE WHEN upload_status IN ('active', 'orphan_candidate') AND resource_type = 'video' THEN bytes ELSE 0 END), 0) AS video_bytes,
                    SUM(CASE WHEN upload_status = 'orphan_candidate' THEN 1 ELSE 0 END) AS orphan_files,
                    COALESCE(SUM(CASE WHEN upload_status = 'orphan_candidate' THEN bytes ELSE 0 END), 0) AS orphan_bytes,
                    SUM(CASE WHEN upload_status = 'deleted' THEN 1 ELSE 0 END) AS deleted_files,
                    SUM(CASE WHEN upload_status = 'failed' THEN 1 ELSE 0 END) AS failed_files
                 FROM media_assets
                 WHERE ${whereSql}`,
                params
            ),
            query(
                `SELECT
                    SUM(CASE WHEN created_at >= ? AND upload_status IN ('active', 'orphan_candidate') THEN 1 ELSE 0 END) AS uploads_today,
                    COALESCE(SUM(CASE WHEN created_at >= ? AND upload_status IN ('active', 'orphan_candidate') THEN bytes ELSE 0 END), 0) AS bytes_today,
                    SUM(CASE WHEN created_at >= ? AND upload_status IN ('active', 'orphan_candidate') THEN 1 ELSE 0 END) AS uploads_month,
                    COALESCE(SUM(CASE WHEN created_at >= ? AND upload_status IN ('active', 'orphan_candidate') THEN bytes ELSE 0 END), 0) AS bytes_month
                 FROM media_assets`,
                [dayStart, dayStart, monthStart, monthStart]
            ),
            query(
                `SELECT asset_folder, upload_category, access_level,
                        COUNT(*) AS file_count, COALESCE(SUM(bytes), 0) AS total_bytes
                 FROM media_assets
                 WHERE ${whereSql} AND upload_status IN ('active', 'orphan_candidate')
                 GROUP BY asset_folder, upload_category, access_level
                 ORDER BY total_bytes DESC, file_count DESC
                 LIMIT 25`,
                params
            ),
            query(
                `SELECT m.uploaded_by,
                        COALESCE(e.ho_ten, a.ho_ten, m.uploaded_by) AS ho_ten,
                        m.uploader_role,
                        COUNT(*) AS total_files,
                        COALESCE(SUM(m.bytes), 0) AS total_bytes,
                        COALESCE(SUM(CASE WHEN m.created_at >= ? THEN m.bytes ELSE 0 END), 0) AS today_bytes
                 FROM media_assets m
                 LEFT JOIN employees e ON m.uploaded_by = e.ma_nv
                 LEFT JOIN admins a ON m.uploaded_by = a.username
                 WHERE m.upload_status IN ('active', 'orphan_candidate')
                 GROUP BY m.uploaded_by, ho_ten, m.uploader_role
                 ORDER BY total_bytes DESC, total_files DESC
                 LIMIT 10`,
                [dayStart]
            ),
            query(
                `SELECT event_type, error_code, COUNT(*) AS cnt
                 FROM media_upload_events
                 WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                   AND (event_type LIKE 'rejected_%' OR event_type = 'failed_cloudinary')
                 GROUP BY event_type, error_code
                 ORDER BY cnt DESC
                 LIMIT 20`
            ),
            query(
                `SELECT asset_uuid, asset_folder, upload_category, original_filename, mime_type, bytes, uploaded_by, orphan_since, created_at
                 FROM media_assets
                 WHERE upload_status = 'orphan_candidate'
                 ORDER BY orphan_since ASC, created_at ASC
                 LIMIT 30`
            ),
            query(
                `SELECT id, actor_id, action, details, created_at
                 FROM audit_logs
                 WHERE action IN ('MEDIA_ORPHAN_CLEANUP', 'MEDIA_ADMIN_DELETE', 'MEDIA_USAGE_SYNC', 'CLOUDINARY_QUOTA_CRITICAL_ALERT')
                 ORDER BY created_at DESC
                 LIMIT 20`
            ),
            query(
                `SELECT actor_id,
                        SUM(CASE WHEN event_type LIKE 'rejected_%' THEN 1 ELSE 0 END) AS reject_count,
                        MAX(created_at) AS last_event_at
                 FROM media_upload_events
                 WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                 GROUP BY actor_id
                 HAVING reject_count >= 5
                 ORDER BY reject_count DESC
                 LIMIT 10`
            )
        ]);

        const sum = summaryRows?.[0] || {};
        const tm = todayMonthRows?.[0] || {};
        const totalFailedEvents = (eventSummaryRows || [])
            .filter((r) => r.event_type === 'failed_cloudinary')
            .reduce((acc, r) => acc + Number(r.cnt || 0), 0);
        const totalRejectedEvents = (eventSummaryRows || [])
            .filter((r) => String(r.event_type || '').startsWith('rejected_'))
            .reduce((acc, r) => acc + Number(r.cnt || 0), 0);

        const anomalyAlerts = [];
        if (quotaEval.threshold_state === 'CRITICAL' || quotaEval.threshold_state === 'RESTRICTED' || quotaEval.threshold_state === 'EXHAUSTED') {
            anomalyAlerts.push({
                severity: 'critical',
                code: `QUOTA_${quotaEval.threshold_state}`,
                title: `Cảnh báo dung lượng Cloudinary đạt ${quotaEval.current_percent}%`,
                description: quotaEval.threshold_state === 'RESTRICTED'
                    ? 'Đã tự động hạn chế tải ảnh đại diện & tệp không thiết yếu.'
                    : 'Cần kiểm tra hoặc dọn dẹp tài nguyên mồ côi.'
            });
        } else if (quotaEval.threshold_state === 'WARNING') {
            anomalyAlerts.push({
                severity: 'warning',
                code: 'QUOTA_WARNING',
                title: `Dung lượng lưu trữ đạt ${quotaEval.current_percent}%`,
                description: `Đã vượt ngưỡng cảnh báo ${secCfg.usageWarningPercent}%.`
            });
        }

        for (const u of anomalyUserRows || []) {
            anomalyAlerts.push({
                severity: 'high',
                code: 'USER_REJECTION_BURST',
                title: `Tài khoản ${u.actor_id} có ${u.reject_count} lượt upload bị từ chối trong 24h`,
                description: 'Có dấu hiệu spam upload hoặc gửi tệp sai định dạng liên tiếp.',
                actor_id: u.actor_id,
                created_at: u.last_event_at
            });
        }

        for (const u of topUploaderRows || []) {
            if (Number(u.today_bytes || 0) >= secCfg.dailyMaxBytesPerUser * 0.7) {
                anomalyAlerts.push({
                    severity: 'medium',
                    code: 'HEAVY_DAILY_UPLOADER',
                    title: `${u.ho_ten} (${u.uploaded_by}) đã dùng >= 70% hạn mức ngày`,
                    description: `Dung lượng tải lên hôm nay đạt ${Math.round(Number(u.today_bytes) / (1024 * 1024) * 10) / 10} MB.`,
                    actor_id: u.uploaded_by
                });
            }
        }

        return {
            cloudinary_account: {
                configured: credCfg.configured,
                cloud_name: credCfg.cloudName || null,
                api_key_name: credCfg.apiKeyName || null,
                root_folder: credCfg.rootFolder,
                folder_mode: credCfg.folderMode,
                private_delivery_type: credCfg.privateDeliveryType
            },
            limits: {
                max_files_per_request: secCfg.maxFilesPerRequest,
                max_image_size_bytes: secCfg.maxImageSizeBytes,
                max_document_size_bytes: secCfg.maxDocumentSizeBytes,
                max_video_size_bytes: secCfg.maxVideoSizeBytes,
                rate_limit_window_seconds: secCfg.rateLimitWindowSeconds,
                rate_limit_max_requests: secCfg.rateLimitMaxRequests,
                daily_max_files_per_user: secCfg.dailyMaxFilesPerUser,
                daily_max_bytes_per_user: secCfg.dailyMaxBytesPerUser,
                max_concurrent_per_user: secCfg.maxConcurrentPerUser,
                duplicate_check_enabled: secCfg.duplicateCheckEnabled,
                orphan_cleanup_enabled: secCfg.orphanCleanupEnabled,
                orphan_retention_hours: secCfg.orphanRetentionHours
            },
            quota: quotaEval,
            summary: {
                active_files: Number(sum.active_files || 0),
                active_bytes: Number(sum.active_bytes || 0),
                image_files: Number(sum.image_files || 0),
                image_bytes: Number(sum.image_bytes || 0),
                document_files: Number(sum.document_files || 0),
                document_bytes: Number(sum.document_bytes || 0),
                video_files: Number(sum.video_files || 0),
                video_bytes: Number(sum.video_bytes || 0),
                orphan_files: Number(sum.orphan_files || 0),
                orphan_bytes: Number(sum.orphan_bytes || 0),
                deleted_files: Number(sum.deleted_files || 0),
                failed_uploads: Number(sum.failed_files || 0) + totalFailedEvents,
                rejected_requests: totalRejectedEvents,
                uploads_today: Number(tm.uploads_today || 0),
                bytes_today: Number(tm.bytes_today || 0),
                uploads_month: Number(tm.uploads_month || 0),
                bytes_month: Number(tm.bytes_month || 0)
            },
            folders_breakdown: folderRows || [],
            top_uploaders: topUploaderRows || [],
            rejection_breakdown: eventSummaryRows || [],
            orphan_candidates: orphanCandidateRows || [],
            cleanup_history: (cleanupHistoryRows || []).map((row) => {
                let parsed = {};
                try {
                    parsed = typeof row.details === 'string' ? JSON.parse(row.details) : (row.details || {});
                } catch {}
                return {
                    id: row.id,
                    actor_id: row.actor_id,
                    action: row.action,
                    details: parsed,
                    created_at: row.created_at
                };
            }),
            anomaly_alerts: anomalyAlerts
        };
    }

    startBackgroundSyncScheduler() {
        if (schedulerStarted || process.env.NODE_ENV === 'test') return;
        const secCfg = getUploadSecurityConfig();
        const credCfg = getCloudinaryCredentialsConfig();
        if (!secCfg.usageSyncEnabled || !credCfg.configured) return;

        schedulerStarted = true;
        const timer = setInterval(() => {
            this.syncWithCloudinaryAdminApi({ force: false, syncSource: 'scheduled' }).catch(() => {});
        }, AUTO_SYNC_INTERVAL_MS);
        if (typeof timer.unref === 'function') timer.unref();
    }
}

module.exports = new CloudinaryUsageMonitor();
