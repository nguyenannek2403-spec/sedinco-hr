import axios from "axios";

export function normalizeApiUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  let trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (!trimmed.endsWith("/api")) {
    trimmed = `${trimmed}/api`;
  }
  return trimmed;
}

export function resolveApiBase() {
  const envUrl = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.VITE_API_URL : null;
  if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
    return normalizeApiUrl(envUrl);
  }
  if (typeof window !== "undefined" && window.__API_BASE__) {
    return normalizeApiUrl(window.__API_BASE__);
  }
  if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    return `${window.location.origin}/api`;
  }
  return "https://sedinco-backend.onrender.com/api";
}

export const API_BASE = resolveApiBase();

// Tạo instance axios có timeout 15s để tránh treo xoay vĩnh viễn
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json"
  }
});

let currentAuthToken = "";
let onUnauthorizedCallback = null;

export const setAuthToken = (token) => {
  currentAuthToken = token || "";
};

export const getAuthToken = () => currentAuthToken;

export const setOnUnauthorizedCallback = (callback) => {
  onUnauthorizedCallback = callback;
};

// Request Interceptor: Gắn Token và Idempotency-Key
apiClient.interceptors.request.use(
  (config) => {
    let token = currentAuthToken;
    if (!token && typeof window !== "undefined") {
      try {
        token = localStorage.getItem("sedinco_auth_token") || "";
        if (!token) {
          const user = JSON.parse(localStorage.getItem("sedinco_miniapp_user") || "{}");
          token = user?.token || "";
        }
      } catch (e) {}
    }
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    if (config.idempotencyKey) {
      config.headers["Idempotency-Key"] = config.idempotencyKey;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Map lưu trữ AbortController theo key để hủy request cũ khi có request mới (chống race condition)
const activeRequests = new Map();

export const cancelInflightRequests = () => {
  activeRequests.forEach((controller) => {
    try {
      controller.abort();
    } catch (e) {}
  });
  activeRequests.clear();
};

export const createRequestKey = (endpoint, params = {}) => {
  return `${endpoint}_${JSON.stringify(params)}`;
};

/**
 * Sinh khóa Idempotency duy nhất cho các tác vụ ghi (chấm công, gửi đơn)
 */
export const generateIdempotencyKey = (prefix = "idemp") => {
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
};

/**
 * Chống Formula Injection và đảm bảo chuẩn RFC 4180 cho các ô CSV / Excel:
 * 1. Ô bắt đầu bằng =, +, -, @, \t, \r được vô hiệu hóa bằng dấu nháy đơn '
 * 2. Ký tự nháy kép " bên trong chuỗi được nhân đôi thành "" theo chuẩn RFC 4180
 */
export const sanitizeFormula = (val) => {
  if (val === null || val === undefined) return "";
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return str.replace(/"/g, '""');
};

export const formatCsvCellRFC4180 = (val) => {
  return `"${sanitizeFormula(val)}"`;
};

// Response Interceptor xử lý tập trung các nhóm mã lỗi theo đặc tả
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (axios.isCancel(error)) {
      return Promise.reject({ isCanceled: true, message: "Yêu cầu đã bị hủy do thao tác mới." });
    }

    const status = error.response?.status;
    let userMessage = "Lỗi kết nối máy chủ, vui lòng thử lại sau.";

    const isRevoked = status === 401 || (status === 403 && (error.response?.data?.code === 'ACCOUNT_REVOKED' || error.response?.data?.message?.includes('chấm dứt') || error.response?.data?.message?.includes('khóa')));
    if (isRevoked) {
      userMessage = error.response?.data?.message || "Phiên đăng nhập đã bị chấm dứt hoặc tài khoản bị khóa.";
      currentAuthToken = "";
      if (onUnauthorizedCallback) onUnauthorizedCallback();
    } else if (status === 403) {
      userMessage = "Bạn không có quyền thực hiện thao tác này (403 Forbidden).";
    } else if (status === 429) {
      const retryAfter = error.response?.headers?.["retry-after"] || 5;
      userMessage = `Thao tác quá nhanh! Vui lòng chờ ${retryAfter} giây trước khi thử lại (429 Rate Limit).`;
    } else if (status === 409) {
      userMessage = error.response?.data?.message || "Dữ liệu bị xung đột hoặc đã được ghi nhận trước đó (409 Conflict).";
    } else if (status === 400 || status === 422) {
      userMessage = error.response?.data?.message || "Dữ liệu yêu cầu không hợp lệ. Vui lòng kiểm tra lại.";
    } else if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      userMessage = "Kết nối quá thời gian chờ (Timeout). Vui lòng kiểm tra mạng và thử lại.";
    } else if (!error.response) {
      userMessage = "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng Internet.";
    } else if (status >= 500) {
      userMessage = "Máy chủ gặp sự cố xử lý nội bộ (5xx). Vui lòng thử lại sau giây lát.";
    }

    if (status && status >= 400) {
      const isClientErrorEndpoint = error.config?.url && String(error.config.url).includes('client-errors');
      if (!isClientErrorEndpoint) {
        reportClientError({
          route: error.config?.url || "",
          error_message: error.response?.data?.message || error.message,
          api_code: error.response?.data?.code || error.code,
          api_status: status
        });
      }
    }

    return Promise.reject({
      status,
      message: userMessage,
      rawError: error,
      data: error.response?.data
    });
  }
);

export const reportClientError = async ({
  route = "",
  error_message = "",
  api_code = "",
  api_status = null,
  role = null
} = {}) => {
  const isEnabled = (typeof import.meta !== "undefined" && import.meta.env && (import.meta.env.VITE_ENABLE_CLIENT_ERROR_REPORTING === "true" || import.meta.env.VITE_ENABLE_CLIENT_ERROR_REPORTING === true)) ||
    (typeof window !== "undefined" && window.__ENABLE_CLIENT_ERROR_REPORTING__ === true);
  if (!isEnabled) return;

  const resolvedRole = role || (() => {
    try {
      const user = JSON.parse(localStorage.getItem("sedinco_miniapp_user") || "{}");
      return user?.role || null;
    } catch (e) {
      return null;
    }
  })();

  const currentRoute = route || (typeof window !== "undefined" ? window.location.pathname + window.location.hash : "");
  if (typeof error_message === "string" && error_message.includes("/client-errors")) return;

  try {
    await fetch(`${API_BASE}/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_time: new Date().toISOString(),
        role: resolvedRole,
        route: String(currentRoute).substring(0, 200),
        error_message: String(error_message || "Unknown error").substring(0, 500),
        api_code: api_code ? String(api_code).substring(0, 50) : undefined,
        api_status: api_status ? Number(api_status) : undefined
      })
    });
  } catch (e) {}
};

export function initGlobalClientErrorListeners() {
  if (typeof window === "undefined" || window.__CLIENT_ERROR_LISTENERS_INITIALIZED__) return;
  window.__CLIENT_ERROR_LISTENERS_INITIALIZED__ = true;

  window.addEventListener("error", (event) => {
    reportClientError({
      route: window.location.pathname + window.location.hash,
      error_message: event.message || (event.error && event.error.message) || "Script Error",
      api_status: null
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = reason?.message || (typeof reason === "string" ? reason : "Unhandled Promise Rejection");
    reportClientError({
      route: window.location.pathname + window.location.hash,
      error_message: msg,
      api_status: reason?.status || null,
      api_code: reason?.code || null
    });
  });
}

if (typeof window !== "undefined") {
  initGlobalClientErrorListeners();
}

/**
 * Gọi API GET an toàn có tự động hủy request cũ và gắn timeout
 */
export const safeGet = async (endpoint, params = {}, options = {}) => {
  const key = options.requestKey || createRequestKey(endpoint, params);
  
  if (options.cancelPrevious && activeRequests.has(key)) {
    activeRequests.get(key).abort();
    activeRequests.delete(key);
  }

  const controller = new AbortController();
  activeRequests.set(key, controller);

  try {
    const res = await apiClient.get(endpoint, {
      params,
      signal: controller.signal,
      ...options
    });
    activeRequests.delete(key);
    return res.data;
  } catch (err) {
    activeRequests.delete(key);
    throw err;
  }
};

/**
 * Gọi API POST an toàn
 */
export const safePost = async (endpoint, body = {}, options = {}) => {
  const controller = new AbortController();
  try {
    const res = await apiClient.post(endpoint, body, {
      signal: controller.signal,
      idempotencyKey: options.idempotencyKey,
      ...options
    });
    return res.data;
  } catch (err) {
    throw err;
  }
};

/**
 * Gọi API PUT an toàn
 */
export const safePut = async (endpoint, body = {}, options = {}) => {
  const controller = new AbortController();
  try {
    const res = await apiClient.put(endpoint, body, {
      signal: controller.signal,
      idempotencyKey: options.idempotencyKey,
      ...options
    });
    return res.data;
  } catch (err) {
    throw err;
  }
};

/**
 * Gọi API DELETE an toàn
 */
export const safeDelete = async (endpoint, options = {}) => {
  const controller = new AbortController();
  try {
    const res = await apiClient.delete(endpoint, {
      signal: controller.signal,
      ...options
    });
    return res.data;
  } catch (err) {
    throw err;
  }
};

export default apiClient;
