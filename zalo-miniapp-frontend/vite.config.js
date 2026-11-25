import { defineConfig, loadEnv } from "vite";
import zaloMiniApp from "zmp-vite-plugin";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = process.env.VITE_API_URL || env.VITE_API_URL;

  if (mode === "staging" && !apiUrl) {
    throw new Error(
      "❌ [BẢO MẬT BUILD STAGING] Thiếu biến môi trường VITE_API_URL khi build Staging!\n" +
      "👉 Bắt buộc phải khai báo VITE_API_URL=<url_staging_backend> để tránh vô tình rơi vào endpoint Production."
    );
  }

  return defineConfig({
    root: ".",
    base: "",
    plugins: [zaloMiniApp(), react()],
    build: {
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("xlsx")) return "vendor-xlsx";
            if (id.includes("qrcode") || id.includes("jsqr")) return "vendor-qr";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("zmp-ui") || id.includes("zmp-sdk")) return "vendor-zmp";
            return undefined;
          }
        }
      }
    },
  });
};
