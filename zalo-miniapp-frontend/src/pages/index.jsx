import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import { useFontScale } from "../context/FontScaleContext";
import ConfirmDialog from "../components/ConfirmDialog";
import { AppButton, AppModal } from "../components/ui";
import AuthView from "../views/AuthView";
import CompanyLogo from "../components/CompanyLogo";
import WorkerDashboard from "../views/worker/WorkerDashboard";
import DesktopDashboard from "../views/desktop/DesktopDashboard";
import { ROLES } from "../constants/roles";
import { CheckCircle2, AlertCircle, Info, X, Loader2, WifiOff, RefreshCw, ShieldAlert, Smartphone } from "lucide-react";

// Lazy-load modal đổi mật khẩu bắt buộc
const ForcePasswordChangeModal = lazy(() => import("../components/ForcePasswordChangeModal"));

export default function HomePage() {
  const { isDark, syncThemeFromUser } = useTheme();
  const { syncFontScaleFromUser } = useFontScale();

  // Toast notification (định nghĩa trước useAuth để truyền callback thông báo khi bị thu hồi phiên)
  const [toastNotification, setToastNotification] = useState(null);
  const showToast = useCallback((message, type = "info") => {
    setToastNotification({ message, type, id: Date.now() });
    setTimeout(() => {
      setToastNotification(prev => (prev?.message === message ? null : prev));
    }, 3500);
  }, []);

  const handleSessionRevoked = useCallback(
    (msg) => {
      showToast(
        msg || "Phiên đăng nhập đã hết hạn hoặc tài khoản vừa được cập nhật, vui lòng đăng nhập lại.",
        "warning"
      );
    },
    [showToast]
  );

  const {
    currentUser,
    updateCurrentUser,
    activeRole,
    mustChangePassword,
    setMustChangePassword,
    skippedPasswordChange,
    skipPasswordChange,
    deviceWarning,
    dismissDeviceWarning,
    isHydratingSession,
    sessionNetworkError,
    retrySessionHydration,
    recentUsernames,
    removeRecentUsername,
    isLoggingIn,
    loginError,
    login,
    logout,
    clearCache
  } = useAuth({
    onThemeSync: syncThemeFromUser,
    onFontScaleSync: syncFontScaleFromUser,
    onSessionRevoked: handleSessionRevoked
  });

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [checkInDeviceWarning, setCheckInDeviceWarning] = useState(null);

  const isManagementView = activeRole === ROLES.ADMIN || activeRole === ROLES.ACCOUNTANT;

  const activeDeviceWarning = checkInDeviceWarning || deviceWarning || null;
  const shouldShowPasswordModal = Boolean(
    currentUser && ((mustChangePassword && !skippedPasswordChange) || showAccountModal)
  );
  const handleDismissDeviceWarning = () => {
    setCheckInDeviceWarning(null);
    dismissDeviceWarning();
  };

  useEffect(() => {
    if (!currentUser) {
      setCheckInDeviceWarning(null);
      setShowAccountModal(false);
    }
  }, [currentUser]);

  const handleLoginSubmit = async (username, password) => {
    try {
      setCheckInDeviceWarning(null);
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
    setCheckInDeviceWarning(null);
    const msg = logout();
    showToast(msg, "info");
  };

  const handlePasswordChanged = (updatedUser, freshToken) => {
    if (updatedUser) {
      updateCurrentUser({ ...updatedUser, must_change_password: false }, freshToken);
    } else {
      updateCurrentUser({ must_change_password: false }, freshToken);
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
      {/* 0. Splash kiểm tra & khôi phục phiên từ nativeStorage (tránh nháy AuthView) */}
      {isHydratingSession ? (
        <div
          data-testid="auth-session-hydrating"
          className="flex flex-col items-center justify-center px-6 text-center"
          style={{
            minHeight: "var(--visual-vh)",
            paddingTop: "calc(var(--safe-area-top) + 16px)",
            paddingBottom: "max(var(--safe-area-bottom), 24px)"
          }}
        >
          <CompanyLogo size="default" theme={isDark ? "dark" : "light"} iconOnly />
          <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <Loader2 className="w-4 h-4 animate-spin text-[#E11D48] dark:text-rose-400" />
            <span>Đang khôi phục phiên đăng nhập...</span>
          </div>
        </div>
      ) : !currentUser && sessionNetworkError ? (
        <div
          data-testid="auth-session-network-error"
          className="flex flex-col items-center justify-center px-4"
          style={{
            minHeight: "var(--visual-vh)",
            paddingTop: "calc(var(--safe-area-top) + 16px)",
            paddingBottom: "max(var(--safe-area-bottom), 24px)"
          }}
        >
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-6 text-center shadow-lg space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-700 text-amber-600 dark:text-amber-300 flex items-center justify-center mx-auto">
              <WifiOff className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-extrabold text-[#111C2D] dark:text-white">
                Không thể kết nối máy chủ
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed whitespace-normal break-words">
                {sessionNetworkError}
              </p>
            </div>
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={retrySessionHydration}
                className="w-full min-h-[48px] py-3 bg-[#E11D48] hover:bg-[#BE123C] dark:bg-rose-600 dark:hover:bg-rose-500 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Thử kết nối lại</span>
              </button>
              <button
                type="button"
                onClick={logout}
                className="w-full min-h-[44px] py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl cursor-pointer"
              >
                Đăng nhập tài khoản khác
              </button>
            </div>
          </div>
        </div>
      ) : !currentUser ? (
        <AuthView
          onLogin={handleLoginSubmit}
          isLoggingIn={isLoggingIn}
          loginError={loginError}
          recentUsernames={recentUsernames}
          onRemoveRecentUsername={removeRecentUsername}
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
          onDeviceWarning={(w) => setCheckInDeviceWarning(w)}
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
          onDeviceWarning={(w) => setCheckInDeviceWarning(w)}
        />
      )}

      {/* Modal Tài Khoản & Đổi Mật Khẩu (Khả dụng cho cả 3 Role, có nút Bỏ qua, đổi sau khi là mật khẩu tạm) */}
      {shouldShowPasswordModal && (
        <Suspense fallback={null}>
          <ForcePasswordChangeModal
            visible={true}
            currentUser={currentUser}
            maNv={currentUser.ma_nv || currentUser.username}
            token={currentUser.token}
            canClose={!mustChangePassword}
            onClose={() => {
              if (!mustChangePassword) {
                setShowAccountModal(false);
              } else {
                skipPasswordChange();
                setShowAccountModal(false);
              }
            }}
            onSkip={
              mustChangePassword
                ? () => {
                    skipPasswordChange();
                    setShowAccountModal(false);
                    showToast("Bạn có thể đổi mật khẩu bất cứ lúc nào trong mục Tài khoản.", "info");
                  }
                : null
            }
            showToast={showToast}
            onPasswordChanged={handlePasswordChanged}
          />
        </Suspense>
      )}

      {/* Cảnh báo mềm thiết bị lạ / dùng chung thiết bị (KHÔNG CHẶN chấm công & đăng nhập) */}
      <AppModal
        open={Boolean(currentUser && activeDeviceWarning && !shouldShowPasswordModal)}
        onClose={handleDismissDeviceWarning}
        variant="dialog"
        align="center"
        maxWidthClass="max-w-md"
        testId="soft-device-warning-modal"
        title={
          activeDeviceWarning?.title ||
          (String(activeDeviceWarning?.type || "").includes("SHARED")
            ? "Cảnh báo dùng chung thiết bị"
            : "Phát hiện đăng nhập từ thiết bị mới")
        }
        subtitle="Thao tác của bạn vẫn được ghi nhận bình thường"
        icon={
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            String(activeDeviceWarning?.type || "").includes("SHARED")
              ? "bg-rose-100 text-rose-600 dark:bg-rose-950/70 dark:text-rose-300"
              : "bg-amber-100 text-amber-600 dark:bg-amber-950/70 dark:text-amber-300"
          }`}>
            <ShieldAlert className="w-5 h-5" />
          </div>
        }
        footer={
          <AppButton
            type="button"
            variant={String(activeDeviceWarning?.type || "").includes("SHARED") ? "danger" : "primary"}
            size="md"
            fullWidth
            data-testid="dismiss-device-warning-btn"
            onClick={handleDismissDeviceWarning}
          >
            Đã hiểu
          </AppButton>
        }
      >
        {activeDeviceWarning && (
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
            <p className="leading-relaxed whitespace-normal break-words">
              {activeDeviceWarning.user_message ||
                activeDeviceWarning.message ||
                "Hệ thống ghi nhận bạn đang thao tác từ thiết bị khác với thiết bị chính đã đăng ký."}
            </p>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-3 space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <Smartphone className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-slate-500 dark:text-slate-400">Thiết bị hiện tại</div>
                  <div className="font-bold text-slate-900 dark:text-white whitespace-normal break-words">
                    {activeDeviceWarning.device_name || "Thiết bị chưa xác định"}
                  </div>
                </div>
              </div>
              {activeDeviceWarning.primary_device_name && (
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 space-y-0.5">
                  <div className="text-slate-500 dark:text-slate-400">Thiết bị chính đã ghi nhận</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words">
                    {activeDeviceWarning.primary_device_name}
                  </div>
                </div>
              )}
              {String(activeDeviceWarning?.type || "").includes("SHARED") &&
                (activeDeviceWarning.shared_with_user_label || activeDeviceWarning.shared_with_user_id) && (
                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 space-y-0.5">
                    <div className="text-slate-500 dark:text-slate-400">Tài khoản từng dùng thiết bị này</div>
                    <div className="font-bold text-rose-600 dark:text-rose-400 whitespace-normal break-words">
                      {activeDeviceWarning.shared_with_user_label || activeDeviceWarning.shared_with_user_id}
                    </div>
                  </div>
                )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed whitespace-normal break-words">
              Thông tin này đã được lưu vào lịch sử thiết bị và gửi báo cáo đối soát cho Quản trị viên. Bạn vẫn có thể tiếp tục sử dụng bình thường.
            </p>
          </div>
        )}
      </AppModal>

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
