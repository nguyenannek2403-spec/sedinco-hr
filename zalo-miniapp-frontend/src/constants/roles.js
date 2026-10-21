/**
 * Định nghĩa Vai Trò (Roles) & Ma Trận Phân Quyền (RBAC) duy nhất của Sedinco HR
 * Chuẩn hóa nghiêm ngặt ĐÚNG 3 ROLE NGHIỆP VỤ:
 * - worker: Công nhân / Nhân viên sử dụng các chức năng cá nhân
 * - accountant: Kế toán thực hiện nghiệp vụ chấm công, lương, báo cáo theo quyền được cấp
 * - admin: Quản trị viên / Ban Giám Đốc, cấp quyền cao nhất và quyết định toàn hệ thống
 */

export const ROLES = {
  WORKER: "worker",
  ACCOUNTANT: "accountant",
  ADMIN: "admin",
  // Alias tương thích ngược cho các component cũ
  EMPLOYEE: "worker"
};

export const ROLE_LABELS = {
  [ROLES.WORKER]: "Công Nhân / Nhân Viên",
  [ROLES.ACCOUNTANT]: "Kế Toán",
  [ROLES.ADMIN]: "Quản Trị Viên (Giám Đốc)"
};

// Cấu hình quyền mặc định ban đầu cho 3 role
export const ROLE_PERMISSIONS = {
  [ROLES.WORKER]: {
    name: "Công Nhân / Nhân Viên",
    allowedTabs: ["checkin", "history", "requests", "payroll", "profile"],
    defaultTab: "checkin",
    canCheckIn: true,
    canViewOwnAttendance: true,
    canViewAllAttendance: false,
    canEditAttendance: false,
    canLockPeriod: false,
    canUnlockPeriod: false,
    canCreateRequest: true,
    canCancelOwnRequest: true,
    canApproveRequests: false,
    canViewOwnPayroll: true,
    canViewCompanyPayroll: false,
    canManageEmployees: false,
    canIssueLinkCode: false,
    canManageHolidays: false,
    canManageCompany: false,
    canManageBiometricFlag: false,
    canViewAuditLogs: false,
    canManagePermissions: false
  },

  [ROLES.ACCOUNTANT]: {
    name: "Kế Toán",
    allowedTabs: ["matrix", "requests", "payroll", "history", "checkin", "profile"],
    defaultTab: "matrix",
    canCheckIn: true,
    canViewOwnAttendance: true,
    canViewAllAttendance: true, // Xem bảng công 31 ngày
    canEditAttendance: false, // Phụ thuộc dynamic permission
    canLockPeriod: false, // Phụ thuộc dynamic permission
    canUnlockPeriod: false, // Chỉ Admin mở khóa
    canCreateRequest: true,
    canCancelOwnRequest: true,
    canApproveRequests: false, // Phụ thuộc dynamic permission
    canViewOwnPayroll: true,
    canViewCompanyPayroll: true, // Bảng lương toàn công ty
    canExportPayrollExcel: true,
    canManageEmployees: false,
    canIssueLinkCode: false,
    canManageHolidays: false,
    canManageCompany: false,
    canManageBiometricFlag: false,
    canViewAuditLogs: false,
    canManagePermissions: false
  },

  [ROLES.ADMIN]: {
    name: "Quản Trị Viên (Giám Đốc)",
    allowedTabs: ["matrix", "payroll", "requests", "management", "company", "holidays", "permissions", "audit_logs", "checkin", "profile"],
    defaultTab: "matrix",
    canCheckIn: true,
    canViewOwnAttendance: true,
    canViewAllAttendance: true,
    canEditAttendance: true,
    canLockPeriod: true,
    canUnlockPeriod: true,
    canCreateRequest: true,
    canCancelOwnRequest: true,
    canApproveRequests: true,
    canViewOwnPayroll: true,
    canViewCompanyPayroll: true,
    canExportPayrollExcel: true,
    canManageEmployees: true,
    canIssueLinkCode: true,
    canManageHolidays: true,
    canManageCompany: true,
    canManageBiometricFlag: true,
    canViewAuditLogs: true,
    canManagePermissions: true // Quyền cấu hình phân quyền Kế toán
  }
};

/**
 * Kiểm tra xem tab có được phép truy cập bởi role không
 */
export const isTabAllowedForRole = (tab, role, dynamicPermissions = {}) => {
  const normalizedRole = role === "employee" ? ROLES.WORKER : (role || ROLES.WORKER);
  const perm = ROLE_PERMISSIONS[normalizedRole] || ROLE_PERMISSIONS[ROLES.WORKER];
  
  if (normalizedRole === ROLES.ADMIN) return true;
  
  // Với Kế toán: Kiểm tra thêm dynamic permissions nếu có
  if (normalizedRole === ROLES.ACCOUNTANT && dynamicPermissions) {
    if (tab === "management" && dynamicPermissions.employee_view) return true;
    if (tab === "payroll" && dynamicPermissions.payroll_view_all) return true;
    if (tab === "matrix" && dynamicPermissions.attendance_view_all) return true;
    if (tab === "requests" && dynamicPermissions.leave_view_all) return true;
  }

  return perm.allowedTabs.includes(tab);
};

/**
 * Lấy tab mặc định của role
 */
export const getDefaultTabForRole = (role) => {
  const normalizedRole = role === "employee" ? ROLES.WORKER : (role || ROLES.WORKER);
  const perm = ROLE_PERMISSIONS[normalizedRole] || ROLE_PERMISSIONS[ROLES.WORKER];
  return perm.defaultTab;
};

/**
 * Kiểm tra quyền cụ thể của role kết hợp dynamic permission
 */
export const hasPermission = (role, permissionKey, dynamicPermissions = {}) => {
  const normalizedRole = role === "employee" ? ROLES.WORKER : (role || ROLES.WORKER);
  if (normalizedRole === ROLES.ADMIN) return true;

  if (normalizedRole === ROLES.ACCOUNTANT && dynamicPermissions && dynamicPermissions[permissionKey] !== undefined) {
    return Boolean(dynamicPermissions[permissionKey]);
  }

  const perm = ROLE_PERMISSIONS[normalizedRole] || ROLE_PERMISSIONS[ROLES.WORKER];
  return !!perm[permissionKey];
};
