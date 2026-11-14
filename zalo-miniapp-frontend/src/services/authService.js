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
 * Đăng ký mã liên kết mới được cấp bởi HR hoặc Admin
 */
export const registerIssuedLinkCode = (code, userInfo) => {
  if (code && userInfo) {
    const key = code.toUpperCase();
    MOCK_LINK_CODES[key] = userInfo;
    try {
      const stored = JSON.parse(localStorage.getItem("sedinco_issued_link_codes") || "{}");
      stored[key] = userInfo;
      localStorage.setItem("sedinco_issued_link_codes", JSON.stringify(stored));
    } catch (e) {}
  }
};

/**
 * F0: Xác định phiên đăng nhập tự động khi mở Mini App (kiểm tra cache cục bộ hợp lệ)
 */
export const resolveSession = async () => {
  try {
    // Kiểm tra phiên lưu trữ cục bộ (Web hoặc đã đăng nhập trước đó; Zalo Auto-Login đã được xử lý qua /zalo-auto-login)
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.ma_nv && parsed.token && parsed.token !== "mock_jwt_token") {
          return {
            isDetermined: true,
            isLinked: true,
            role: parsed.role || ROLES.EMPLOYEE,
            employee: parsed,
            token: parsed.token
          };
        }
      } catch (e) {}
    }

    // Nếu chưa đăng nhập / chưa liên kết
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
 * F1: Tra cứu thông tin nhân viên theo mã liên kết cục bộ
 */
export const previewLinkCode = async (code) => {
  const cleanCode = String(code).trim().toUpperCase();
  if (cleanCode.length < 6) {
    throw new Error("Mã liên kết phải có tối thiểu 6-8 ký tự.");
  }

  if (MOCK_LINK_CODES[cleanCode]) {
    return MOCK_LINK_CODES[cleanCode];
  }
  try {
    const stored = JSON.parse(localStorage.getItem("sedinco_issued_link_codes") || "{}");
    if (stored[cleanCode]) return stored[cleanCode];
  } catch (e) {}

  throw new Error("Mã liên kết không tồn tại hoặc đã hết hạn. Vui lòng đăng nhập bằng Mã NV & Mật khẩu.");
};

/**
 * F1: Liên kết tài khoản Zalo qua tài khoản nhân viên đang hoạt động
 */
export const confirmLinkAccount = async (code, zaloAccessToken) => {
  const cleanCode = String(code).trim().toUpperCase();
  if (zaloAccessToken) {
    const res = await safePost("/employees/bind-zalo", { zalo_token: zaloAccessToken }, {
      idempotencyKey: generateIdempotencyKey("link")
    });
    if (res?.success) {
      return { success: true, data: res.data };
    }
  }

  let mockUser = MOCK_LINK_CODES[cleanCode];
  if (!mockUser) {
    try {
      const stored = JSON.parse(localStorage.getItem("sedinco_issued_link_codes") || "{}");
      if (stored[cleanCode]) mockUser = stored[cleanCode];
    } catch (e) {}
  }
  if (mockUser) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(mockUser));
    return { success: true, user: mockUser, role: mockUser.role, token: "" };
  }

  throw new Error("Không thể liên kết tài khoản. Vui lòng đăng nhập bằng Mã nhân viên & Mật khẩu.");
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

  const payload = res?.data || res;
  const user = payload?.user || (payload?.ma_nv ? payload : null);
  if (user) {
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
