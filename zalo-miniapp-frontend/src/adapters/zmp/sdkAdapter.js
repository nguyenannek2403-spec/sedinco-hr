import { realSdkAdapter } from "./realSdkAdapter";

let activeAdapter = realSdkAdapter;

if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "true") {
  // Chỉ nạp trong môi trường dev khi VITE_USE_MOCK=true
  import(/* @vite-ignore */ "./mockSdkAdapter.js").then((mod) => {
    activeAdapter = mod.mockSdkAdapter;
    console.info("%c[SDK Adapter] Running in MOCK Mode for local testing", "background: #f59e0b; color: #000; padding: 2px 6px; border-radius: 4px; font-weight: bold;");
  }).catch((e) => {
    console.warn("Failed to load mockSdkAdapter:", e);
  });
}

export const zmpAdapter = {
  getAccessToken: (...args) => activeAdapter.getAccessToken(...args),
  getLocation: (...args) => activeAdapter.getLocation(...args),
  openBioAuthentication: (...args) => activeAdapter.openBioAuthentication(...args),
  checkStateBioAuthentication: (...args) => activeAdapter.checkStateBioAuthentication(...args),
  chooseImage: (...args) => activeAdapter.chooseImage(...args),
  getSystemInfo: (...args) => activeAdapter.getSystemInfo(...args)
};

export default zmpAdapter;
