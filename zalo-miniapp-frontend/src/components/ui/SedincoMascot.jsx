import React, { useId } from "react";

const STATE_META = {
  sleeping: {
    stickerText: "Chào ngày mới! Chúc bạn ca làm việc hiệu quả! 👋",
    caption: "Zzz... chờ bạn vào ca",
    captionClass:
      "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200",
    stickerClass:
      "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#111C2D] dark:text-white shadow-md"
  },
  waving_hello: {
    stickerText: "Xin chào! Chúc bạn ca làm việc vui vẻ! 👋",
    caption: "Đang trong ca làm việc • Chúc bạn một ngày hiệu quả!",
    captionClass:
      "bg-emerald-50 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-700 text-[#16A34A] dark:text-emerald-200",
    stickerClass:
      "bg-white dark:bg-slate-800 border-2 border-[#16A34A] dark:border-emerald-400 text-[#111C2D] dark:text-white shadow-lg"
  },
  waving_goodbye: {
    stickerText: "Tạm biệt! Hẹn gặp lại nhé! 👋✨",
    caption: "Tạm biệt! Chúc bạn nghỉ ngơi vui vẻ bên gia đình 🎉",
    captionClass:
      "bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-700 text-[#E11D48] dark:text-rose-200",
    stickerClass:
      "bg-white dark:bg-slate-800 border-2 border-[#E11D48] dark:border-rose-400 text-[#111C2D] dark:text-white shadow-lg"
  },
  completed: {
    stickerText: "Tuyệt vời! Bạn đã hoàn thành công hôm nay! 🎉",
    caption: "Đã ghi nhận đủ công / nghỉ theo quy định ✨",
    captionClass:
      "bg-emerald-50 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-700 text-[#16A34A] dark:text-emerald-200",
    stickerClass:
      "bg-white dark:bg-slate-800 border-2 border-[#16A34A] dark:border-emerald-400 text-[#111C2D] dark:text-white shadow-lg"
  }
};

/**
 * Nhân vật Chibi SEDINCO mặc áo đồng phục Polo trắng chuẩn công ty:
 * - Khóa trạng thái thuần hiển thị theo DB chấm công ('sleeping' | 'waving_hello' | 'waving_goodbye' | 'completed')
 * - Không cho phép nhấn/chạm trực tiếp làm đổi trạng thái giả lập
 */
export default function SedincoMascot({
  state = "sleeping",
  className = ""
}) {
  const uid = useId().replace(/:/g, "");
  const activeState = STATE_META[state] ? state : "sleeping";
  const meta = STATE_META[activeState];
  const isSleeping = activeState === "sleeping";
  const isWaving = activeState === "waving_hello" || activeState === "waving_goodbye" || activeState === "completed";
  const clipId = `sedinco-polo-body-${uid}`;
  const shadowGradId = `sedinco-stage-glow-${uid}`;

  return (
    <div
      data-mascot-state={activeState}
      className={`w-full rounded-2xl bg-gradient-to-b from-[#F0F3FF]/80 via-white to-[#FFF1F2]/40 dark:from-slate-800/70 dark:via-slate-900 dark:to-slate-900 border border-slate-200/80 dark:border-slate-800 px-3 py-3.5 flex flex-col items-center justify-center text-center space-y-2.5 shadow-sm pointer-events-none select-none ${className}`}
    >
      {/* Sticker Lời Nói Nổi Bật (khi Đang trong ca hoặc Tan ca) */}
      {meta.stickerText && (
        <div
          className={`animate-bounce-gentle relative max-w-[95%] px-4 py-2 rounded-2xl text-xs sm:text-sm font-extrabold leading-snug ${meta.stickerClass}`}
        >
          <span>{meta.stickerText}</span>
          <span
            aria-hidden="true"
            className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 ${
              activeState === "waving_goodbye"
                ? "bg-rose-50 dark:bg-slate-800 border-r-2 border-b-2 border-[#E11D48] dark:border-rose-400"
                : "bg-emerald-50 dark:bg-slate-800 border-r-2 border-b-2 border-[#16A34A] dark:border-emerald-400"
            }`}
          />
        </div>
      )}

      {/* Sân Khấu SVG Nhân Vật Đồng Phục SEDINCO (chỉ đọc từ trạng thái chấm công) */}
      <div
        aria-hidden="true"
        className="relative select-none pointer-events-none rounded-2xl p-0"
      >
        <svg
          viewBox="0 0 220 220"
          className="w-44 h-44 sm:w-48 sm:h-48 mx-auto overflow-visible"
          role="img"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id={shadowGradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={activeState === "waving_hello" ? "#16A34A" : "#E11D48"} stopOpacity="0.14" />
              <stop offset="100%" stopColor={activeState === "waving_hello" ? "#16A34A" : "#E11D48"} stopOpacity="0" />
            </radialGradient>

            {/* Clip Path cho thân áo Polo để 3 dải sọc chéo khớp viền áo 100% */}
            <clipPath id={clipId}>
              <path d="M 75 106 L 145 106 L 148 168 Q 110 174 72 168 Z" />
            </clipPath>
          </defs>

          {/* Hào quang nền dịu dưới chân nhân vật */}
          <ellipse cx="110" cy="130" rx="84" ry="74" fill={`url(#${shadowGradId})`} />
          <ellipse cx="110" cy="202" rx="46" ry="8" fill="#0F172A" fillOpacity="0.14" />

          {/* Chữ Zzz bay lên khi ở trạng thái sleeping */}
          {isSleeping && (
            <g className="pointer-events-none">
              <text
                x="148"
                y="56"
                fill="#E11D48"
                fontSize="16"
                fontWeight="900"
                fontFamily="system-ui, sans-serif"
                className="animate-float-zzz-1"
              >
                z
              </text>
              <text
                x="160"
                y="45"
                fill="#BE123C"
                fontSize="21"
                fontWeight="900"
                fontFamily="system-ui, sans-serif"
                className="animate-float-zzz-2"
              >
                Z
              </text>
              <text
                x="173"
                y="34"
                fill="#FB7185"
                fontSize="15"
                fontWeight="900"
                fontFamily="system-ui, sans-serif"
                className="animate-float-zzz-3"
              >
                z
              </text>
            </g>
          )}

          {/* Ngôi sao lấp lánh khi vẫy tay chào / tạm biệt */}
          {isWaving && (
            <g className="pointer-events-none">
              <path
                d="M 166 56 L 169 63 L 176 66 L 169 69 L 166 76 L 163 69 L 156 66 L 163 63 Z"
                fill={activeState === "waving_goodbye" ? "#10B981" : "#F59E0B"}
              />
              <circle
                cx="42"
                cy="48"
                r="4"
                fill={activeState === "waving_goodbye" ? "#34D399" : "#38BDF8"}
              />
            </g>
          )}

          {/* Toàn bộ cơ thể nhân vật (nhịp thở nhẹ khi sleeping) */}
          <g className={isSleeping ? "animate-mascot-breathe" : ""}>
            {/* Chân & Giày Thể Thao */}
            <g>
              {/* Quần dài xám than */}
              <rect x="85" y="164" width="19" height="28" rx="6" fill="#1E293B" />
              <rect x="116" y="164" width="19" height="28" rx="6" fill="#1E293B" />
              {/* Giày Chibi */}
              <path d="M 81 190 Q 81 183 94 183 Q 106 183 106 194 L 82 194 Z" fill="#FFFFFF" stroke="#334155" strokeWidth="1.5" />
              <path d="M 114 194 Q 114 183 126 183 Q 139 183 139 190 L 138 194 Z" fill="#FFFFFF" stroke="#334155" strokeWidth="1.5" />
              <rect x="81" y="193" width="26" height="5" rx="2.5" fill="#E11D48" />
              <rect x="113" y="193" width="26" height="5" rx="2.5" fill="#E11D48" />
            </g>

            {/* Cánh tay trái (bên phải hình — vẫy nhẹ hoặc đặt gọn bên hông) */}
            <g>
              {/* Tay áo ngắn trắng + viền bo Đỏ & Xám than */}
              <path d="M 142 108 L 164 123 L 154 137 L 138 124 Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.4" />
              <path d="M 161 121 L 152 135" stroke="#E11D48" strokeWidth="3.2" strokeLinecap="round" />
              <path d="M 164 123 L 154 137" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
              {/* Cánh tay & Bàn tay */}
              <path
                d="M 156 133 Q 165 147 160 156"
                fill="none"
                stroke="#FDE2C8"
                strokeWidth="11"
                strokeLinecap="round"
              />
              <circle cx="159" cy="157" r="7.5" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1.2" />
            </g>

            {/* Cánh tay phải (bên trái hình — rũ nghỉ khi sleeping, giơ vẫy khi waving) */}
            {isWaving ? (
              <g className="animate-mascot-wave">
                {/* Cánh tay giơ lên vẫy */}
                <path
                  d="M 73 118 Q 52 104 45 78"
                  fill="none"
                  stroke="#FDE2C8"
                  strokeWidth="11"
                  strokeLinecap="round"
                />
                {/* Tay áo ngắn hướng lên + viền sọc Đỏ & Xám than */}
                <path d="M 78 108 L 56 105 L 55 123 L 77 125 Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.4" />
                <path d="M 59 105 L 58 123" stroke="#E11D48" strokeWidth="3.2" strokeLinecap="round" />
                <path d="M 56 105 L 55 123" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
                {/* Bàn tay vẫy xòe thân thiện */}
                <g transform="translate(43, 73)">
                  <circle cx="0" cy="0" r="8" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1.2" />
                  <ellipse cx="-6" cy="-5" rx="2.5" ry="5" transform="rotate(-24 -6 -5)" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1" />
                  <ellipse cx="-1" cy="-7" rx="2.3" ry="5.2" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1" />
                  <ellipse cx="4.5" cy="-6" rx="2.3" ry="4.8" transform="rotate(18 4.5 -6)" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1" />
                  <ellipse cx="7.5" cy="1" rx="2.2" ry="4.2" transform="rotate(42 7.5 1)" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1" />
                </g>
              </g>
            ) : (
              <g>
                {/* Cánh tay rũ êm khi đang ngủ */}
                <path d="M 78 108 L 56 123 L 66 137 L 82 124 Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.4" />
                <path d="M 59 121 L 68 135" stroke="#E11D48" strokeWidth="3.2" strokeLinecap="round" />
                <path d="M 56 123 L 66 137" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
                <path
                  d="M 64 133 Q 56 147 61 156"
                  fill="none"
                  stroke="#FDE2C8"
                  strokeWidth="11"
                  strokeLinecap="round"
                />
                <circle cx="62" cy="157" r="7.5" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1.2" />
              </g>
            )}

            {/* THÂN ÁO POLO ĐỒNG PHỤC SEDINCO CHUẨN 100% */}
            <g>
              {/* Nền thân áo trắng */}
              <path
                d="M 75 106 L 145 106 L 148 168 Q 110 174 72 168 Z"
                fill="#FFFFFF"
                stroke="#CBD5E1"
                strokeWidth="1.5"
              />

              {/* 3 dải sọc chéo chạy từ hông phải xuống vạt áo dưới */}
              <g clipPath={`url(#${clipId})`}>
                {/* Dải 1: Xám than đậm góc dưới */}
                <polygon points="72,140 120,174 72,174" fill="#334155" />
                {/* Khe trắng nhỏ */}
                <polygon points="72,135 127,174 121,174 72,140" fill="#FFFFFF" />
                {/* Dải 2: Đỏ tươi nổi bật */}
                <polygon points="72,118 139,174 126,174 72,135" fill="#E11D48" />
                {/* Khe trắng mảnh */}
                <polygon points="72,114 143,174 139,174 72,118" fill="#FFFFFF" />
                {/* Dải 3: Xám bạc thanh lịch */}
                <polygon points="86,118 153,174 142,174 86,125" fill="#CBD5E1" />
              </g>

              {/* Viền lại thân áo cho sắc nét */}
              <path
                d="M 75 106 L 145 106 L 148 168 Q 110 174 72 168 Z"
                fill="none"
                stroke="#CBD5E1"
                strokeWidth="1.5"
              />

              {/* Cổ áo Polo lót Đỏ + Trụ 3 nút */}
              {/* Lớp lót cổ trong màu Đỏ */}
              <path d="M 96 101 Q 110 112 124 101 L 122 110 Q 110 117 98 110 Z" fill="#DC2626" />
              {/* Nẹp trụ nút giữa + viền đỏ lót trong */}
              <rect x="106" y="109" width="2.5" height="23" fill="#DC2626" />
              <rect x="108" y="109" width="7" height="23" rx="2" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1" />
              <circle cx="111.5" cy="114" r="1.7" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="0.9" />
              <circle cx="111.5" cy="121" r="1.7" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="0.9" />
              <circle cx="111.5" cy="128" r="1.7" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="0.9" />

              {/* Hai lá cổ bẻ trắng viền sọc đôi Xám than & Đỏ */}
              <path d="M 95 101 L 87 115 L 106 112 Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1" />
              <path d="M 95 101 L 87 115 L 106 112" fill="none" stroke="#E11D48" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M 96 103 L 90 113 L 104 111" fill="none" stroke="#1E293B" strokeWidth="1" strokeLinejoin="round" />

              <path d="M 125 101 L 133 115 L 114 112 Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1" />
              <path d="M 125 101 L 133 115 L 114 112" fill="none" stroke="#E11D48" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M 124 103 L 130 113 L 116 111" fill="none" stroke="#1E293B" strokeWidth="1" strokeLinejoin="round" />

              {/* LOGO SEDINCO TRÊN NGỰC TRÁI (Khối S đỏ + Lá xanh + Đế gạch xám + chữ SEDINCO) */}
              <g transform="translate(119, 118)">
                {/* Khối chữ S đỏ */}
                <path d="M 8 2 L 15 5.5 L 11 7.8 L 8 6.2 L 5 7.8 L 9 10 L 6 11.8 L 1.5 9.2 L 1.5 5.5 Z" fill="#E11D48" />
                {/* Chiếc lá xanh */}
                <path d="M 10.5 11.5 Q 16.5 6 17.5 12.5 Q 13.5 15 10.5 11.5 Z" fill="#16A34A" />
                {/* Đế gạch xám */}
                <polygon points="3,11 9,14.5 15,11 15,15.5 9,18.5 3,15.5" fill="#94A3B8" stroke="#64748B" strokeWidth="0.6" />
                {/* Chữ SEDINCO */}
                <text
                  x="9"
                  y="24"
                  textAnchor="middle"
                  fontSize="5.8"
                  fontWeight="900"
                  fontFamily="system-ui, sans-serif"
                  letterSpacing="0.2"
                >
                  <tspan fill="#E11D48">SE</tspan>
                  <tspan fill="#1E293B">DINCO</tspan>
                </text>
              </g>
            </g>

            {/* CỔ & ĐẦU CHIBI THÂN THIỆN */}
            <g transform={isSleeping ? "rotate(-4 110 85)" : undefined}>
              {/* Cổ */}
              <rect x="103" y="96" width="14" height="10" rx="5" fill="#FAD2B4" />

              {/* Tai */}
              <circle cx="71" cy="69" r="7.5" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1.2" />
              <circle cx="149" cy="69" r="7.5" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1.2" />

              {/* Khuôn mặt tròn bầu bĩnh */}
              <ellipse cx="110" cy="67" rx="39" ry="35" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1.5" />

              {/* Tóc Chibi năng động */}
              <path
                d="M 70 62 C 69 34 89 24 111 24 C 134 24 152 36 150 62 C 145 48 136 44 125 46 C 117 47 111 39 102 45 C 93 50 81 44 70 62 Z"
                fill="#1E293B"
              />
              {/* Ánh bóng tóc */}
              <path
                d="M 88 33 Q 108 26 127 33"
                fill="none"
                stroke="#475569"
                strokeWidth="3"
                strokeLinecap="round"
              />

              {/* Má hồng cute */}
              <ellipse cx="86" cy="76" rx="6" ry="3.5" fill="#FCA5A5" fillOpacity="0.6" />
              <ellipse cx="134" cy="76" rx="6" ry="3.5" fill="#FCA5A5" fillOpacity="0.6" />

              {/* Biểu cảm Mắt & Miệng */}
              {isSleeping ? (
                <g>
                  {/* Đôi mắt nhắm cong ngủ ngon */}
                  <path d="M 88 67 Q 94 73 100 67" fill="none" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" />
                  <path d="M 120 67 Q 126 73 132 67" fill="none" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" />
                  {/* Miệng tròn nhỏ đang thở */}
                  <ellipse cx="110" cy="82" rx="3.2" ry="3.8" fill="#E11D48" fillOpacity="0.75" />
                </g>
              ) : (
                <g>
                  {/* Lông mày thân thiện */}
                  <path d="M 87 57 Q 94 54 100 57" fill="none" stroke="#1E293B" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M 120 57 Q 126 54 133 57" fill="none" stroke="#1E293B" strokeWidth="2.2" strokeLinecap="round" />
                  {/* Đôi mắt sáng long lanh */}
                  <circle cx="94" cy="67" r="5.8" fill="#0F172A" />
                  <circle cx="126" cy="67" r="5.8" fill="#0F172A" />
                  <circle cx="96" cy="64.8" r="2.1" fill="#FFFFFF" />
                  <circle cx="128" cy="64.8" r="2.1" fill="#FFFFFF" />
                  <circle cx="92.5" cy="68.5" r="1" fill="#FFFFFF" fillOpacity="0.8" />
                  <circle cx="124.5" cy="68.5" r="1" fill="#FFFFFF" fillOpacity="0.8" />
                  {/* Miệng cười rạng rỡ */}
                  <path d="M 101 80 Q 110 90 119 80 Z" fill="#E11D48" stroke="#9F1239" strokeWidth="1.2" strokeLinejoin="round" />
                  <path d="M 104 80 L 116 80" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
                </g>
              )}
            </g>
          </g>
        </svg>
      </div>

      {/* Dòng trạng thái trực quan bên dưới nhân vật */}
      <div
        className={`inline-flex items-center justify-center px-3.5 py-1.5 rounded-full border text-xs font-bold leading-snug ${meta.captionClass}`}
      >
        <span>{meta.caption}</span>
      </div>
    </div>
  );
}
