/**
 * Bảo vệ ứng dụng khi chạy trên trình duyệt Web tiêu chuẩn (ngoài Zalo Mini App WebView):
 * Thư viện zmp-sdk/apis/index.js tự thực thi login() ở top-level khi import và reject với
 * { code: -2000, api: "login" } nếu không có ZaloJavaScriptInterface.
 * Guard này chỉ chặn rejection đặc thù đó, giữ nguyên mọi lỗi runtime khác.
 */
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const isStandardBrowser = !window.ZaloJavaScriptInterface;
    if (
      isStandardBrowser &&
      reason &&
      typeof reason === "object" &&
      reason.api === "login" &&
      Number(reason.code) === -2000
    ) {
      event.preventDefault();
    }
  });
}

