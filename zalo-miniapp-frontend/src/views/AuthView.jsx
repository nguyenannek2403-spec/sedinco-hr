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
      className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center px-[14px] sm:px-4 relative overflow-x-hidden overflow-y-auto transition-colors duration-200"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 48px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)"
      }}
    >
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/15 dark:bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-indigo-600/10 dark:bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 rounded-3xl p-[18px] sm:p-6 md:p-8 shadow-2xl backdrop-blur-xl relative z-10 space-y-5 transition-colors duration-200">
        {/* Thanh chuyển nhanh Giao diện Sáng / Tối */}
        <div className="flex items-center justify-end">
          <ThemeToggleButton compact />
        </div>

        {/* Logo Sedinco */}
        <div className="flex justify-center">
          <CompanyLogo size="large" theme={isDark ? "dark" : "light"} showSubtitle={true} />
        </div>

        {/* Huy hiệu Định Tuyến Tự Động */}
        <div className="px-3.5 py-2 rounded-2xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 flex items-center justify-center gap-2 text-center">
          <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="text-xs font-bold text-blue-800 dark:text-blue-200">
            Đăng nhập 1 chạm tự động qua Zalo
          </span>
        </div>

        {/* NÚT ĐĂNG NHẬP NHANH 1 CHẠM BẰNG ZALO */}
        {typeof onZaloOneTouchLogin === "function" && (
          <div className="bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/80 dark:via-slate-900 dark:to-teal-950/70 border-2 border-emerald-400/70 dark:border-emerald-500/50 rounded-2xl p-[14px] sm:p-4 space-y-2.5 shadow-lg shadow-emerald-950/10 dark:shadow-emerald-950/40">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400 fill-amber-400" />
                <span>Đăng Nhập 1 Chạm Qua Zalo</span>
              </span>
              {linkedZaloMeta?.ma_nv && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-400/30 text-emerald-800 dark:text-emerald-200 font-mono text-xs font-bold">
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
              className="w-full min-h-[48px] py-3 px-[12px] sm:px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 dark:from-emerald-600 dark:to-teal-600 dark:hover:from-emerald-500 dark:hover:to-teal-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
        <div className="relative flex py-1 items-center">
          <div className="grow border-t border-slate-200 dark:border-slate-800"></div>
          <span className="shrink mx-3 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider text-center">
            Hoặc đăng nhập bằng SĐT / Tài khoản
          </span>
          <div className="grow border-t border-slate-200 dark:border-slate-800"></div>
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
                className="w-full bg-slate-50 dark:bg-slate-950/90 border border-slate-300 dark:border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Mật Khẩu Bảo Mật
            </label>
            <div className="flex items-center bg-slate-50 dark:bg-slate-950/90 border border-slate-300 dark:border-slate-700 rounded-2xl focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all overflow-hidden">
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
            className="w-full min-h-[48px] py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-blue-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoggingIn ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang xác thực & liên kết Zalo...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Đăng Nhập & Liên Kết Zalo</span>
              </>
            )}
          </button>
        </form>

        {/* Footer tiện ích */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Bảo mật tài khoản Sedinco
          </span>
          {onClearCache && (
            <button
              type="button"
              onClick={onClearCache}
              className="min-h-[44px] px-3 py-2 inline-flex items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white underline font-medium transition-colors"
            >
              Làm mới bộ nhớ tạm
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
