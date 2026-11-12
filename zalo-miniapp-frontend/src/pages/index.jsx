import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useAuth } from "../hooks/useAuth";
import AuthView from "../views/AuthView";
import WorkerDashboard from "../views/worker/WorkerDashboard";
import DesktopDashboard from "../views/desktop/DesktopDashboard";
import { ROLES } from "../constants/roles";
import { CheckCircle2, AlertCircle, Info, RefreshCw } from "lucide-react";

// Lazy-load modal đổi mật khẩu bắt buộc
const ForcePasswordChangeModal = lazy(() => import("../components/ForcePasswordChangeModal"));

export default function HomePage() {
  const {
    currentUser,
    activeRole,
    setActiveRole,
    mustChangePassword,
    setMustChangePassword,
    isLoggingIn,
    loginError,
    linkedZaloMeta,
    login,
    loginWithZaloOneTouch,
    logout,
    clearCache
  } = useAuth();

  // Responsive Device & Viewport State
  const [screenWidth, setScreenWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 390));

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isManagementView = activeRole === ROLES.ADMIN || activeRole === ROLES.ACCOUNTANT;

  // Toast notification
  const [toastNotification, setToastNotification] = useState(null);
  const showToast = useCallback((message, type = "info") => {
    setToastNotification({ message, type, id: Date.now() });
    setTimeout(() => {
      setToastNotification(prev => (prev?.message === message ? null : prev));
    }, 3500);
  }, []);

  const handleLoginSubmit = async (username, password) => {
    try {
      const user = await login(username, password);
      showToast(`Đăng nhập thành công với tài khoản ${user?.ho_ten || user?.ma_nv}!`, "success");
    } catch (e) {
      // loginError được useAuth tự động quản lý
    }
  };

  const handleLogout = () => {
    if (window.confirm("Bạn có chắc chắn muốn đăng xuất và kết thúc phiên làm việc?")) {
      const msg = logout();
      showToast(msg, "info");
    }
  };

  const handlePasswordChanged = () => {
    setMustChangePassword(false);
    showToast("Đổi mật khẩu thành công! Tài khoản của bạn đã được bảo vệ.", "success");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-600 selection:text-white">
      {/* 1. Màn hình Chưa Đăng Nhập */}
      {!currentUser ? (
        <AuthView
          onLogin={handleLoginSubmit}
          onZaloOneTouchLogin={async () => {
            const user = await loginWithZaloOneTouch(false);
            if (user) {
              showToast(`Đăng nhập nhanh 1 chạm thành công: ${user.ho_ten || user.ma_nv}!`, "success");
            }
          }}
          linkedZaloMeta={linkedZaloMeta}
          isLoggingIn={isLoggingIn}
          loginError={loginError}
          onClearCache={clearCache}
        />
      ) : isManagementView ? (
        /* 2. Giao Diện Quản Trị & Kế Toán (Tương thích cả Mobile Zalo Mini App & PC) */
        <DesktopDashboard
          currentUser={currentUser}
          activeRole={activeRole}
          onRoleSwitch={setActiveRole}
          screenWidth={screenWidth}
          onLogout={handleLogout}
          showToast={showToast}
          onChangePasswordRequest={() => setMustChangePassword(true)}
        />
      ) : (
        /* 3. Giao Diện Mobile (Công Nhân Zalo Mini App) */
        <WorkerDashboard
          currentUser={currentUser}
          activeRole={activeRole}
          onRoleSwitch={setActiveRole}
          onLogout={handleLogout}
          showToast={showToast}
          onChangePasswordRequest={() => setMustChangePassword(true)}
        />
      )}

      {/* Modal Bắt Buộc Đổi Mật Khẩu Lần Đầu */}
      {currentUser && mustChangePassword && (
        <Suspense fallback={null}>
          <ForcePasswordChangeModal
            visible={true}
            maNv={currentUser.ma_nv}
            token={currentUser.token}
            onPasswordChanged={handlePasswordChanged}
          />
        </Suspense>
      )}

      {/* Global Toast Notification Container - Tránh cụm nút mặc định Zalo ở góc trên bên phải */}
      {toastNotification && (
        <div
          className="fixed left-4 right-4 sm:left-auto sm:right-5 z-[120] max-w-sm animate-fade-in"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 54px)" }}
        >
          <div
            className={`p-3.5 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-3 text-xs font-bold ${
              toastNotification.type === "success"
                ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-900/30"
                : toastNotification.type === "error"
                ? "bg-rose-950/90 border-rose-500/40 text-rose-200 shadow-rose-900/30"
                : toastNotification.type === "warning"
                ? "bg-amber-950/90 border-amber-500/40 text-amber-200 shadow-amber-900/30"
                : "bg-slate-900/90 border-slate-700/80 text-slate-200 shadow-slate-950/50"
            }`}
          >
            {toastNotification.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {toastNotification.type === "error" && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {toastNotification.type === "warning" && <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />}
            {toastNotification.type === "info" && <Info className="w-4 h-4 text-blue-400 shrink-0" />}
            <span>{toastNotification.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
