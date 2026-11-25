import { safePost, setAuthToken, cancelInflightRequests } from "../utils/api";
import { ROLES } from "../constants/roles";
import { zaloAuthService } from "./zalo-auth.service";

const SESSION_STORAGE_KEY = "sedinco_auth_session";

/**
 * F0: Xác định phiên đăng nhập hợp lệ đã lưu cục bộ khi mở app.
 * Không tự động xin quyền Zalo và tuyệt đối không cấp phát tài khoản demo cục bộ.
 */
export const resolveSession = async () => {
  try {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (
          parsed &&
          parsed.ma_nv &&
          parsed.token &&
          parsed.token !== "mock_jwt_token" &&
          !String(parsed.token).startsWith("local_token_")
        ) {
          return {
            isDetermined: true,
            isLinked: true,
            role: parsed.role || ROLES.WORKER,
            user: parsed,
            employee: parsed,
            token: parsed.token
          };
        }
      } catch (e) {}
    }

    return {
      isDetermined: true,
      isLinked: false,
      requiresLogin: true
    };
  } catch (err) {
    return {
      isDetermined: false,
      error: err.message || "Lỗi xác định phiên đăng nhập."
    };
  }
};

/**
 * Liên kết tài khoản Zalo với tài khoản nhân viên đang đăng nhập thông qua zalo-auth.service.
 */
export const confirmLinkAccount = async () => {
  const res = await zaloAuthService.linkZaloToCurrentEmployee();
  if (res.ok) {
    return { success: true, data: res.data };
  }
  throw new Error(res.message || "Không thể liên kết tài khoản Zalo. Vui lòng đăng nhập bằng Mã nhân viên & Mật khẩu.");
};

/**
 * Đăng nhập truyền thống (Dành cho Web hoặc lần đầu liên kết Zalo ID)
 */
export const loginWithCredentials = async (maNv, password) => {
  const cleanMaNv = String(maNv).trim().toUpperCase();
  const cleanPass = String(password).trim();

  const res = await safePost("/login", {
    ma_nv: cleanMaNv,
    password: cleanPass
  });

  const payload = res?.data || res;
  const user = payload?.user || (payload?.ma_nv ? payload : null);
  if (user) {
    let role = ROLES.WORKER;
    const cd = (user.chuc_danh || "").toLowerCase();
    if (cd.includes("giám đốc") || cd.includes("admin") || user.role === "admin") {
      role = ROLES.ADMIN;
    } else if (cd.includes("kế toán") || user.role === "accountant") {
      role = ROLES.ACCOUNTANT;
    } else if (user.role === "worker") {
      role = ROLES.WORKER;
    }

    const sessionData = { ...user, role, token: payload.token || "" };
    setAuthToken(payload.token || "");
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    return { success: true, user: sessionData, role };
  }

  throw new Error(res?.message || "Tài khoản hoặc mật khẩu không chính xác.");
};

/**
 * Đăng xuất an toàn: Xóa token, xóa cache, hủy request đang chạy
 */
export const logoutSession = () => {
  cancelInflightRequests();
  setAuthToken("");
  localStorage.removeItem(SESSION_STORAGE_KEY);
  sessionStorage.clear();
};
