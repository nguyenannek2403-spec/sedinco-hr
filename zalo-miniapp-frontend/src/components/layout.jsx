import React from "react";
import { getSystemInfo } from "zmp-sdk";
import {
  AnimationRoutes,
  App,
  Route,
  SnackbarProvider,
  ZMPRouter,
} from "zmp-ui";
import { BrowserRouter, Routes } from "react-router-dom";

import HomePage from "../pages/index";

// Error Boundary to prevent blank screens on uncaught render errors
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Sedinco HR App Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
            backgroundColor: "#f8fafc",
            color: "#1e293b",
            textAlign: "center",
          }}
        >
          <div
            style={{
              maxWidth: "480px",
              background: "#ffffff",
              padding: "32px",
              borderRadius: "16px",
              boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
              border: "1px solid #e2e8f0",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "#fee2e2",
                color: "#dc2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto",
                fontSize: "24px",
              }}
            >
              ⚠️
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "8px", color: "#0f172a" }}>
              Đã xảy ra sự cố khởi động giao diện
            </h2>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px", lineHeight: "1.5" }}>
              {this.state.error?.message || "Không thể tải thành phần giao diện. Vui lòng thử tải lại trang hoặc xóa bộ nhớ đệm."}
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Tải lại trang
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.clear();
                    sessionStorage.clear();
                  } catch (e) {}
                  window.location.href = "/";
                }}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#f1f5f9",
                  color: "#475569",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Xóa cache & Đăng nhập lại
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Detect whether app is running inside Zalo Mini App runtime or standard Web Browser
const isZaloEnvironment = () => {
  if (typeof window === "undefined") return false;
  return (
    window.location.pathname.startsWith("/zapps") ||
    Boolean(window.ZaloJavaScriptInterface) ||
    (Boolean(window.zAppID) &&
      !window.location.hostname.includes("workers.dev") &&
      !window.location.hostname.includes("localhost") &&
      !window.location.hostname.includes("127.0.0.1"))
  );
};

const SmartRouter = ({ children }) => {
  if (isZaloEnvironment()) {
    return (
      <ZMPRouter>
        <AnimationRoutes>{children}</AnimationRoutes>
      </ZMPRouter>
    );
  }

  return (
    <BrowserRouter basename="">
      <Routes>{children}</Routes>
    </BrowserRouter>
  );
};

const Layout = () => {
  let theme = "light";
  if (isZaloEnvironment()) {
    try {
      const info = getSystemInfo();
      if (info?.zaloTheme) {
        theme = info.zaloTheme;
      }
    } catch (e) {
      theme = "light";
    }
  }

  return (
    <ErrorBoundary>
      <App theme={theme}>
        <SnackbarProvider>
          <SmartRouter>
            <Route path="/" element={<HomePage />} />
            <Route path="*" element={<HomePage />} />
          </SmartRouter>
        </SnackbarProvider>
      </App>
    </ErrorBoundary>
  );
};

export default Layout;

