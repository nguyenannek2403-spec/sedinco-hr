import { useEffect, useLayoutEffect, useState } from "react";

const activeModalStack = [];
const stackListeners = new Set();
const savedScrollPositions = new Map();
let savedWindowScrollY = 0;

function notifyStackListeners() {
  for (const listener of stackListeners) {
    try {
      listener((v) => v + 1);
    } catch {
      // Bỏ qua lỗi listener
    }
  }
}

function lockBackgroundLayers(isFirstModal = false) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (isFirstModal) {
    savedWindowScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  }
  document.documentElement.classList.add("body-modal-open");
  document.body.classList.add("body-modal-open");
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  const appRoot = document.getElementById("app");
  if (appRoot) {
    appRoot.setAttribute("inert", "");
    appRoot.setAttribute("aria-hidden", "true");
    appRoot.inert = true;
  }

  const bgContainers = document.querySelectorAll(
    "#app, #app main, #app [data-scroll-container], #app .overflow-y-auto:not(.modal-scroll-area)"
  );
  bgContainers.forEach((el) => {
    if (!savedScrollPositions.has(el)) {
      savedScrollPositions.set(el, el.scrollTop || 0);
    }
    el.classList.add("bg-scroll-locked");
  });
}

function unlockBackgroundLayers() {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  document.documentElement.classList.remove("body-modal-open");
  document.body.classList.remove("body-modal-open");
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";

  const appRoot = document.getElementById("app");
  if (appRoot) {
    appRoot.removeAttribute("inert");
    appRoot.removeAttribute("aria-hidden");
    appRoot.inert = false;
  }

  for (const [el, prevScrollTop] of savedScrollPositions.entries()) {
    el.classList.remove("bg-scroll-locked");
    el.scrollTop = prevScrollTop;
  }
  savedScrollPositions.clear();

  window.scrollTo(0, savedWindowScrollY);
}

/**
 * Quản lý ngăn xếp Modal lồng nhau + Khóa cuộn đa tầng (document, #app, main, .overflow-y-auto)
 * và cách ly hoàn toàn sự kiện Wheel/Touch khi Modal mở.
 */
export function useModalStack(isOpen = true, baseZIndex = 100) {
  const [modalId] = useState(() => Symbol("modal"));
  const [, setStackTick] = useState(0);

  useEffect(() => {
    if (!isOpen) return undefined;
    stackListeners.add(setStackTick);
    return () => {
      stackListeners.delete(setStackTick);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || typeof document === "undefined" || typeof window === "undefined") {
      return undefined;
    }

    const wasEmpty = activeModalStack.length === 0;
    if (!activeModalStack.includes(modalId)) {
      activeModalStack.push(modalId);
    }
    lockBackgroundLayers(wasEmpty);
    notifyStackListeners();

    let focusTimer = null;
    const handleFocusIn = (e) => {
      const target = e?.target;
      if (!target || typeof target.scrollIntoView !== "function") return;
      const tag = String(target.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (focusTimer) clearTimeout(focusTimer);
        focusTimer = setTimeout(() => {
          try {
            target.scrollIntoView({ block: "center", behavior: "smooth" });
          } catch {
            // Bỏ qua nếu trình duyệt không hỗ trợ smooth scroll options
          }
        }, 150);
      }
    };
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      if (focusTimer) clearTimeout(focusTimer);
      const idx = activeModalStack.indexOf(modalId);
      if (idx !== -1) {
        activeModalStack.splice(idx, 1);
      }
      if (activeModalStack.length === 0) {
        unlockBackgroundLayers();
      }
      notifyStackListeners();
    };
  }, [isOpen, modalId]);

  const idx = activeModalStack.indexOf(modalId);
  const stackIndex = idx !== -1 ? idx : activeModalStack.length;
  const zIndex = baseZIndex + stackIndex * 10;
  const isTopModal = idx === -1 || idx === activeModalStack.length - 1;

  return { stackIndex, zIndex, isTopModal };
}

export function useLockBodyScroll(isOpen = true, baseZIndex = 90) {
  return useModalStack(isOpen, baseZIndex);
}

export default useLockBodyScroll;
