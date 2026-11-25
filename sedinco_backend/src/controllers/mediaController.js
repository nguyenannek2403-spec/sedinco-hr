/**
 * Controller quản lý Media tập trung (Cloudinary Upload, Private Access Gate, Lifecycle & Admin Storage Dashboard).
 */

const Busboy = require('busboy');
const { Readable } = require('stream');
const cloudinaryService = require('../services/cloudinaryService');
const cloudinaryUsageMonitor = require('../services/cloudinaryUsageMonitor');
const mediaLifecycleService = require('../services/mediaLifecycleService');
const { getUploadSecurityConfig } = require('../config/cloudinaryConfig');

function parseMultipartUpload(req) {
    const secCfg = getUploadSecurityConfig();
    const hardFileSizeCap = Math.max(
        secCfg.maxImageSizeBytes,
        secCfg.maxDocumentSizeBytes,
        secCfg.maxVideoSizeBytes
    );

    return new Promise((resolve, reject) => {
        const fields = {};
        const files = [];
        let abortedError = null;
        let finished = false;

        const fail = (err) => {
            if (abortedError || finished) return;
            abortedError = err;
            finished = true;
            reject(err);
        };

        let busboy;
        try {
            busboy = Busboy({
                headers: req.headers,
                limits: {
                    files: secCfg.maxFilesPerRequest,
                    fileSize: hardFileSizeCap,
                    fields: 30,
                    fieldSize: 64 * 1024
                }
            });
        } catch (err) {
            err.statusCode = 400;
            err.code = 'INVALID_MULTIPART_REQUEST';
            return reject(err);
        }

        busboy.on('field', (name, val) => {
            if (abortedError) return;
            fields[name] = val;
        });

        busboy.on('file', (fieldname, fileStream, info) => {
            if (abortedError) {
                fileStream.resume();
                return;
            }

            if (fieldname !== 'file' && fieldname !== 'files') {
                fileStream.resume();
                const err = new Error(`Tên trường tệp không hợp lệ ("${fieldname}"). Yêu cầu fieldname="file"!`);
                err.statusCode = 400;
                err.code = 'INVALID_FILE_FIELDNAME';
                return fail(err);
            }

            const chunks = [];
            let truncated = false;
            let totalLen = 0;

            fileStream.on('data', (chunk) => {
                if (abortedError || truncated) return;
                totalLen += chunk.length;
                chunks.push(chunk);
            });

            fileStream.on('limit', () => {
                truncated = true;
                const maxMb = (hardFileSizeCap / (1024 * 1024)).toFixed(1);
                const err = new Error(`Dung lượng tệp vượt quá giới hạn tối đa ${maxMb}MB!`);
                err.statusCode = 413;
                err.code = 'MEDIA_TOO_LARGE';
                fail(err);
            });

            fileStream.on('end', () => {
                if (abortedError || truncated) return;
                files.push({
                    fieldname,
                    originalname: info?.filename || '',
                    encoding: info?.encoding || '',
                    mimetype: info?.mimeType || info?.mime || '',
                    buffer: Buffer.concat(chunks, totalLen)
                });
            });
        });

        busboy.on('filesLimit', () => {
            const err = new Error(`Mỗi lần chỉ được tải lên tối đa ${secCfg.maxFilesPerRequest} tệp!`);
            err.statusCode = 400;
            err.code = 'TOO_MANY_FILES_PER_REQUEST';
            fail(err);
        });

        busboy.on('error', (err) => {
            err.statusCode = err.statusCode || 400;
            err.code = err.code || 'MULTIPART_PARSE_ERROR';
            fail(err);
        });

        busboy.on('finish', () => {
            if (abortedError || finished) return;
            finished = true;
            resolve({ fields, files });
        });

        req.pipe(busboy);
    });
}

class MediaController {
    async getConfig(req, res, next) {
        try {
            const data = cloudinaryService.getPublicMediaConfig();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async upload(req, res, next) {
        try {
            const contentType = String(req.headers['content-type'] || '').toLowerCase();
            const ipAddress = req.clientIp || req.ip || '';
            const deviceId = req.headers['x-device-id'] || '';
            const userAgent = req.headers['user-agent'] || '';

            if (contentType.startsWith('multipart/form-data')) {
                const { fields, files } = await parseMultipartUpload(req);
                const { primary, files: uploadedFiles } = await cloudinaryService.uploadFilesPipeline({
                    files,
                    rawBodyParams: fields,
                    category: fields.category || 'employee_attachment',
                    referenceDate: fields.reference_date || '',
                    targetEmployeeId: fields.target_employee_id || null,
                    currentUser: req.user,
                    ipAddress,
                    deviceId,
                    userAgent
                });
                return res.status(201).json({
                    success: true,
                    message: primary?.storage === 'cloudinary'
                        ? 'Đã tải tệp lên Cloudinary an toàn!'
                        : 'Đã xác thực tệp nén gọn an toàn!',
                    data: {
                        ...primary,
                        files: uploadedFiles
                    }
                });
            }

            // Hỗ trợ tương thích ngược payload JSON (base64 data url <= giới hạn)
            const body = req.body || {};
            const result = await cloudinaryService.uploadEvidenceMedia({
                file_data_url: body.file_data_url || body.data_url || body.image,
                category: body.category || 'employee_attachment',
                reference_date: body.reference_date || '',
                target_employee_id: body.target_employee_id || null,
                current_user: req.user,
                raw_body: body,
                ip_address: ipAddress,
                device_id: deviceId,
                user_agent: userAgent
            });

            return res.status(201).json({
                success: true,
                message: result.storage === 'cloudinary'
                    ? 'Đã tải tệp lên Cloudinary an toàn!'
                    : 'Đã xác thực tệp nén gọn an toàn!',
                data: {
                    ...result,
                    files: [result]
                }
            });
        } catch (err) {
            next(err);
        }
    }

    async accessMedia(req, res, next) {
        try {
            const assetUuid = String(req.params.assetUuid || '').trim();
            const ipAddress = req.clientIp || req.ip || '';
            const { asset, signedUrl, expiresInSeconds } = await cloudinaryService.resolveAuthorizedMediaAccess({
                assetUuid,
                currentUser: req.user,
                ipAddress
            });

            if (req.query.mode === 'json') {
                return res.json({
                    success: true,
                    data: {
                        asset_uuid: asset.asset_uuid,
                        signed_url: signedUrl && String(signedUrl).startsWith('data:') ? `/api/media/${asset.asset_uuid}/access` : signedUrl,
                        mime_type: asset.mime_type,
                        format: asset.format,
                        original_filename: asset.original_filename,
                        bytes: Number(asset.bytes || 0),
                        expires_in: expiresInSeconds
                    }
                });
            }

            res.setHeader('Cache-Control', 'private, max-age=120, no-transform');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            const safeFilename = (asset.original_filename || `${asset.asset_uuid}.${asset.format || 'bin'}`).replace(/["\r\n]/g, '_');
            res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
            if (asset.mime_type) {
                res.setHeader('Content-Type', asset.mime_type);
            }

            if (signedUrl && String(signedUrl).startsWith('data:')) {
                const commaIdx = signedUrl.indexOf(',');
                const buf = Buffer.from(signedUrl.slice(commaIdx + 1), 'base64');
                return res.status(200).send(buf);
            }

            if (cloudinaryService.transportAdapter?.fetchAssetBytes) {
                const mockBytes = await cloudinaryService.transportAdapter.fetchAssetBytes(asset, signedUrl);
                return res.status(200).send(mockBytes);
            }

            if (signedUrl && String(signedUrl).startsWith('https://')) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 15000);
                try {
                    const upstream = await fetch(signedUrl, { signal: controller.signal });
                    if (!upstream.ok) {
                        const err = new Error(`Không thể tải tài nguyên từ kho lưu trữ (HTTP ${upstream.status})`);
                        err.statusCode = 502;
                        throw err;
                    }
                    if (upstream.body && typeof Readable.fromWeb === 'function') {
                        return Readable.fromWeb(upstream.body).pipe(res);
                    }
                    const arrayBuf = await upstream.arrayBuffer();
                    return res.status(200).send(Buffer.from(arrayBuf));
                } finally {
                    clearTimeout(timer);
                }
            }

            return res.status(404).json({ success: false, message: 'Không tìm thấy nội dung tài nguyên!' });
        } catch (err) {
            next(err);
        }
    }

    async listEmployeeDocuments(req, res, next) {
        try {
            const maNv = req.params.ma_nv;
            const docs = await cloudinaryService.listEmployeeDocuments({
                maNv,
                currentUser: req.user
            });
            return res.json({ success: true, data: docs });
        } catch (err) {
            next(err);
        }
    }

    async deleteAsset(req, res, next) {
        try {
            const assetUuid = String(req.params.assetUuid || '').trim();
            const reason = String(req.body?.reason || req.query?.reason || 'MANUAL_DELETE').trim();
            const result = await mediaLifecycleService.deleteAssetWithSafetyCheck({
                assetUuid,
                currentUser: req.user,
                reason
            });
            return res.json({
                success: true,
                message: 'Đã xóa tài nguyên media an toàn và ghi nhận nhật ký!',
                data: result
            });
        } catch (err) {
            next(err);
        }
    }

    async getAdminDashboard(req, res, next) {
        try {
            const data = await cloudinaryUsageMonitor.getAdminDashboardMetrics(req.query || {});
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async getAdminAssets(req, res, next) {
        try {
            const data = await cloudinaryService.listAssetsForAdmin(req.query || {});
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async syncAdminUsage(req, res, next) {
        try {
            const data = await cloudinaryUsageMonitor.syncWithCloudinaryAdminApi({
                force: true,
                syncSource: 'admin_manual',
                currentUser: req.user
            });
            return res.json({
                success: true,
                message: data.synced ? 'Đã đồng bộ số liệu dung lượng Cloudinary!' : (data.message || 'Đã kiểm tra trạng thái đồng bộ.'),
                data
            });
        } catch (err) {
            next(err);
        }
    }

    async cleanupOrphans(req, res, next) {
        try {
            const { dry_run = false, retention_hours = null } = req.body || {};
            const data = await mediaLifecycleService.runOrphanCleanup({
                retentionHours: retention_hours !== null && retention_hours !== undefined ? Number(retention_hours) : null,
                dryRun: Boolean(dry_run),
                currentUser: req.user
            });
            return res.json({
                success: true,
                message: data.dry_run
                    ? `Quét nháp phát hiện ${data.eligible} tệp mồ côi đủ điều kiện dọn dẹp.`
                    : `Đã dọn dẹp an toàn ${data.deleted} tệp mồ côi (bỏ qua ${data.skipped_in_use} tệp vẫn đang sử dụng).`,
                data
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new MediaController();
