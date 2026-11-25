import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import {
  SDK_STATES,
  createServiceResult,
  isZaloMiniAppRuntime,
  withSdkTimeout,
  mapZaloSdkError
} from "./zalo-sdk-core";

/**
 * Zalo QR Scanner Service (Phase 1 Smart Attendance):
 * - Kiểm tra/xin quyền Camera (ID 87) khi chạy trong Zalo trước khi mở scanQRCode().
 * - Trả về trạng thái chuẩn hóa (success | permission-denied | pending-zalo-approval | fallback | error).
 */

export async function ensureQrCameraReady() {
  if (!isZaloMiniAppRuntime()) {
    return createServiceResult({
      state: SDK_STATES.FALLBACK,
      errorCode: "NOT_IN_ZALO_RUNTIME",
      message: "Camera quét QR Zalo Mini App chỉ khả dụng khi mở từ ứng dụng Zalo Mobile."
    });
  }

  try {
    const cur = await withSdkTimeout(() => zmpAdapter.checkCameraPermission(), 4000, "checkZaloCameraPermission");
    if (cur?.userAllow) {
      return createServiceResult({ state: SDK_STATES.SUCCESS, data: { granted: true } });
    }
    const req = await withSdkTimeout(() => zmpAdapter.requestCameraPermission(), 10000, "requestCameraPermission");
    if (req?.userAllow) {
      return createServiceResult({ state: SDK_STATES.SUCCESS, data: { granted: true } });
    }
    return createServiceResult({
      state: SDK_STATES.PERMISSION_DENIED,
      errorCode: "CAMERA_PERMISSION_DENIED",
      message: "Bạn chưa cấp quyền Camera (Zalo ID 87) để quét mã QR chấm công.",
      canRetry: true,
      canOpenSettings: true
    });
  } catch (err) {
    return createServiceResult(mapZaloSdkError(err, "Không thể kiểm tra quyền Camera trên Zalo."));
  }
}

export async function scanAttendanceQr({ timeoutMs = 25000 } = {}) {
  const camReady = await ensureQrCameraReady();
  if (!camReady.ok) {
    return camReady;
  }

  try {
    const scanRes = await withSdkTimeout(() => zmpAdapter.scanQRCode(), timeoutMs, "scanQRCode");
    const content = String(scanRes?.content || "").trim();
    if (!content) {
      return createServiceResult({
        state: SDK_STATES.ERROR,
        errorCode: "EMPTY_QR_CONTENT",
        message: "Chưa quét được nội dung mã QR. Vui lòng đưa camera vào đúng mã QR chấm công.",
        canRetry: true
      });
    }
    return createServiceResult({
      state: SDK_STATES.SUCCESS,
      data: { qrToken: content }
    });
  } catch (err) {
    return createServiceResult(mapZaloSdkError(err, "Quét mã QR chưa thành công hoặc đã hủy."));
  }
}

export const zaloQrService = {
  ensureQrCameraReady,
  scanAttendanceQr
};

export default zaloQrService;
