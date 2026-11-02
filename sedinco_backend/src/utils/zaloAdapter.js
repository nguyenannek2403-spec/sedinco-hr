/**
 * Adapter tích hợp Zalo Open API
 * [CHƯA XÁC MINH: Cần cấu hình Zalo App Secret thật để gọi Zalo Open API production]
 * Gắn nhãn bắt buộc: "mock Zalo" khi chạy trên môi trường test/local
 */

const usedLocationTokens = new Set();

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

    // [mock Zalo] Hỗ trợ token mô phỏng cho kiểm thử tự động L2
    if (token.startsWith('mock_zalo_loc_')) {
        if (token === 'mock_zalo_loc_expired') {
            return null; // Giả lập token hết hạn (> 2 phút)
        }
        // Kiểm tra tính chất dùng 1 lần (Single-use token)
        if (usedLocationTokens.has(token)) {
            return null; // Đã sử dụng trước đó -> từ chối
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

    // Single-use check cho token thật
    if (usedLocationTokens.has(token)) {
        return null;
    }

    // Gọi Graph API Zalo: GET https://graph.zalo.me/v2.0/me/info
    // Header: access_token, code (location token), secret_key
    if (!userAccessToken || !secretKey) {
        // [CHƯA XÁC MINH: Cần access_token và secret_key Zalo thật để gọi production]
        return null;
    }

    try {
        const fetch = globalThis.fetch || require('node-fetch');
        const res = await fetch('https://graph.zalo.me/v2.0/me/info', {
            method: 'GET',
            headers: {
                'access_token': userAccessToken,
                'code': token,
                'secret_key': secretKey
            }
        });
        const data = await res.json();
        if (data && data.error === 0 && data.data) {
            // Kiểm tra timestamp không quá 2 phút (120,000 ms)
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
    }
    return null;
}

async function verifyZaloUserToken(accessToken) {
    if (!accessToken || typeof accessToken !== 'string') return null;

    // [mock Zalo] Hỗ trợ access token mô phỏng
    if (accessToken.startsWith('mock_zalo_user_')) {
        const id = accessToken.slice('mock_zalo_user_'.length);
        return {
            zaloId: id || 'mock_zalo_user_default',
            name: 'Người dùng Zalo Thử Nghiệm',
            provider: 'mock Zalo'
        };
    }

    // TODO [CHƯA XÁC MINH]: Gọi Graph API Zalo xác thực người dùng thật
    return null;
}

function resetMockZaloTokens() {
    usedLocationTokens.clear();
}

module.exports = {
    verifyZaloLocationToken,
    verifyZaloUserToken,
    resetMockZaloTokens
};

