import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Type } from "lucide-react";
import { safePut, getAuthToken } from "../utils/api";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";

export const FONT_SCALE_STORAGE_KEY = "sedinco_font_scale";

export const FONT_SCALE_OPTIONS = [
  { value: 100, label: "100%", description: "Bình thường" },
  { value: 110, label: "110%", description: "Hơi lớn" },
  { value: 125, label: "125%", description: "Lớn" },
  { value: 150, label: "150%", description: "Rất lớn" },
  { value: 175, label: "175%", description: "Cực lớn" },
  { value: 200, label: "200%", description: "Thị lực kém" }
];

export const FONT_SCALE_ROOT_PX = {
  100: 16,
  110: 17,
  125: 18,
  150: 19.5,
  175: 21,
  200: 22
};

const VALID_SCALES = FONT_SCALE_OPTIONS.map((o) => o.value);

export function normalizeFontScale(val) {
  const num = Number(val);
  return VALID_SCALES.includes(num) ? num : 100;
}

function readInitialFontScale() {
  if (typeof window === "undefined") return 100;
  try {
    const attr = Number(document.documentElement.getAttribute("data-font-scale"));
    if (VALID_SCALES.includes(attr)) return attr;
    const saved = Number(localStorage.getItem(FONT_SCALE_STORAGE_KEY));
    if (VALID_SCALES.includes(saved)) return saved;
  } catch {
    // ignore storage errors
  }
  return 100;
}

function applyFontScaleToDom(scale) {
  if (typeof document === "undefined") return;
  const normalized = normalizeFontScale(scale);
  try {
    const root = document.documentElement;
    root.setAttribute("data-font-scale", String(normalized));
    root.style.fontSize = normalized === 100 ? "" : `${FONT_SCALE_ROOT_PX[normalized] || 16}px`;
  } catch {
    // ignore DOM errors
  }
}

const FontScaleContext = createContext({
  fontScale: 100,
  setFontScale: () => {},
  syncFontScaleFromUser: () => {}
});

export function FontScaleProvider({ children }) {
  const [fontScale, setFontScaleState] = useState(() => readInitialFontScale());

  useEffect(() => {
    applyFontScaleToDom(fontScale);
  }, [fontScale]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await zmpAdapter.getStorage(FONT_SCALE_STORAGE_KEY);
        const normalized = normalizeFontScale(stored);
        if (active && stored != null && VALID_SCALES.includes(Number(stored))) {
          setFontScaleState((prev) => (prev !== normalized ? normalized : prev));
        }
      } catch {
        // ignore storage errors
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setFontScale = useCallback((rawScale, { persistRemote = true } = {}) => {
    const next = normalizeFontScale(rawScale);
    setFontScaleState(next);
    applyFontScaleToDom(next);
    try {
      localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(next));
      zmpAdapter.setStorage(FONT_SCALE_STORAGE_KEY, String(next)).catch(() => {});
    } catch {
      // ignore storage errors
    }

    if (persistRemote && getAuthToken()) {
      safePut("/account/preferences", { font_scale: next }).catch(() => {});
    }
  }, []);

  const syncFontScaleFromUser = useCallback((user) => {
    if (!user || user.font_scale === undefined || user.font_scale === null) return;
    const remoteScale = normalizeFontScale(user.font_scale);
    setFontScaleState(remoteScale);
    applyFontScaleToDom(remoteScale);
    try {
      localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(remoteScale));
      zmpAdapter.setStorage(FONT_SCALE_STORAGE_KEY, String(remoteScale)).catch(() => {});
    } catch {
      // ignore storage errors
    }
  }, []);

  return (
    <FontScaleContext.Provider value={{ fontScale, setFontScale, syncFontScaleFromUser }}>
      {children}
    </FontScaleContext.Provider>
  );
}

export function useFontScale() {
  return useContext(FontScaleContext);
}

export function FontScaleSelector({ className = "" }) {
  const { fontScale, setFontScale } = useFontScale();
  const activeOption = FONT_SCALE_OPTIONS.find((o) => o.value === fontScale) || FONT_SCALE_OPTIONS[0];

  return (
    <div
      data-testid="font-scale-selector"
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-3 sm:p-4 shadow-sm space-y-3 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-[#E11D48] dark:text-rose-300 flex items-center justify-center shrink-0">
            <Type className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#111C2D] dark:text-white leading-snug">
              Cỡ chữ hiển thị (Hỗ trợ thị lực)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">
              Phóng to toàn bộ chữ, bảng &amp; nút bấm — tự lưu theo tài khoản
            </p>
          </div>
        </div>
        <span
          data-testid="font-scale-current-label"
          className="px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-700 text-[#B80035] dark:text-rose-300 text-xs font-extrabold whitespace-nowrap shrink-0"
        >
          {activeOption.label} • {activeOption.description}
        </span>
      </div>

      <div
        role="group"
        aria-label="Chọn cỡ chữ hiển thị"
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5"
      >
        {FONT_SCALE_OPTIONS.map((opt) => {
          const active = fontScale === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              data-testid={`font-scale-btn-${opt.value}`}
              aria-pressed={active}
              onClick={() => setFontScale(opt.value)}
              className={`min-h-[46px] px-2 py-2 rounded-xl border text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all ${
                active
                  ? "bg-[#E11D48] text-white border-[#BE123C] dark:bg-rose-600 dark:border-rose-400 shadow-sm font-extrabold"
                  : "bg-[#F0F3FF]/70 hover:bg-rose-50 text-[#111C2D] border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 dark:border-slate-700 font-semibold"
              }`}
            >
              <span className="text-xs leading-none">{opt.label}</span>
              <span className={`text-xs leading-tight ${active ? "text-rose-100" : "text-slate-600 dark:text-slate-300"}`}>
                {opt.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
