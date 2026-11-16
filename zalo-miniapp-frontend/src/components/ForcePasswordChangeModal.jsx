import React, { useState, useRef } from 'react';
import { ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { safePost } from '../utils/api';
import { AppButton, AppModal } from './ui';

/**
 * ForcePasswordChangeModal (G3 Security Hardening)
 * Bắt buộc nhân viên đổi mật khẩu khi đăng nhập lần đầu với mật khẩu mặc định (must_change_password = true)
 */
export default function ForcePasswordChangeModal({
    visible,
    maNv,
    canClose = false,
    onClose,
    showToast,
    onPasswordChanged
}) {
    const [oldPassword, setOldPassword] = useState('123456');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);
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

    const handleSubmit = async (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
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

    const inputType = showPasswords ? 'text' : 'password';

    return (
        <AppModal
            open={Boolean(visible)}
            onClose={handleSafeClose}
            closeOnBackdrop={Boolean(canClose)}
            disableClose={!canClose || loading}
            showCloseX={Boolean(canClose)}
            title={canClose ? 'Đổi Mật Khẩu Tài Khoản' : 'Bắt Buộc Đổi Mật Khẩu'}
            subtitle={`Tài khoản ${maNv || ''}`}
            maxWidthClass="max-w-md"
            footer={
                <div className="flex flex-col gap-2">
                    <AppButton
                        type="submit"
                        form="force-password-change-form"
                        variant="primary"
                        fullWidth
                        loading={loading}
                        loadingText="Đang cập nhật mật khẩu..."
                    >
                        {canClose ? 'Lưu Mật Khẩu Mới' : 'Lưu Mật Khẩu & Bắt Đầu Sử Dụng'}
                    </AppButton>
                    {canClose && (
                        <AppButton
                            variant="secondary"
                            fullWidth
                            disabled={loading}
                            onClick={handleSafeClose}
                        >
                            Đóng / Quay lại
                        </AppButton>
                    )}
                </div>
            }
        >
            <form id="force-password-change-form" onSubmit={handleSubmit} className="p-5 space-y-4">
                <div className="flex flex-col items-center text-center space-y-2">
                    <div
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                            canClose ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-600'
                        }`}
                    >
                        <ShieldAlert size={30} />
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                        {canClose
                            ? <>Thiết lập mật khẩu mới cho tài khoản <strong>{maNv}</strong> để bảo vệ thông tin công &amp; lương.</>
                            : <>Tài khoản <strong>{maNv}</strong> đang dùng mật khẩu mặc định. Vui lòng thiết lập mật khẩu mới trước khi tiếp tục.</>}
                    </p>
                </div>

                {error && (
                    <div className="p-3 bg-rose-50 text-rose-800 text-xs font-semibold rounded-xl border border-rose-200">
                        {error}
                    </div>
                )}

                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Mật khẩu hiện tại</label>
                        <input
                            type={inputType}
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            placeholder="Nhập mật khẩu cũ (mặc định 123456)"
                            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-base text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                        <input
                            type={inputType}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Thiết lập mật khẩu mới an toàn"
                            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-base text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Xác nhận mật khẩu mới</label>
                        <input
                            type={inputType}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Nhập lại mật khẩu mới"
                            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-base text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowPasswords((v) => !v)}
                        className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                        {showPasswords ? <EyeOff size={15} /> : <Eye size={15} />}
                        <span>{showPasswords ? 'Ẩn mật khẩu' : 'Hiện mật khẩu để kiểm tra'}</span>
                    </button>
                </div>
            </form>
        </AppModal>
    );
}
