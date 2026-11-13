import React, { useState, useRef } from 'react';
import { Modal, Box, Text, Input, Button } from 'zmp-ui';
import { ShieldAlert, X } from 'lucide-react';
import { safePost } from '../utils/api';

/**
 * ForcePasswordChangeModal (G3 Security Hardening)
 * Bắt buộc nhân viên đổi mật khẩu khi đăng nhập lần đầu với mật khẩu mặc định (must_change_password = true)
 */
export default function ForcePasswordChangeModal({
    visible,
    maNv,
    token,
    canClose = false,
    onClose,
    showToast,
    onPasswordChanged
}) {
    const [oldPassword, setOldPassword] = useState('123456');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const submitInFlightRef = useRef(false);

    const handleSafeClose = () => {
        if (!canClose || submitInFlightRef.current) return;
        setError('');
        setNewPassword('');
        setConfirmPassword('');
        if (onClose) onClose();
    };

    const handleSubmit = async () => {
        if (submitInFlightRef.current) return;
        setError('');
        if (!oldPassword) {
            setError('Vui lòng nhập mật khẩu hiện tại.');
            return;
        }
        if (!newPassword || newPassword.length < 6) {
            setError('Mật khẩu mới phải có tối thiểu 6 ký tự!');
            return;
        }
        if (newPassword === '123456') {
            setError('Không được sử dụng lại mật khẩu mặc định (123456)!');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Mật khẩu xác nhận không trùng khớp!');
            return;
        }

        submitInFlightRef.current = true;
        setLoading(true);
        try {
            const data = await safePost('/change-password', {
                ma_nv: maNv,
                old_password: oldPassword,
                new_password: newPassword
            });
            if (data?.success) {
                setNewPassword('');
                setConfirmPassword('');
                if (showToast) showToast('Đổi mật khẩu thành công!', 'success');
                if (onPasswordChanged) onPasswordChanged(newPassword);
            } else {
                const msg = data?.message || 'Đổi mật khẩu thất bại, vui lòng thử lại.';
                setError(msg);
                if (showToast) showToast(msg, 'error');
            }
        } catch (err) {
            const msg = err?.message || 'Lỗi kết nối máy chủ khi đổi mật khẩu.';
            setError(msg);
            if (showToast) showToast(msg, 'error');
        } finally {
            submitInFlightRef.current = false;
            setLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            title=""
            maskClosable={canClose}
            onClose={handleSafeClose}
            actions={[]}
        >
            <Box className="p-4 text-center relative">
                {canClose && (
                    <button
                        type="button"
                        onClick={handleSafeClose}
                        aria-label="Đóng"
                        className="absolute top-1 right-1 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                    >
                        <X size={18} />
                    </button>
                )}

                <Box className="flex justify-center mb-3">
                    <div style={{
                        background: canClose ? '#EFF6FF' : '#FEF2F2',
                        padding: '16px',
                        borderRadius: '50%',
                        display: 'inline-flex',
                        color: canClose ? '#1D4ED8' : '#DC2626'
                    }}>
                        <ShieldAlert size={36} />
                    </div>
                </Box>

                <Text className="font-bold text-lg text-slate-800 mb-1">
                    {canClose ? 'Đổi Mật Khẩu Tài Khoản' : 'Bắt Buộc Đổi Mật Khẩu'}
                </Text>
                <Text className="text-sm text-slate-500 mb-4 leading-relaxed">
                    {canClose
                        ? <>Thiết lập mật khẩu mới cho tài khoản <strong>{maNv}</strong> để bảo vệ thông tin công &amp; lương.</>
                        : <>Tài khoản <strong>{maNv}</strong> đang sử dụng mật khẩu mặc định ban đầu. Để đảm bảo an toàn thông tin cá nhân và tiền lương, bạn vui lòng thiết lập mật khẩu mới trước khi tiếp tục.</>
                    }
                </Text>

                {error && (
                    <Box className="mb-3 p-2 bg-red-50 text-red-700 text-xs rounded border border-red-200 text-left">
                        {error}
                    </Box>
                )}

                <Box className="text-left space-y-3">
                    <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">Mật khẩu hiện tại</label>
                        <Input.Password
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            placeholder="Nhập mật khẩu cũ (mặc định 123456)"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">Mật khẩu mới (≥ 6 ký tự)</label>
                        <Input.Password
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Thiết lập mật khẩu mới an toàn"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">Xác nhận mật khẩu mới</label>
                        <Input.Password
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Nhập lại mật khẩu mới"
                        />
                    </div>
                </Box>

                <Box className="mt-5 flex flex-col gap-2">
                    <Button
                        fullWidth
                        loading={loading}
                        onClick={handleSubmit}
                        style={{ background: '#1E3A8A' }}
                    >
                        {canClose ? 'Lưu Mật Khẩu Mới' : 'Lưu Mật Khẩu & Bắt Đầu Sử Dụng'}
                    </Button>
                    {canClose && (
                        <Button
                            fullWidth
                            variant="secondary"
                            type="neutral"
                            disabled={loading}
                            onClick={handleSafeClose}
                        >
                            Hủy / Đóng
                        </Button>
                    )}
                </Box>
            </Box>
        </Modal>
    );
}
