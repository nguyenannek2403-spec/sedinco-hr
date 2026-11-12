import { useState, useEffect, useCallback, useRef } from "react";
import { ROLES, getDefaultTabForRole } from "../constants/roles";
import {
  setAuthToken,
  safePost,
  cancelInflightRequests,
  setOnUnauthorizedCallback
} from "../utils/api";
import { resolveSession, logoutSession } from "../services/authService";

const STORAGE_USER_KEY = "sedinco_miniapp_user";
const STORAGE_TOKEN_KEY = "sedinco_auth_token";
const STORAGE_ACCOUNTS_KEY = "sedinco_employee_accounts";

export function useAuth() {
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

  const [activeRole, setActiveRole] = useState(() => {
    return currentUser?.role || ROLES.EMPLOYEE;
  });

  const [mustChangePassword, setMustChangePassword] = useState(() => {
    return Boolean(currentUser?.must_change_password);
  });

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const isLoginSubmittingRef = useRef(false);

  // F0: Tự động phân giải phiên Zalo Mini App khi mở ứng dụng
  useEffect(() => {
    let isMounted = true;
    const checkZaloSession = async () => {
      if (!currentUser) {
        try {
          const session = await resolveSession();
          if (isMounted && session?.isLinked && session?.user) {
            const user = session.user;
            const role = user.role || ROLES.EMPLOYEE;
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
  }, [currentUser]);

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
    setCurrentUser(null);
    setActiveRole(ROLES.EMPLOYEE);
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
      setActiveRole(ROLES.EMPLOYEE);
      setMustChangePassword(false);
      setLoginError("");
    } catch (e) {
      console.warn("Lỗi xóa cache:", e);
    }
  }, []);

  // Xử lý đăng nhập tài khoản / mật khẩu
  const login = useCallback(async (rawUsername, rawPassword) => {
    if (isLoginSubmittingRef.current) return;
    setLoginError("");

    let u = (rawUsername || "").trim().toUpperCase();
    let p = (rawPassword || "").trim();

    // Hỗ trợ tự động phân tách nếu người dùng nhập gộp "admin-123456" hoặc "admin:123456"
    if (u.includes("-") || u.includes(":")) {
      const sep = u.includes(":") ? ":" : "-";
      const parts = u.split(sep);
      u = parts[0].trim();
      p = parts.slice(1).join(sep).trim();
    }

    if (!u || !p) {
      const err = "Vui lòng nhập đầy đủ mã nhân viên và mật khẩu!";
      setLoginError(err);
      throw new Error(err);
    }

    isLoginSubmittingRef.current = true;
    setIsLoggingIn(true);

    try {
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
          const resolvedRole = acc.role || ROLES.EMPLOYEE;
          const mockToken = `local_token_${Date.now()}`;
          setAuthToken(mockToken);
          localStorage.setItem(STORAGE_TOKEN_KEY, mockToken);

          const safeUser = {
            ma_nv: acc.ma_nv,
            ho_ten: acc.ho_ten || `Nhân viên ${u}`,
            chuc_danh: acc.chuc_danh || "Cán bộ nhân viên",
            avatar_url: acc.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
            dien_thoai: acc.dien_thoai || "0905123456",
            email: acc.email || `${u.toLowerCase()}@sedinco.vn`,
            role: resolvedRole,
            must_change_password: Boolean(acc.must_change_password),
            token: mockToken
          };

          localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(safeUser));
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

      // 2. Xác thực hợp nhất với Backend REST API (V5 Unified Auto-Routing Login)
      let res = await safePost("/login", { ma_nv: u, username: u, password: p }).catch(() => null);
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
        if (u === "ADMIN" || u === "NV001" || rawUser.username === "admin" || rawUser.role === "admin") {
          resolvedRole = ROLES.ADMIN;
        } else if (u === "NV002" || (rawUser.chuc_danh && rawUser.chuc_danh.toLowerCase().includes("kế toán")) || rawUser.role === "accountant") {
          resolvedRole = ROLES.ACCOUNTANT;
        } else if (rawUser.role === "worker") {
          resolvedRole = ROLES.WORKER;
        } else if (rawUser.role) {
          resolvedRole = rawUser.role;
        }

        const validToken = rawUser.token || `token_${Date.now()}`;
        setAuthToken(validToken);
        localStorage.setItem(STORAGE_TOKEN_KEY, validToken);

        const safeUser = {
          ma_nv: rawUser.ma_nv || rawUser.username || u,
          ho_ten: rawUser.ho_ten || (u === "ADMIN" ? "Ban Giám Đốc" : `Nhân viên ${u}`),
          chuc_danh: rawUser.chuc_danh || (u === "ADMIN" ? "Tổng Giám Đốc" : "Cán bộ nhân viên"),
          avatar_url: rawUser.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
          dien_thoai: rawUser.dien_thoai || "0905123456",
          email: rawUser.email || `${u.toLowerCase()}@sedinco.vn`,
          role: resolvedRole,
          must_change_password: Boolean(rawUser.must_change_password),
          token: validToken
        };

        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(safeUser));
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

  return {
    currentUser,
    setCurrentUser,
    activeRole,
    setActiveRole,
    mustChangePassword,
    setMustChangePassword,
    isLoggingIn,
    loginError,
    setLoginError,
    login,
    logout,
    clearCache
  };
}
