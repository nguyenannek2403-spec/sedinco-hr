import { useEffect } from "react";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";

function isZaloRuntime() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.ZaloJavaScriptInterface ||
      window.__ZMP__ ||
      (typeof navigator !== "undefined" && /Zalo|ZMP/i.test(navigator.userAgent || ""))
  );
}

function measureCssEnvTopPx() {
  if (typeof document === "undefined" || !document.body) return 0;
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;";
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height || 0;
    document.body.removeChild(probe);
    return Math.round(h);
  } catch {
    return 0;
  }
}

/**
 * Engine đồng bộ Viewport & Bàn phím ảo dùng chung toàn app:
 * - Đồng bộ --visual-vh theo visualViewport khi bàn phím ảo đóng/mở (dùng rAF, cleanup sạch)
 * - Tự động đặt data-keyboard-open="true" khi chiều cao co > 150px để ẩn BottomNav & cuộn input đang focus
 * - Fallback --sat theo statusBarHeight của zmp-sdk CHỈ KHI env(safe-area-inset-top) trả về 0px trong Zalo Runtime
 */
export function useAdaptiveViewport() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;

    const root = document.documentElement;
    let rafId = null;
    let focusScrollTimer = null;
    let lastOrientationWidth = window.innerWidth;
    let baseViewportHeight = window.visualViewport?.height || window.innerHeight || 0;
    let lastAppliedVh = "";
    let lastKeyboardOpen = false;

    // Tránh cộng trùng safe-area-inset-top: chỉ dùng statusBarHeight của SDK nếu CSS env() trả về 0 trong Zalo Runtime
    if (isZaloRuntime()) {
      try {
        const cssTop = measureCssEnvTopPx();
        const sysInfo = zmpAdapter.getSystemInfo();
        const sdkStatusBar = Number(sysInfo?.statusBarHeight || 0);
        if (cssTop <= 0 && sdkStatusBar > 0 && sdkStatusBar < 100) {
          root.style.setProperty("--sat", `${Math.round(sdkStatusBar)}px`);
        }
      } catch {
        // Bỏ qua nếu môi trường không hỗ trợ getSystemInfo
      }
    }

    const syncViewportMetrics = () => {
      rafId = null;
      const vv = window.visualViewport;
      const curWidth = vv ? vv.width : window.innerWidth;
      const curHeight = vv ? vv.height : window.innerHeight;

      if (Math.abs(curWidth - lastOrientationWidth) > 40) {
        lastOrientationWidth = curWidth;
        baseViewportHeight = curHeight;
      } else if (curHeight > baseViewportHeight) {
        baseViewportHeight = curHeight;
      }

      const nextVh = vv ? `${Math.round(curHeight)}px` : "";
      if (nextVh && nextVh !== lastAppliedVh) {
        root.style.setProperty("--visual-vh", nextVh);
        lastAppliedVh = nextVh;
      }

      const delta = baseViewportHeight - curHeight;
      const activeTag = String(document.activeElement?.tagName || "").toUpperCase();
      const isInputFocused = activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";
      const isKeyboardOpen = delta > 150 && (isInputFocused || curWidth < 1024);

      if (isKeyboardOpen !== lastKeyboardOpen) {
        lastKeyboardOpen = isKeyboardOpen;
        if (isKeyboardOpen) {
          root.setAttribute("data-keyboard-open", "true");
        } else {
          root.removeAttribute("data-keyboard-open");
        }
      }
    };

    const scheduleSync = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(syncViewportMetrics);
    };

    const handleFocusIn = (e) => {
      const target = e?.target;
      if (!target || typeof target.scrollIntoView !== "function") return;
      const tag = String(target.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (focusScrollTimer) clearTimeout(focusScrollTimer);
        focusScrollTimer = window.setTimeout(() => {
          scheduleSync();
          try {
            target.scrollIntoView({ block: "center", behavior: "smooth" });
          } catch {
            // Bỏ qua nếu WebView không hỗ trợ options object
          }
        }, 160);
      }
    };

    const handleFocusOut = () => {
      window.setTimeout(scheduleSync, 120);
    };

    syncViewportMetrics();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", scheduleSync);
      vv.addEventListener("scroll", scheduleSync);
    }
    window.addEventListener("resize", scheduleSync);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (focusScrollTimer) clearTimeout(focusScrollTimer);
      if (vv) {
        vv.removeEventListener("resize", scheduleSync);
        vv.removeEventListener("scroll", scheduleSync);
      }
      window.removeEventListener("resize", scheduleSync);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      root.removeAttribute("data-keyboard-open");
      root.style.removeProperty("--visual-vh");
    };
  }, []);
}

export default useAdaptiveViewport;
