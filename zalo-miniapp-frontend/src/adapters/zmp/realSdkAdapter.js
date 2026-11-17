import {
  getAccessToken as zmpGetAccessToken,
  getUserInfo as zmpGetUserInfo,
  getLocation as zmpGetLocation,
  openBioAuthentication as zmpOpenBioAuthentication,
  checkStateBioAuthentication as zmpCheckStateBioAuthentication,
  chooseImage as zmpChooseImage,
  getSystemInfo as zmpGetSystemInfo,
  scanQRCode as zmpScanQRCode,
  vibrate as zmpVibrate,
  getNetworkType as zmpGetNetworkType,
  keepScreen as zmpKeepScreen,
  downloadFile as zmpDownloadFile,
  getStorage as zmpGetStorage,
  setStorage as zmpSetStorage,
  nativeStorage as zmpNativeStorage
} from "zmp-sdk/apis";

let _screenWakeLock = null;

function isInsideZaloRuntime() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.ZaloJavaScriptInterface ||
    window.__ZMP__ ||
    (typeof navigator !== "undefined" && /Zalo|ZMP/i.test(navigator.userAgent || ""))
  );
}

function encodeUtf8ToDataUrl(content, mimeType = "text/plain;charset=utf-8") {
  const cleanMime = String(mimeType || "application/octet-stream").split(";")[0].trim();
  if (typeof TextEncoder !== "undefined" && typeof btoa === "function") {
    const bytes = new TextEncoder().encode(String(content ?? ""));
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:${cleanMime};base64,${btoa(binary)}`;
  }
  return "";
}

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

  async getAccessToken({ silent = false } = {}) {
    try {
      if (typeof zmpGetAccessToken !== "function") {
        return "";
      }
      const res = await zmpGetAccessToken({});
      const token = typeof res === "string" ? res : (res?.accessToken || res?.token || "");
      return token || "";
    } catch (err) {
      if (silent) {
        return "";
      }
      console.warn("[RealSDK] getAccessToken error:", err);
      throw {
        code: "AUTH_TOKEN_FAILED",
        message: "Chưa kết nối được phiên Zalo trên máy này. Vui lòng mở lại ứng dụng hoặc đăng nhập bằng Mã nhân viên.",
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
          message: "Thiết bị hoặc phiên bản Zalo chưa hỗ trợ mở khóa bằng vân tay / khuôn mặt."
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
          message: "Bạn đã hủy bước xác nhận vân tay / khuôn mặt.",
          raw: err
        };
      }
      throw {
        code: "BIO_AUTH_FAILED",
        message: "Xác nhận vân tay / khuôn mặt chưa thành công. Vui lòng thử lại.",
        raw: err
      };
    }
  },

  async chooseImage({ count = 1, sourceType = ["camera"], cameraType = "front" } = {}) {
    try {
      const res = await zmpChooseImage({
        count,
        sourceType,
        ...(cameraType ? { cameraType } : {})
      });
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
    const durationMap = { light: 120, medium: 250, heavy: 500 };
    const ms = typeof type === "number" ? Math.max(50, Math.min(2000, type)) : (durationMap[type] || 150);
    try {
      if (isInsideZaloRuntime() && typeof zmpVibrate === "function") {
        await zmpVibrate({ type: "oneShot", milliseconds: ms });
        return true;
      }
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(ms);
        return true;
      }
      if (typeof zmpVibrate === "function") {
        await zmpVibrate({ type: "oneShot", milliseconds: ms });
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  async getNetworkType() {
    try {
      if (isInsideZaloRuntime() && typeof zmpGetNetworkType === "function") {
        const res = await zmpGetNetworkType({});
        const type = String(res?.networkType || "unknown").toLowerCase();
        return {
          networkType: type,
          online: type !== "none",
          source: "zmp"
        };
      }
    } catch (e) {
      // Fallback sang API trình duyệt bên dưới
    }

    if (typeof navigator !== "undefined") {
      if (navigator.onLine === false) {
        return { networkType: "none", online: false, source: "browser" };
      }
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const rawType = String(conn?.type || "").toLowerCase();
      if (rawType === "wifi" || rawType === "ethernet") {
        return { networkType: "wifi", online: true, source: "browser" };
      }
      if (rawType === "cellular" || conn?.effectiveType) {
        return {
          networkType: rawType === "cellular" ? "cellular" : "wifi",
          online: true,
          effectiveType: conn?.effectiveType || null,
          source: "browser"
        };
      }
      return { networkType: "wifi", online: true, source: "browser" };
    }
    return { networkType: "unknown", online: true, source: "fallback" };
  },

  async keepScreenOn(enabled = true) {
    const keepOn = Boolean(enabled);
    try {
      if (isInsideZaloRuntime() && typeof zmpKeepScreen === "function") {
        await zmpKeepScreen({ keepScreenOn: keepOn });
        return true;
      }
    } catch (e) {
      // Fallback Web WakeLock API bên dưới
    }

    try {
      if (typeof navigator !== "undefined" && navigator.wakeLock) {
        if (keepOn) {
          if (!_screenWakeLock) {
            _screenWakeLock = await navigator.wakeLock.request("screen");
            _screenWakeLock?.addEventListener?.("release", () => {
              _screenWakeLock = null;
            });
          }
          return true;
        } else if (_screenWakeLock) {
          await _screenWakeLock.release();
          _screenWakeLock = null;
          return true;
        }
      }
    } catch (e) {
      // Trình duyệt có thể từ chối wakeLock khi tab đang ẩn
    }
    return false;
  },

  async saveFile({ filename = "tep_tai_ve.txt", content = "", mimeType = "text/plain;charset=utf-8", fileBase64Data = "", url = "" } = {}) {
    if (isInsideZaloRuntime() && typeof zmpDownloadFile === "function") {
      try {
        const dataPayload = fileBase64Data || (content ? encodeUtf8ToDataUrl(content, mimeType) : "");
        if (url) {
          await zmpDownloadFile({ url });
          return { success: true, method: "zmp" };
        }
        if (dataPayload) {
          await zmpDownloadFile({ fileBase64Data: dataPayload });
          return { success: true, method: "zmp" };
        }
      } catch (err) {
        console.warn("[RealSDK] downloadFile error, falling back to browser:", err);
      }
    }

    if (typeof document !== "undefined" && typeof URL !== "undefined" && typeof Blob !== "undefined") {
      try {
        if (url && !content) {
          const link = document.createElement("a");
          link.href = url;
          link.setAttribute("download", filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return { success: true, method: "browser" };
        }
        const blob = new Blob([content], { type: mimeType });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        return { success: true, method: "browser" };
      } catch (err) {
        throw {
          code: "FILE_SAVE_FAILED",
          message: "Không thể tải xuống tệp về máy.",
          raw: err
        };
      }
    }

    throw {
      code: "FILE_SAVE_UNSUPPORTED",
      message: "Môi trường hiện tại không hỗ trợ lưu tệp trực tiếp."
    };
  },

  async getStorage(key) {
    if (!key) return null;
    try {
      if (isInsideZaloRuntime()) {
        if (zmpNativeStorage && typeof zmpNativeStorage.getItem === "function") {
          const val = zmpNativeStorage.getItem(key);
          if (val !== undefined && val !== null && val !== "") return val;
        }
        if (typeof zmpGetStorage === "function") {
          const res = await zmpGetStorage({ keys: [key] });
          if (res && res[key] !== undefined && res[key] !== null && res[key] !== "") {
            return res[key];
          }
        }
      }
    } catch (e) {
      // Fallback sang localStorage ben duoi
    }
    try {
      if (typeof localStorage !== "undefined") {
        return localStorage.getItem(key);
      }
    } catch (e) {}
    return null;
  },

  async setStorage(key, value) {
    if (!key) return false;
    try {
      if (typeof localStorage !== "undefined") {
        if (value === null || value === undefined) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, String(value));
        }
      }
    } catch (e) {}
    try {
      if (isInsideZaloRuntime()) {
        if (zmpNativeStorage && typeof zmpNativeStorage.setItem === "function") {
          zmpNativeStorage.setItem(key, value === null || value === undefined ? "" : String(value));
          return true;
        }
        if (typeof zmpSetStorage === "function") {
          await zmpSetStorage({ data: { [key]: value === null || value === undefined ? "" : String(value) } });
          return true;
        }
      }
    } catch (e) {
      // Da luu localStorage lam fallback
    }
    return true;
  }
};
