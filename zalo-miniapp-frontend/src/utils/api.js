import axios from "axios";

export const API_BASE = "https://sedinco-backend.onrender.com/api";

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
 * Chống Formula Injection cho các ô trong file CSV / Excel xuất ra
 * Ô bắt đầu bằng =, +, -, @ sẽ được vô hiệu hóa bằng cách thêm dấu nháy đơn '
 */
export const sanitizeFormula = (val) => {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
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

    if (status === 401) {
      userMessage = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập hoặc liên kết lại.";
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

    return Promise.reject({
      status,
      message: userMessage,
      rawError: error,
      data: error.response?.data
    });
  }
);

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
