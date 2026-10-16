import React from "react";
import {
  Smartphone,
  MapPin,
  Camera,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  QrCode,
  CheckCircle2,
  Calendar,
  ExternalLink
} from "lucide-react";

export default function EmployeeCheckinPC({
  currentUser,
  currentTime,
  checkInStatus,
  checkInTime,
  checkOutTime,
  lateNotice,
  isViolation,
  isCheckInLoading,
  onSmartCheckInOut,
  gpsStatus,
  selfiePhoto,
  onGetGps,
  onCapturePhoto,
  onSwitchToMobileSimulator
}) {
  return (
    <div className="space-y-6">
      
      {/* 1. HERO BANNER: THÔNG BÁO QUY ĐỊNH CHẤM CÔNG DI ĐỘNG CHÍNH THỨC */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-white/5 skew-x-12 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold backdrop-blur-md">
              <Smartphone size={14} className="text-blue-200" />
              <span>QUY CHUẨN ĐIỂM DANH DOANH NGHIỆP</span>
            </div>
            
            <h2 className="text-xl md:text-2xl font-black tracking-tight leading-snug">
              Chấm Công Định Vị GPS & Quét Khuôn Mặt Bằng Điện Thoại
            </h2>
            
            <p className="text-xs md:text-sm text-blue-100 leading-relaxed font-normal">
              Theo quy định an ninh Sedinco HR, việc ghi nhận ngày công hợp lệ bắt buộc thực hiện trên 
              <strong className="text-white font-bold"> Điện thoại di động qua Zalo Mini App</strong> nhằm xác thực tọa độ GPS công trường (bán kính 50m) và chụp ảnh selfie xác thực danh tính.
            </p>
          </div>

          {/* Nút Chuyển nhanh sang Chế độ Giả lập Điện thoại */}
          <div className="shrink-0 space-y-2 text-center">
            <button
              type="button"
              onClick={onSwitchToMobileSimulator}
              className="inline-flex items-center gap-2 bg-white text-blue-900 hover:bg-blue-50 active:scale-95 px-5 py-3 rounded-2xl font-black text-xs transition-all shadow-lg shadow-black/10 cursor-pointer"
            >
              <Smartphone size={16} className="text-blue-600" />
              <span>Mở Giao Diện Điện Thoại</span>
            </button>
            <span className="block text-[10px] text-blue-200">
              Kiểm thử chấm công GPS + Camera
            </span>
          </div>
        </div>
      </div>

      {/* 2. KHU VỰC CHẤM CÔNG THỬ NGHIỆM TRÊN PC + THỐNG KÊ NHÂN SỰ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Cột 1 & 2: Bảng Điều Khiển Chấm Công PC */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 tracking-tight">
                Chấm Công Trực Tiếp (Kiểm Thử Trình Duyệt PC)
              </h3>
              <p className="text-xs text-slate-400">
                Ghi nhận công trực tuyến qua kết nối mạng nội bộ • Khung giờ ca: 08:00 - 17:00
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 font-mono">
              {currentTime.toLocaleTimeString("vi-VN")}
            </span>
          </div>

          {/* Trạng thái giờ vào / ra & Thông báo */}
          {lateNotice && (
            <div
              className={`p-3.5 rounded-2xl text-xs flex items-center gap-2.5 font-medium ${
                isViolation
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : "bg-emerald-50 text-emerald-800 border border-emerald-200"
              }`}
            >
              {isViolation ? (
                <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              ) : (
                <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
              )}
              <span>{lateNotice}</span>
            </div>
          )}

          {/* Nút bấm chấm công lớn */}
          <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center sm:text-left">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block">
                Trạng thái hiện tại
              </span>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-lg font-black text-slate-900">
                  {checkInStatus === "not_checked_in" && "Chưa Chấm Công Hôm Nay"}
                  {checkInStatus === "checked_in" && "Đang Làm Việc (Đã Check-in)"}
                  {checkInStatus === "completed" && "Đã Hoàn Tất Ca Làm Việc"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {checkInTime ? `Giờ vào: ${checkInTime}` : "Giờ vào: --:--:--"} • {checkOutTime ? `Giờ ra: ${checkOutTime}` : "Giờ ra: --:--:--"}
              </p>
            </div>

            <button
              type="button"
              disabled={isCheckInLoading || checkInStatus === "completed"}
              onClick={onSmartCheckInOut}
              className={`px-8 py-4 rounded-2xl text-white font-black text-sm transition-all shadow-xl active:scale-95 flex items-center gap-3 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                checkInStatus === "not_checked_in"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/30"
                  : checkInStatus === "checked_in"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/30"
                  : "bg-slate-700 text-slate-300"
              }`}
            >
              {isCheckInLoading ? (
                <RefreshCw size={20} className="animate-spin" />
              ) : (
                <Clock size={20} />
              )}
              <span>
                {checkInStatus === "not_checked_in" && "CHẤM CÔNG VÀO (CHECK-IN)"}
                {checkInStatus === "checked_in" && "CHẤM CÔNG RA (CHECK-OUT)"}
                {checkInStatus === "completed" && "ĐÃ XONG 2 CA HÔM NAY"}
              </span>
            </button>
          </div>

          {/* 2 Nút Xác Thực Phụ: Tọa độ & Ảnh */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
                <MapPin size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-bold text-slate-700 block">Định vị GPS</span>
                <span className="text-[10px] text-slate-500 truncate block">{gpsStatus}</span>
              </div>
              <button
                type="button"
                onClick={onGetGps}
                className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
              >
                Cập nhật
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 bg-purple-100 text-purple-700 rounded-xl">
                <Camera size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-bold text-slate-700 block">Xác thực khuôn mặt</span>
                <span className="text-[10px] text-slate-500 truncate block">
                  {selfiePhoto ? "✓ Đã nhận diện khuôn mặt" : "Chưa chụp ảnh"}
                </span>
              </div>
              <button
                type="button"
                onClick={onCapturePhoto}
                className="text-xs text-purple-600 font-bold hover:underline cursor-pointer"
              >
                Chụp ảnh
              </button>
            </div>
          </div>
        </div>

        {/* Cột 3: Thẻ Thông Tin & Hướng Dẫn Di Động */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <h4 className="font-extrabold text-sm text-slate-900 border-b border-slate-100 pb-2">
              Thông Tin Nhân Viên
            </h4>
            
            <div className="flex items-center gap-3">
              <img
                src={currentUser?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
                alt="Avatar"
                className="w-14 h-14 rounded-2xl object-cover border-2 border-blue-500 shadow-sm"
              />
              <div>
                <h5 className="font-black text-sm text-slate-900">{currentUser?.ho_ten}</h5>
                <span className="text-xs text-slate-500 font-medium block">{currentUser?.chuc_danh}</span>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-mono font-bold">
                  Mã: {currentUser?.ma_nv}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs pt-2">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Công tháng này:</span>
                <span className="font-black text-blue-600">21.5 / 22 ngày</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Phép năm còn lại:</span>
                <span className="font-black text-amber-600">11.0 ngày</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Đơn đã gửi tháng này:</span>
                <span className="font-black text-emerald-600">2 đơn (Đã duyệt)</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-center">
            <Smartphone size={24} className="mx-auto text-blue-600" />
            <p className="text-[11px] font-bold text-slate-800">
              Mở trên Zalo Mini App
            </p>
            <p className="text-[10px] text-slate-400">
              Quét mã QR hoặc tìm kiếm <strong>"Sedinco HR"</strong> trên Zalo để điểm danh hàng ngày.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
