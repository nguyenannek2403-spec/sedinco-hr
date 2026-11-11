import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Clock,
  MapPin,
  Fingerprint,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Send,
  QrCode,
  Camera
} from "lucide-react";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { safePost, safeGet, generateIdempotencyKey } from "../utils/api";
import { captureDirectCameraPhoto } from "../utils/imageHelper";

// Cờ cấu hình Sinh trắc học: Mặc định TẮT theo quy định Zalo Mini App Team
export const FEATURE_BIOMETRIC_ENABLED = false;

// Các trạng thái của luồng F2
const STAGES = {
  IDLE: "idle", // Sẵn sàng
  PERM_EXPLAIN: "perm_explain", // Giải thích mục đích xin quyền vị trí
  BIO_AUTH: "bio_auth", // Đang xác thực sinh trắc học (nếu cờ bật)
  LOCATING: "locating", // Đang lấy token vị trí GPS từ Zalo
  SUBMITTING: "submitting", // Đang gửi gói tin chấm công lên server
  SUCCESS: "success", // Hoàn tất thành công (Hiển thị giờ Server)
  ERROR: "error" // Có lỗi (kèm thông điệp chi tiết & nút thử lại)
};

// Khóa module-level chống double click phần cứng trên mọi nền tảng
let globalCheckInLockTimestamp = 0;
export function getGlobalCheckInLockTimestamp() {
  return globalCheckInLockTimestamp;
}
export function resetGlobalCheckInLockTimestamp() {
  globalCheckInLockTimestamp = 0;
}

/**
 * F2: Thành phần Chấm Công 1 Chạm (Trọng tâm trải nghiệm Nhân viên Sedinco)
 */
export default function OneTouchCheckIn({
  currentUser,
  todayAttendance = null,
  onCheckInSuccess,
  isLockedPeriod = false
}) {
  const [stage, setStage] = useState(STAGES.IDLE);
  const [statusMessage, setStatusMessage] = useState("Chạm nút bên dưới hoặc Quét QR để điểm danh");
  const [serverTimeResult, setServerTimeResult] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const [isDebounceLocked, setIsDebounceLocked] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState("");
  const [liveTodayRecord, setLiveTodayRecord] = useState(todayAttendance);
  const [monthlyCount, setMonthlyCount] = useState(0);

  // Cờ Ref khóa nút bấm ngay lập tức ở mức phần cứng để chống double click
  const isLockedRef = useRef(false);
  const timeoutIdRef = useRef(null);
  const lastIdempotencyKeyRef = useRef("");

  const fetchTodayStatus = useCallback(async () => {
    try {
      const now = new Date();
      const res = await safeGet("/attendance/me", {
        month: now.getMonth() + 1,
        year: now.getFullYear()
      });
      const list = Array.isArray(res?.data) ? res.data : [];
      const todayIso = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      const found = list.find((r) => String(r.record_date || "").slice(0, 10) === todayIso);
      if (found) setLiveTodayRecord(found);
      setMonthlyCount(list.filter((r) => r.status && r.status !== "0" && r.status !== "V").length);
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchTodayStatus();
  }, [fetchTodayStatus]);

  // Xác định loại chấm công: "in" (Vào ca) hoặc "out" (Ra ca) theo dữ liệu server
  const effectiveToday = liveTodayRecord || todayAttendance;
  const hasCheckedIn = Boolean(effectiveToday && effectiveToday.check_in_time);
  const hasCheckedOut = Boolean(effectiveToday && effectiveToday.check_out_time);
  const checkinType = hasCheckedIn && !hasCheckedOut ? "out" : "in";

  // Dọn dẹp timer khi unmount
  useEffect(() => {
    return () => {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, []);

  // Bắt đầu luồng Chấm Công 1 Chạm
  const handleStartCheckIn = async (bypassPermExplain = false) => {
    const nowMs = Date.now();
    // 1. Khóa nút ngay lập tức bằng cờ Ref, State DOM và Timestamp module-level (3000ms)
    if (isLockedRef.current || isDebounceLocked || (nowMs - globalCheckInLockTimestamp < 3000)) return;
    globalCheckInLockTimestamp = nowMs;
    isLockedRef.current = true;
    setIsDebounceLocked(true);
    setTimeout(() => {
      isLockedRef.current = false;
      setIsDebounceLocked(false);
    }, 3000);

    if (isLockedPeriod) {
      setStage(STAGES.ERROR);
      setErrorMessage("Kỳ chấm công tháng này đã được Kế toán chốt. Không thể ghi nhận thêm.");
      return;
    }

    setErrorMessage("");
    setErrorDetails("");

    // Đặt bộ đếm thời gian timeout tổng 20 giây
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = setTimeout(() => {
      if (isLockedRef.current) {
        setStage(STAGES.ERROR);
        setErrorMessage("Quá thời gian xử lý 20 giây. Vui lòng kiểm tra kết nối mạng và thử lại.");
        isLockedRef.current = false;
      }
    }, 20000);

    try {
      // 2. Kiểm tra giải thích quyền vị trí (chỉ hiển thị 1 lần nếu chưa cấp quyền)
      const hasSeenPerm = localStorage.getItem("sedinco_has_seen_location_perm");
      if (!hasSeenPerm && !bypassPermExplain) {
        setStage(STAGES.PERM_EXPLAIN);
        isLockedRef.current = false;
        if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
        return;
      }

      // 3. Xác thực sinh trắc học (nếu cờ bật)
      let bioEvidence = null;
      if (FEATURE_BIOMETRIC_ENABLED) {
        setStage(STAGES.BIO_AUTH);
        setStatusMessage("Đang xác thực sinh trắc học trên thiết bị...");
        
        try {
          const secretData = `sedinco_bio_${Date.now()}_${currentUser?.ma_nv}`;
          const bioRes = await zmpAdapter.openBioAuthentication({ secretData });
          bioEvidence = {
            token: bioRes.token,
            bioState: bioRes.bioState
          };
          if (bioRes.bioState === "CHANGED") {
            throw {
              code: "BIO_STATE_CHANGED",
              message: "Phát hiện thiết bị có thay đổi cấu hình vân tay/Face ID mới. Vui lòng liên hệ phòng Nhân sự để xác thực lại."
            };
          }
        } catch (bioErr) {
          if (bioErr.code === "BIO_NOT_ENROLLED") {
            throw bioErr;
          }
          if (bioErr.code === "BIO_USER_CANCELLED") {
            throw bioErr;
          }
          throw {
            code: "BIO_FAILED",
            message: "Xác thực sinh trắc học không thành công. Bạn có thể thử lại.",
            raw: bioErr
          };
        }
      }

      // 4. Lấy Access Token & Location Token từ Zalo SDK (hoặc Web Geolocation fallback)
      setStage(STAGES.LOCATING);
      setStatusMessage("Đang lấy tín hiệu vị trí GPS...");

      let accessToken = "";
      try {
        accessToken = await zmpAdapter.getAccessToken().catch(() => "");
      } catch (e) {}

      let locationToken = "";
      let rawLat = 16.0544;
      let rawLng = 108.2022;
      try {
        const locationRes = await zmpAdapter.getLocation();
        locationToken = locationRes?.token || "";
        if (locationRes?.latitude && locationRes?.longitude) {
          rawLat = Number(locationRes.latitude);
          rawLng = Number(locationRes.longitude);
        }
      } catch (e) {
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          try {
            const pos = await new Promise((res, rej) =>
              navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000, enableHighAccuracy: true })
            );
            rawLat = Number(pos.coords.latitude);
            rawLng = Number(pos.coords.longitude);
          } catch {}
        }
      }

      // 5. Gửi lên Server qua /attendance/check-in với QR Token động + GPS + Ảnh < 50KB
      setStage(STAGES.SUBMITTING);
      setStatusMessage("Đang gửi dữ liệu xác thực lên máy chủ Sedinco...");

      const now = new Date();
      lastIdempotencyKeyRef.current = generateIdempotencyKey("checkin");

      let result = null;
      try {
        let qrToken = localStorage.getItem("sedinco_current_qr_token") || "";
        if (qrToken) {
          localStorage.removeItem("sedinco_current_qr_token");
        } else {
          // Tự động lấy phiên QR 1 lần từ máy chủ cho chấm công 1 chạm
          const qrRes = await safeGet("/attendance/qr", { branch_id: 1 });
          qrToken = qrRes?.data?.token || qrRes?.token || "";
        }

        if (!qrToken) {
          throw new Error("Không thể khởi tạo mã phiên chấm công. Vui lòng quét mã QR trên màn hình Admin/Kiosk.");
        }

        result = await safePost("/attendance/check-in", {
          token: qrToken,
          lat: rawLat,
          lng: rawLng,
          zalo_location_token: locationToken || undefined,
          zalo_access_token: accessToken || undefined,
          bio_evidence: bioEvidence || undefined,
          image_snapshot: capturedPhoto || "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="
        }, {
          idempotencyKey: lastIdempotencyKeyRef.current
        });
      } catch (postErr) {
        console.warn("Lỗi khi gửi chấm công:", postErr);
        const errText = postErr.message || postErr.data?.message || postErr.response?.data?.message || "Lỗi kết nối mạng khi gửi chấm công";
        setStage(STAGES.ERROR);
        // Sửa thông báo chuẩn tiếng Việt khi QR đã được sử dụng (G8.5 Mục E)
        if (errText.includes("đã được sử dụng") || errText.includes("vừa có người dùng")) {
          setErrorMessage("Mã vừa có người dùng, vui lòng quét mã mới");
          setErrorDetails("Mã vừa có người dùng hoặc đã được sử dụng trước đó. Vui lòng quét mã mới trên màn hình Kiosk.");
        } else {
          setErrorMessage(errText);
          setErrorDetails("Vui lòng kiểm tra lại kết nối mạng 4G/Wifi hoặc thử lại.");
        }
        // GIẢI PHÓNG KHÓA NGAY LẬP TỨC KHI THẤT BẠI: Cho phép công nhân thử lại ngay lập tức trong vòng 1s
        isLockedRef.current = false;
        globalCheckInLockTimestamp = 0;
        if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
        return;
      }

      // 6. Hoàn tất thành công: Rung phản hồi (vibrate), Hiển thị GIỜ DO SERVER TRẢ & ĐÁNH GIÁ CÔNG TỰ ĐỘNG
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      await zmpAdapter.vibrate("light");
      
      const serverTime = result?.server_time || result?.data?.check_in_time || result?.data?.server_time || new Date().toLocaleTimeString("vi-VN", { hour12: false });
      setServerTimeResult(serverTime);
      setStage(STAGES.SUCCESS);
      fetchTodayStatus();

      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      let autoShiftMsg = "";

      if (checkinType === "in") {
        if (currentMinutes <= 480) { // Trước hoặc đúng 08:00
          autoShiftMsg = `Đã Chấm Công Vào lúc ${serverTime}. Đúng giờ ca sáng (08:00 - 12:00)!`;
        } else {
          const late = currentMinutes - 480;
          autoShiftMsg = `Đã Chấm Công Vào lúc ${serverTime}. Trễ ${late} phút so với giờ chuẩn (08:00).`;
        }
      } else {
        if (currentMinutes >= 1020) { // Sau hoặc đúng 17:00
          autoShiftMsg = `Đã Chấm Công Ra lúc ${serverTime}. Hoàn thành đủ 1 ngày công (8 tiếng = 480 phút)!`;
        } else if (currentMinutes <= 720) { // Ra trước hoặc đúng 12:00
          autoShiftMsg = `Đã Chấm Công Ra lúc ${serverTime}. Ghi nhận hoàn tất nửa ngày công sáng (240 phút = 0.5 công).`;
        } else {
          const early = 1020 - currentMinutes;
          autoShiftMsg = `Đã Chấm Công Ra lúc ${serverTime}. Về sớm ${early} phút so với giờ tan ca (17:00).`;
        }
      }

      setStatusMessage(autoShiftMsg);

      if (onCheckInSuccess) onCheckInSuccess({ ...result, autoShiftMsg });

    } catch (err) {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      setStage(STAGES.ERROR);
      // Mở khóa ngay lập tức khi gặp ngoại lệ để người dùng có thể bấm lại
      isLockedRef.current = false;
      globalCheckInLockTimestamp = 0;

      // Phân tích mã lỗi theo danh mục yêu cầu
      if (err.code === "LOCATION_PERMISSION_DENIED") {
        setErrorMessage("Quyền truy cập vị trí bị từ chối.");
        setErrorDetails("Vui lòng vào Cài đặt Zalo -> Quyền ứng dụng và cấp quyền 'Vị trí' để thực hiện chấm công.");
      } else if (err.code === "GPS_DISABLED") {
        setErrorMessage("Định vị GPS trên thiết bị đang tắt.");
        setErrorDetails("Vui lòng vuốt thanh trạng thái điện thoại và bật biểu tượng GPS/Vị trí.");
      } else if (err.code === "BIO_NOT_ENROLLED") {
        setErrorMessage("Thiết bị chưa cài đặt vân tay/Face ID (Mã -107).");
        setErrorDetails("Vui lòng thiết lập khóa màn hình sinh trắc học trong Cài đặt của điện thoại.");
      } else if (err.code === "BIO_USER_CANCELLED") {
        setErrorMessage("Bạn đã hủy xác thực sinh trắc học.");
        setErrorDetails("Vui lòng chạm nút để thử lại khi đã sẵn sàng.");
      } else if (err.code === "BIO_STATE_CHANGED") {
        setErrorMessage("Dữ liệu sinh trắc học đã thay đổi.");
        setErrorDetails(err.message);
      } else if (err.status === 409) {
        setErrorMessage("Bạn đã thực hiện chấm công ca này rồi.");
        setErrorDetails("Máy chủ đã ghi nhận lượt chấm công trước đó. Tránh bấm lặp nhiều lần.");
      } else if (err.status === 429) {
        setErrorMessage("Thao tác quá nhanh (429 Rate Limit).");
        setErrorDetails("Hệ thống phát hiện tần suất gửi yêu cầu bất thường. Vui lòng chờ vài giây.");
      } else if (err.message && err.message.toLowerCase().includes("ngoài vùng")) {
        setErrorMessage("Vị trí của bạn nằm ngoài bán kính cho phép.");
        setErrorDetails("Vui lòng có mặt trong phạm vi văn phòng hoặc công trình Sedinco để chấm công.");
      } else {
        setErrorMessage(err.message || "Không thể hoàn thành chấm công.");
        setErrorDetails("Vui lòng kiểm tra lại kết nối mạng 4G/Wifi hoặc thử lại sau.");
      }
    } finally {
      isLockedRef.current = false;
    }
  };

  // Người dùng xác nhận giải thích quyền vị trí
  const handleAcceptPermExplain = () => {
    localStorage.setItem("sedinco_has_seen_location_perm", "true");
    setStage(STAGES.IDLE);
    handleStartCheckIn(true);
  };

  // Quét mã QR trực tiếp từ màn hình Kiosk / Điện thoại Admin bằng Zalo SDK
  const handleScanQrAndCheckIn = async () => {
    try {
      const scanRes = await zmpAdapter.scanQRCode();
      if (scanRes?.content) {
        localStorage.setItem("sedinco_current_qr_token", scanRes.content.trim());
        localStorage.setItem("sedinco_has_seen_location_perm", "true");
        await handleStartCheckIn(true);
      }
    } catch (err) {
      setStage(STAGES.ERROR);
      setErrorMessage(err?.message || "Không thể mở camera quét QR Zalo.");
      setErrorDetails("Bạn vẫn có thể nhấn nút CHẤM CÔNG tròn lớn bên trên để điểm danh 1 chạm.");
    }
  };

  // Chụp ảnh xác thực khuôn mặt (< 50KB)
  const handleCaptureSelfie = async () => {
    const res = await captureDirectCameraPhoto();
    if (res?.success && res?.photoUrl) {
      setCapturedPhoto(res.photoUrl);
      setStatusMessage("Đã chụp & nén ảnh xác thực (< 50KB). Bấm CHẤM CÔNG để gửi!");
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center p-2 sm:p-4">
      {/* Thẻ tóm tắt trạng thái công hôm nay & tổng công tháng */}
      <div className="w-full max-w-sm mb-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between text-xs shadow-md">
        <div>
          <span className="text-slate-400 font-medium block">Hôm nay ({new Date().toLocaleDateString("vi-VN")}):</span>
          <span className="font-black text-emerald-400 text-sm">
            {effectiveToday?.check_in_time
              ? `Đã điểm danh lúc ${effectiveToday.check_in_time}`
              : "Chưa điểm danh"}
          </span>
        </div>
        <div className="text-right bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700">
          <span className="text-[10px] text-slate-400 uppercase font-bold block">Công tháng này</span>
          <span className="text-base font-black text-blue-400">{monthlyCount} ngày</span>
        </div>
      </div>
      {/* Modal Giải Thích Quyền Vị Trí (Hiển thị 1 lần) */}
      {stage === STAGES.PERM_EXPLAIN && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl text-slate-800 text-center animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 shadow-sm border border-blue-100">
              <MapPin size={32} />
            </div>
            <h3 className="font-black text-lg text-slate-900 mb-2">Quyền Truy Cập Vị Trí</h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Sedinco HR cần sử dụng vị trí GPS của bạn để đối chiếu bán kính công trình hoặc văn phòng nhà máy khi chấm công.
              <span className="block font-semibold text-blue-700 mt-1">
                Token vị trí chỉ tồn tại trong 2 phút và chỉ được dùng cho mục đích chấm công duy nhất.
              </span>
            </p>
            <button
              type="button"
              onClick={handleAcceptPermExplain}
              className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-lg shadow-blue-500/30 transition-all cursor-pointer"
            >
              TÔI HIỂU & CHO PHÉP
            </button>
          </div>
        </div>
      )}

      {/* NÚT CHẤM CÔNG 1 CHẠM LỚN (BIG BUTTON - DỄ BẤM CHO NGƯỜI LỚN TUỔI) */}
      <div className="relative my-4 flex flex-col items-center">
        <button
          id="btn-start-checkin"
          type="button"
          onClick={() => handleStartCheckIn(false)}
          disabled={isDebounceLocked || isLockedRef.current || stage === STAGES.SUBMITTING || isLockedPeriod}
          className={`relative w-52 h-52 md:w-60 md:h-60 rounded-full flex flex-col items-center justify-center text-white transition-all duration-200 shadow-2xl select-none cursor-pointer active:scale-95 disabled:cursor-not-allowed border-[6px] ${
            isLockedPeriod
              ? "bg-slate-600 border-slate-400 opacity-70"
              : stage === STAGES.SUCCESS
              ? "bg-emerald-600 border-white shadow-emerald-600/50"
              : stage === STAGES.ERROR
              ? "bg-rose-600 border-white shadow-rose-600/50"
              : checkinType === "in"
              ? "bg-blue-600 border-white hover:bg-blue-500 shadow-blue-600/50"
              : "bg-amber-600 border-white hover:bg-amber-500 shadow-amber-600/50"
          }`}
        >
          {/* Biểu tượng trạng thái rõ ràng, không giật lắc */}
          <div className="mb-2">
            {stage === STAGES.SUCCESS ? (
              <CheckCircle2 size={54} className="text-white" />
            ) : stage === STAGES.ERROR ? (
              <AlertCircle size={54} className="text-white" />
            ) : stage === STAGES.BIO_AUTH ? (
              <Fingerprint size={54} className="text-blue-100" />
            ) : stage === STAGES.LOCATING ? (
              <MapPin size={54} className="text-amber-100" />
            ) : stage === STAGES.SUBMITTING ? (
              <Send size={50} className="text-white" />
            ) : (
              <Clock size={54} className="text-white" />
            )}
          </div>

          {/* Tiêu đề nút - Đổi thành CHẤM CÔNG chuẩn theo yêu cầu */}
          <span className="font-black text-2xl md:text-3xl tracking-normal uppercase leading-tight text-center px-4">
            {stage === STAGES.SUBMITTING
              ? "ĐANG XÁC THỰC"
              : stage === STAGES.LOCATING
              ? "ĐANG ĐỊNH VỊ"
              : stage === STAGES.BIO_AUTH
              ? "SINH TRẮC HỌC"
              : stage === STAGES.SUCCESS
              ? "THÀNH CÔNG"
              : stage === STAGES.ERROR
              ? "BẤM THỬ LẠI"
              : "CHẤM CÔNG"}
          </span>

          {/* Phụ đề hướng dẫn tự động: Hệ thống tự nhận biết Vào ca hay Ra ca */}
          <span className="text-xs md:text-sm font-black text-white mt-2 bg-black/30 px-3.5 py-1 rounded-full border border-white/20">
            {isLockedPeriod
              ? "Kỳ công đã chốt"
              : stage === STAGES.SUCCESS
              ? (serverTimeResult ? `Đã ghi nhận lúc ${serverTimeResult}` : "Đã hoàn thành")
              : checkinType === "in"
              ? "Lần 1: Vào ca (Chuẩn 08:00 - 12:00)"
              : "Lần 2: Tan ca (Chuẩn 13:00 - 17:00)"}
          </span>
        </button>
      </div>

      {/* Cụm nút Quét Mã QR Kiosk & Chụp Ảnh Xác Thực (< 50KB) */}
      <div className="w-full max-w-sm grid grid-cols-2 gap-2.5 mt-2">
        <button
          type="button"
          onClick={handleScanQrAndCheckIn}
          disabled={isDebounceLocked || stage === STAGES.SUBMITTING}
          className="min-h-[46px] py-2.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-blue-300 font-bold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-95 transition"
        >
          <QrCode size={16} className="text-blue-400 shrink-0" />
          <span>Quét QR Kiosk</span>
        </button>

        <button
          type="button"
          onClick={handleCaptureSelfie}
          disabled={isDebounceLocked || stage === STAGES.SUBMITTING}
          className="min-h-[46px] py-2.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-95 transition"
        >
          <Camera size={16} className="text-emerald-400 shrink-0" />
          <span>{capturedPhoto ? "Đã chụp (<50KB)" : "Chụp ảnh Selfie"}</span>
        </button>
      </div>

      {/* DÒNG THÔNG BÁO TIẾN ĐỘ RÕ RÀNG */}
      <div className="w-full max-w-sm text-center mt-3 space-y-3">
        <div
          className={`py-3 px-5 rounded-2xl text-sm font-extrabold inline-flex items-center justify-center gap-2.5 transition-all border-2 shadow-sm ${
            stage === STAGES.SUCCESS
              ? "bg-emerald-50 text-emerald-900 border-emerald-400"
              : stage === STAGES.ERROR
              ? "bg-rose-50 text-rose-900 border-rose-400"
              : "bg-white text-slate-800 border-slate-300"
          }`}
        >
          {stage === STAGES.SUCCESS && <CheckCircle2 size={18} className="text-emerald-700 shrink-0" />}
          {stage === STAGES.ERROR && <AlertCircle size={18} className="text-rose-700 shrink-0" />}
          {stage !== STAGES.SUCCESS && stage !== STAGES.ERROR && (
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
          )}
          <span>{statusMessage}</span>
        </div>

        {/* Khối Báo Lỗi Chi Tiết & Nút Thử Lại */}
        {stage === STAGES.ERROR && (
          <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-left space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={20} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-black text-sm text-rose-950">{errorMessage}</h4>
                {errorDetails && <p className="text-xs text-rose-800 mt-1 font-medium">{errorDetails}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleStartCheckIn(true)}
              className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer border-2 border-rose-800 shadow-md"
            >
              <RotateCcw size={16} />
              <span>BẤM VÀO ĐÂY ĐỂ THỬ LẠI</span>
            </button>
          </div>
        )}

        {/* Thông tin xác thực giờ Server khi thành công */}
        {serverTimeResult && stage === STAGES.SUCCESS && (
          <p className="text-xs text-slate-700 font-bold bg-white p-2.5 rounded-xl border-2 border-emerald-200">
            Thời gian xác thực: <span className="text-emerald-700 font-black">{serverTimeResult}</span> (Giờ hệ thống Sedinco)
          </p>
        )}
      </div>
    </div>
  );
}
