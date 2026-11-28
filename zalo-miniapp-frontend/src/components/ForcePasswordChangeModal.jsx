import React, { useState, useRef, useEffect } from 'react';
import { ShieldAlert, Eye, EyeOff, KeyRound } from 'lucide-react';
import { safePost, safePut } from '../utils/api';
import { AppButton, AppModal } from './ui';

/**
 * Tài Khoản & Bảo Mật (Cập nhật Tên đăng nhập / Số điện thoại & Đổi mật khẩu cho cả 3 Role).
 * Hỗ trợ chế độ bắt buộc đổi mật khẩu mặc định (canClose = false) hoặc tự nguyện cập nhật (canClose = true).
 */
export default function ForcePasswordChangeModal({
    visible,
    currentUser = null,
    maNv,
    canClose = false,
    onClose,
    onSkip = null,
    showToast,
    onPasswordChanged
}) {
    const initialUsername =
        currentUser?.login_username ||
        currentUser?.phone ||
        currentUser?.ma_nv ||
        currentUser?.username ||
        maNv ||
        '';
    const initialPhone = currentUser?.phone || currentUser?.dien_thoai || '';

    const [loginUsername, setLoginUsername] = useState(initialUsername);
    const [phone, setPhone] = useState(initialPhone);
    const [oldPassword, setOldPassword] = useState(canClose ? '' : '123456');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const submitInFlightRef = useRef(false);

    useEffect(() => {
        if (visible) {
            setLoginUsername(
                currentUser?.login_username ||
                currentUser?.phone ||
                currentUser?.ma_nv ||
                currentUser?.username ||
                maNv ||
                ''
            );
            setPhone(currentUser?.phone || currentUser?.dien_thoai || '');
            setOldPassword(canClose ? '' : '123456');
            setNewPassword('');
            setConfirmPassword('');
            setError('');
        }
    }, [visible, canClose, maNv, currentUser?.login_username, currentUser?.phone, currentUser?.dien_thoai, currentUser?.ma_nv, currentUser?.username]);

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

        const trimmedUser = String(loginUsername || '').trim();
        const trimmedPhone = String(phone || '').trim();
        const usernameChanged = canClose && trimmedUser !== String(initialUsername || '').trim();
        const phoneChanged = canClose && trimmedPhone !== String(initialPhone || '').trim();
        const wantsPasswordChange = Boolean(newPassword || confirmPassword || !canClose);

        if (!oldPassword) {
            setError('Vui lòng nhập mật khẩu hiện tại để xác thực!');
            return;
        }
        if (canClose && !trimmedUser) {
            setError('Tên tài khoản đăng nhập không được để trống!');
            return;
        }
        if (canClose && !usernameChanged && !phoneChanged && !newPassword && !confirmPassword) {
            setError('Bạn chưa thay đổi tài khoản, số điện thoại hoặc mật khẩu mới.');
            return;
        }
        if (wantsPasswordChange) {
            if (!newPassword || newPassword.trim().length < 1) {
                setError('Mật khẩu mới không được để trống!');
                return;
            }
            if (newPassword === oldPassword) {
                setError('Mật khẩu mới phải khác mật khẩu hiện tại / ban đầu!');
                return;
            }
            if (newPassword !== confirmPassword) {
                setError('Mật khẩu xác nhận không trùng khớp!');
                return;
            }
        }

        submitInFlightRef.current = true;
        setLoading(true);
        try {
            let data;
            if (canClose) {
                const payload = {
                    old_password: oldPassword
                };
                if (usernameChanged) payload.new_username = trimmedUser;
                if (phoneChanged) payload.phone = trimmedPhone;
                if (wantsPasswordChange && newPassword) payload.new_password = newPassword;
                data = await safePut('/account/credentials', payload);
            } else {
                data = await safePost('/change-password', {
                    ma_nv: maNv,
                    old_password: oldPassword,
                    new_password: newPassword
                });
            }

            if (data?.success) {
                setOldPassword('');
                setNewPassword('');
                setConfirmPassword('');
                if (onPasswordChanged) {
                    onPasswordChanged(data.data || null, data.token || null);
                } else if (showToast) {
                    showToast(data.message || 'Cập nhật tài khoản & mật khẩu thành công!', 'success');
                }
            } else {
                const msg = data?.message || 'Cập nhật thất bại, vui lòng thử lại.';
                setError(msg);
                if (showToast) showToast(msg, 'error');
            }
        } catch (err) {
            const msg = err?.data?.message || err?.message || 'Lỗi kết nối máy chủ khi cập nhật tài khoản.';
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
            title={canClose ? 'Tài Khoản & Bảo Mật' : 'Đổi Mật Khẩu Mới'}
            subtitle={`${currentUser?.ho_ten || ''} (${currentUser?.login_username || maNv || ''})`.trim()}
            maxWidthClass="max-w-md"
            footer={
                <div className="flex flex-col gap-2">
                    <AppButton
                        type="submit"
                        form="force-password-change-form"
                        variant="primary"
                        fullWidth
                        loading={loading}
                        loadingText="Đang lưu cập nhật..."
                    >
                        {canClose ? 'Lưu Thông Tin Tài Khoản' : 'Lưu mật khẩu mới'}
                    </AppButton>
                    {!canClose && typeof onSkip === 'function' && (
                        <button
                            type="button"
                            data-testid="skip-password-change-btn"
                            disabled={loading}
                            onClick={() => {
                                if (!submitInFlightRef.current) {
                                    onSkip();
                                }
                            }}
                            className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                        >
                            Bỏ qua, đổi sau
                        </button>
                    )}
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
                <div className="bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[#FFE4E6] dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center text-[#B80035] dark:text-rose-300 shrink-0">
                            {canClose ? <KeyRound size={22} /> : <ShieldAlert size={24} />}
                        </div>
                        <div className="min-w-0">
                            <span className="block text-xs font-extrabold uppercase tracking-wider text-[#B80035] dark:text-rose-400">
                                BẢO MẬT TÀI KHOẢN SEDINCO
                            </span>
                            <p className="text-xs sm:text-sm text-[#111C2D] dark:text-slate-200 font-semibold leading-snug mt-0.5 whitespace-normal break-words">
                                {canClose
                                    ? <>Tùy chỉnh <strong>Tên đăng nhập (SĐT)</strong> và <strong>Mật khẩu</strong> cho <strong>{currentUser?.ho_ten || maNv}</strong>.</>
                                    : <>Tài khoản <strong>{maNv}</strong> đang dùng mật khẩu ban đầu. Bạn có thể đổi ngay hoặc bấm Bỏ qua để vào làm việc.</>}
                            </p>
                        </div>
                    </div>
                    <div className="sedinco-ticket-cutout">
                        <div className="w-full border-t-2 border-dashed border-slate-200 dark:border-slate-700" />
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-normal break-words">
                        Nhập mật khẩu dễ nhớ tùy ý (có thể chỉ cần 1 chữ số hoặc chữ cái, miễn khác mật khẩu ban đầu).
                    </p>
                </div>

                {error && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 text-xs font-semibold rounded-xl border border-rose-200 dark:border-rose-600 whitespace-normal break-words">
                        {error}
                    </div>
                )}

                <div className="space-y-3">
                    {canClose && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-[#F0F3FF]/70 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700">
                            <div>
                                <label className="text-xs font-bold text-[#111C2D] dark:text-slate-200 block mb-1">
                                    Tài khoản đăng nhập
                                </label>
                                <input
                                    type="text"
                                    value={loginUsername}
                                    onChange={(e) => setLoginUsername(e.target.value)}
                                    placeholder="SĐT hoặc tên tài khoản"
                                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-[#111C2D] dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[#111C2D] dark:text-slate-200 block mb-1">
                                    Số điện thoại liên hệ
                                </label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="VD: 0905123456"
                                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-[#111C2D] dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-bold text-[#111C2D] dark:text-slate-200 block mb-1">
                            Mật khẩu hiện tại <span className="text-rose-600 dark:text-rose-400">*</span>
                        </label>
                        <input
                            type={inputType}
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            placeholder="Nhập mật khẩu hiện tại để xác nhận"
                            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-[#F0F3FF]/60 dark:bg-slate-800 text-base text-[#111C2D] dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48] focus:bg-white dark:focus:bg-slate-900"
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="text-xs font-bold text-[#111C2D] dark:text-slate-200 block">
                                Mật khẩu mới {canClose ? '(bỏ trống nếu giữ nguyên)' : '(tùy ý, từ 1 ký tự)'}
                            </label>
                            <button
                                type="button"
                                data-testid="toggle-show-password-btn"
                                onClick={() => setShowPasswords((v) => !v)}
                                className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#0051CA] dark:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer shrink-0"
                            >
                                {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                                <span>{showPasswords ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}</span>
                            </button>
                        </div>
                        <input
                            type={inputType}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={canClose ? 'Nhập nếu muốn đổi mật khẩu mới' : 'VD: 1, 88, tenban...'}
                            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-[#F0F3FF]/60 dark:bg-slate-800 text-base text-[#111C2D] dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48] focus:bg-white dark:focus:bg-slate-900"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-[#111C2D] dark:text-slate-200 block mb-1">
                            Xác nhận mật khẩu mới
                        </label>
                        <input
                            type={inputType}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Nhập lại mật khẩu mới"
                            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-[#F0F3FF]/60 dark:bg-slate-800 text-base text-[#111C2D] dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48] focus:bg-white dark:focus:bg-slate-900"
                        />
                    </div>
                </div>
            </form>
        </AppModal>
    );
}
