/**
 * Multi-layer Upload Rate Limiter & Concurrency Guard (Database-backed consistent store).
 * Bảo vệ đa instance không phụ thuộc RAM cục bộ:
 * - Giới hạn theo tài khoản nhân viên (cửa sổ request, số file/ngày, dung lượng/ngày, đồng thời)
 * - Giới hạn theo toàn hệ thống (tổng upload đồng thời)
 * - Chống bất thường theo IP nhưng an toàn với NAT văn phòng/chi nhánh (tỷ lệ thuận theo số tài khoản hợp lệ cùng IP)
 * - Theo dõi hash thiết bị mà không tin tưởng device ID làm bằng chứng danh tính
 */

const crypto = require('crypto');
const { query } = require('../config/db');
const { getUploadSecurityConfig } = require('../config/cloudinaryConfig');
const { getVietnamDateString } = require('../utils/timeHelper');

const STALE_IN_FLIGHT_SECONDS = 120;

function computeDeviceHash({ deviceId = '', userAgent = '' } = {}) {
    const raw = `${String(deviceId || '').trim()}|${String(userAgent || '').trim()}`;
    if (raw === '|') return null;
    return crypto.createHash('sha256').update(raw).digest('hex');
}

function getVietnamDayStartDateUtc() {
    const vnDate = getVietnamDateString(new Date());
    return new Date(`${vnDate}T00:00:00+07:00`);
}

async function recordUploadEvent({
    eventType,
    actorId = 'anonymous',
    actorRole = null,
    ipAddress = null,
    deviceIdHash = null,
    category = null,
    resourceType = null,
    bytes = 0,
    assetUuid = null,
    errorCode = null,
    details = null,
    inFlight = 0
} = {}) {
    try {
        const res = await query(
            `INSERT INTO media_upload_events (
                event_type, actor_id, actor_role, ip_address, device_id_hash,
                upload_category, resource_type, bytes, asset_uuid, error_code,
                details, in_flight, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                String(eventType || 'info').slice(0, 32),
                String(actorId || 'anonymous').slice(0, 50),
                actorRole ? String(actorRole).slice(0, 20) : null,
                ipAddress ? String(ipAddress).slice(0, 64) : null,
                deviceIdHash ? String(deviceIdHash).slice(0, 64) : null,
                category ? String(category).slice(0, 64) : null,
                resourceType ? String(resourceType).slice(0, 20) : null,
                Math.max(0, Number(bytes) || 0),
                assetUuid ? String(assetUuid).slice(0, 36) : null,
                errorCode ? String(errorCode).slice(0, 64) : null,
                details ? String(details).slice(0, 500) : null,
                inFlight ? 1 : 0,
                inFlight ? null : new Date()
            ]
        );
        return res?.insertId || null;
    } catch {
        return null;
    }
}

async function releaseStaleInFlightClaims() {
    await query(
        `UPDATE media_upload_events
         SET in_flight = 0, event_type = 'aborted_timeout', completed_at = NOW()
         WHERE in_flight = 1 AND created_at < DATE_SUB(NOW(), INTERVAL ? SECOND)`,
        [STALE_IN_FLIGHT_SECONDS]
    ).catch(() => {});
}

async function checkAndClaimUploadSlot({
    actorId,
    actorRole,
    ipAddress = '',
    deviceIdHash = null,
    category = '',
    fileCount = 1,
    incomingBytes = 0
}) {
    const cfg = getUploadSecurityConfig();
    await releaseStaleInFlightClaims();

    const dayStart = getVietnamDayStartDateUtc();
    const cleanActor = String(actorId || '').slice(0, 50);
    const cleanIp = String(ipAddress || '').slice(0, 64);

    // 1. Kiểm tra giới hạn số request trong cửa sổ thời gian cho tài khoản
    const windowRows = await query(
        `SELECT COUNT(*) AS req_count,
                MIN(TIMESTAMPDIFF(SECOND, created_at, NOW())) AS newest_age,
                MAX(TIMESTAMPDIFF(SECOND, created_at, NOW())) AS oldest_age
         FROM media_upload_events
         WHERE actor_id = ?
           AND event_type IN ('inflight_claim', 'accepted')
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)`,
        [cleanActor, cfg.rateLimitWindowSeconds]
    );

    const userWindowRequests = Number(windowRows?.[0]?.req_count || 0);
    if (userWindowRequests >= cfg.rateLimitMaxRequests) {
        const oldestAge = Number(windowRows?.[0]?.oldest_age || 0);
        const retryAfter = Math.max(5, cfg.rateLimitWindowSeconds - oldestAge);
        await recordUploadEvent({
            eventType: 'rejected_rate_limit',
            actorId: cleanActor,
            actorRole,
            ipAddress: cleanIp,
            deviceIdHash,
            category,
            bytes: incomingBytes,
            errorCode: 'UPLOAD_RATE_LIMIT_EXCEEDED',
            details: `${userWindowRequests}/${cfg.rateLimitMaxRequests} requests within ${cfg.rateLimitWindowSeconds}s`
        });
        const err = new Error(
            `Bạn đã gửi quá ${cfg.rateLimitMaxRequests} lượt tải tệp trong ${Math.round(cfg.rateLimitWindowSeconds / 60)} phút. Vui lòng đợi ${retryAfter} giây rồi thử lại!`
        );
        err.statusCode = 429;
        err.code = 'UPLOAD_RATE_LIMIT_EXCEEDED';
        err.retryAfterSeconds = retryAfter;
        throw err;
    }

    // 2. Kiểm tra hạn mức số file/ngày và tổng dung lượng/ngày của tài khoản
    const dailyRows = await query(
        `SELECT COUNT(*) AS file_count, COALESCE(SUM(bytes), 0) AS total_bytes
         FROM media_assets
         WHERE uploaded_by = ?
           AND created_at >= ?
           AND upload_status IN ('uploading', 'active', 'orphan_candidate')`,
        [cleanActor, dayStart]
    );

    const usedDailyFiles = Number(dailyRows?.[0]?.file_count || 0);
    const usedDailyBytes = Number(dailyRows?.[0]?.total_bytes || 0);

    if (usedDailyFiles + fileCount > cfg.dailyMaxFilesPerUser) {
        await recordUploadEvent({
            eventType: 'rejected_daily_quota',
            actorId: cleanActor,
            actorRole,
            ipAddress: cleanIp,
            deviceIdHash,
            category,
            bytes: incomingBytes,
            errorCode: 'DAILY_FILE_QUOTA_EXCEEDED',
            details: `${usedDailyFiles}+${fileCount} > ${cfg.dailyMaxFilesPerUser}`
        });
        const err = new Error(
            `Bạn đã đạt giới hạn tối đa ${cfg.dailyMaxFilesPerUser} tệp tải lên trong ngày! Vui lòng thử lại vào ngày mai hoặc liên hệ Quản trị viên.`
        );
        err.statusCode = 429;
        err.code = 'DAILY_FILE_QUOTA_EXCEEDED';
        err.retryAfterSeconds = 300;
        throw err;
    }

    if (usedDailyBytes + incomingBytes > cfg.dailyMaxBytesPerUser) {
        const maxMb = Math.round(cfg.dailyMaxBytesPerUser / (1024 * 1024));
        await recordUploadEvent({
            eventType: 'rejected_daily_quota',
            actorId: cleanActor,
            actorRole,
            ipAddress: cleanIp,
            deviceIdHash,
            category,
            bytes: incomingBytes,
            errorCode: 'DAILY_BYTE_QUOTA_EXCEEDED',
            details: `${usedDailyBytes}+${incomingBytes} > ${cfg.dailyMaxBytesPerUser}`
        });
        const err = new Error(
            `Tổng dung lượng tải lên trong ngày của bạn đã đạt giới hạn ${maxMb}MB! Vui lòng nén tệp nhẹ hơn hoặc liên hệ Quản trị viên.`
        );
        err.statusCode = 429;
        err.code = 'DAILY_BYTE_QUOTA_EXCEEDED';
        err.retryAfterSeconds = 300;
        throw err;
    }

    // 3. Kiểm tra bất thường theo IP nhưng an toàn với NAT công ty/chi nhánh
    if (cleanIp) {
        const ipRows = await query(
            `SELECT COUNT(DISTINCT CASE WHEN event_type IN ('inflight_claim', 'accepted') THEN actor_id END) AS distinct_actors,
                    SUM(CASE WHEN event_type IN ('inflight_claim', 'accepted') THEN 1 ELSE 0 END) AS ip_reqs,
                    SUM(CASE WHEN event_type LIKE 'rejected_%' THEN 1 ELSE 0 END) AS ip_rejections
             FROM media_upload_events
             WHERE ip_address = ?
               AND created_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)`,
            [cleanIp, cfg.rateLimitWindowSeconds]
        );
        const distinctActors = Math.max(1, Number(ipRows?.[0]?.distinct_actors || 1));
        const ipReqs = Number(ipRows?.[0]?.ip_reqs || 0);
        const ipRejections = Number(ipRows?.[0]?.ip_rejections || 0);
        // Nếu nhiều nhân viên dùng chung NAT văn phòng, hạn mức IP tự mở rộng theo số tài khoản đang hoạt động;
        // chỉ chặn nếu có hành vi flood bất thường vượt xa lưu lượng hợp lệ.
        const natSafeIpReqCap = Math.max(cfg.rateLimitMaxRequests * 4, distinctActors * cfg.rateLimitMaxRequests * 2);
        const natSafeIpRejectCap = Math.max(30, distinctActors * 15);

        if (ipReqs >= natSafeIpReqCap || ipRejections >= natSafeIpRejectCap) {
            await recordUploadEvent({
                eventType: 'rejected_ip_anomaly',
                actorId: cleanActor,
                actorRole,
                ipAddress: cleanIp,
                deviceIdHash,
                category,
                bytes: incomingBytes,
                errorCode: 'IP_ABUSE_DETECTED',
                details: `ipReqs=${ipReqs}/${natSafeIpReqCap}, ipRejects=${ipRejections}/${natSafeIpRejectCap}, actors=${distinctActors}`
            });
            const err = new Error('Phát hiện lưu lượng tải tệp bất thường từ địa chỉ mạng hiện tại. Vui lòng tạm dừng ít phút rồi thử lại!');
            err.statusCode = 429;
            err.code = 'IP_ABUSE_DETECTED';
            err.retryAfterSeconds = 60;
            throw err;
        }
    }

    // 4. Kiểm tra thiết bị spam nhiều lỗi bất thường
    if (deviceIdHash) {
        const devRows = await query(
            `SELECT SUM(CASE WHEN event_type IN ('rejected_validation', 'rejected_security') THEN 1 ELSE 0 END) AS dev_sec_rejects
             FROM media_upload_events
             WHERE device_id_hash = ?
               AND created_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)`,
            [deviceIdHash, cfg.rateLimitWindowSeconds]
        );
        const devRejects = Number(devRows?.[0]?.dev_sec_rejects || 0);
        if (devRejects >= 20) {
            await recordUploadEvent({
                eventType: 'rejected_device_anomaly',
                actorId: cleanActor,
                actorRole,
                ipAddress: cleanIp,
                deviceIdHash,
                category,
                bytes: incomingBytes,
                errorCode: 'DEVICE_ABUSE_DETECTED',
                details: `devSecRejects=${devRejects}`
            });
            const err = new Error('Thiết bị tạm thời bị hạn chế tải tệp do gửi nhiều tệp không hợp lệ liên tiếp.');
            err.statusCode = 429;
            err.code = 'DEVICE_ABUSE_DETECTED';
            err.retryAfterSeconds = 120;
            throw err;
        }
    }

    // 5. Chiếm slot đồng thời nguyên tử (post-insert sequence guard chống race condition trên multi-instance)
    const claimId = await recordUploadEvent({
        eventType: 'inflight_claim',
        actorId: cleanActor,
        actorRole,
        ipAddress: cleanIp,
        deviceIdHash,
        category,
        bytes: incomingBytes,
        inFlight: 1
    });

    if (claimId) {
        const concRows = await query(
            `SELECT SUM(CASE WHEN actor_id = ? THEN 1 ELSE 0 END) AS user_inflight,
                    COUNT(*) AS global_inflight
             FROM media_upload_events
             WHERE in_flight = 1 AND id <= ?`,
            [cleanActor, claimId]
        );
        const userInFlight = Number(concRows?.[0]?.user_inflight || 0);
        const globalInFlight = Number(concRows?.[0]?.global_inflight || 0);

        if (userInFlight > cfg.maxConcurrentPerUser) {
            await query(
                `UPDATE media_upload_events SET in_flight = 0, event_type = 'rejected_concurrency', error_code = 'TOO_MANY_CONCURRENT_UPLOADS', completed_at = NOW() WHERE id = ?`,
                [claimId]
            ).catch(() => {});
            const err = new Error(`Bạn chỉ được tải lên tối đa ${cfg.maxConcurrentPerUser} tệp đồng thời. Vui lòng đợi lượt hiện tại hoàn tất!`);
            err.statusCode = 429;
            err.code = 'TOO_MANY_CONCURRENT_UPLOADS';
            err.retryAfterSeconds = 3;
            throw err;
        }

        if (globalInFlight > cfg.globalMaxConcurrent) {
            await query(
                `UPDATE media_upload_events SET in_flight = 0, event_type = 'rejected_global_concurrency', error_code = 'SYSTEM_UPLOAD_BUSY', completed_at = NOW() WHERE id = ?`,
                [claimId]
            ).catch(() => {});
            const err = new Error('Hệ thống đang xử lý nhiều tệp tải lên đồng thời. Vui lòng thử lại sau vài giây!');
            err.statusCode = 429;
            err.code = 'SYSTEM_UPLOAD_BUSY';
            err.retryAfterSeconds = 5;
            throw err;
        }
    }

    const finalize = async ({
        eventType = 'accepted',
        resourceType = null,
        bytes = incomingBytes,
        assetUuid = null,
        errorCode = null,
        details = null
    } = {}) => {
        if (!claimId) return;
        await query(
            `UPDATE media_upload_events
             SET event_type = ?, resource_type = COALESCE(?, resource_type),
                 bytes = ?, asset_uuid = COALESCE(?, asset_uuid),
                 error_code = ?, details = ?, in_flight = 0, completed_at = NOW()
             WHERE id = ?`,
            [
                String(eventType).slice(0, 32),
                resourceType ? String(resourceType).slice(0, 20) : null,
                Math.max(0, Number(bytes) || 0),
                assetUuid ? String(assetUuid).slice(0, 36) : null,
                errorCode ? String(errorCode).slice(0, 64) : null,
                details ? String(details).slice(0, 500) : null,
                claimId
            ]
        ).catch(() => {});
    };

    return {
        claimId,
        finalize,
        usageSnapshot: {
            usedDailyFiles,
            usedDailyBytes,
            dailyMaxFilesPerUser: cfg.dailyMaxFilesPerUser,
            dailyMaxBytesPerUser: cfg.dailyMaxBytesPerUser,
            userWindowRequests,
            rateLimitMaxRequests: cfg.rateLimitMaxRequests
        }
    };
}

module.exports = {
    STALE_IN_FLIGHT_SECONDS,
    computeDeviceHash,
    recordUploadEvent,
    releaseStaleInFlightClaims,
    checkAndClaimUploadSlot
};
