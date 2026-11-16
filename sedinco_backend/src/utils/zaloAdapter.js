/**
 * Adapter tích hợp Zalo Open API
 * Xác thực access token thật trực tiếp với Zalo Graph API v2.0 (chỉ cho phép mock token khi NODE_ENV === 'test').
 */

const usedLocationTokens = new Set();
const ZALO_GRAPH_TIMEOUT_MS = 8000;

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

    // Chỉ cho phép token mô phỏng khi chạy automated test (NODE_ENV === 'test')
    if (
        process.env.NODE_ENV === 'test' &&
        (token.startsWith('mock_zalo_loc_') || token.startsWith('mock_loc_token_') || token.startsWith('web_gps_'))
    ) {
        if (token === 'mock_zalo_loc_expired') {
            return null;
        }
        if (usedLocationTokens.has(token)) {
            return null;
        }
        usedLocationTokens.add(token);

        return {
            lat: 16.0544,
            lng: 108.2022,
            verified: true,
            provider: 'mock Zalo',
            timestamp: Date.now()
        };
    }

    if (token.startsWith('mock_zalo_loc_') || token.startsWith('mock_loc_token_') || token.startsWith('web_gps_')) {
        return null;
    }

    if (usedLocationTokens.has(token)) {
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
                code: token,
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
            usedLocationTokens.add(token);
            return {
                lat: Number(data.data.latitude),
                lng: Number(data.data.longitude),
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
 * Xác thực Zalo Access Token trực tiếp với máy chủ Zalo Open API (graph.zalo.me/v2.0/me).
 * Chỉ cho phép mock token tiền tố 'mock_zalo_user_' trong môi trường NODE_ENV === 'test'.
 */
async function verifyZaloAccessToken(accessToken) {
    if (!accessToken || typeof accessToken !== 'string') return null;
    const cleanToken = accessToken.trim();
    if (!cleanToken) return null;

    if (cleanToken.startsWith('mock_zalo_user_')) {
        if (process.env.NODE_ENV !== 'test') {
            return null;
        }
        const id = cleanToken.slice('mock_zalo_user_'.length) || 'mock_zalo_user_default';
        return {
            id,
            zaloId: id,
            name: 'Người dùng Zalo Thử Nghiệm',
            provider: 'mock Zalo'
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

function isLocationTokenReplayed(token) {
    if (!token || typeof token !== 'string') return false;
    return usedLocationTokens.has(token);
}

function resetMockZaloTokens() {
    usedLocationTokens.clear();
}

module.exports = {
    verifyZaloLocationToken,
    verifyZaloAccessToken,
    verifyZaloUserToken,
    isLocationTokenReplayed,
    resetMockZaloTokens
};
