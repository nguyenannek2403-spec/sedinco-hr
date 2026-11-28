import React, { useState } from "react";
import { Lock, User, Eye, EyeOff, AlertCircle, RefreshCw } from "lucide-react";
import CompanyLogo from "../components/CompanyLogo";
import { ThemeToggleButton, useTheme } from "../context/ThemeContext";

export default function AuthView({
  onLogin,
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
      className="bg-[#F1F5F9] dark:bg-[#0B1120] flex flex-col px-4 overflow-x-hidden transition-colors duration-200 relative"
      style={{
        minHeight: "var(--visual-vh)",
        paddingTop: "calc(var(--safe-area-top) + 8px)",
        paddingBottom: "max(var(--safe-area-bottom), 12px)",
        paddingLeft: "max(var(--safe-area-left, 0px), 16px)",
        paddingRight: "max(var(--safe-area-right, 0px), 16px)"
      }}
    >
      {/* Nút chuyển Sáng/Tối gọn ở góc trên bên trái (chừa vùng nút Zalo Capsule bên phải) */}
      <div
        className="w-full max-w-sm mx-auto flex items-center justify-start min-h-[44px] py-1 shrink-0 relative z-10"
        style={{ paddingRight: "calc(var(--zalo-capsule-w, 104px) + 10px)" }}
      >
        <ThemeToggleButton compact />
      </div>

      {/* Khối đăng nhập trung tâm theo Sedinco Pulse (Google Stitch Screen 1) */}
      <div className="flex-1 flex items-center justify-center w-full relative z-10">
        <div
          data-testid="auth-login-card"
          className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-6 sm:p-7 shadow-[0_12px_36px_-8px_rgba(17,28,45,0.08)] dark:shadow-2xl transition-colors duration-200"
        >
          {/* 1-3: Logo Công ty + Tên Công ty + Tên Ứng dụng + 1 dòng ngữ cảnh nội bộ */}
          <div className="flex flex-col items-center text-center">
            <CompanyLogo size="default" theme={isDark ? "dark" : "light"} iconOnly />
            <div className="space-y-1 mt-2.5">
              <h1 className="text-lg font-extrabold tracking-wide text-[#111C2D] dark:text-white uppercase leading-tight">
                CÔNG TY SEDINCO
              </h1>
              <p className="text-sm font-bold text-[#E11D48] dark:text-rose-400 leading-snug">
                Sedinco HR
              </p>
            </div>
            <p
              data-testid="auth-internal-notice"
              className="text-[12.5px] text-slate-500 dark:text-slate-400 text-center leading-relaxed whitespace-normal break-words px-2 mt-1.5 mb-5"
            >
              Ứng dụng nội bộ dành riêng cho nhân sự Công ty SEDINCO. Đăng nhập bằng tài khoản được cấp để chấm công và tra cứu bảng lương.
            </p>
          </div>

          {/* 4: Khối thao tác đăng nhập chính (Tài khoản & Mật khẩu nội bộ) */}
          <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
            <div>
              <label
                htmlFor="auth-username"
                className="block text-xs font-bold text-[#111C2D] dark:text-slate-200 mb-1.5"
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
                  className="w-full min-h-[48px] bg-[#F0F3FF]/70 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-[#111C2D] dark:text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48] focus:bg-white dark:focus:bg-slate-900 transition-all"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-bold text-[#111C2D] dark:text-slate-200 mb-1.5"
              >
                Mật khẩu
              </label>
              <div className="flex items-center bg-[#F0F3FF]/70 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus-within:ring-2 focus-within:ring-[#E11D48] focus-within:bg-white dark:focus-within:bg-slate-900 transition-all overflow-hidden">
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
                  className="flex-1 min-w-0 min-h-[48px] bg-transparent border-0 pl-2.5 pr-2 py-3 text-[#111C2D] dark:text-white font-semibold text-sm focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
                  className="shrink-0 min-w-[44px] min-h-[44px] px-3 flex items-center justify-center text-slate-500 hover:text-[#E11D48] dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 rounded-xl flex items-start gap-2 text-[#B80035] dark:text-rose-300 text-xs font-semibold animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="min-w-0 flex-1 whitespace-normal break-words">{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full min-h-[48px] py-3 bg-[#E11D48] hover:bg-[#BE123C] dark:bg-rose-600 dark:hover:bg-rose-500 text-white font-bold text-sm rounded-xl shadow-[0_6px_18px_-3px_rgba(225,29,72,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
          </form>
        </div>
      </div>
    </div>
  );
}
