/**
 * Centralized Cloudinary Media Service (Hosting-agnostic, SDK v2 + Streaming):
 * - Cổng upload duy nhất cho toàn bộ ứng dụng Sedinco HR.
 * - Quy trình 10 bước bắt buộc trước khi chạm Cloudinary:
 *   1. Xác thực JWT -> 2. Kiểm tra tài khoản hoạt động -> 3. RBAC & quyền kế toán ->
 *   4. Kiểm tra danh mục nghiệp vụ & chặn tham số ghi đè từ client ->
 *   5. Rate limit / Concurrency / Hạn mức ngày (DB-backed) ->
 *   6. Kiểm tra dung lượng theo nghiệp vụ ->
 *   7. Kiểm tra Storage Budget & Ngưỡng cảnh báo (70%/85%/95%/100%) ->
 *   8. Kiểm tra magic-bytes, MIME, extension, chống EXE/SVG/HTML/JS/PDF nguy hiểm ->
 *   9. Kiểm tra trùng lặp SHA-256 ->
 *   10. Upload stream lên Cloudinary (Dynamic/Fixed Folder Mode + Private Authenticated Delivery) & lưu metadata DB.
 * - Không bao giờ trả CLOUDINARY_API_SECRET hoặc lộ URL tài nguyên riêng tư cho người không có quyền.
 */

const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const { query, withTransaction } = require('../config/db');
const { getCloudinaryCredentialsConfig, getUploadSecurityConfig } = require('../config/cloudinaryConfig');
const { getAccountantPermissions, logAuditEvent } = require('../middlewares/authMiddleware');
const {
    detectForbiddenUploadParams,
    resolveCategoryPolicy,
    resolveTargetAssetFolder,
    generateSafePublicIdSlug,
    getEffectiveMaxBytesForMime,
    resolveCloudinaryResourceType,
    getPublicCategoryCatalog
} = require('../utils/mediaFolderPolicy');
const {
    inspectUploadedBuffer,
    parseBase64ImageDataUrl
} = require('../utils/mediaValidator');
const {
    computeDeviceHash,
    recordUploadEvent,
    checkAndClaimUploadSlot
} = require('./uploadRateLimiter');
const cloudinaryUsageMonitor = require('./cloudinaryUsageMonitor');

const MAX_COMPACT_FALLBACK_BYTES = 155 * 1024;
const CLOUDINARY_UPLOAD_TIMEOUT_MS = 25000;

function configureSdkInstance() {
    const cfg = getCloudinaryCredentialsConfig();
    if (!cfg.configured) return cfg;
    cloudinary.config({
        cloud_name: cfg.cloudName,
        api_key: cfg.apiKey,
        api_secret: cfg.apiSecret,
        secure: true
    });
    return cfg;
}

class CloudinaryService {
    constructor() {
        this.transportAdapter = null;
    }

    /**
     * Cho phép kiểm thử tích hợp / quota / timeout / lỗi 420 trên môi trường NODE_ENV=test
     * mà không gửi rác lên tài khoản Cloudinary thật.
     */
    setTransportAdapter(adapter) {
        if (process.env.NODE_ENV !== 'test' && adapter !== null) {
            throw new Error('Transport adapter injection is strictly restricted to NODE_ENV=test.');
        }
        this.transportAdapter = adapter;
    }

    getPublicMediaConfig() {
        const credCfg = getCloudinaryCredentialsConfig();
        const secCfg = getUploadSecurityConfig();
        return {
            cloudinary_configured: Boolean(credCfg.configured || this.transportAdapter),
            folder_mode: credCfg.folderMode,
            max_files_per_request: secCfg.maxFilesPerRequest,
            max_upload_bytes: secCfg.maxImageSizeBytes,
            max_image_size_bytes: secCfg.maxImageSizeBytes,
            max_document_size_bytes: secCfg.maxDocumentSizeBytes,
            max_video_size_bytes: secCfg.maxVideoSizeBytes,
            max_compact_fallback_bytes: MAX_COMPACT_FALLBACK_BYTES,
            allowed_types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm'],
            supported_categories: getPublicCategoryCatalog().map((c) => c.category),
            categories: getPublicCategoryCatalog()
        };
    }

    async verifyActorActiveAndAuthorized({ currentUser, policy, targetEmployeeId = null }) {
        if (!currentUser) {
            const err = new Error('Yêu cầu đăng nhập để tải tệp lên hệ thống!');
            err.statusCode = 401;
            err.code = 'UNAUTHORIZED';
            throw err;
        }

        const role = currentUser.role === 'employee' ? 'worker' : (currentUser.role || 'worker');
        const actorId = String(currentUser.ma_nv || currentUser.username || '').trim();

        // 2. Xác thực trực tiếp trạng thái hoạt động từ DB
        if (role !== 'admin' || currentUser.ma_nv) {
            const rows = await query(
                'SELECT ma_nv, status, is_locked, role FROM employees WHERE ma_nv = ? LIMIT 1',
                [actorId]
            );
            if (!rows || rows.length === 0) {
                const err = new Error('Tài khoản nhân viên không tồn tại!');
                err.statusCode = 403;
                err.code = 'ACCOUNT_NOT_FOUND';
                throw err;
            }
            if (rows[0].is_locked === 1 || rows[0].status === 'inactive' || rows[0].status === 'locked') {
                const err = new Error('Tài khoản của bạn đang bị khóa hoặc ngừng hoạt động. Không thể tải tệp lên!');
                err.statusCode = 403;
                err.code = 'ACCOUNT_LOCKED';
                throw err;
            }
        } else {
            const admRows = await query('SELECT id, username FROM admins WHERE username = ? LIMIT 1', [actorId]);
            if (!admRows || admRows.length === 0) {
                const err = new Error('Tài khoản quản trị không hợp lệ!');
                err.statusCode = 403;
                err.code = 'ACCOUNT_NOT_FOUND';
                throw err;
            }
        }

        // 3. Kiểm tra RBAC role & permission động của Kế toán
        if (!policy.allowedRoles.includes(role)) {
            const err = new Error(`Vai trò "${role}" không có quyền tải tệp cho mục "${policy.label}"!`);
            err.statusCode = 403;
            err.code = 'FORBIDDEN_UPLOAD_CATEGORY';
            throw err;
        }

        const resolvedEmployeeId = targetEmployeeId ? String(targetEmployeeId).trim() : (currentUser.ma_nv || actorId);

        if (role === 'accountant' && policy.requiredAccountantPermission) {
            const perms = await getAccountantPermissions();
            const hasPerm = Boolean(perms?.[policy.requiredAccountantPermission]);
            // Kế toán tải tài liệu cá nhân của chính mình (trừ nghiệp vụ quản trị system_import) luôn được phép như mọi nhân viên
            const isSelfAction = Boolean(resolvedEmployeeId && resolvedEmployeeId === actorId && policy.canonical !== 'system_import');
            if (!hasPerm && !isSelfAction) {
                const err = new Error(`Tài khoản Kế toán chưa được cấp quyền "${policy.requiredAccountantPermission}" cho thao tác này!`);
                err.statusCode = 403;
                err.code = 'FORBIDDEN_ACCOUNTANT_PERMISSION';
                throw err;
            }
        }

        // Chống gửi hộ / đè tài nguyên của nhân viên khác nếu không có quyền Admin/HR
        if (resolvedEmployeeId && resolvedEmployeeId !== actorId && !policy.allowForTargetOther.includes(role)) {
            const err = new Error('Bạn không có quyền tải tệp vào hồ sơ của nhân viên khác!');
            err.statusCode = 403;
            err.code = 'FORBIDDEN_TARGET_EMPLOYEE';
            throw err;
        }

        return { actorId, role, resolvedEmployeeId };
    }

    async uploadBufferToCloudinary({
        buffer,
        policy,
        assetFolder,
        publicIdSlug,
        resourceType,
        folderMode,
        deliveryType
    }) {
        const credCfg = configureSdkInstance();
        const effectiveFolderMode = folderMode === 'fixed' ? 'fixed' : 'dynamic';

        const uploadOptions = {
            resource_type: resourceType,
            type: deliveryType,
            use_filename: false,
            unique_filename: false,
            overwrite: false,
            timeout: CLOUDINARY_UPLOAD_TIMEOUT_MS
        };

        if (effectiveFolderMode === 'fixed') {
            uploadOptions.folder = assetFolder;
            uploadOptions.public_id = publicIdSlug;
        } else {
            uploadOptions.asset_folder = assetFolder;
            uploadOptions.public_id = publicIdSlug;
        }

        if (this.transportAdapter?.uploadStream) {
            return this.transportAdapter.uploadStream(buffer, uploadOptions);
        }

        if (!credCfg.configured) {
            return null;
        }

        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                const timeoutErr = new Error('Quá thời gian tải tệp lên kho lưu trữ Cloudinary. Vui lòng thử lại!');
                timeoutErr.statusCode = 504;
                timeoutErr.code = 'CLOUDINARY_TIMEOUT';
                reject(timeoutErr);
            }, CLOUDINARY_UPLOAD_TIMEOUT_MS);

            const stream = cloudinary.uploader.upload_stream(uploadOptions, (err, result) => {
                clearTimeout(timer);
                if (settled) return;
                settled = true;

                if (err) {
                    const httpCode = Number(err.http_code || 502);
                    // Nếu gói Cloudinary không hỗ trợ authenticated/private delivery trên resource_type này
                    if (
                        (httpCode === 400 || httpCode === 401 || httpCode === 403) &&
                        deliveryType !== 'upload' &&
                        /authenticated|private|access control|restricted/i.test(String(err.message || ''))
                    ) {
                        const planErr = new Error(err.message);
                        planErr.code = 'CLOUDINARY_PRIVATE_DELIVERY_UNSUPPORTED';
                        planErr.statusCode = 403;
                        return reject(planErr);
                    }
                    if (httpCode === 420 || httpCode === 429) {
                        const rateErr = new Error('Kho lưu trữ Cloudinary đang đạt giới hạn truy cập (HTTP 420/429). Vui lòng thử lại sau!');
                        rateErr.statusCode = 429;
                        rateErr.code = 'CLOUDINARY_RATE_LIMITED';
                        return reject(rateErr);
                    }
                    const wrapped = new Error(`Lỗi kết nối kho lưu trữ Cloudinary: ${err.message || 'Upload thất bại'}`);
                    wrapped.statusCode = httpCode >= 400 && httpCode < 600 ? httpCode : 502;
                    wrapped.code = 'CLOUDINARY_UPLOAD_FAILED';
                    return reject(wrapped);
                }
                resolve(result);
            });

            stream.on('error', (streamErr) => {
                clearTimeout(timer);
                if (settled) return;
                settled = true;
                const wrapped = new Error(`Lỗi luồng truyền tải Cloudinary: ${streamErr.message}`);
                wrapped.statusCode = 502;
                wrapped.code = 'CLOUDINARY_STREAM_ERROR';
                reject(wrapped);
            });

            stream.end(buffer);
        });
    }

    async uploadFilesPipeline({
        files = [],
        rawBodyParams = {},
        category = 'employee_attachment',
        referenceDate = '',
        targetEmployeeId = null,
        currentUser = null,
        ipAddress = '',
        deviceId = '',
        userAgent = ''
    }) {
        const secCfg = getUploadSecurityConfig();
        const credCfg = getCloudinaryCredentialsConfig();

        // Chặn mọi tham số folder / public_id / api_secret / resource_type gửi lén từ frontend
        const forbiddenParams = detectForbiddenUploadParams(rawBodyParams);
        if (forbiddenParams.length > 0) {
            await recordUploadEvent({
                eventType: 'rejected_security',
                actorId: currentUser?.ma_nv || currentUser?.username || 'anonymous',
                actorRole: currentUser?.role || null,
                ipAddress,
                deviceIdHash: computeDeviceHash({ deviceId, userAgent }),
                category: String(category || ''),
                errorCode: 'UNTRUSTED_UPLOAD_PARAMETER',
                details: `Rejected client override params: ${forbiddenParams.join(',')}`
            });
            const err = new Error(`Tham số không được phép gửi từ client: ${forbiddenParams.join(', ')}`);
            err.statusCode = 400;
            err.code = 'UNTRUSTED_UPLOAD_PARAMETER';
            throw err;
        }

        // Bước 4: Xác định policy từ danh mục nghiệp vụ cho phép
        const policy = resolveCategoryPolicy(category);

        // Bước 1, 2, 3: Xác thực tài khoản & phân quyền
        const { actorId, role, resolvedEmployeeId } = await this.verifyActorActiveAndAuthorized({
            currentUser,
            policy,
            targetEmployeeId
        });

        if (!Array.isArray(files) || files.length === 0) {
            const err = new Error('Không tìm thấy tệp nào được gửi lên!');
            err.statusCode = 400;
            err.code = 'MISSING_FILE';
            throw err;
        }

        if (files.length > secCfg.maxFilesPerRequest) {
            await recordUploadEvent({
                eventType: 'rejected_validation',
                actorId,
                actorRole: role,
                ipAddress,
                deviceIdHash: computeDeviceHash({ deviceId, userAgent }),
                category: policy.canonical,
                errorCode: 'TOO_MANY_FILES_PER_REQUEST',
                details: `${files.length} > ${secCfg.maxFilesPerRequest}`
            });
            const err = new Error(`Mỗi lần chỉ được tải lên tối đa ${secCfg.maxFilesPerRequest} tệp!`);
            err.statusCode = 400;
            err.code = 'TOO_MANY_FILES_PER_REQUEST';
            throw err;
        }

        const deviceIdHash = computeDeviceHash({ deviceId, userAgent });
        const approxTotalBytes = files.reduce((s, f) => s + (Buffer.isBuffer(f.buffer) ? f.buffer.length : 0), 0);

        // Bước 5: Rate limit + hạn mức ngày + NAT-safe IP + concurrency claim
        const slot = await checkAndClaimUploadSlot({
            actorId,
            actorRole: role,
            ipAddress,
            deviceIdHash,
            category: policy.canonical,
            fileCount: files.length,
            incomingBytes: approxTotalBytes
        });

        const uploadedAssets = [];
        let claimFinalized = false;

        try {
            // Bước 8: Kiểm tra magic-bytes, dung lượng thực tế, extension/MIME & mã độc cho toàn bộ batch trước khi upload
            const inspectedFiles = files.map((fileItem) => {
                const rawMaxCap = Math.max(secCfg.maxImageSizeBytes, secCfg.maxDocumentSizeBytes, secCfg.maxVideoSizeBytes);
                const preCheck = inspectUploadedBuffer(fileItem.buffer, {
                    originalFilename: fileItem.originalname || '',
                    declaredMime: fileItem.mimetype || '',
                    allowedMimes: policy.allowedMimes,
                    maxBytes: rawMaxCap
                });
                const effectiveMax = getEffectiveMaxBytesForMime(policy, preCheck.detectedMime);
                if (preCheck.bytes > effectiveMax) {
                    const maxMb = (effectiveMax / (1024 * 1024)).toFixed(1);
                    const sizeErr = new Error(`Tệp vượt quá giới hạn tối đa ${maxMb}MB cho "${policy.label}"!`);
                    sizeErr.statusCode = 413;
                    sizeErr.code = 'MEDIA_TOO_LARGE';
                    throw sizeErr;
                }
                return preCheck;
            });

            const exactBatchBytes = inspectedFiles.reduce((s, f) => s + f.bytes, 0);

            // Bước 7: Kiểm tra Storage Budget (70% / 85% / 95% / 100%)
            await cloudinaryUsageMonitor.evaluateQuotaBeforeUpload({
                incomingBytes: exactBatchBytes,
                policy,
                actor: currentUser
            });

            const assetFolder = resolveTargetAssetFolder(policy, {
                employeeId: resolvedEmployeeId,
                referenceDate
            });

            const deliveryType = policy.accessLevel === 'private'
                ? credCfg.privateDeliveryType
                : 'upload';
            const folderMode = credCfg.folderMode === 'fixed' ? 'fixed' : 'dynamic';

            for (const inspected of inspectedFiles) {
                // Bước 9: Kiểm tra trùng lặp SHA-256 của cùng người dùng, cùng nhân viên mục tiêu & danh mục trong 24h
                if (secCfg.duplicateCheckEnabled) {
                    const dupRows = await query(
                        `SELECT * FROM media_assets
                         WHERE checksum = ?
                           AND uploaded_by = ?
                           AND upload_category = ?
                           AND COALESCE(employee_id, '') = ?
                           AND upload_status IN ('active', 'orphan_candidate')
                           AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                         ORDER BY id DESC LIMIT 1`,
                        [inspected.checksum, actorId, policy.canonical, resolvedEmployeeId || '']
                    );
                    if (dupRows?.[0]) {
                        const existing = dupRows[0];
                        // Khôi phục active nếu trước đó từng là orphan_candidate và tái sử dụng thay vì tạo bản sao rác trên Cloudinary
                        if (existing.upload_status === 'orphan_candidate') {
                            await query(
                                `UPDATE media_assets SET upload_status = 'active', orphan_since = NULL WHERE id = ?`,
                                [existing.id]
                            ).catch(() => {});
                        }
                        const exposedUrl = existing.access_level === 'private'
                            ? `/api/media/${existing.asset_uuid}/access`
                            : existing.secure_url;

                        uploadedAssets.push({
                            asset_uuid: existing.asset_uuid,
                            employee_id: existing.employee_id || null,
                            url: exposedUrl,
                            secure_url: existing.access_level === 'private' ? null : existing.secure_url,
                            access_level: existing.access_level,
                            storage: existing.public_id ? 'cloudinary' : 'inline_compact_fallback',
                            deduplicated: true,
                            cloudinary_configured: Boolean(credCfg.configured || this.transportAdapter),
                            public_id: existing.public_id,
                            asset_id: existing.asset_id,
                            asset_folder: existing.asset_folder,
                            resource_type: existing.resource_type,
                            format: existing.format,
                            bytes: Number(existing.bytes || inspected.bytes),
                            mime: existing.mime_type,
                            original_filename: existing.original_filename || inspected.originalFilename,
                            category: policy.canonical,
                            checksum: inspected.checksum
                        });
                        continue;
                    }
                }

                const assetUuid = crypto.randomUUID();
                const publicIdSlug = generateSafePublicIdSlug(policy);
                const resourceType = resolveCloudinaryResourceType(inspected.detectedMime);

                // Bước 10: Upload lên Cloudinary (hoặc safe compact fallback chỉ khi dev chưa có Cloudinary & ảnh <= 155KB)
                let cloudRes = null;
                let actualDeliveryType = deliveryType;
                let storageMode = 'cloudinary';
                let finalSecureUrl = null;
                let finalPublicId = null;
                let finalAssetId = null;
                let finalAssetFolder = assetFolder;

                if (credCfg.configured || this.transportAdapter?.uploadStream) {
                    try {
                        cloudRes = await this.uploadBufferToCloudinary({
                            buffer: inspected.buffer,
                            policy,
                            assetFolder,
                            publicIdSlug,
                            resourceType,
                            folderMode,
                            deliveryType: actualDeliveryType
                        });
                    } catch (cloudErr) {
                        // Nếu gói Cloudinary miễn phí chưa mở Authenticated delivery, ghi log cảnh báo bảo mật & fallback sang signed private delivery hoặc upload có backend proxy bảo vệ
                        if (cloudErr.code === 'CLOUDINARY_PRIVATE_DELIVERY_UNSUPPORTED' && actualDeliveryType !== 'upload') {
                            await logAuditEvent({
                                actor_id: actorId,
                                actor_role: role,
                                action: 'CLOUDINARY_PRIVATE_DELIVERY_FALLBACK',
                                resource: 'media_security',
                                details: { category: policy.canonical, reason: cloudErr.message }
                            }).catch(() => {});
                            actualDeliveryType = 'upload';
                            cloudRes = await this.uploadBufferToCloudinary({
                                buffer: inspected.buffer,
                                policy,
                                assetFolder,
                                publicIdSlug,
                                resourceType,
                                folderMode,
                                deliveryType: 'upload'
                            });
                        } else {
                            throw cloudErr;
                        }
                    }

                    if (!cloudRes || !cloudRes.secure_url) {
                        const err = new Error('Cloudinary không trả về kết quả lưu trữ hợp lệ!');
                        err.statusCode = 502;
                        err.code = 'CLOUDINARY_INVALID_RESPONSE';
                        throw err;
                    }

                    finalPublicId = cloudRes.public_id || publicIdSlug;
                    finalAssetId = cloudRes.asset_id || null;
                    finalAssetFolder = cloudRes.asset_folder || assetFolder;
                    finalSecureUrl = cloudRes.secure_url;
                } else {
                    if (!inspected.detectedMime.startsWith('image/') || inspected.bytes > MAX_COMPACT_FALLBACK_BYTES) {
                        const err = new Error(
                            'Hệ thống chưa cấu hình tài khoản Cloudinary để lưu tệp dung lượng lớn / PDF / Video. Vui lòng liên hệ Quản trị viên cấu hình biến môi trường CLOUDINARY_*!'
                        );
                        err.statusCode = 503;
                        err.code = 'CLOUDINARY_NOT_CONFIGURED';
                        throw err;
                    }
                    storageMode = 'inline_compact_fallback';
                    finalSecureUrl = `data:${inspected.detectedMime};base64,${inspected.buffer.toString('base64')}`;
                }

                // Tài liệu hồ sơ / thông báo / import không có bảng con riêng thì gắn trực tiếp vào chủ thể ngay khi upload
                const autoEntityType = ['employee_document', 'company_announcement', 'system_import'].includes(policy.canonical)
                    ? policy.canonical
                    : null;
                const autoEntityId = autoEntityType
                    ? (policy.canonical === 'employee_document' ? (resolvedEmployeeId || actorId) : 'global')
                    : null;

                // Lưu metadata tập trung vào DB trong transaction
                try {
                    await withTransaction(async (txQuery) => {
                        await txQuery(
                            `INSERT INTO media_assets (
                                asset_uuid, public_id, asset_id, secure_url, delivery_type, access_level,
                                resource_type, format, bytes, width, height, asset_folder, folder_mode,
                                upload_category, original_filename, mime_type, checksum,
                                uploaded_by, uploader_role, employee_id,
                                related_entity_type, related_entity_id, upload_status
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
                            [
                                assetUuid,
                                finalPublicId,
                                finalAssetId,
                                finalSecureUrl,
                                actualDeliveryType,
                                policy.accessLevel,
                                resourceType,
                                cloudRes?.format || inspected.ext,
                                Number(cloudRes?.bytes || inspected.bytes),
                                cloudRes?.width || inspected.width || null,
                                cloudRes?.height || inspected.height || null,
                                finalAssetFolder,
                                folderMode,
                                policy.canonical,
                                inspected.originalFilename,
                                inspected.detectedMime,
                                inspected.checksum,
                                actorId,
                                role,
                                resolvedEmployeeId || null,
                                autoEntityType,
                                autoEntityId
                            ]
                        );
                    });
                } catch (dbErr) {
                    // Nếu upload Cloudinary thành công nhưng lưu DB lỗi -> thu hồi ngay asset mồ côi trên Cloudinary!
                    if (finalPublicId) {
                        await this.deleteResource({ public_id: finalPublicId, resource_type: resourceType, delivery_type: actualDeliveryType }).catch(() => {});
                    }
                    throw dbErr;
                }

                const exposedUrl = policy.accessLevel === 'private'
                    ? `/api/media/${assetUuid}/access`
                    : finalSecureUrl;

                uploadedAssets.push({
                    asset_uuid: assetUuid,
                    url: exposedUrl,
                    secure_url: policy.accessLevel === 'private' ? null : finalSecureUrl,
                    access_level: policy.accessLevel,
                    storage: storageMode,
                    deduplicated: false,
                    cloudinary_configured: Boolean(credCfg.configured || this.transportAdapter),
                    public_id: finalPublicId,
                    asset_id: finalAssetId,
                    asset_folder: finalAssetFolder,
                    folder_mode: folderMode,
                    delivery_type: actualDeliveryType,
                    resource_type: resourceType,
                    format: cloudRes?.format || inspected.ext,
                    bytes: Number(cloudRes?.bytes || inspected.bytes),
                    width: cloudRes?.width || inspected.width || null,
                    height: cloudRes?.height || inspected.height || null,
                    mime: inspected.detectedMime,
                    original_filename: inspected.originalFilename,
                    category: policy.canonical,
                    checksum: inspected.checksum
                });
            }

            const first = uploadedAssets[0];
            await slot.finalize({
                eventType: 'accepted',
                resourceType: first?.resource_type || 'image',
                bytes: uploadedAssets.reduce((s, a) => s + (a.deduplicated ? 0 : a.bytes), 0),
                assetUuid: first?.asset_uuid || null,
                details: `uploaded=${uploadedAssets.length}`
            });
            claimFinalized = true;

            await logAuditEvent({
                actor_id: actorId,
                actor_role: role,
                action: first?.storage === 'cloudinary' ? 'MEDIA_UPLOAD_CLOUDINARY' : 'MEDIA_UPLOAD_COMPACT_FALLBACK',
                resource: 'media_assets',
                ip_address: ipAddress,
                details: {
                    category: policy.canonical,
                    count: uploadedAssets.length,
                    total_bytes: uploadedAssets.reduce((s, a) => s + a.bytes, 0),
                    asset_uuids: uploadedAssets.map((a) => a.asset_uuid)
                }
            }).catch(() => {});

            return {
                primary: first,
                files: uploadedAssets
            };
        } catch (err) {
            if (!claimFinalized) {
                const isCloudErr = String(err.code || '').startsWith('CLOUDINARY_');
                await slot.finalize({
                    eventType: isCloudErr ? 'failed_cloudinary' : (err.statusCode === 429 ? 'rejected_rate_limit' : 'rejected_validation'),
                    errorCode: err.code || 'UPLOAD_FAILED',
                    details: err.message
                });
            }
            throw err;
        }
    }

    /**
     * Tương thích ngược cho luồng Base64 JSON (Phase 1) bằng cách định tuyến thẳng vào uploadFilesPipeline thống nhất.
     */
    async uploadEvidenceMedia({
        file_data_url,
        category = 'employee_attachment',
        reference_date = '',
        target_employee_id = null,
        current_user = null,
        raw_body = {},
        ip_address = '',
        device_id = '',
        user_agent = ''
    } = {}) {
        const parsed = parseBase64ImageDataUrl(file_data_url, {
            maxDecodedBytes: getUploadSecurityConfig().maxDocumentSizeBytes
        });
        const res = await this.uploadFilesPipeline({
            files: [{
                buffer: parsed.buffer,
                originalname: `upload.${parsed.ext}`,
                mimetype: parsed.detectedMime
            }],
            rawBodyParams: raw_body,
            category,
            referenceDate: reference_date,
            targetEmployeeId: target_employee_id,
            currentUser: current_user,
            ipAddress: ip_address,
            deviceId: device_id,
            userAgent: user_agent
        });
        return res.primary;
    }

    async getResourceInfo({ public_id, resource_type = 'image', delivery_type = 'upload' }) {
        if (!public_id) return null;
        if (this.transportAdapter?.getResource) {
            return this.transportAdapter.getResource(public_id, { resource_type, type: delivery_type });
        }
        const cfg = configureSdkInstance();
        if (!cfg.configured) return null;
        return cloudinary.api.resource(public_id, { resource_type, type: delivery_type });
    }

    async deleteResource(assetOrParams) {
        const publicId = assetOrParams?.public_id;
        if (!publicId) return { result: 'skipped_no_public_id' };
        const resourceType = assetOrParams?.resource_type || 'image';
        const deliveryType = assetOrParams?.delivery_type || 'upload';

        if (this.transportAdapter?.destroy) {
            return this.transportAdapter.destroy(publicId, { resource_type: resourceType, type: deliveryType, invalidate: true });
        }

        const cfg = configureSdkInstance();
        if (!cfg.configured) {
            const err = new Error('Không thể xóa tài nguyên trên Cloudinary khi chưa cấu hình CLOUDINARY_*!');
            err.statusCode = 503;
            throw err;
        }

        return cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
            type: deliveryType,
            invalidate: true
        });
    }

    async verifyAccessPermission(asset, currentUser) {
        if (!currentUser) return false;
        if (asset.access_level === 'public') return true;
        const role = currentUser.role === 'employee' ? 'worker' : (currentUser.role || 'worker');
        if (role === 'admin') return true;

        const viewerId = String(currentUser.ma_nv || currentUser.username || '').trim();
        if (viewerId && (viewerId === asset.uploaded_by || viewerId === asset.employee_id)) {
            return true;
        }

        if (role === 'accountant') {
            const perms = await getAccountantPermissions();
            const cat = asset.upload_category;
            if (cat === 'accounting_attachment' || cat === 'system_import') {
                return Boolean(perms?.payroll_view_all || perms?.payroll_calculate);
            }
            if (cat === 'attendance_evidence' || cat === 'attendance_adjustment' || cat === 'shift_change_evidence' || cat === 'overtime_evidence') {
                return Boolean(perms?.attendance_view_all || perms?.leave_view_all);
            }
            if (cat === 'leave_evidence' || cat === 'business_trip_document') {
                return Boolean(perms?.leave_view_all);
            }
            if (cat === 'employee_document' || cat === 'employee_attachment' || cat === 'employee_avatar') {
                return Boolean(perms?.employee_view);
            }
        }
        return false;
    }

    async resolveAuthorizedMediaAccess({ assetUuid, currentUser, ipAddress = '' }) {
        if (!currentUser) {
            const err = new Error('Yêu cầu đăng nhập để xem tệp nhân sự!');
            err.statusCode = 401;
            err.code = 'UNAUTHORIZED';
            throw err;
        }

        const rows = await query(
            `SELECT * FROM media_assets WHERE asset_uuid = ? AND upload_status != 'deleted' LIMIT 1`,
            [assetUuid]
        );
        if (!rows || rows.length === 0) {
            const err = new Error('Tài nguyên media không tồn tại hoặc đã bị xóa!');
            err.statusCode = 404;
            err.code = 'MEDIA_NOT_FOUND';
            throw err;
        }

        const asset = rows[0];
        const allowed = await this.verifyAccessPermission(asset, currentUser);
        if (!allowed) {
            await logAuditEvent({
                actor_id: currentUser.ma_nv || currentUser.username || 'unknown',
                actor_role: currentUser.role || 'worker',
                action: 'MEDIA_UNAUTHORIZED_ACCESS_ATTEMPT',
                resource: 'media_assets',
                ip_address: ipAddress,
                details: { asset_uuid: assetUuid, owner_employee_id: asset.employee_id, category: asset.upload_category }
            }).catch(() => {});
            const err = new Error('Từ chối truy cập: Bạn không có quyền xem tài liệu nhân sự của người khác!');
            err.statusCode = 403;
            err.code = 'MEDIA_ACCESS_FORBIDDEN';
            throw err;
        }

        let signedUrl = asset.secure_url;
        const credCfg = configureSdkInstance();
        if (credCfg.configured && asset.public_id && asset.delivery_type !== 'upload') {
            const expiresAt = Math.floor(Date.now() / 1000) + 300;
            signedUrl = cloudinary.url(asset.public_id, {
                resource_type: asset.resource_type,
                type: asset.delivery_type,
                secure: true,
                sign_url: true,
                expires_at: expiresAt
            });
        }

        return {
            asset,
            signedUrl,
            expiresInSeconds: 300
        };
    }

    async listEmployeeDocuments({ maNv, currentUser }) {
        if (!currentUser) {
            const err = new Error('Yêu cầu đăng nhập!');
            err.statusCode = 401;
            throw err;
        }
        const role = currentUser.role === 'employee' ? 'worker' : (currentUser.role || 'worker');
        const actorId = String(currentUser.ma_nv || currentUser.username || '');
        const cleanMaNv = String(maNv || '').trim();

        if (role === 'worker' && actorId !== cleanMaNv) {
            const err = new Error('Bạn chỉ được xem tài liệu hồ sơ của chính mình!');
            err.statusCode = 403;
            throw err;
        }
        if (role === 'accountant' && actorId !== cleanMaNv) {
            const perms = await getAccountantPermissions();
            if (!perms?.employee_view) {
                const err = new Error('Tài khoản Kế toán chưa được cấp quyền xem hồ sơ nhân viên!');
                err.statusCode = 403;
                throw err;
            }
        }

        const rows = await query(
            `SELECT asset_uuid, upload_category, original_filename, mime_type, format, bytes,
                    asset_folder, uploaded_by, created_at
             FROM media_assets
             WHERE employee_id = ?
               AND upload_category IN ('employee_document', 'employee_attachment')
               AND upload_status = 'active'
             ORDER BY created_at DESC
             LIMIT 50`,
            [cleanMaNv]
        );

        return (rows || []).map((r) => ({
            ...r,
            url: `/api/media/${r.asset_uuid}/access`
        }));
    }

    async listAssetsForAdmin(filters = {}) {
        const page = Math.max(1, parseInt(filters.page, 10) || 1);
        const limit = Math.min(100, Math.max(10, parseInt(filters.limit, 10) || 30));
        const offset = (page - 1) * limit;

        const whereClauses = ['1=1'];
        const params = [];
        if (filters.startDate) {
            whereClauses.push('m.created_at >= ?');
            params.push(`${String(filters.startDate).slice(0, 10)} 00:00:00`);
        }
        if (filters.endDate) {
            whereClauses.push('m.created_at <= ?');
            params.push(`${String(filters.endDate).slice(0, 10)} 23:59:59`);
        }
        if (filters.category) {
            whereClauses.push('m.upload_category = ?');
            params.push(String(filters.category).trim());
        }
        if (filters.ma_nv) {
            whereClauses.push('(m.employee_id = ? OR m.uploaded_by = ?)');
            params.push(String(filters.ma_nv).trim(), String(filters.ma_nv).trim());
        }
        if (filters.resourceType) {
            whereClauses.push('m.resource_type = ?');
            params.push(String(filters.resourceType).trim());
        }
        if (filters.status) {
            whereClauses.push('m.upload_status = ?');
            params.push(String(filters.status).trim());
        }

        const whereSql = whereClauses.join(' AND ');
        const [countRows, dataRows] = await Promise.all([
            query(`SELECT COUNT(*) AS total FROM media_assets m WHERE ${whereSql}`, params),
            query(
                `SELECT m.id, m.asset_uuid, m.public_id, m.access_level, m.delivery_type,
                        m.resource_type, m.format, m.bytes, m.asset_folder, m.folder_mode,
                        m.upload_category, m.original_filename, m.mime_type,
                        m.uploaded_by, m.uploader_role, m.employee_id,
                        m.related_entity_type, m.related_entity_id,
                        m.upload_status, m.orphan_since, m.deleted_at, m.deleted_by, m.delete_reason,
                        m.created_at,
                        COALESCE(e.ho_ten, a.ho_ten, m.uploaded_by) AS uploader_name,
                        CASE WHEN m.access_level = 'private' THEN CONCAT('/api/media/', m.asset_uuid, '/access') ELSE m.secure_url END AS preview_url
                 FROM media_assets m
                 LEFT JOIN employees e ON m.uploaded_by = e.ma_nv
                 LEFT JOIN admins a ON m.uploaded_by = a.username
                 WHERE ${whereSql}
                 ORDER BY m.created_at DESC, m.id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            )
        ]);

        // Tuyệt đối không trả raw dataURL lớn trong list admin nếu có inline fallback cũ
        const sanitizedRows = (dataRows || []).map((r) => ({
            ...r,
            preview_url: r.preview_url && String(r.preview_url).startsWith('data:')
                ? `/api/media/${r.asset_uuid}/access`
                : r.preview_url
        }));

        return {
            items: sanitizedRows,
            total: Number(countRows?.[0]?.total || 0),
            page,
            limit
        };
    }
}

const instance = new CloudinaryService();
instance.getCloudinaryConfig = getCloudinaryCredentialsConfig;
instance.MAX_COMPACT_FALLBACK_BYTES = MAX_COMPACT_FALLBACK_BYTES;
module.exports = instance;
