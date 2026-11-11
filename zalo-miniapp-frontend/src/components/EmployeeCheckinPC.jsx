import React, { useState } from "react";
import {
  Smartphone,
  MapPin,
  Camera,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  CheckCircle2
} from "lucide-react";
import { useAttendanceCheckIn, CHECKIN_STAGES } from "../hooks/useAttendanceCheckIn";

export default function EmployeeCheckinPC({
  currentUser,
  currentTime = new Date(),
  showToast
}) {
  const [gpsDisplay, setGpsDisplay] = useState("KCN Hòa Khánh, Liên Chiểu, Đà Nẵng (Mặc định Văn phòng)");
  const [cameraActive, setCameraActive] = useState(false);

  const {
    stage,
    statusMessage,
    serverTimeResult,
    errorMessage,
    performCheckIn,
    isSubmitting
  } = useAttendanceCheckIn({
    onCheckInSuccess: (data) => {
      if (showToast) {
        showToast(`Điểm danh PC thành công lúc ${data?.server_time || "giờ hệ thống"}!`, "success");
      }
    }
  });

  const handleExecuteCheckIn = async () => {
    // Gọi hook chấm công hợp nhất
    const res = await performCheckIn({
      manualCoords: { lat: 16.0544, lng: 108.2022 },
      requirePhoto: false
    });

    if (!res.success && showToast) {
      showToast(res.message, "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. HERO BANNER */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white rounded-3xl p-6 shadow-xl border-2 border-blue-600 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-black border border-white/30 backdrop-blur-md">
              <Smartphone size={16} className="text-blue-100" />
              <span>QUY CHUẨN ĐIỂM DANH DOANH NGHIỆP</span>
            </div>
            
            <h2 className="text-xl md:text-2xl font-black tracking-tight leading-snug">
              Chấm Công Định Vị GPS & Quét Khuôn Mặt Bằng Điện Thoại
            </h2>
            
            <p className="text-xs md:text-sm text-blue-100 leading-relaxed font-semibold">
              Theo quy định an ninh Sedinco HR, việc ghi nhận ngày công hợp lệ bắt buộc thực hiện trên 
              <strong className="text-white font-black underline ml-1">Điện thoại di động qua Zalo Mini App</strong> nhằm xác thực tọa độ GPS công trường (bán kính 50m) và chụp ảnh selfie xác thực danh tính.
            </p>
          </div>
        </div>
      </div>

      {/* 2. KHU VỰC CHẤM CÔNG THỬ NGHIỆM TRÊN PC */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cột 1 & 2: Bảng Điều Khiển Chấm Công PC */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-black text-lg text-white tracking-tight">
                Chấm Công Trực Tiếp (Kiểm Thử Trình Duyệt PC)
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Ghi nhận công trực tuyến qua kết nối mạng nội bộ • Khung giờ ca: 08:00 - 17:00
              </p>
            </div>
            <span className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-blue-500/15 text-blue-400 border border-blue-500/30 font-mono">
              {currentTime.toLocaleTimeString("vi-VN")}
            </span>
          </div>

          {/* Trạng thái lỗi hoặc thành công */}
          {errorMessage && (
            <div className="p-4 rounded-2xl text-xs flex items-center gap-3 font-bold border bg-rose-500/10 text-rose-400 border-rose-500/30">
              <AlertTriangle size={18} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {stage === CHECKIN_STAGES.SUCCESS && (
            <div className="p-4 rounded-2xl text-xs flex items-center gap-3 font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
              <CheckCircle2 size={18} className="shrink-0" />
              <span>Điểm danh thành công lúc {serverTimeResult} (Đã ghi nhận vào hệ thống)</span>
            </div>
          )}

          {/* Nút bấm chấm công lớn */}
          <div className="p-6 bg-slate-800/60 rounded-3xl border border-slate-700/60 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-1.5 text-center sm:text-left">
              <span className="text-[11px] text-slate-400 font-black uppercase tracking-wider block">
                Tiến trình xác thực
              </span>
              <div className="text-sm font-bold text-slate-200">
                {statusMessage}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Sử dụng API hợp nhất <code className="text-blue-400 font-mono">/attendance/check-in</code>
              </p>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleExecuteCheckIn}
              className="px-8 py-4 rounded-2xl text-white font-black text-sm md:text-base transition-all shadow-xl bg-blue-600 hover:bg-blue-500 shadow-blue-600/30 flex items-center gap-3 disabled:opacity-50"
            >
              {isSubmitting ? (
                <RefreshCw size={22} className="animate-spin" />
              ) : (
                <Clock size={22} />
              )}
              <span>CHẤM CÔNG TRÊN PC</span>
            </button>
          </div>

          {/* Xác thực Phụ: Tọa độ & Ảnh */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 bg-slate-800/40 border border-slate-700/50 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                <MapPin size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-black text-slate-200 block">Tọa độ GPS</span>
                <span className="text-[11px] text-slate-400 truncate block font-medium">{gpsDisplay}</span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-800/40 border border-slate-700/50 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
                <Camera size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-black text-slate-200 block">Webcam PC</span>
                <span className="text-[11px] text-slate-400 truncate block font-medium">
                  {cameraActive ? "Đang bật" : "Sẵn sàng chụp"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Cột 3: Thẻ Thông Tin */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <h4 className="font-black text-sm text-slate-200 border-b border-slate-800 pb-2">
              Thông Tin Tài Khoản
            </h4>
            
            <div className="flex items-center gap-3.5">
              <img
                src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
                alt="Avatar"
                className="w-14 h-14 rounded-2xl object-cover border-2 border-blue-500 shadow-sm"
              />
              <div>
                <h5 className="font-black text-base text-white">{currentUser?.ho_ten}</h5>
                <span className="text-xs text-slate-400 font-bold block">{currentUser?.chuc_danh}</span>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 text-xs font-mono font-black border border-blue-500/30">
                  Mã: {currentUser?.ma_nv}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-800/50 border border-slate-700/50 rounded-2xl space-y-2 text-center">
            <Smartphone size={28} className="mx-auto text-blue-400" />
            <p className="text-xs font-black text-white">
              Mở trên Zalo Mini App
            </p>
            <p className="text-[11px] text-slate-400 font-medium">
              Tìm kiếm <strong>"Sedinco HR"</strong> trên Zalo để điểm danh hàng ngày với đầy đủ xác thực GPS.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
