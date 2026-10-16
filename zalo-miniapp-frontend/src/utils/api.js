import axios from "axios";

export const API_BASE = "https://sedinco-backend.onrender.com/api";

// Tạo instance axios có timeout 12s để tránh treo xoay vĩnh viễn
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 12000,
  headers: {
    "Content-Type": "application/json"
  }
});

let onUnauthorizedCallback = null;

export const setOnUnauthorizedCallback = (callback) => {
  onUnauthorizedCallback = callback;
};

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

// Response Interceptor xử lý tập trung 3 nhóm mã lỗi
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (axios.isCancel(error)) {
      return Promise.reject({ isCanceled: true, message: "Request đã bị hủy do chuyển phiên" });
    }

    const status = error.response?.status;
    let userMessage = "Lỗi kết nối máy chủ, vui lòng thử lại sau.";

    if (status === 401) {
      userMessage = "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.";
      if (onUnauthorizedCallback) onUnauthorizedCallback();
    } else if (status === 403) {
      userMessage = "Bạn không có quyền truy cập chức năng này.";
    } else if (status === 429) {
      userMessage = "Thao tác quá nhanh, vui lòng chờ trong giây lát.";
    } else if (status === 400 || status === 409 || status === 422) {
      userMessage = error.response?.data?.message || "Dữ liệu yêu cầu không hợp lệ.";
    } else if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      userMessage = "Kết nối quá thời gian chờ (timeout). Vui lòng thử lại.";
    } else if (!error.response) {
      userMessage = "Không có kết nối mạng hoặc máy chủ đang khởi động lại.";
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
      ...options
    });
    return res.data;
  } catch (err) {
    throw err;
  }
};

export default apiClient;
