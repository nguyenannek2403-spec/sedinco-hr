/**
 * Service tra cứu tên chủ tài khoản ngân hàng qua Casso Open Platform (openapi.casso.vn)
 * - Có cache OAuth2 JWT token trên bộ nhớ RAM (TTL = 14 phút)
 * - Tự động xin lại token 1 lần nếu gặp HTTP 401
 * - Tuyệt đối không lộ CASSO_APP_ID / CASSO_APP_SECRET ra ngoài hoặc xuống Frontend
 */

const { toUpperUnaccentedName } = require('../utils/bankValidator');

const CASSO_OAUTH_URL = 'https://openapi.casso.vn/oauth/token';
const CASSO_LOOKUP_URL = 'https://openapi.casso.vn/paykit/v1/lookup';
const REQUEST_TIMEOUT_MS = 8000;
const TOKEN_TTL_MS = 14 * 60 * 1000; // 14 phút

function getCassoCredentials() {
    return {
        app_id: String(process.env.CASSO_APP_ID || '').trim(),
        app_secret: String(process.env.CASSO_APP_SECRET || '').trim()
    };
}

let cachedToken = null;
let cachedTokenExpiresAt = 0;
let inFlightTokenPromise = null;
let tokenFetchCount = 0;

function invalidateTokenCache() {
    cachedToken = null;
    cachedTokenExpiresAt = 0;
}

function getTokenCacheStats() {
    const remainingMs = cachedToken ? Math.max(0, cachedTokenExpiresAt - Date.now()) : 0;
    return {
        hasCachedToken: Boolean(cachedToken && remainingMs > 0),
        expiresInMs: remainingMs,
        tokenFetchCount
    };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS, fetchImpl = global.fetch) {
    if (typeof fetchImpl !== 'function') {
        throw new Error('Môi trường Node hiện tại không hỗ trợ fetch API.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    try {
        return await fetchImpl(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

async function getOAuthToken({ forceRefresh = false, fetchImpl = global.fetch } = {}) {
    if (!forceRefresh && cachedToken && Date.now() < cachedTokenExpiresAt) {
        return { token: cachedToken, fromCache: true };
    }
    if (forceRefresh) {
        invalidateTokenCache();
    }
    if (!forceRefresh && inFlightTokenPromise) {
        const token = await inFlightTokenPromise;
        return { token, fromCache: true };
    }

    const fetchPromise = (async () => {
        const { app_id, app_secret } = getCassoCredentials();
        if (!app_id || !app_secret) {
            const err = new Error('CASSO_NOT_CONFIGURED');
            err.statusCode = 503;
            err.code = 'CASSO_NOT_CONFIGURED';
            throw err;
        }
        const res = await fetchWithTimeout(
            CASSO_OAUTH_URL,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ app_id, app_secret })
            },
            REQUEST_TIMEOUT_MS,
            fetchImpl
        );
        const body = await res.json().catch(() => ({}));
        const accessToken = body?.access_token || body?.data?.access_token || '';
        if (!res.ok || !accessToken) {
            const err = new Error(body?.message || `Casso OAuth HTTP ${res.status}`);
            err.statusCode = res.status || 502;
            throw err;
        }
        cachedToken = String(accessToken);
        cachedTokenExpiresAt = Date.now() + TOKEN_TTL_MS;
        tokenFetchCount += 1;
        return cachedToken;
    })();

    inFlightTokenPromise = fetchPromise;
    try {
        const token = await fetchPromise;
        return { token, fromCache: false };
    } finally {
        if (inFlightTokenPromise === fetchPromise) {
            inFlightTokenPromise = null;
        }
    }
}

async function callCassoLookup(token, binNum, cleanAccount, fetchImpl = global.fetch) {
    return fetchWithTimeout(
        CASSO_LOOKUP_URL,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                bin: Number(binNum),
                accountNumber: cleanAccount
            })
        },
        REQUEST_TIMEOUT_MS,
        fetchImpl
    );
}

/**
 * Tra cứu tên chủ tài khoản ngân hàng qua Casso Open Platform.
 * Trả về cấu trúc chuẩn:
 * - { success: true, accountName }
 * - { success: false, code, message }
 */
async function lookupBankAccount({ bin, accountNumber }, options = {}) {
    const fetchImpl = options.fetchImpl || global.fetch;
    const cleanBin = String(bin || '').trim();
    const cleanAccount = String(accountNumber || '').replace(/\s+/g, '').trim();

    if (!/^\d{6}$/.test(cleanBin)) {
        const err = new Error('Mã BIN ngân hàng không hợp lệ (phải gồm 6 chữ số).');
        err.statusCode = 400;
        throw err;
    }
    if (!/^[A-Za-z0-9._-]{3,35}$/.test(cleanAccount)) {
        const err = new Error('Số tài khoản hoặc Nickname không hợp lệ (3–35 ký tự chữ/số).');
        err.statusCode = 400;
        throw err;
    }

    try {
        let { token } = await getOAuthToken({ forceRefresh: false, fetchImpl });
        let res = await callCassoLookup(token, cleanBin, cleanAccount, fetchImpl);

        // Nếu token hết hạn sớm (HTTP 401): xóa cache, lấy token mới 1 lần rồi thử lại
        if (res.status === 401) {
            invalidateTokenCache();
            ({ token } = await getOAuthToken({ forceRefresh: true, fetchImpl }));
            res = await callCassoLookup(token, cleanBin, cleanAccount, fetchImpl);
        }

        if (res.status === 429) {
            return {
                success: false,
                code: '429',
                message: 'Hệ thống tra cứu tự động tạm quá tải, vui lòng nhập họ tên chủ thẻ bằng tay.'
            };
        }

        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload) {
            return {
                success: false,
                code: 'NETWORK_ERROR',
                message: 'Không thể kết nối tra cứu tự động, vui lòng nhập họ tên chủ thẻ bằng tay.'
            };
        }

        const cassoCode = payload.code !== undefined ? String(payload.code) : '';
        const rawAccountName = payload?.data?.accountName ? String(payload.data.accountName).trim() : '';

        if (res.status === 200 && cassoCode === '00' && rawAccountName) {
            const cleanName = toUpperUnaccentedName(rawAccountName) || rawAccountName.toUpperCase();
            return {
                success: true,
                accountName: cleanName
            };
        }

        return {
            success: false,
            code: cassoCode || 'NOT_FOUND',
            message: 'Không tìm thấy thông tin tài khoản này, vui lòng kiểm tra lại số tài khoản hoặc nhập tên bằng tay.'
        };
    } catch (_err) {
        return {
            success: false,
            code: 'NETWORK_ERROR',
            message: 'Không thể kết nối tra cứu tự động, vui lòng nhập họ tên chủ thẻ bằng tay.'
        };
    }
}

module.exports = {
    lookupBankAccount,
    getOAuthToken,
    invalidateTokenCache,
    getTokenCacheStats
};
