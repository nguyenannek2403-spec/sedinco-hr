import React, { useState } from "react";
import { Lock, User, Eye, EyeOff, ShieldCheck, AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import CompanyLogo from "../components/CompanyLogo";

export default function AuthView({
  onLogin,
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

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-700/80 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl relative z-10">
        {/* Logo Sedinco */}
        <div className="mb-4 flex justify-center">
          <CompanyLogo size="large" theme="dark" showSubtitle={true} />
        </div>

        {/* Huy hiệu Định Tuyến Tự Động V5 */}
        <div className="mb-6 px-3.5 py-2 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center gap-2 text-center">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-[11px] font-bold text-blue-200">
            Cổng Đăng Nhập Hợp Nhất • Tự Động Định Tuyến Theo Chức Vụ
          </span>
        </div>

        {/* Form Đăng Nhập Duy Nhất */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
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
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
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
                <span>Đang xác thực & định tuyến...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Đăng Nhập Hệ Thống</span>
              </>
            )}
          </button>
        </form>

        {/* Footer tiện ích */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5 font-semibold text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Sedinco Security V5
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
