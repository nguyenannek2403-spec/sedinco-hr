import { zmpAdapter } from "../adapters/zmp/sdkAdapter";

/**
 * Zalo SDK Core Helpers (Phase 1):
 * - Chuẩn hóa kết quả theo 5 trạng thái: loading (UI), success, permission-denied, pending-zalo-approval, fallback, error.
 * - Tích hợp timeout an toàn, mapping mã lỗi Zalo AppError chính thức và cơ chế retry có kiểm soát.
 * - Quản lý quyền theo nguyên tắc Least-Privilege: KHÔNG bao giờ tự xin quyền khi mở app; kiểm tra getSetting() trước, chỉ gọi authorize() khi người dùng chủ động thao tác.
 */

export const SDK_STATES = {
  LOADING: "loading",
  SUCCESS: "success",
  PERMISSION_DENIED: "permission-denied",
  PENDING_ZALO_APPROVAL: "pending-zalo-approval",
  FALLBACK: "fallback",
  ERROR: "error"
};

export function createServiceResult({
  state = SDK_STATES.SUCCESS,
  data = null,
  errorCode = null,
  message = "",
  canRetry = false,
  canOpenSettings = false
} = {}) {
  return {
    ok: state === SDK_STATES.SUCCESS,
    state,
    data,
    errorCode,
    message,
    canRetry,
    canOpenSettings
  };
}

export function isZaloMiniAppRuntime() {
  return Boolean(zmpAdapter.isZaloRuntime());
}

export async function withSdkTimeout(promiseFactory, timeoutMs = 10000, apiName = "ZaloSDK") {
  let timerId = null;
  try {
    return await Promise.race([
      Promise.resolve().then(() => promiseFactory()),
      new Promise((_, reject) => {
        timerId = setTimeout(() => {
          const err = new Error(`Quá thời gian chờ phản hồi từ ${apiName} (${Math.round(timeoutMs / 1000)}s).`);
          err.code = "SDK_TIMEOUT";
          err.api = apiName;
          reject(err);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

export function mapZaloSdkError(err, fallbackMsg = "Không thể kết nối tới dịch vụ Zalo.") {
  const rawCode = Number(err?.sdkCode ?? err?.code ?? err?.raw?.code);
  const strCode = String(err?.code || err?.raw?.code || "");
  const msg = String(err?.message || err?.raw?.message || "").toLowerCase();

  if (strCode === "NOT_IN_ZALO_RUNTIME" || rawCode === -2000) {
    return {
      state: SDK_STATES.FALLBACK,
      errorCode: rawCode || strCode || -2000,
      message: "Đang chạy trên trình duyệt Web (ngoài ứng dụng Zalo Mini App).",
      canRetry: false,
      canOpenSettings: false
    };
  }

  if (
    rawCode === -201 ||
    rawCode === -1401 ||
    rawCode === -1004 ||
    strCode === "LOCATION_PERMISSION_DENIED" ||
    msg.includes("từ chối") ||
    msg.includes("denied")
  ) {
    return {
      state: SDK_STATES.PERMISSION_DENIED,
      errorCode: rawCode || strCode || -201,
      message: err?.message || "Bạn đã từ chối cấp quyền trên Zalo. Vui lòng mở Cài đặt quyền để cho phép khi sử dụng tính năng này.",
      canRetry: true,
      canOpenSettings: isZaloMiniAppRuntime()
    };
  }

  if (
    rawCode === -203 ||
    rawCode === -1404 ||
    rawCode === -1402 ||
    msg.includes("not approved") ||
    msg.includes("not granted") ||
    msg.includes("chưa được cấp phép") ||
    msg.includes("unapproved")
  ) {
    return {
      state: SDK_STATES.PENDING_ZALO_APPROVAL,
      errorCode: rawCode || -203,
      message: "Quyền API này đang chờ Zalo Mini App xét duyệt. Hệ thống tự động chuyển sang phương án dự phòng an toàn.",
      canRetry: false,
      canOpenSettings: false
    };
  }

  if (rawCode === -1005 || strCode === "GPS_DISABLED" || msg.includes("gps")) {
    return {
      state: SDK_STATES.ERROR,
      errorCode: "GPS_DISABLED",
      message: err?.message || "Định vị GPS trên điện thoại đang tắt. Vui lòng bật GPS và thử lại.",
      canRetry: true,
      canOpenSettings: false
    };
  }

  if (strCode === "SDK_TIMEOUT") {
    return {
      state: SDK_STATES.ERROR,
      errorCode: "SDK_TIMEOUT",
      message: err?.message || "Thao tác quá thời gian chờ. Vui lòng thử lại.",
      canRetry: true,
      canOpenSettings: false
    };
  }

  return {
    state: SDK_STATES.ERROR,
    errorCode: Number.isFinite(rawCode) ? rawCode : (strCode || "ZALO_SDK_ERROR"),
    message: err?.message || fallbackMsg,
    canRetry: true,
    canOpenSettings: false
  };
}

export async function withSafeRetry(taskFn, { retries = 1, delayMs = 350 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await taskFn(attempt);
    } catch (err) {
      lastErr = err;
      const mapped = mapZaloSdkError(err);
      if (
        mapped.state === SDK_STATES.PERMISSION_DENIED ||
        mapped.state === SDK_STATES.PENDING_ZALO_APPROVAL ||
        mapped.state === SDK_STATES.FALLBACK
      ) {
        throw err;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

/**
 * Kiểm tra trạng thái quyền (KHÔNG bật popup xin quyền).
 */
export async function checkScopePermission(scope) {
  if (!isZaloMiniAppRuntime()) {
    return createServiceResult({
      state: SDK_STATES.FALLBACK,
      data: { granted: false, scope, authSetting: {} },
      message: "Đang chạy trên trình duyệt ngoài Zalo."
    });
  }
  try {
    const res = await withSdkTimeout(() => zmpAdapter.getSetting(), 5000, "getSetting");
    const authSetting = res?.authSetting || {};
    const granted = Boolean(authSetting[scope]);
    return createServiceResult({
      state: SDK_STATES.SUCCESS,
      data: { granted, scope, authSetting }
    });
  } catch (err) {
    return createServiceResult(mapZaloSdkError(err, "Không kiểm tra được trạng thái quyền Zalo."));
  }
}

/**
 * Kiểm tra quyền hiện tại bằng getSetting(), CHỈ gọi authorize() khi chưa được cấp và được phép prompt theo thao tác người dùng.
 */
export async function ensureScopePermission(scope, { requestIfNeeded = true } = {}) {
  const statusRes = await checkScopePermission(scope);
  if (statusRes.state === SDK_STATES.FALLBACK) {
    return statusRes;
  }
  if (statusRes.ok && statusRes.data?.granted) {
    return createServiceResult({
      state: SDK_STATES.SUCCESS,
      data: { granted: true, scope, alreadyGranted: true }
    });
  }
  if (!requestIfNeeded) {
    return createServiceResult({
      state: SDK_STATES.PERMISSION_DENIED,
      errorCode: "SCOPE_NOT_GRANTED",
      message: `Quyền ${scope} chưa được cấp trên Zalo.`,
      canRetry: true,
      canOpenSettings: true
    });
  }

  try {
    const authRes = await withSdkTimeout(
      () => zmpAdapter.authorize({ scopes: [scope] }),
      12000,
      `authorize(${scope})`
    );
    const granted = Boolean(authRes && authRes[scope]);
    if (!granted) {
      return createServiceResult({
        state: SDK_STATES.PERMISSION_DENIED,
        errorCode: -201,
        message: "Người dùng đã từ chối cấp quyền truy cập.",
        canRetry: true,
        canOpenSettings: true
      });
    }
    return createServiceResult({
      state: SDK_STATES.SUCCESS,
      data: { granted: true, scope, authRes }
    });
  } catch (err) {
    return createServiceResult(mapZaloSdkError(err, "Không thể xin cấp quyền trên Zalo."));
  }
}

export async function openZaloPermissionSettings() {
  try {
    return await zmpAdapter.openPermissionSetting();
  } catch {
    return { opened: false };
  }
}
