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
    const ua = String(infoObj.userAgent || user_agent || '');
    const rawOsVer = String(infoObj.osVersion || infoObj.system || '').trim();
    const iosUaVerMatch = ua.match(/(?:CPU\s+)?(?:iPhone\s+)?OS\s+([\d_]+)/i);
    const androidUaVerMatch = ua.match(/Android\s+([\d.]+)/i);
    const detectedIosVer = rawOsVer && /iOS/i.test(rawOsVer)
        ? rawOsVer.replace(/^iOS\s*/i, '').trim()
        : (iosUaVerMatch ? iosUaVerMatch[1].replace(/_/g, '.') : (rawOsVer || ''));
    const detectedAndroidVer = rawOsVer && /Android/i.test(rawOsVer)
        ? rawOsVer.replace(/^Android\s*/i, '').trim()
        : (androidUaVerMatch ? androidUaVerMatch[1] : (rawOsVer || ''));

    const explicit = String(
        device_name ||
        infoObj.deviceName || infoObj.device_name || infoObj.deviceModel || ''
    ).trim();
    if (explicit && !['unknown', 'mobile', 'android', 'ios', 'thiết bị di động', 'apple iphone', 'điện thoại android', 'thiết bị không rõ'].includes(explicit.toLowerCase())) {
        return sanitizeSingleDeviceModelName(explicit);
    }

    const rawModel = String(infoObj.model || '').trim();
    if (rawModel && APPLE_HARDWARE_CODES[rawModel]) {
        const mapped = APPLE_HARDWARE_CODES[rawModel];
        return detectedIosVer ? `${mapped} (iOS ${detectedIosVer})`.slice(0, 120) : mapped;
    }

    // 1. Khớp iOS theo mã máy cụ thể hoặc kích thước màn hình + pixel ratio -> 1 model đại diện duy nhất
    if (/iPhone|iPad|iPod/i.test(ua) || /iOS/i.test(String(infoObj.platform || ''))) {
        if (/iPad/i.test(ua) || /iPad/i.test(rawModel)) {
            return detectedIosVer ? `Apple iPad (iOS ${detectedIosVer})` : 'Apple iPad';
        }
        if (rawModel && /iPhone\s*\d+/i.test(rawModel) && !rawModel.includes(',')) {
            const clean = sanitizeSingleDeviceModelName(rawModel);
            return detectedIosVer && !clean.includes('iOS') ? `${clean} (iOS ${detectedIosVer})`.slice(0, 120) : clean;
        }
        const sw = Number(infoObj.screenWidth || 0);
        const sh = Number(infoObj.screenHeight || 0);
        const dpr = Math.round(Number(infoObj.pixelRatio || 0));
        if (sw > 0 && sh > 0 && dpr > 0) {
            const minSide = Math.min(sw, sh);
            const maxSide = Math.max(sw, sh);
            const key = `${minSide}x${maxSide}@${dpr}`;
            if (IOS_SCREEN_MODEL_MAP[key]) {
                const m = IOS_SCREEN_MODEL_MAP[key];
                return detectedIosVer ? `${m} (iOS ${detectedIosVer})`.slice(0, 120) : m;
            }
        }
        return detectedIosVer ? `iPhone (iOS ${detectedIosVer})` : UNKNOWN_DEVICE_LABEL;
    }

    // 2. Android brand + model cụ thể
    const rawBrand = String(infoObj.brand || '').trim();
    const uaModelMatch = ua.match(/Android\s+[^;]+;\s*([^;)]+)/i);
    const candidateModel = rawModel || (uaModelMatch ? uaModelMatch[1].replace(/\s*Build\/.*$/i, '').trim() : '');

    if (candidateModel && !/^K$/i.test(candidateModel)) {
        const suffix = detectedAndroidVer ? ` (Android ${detectedAndroidVer})` : '';
        for (const p of ANDROID_MODEL_PATTERNS) {
            if (p.re.test(candidateModel)) {
                const base = sanitizeSingleDeviceModelName(p.name || `${p.prefix} ${candidateModel}`);
                return `${base}${suffix}`.slice(0, 120);
            }
        }
        if (rawBrand && !candidateModel.toLowerCase().startsWith(rawBrand.toLowerCase())) {
            return sanitizeSingleDeviceModelName(`${rawBrand} ${candidateModel}${suffix}`);
        }
        return sanitizeSingleDeviceModelName(`${candidateModel}${suffix}`);
    }

    if (/Android/i.test(ua)) return detectedAndroidVer ? `Android (Android ${detectedAndroidVer})` : 'Thiết bị Android';
    if (/Macintosh|Mac OS/i.test(ua)) return 'Trình duyệt macOS';
    if (/Windows/i.test(ua)) return 'Trình duyệt Windows';
    if (/Linux/i.test(ua)) return 'Trình duyệt Linux';
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

function formatVnDateTimeIso(dateVal) {
    if (!dateVal) return null;
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (Number.isNaN(d.getTime())) return String(dateVal);
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(d);
    const get = (t) => (fmt.find((p) => p.type === t) || {}).value || '00';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+07:00`;
}

function buildDeviceWarningPayload({
    warningType = 'NONE',
    deviceId = '',
    deviceName = '',
    primaryDeviceName = '',
    sharedPeer = null
} = {}) {
    if (!warningType || warningType === 'NONE') return null;
    const cleanDev = deviceName || UNKNOWN_DEVICE_LABEL;
    const peerLabel = sharedPeer ? `${sharedPeer.ma_nv} - ${sharedPeer.ho_ten || sharedPeer.ma_nv}` : '';

    let message = '';
    if (warningType === 'NEW_AND_SHARED_DEVICE') {
        message = `Tài khoản của bạn đang sử dụng trên thiết bị khác với máy thường dùng (${cleanDev}), đồng thời thiết bị này cũng đang được sử dụng cho tài khoản ${peerLabel || 'nhân sự khác'}. Hệ thống đã ghi nhận thông tin thiết bị để Quản trị viên theo dõi.`;
    } else if (warningType === 'SHARED_DEVICE') {
        message = `Thiết bị này (${cleanDev}) cũng đang được sử dụng cho tài khoản nhân sự khác (${peerLabel || 'đồng nghiệp'}). Hệ thống đã ghi nhận thông tin thiết bị để Quản trị viên đối chiếu.`;
    } else if (warningType === 'NEW_DEVICE') {
        message = `Tài khoản của bạn đang sử dụng trên thiết bị khác với máy thường dùng (${cleanDev}). Hệ thống đã ghi nhận tên thiết bị này cho Quản trị viên theo dõi.`;
    }

    return {
        type: warningType,
        device_id: deviceId || null,
        device_name: cleanDev,
        primary_device_name: primaryDeviceName || null,
        shared_with_user_id: sharedPeer?.ma_nv || null,
        shared_with_user_label: peerLabel || null,
        message
    };
}

/**
 * V70: Theo dõi thiết bị thông minh KHÔNG CHẶN CỨNG (Soft-Warning Only):
 * - Lưu bound_device_id/bound_device_name làm Thiết bị chính cố định (CHỈ tự gán lần đầu, hoặc khi Admin đặt lại).
 * - Phát hiện Kịch bản A (NEW_DEVICE) & Kịch bản B (SHARED_DEVICE - trùng máy chính hoặc dùng chung trong 30 ngày).
 * - Ghi lịch sử user_device_logs & known_devices_json, đẩy thông báo Admin chống spam; bọc try/catch không làm sập luồng chính.
 */
async function recordEmployeeDeviceActivity(emp, {
    device_id = null,
    device_name = null,
    device_info = null,
    user_agent = '',
    ip_address = '',
    source = 'login',
    action_type = null,
    notify_admin = true,
    dbQuery = query
} = {}) {
    const runQuery = typeof dbQuery === 'function' ? dbQuery : query;
    const parsed = parseDeviceIdentity({ device_id, device_name, device_info, user_agent });
    if (!parsed.deviceId || !emp || (!emp.ma_nv && !emp.username)) {
        return {
            tracked: false,
            blocked: false,
            warningType: 'NONE',
            deviceWarning: null,
            isMultiDevice: Boolean(emp?.multi_device_alert),
            parsed
        };
    }

    const empKey = emp.ma_nv || emp.username;
    const roleStr = String(emp.role || '').toLowerCase();
    const isAdminActor = roleStr === 'admin' || (!emp.ma_nv && Boolean(emp.username));
    const resolvedActionType = String(
        action_type ||
        (source === 'check_out' ? 'CHECK_OUT' : source === 'check_in' ? 'CHECK_IN' : source === 'session_sync' ? 'SESSION_SYNC' : 'LOGIN')
    ).toUpperCase();

    const now = new Date();
    const nowIso = now.toISOString();
    let warningType = 'NONE';
    let sharedPeer = null;
    let primaryDeviceId = emp.bound_device_id ? String(emp.bound_device_id).trim() : '';
    let primaryDeviceName = emp.bound_device_name ? sanitizeSingleDeviceModelName(emp.bound_device_name) : '';
    let primarySetAt = emp.primary_device_set_at || null;
    let trimmedDevices = safeParseKnownDevices(emp?.known_devices_json);

    try {
        if (!isAdminActor) {
            let isFirstPrimaryInit = false;
            if (!primaryDeviceId) {
                primaryDeviceId = parsed.deviceId;
                primaryDeviceName = parsed.deviceName || UNKNOWN_DEVICE_LABEL;
                primarySetAt = now;
                isFirstPrimaryInit = true;
            }

            const isNewDevice = !isFirstPrimaryInit && primaryDeviceId !== parsed.deviceId;

            // Đảm bảo thiết bị chính luôn xuất hiện trong known_devices_json
            if (trimmedDevices.length === 0 && primaryDeviceId) {
                trimmedDevices.push({
                    device_id: primaryDeviceId,
                    device_name: primaryDeviceName || UNKNOWN_DEVICE_LABEL,
                    short_tag: computeDeviceShortTag(primaryDeviceId),
                    first_seen: nowIso,
                    last_seen: nowIso,
                    ip: ip_address || '',
                    source: isFirstPrimaryInit ? source : 'primary',
                    is_primary: true,
                    login_count: 1
                });
            }

            const lastEntry = trimmedDevices.length > 0 ? trimmedDevices[trimmedDevices.length - 1] : null;
            const isSameAsLastConsecutive = Boolean(lastEntry && lastEntry.device_id === parsed.deviceId);
            if (isSameAsLastConsecutive) {
                trimmedDevices[trimmedDevices.length - 1] = {
                    ...lastEntry,
                    device_id: parsed.deviceId,
                    device_name: parsed.deviceName || lastEntry.device_name,
                    short_tag: parsed.shortTag || lastEntry.short_tag || computeDeviceShortTag(parsed.deviceId),
                    last_seen: nowIso,
                    ip: ip_address || lastEntry.ip || '',
                    source: resolvedActionType.toLowerCase(),
                    is_primary: parsed.deviceId === primaryDeviceId,
                    login_count: (Number(lastEntry.login_count) || 1) + (resolvedActionType === 'SESSION_SYNC' ? 0 : 1)
                };
            } else {
                trimmedDevices.push({
                    device_id: parsed.deviceId,
                    device_name: parsed.deviceName,
                    short_tag: parsed.shortTag,
                    first_seen: nowIso,
                    last_seen: nowIso,
                    ip: ip_address || '',
                    source: resolvedActionType.toLowerCase(),
                    is_primary: parsed.deviceId === primaryDeviceId,
                    login_count: 1
                });
            }
            trimmedDevices = trimmedDevices.slice(-20);

            // Kiểm tra Kịch bản B (SHARED_DEVICE): trùng primary của đồng nghiệp đang hoạt động hoặc trùng log 30 ngày gần nhất
            const peerPrimaryRows = await runQuery(
                `SELECT ma_nv, ho_ten
                 FROM employees
                 WHERE ma_nv != ?
                   AND bound_device_id = ?
                   AND (status IS NULL OR status != 'inactive')
                   AND COALESCE(is_locked, 0) = 0
                   AND (role IS NULL OR role != 'admin')
                 LIMIT 1`,
                [empKey, parsed.deviceId]
            ).catch(() => []);

            if (peerPrimaryRows && peerPrimaryRows.length > 0) {
                sharedPeer = peerPrimaryRows[0];
            } else {
                const peerLogRows = await runQuery(
                    `SELECT udl.employee_id as ma_nv, e.ho_ten
                     FROM user_device_logs udl
                     INNER JOIN employees e ON e.ma_nv = udl.employee_id
                     WHERE udl.employee_id != ?
                       AND udl.device_id = ?
                       AND udl.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                       AND (e.status IS NULL OR e.status != 'inactive')
                       AND COALESCE(e.is_locked, 0) = 0
                       AND (e.role IS NULL OR e.role != 'admin')
                     ORDER BY udl.created_at DESC, udl.id DESC
                     LIMIT 1`,
                    [empKey, parsed.deviceId]
                ).catch(() => []);
                if (peerLogRows && peerLogRows.length > 0) {
                    sharedPeer = peerLogRows[0];
                }
            }

            const isSharedDevice = Boolean(sharedPeer && sharedPeer.ma_nv);
            if (isNewDevice && isSharedDevice) warningType = 'NEW_AND_SHARED_DEVICE';
            else if (isSharedDevice) warningType = 'SHARED_DEVICE';
            else if (isNewDevice) warningType = 'NEW_DEVICE';

            const nextMultiAlert = (warningType !== 'NONE' || new Set(trimmedDevices.map((d) => d.device_id).filter(Boolean)).size >= 2) ? 1 : 0;

            await runQuery(
                `UPDATE employees
                 SET bound_device_id = ?,
                     bound_device_name = ?,
                     primary_device_set_at = COALESCE(primary_device_set_at, ?),
                     last_login_device_id = ?,
                     last_login_device_name = ?,
                     last_login_at = ?,
                     known_devices_json = ?,
                     multi_device_alert = ?
                 WHERE ma_nv = ?`,
                [
                    primaryDeviceId,
                    primaryDeviceName,
                    primarySetAt || now,
                    parsed.deviceId,
                    parsed.deviceName,
                    now,
                    JSON.stringify(trimmedDevices),
                    nextMultiAlert,
                    empKey
                ]
            ).catch(() => {});

            emp.bound_device_id = primaryDeviceId;
            emp.bound_device_name = primaryDeviceName;
            emp.primary_device_set_at = primarySetAt || now;
            emp.last_login_device_id = parsed.deviceId;
            emp.last_login_device_name = parsed.deviceName;
            emp.last_login_at = now;
            emp.known_devices_json = JSON.stringify(trimmedDevices);
            emp.multi_device_alert = nextMultiAlert;
            invalidateUserCache(empKey);
        }

        // Luôn ghi user_device_logs (trừ khi SESSION_SYNC trùng y hệt trong 5 phút vừa rồi để giữ log gọn sạch)
        let shouldInsertLog = resolvedActionType !== 'SESSION_SYNC';
        if (!shouldInsertLog) {
            const recentSync = await runQuery(
                `SELECT id FROM user_device_logs
                 WHERE employee_id = ? AND device_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                 LIMIT 1`,
                [empKey, parsed.deviceId]
            ).catch(() => []);
            shouldInsertLog = !(recentSync && recentSync.length > 0);
        }

        if (shouldInsertLog) {
            const sharedLabel = sharedPeer ? `${sharedPeer.ma_nv} - ${sharedPeer.ho_ten || sharedPeer.ma_nv}` : null;
            await runQuery(
                `INSERT INTO user_device_logs
                 (employee_id, device_id, device_name, action_type, warning_type, shared_with_user_id, shared_with_user_label, ip_address, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    empKey,
                    parsed.deviceId.slice(0, 128),
                    (parsed.deviceName || UNKNOWN_DEVICE_LABEL).slice(0, 255),
                    resolvedActionType === 'SESSION_SYNC' ? 'LOGIN' : resolvedActionType,
                    isAdminActor ? 'NONE' : warningType,
                    sharedPeer?.ma_nv || null,
                    sharedLabel ? sharedLabel.slice(0, 255) : null,
                    ip_address ? String(ip_address).slice(0, 64) : null,
                    now
                ]
            ).catch(() => {});
        }

        // Bắn thông báo cho Admin khi phát sinh bất thường NEW_DEVICE / SHARED_DEVICE (chống spam cùng máy + hành động trong 3 phút)
        if (!isAdminActor && notify_admin && resolvedActionType !== 'SESSION_SYNC' && warningType !== 'NONE') {
            const actionLabel =
                resolvedActionType === 'CHECK_IN'
                    ? 'Chấm công Vào'
                    : resolvedActionType === 'CHECK_OUT'
                        ? 'Chấm công Ra'
                        : 'Đăng nhập';
            const sharedLabel = sharedPeer ? `${sharedPeer.ma_nv} - ${sharedPeer.ho_ten || sharedPeer.ma_nv}` : '';
            const notifTitle = warningType.includes('SHARED')
                ? `Dùng chung thiết bị: ${emp.ho_ten || empKey} (${empKey})`
                : `Thiết bị lạ (${actionLabel}): ${emp.ho_ten || empKey} (${empKey})`;
            const notifMessage = warningType === 'NEW_AND_SHARED_DEVICE'
                ? `${actionLabel} bằng thiết bị lạ ${parsed.deviceName} — đồng thời phát hiện dùng chung thiết bị với ${sharedLabel}`
                : warningType === 'SHARED_DEVICE'
                    ? `${actionLabel} — phát hiện dùng chung thiết bị ${parsed.deviceName} với ${sharedLabel}`
                    : `${actionLabel} trên thiết bị khác với máy chính: ${parsed.deviceName}`;

            const existingRecentAlert = await runQuery(
                `SELECT id FROM user_notifications
                 WHERE recipient_ma_nv = 'ADMIN'
                   AND target_ma_nv = ?
                   AND category = 'device'
                   AND type = ?
                   AND created_at >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)
                   AND title = ?
                 LIMIT 1`,
                [empKey, `DEVICE_${warningType}`, notifTitle.slice(0, 255)]
            ).catch(() => []);

            if (!existingRecentAlert || existingRecentAlert.length === 0) {
                const evtKey = `dev_${empKey}_${resolvedActionType}_${parsed.shortTag}_${Date.now()}`.slice(0, 118);
                await runQuery(
                    `INSERT INTO user_notifications
                     (recipient_ma_nv, alert_key, type, category, severity, title, message, target_ma_nv, target_tab, target_subtab, target_id, is_read)
                     VALUES ('ADMIN', ?, ?, 'device', ?, ?, ?, ?, 'management', 'employees', ?, 0)`,
                    [
                        evtKey,
                        `DEVICE_${warningType}`,
                        warningType.includes('SHARED') ? 'critical' : 'high',
                        notifTitle.slice(0, 255),
                        notifMessage.slice(0, 500),
                        empKey,
                        empKey
                    ]
                ).catch(() => {});
            }
        }
    } catch (err) {
        console.error('[DeviceIdentityHelper] Soft device tracking warning:', err.message);
    }

    const deviceWarning = !isAdminActor
        ? buildDeviceWarningPayload({
              warningType,
              deviceId: parsed.deviceId,
              deviceName: parsed.deviceName,
              primaryDeviceName,
              sharedPeer
          })
        : null;

    return {
        tracked: true,
        blocked: false,
        warningType: isAdminActor ? 'NONE' : warningType,
        deviceWarning,
        sharedPeer,
        isMultiDevice: Boolean(emp?.multi_device_alert),
        parsed,
        primaryDeviceId: primaryDeviceId || parsed.deviceId,
        primaryDeviceName: primaryDeviceName || parsed.deviceName,
        primaryTag: computeDeviceShortTag(primaryDeviceId || parsed.deviceId),
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
    formatVnDateTimeIso,
    buildDeviceWarningPayload,
    recordEmployeeDeviceActivity
};

