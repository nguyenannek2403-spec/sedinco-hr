/**
 * Manifest chuẩn hóa cấu trúc ngăn/module của Frontend Sedinco HR V30.
 */
export const FRONTEND_MODULES = {
  accessibility: () => import("./accessibility/FontScaleContext"),
  notifications: () => import("./notifications/NotificationCenterPanel"),
  payroll: () => import("./payroll/PayslipActionFooter")
};
