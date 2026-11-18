import React, { useState } from "react";
import { Lock, User, Eye, EyeOff, ShieldCheck, AlertCircle, RefreshCw, Sparkles, Zap } from "lucide-react";
import CompanyLogo from "../components/CompanyLogo";
import { ThemeToggleButton, useTheme } from "../context/ThemeContext";

export default function AuthView({
  onLogin,
  onZaloOneTouchLogin,
  linkedZaloMeta,
  isLoggingIn,
  loginError,
  onClearCache
}) {
  const { isDark } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (typeof onLogin === "function") {
      onLogin(username, password);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#F4F6F9] dark:bg-slate-950 flex flex-col items-center sm:justify-center sm:px-4 sm:py-6 relative overflow-x-hidden overflow-y-auto transition-colors duration-200"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)"
      }}
    >
      <div className="w-full max-w-md flex flex-col relative z-10 sm:rounded-[28px] sm:overflow-hidden sm:shadow-2xl sm:border sm:border-slate-200/80 sm:dark:border-slate-800 sm:bg-white sm:dark:bg-slate-900">
        {/* ZaUI Doctor Gradient Hero Header */}
        <div className="zaui-hero-header w-full pl-5 pb-12 pt-4 sm:pt-6 sm:pr-6 rounded-b-[32px] sm:rounded-b-[28px] relative overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-white/95 dark:bg-slate-800/95 border border-white/60 dark:border-slate-700 p-1.5 shadow-md flex items-center justify-center shrink-0">
                <img
                  src="/sedinco-logo.png"
                  alt="Sedinco HR"
                  className="w-full h-full object-contain select-none"
                />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-lg font-extrabold tracking-tight text-white leading-tight truncate">
                  SEDINCO HR
                </div>
                <div className="text-xs font-semibold text-blue-100 leading-snug truncate">
                  Chấm công &amp; Nhân sự
                </div>
              </div>
            </div>
            <ThemeToggleButton compact className="shrink-0" />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/25 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-cyan-200 shrink-0" />
            <span className="text-xs font-semibold text-white">
              Đăng nhập 1 chạm tự động qua Zalo
            </span>
          </div>
        </div>

        {/* ZaUI Floating Login Card */}
        <div className="zaui-floating-card mx-3.5 sm:mx-5 sm:mb-5 bg-white dark:bg-slate-900 border border-slate-100/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 transition-colors duration-200">
          {/* Brand Title Block */}
          <div className="flex flex-col items-center text-center">
            <CompanyLogo size="default" theme={isDark ? "dark" : "light"} showSubtitle={true} />
          </div>

          {/* NÚT ĐĂNG NHẬP NHANH 1 CHẠM BẰNG ZALO */}
          {typeof onZaloOneTouchLogin === "function" && (
            <div className="bg-emerald-50/75 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/40 rounded-2xl p-3.5 sm:p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400 fill-amber-400" />
                  <span>Đăng Nhập 1 Chạm Qua Zalo</span>
                </span>
                {linkedZaloMeta?.ma_nv && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-400/30 text-emerald-800 dark:text-emerald-200 font-mono text-xs font-bold">
                    Đã liên kết: {linkedZaloMeta.ma_nv}
                  </span>
                )}
              </div>

              {linkedZaloMeta?.ho_ten && (
                <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold">
                  Xin chào <strong className="text-slate-900 dark:text-white">{linkedZaloMeta.ho_ten}</strong> ({linkedZaloMeta.chuc_danh || "Nhân sự Sedinco"})
                </p>
              )}

              <button
                type="button"
                disabled={isLoggingIn}
                onClick={() => onZaloOneTouchLogin(false)}
                className="w-full min-h-[48px] py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Zap className="w-4 h-4 fill-current shrink-0" />
                <span className="min-w-0 leading-snug text-center">
                  {linkedZaloMeta?.ma_nv
                    ? `⚡ Đăng nhập nhanh 1 chạm bằng Zalo (${linkedZaloMeta.ma_nv})`
                    : "⚡ Đăng nhập nhanh 1 chạm bằng Zalo"}
                </span>
              </button>
              <p className="text-xs text-slate-600 dark:text-slate-300 text-center leading-relaxed">
                * Đăng nhập bằng SĐT / tài khoản lần đầu để tự động liên kết tài khoản Zalo cho các lần sau.
              </p>
            </div>
          )}

          {/* Dòng phân cách */}
          <div className="zaui-ticket-divider" />
          <div className="text-center">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">
              Hoặc đăng nhập bằng SĐT / Tài khoản
            </span>
          </div>

          {/* Form Đăng Nhập Truyền Thống */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Số Điện Thoại / Tài Khoản / Mã NV
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập SĐT, tên tài khoản hoặc Mã NV (VD: 0905..., NV001)"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl pl-11 pr-4 py-3.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-[#0068FF] focus:bg-white dark:focus:bg-slate-900 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Mật Khẩu Bảo Mật
              </label>
              <div className="flex items-center bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus-within:ring-2 focus-within:ring-[#0068FF] focus-within:bg-white dark:focus-within:bg-slate-900 transition-all overflow-hidden">
                <div className="pl-3.5 flex items-center pointer-events-none text-slate-400 shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu của bạn..."
                  required
                  className="flex-1 min-w-0 bg-transparent border-0 pl-3 pr-2 py-3.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 font-semibold text-sm focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
                  className="shrink-0 min-w-[44px] min-h-[44px] px-3 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-2xl flex items-start gap-2.5 text-rose-700 dark:text-rose-400 text-xs font-semibold animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full min-h-[48px] py-3.5 bg-[#0068FF] bg-gradient-to-r from-[#0068FF] to-[#0091FF] hover:from-[#0058D6] hover:to-[#007EE5] dark:from-blue-600 dark:to-sky-600 text-white font-bold text-sm rounded-2xl shadow-[0_6px_18px_-3px_rgba(0,104,255,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang xác thực &amp; liên kết Zalo...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Đăng Nhập &amp; Liên Kết Zalo</span>
                </>
              )}
            </button>
          </form>

          {/* Footer tiện ích */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Bảo mật tài khoản Sedinco
            </span>
            {onClearCache && (
              <button
                type="button"
                onClick={onClearCache}
                className="min-h-[44px] px-3 py-2 inline-flex items-center justify-center text-[#0068FF] hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-semibold transition-colors"
              >
                Làm mới bộ nhớ tạm
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
