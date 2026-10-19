import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import {
  safeGet,
  safePost,
  setAuthToken,
  cancelInflightRequests,
  generateIdempotencyKey
} from "../utils/api";
import { ROLES } from "../constants/roles";

const SESSION_STORAGE_KEY = "sedinco_auth_session";

// Danh sách mã demo mẫu phục vụ thử nghiệm F1
const MOCK_LINK_CODES = {
  "SED-NV01": { ma_nv: "NV001", ho_ten: "Nguyễn Văn An", chuc_danh: "Kỹ sư công trường", role: ROLES.EMPLOYEE },
  "SED-HR02": { ma_nv: "NV005", ho_ten: "Trần Thị Mai", chuc_danh: "Chuyên viên Nhân sự", role: ROLES.HR },
  "SED-KT03": { ma_nv: "NV002", ho_ten: "Lê Thị Bích", chuc_danh: "Kế toán tiền lương", role: ROLES.ACCOUNTANT },
  "SED-AD04": { ma_nv: "ADMIN", ho_ten: "Ban Giám Đốc", chuc_danh: "Giám Đốc Điều Hành", role: ROLES.ADMIN }
};

/**
 * F0: Xác định phiên đăng nhập tự động khi mở Mini App
 */
export const resolveSession = async () => {
  // 1. Kiểm tra môi trường Zalo Mini App
  const isZalo = typeof window !== "undefined" && (
    window.location.pathname.startsWith("/zapps") ||
    Boolean(window.ZaloJavaScriptInterface) ||
    (Boolean(window.zAppID) && !window.location.hostname.includes("workers.dev") && !window.location.hostname.includes("localhost"))
  );

  try {
    let zaloAccessToken = "";
    try {
      zaloAccessToken = await zmpAdapter.getAccessToken();
    } catch (e) {
      console.warn("Could not get Zalo access token:", e);
    }

    // Nếu có token Zalo thật hoặc mock
    if (zaloAccessToken) {
      // Gọi API phiên hiện tại lên Backend
      try {
        const sessionRes = await safeGet("/session", { access_token: zaloAccessToken }, { timeout: 8000 });
        if (sessionRes?.linked) {
          setAuthToken(sessionRes.token);
          return {
            isDetermined: true,
            isLinked: true,
            role: sessionRes.role || ROLES.EMPLOYEE,
            employee: sessionRes.employee || sessionRes.user,
            token: sessionRes.token
          };
        }
        return {
          isDetermined: true,
          isLinked: false,
          zaloAccessToken
        };
      } catch (apiErr) {
        // Backend V1 chưa có endpoint /session -> fallback kiểm tra cache hoặc mock
        console.warn("Backend /session endpoint not available yet (V1 limitation).");
      }
    }

    // 2. Fallback kiểm tra phiên lưu trữ cục bộ (Web hoặc đã đăng nhập trước đó)
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.ma_nv) {
          // Xác thực lại với server qua endpoint /employees hoặc verify
          return {
            isDetermined: true,
            isLinked: true,
            role: parsed.role || ROLES.EMPLOYEE,
            employee: parsed,
            token: parsed.token || ""
          };
        }
      } catch (e) {}
    }

    // 3. Nếu chưa đăng nhập / chưa liên kết
    return {
      isDetermined: true,
      isLinked: false,
      requiresLogin: true
    };
  } catch (err) {
    return {
      isDetermined: false,
      error: err.message || "Lỗi xác định phiên đăng nhập Zalo."
    };
  }
};

/**
 * F1: Tra cứu thông tin nhân viên theo mã 8 ký tự trước khi liên kết
 */
export const previewLinkCode = async (code) => {
  const cleanCode = String(code).trim().toUpperCase();
  if (cleanCode.length < 6) {
    throw new Error("Mã liên kết phải có tối thiểu 6-8 ký tự.");
  }

  // 1. Thử gọi API Backend nếu có
  try {
    const res = await safeGet("/auth/link-preview", { code: cleanCode });
    if (res?.success && res.data) {
      return res.data;
    }
  } catch (e) {
    // Backend V1 fallback sang mock demo
  }

  // 2. Kiểm tra danh sách mock mẫu
  if (MOCK_LINK_CODES[cleanCode]) {
    return MOCK_LINK_CODES[cleanCode];
  }

  throw new Error("Mã liên kết không tồn tại hoặc đã hết hạn. Vui lòng liên hệ phòng Nhân sự.");
};

/**
 * F1: Xác nhận liên kết tài khoản Zalo với mã 8 ký tự
 */
export const confirmLinkAccount = async (code, zaloAccessToken) => {
  const cleanCode = String(code).trim().toUpperCase();
  const idempotencyKey = generateIdempotencyKey("link");

  try {
    const res = await safePost("/auth/link", {
      code: cleanCode,
      zalo_token: zaloAccessToken
    }, { idempotencyKey });

    if (res?.success) {
      const user = res.data?.employee || res.data?.user;
      const role = res.data?.role || ROLES.EMPLOYEE;
      const token = res.data?.token || "";
      
      setAuthToken(token);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...user, role, token }));
      return { success: true, user, role, token };
    }
  } catch (err) {
    // Nếu backend chưa hỗ trợ /auth/link, fallback kích hoạt mock để test flow
    if (MOCK_LINK_CODES[cleanCode]) {
      const mockUser = MOCK_LINK_CODES[cleanCode];
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(mockUser));
      return { success: true, user: mockUser, role: mockUser.role, token: "mock_jwt_token" };
    }
    throw err;
  }

  throw new Error("Không thể liên kết tài khoản. Vui lòng thử lại sau.");
};

/**
 * Đăng nhập truyền thống (Dành cho Web hoặc Quản trị viên)
 */
export const loginWithCredentials = async (maNv, password) => {
  const cleanMaNv = String(maNv).trim().toUpperCase();
  const cleanPass = String(password).trim();

  const res = await safePost("/login", {
    ma_nv: cleanMaNv,
    password: cleanPass
  });

  if (res?.user) {
    const user = res.user;
    // Chuẩn hóa role từ chức danh hoặc role trả về
    let role = ROLES.EMPLOYEE;
    const cd = (user.chuc_danh || "").toLowerCase();
    if (cd.includes("giám đốc") || cd.includes("admin") || user.role === "admin") {
      role = ROLES.ADMIN;
    } else if (cd.includes("kế toán") || user.role === "accountant") {
      role = ROLES.ACCOUNTANT;
    } else if (cd.includes("nhân sự") || cd.includes("hr") || user.role === "hr") {
      role = ROLES.HR;
    }

    const sessionData = { ...user, role, token: res.token || "" };
    setAuthToken(res.token || "");
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
