import React, { useState, useRef, useEffect } from "react";
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
  HelpCircle
} from "lucide-react";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { safePost, safeGet, generateIdempotencyKey } from "../utils/api";

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
  const [statusMessage, setStatusMessage] = useState("Chạm nút bên dưới để điểm danh");
  const [serverTimeResult, setServerTimeResult] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState("");

  // Cờ Ref khóa nút bấm ngay lập tức ở mức phần cứng để chống double click
  const isLockedRef = useRef(false);
  const timeoutIdRef = useRef(null);
  const lastIdempotencyKeyRef = useRef("");

  // Xác định loại chấm công: "in" (Vào ca) hoặc "out" (Ra ca) theo dữ liệu server
  const hasCheckedIn = Boolean(todayAttendance && todayAttendance.check_in_time);
  const hasCheckedOut = Boolean(todayAttendance && todayAttendance.check_out_time);
  const checkinType = hasCheckedIn && !hasCheckedOut ? "out" : "in";

  // Dọn dẹp timer khi unmount
  useEffect(() => {
    return () => {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, []);

  // Bắt đầu luồng Chấm Công 1 Chạm
  const handleStartCheckIn = async (bypassPermExplain = false) => {
    // 1. Khóa nút ngay lập tức bằng cờ Ref
    if (isLockedRef.current) return;
    if (isLockedPeriod) {
      setStage(STAGES.ERROR);
      setErrorMessage("Kỳ chấm công tháng này đã được Kế toán chốt. Không thể ghi nhận thêm.");
      return;
    }

    isLockedRef.current = true;
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

      // 4. Lấy Access Token & Location Token từ Zalo SDK
      setStage(STAGES.LOCATING);
      setStatusMessage("Đang lấy tín hiệu vị trí GPS từ Zalo...");

      const [accessToken, locationRes] = await Promise.all([
        zmpAdapter.getAccessToken().catch(() => ""),
        zmpAdapter.getLocation()
      ]);

      if (!locationRes || !locationRes.token) {
        throw {
          code: "NO_LOCATION_TOKEN",
          message: "Không nhận được mã xác thực vị trí (Location Token) từ Zalo."
        };
      }

      // 5. Gửi lên Server với Khóa Idempotency duy nhất
      setStage(STAGES.SUBMITTING);
      setStatusMessage("Đang gửi dữ liệu xác thực lên máy chủ Sedinco...");

      // Tạo khóa Idempotency mới cho phiên gửi này
      lastIdempotencyKeyRef.current = generateIdempotencyKey("checkin");

      const payload = {
        employee_id: currentUser?.ma_nv,
        type: checkinType, // 'in' hoặc 'out'
        location_token: locationRes.token,
        zalo_access_token: accessToken,
        bio_evidence: bioEvidence,
        client_timestamp: Date.now()
      };

      let result = null;
      try {
        result = await safePost("/attendance/update", payload, {
          idempotencyKey: lastIdempotencyKeyRef.current
        });
      } catch (postErr) {
        // Backend V1 compatibility: fallback nếu endpoint trả về format V1
        if (postErr?.status === 409 || postErr?.status === 429) {
          throw postErr;
        }
        // Thử lại hoặc báo lỗi
        throw postErr;
      }

      // 6. Hoàn tất thành công: Hiển thị GIỜ DO SERVER TRẢ (không dùng giờ máy client)
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      
      const serverTime = result?.server_time || result?.data?.server_time || new Date().toLocaleTimeString("vi-VN", { hour12: false });
      setServerTimeResult(serverTime);
      setStage(STAGES.SUCCESS);
      setStatusMessage(
        checkinType === "in"
          ? `Đã chấm công VÀO ca lúc ${serverTime} (Giờ máy chủ)`
          : `Đã chấm công RA ca lúc ${serverTime} (Giờ máy chủ)`
      );

      if (onCheckInSuccess) onCheckInSuccess(result);

    } catch (err) {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      setStage(STAGES.ERROR);

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

  return (
    <div className="w-full flex flex-col items-center justify-center p-4">
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

      {/* NÚT CHẤM CÔNG 1 CHẠM LỚN (BIG BUTTON) */}
      <div className="relative my-4 flex flex-col items-center">
        {/* Vòng lan tỏa (Ripple Effect) khi đang xử lý */}
        {(stage === STAGES.LOCATING || stage === STAGES.SUBMITTING || stage === STAGES.BIO_AUTH) && (
          <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-30 pointer-events-none" />
        )}

        <button
          type="button"
          onClick={() => handleStartCheckIn(false)}
          disabled={isLockedRef.current || stage === STAGES.SUBMITTING || isLockedPeriod}
          className={`relative w-48 h-48 md:w-56 md:h-56 rounded-full flex flex-col items-center justify-center text-white transition-all duration-300 shadow-2xl select-none cursor-pointer active:scale-95 disabled:cursor-not-allowed ${
            isLockedPeriod
              ? "bg-slate-400 border-4 border-slate-300 shadow-none opacity-60"
              : stage === STAGES.SUCCESS
              ? "bg-gradient-to-tr from-emerald-600 to-teal-500 border-4 border-emerald-300 shadow-emerald-500/40"
              : stage === STAGES.ERROR
              ? "bg-gradient-to-tr from-rose-600 to-red-500 border-4 border-rose-300 shadow-rose-500/40"
              : checkinType === "in"
              ? "bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-700 border-4 border-blue-300 shadow-blue-500/40 hover:shadow-blue-500/60"
              : "bg-gradient-to-tr from-amber-600 via-orange-600 to-amber-700 border-4 border-amber-300 shadow-amber-500/40 hover:shadow-amber-500/60"
          }`}
        >
          {/* Biểu tượng trạng thái động */}
          <div className="mb-2">
            {stage === STAGES.SUCCESS ? (
              <CheckCircle2 size={48} className="animate-bounce" />
            ) : stage === STAGES.ERROR ? (
              <AlertCircle size={48} />
            ) : stage === STAGES.BIO_AUTH ? (
              <Fingerprint size={48} className="animate-pulse text-blue-200" />
            ) : stage === STAGES.LOCATING ? (
              <MapPin size={48} className="animate-bounce text-amber-200" />
            ) : stage === STAGES.SUBMITTING ? (
              <Send size={44} className="animate-pulse" />
            ) : (
              <Clock size={48} />
            )}
          </div>

          {/* Tiêu đề nút */}
          <span className="font-black text-lg md:text-xl tracking-tight uppercase leading-tight text-center px-4">
            {stage === STAGES.SUBMITTING
              ? "ĐANG XÁC THỰC"
              : stage === STAGES.LOCATING
              ? "ĐANG ĐỊNH VỊ"
              : stage === STAGES.BIO_AUTH
              ? "SINH TRẮC HỌC"
              : stage === STAGES.SUCCESS
              ? "THÀNH CÔNG"
              : stage === STAGES.ERROR
              ? "THỬ LẠI"
              : checkinType === "in"
              ? "CHẤM CÔNG VÀO"
              : "CHẤM CÔNG RA"}
          </span>

          {/* Phụ đề hướng dẫn */}
          <span className="text-[11px] font-semibold text-white/80 mt-1">
            {isLockedPeriod ? "Kỳ đã chốt" : "Chạm 1 lần duy nhất"}
          </span>
        </button>
      </div>

      {/* DÒNG THÔNG BÁO TIẾN ĐỘ 5 TRẠNG THÁI */}
      <div className="w-full max-w-sm text-center mt-3 space-y-2">
        <div
          className={`py-2 px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-all ${
            stage === STAGES.SUCCESS
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : stage === STAGES.ERROR
              ? "bg-rose-50 text-rose-800 border border-rose-200"
              : "bg-slate-100 text-slate-700 border border-slate-200"
          }`}
        >
          {stage === STAGES.SUCCESS && <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />}
          {stage === STAGES.ERROR && <AlertCircle size={15} className="text-rose-600 shrink-0" />}
          {stage !== STAGES.SUCCESS && stage !== STAGES.ERROR && (
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping shrink-0" />
          )}
          <span>{statusMessage}</span>
        </div>

        {/* Khối Báo Lỗi Chi Tiết & Nút Thử Lại */}
        {stage === STAGES.ERROR && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-left space-y-2 animate-in fade-in duration-200">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-extrabold text-xs text-rose-900">{errorMessage}</h4>
                {errorDetails && <p className="text-[11px] text-rose-700 mt-0.5">{errorDetails}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleStartCheckIn(true)}
              className="w-full py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer mt-1"
            >
              <RotateCcw size={13} />
              <span>Thử lại ngay</span>
            </button>
          </div>
        )}

        {/* Thông tin xác thực giờ Server khi thành công */}
        {serverTimeResult && stage === STAGES.SUCCESS && (
          <p className="text-[11px] text-slate-500 font-medium">
            Thời gian xác thực: <span className="font-bold text-slate-700">{serverTimeResult}</span> (Chuẩn NTP Server Sedinco)
          </p>
        )}
      </div>
    </div>
  );
}
