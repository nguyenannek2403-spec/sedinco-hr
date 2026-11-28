import { useState, useEffect, useCallback, useRef } from "react";
import { ROLES } from "../constants/roles";
import {
  setAuthToken,
  safeGet,
  safePost,
  setOnUnauthorizedCallback
} from "../utils/api";
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  RECENT_USERNAMES_KEY,
  loadStoredSession,
  saveStoredSession,
  clearStoredSession,
  loadRecentUsernamesSync,
  loadRecentUsernames,
  pushRecentUsername,
  removeRecentUsername as removeStoredRecentUsername
} from "../services/authService";
import { getDeviceIdentity, sanitizeSingleDeviceModelName } from "../utils/deviceIdentity";

function mapRawUserToSession(rawUser, validToken) {
  let resolvedRole = ROLES.WORKER;
  const u = String(rawUser?.ma_nv || rawUser?.username || "").toUpperCase();
  if (rawUser?.role === "admin" || rawUser?.role === "accountant" || rawUser?.role === "worker") {
    resolvedRole = rawUser.role;
  } else if (u === "ADMIN" || rawUser?.username === "admin") {
    resolvedRole = ROLES.ADMIN;
  } else if (u === "NV002" || (rawUser?.chuc_danh && rawUser.chuc_danh.toLowerCase().includes("kế toán"))) {
    resolvedRole = ROLES.ACCOUNTANT;
  }
  const isPureAdmin = resolvedRole === ROLES.ADMIN;

  return {
    resolvedRole,
    safeUser: {
      ma_nv: rawUser?.ma_nv || rawUser?.username || u,
      username: rawUser?.username || null,
      ho_ten: rawUser?.ho_ten || (u === "ADMIN" ? "Ban Giám Đốc" : `Nhân viên ${u}`),
      chuc_danh: rawUser?.chuc_danh || (u === "ADMIN" ? "Tổng Giám Đốc" : "Cán bộ nhân viên"),
      department: rawUser?.department || "Khối Công trình",
      shift_type: isPureAdmin ? null : (rawUser?.shift_type || "FULL_DAY"),
      custom_start_time: isPureAdmin ? null : (rawUser?.custom_start_time || null),
      custom_end_time: isPureAdmin ? null : (rawUser?.custom_end_time || null),
      annual_leave_quota: isPureAdmin ? null : (rawUser?.annual_leave_quota ?? 1),
      bound_device_id: isPureAdmin ? null : (rawUser?.bound_device_id || null),
      bound_device_name: isPureAdmin
        ? null
        : (rawUser?.current_device || rawUser?.bound_device_name)
        ? sanitizeSingleDeviceModelName(rawUser.current_device || rawUser.bound_device_name)
        : null,
      current_device: isPureAdmin ? null : (rawUser?.current_device || null),
      known_devices_json: isPureAdmin ? null : (rawUser?.known_devices_json || null),
      device_history: isPureAdmin ? [] : (Array.isArray(rawUser?.device_history) ? rawUser.device_history : []),
      multi_device_alert: isPureAdmin ? false : Boolean(rawUser?.multi_device_alert),
      device_binding_mode: isPureAdmin ? null : (rawUser?.device_binding_mode || "recording"),
      avatar_url: rawUser?.avatar_url || null,
      phone: rawUser?.phone || rawUser?.dien_thoai || null,
      dien_thoai: rawUser?.phone || rawUser?.dien_thoai || "",
      login_username: rawUser?.login_username || rawUser?.phone || rawUser?.ma_nv || rawUser?.username || u,
      theme_preference: rawUser?.theme_preference === "dark" ? "dark" : "light",
      font_scale: Number(rawUser?.font_scale) || 100,
      bank_code: isPureAdmin ? null : (rawUser?.bank_code || null),
      bank_name: isPureAdmin ? null : (rawUser?.bank_name || null),
      bank_account_number: isPureAdmin ? null : (rawUser?.bank_account_number || null),
      bank_account_name: isPureAdmin ? null : (rawUser?.bank_account_name || null),
      email: rawUser?.email || `${u.toLowerCase()}@sedinco.vn`,
      role: resolvedRole,
      dynamic_permissions: rawUser?.dynamic_permissions || {},
      must_change_password: Boolean(rawUser?.must_change_password),
      token: validToken
    }
  };
}

export function useAuth({ onThemeSync, onFontScaleSync, onSessionRevoked } = {}) {
  const onThemeSyncRef = useRef(onThemeSync);
  onThemeSyncRef.current = onThemeSync;
  const onFontScaleSyncRef = useRef(onFontScaleSync);
  onFontScaleSyncRef.current = onFontScaleSync;
  const onSessionRevokedRef = useRef(onSessionRevoked);
  onSessionRevokedRef.current = onSessionRevoked;

  const [currentUser, setCurrentUser] = useState(null);
  const [activeRole, setActiveRole] = useState(ROLES.WORKER);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isHydratingSession, setIsHydratingSession] = useState(true);
  const [sessionNetworkError, setSessionNetworkError] = useState("");
  const [recentUsernames, setRecentUsernames] = useState(() => loadRecentUsernamesSync());
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  const isLoginSubmittingRef = useRef(false);
  const isHydratingRef = useRef(false);
  const isMountedRef = useRef(true);
  const lastVerifiedTokenRef = useRef("");

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleForceLogout = useCallback((reasonMsg = "Đã đăng xuất khỏi hệ thống.", { showRevokedError = false } = {}) => {
    lastVerifiedTokenRef.current = "";
    clearStoredSession({ preserveRecentUsernames: true });
    setCurrentUser(null);
    setActiveRole(ROLES.WORKER);
    setMustChangePassword(false);
    setSessionNetworkError("");
    setIsHydratingSession(false);
    if (showRevokedError && reasonMsg) {
      setLoginError(reasonMsg);
    }
    return reasonMsg;
  }, []);

  // Tự động kiểm tra JWT từ nativeStorage khi mở app -> gọi GET /api/me để xác thực token_version, role & permissions mới nhất
  const hydrateSession = useCallback(async () => {
    if (isHydratingRef.current) return;
    isHydratingRef.current = true;
    if (isMountedRef.current) {
      setIsHydratingSession(true);
      setSessionNetworkError("");
    }

    try {
      const [stored, loadedRecents] = await Promise.all([
        loadStoredSession(),
        loadRecentUsernames()
      ]);

      if (isMountedRef.current) {
        setRecentUsernames(loadedRecents);
      }

      if (!stored?.hasToken || !stored.token) {
        await clearStoredSession({ preserveRecentUsernames: true });
        if (isMountedRef.current) {
          setCurrentUser(null);
          setActiveRole(ROLES.WORKER);
          setMustChangePassword(false);
          setSessionNetworkError("");
        }
        return;
      }

      setAuthToken(stored.token);

      try {
        const res = await safeGet("/me", {}, { cancelPrevious: false });
        if (!isMountedRef.current) return;

        if (res?.success && res?.data) {
          const mergedRaw = {
            ...(stored.user || {}),
            ...res.data
          };
          const { resolvedRole, safeUser } = mapRawUserToSession(mergedRaw, stored.token);

          lastVerifiedTokenRef.current = stored.token;
          await saveStoredSession(stored.token, safeUser);

          if (safeUser.theme_preference) {
            onThemeSyncRef.current?.(safeUser);
          }
          if (safeUser.font_scale !== undefined) {
            onFontScaleSyncRef.current?.(safeUser);
          }

          setCurrentUser(safeUser);
          setActiveRole(resolvedRole);
          setMustChangePassword(Boolean(safeUser.must_change_password));
          setSessionNetworkError("");
          setLoginError("");
          return;
        }

        // Phản hồi /me không hợp lệ -> xóa phiên
        await clearStoredSession({ preserveRecentUsernames: true });
        setCurrentUser(null);
      } catch (err) {
        if (!isMountedRef.current) return;
        const status = err?.status;
        if (status === 401 || status === 403) {
          // Bị thu hồi bởi token_version / hết hạn / khóa tài khoản -> xóa phiên ngay & yêu cầu đăng nhập lại
          const revokedMessage =
            err?.data?.message ||
            err?.message ||
            "Phiên đăng nhập đã hết hạn hoặc tài khoản vừa được cập nhật, vui lòng đăng nhập lại.";
          handleForceLogout(revokedMessage, { showRevokedError: true });
          return;
        }

        // Lỗi mạng / timeout / 5xx: TUYỆT ĐỐI KHÔNG xóa token khỏi nativeStorage
        setSessionNetworkError(
          err?.message ||
            "Không thể kết nối máy chủ để xác thực phiên đăng nhập. Vui lòng kiểm tra mạng và thử lại."
        );
      }
    } finally {
      isHydratingRef.current = false;
      if (isMountedRef.current) {
        setIsHydratingSession(false);
      }
    }
  }, [handleForceLogout]);

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);

  // Hook 401/403-revoked tự động đăng xuất tức thì và thông báo rõ lý do
  useEffect(() => {
    setOnUnauthorizedCallback((serverMessage) => {
      const msg =
        serverMessage ||
        "Phiên đăng nhập đã hết hạn hoặc tài khoản vừa được cập nhật, vui lòng đăng nhập lại.";
      const wasSignedIn = Boolean(lastVerifiedTokenRef.current);
      handleForceLogout(msg, { showRevokedError: true });
      if (wasSignedIn) {
        onSessionRevokedRef.current?.(msg);
      }
    });
    return () => setOnUnauthorizedCallback(null);
  }, [handleForceLogout]);

  const logout = useCallback(() => {
    setLoginError("");
    return handleForceLogout("Bạn đã đăng xuất an toàn.", { showRevokedError: false });
  }, [handleForceLogout]);

  const clearCache = useCallback(() => {
    try {
      const preservedRecents = loadRecentUsernamesSync();
      clearStoredSession({ preserveRecentUsernames: true });
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(AUTH_USER_KEY);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        if (preservedRecents.length > 0) {
          localStorage.setItem(RECENT_USERNAMES_KEY, JSON.stringify(preservedRecents));
        }
      }
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.clear();
      }
      lastVerifiedTokenRef.current = "";
      setCurrentUser(null);
      setActiveRole(ROLES.WORKER);
      setMustChangePassword(false);
      setSessionNetworkError("");
      setLoginError("");
    } catch (e) {
      console.warn("Lỗi xóa cache:", e);
    }
  }, []);

  const handleRemoveRecentUsername = useCallback(async (username) => {
    const next = await removeStoredRecentUsername(username);
    if (isMountedRef.current) {
      setRecentUsernames(next);
    }
    return next;
  }, []);

  // Xử lý đăng nhập nội bộ bằng Tài khoản / SĐT / Mã NV + Mật khẩu
  const login = useCallback(async (rawUsername, rawPassword) => {
    if (isLoginSubmittingRef.current) return;
    setLoginError("");

    let rawIdentifier = (rawUsername || "").trim();
    let p = (rawPassword || "").trim();

    if (rawIdentifier.includes("-") || rawIdentifier.includes(":")) {
      const sep = rawIdentifier.includes(":") ? ":" : "-";
      const parts = rawIdentifier.split(sep);
      rawIdentifier = parts[0].trim();
      p = parts.slice(1).join(sep).trim();
    }

    const u = rawIdentifier.toUpperCase();

    if (!rawIdentifier || !p) {
      const err = "Vui lòng nhập đầy đủ Tài khoản / SĐT và mật khẩu!";
      setLoginError(err);
      throw new Error(err);
    }

    isLoginSubmittingRef.current = true;
    setIsLoggingIn(true);

    try {
      const identity = await getDeviceIdentity();
      const { device_id, device_model_name: device_name, device_info } = identity;

      let res = await safePost("/login", {
        identifier: rawIdentifier,
        ma_nv: rawIdentifier,
        username: rawIdentifier,
        password: p,
        device_id,
        device_name,
        device_info
      }).catch((err) => err?.data || (err?.message ? { success: false, message: err.message } : null));

      if ((!res || !res.success) && u === "ADMIN") {
        res = await safePost("/admin/login", { username: "admin", password: p });
      }

      if (res?.success && res.data) {
        const rawUser = res.data;
        if (rawUser.is_locked || rawUser.status === "inactive") {
          const msg = "Tài khoản của bạn đã bị TẠM KHÓA bởi Quản trị viên. Vui lòng liên hệ Quản lý!";
          setLoginError(msg);
          throw new Error(msg);
        }

        const validToken = rawUser.token || "";
        if (!validToken) {
          throw new Error("Máy chủ không trả về phiên xác thực hợp lệ.");
        }

        const { resolvedRole, safeUser } = mapRawUserToSession(rawUser, validToken);

        if (rawUser.theme_preference) {
          onThemeSyncRef.current?.(safeUser);
        }
        if (rawUser.font_scale !== undefined) {
          onFontScaleSyncRef.current?.(safeUser);
        }

        lastVerifiedTokenRef.current = validToken;
        await saveStoredSession(validToken, safeUser);
        const updatedRecents = await pushRecentUsername(rawIdentifier);

        setRecentUsernames(updatedRecents);
        setSessionNetworkError("");
        setCurrentUser(safeUser);
        setActiveRole(resolvedRole);
        setMustChangePassword(safeUser.must_change_password);
        return safeUser;
      } else {
        const msg = res?.message || "Tài khoản hoặc mật khẩu không chính xác!";
        setLoginError(msg);
        throw new Error(msg);
      }
    } catch (err) {
      setLoginError(err.message || "Lỗi kết nối máy chủ xác thực.");
      throw err;
    } finally {
      isLoginSubmittingRef.current = false;
      setIsLoggingIn(false);
    }
  }, []);

  const updateCurrentUser = useCallback((updatedFields = {}, newToken = null) => {
    setCurrentUser((prev) => {
      if (!prev && !updatedFields) return prev;
      const resolvedToken = newToken || prev?.token || "";
      const merged = {
        ...(prev || {}),
        ...(updatedFields || {}),
        ...(resolvedToken ? { token: resolvedToken } : {})
      };
      if (newToken) {
        lastVerifiedTokenRef.current = newToken;
      }
      if (resolvedToken) {
        saveStoredSession(resolvedToken, merged).catch(() => {});
      }
      return merged;
    });
    if (updatedFields && typeof updatedFields.must_change_password === "boolean") {
      setMustChangePassword(updatedFields.must_change_password);
    }
  }, []);

  return {
    currentUser,
    setCurrentUser,
    updateCurrentUser,
    activeRole,
    setActiveRole,
    mustChangePassword,
    setMustChangePassword,
    isHydratingSession,
    sessionNetworkError,
    retrySessionHydration: hydrateSession,
    recentUsernames,
    removeRecentUsername: handleRemoveRecentUsername,
    isLoggingIn,
    loginError,
    setLoginError,
    login,
    logout,
    clearCache
  };
}
