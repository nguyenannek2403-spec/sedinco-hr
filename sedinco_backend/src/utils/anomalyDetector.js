/**
 * src/utils/anomalyDetector.js
 * 
 * Thuật toán phát hiện bất thường & Chống gian lận chấm công (Proposal 3 - Đã duyệt)
 * 
 * Thay đổi cốt lõi:
 * 1. [BỎ SAME_IP]: Tuyệt đối không cắm cờ gian lận khi nhân viên chung IP Wi-Fi công ty
 * 2. [MULTI-ACCOUNT SINGLE-DEVICE]: Một thiết bị chấm cho nhiều tài khoản trong vòng 180s (Chấm công hộ)
 * 3. [MULTI-DEVICE SINGLE-ACCOUNT]: Một tài khoản đổi ≥ 3 thiết bị khác nhau trong ngày
 * 4. [IMPOSSIBLE TRAVEL VELOCITY]: Di chuyển bất khả thi (> 120 km/h hoặc > 5km trong < 5 phút)
 * 
 * B7: Các ngưỡng được export dưới dạng THRESHOLDS object để:
 *   - Test có thể kiểm tra giá trị mà không cần đọc nội dung hàm
 *   - Dễ dàng điều chỉnh bằng config/DB mà không cần sửa code logic
 */

const { query } = require('../config/db');
const { calculateDistanceMeters } = require('./geoHelper');

/**
 * Ngưỡng cấu hình phát hiện bất thường (B7 — Cấu hình được, không hardcode ngầm)
 * Có thể ghi đè bằng biến môi trường hoặc bảng company_settings trong tương lai.
 */
const THRESHOLDS = {
    /** Cửa sổ thời gian phát hiện chấm công hộ (Quy tắc 1): giây */
    MULTI_ACCT_WINDOW_SEC: 180,
    /** Số thiết bị tối đa 1 tài khoản được dùng trong ngày (Quy tắc 2) */
    MAX_DEVICES_PER_DAY: 3,
    /** Khoảng cách tối thiểu tính là "di chuyển đáng kể" (Quy tắc 3): mét */
    IMPOSSIBLE_DIST_M: 5000,
    /** Vận tốc bất khả thi (Quy tắc 3): km/h */
    IMPOSSIBLE_SPEED_KMH: 120,
    /** Khoảng cách tối thiểu để áp dụng kiểm tra vận tốc (tránh sai số GPS): mét */
    MIN_DIST_FOR_SPEED_CHECK_M: 1000,
    /** Thời gian tối đa để di chuyển IMPOSSIBLE_DIST_M mà vẫn bị coi là bất thường: giây */
    IMPOSSIBLE_TIME_SEC: 300
};

/**
 * Phân tích và phát hiện các dấu hiệu bất thường trong phiên chấm công
 * 
 * @param {Object} params
 * @param {string} params.ma_nv Mã nhân viên đang chấm công
 * @param {string} params.device_info Mã nhận diện thiết bị
 * @param {number} params.lat Vĩ độ
 * @param {number} params.lng Kinh độ
 * @param {string} params.ip_address Địa chỉ IP client (chỉ ghi nhận, không dùng để cắm cờ)
 * @returns {Promise<{ is_suspicious: boolean, suspicious_reason: string | null }>}
 */
async function detectAttendanceAnomalies({ ma_nv, device_info, lat, lng, ip_address }) {
    if (!ma_nv) {
        return { is_suspicious: false, suspicious_reason: null };
    }

    const currentLat = (lat !== null && lat !== undefined && lat !== '') ? Number(lat) : null;
    const currentLng = (lng !== null && lng !== undefined && lng !== '') ? Number(lng) : null;
    const currentDevice = device_info ? String(device_info).trim() : null;
    const reasons = [];

    // ─────────────────────────────────────────────────────────────
    // QUY TẮC 1: Một thiết bị nhiều tài khoản (Multi-Account Single-Device / Chấm công hộ)
    // ─────────────────────────────────────────────────────────────
    if (currentDevice) {
        const recentOtherLogs = await query(`
            SELECT actor_id, details, created_at 
            FROM audit_logs 
            WHERE action = 'CHECK_IN_DYNAMIC_QR' 
              AND actor_id != ? 
              AND created_at >= NOW() - INTERVAL ${THRESHOLDS.MULTI_ACCT_WINDOW_SEC} SECOND
            ORDER BY created_at DESC 
            LIMIT 10
        `, [ma_nv]);

        if (recentOtherLogs && recentOtherLogs.length > 0) {
            for (const log of recentOtherLogs) {
                try {
                    const parsed = JSON.parse(log.details || '{}');
                    if (parsed.device_fingerprint && parsed.device_fingerprint === currentDevice) {
                        reasons.push(`Phát hiện chấm công liên tiếp trên cùng thiết bị (${currentDevice}) cho nhiều tài khoản khác nhau (${log.actor_id}) trong vòng 3 phút`);
                        break;
                    }
                } catch {}
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // QUY TẮC 2: Một tài khoản đổi nhiều thiết bị bất thường trong ngày (≥ MAX_DEVICES_PER_DAY)
    // ─────────────────────────────────────────────────────────────
    if (currentDevice) {
        const todaySelfLogs = await query(`
            SELECT details, created_at 
            FROM audit_logs 
            WHERE action = 'CHECK_IN_DYNAMIC_QR' 
              AND actor_id = ? 
              AND DATE(created_at) = CURRENT_DATE()
            ORDER BY created_at ASC
        `, [ma_nv]);

        const distinctDevices = new Set();
        distinctDevices.add(currentDevice);

        if (todaySelfLogs && todaySelfLogs.length > 0) {
            for (const log of todaySelfLogs) {
                try {
                    const parsed = JSON.parse(log.details || '{}');
                    if (parsed.device_fingerprint) {
                        distinctDevices.add(parsed.device_fingerprint);
                    }
                } catch {}
            }
        }

        if (distinctDevices.size >= THRESHOLDS.MAX_DEVICES_PER_DAY) {
            reasons.push(`Tài khoản đổi nhiều thiết bị bất thường trong ngày (${distinctDevices.size} thiết bị khác nhau)`);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // QUY TẮC 3: Di chuyển bất khả thi (Impossible Travel Velocity)
    // ─────────────────────────────────────────────────────────────
    if (currentLat !== null && currentLng !== null && !isNaN(currentLat) && !isNaN(currentLng)) {
        const lastSelfLogs = await query(`
            SELECT details, created_at 
            FROM audit_logs 
            WHERE action = 'CHECK_IN_DYNAMIC_QR' 
              AND actor_id = ? 
              AND created_at >= NOW() - INTERVAL 24 HOUR
            ORDER BY id DESC 
            LIMIT 5
        `, [ma_nv]);

        if (lastSelfLogs && lastSelfLogs.length > 0) {
            for (const log of lastSelfLogs) {
                try {
                    const parsed = JSON.parse(log.details || '{}');
                    const prevLat = (parsed.lat !== null && parsed.lat !== undefined) ? Number(parsed.lat) : null;
                    const prevLng = (parsed.lng !== null && parsed.lng !== undefined) ? Number(parsed.lng) : null;
                    const prevTime = new Date(log.created_at).getTime();
                    const nowTime = Date.now();

                    if (prevLat !== null && prevLng !== null && !isNaN(prevLat) && !isNaN(prevLng)) {
                        const elapsedSeconds = Math.max(1, (nowTime - prevTime) / 1000);
                        const distanceMeters = calculateDistanceMeters(currentLat, currentLng, prevLat, prevLng);
                        const velocityKmh = (distanceMeters / 1000) / (elapsedSeconds / 3600);

                        if (
                            (velocityKmh > THRESHOLDS.IMPOSSIBLE_SPEED_KMH && distanceMeters > THRESHOLDS.MIN_DIST_FOR_SPEED_CHECK_M) ||
                            (elapsedSeconds < THRESHOLDS.IMPOSSIBLE_TIME_SEC && distanceMeters > THRESHOLDS.IMPOSSIBLE_DIST_M)
                        ) {
                            reasons.push(`Di chuyển bất khả thi: khoảng cách ${Math.round(distanceMeters)}m trong ${Math.round(elapsedSeconds)}s (vận tốc ~${Math.round(velocityKmh)} km/h)`);
                        }
                        // Đã tìm thấy tọa độ gần nhất, dừng tìm kiếm
                        break;
                    }
                } catch {}
            }
        }
    }

    if (reasons.length > 0) {
        return {
            is_suspicious: true,
            suspicious_reason: reasons.join('; ')
        };
    }

    return {
        is_suspicious: false,
        suspicious_reason: null
    };
}

module.exports = {
    detectAttendanceAnomalies,
    THRESHOLDS
};
