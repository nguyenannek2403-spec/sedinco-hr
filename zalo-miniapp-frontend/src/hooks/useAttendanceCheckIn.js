import { useRef, useState, useCallback } from "react";

export const SPAM_WARNING_MESSAGE =
  "⚠️ Bạn đang ấn liên tục quá nhiều lần! Hệ thống đã ghi nhận chấm công, vui lòng không ấn spam.";

/**
 * Hook chống bấm spam nút Chấm Công trên giao diện di động:
 * - Phát hiện người dùng bấm lặp lại liên tục trong khi yêu cầu đang gửi hoặc ngay sau khi vừa bấm xong
 * - Chỉ bật cảnh báo thân thiện bằng tiếng Việt, KHÔNG văng màn hình lỗi đỏ hay gây đơ giao diện
 */
export function useSpamClickGuard(windowMs = 2500) {
  const [spamWarning, setSpamWarning] = useState("");
  const spamClickTrackerRef = useRef({
    inFlight: false,
    lastCompletedAt: 0,
    rapidTapCount: 0,
    clearTimer: null
  });

  const clearSpamWarning = useCallback(() => {
    setSpamWarning("");
  }, []);

  const showFriendlySpamAlert = useCallback((customMsg = SPAM_WARNING_MESSAGE, onToast = null) => {
    setSpamWarning(customMsg);
    if (typeof onToast === "function") {
      onToast(customMsg, "warning");
    }
    const tracker = spamClickTrackerRef.current;
    if (tracker.clearTimer) clearTimeout(tracker.clearTimer);
    tracker.clearTimer = setTimeout(() => {
      setSpamWarning("");
    }, 4500);
  }, []);

  const beginCheckInTap = useCallback(
    (onToast = null) => {
      const now = Date.now();
      const tracker = spamClickTrackerRef.current;

      if (tracker.inFlight) {
        tracker.rapidTapCount += 1;
        showFriendlySpamAlert(SPAM_WARNING_MESSAGE, onToast);
        return false;
      }

      if (tracker.lastCompletedAt > 0 && now - tracker.lastCompletedAt < windowMs) {
        tracker.rapidTapCount += 1;
        showFriendlySpamAlert(SPAM_WARNING_MESSAGE, onToast);
        return false;
      }

      tracker.inFlight = true;
      tracker.rapidTapCount = 0;
      setSpamWarning("");
      return true;
    },
    [windowMs, showFriendlySpamAlert]
  );

  const endCheckInTap = useCallback((succeeded = true) => {
    const tracker = spamClickTrackerRef.current;
    tracker.inFlight = false;
    if (succeeded) {
      tracker.lastCompletedAt = Date.now();
    }
  }, []);

  return {
    spamClickTrackerRef,
    spamWarning,
    setSpamWarning,
    showFriendlySpamAlert,
    beginCheckInTap,
    endCheckInTap,
    clearSpamWarning
  };
}

export default useSpamClickGuard;

