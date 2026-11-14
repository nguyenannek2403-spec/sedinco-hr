import { useEffect } from 'react';

let lockCount = 0;
let savedScrollY = 0;

/**
 * Khóa cuộn trang nền khi Modal/Drawer/Popup mở trên Zalo Mini App / Mobile WebView.
 * Sử dụng bộ đếm tham chiếu để an toàn khi có nhiều hộp thoại mở chồng lên nhau.
 */
export function useLockBodyScroll(isOpen = true) {
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined' || typeof window === 'undefined') {
      return undefined;
    }

    if (lockCount === 0) {
      savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
      document.body.style.touchAction = 'none';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
    }
    lockCount += 1;
    let focusTimer = null;
    const handleFocusIn = (e) => {
      const target = e?.target;
      if (!target || typeof target.scrollIntoView !== 'function') return;
      const tag = String(target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (focusTimer) clearTimeout(focusTimer);
        focusTimer = setTimeout(() => {
          try {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          } catch {
            // Bỏ qua nếu trình duyệt không hỗ trợ smooth scroll options
          }
        }, 150);
      }
    };
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      if (focusTimer) clearTimeout(focusTimer);
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.documentElement.style.overflow = '';
        document.documentElement.style.overscrollBehavior = '';
        document.body.style.overflow = '';
        document.body.style.overscrollBehavior = '';
        document.body.style.touchAction = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [isOpen]);
}

export default useLockBodyScroll;
