import { useEffect } from "react";
import { getSystemInfo } from "zmp-sdk/apis";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";

function measureCssVarPx(cssExpr) {
  if (typeof document === "undefined" || !document.body) return 0;
  try {
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;top:0;left:0;width:0;height:${cssExpr};visibility:hidden;pointer-events:none;`;
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height || 0;
    document.body.removeChild(probe);
    return Math.round(h);
  } catch {
    return 0;
  }
}

/**
 * Engine đồng bộ Viewport, Safe Area 4 góc & Bàn phím ảo dùng chung toàn app:
 * - Định nghĩa --safe-area-top: max(env(safe-area-inset-top, 0px), var(--zaui-safe-area-inset-top, 0px))
 * - Khi chạy trong Zalo Mini App, gọi getSystemInfo từ zmp-sdk: nếu statusBarHeight > 0 và --safe-area-top
 *   đang tính ra 0px (lỗi thường gặp trên iOS WKWebView), tự động gán
 *   document.documentElement.style.setProperty('--safe-area-top', statusBarHeight + 'px')
 *   (chỉ gán khi --safe-area-top == 0px và WebView chưa bị statusBar native đẩy xuống để không cộng trùng 2 lần).
 * - Đồng bộ --visual-vh theo visualViewport khi bàn phím ảo đóng/mở.
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

    const applyZaloSafeAreaFallback = () => {
      try {
        const currentSafeTop = measureCssVarPx("var(--safe-area-top, 0px)");
        const currentSafeBottom = measureCssVarPx("var(--safe-area-bottom, 0px)");

        const rawSysInfo =
          (typeof getSystemInfo === "function" ? getSystemInfo() : null) ||
          zmpAdapter.getSystemInfo();

        const processSysInfo = (sysInfo) => {
          if (!sysInfo || typeof sysInfo !== "object") return;
          const statusBarHeight = Number(
            sysInfo.statusBarHeight ?? sysInfo.safeArea?.top ?? 0
          );

          // Kiểm tra xem native statusBar đã đẩy khung WebView xuống chưa (tránh cộng trùng 2 lần)
          const screenH = Number(window.screen?.height || 0);
          const innerH = Number(window.innerHeight || 0);
          const isWebViewAlreadyShiftedByNativeBar =
            screenH > 0 &&
            innerH > 0 &&
            statusBarHeight > 0 &&
            screenH - innerH >= statusBarHeight &&
            Number(window.screenTop || window.screenY || 0) >= statusBarHeight;

          if (
            statusBarHeight > 0 &&
            statusBarHeight < 120 &&
            currentSafeTop <= 0 &&
            !isWebViewAlreadyShiftedByNativeBar
          ) {
            const topPx = `${Math.round(statusBarHeight)}px`;
            root.style.setProperty("--safe-area-top", topPx);
            root.style.setProperty("--sat", topPx);
          }

          const safeBottom = Number(sysInfo.safeArea?.bottom ?? 0);
          if (safeBottom > 0 && safeBottom < 80 && currentSafeBottom <= 0) {
            const bottomPx = `${Math.round(safeBottom)}px`;
            root.style.setProperty("--safe-area-bottom", bottomPx);
            root.style.setProperty("--sab", bottomPx);
          }
        };

        if (rawSysInfo && typeof rawSysInfo.then === "function") {
          rawSysInfo.then(processSysInfo).catch(() => {});
        } else if (rawSysInfo) {
          processSysInfo(rawSysInfo);
        }
      } catch {
        // Bỏ qua nếu môi trường trình duyệt ngoài Zalo không hỗ trợ getSystemInfo
      }
    };

    applyZaloSafeAreaFallback();

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
