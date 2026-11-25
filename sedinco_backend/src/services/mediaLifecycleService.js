/**
 * Quản lý vòng đời Media & Dọn dẹp tài nguyên mồ côi (Orphan Lifecycle Management):
 * - Gắn asset với bản ghi nghiệp vụ khi lưu đơn/hồ sơ/lương/công.
 * - Khi thay avatar hoặc logo, kiểm tra tham chiếu trên toàn DB; chỉ đánh dấu orphan_candidate khi không còn nơi dùng.
 * - KHÔNG xóa minh chứng đơn khi nhân viên hủy đơn (giữ lịch sử audit).
 * - KHÔNG xóa ảnh chấm công hoặc hồ sơ đang tham chiếu để giải phóng dung lượng.
 * - Quy trình orphan cleanup chờ đủ thời gian retention (mặc định 24h), kiểm tra lại quan hệ DB rồi mới xóa Cloudinary.
 */

const { query } = require('../config/db');
const { getUploadSecurityConfig } = require('../config/cloudinaryConfig');
const { logAuditEvent } = require('../middlewares/authMiddleware');
const { extractAssetUuidFromMediaRef } = require('../utils/mediaValidator');

async function findAssetByRef(mediaRef, execQuery = query) {
    if (!mediaRef || typeof mediaRef !== 'string') return null;
    const trimmed = mediaRef.trim();
    const uuid = extractAssetUuidFromMediaRef(trimmed);
    if (uuid) {
        const rows = await execQuery('SELECT * FROM media_assets WHERE asset_uuid = ? LIMIT 1', [uuid]).catch(() => []);
        if (rows?.[0]) return rows[0];
    }
    if (trimmed.startsWith('https://res.cloudinary.com/')) {
        const rows = await execQuery('SELECT * FROM media_assets WHERE secure_url = ? LIMIT 1', [trimmed]).catch(() => []);
        if (rows?.[0]) return rows[0];
    }
    return null;
}

async function countLiveReferences(asset, execQuery = query) {
    if (!asset) return 0;
    const candidates = [];
    if (asset.asset_uuid) candidates.push(`/api/media/${asset.asset_uuid}/access`);
    if (asset.secure_url && asset.secure_url !== 'inline_compact_fallback') candidates.push(asset.secure_url);
    if (candidates.length === 0) return 0;

    const placeholders = candidates.map(() => '?').join(',');
    const checks = [
        execQuery(`SELECT COUNT(*) AS cnt FROM employees WHERE avatar_url IN (${placeholders})`, candidates),
        execQuery(`SELECT COUNT(*) AS cnt FROM admins WHERE avatar_url IN (${placeholders})`, candidates),
        execQuery(`SELECT COUNT(*) AS cnt FROM company_settings WHERE logo_url IN (${placeholders})`, candidates),
        execQuery(`SELECT COUNT(*) AS cnt FROM requests WHERE evidence_image IN (${placeholders})`, candidates),
        execQuery(`SELECT COUNT(*) AS cnt FROM attendance WHERE dispute_evidence_media IN (${placeholders})`, candidates),
        execQuery(`SELECT COUNT(*) AS cnt FROM attendance_logs WHERE check_in_image IN (${placeholders})`, candidates)
    ];

    const results = await Promise.all(checks.map((p) => p.catch(() => [{ cnt: 0 }])));
    let totalRefs = results.reduce((sum, rows) => sum + Number(rows?.[0]?.cnt || 0), 0);

    // Tài liệu gắn trực tiếp trong kho hồ sơ nhân viên / thông báo công ty không lưu ở 6 cột text cũ
    if (
        asset.upload_status === 'active' &&
        asset.related_entity_id &&
        ['employee_document', 'employee_attachment', 'company_announcement', 'system_import'].includes(asset.related_entity_type)
    ) {
        totalRefs += 1;
    }

    return totalRefs;
}

class MediaLifecycleService {
    async bindAssetToEntity({
        mediaRef,
        entityType,
        entityId,
        employeeId = null,
        txQuery = null
    }) {
        const execQuery = txQuery || query;
        const asset = await findAssetByRef(mediaRef, execQuery);
        if (!asset) return null;

        await execQuery(
            `UPDATE media_assets
             SET related_entity_type = ?,
                 related_entity_id = ?,
                 employee_id = COALESCE(?, employee_id),
                 upload_status = CASE WHEN upload_status = 'orphan_candidate' THEN 'active' ELSE upload_status END,
                 orphan_since = NULL
             WHERE id = ?`,
            [
                String(entityType).slice(0, 50),
                String(entityId).slice(0, 64),
                employeeId ? String(employeeId).slice(0, 24) : null,
                asset.id
            ]
        ).catch(() => {});

        return asset.asset_uuid;
    }

    async handleMediaReplacement({ oldMediaRef, newMediaRef = null, actor = null } = {}) {
        if (!oldMediaRef || oldMediaRef === newMediaRef) return { changed: false };
        const asset = await findAssetByRef(oldMediaRef);
        if (!asset || asset.upload_status === 'deleted') {
            return { changed: false };
        }

        const liveRefs = await countLiveReferences(asset);
        if (liveRefs === 0) {
            await query(
                `UPDATE media_assets
                 SET upload_status = 'orphan_candidate',
                     orphan_since = COALESCE(orphan_since, NOW())
                 WHERE id = ? AND upload_status = 'active'`,
                [asset.id]
            ).catch(() => {});

            if (actor) {
                await logAuditEvent({
                    actor_id: actor.ma_nv || actor.username || 'system',
                    actor_role: actor.role || 'system',
                    action: 'MEDIA_MARK_ORPHAN_CANDIDATE',
                    resource: 'media_assets',
                    details: { asset_uuid: asset.asset_uuid, category: asset.upload_category }
                }).catch(() => {});
            }
            return { changed: true, markedOrphan: true, asset_uuid: asset.asset_uuid };
        }

        return { changed: true, markedOrphan: false, liveRefs, asset_uuid: asset.asset_uuid };
    }

    async runOrphanCleanup({
        retentionHours = null,
        dryRun = false,
        currentUser = null,
        remoteDeleteFn = null
    } = {}) {
        const secCfg = getUploadSecurityConfig();
        if (!secCfg.orphanCleanupEnabled && !dryRun) {
            return {
                enabled: false,
                scanned: 0,
                eligible: 0,
                deleted: 0,
                skipped_in_use: 0,
                items: []
            };
        }

        const effectiveRetention = retentionHours !== null && retentionHours !== undefined
            ? Math.max(0, Number(retentionHours))
            : secCfg.orphanRetentionHours;

        const candidates = await query(
            `SELECT * FROM media_assets
             WHERE (
                 (upload_status = 'orphan_candidate' AND orphan_since <= DATE_SUB(NOW(), INTERVAL ? HOUR))
                 OR
                 (upload_status = 'active' AND related_entity_id IS NULL AND created_at <= DATE_SUB(NOW(), INTERVAL ? HOUR))
             )
             ORDER BY created_at ASC
             LIMIT 100`,
            [effectiveRetention, effectiveRetention]
        );

        const deletedItems = [];
        const skippedInUse = [];
        const dryRunItems = [];
        const failedItems = [];

        const cloudinaryService = require('./cloudinaryService');
        const deleteRemote = remoteDeleteFn || ((asset) => cloudinaryService.deleteResource(asset));

        for (const asset of candidates || []) {
            const liveRefs = await countLiveReferences(asset);
            if (liveRefs > 0) {
                // Vẫn đang được sử dụng bởi DB -> khôi phục trạng thái active, tuyệt đối không xóa!
                await query(
                    `UPDATE media_assets SET upload_status = 'active', orphan_since = NULL WHERE id = ? AND upload_status = 'orphan_candidate'`,
                    [asset.id]
                ).catch(() => {});
                skippedInUse.push({ asset_uuid: asset.asset_uuid, live_refs: liveRefs });
                continue;
            }

            if (dryRun) {
                dryRunItems.push({
                    asset_uuid: asset.asset_uuid,
                    asset_folder: asset.asset_folder,
                    upload_category: asset.upload_category,
                    bytes: Number(asset.bytes || 0),
                    orphan_since: asset.orphan_since || asset.created_at
                });
                continue;
            }

            try {
                if (asset.public_id) {
                    await deleteRemote(asset);
                }
                const actorId = currentUser ? (currentUser.ma_nv || currentUser.username || 'admin') : 'system_cleanup';
                await query(
                    `UPDATE media_assets
                     SET upload_status = 'deleted',
                         deleted_at = NOW(),
                         deleted_by = ?,
                         delete_reason = 'ORPHAN_RETENTION_CLEANUP'
                     WHERE id = ?`,
                    [String(actorId).slice(0, 50), asset.id]
                );
                deletedItems.push({
                    asset_uuid: asset.asset_uuid,
                    bytes: Number(asset.bytes || 0),
                    asset_folder: asset.asset_folder
                });
            } catch (err) {
                failedItems.push({ asset_uuid: asset.asset_uuid, error: err.message });
            }
        }

        if (!dryRun && (deletedItems.length > 0 || currentUser)) {
            await logAuditEvent({
                actor_id: currentUser ? (currentUser.ma_nv || currentUser.username || 'admin') : 'system_cleanup',
                actor_role: currentUser?.role || 'system',
                action: 'MEDIA_ORPHAN_CLEANUP',
                resource: 'media_assets',
                details: {
                    retention_hours: effectiveRetention,
                    scanned: (candidates || []).length,
                    deleted_count: deletedItems.length,
                    freed_bytes: deletedItems.reduce((s, x) => s + x.bytes, 0),
                    skipped_in_use: skippedInUse.length,
                    failed_count: failedItems.length
                }
            }).catch(() => {});
        }

        return {
            enabled: secCfg.orphanCleanupEnabled,
            dry_run: Boolean(dryRun),
            retention_hours: effectiveRetention,
            scanned: (candidates || []).length,
            eligible: dryRun ? dryRunItems.length : deletedItems.length + failedItems.length,
            deleted: deletedItems.length,
            freed_bytes: deletedItems.reduce((s, x) => s + x.bytes, 0),
            skipped_in_use: skippedInUse.length,
            failed: failedItems.length,
            items: dryRun ? dryRunItems : deletedItems,
            failed_items: failedItems
        };
    }

    async deleteAssetWithSafetyCheck({ assetUuid, currentUser, reason = 'ADMIN_MANUAL_DELETE', remoteDeleteFn = null }) {
        if (!currentUser) {
            const err = new Error('Yêu cầu đăng nhập!');
            err.statusCode = 401;
            throw err;
        }
        const rows = await query('SELECT * FROM media_assets WHERE asset_uuid = ? LIMIT 1', [assetUuid]);
        if (!rows || rows.length === 0) {
            const err = new Error('Không tìm thấy tài nguyên media yêu cầu!');
            err.statusCode = 404;
            err.code = 'MEDIA_NOT_FOUND';
            throw err;
        }
        const asset = rows[0];
        if (asset.upload_status === 'deleted') {
            return { success: true, already_deleted: true, asset_uuid: assetUuid };
        }

        const actorId = currentUser.ma_nv || currentUser.username || '';
        const isAdmin = currentUser.role === 'admin';
        const isOwnerDraft = asset.uploaded_by === actorId && !asset.related_entity_id;

        if (!isAdmin && !isOwnerDraft) {
            const err = new Error('Bạn không có quyền xóa tài nguyên media của người khác hoặc đã gắn với nghiệp vụ! Chỉ Quản trị viên mới có quyền này.');
            err.statusCode = 403;
            err.code = 'MEDIA_DELETE_FORBIDDEN';
            throw err;
        }

        const liveRefs = await countLiveReferences(asset);
        // Nếu xóa hồ sơ nhân viên (employee_document) của Admin thì cho phép nếu Admin truyền force_detach
        if (liveRefs > 0 && !(isAdmin && reason === 'DETACH_EMPLOYEE_DOCUMENT' && asset.related_entity_type === 'employee_document')) {
            const err = new Error(
                `Không thể xóa tệp vì đang được sử dụng bởi ${liveRefs} bản ghi hồ sơ / đơn từ / bảng công trong hệ thống!`
            );
            err.statusCode = 409;
            err.code = 'ASSET_IN_USE';
            throw err;
        }

        if (asset.public_id) {
            const cloudinaryService = require('./cloudinaryService');
            const deleteRemote = remoteDeleteFn || ((target) => cloudinaryService.deleteResource(target));
            await deleteRemote(asset);
        }

        await query(
            `UPDATE media_assets
             SET upload_status = 'deleted',
                 deleted_at = NOW(),
                 deleted_by = ?,
                 delete_reason = ?
             WHERE id = ?`,
            [String(actorId).slice(0, 50), String(reason || 'MANUAL_DELETE').slice(0, 255), asset.id]
        );

        await logAuditEvent({
            actor_id: actorId,
            actor_role: currentUser.role || 'worker',
            action: 'MEDIA_ADMIN_DELETE',
            resource: 'media_assets',
            details: { asset_uuid: asset.asset_uuid, public_id: asset.public_id, reason, bytes: Number(asset.bytes || 0) }
        }).catch(() => {});

        return {
            success: true,
            asset_uuid: asset.asset_uuid,
            deleted: true,
            freed_bytes: Number(asset.bytes || 0)
        };
    }
}

module.exports = new MediaLifecycleService();
module.exports.findAssetByRef = findAssetByRef;
module.exports.countLiveReferences = countLiveReferences;
