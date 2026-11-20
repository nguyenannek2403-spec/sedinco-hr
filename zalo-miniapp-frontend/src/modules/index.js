/**
 * Manifest chuẩn hóa cấu trúc ngăn/module của Frontend Sedinco HR V29.
 */
export const FRONTEND_MODULES = {
  accessibility: () => import("./accessibility/FontScaleContext"),
  notifications: () => import("./notifications/NotificationCenterPanel"),
  payroll: () => import("./payroll/PayslipActionFooter"),
  dashboard: () => import("./dashboard/RoleOverviewDashboard"),
  qaCenter: () => import("./qa-center/QaCenterTab")
};
