import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { safeGet, safePost, generateIdempotencyKey } from "../utils/api";
import {
  SDK_STATES,
  createServiceResult,
  isZaloMiniAppRuntime,
  withSdkTimeout,
  mapZaloSdkError,
  ensureScopePermission
} from "./zalo-sdk-core";

/**
 * Zalo Link & Verification Service (Post-Login / Check-In Only):
 * - Chỉ sử dụng sau khi nhân viên đã đăng nhập (chấm công GPS hoặc liên kết/xác minh Zalo trong Hồ sơ).
 * - Tuyệt đối KHÔNG gọi khi mở app hay ở màn hình Đăng nhập.
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
  linkZaloToCurrentEmployee,
  unlinkZaloFromCurrentEmployee,
  verifyZaloPhoneForEmployee
};

export default zaloAuthService;
