import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { safePut, getAuthToken } from "../utils/api";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";

export const THEME_STORAGE_KEY = "sedinco_theme_mode";

function normalizeThemeMode(val) {
  return String(val || "").trim().toLowerCase() === "dark" ? "dark" : "light";
}

function readInitialTheme() {
  if (typeof window === "undefined") return "light";
  try {
    const attr = document.documentElement.getAttribute("zaui-theme");
    if (attr === "dark" || attr === "light") return attr;
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch (e) {}
  return "light";
}

function applyThemeToDom(mode) {
  if (typeof document === "undefined") return;
  const isDark = mode === "dark";
  try {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.setAttribute("zaui-theme", mode);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    if (document.body) {
      document.body.classList.toggle("dark", isDark);
      document.body.setAttribute("data-theme", mode);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", isDark ? "#090d16" : "#f8fafc");
    }
  } catch (e) {}
}

const ThemeContext = createContext({
  theme: "light",
  isDark: false,
  setTheme: () => {},
  toggleTheme: () => {},
  syncThemeFromUser: () => {}
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readInitialTheme());

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await zmpAdapter.getStorage(THEME_STORAGE_KEY);
        if (active && (stored === "dark" || stored === "light")) {
          setThemeState((prev) => (prev !== stored ? stored : prev));
        }
      } catch (e) {}
    })();
    return () => {
      active = false;
    };
  }, []);

  const setTheme = useCallback((nextRaw, { persistRemote = true } = {}) => {
    const next = normalizeThemeMode(nextRaw);
    setThemeState(next);
    applyThemeToDom(next);
    try {
      zmpAdapter.setStorage(THEME_STORAGE_KEY, next).catch(() => {});
    } catch (e) {}

    if (persistRemote && getAuthToken()) {
      safePut("/account/theme", { theme_preference: next }).catch(() => {});
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      applyThemeToDom(next);
      try {
        zmpAdapter.setStorage(THEME_STORAGE_KEY, next).catch(() => {});
      } catch (e) {}
      if (getAuthToken()) {
        safePut("/account/theme", { theme_preference: next }).catch(() => {});
      }
      return next;
    });
  }, []);

  const syncThemeFromUser = useCallback((user) => {
    if (!user || !user.theme_preference) return;
    const remoteTheme = normalizeThemeMode(user.theme_preference);
    setThemeState(remoteTheme);
    applyThemeToDom(remoteTheme);
    try {
      zmpAdapter.setStorage(THEME_STORAGE_KEY, remoteTheme).catch(() => {});
    } catch (e) {}
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === "dark",
        setTheme,
        toggleTheme,
        syncThemeFromUser
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Nút chuyển chế độ Sáng / Tối đồng bộ 3 tầng (Giao diện, Bộ nhớ máy & Cơ sở dữ liệu).
 */
export function ThemeToggleButton({ className = "", compact = false }) {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      data-testid="theme-toggle-btn"
      aria-label={isDark ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
      title={isDark ? "Đang bật chế độ Tối — Bấm để chuyển Sáng" : "Đang bật chế độ Sáng — Bấm để chuyển Tối"}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border font-bold transition-all active:scale-95 min-w-[44px] min-h-[44px] ${
        compact ? "p-[8px] sm:px-3 sm:py-2 text-xs" : "px-3 py-2 text-xs sm:text-sm"
      } ${
        isDark
          ? "bg-slate-800/90 hover:bg-slate-700 text-amber-300 border-slate-700 shadow-sm"
          : "bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-sm"
      } ${className}`}
    >
      <span aria-hidden="true" className="text-base leading-none">{isDark ? "🌙" : "☀️"}</span>
      <span className={compact ? "hidden sm:inline" : ""}>{isDark ? "Tối" : "Sáng"}</span>
    </button>
  );
}

export default ThemeContext;
