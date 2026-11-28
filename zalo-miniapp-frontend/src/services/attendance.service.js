import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { safeGet, safePost, generateIdempotencyKey } from "../utils/api";
import { getDeviceIdentity } from "../utils/deviceIdentity";
import { SDK_STATES, createServiceResult } from "./zalo-sdk-core";
import { acquireVerifiedLocation } from "./zalo-location.service";
import { silentResolveZaloToken } from "./zalo-auth.service";

/**
 * Smart Attendance Orchestrator Service (V65 Unified Check-In/Check-Out State Machine):
 * Step 1: auth-setting / getSetting() -> Kiểm tra & xin quyền scope.userLocation. Nếu user từ chối -> Dừng ngay.
 * Step 2: getLocation() -> Lấy zalo_location_token mới tươi (single-use, timeout <= 10s, không bao giờ cache).
 * Step 3: POST /api/attendance/precheck -> Giải mã zalo_location_token DUY NHẤT 1 LẦN tại Backend, nhận location_proof_token (60s).
 *         Nếu precheck lỗi hoặc allowed: false -> Dừng ngay, hiển thị lý do, KHÔNG gọi /check-in hay /check-out.
 * Step 4: POST /api/attendance/check-in (hoặc /api/attendance/check-out) -> Gửi location_proof_token + action_type ('IN' | 'OUT').
 * Step 5: Async post-tasks -> Sau khi 200 OK mới chạy bất đồng bộ các tác vụ phụ.
 */

export async function getAttendanceNetworkStatus() {
  return zmpAdapter.getNetworkType();
}

export async function setAttendanceKeepScreen(enabled) {
  return zmpAdapter.keepScreenOn(enabled);
}

export async function triggerAttendanceHaptic(type = "light") {
  return zmpAdapter.vibrate(type);
}

export async function executeSmartAttendanceFlow({
  isFieldWorkMode = false,
  fieldNote = "",
  actionType = "IN"
} = {}) {
  const workLocationType = isFieldWorkMode ? "FIELD_WORK" : "OFFICE";
  const resolvedFieldNote = isFieldWorkMode ? String(fieldNote || "").trim() : "";
  const normalizedAction = String(actionType || "IN").toUpperCase() === "OUT" ? "OUT" : "IN";

  // Step 1 & Step 2: Kiểm tra auth-setting (scope.userLocation) & lấy vị trí / zalo_location_token mới tươi
  const locResult = await acquireVerifiedLocation({
    requestPermissionIfNeeded: true,
    timeoutMs: 10000
  });

  // Nếu người dùng từ chối quyền vị trí trên Zalo -> Dừng ngay lập tức, KHÔNG gọi precheck hay check-in
  if (
    !locResult.ok &&
    (locResult.state === SDK_STATES.PERMISSION_DENIED ||
      locResult.state === SDK_STATES.PENDING_ZALO_APPROVAL)
  ) {
    return createServiceResult({
      state: locResult.state,
      errorCode: locResult.errorCode || "LOCATION_PERMISSION_DENIED",
      message:
        locResult.message ||
        "Ứng dụng chưa được cấp quyền truy cập vị trí trên Zalo. Vui lòng bật quyền Vị trí để chấm công.",
      canRetry: locResult.canRetry,
      canOpenSettings: locResult.canOpenSettings
    });
  }

  const accessToken = await silentResolveZaloToken();

  const gpsGranted = Boolean(locResult.ok && locResult.data);
  const lat = gpsGranted ? locResult.data.latitude : null;
  const lng = gpsGranted ? locResult.data.longitude : null;
  const gpsAccuracy = gpsGranted ? locResult.data.accuracy : null;
  const isFakeGps = gpsGranted ? locResult.data.isMock : false;
  const locationToken = gpsGranted ? locResult.data.locationToken : "";

  const devIdentity = await getDeviceIdentity();

  // Step 3: POST /api/attendance/precheck — Giải mã zalo_location_token DUY NHẤT 1 LẦN và cấp location_proof_token
  let precheck = null;
  try {
    const preRes = await safePost(
      "/attendance/precheck",
      {
        lat,
        lng,
        zalo_location_token: locationToken || undefined,
        zalo_access_token: accessToken || undefined,
        work_location_type: workLocationType,
        field_note: resolvedFieldNote || undefined,
        device_id: devIdentity.device_id,
        device_name: devIdentity.device_model_name
      },
      { cancelPrevious: false }
    );
    precheck = preRes?.data || null;
  } catch (preErr) {
    const errCode = preErr?.code || preErr?.data?.code || "PRECHECK_FAILED";
    const errMsg =
      preErr?.message ||
      preErr?.data?.message ||
      "Không thể kiểm tra điều kiện chấm công. Vui lòng kiểm tra kết nối mạng và thử lại.";
    return createServiceResult({
      state: SDK_STATES.ERROR,
      errorCode: errCode,
      message: errMsg,
      canRetry: true
    });
  }

  // Nếu precheck không cho phép (allowed === false hoặc can_check_in === false) -> Dừng ngay
  if (!precheck || precheck.can_check_in === false || precheck.allowed === false) {
    const blockCode = precheck?.error_code || "ATTENDANCE_PRECHECK_BLOCKED";
    const blockMsg =
      precheck?.block_reason ||
      locResult?.message ||
      "Chưa đủ điều kiện vị trí để chấm công. Nếu bạn đang đi công trình, hãy chọn mục Đi công trình.";
    return createServiceResult({
      state:
        blockCode === "ZALO_PERMISSION_DENIED"
          ? SDK_STATES.PERMISSION_DENIED
          : SDK_STATES.ERROR,
      errorCode: blockCode,
      message: blockMsg,
      canRetry: precheck?.can_check_in !== false,
      canOpenSettings: blockCode === "ZALO_PERMISSION_DENIED",
      data: { precheck }
    });
  }

  // Step 4: Gọi POST /api/attendance/check-in hoặc POST /api/attendance/check-out với location_proof_token
  const idempotencyKey = generateIdempotencyKey(normalizedAction === "OUT" ? "checkout" : "checkin");
  const clientNonce =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `nonce_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const resolvedLat =
    precheck.verified_lat !== undefined && precheck.verified_lat !== null
      ? precheck.verified_lat
      : lat;
  const resolvedLng =
    precheck.verified_lng !== undefined && precheck.verified_lng !== null
      ? precheck.verified_lng
      : lng;

  const targetEndpoint = normalizedAction === "OUT" ? "/attendance/check-out" : "/attendance/check-in";

  const result = await safePost(
    targetEndpoint,
    {
      lat: resolvedLat,
      lng: resolvedLng,
      location_proof_token: precheck.location_proof_token || undefined,
      client_nonce: clientNonce,
      device_id: devIdentity.device_id,
      device_name: devIdentity.device_model_name,
      device_info: devIdentity.device_info,
      gps_accuracy: gpsAccuracy,
      is_fake_gps: isFakeGps,
      work_location_type: workLocationType,
      action_type: normalizedAction,
      field_note: resolvedFieldNote || undefined
    },
    { idempotencyKey }
  );

  return createServiceResult({
    state: SDK_STATES.SUCCESS,
    data: {
      response: result,
      precheck
    }
  });
}

export async function fetchTodayAndMonthlyStatus(month, year) {
  const [todayRes, attRes, compRes] = await Promise.all([
    safeGet("/attendance/today").catch(() => null),
    safeGet("/attendance/me", { month, year }),
    safeGet("/company").catch(() => null)
  ]);
  return { todayRes, attRes, compRes };
}

export const attendanceService = {
  getAttendanceNetworkStatus,
  setAttendanceKeepScreen,
  triggerAttendanceHaptic,
  executeSmartAttendanceFlow,
  fetchTodayAndMonthlyStatus
};

export default attendanceService;
