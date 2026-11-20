import React, { useState } from "react";
import { Lock, User, Eye, EyeOff, AlertCircle, RefreshCw, Zap } from "lucide-react";
import CompanyLogo from "../components/CompanyLogo";
import { ThemeToggleButton, useTheme } from "../context/ThemeContext";

export default function AuthView({
  onLogin,
  onZaloOneTouchLogin,
  isLoggingIn,
  loginError
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
      className="min-h-[100dvh] bg-[#F4F6F9] dark:bg-slate-950 flex flex-col px-4 py-3 sm:py-6 overflow-x-hidden transition-colors duration-200"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)"
      }}
    >
      {/* Nút chuyển Sáng/Tối gọn ở góc trên bên trái (tránh vùng nút Zalo góc phải) */}
      <div className="w-full max-w-sm mx-auto flex items-center justify-start pr-[96px] sm:pr-0 shrink-0 mb-4">
        <ThemeToggleButton compact />
      </div>

      {/* Khối đăng nhập cân đối chính giữa màn hình */}
      <div className="flex-1 flex items-center justify-center w-full">
        <div
          data-testid="auth-login-card"
          className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6 transition-colors duration-200"
        >
          {/* 1-3: Logo Công ty + Tên Công ty + Tên Ứng dụng */}
          <div className="flex flex-col items-center text-center space-y-2.5">
            <CompanyLogo size="default" theme={isDark ? "dark" : "light"} iconOnly />
            <div className="space-y-1">
              <h1 className="text-lg font-extrabold tracking-wide text-slate-900 dark:text-white uppercase leading-tight">
                CÔNG TY SEDINCO
              </h1>
              <p className="text-sm font-bold text-[#0068FF] dark:text-blue-400 leading-snug">
                Sedinco HR
              </p>
            </div>
          </div>

          {/* 4: Khối thao tác đăng nhập chính (100% nhãn trung tính, ZERO placeholder gợi ý) */}
          <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
            <div>
              <label
                htmlFor="auth-username"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Tài khoản
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 dark:text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="auth-username"
                  name="username"
                  data-testid="auth-username-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder=""
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  className="w-full min-h-[46px] bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-[#0068FF] focus:bg-white dark:focus:bg-slate-900 transition-all"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Mật khẩu
              </label>
              <div className="flex items-center bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-xl focus-within:ring-2 focus-within:ring-[#0068FF] focus-within:bg-white dark:focus-within:bg-slate-900 transition-all overflow-hidden">
                <div className="pl-3.5 flex items-center pointer-events-none text-slate-500 dark:text-slate-400 shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="auth-password"
                  name="password"
                  data-testid="auth-password-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=""
                  autoComplete="off"
                  required
                  className="flex-1 min-w-0 min-h-[46px] bg-transparent border-0 pl-2.5 pr-2 py-3 text-slate-900 dark:text-white font-semibold text-sm focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
                  className="shrink-0 min-w-[44px] min-h-[44px] px-3 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 rounded-xl flex items-start gap-2 text-rose-700 dark:text-rose-300 text-xs font-semibold animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full min-h-[48px] py-3 bg-[#0068FF] bg-gradient-to-r from-[#0068FF] to-[#0091FF] hover:from-[#0058D6] hover:to-[#007EE5] dark:from-blue-600 dark:to-sky-600 text-white font-bold text-sm rounded-xl shadow-[0_6px_18px_-3px_rgba(0,104,255,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang đăng nhập...</span>
                </>
              ) : (
                <span>Đăng nhập</span>
              )}
            </button>

            {typeof onZaloOneTouchLogin === "function" && (
              <button
                type="button"
                disabled={isLoggingIn}
                onClick={() => onZaloOneTouchLogin(false)}
                className="w-full min-h-[48px] py-3 px-4 bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Zap className="w-4 h-4 fill-current shrink-0" />
                <span>Đăng nhập nhanh bằng Zalo</span>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
