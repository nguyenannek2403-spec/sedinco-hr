import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { safeGet, safePost, generateIdempotencyKey } from "../utils/api";
import { getDeviceIdentity } from "../utils/deviceIdentity";
import {
  SDK_STATES,
  createServiceResult,
  isZaloMiniAppRuntime,
  withSdkTimeout,
  mapZaloSdkError,
  checkScopePermission,
  ensureScopePermission
} from "./zalo-sdk-core";

/**
 * Zalo Identity Service (Phase 1):
 * - Quản lý getAccessToken(), getUserInfo(), getPhoneNumber(), getSetting(), authorize() tập trung.
 * - KHÔNG bật popup xin quyền khi khởi động app (cold start).
 * - Chỉ gửi access_token / phone_token về backend để máy chủ xác minh với Zalo Graph API.
 * - Zalo User ID chỉ là khóa liên kết với Employee ID (ma_nv), tuyệt đối không thay thế ma_nv và không tự tạo nhân viên mới.
 */

export async function silentResolveZaloToken() {
  if (!isZaloMiniAppRuntime()) {
    return "";
  }
  try {
    const tok = await withSdkTimeout(
      () => zmpAdapter.getAccessToken({ silent: true }),
      4500,
      "getAccessToken"
    );
    return typeof tok === "string" ? tok.trim() : "";
  } catch {
    return "";
  }
}

export async function getZaloLinkStatus() {
  const res = await safeGet("/auth/zalo/status", {}, { cancelPrevious: false });
  return res?.data || null;
}

export async function requestZaloIdentityForLogin({ isSilentAuto = false, maNvHint = "" } = {}) {
  if (!isZaloMiniAppRuntime()) {
    return createServiceResult({
      state: SDK_STATES.FALLBACK,
      errorCode: "NOT_IN_ZALO_RUNTIME",
      message: "Đăng nhập nhanh bằng Zalo chỉ khả dụng khi mở từ ứng dụng Zalo. Vui lòng đăng nhập bằng Tài khoản & Mật khẩu.",
      canRetry: false
    });
  }

  try {
    const accessToken = await withSdkTimeout(
      () => zmpAdapter.getAccessToken({ silent: isSilentAuto }),
      8000,
      "getAccessToken"
    );

    if (!accessToken) {
      return createServiceResult({
        state: isSilentAuto ? SDK_STATES.FALLBACK : SDK_STATES.ERROR,
        errorCode: "EMPTY_ZALO_TOKEN",
        message: "Chưa lấy được phiên xác thực Zalo. Vui lòng đăng nhập bằng Mã nhân viên & Mật khẩu!",
        canRetry: true
      });
    }

    // Chỉ đọc getUserInfo nếu scope.userInfo ĐÃ được cấp trước đó (không tự hiện popup khi silent)
    let userInfo = null;
    const settingRes = await checkScopePermission("scope.userInfo");
    if (settingRes.ok && settingRes.data?.granted) {
      userInfo = await withSdkTimeout(
        () => zmpAdapter.getUserInfo({ autoRequestPermission: false }),
        4000,
        "getUserInfo"
      ).catch(() => null);
    }

    const identity = await getDeviceIdentity();
    const res = await safePost("/auth/zalo-auto-login", {
      zalo_access_token: accessToken,
      zalo_token: accessToken,
      zalo_user_id: userInfo?.id || undefined,
      device_id: identity.device_id,
      device_name: identity.device_model_name,
      device_info: identity.device_info,
      ma_nv: maNvHint || undefined
    });

    if (res?.success && res.data) {
      return createServiceResult({
        state: SDK_STATES.SUCCESS,
        data: { user: res.data, zaloProfile: userInfo }
      });
    }

    return createServiceResult({
      state: SDK_STATES.ERROR,
      errorCode: res?.code || "ZALO_LOGIN_FAILED",
      message: res?.message || "Tài khoản Zalo chưa được liên kết với nhân viên Sedinco.",
      canRetry: false
    });
  } catch (err) {
    if (err?.status === 404 || err?.data?.code === "ZALO_NOT_LINKED") {
      return createServiceResult({
        state: SDK_STATES.FALLBACK,
        errorCode: "ZALO_NOT_LINKED",
        message:
          err?.message ||
          "Tài khoản Zalo này chưa liên kết với mã nhân viên Sedinco. Vui lòng đăng nhập bằng Tài khoản & Mật khẩu lần đầu!",
        canRetry: false
      });
    }
    if (err?.status === 401 || err?.status === 403 || err?.data?.message) {
      return createServiceResult({
        state: SDK_STATES.ERROR,
        errorCode: err?.data?.code || err?.status || "AUTH_ERROR",
        message: err?.message || "Xác thực tài khoản Zalo chưa thành công.",
        canRetry: true
      });
    }
    return createServiceResult(mapZaloSdkError(err, "Không thể đăng nhập bằng Zalo."));
  }
}

export async function linkZaloToCurrentEmployee() {
  if (!isZaloMiniAppRuntime()) {
    return createServiceResult({
      state: SDK_STATES.FALLBACK,
      errorCode: "NOT_IN_ZALO_RUNTIME",
      message: "Vui lòng mở Sedinco HR trên ứng dụng Zalo Mobile để liên kết tài khoản Zalo với Mã nhân viên của bạn."
    });
  }

  try {
    const accessToken = await withSdkTimeout(
      () => zmpAdapter.getAccessToken({ silent: false }),
      8000,
      "getAccessToken"
    );
    if (!accessToken) {
      return createServiceResult({
        state: SDK_STATES.ERROR,
        errorCode: "EMPTY_ZALO_TOKEN",
        message: "Không nhận được access token từ Zalo. Vui lòng thử lại!",
        canRetry: true
      });
    }

    const res = await safePost(
      "/auth/zalo/link",
      { zalo_access_token: accessToken },
      { idempotencyKey: generateIdempotencyKey("zalo_link") }
    );
    if (res?.success) {
      return createServiceResult({
        state: SDK_STATES.SUCCESS,
        data: res.data,
        message: res.message || "Đã liên kết tài khoản Zalo với mã nhân viên!"
      });
    }
    return createServiceResult({
      state: SDK_STATES.ERROR,
      errorCode: res?.code || "ZALO_LINK_FAILED",
      message: res?.message || "Không thể liên kết tài khoản Zalo."
    });
  } catch (err) {
    if (err?.status || err?.data) {
      return createServiceResult({
        state: SDK_STATES.ERROR,
        errorCode: err?.data?.code || err?.status,
        message: err?.message || "Không thể liên kết tài khoản Zalo.",
        canRetry: false
      });
    }
    return createServiceResult(mapZaloSdkError(err, "Lỗi khi liên kết tài khoản Zalo."));
  }
}

export async function unlinkZaloFromCurrentEmployee() {
  const res = await safePost(
    "/auth/zalo/unlink",
    {},
    { idempotencyKey: generateIdempotencyKey("zalo_unlink") }
  );
  return res;
}

export async function verifyZaloPhoneForEmployee() {
  if (!isZaloMiniAppRuntime()) {
    return createServiceResult({
      state: SDK_STATES.FALLBACK,
      errorCode: "NOT_IN_ZALO_RUNTIME",
      message: "Xác minh số điện thoại qua Zalo chỉ hoạt động trong ứng dụng Zalo Mobile."
    });
  }

  const scopePerm = await ensureScopePermission("scope.userPhonenumber", { requestIfNeeded: true });
  if (!scopePerm.ok) {
    return scopePerm;
  }

  try {
    const [accessToken, phoneRes] = await Promise.all([
      withSdkTimeout(() => zmpAdapter.getAccessToken({ silent: true }), 6000, "getAccessToken"),
      withSdkTimeout(() => zmpAdapter.getPhoneNumber(), 10000, "getPhoneNumber")
    ]);

    if (!phoneRes?.token) {
      return createServiceResult({
        state: SDK_STATES.PENDING_ZALO_APPROVAL,
        errorCode: "PHONE_TOKEN_UNAVAILABLE",
        message:
          "Zalo chưa trả về token số điện thoại (cần duyệt quyền getPhoneNumber cho Mini App ở Zalo Developer Console).",
        canRetry: false
      });
    }

    const backendRes = await safePost(
      "/auth/zalo/verify-phone",
      {
        phone_token: phoneRes.token,
        zalo_access_token: accessToken || ""
      },
      { idempotencyKey: generateIdempotencyKey("zalo_phone") }
    );

    if (backendRes?.success) {
      return createServiceResult({
        state: SDK_STATES.SUCCESS,
        data: backendRes.data,
        message: backendRes.message || "Đã xác minh số điện thoại qua Zalo!"
      });
    }

    return createServiceResult({
      state: SDK_STATES.ERROR,
      errorCode: backendRes?.code || "VERIFY_PHONE_FAILED",
      message: backendRes?.message || "Không thể xác minh số điện thoại Zalo."
    });
  } catch (err) {
    if (err?.status || err?.data) {
      return createServiceResult({
        state: SDK_STATES.ERROR,
        errorCode: err?.data?.code || err?.status,
        message: err?.message || "Lỗi xác minh số điện thoại trên máy chủ.",
        canRetry: true
      });
    }
    return createServiceResult(mapZaloSdkError(err, "Không thể lấy số điện thoại từ Zalo."));
  }
}

export const zaloAuthService = {
  silentResolveZaloToken,
  getZaloLinkStatus,
  requestZaloIdentityForLogin,
  linkZaloToCurrentEmployee,
  unlinkZaloFromCurrentEmployee,
  verifyZaloPhoneForEmployee
};

export default zaloAuthService;
