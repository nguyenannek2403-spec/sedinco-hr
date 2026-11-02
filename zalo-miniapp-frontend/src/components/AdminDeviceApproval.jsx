import React, { useState, useEffect } from 'react';
import { Box, Text, Button } from 'zmp-ui';
import { Smartphone, Check, X, ShieldCheck, RefreshCw } from 'lucide-react';

/**
 * AdminDeviceApproval (G3 Security Hardening - Proposal 1)
 * Màn hình Admin quản lý và phê duyệt các yêu cầu đổi thiết bị của công nhân
 */
export default function AdminDeviceApproval({ token }) {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);
    const [message, setMessage] = useState('');

    const fetchPendingRequests = async () => {
        setLoading(true);
        setMessage('');
        try {
            const res = await fetch('/api/employees?has_pending_device=1', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                // Lọc nhân viên có pending_device_id
                const pending = (data.data || []).filter(e => Boolean(e.pending_device_id));
                setRequests(pending);
            }
        } catch (err) {
            setMessage('Lỗi khi tải danh sách yêu cầu đổi thiết bị.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) fetchPendingRequests();
    }, [token]);

    const handleApprove = async (ma_nv) => {
        setActionLoading(ma_nv);
        setMessage('');
        try {
            const res = await fetch(`/api/employees/${ma_nv}/approve-device`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            if (data.success) {
                setMessage(`✓ Đã phê duyệt cập nhật thiết bị cho nhân viên ${ma_nv}!`);
                fetchPendingRequests();
            } else {
                setMessage(`✕ ${data.message || 'Lỗi khi phê duyệt thiết bị.'}`);
            }
        } catch (err) {
            setMessage('Lỗi kết nối khi gửi lệnh phê duyệt.');
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <Box className="p-4 bg-white rounded-xl shadow-sm border border-slate-200">
            <Box className="flex justify-between items-center mb-4">
                <Box className="flex items-center gap-2">
                    <ShieldCheck className="text-blue-600" size={24} />
                    <div>
                        <h3 className="font-bold text-slate-800 text-base">Phê Duyệt Đổi Thiết Bị Chấm Công</h3>
                        <p className="text-xs text-slate-500">Chỉ Admin mới có thẩm quyền phê duyệt thay đổi thiết bị (SoD)</p>
                    </div>
                </Box>
                <Button
                    size="small"
                    variant="secondary"
                    loading={loading}
                    onClick={fetchPendingRequests}
                >
                    <RefreshCw size={14} className="mr-1" /> Làm mới
                </Button>
            </Box>

            {message && (
                <div className={`p-3 rounded-lg text-xs mb-3 font-medium ${
                    message.startsWith('✓') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                    {message}
                </div>
            )}

            {requests.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">
                    Hiện không có yêu cầu đổi thiết bị nào đang chờ duyệt.
                </div>
            ) : (
                <div className="space-y-3">
                    {requests.map((req) => (
                        <div key={req.ma_nv} className="p-3 border border-slate-200 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-800">{req.ho_ten}</span>
                                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono font-semibold">{req.ma_nv}</span>
                                    <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">Chờ duyệt</span>
                                </div>
                                <div className="text-xs text-slate-600 mt-1">
                                    <p><strong>Thiết bị cũ:</strong> {req.bound_device_id || 'Chưa gắn kết'}</p>
                                    <p><strong>Thiết bị mới:</strong> <span className="font-mono text-blue-700">{req.pending_device_id}</span></p>
                                    <p><strong>Lý do:</strong> <em>"{req.device_change_reason || 'Không ghi rõ'}"</em></p>
                                </div>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <Button
                                    size="small"
                                    loading={actionLoading === req.ma_nv}
                                    onClick={() => handleApprove(req.ma_nv)}
                                    style={{ background: '#059669' }}
                                >
                                    <Check size={14} className="mr-1" /> Phê Duyệt
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Box>
    );
}
