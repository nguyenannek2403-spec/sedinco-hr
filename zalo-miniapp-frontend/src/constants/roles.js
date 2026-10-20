/**
 * Định nghĩa Vai Trò (Roles) & Ma Trận Phân Quyền (RBAC) duy nhất của Sedinco HR
 * Áp dụng nguyên tắc tách quyền (Separation of Duties):
 * - Nhân viên: Chấm công vào/ra, xem công mình, tạo/hủy đơn mình
 * - Nhân sự: Dashboard hôm nay, duyệt đơn, sửa công (có lý do, kỳ chưa chốt), cấp mã liên kết
 * - Kế toán: Bảng công kỳ (chỉ đọc), xem bất thường, CHỐT CÔNG, xuất Excel lương
 * - Quản trị: Người dùng, điểm làm việc/bán kính, lịch lễ, cờ sinh trắc, mở kỳ đã chốt
 */

export const ROLES = {
  EMPLOYEE: "employee",
  HR: "hr",
  ACCOUNTANT: "accountant",
  ADMIN: "admin"
};

export const ROLE_LABELS = {
  [ROLES.EMPLOYEE]: "Nhân Viên",
  [ROLES.HR]: "Nhân Sự (HR)",
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
    canViewAuditLogs: false
  },

  [ROLES.HR]: {
    name: "Nhân Sự (HR)",
    allowedTabs: ["matrix", "requests", "management", "history", "payroll", "checkin", "profile"],
    defaultTab: "matrix",
    canCheckIn: true,
    canViewOwnAttendance: true,
    canViewAllAttendance: true,
    canEditAttendance: true, // Sửa công có lý do, chỉ kỳ chưa chốt
    canLockPeriod: false, // Tách quyền: HR KHÔNG được chốt công
    canUnlockPeriod: false,
    canCreateRequest: true,
    canCancelOwnRequest: true,
    canApproveRequests: true, // Không được duyệt đơn của chính mình
    canViewOwnPayroll: true,
    canViewCompanyPayroll: false,
    canManageEmployees: true, // Quản lý hồ sơ nhân viên
    canIssueLinkCode: true, // Cấp lại mã liên kết 8 ký tự
    canManageHolidays: false,
    canManageCompany: false,
    canManageBiometricFlag: false,
    canViewAuditLogs: false
  },

  [ROLES.ACCOUNTANT]: {
    name: "Kế Toán",
    allowedTabs: ["matrix", "payroll", "history", "checkin", "profile"],
    defaultTab: "matrix",
    canCheckIn: true,
    canViewOwnAttendance: true,
    canViewAllAttendance: true, // Bảng công 31 ngày CHỈ ĐỌC
    canEditAttendance: false, // Tách quyền: Kế toán KHÔNG sửa công
    canLockPeriod: true, // Kế toán CHỐT CÔNG
    canUnlockPeriod: false, // Mở lại cần Quản trị
    canCreateRequest: false,
    canCancelOwnRequest: false,
    canApproveRequests: false,
    canViewOwnPayroll: true,
    canViewCompanyPayroll: true,
    canExportPayrollExcel: true,
    canManageEmployees: false,
    canIssueLinkCode: false,
    canManageHolidays: false,
    canManageCompany: false,
    canManageBiometricFlag: false,
    canViewAuditLogs: false
  },

  [ROLES.ADMIN]: {
    name: "Quản Trị",
    allowedTabs: ["matrix", "payroll", "requests", "management", "company", "holidays", "audit_logs", "checkin", "profile"],
    defaultTab: "matrix",
    canCheckIn: true,
    canViewOwnAttendance: true,
    canViewAllAttendance: true,
    canEditAttendance: true,
    canLockPeriod: false,
    canUnlockPeriod: true, // Mở lại kỳ đã chốt (kèm lý do bắt buộc)
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
    canManageBiometricFlag: true, // Bật/tắt cờ sinh trắc học
    canViewAuditLogs: true // Nhật ký thao tác chỉ đọc
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
