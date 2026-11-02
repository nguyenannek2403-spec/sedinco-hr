import React, { useState } from 'react';
import { Box, Text, Button } from 'zmp-ui';
import { 
    Activity, ShieldAlert, CheckCircle2, XCircle, Play, 
    Smartphone, Key, MapPin, Camera, QrCode, RefreshCw 
} from 'lucide-react';
import { getAccessToken, getLocation, getDeviceIdAsync, scanQRCode, chooseImage } from 'zmp-sdk/apis';

/**
 * DiagnosticsView (G6 / G6.1)
 * Màn hình tự chẩn đoán SDK & Hệ thống (Staging Only - Admin Only)
 * Chạy từng bước riêng biệt, hiện nguyên văn kết quả và mã lỗi.
 * TUYỆT ĐỐI KHÔNG HIỂN THỊ SECRET HOẶC TOKEN ĐẦY ĐỦ.
 */
export default function DiagnosticsView() {
    const [stepResults, setStepResults] = useState({});
    const [loadingSteps, setLoadingSteps] = useState({});
    const [systemStatus, setSystemStatus] = useState(null);
    const [statusLoading, setStatusLoading] = useState(false);

    const fetchSystemStatus = async () => {
        setStatusLoading(true);
        try {
            const tokenAuth = localStorage.getItem('token') || sessionStorage.getItem('token') || localStorage.getItem('sedinco_token');
            const res = await fetch('/api/diagnostics/system-status', {
                headers: { 'Authorization': tokenAuth ? `Bearer ${tokenAuth}` : '' }
            });
            if (res.ok) {
                setSystemStatus(data);
            } else if (res.status === 404) {
                setSystemStatus({
                    db_status: 'VÔ HIỆU HÓA (404)',
                    git_commit: 'TẮT TRÊN SERVER',
                    environment: 'staging (ENABLE_DIAGNOSTICS=false)',
                    is_disabled: true
                });
            }
        } catch (e) {
            console.warn('Lỗi lấy thông tin hệ thống diagnostics:', e);
        } finally {
            setStatusLoading(false);
        }
    };

    React.useEffect(() => {
        fetchSystemStatus();
    }, []);

    const setStepState = (stepKey, status, data, error = null) => {
        setStepResults(prev => ({
            ...prev,
            [stepKey]: {
                status, // 'idle' | 'running' | 'success' | 'error'
                data,
                error,
                executedAt: new Date().toLocaleTimeString('vi-VN')
            }
        }));
    };

    const maskToken = (token) => {
        if (!token || typeof token !== 'string') return '';
        if (token.length <= 8) return '****';
        return `${token.substring(0, 4)}...${token.slice(-4)} (${token.length} chars)`;
    };

    // 1. Kiểm tra phiên bản SDK
    const runStep1_SdkVersion = async () => {
        try {
            const zmpVersion = window.ZMP_VERSION || 'zmp-sdk@2.x';
            const userAgent = navigator.userAgent;
            const isNativeZalo = /Zalo/i.test(userAgent);
            setStepState('sdk_version', 'success', {
                sdk: zmpVersion,
                userAgent: userAgent,
                platform: isNativeZalo ? 'Zalo Mini App Client Thật' : 'Web Browser / Simulator [CHẾ ĐỘ MOCK ĐÃ GẮN NHÃN]'
            });
        } catch (err) {
            setStepState('sdk_version', 'error', null, err.message);
        }
    };

    // 2. getAccessToken (che token)
    const runStep2_GetAccessToken = async () => {
        setLoadingSteps(prev => ({ ...prev, token: true }));
        try {
            let token = '';
            if (typeof getAccessToken === 'function') {
                token = await getAccessToken({});
            } else {
                throw new Error('Hàm getAccessToken không khả dụng trong môi trường hiện tại!');
            }

            setStepState('token', 'success', {
                maskedToken: maskToken(token),
                tokenLength: token ? token.length : 0,
                hasToken: Boolean(token)
            });
        } catch (err) {
            setStepState('token', 'error', null, {
                message: err.message,
                code: err.code || 'GET_ACCESS_TOKEN_FAILED'
            });
        } finally {
            setLoadingSteps(prev => ({ ...prev, token: false }));
        }
    };

    // 3. Server xác minh User ID với Zalo (hiện nguyên văn phản hồi)
    const runStep3_VerifyZaloUser = async () => {
        setLoadingSteps(prev => ({ ...prev, verify_user: true }));
        try {
            let token = '';
            if (typeof getAccessToken === 'function') {
                token = await getAccessToken({}).catch(() => 'mock_token_for_browser_test');
            }

            const tokenAuth = localStorage.getItem('token') || sessionStorage.getItem('token');
            const res = await fetch('/api/diagnostics/verify-zalo-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': tokenAuth ? `Bearer ${tokenAuth}` : ''
                },
                body: JSON.stringify({ access_token: token || 'mock_zalo_access_token' })
            });

            const data = await res.json();
            if (res.ok) {
                setStepState('verify_user', data.success ? 'success' : 'error', data);
            } else {
                setStepState('verify_user', 'error', data, data.error || `HTTP ${res.status}`);
            }
        } catch (err) {
            setStepState('verify_user', 'error', null, err.message);
        } finally {
            setLoadingSteps(prev => ({ ...prev, verify_user: false }));
        }
    };

    // 4. getLocation + giải mã (lat, lng, timestamp và mọi trường)
    const runStep4_GetLocation = async () => {
        setLoadingSteps(prev => ({ ...prev, location: true }));
        try {
            let locRes = null;
            if (typeof getLocation === 'function') {
                locRes = await getLocation({});
            } else {
                throw new Error('Hàm getLocation không khả dụng trong trình duyệt chuẩn!');
            }

            setStepState('location', 'success', {
                ...locRes,
                maskedToken: locRes && locRes.token ? maskToken(locRes.token) : 'NONE'
            });
        } catch (err) {
            setStepState('location', 'error', null, {
                message: err.message,
                code: err.code || 'GET_LOCATION_FAILED'
            });
        } finally {
            setLoadingSteps(prev => ({ ...prev, location: false }));
        }
    };

    // 5. getDeviceIdAsync
    const runStep5_GetDeviceId = async () => {
        setLoadingSteps(prev => ({ ...prev, device_id: true }));
        try {
            let devId = null;
            if (typeof getDeviceIdAsync === 'function') {
                devId = await getDeviceIdAsync();
            } else {
                throw new Error('Hàm getDeviceIdAsync không khả dụng trong môi trường hiện tại!');
            }

            setStepState('device_id', 'success', { device_id: devId });
        } catch (err) {
            setStepState('device_id', 'error', null, {
                message: err.message,
                code: err.code || 'GET_DEVICE_ID_FAILED'
            });
        } finally {
            setLoadingSteps(prev => ({ ...prev, device_id: false }));
        }
    };

    // 6. Chụp ảnh bằng camera
    const runStep6_Camera = async () => {
        setLoadingSteps(prev => ({ ...prev, camera: true }));
        try {
            if (typeof chooseImage === 'function') {
                const imgRes = await chooseImage({
                    sourceType: ['camera'],
                    cameraType: 'front',
                    count: 1
                });
                setStepState('camera', 'success', {
                    status: 'Chụp ảnh thành công',
                    filePaths: imgRes.filePaths ? imgRes.filePaths.length : 0
                });
            } else {
                throw new Error('Hàm chooseImage không khả dụng trong trình duyệt máy tính!');
            }
        } catch (err) {
            setStepState('camera', 'error', null, {
                message: err.message,
                code: err.code || 'CAMERA_ERROR'
            });
        } finally {
            setLoadingSteps(prev => ({ ...prev, camera: false }));
        }
    };

    // 7. Quét QR
    const runStep7_ScanQR = async () => {
        setLoadingSteps(prev => ({ ...prev, qr: true }));
        try {
            if (typeof scanQRCode === 'function') {
                const qrRes = await scanQRCode({});
                setStepState('qr', 'success', {
                    content: qrRes.content ? `${qrRes.content.substring(0, 15)}...` : 'EMPTY'
                });
            } else {
                throw new Error('Hàm scanQRCode không khả dụng trong trình duyệt máy tính!');
            }
        } catch (err) {
            setStepState('qr', 'error', null, {
                message: err.message,
                code: err.code || 'SCAN_QR_ERROR'
            });
        } finally {
            setLoadingSteps(prev => ({ ...prev, qr: false }));
        }
    };

    const renderResultBox = (key) => {
        const item = stepResults[key];
        if (!item) return <div style={{ color: '#888', fontSize: '12px' }}>Chưa chạy thử nghiệm</div>;

        const isSuccess = item.status === 'success';
        return (
            <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: isSuccess ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${isSuccess ? '#bbf7d0' : '#fecaca'}`,
                fontFamily: 'monospace',
                fontSize: '12px',
                color: isSuccess ? '#166534' : '#991b1b',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
            }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {isSuccess ? '✅ KẾT QUẢ THÀNH CÔNG' : '❌ LỖI PHÁT SINH'} ({item.executedAt}):
                </div>
                {item.error ? (
                    <div>{typeof item.error === 'object' ? JSON.stringify(item.error, null, 2) : item.error}</div>
                ) : (
                    <div>{JSON.stringify(item.data, null, 2)}</div>
                )}
            </div>
        );
    };

    return (
        <div style={{ padding: '16px', maxWidth: '800px', margin: '0 auto', backgroundColor: '#fff', minHeight: '100vh' }}>
            <div style={{ borderBottom: '2px solid #2563eb', paddingBottom: '12px', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <Activity size={22} color="#2563eb" /> Màn Hình Tự Chẩn Đoán SDK & Hạ Tầng (/diagnostics)
                </h2>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
                    Chỉ chạy ở môi trường staging (Admin Only). Người thử chỉ cần bấm chạy từng mục và chụp lại màn hình này làm bằng chứng.
                </p>

                {/* THÔNG TIN HẠ TẦNG DB & GIT COMMIT */}
                <div style={{ 
                    marginTop: '12px', 
                    padding: '10px 14px', 
                    borderRadius: '6px', 
                    backgroundColor: '#f8fafc', 
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '8px'
                }}>
                    <div>
                        <span style={{ color: '#64748b' }}>CSDL MySQL: </span>
                        <strong>{systemStatus?.db_status === 'CONNECTED' ? '🟢 CONNECTED' : (systemStatus?.db_status || 'Đang kết nối...')}</strong>
                    </div>
                    <div>
                        <span style={{ color: '#64748b' }}>Git Commit: </span>
                        <code style={{ backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>{systemStatus?.git_commit || 'Đang lấy...'}</code>
                    </div>
                    <div>
                        <span style={{ color: '#64748b' }}>Môi trường: </span>
                        <span style={{ textTransform: 'uppercase', fontWeight: '600' }}>{systemStatus?.environment || 'staging'}</span>
                    </div>
                    <div>
                        <span style={{ color: '#64748b' }}>SDK Chế độ: </span>
                        <span>{/Zalo/i.test(navigator.userAgent) ? '📱 Zalo Mini App' : '🖥️ Web [MOCK ĐÃ GẮN NHÃN]'}</span>
                    </div>
                </div>
            </div>

            {/* Bước 1 */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>1. Kiểm tra phiên bản SDK & Platform</span>
                    <button onClick={runStep1_SdkVersion} style={{ padding: '6px 12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                        Chạy bước 1
                    </button>
                </div>
                {renderResultBox('sdk_version')}
            </div>

            {/* Bước 2 */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>2. getAccessToken (che token)</span>
                    <button onClick={runStep2_GetAccessToken} disabled={loadingSteps.token} style={{ padding: '6px 12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                        {loadingSteps.token ? 'Đang gọi...' : 'Chạy bước 2'}
                    </button>
                </div>
                {renderResultBox('token')}
            </div>

            {/* Bước 3 */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>3. Server xác minh User ID với Zalo (Hiện nguyên văn phản hồi)</span>
                    <button onClick={runStep3_VerifyZaloUser} disabled={loadingSteps.verify_user} style={{ padding: '6px 12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                        {loadingSteps.verify_user ? 'Đang gọi...' : 'Chạy bước 3'}
                    </button>
                </div>
                {renderResultBox('verify_user')}
            </div>

            {/* Bước 4 */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>4. getLocation + Giải mã vị trí</span>
                    <button onClick={runStep4_GetLocation} disabled={loadingSteps.location} style={{ padding: '6px 12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                        {loadingSteps.location ? 'Đang gọi...' : 'Chạy bước 4'}
                    </button>
                </div>
                {renderResultBox('location')}
            </div>

            {/* Bước 5 */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>5. getDeviceIdAsync (Định danh thiết bị Zalo)</span>
                    <button onClick={runStep5_GetDeviceId} disabled={loadingSteps.device_id} style={{ padding: '6px 12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                        {loadingSteps.device_id ? 'Đang gọi...' : 'Chạy bước 5'}
                    </button>
                </div>
                {renderResultBox('device_id')}
            </div>

            {/* Bước 6 */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>6. Chụp ảnh thời gian thực (Camera)</span>
                    <button onClick={runStep6_Camera} disabled={loadingSteps.camera} style={{ padding: '6px 12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                        {loadingSteps.camera ? 'Đang chụp...' : 'Chạy bước 6'}
                    </button>
                </div>
                {renderResultBox('camera')}
            </div>

            {/* Bước 7 */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>7. Quét mã QR Kiosk</span>
                    <button onClick={runStep7_ScanQR} disabled={loadingSteps.qr} style={{ padding: '6px 12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                        {loadingSteps.qr ? 'Đang quét...' : 'Chạy bước 7'}
                    </button>
                </div>
                {renderResultBox('qr')}
            </div>
        </div>
    );
}
