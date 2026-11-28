import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { isZaloMiniAppRuntime, withSdkTimeout } from "./zalo-sdk-core";

/**
 * Zalo Token Resolver (V69 Check-In Only):
 * - Chỉ giữ lại silentResolveZaloToken() phục vụ luồng Chấm công GPS (V64-V65).
 * - Đã loại bỏ hoàn toàn các hàm liên kết tài khoản Zalo & xác minh SĐT Zalo.
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

export const zaloAuthService = {
  silentResolveZaloToken
};

export default zaloAuthService;
