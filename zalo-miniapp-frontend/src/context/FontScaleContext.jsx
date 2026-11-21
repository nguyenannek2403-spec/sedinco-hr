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

  return (
    <div
      data-testid="font-scale-selector"
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-3 ${className}`}
    >
      <label
        htmlFor="sedinco-font-scale-select"
        className="inline-flex items-center gap-2 text-sm font-bold text-[#111C2D] dark:text-white shrink-0"
      >
        <Type className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />
        <span>Cỡ chữ</span>
      </label>

      <select
        id="sedinco-font-scale-select"
        data-testid="font-scale-select"
        aria-label="Cỡ chữ"
        value={String(fontScale)}
        onChange={(e) => setFontScale(Number(e.target.value))}
        className="min-h-[40px] max-w-[200px] px-3 py-1.5 rounded-xl bg-[#F0F3FF] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-[#111C2D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E11D48] cursor-pointer"
      >
        {FONT_SCALE_OPTIONS.map((opt) => (
          <option key={opt.value} value={String(opt.value)}>
            {opt.label} ({opt.description})
          </option>
        ))}
      </select>
    </div>
  );
}
