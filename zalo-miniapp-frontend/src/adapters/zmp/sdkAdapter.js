import { realSdkAdapter } from "./realSdkAdapter";

/**
 * Unified Zalo Mini App SDK Adapter (Single Gateway)
 * Toàn bộ lời gọi zmp-sdk đi qua realSdkAdapter & được bao bọc bởi tầng service trong src/services/.
 */
export const zmpAdapter = {
  isMock: false,
  isZaloRuntime: () => realSdkAdapter.isZaloRuntime(),
  getSetting: (...args) => realSdkAdapter.getSetting(...args),
  authorize: (...args) => realSdkAdapter.authorize(...args),
  openPermissionSetting: (...args) => realSdkAdapter.openPermissionSetting(...args),
  getAccessToken: (...args) => realSdkAdapter.getAccessToken(...args),
  getLocation: (...args) => realSdkAdapter.getLocation(...args),
  checkCameraPermission: (...args) => realSdkAdapter.checkCameraPermission(...args),
  requestCameraPermission: (...args) => realSdkAdapter.requestCameraPermission(...args),
  openMediaPicker: (...args) => realSdkAdapter.openMediaPicker(...args),
  openBioAuthentication: (...args) => realSdkAdapter.openBioAuthentication(...args),
  checkStateBioAuthentication: (...args) => realSdkAdapter.checkStateBioAuthentication(...args),
  chooseImage: (...args) => realSdkAdapter.chooseImage(...args),
  getSystemInfo: (...args) => realSdkAdapter.getSystemInfo(...args),
  vibrate: (...args) => realSdkAdapter.vibrate(...args),
  getNetworkType: (...args) => realSdkAdapter.getNetworkType(...args),
  keepScreenOn: (...args) => realSdkAdapter.keepScreenOn(...args),
  saveFile: (...args) => realSdkAdapter.saveFile(...args),
  getStorage: (...args) => realSdkAdapter.getStorage(...args),
  setStorage: (...args) => realSdkAdapter.setStorage(...args),
  removeStorage: (...args) => realSdkAdapter.removeStorage(...args),
  openShareSheet: (...args) => realSdkAdapter.openShareSheet(...args),
  openOutApp: (...args) => realSdkAdapter.openOutApp(...args)
};

export default zmpAdapter;
