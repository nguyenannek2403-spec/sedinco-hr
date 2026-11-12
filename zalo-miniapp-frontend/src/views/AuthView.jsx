import React, { useState } from "react";
import { Lock, User, Eye, EyeOff, ShieldCheck, AlertCircle, RefreshCw, Sparkles, Zap } from "lucide-react";
import CompanyLogo from "../components/CompanyLogo";

export default function AuthView({
  onLogin,
  onZaloOneTouchLogin,
  linkedZaloMeta,
  isLoggingIn,
  loginError,
  onClearCache
}) {
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
      className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 relative overflow-x-hidden overflow-y-auto"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 48px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)"
      }}
    >
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-700/80 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl relative z-10 space-y-5">
        {/* Logo Sedinco */}
        <div className="flex justify-center">
          <CompanyLogo size="large" theme="dark" showSubtitle={true} />
        </div>

        {/* Huy hiệu Định Tuyến Tự Động V6 */}
        <div className="px-3.5 py-2 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center gap-2 text-center">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-[11px] font-bold text-blue-200">
            Cổng Đăng Nhập Hợp Nhất V6 • Zero-Password Zalo 1 Chạm
          </span>
        </div>

        {/* NÚT ĐĂNG NHẬP NHANH 1 CHẠM BẰNG ZALO (Zero-Password Auto Login) */}
        {typeof onZaloOneTouchLogin === "function" && (
          <div className="bg-gradient-to-br from-emerald-950/80 via-slate-900 to-teal-950/70 border-2 border-emerald-500/50 rounded-2xl p-4 space-y-2.5 shadow-lg shadow-emerald-950/40">
            <div className="flex items-center justify-between text-xs">
              <span className="font-black text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span>Đăng Nhập 1 Chạm Qua Zalo</span>
              </span>
              {linkedZaloMeta?.ma_nv && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 font-mono text-[10px] font-bold">
                  Đã liên kết: {linkedZaloMeta.ma_nv}
                </span>
              )}
            </div>

            {linkedZaloMeta?.ho_ten && (
              <p className="text-xs text-slate-300 font-semibold">
                Xin chào <strong className="text-white">{linkedZaloMeta.ho_ten}</strong> ({linkedZaloMeta.chuc_danh || "Nhân sự Sedinco"})
              </p>
            )}

            <button
              type="button"
              disabled={isLoggingIn}
              onClick={() => onZaloOneTouchLogin(false)}
              className="w-full min-h-[48px] py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-4 h-4 fill-slate-950" />
              <span>
                {linkedZaloMeta?.ma_nv
                  ? `⚡ Đăng nhập nhanh 1 chạm bằng Zalo (${linkedZaloMeta.ma_nv})`
                  : "⚡ Đăng nhập nhanh 1 chạm bằng Zalo"}
              </span>
            </button>
            <p className="text-[10px] text-slate-400 text-center">
              * Đăng nhập bằng Mã NV & Mật khẩu lần đầu để tự động liên kết Zalo ID cho các lần sau.
            </p>
          </div>
        )}

        {/* Dòng phân cách */}
        <div className="relative flex py-1 items-center">
          <div className="grow border-t border-slate-800"></div>
          <span className="shrink mx-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Hoặc đăng nhập / đổi tài khoản
          </span>
          <div className="grow border-t border-slate-800"></div>
        </div>

        {/* Form Đăng Nhập Truyền Thống */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Mã Nhân Viên / Tên Đăng Nhập
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập Mã NV (VD: NV001, NV002, NV003...)"
                required
                autoCapitalize="characters"
                className="w-full bg-slate-950/90 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-white placeholder-slate-500 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Mật Khẩu Bảo Mật
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu của bạn..."
                required
                className="w-full bg-slate-950/90 border border-slate-700 rounded-2xl pl-11 pr-11 py-3.5 text-white placeholder-slate-500 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {loginError && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-2.5 text-rose-400 text-xs font-semibold animate-shake">
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
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5 font-semibold text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Sedinco Security V6
          </span>
          {onClearCache && (
            <button
              type="button"
              onClick={onClearCache}
              className="text-slate-400 hover:text-slate-200 underline font-medium transition-colors"
            >
              Làm mới cache
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
