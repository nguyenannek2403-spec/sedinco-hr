/**
 * Adapter tích hợp Zalo Open API (v2.0), Verified Location Proof Ticket (1-Time Resolution) & Replay Guard:
 * - Xác thực access_token qua https://graph.zalo.me/v2.0/me
 * - Giải mã token vị trí (getLocation) ĐÚNG 1 LẦN qua https://graph.zalo.me/v2.0/me/info
 * - Cấp và tiêu hủy One-Time Verified Location Proof Ticket (location_proof_token, TTL 60s) giữa /precheck và /check-in
 */

const crypto = require('crypto');
const env = require('../config/env');

const ZALO_GRAPH_TIMEOUT_MS = 8000;
const REPLAY_TTL_MS = 15 * 60 * 1000;
const MAX_REPLAY_ENTRIES = 5000;

const usedLocationTokens = new Map();
const usedPhoneTokens = new Map();
const usedLocationProofJtis = new Map();

// Hook phục vụ kiểm thử tích hợp mock phản hồi từ graph.zalo.me
let customZaloGraphFetcher = null;
function setCustomZaloGraphFetcher(fn) {
    customZaloGraphFetcher = typeof fn === 'function' ? fn : null;
}

function pruneReplayMap(map) {
    const now = Date.now();
    for (const [k, ts] of map.entries()) {
        if (now - ts > REPLAY_TTL_MS) {
            map.delete(k);
        }
    }
    if (map.size > MAX_REPLAY_ENTRIES) {
        const excess = map.size - MAX_REPLAY_ENTRIES;
        let removed = 0;
        for (const k of map.keys()) {
            map.delete(k);
            removed++;
            if (removed >= excess) break;
        }
    }
}

function recordTokenUsage(map, token) {
    if (!token) return;
    if (map.size >= MAX_REPLAY_ENTRIES - 50) {
        pruneReplayMap(map);
    }
    map.set(token, Date.now());
}

function isTokenInReplayMap(map, token) {
    if (!token || typeof token !== 'string') return false;
    const ts = map.get(token);
    if (!ts) return false;
    if (Date.now() - ts > REPLAY_TTL_MS) {
        map.delete(token);
        return false;
    }
    return true;
}

function normalizeVietnamPhone(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const digits = raw.replace(/[^\d+]/g, '').replace(/^\+/, '');
    if (!digits) return null;
    if (digits.startsWith('84') && digits.length >= 10 && digits.length <= 12) {
        return `0${digits.slice(2)}`;
    }
    if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 11) {
        return digits;
    }
    return digits.length >= 9 ? digits : null;
}

async function isTokenHashInDbReplay(prefix, token) {
    try {
        const { query } = require('../config/db');
        const hash = `${prefix}_${crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 48)}`;
        const rows = await query(
            'SELECT key_hash FROM idempotency_keys WHERE key_hash = ? AND created_at >= NOW() - INTERVAL 15 MINUTE LIMIT 1',
            [hash]
        ).catch(() => []);
        return { hash, replayed: Boolean(rows && rows.length > 0) };
    } catch {
        return { hash: null, replayed: false };
    }
}

async function persistTokenHashReplay(hash, actorId = 'zalo_guard', endpoint = 'ZALO_TOKEN_GUARD') {
    if (!hash) return;
    try {
        const { query } = require('../config/db');
        await query(
            `INSERT INTO idempotency_keys (key_hash, actor_id, endpoint, response_status, response_body)
             VALUES (?, ?, ?, 200, NULL)
             ON DUPLICATE KEY UPDATE created_at = NOW(), actor_id = VALUES(actor_id)`,
            [hash, String(actorId || 'zalo_guard').slice(0, 50), String(endpoint).slice(0, 145)]
        ).catch(() => {});
    } catch {}
}

/**
 * Cấp chứng chỉ vị trí ngắn hạn (60 giây, dùng 1 lần) sau khi /precheck đã xác thực tọa độ.
 */
function issueLocationProofToken({
    userId,
    lat = null,
    lng = null,
    distance = null,
    mode = 'OFFICE',
    source = 'token'
} = {}) {
    const jti = crypto.randomUUID();
    const secret = env.JWT_SECRET || process.env.JWT_SECRET || 'sedinco-secret-key-test-environment-min-32-chars!';
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 60;
    const payload = {
        type: 'LOCATION_PROOF',
        user_id: String(userId || ''),
        lat: lat !== null && lat !== undefined && Number.isFinite(Number(lat)) ? Number(lat) : null,
        lng: lng !== null && lng !== undefined && Number.isFinite(Number(lng)) ? Number(lng) : null,
        distance: distance !== null && distance !== undefined && Number.isFinite(Number(distance)) ? Number(distance) : null,
        mode: String(mode || 'OFFICE').toUpperCase(),
        source: String(source || 'token'),
        jti,
        exp
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
}

/**
 * Xác thực & tiêu hủy chứng chỉ vị trí (One-Time Use) tại bước /check-in.
 */
async function verifyAndConsumeLocationProofToken(proofToken, expectedUserId) {
    if (!proofToken || typeof proofToken !== 'string') {
        const err = new Error('Chứng chỉ vị trí không hợp lệ hoặc bị thiếu!');
        err.statusCode = 400;
        err.code = 'INVALID_LOCATION_PROOF';
        throw err;
    }

    const secret = env.JWT_SECRET || process.env.JWT_SECRET || 'sedinco-secret-key-test-environment-min-32-chars!';
    const parts = proofToken.trim().split('.');
    if (parts.length !== 3) {
        const err = new Error('Chứng chỉ xác thực vị trí không hợp lệ hoặc đã bị chỉnh sửa!');
        err.statusCode = 401;
        err.code = 'INVALID_LOCATION_PROOF';
        throw err;
    }

    const [header, body, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expectedSigBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
        const err = new Error('Chứng chỉ xác thực vị trí không hợp lệ hoặc đã bị chỉnh sửa!');
        err.statusCode = 401;
        err.code = 'INVALID_LOCATION_PROOF';
        throw err;
    }

    let decoded = null;
    try {
        decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        const err = new Error('Chứng chỉ xác thực vị trí không hợp lệ hoặc đã bị chỉnh sửa!');
        err.statusCode = 401;
        err.code = 'INVALID_LOCATION_PROOF';
        throw err;
    }

    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
        const err = new Error('Phiên xác thực vị trí đã quá 60 giây. Vui lòng bấm chấm công lại để lấy vị trí mới!');
        err.statusCode = 401;
        err.code = 'LOCATION_PROOF_EXPIRED';
        throw err;
    }

    if (!decoded || decoded.type !== 'LOCATION_PROOF' || !decoded.jti) {
        const err = new Error('Cấu trúc chứng chỉ vị trí không hợp lệ!');
        err.statusCode = 401;
        err.code = 'INVALID_LOCATION_PROOF';
        throw err;
    }

    if (expectedUserId && String(decoded.user_id) !== String(expectedUserId)) {
        const err = new Error('Chứng chỉ vị trí không khớp với tài khoản nhân viên đang chấm công!');
        err.statusCode = 401;
        err.code = 'LOCATION_PROOF_USER_MISMATCH';
        throw err;
    }

    if (isTokenInReplayMap(usedLocationProofJtis, decoded.jti)) {
        const err = new Error('Chứng chỉ vị trí này đã được sử dụng trước đó. Vui lòng bấm chấm công lại!');
        err.statusCode = 401;
        err.code = 'LOCATION_PROOF_REPLAYED';
        throw err;
    }

    const dbReplay = await isTokenHashInDbReplay('LOC_PROOF', decoded.jti);
    if (dbReplay.replayed) {
        const err = new Error('Chứng chỉ vị trí này đã được sử dụng trước đó. Vui lòng bấm chấm công lại!');
        err.statusCode = 401;
        err.code = 'LOCATION_PROOF_REPLAYED';
        throw err;
    }

    recordTokenUsage(usedLocationProofJtis, decoded.jti);
    await persistTokenHashReplay(dbReplay.hash, decoded.user_id || 'worker', 'LOC_PROOF_GUARD');

    return {
        verified: true,
        lat: decoded.lat,
        lng: decoded.lng,
        distance: decoded.distance,
        mode: decoded.mode,
        source: decoded.source || 'token',
        jti: decoded.jti
    };
}

/**
 * Xác thực Zalo Access Token trực tiếp với máy chủ Zalo Open API (graph.zalo.me/v2.0/me).
 */
async function verifyZaloAccessToken(accessToken) {
    if (!accessToken || typeof accessToken !== 'string') return null;
    const cleanToken = accessToken.trim().replace(/^Bearer\s+/i, '').trim();
    if (!cleanToken) return null;

    if (cleanToken.startsWith('mock_zalo_user_') || cleanToken.startsWith('test_zalo_token_')) {
        if (process.env.NODE_ENV !== 'test') {
            return null;
        }
        const prefix = cleanToken.startsWith('mock_zalo_user_') ? 'mock_zalo_user_' : 'test_zalo_token_';
        const id = cleanToken.slice(prefix.length) || 'test_zalo_user_default';
        return {
            id,
            zaloId: id,
            name: 'Người dùng Zalo Thử Nghiệm',
            verified: true,
            provider: 'test_double'
        };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ZALO_GRAPH_TIMEOUT_MS);
    try {
        const fetchFn = customZaloGraphFetcher || globalThis.fetch || require('node-fetch');
        const res = await fetchFn('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
            method: 'GET',
            headers: {
                access_token: cleanToken
            },
            signal: controller.signal
        });
        if (!res || !res.ok) return null;
        const data = await res.json();
        if (data && data.id && (!data.error || data.error === 0)) {
            const verifiedId = String(data.id).trim();
            if (!verifiedId) return null;
            return {
                id: verifiedId,
                zaloId: verifiedId,
                name: data.name || 'Người dùng Zalo',
                picture: data.picture?.data?.url || null,
                verified: true,
                provider: 'Zalo Graph API',
                data
            };
        }
    } catch (err) {
        console.error('[ZaloAdapter] Lỗi xác thực Zalo access token:', err.message);
    } finally {
        clearTimeout(timer);
    }
    return null;
}

const verifyZaloUserToken = verifyZaloAccessToken;

/**
 * Xác thực token vị trí từ zmp-sdk getLocation() qua Zalo Graph API /v2.0/me/info (Single-Use).
 * Trả về cấu trúc chi tiết { verified, lat, lng, errorCode, message, zaloErrorCode, zaloMessage }.
 */
async function verifyZaloLocationToken(optionsOrToken) {
    let token = '';
    let userAccessToken = '';
    let secretKey = process.env.ZALO_APP_SECRET || '';

    if (typeof optionsOrToken === 'string') {
        token = optionsOrToken;
    } else if (optionsOrToken && typeof optionsOrToken === 'object') {
        token = optionsOrToken.locationToken || optionsOrToken.token || '';
        userAccessToken = optionsOrToken.userAccessToken || optionsOrToken.accessToken || '';
        if (optionsOrToken.secretKey !== undefined) secretKey = optionsOrToken.secretKey;
    }

    if (!token || typeof token !== 'string') {
        return {
            verified: false,
            errorCode: 'EMPTY_ZALO_LOCATION_TOKEN',
            message: 'Chưa nhận được token vị trí từ Zalo. Vui lòng thử lại!'
        };
    }

    const cleanToken = token.trim();
    const cleanAccessToken = String(userAccessToken || '').trim().replace(/^Bearer\s+/i, '').trim();
    const cleanSecretKey = String(secretKey || '').trim();
    const locationMode = process.env.LOCATION_MODE || 'standard';

    if (
        process.env.NODE_ENV === 'test' &&
        (cleanToken.startsWith('mock_zalo_loc_') ||
            cleanToken.startsWith('mock_loc_token_') ||
            cleanToken.startsWith('web_gps_') ||
            cleanToken.startsWith('test_loc_token_'))
    ) {
        if (cleanToken === 'mock_zalo_loc_expired' || cleanToken === 'test_loc_token_expired') {
            return {
                verified: false,
                errorCode: 'ZALO_TOKEN_EXPIRED',
                message: 'Token định vị Zalo đã hết hạn. Vui lòng bấm Thử lại để lấy vị trí mới!'
            };
        }
        if (isTokenInReplayMap(usedLocationTokens, cleanToken)) {
            return {
                verified: false,
                errorCode: 'ZALO_TOKEN_ALREADY_USED',
                message: 'Mã định vị Zalo đã được sử dụng trước đó. Vui lòng bấm Thử lại để lấy vị trí mới!'
            };
        }
        recordTokenUsage(usedLocationTokens, cleanToken);

        if (cleanToken.startsWith('test_loc_token_')) {
            const parts = cleanToken.slice('test_loc_token_'.length).split('_');
            const parsedLat = Number(parts[0]);
            const parsedLng = Number(parts[1]);
            if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
                return {
                    lat: parsedLat,
                    lng: parsedLng,
                    verified: true,
                    provider: 'test_double',
                    timestamp: Date.now()
                };
            }
        }

        return {
            lat: 16.0544,
            lng: 108.2022,
            verified: true,
            provider: 'mock Zalo',
            timestamp: Date.now()
        };
    }

    if (
        cleanToken.startsWith('mock_zalo_loc_') ||
        cleanToken.startsWith('mock_loc_token_') ||
        cleanToken.startsWith('web_gps_') ||
        cleanToken.startsWith('test_loc_token_')
    ) {
        return {
            verified: false,
            errorCode: 'INVALID_ZALO_LOCATION_TOKEN',
            message: 'Token định vị thử nghiệm không được phép sử dụng trên môi trường thực tế!'
        };
    }

    if (isTokenInReplayMap(usedLocationTokens, cleanToken)) {
        return {
            verified: false,
            errorCode: 'ZALO_TOKEN_ALREADY_USED',
            message: 'Mã định vị Zalo đã được sử dụng. Vui lòng bấm Thử lại để lấy vị trí mới!'
        };
    }

    if (!cleanSecretKey) {
        console.warn('[ZaloAdapter] Thiếu cấu hình ZALO_APP_SECRET trên máy chủ', {
            zalo_error_code: 'MISSING_SECRET_KEY',
            location_mode: locationMode
        });
        return {
            verified: false,
            errorCode: 'MISSING_ZALO_APP_SECRET',
            message: 'Máy chủ chưa cấu hình khóa ứng dụng Zalo (ZALO_APP_SECRET). Vui lòng kiểm tra cấu hình môi trường máy chủ!'
        };
    }

    if (!cleanAccessToken) {
        console.warn('[ZaloAdapter] Thiếu access_token khi giải mã vị trí Zalo', {
            zalo_error_code: 'MISSING_ACCESS_TOKEN',
            location_mode: locationMode
        });
        return {
            verified: false,
            errorCode: 'MISSING_ZALO_ACCESS_TOKEN',
            message: 'Chưa nhận được phiên xác thực Zalo (access_token). Vui lòng mở lại ứng dụng trên Zalo và thử lại!'
        };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ZALO_GRAPH_TIMEOUT_MS);
    try {
        const fetchFn = customZaloGraphFetcher || globalThis.fetch || require('node-fetch');
        const res = await fetchFn('https://graph.zalo.me/v2.0/me/info', {
            method: 'GET',
            headers: {
                access_token: cleanAccessToken,
                code: cleanToken,
                secret_key: cleanSecretKey
            },
            signal: controller.signal
        });

        const data =
            res && typeof res.json === 'function'
                ? await res.json()
                : res && typeof res === 'object'
                ? res
                : null;
        if (data && (data.error === 0 || data.error === undefined) && data.data) {
            const rawTime = Number(data.data.time || data.data.timestamp);
            // Chuẩn hóa timestamp của Zalo (có thể là giây 10 chữ số hoặc mili-giây 13 chữ số)
            const tokenTimeMs =
                Number.isFinite(rawTime) && rawTime > 0
                    ? rawTime < 1e11
                        ? rawTime * 1000
                        : rawTime
                    : null;

            if (tokenTimeMs && Date.now() - tokenTimeMs > 180000) {
                console.warn('[ZaloAdapter] Token vị trí Zalo đã quá hạn 180s', {
                    zalo_error_code: 'TOKEN_TIMESTAMP_EXPIRED',
                    age_ms: Date.now() - tokenTimeMs,
                    location_mode: locationMode
                });
                return {
                    verified: false,
                    errorCode: 'ZALO_TOKEN_EXPIRED',
                    message: 'Token định vị Zalo đã hết hạn (quá 2 phút). Vui lòng bấm Thử lại để lấy vị trí mới!'
                };
            }

            const lat = Number(data.data.latitude ?? data.data.lat);
            const lng = Number(data.data.longitude ?? data.data.lng ?? data.data.long);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return {
                    verified: false,
                    errorCode: 'ZALO_COORDS_EMPTY',
                    message: 'Máy chủ Zalo không trả về tọa độ GPS hợp lệ. Vui lòng bật định vị GPS trên điện thoại và thử lại!'
                };
            }

            recordTokenUsage(usedLocationTokens, cleanToken);
            return {
                lat,
                lng,
                verified: true,
                provider: 'Zalo Graph API',
                timestamp: tokenTimeMs || Date.now()
            };
        }

        const zaloErrCode = data?.error !== undefined ? Number(data.error) : 'UNKNOWN';
        const zaloMsg = String(data?.message || 'Unknown Zalo Graph API error');
        const lowerMsg = zaloMsg.toLowerCase();

        console.warn('[ZaloAdapter] Zalo Graph API /v2.0/me/info trả lỗi:', {
            zalo_error_code: zaloErrCode,
            zalo_message: zaloMsg,
            location_mode: locationMode
        });

        if (
            zaloErrCode === -211 ||
            zaloErrCode === -216 ||
            zaloErrCode === -202 ||
            zaloErrCode === -204 ||
            zaloErrCode === -108 ||
            lowerMsg.includes('secret') ||
            lowerMsg.includes('app_secret')
        ) {
            return {
                verified: false,
                errorCode: 'INVALID_ZALO_APP_SECRET',
                zaloErrorCode: zaloErrCode,
                zaloMessage: zaloMsg,
                message: 'Lỗi cấu hình khóa ứng dụng Zalo (ZALO_APP_SECRET) phía máy chủ không khớp với Zalo Mini App!'
            };
        }

        if (
            lowerMsg.includes('expired') ||
            lowerMsg.includes('already used') ||
            lowerMsg.includes('code is invalid') ||
            zaloErrCode === -124 ||
            zaloErrCode === -213
        ) {
            return {
                verified: false,
                errorCode: 'ZALO_TOKEN_EXPIRED',
                zaloErrorCode: zaloErrCode,
                zaloMessage: zaloMsg,
                message: 'Mã định vị Zalo đã hết hạn hoặc đã được sử dụng. Vui lòng bấm Thử lại để lấy vị trí mới!'
            };
        }

        if (
            zaloErrCode === -201 ||
            zaloErrCode === -203 ||
            zaloErrCode === -1401 ||
            zaloErrCode === -1402 ||
            zaloErrCode === -1404 ||
            lowerMsg.includes('permission') ||
            lowerMsg.includes('scope') ||
            lowerMsg.includes('not approved')
        ) {
            return {
                verified: false,
                errorCode: 'ZALO_PERMISSION_DENIED',
                zaloErrorCode: zaloErrCode,
                zaloMessage: zaloMsg,
                message: 'Quyền truy cập Vị trí trên Zalo chưa được cấp hoặc đang chờ duyệt. Vui lòng kiểm tra lại quyền Vị trí trên Zalo!'
            };
        }

        return {
            verified: false,
            errorCode: 'ZALO_TOKEN_EXPIRED',
            zaloErrorCode: zaloErrCode,
            zaloMessage: zaloMsg,
            message: 'Mã định vị Zalo đã hết hạn hoặc đã được sử dụng. Vui lòng bấm Thử lại để lấy vị trí mới!'
        };
    } catch (err) {
        const isAbort = err && (err.name === 'AbortError' || String(err.message || '').toLowerCase().includes('abort'));
        console.error('[ZaloAdapter] Lỗi kết nối Zalo Graph API /v2.0/me/info:', {
            zalo_error_code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
            zalo_message: err?.message,
            location_mode: locationMode
        });
        return {
            verified: false,
            errorCode: isAbort ? 'ZALO_GRAPH_TIMEOUT' : 'ZALO_GRAPH_NETWORK_ERROR',
            message: isAbort
                ? 'Kết nối tới máy chủ định vị Zalo quá thời gian chờ (8 giây). Vui lòng kiểm tra mạng và thử lại!'
                : 'Không thể kết nối tới dịch vụ định vị Zalo. Vui lòng kiểm tra kết nối mạng và thử lại!'
        };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Xác thực token số điện thoại từ zmp-sdk getPhoneNumber() qua Zalo Graph API /v2.0/me/info.
 */
async function verifyZaloPhoneToken({ phoneToken, userAccessToken, actorId = 'zalo_phone' } = {}) {
    const cleanToken = typeof phoneToken === 'string' ? phoneToken.trim() : '';
    const cleanUserToken = typeof userAccessToken === 'string' ? userAccessToken.trim().replace(/^Bearer\s+/i, '').trim() : '';
    const secretKey = String(process.env.ZALO_APP_SECRET || '').trim();

    if (!cleanToken) return null;

    if (isTokenInReplayMap(usedPhoneTokens, cleanToken)) {
        const err = new Error('Mã xác thực số điện thoại Zalo đã được sử dụng trước đó. Vui lòng lấy mã mới!');
        err.statusCode = 409;
        err.code = 'PHONE_TOKEN_REPLAYED';
        throw err;
    }

    const dbReplay = await isTokenHashInDbReplay('PHONE_TOKEN', cleanToken);
    if (dbReplay.replayed) {
        const err = new Error('Mã xác thực số điện thoại Zalo đã được sử dụng trước đó. Vui lòng lấy mã mới!');
        err.statusCode = 409;
        err.code = 'PHONE_TOKEN_REPLAYED';
        throw err;
    }

    if (process.env.NODE_ENV === 'test' && cleanToken.startsWith('test_phone_token_')) {
        if (cleanToken === 'test_phone_token_expired') {
            return null;
        }
        const rawPart = cleanToken.slice('test_phone_token_'.length).split('_')[0];
        const normalized = normalizeVietnamPhone(rawPart);
        if (!normalized) return null;
        recordTokenUsage(usedPhoneTokens, cleanToken);
        await persistTokenHashReplay(dbReplay.hash, actorId, 'PHONE_TOKEN_REPLAY_GUARD');
        return {
            verified: true,
            phone: normalized,
            rawPhone: rawPart,
            provider: 'test_double'
        };
    }

    if (cleanToken.startsWith('test_phone_token_')) {
        return null;
    }

    if (!cleanUserToken || !secretKey) {
        return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ZALO_GRAPH_TIMEOUT_MS);
    try {
        const fetchFn = customZaloGraphFetcher || globalThis.fetch || require('node-fetch');
        const res = await fetchFn('https://graph.zalo.me/v2.0/me/info', {
            method: 'GET',
            headers: {
                access_token: cleanUserToken,
                code: cleanToken,
                secret_key: secretKey
            },
            signal: controller.signal
        });
        if (!res || !res.ok) return null;
        const data = await res.json();
        if (data && data.error === 0 && data.data && data.data.number) {
            const rawPhone = String(data.data.number).trim();
            const normalized = normalizeVietnamPhone(rawPhone);
            if (!normalized) return null;
            recordTokenUsage(usedPhoneTokens, cleanToken);
            await persistTokenHashReplay(dbReplay.hash, actorId, 'PHONE_TOKEN_REPLAY_GUARD');
            return {
                verified: true,
                phone: normalized,
                rawPhone,
                provider: 'Zalo Graph API'
            };
        }
    } catch (err) {
        if (err && err.code === 'PHONE_TOKEN_REPLAYED') throw err;
        console.error('[ZaloAdapter] Lỗi xác thực token số điện thoại:', err.message);
    } finally {
        clearTimeout(timer);
    }
    return null;
}

function isLocationTokenReplayed(token) {
    return isTokenInReplayMap(usedLocationTokens, token);
}

function isPhoneTokenReplayed(token) {
    return isTokenInReplayMap(usedPhoneTokens, token);
}

function resetMockZaloTokens() {
    usedLocationTokens.clear();
    usedPhoneTokens.clear();
    usedLocationProofJtis.clear();
}

module.exports = {
    verifyZaloLocationToken,
    verifyZaloAccessToken,
    verifyZaloUserToken,
    verifyZaloPhoneToken,
    issueLocationProofToken,
    verifyAndConsumeLocationProofToken,
    setCustomZaloGraphFetcher,
    normalizeVietnamPhone,
    isLocationTokenReplayed,
    isPhoneTokenReplayed,
    resetMockZaloTokens
};
