import { realSdkAdapter } from "./realSdkAdapter";

/**
 * Production Zalo Mini App SDK Adapter
 * Luôn sử dụng realSdkAdapter (Zalo SDK thật), đã cô lập và loại bỏ hoàn toàn mockSdkAdapter.
 */
export const zmpAdapter = {
  isMock: false,
  getUserInfo: (...args) => realSdkAdapter.getUserInfo(...args),
  getAccessToken: (...args) => realSdkAdapter.getAccessToken(...args),
  getLocation: (...args) => realSdkAdapter.getLocation(...args),
  openBioAuthentication: (...args) => realSdkAdapter.openBioAuthentication(...args),
  checkStateBioAuthentication: (...args) => realSdkAdapter.checkStateBioAuthentication(...args),
  chooseImage: (...args) => realSdkAdapter.chooseImage(...args),
  getSystemInfo: (...args) => realSdkAdapter.getSystemInfo(...args),
  scanQRCode: (...args) => realSdkAdapter.scanQRCode(...args),
  vibrate: (...args) => realSdkAdapter.vibrate(...args)
};

export default zmpAdapter;
