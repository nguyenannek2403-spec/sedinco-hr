import { defineConfig } from "vite";
import zaloMiniApp from "zmp-vite-plugin";
import react from "@vitejs/plugin-react";
import path from "path";

// Root vite.config.js to enable Zalo Mini App Extension in VS Code workspace
export default () => {
  return defineConfig({
    root: "./zalo-miniapp-frontend",
    base: "",
    plugins: [zaloMiniApp(), react()],
    build: {
      outDir: path.resolve(__dirname, "dist"),
      assetsInlineLimit: 0,
    },
  });
};
