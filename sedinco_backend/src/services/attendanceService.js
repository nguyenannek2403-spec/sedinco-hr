const { query, withTransaction } = require('../config/db');
const { logAuditEvent, getAccountantPermissions } = require('../middlewares/authMiddleware');
const { calculateDistanceMeters } = require('../utils/geoHelper');
const { generateDynamicQrToken, verifyDynamicQrToken } = require('../utils/dynamicQrHelper');

class AttendanceService {
    async getAttendanceMatrix(month, year) {
        const emps = await query('SELECT ma_nv, ho_ten FROM employees ORDER BY ma_nv ASC');
        if (!emps || emps.length === 0) return [];

        const logs = await query(
            'SELECT employee_id, DAY(record_date) as day, status, ot_hours FROM attendance_logs WHERE MONTH(record_date)=? AND YEAR(record_date)=?',
            [month, year]
        );
        const safeLogs = logs || [];
        const daysInMonth = new Date(year, month, 0).getDate();

        return emps.map(emp => {
            const days = Array(daysInMonth).fill('');
            safeLogs
                .filter(l => l.employee_id === emp.ma_nv)
                .forEach(log => {
                    if (log.day > 0 && log.day <= daysInMonth) {
                        days[log.day - 1] = log.status;
                    }
                });
            return {
                ma_nv: emp.ma_nv,
                ho_ten: emp.ho_ten,
                days: days
            };
        });
    }

    async getMyAttendance(ma_nv, month, year) {
        const m = parseInt(month, 10) || (new Date().getMonth() + 1);
        const y = parseInt(year, 10) || new Date().getFullYear();

        const logs = await query(
            'SELECT record_date, status, ot_hours, check_in_time, check_out_time FROM attendance_logs WHERE employee_id = ? AND MONTH(record_date) = ? AND YEAR(record_date) = ? ORDER BY record_date ASC',
            [ma_nv, m, y]
        );
        return logs || [];
    }

    async isPeriodLocked(month, year) {
        if (!month || !year) return false;
        const res = await query('SELECT is_locked FROM period_locks WHERE month = ? AND year = ? LIMIT 1', [month, year]);
        if (res && res.length > 0) {
            return Boolean(res[0].is_locked);
        }
        return false;
    }

    async getPeriodLockStatus(month, year) {
        if (!month || !year) return { is_locked: false, low_trust_count: 0, low_trust_logs: [] };
        const res = await query(
            'SELECT month, year, is_locked, locked_by, locked_at, reason FROM period_locks WHERE month = ? AND year = ? LIMIT 1',
            [month, year]
        );

        const lowTrustRows = await query(
            `SELECT employee_id, record_date, location_source, is_low_trust, suspicious_reason
             FROM attendance_logs 
             WHERE MONTH(record_date) = ? AND YEAR(record_date) = ? AND is_low_trust > 0`,
            [month, year]
        );

        const low_trust_logs = (lowTrustRows || []).map(r => ({
            employee_id: r.employee_id,
            record_date: r.record_date,
            location_source: r.location_source,
            is_low_trust: Number(r.is_low_trust),
            reason: Number(r.is_low_trust) === 2 
                ? 'Hạ cấp phương thức (từng có token Zalo nhưng gửi tọa độ raw)' 
                : (r.suspicious_reason || 'Tọa độ GPS thô không có chữ ký xác thực vị trí')
        }));

        const base = {
            month: Number(month),
            year: Number(year),
            is_locked: false,
            low_trust_count: low_trust_logs.length,
            low_trust_logs
        };

        if (res && res.length > 0) {
            return {
                ...base,
                month: Number(res[0].month),
                year: Number(res[0].year),
                is_locked: Boolean(res[0].is_locked),
                locked_by: res[0].locked_by,
                locked_at: res[0].locked_at,
                reason: res[0].reason
            };
        }
        return base;
    }

    async lockPeriod({ month, year, reason, locked_by = 'admin', current_user = null, confirm_low_trust = false }) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (isNaN(m) || isNaN(y)) {
            const error = new Error('Tháng và năm không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        const lowTrustRows = await query(
            'SELECT COUNT(*) as count FROM attendance_logs WHERE MONTH(record_date) = ? AND YEAR(record_date) = ? AND is_low_trust > 0',
            [m, y]
        );
        const low_trust_count = lowTrustRows && lowTrustRows[0] ? Number(lowTrustRows[0].count) : 0;

        if (low_trust_count > 0 && confirm_low_trust !== true) {
            const error = new Error(`Kỳ công Tháng ${m}/${y} có ${low_trust_count} bản ghi có độ tin cậy thấp (is_low_trust)! Vui lòng đối soát và xác nhận trước khi chốt.`);
            error.statusCode = 400;
            error.requires_confirmation = true;
            error.low_trust_count = low_trust_count;
            throw error;
        }

        const sql = `
            INSERT INTO period_locks (month, year, is_locked, locked_by, reason)
            VALUES (?, ?, 1, ?, ?)
            ON DUPLICATE KEY UPDATE 
                is_locked = 1, 
                locked_by = VALUES(locked_by), 
                reason = VALUES(reason), 
                locked_at = CURRENT_TIMESTAMP
        `;
        await query(sql, [m, y, locked_by, reason || 'Khóa kỳ công']);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || locked_by,
                actor_role: current_user.role || 'admin',
                action: 'LOCK_ATTENDANCE_PERIOD',
                resource: 'attendance',
                details: { month: m, year: y, reason, confirm_low_trust }
            });
        }

        return { success: true, message: `Đã chốt sổ kỳ công Tháng ${m}/${y} thành công!` };
    }

    async unlockPeriod({ month, year, reason, unlocked_by = 'admin', current_user = null }) {
        const m = parseInt(month, 10);
        const y = parseInt(year, 10);
        if (isNaN(m) || isNaN(y)) {
            const error = new Error('Tháng và năm không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        if (!reason || !reason.trim()) {
            const error = new Error('Bắt buộc phải cung cấp lý do mở lại kỳ công đã chốt!');
            error.statusCode = 400;
            throw error;
        }

        const sql = `
            INSERT INTO period_locks (month, year, is_locked, locked_by, reason)
            VALUES (?, ?, 0, ?, ?)
            ON DUPLICATE KEY UPDATE 
                is_locked = 0, 
                locked_by = VALUES(locked_by), 
                reason = VALUES(reason), 
                locked_at = CURRENT_TIMESTAMP
        `;
        await query(sql, [m, y, unlocked_by, reason]);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || unlocked_by,
                actor_role: current_user.role || 'admin',
                action: 'UNLOCK_ATTENDANCE_PERIOD',
                resource: 'attendance',
                details: { month: m, year: y, reason }
            });
        }

        return { success: true, message: `Đã mở lại kỳ công Tháng ${m}/${y} thành công!` };
    }

    async updateAttendanceDaily({ ma_nv, dateStr, status, hours, isDelete, check_in_time, check_out_time, current_user = null }) {
        // 1. Phân tách nhiệm vụ (SoD P0): Không vai trò nào (worker, accountant, admin) được tự sửa công của chính mình!
        if (current_user) {
            const userRole = current_user.role;
            const isSelf = current_user.ma_nv === ma_nv;

            if (userRole === 'worker' && isDelete) {
                const error = new Error('Bảo mật: Công nhân không thể tự ý xóa bản ghi chấm công của chính mình hoặc người khác!');
                error.statusCode = 403;
                throw error;
            }

            if (isSelf) {
                const error = new Error('Phân tách nhiệm vụ (SoD): Không thể tự chỉnh sửa công của chính mình!');
                error.statusCode = 403;
                throw error;
            }

            if (userRole === 'worker') {
                const error = new Error('Bảo mật: Công nhân không thể chỉnh sửa chấm công của người khác!');
                error.statusCode = 403;
                throw error;
            }

            if (userRole === 'accountant') {
                const permissions = await getAccountantPermissions();
                if (!permissions['attendance_edit']) {
                    const error = new Error('Bảo mật: Kế toán chưa được cấp quyền chỉnh sửa chấm công nhân viên (attendance_edit)!');
                    error.statusCode = 403;
                    throw error;
                }
            }
        }

        // 2. Kiểm tra xem kỳ công của tháng này có bị đóng băng / khóa sổ không
        if (dateStr) {
            const parts = dateStr.split('-');
            if (parts.length >= 2) {
                const y = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10);
                const isLocked = await this.isPeriodLocked(m, y);
                if (isLocked) {
                    const error = new Error(`Kỳ công Tháng ${m}/${y} đã bị KHÓA SỔ để tính lương. Không thể thêm/sửa/xóa dữ liệu chấm công!`);
                    error.statusCode = 400;
                    throw error;
                }
            }
        }

        // 3. Kiểm tra xem nhân viên có đang bị TẠM KHÓA tài khoản không
        if (ma_nv) {
            const empCheck = await query('SELECT is_locked, status FROM employees WHERE ma_nv = ?', [ma_nv]);
            if (empCheck && empCheck.length > 0) {
                const emp = empCheck[0];
                if (emp.status === 'inactive' || emp.is_locked === 1 || emp.is_locked === true) {
                    const error = new Error(`Tài khoản nhân viên ${ma_nv} đang bị TẠM KHÓA. Không thể thực hiện chấm công!`);
                    error.statusCode = 403;
                    throw error;
                }
            }
        }

        if (isDelete) {
            await query('DELETE FROM attendance_logs WHERE employee_id=? AND record_date=?', [ma_nv, dateStr]);
            return { success: true };
        }

        const sql = `
            INSERT INTO attendance_logs (employee_id, record_date, status, ot_hours, check_in_time, check_out_time) 
            VALUES (?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
                status = VALUES(status), 
                ot_hours = VALUES(ot_hours),
                check_in_time = COALESCE(VALUES(check_in_time), check_in_time),
                check_out_time = COALESCE(VALUES(check_out_time), check_out_time)
        `;
        await query(sql, [ma_nv, dateStr, status, hours, check_in_time || null, check_out_time || null]);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.ma_nv || current_user.username || 'unknown',
                actor_role: current_user.role || 'unknown',
                action: 'UPDATE_ATTENDANCE',
                resource: 'attendance',
                details: { target_ma_nv: ma_nv, dateStr, status, hours }
            });
        }

        return { success: true };
    }

    validateImageSnapshot(image_snapshot) {
        if (!image_snapshot || typeof image_snapshot !== 'string') {
            const error = new Error('Ảnh chụp chấm công không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        const match = image_snapshot.match(/^data:([^;]+);base64,(.+)$/);
        let mimeType = '';
        let base64Content = image_snapshot;

        if (match) {
            mimeType = match[1];
            base64Content = match[2];
            if (!mimeType.startsWith('image/')) {
                const error = new Error('Định dạng tệp không phải là ảnh hợp lệ!');
                error.statusCode = 400;
                throw error;
            }
        }

        let buffer;
        try {
            buffer = Buffer.from(base64Content, 'base64');
        } catch {
            const error = new Error('Chuỗi dữ liệu ảnh Base64 không hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        // Giới hạn dung lượng tối đa 2MB
        if (buffer.length > 2 * 1024 * 1024) {
            const error = new Error('Ảnh vượt quá dung lượng tối đa cho phép (2MB)!');
            error.statusCode = 400;
            throw error;
        }

        // Magic bytes check:
        // WebP: RIFF (bytes 0-3: 0x52, 0x49, 0x46, 0x46) & WEBP (bytes 8-11: 0x57, 0x45, 0x42, 0x50)
        const isWebP = buffer.length >= 12 &&
            buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
            buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

        // JPEG: 0xFF, 0xD8, 0xFF
        const isJPEG = buffer.length >= 3 &&
            buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

        // PNG: 0x89, 0x50, 0x4E, 0x47
        const isPNG = buffer.length >= 4 &&
            buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;

        if (!isWebP && !isJPEG && !isPNG) {
            const error = new Error('Ảnh chụp chấm công không hợp lệ: Thiếu chữ ký định dạng magic bytes hợp lệ!');
            error.statusCode = 400;
            throw error;
        }

        return true;
    }

    async generateDynamicQr(branchId = 1, current_user = null) {
        if (process.env.ALLOW_LEGACY_ADMIN_QR === 'false') {
            const error = new Error('Endpoint tạo QR cũ đã bị vô hiệu hóa! Vui lòng dùng Kiosk.');
            error.statusCode = 403;
            throw error;
        }

        const qrData = generateDynamicQrToken(branchId, 30);

        if (process.env.ALLOW_LEGACY_ADMIN_QR === 'preview') {
            return {
                is_preview: true,
                preview_only: true,
                warning: 'Chế độ xem trước: Mã QR này chỉ để kiểm tra hiển thị, không thể dùng chấm công.',
                token: qrData.token,
                qr_token: qrData.token,
                branchId: qrData.branchId,
                expiresAt: qrData.expiresAt.toISOString(),
                ttlSeconds: qrData.ttlSeconds
            };
        }

        const sql = `
            INSERT INTO dynamic_qr_sessions (session_token, branch_id, expires_at)
            VALUES (?, ?, ?)
        `;
        await query(sql, [qrData.token, qrData.branchId, qrData.expiresAt]);

        if (current_user) {
            await logAuditEvent({
                actor_id: current_user.username || current_user.ma_nv || 'system',
                actor_role: current_user.role || 'admin',
                action: 'GENERATE_DYNAMIC_QR',
                resource: 'attendance',
                details: { branchId: qrData.branchId, expiresAt: qrData.expiresAt }
            });
        }

        return {
            token: qrData.token,
            branchId: qrData.branchId,
            expiresAt: qrData.expiresAt.toISOString(),
            ttlSeconds: qrData.ttlSeconds
        };
    }

    async checkInMultiFactor({ token, lat, lng, zalo_location_token, image_snapshot, device_info, current_user = null, ip_address = '', currentTime = null, faultInjectionHook = null }) {
        if (!current_user || !current_user.ma_nv) {
            const error = new Error('Yêu cầu đăng nhập tài khoản nhân viên để chấm công!');
            error.statusCode = 401;
            throw error;
        }

        const ma_nv = current_user.ma_nv;

        // 1. Kiểm tra tài khoản có bị tạm khóa không & lấy thông tin ràng buộc thiết bị
        const empCheck = await query('SELECT is_locked, status, bound_device_id, device_binding_mode FROM employees WHERE ma_nv = ?', [ma_nv]);
        if (!empCheck || empCheck.length === 0) {
            const error = new Error('Mã nhân viên không tồn tại trong hệ thống!');
            error.statusCode = 404;
            throw error;
        }
        const emp = empCheck[0];
        if (emp.status === 'inactive' || emp.is_locked === 1 || emp.is_locked === true) {
            const error = new Error(`Tài khoản nhân viên ${ma_nv} đang bị TẠM KHÓA. Không thể thực hiện chấm công!`);
            error.statusCode = 403;
            throw error;
        }

        // 2. Kiểm tra ảnh chụp nếu có
        if (image_snapshot) {
            this.validateImageSnapshot(image_snapshot);
        }

        // 3. Kiểm tra ràng buộc thiết bị (Device Binding - chỉ áp dụng cho worker)
        let is_suspicious = false;
        let suspicious_reason = null;

        if (current_user.role === 'worker' && device_info) {
            const bindingMode = emp.device_binding_mode || 'recording';
            if (!emp.bound_device_id) {
                // Recording mode: Tự động ghi nhận thiết bị lần đầu
                await query('UPDATE employees SET bound_device_id = ? WHERE ma_nv = ?', [device_info, ma_nv]);
                emp.bound_device_id = device_info;
            } else if (emp.bound_device_id !== device_info) {
                if (bindingMode === 'enforced') {
                    const error = new Error('Thiết bị này chưa được liên kết với tài khoản! Vui lòng gửi yêu cầu đổi thiết bị tới quản trị viên.');
                    error.statusCode = 403;
                    throw error;
                } else {
                    is_suspicious = true;
                    suspicious_reason = `Phát hiện chấm công từ thiết bị lạ (${device_info}) khác với thiết bị đã đăng ký (${emp.bound_device_id})`;
                }
            }
        }

        // 4. Xác thực Mã QR Động
        if (!token) {
            const error = new Error('Thiếu mã QR xác thực chấm công!');
            error.statusCode = 400;
            throw error;
        }

        const verifyRes = verifyDynamicQrToken(token, 60);
        if (!verifyRes.valid) {
            const error = new Error(verifyRes.reason);
            error.statusCode = 400;
            throw error;
        }

        // 4.1 Kiểm tra Kiosk nếu token v2 có gắn kiosk_id
        if (verifyRes.kioskId) {
            const kioskRows = await query('SELECT is_active FROM kiosk_devices WHERE id = ? LIMIT 1', [verifyRes.kioskId]);
            if (kioskRows && kioskRows.length > 0 && !kioskRows[0].is_active) {
                const error = new Error('Thiết bị Kiosk này đã bị thu hồi quyền hoạt động!');
                error.statusCode = 403;
                throw error;
            }
        }

        // 4.2 Kiểm tra trong CSDL (chống replay attack và kiểm tra hết hạn)
        const sessions = await query('SELECT * FROM dynamic_qr_sessions WHERE session_token = ? LIMIT 1', [token]);
        if (!sessions || sessions.length === 0) {
            const error = new Error('Mã QR không hợp lệ hoặc không tồn tại trong hệ thống!');
            error.statusCode = 400;
            throw error;
        }

        const session = sessions[0];
        if (session.is_used === 1 || session.is_used === true) {
            const error = new Error('Mã vừa có người dùng, vui lòng quét mã mới! (Mã QR này đã được sử dụng)');
            error.statusCode = 400;
            throw error;
        }

        const now = new Date();
        const expiresAt = new Date(session.expires_at);
        if (now > expiresAt) {
            const error = new Error('Mã QR đã hết hạn! Vui lòng quét mã QR mới trên màn hình.');
            error.statusCode = 400;
            throw error;
        }

        // 5. Xác thực Vị trí & Chống Hạ Cấp
        let location_source = 'raw';
        let is_low_trust = 1;
        let finalLat = lat;
        let finalLng = lng;

        if (zalo_location_token) {
            const { verifyZaloLocationToken } = require('../utils/zaloAdapter');
            let locResult = null;
            try {
                locResult = await verifyZaloLocationToken(zalo_location_token);
            } catch {}

            if (locResult && locResult.verified) {
                finalLat = locResult.lat;
                finalLng = locResult.lng;
                location_source = 'token';
                is_low_trust = 0;
            } else {
                const error = new Error('Mã xác thực vị trí Zalo không hợp lệ hoặc đã hết hạn!');
                error.statusCode = 400;
                throw error;
            }
        } else {
            // Chấm công chỉ gửi tọa độ raw -> Kiểm tra chống hạ cấp
            const priorTokenLog = await query(
                'SELECT id FROM attendance_logs WHERE employee_id = ? AND location_source = "token" LIMIT 1',
                [ma_nv]
            );

            if (priorTokenLog && priorTokenLog.length > 0) {
                if (process.env.REJECT_DOWNGRADE_TO_RAW === 'true') {
                    const error = new Error('Phát hiện hạ cấp phương thức xác thực vị trí (ERR_METHOD_DOWNGRADE_DETECTED)! Tài khoản đã có lịch sử xác thực token không được gửi tọa độ thô.');
                    error.statusCode = 403;
                    error.code = 'ERR_METHOD_DOWNGRADE_DETECTED';
                    throw error;
                } else {
                    is_low_trust = 2; // Hạ cấp rủi ro cao
                }
            } else {
                is_low_trust = 1;
            }
        }

        // Chốt chặn P0 GPS: Bắt buộc tọa độ hợp lệ, không chấp nhận null/NaN
        if (finalLat === null || finalLat === undefined || finalLng === null || finalLng === undefined) {
            const error = new Error('Tọa độ GPS không hợp lệ: Vui lòng cung cấp tọa độ vị trí thực tế!');
            error.statusCode = 400;
            throw error;
        }

        const numLat = Number(finalLat);
        const numLng = Number(finalLng);
        if (isNaN(numLat) || isNaN(numLng) || numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
            const error = new Error('Tọa độ GPS ngoài phạm vi hợp lệ (Vĩ độ: [-90, 90], Kinh độ: [-180, 180])!');
            error.statusCode = 400;
            throw error;
        }

        // Xác thực Geofencing với công ty
        const companySettings = await query('SELECT latitude, longitude, radius_meters FROM company_settings LIMIT 1');
        const companyLat = companySettings && companySettings[0] && companySettings[0].latitude !== null ? Number(companySettings[0].latitude) : 16.0544;
        const companyLng = companySettings && companySettings[0] && companySettings[0].longitude !== null ? Number(companySettings[0].longitude) : 108.2022;
        const allowedRadius = companySettings && companySettings[0] && companySettings[0].radius_meters !== null ? Number(companySettings[0].radius_meters) : 100;

        const distanceMeters = calculateDistanceMeters(numLat, numLng, companyLat, companyLng);
        if (distanceMeters > allowedRadius) {
            const error = new Error(`Vị trí chấm công không hợp lệ: Bạn đang cách trụ sở công ty ${distanceMeters}m (Bán kính cho phép tối đa ${allowedRadius}m)!`);
            error.statusCode = 400;
            throw error;
        }

        // 6. Kiểm tra kỳ công có bị khóa sổ không
        const today = currentTime instanceof Date ? currentTime : new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        const isLocked = await this.isPeriodLocked(currentMonth, currentYear);
        if (isLocked) {
            const error = new Error(`Kỳ công Tháng ${currentMonth}/${currentYear} đã bị KHÓA SỔ. Không thể chấm công!`);
            error.statusCode = 400;
            throw error;
        }

        // 7. Thuật toán phát hiện bất thường / Chấm công hộ (Anomaly Detection)
        // LƯU Ý BẢO MẬT: Không cắm cờ theo địa chỉ IP (vì công nhân cùng mạng Wi-Fi NAT công ty)
        // CHỈ cắm cờ khi phát hiện chấm công trên CÙNG MỘT THIẾT BỊ (sameDevice)
        if (device_info) {
            const recentLogs = await query(`
                SELECT actor_id, ip_address, details, created_at 
                FROM audit_logs 
                WHERE action = 'CHECK_IN_DYNAMIC_QR' 
                  AND actor_id != ? 
                  AND created_at >= NOW() - INTERVAL 60 SECOND
                ORDER BY created_at DESC 
                LIMIT 5
            `, [ma_nv]);

            if (recentLogs && recentLogs.length > 0) {
                for (const log of recentLogs) {
                    let sameDevice = false;
                    try {
                        const parsedDetails = JSON.parse(log.details || '{}');
                        if (device_info && parsedDetails.device_fingerprint === device_info) {
                            sameDevice = true;
                        }
                    } catch {}

                    if (sameDevice) {
                        is_suspicious = true;
                        suspicious_reason = `Phát hiện chấm công liên tiếp trên cùng thiết bị với nhân viên ${log.actor_id} trong vòng 60 giây`;
                        break;
                    }
                }
            }
        }

        // 8 & 9. Giao dịch ACID nguyên khối (Atomic Transaction S9_02):
        // Tiêu thụ mã QR và ghi nhận chấm công trong cùng một Database Transaction.
        // Ngăn chặn hoàn toàn tình trạng: QR bị tiêu mà không có công, hoặc có công mà QR vẫn dùng tiếp được.
        const { getVietnamDateString, getVietnamTimeString } = require('../utils/timeHelper');
        const dateStr = getVietnamDateString(today);
        const timeStr = getVietnamTimeString(today);

        const insertLogSql = `
            INSERT INTO attendance_logs (
                employee_id, record_date, status, ot_hours, check_in_time, 
                check_in_lat, check_in_lng, check_in_method, check_in_image, 
                is_suspicious, suspicious_reason, device_fingerprint,
                location_source, is_low_trust
            ) VALUES (?, ?, '1', 0, ?, ?, ?, 'dynamic_qr', ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                status = '1',
                check_in_time = COALESCE(check_in_time, VALUES(check_in_time)),
                check_out_time = VALUES(check_in_time),
                check_in_lat = COALESCE(VALUES(check_in_lat), check_in_lat),
                check_in_lng = COALESCE(VALUES(check_in_lng), check_in_lng),
                check_in_image = COALESCE(VALUES(check_in_image), check_in_image),
                is_suspicious = CASE WHEN VALUES(is_suspicious) = 1 THEN 1 ELSE is_suspicious END,
                suspicious_reason = COALESCE(VALUES(suspicious_reason), suspicious_reason),
                device_fingerprint = COALESCE(VALUES(device_fingerprint), device_fingerprint),
                location_source = COALESCE(VALUES(location_source), location_source),
                is_low_trust = CASE WHEN VALUES(is_low_trust) > is_low_trust THEN VALUES(is_low_trust) ELSE is_low_trust END
        `;

        await withTransaction(async (txQuery) => {
            // Bước 8: Đánh dấu Token đã sử dụng (Atomic Single-Use update)
            const updateRes = await txQuery(
                'UPDATE dynamic_qr_sessions SET is_used = 1, used_by = ?, used_at = NOW() WHERE session_token = ? AND is_used = 0',
                [ma_nv, token]
            );
            if (!updateRes || updateRes.affectedRows === 0) {
                const error = new Error('Mã QR đã vừa được sử dụng bởi phiên khác! Vui lòng quét mã mới.');
                error.statusCode = 400;
                throw error;
            }

            // Hook kiểm thử chèn lỗi (Fault Injection hook chỉ được phép hoạt động trong môi trường test an toàn)
            if (faultInjectionHook && process.env.NODE_ENV === 'test') {
                await faultInjectionHook(txQuery);
            }

            // Bước 9: Ghi nhận nhật ký chấm công vào attendance_logs
            await txQuery(insertLogSql, [
                ma_nv,
                dateStr,
                timeStr,
                numLat,
                numLng,
                image_snapshot || null,
                is_suspicious ? 1 : 0,
                suspicious_reason || null,
                device_info || null,
                location_source,
                is_low_trust
            ]);
        });

        // 10. Ghi Audit Log
        await logAuditEvent({
            actor_id: ma_nv,
            actor_role: current_user.role,
            action: 'CHECK_IN_DYNAMIC_QR',
            resource: 'attendance',
            details: {
                date: dateStr,
                time: timeStr,
                distanceMeters,
                is_suspicious,
                suspicious_reason,
                device_fingerprint: device_info,
                location_source,
                is_low_trust
            },
            ip_address
        });

        return {
            success: true,
            message: is_suspicious 
                ? 'Chấm công thành công (Hệ thống ghi nhận dấu hiệu bất thường để quản trị đối soát).' 
                : 'Chấm công qua Mã QR Động thành công!',
            data: {
                employee_id: ma_nv,
                record_date: dateStr,
                check_in_time: timeStr,
                distanceMeters,
                is_suspicious,
                suspicious_reason,
                location_source,
                is_low_trust
            }
        };
    }

    async getSuspiciousLogs(limit = 100) {
        const sql = `
            SELECT a.id, a.employee_id, e.ho_ten, e.chuc_danh, 
                   DATE_FORMAT(a.record_date, '%d/%m/%Y') as record_date, 
                   a.check_in_time, a.check_out_time, a.check_in_lat, a.check_in_lng, 
                   a.check_in_method, a.is_suspicious, a.suspicious_reason, a.device_fingerprint,
                   a.location_source, a.is_low_trust
            FROM attendance_logs a
            LEFT JOIN employees e ON a.employee_id = e.ma_nv
            WHERE a.is_suspicious = 1
            ORDER BY a.record_date DESC, a.check_in_time DESC
            LIMIT ?
        `;
        const rows = await query(sql, [parseInt(limit, 10) || 100]);
        return rows || [];
    }

    async getAttendanceImageById(logId) {
        if (!logId) return null;
        const rows = await query('SELECT check_in_image FROM attendance_logs WHERE id = ? LIMIT 1', [logId]);
        return rows && rows.length > 0 ? rows[0].check_in_image : null;
    }
}

module.exports = new AttendanceService();

