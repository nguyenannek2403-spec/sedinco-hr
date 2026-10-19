import React from "react";
import sedincoLogo from "../static/sedinco-logo.png";

/**
 * CompanyLogo - Logo chính thức của CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO
 * Hiển thị hình ảnh logo SEDINCO thực tế với khối 3D đỏ, chiếc lá xanh và móng đá xám
 */
export default function CompanyLogo({
  size = "large",
  theme = "dark",
  layout = "vertical",
  showSubtitle = true
}) {
  const isLarge = size === "large";
  const isSmall = size === "small";
  const isHorizontal = layout === "horizontal";

  return (
    <div
      className={`flex select-none ${
        isHorizontal
          ? "flex-row items-center gap-3 text-left"
          : `flex-col items-center justify-center text-center ${isLarge ? "gap-3" : "gap-2"}`
      }`}
    >
      {/* Khung Biểu tượng Logo SEDINCO chính thức */}
      <div
        className={`relative shrink-0 rounded-2xl bg-white flex items-center justify-center overflow-hidden transition-all duration-300 shadow-xl border border-white/20 ${
          isLarge
            ? "w-24 h-24 md:w-28 md:h-28 rounded-3xl p-2.5 shadow-2xl shadow-blue-500/25 ring-4 ring-white/10"
            : isSmall
            ? "w-10 h-10 rounded-xl p-1 shadow-md"
            : "w-16 h-16 rounded-2xl p-1.5 shadow-lg"
        }`}
      >
        <img
          src={sedincoLogo}
          alt="SEDINCO Logo"
          className="w-full h-full object-contain drop-shadow-sm select-none"
        />
      </div>

      {/* Tên thương hiệu SEDINCO HR */}
      <div className={isHorizontal ? "text-left" : "text-center"}>
        <h1
          className={`font-black tracking-tight uppercase leading-tight ${
            theme === "dark" ? "text-white" : "text-slate-900"
          } ${isLarge ? "text-2xl md:text-3xl tracking-wide mt-1" : isSmall ? "text-sm" : "text-base"}`}
        >
          SEDINCO <span className="text-red-500">HR</span>
        </h1>
        {showSubtitle && (
          <p
            className={`font-semibold tracking-wide ${
              theme === "dark" ? "text-slate-300" : "text-slate-500"
            } ${isLarge ? "text-xs md:text-sm mt-1" : "text-[10px] mt-0.5"}`}
          >
            HỆ THỐNG QUẢN TRỊ NHÂN SỰ & CHẤM CÔNG
          </p>
        )}
      </div>
    </div>
  );
}
