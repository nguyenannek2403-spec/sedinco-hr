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
      <div className="w-full max-w-md mx-auto bg-white/10 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 md:p-8 shadow-2xl z-10 my-auto">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold mb-2">
            <ShieldCheck size={14} />
            <span>Xác thực Tài khoản Zalo Mini App</span>
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">LIÊN KẾT NHÂN SỰ</h2>
          <p className="text-xs text-slate-300 mt-1">
            Nhập mã liên kết 8 ký tự được cấp bởi phòng Nhân sự Sedinco
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
            <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{errorMessage}</span>
              {rateLimitCountdown > 0 && (
                <span className="block mt-1 font-bold text-amber-300">
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
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
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
                  className="w-full px-4 py-3.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-400 text-base font-mono tracking-widest text-center focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all uppercase disabled:opacity-50"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoadingPreview || !code.trim() || rateLimitCountdown > 0}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-black text-sm shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoadingPreview ? (
                <span>Đang tra cứu hồ sơ...</span>
              ) : (
                <>
                  <span>KIỂM TRA MÃ LIÊN KẾT</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Bước 2: Hiển thị hồ sơ nhân sự để người dùng xác nhận đúng tên mình */
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white/10 border border-white/20 text-center">
              <div className="w-14 h-14 rounded-full bg-blue-600/30 border border-blue-400/40 text-blue-300 flex items-center justify-center mx-auto mb-2 text-xl font-black">
                <User size={28} />
              </div>
              <h3 className="font-black text-lg text-white">
                {previewEmployee.ho_ten || previewEmployee.name}
              </h3>
              <p className="text-xs text-blue-300 font-semibold mt-0.5">
                Mã NV: {previewEmployee.ma_nv} • {previewEmployee.chuc_danh || "Cán bộ nhân viên"}
              </p>
              <div className="mt-3 py-1.5 px-3 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1.5">
                <CheckCircle2 size={13} />
                <span>Mã liên kết hợp lệ và sẵn sàng kết nối</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPreviewEmployee(null)}
                className="flex-1 py-3 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 font-bold text-xs transition-all cursor-pointer"
              >
                Nhập mã khác
              </button>
              <button
                type="button"
                onClick={handleConfirmLink}
                disabled={isLinking || rateLimitCountdown > 0}
                className="flex-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
              className="text-xs text-blue-300 hover:text-white font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Lock size={12} />
              <span>Đăng nhập bằng tài khoản & mật khẩu (Web / Quản trị)</span>
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
