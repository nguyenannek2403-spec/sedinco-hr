import {
  getAccessToken as zmpGetAccessToken,
  getLocation as zmpGetLocation,
  openBioAuthentication as zmpOpenBioAuthentication,
  checkStateBioAuthentication as zmpCheckStateBioAuthentication,
  chooseImage as zmpChooseImage,
  getSystemInfo as zmpGetSystemInfo
} from "zmp-sdk/apis";

/**
 * Real Zalo Mini App SDK Adapter
 * Chỉ chạy trên thiết bị thật có Zalo App Runtime.
 */
export const realSdkAdapter = {
  isMock: false,

  async getAccessToken() {
    try {
      const token = await zmpGetAccessToken({});
      return token || "";
    } catch (err) {
      console.warn("[RealSDK] getAccessToken error:", err);
      throw {
        code: "AUTH_TOKEN_FAILED",
        message: "Không thể lấy mã truy cập Zalo (Access Token). Vui lòng thử lại.",
        raw: err
      };
    }
  },

  async getLocation() {
    try {
      // getLocation của Zalo SDK chỉ trả về token vị trí (sống trong 2 phút)
      const data = await zmpGetLocation({});
      if (data && data.token) {
        return { token: data.token };
      }
      // Một số phiên bản cũ có thể trả token trong trường khác
      if (typeof data === "string") {
        return { token: data };
      }
      throw new Error("Không nhận được token vị trí từ Zalo.");
    } catch (err) {
      console.warn("[RealSDK] getLocation error:", err);
      const msg = err?.message || String(err);
      if (msg.includes("permission") || msg.includes("denied") || err?.code === -1004) {
        throw {
          code: "LOCATION_PERMISSION_DENIED",
          message: "Ứng dụng chưa được cấp quyền vị trí. Vui lòng cho phép quyền truy cập vị trí trong cài đặt Zalo.",
          raw: err
        };
      }
      if (msg.includes("disabled") || msg.includes("gps") || err?.code === -1005) {
        throw {
          code: "GPS_DISABLED",
          message: "Định vị GPS trên thiết bị đang tắt. Vui lòng bật GPS trên điện thoại để chấm công.",
          raw: err
        };
      }
      throw {
        code: "LOCATION_FAILED",
        message: "Không thể xác định vị trí hiện tại. Vui lòng kiểm tra kết nối mạng và thử lại.",
        raw: err
      };
    }
  },

  async checkStateBioAuthentication() {
    try {
      if (typeof zmpCheckStateBioAuthentication !== "function") {
        return { isSupported: false, state: "NOT_SUPPORTED" };
      }
      const res = await zmpCheckStateBioAuthentication({});
      return {
        isSupported: true,
        state: res?.state || "UNKNOWN",
        raw: res
      };
    } catch (err) {
      console.warn("[RealSDK] checkStateBioAuthentication error:", err);
      return { isSupported: false, state: "ERROR", message: err?.message };
    }
  },

  async openBioAuthentication({ secretData }) {
    try {
      if (typeof zmpOpenBioAuthentication !== "function") {
        throw {
          code: "BIO_NOT_SUPPORTED",
          message: "Thiết bị hoặc phiên bản Zalo chưa hỗ trợ xác thực sinh trắc học."
        };
      }
      const res = await zmpOpenBioAuthentication({ secretData });
      return {
        success: true,
        token: res?.token || "",
        bioState: res?.bioState || "",
        raw: res
      };
    } catch (err) {
      console.warn("[RealSDK] openBioAuthentication error:", err);
      const code = err?.code;
      if (code === -107) {
        throw {
          code: "BIO_NOT_ENROLLED",
          message: "Thiết bị chưa thiết lập bảo mật vân tay hoặc Face ID. Vui lòng cài đặt trong Cài đặt của máy.",
          raw: err
        };
      }
      if (code === -105 || err?.message?.includes("cancel")) {
        throw {
          code: "BIO_USER_CANCELLED",
          message: "Bạn đã hủy quá trình xác thực sinh trắc học.",
          raw: err
        };
      }
      throw {
        code: "BIO_AUTH_FAILED",
        message: "Xác thực sinh trắc học không thành công. Vui lòng thử lại.",
        raw: err
      };
    }
  },

  async chooseImage({ count = 1, sourceType = ["camera"] } = {}) {
    try {
      const res = await zmpChooseImage({ count, sourceType });
      return {
        filePaths: res?.filePaths || []
      };
    } catch (err) {
      console.warn("[RealSDK] chooseImage error:", err);
      throw {
        code: "IMAGE_PICK_FAILED",
        message: "Không thể chụp hoặc chọn ảnh từ máy.",
        raw: err
      };
    }
  },

  getSystemInfo() {
    try {
      return zmpGetSystemInfo() || {};
    } catch (e) {
      return {};
    }
  }
};
