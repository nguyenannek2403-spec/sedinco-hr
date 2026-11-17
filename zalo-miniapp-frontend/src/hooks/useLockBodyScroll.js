import { useEffect, useLayoutEffect, useState } from "react";

const activeModalStack = [];
const stackListeners = new Set();
const savedScrollPositions = new Map();
let savedWindowScrollY = 0;
let listenersAttached = false;
let lastTouchY = null;

function notifyStackListeners() {
  for (const listener of stackListeners) {
    try {
      listener((v) => v + 1);
    } catch {
      // Bỏ qua lỗi listener
    }
  }
}

function getTopmostModalRoot() {
  if (typeof document === "undefined") return null;
  const nodes = [...document.querySelectorAll('[data-modal-root="true"]')];
  if (nodes.length === 0) return null;
  let top = nodes[nodes.length - 1];
  let maxZ = -1;
  for (const node of nodes) {
    const z = Number(window.getComputedStyle(node).zIndex) || Number(node.style.zIndex) || 0;
    if (z >= maxZ) {
      maxZ = z;
      top = node;
    }
  }
  return top;
}

function handleTouchStartCapture(e) {
  lastTouchY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : null;
}

function handleScrollPhysicsCapture(e) {
  const topModal = getTopmostModalRoot();
  if (!topModal) return;

  const target = e.target;
  if (!target || !topModal.contains(target)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  const scrollArea = typeof target.closest === "function" ? target.closest(".modal-scroll-area") : null;
  if (!scrollArea || !topModal.contains(scrollArea)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  const maxScrollTop = scrollArea.scrollHeight - scrollArea.clientHeight;
  if (maxScrollTop <= 1) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  if (e.type === "wheel") {
    const deltaY = Number(e.deltaY) || 0;
    const atTop = scrollArea.scrollTop <= 0;
    const atBottom = scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 1;
    if ((deltaY < 0 && atTop) || (deltaY > 0 && atBottom)) {
      e.preventDefault();
      e.stopPropagation();
    }
  } else if (e.type === "touchmove") {
    const curY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : null;
    if (lastTouchY !== null && curY !== null) {
      const fingerDeltaY = lastTouchY - curY; // >0 = vuốt lên để cuộn xuống
      const atTop = scrollArea.scrollTop <= 0;
      const atBottom = scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 1;
      if ((fingerDeltaY < 0 && atTop) || (fingerDeltaY > 0 && atBottom)) {
        e.preventDefault();
        e.stopPropagation();
      }
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

  if (!listenersAttached) {
    document.addEventListener("touchstart", handleTouchStartCapture, { passive: true, capture: true });
    document.addEventListener("wheel", handleScrollPhysicsCapture, { passive: false, capture: true });
    document.addEventListener("touchmove", handleScrollPhysicsCapture, { passive: false, capture: true });
    listenersAttached = true;
  }
}

function unlockBackgroundLayers() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (listenersAttached) {
    document.removeEventListener("touchstart", handleTouchStartCapture, { capture: true });
    document.removeEventListener("wheel", handleScrollPhysicsCapture, { capture: true });
    document.removeEventListener("touchmove", handleScrollPhysicsCapture, { capture: true });
    listenersAttached = false;
  }
  lastTouchY = null;

  document.documentElement.classList.remove("body-modal-open");
  document.body.classList.remove("body-modal-open");

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
