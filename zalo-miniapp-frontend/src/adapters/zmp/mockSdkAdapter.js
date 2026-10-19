/**
 * Mock Zalo Mini App SDK Adapter
 * Dùng riêng cho môi trường kiểm thử dev khi VITE_USE_MOCK=true.
 * Tuyệt đối không lọt vào production bundle.
 */

let mockLocationScenario = "valid"; // 'valid', 'out_of_range', 'permission_denied', 'gps_off', 'timeout'
let mockBioScenario = "success"; // 'success', 'not_enrolled', 'cancelled', 'state_changed'

export const setMockLocationScenario = (sc) => {
  mockLocationScenario = sc;
};

export const setMockBioScenario = (sc) => {
  mockBioScenario = sc;
};

export const mockSdkAdapter = {
  isMock: true,

  async getAccessToken() {
    await new Promise((r) => setTimeout(r, 150));
    return "mock_zalo_access_token_" + Date.now();
  },

  async getLocation() {
    await new Promise((r) => setTimeout(r, 400));
    if (mockLocationScenario === "permission_denied") {
      throw {
        code: "LOCATION_PERMISSION_DENIED",
        message: "Ứng dụng chưa được cấp quyền vị trí. Vui lòng cho phép quyền truy cập vị trí trong cài đặt Zalo."
      };
    }
    if (mockLocationScenario === "gps_off") {
      throw {
        code: "GPS_DISABLED",
        message: "Định vị GPS trên thiết bị đang tắt. Vui lòng bật GPS trên điện thoại để chấm công."
      };
    }
    if (mockLocationScenario === "timeout") {
      throw {
        code: "LOCATION_TIMEOUT",
        message: "Quá thời gian chờ lấy tín hiệu GPS từ vệ tinh. Vui lòng thử lại tại khu vực thoáng hơn."
      };
    }

    // Trả về token vị trí mô phỏng (chuẩn 1 lần, server sẽ giải mã)
    const suffix = mockLocationScenario === "out_of_range" ? "outofrange" : "valid";
    return {
      token: `mock_loc_token_${suffix}_${Date.now()}`
    };
  },

  async checkStateBioAuthentication() {
    await new Promise((r) => setTimeout(r, 100));
    return {
      isSupported: true,
      state: "ENROLLED"
    };
  },

  async openBioAuthentication({ secretData }) {
    await new Promise((r) => setTimeout(r, 500));
    if (mockBioScenario === "not_enrolled") {
      throw {
        code: "BIO_NOT_ENROLLED",
        message: "Thiết bị chưa thiết lập bảo mật vân tay hoặc Face ID. Vui lòng cài đặt trong Cài đặt của máy."
      };
    }
    if (mockBioScenario === "cancelled") {
      throw {
        code: "BIO_USER_CANCELLED",
        message: "Bạn đã hủy quá trình xác thực sinh trắc học."
      };
    }
    return {
      success: true,
      token: "mock_bio_token_" + Date.now(),
      bioState: mockBioScenario === "state_changed" ? "CHANGED" : "CURRENT",
      secretData
    };
  },

  async chooseImage({ count = 1, sourceType = ["camera"] } = {}) {
    await new Promise((r) => setTimeout(r, 300));
    return {
      filePaths: [
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"
      ]
    };
  },

  getSystemInfo() {
    return {
      zaloTheme: "light",
      platform: "mock_devtools",
      version: "2.39.0"
    };
  }
};
