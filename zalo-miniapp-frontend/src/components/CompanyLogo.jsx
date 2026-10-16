import React from "react";

/**
 * CompanyLogo - Logo chính thức của CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO
 * Biểu tượng hình khiên đa giác / khối kết cấu vững chắc với chữ "S" cách điệu
 */
export default function CompanyLogo({
  size = "large",
  theme = "dark",
  layout = "vertical",
  showSubtitle = true
}) {
  const isLarge = size === "large";
  const isSmall = size === "small";

  const iconDimensions = isLarge ? { w: 68, h: 68 } : isSmall ? { w: 36, h: 36 } : { w: 48, h: 48 };

  const isHorizontal = layout === "horizontal";

  return (
    <div
      className={`flex select-none ${
        isHorizontal
          ? "flex-row items-center gap-3 text-left"
          : `flex-col items-center justify-center text-center ${isLarge ? "gap-3" : "gap-2"}`
      }`}
    >
      {/* Biểu tượng Logo SVG Vector */}
      <div className="relative group shrink-0">
        <svg
          width={iconDimensions.w}
          height={iconDimensions.h}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-xl"
        >
          <defs>
            {/* Gradient chính: Xanh Hoàng Gia sang Xanh Biển Đậm */}
            <linearGradient id="sedincoBlue" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>

            {/* Gradient Vàng Kim điểm xuyết */}
            <linearGradient id="sedincoGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>

            {/* Gradient bóng đổ nội khối */}
            <linearGradient id="sedincoDark" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e3a8a" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>

          {/* Khối nền hình lục giác bo tròn (Biểu tượng kết cấu xây dựng vững bền) */}
          <rect
            x="6"
            y="6"
            width="88"
            height="88"
            rx="22"
            fill="url(#sedincoBlue)"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="2.5"
          />

          {/* Vát ánh kim trang trí góc trên */}
          <path
            d="M20 16 L80 16 C84 16 86 18 86 22 L86 28 L14 28 L14 22 C14 18 16 16 20 16 Z"
            fill="url(#sedincoGold)"
            opacity="0.9"
          />

          {/* Chữ S cách điệu cấu trúc hiện đại */}
          <path
            d="M66 38 C66 34 62 31 52 31 C38 31 34 37 34 43 C34 54 66 51 66 63 C66 71 58 75 48 75 C36 75 30 70 30 63"
            stroke="#ffffff"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* Điểm nhấn viên ngọc vàng kết thúc nét */}
          <circle cx="66" cy="38" r="4.5" fill="#fef08a" />
          <circle cx="30" cy="63" r="4.5" fill="#fef08a" />

          {/* Vạch ngang cân bằng nội lực */}
          <line
            x1="38"
            y1="53"
            x2="62"
            y2="53"
            stroke="#ffffff"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.8"
          />
        </svg>
      </div>

      {/* Tên thương hiệu SEDINCO HR */}
      <div className={isHorizontal ? "text-left" : "text-center"}>
        <h1
          className={`font-black tracking-tight uppercase leading-none ${
            theme === "dark" ? "text-white" : "text-slate-900"
          } ${isLarge ? "text-2xl md:text-3xl tracking-wider" : isSmall ? "text-sm" : "text-base"}`}
        >
          SEDINCO <span className="text-blue-400">HR</span>
        </h1>
        {showSubtitle && (
          <p
            className={`font-medium leading-tight ${
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
