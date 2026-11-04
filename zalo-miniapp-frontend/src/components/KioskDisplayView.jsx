import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, Button } from 'zmp-ui';
import { QrCode, RefreshCw, Monitor, ShieldCheck, Clock, Wifi, ShieldAlert } from 'lucide-react';

/**
 * KioskDisplayView (G3 Security Hardening - Proposal 2 Kiosk Isolation)
 * Màn hình Kiosk chuyên dụng gắn tại cổng/nhà xưởng hiển thị Dynamic QR độc lập
 * Xác thực bằng header 'x-kiosk-key', tự động refresh mã mỗi 30 giây
 */
export default function KioskDisplayView({ kioskKey = '' }) {
    const [apiKey, setApiKey] = useState(kioskKey || localStorage.getItem('sedinco_kiosk_key') || '');
    const [qrData, setQrData] = useState(null);
    const [countdown, setCountdown] = useState(30);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const timerRef = useRef(null);

    const fetchKioskQr = async (keyToUse) => {
        const key = keyToUse || apiKey;
        if (!key) return;

        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/kiosk/qr', {
                headers: {
                    'x-kiosk-key': key.trim()
                }
            });
            if (res.status === 429) {
                setError('Giới hạn tần suất Kiosk (429 Too Many Requests). Đang tạm dừng và tự khôi phục sau 5 giây...');
                setIsReconnecting(true);
                setTimeout(() => fetchKioskQr(key), 5000);
                return;
            }
            const data = await res.json();
            if (data.success && data.data) {
                setQrData(data.data);
                setCountdown(30);
                setIsReconnecting(false);
                setError('');
            } else {
                setError(data.message || 'Không thể lấy mã QR Kiosk.');
            }
        } catch (err) {
            setError('Lỗi kết nối mạng tới máy chủ Kiosk. Đang tự động kết nối lại sau 3 giây...');
            setIsReconnecting(true);
            setTimeout(() => fetchKioskQr(key), 3000);
        } finally {
            setLoading(false);
        }
    };

    // Tự động tải mã QR khi đã có apiKey (từ props hoặc localStorage)
    useEffect(() => {
        if (apiKey && !qrData) {
            fetchKioskQr(apiKey);
        }
    }, [apiKey]);

    // Countdown 30s
    useEffect(() => {
        if (!qrData) return;

        timerRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    fetchKioskQr();
                    return 30;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [qrData, apiKey]);

    // Phương án A: Polling trạng thái mã QR hiện tại mỗi 2.5 giây.
    // Ngay khi có công nhân quét xong (is_used = true), Kiosk tự động đổi mã mới.
    useEffect(() => {
        if (!qrData || !qrData.token || !apiKey) return;

        const pollTimer = setInterval(async () => {
            try {
                const res = await fetch(`/api/kiosk/qr-status?token=${encodeURIComponent(qrData.token)}`, {
                    headers: { 'x-kiosk-key': apiKey.trim() }
                });
                if (!res.ok) {
                    setIsReconnecting(true);
                    return;
                }
                const json = await res.json();
                setIsReconnecting(false);
                if (json && json.success && json.data && json.data.is_used) {
                    // Mã đã được dùng -> Đổi mã QR mới ngay lập tức
                    fetchKioskQr();
                }
            } catch (err) {
                // Xử lý lỗi polling / rớt mạng: Hiển thị trạng thái đang thử kết nối lại, giữ nguyên màn hình, không treo
                setIsReconnecting(true);
            }
        }, 2500);

        return () => clearInterval(pollTimer);
    }, [qrData, apiKey]);

    const handleSaveKey = (e) => {
        e.preventDefault();
        if (apiKey.trim()) {
            localStorage.setItem('sedinco_kiosk_key', apiKey.trim());
            fetchKioskQr(apiKey.trim());
        }
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
            setIsFullscreen(true);
        } else {
            document.exitFullscreen().catch(() => {});
            setIsFullscreen(false);
        }
    };

    if (!qrData && !loading) {
        return (
            <div className="max-w-md mx-auto p-6 bg-white rounded-2xl shadow-lg border border-slate-200 mt-10">
                <div className="text-center mb-6">
                    <div className="inline-flex p-4 bg-blue-50 text-blue-600 rounded-full mb-3">
                        <Monitor size={40} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">Cấu Hình Kiosk Chấm Công</h2>
                    <p className="text-xs text-slate-500 mt-1">Nhập Kiosk API Key được Admin cấp (định dạng: ksk_*)</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSaveKey} className="space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Kiosk API Key (*)</label>
                        <input
                            type="text"
                            className="w-full p-3 border border-slate-300 rounded-lg font-mono text-sm focus:outline-blue-600"
                            placeholder="ksk_xxxxxxxxxxxx"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            required
                        />
                    </div>
                    <Button fullWidth style={{ background: '#1E3A8A' }}>
                        Kích Hoạt Kiosk & Hiển Thị QR
                    </Button>
                </form>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[500px] p-6 bg-slate-900 text-white rounded-2xl shadow-2xl relative">
            {/* Header thông tin Kiosk */}
            <div className="w-full flex justify-between items-center mb-6 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                    <div className={`h-3 w-3 ${isReconnecting ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-ping'} rounded-full`} />
                    <span className={`text-xs font-semibold ${isReconnecting ? 'text-amber-400' : 'text-emerald-400'} uppercase tracking-wider`}>
                        {isReconnecting ? 'Đang thử kết nối lại...' : (qrData?.kiosk_name || 'Kiosk Trực Tuyến')}
                    </span>
                    <span className="text-xs text-slate-400">| {qrData?.kiosk_code}</span>
                    {isReconnecting && (
                        <span className="text-[10px] bg-amber-950/80 text-amber-300 px-2 py-0.5 rounded border border-amber-600/50">
                            Mất mạng (Kiosk tự kết nối lại)
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleFullscreen}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded transition"
                    >
                        {isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                    </button>
                    <button
                        onClick={() => { setQrData(null); localStorage.removeItem('sedinco_kiosk_key'); }}
                        className="text-xs text-slate-500 hover:text-slate-300"
                    >
                        Đổi Key
                    </button>
                </div>
            </div>

            {error && (
                <div className="w-full mb-4 p-3 bg-rose-950/90 text-rose-300 text-xs rounded-xl border border-rose-600/60 flex items-center gap-2 shadow-lg animate-pulse">
                    <ShieldAlert size={18} className="shrink-0 text-rose-400" />
                    <span>{error}</span>
                </div>
            )}

            {/* Khung QR Code */}
            <div className="bg-white p-6 rounded-3xl shadow-xl flex flex-col items-center">
                {(qrData?.qr_data || qrData?.token) ? (
                    <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrData.qr_data || qrData.token)}`}
                        alt="Dynamic QR Kiosk"
                        className="w-64 h-64 object-contain"
                    />
                ) : (
                    <div className="w-64 h-64 flex items-center justify-center text-slate-400">
                        <RefreshCw className="animate-spin" size={40} />
                    </div>
                )}

                <div className="mt-4 flex items-center gap-2 text-slate-700 font-mono text-xs">
                    <ShieldCheck size={16} className="text-emerald-600" />
                    <span>Mã tự hủy sau: <strong className="text-blue-600 text-sm">{countdown}s</strong></span>
                </div>
            </div>

            {/* Hướng dẫn công nhân */}
            <div className="mt-6 text-center max-w-sm">
                <h4 className="font-bold text-base text-slate-200">QUÉT MÃ ĐIỂM DANH</h4>
                <p className="text-xs text-slate-400 mt-1">
                    Mở Zalo Mini App "Sedinco HR" trên điện thoại của bạn, chọn tab "Điểm danh" và hướng camera vào mã QR trên.
                </p>
            </div>
        </div>
    );
}
