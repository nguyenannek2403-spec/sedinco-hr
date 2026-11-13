import {
  getAccessToken as zmpGetAccessToken,
  getUserInfo as zmpGetUserInfo,
  getLocation as zmpGetLocation,
  openBioAuthentication as zmpOpenBioAuthentication,
  checkStateBioAuthentication as zmpCheckStateBioAuthentication,
  chooseImage as zmpChooseImage,
  getSystemInfo as zmpGetSystemInfo,
  scanQRCode as zmpScanQRCode,
  vibrate as zmpVibrate
} from "zmp-sdk/apis";

/**
 * Real Zalo Mini App SDK Adapter
 * Chỉ chạy trên thiết bị thật có Zalo App Runtime.
 */
export const realSdkAdapter = {
  isMock: false,

  async getUserInfo() {
    try {
      if (typeof zmpGetUserInfo === "function") {
        const res = await zmpGetUserInfo({ autoRequestPermission: false });
        if (res?.userInfo?.id) {
          return {
            id: String(res.userInfo.id),
            name: res.userInfo.name || "",
            avatar: res.userInfo.avatar || ""
          };
        }
      }
      return null;
    } catch (err) {
      return null;
    }
  },

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
    let token = "";
    let sdkError = null;

    try {
      // getLocation của Zalo SDK chỉ trả về token vị trí (sống trong 2 phút)
      const data = await zmpGetLocation({});
      if (data && data.token) {
        token = data.token;
      } else if (typeof data === "string") {
        token = data;
      }
      if (data && typeof data === "object" && data.latitude && data.longitude) {
        return {
          token,
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          accuracy: data.accuracy !== undefined ? Number(data.accuracy) : null
        };
      }
    } catch (err) {
      sdkError = err;
      console.warn("[RealSDK] zmpGetLocation error:", err);
    }

    // Luôn cố gắng lấy thêm tọa độ GPS thực từ thiết bị/trình duyệt để fallback khi token hết hạn hoặc Zalo API gặp sự cố
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 4500,
            enableHighAccuracy: true,
            maximumAge: 15000
          });
        });
        return {
          ...(token ? { token } : {}),
          latitude: Number(pos.coords.latitude),
          longitude: Number(pos.coords.longitude),
          accuracy: pos.coords.accuracy !== undefined ? Number(pos.coords.accuracy) : null
        };
      } catch (geoErr) {
        console.warn("[RealSDK] navigator.geolocation fallback failed:", geoErr);
      }
    }

    if (token) {
      return { token };
    }

    const msg = sdkError?.message || String(sdkError || "");
    if (msg.includes("permission") || msg.includes("denied") || sdkError?.code === -1004) {
      throw {
        code: "LOCATION_PERMISSION_DENIED",
        message: "Ứng dụng chưa được cấp quyền vị trí. Vui lòng cho phép quyền truy cập vị trí trong cài đặt Zalo.",
        raw: sdkError
      };
    }
    if (msg.includes("disabled") || msg.includes("gps") || sdkError?.code === -1005) {
      throw {
        code: "GPS_DISABLED",
        message: "Định vị GPS trên thiết bị đang tắt. Vui lòng bật GPS trên điện thoại để chấm công.",
        raw: sdkError
      };
    }
    throw {
      code: "LOCATION_FAILED",
      message: "Không thể xác định vị trí hiện tại. Vui lòng kiểm tra kết nối mạng và thử lại.",
      raw: sdkError
    };
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
  },

  async scanQRCode() {
    try {
      if (typeof zmpScanQRCode !== "function") {
        throw new Error("Thiết bị hoặc phiên bản Zalo chưa hỗ trợ quét mã QR trực tiếp.");
      }
      const res = await zmpScanQRCode({});
      const content = res?.content || res?.data || (typeof res === "string" ? res : "");
      return { content: String(content || "").trim(), raw: res };
    } catch (err) {
      console.warn("[RealSDK] scanQRCode error:", err);
      throw {
        code: "QR_SCAN_FAILED",
        message: err?.message || "Không thể quét mã QR từ Camera Zalo.",
        raw: err
      };
    }
  },

  async vibrate(type = "light") {
    try {
      if (typeof zmpVibrate === "function") {
        await zmpVibrate({ type });
        return true;
      }
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(120);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
};
