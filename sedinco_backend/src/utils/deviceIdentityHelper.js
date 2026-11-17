const crypto = require('crypto');
const { query } = require('../config/db');
const { logAuditEvent, invalidateUserCache } = require('../middlewares/authMiddleware');

/**
 * Bảng ánh xạ thông số màn hình vật lý + DPR -> Tên đời máy Apple iPhone/iPad thương mại.
 */
const IOS_SCREEN_MODEL_MAP = {
    '320x568@2': 'iPhone SE / 5s',
    '375x667@2': 'iPhone 8 / SE',
    '414x736@3': 'iPhone 8 Plus',
    '375x812@3': 'iPhone X / XS / 11 Pro',
    '414x896@2': 'iPhone 11 / XR',
    '414x896@3': 'iPhone 11 Pro Max / XS Max',
    '360x780@3': 'iPhone 12/13 mini',
    '390x844@3': 'iPhone 12 / 13 / 14',
    '428x926@3': 'iPhone 12/13 Pro Max / 14 Plus',
    '393x852@3': 'iPhone 14 Pro / 15 / 16',
    '430x932@3': 'iPhone 14/15 Pro Max / 16 Plus',
    '402x874@3': 'iPhone 16 Pro',
    '440x956@3': 'iPhone 16 Pro Max'
};

/**
 * Bảng ánh xạ một số mã máy Android phổ biến tại Việt Nam sang tên thương mại dễ đọc.
 */
const ANDROID_MODEL_PATTERNS = [
    { re: /SM-S928/i, name: 'Samsung Galaxy S24 Ultra' },
    { re: /SM-S918/i, name: 'Samsung Galaxy S23 Ultra' },
    { re: /SM-S908/i, name: 'Samsung Galaxy S22 Ultra' },
    { re: /SM-A556/i, name: 'Samsung Galaxy A55' },
    { re: /SM-A546/i, name: 'Samsung Galaxy A54' },
    { re: /SM-A346/i, name: 'Samsung Galaxy A34' },
    { re: /SM-A155/i, name: 'Samsung Galaxy A15' },
    { re: /SM-[A-Z0-9]+/i, prefix: 'Samsung Galaxy' },
    { re: /CPH\d+/i, prefix: 'OPPO' },
    { re: /PG[A-Z]\d+/i, prefix: 'OPPO' },
    { re: /RMX\d+/i, prefix: 'Realme' },
    { re: /2[234]\d{2,}[A-Z0-9]*/i, prefix: 'Xiaomi / Redmi' },
    { re: /V\d{4}[A-Z]?/i, prefix: 'vivo' }
];

/**
 * Tạo mã định danh ngắn 4 ký tự in hoa (VD: 8F2A) duy nhất theo deviceId.
 */
function computeDeviceShortTag(deviceId = '') {
    const clean = String(deviceId || '').trim();
    if (!clean) return '0000';
    const hash = crypto.createHash('sha256').update(clean).digest('hex').toUpperCase();
    return hash.slice(-4);
}

/**
 * Chuẩn hóa tên thương mại thiết bị từ thông tin SDK / device_info / User-Agent.
 */
function resolveFriendlyDeviceName({ device_name = '', device_info = null, user_agent = '' } = {}) {
    const explicit = String(
        device_name ||
        (device_info && typeof device_info === 'object'
            ? (device_info.deviceName || device_info.device_name || device_info.deviceModel || '')
            : '')
    ).trim();
    if (explicit && !['unknown', 'mobile', 'android', 'ios'].includes(explicit.toLowerCase())) {
        return explicit.slice(0, 120);
    }

    const ua = String(
        (device_info && typeof device_info === 'object' && device_info.userAgent) || user_agent || ''
    );
    const infoObj = device_info && typeof device_info === 'object' ? device_info : {};

    // 1. Khớp iOS theo kích thước màn hình + pixel ratio nếu có
    if (/iPhone|iPad|iPod/i.test(ua) || /iOS/i.test(String(infoObj.platform || ''))) {
        if (/iPad/i.test(ua)) return 'Apple iPad';
        const sw = Number(infoObj.screenWidth || 0);
        const sh = Number(infoObj.screenHeight || 0);
        const dpr = Math.round(Number(infoObj.pixelRatio || 0));
        if (sw > 0 && sh > 0 && dpr > 0) {
            const minSide = Math.min(sw, sh);
            const maxSide = Math.max(sw, sh);
            const key = `${minSide}x${maxSide}@${dpr}`;
            if (IOS_SCREEN_MODEL_MAP[key]) return IOS_SCREEN_MODEL_MAP[key];
        }
        return 'Apple iPhone';
    }

    // 2. Android brand + model
    const rawBrand = String(infoObj.brand || '').trim();
    const rawModel = String(infoObj.model || '').trim();
    const uaModelMatch = ua.match(/Android\s+[^;]+;\s*([^;)]+)/i);
    const candidateModel = rawModel || (uaModelMatch ? uaModelMatch[1].replace(/\s*Build\/.*$/i, '').trim() : '');

    if (candidateModel) {
        for (const p of ANDROID_MODEL_PATTERNS) {
            if (p.re.test(candidateModel)) {
                return p.name || `${p.prefix} (${candidateModel})`.slice(0, 120);
            }
        }
        if (rawBrand && !candidateModel.toLowerCase().startsWith(rawBrand.toLowerCase())) {
            return `${rawBrand} ${candidateModel}`.slice(0, 120);
        }
        return candidateModel.slice(0, 120);
    }

    if (/Android/i.test(ua)) return rawBrand ? `${rawBrand} Android` : 'Điện thoại Android';
    if (/Macintosh|Mac OS/i.test(ua)) return 'Máy tính Mac';
    if (/Windows/i.test(ua)) return 'Máy tính Windows';
    return 'Thiết bị di động';
}

/**
 * Phân tách payload định danh thiết bị từ login/check-in thành { deviceId, deviceName, shortTag }.
 */
function parseDeviceIdentity({ device_id = null, device_name = null, device_info = null, user_agent = '' } = {}) {
    let deviceId = '';
    if (device_id && typeof device_id === 'string' && device_id.trim()) {
        deviceId = device_id.trim();
    } else if (device_info && typeof device_info === 'object') {
        const raw = device_info.deviceId || device_info.device_id || '';
        if (raw && String(raw).trim()) {
            deviceId = String(raw).trim();
        } else {
            const joined = [device_info.platform, device_info.model, device_info.userAgent].filter(Boolean).join('|');
            deviceId = joined ? joined : '';
        }
    } else if (typeof device_info === 'string' && device_info.trim()) {
        deviceId = device_info.trim();
    }

    deviceId = deviceId.slice(0, 100);
    const deviceName = resolveFriendlyDeviceName({ device_name, device_info, user_agent });
    const explicitTag = (device_info && typeof device_info === 'object' && device_info.shortTag)
        ? String(device_info.shortTag).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-4)
        : '';
    const shortTag = explicitTag.length === 4 ? explicitTag : computeDeviceShortTag(deviceId);

    return {
        deviceId,
        deviceName,
        shortTag
    };
}

function safeParseKnownDevices(rawJson) {
    if (!rawJson) return [];
    if (Array.isArray(rawJson)) return rawJson;
    try {
        const parsed = JSON.parse(rawJson);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Ghi nhận hoạt động thiết bị cho nhân viên khi đăng nhập hoặc chấm công:
 * - Lưu lịch sử known_devices_json (phân biệt từng máy vật lý bằng device_id + short_tag #XXXX)
 * - Gắn thiết bị đầu tiên làm bound_device_id + bound_device_name
 * - Bật cờ multi_device_alert = 1 & ghi audit_logs ngay khi phát hiện >= 2 thiết bị khác nhau
 *   (kể cả 2 chiếc điện thoại vật lý khác nhau nhưng cùng đời máy như 2 chiếc iPhone 8)
 */
async function recordEmployeeDeviceActivity(emp, {
    device_id = null,
    device_name = null,
    device_info = null,
    user_agent = '',
    ip_address = '',
    source = 'login'
} = {}) {
    const parsed = parseDeviceIdentity({ device_id, device_name, device_info, user_agent });
    if (!parsed.deviceId) {
        return {
            tracked: false,
            blocked: false,
            isMultiDevice: Boolean(emp?.multi_device_alert),
            parsed
        };
    }

    const nowIso = new Date().toISOString();
    const knownDevices = safeParseKnownDevices(emp?.known_devices_json);

    // Đảm bảo thiết bị gốc (bound_device_id) luôn nằm trong danh sách known_devices
    if (emp?.bound_device_id && !knownDevices.some((d) => d.device_id === emp.bound_device_id)) {
        const baseName = emp.bound_device_name || resolveFriendlyDeviceName({ device_name: emp.bound_device_id });
        knownDevices.push({
            device_id: emp.bound_device_id,
            device_name: baseName,
            short_tag: computeDeviceShortTag(emp.bound_device_id),
            first_seen: nowIso,
            last_seen: nowIso,
            ip: '',
            login_count: 1
        });
    }

    const existingIdx = knownDevices.findIndex((d) => d.device_id === parsed.deviceId);
    const isFirstTimeForDevice = existingIdx === -1;

    if (existingIdx >= 0) {
        knownDevices[existingIdx] = {
            ...knownDevices[existingIdx],
            device_name: parsed.deviceName || knownDevices[existingIdx].device_name,
            short_tag: parsed.shortTag || knownDevices[existingIdx].short_tag || computeDeviceShortTag(parsed.deviceId),
            last_seen: nowIso,
            ip: ip_address || knownDevices[existingIdx].ip || '',
            login_count: (Number(knownDevices[existingIdx].login_count) || 1) + 1
        };
    } else {
        knownDevices.push({
            device_id: parsed.deviceId,
            device_name: parsed.deviceName,
            short_tag: parsed.shortTag,
            first_seen: nowIso,
            last_seen: nowIso,
            ip: ip_address || '',
            login_count: 1
        });
    }

    // Giữ tối đa 10 bản ghi thiết bị gần nhất
    const trimmedDevices = knownDevices.slice(-10);
    const primaryDeviceId = emp?.bound_device_id || parsed.deviceId;
    const primaryDeviceName = emp?.bound_device_id
        ? (emp.bound_device_name || resolveFriendlyDeviceName({ device_name: emp.bound_device_id }))
        : parsed.deviceName;
    const primaryTag = computeDeviceShortTag(primaryDeviceId);

    const hasDistinctSecondDevice = trimmedDevices.length >= 2 || (Boolean(emp?.bound_device_id) && emp.bound_device_id !== parsed.deviceId);
    const wasMultiAlert = Boolean(emp?.multi_device_alert);
    const nextMultiAlert = hasDistinctSecondDevice ? 1 : (wasMultiAlert ? 1 : 0);

    const isEnforcedMismatch = emp?.device_binding_mode === 'enforced'
        && Boolean(emp?.bound_device_id)
        && emp.bound_device_id !== parsed.deviceId;

    await query(
        `UPDATE employees
         SET bound_device_id = COALESCE(NULLIF(bound_device_id, ''), ?),
             bound_device_name = CASE WHEN bound_device_id IS NULL OR bound_device_id = '' THEN ? ELSE COALESCE(bound_device_name, ?) END,
             known_devices_json = ?,
             multi_device_alert = ?
         WHERE ma_nv = ?`,
        [
            parsed.deviceId,
            parsed.deviceName,
            primaryDeviceName,
            JSON.stringify(trimmedDevices),
            nextMultiAlert,
            emp.ma_nv
        ]
    ).catch(() => {});

    emp.bound_device_id = primaryDeviceId;
    emp.bound_device_name = primaryDeviceName;
    emp.known_devices_json = JSON.stringify(trimmedDevices);
    emp.multi_device_alert = nextMultiAlert;
    invalidateUserCache(emp.ma_nv);

    if (hasDistinctSecondDevice && (isFirstTimeForDevice || !wasMultiAlert || isEnforcedMismatch)) {
        const empName = emp.ho_ten || emp.ma_nv;
        await logAuditEvent({
            actor_id: emp.ma_nv,
            actor_role: emp.role || 'worker',
            action: 'MULTI_DEVICE_DETECTED',
            resource: 'employee_device',
            details: {
                message: `🚨 Cảnh báo đa thiết bị: Tài khoản ${empName} vừa ${source === 'check_in' ? 'chấm công' : 'đăng nhập'} trên thiết bị thứ 2 (${empName} : ${parsed.deviceName} #${parsed.shortTag}), khác với thiết bị gốc (${empName} : ${primaryDeviceName} #${primaryTag})`,
                primary_device: { device_id: primaryDeviceId, device_name: primaryDeviceName, short_tag: primaryTag },
                secondary_device: { device_id: parsed.deviceId, device_name: parsed.deviceName, short_tag: parsed.shortTag },
                blocked: isEnforcedMismatch,
                total_known_devices: trimmedDevices.length
            },
            ip_address
        });
    }

    return {
        tracked: true,
        blocked: isEnforcedMismatch,
        isMultiDevice: Boolean(nextMultiAlert),
        parsed,
        primaryDeviceId,
        primaryDeviceName,
        primaryTag,
        knownDevices: trimmedDevices
    };
}

module.exports = {
    computeDeviceShortTag,
    resolveFriendlyDeviceName,
    parseDeviceIdentity,
    safeParseKnownDevices,
    recordEmployeeDeviceActivity
};

