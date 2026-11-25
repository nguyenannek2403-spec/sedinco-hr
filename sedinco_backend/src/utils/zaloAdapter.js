/**
 * Adapter tích hợp Zalo Open API (v2.0) & Replay Guard:
 * - Xác thực access_token qua https://graph.zalo.me/v2.0/me
 * - Giải mã token vị trí (getLocation) & token số điện thoại (getPhoneNumber) qua https://graph.zalo.me/v2.0/me/info
 * - Tuyệt đối không chấp nhận mock/test token bên ngoài môi trường NODE_ENV === 'test'.
 */

const crypto = require('crypto');

const ZALO_GRAPH_TIMEOUT_MS = 8000;
const REPLAY_TTL_MS = 15 * 60 * 1000;
const MAX_REPLAY_ENTRIES = 5000;

const usedLocationTokens = new Map();
const usedPhoneTokens = new Map();

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
 * Xác thực Zalo Access Token trực tiếp với máy chủ Zalo Open API (graph.zalo.me/v2.0/me).
 * Chỉ cho phép token thử nghiệm khi NODE_ENV === 'test'.
 */
async function verifyZaloAccessToken(accessToken) {
    if (!accessToken || typeof accessToken !== 'string') return null;
    const cleanToken = accessToken.trim();
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
        const fetchFn = globalThis.fetch || require('node-fetch');
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
 * Xác thực token vị trí từ zmp-sdk getLocation() qua Zalo Graph API /v2.0/me/info.
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
        if (optionsOrToken.secretKey) secretKey = optionsOrToken.secretKey;
    }

    if (!token || typeof token !== 'string') return null;
    const cleanToken = token.trim();

    if (
        process.env.NODE_ENV === 'test' &&
        (cleanToken.startsWith('mock_zalo_loc_') ||
            cleanToken.startsWith('mock_loc_token_') ||
            cleanToken.startsWith('web_gps_') ||
            cleanToken.startsWith('test_loc_token_'))
    ) {
        if (cleanToken === 'mock_zalo_loc_expired' || cleanToken === 'test_loc_token_expired') {
            return null;
        }
        if (isTokenInReplayMap(usedLocationTokens, cleanToken)) {
            return null;
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
        return null;
    }

    if (isTokenInReplayMap(usedLocationTokens, cleanToken)) {
        return null;
    }

    if (!userAccessToken || !secretKey) {
        return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ZALO_GRAPH_TIMEOUT_MS);
    try {
        const fetchFn = globalThis.fetch || require('node-fetch');
        const res = await fetchFn('https://graph.zalo.me/v2.0/me/info', {
            method: 'GET',
            headers: {
                access_token: userAccessToken,
                code: cleanToken,
                secret_key: secretKey
            },
            signal: controller.signal
        });
        const data = await res.json();
        if (data && data.error === 0 && data.data) {
            const tokenTime = data.data.time || data.data.timestamp;
            if (tokenTime && (Date.now() - Number(tokenTime) > 120000)) {
                return null;
            }
            const lat = Number(data.data.latitude);
            const lng = Number(data.data.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return null;
            }
            recordTokenUsage(usedLocationTokens, cleanToken);
            return {
                lat,
                lng,
                verified: true,
                provider: 'Zalo Graph API',
                timestamp: tokenTime || Date.now()
            };
        }
    } catch (err) {
        console.error('[ZaloAdapter] Lỗi xác thực token vị trí:', err.message);
    } finally {
        clearTimeout(timer);
    }
    return null;
}

/**
 * Xác thực token số điện thoại từ zmp-sdk getPhoneNumber() qua Zalo Graph API /v2.0/me/info.
 * Áp dụng cơ chế chống replay (memory + DB idempotency_keys) để token chỉ dùng 1 lần.
 */
async function verifyZaloPhoneToken({ phoneToken, userAccessToken, actorId = 'zalo_phone' } = {}) {
    const cleanToken = typeof phoneToken === 'string' ? phoneToken.trim() : '';
    const cleanUserToken = typeof userAccessToken === 'string' ? userAccessToken.trim() : '';
    const secretKey = process.env.ZALO_APP_SECRET || '';

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
        const fetchFn = globalThis.fetch || require('node-fetch');
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
}

module.exports = {
    verifyZaloLocationToken,
    verifyZaloAccessToken,
    verifyZaloUserToken,
    verifyZaloPhoneToken,
    normalizeVietnamPhone,
    isLocationTokenReplayed,
    isPhoneTokenReplayed,
    resetMockZaloTokens
};
