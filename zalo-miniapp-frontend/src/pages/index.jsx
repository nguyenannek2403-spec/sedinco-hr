import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import { useFontScale } from "../context/FontScaleContext";
import ConfirmDialog from "../components/ConfirmDialog";
import AuthView from "../views/AuthView";
import WorkerDashboard from "../views/worker/WorkerDashboard";
import DesktopDashboard from "../views/desktop/DesktopDashboard";
import { ROLES } from "../constants/roles";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

// Lazy-load modal đổi mật khẩu bắt buộc
const ForcePasswordChangeModal = lazy(() => import("../components/ForcePasswordChangeModal"));

export default function HomePage() {
  const { syncThemeFromUser } = useTheme();
  const { syncFontScaleFromUser } = useFontScale();
  const {
    currentUser,
    updateCurrentUser,
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
  } = useAuth({ onThemeSync: syncThemeFromUser, onFontScaleSync: syncFontScaleFromUser });

  const [showAccountModal, setShowAccountModal] = useState(false);

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

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    const msg = logout();
    showToast(msg, "info");
  };

  const handlePasswordChanged = (updatedUser, freshToken) => {
    if (updatedUser) {
      updateCurrentUser(updatedUser, freshToken);
    }
    setMustChangePassword(false);
    setShowAccountModal(false);
    showToast("Cập nhật tài khoản & bảo mật thành công!", "success");
  };

  return (
    <div
      className="overflow-x-hidden bg-[#F1F5F9] dark:bg-[#0B1120] text-[#111C2D] dark:text-slate-100 font-sans selection:bg-[#E11D48] selection:text-white transition-colors duration-200"
      style={{ minHeight: "var(--visual-vh)" }}
    >
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
          onLogout={handleLogout}
          onClearCache={clearCache}
          onUserUpdated={updateCurrentUser}
          showToast={showToast}
          onChangePasswordRequest={() => setShowAccountModal(true)}
        />
      ) : (
        /* 3. Giao Diện Mobile (Công Nhân Zalo Mini App) */
        <WorkerDashboard
          currentUser={currentUser}
          activeRole={activeRole}
          onLogout={handleLogout}
          onUserUpdated={updateCurrentUser}
          showToast={showToast}
          onChangePasswordRequest={() => setShowAccountModal(true)}
        />
      )}

      {/* Modal Tài Khoản & Đổi Mật Khẩu (Khả dụng cho cả 3 Role) */}
      {currentUser && (mustChangePassword || showAccountModal) && (
        <Suspense fallback={null}>
          <ForcePasswordChangeModal
            visible={true}
            currentUser={currentUser}
            maNv={currentUser.ma_nv || currentUser.username}
            token={currentUser.token}
            canClose={!mustChangePassword}
            onClose={() => {
              if (!mustChangePassword) setShowAccountModal(false);
            }}
            showToast={showToast}
            onPasswordChanged={handlePasswordChanged}
          />
        </Suspense>
      )}

      <ConfirmDialog
        open={showLogoutConfirm}
        title="Đăng xuất tài khoản"
        message="Bạn có chắc chắn muốn đăng xuất và kết thúc phiên làm việc hiện tại?"
        confirmLabel="Đăng xuất"
        cancelLabel="Ở lại"
        variant="danger"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      {/* Global Toast Notification Container - Render qua Portal --z-toast (90), tránh header & cụm nút Zalo */}
      {toastNotification && typeof document !== "undefined" &&
        createPortal(
          <div
            data-toast-root="true"
            key={toastNotification.id}
            className="fixed left-1/2 -translate-x-1/2 w-[calc(100vw-24px)] max-w-md animate-toast-down"
            style={{
              zIndex: "var(--z-toast, 90)",
              top: "calc(var(--sat, 0px) + var(--header-min-h, 52px) + 10px)"
            }}
          >
            <div
              className={`relative overflow-hidden p-3.5 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center justify-between gap-2.5 text-xs sm:text-sm font-bold ${
                toastNotification.type === "success"
                  ? "bg-emerald-950/95 border-emerald-500/50 text-emerald-100 shadow-emerald-950/50"
                  : toastNotification.type === "error"
                  ? "bg-rose-950/95 border-rose-500/50 text-rose-100 shadow-rose-950/50"
                  : toastNotification.type === "warning"
                  ? "bg-amber-950/95 border-amber-500/50 text-amber-100 shadow-amber-950/50"
                  : "bg-slate-900/95 border-slate-700 text-slate-100 shadow-slate-950/60"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {toastNotification.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                {toastNotification.type === "error" && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                {toastNotification.type === "warning" && <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />}
                {toastNotification.type === "info" && <Info className="w-4 h-4 text-blue-400 shrink-0" />}
                <span className="min-w-0 flex-1 break-words leading-snug">{toastNotification.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastNotification(null)}
                aria-label="Đóng thông báo"
                className="min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
              <div
                className={`absolute bottom-0 left-0 h-0.5 toast-progress-bar ${
                  toastNotification.type === "success"
                    ? "bg-emerald-400"
                    : toastNotification.type === "error"
                    ? "bg-rose-400"
                    : toastNotification.type === "warning"
                    ? "bg-amber-400"
                    : "bg-blue-400"
                }`}
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
