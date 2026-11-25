import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import {
  SDK_STATES,
  createServiceResult,
  isZaloMiniAppRuntime,
  withSdkTimeout,
  withSafeRetry,
  mapZaloSdkError,
  checkScopePermission,
  ensureScopePermission
} from "./zalo-sdk-core";

/**
 * Zalo Location Service (Phase 1 Smart Attendance):
 * - Kiểm tra quyền scope.userLocation trước khi gọi getLocation().
 * - KHÔNG bao giờ gọi định vị ngầm khi mở ứng dụng — chỉ gọi khi nhân viên chủ động bấm Chấm công hoặc Admin bấm Lấy tọa độ chi nhánh.
 * - KHÔNG bao giờ giả lập tọa độ GPS thật khi quyền bị từ chối hoặc chưa được cấp.
 */

export async function getLocationPermissionStatus() {
  return checkScopePermission("scope.userLocation");
}

export async function acquireVerifiedLocation({ requestPermissionIfNeeded = true, timeoutMs = 10000 } = {}) {
  const insideZalo = isZaloMiniAppRuntime();

  if (insideZalo) {
    const scopeCheck = await ensureScopePermission("scope.userLocation", {
      requestIfNeeded: requestPermissionIfNeeded
    });
    if (!scopeCheck.ok && scopeCheck.state !== SDK_STATES.FALLBACK) {
      return scopeCheck;
    }
  }

  try {
    const loc = await withSafeRetry(
      () => withSdkTimeout(() => zmpAdapter.getLocation(), timeoutMs, "getLocation"),
      { retries: 1, delayMs: 300 }
    );

    const hasToken = Boolean(loc?.token);
    const lat = loc?.latitude !== undefined && loc?.latitude !== null && Number.isFinite(Number(loc.latitude))
      ? Number(loc.latitude)
      : null;
    const lng = loc?.longitude !== undefined && loc?.longitude !== null && Number.isFinite(Number(loc.longitude))
      ? Number(loc.longitude)
      : null;

    if (!hasToken && (lat === null || lng === null)) {
      return createServiceResult({
        state: insideZalo ? SDK_STATES.PENDING_ZALO_APPROVAL : SDK_STATES.ERROR,
        errorCode: "EMPTY_LOCATION",
        message: "Chưa nhận được tọa độ GPS hoặc token vị trí từ thiết bị. Vui lòng thử lại hoặc dùng Quét QR / Wi-Fi nội bộ.",
        canRetry: true
      });
    }

    return createServiceResult({
      state: SDK_STATES.SUCCESS,
      data: {
        locationToken: loc?.token || "",
        latitude: lat,
        longitude: lng,
        accuracy: loc?.accuracy !== undefined && loc?.accuracy !== null ? Number(loc.accuracy) : null,
        isMock: Boolean(loc?.mocked === true || loc?.isMock === true || (loc?.accuracy !== undefined && Number(loc.accuracy) < 0)),
        source: loc?.source || (insideZalo ? "zmp" : "browser_geolocation")
      }
    });
  } catch (err) {
    return createServiceResult(mapZaloSdkError(err, "Không thể lấy vị trí hiện tại."));
  }
}

export const zaloLocationService = {
  getLocationPermissionStatus,
  acquireVerifiedLocation
};

export default zaloLocationService;
