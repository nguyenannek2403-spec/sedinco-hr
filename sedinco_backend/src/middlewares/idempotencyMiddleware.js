const crypto = require('crypto');
const { query } = require('../config/db');

const DEDUP_WINDOW_SECONDS = 5;
const EXPLICIT_TTL_SECONDS = 24 * 3600;

function stableStringify(obj) {
    if (obj === null || obj === undefined) return '';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) {
        return '[' + obj.map(stableStringify).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

function sha256(input) {
    return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Middleware Idempotency & Chống bấm đúp (Single-Flight + Deduplication Window 5s).
 * - Hỗ trợ header `X-Idempotency-Key` (hoặc `Idempotency-Key`).
 * - Nếu không có header, tự động chống trùng lặp trong cửa sổ 5 giây cho cùng `actor_id + endpoint + payload_hash`.
 */
function idempotencyMiddleware(options = {}) {
    const dedupSeconds = Number(options.dedupSeconds) > 0 ? Number(options.dedupSeconds) : DEDUP_WINDOW_SECONDS;

    return async (req, res, next) => {
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            return next();
        }

        const actorId = req.user
            ? String(req.user.ma_nv || req.user.username || req.user.id || 'anon')
            : String(req.clientIp || req.ip || 'anon');
        const endpoint = `${req.method}:${req.baseUrl || ''}${req.path || ''}`.slice(0, 145);

        const rawHeaderKey = req.headers['x-idempotency-key'] || req.headers['idempotency-key'];
        const explicitKey = typeof rawHeaderKey === 'string' && rawHeaderKey.trim()
            ? rawHeaderKey.trim().slice(0, 128)
            : null;

        const mode = explicitKey ? 'explicit' : 'auto';
        const ttlSeconds = mode === 'explicit' ? EXPLICIT_TTL_SECONDS : dedupSeconds;

        let keyHash;
        if (explicitKey) {
            keyHash = sha256(`explicit|${actorId}|${endpoint}|${explicitKey}`);
        } else {
            const payloadHash = sha256(stableStringify(req.body || {}));
            keyHash = sha256(`auto|${actorId}|${endpoint}|${payloadHash}`);
        }

        // Dọn dẹp định kỳ xác suất thấp (1%) các bản ghi hết hạn 24h
        if (Math.random() < 0.01) {
            query('DELETE FROM idempotency_keys WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)').catch(() => {});
        }

        const tryClaim = async () => {
            try {
                await query(
                    `INSERT INTO idempotency_keys (key_hash, actor_id, endpoint, response_status, response_body)
                     VALUES (?, ?, ?, 0, '__IN_FLIGHT__')`,
                    [keyHash, actorId.slice(0, 50), endpoint]
                );
                return { claimed: true };
            } catch (err) {
                if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
                    return { claimed: false };
                }
                throw err;
            }
        };

        try {
            let claim = await tryClaim();

            if (!claim.claimed) {
                const rows = await query(
                    `SELECT response_status, response_body,
                            TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age_sec
                     FROM idempotency_keys
                     WHERE key_hash = ? LIMIT 1`,
                    [keyHash]
                );

                if (!rows || rows.length === 0) {
                    claim = await tryClaim();
                } else {
                    const existing = rows[0];
                    const ageSec = Number(existing.age_sec) || 0;

                    if (ageSec >= ttlSeconds) {
                        await query('DELETE FROM idempotency_keys WHERE key_hash = ? AND TIMESTAMPDIFF(SECOND, created_at, NOW()) >= ?', [keyHash, ttlSeconds]);
                        claim = await tryClaim();
                    }
                }
            }

            if (!claim.claimed) {
                // Đợi tối đa ~1s nếu request trước đó đang xử lý (concurrent burst)
                for (let attempt = 0; attempt < 10; attempt++) {
                    const rows = await query(
                        `SELECT response_status, response_body
                         FROM idempotency_keys
                         WHERE key_hash = ? LIMIT 1`,
                        [keyHash]
                    );
                    if (!rows || rows.length === 0) {
                        claim = await tryClaim();
                        if (claim.claimed) break;
                    } else {
                        const row = rows[0];
                        if (Number(row.response_status) > 0 && row.response_body !== '__IN_FLIGHT__') {
                            res.setHeader('X-Idempotency-Replay', 'true');
                            try {
                                return res.status(Number(row.response_status)).json(JSON.parse(row.response_body));
                            } catch {
                                return res.status(Number(row.response_status)).send(row.response_body);
                            }
                        }
                    }
                    await sleep(100);
                }

                if (!claim.claimed) {
                    return res.status(409).json({
                        success: false,
                        code: 'IDEMPOTENCY_IN_FLIGHT',
                        message: 'Yêu cầu đang được xử lý, vui lòng không bấm liên tục!'
                    });
                }
            }

            // Đã giữ khóa thành công -> Ghi nhận kết quả phản hồi vào bảng idempotency_keys
            let finalized = false;
            const persistResult = async (statusCode, bodyObj) => {
                if (finalized) return;
                finalized = true;
                try {
                    if (statusCode >= 500) {
                        await query('DELETE FROM idempotency_keys WHERE key_hash = ?', [keyHash]);
                        return;
                    }
                    const serialized = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
                    if (serialized && serialized.length <= 60000) {
                        await query(
                            'UPDATE idempotency_keys SET response_status = ?, response_body = ?, created_at = NOW() WHERE key_hash = ?',
                            [statusCode, serialized, keyHash]
                        );
                    } else {
                        await query('DELETE FROM idempotency_keys WHERE key_hash = ?', [keyHash]);
                    }
                } catch {
                    // Best-effort persistence
                }
            };

            const origJson = res.json.bind(res);
            res.json = (body) => {
                const status = res.statusCode || 200;
                // Đảm bảo lưu vào DB xong mới trả về hoặc chạy song song an toàn
                persistResult(status, body).finally(() => origJson(body));
                return res;
            };

            res.on('close', () => {
                if (!finalized && !res.writableEnded) {
                    query('DELETE FROM idempotency_keys WHERE key_hash = ? AND response_status = 0', [keyHash]).catch(() => {});
                }
            });

            return next();
        } catch (err) {
            return next(err);
        }
    };
}

module.exports = {
    idempotencyMiddleware,
    stableStringify,
    sha256
};
