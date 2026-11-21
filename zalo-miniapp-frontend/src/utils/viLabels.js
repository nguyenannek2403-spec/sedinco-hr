/**
 * Nguồn chân lý thống nhất cho nhãn tiếng Việt hiển thị trên giao diện người dùng cuối.
 * Tuyệt đối không hiển thị mã lập trình tiếng Anh lên màn hình người dùng.
 */

export const DEPARTMENT_OPTIONS = [
  'Khối Văn phòng',
  'Khối Kho bãi',
  'Khối Kinh doanh - Showroom',
  'Khối Công trình'
];

export const SHIFT_OPTIONS = [
  { value: 'FULL_DAY', label: 'Ca hành chính' },
  { value: 'MORNING_SHIFT', label: 'Ca sáng' },
  { value: 'AFTERNOON_SHIFT', label: 'Ca chiều' },
  { value: 'NIGHT_SHIFT', label: 'Ca tối' }
];

export const CORRECTION_MODES = [
  { value: 'CHECK_IN', label: 'Quên giờ vào', desc: 'Có giờ ra nhưng thiếu giờ vào đầu ca' },
  { value: 'CHECK_OUT', label: 'Quên giờ ra', desc: 'Đã chấm giờ vào nhưng quên bấm ra ca' },
  { value: 'BOTH', label: 'Quên cả vào & ra', desc: 'Có đi làm nhưng điện thoại hết pin / lỗi cả ngày' },
  { value: 'SHIFT_CHANGE', label: 'Đổi ca làm việc', desc: 'Làm lệch khung giờ chuẩn do điều động đột xuất' }
];

const ROLE_LABELS = {
  admin: 'Quản trị viên',
  accountant: 'Kế toán',
  worker: 'Nhân viên',
  employee: 'Nhân viên'
};

export function getRoleLabel(role) {
  const key = String(role || 'worker').trim().toLowerCase();
  return ROLE_LABELS[key] || 'Nhân viên';
}

export function getShiftLabel(shiftCode) {
  const code = String(shiftCode || 'FULL_DAY').trim().toUpperCase();
  const found = SHIFT_OPTIONS.find((item) => item.value === code);
  return found ? found.label : 'Ca hành chính';
}

export function getRequestTypeLabel(type) {
  const raw = String(type || '').trim();
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();

  if (!raw) return 'Đơn đề xuất';
  if (upper === 'SALARY_ADVANCE' || upper === 'ADVANCE' || lower.includes('ứng lương') || lower.includes('tạm ứng')) {
    return 'Xin ứng lương';
  }
  if (
    upper === 'ATTENDANCE_COMPENSATION' ||
    upper === 'CT' ||
    upper === 'FORGOT_CHECKIN' ||
    upper === 'LATE_EARLY' ||
    lower.includes('bổ sung') ||
    lower.includes('cập nhật công') ||
    lower.includes('quên chấm') ||
    lower.includes('giờ ra')
  ) {
    return 'Giải trình Bổ sung công';
  }
  if (upper === 'OT' || upper === 'OVERTIME' || lower.includes('tăng ca') || lower.includes('làm thêm')) {
    return 'Đăng ký Tăng ca';
  }
  if (upper === 'KP' || upper === 'UNPAID' || lower.includes('không lương')) {
    return 'Nghỉ không lương';
  }
  if (upper === '0.5' || lower.includes('nửa ngày') || lower.includes('buổi')) {
    return 'Nghỉ phép nửa ngày';
  }
  if (upper === 'P' || upper === 'PAID_LEAVE' || upper === 'NGHI_PHEP' || upper === 'LEAVE' || upper === 'LEAVE_ANNUAL' || lower.includes('nghỉ phép') || lower.includes('phép năm') || lower.includes('có lương')) {
    return 'Nghỉ phép có lương';
  }
  if (lower.includes('công tác')) {
    return 'Đi công tác / Ngoài công trình';
  }
  // Nếu chuỗi gốc không chứa ký tự kỹ thuật viết liền bằng gạch dưới hoặc toàn chữ hoa tiếng Anh thì giữ lại
  if (/^[A-Z0-9_]+$/.test(raw)) {
    return 'Đơn đề xuất khác';
  }
  return raw;
}

export function getCorrectionModeLabel(mode) {
  const key = String(mode || '').trim().toUpperCase();
  const found = CORRECTION_MODES.find((item) => item.value === key);
  return found ? found.label : '';
}

export function getRequestStatusInfo(status) {
  const key = String(status || 'pending').trim().toLowerCase();
  if (key === 'approved') {
    return {
      label: 'Đã duyệt',
      bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70'
    };
  }
  if (key === 'rejected') {
    return {
      label: 'Từ chối',
      bgClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/70'
    };
  }
  if (key === 'cancelled') {
    return {
      label: 'Đã hủy',
      bgClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
    };
  }
  return {
    label: 'Chờ duyệt',
    bgClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70'
  };
}

export function getAttendanceStatusInfo(status) {
  const s = String(status || '').trim();
  if (s === '1') {
    return {
      label: 'Đủ công',
      shortLabel: 'Đủ công',
      credit: 1,
      creditText: '1,0 công',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70'
    };
  }
  if (s === '1/OT') {
    return {
      label: 'Đủ công & Tăng ca',
      shortLabel: 'Công + Tăng ca',
      credit: 1,
      creditText: '1,0 công',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/70'
    };
  }
  if (s === 'OT') {
    return {
      label: 'Làm thêm ngày nghỉ',
      shortLabel: 'Tăng ca',
      credit: 0,
      creditText: 'Tăng ca',
      badgeClass: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800/70'
    };
  }
  if (s === '0.5') {
    return {
      label: 'Nửa ngày công',
      shortLabel: 'Nửa công',
      credit: 0.5,
      creditText: '0,5 công',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70'
    };
  }
  if (s === 'P') {
    return {
      label: 'Nghỉ phép hưởng lương',
      shortLabel: 'Nghỉ phép',
      credit: 1,
      creditText: '1,0 (Phép)',
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/70'
    };
  }
  if (s === 'L') {
    return {
      label: 'Nghỉ lễ hưởng lương',
      shortLabel: 'Nghỉ lễ',
      credit: 1,
      creditText: '1,0 (Lễ)',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/70'
    };
  }
  if (s === 'KP') {
    return {
      label: 'Nghỉ không lương',
      shortLabel: 'Không lương',
      credit: 0,
      creditText: '0 công',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
    };
  }
  if (s === 'V') {
    return {
      label: 'Vắng không lý do',
      shortLabel: 'Vắng mặt',
      credit: 0,
      creditText: '0 công',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/70'
    };
  }
  if (s === 'NOT_CHECKED_IN') {
    return {
      label: 'Chưa chấm công',
      shortLabel: 'Chưa chấm',
      credit: 0,
      creditText: '—',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
    };
  }
  if (s === '0') {
    return {
      label: 'Không tính công / Chưa đủ giờ',
      shortLabel: '0 công',
      credit: 0,
      creditText: '0 công',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/70'
    };
  }
  if (!s) {
    return {
      label: 'Chưa ghi nhận công',
      shortLabel: 'Nghỉ / Trống',
      credit: 0,
      creditText: '0 công',
      badgeClass: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
    };
  }
  return {
    label: s,
    shortLabel: s,
    credit: 0,
    creditText: s,
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
  };
}

export const ACCOUNTANT_PERMISSION_GROUPS = [
  {
    id: 'attendance_requests',
    label: 'Nhóm 1: Quản lý Chấm công & Đơn từ',
    description: 'Kiểm soát quyền xem, điều chỉnh, khóa sổ chấm công và xử lý đơn từ nhân viên',
    color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300',
    items: [
      {
        key: 'attendance_view_all',
        name: 'Xem bảng chấm công toàn công ty',
        desc: 'Xem bảng công ma trận 31 ngày, nhật ký nghi vấn và thống kê đi làm toàn bộ nhân viên',
        defaultEnabled: true
      },
      {
        key: 'attendance_edit',
        name: 'Điều chỉnh ngày công & Chấm công hộ',
        desc: 'Chỉnh sửa ngày công trực tiếp trên ma trận và thực hiện chấm công hộ nhân viên',
        defaultEnabled: false
      },
      {
        key: 'attendance_lock',
        name: 'Khóa sổ kỳ chấm công tháng',
        desc: 'Chốt đóng băng kỳ chấm công để chuẩn bị tính lương (Mở lại kỳ đã chốt thuộc quyền Giám đốc)',
        defaultEnabled: false
      },
      {
        key: 'leave_view_all',
        name: 'Xem danh sách đơn từ & tăng ca',
        desc: 'Xem đơn xin nghỉ phép, bổ sung công, ứng lương và đăng ký tăng ca của toàn công ty',
        defaultEnabled: true
      },
      {
        key: 'leave_approve',
        name: 'Phê duyệt / Từ chối đơn nghỉ phép, bổ sung công & tăng ca',
        desc: 'Duyệt hoặc từ chối đơn từ và tăng ca của nhân viên khác (Không được tự duyệt đơn của chính mình)',
        defaultEnabled: false,
        sodWarning: 'Chặn tự duyệt đơn của chính mình'
      }
    ]
  },
  {
    id: 'employee_shift',
    label: 'Nhóm 2: Quản lý Hồ sơ Nhân sự & Phân ca',
    description: 'Quản lý danh sách nhân viên, thông tin hồ sơ, tài khoản và ca làm việc',
    color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-300',
    items: [
      {
        key: 'employee_view',
        name: 'Xem danh sách & hồ sơ nhân viên',
        desc: 'Xem thông tin hồ sơ, mức lương hợp đồng và phụ cấp của cán bộ nhân viên',
        defaultEnabled: true
      },
      {
        key: 'employee_create',
        name: 'Thêm nhân viên mới',
        desc: 'Tạo hồ sơ nhân sự và cấp tài khoản đăng nhập cho nhân viên mới vào công ty',
        defaultEnabled: false
      },
      {
        key: 'employee_edit',
        name: 'Chỉnh sửa thông tin nhân viên',
        desc: 'Cập nhật họ tên, chức danh, mức lương cơ bản, phụ cấp và thông tin bảo hiểm',
        defaultEnabled: false
      },
      {
        key: 'employee_delete',
        name: 'Xóa hồ sơ nhân viên',
        desc: 'Xóa hồ sơ nhân viên không còn làm việc khỏi danh sách công ty',
        defaultEnabled: false,
        sodWarning: 'Thao tác nhạy cảm cần Giám đốc kiểm soát'
      },
      {
        key: 'employee_status_manage',
        name: 'Khóa / Mở khóa tài khoản nhân sự',
        desc: 'Tạm khóa tài khoản khi nghỉ việc hoặc kích hoạt lại tài khoản đang bị khóa',
        defaultEnabled: false
      },
      {
        key: 'shift_manage',
        name: 'Phân ca & Giờ làm việc',
        desc: 'Thiết lập loại ca làm việc, giờ vào/ra riêng cho từng nhân viên',
        defaultEnabled: false
      }
    ]
  },
  {
    id: 'payroll',
    label: 'Nhóm 3: Tính toán, Điều chỉnh & Chi trả Tiền lương',
    description: 'Kiểm soát quy trình tính lương, chốt phiếu lương, giải quyết khiếu nại và chi trả',
    color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300',
    items: [
      {
        key: 'payroll_view_all',
        name: 'Xem bảng lương toàn công ty',
        desc: 'Xem bảng thanh toán tiền lương, phụ cấp, thưởng phạt và trạng thái chi trả hàng tháng',
        defaultEnabled: true
      },
      {
        key: 'payroll_calculate',
        name: 'Tính toán lương & Điều chỉnh thưởng/phạt/tạm ứng',
        desc: 'Chạy tính lương toàn công ty và cập nhật thưởng nóng, phạt hoặc khấu trừ tạm ứng',
        defaultEnabled: true
      },
      {
        key: 'payroll_approve',
        name: 'Phê duyệt chốt bảng lương & Xử lý khiếu nại lương',
        desc: 'Chốt phát hành phiếu lương, trả lại chỉnh sửa hoặc giải quyết khiếu nại sai lương của nhân viên',
        defaultEnabled: false,
        sodWarning: 'Không được tự xử lý khiếu nại của chính mình'
      },
      {
        key: 'payroll_payment_status_manage',
        name: 'Cập nhật trạng thái chi trả lương',
        desc: 'Xác nhận đã chi trả tiền lương cho kỳ lương đã được phê duyệt',
        defaultEnabled: false,
        sodWarning: 'Tách quyền giữa người duyệt và người chi trả'
      }
    ]
  },
  {
    id: 'config_reports',
    label: 'Nhóm 4: Cấu hình, Ngày lễ & Xuất báo cáo',
    description: 'Xuất file bảng lương, sao lưu kỳ lương và minh bạch các quyền độc quyền Giám đốc',
    color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300',
    items: [
      {
        key: 'payroll_export',
        name: 'Xuất báo cáo lương Excel/CSV & Sao lưu dữ liệu tháng',
        desc: 'Tải file Excel/CSV bảng lương và xuất gói sao lưu dữ liệu kỳ lương 1 chạm',
        defaultEnabled: true
      }
    ]
  }
];

export const ADMIN_SOD_EXCLUSIVE_ITEMS = [
  {
    name: 'Mở khóa kỳ chấm công đã chốt sổ',
    desc: 'Chỉ Quản trị viên / Giám đốc được phép mở lại kỳ công đã đóng băng để bảo vệ tính toàn vẹn dữ liệu'
  },
  {
    name: 'Cấu hình thông tin công ty, Wi-Fi & Quy tắc lương',
    desc: 'Chỉnh sửa vị trí chi nhánh, chính sách đi trễ, thử việc, tăng ca và mức lương âm'
  },
  {
    name: 'Quản lý lịch nghỉ lễ quốc gia & Vai trò/Thiết bị',
    desc: 'Thêm/xóa ngày lễ nhân hệ số 3.0x, phân vai Admin/Kế toán và duyệt đổi thiết bị nhân viên'
  },
  {
    name: 'Nhật ký kiểm toán an ninh & Cấu hình phân quyền',
    desc: 'Xem nhật ký thao tác hệ thống, ghim/dọn nhật ký và thay đổi quyền Kế toán'
  }
];

export function getAuditActionLabel(action) {
  const map = {
    LOGIN: 'Đăng nhập hệ thống',
    LOGOUT: 'Đăng xuất',
    CHANGE_PASSWORD: 'Đổi mật khẩu',
    CREATE_EMPLOYEE: 'Thêm hồ sơ nhân viên',
    UPDATE_EMPLOYEE: 'Cập nhật hồ sơ nhân viên',
    UPDATE_EMPLOYEE_STATUS: 'Đổi trạng thái tài khoản',
    UPDATE_EMPLOYEE_ROLE: 'Thay đổi vai trò nhân viên',
    UPDATE_EMPLOYEE_SHIFT: 'Cập nhật ca làm & định mức phép',
    DELETE_EMPLOYEE: 'Xóa nhân viên',
    CHECK_IN: 'Chấm công hàng ngày',
    PROXY_CHECK_IN: 'Chấm công hộ nhân viên',
    UPDATE_ATTENDANCE: 'Chỉnh sửa ngày công',
    LOCK_ATTENDANCE_PERIOD: 'Chốt sổ kỳ công tháng',
    UNLOCK_ATTENDANCE_PERIOD: 'Mở lại kỳ công tháng',
    CREATE_REQUEST: 'Gửi đơn từ mới',
    APPROVE_REQUEST: 'Phê duyệt đơn từ',
    REJECT_REQUEST: 'Từ chối đơn từ',
    CANCEL_REQUEST: 'Hủy đơn từ',
    UPDATE_COMPANY: 'Cập nhật thông tin công ty',
    UPDATE_COMPANY_SETTINGS: 'Cập nhật cấu hình công ty',
    UPDATE_PERMISSION: 'Thay đổi quyền Kế toán',
    UPDATE_ACCOUNTANT_PERMISSIONS: 'Cập nhật phân quyền Kế toán',
    APPROVE_PAYROLL: 'Phê duyệt & Chốt bảng lương',
    REJECT_PAYROLL: 'Trả lại bảng lương chỉnh sửa',
    UPDATE_PAYMENT_STATUS: 'Xác nhận chi trả lương',
    EXPORT_MONTHLY_BACKUP_SNAPSHOT: 'Sao lưu dữ liệu kỳ lương tháng',
    CLEANUP_AUDIT_LOGS: 'Dọn dẹp nhật ký định kỳ',
    TOGGLE_EMPLOYEE_KEEP_LOGS: 'Bật/tắt giữ lịch sử nhân sự',
    APPROVE_DEVICE: 'Duyệt đổi thiết bị mới',
    REJECT_DEVICE: 'Từ chối đổi thiết bị',
    REQUEST_DEVICE_CHANGE: 'Xin đổi điện thoại chấm công',
    CRITICAL_FRAUD: 'Cảnh báo chấm công bất thường',
    CONFIRM_SALARY: 'Nhân viên xác nhận phiếu lương',
    DISPUTE_SALARY: 'Nhân viên phản hồi sai lương',
    ADJUST_PAYROLL: 'Điều chỉnh thưởng/phạt/ứng lương'
  };
  const key = String(action || '').trim().toUpperCase();
  if (map[key]) return map[key];
  if (!key || /^[A-Z0-9_]+$/.test(key)) return 'Thao tác quản trị hệ thống';
  return String(action);
}

export function formatErrorMessage(rawMessage) {
  if (!rawMessage) return 'Đã có sự cố xảy ra. Vui lòng thử lại sau ít phút.';
  const msg = String(rawMessage).trim();

  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Network Error')) {
    return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng Wi-Fi hoặc 4G và thử lại.';
  }
  if (msg.includes('AbortError') || msg.toLowerCase().includes('timeout')) {
    return 'Hệ thống phản hồi chậm do mạng yếu. Vui lòng thử thao tác lại sau vài giây.';
  }

  // Làm sạch các nhãn kỹ thuật tiếng Anh nếu vẫn còn sót
  return msg
    .replace(/\s*\(403 Forbidden\)/gi, '')
    .replace(/\s*\(429 Rate Limit\)/gi, '')
    .replace(/\s*\(409 Conflict\)/gi, '')
    .replace(/\s*\(5xx\)/gi, '')
    .replace(/\s*\(SoD\)/gi, '')
    .replace(/\s*\(is_low_trust\)/gi, '')
    .replace(/\s*\(attendance_edit\)/gi, '')
    .replace(/\bTimeout\b/gi, 'Quá thời gian chờ');
}
