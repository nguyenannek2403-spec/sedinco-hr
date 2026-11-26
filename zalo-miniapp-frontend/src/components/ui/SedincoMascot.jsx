import React, { useId } from "react";

/**
 * Pure State Derivation Function (V64 — 3-State Attendance Character Sync):
 * Ánh xạ 1-1 từ dữ liệu chấm công hôm nay sang đúng 3 trạng thái hoạt cảnh:
 * 1. "ready"     (NOT_CHECKED_IN: !check_in_time) -> Chào ngày mới tươi tỉnh, vẫy tay chào, sẵn sàng bấm Chấm công Vào.
 * 2. "working"   (CHECKED_IN: check_in_time && !check_out_time) -> Đang làm việc tập trung năng suất trong ca, sẵn sàng bấm Chấm công Ra.
 * 3. "completed" (CHECKED_OUT: check_in_time && check_out_time, hoặc ngày đã hoàn tất công/lễ/phép) -> Hoàn thành ca làm việc / thư giãn sau giờ làm.
 */
export function getAttendanceAnimationState({
  todayRecord = null,
  todayEffective = null,
  lastCheckAction = null
} = {}) {
  const effectiveCode = String(todayEffective?.effective_code || "").toUpperCase();
  const isAdminAdjusted = Boolean(todayEffective?.is_admin_adjusted);

  if (effectiveCode === "NONE" || effectiveCode === "KL") {
    return "ready";
  }

  if (
    (effectiveCode === "1" && isAdminAdjusted) ||
    effectiveCode === "P" ||
    effectiveCode === "L" ||
    effectiveCode === "OT" ||
    effectiveCode === "1+OT"
  ) {
    return "completed";
  }

  const hasCheckedIn = Boolean(todayRecord && todayRecord.check_in_time);
  const hasCheckedOut = Boolean(todayRecord && todayRecord.check_out_time);

  if (hasCheckedOut || lastCheckAction === "out") {
    return "completed";
  }

  if (hasCheckedIn || lastCheckAction === "in") {
    return "working";
  }

  return "ready";
}

const STATE_ALIASES = {
  ready: "ready",
  not_checked_in: "ready",
  NOT_CHECKED_IN: "ready",
  sleeping: "ready",
  working: "working",
  checked_in: "working",
  CHECKED_IN: "working",
  waving_hello: "working",
  completed: "completed",
  checked_out: "completed",
  CHECKED_OUT: "completed",
  waving_goodbye: "completed"
};

const STATE_META = {
  ready: {
    attendanceState: "NOT_CHECKED_IN",
    stickerText: "Chào ngày mới! Sẵn sàng chấm công vào ca nhé! 👋☀️",
    caption: "Sẵn sàng vào ca • Bấm Chấm công Vào để bắt đầu",
    glowColor: "#F59E0B",
    arrowClass:
      "bg-amber-50 dark:bg-slate-800 border-r-2 border-b-2 border-amber-500 dark:border-amber-400",
    captionClass:
      "bg-amber-50 dark:bg-amber-950/70 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200",
    stickerClass:
      "bg-white dark:bg-slate-800 border-2 border-amber-500 dark:border-amber-400 text-[#111C2D] dark:text-white shadow-md"
  },
  working: {
    attendanceState: "CHECKED_IN",
    stickerText: "Đang trong ca làm việc! Chúc bạn ngày làm việc năng suất! ⚡📋",
    caption: "Đang làm việc • Sẵn sàng bấm Chấm công Ra khi tan ca",
    glowColor: "#0051CA",
    arrowClass:
      "bg-sky-50 dark:bg-slate-800 border-r-2 border-b-2 border-[#0051CA] dark:border-sky-400",
    captionClass:
      "bg-sky-50 dark:bg-sky-950/70 border-sky-300 dark:border-sky-700 text-[#0051CA] dark:text-sky-200",
    stickerClass:
      "bg-white dark:bg-slate-800 border-2 border-[#0051CA] dark:border-sky-400 text-[#111C2D] dark:text-white shadow-lg"
  },
  completed: {
    attendanceState: "CHECKED_OUT",
    stickerText: "Tuyệt vời! Bạn đã hoàn thành ca làm việc hôm nay! 🎉✨",
    caption: "Đã hoàn tất chấm công hôm nay • Chúc bạn buổi tối vui vẻ!",
    glowColor: "#16A34A",
    arrowClass:
      "bg-emerald-50 dark:bg-slate-800 border-r-2 border-b-2 border-[#16A34A] dark:border-emerald-400",
    captionClass:
      "bg-emerald-50 dark:bg-emerald-950/70 border-emerald-300 dark:border-emerald-700 text-[#16A34A] dark:text-emerald-200",
    stickerClass:
      "bg-white dark:bg-slate-800 border-2 border-[#16A34A] dark:border-emerald-400 text-[#111C2D] dark:text-white shadow-lg"
  }
};

/**
 * Nhân vật Chibi SEDINCO mặc áo đồng phục Polo trắng chuẩn công ty:
 * - Đồng bộ 1-1 với 3 trạng thái chấm công thực tế ('ready' | 'working' | 'completed')
 * - 60fps GPU-accelerated SVG animations, không giật khung (Zero Layout Shift)
 */
export default function SedincoMascot({
  state = "ready",
  className = ""
}) {
  const uid = useId().replace(/:/g, "");
  const activeState = STATE_ALIASES[state] || "ready";
  const meta = STATE_META[activeState];
  const isReady = activeState === "ready";
  const isWorking = activeState === "working";
  const isCompleted = activeState === "completed";
  const clipId = `sedinco-polo-body-${uid}`;
  const shadowGradId = `sedinco-stage-glow-${uid}`;

  return (
    <div
      data-mascot-state={activeState}
      data-attendance-animation-state={meta.attendanceState}
      className={`w-full rounded-2xl bg-gradient-to-b from-[#F0F3FF]/80 via-white to-[#FFF1F2]/40 dark:from-slate-800/70 dark:via-slate-900 dark:to-slate-900 border border-slate-200/80 dark:border-slate-800 px-3 py-3.5 flex flex-col items-center justify-center text-center space-y-2.5 shadow-sm pointer-events-none select-none ${className}`}
    >
      {/* Sticker Lời Nói Theo Đúng Trạng Thái Chấm Công */}
      {meta.stickerText && (
        <div
          className={`animate-bounce-gentle relative max-w-[95%] px-4 py-2 rounded-2xl text-xs sm:text-sm font-extrabold leading-snug ${meta.stickerClass}`}
        >
          <span>{meta.stickerText}</span>
          <span
            aria-hidden="true"
            className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 ${meta.arrowClass}`}
          />
        </div>
      )}

      {/* Sân Khấu SVG Nhân Vật Đồng Phục SEDINCO */}
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
              <stop offset="0%" stopColor={meta.glowColor} stopOpacity="0.18" />
              <stop offset="100%" stopColor={meta.glowColor} stopOpacity="0" />
            </radialGradient>

            {/* Clip Path cho thân áo Polo để 3 dải sọc chéo khớp viền áo 100% */}
            <clipPath id={clipId}>
              <path d="M 75 106 L 145 106 L 148 168 Q 110 174 72 168 Z" />
            </clipPath>
          </defs>

          {/* Hào quang nền dưới chân nhân vật */}
          <ellipse cx="110" cy="130" rx="84" ry="74" fill={`url(#${shadowGradId})`} />
          <ellipse cx="110" cy="202" rx="46" ry="8" fill="#0F172A" fillOpacity="0.14" />

          {/* Hiệu ứng nền theo từng trạng thái */}
          {isReady && (
            <g className="pointer-events-none">
              {/* Tia nắng bình minh chào ngày mới */}
              <circle cx="170" cy="48" r="10" fill="#F59E0B" fillOpacity="0.22" />
              <circle cx="170" cy="48" r="5.5" fill="#F59E0B" />
              <circle cx="44" cy="54" r="3.5" fill="#38BDF8" />
            </g>
          )}

          {isWorking && (
            <g className="pointer-events-none">
              {/* Huy hiệu tia chớp năng suất khi đang trong ca */}
              <path
                d="M 168 38 L 159 53 L 167 53 L 163 66 L 176 49 L 168 49 Z"
                fill="#0284C7"
              />
              <circle cx="45" cy="50" r="4" fill="#38BDF8" />
              <circle cx="177" cy="72" r="3" fill="#0EA5E9" />
            </g>
          )}

          {isCompleted && (
            <g className="pointer-events-none">
              {/* Ngôi sao & huy hiệu hoàn thành ca làm việc */}
              <path
                d="M 168 44 L 171 51 L 178 54 L 171 57 L 168 64 L 165 57 L 158 54 L 165 51 Z"
                fill="#10B981"
              />
              <path
                d="M 46 42 L 48.5 47.5 L 54 50 L 48.5 52.5 L 46 58 L 43.5 52.5 L 38 50 L 43.5 47.5 Z"
                fill="#F59E0B"
              />
              <circle cx="176" cy="74" r="3.5" fill="#34D399" />
              <circle cx="38" cy="72" r="3" fill="#38BDF8" />
            </g>
          )}

          {/* Toàn bộ cơ thể nhân vật */}
          <g
            className={
              isWorking
                ? "animate-mascot-work"
                : isCompleted
                ? "animate-mascot-celebrate"
                : "animate-mascot-breathe"
            }
          >
            {/* Chân & Giày Thể Thao */}
            <g>
              <rect x="85" y="164" width="19" height="28" rx="6" fill="#1E293B" />
              <rect x="116" y="164" width="19" height="28" rx="6" fill="#1E293B" />
              <path d="M 81 190 Q 81 183 94 183 Q 106 183 106 194 L 82 194 Z" fill="#FFFFFF" stroke="#334155" strokeWidth="1.5" />
              <path d="M 114 194 Q 114 183 126 183 Q 139 183 139 190 L 138 194 Z" fill="#FFFFFF" stroke="#334155" strokeWidth="1.5" />
              <rect x="81" y="193" width="26" height="5" rx="2.5" fill="#E11D48" />
              <rect x="113" y="193" width="26" height="5" rx="2.5" fill="#E11D48" />
            </g>

            {/* Cánh tay trái (bên phải hình):
                - ready: đặt gọn năng động bên hông
                - working: cầm bảng kế hoạch / clipboard công việc SEDINCO
                - completed: giơ cao ăn mừng hoàn thành ca */}
            {isWorking ? (
              <g>
                <path d="M 142 108 L 164 121 L 155 135 L 138 124 Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.4" />
                <path d="M 161 119 L 153 133" stroke="#E11D48" strokeWidth="3.2" strokeLinecap="round" />
                <path d="M 164 121 L 155 135" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
                <path
                  d="M 155 131 Q 163 142 150 148"
                  fill="none"
                  stroke="#FDE2C8"
                  strokeWidth="10.5"
                  strokeLinecap="round"
                />
                {/* Bảng Clipboard / Máy tính bảng công việc SEDINCO */}
                <g transform="translate(134, 126)">
                  <rect x="0" y="0" width="28" height="36" rx="4" fill="#1E293B" stroke="#0284C7" strokeWidth="1.8" />
                  <rect x="3" y="4" width="22" height="28" rx="2" fill="#F8FAFC" />
                  <rect x="9" y="-2" width="10" height="4" rx="1.5" fill="#E11D48" />
                  <line x1="6" y1="11" x2="21" y2="11" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" />
                  <line x1="6" y1="17" x2="19" y2="17" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="6" y1="23" x2="16" y2="23" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" />
                </g>
                <circle cx="138" cy="147" r="6.5" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1.2" />
              </g>
            ) : (
              <g>
                <path d="M 142 108 L 164 123 L 154 137 L 138 124 Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.4" />
                <path d="M 161 121 L 152 135" stroke="#E11D48" strokeWidth="3.2" strokeLinecap="round" />
                <path d="M 164 123 L 154 137" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
                <path
                  d="M 156 133 Q 165 147 160 156"
                  fill="none"
                  stroke="#FDE2C8"
                  strokeWidth="11"
                  strokeLinecap="round"
                />
                <circle cx="159" cy="157" r="7.5" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1.2" />
              </g>
            )}

            {/* Cánh tay phải (bên trái hình):
                - ready & completed: giơ vẫy chào / tạm biệt thân thiện (animate-mascot-wave)
                - working: thao tác ghi chép / làm việc tập trung (animate-mascot-work-hand) */}
            {isWorking ? (
              <g className="animate-mascot-work-hand">
                <path d="M 78 108 L 58 120 L 66 135 L 82 124 Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.4" />
                <path d="M 61 118 L 68 133" stroke="#E11D48" strokeWidth="3.2" strokeLinecap="round" />
                <path d="M 58 120 L 66 135" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
                <path
                  d="M 65 131 Q 72 144 88 142"
                  fill="none"
                  stroke="#FDE2C8"
                  strokeWidth="10.5"
                  strokeLinecap="round"
                />
                <circle cx="90" cy="142" r="6.8" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1.2" />
                {/* Bút kỹ thuật đang thao tác */}
                <line x1="87" y1="146" x2="101" y2="132" stroke="#E11D48" strokeWidth="3.2" strokeLinecap="round" />
              </g>
            ) : (
              <g className="animate-mascot-wave">
                <path
                  d="M 73 118 Q 52 104 45 78"
                  fill="none"
                  stroke="#FDE2C8"
                  strokeWidth="11"
                  strokeLinecap="round"
                />
                <path d="M 78 108 L 56 105 L 55 123 L 77 125 Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.4" />
                <path d="M 59 105 L 58 123" stroke="#E11D48" strokeWidth="3.2" strokeLinecap="round" />
                <path d="M 56 105 L 55 123" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
                <g transform="translate(43, 73)">
                  <circle cx="0" cy="0" r="8" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1.2" />
                  <ellipse cx="-6" cy="-5" rx="2.5" ry="5" transform="rotate(-24 -6 -5)" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1" />
                  <ellipse cx="-1" cy="-7" rx="2.3" ry="5.2" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1" />
                  <ellipse cx="4.5" cy="-6" rx="2.3" ry="4.8" transform="rotate(18 4.5 -6)" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1" />
                  <ellipse cx="7.5" cy="1" rx="2.2" ry="4.2" transform="rotate(42 7.5 1)" fill="#FDE2C8" stroke="#EAB896" strokeWidth="1" />
                </g>
              </g>
            )}

            {/* THÂN ÁO POLO ĐỒNG PHỤC SEDINCO CHUẨN 100% */}
            <g>
              <path
                d="M 75 106 L 145 106 L 148 168 Q 110 174 72 168 Z"
                fill="#FFFFFF"
                stroke="#CBD5E1"
                strokeWidth="1.5"
              />

              {/* 3 dải sọc chéo chạy từ hông phải xuống vạt áo dưới */}
              <g clipPath={`url(#${clipId})`}>
                <polygon points="72,140 120,174 72,174" fill="#334155" />
                <polygon points="72,135 127,174 121,174 72,140" fill="#FFFFFF" />
                <polygon points="72,118 139,174 126,174 72,135" fill="#E11D48" />
                <polygon points="72,114 143,174 139,174 72,118" fill="#FFFFFF" />
                <polygon points="86,118 153,174 142,174 86,125" fill="#CBD5E1" />
              </g>

              <path
                d="M 75 106 L 145 106 L 148 168 Q 110 174 72 168 Z"
                fill="none"
                stroke="#CBD5E1"
                strokeWidth="1.5"
              />

              {/* Cổ áo Polo lót Đỏ + Trụ 3 nút */}
              <path d="M 96 101 Q 110 112 124 101 L 122 110 Q 110 117 98 110 Z" fill="#DC2626" />
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

              {/* LOGO SEDINCO TRÊN NGỰC TRÁI */}
              <g transform="translate(119, 118)">
                <path d="M 8 2 L 15 5.5 L 11 7.8 L 8 6.2 L 5 7.8 L 9 10 L 6 11.8 L 1.5 9.2 L 1.5 5.5 Z" fill="#E11D48" />
                <path d="M 10.5 11.5 Q 16.5 6 17.5 12.5 Q 13.5 15 10.5 11.5 Z" fill="#16A34A" />
                <polygon points="3,11 9,14.5 15,11 15,15.5 9,18.5 3,15.5" fill="#94A3B8" stroke="#64748B" strokeWidth="0.6" />
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
            <g>
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

              {/* Biểu cảm Mắt & Miệng theo đúng 3 trạng thái */}
              {isCompleted ? (
                <g>
                  {/* Đôi mắt cười弯 hạnh phúc sau khi hoàn thành ca làm việc */}
                  <path d="M 87 65 Q 94 58 101 65" fill="none" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
                  <path d="M 119 65 Q 126 58 133 65" fill="none" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
                  {/* Miệng cười rạng rỡ hoàn thành công việc */}
                  <path d="M 100 79 Q 110 91 120 79 Z" fill="#E11D48" stroke="#9F1239" strokeWidth="1.2" strokeLinejoin="round" />
                  <path d="M 103 79 L 117 79" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
                </g>
              ) : isWorking ? (
                <g>
                  {/* Lông mày tập trung làm việc năng suất */}
                  <path d="M 87 56 L 101 58" fill="none" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
                  <path d="M 133 56 L 119 58" fill="none" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
                  {/* Đôi mắt sáng tập trung */}
                  <circle cx="94" cy="67" r="5.6" fill="#0F172A" />
                  <circle cx="126" cy="67" r="5.6" fill="#0F172A" />
                  <circle cx="96" cy="65" r="2" fill="#FFFFFF" />
                  <circle cx="128" cy="65" r="2" fill="#FFFFFF" />
                  {/* Nụ cười tự tin chuyên nghiệp */}
                  <path d="M 103 81 Q 110 86 117 81" fill="none" stroke="#9F1239" strokeWidth="2.4" strokeLinecap="round" />
                </g>
              ) : (
                <g>
                  {/* Lông mày tươi tỉnh chào ngày mới */}
                  <path d="M 87 57 Q 94 54 100 57" fill="none" stroke="#1E293B" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M 120 57 Q 126 54 133 57" fill="none" stroke="#1E293B" strokeWidth="2.2" strokeLinecap="round" />
                  {/* Đôi mắt mở to long lanh sẵn sàng vào ca */}
                  <circle cx="94" cy="67" r="5.8" fill="#0F172A" />
                  <circle cx="126" cy="67" r="5.8" fill="#0F172A" />
                  <circle cx="96" cy="64.8" r="2.1" fill="#FFFFFF" />
                  <circle cx="128" cy="64.8" r="2.1" fill="#FFFFFF" />
                  <circle cx="92.5" cy="68.5" r="1" fill="#FFFFFF" fillOpacity="0.8" />
                  <circle cx="124.5" cy="68.5" r="1" fill="#FFFFFF" fillOpacity="0.8" />
                  {/* Miệng cười tươi chào buổi sáng */}
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
