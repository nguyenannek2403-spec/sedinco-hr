import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { safeGet, safePost, generateIdempotencyKey } from "../utils/api";
import { getDeviceIdentity } from "../utils/deviceIdentity";
import { SDK_STATES, createServiceResult } from "./zalo-sdk-core";
import { acquireVerifiedLocation } from "./zalo-location.service";
import { scanAttendanceQr } from "./zalo-qr.service";
import { silentResolveZaloToken } from "./zalo-auth.service";

/**
 * Smart Attendance Orchestrator Service (Phase 1 — Quy trình 9 bước chuẩn):
 * 1. Nhân viên bấm Chấm công vào/ra (hoặc Quét QR).
 * 2. Kiểm tra trạng thái đăng nhập & ca làm (/attendance/today, /attendance/precheck).
 * 3. Lấy vị trí GPS nếu quyền GPS đã được cấp hoặc xin khi người dùng bấm.
 * 4. Kiểm tra chi nhánh, phương thức chi nhánh & vùng GPS phía backend (/attendance/precheck).
 * 5. Quét QR động nếu phương thức chi nhánh yêu cầu (hoặc chế độ QR fallback).
 * 6. Gửi dữ liệu xác thực + client_nonce + Idempotency-Key đến backend (/attendance/check-in).
 * 7-9. Backend quyết định hoàn toàn kết quả chấm công theo Asia/Ho_Chi_Minh và trả về cho Frontend.
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

export async function fetchDynamicBranchQr({ branchId = null, ttlSeconds = 90 } = {}) {
  const res = await safePost(
    "/attendance/qr-session",
    {
      ...(branchId ? { branch_id: branchId } : {}),
      ttl_seconds: ttlSeconds
    },
    { cancelPrevious: false }
  );
  return res?.data || null;
}

export async function executeSmartAttendanceFlow({
  isFieldWorkMode = false,
  fieldNote = "",
  forceQrScan = false,
  manualQrToken = ""
} = {}) {
  // Bước 3: Lấy access token im lặng (nếu ở Zalo) + lấy GPS theo thao tác bấm nút
  const [accessToken, locResult] = await Promise.all([
    silentResolveZaloToken(),
    acquireVerifiedLocation({ requestPermissionIfNeeded: true, timeoutMs: 10000 })
  ]);

  const gpsGranted = locResult.ok;
  const lat = gpsGranted ? locResult.data.latitude : null;
  const lng = gpsGranted ? locResult.data.longitude : null;
  const gpsAccuracy = gpsGranted ? locResult.data.accuracy : null;
  const isFakeGps = gpsGranted ? locResult.data.isMock : false;
  const locationToken = gpsGranted ? locResult.data.locationToken : "";

  // Bước 4: Precheck ca làm, chi nhánh, Wi-Fi nội bộ & phương thức chấm công phía Backend
  let precheck = null;
  try {
    const preRes = await safePost(
      "/attendance/precheck",
      {
        lat,
        lng,
        work_location_type: isFieldWorkMode ? "FIELD_WORK" : "OFFICE"
      },
      { cancelPrevious: false }
    );
    precheck = preRes?.data || null;
  } catch (preErr) {
    // Không chặn nếu lỗi mạng tạm thời, check-in endpoint vẫn xác thực đầy đủ
    precheck = null;
  }

  if (precheck && precheck.can_check_in === false && precheck.block_reason) {
    return createServiceResult({
      state: SDK_STATES.ERROR,
      errorCode: "ATTENDANCE_BLOCKED",
      message: precheck.block_reason,
      canRetry: false
    });
  }

  const branchRequiresQr = Boolean(precheck?.requires_qr);
  const needsQrScan = Boolean(forceQrScan || (!isFieldWorkMode && branchRequiresQr));
  let qrToken = manualQrToken ? String(manualQrToken).trim() : "";

  // Nếu không có GPS VÀ không khớp Wi-Fi nội bộ VÀ không quét QR -> trả trạng thái permission-denied / fallback rõ ràng (không giả lập GPS!)
  if (!gpsGranted && !precheck?.matched_wifi && !needsQrScan && !qrToken) {
    return createServiceResult({
      state: locResult.state,
      errorCode: locResult.errorCode,
      message:
        locResult.message ||
        "Chưa lấy được vị trí GPS và không thuộc Wi-Fi nội bộ. Bạn có thể bật quyền Vị trí hoặc chuyển sang Quét QR chi nhánh.",
      canRetry: locResult.canRetry,
      canOpenSettings: locResult.canOpenSettings,
      data: { precheck, canUseQrFallback: true }
    });
  }

  // Bước 5: Quét QR động nếu chi nhánh yêu cầu hoặc nhân viên chọn quét QR
  if (needsQrScan && !qrToken) {
    const qrRes = await scanAttendanceQr({ timeoutMs: 25000 });
    if (!qrRes.ok) {
      return createServiceResult({
        state: qrRes.state,
        errorCode: qrRes.errorCode,
        message: qrRes.message,
        canRetry: qrRes.canRetry,
        canOpenSettings: qrRes.canOpenSettings,
        data: { precheck, qrFailed: true }
      });
    }
    qrToken = qrRes.data.qrToken;
  }

  // Bước 6: Gửi payload xác thực + client_nonce + Idempotency-Key lên Backend quyết định
  const devIdentity = await getDeviceIdentity();
  const idempotencyKey = generateIdempotencyKey("checkin");
  const clientNonce =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `nonce_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const resolvedFieldNote = isFieldWorkMode
    ? (String(fieldNote || "").trim().length >= 2 ? String(fieldNote).trim() : "Đi công trình / Thị trường (GPS)")
    : "";

  const attendanceMode = qrToken && !gpsGranted ? "QR_FALLBACK" : undefined;

  const result = await safePost(
    "/attendance/check-in",
    {
      lat,
      lng,
      zalo_location_token: locationToken || undefined,
      zalo_access_token: accessToken || undefined,
      qr_token: qrToken || undefined,
      client_nonce: clientNonce,
      attendance_mode: attendanceMode,
      device_name: devIdentity.device_model_name,
      device_info: devIdentity.device_info,
      gps_accuracy: gpsAccuracy,
      is_fake_gps: isFakeGps,
      work_location_type: isFieldWorkMode ? "FIELD_WORK" : "OFFICE",
      field_note: resolvedFieldNote
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
  fetchDynamicBranchQr,
  executeSmartAttendanceFlow,
  fetchTodayAndMonthlyStatus
};

export default attendanceService;
