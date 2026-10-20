import React, { useState, useRef, useEffect } from "react";
import { User, ShieldCheck, AlertCircle, ArrowRight, CheckCircle2, RotateCcw, Lock } from "lucide-react";
import CompanyLogo from "./CompanyLogo";
import { previewLinkCode, confirmLinkAccount } from "../services/authService";

/**
 * F1: Màn hình Liên kết tài khoản Zalo với Mã Nhân Viên (8 Ký tự)
 */
export default function LinkAccountView({
  zaloAccessToken = "",
  onLinkSuccess,
  onSwitchToPasswordLogin
}) {
  const [code, setCode] = useState("");
  const [previewEmployee, setPreviewEmployee] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);

  const isSubmittingRef = useRef(false);

  // Bộ đếm lùi cho lỗi 429
  useEffect(() => {
    if (rateLimitCountdown <= 0) return;
    const timer = setInterval(() => {
      setRateLimitCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitCountdown]);

  // Tra cứu mã 8 ký tự
  const handleCheckCode = async (e) => {
    e.preventDefault();
    if (rateLimitCountdown > 0) return;
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length < 6) {
      setErrorMessage("Vui lòng nhập mã liên kết hợp lệ (tối thiểu 6-8 ký tự).");
      return;
    }

    setErrorMessage("");
    setIsLoadingPreview(true);
    setPreviewEmployee(null);

    try {
      const emp = await previewLinkCode(cleanCode);
      setPreviewEmployee(emp);
    } catch (err) {
      if (err.status === 429) {
        setRateLimitCountdown(10);
      }
      setErrorMessage(err.message || "Mã liên kết không hợp lệ hoặc đã được sử dụng.");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Xác nhận liên kết tài khoản
  const handleConfirmLink = async () => {
    if (isSubmittingRef.current || rateLimitCountdown > 0) return;
    isSubmittingRef.current = true;
    setIsLinking(true);
    setErrorMessage("");

    try {
      const res = await confirmLinkAccount(code, zaloAccessToken);
      if (res?.success) {
        onLinkSuccess(res.user, res.role);
      }
    } catch (err) {
      if (err.status === 429) {
        setRateLimitCountdown(15);
      }
      setErrorMessage(err.message || "Lỗi liên kết tài khoản. Vui lòng liên hệ bộ phận Nhân sự.");
    } finally {
      setIsLinking(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans flex flex-col justify-between p-6 relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-600/25 rounded-full blur-3xl pointer-events-none" />

      {/* Header Logo */}
      <div className="text-center z-10 pt-4">
        <CompanyLogo size="large" theme="dark" showSubtitle={true} />
      </div>

      {/* Khung Liên kết Tài khoản F1 */}
      <div className="w-full max-w-md mx-auto bg-slate-800/90 backdrop-blur-2xl border-2 border-white/20 rounded-3xl p-6 md:p-8 shadow-2xl z-10 my-auto">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-500/30 text-blue-200 text-xs font-bold mb-2 border border-blue-400/40">
            <ShieldCheck size={16} />
            <span>Xác thực Tài khoản Zalo Mini App</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">LIÊN KẾT NHÂN SỰ</h2>
          <p className="text-sm text-slate-200 mt-1">
            Nhập mã liên kết 8 ký tự được cấp bởi phòng Nhân sự Sedinco
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 p-4 rounded-2xl bg-rose-500/30 border-2 border-rose-400 text-white text-sm flex items-start gap-2.5">
            <AlertCircle size={20} className="text-rose-300 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">{errorMessage}</span>
              {rateLimitCountdown > 0 && (
                <span className="block mt-1 font-black text-amber-300">
                  Thử lại sau {rateLimitCountdown} giây...
                </span>
              )}
            </div>
          </div>
        )}

        {/* Bước 1: Nhập và kiểm tra mã */}
        {!previewEmployee ? (
          <form onSubmit={handleCheckCode} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-white mb-2">
                Mã Liên Kết Nhân Sự (8 Ký Tự)
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={12}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setErrorMessage("");
                  }}
                  placeholder="Ví dụ: SED-8821..."
                  disabled={isLoadingPreview || rateLimitCountdown > 0}
                  className="w-full px-4 py-4 rounded-2xl bg-slate-900 border-2 border-white/40 text-white placeholder-slate-400 text-lg font-mono font-black tracking-widest text-center focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 transition-all uppercase disabled:opacity-50"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoadingPreview || !code.trim() || rateLimitCountdown > 0}
              className="w-full py-4 px-6 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-black text-base border-2 border-white/70 shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoadingPreview ? (
                <span>Đang tra cứu hồ sơ...</span>
              ) : (
                <>
                  <span>KIỂM TRA MÃ LIÊN KẾT</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Bước 2: Hiển thị hồ sơ nhân sự để người dùng xác nhận đúng tên mình */
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-slate-900 border-2 border-white/30 text-center">
              <div className="w-16 h-16 rounded-full bg-blue-600/40 border-2 border-blue-400 text-blue-200 flex items-center justify-center mx-auto mb-2 text-2xl font-black">
                <User size={32} />
              </div>
              <h3 className="font-black text-xl text-white">
                {previewEmployee.ho_ten || previewEmployee.name}
              </h3>
              <p className="text-sm text-blue-200 font-bold mt-1">
                Mã NV: {previewEmployee.ma_nv} • {previewEmployee.chuc_danh || "Cán bộ nhân viên"}
              </p>
              <div className="mt-3 py-2 px-3.5 rounded-xl bg-emerald-500/30 border-2 border-emerald-400 text-emerald-200 text-xs font-black inline-flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>Mã liên kết hợp lệ và sẵn sàng kết nối</span>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setPreviewEmployee(null)}
                className="flex-1 py-3.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-black text-sm border-2 border-slate-500 transition-all cursor-pointer"
              >
                Nhập mã khác
              </button>
              <button
                type="button"
                onClick={handleConfirmLink}
                disabled={isLinking || rateLimitCountdown > 0}
                className="flex-2 py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm border-2 border-white/80 shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLinking ? <span>Đang kết nối...</span> : <span>XÁC NHẬN LIÊN KẾT</span>}
              </button>
            </div>
          </div>
        )}

        {/* Nút chuyển đổi đăng nhập mật khẩu (dành cho Web hoặc Quản trị viên) */}
        {onSwitchToPasswordLogin && (
          <div className="mt-6 pt-4 border-t border-white/10 text-center">
            <button
              type="button"
              onClick={onSwitchToPasswordLogin}
              className="w-full py-3 px-4 rounded-xl border border-blue-400/40 bg-blue-500/10 text-sm text-blue-200 hover:text-white font-bold inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Lock size={15} />
              <span>Đăng nhập bằng tài khoản & mật khẩu</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center z-10 pt-4 space-y-1">
        <p className="text-[10px] text-slate-500">
          © 2026 CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO. BẢN QUYỀN ĐÃ ĐƯỢC BẢO HỘ.
        </p>
      </div>
    </div>
  );
}
