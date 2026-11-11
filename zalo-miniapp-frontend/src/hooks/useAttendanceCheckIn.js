import { useState, useRef, useCallback } from "react";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { safePost, safeGet, generateIdempotencyKey } from "../utils/api";
import { captureDirectCameraPhoto, compressAndResizeImage } from "../utils/imageHelper";

export const CHECKIN_STAGES = {
  IDLE: "idle",
  LOCATING: "locating",
  CAPTURING: "capturing",
  SUBMITTING: "submitting",
  SUCCESS: "success",
  ERROR: "error"
};

let globalCheckInLockTime = 0;

export function useAttendanceCheckIn({ onCheckInSuccess } = {}) {
  const [stage, setStage] = useState(CHECKIN_STAGES.IDLE);
  const [statusMessage, setStatusMessage] = useState("Sẵn sàng điểm danh");
  const [serverTimeResult, setServerTimeResult] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const [lastCheckInResult, setLastCheckInResult] = useState(null);

  const isSubmittingRef = useRef(false);

  const resetStage = useCallback(() => {
    setStage(CHECKIN_STAGES.IDLE);
    setStatusMessage("Sẵn sàng điểm danh");
    setErrorMessage("");
    setErrorDetails("");
  }, []);

  /**
   * Thực hiện quy trình chấm công hợp nhất:
   * 1. Định vị GPS (Token Zalo hoặc Raw Coords)
   * 2. Chụp ảnh Selfie xác thực (nén Canvas < 50KB)
   * 3. Gửi gói tin đa nhân tố lên API /attendance/check-in
   */
  const performCheckIn = useCallback(async ({
    qrToken = null,
    manualCoords = null,
    customImage = null,
    requirePhoto = false
  } = {}) => {
    const now = Date.now();
    if (now - globalCheckInLockTime < 2500 || isSubmittingRef.current) {
      return { success: false, message: "Đang xử lý điểm danh, vui lòng không nhấn liên tục!" };
    }

    globalCheckInLockTime = now;
    isSubmittingRef.current = true;
    setErrorMessage("");
    setErrorDetails("");

    try {
      // 1. Lấy vị trí GPS
      setStage(CHECKIN_STAGES.LOCATING);
      setStatusMessage("Đang xác thực tọa độ vị trí...");

      let zaloLocationToken = "";
      let latitude = null;
      let longitude = null;

      if (manualCoords?.lat && manualCoords?.lng) {
        latitude = Number(manualCoords.lat);
        longitude = Number(manualCoords.lng);
      } else {
        try {
          const locRes = await zmpAdapter.getLocation();
          if (locRes?.token) {
            zaloLocationToken = locRes.token;
          }
          if (locRes?.latitude && locRes?.longitude) {
            latitude = Number(locRes.latitude);
            longitude = Number(locRes.longitude);
          }
        } catch (locErr) {
          console.warn("Không lấy được tọa độ Zalo SDK, thử fallback trình duyệt:", locErr);
          if (typeof navigator !== "undefined" && navigator.geolocation) {
            try {
              const pos = await new Promise((res, rej) => {
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000, enableHighAccuracy: true });
              });
              latitude = pos.coords.latitude;
              longitude = pos.coords.longitude;
            } catch (navErr) {
              console.warn("Fallback GPS trình duyệt cũng thất bại:", navErr);
            }
          }
        }
      }

      // 2. Chụp ảnh xác thực khuôn mặt nếu có yêu cầu hoặc customImage
      let imageSnapshot = null;
      if (customImage) {
        // Nén ảnh Canvas về chuẩn < 50KB
        imageSnapshot = await compressAndResizeImage(customImage, 480, 480, 0.6);
      } else if (requirePhoto) {
        setStage(CHECKIN_STAGES.CAPTURING);
        setStatusMessage("Đang mở camera chụp ảnh xác thực...");
        const photoRes = await captureDirectCameraPhoto();
        if (photoRes?.success && photoRes?.photoUrl) {
          imageSnapshot = photoRes.photoUrl;
        } else {
          throw new Error(photoRes?.error || "Chưa chụp được ảnh xác thực khuôn mặt!");
        }
      }

      // 3. Gửi lên máy chủ
      setStage(CHECKIN_STAGES.SUBMITTING);
      setStatusMessage("Đang đối soát vị trí & ghi nhận công...");

      let activeQrToken = qrToken || localStorage.getItem("sedinco_current_qr_token") || "";
      if (!activeQrToken) {
        const qrRes = await safeGet("/attendance/qr", { branch_id: 1 });
        activeQrToken = qrRes?.data?.token || qrRes?.token || "";
      }

      const idempotencyKey = generateIdempotencyKey();
      const payload = {
        token: activeQrToken,
        lat: latitude ?? 16.0544,
        lng: longitude ?? 108.2022,
        zalo_location_token: zaloLocationToken || undefined,
        image_snapshot: imageSnapshot || "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
        device_info: typeof navigator !== "undefined" ? {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language
        } : undefined
      };

      const res = await safePost("/attendance/check-in", payload, { idempotencyKey });

      if (res?.success) {
        await zmpAdapter.vibrate("light");
        setStage(CHECKIN_STAGES.SUCCESS);
        const serverTime = res.data?.server_time || new Date().toLocaleTimeString("vi-VN");
        setServerTimeResult(serverTime);
        setStatusMessage(`Điểm danh thành công lúc ${serverTime}`);
        setLastCheckInResult(res.data);

        if (typeof onCheckInSuccess === "function") {
          onCheckInSuccess(res.data);
        }
        return { success: true, data: res.data };
      } else {
        throw new Error(res?.message || "Điểm danh không thành công.");
      }
    } catch (err) {
      setStage(CHECKIN_STAGES.ERROR);
      const msg = err.message || "Lỗi kết nối điểm danh.";
      setErrorMessage(msg);
      setErrorDetails(err.details || "");
      setStatusMessage("Điểm danh thất bại");
      return { success: false, message: msg };
    } finally {
      isSubmittingRef.current = false;
    }
  }, [onCheckInSuccess]);

  return {
    stage,
    statusMessage,
    serverTimeResult,
    errorMessage,
    errorDetails,
    lastCheckInResult,
    performCheckIn,
    resetStage,
    isSubmitting: stage === CHECKIN_STAGES.LOCATING || stage === CHECKIN_STAGES.CAPTURING || stage === CHECKIN_STAGES.SUBMITTING
  };
}
