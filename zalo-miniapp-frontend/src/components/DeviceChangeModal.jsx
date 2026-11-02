import React, { useState } from 'react';
import { Modal, Box, Text, Input, Button } from 'zmp-ui';
import { Smartphone, AlertTriangle } from 'lucide-react';

/**
 * DeviceChangeModal (G3 Security Hardening - Proposal 1)
 * Modal cho phép công nhân gửi yêu cầu đổi/cập nhật thiết bị mới lên Admin phê duyệt
 */
export default function DeviceChangeModal({ visible, onClose, token, newDeviceId, currentBoundDevice, onRequestSubmitted }) {
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async () => {
        if (!reason.trim()) {
            setError('Vui lòng nêu rõ lý do đổi thiết bị (ví dụ: Đổi điện thoại mới, máy cũ hỏng/mất)!');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/employees/request-device-change', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    new_device_id: newDeviceId,
                    reason: reason.trim()
                })
            });
            const data = await res.json();
            if (data.success) {
                setSuccess(true);
                if (onRequestSubmitted) onRequestSubmitted();
            } else {
                setError(data.message || 'Không thể gửi yêu cầu đổi thiết bị.');
            }
        } catch (err) {
            setError('Lỗi kết nối khi gửi yêu cầu đổi thiết bị.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            title=""
            maskClosable={!loading}
            onClose={onClose}
            actions={[]}
        >
            <Box className="p-4 text-center">
                <Box className="flex justify-center mb-3">
                    <div style={{
                        background: '#EFF6FF',
                        padding: '16px',
                        borderRadius: '50%',
                        display: 'inline-flex',
                        color: '#2563EB'
                    }}>
                        <Smartphone size={36} />
                    </div>
                </Box>

                <Text className="font-bold text-lg text-slate-800 mb-1">
                    Yêu Cầu Cập Nhật Thiết Bị
                </Text>

                {success ? (
                    <Box className="my-4 p-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm border border-emerald-200">
                        <p className="font-semibold mb-1">✓ Yêu cầu đã được gửi tới Ban Quản Trị!</p>
                        <p className="text-xs text-emerald-700">Vui lòng chờ Admin/Quản lý phê duyệt để kích hoạt chấm công trên điện thoại mới này.</p>
                        <Button
                            className="mt-3"
                            size="small"
                            onClick={onClose}
                            style={{ background: '#059669' }}
                        >
                            Đã Hiểu & Đóng
                        </Button>
                    </Box>
                ) : (
                    <>
                        <Text className="text-sm text-slate-500 mb-3">
                            Tài khoản của bạn đã được gắn kết với thiết bị trước đó ({currentBoundDevice || 'Thiết bị cũ'}).
                            Để chấm công trên thiết bị hiện tại, bạn cần gửi yêu cầu cho Admin phê duyệt.
                        </Text>

                        {error && (
                            <Box className="mb-3 p-2 bg-red-50 text-red-700 text-xs rounded border border-red-200 text-left">
                                {error}
                            </Box>
                        )}

                        <Box className="text-left space-y-3 mb-4">
                            <div>
                                <label className="text-xs font-semibold text-slate-600 block mb-1">Mã nhận diện thiết bị mới</label>
                                <input
                                    readOnly
                                    value={newDeviceId || 'Đang lấy thông tin...'}
                                    className="w-full p-2 bg-slate-100 text-slate-700 text-xs rounded border border-slate-300 font-mono"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-600 block mb-1">Lý do thay đổi thiết bị (*)</label>
                                <textarea
                                    rows={3}
                                    className="w-full p-2 text-sm border border-slate-300 rounded focus:outline-blue-500"
                                    placeholder="Nêu rõ lý do (ví dụ: Điện thoại cũ hỏng màn hình, vừa mua máy mới...)"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                />
                            </div>
                        </Box>

                        <Box className="flex gap-2">
                            <Button
                                fullWidth
                                variant="secondary"
                                onClick={onClose}
                                disabled={loading}
                            >
                                Hủy Bỏ
                            </Button>
                            <Button
                                fullWidth
                                loading={loading}
                                onClick={handleSubmit}
                                style={{ background: '#1E3A8A' }}
                            >
                                Gửi Yêu Cầu
                            </Button>
                        </Box>
                    </>
                )}
            </Box>
        </Modal>
    );
}
