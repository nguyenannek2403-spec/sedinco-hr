import React from "react";
const sedincoLogo = "/sedinco-logo.png";

/**
 * CompanyLogo - Logo chính thức của CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO
 * Hiển thị hình ảnh logo SEDINCO thực tế với khối 3D đỏ, chiếc lá xanh và móng đá xám
 */
export default function CompanyLogo({
  size = "large",
  theme = "dark",
  layout = "vertical",
  showSubtitle = true,
  iconOnly = false
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
        className={`relative shrink-0 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden transition-all duration-300 shadow-xl border border-slate-200/80 dark:border-slate-700 ${
          isLarge
            ? "w-24 h-24 md:w-28 md:h-28 rounded-3xl p-2.5 shadow-2xl shadow-rose-500/20 ring-4 ring-rose-100/70 dark:ring-slate-700/40"
            : isSmall
            ? "w-10 h-10 rounded-xl p-1 shadow-md"
            : "w-16 h-16 rounded-2xl p-1.5 shadow-lg shadow-rose-500/15"
        }`}
      >
        <img
          src={sedincoLogo}
          alt="SEDINCO Logo"
          className="w-full h-full object-contain drop-shadow-sm select-none"
        />
      </div>

      {!iconOnly && (
        <div className={isHorizontal ? "text-left" : "text-center"}>
          <h1
            className={`font-extrabold tracking-tight uppercase leading-tight ${
              theme === "dark" ? "text-white" : "text-[#111C2D] dark:text-white"
            } ${isLarge ? "text-2xl md:text-3xl tracking-wide mt-1" : isSmall ? "text-sm" : "text-base"}`}
          >
            SEDINCO <span className="text-[#E11D48] dark:text-rose-400">HR</span>
          </h1>
          {showSubtitle && (
            <p
              className={`font-semibold tracking-wide ${
                theme === "dark" ? "text-slate-300" : "text-slate-500 dark:text-slate-300"
              } ${isLarge ? "text-xs md:text-sm mt-1" : "text-xs mt-0.5"}`}
            >
              HỆ THỐNG QUẢN TRỊ NHÂN SỰ &amp; CHẤM CÔNG
            </p>
          )}
        </div>
      )}
    </div>
  );
}
