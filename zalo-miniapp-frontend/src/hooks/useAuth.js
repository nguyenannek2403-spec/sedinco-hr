import { useState, useEffect, useCallback, useRef } from "react";
import { ROLES } from "../constants/roles";
import {
  setAuthToken,
  safeGet,
  safePost,
  setOnUnauthorizedCallback
} from "../utils/api";
import { resolveSession, logoutSession } from "../services/authService";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { getDeviceIdentity, sanitizeSingleDeviceModelName } from "../utils/deviceIdentity";

const STORAGE_USER_KEY = "sedinco_miniapp_user";
const STORAGE_TOKEN_KEY = "sedinco_auth_token";
const STORAGE_ACCOUNTS_KEY = "sedinco_employee_accounts";
const STORAGE_ZALO_LINK_META = "sedinco_zalo_linked_meta";

async function resolveZaloAndDeviceIdentity() {
  const identity = await getDeviceIdentity();
  const device_id = identity.device_id;
  const device_name = identity.device_model_name;
  const device_info = identity.device_info;
  let zalo_user_id = "";
  let zalo_access_token = "";
  try {
    const [uInfo, tok] = await Promise.all([
      zmpAdapter.getUserInfo().catch(() => null),
      zmpAdapter.getAccessToken({ silent: true }).catch(() => "")
    ]);
    if (tok) {
      zalo_access_token = String(tok);
    }
    if (uInfo?.id) {
      zalo_user_id = String(uInfo.id);
      localStorage.setItem("sedinco_zalo_uid", zalo_user_id);
    }
  } catch {}
  if (!zalo_user_id) {
    try {
      zalo_user_id = localStorage.getItem("sedinco_zalo_uid") || `ZALO_${device_id}`;
    } catch {
      zalo_user_id = `ZALO_${device_id}`;
    }
  }
  return { zalo_user_id, zalo_access_token, device_id, device_name, device_info };
}

export function useAuth({ onThemeSync, onFontScaleSync } = {}) {
  const onThemeSyncRef = useRef(onThemeSync);
  onThemeSyncRef.current = onThemeSync;
  const onFontScaleSyncRef = useRef(onFontScaleSync);
  onFontScaleSyncRef.current = onFontScaleSync;

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_USER_KEY);
      const user = saved ? JSON.parse(saved) : null;
      if (user?.token) {
        setAuthToken(user.token);
      } else {
        const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
        if (storedToken) setAuthToken(storedToken);
      }
      return user;
    } catch {
      return null;
    }
  });

  const [linkedZaloMeta, setLinkedZaloMeta] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_ZALO_LINK_META);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [activeRole, setActiveRole] = useState(() => {
    return currentUser?.role || ROLES.WORKER;
  });

  const [mustChangePassword, setMustChangePassword] = useState(() => {
    return Boolean(currentUser?.must_change_password);
  });

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const isLoginSubmittingRef = useRef(false);

  // V6 Zero-Password Auto Login: Tự động đăng nhập 1 chạm bằng Zalo ID + Device ID
  const loginWithZaloOneTouch = useCallback(async (isSilentAuto = false) => {
    if (isLoginSubmittingRef.current) return null;
    if (!isSilentAuto) setLoginError("");
    isLoginSubmittingRef.current = true;
    setIsLoggingIn(true);

    try {
      const { zalo_user_id, zalo_access_token, device_id, device_name, device_info } = await resolveZaloAndDeviceIdentity();
      let meta = null;
      try {
        meta = JSON.parse(localStorage.getItem(STORAGE_ZALO_LINK_META) || "null");
      } catch {}

      const res = await safePost("/auth/zalo-auto-login", {
        zalo_user_id,
        zalo_access_token: zalo_access_token || undefined,
        zalo_token: zalo_access_token || undefined,
        device_id,
        device_name,
        device_info,
        ma_nv: meta?.ma_nv || undefined
      });

      if (res?.success && res.data) {
        const rawUser = res.data;
        let resolvedRole = ROLES.WORKER;
        const u = String(rawUser.ma_nv || rawUser.username || "").toUpperCase();
        if (rawUser.role === "admin" || rawUser.role === "accountant" || rawUser.role === "worker") {
          resolvedRole = rawUser.role;
        } else if (u === "ADMIN" || rawUser.username === "admin") {
          resolvedRole = ROLES.ADMIN;
        } else if (u === "NV002" || (rawUser.chuc_danh && rawUser.chuc_danh.toLowerCase().includes("kế toán"))) {
          resolvedRole = ROLES.ACCOUNTANT;
        }
        const isPureAdmin = resolvedRole === ROLES.ADMIN;

        const validToken = rawUser.token || `token_${Date.now()}`;
        setAuthToken(validToken);
        localStorage.setItem(STORAGE_TOKEN_KEY, validToken);

        const safeUser = {
          ma_nv: rawUser.ma_nv || rawUser.username || u,
          username: rawUser.username || null,
          ho_ten: rawUser.ho_ten || `Nhân viên ${u}`,
          chuc_danh: rawUser.chuc_danh || "Cán bộ nhân viên",
          department: rawUser.department || "Khối Công trình",
          shift_type: isPureAdmin ? null : (rawUser.shift_type || "FULL_DAY"),
          custom_start_time: isPureAdmin ? null : (rawUser.custom_start_time || null),
          custom_end_time: isPureAdmin ? null : (rawUser.custom_end_time || null),
          annual_leave_quota: isPureAdmin ? null : (rawUser.annual_leave_quota ?? 12),
          bound_device_id: isPureAdmin ? null : (rawUser.bound_device_id || null),
          bound_device_name: isPureAdmin
            ? null
            : rawUser.bound_device_name
            ? sanitizeSingleDeviceModelName(rawUser.bound_device_name)
            : (device_name || null),
          known_devices_json: isPureAdmin ? null : (rawUser.known_devices_json || null),
          multi_device_alert: isPureAdmin ? false : Boolean(rawUser.multi_device_alert),
          device_binding_mode: isPureAdmin ? null : (rawUser.device_binding_mode || "recording"),
          avatar_url: rawUser.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
          phone: rawUser.phone || rawUser.dien_thoai || null,
          dien_thoai: rawUser.phone || rawUser.dien_thoai || "",
          login_username: rawUser.login_username || rawUser.phone || rawUser.ma_nv || rawUser.username || u,
          theme_preference: rawUser.theme_preference === "dark" ? "dark" : "light",
          font_scale: Number(rawUser.font_scale) || 100,
          email: rawUser.email || `${u.toLowerCase()}@sedinco.vn`,
          role: resolvedRole,
          dynamic_permissions: rawUser.dynamic_permissions || {},
          must_change_password: Boolean(rawUser.must_change_password),
          token: validToken
        };

        if (rawUser.theme_preference) {
          onThemeSyncRef.current?.(safeUser);
        }
        if (rawUser.font_scale !== undefined) {
          onFontScaleSyncRef.current?.(safeUser);
        }

        const newMeta = {
          ma_nv: safeUser.ma_nv,
          ho_ten: safeUser.ho_ten,
          chuc_danh: safeUser.chuc_danh,
          role: resolvedRole,
          zalo_user_id,
          device_id
        };
        localStorage.setItem(STORAGE_ZALO_LINK_META, JSON.stringify(newMeta));
        setLinkedZaloMeta(newMeta);
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(safeUser));
        sessionStorage.removeItem("sedinco_manual_logout");
        setCurrentUser(safeUser);
        setActiveRole(resolvedRole);
        setMustChangePassword(safeUser.must_change_password);
        return safeUser;
      } else {
        if (!isSilentAuto) {
          setLoginError(res?.message || "Thiết bị chưa liên kết Zalo ID. Vui lòng nhập Mã NV & Mật khẩu lần đầu!");
        }
        return null;
      }
    } catch (err) {
      if (!isSilentAuto) {
        setLoginError(err.message || "Không thể đăng nhập nhanh bằng Zalo. Vui lòng nhập mật khẩu.");
      }
      return null;
    } finally {
      isLoginSubmittingRef.current = false;
      setIsLoggingIn(false);
    }
  }, []);

  // F0 & V6: Tự động phân giải phiên Zalo Mini App khi mở ứng dụng (từ lần 2 tự động vào thẳng trong 0.5s)
  useEffect(() => {
    let isMounted = true;
    const checkZaloSession = async () => {
      if (!currentUser) {
        const manualLoggedOut = sessionStorage.getItem("sedinco_manual_logout") === "1";
        if (!manualLoggedOut) {
          const autoUser = await loginWithZaloOneTouch(true);
          if (isMounted && autoUser) return;
        }

        try {
          const session = await resolveSession();
          if (isMounted && session?.isLinked && session?.user) {
            const user = session.user;
            const role = user.role || ROLES.WORKER;
            setCurrentUser(user);
            setActiveRole(role);
            setMustChangePassword(Boolean(user.must_change_password));
            localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
          }
        } catch (e) {
          // Bỏ qua trên môi trường dev/web
        }
      }
    };
    checkZaloSession();
    return () => { isMounted = false; };
  }, [currentUser, loginWithZaloOneTouch]);

  // Hook 401 Unauthorized tự động đăng xuất an toàn
  useEffect(() => {
    setOnUnauthorizedCallback(() => {
      handleForceLogout("Phiên làm việc đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.");
    });
  }, []);

  const handleForceLogout = useCallback((reasonMsg = "Đã đăng xuất khỏi hệ thống.") => {
    logoutSession();
    setAuthToken("");
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    sessionStorage.setItem("sedinco_manual_logout", "1");
    setCurrentUser(null);
    setActiveRole(ROLES.WORKER);
    setMustChangePassword(false);
    return reasonMsg;
  }, []);

  const logout = useCallback(() => {
    return handleForceLogout("Bạn đã đăng xuất an toàn.");
  }, [handleForceLogout]);

  const clearCache = useCallback(() => {
    try {
      logoutSession();
      localStorage.clear();
      sessionStorage.clear();
      setAuthToken("");
      setCurrentUser(null);
      setLinkedZaloMeta(null);
      setActiveRole(ROLES.WORKER);
      setMustChangePassword(false);
      setLoginError("");
    } catch (e) {
      console.warn("Lỗi xóa cache:", e);
    }
  }, []);

  // Xử lý đăng nhập bằng SĐT / Tài khoản / Mã NV (tự động gắn zalo_user_id + device_id lần đầu)
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
      const err = "Vui lòng nhập đầy đủ SĐT / tài khoản và mật khẩu!";
      setLoginError(err);
      throw new Error(err);
    }

    isLoginSubmittingRef.current = true;
    setIsLoggingIn(true);

    try {
      const { zalo_user_id, zalo_access_token, device_id, device_name, device_info } = await resolveZaloAndDeviceIdentity();

      // 1. Kiểm tra tài khoản local cache cấp phát
      const storedAccounts = JSON.parse(localStorage.getItem(STORAGE_ACCOUNTS_KEY) || "{}");
      if (storedAccounts[u] && u !== "ADMIN") {
        const acc = storedAccounts[u];
        if (acc.is_locked || acc.status === "inactive") {
          const msg = "Tài khoản của bạn đã bị TẠM KHÓA bởi Quản trị viên. Vui lòng liên hệ phòng Nhân sự!";
          setLoginError(msg);
          throw new Error(msg);
        }
        if (acc.password === p) {
          const resolvedRole = acc.role || ROLES.WORKER;
          const mockToken = `local_token_${Date.now()}`;
          setAuthToken(mockToken);
          localStorage.setItem(STORAGE_TOKEN_KEY, mockToken);

          const safeUser = {
            ma_nv: acc.ma_nv,
            ho_ten: acc.ho_ten || `Nhân viên ${u}`,
            chuc_danh: acc.chuc_danh || "Cán bộ nhân viên",
            avatar_url: acc.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
            phone: acc.phone || acc.dien_thoai || null,
            dien_thoai: acc.phone || acc.dien_thoai || "0905123456",
            login_username: acc.login_username || acc.phone || acc.ma_nv,
            theme_preference: acc.theme_preference === "dark" ? "dark" : "light",
            email: acc.email || `${u.toLowerCase()}@sedinco.vn`,
            role: resolvedRole,
            must_change_password: Boolean(acc.must_change_password),
            token: mockToken
          };

          localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(safeUser));
          sessionStorage.removeItem("sedinco_manual_logout");
          setCurrentUser(safeUser);
          setActiveRole(resolvedRole);
          setMustChangePassword(safeUser.must_change_password);
          return safeUser;
        } else {
          const msg = "Mật khẩu không chính xác!";
          setLoginError(msg);
          throw new Error(msg);
        }
      }

      // 2. Xác thực hợp nhất với Backend REST API (hỗ trợ SĐT / Tài khoản / Mã NV) + Liên kết Zalo ID & Device ID
      let res = await safePost("/login", {
        identifier: rawIdentifier,
        ma_nv: rawIdentifier,
        username: rawIdentifier,
        password: p,
        zalo_user_id,
        zalo_access_token: zalo_access_token || undefined,
        zalo_token: zalo_access_token || undefined,
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

        let resolvedRole = ROLES.WORKER;
        if (rawUser.role === "admin" || rawUser.role === "accountant" || rawUser.role === "worker") {
          resolvedRole = rawUser.role;
        } else if (u === "ADMIN" || rawUser.username === "admin") {
          resolvedRole = ROLES.ADMIN;
        } else if (u === "NV002" || (rawUser.chuc_danh && rawUser.chuc_danh.toLowerCase().includes("kế toán"))) {
          resolvedRole = ROLES.ACCOUNTANT;
        }
        const isPureAdmin = resolvedRole === ROLES.ADMIN;

        const validToken = rawUser.token || `token_${Date.now()}`;
        setAuthToken(validToken);
        localStorage.setItem(STORAGE_TOKEN_KEY, validToken);

        const safeUser = {
          ma_nv: rawUser.ma_nv || rawUser.username || rawIdentifier,
          username: rawUser.username || null,
          ho_ten: rawUser.ho_ten || (u === "ADMIN" ? "Ban Giám Đốc" : `Nhân viên ${rawIdentifier}`),
          chuc_danh: rawUser.chuc_danh || (u === "ADMIN" ? "Tổng Giám Đốc" : "Cán bộ nhân viên"),
          department: rawUser.department || "Khối Công trình",
          shift_type: isPureAdmin ? null : (rawUser.shift_type || "FULL_DAY"),
          custom_start_time: isPureAdmin ? null : (rawUser.custom_start_time || null),
          custom_end_time: isPureAdmin ? null : (rawUser.custom_end_time || null),
          annual_leave_quota: isPureAdmin ? null : (rawUser.annual_leave_quota ?? 12),
          bound_device_id: isPureAdmin ? null : (rawUser.bound_device_id || null),
          bound_device_name: isPureAdmin
            ? null
            : rawUser.bound_device_name
            ? sanitizeSingleDeviceModelName(rawUser.bound_device_name)
            : (device_name || null),
          known_devices_json: isPureAdmin ? null : (rawUser.known_devices_json || null),
          multi_device_alert: isPureAdmin ? false : Boolean(rawUser.multi_device_alert),
          device_binding_mode: isPureAdmin ? null : (rawUser.device_binding_mode || "recording"),
          avatar_url: rawUser.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
          phone: rawUser.phone || rawUser.dien_thoai || null,
          dien_thoai: rawUser.phone || rawUser.dien_thoai || "",
          login_username: rawUser.login_username || rawUser.phone || rawUser.ma_nv || rawUser.username || rawIdentifier,
          theme_preference: rawUser.theme_preference === "dark" ? "dark" : "light",
          font_scale: Number(rawUser.font_scale) || 100,
          email: rawUser.email || `${u.toLowerCase()}@sedinco.vn`,
          role: resolvedRole,
          dynamic_permissions: rawUser.dynamic_permissions || {},
          must_change_password: Boolean(rawUser.must_change_password),
          token: validToken
        };

        if (rawUser.theme_preference) {
          onThemeSyncRef.current?.(safeUser);
        }
        if (rawUser.font_scale !== undefined) {
          onFontScaleSyncRef.current?.(safeUser);
        }

        // Lưu metadata liên kết Zalo 1 chạm trên thiết bị
        if (safeUser.ma_nv && safeUser.ma_nv !== "admin" && resolvedRole !== ROLES.ADMIN) {
          const newMeta = {
            ma_nv: safeUser.ma_nv,
            ho_ten: safeUser.ho_ten,
            chuc_danh: safeUser.chuc_danh,
            role: resolvedRole,
            zalo_user_id,
            device_id
          };
          localStorage.setItem(STORAGE_ZALO_LINK_META, JSON.stringify(newMeta));
          setLinkedZaloMeta(newMeta);
        }

        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(safeUser));
        sessionStorage.removeItem("sedinco_manual_logout");
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
      const merged = {
        ...(prev || {}),
        ...(updatedFields || {}),
        ...(newToken ? { token: newToken } : {})
      };
      if (newToken) {
        setAuthToken(newToken);
        try {
          localStorage.setItem(STORAGE_TOKEN_KEY, newToken);
        } catch {}
      }
      try {
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(merged));
      } catch {}
      return merged;
    });
    if (updatedFields && typeof updatedFields.must_change_password === "boolean") {
      setMustChangePassword(updatedFields.must_change_password);
    }
  }, []);

  // Làm mới thông tin profile (phone, login_username, theme_preference, dynamic_permissions) từ /api/me khi đã có phiên
  useEffect(() => {
    let active = true;
    const token = currentUser?.token || localStorage.getItem(STORAGE_TOKEN_KEY);
    if (!currentUser || !token || String(token).startsWith("local_token_")) return () => {};

    safeGet("/me")
      .then((res) => {
        if (!active || !res?.success || !res?.data) return;
        const fresh = res.data;
        updateCurrentUser({
          ma_nv: fresh.ma_nv || fresh.username || currentUser.ma_nv,
          username: fresh.username || currentUser.username || null,
          ho_ten: fresh.ho_ten || currentUser.ho_ten,
          phone: fresh.phone ?? fresh.dien_thoai ?? currentUser.phone ?? null,
          dien_thoai: fresh.phone ?? fresh.dien_thoai ?? currentUser.dien_thoai ?? "",
          login_username: fresh.login_username || fresh.phone || fresh.ma_nv || fresh.username || currentUser.login_username,
          theme_preference: fresh.theme_preference === "dark" ? "dark" : "light",
          font_scale: Number(fresh.font_scale) || 100,
          dynamic_permissions: fresh.dynamic_permissions || currentUser.dynamic_permissions || {},
          must_change_password: Boolean(fresh.must_change_password)
        });
        if (fresh.theme_preference) {
          onThemeSyncRef.current?.(fresh);
        }
        if (fresh.font_scale !== undefined) {
          onFontScaleSyncRef.current?.(fresh);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [currentUser?.ma_nv, currentUser?.username, updateCurrentUser]);

  return {
    currentUser,
    setCurrentUser,
    updateCurrentUser,
    activeRole,
    setActiveRole,
    mustChangePassword,
    setMustChangePassword,
    isLoggingIn,
    loginError,
    setLoginError,
    linkedZaloMeta,
    login,
    loginWithZaloOneTouch,
    logout,
    clearCache
  };
}
