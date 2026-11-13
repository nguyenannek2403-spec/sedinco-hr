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
  if (upper === 'P' || upper === 'LEAVE' || upper === 'LEAVE_ANNUAL' || lower.includes('nghỉ phép') || lower.includes('phép năm')) {
    return 'Nghỉ phép năm (hưởng lương)';
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
    return { label: 'Đã duyệt', bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (key === 'rejected') {
    return { label: 'Từ chối', bgClass: 'bg-rose-50 text-rose-700 border-rose-200' };
  }
  if (key === 'cancelled') {
    return { label: 'Đã hủy', bgClass: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
  return { label: 'Chờ duyệt', bgClass: 'bg-amber-50 text-amber-700 border-amber-200' };
}

export function getAttendanceStatusInfo(status) {
  const s = String(status || '').trim();
  if (s === '1') {
    return { label: 'Đủ công', shortLabel: 'Đủ công', credit: 1, creditText: '1,0 công', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (s === '1/OT') {
    return { label: 'Đủ công & Tăng ca', shortLabel: 'Công + Tăng ca', credit: 1, creditText: '1,0 công', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  }
  if (s === 'OT') {
    return { label: 'Làm thêm ngày nghỉ', shortLabel: 'Tăng ca', credit: 0, creditText: 'Tăng ca', badgeClass: 'bg-violet-50 text-violet-700 border-violet-200' };
  }
  if (s === '0.5') {
    return { label: 'Nửa ngày công', shortLabel: 'Nửa công', credit: 0.5, creditText: '0,5 công', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  if (s === 'P') {
    return { label: 'Nghỉ phép hưởng lương', shortLabel: 'Nghỉ phép', credit: 1, creditText: '1,0 (Phép)', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200' };
  }
  if (s === 'L') {
    return { label: 'Nghỉ lễ hưởng lương', shortLabel: 'Nghỉ lễ', credit: 1, creditText: '1,0 (Lễ)', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' };
  }
  if (s === 'KP') {
    return { label: 'Nghỉ không lương', shortLabel: 'Không lương', credit: 0, creditText: '0 công', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
  if (s === 'V') {
    return { label: 'Vắng không lý do', shortLabel: 'Vắng mặt', credit: 0, creditText: '0 công', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' };
  }
  if (s === 'NOT_CHECKED_IN') {
    return { label: 'Chưa chấm công', shortLabel: 'Chưa chấm', credit: 0, creditText: '—', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
  if (s === '0' || !s) {
    return { label: 'Chưa ghi nhận công', shortLabel: 'Nghỉ / Trống', credit: 0, creditText: '0 công', badgeClass: 'bg-slate-100 text-slate-500 border-slate-200' };
  }
  return { label: s, shortLabel: s, credit: 0, creditText: s, badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' };
}

export function getAuditActionLabel(action) {
  const map = {
    LOGIN: 'Đăng nhập hệ thống',
    LOGOUT: 'Đăng xuất',
    CHANGE_PASSWORD: 'Đổi mật khẩu',
    CREATE_EMPLOYEE: 'Thêm hồ sơ nhân viên',
    UPDATE_EMPLOYEE: 'Cập nhật hồ sơ nhân viên',
    UPDATE_EMPLOYEE_STATUS: 'Đổi trạng thái tài khoản',
    UPDATE_EMPLOYEE_ROLE: 'Thay đổi vai trò nhân viên',
    UPDATE_EMPLOYEE_SHIFT: 'Cập nhật ca làm & phép năm',
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
    UPDATE_PERMISSION: 'Thay đổi quyền Kế toán',
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
