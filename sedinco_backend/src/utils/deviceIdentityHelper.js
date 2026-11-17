const crypto = require('crypto');
const { query } = require('../config/db');
const { logAuditEvent, invalidateUserCache } = require('../middlewares/authMiddleware');

/**
 * Bảng ánh xạ thông số màn hình vật lý + DPR -> 1 Tên đời máy Apple iPhone duy nhất cố định (CẤM gộp dấu /).
 */
const IOS_SCREEN_MODEL_MAP = {
    '320x568@2': 'iPhone SE',
    '375x667@2': 'iPhone 8',
    '414x736@3': 'iPhone 8 Plus',
    '375x812@3': 'iPhone 11 Pro',
    '414x896@2': 'iPhone 11',
    '414x896@3': 'iPhone 11 Pro Max',
    '360x780@3': 'iPhone 13 mini',
    '390x844@3': 'iPhone 13',
    '428x926@3': 'iPhone 14 Plus',
    '393x852@3': 'iPhone 15',
    '430x932@3': 'iPhone 15 Pro Max',
    '402x874@3': 'iPhone 16 Pro',
    '440x956@3': 'iPhone 16 Pro Max'
};

const APPLE_HARDWARE_CODES = {
    'iPhone8,4': 'iPhone SE',
    'iPhone9,1': 'iPhone 7',
    'iPhone9,2': 'iPhone 7 Plus',
    'iPhone9,3': 'iPhone 7',
    'iPhone9,4': 'iPhone 7 Plus',
    'iPhone10,1': 'iPhone 8',
    'iPhone10,2': 'iPhone 8 Plus',
    'iPhone10,3': 'iPhone X',
    'iPhone10,4': 'iPhone 8',
    'iPhone10,5': 'iPhone 8 Plus',
    'iPhone10,6': 'iPhone X',
    'iPhone11,2': 'iPhone XS',
    'iPhone11,4': 'iPhone XS Max',
    'iPhone11,6': 'iPhone XS Max',
    'iPhone11,8': 'iPhone XR',
    'iPhone12,1': 'iPhone 11',
    'iPhone12,3': 'iPhone 11 Pro',
    'iPhone12,5': 'iPhone 11 Pro Max',
    'iPhone12,8': 'iPhone SE',
    'iPhone13,1': 'iPhone 12 mini',
    'iPhone13,2': 'iPhone 12',
    'iPhone13,3': 'iPhone 12 Pro',
    'iPhone13,4': 'iPhone 12 Pro Max',
    'iPhone14,2': 'iPhone 13 Pro',
    'iPhone14,3': 'iPhone 13 Pro Max',
    'iPhone14,4': 'iPhone 13 mini',
    'iPhone14,5': 'iPhone 13',
    'iPhone14,6': 'iPhone SE',
    'iPhone14,7': 'iPhone 14',
    'iPhone14,8': 'iPhone 14 Plus',
    'iPhone15,2': 'iPhone 14 Pro',
    'iPhone15,3': 'iPhone 14 Pro Max',
    'iPhone15,4': 'iPhone 15',
    'iPhone15,5': 'iPhone 15 Plus',
    'iPhone16,1': 'iPhone 15 Pro',
    'iPhone16,2': 'iPhone 15 Pro Max',
    'iPhone17,1': 'iPhone 16 Pro',
    'iPhone17,2': 'iPhone 16 Pro Max',
    'iPhone17,3': 'iPhone 16',
    'iPhone17,4': 'iPhone 16 Plus'
};

/**
 * Bảng ánh xạ mã máy Android phổ biến tại Việt Nam sang tên thương mại duy nhất.
 */
const ANDROID_MODEL_PATTERNS = [
    { re: /SM-S928/i, name: 'Samsung Galaxy S24 Ultra' },
    { re: /SM-S921/i, name: 'Samsung Galaxy S24' },
    { re: /SM-S918/i, name: 'Samsung Galaxy S23 Ultra' },
    { re: /SM-S911/i, name: 'Samsung Galaxy S23' },
    { re: /SM-S908/i, name: 'Samsung Galaxy S22 Ultra' },
    { re: /SM-A556/i, name: 'Samsung Galaxy A55' },
    { re: /SM-A546/i, name: 'Samsung Galaxy A54' },
    { re: /SM-A346/i, name: 'Samsung Galaxy A34' },
    { re: /SM-A155/i, name: 'Samsung Galaxy A15' },
    { re: /SM-[A-Z0-9]+/i, prefix: 'Samsung Galaxy' },
    { re: /CPH\d+/i, prefix: 'OPPO' },
    { re: /PG[A-Z]\d+/i, prefix: 'OPPO' },
    { re: /RMX\d+/i, prefix: 'Realme' },
    { re: /2[234]\d{2,}[A-Z0-9]*/i, prefix: 'Xiaomi' },
    { re: /V\d{4}[A-Z]?/i, prefix: 'vivo' }
];

const LEGACY_MULTI_MODEL_REPLACEMENTS = [
    [/iPhone\s*12\s*\/\s*13\s*\/\s*14/i, 'iPhone 13'],
    [/iPhone\s*14\s*Pro\s*\/\s*15\s*\/\s*16/i, 'iPhone 15'],
    [/iPhone\s*14\s*\/\s*15\s*Pro\s*Max\s*\/\s*16\s*Plus/i, 'iPhone 15 Pro Max'],
    [/iPhone\s*12\s*\/\s*13\s*Pro\s*Max\s*\/\s*14\s*Plus/i, 'iPhone 14 Plus'],
    [/iPhone\s*12\s*\/\s*13\s*mini/i, 'iPhone 13 mini'],
    [/iPhone\s*11\s*Pro\s*Max\s*\/\s*XS\s*Max/i, 'iPhone 11 Pro Max'],
    [/iPhone\s*11\s*\/\s*XR/i, 'iPhone 11'],
    [/iPhone\s*X\s*\/\s*XS\s*\/\s*11\s*Pro/i, 'iPhone 11 Pro'],
    [/iPhone\s*8\s*\/\s*SE/i, 'iPhone 8'],
    [/iPhone\s*6\s*\/\s*7\s*\/\s*8/i, 'iPhone 8'],
    [/iPhone\s*SE\s*\/\s*5s/i, 'iPhone SE'],
    [/Xiaomi\s*\/\s*Redmi/i, 'Xiaomi']
];

const UNKNOWN_DEVICE_LABEL = 'Thiết bị không rõ';

function sanitizeSingleDeviceModelName(rawName = '') {
    let text = String(rawName || '').trim();
    if (!text) return UNKNOWN_DEVICE_LABEL;
    const low = text.toLowerCase();
    if (['unknown', 'mobile', 'android', 'ios', 'thiết bị di động', 'apple iphone', 'điện thoại android'].includes(low)) {
        return UNKNOWN_DEVICE_LABEL;
    }
    if (APPLE_HARDWARE_CODES[text]) {
        return APPLE_HARDWARE_CODES[text];
    }
    for (const [re, replacement] of LEGACY_MULTI_MODEL_REPLACEMENTS) {
        if (re.test(text)) {
            text = text.replace(re, replacement).trim();
            break;
        }
    }
    if (text.includes('/')) {
        const firstPart = text.split('/')[0].trim();
        text = firstPart || UNKNOWN_DEVICE_LABEL;
    }
    if (!text || text.toLowerCase() === 'unknown') {
        return UNKNOWN_DEVICE_LABEL;
    }
    return text.slice(0, 120);
}

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
function resolveFriendlyDeviceName(input = {}) {
    const safeInput = input && typeof input === 'object' ? input : {};
    const { device_name = '', device_info = null, user_agent = '' } = safeInput;
    const infoObj = device_info && typeof device_info === 'object' ? device_info : safeInput;
    const explicit = String(
        device_name ||
        infoObj.deviceName || infoObj.device_name || infoObj.deviceModel || ''
    ).trim();
    if (explicit && !['unknown', 'mobile', 'android', 'ios', 'thiết bị di động', 'apple iphone', 'điện thoại android', 'thiết bị không rõ'].includes(explicit.toLowerCase())) {
        return sanitizeSingleDeviceModelName(explicit);
    }

    const ua = String(infoObj.userAgent || user_agent || '');
    const rawModel = String(infoObj.model || '').trim();
    if (rawModel && APPLE_HARDWARE_CODES[rawModel]) {
        return APPLE_HARDWARE_CODES[rawModel];
    }

    // 1. Khớp iOS theo mã máy cụ thể hoặc kích thước màn hình + pixel ratio -> 1 model đại diện duy nhất
    if (/iPhone|iPad|iPod/i.test(ua) || /iOS/i.test(String(infoObj.platform || ''))) {
        if (/iPad/i.test(ua) || /iPad/i.test(rawModel)) return 'Apple iPad';
        if (rawModel && /iPhone\s*\d+/i.test(rawModel) && !rawModel.includes(',')) {
            return sanitizeSingleDeviceModelName(rawModel);
        }
        const sw = Number(infoObj.screenWidth || 0);
        const sh = Number(infoObj.screenHeight || 0);
        const dpr = Math.round(Number(infoObj.pixelRatio || 0));
        if (sw > 0 && sh > 0 && dpr > 0) {
            const minSide = Math.min(sw, sh);
            const maxSide = Math.max(sw, sh);
            const key = `${minSide}x${maxSide}@${dpr}`;
            if (IOS_SCREEN_MODEL_MAP[key]) return IOS_SCREEN_MODEL_MAP[key];
        }
        return UNKNOWN_DEVICE_LABEL;
    }

    // 2. Android brand + model cụ thể
    const rawBrand = String(infoObj.brand || '').trim();
    const uaModelMatch = ua.match(/Android\s+[^;]+;\s*([^;)]+)/i);
    const candidateModel = rawModel || (uaModelMatch ? uaModelMatch[1].replace(/\s*Build\/.*$/i, '').trim() : '');

    if (candidateModel && !/^K$/i.test(candidateModel)) {
        for (const p of ANDROID_MODEL_PATTERNS) {
            if (p.re.test(candidateModel)) {
                return sanitizeSingleDeviceModelName(p.name || `${p.prefix} (${candidateModel})`);
            }
        }
        if (rawBrand && !candidateModel.toLowerCase().startsWith(rawBrand.toLowerCase())) {
            return sanitizeSingleDeviceModelName(`${rawBrand} ${candidateModel}`);
        }
        return sanitizeSingleDeviceModelName(candidateModel);
    }

    if (/Macintosh|Mac OS/i.test(ua)) return 'Máy tính Mac';
    if (/Windows/i.test(ua)) return 'Máy tính Windows';
    return UNKNOWN_DEVICE_LABEL;
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
    UNKNOWN_DEVICE_LABEL,
    sanitizeSingleDeviceModelName,
    computeDeviceShortTag,
    resolveFriendlyDeviceName,
    parseDeviceIdentity,
    safeParseKnownDevices,
    recordEmployeeDeviceActivity
};

