export const ROLES = {
  EMPLOYEE: "employee",
  ACCOUNTANT: "accountant",
  ADMIN: "admin"
};

export const ROLE_LABELS = {
  [ROLES.EMPLOYEE]: "Nhân Viên",
  [ROLES.ACCOUNTANT]: "Kế Toán",
  [ROLES.ADMIN]: "Quản Trị"
};

export const ROLE_PERMISSIONS = {
  [ROLES.EMPLOYEE]: {
    name: "Nhân Viên",
    allowedTabs: ["checkin", "history", "requests", "payroll", "profile"],
    defaultTab: "checkin",
    canCheckIn: true,
    canViewOwnAttendance: true,
    canViewAllAttendance: false,
    canCreateRequest: true,
    canApproveRequests: false,
    canViewOwnPayroll: true,
    canViewCompanyPayroll: false,
    canManageEmployees: false,
    canManageRBAC: false,
    canManageHolidays: false
  },
  [ROLES.ACCOUNTANT]: {
    name: "Kế Toán",
    allowedTabs: ["payroll", "history", "checkin", "profile"],
    defaultTab: "payroll",
    canCheckIn: true,
    canViewOwnAttendance: true,
    canViewAllAttendance: true,
    canCreateRequest: false,
    canApproveRequests: false,
    canViewOwnPayroll: true,
    canViewCompanyPayroll: true,
    canManageEmployees: false,
    canManageRBAC: false,
    canManageHolidays: false
  },
  [ROLES.ADMIN]: {
    name: "Quản Trị",
    allowedTabs: ["management", "requests", "payroll", "history", "checkin", "profile"],
    defaultTab: "management",
    canCheckIn: true,
    canViewOwnAttendance: true,
    canViewAllAttendance: true,
    canCreateRequest: true,
    canApproveRequests: true,
    canViewOwnPayroll: true,
    canViewCompanyPayroll: true,
    canManageEmployees: true,
    canManageRBAC: true,
    canManageHolidays: true
  }
};

/**
 * Kiểm tra xem tab có được phép truy cập bởi role không
 */
export const isTabAllowedForRole = (tab, role) => {
  const perm = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLES.EMPLOYEE];
  return perm.allowedTabs.includes(tab);
};

/**
 * Lấy tab mặc định của role
 */
export const getDefaultTabForRole = (role) => {
  const perm = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLES.EMPLOYEE];
  return perm.defaultTab;
};

/**
 * Kiểm tra quyền cụ thể của role
 */
export const hasPermission = (role, permissionKey) => {
  const perm = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLES.EMPLOYEE];
  return !!perm[permissionKey];
};
