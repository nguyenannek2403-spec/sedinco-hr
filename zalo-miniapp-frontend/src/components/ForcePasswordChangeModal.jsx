import React, { useState } from 'react';
import { Modal, Box, Text, Input, Button, Icon } from 'zmp-ui';
import { Lock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { API_BASE } from '../utils/api';

/**
 * ForcePasswordChangeModal (G3 Security Hardening)
 * Bắt buộc nhân viên đổi mật khẩu khi đăng nhập lần đầu với mật khẩu mặc định (must_change_password = true)
 */
export default function ForcePasswordChangeModal({ visible, maNv, token, onPasswordChanged }) {
    const [oldPassword, setOldPassword] = useState('123456');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        setError('');
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

        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ma_nv: maNv,
                    old_password: oldPassword,
                    new_password: newPassword
                })
            });
            const data = await res.json();
            if (data.success) {
                if (onPasswordChanged) onPasswordChanged(newPassword);
            } else {
                setError(data.message || 'Đổi mật khẩu thất bại, vui lòng thử lại.');
            }
        } catch (err) {
            setError('Lỗi kết nối máy chủ khi đổi mật khẩu.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            title=""
            maskClosable={false}
            actions={[]}
        >
            <Box className="p-4 text-center">
                <Box className="flex justify-center mb-3">
                    <div style={{
                        background: '#FEF2F2',
                        padding: '16px',
                        borderRadius: '50%',
                        display: 'inline-flex',
                        color: '#DC2626'
                    }}>
                        <ShieldAlert size={36} />
                    </div>
                </Box>

                <Text className="font-bold text-lg text-slate-800 mb-1">
                    Bắt Buộc Đổi Mật Khẩu
                </Text>
                <Text className="text-sm text-slate-500 mb-4">
                    Tài khoản <strong>{maNv}</strong> đang sử dụng mật khẩu mặc định ban đầu. Để đảm bảo an toàn thông tin cá nhân và tiền lương, bạn vui lòng thiết lập mật khẩu mới trước khi tiếp tục.
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

                <Box className="mt-5">
                    <Button
                        fullWidth
                        loading={loading}
                        onClick={handleSubmit}
                        style={{ background: '#1E3A8A' }}
                    >
                        Lưu Mật Khẩu & Bắt Đầu Sử Dụng
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
}
