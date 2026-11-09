#!/usr/bin/env node

/**
 * tools/smoke_staging.js
 * 
 * Script kiểm thử Smoke Test tự động trên Stack Staging đã Deploy (Mục E.1).
 * Tuân thủ quy tắc G9/G10:
 * - TUYỆT ĐỐI KHÔNG IN MẬT KHẨU, TOKEN, HOẶC SECRET RA TERMINAL.
 * - Nêu rõ bước nào sử dụng Mock Zalo SDK.
 * 
 * Cách dùng:
 *   node tools/smoke_staging.js --api https://sedinco-backend-staging.onrender.com \
 *                              --origin https://sedinco.pages.dev \
 *                              --admin-user admin \
 *                              --admin-pass <mat_khau_admin> \
 *                              [--kiosk-key <kiosk_key>]
 */

const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
        return args[idx + 1];
    }
    return defaultValue;
}

const apiUrl = (getArg('--api', '')).replace(/\/+$/, '');
const originUrl = (getArg('--origin', '')).replace(/\/+$/, '');
const adminUser = getArg('--admin-user', 'admin');
const adminPass = getArg('--admin-pass', '');
const kioskKey = getArg('--kiosk-key', 'sedinco_kiosk_secret_2026');

if (!apiUrl || !originUrl || !adminPass) {
    console.error('❌ Thiếu tham số bắt buộc!');
    console.error('👉 Sử dụng: node tools/smoke_staging.js --api <render_url> --origin <cloudflare_url> --admin-user <user> --admin-pass <pass>');
    process.exit(1);
}

const steps = [];
function recordStep(id, name, status, details = '') {
    steps.push({ id, name, status, details });
    const icon = status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} [${id}] ${name}${details ? ` -> ${details}` : ''}`);
}

async function runSmokeTest() {
    console.log(`======================================================================`);
    console.log(`🚀 BẮT ĐẦU SMOKE TEST STAGING TỰ ĐỘNG (MỤC E.1)`);
    console.log(`API Target:    ${apiUrl}`);
    console.log(`Client Origin: ${originUrl}`);
    console.log(`Node Version:  ${process.version}`);
    console.log(`Commit:        ${require('child_process').execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()}`);
    console.log(`======================================================================\n`);

    let adminToken = '';
    let testWorkerMaNv = `SIM_SMOKE_${Date.now().toString().slice(-4)}`;
    let testWorkerPass = 'SmokeTest@123456';
    let newWorkerPass = 'SmokeNew@654321';
    let workerToken = '';

    try {
        // BƯỚC 1: Healthcheck & Kết nối TLS CSDL Aiven
        const healthRes = await fetch(`${apiUrl}/api/health`);
        if (healthRes.ok) {
            const hData = await healthRes.json();
            recordStep('STEP-01', 'Healthcheck Backend & Metrics', 'PASS', `Uptime: ${hData.uptime}s`);
        } else {
            recordStep('STEP-01', 'Healthcheck Backend & Metrics', 'FAIL', `HTTP ${healthRes.status}`);
        }

        // BƯỚC 2: Kiểm tra CORS Preflight từ Origin Cloudflare
        const corsRes = await fetch(`${apiUrl}/api/health`, {
            method: 'OPTIONS',
            headers: {
                'Origin': originUrl,
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type, Authorization, x-kiosk-key, X-Request-Id'
            }
        });
        const allowOrigin = corsRes.headers.get('access-control-allow-origin');
        if (corsRes.status === 204 || corsRes.status === 200) {
            if (allowOrigin === originUrl || allowOrigin === '*') {
                recordStep('STEP-02', 'CORS Preflight từ Cloudflare Origin', 'PASS', `Allow-Origin: ${allowOrigin}`);
            } else {
                recordStep('STEP-02', 'CORS Preflight từ Cloudflare Origin', 'FAIL', `Header Allow-Origin không khớp: ${allowOrigin}`);
            }
        } else {
            recordStep('STEP-02', 'CORS Preflight từ Cloudflare Origin', 'FAIL', `HTTP ${corsRes.status}`);
        }

        // BƯỚC 3: Đăng nhập Quản trị viên (Admin)
        const loginRes = await fetch(`${apiUrl}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Origin': originUrl },
            body: JSON.stringify({ username: adminUser, password: adminPass })
        });
        const loginData = await loginRes.json();
        if (loginRes.ok && loginData.success && loginData.token) {
            adminToken = loginData.token;
            recordStep('STEP-03', 'Đăng nhập Quản trị viên (Admin)', 'PASS', `Role: ${loginData.user?.role || 'admin'}`);
        } else {
            recordStep('STEP-03', 'Đăng nhập Quản trị viên (Admin)', 'FAIL', loginData.message || `HTTP ${loginRes.status}`);
            throw new Error('Dừng smoke test vì không có token admin!');
        }

        // BƯỚC 4: Tạo nhân viên kiểm thử mới
        const createEmpRes = await fetch(`${apiUrl}/api/employees`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`,
                'Origin': originUrl
            },
            body: JSON.stringify({
                ma_nv: testWorkerMaNv,
                ho_ten: `Công nhân Smoke ${testWorkerMaNv}`,
                role: 'worker',
                password: testWorkerPass,
                chuc_danh: 'Công nhân may',
                must_change_password: true
            })
        });
        const createData = await createEmpRes.json();
        if (createEmpRes.ok && createData.success) {
            recordStep('STEP-04', 'Tạo Nhân Viên Kiểm Thử Mới', 'PASS', `Mã NV: ${testWorkerMaNv}`);
        } else {
            recordStep('STEP-04', 'Tạo Nhân Viên Kiểm Thử Mới', 'FAIL', createData.message);
        }

        // BƯỚC 5: Công nhân đăng nhập và đổi mật khẩu lần đầu
        const wLoginRes = await fetch(`${apiUrl}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Origin': originUrl },
            body: JSON.stringify({ username: testWorkerMaNv, password: testWorkerPass })
        });
        const wLoginData = await wLoginRes.json();
        if (wLoginRes.ok && wLoginData.success) {
            workerToken = wLoginData.token;
            const mustChange = wLoginData.user?.must_change_password;
            if (mustChange) {
                // Đổi mật khẩu
                const chgRes = await fetch(`${apiUrl}/api/change-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
                    body: JSON.stringify({ ma_nv: testWorkerMaNv, old_password: testWorkerPass, new_password: newWorkerPass })
                });
                const chgData = await chgRes.json();
                if (chgRes.ok && chgData.success) {
                    recordStep('STEP-05', 'Công Nhân Đăng Nhập & Bắt Buộc Đổi Mật Khẩu', 'PASS', 'Đã đổi sang mật khẩu mới an toàn');
                } else {
                    recordStep('STEP-05', 'Công Nhân Đăng Nhập & Bắt Buộc Đổi Mật Khẩu', 'FAIL', chgData.message);
                }
            } else {
                recordStep('STEP-05', 'Công Nhân Đăng Nhập & Bắt Buộc Đổi Mật Khẩu', 'FAIL', 'Không thấy cờ must_change_password');
            }
        } else {
            recordStep('STEP-05', 'Công Nhân Đăng Nhập & Bắt Buộc Đổi Mật Khẩu', 'FAIL', wLoginData.message);
        }

        // BƯỚC 6: Kiosk lấy mã QR độc lập
        let kioskToken = '';
        const kioskRes = await fetch(`${apiUrl}/api/kiosk/qr`, {
            headers: { 'x-kiosk-key': kioskKey, 'Origin': originUrl }
        });
        const kioskData = await kioskRes.json();
        if (kioskRes.ok && kioskData.success && kioskData.data?.token) {
            kioskToken = kioskData.data.token;
            recordStep('STEP-06', 'Kiosk Hardware Lấy Mã QR Độc Lập', 'PASS', `Token: ${kioskToken.substring(0, 8)}... (TTL: 30s)`);
        } else {
            recordStep('STEP-06', 'Kiosk Hardware Lấy Mã QR Độc Lập', 'FAIL', kioskData.message || `HTTP ${kioskRes.status}`);
        }

        // BƯỚC 7: Chấm công (CHÚ THÍCH: Bước này dùng Mock Tọa độ GPS nội bộ nếu chạy script CLI)
        if (kioskToken) {
            // Lấy tọa độ công ty để chấm công hợp lệ
            let cLat = 16.0544;
            let cLng = 108.2022;
            try {
                const compRes = await fetch(`${apiUrl}/api/company`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
                const compData = await compRes.json();
                if (compData.data?.latitude && compData.data?.longitude) {
                    cLat = Number(compData.data.latitude);
                    cLng = Number(compData.data.longitude);
                }
            } catch (e) {}

            const attRes = await fetch(`${apiUrl}/api/attendance/check-in`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${workerToken}`,
                    'Origin': originUrl
                },
                body: JSON.stringify({
                    token: kioskToken,
                    lat: cLat,
                    lng: cLng,
                    device_id: 'SMOKE_DEVICE_001',
                    client_source: 'CLI_SMOKE_MOCK_ZALO'
                })
            });
            const attData = await attRes.json();
            if (attRes.ok && attData.success) {
                recordStep('STEP-07', 'Chấm Công Qua Mã QR Kiosk [DÙNG MOCK TỌA ĐỘ GPS]', 'PASS', 'Ghi nhận công thành công');
            } else {
                recordStep('STEP-07', 'Chấm Công Qua Mã QR Kiosk [DÙNG MOCK TỌA ĐỘ GPS]', 'FAIL', attData.message);
            }
        }

        // BƯỚC 8: Nộp đơn xin nghỉ phép
        let createdRequestId = null;
        const leaveRes = await fetch(`${apiUrl}/api/requests`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${workerToken}`,
                'Origin': originUrl
            },
            body: JSON.stringify({
                request_type: 'Nghỉ phép',
                request_date: new Date().toISOString().slice(0, 10),
                reason: 'Khảo sát staging tự động'
            })
        });
        const leaveData = await leaveRes.json();
        if (leaveRes.ok && leaveData.success) {
            createdRequestId = leaveData.data?.id || leaveData.id;
            recordStep('STEP-08', 'Công Nhân Nộp Đơn Xin Nghỉ Phép', 'PASS', `Request ID: ${createdRequestId}`);
        } else {
            recordStep('STEP-08', 'Công Nhân Nộp Đơn Xin Nghỉ Phép', 'FAIL', leaveData.message);
        }

        // BƯỚC 9: Quản trị viên duyệt đơn
        if (createdRequestId) {
            const approveRes = await fetch(`${apiUrl}/api/requests/${createdRequestId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`,
                    'Origin': originUrl
                },
                body: JSON.stringify({ status: 'approved' })
            });
            const approveData = await approveRes.json();
            if (approveRes.ok && approveData.success) {
                recordStep('STEP-09', 'Quản Trị Viên Phê Duyệt Đơn', 'PASS', 'Trạng thái chuyển sang approved');
            } else {
                recordStep('STEP-09', 'Quản Trị Viên Phê Duyệt Đơn', 'FAIL', approveData.message);
            }
        }

        // BƯỚC 10: Xem Ma Trận Chấm Công & Bảng Lương
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const matrixRes = await fetch(`${apiUrl}/api/attendance/matrix?month=${month}&year=${year}`, {
            headers: { 'Authorization': `Bearer ${adminToken}`, 'Origin': originUrl }
        });
        if (matrixRes.ok) {
            recordStep('STEP-10', 'Truy Xuất Ma Trận Chấm Công', 'PASS', `Tháng ${month}/${year}`);
        } else {
            recordStep('STEP-10', 'Truy Xuất Ma Trận Chấm Công', 'FAIL', `HTTP ${matrixRes.status}`);
        }

        // BƯỚC 11: Tính toán Bảng Lương
        const payrollRes = await fetch(`${apiUrl}/api/payroll?month=${month}&year=${year}`, {
            headers: { 'Authorization': `Bearer ${adminToken}`, 'Origin': originUrl }
        });
        if (payrollRes.ok) {
            recordStep('STEP-11', 'Truy Xuất & Tính Bảng Lương Doanh Nghiệp', 'PASS', `Tháng ${month}/${year}`);
        } else {
            recordStep('STEP-11', 'Truy Xuất & Tính Bảng Lương Doanh Nghiệp', 'FAIL', `HTTP ${payrollRes.status}`);
        }

        // BƯỚC 12: Khóa tài khoản nhân viên kiểm thử & Thu hồi quyền tức thì
        const lockRes = await fetch(`${apiUrl}/api/employees/${testWorkerMaNv}/lock`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'Origin': originUrl },
            body: JSON.stringify({ is_locked: 1, reason: 'Smoke test hoàn tất' })
        });
        if (lockRes.ok) {
            recordStep('STEP-12', 'Khóa Tài Khoản Nhân Viên Kiểm Thử', 'PASS', `Tài khoản ${testWorkerMaNv} đã bị khóa`);

            // Thử gọi lại API bằng token cũ -> Phải bị từ chối 403
            const tryOldToken = await fetch(`${apiUrl}/api/requests`, {
                headers: { 'Authorization': `Bearer ${workerToken}`, 'Origin': originUrl }
            });
            if (tryOldToken.status === 403) {
                recordStep('STEP-13', 'Thu Hồi Quyền Tức Thì (Token Bị Chặn 403)', 'PASS', 'Zero-delay cache invalidation');
            } else {
                recordStep('STEP-13', 'Thu Hồi Quyền Tức Thì (Token Bị Chặn 403)', 'FAIL', `HTTP ${tryOldToken.status}`);
            }
        } else {
            recordStep('STEP-12', 'Khóa Tài Khoản Nhân Viên Kiểm Thử', 'FAIL', `HTTP ${lockRes.status}`);
        }

    } catch (err) {
        console.error(`\n❌ LỖI TRONG QUÁ TRÌNH THỰC THI SMOKE TEST: ${err.message}`);
    }

    console.log(`\n======================================================================`);
    console.log(`📋 TỔNG KẾT SMOKE TEST STAGING:`);
    const passed = steps.filter(s => s.status === 'PASS').length;
    const failed = steps.filter(s => s.status === 'FAIL').length;
    console.log(`   - Tổng số bước: ${steps.length}`);
    console.log(`   - Đạt (PASS):    ${passed}`);
    console.log(`   - Lỗi (FAIL):    ${failed}`);
    console.log(`======================================================================\n`);

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runSmokeTest();
