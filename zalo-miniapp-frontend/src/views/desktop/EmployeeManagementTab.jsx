import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Lock,
  Unlock,
  Key,
  AlertCircle,
  AlertTriangle,
  Copy,
  Building2,
  Eye,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Phone,
  ExternalLink,
  FileSpreadsheet
} from "lucide-react";
import { safeGet, safePost, safePut } from "../../utils/api";
import { useDebouncedValue } from "../../hooks/useDebounce";
import { DEPARTMENT_OPTIONS, getShiftLabel } from "../../utils/viLabels";
import { formatViCurrency, formatViNumber, parseViNumberInput } from "../../utils/viNumberFormat";
import { ROLES, ROLE_LABELS } from "../../constants/roles";
import {
  computeDeviceShortTag,
  formatEmployeeDeviceLabel,
  parseKnownDevices,
  sanitizeSingleDeviceModelName,
  UNKNOWN_DEVICE_LABEL
} from "../../utils/deviceIdentity";
import ConfirmDialog from "../../components/ConfirmDialog";
import SalarySlipModal from "../../components/SalarySlipModal";
import {
  AppButton,
  AppModal,
  FormRow,
  StatusBadge,
  SkeletonList,
  EmptyState
} from "../../components/ui";

const SHIFT_OPTIONS = [
  { value: "FULL_DAY", label: "Ca hành chính (08:00–17:30)" },
  { value: "MORNING_SHIFT", label: "Ca sáng (07:30–12:00)" },
  { value: "AFTERNOON_SHIFT", label: "Ca chiều (13:00–17:30)" },
  { value: "NIGHT_SHIFT", label: "Ca tối (18:00–22:00)" }
];

function getShiftWindowText(emp) {
  if (emp.custom_start_time && emp.custom_end_time) {
    return `${String(emp.custom_start_time).slice(0, 5)}–${String(emp.custom_end_time).slice(0, 5)} (Giờ riêng)`;
  }
  return getShiftLabel(emp.shift_type || "FULL_DAY");
}

function getEmployeeDeviceSummary(emp) {
  if (emp?.role === "admin") {
    return {
      known: [],
      hasMultiAlert: false,
      hasPendingChange: false,
      hasAnyAlert: false,
      primaryId: "",
      primaryName: "",
      primaryTag: "",
      primaryLabel: "Không áp dụng thiết bị cá nhân"
    };
  }
  const known = parseKnownDevices(emp.known_devices_json);
  const hasMultiAlert = Boolean(emp.multi_device_alert) || known.length >= 2;
  const hasPendingChange = Boolean(emp.pending_device_id);
  const primaryId = emp.bound_device_id || (known[0] && known[0].device_id) || "";
  const primaryMatch = known.find((d) => d.device_id === primaryId) || known[0] || null;
  const rawPrimaryName = emp.bound_device_name || primaryMatch?.device_name || (primaryId ? UNKNOWN_DEVICE_LABEL : "");
  const primaryName = rawPrimaryName ? sanitizeSingleDeviceModelName(rawPrimaryName) : "";
  const primaryTag = primaryMatch?.short_tag || (primaryId ? computeDeviceShortTag(primaryId) : "");

  return {
    known,
    hasMultiAlert,
    hasPendingChange,
    hasAnyAlert: hasMultiAlert || hasPendingChange,
    primaryId,
    primaryName,
    primaryTag,
    primaryLabel: primaryName
      ? formatEmployeeDeviceLabel(emp.ho_ten || emp.ma_nv, primaryName, primaryTag, hasMultiAlert)
      : `${emp.ho_ten || emp.ma_nv} : Chưa liên kết máy`
  };
}

export default function EmployeeManagementTab({
  currentUser,
  showToast,
  initialFilter = "all",
  focusTarget = null,
  alertsSummary = {},
  onOpenLiveBoard,
  onRefreshAlerts,
  activeRole,
  dynamicPerms = {}
}) {
  const effectiveRole = activeRole || currentUser?.role || ROLES.ADMIN;
  const isAdmin = effectiveRole === ROLES.ADMIN;
  const canEditEmployees = isAdmin || dynamicPerms?.employee_edit === true;
  const canViewPayroll = isAdmin || dynamicPerms?.payroll_view_all !== false;

  const [employees, setEmployees] = useState([]);
  const [payslipEmp, setPayslipEmp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [quickFilter, setQuickFilter] = useState(initialFilter || "all"); // 'all' | 'active' | 'alerts' | 'locked'
  const [todayFilter, setTodayFilter] = useState("all"); // 'all' | 'present' | 'late' | 'field_work' | 'leave' | 'absent'
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [selectedDepartment, setSelectedDepartment] = useState("ALL");

  // Modal thêm nhân viên
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [form, setForm] = useState({
    ma_nv: "",
    ho_ten: "",
    chuc_danh: "",
    department: "Khối Công trình",
    phone: "",
    dien_thoai: "",
    login_username: "",
    password: "123456",
    email: "",
    role: "worker",
    shift_type: "FULL_DAY",
    custom_start_time: "",
    custom_end_time: "",
    luong_cb: 8000000,
    has_insurance: true
  });
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [createdCreds, setCreatedCreds] = useState(null);

  // Modal Hồ sơ Kiểm soát Nhân sự 360° (1 cửa sổ duy nhất)
  const [detailEmp, setDetailEmp] = useState(null);
  const [detailForm, setDetailForm] = useState(null);
  const [savingDetail, setSavingDetail] = useState(false);
  const [resolvingDevice, setResolvingDevice] = useState(false);

  // Confirm Dialog
  const [confirmAction, setConfirmAction] = useState({
    open: false,
    title: "",
    message: "",
    confirmLabel: "Xác nhận",
    danger: false,
    onExecute: null
  });
  const [confirmLoading, setConfirmLoading] = useState(false);
  const actionInFlightRef = useRef(false);
  const lastFocusTsRef = useRef(0);

  useEffect(() => {
    setQuickFilter(initialFilter || "all");
  }, [initialFilter]);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/employees", {}, { cancelPrevious: true });
      if (res?.success && Array.isArray(res.data)) {
        setEmployees(res.data);
        setDetailEmp((prev) => {
          if (!prev) return null;
          return res.data.find((item) => item.ma_nv === prev.ma_nv) || null;
        });
      } else {
        setEmployees([]);
      }
    } catch (err) {
      setError(err.message || "Không thể tải danh sách nhân sự");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const executeConfirmedAction = async () => {
    if (actionInFlightRef.current || typeof confirmAction.onExecute !== "function") return;
    actionInFlightRef.current = true;
    setConfirmLoading(true);
    try {
      await confirmAction.onExecute();
    } finally {
      actionInFlightRef.current = false;
      setConfirmLoading(false);
      setConfirmAction({
        open: false,
        title: "",
        message: "",
        confirmLabel: "Xác nhận",
        danger: false,
        onExecute: null
      });
    }
  };

  const handleOpen360Modal = (emp) => {
    setDetailEmp(emp);
    setDetailForm({
      ho_ten: emp.ho_ten || "",
      chuc_danh: emp.chuc_danh || "",
      department: emp.department || "Khối Công trình",
      phone: emp.phone || emp.dien_thoai || "",
      dien_thoai: emp.phone || emp.dien_thoai || "",
      login_username: emp.login_username || emp.phone || emp.ma_nv || "",
      email: emp.email || "",
      role: emp.role || "worker",
      shift_type: emp.shift_type || "FULL_DAY",
      annual_leave_quota: Number(emp.annual_leave_quota ?? 12),
      luong_cb: Number(emp.luong_cb) || 0,
      phu_cap_an_trua: Number(emp.phu_cap_an_trua) || 0,
      phu_cap_xang_xe: Number(emp.phu_cap_xang_xe) || 0,
      phu_cap_nha_o: Number(emp.phu_cap_nha_o) || 0,
      has_insurance: Boolean(emp.has_insurance),
      custom_start_time: emp.custom_start_time || "",
      custom_end_time: emp.custom_end_time || "",
      keep_logs: Boolean(emp.keep_logs),
      new_password: ""
    });
  };

  useEffect(() => {
    if (!focusTarget?.ts || focusTarget.ts === lastFocusTsRef.current) return;
    if (focusTarget.subTab !== "employees" && focusTarget.category !== "device") return;
    if (focusTarget.category === "device") {
      setQuickFilter("alerts");
    }
    if (focusTarget.ma_nv) {
      setSearchQuery(focusTarget.ma_nv);
      const matched = employees.find((e) => e.ma_nv === focusTarget.ma_nv);
      if (matched) {
        lastFocusTsRef.current = focusTarget.ts;
        handleOpen360Modal(matched);
      } else if (!loading && employees.length > 0) {
        lastFocusTsRef.current = focusTarget.ts;
      }
    } else {
      lastFocusTsRef.current = focusTarget.ts;
    }
  }, [focusTarget, employees, loading]);

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setFormError("");
    const targetMaNv = String(form.ma_nv || "").trim().toUpperCase();
    const cleanPhone = String(form.phone || form.dien_thoai || "").trim();
    const cleanLoginUser = String(form.login_username || "").trim() || cleanPhone || targetMaNv;
    const cleanName = String(form.ho_ten || "").trim();
    const cleanTitle = String(form.chuc_danh || "").trim();
    if (!targetMaNv && !cleanPhone) {
      setFormError("Vui lòng nhập Mã nhân viên hoặc Số điện thoại!");
      return;
    }
    if (!cleanName) {
      setFormError("Vui lòng nhập Họ và tên nhân viên!");
      return;
    }
    if (!cleanTitle) {
      setFormError("Vui lòng nhập Chức danh công việc!");
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const isTargetAdmin = form.role === "admin";
      const targetShift = isTargetAdmin ? "FULL_DAY" : (form.shift_type || "FULL_DAY");
      const res = await safePost("/employees", {
        ...form,
        luong_cb: isTargetAdmin ? 0 : form.luong_cb,
        has_insurance: isTargetAdmin ? false : form.has_insurance,
        ma_nv: targetMaNv,
        phone: cleanPhone || null,
        dien_thoai: cleanPhone || "",
        login_username: cleanLoginUser || null,
        password: String(form.password || "").trim() || undefined,
        ho_ten: cleanName,
        chuc_danh: cleanTitle,
        custom_start_time: isTargetAdmin ? null : (form.custom_start_time || null),
        custom_end_time: isTargetAdmin ? null : (form.custom_end_time || null)
      });
      if (res?.success) {
        const finalId = res.ma_nv || targetMaNv;
        if (!isTargetAdmin && (targetShift !== "FULL_DAY" || form.custom_start_time || form.custom_end_time)) {
          await safePut(`/employees/${finalId}/shift`, {
            shift_type: targetShift,
            custom_start_time: form.custom_start_time || null,
            custom_end_time: form.custom_end_time || null
          }).catch(() => {});
        }
        if (showToast) {
          showToast(
            `Thêm nhân viên ${cleanName} (${finalId}) thành công! Tài khoản đăng nhập: ${res.login_username || cleanLoginUser}`,
            "success"
          );
        }
        setIsAddModalOpen(false);
        if (res.one_time_password) {
          setCreatedCreds({
            ma_nv: finalId,
            login_username: res.login_username || cleanLoginUser,
            ho_ten: cleanName,
            password: res.one_time_password
          });
        }
        setForm({
          ma_nv: "",
          ho_ten: "",
          chuc_danh: "",
          department: "Khối Công trình",
          phone: "",
          dien_thoai: "",
          login_username: "",
          password: "123456",
          email: "",
          role: "worker",
          shift_type: "FULL_DAY",
          custom_start_time: "",
          custom_end_time: "",
          luong_cb: 8000000,
          has_insurance: true
        });
        fetchEmployees();
      } else {
        const msg = res?.message || "Không thể tạo mới nhân viên.";
        setFormError(msg);
        if (showToast) showToast(msg, "error");
      }
    } catch (err) {
      const msg = err?.data?.message || err.message || "Lỗi tạo mới nhân sự.";
      setFormError(msg);
      if (showToast) showToast(msg, "error");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSaveDetailModal = async (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (!detailEmp || !detailForm || savingDetail) return;
    if (!String(detailForm.ho_ten || "").trim()) {
      if (showToast) showToast("Vui lòng nhập họ và tên nhân viên!", "error");
      return;
    }
    setSavingDetail(true);
    try {
      const cleanDetailPhone = String(detailForm.phone ?? detailForm.dien_thoai ?? "").trim();
      const cleanDetailUser = String(detailForm.login_username || "").trim();
      const payload = {
        ho_ten: String(detailForm.ho_ten || "").trim(),
        chuc_danh: detailForm.chuc_danh,
        department: detailForm.department,
        phone: cleanDetailPhone,
        dien_thoai: cleanDetailPhone,
        login_username: cleanDetailUser || cleanDetailPhone || detailEmp.ma_nv,
        email: detailForm.email,
        shift_type: detailForm.shift_type,
        annual_leave_quota: Number(detailForm.annual_leave_quota) || 12,
        luong_cb: Number(detailForm.luong_cb) || 0,
        phu_cap_an_trua: Number(detailForm.phu_cap_an_trua) || 0,
        phu_cap_xang_xe: Number(detailForm.phu_cap_xang_xe) || 0,
        phu_cap_nha_o: Number(detailForm.phu_cap_nha_o) || 0,
        has_insurance: Boolean(detailForm.has_insurance),
        custom_start_time: detailForm.custom_start_time || null,
        custom_end_time: detailForm.custom_end_time || null
      };
      if (isAdmin && detailEmp.role !== "admin" && ["worker", "accountant"].includes(detailForm.role)) {
        payload.role = detailForm.role;
      }
      if (isAdmin) {
        payload.keep_logs = Boolean(detailForm.keep_logs);
        if (detailForm.new_password && String(detailForm.new_password).trim().length > 0) {
          payload.new_password = String(detailForm.new_password).trim();
        }
      }

      const res = await safePut(`/employees/${detailEmp.ma_nv}`, payload);
      if (res?.success) {
        if (showToast) showToast(`Đã cập nhật hồ sơ 360° cho ${detailForm.ho_ten}!`, "success");
        setDetailEmp(null);
        setDetailForm(null);
        fetchEmployees();
        if (onRefreshAlerts) onRefreshAlerts();
      } else {
        if (showToast) showToast(res?.message || "Không thể cập nhật hồ sơ nhân viên.", "error");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi cập nhật hồ sơ nhân viên.", "error");
    } finally {
      setSavingDetail(false);
    }
  };

  const handleToggleLock = (emp) => {
    const isCurrentlyLocked = Boolean(emp.is_locked || emp.status === "inactive");
    const nextStatus = isCurrentlyLocked ? "active" : "inactive";
    const nextLocked = !isCurrentlyLocked;

    setConfirmAction({
      open: true,
      title: isCurrentlyLocked ? "Mở khóa tài khoản" : "Tạm khóa tài khoản",
      message: `Bạn có chắc chắn muốn ${isCurrentlyLocked ? "mở khóa" : "tạm khóa"} tài khoản ${emp.ma_nv} (${emp.ho_ten})?`,
      confirmLabel: isCurrentlyLocked ? "Mở khóa" : "Tạm khóa",
      danger: !isCurrentlyLocked,
      onExecute: async () => {
        try {
          const res = await safePut(`/employees/${emp.ma_nv}/status`, {
            status: nextStatus,
            is_locked: nextLocked ? 1 : 0
          });
          if (res?.success) {
            if (showToast) showToast(`Đã ${isCurrentlyLocked ? "mở khóa" : "tạm khóa"} tài khoản ${emp.ma_nv}!`, "success");
            fetchEmployees();
          } else {
            if (showToast) showToast(res?.message || "Không thể thay đổi trạng thái tài khoản.", "error");
          }
        } catch (err) {
          if (showToast) showToast(err.message || "Lỗi cập nhật trạng thái tài khoản.", "error");
        }
      }
    });
  };

  const handleResolveDevices = async (emp, action, targetDevice = null) => {
    if (!emp || resolvingDevice) return;
    setResolvingDevice(true);
    try {
      const res = await safePost(`/employees/${emp.ma_nv}/resolve-devices`, {
        action,
        target_device_id: targetDevice?.device_id || emp.bound_device_id || undefined,
        target_device_name: targetDevice?.device_name || emp.bound_device_name || undefined
      });
      if (res?.success) {
        if (showToast) showToast(res.message || "Đã cập nhật khóa thiết bị thành công!", "success");
        await fetchEmployees();
        if (onRefreshAlerts) onRefreshAlerts();
      } else {
        if (showToast) showToast(res?.message || "Không thể xử lý thiết bị.", "error");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi kết nối xử lý thiết bị.", "error");
    } finally {
      setResolvingDevice(false);
    }
  };

  const handlePendingDeviceDecision = async (emp, decision) => {
    if (!emp || resolvingDevice) return;
    setResolvingDevice(true);
    try {
      const endpoint = decision === "approve"
        ? `/employees/${emp.ma_nv}/approve-device-change`
        : `/employees/${emp.ma_nv}/reject-device-change`;
      const res = await safePost(endpoint, {});
      if (res?.success) {
        if (showToast) showToast(res.message || "Đã xử lý yêu cầu đổi thiết bị!", "success");
        await fetchEmployees();
        if (onRefreshAlerts) onRefreshAlerts();
      } else {
        if (showToast) showToast(res?.message || "Không thể xử lý yêu cầu đổi thiết bị.", "error");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi xử lý yêu cầu đổi thiết bị.", "error");
    } finally {
      setResolvingDevice(false);
    }
  };

  const handleBatchForcePassword = () => {
    setConfirmAction({
      open: true,
      title: "Yêu cầu đổi mật khẩu hàng loạt",
      message: "Kích hoạt cờ yêu cầu đổi mật khẩu ở lần đăng nhập tiếp theo cho toàn bộ nhân viên?",
      confirmLabel: "Kích hoạt",
      danger: true,
      onExecute: async () => {
        try {
          const res = await safePost("/employees/staged-force-password", { stage: "all", limit: 500 });
          if (res?.success) {
            if (showToast) showToast("Đã kích hoạt đổi mật khẩu cho toàn bộ nhân viên!", "success");
            fetchEmployees();
          } else {
            if (showToast) showToast(res?.message || "Lỗi kích hoạt đổi mật khẩu.", "error");
          }
        } catch (err) {
          if (showToast) showToast(err.message || "Lỗi máy chủ.", "error");
        }
      }
    });
  };

  const availableDepartments = Array.from(
    new Set([
      ...DEPARTMENT_OPTIONS,
      ...employees.map((e) => e.department).filter(Boolean)
    ])
  );

  // Thống kê nhanh 4 nhóm + Trạng thái Điểm Danh Hôm Nay (Độc quyền tại Khu vực 1 Trung tâm Nhân sự)
  const totalCount = employees.length;
  const activeCount = employees.filter((e) => !e.is_locked && e.status !== "inactive").length;
  const lockedCount = employees.filter((e) => Boolean(e.is_locked || e.status === "inactive")).length;
  const alertEmployees = employees.filter((e) => getEmployeeDeviceSummary(e).hasAnyAlert);
  const alertCount = alertEmployees.length;

  const headcountToday = alertsSummary?.headcount_today || null;
  const liveBoard = headcountToday?.live_board || {};
  const presentSet = new Set((liveBoard.present_list || []).map((x) => x.ma_nv));
  const lateSet = new Set((liveBoard.late_list || []).map((x) => x.ma_nv));
  const fieldSet = new Set((liveBoard.field_work_list || []).map((x) => x.ma_nv));
  const leaveSet = new Set((liveBoard.leave_list || []).map((x) => x.ma_nv));
  const absentSet = new Set((liveBoard.absent_list || []).map((x) => x.ma_nv));

  const getEmployeeTodayBadge = (maNv) => {
    if (fieldSet.has(maNv)) return { label: "🚧 Công trình", cls: "bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/40" };
    if (lateSet.has(maNv)) return { label: "🟡 Đi muộn", cls: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/40" };
    if (presentSet.has(maNv)) return { label: "🟢 Có mặt", cls: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40" };
    if (leaveSet.has(maNv)) return { label: "🟣 Nghỉ phép", cls: "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/40" };
    if (absentSet.has(maNv)) return { label: "⚪ Chưa chấm", cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600" };
    return null;
  };

  const filtered = employees.filter((e) => {
    const isLocked = Boolean(e.is_locked || e.status === "inactive");
    const devSummary = getEmployeeDeviceSummary(e);
    if (quickFilter === "active" && isLocked) return false;
    if (quickFilter === "locked" && !isLocked) return false;
    if (quickFilter === "alerts" && !devSummary.hasAnyAlert) return false;

    if (todayFilter === "present" && !presentSet.has(e.ma_nv)) return false;
    if (todayFilter === "late" && !lateSet.has(e.ma_nv)) return false;
    if (todayFilter === "field_work" && !fieldSet.has(e.ma_nv)) return false;
    if (todayFilter === "leave" && !leaveSet.has(e.ma_nv)) return false;
    if (todayFilter === "absent" && !absentSet.has(e.ma_nv)) return false;

    const empDept = e.department || "Khối Công trình";
    if (selectedDepartment !== "ALL" && empDept !== selectedDepartment) return false;

    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(e.ma_nv || "").toLowerCase().includes(q) ||
      String(e.login_username || "").toLowerCase().includes(q) ||
      String(e.phone || e.dien_thoai || "").toLowerCase().includes(q) ||
      String(e.ho_ten || "").toLowerCase().includes(q) ||
      String(e.chuc_danh || "").toLowerCase().includes(q) ||
      String(e.department || "").toLowerCase().includes(q) ||
      String(e.bound_device_name || "").toLowerCase().includes(q)
    );
  });

  const detailDevSummary = detailEmp ? getEmployeeDeviceSummary(detailEmp) : null;

  return (
    <div className="space-y-4 pb-8">
      {/* STITCH ADMIN SCREEN 1 — SECTION 1: EXECUTIVE HEADER & 6-TILE HEADCOUNT KPI GRID */}
      <div
        data-testid="employee-hub-headcount-bar"
        className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-[#111C2D] dark:text-white tracking-tight">
                Nhân sự &amp; Thiết bị 360° {headcountToday?.date ? `(${headcountToday.date})` : ""}
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-700 text-[#16A34A] dark:text-emerald-300 text-xs font-extrabold">
                <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
                <span>Trực tiếp</span>
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
              Hệ thống giám sát định danh ca trực công xưởng • Knox 1:1
            </p>
          </div>
          {typeof onOpenLiveBoard === "function" && (
            <button
              type="button"
              onClick={() => onOpenLiveBoard(todayFilter === "all" ? "present" : todayFilter)}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#F0F3FF] hover:bg-rose-50 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 border border-slate-200 dark:border-rose-500/40 text-[#E11D48] dark:text-rose-200 text-xs font-extrabold cursor-pointer transition"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span>Xem bảng live chi tiết</span>
            </button>
          )}
        </div>

        <div className="px-3 py-2 rounded-xl bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-extrabold text-[#111C2D] dark:text-white">
            ⚡ Sĩ số trực tiếp ca sản xuất hôm nay
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[#B80035] dark:text-rose-300 font-extrabold">
            {headcountToday?.total_employees ?? totalCount} nhân sự
          </span>
        </div>

        {/* 6-Tile Headcount KPI Grid (Stitch Screen 9) */}
        {headcountToday && (
          <div
            data-filter-group="headcount-today-filter"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-semibold"
          >
            <button
              type="button"
              data-active={todayFilter === "all" ? "true" : "false"}
              onClick={() => setTodayFilter("all")}
              className={`min-h-[56px] p-2.5 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition ${
                todayFilter === "all"
                  ? "bg-[#E11D48] text-white border-[#BE123C] dark:bg-rose-600 dark:text-white dark:border-rose-400 shadow-sm"
                  : "bg-[#F0F3FF] hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-[#111C2D] dark:text-slate-200"
              }`}
            >
              <span className="text-xs font-bold opacity-90">👥 Quân số:</span>
              <strong className="text-base font-black font-mono">{headcountToday.total_employees}</strong>
            </button>
            <button
              type="button"
              data-active={todayFilter === "present" ? "true" : "false"}
              onClick={() => setTodayFilter((p) => (p === "present" ? "all" : "present"))}
              className={`min-h-[56px] p-2.5 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition ${
                todayFilter === "present"
                  ? "bg-emerald-600 text-white border-emerald-500 dark:bg-emerald-600 dark:text-white dark:border-emerald-400 shadow-sm"
                  : "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/80 border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
              }`}
            >
              <span className="text-xs font-bold">🟢 Có mặt:</span>
              <strong className="text-base font-black font-mono">{headcountToday.present}</strong>
            </button>
            <button
              type="button"
              data-active={todayFilter === "field_work" ? "true" : "false"}
              onClick={() => setTodayFilter((p) => (p === "field_work" ? "all" : "field_work"))}
              className={`min-h-[56px] p-2.5 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition ${
                todayFilter === "field_work"
                  ? "bg-orange-600 text-white border-orange-500 dark:bg-orange-600 dark:text-white dark:border-orange-400 shadow-sm"
                  : "bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/70 dark:hover:bg-orange-900/80 border-orange-200 dark:border-orange-500/40 text-orange-800 dark:text-orange-300"
              }`}
            >
              <span className="text-xs font-bold">🚧 Công trình:</span>
              <strong className="text-base font-black font-mono">{headcountToday.field_work}</strong>
            </button>
            <button
              type="button"
              data-active={todayFilter === "late" ? "true" : "false"}
              onClick={() => setTodayFilter((p) => (p === "late" ? "all" : "late"))}
              className={`min-h-[56px] p-2.5 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition ${
                todayFilter === "late"
                  ? "bg-amber-500 text-slate-950 border-amber-400 dark:bg-amber-500 dark:text-slate-950 dark:border-amber-300 shadow-sm"
                  : "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/70 dark:hover:bg-amber-900/80 border-amber-200 dark:border-amber-500/40 text-amber-800 dark:text-amber-300"
              }`}
            >
              <span className="text-xs font-bold">🟡 Đi muộn:</span>
              <strong className="text-base font-black font-mono">{headcountToday.late}</strong>
            </button>
            <button
              type="button"
              data-active={todayFilter === "leave" ? "true" : "false"}
              onClick={() => setTodayFilter((p) => (p === "leave" ? "all" : "leave"))}
              className={`min-h-[56px] p-2.5 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition ${
                todayFilter === "leave"
                  ? "bg-purple-600 text-white border-purple-500 dark:bg-purple-600 dark:text-white dark:border-purple-400 shadow-sm"
                  : "bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/70 dark:hover:bg-purple-900/80 border-purple-200 dark:border-purple-500/40 text-purple-800 dark:text-purple-300"
              }`}
            >
              <span className="text-xs font-bold">🟣 Nghỉ phép:</span>
              <strong className="text-base font-black font-mono">{headcountToday.leave}</strong>
            </button>
            {Array.isArray(liveBoard?.absent_list) && (
              <button
                type="button"
                data-active={todayFilter === "absent" ? "true" : "false"}
                onClick={() => setTodayFilter((p) => (p === "absent" ? "all" : "absent"))}
                className={`min-h-[56px] p-2.5 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition ${
                  todayFilter === "absent"
                    ? "bg-rose-600 text-white border-rose-500 dark:bg-rose-600 dark:text-white dark:border-rose-400 shadow-sm"
                    : "bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/70 dark:hover:bg-rose-900/80 border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300"
                }`}
              >
                <span className="text-xs font-bold">⚪ Chưa chấm:</span>
                <strong className="text-base font-black font-mono">{liveBoard.absent_list.length}</strong>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 4 Thẻ Lọc Nhanh Trạng Thái Tài Khoản & Thiết Bị — ZaUI Squircle KPI Tiles */}
      <div
        data-filter-group="employee-quick-filter"
        className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
      >
        <button
          type="button"
          data-active={quickFilter === "all" ? "true" : "false"}
          onClick={() => setQuickFilter("all")}
          className={`min-h-[64px] p-3.5 rounded-2xl border text-left transition cursor-pointer shadow-[0_4px_16px_-2px_rgba(15,23,42,0.05)] ${
            quickFilter === "all"
              ? "bg-[#E11D48] text-white border-[#BE123C] dark:bg-rose-600 dark:text-white dark:border-rose-400 shadow-md"
              : "bg-white dark:bg-slate-900 border-slate-100/90 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <div className="text-xs font-semibold opacity-95">👥 Tất cả nhân sự</div>
          <div className="text-xl font-black mt-0.5">{totalCount}</div>
        </button>

        <button
          type="button"
          data-active={quickFilter === "active" ? "true" : "false"}
          onClick={() => setQuickFilter("active")}
          className={`min-h-[64px] p-3.5 rounded-2xl border text-left transition cursor-pointer shadow-[0_4px_16px_-2px_rgba(15,23,42,0.05)] ${
            quickFilter === "active"
              ? "bg-emerald-600 text-white border-emerald-500 dark:bg-emerald-600 dark:text-white dark:border-emerald-400 shadow-md"
              : "bg-white dark:bg-slate-900 border-slate-100/90 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <div className={`text-xs font-semibold ${quickFilter === "active" ? "text-emerald-50" : "text-emerald-700 dark:text-emerald-300"}`}>🟢 Đang làm việc</div>
          <div className="text-xl font-black mt-0.5">{activeCount}</div>
        </button>

        <button
          type="button"
          data-active={quickFilter === "alerts" ? "true" : "false"}
          onClick={() => setQuickFilter("alerts")}
          className={`min-h-[64px] p-3.5 rounded-2xl border text-left transition cursor-pointer shadow-[0_4px_16px_-2px_rgba(15,23,42,0.05)] ${
            quickFilter === "alerts"
              ? "bg-rose-600 text-white border-rose-500 dark:bg-rose-600 dark:text-white dark:border-rose-400 shadow-md"
              : alertCount > 0
              ? "bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-500/50 text-rose-800 dark:text-rose-100 hover:bg-rose-100 dark:hover:bg-rose-950/80"
              : "bg-white dark:bg-slate-900 border-slate-100/90 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <div className={`text-xs font-semibold ${quickFilter === "alerts" ? "text-rose-50" : "text-rose-700 dark:text-rose-300"}`}>🚨 Đa thiết bị / Đổi máy</div>
          <div className="text-xl font-black mt-0.5">{alertCount}</div>
        </button>

        <button
          type="button"
          data-active={quickFilter === "locked" ? "true" : "false"}
          onClick={() => setQuickFilter("locked")}
          className={`min-h-[64px] p-3.5 rounded-2xl border text-left transition cursor-pointer shadow-[0_4px_16px_-2px_rgba(15,23,42,0.05)] ${
            quickFilter === "locked"
              ? "bg-amber-500 text-slate-950 border-amber-400 dark:bg-amber-500 dark:text-slate-950 dark:border-amber-300 shadow-md"
              : "bg-white dark:bg-slate-900 border-slate-100/90 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <div className={`text-xs font-semibold ${quickFilter === "locked" ? "text-slate-950" : "text-amber-700 dark:text-amber-300"}`}>🔒 Đang khóa</div>
          <div className="text-xl font-black mt-0.5">{lockedCount}</div>
        </button>
      </div>

      {/* 2. Thanh Công Cụ Tìm Kiếm, Lọc Bộ Phận & Thao Tác */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm dark:shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold leading-snug text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-[#E11D48] dark:text-rose-400 shrink-0" />
              <span>Trung tâm Nhân sự &amp; Thiết bị 360°</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              Đang hiển thị <strong className="text-slate-900 dark:text-white">{filtered.length}</strong> / {totalCount} nhân sự
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <AppButton
                variant="ghost"
                icon={Key}
                onClick={handleBatchForcePassword}
                className="bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-200 text-xs px-3 py-2"
              >
                Yêu cầu đổi MK
              </AppButton>
            )}
            {canEditEmployees && (
              <AppButton
                variant="primary"
                icon={Plus}
                onClick={() => {
                  setFormError("");
                  setIsAddModalOpen(true);
                }}
                className="text-xs px-3.5 py-2 shadow-lg shadow-rose-600/25"
              >
                Thêm nhân viên
              </AppButton>
            )}
            <AppButton
              variant="secondary"
              icon={RefreshCw}
              loading={loading}
              onClick={fetchEmployees}
              aria-label="Làm mới"
              className="min-w-[44px] px-3 py-2"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm SĐT, tài khoản, tên, mã NV, bộ phận, tên máy..."
              className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
            />
          </div>

          <select
            aria-label="Lọc theo bộ phận"
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
          >
            <option value="ALL">🏢 Tất cả bộ phận</option>
            {availableDepartments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. Danh Sách Nhân Viên Tối Giản (V35 Minimalist Directory) */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <SkeletonList rows={4} label="Đang tải danh sách nhân sự..." />
        </div>
      ) : error ? (
        <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 rounded-2xl p-6 text-center text-rose-700 dark:text-rose-200 text-sm flex items-center justify-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <EmptyState icon={Users} title="Không tìm thấy nhân viên nào khớp với bộ lọc." />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((emp) => {
            const empInitial =
              String(emp.ho_ten || emp.ma_nv || "N")
                .trim()
                .split(/\s+/)
                .slice(-1)[0]?.[0]
                ?.toUpperCase() || "N";

            return (
              <div
                key={emp.ma_nv}
                data-testid={`employee-row-${emp.ma_nv}`}
                className="perf-list-item bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-500/40 rounded-2xl px-4 py-3 shadow-sm transition flex items-center justify-between gap-3"
              >
                {/* Bên trái: Avatar tròn + Họ và tên in đậm + Mã NV nhỏ gọn */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-full bg-[#FFE4E6] dark:bg-rose-500/20 border border-rose-200/80 dark:border-rose-500/40 text-[#E11D48] dark:text-rose-300 font-extrabold text-sm flex items-center justify-center shrink-0">
                    {empInitial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-base text-[#111C2D] dark:text-white truncate leading-snug">
                      {emp.ho_ten}
                    </div>
                    <div className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {emp.ma_nv}
                    </div>
                  </div>
                </div>

                {/* Bên phải: Nút icon Con Mắt (44x44px, rounded-xl) mở Modal Chi tiết Nhân viên */}
                <button
                  type="button"
                  onClick={() => handleOpen360Modal(emp)}
                  aria-label="Xem chi tiết nhân viên"
                  title="Xem chi tiết nhân viên"
                  data-testid={`employee-eye-btn-${emp.ma_nv}`}
                  className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-[#F0F3FF] hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-500/20 border border-slate-200/80 dark:border-slate-700 text-[#111C2D] hover:text-[#E11D48] dark:text-slate-200 dark:hover:text-rose-300 flex items-center justify-center transition cursor-pointer shrink-0"
                >
                  <Eye className="w-5 h-5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* STITCH ADMIN SCREEN 1 — SEDINCO KNOX SECURITY GUARD V2.4.12 FOOTER CARD */}
      <div className="bg-[#F0F3FF] dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center text-[#B80035] dark:text-rose-400 shadow-xs shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="font-extrabold text-[#111C2D] dark:text-white text-sm">
              Sedinco Knox Security Guard v2.4.12
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Khóa cứng IMEI phần cứng • Chống giả lập GPS • Mã hóa định danh thiết bị 1:1
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-700 font-extrabold text-[#16A34A] dark:text-emerald-300 shrink-0 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
          <span>Cụm máy chủ Sedinco: Sẵn sàng ({totalCount} hồ sơ)</span>
        </span>
      </div>

      <ConfirmDialog
        open={confirmAction.open}
        title={confirmAction.title}
        message={confirmAction.message}
        confirmLabel={confirmAction.confirmLabel}
        variant={confirmAction.danger ? "danger" : "primary"}
        loading={confirmLoading}
        onCancel={() => {
          if (!confirmLoading) {
            setConfirmAction({
              open: false,
              title: "",
              message: "",
              confirmLabel: "Xác nhận",
              danger: false,
              onExecute: null
            });
          }
        }}
        onConfirm={executeConfirmedAction}
      />

      {/* Modal Tài Khoản Mới Tạo (Mật khẩu tạm 1 lần) */}
      <AppModal
        open={Boolean(createdCreds)}
        onClose={() => setCreatedCreds(null)}
        maxWidthClass="max-w-sm"
        title="Tài khoản mới tạo"
        closeLabel="Đóng / Quay lại"
      >
        {createdCreds && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              Đã tạo tài khoản cho <strong>{createdCreds.ho_ten}</strong> (TK: <strong>{createdCreds.login_username || createdCreds.ma_nv}</strong> • Mã: {createdCreds.ma_nv}). Vui lòng gửi mật khẩu tạm thời bên dưới cho nhân viên:
            </p>
            <div className="p-3 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl flex items-center justify-between gap-2">
              <code className="text-base font-mono font-bold text-emerald-700 dark:text-emerald-400 break-all">{createdCreds.password}</code>
              <AppButton
                variant="secondary"
                icon={Copy}
                onClick={() => {
                  navigator.clipboard?.writeText(createdCreds.password);
                  if (showToast) showToast("Đã sao chép mật khẩu tạm thời!", "success");
                }}
                className="text-xs px-3 py-1.5"
              >
                Sao chép
              </AppButton>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              Nhân viên sẽ được yêu cầu đổi mật khẩu mới ngay khi đăng nhập lần đầu.
            </p>
          </div>
        )}
      </AppModal>

      {/* Modal Thêm Nhân Viên Mới */}
      <AppModal
        open={isAddModalOpen}
        onClose={() => !isSubmitting && setIsAddModalOpen(false)}
        disableClose={isSubmitting}
        maxWidthClass="max-w-md"
        title="Thêm nhân viên mới"
        icon={<Plus className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />}
        footer={
          <div className="flex gap-2.5">
            <AppButton
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => setIsAddModalOpen(false)}
              className="flex-1"
            >
              Đóng / Quay lại
            </AppButton>
            <AppButton
              type="submit"
              form="add-employee-form"
              variant="primary"
              loading={isSubmitting}
              loadingText="Đang lưu..."
              className="flex-1 shadow-lg shadow-rose-600/30"
            >
              Lưu nhân viên
            </AppButton>
          </div>
        }
      >
        <form id="add-employee-form" onSubmit={handleAddEmployee} className="p-5 space-y-3">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-200 text-sm leading-snug">
              {formError}
            </div>
          )}

          <div className="p-3 rounded-2xl bg-[#F0F3FF] dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 space-y-3">
            <div className="text-xs font-black uppercase tracking-wide text-[#E11D48] dark:text-rose-300">
              Tài khoản đăng nhập mặc định (Số điện thoại)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Số điện thoại (Tài khoản mặc định)
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => {
                    const nextPhone = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      phone: nextPhone,
                      dien_thoai: nextPhone
                    }));
                  }}
                  placeholder="VD: 0905123456"
                  className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Tài khoản tùy chỉnh (nếu khác SĐT)
                </label>
                <input
                  type="text"
                  value={form.login_username}
                  onChange={(e) => setForm({ ...form, login_username: e.target.value })}
                  placeholder={form.phone ? form.phone : "Mặc định lấy SĐT hoặc Mã NV"}
                  className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Mật khẩu khởi tạo (Mặc định: 123456)
              </label>
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="123456 (bỏ trống để tự sinh ngẫu nhiên)"
                className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Mã nhân viên</label>
              <input
                type="text"
                value={form.ma_nv}
                onChange={(e) => setForm({ ...form, ma_nv: e.target.value.toUpperCase() })}
                placeholder="VD: NV025"
                className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 uppercase focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Họ và tên</label>
              <input
                type="text"
                required
                value={form.ho_ten}
                onChange={(e) => setForm({ ...form, ho_ten: e.target.value })}
                placeholder="Nguyễn Văn A"
                className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Chức danh</label>
              <input
                type="text"
                required
                value={form.chuc_danh}
                onChange={(e) => setForm({ ...form, chuc_danh: e.target.value })}
                placeholder="Kỹ thuật / Nhân viên kho"
                className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Khối / Bộ phận</label>
              <select
                value={form.department || "Khối Công trình"}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
              >
                {DEPARTMENT_OPTIONS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Vai trò</label>
              <select
                value={form.role}
                onChange={(e) => {
                  const r = e.target.value;
                  setForm({
                    ...form,
                    role: r,
                    ...(r === "admin" ? { luong_cb: 0, has_insurance: false } : {})
                  });
                }}
                className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
              >
                <option value="worker">Nhân viên</option>
                <option value="accountant">Kế toán</option>
                <option value="admin">Quản trị viên (Chỉ điều hành)</option>
              </select>
            </div>
            {form.role !== "admin" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Lương cơ bản (đ)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={formatViNumber(form.luong_cb || 0, 0)}
                  onChange={(e) => setForm({ ...form, luong_cb: Math.max(0, Math.round(parseViNumberInput(e.target.value))) })}
                  className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                />
              </div>
            )}
          </div>

          {form.role !== "admin" && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Ca làm việc mặc định</label>
              <select
                value={form.shift_type || "FULL_DAY"}
                onChange={(e) => setForm({ ...form, shift_type: e.target.value })}
                className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
              >
                {SHIFT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form>
      </AppModal>

      {/* 4. MODAL CHI TIẾT NHÂN VIÊN (KHI BẤM ICON CON MẮT 👁️) */}
      <AppModal
        open={Boolean(detailEmp && detailForm)}
        onClose={() => {
          if (!savingDetail && !resolvingDevice) {
            setDetailEmp(null);
            setDetailForm(null);
          }
        }}
        disableClose={savingDetail || resolvingDevice}
        maxWidthClass="max-w-2xl"
        maxHeightClass="max-h-[92vh]"
        title="Chi tiết Nhân viên"
        subtitle={detailEmp ? `${detailEmp.ho_ten} (${detailEmp.ma_nv})` : ""}
        icon={<Eye className="w-5 h-5 text-[#E11D48] dark:text-rose-400 shrink-0" />}
        footer={
          <div className="flex gap-2.5">
            <AppButton
              variant="secondary"
              disabled={savingDetail || resolvingDevice}
              onClick={() => {
                setDetailEmp(null);
                setDetailForm(null);
              }}
              className="flex-1"
            >
              Đóng / Quay lại
            </AppButton>
            {canEditEmployees && (
              <AppButton
                type="submit"
                form="edit-employee-360-form"
                variant="primary"
                loading={savingDetail}
                loadingText="Đang lưu..."
                className="flex-1 shadow-lg shadow-rose-600/30"
              >
                Lưu thay đổi
              </AppButton>
            )}
          </div>
        }
      >
        {detailEmp && detailForm && detailDevSummary && (() => {
          const isDetailLocked = Boolean(detailEmp.is_locked || detailEmp.status === "inactive");
          const detailTodayBadge = getEmployeeTodayBadge(detailEmp.ma_nv) || {
            label: "⚪ Chưa chấm công",
            cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600"
          };
          const detailDisplayPhone = detailForm.phone || detailEmp.phone || detailEmp.dien_thoai || "";
          const detailDisplayLogin = detailForm.login_username || detailDisplayPhone || detailEmp.ma_nv;

          return (
            <form
              id="edit-employee-360-form"
              onSubmit={handleSaveDetailModal}
              className="p-4 sm:p-5 space-y-4"
            >
              {/* NHÓM 1 — TRẠNG THÁI HIỆN TẠI */}
              <section className="space-y-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-[#E11D48] dark:text-rose-300 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>1. Trạng thái hiện tại</span>
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/35 text-indigo-700 dark:text-indigo-200 text-xs font-bold">
                    {ROLE_LABELS[detailForm.role || detailEmp.role] || "Nhân viên"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Trạng thái tài khoản
                    </span>
                    <StatusBadge type="employee" status={isDetailLocked ? "locked" : "active"} />
                  </div>

                  <div className="p-3 rounded-xl bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Điểm danh hôm nay
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full border text-xs font-bold ${detailTodayBadge.cls}`}>
                      {detailTodayBadge.label}
                    </span>
                  </div>
                </div>

                {isAdmin && detailEmp.role !== "admin" && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(detailForm.keep_logs)}
                        onChange={(e) => setDetailForm((p) => ({ ...p, keep_logs: e.target.checked }))}
                        className="w-4 h-4 rounded accent-[#E11D48] text-[#E11D48]"
                      />
                      <span>Lưu giữ nhật ký hoạt động của nhân viên</span>
                    </label>
                    <AppButton
                      variant="secondary"
                      icon={isDetailLocked ? Unlock : Lock}
                      onClick={() => handleToggleLock(detailEmp)}
                      className={`text-xs px-3 py-1.5 ${
                        isDetailLocked
                          ? "!border-emerald-500/50 !text-emerald-700 dark:!text-emerald-300"
                          : "!border-rose-500/50 !text-rose-700 dark:!text-rose-300"
                      }`}
                    >
                      {isDetailLocked ? "Mở khóa tài khoản" : "Tạm khóa tài khoản"}
                    </AppButton>
                  </div>
                )}
              </section>

              {/* NHÓM 2 — CÔNG VIỆC & CA LÀM */}
              <section className="space-y-3 bg-[#F0F3FF]/60 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-4 h-4 shrink-0" />
                    <span>2. Công việc &amp; Ca làm</span>
                  </h3>
                  {detailEmp.role !== "admin" && (
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      🕒 {getShiftWindowText({ ...detailEmp, ...detailForm })}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Họ và tên</label>
                    <input
                      type="text"
                      required
                      disabled={!canEditEmployees}
                      value={detailForm.ho_ten}
                      onChange={(e) => setDetailForm((p) => ({ ...p, ho_ten: e.target.value }))}
                      className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-900/90 disabled:text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Chức vụ</label>
                    <input
                      type="text"
                      disabled={!canEditEmployees}
                      value={detailForm.chuc_danh}
                      onChange={(e) => setDetailForm((p) => ({ ...p, chuc_danh: e.target.value }))}
                      className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-900/90 disabled:text-slate-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Khối / Bộ phận</label>
                    <select
                      disabled={!canEditEmployees}
                      value={detailForm.department}
                      onChange={(e) => setDetailForm((p) => ({ ...p, department: e.target.value }))}
                      className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-900/90 disabled:text-slate-500"
                    >
                      {availableDepartments.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isAdmin && detailEmp.role !== "admin" && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Vai trò phân quyền</label>
                      <select
                        value={detailForm.role || "worker"}
                        onChange={(e) => setDetailForm((p) => ({ ...p, role: e.target.value }))}
                        className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base text-slate-900 dark:text-white"
                      >
                        <option value="worker">Nhân viên</option>
                        <option value="accountant">Kế toán</option>
                      </select>
                    </div>
                  )}
                </div>

                {detailEmp.role !== "admin" && (
                  <>
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Ca làm việc chuẩn</label>
                        {canEditEmployees && (detailForm.custom_start_time || detailForm.custom_end_time) && (
                          <button
                            type="button"
                            onClick={() => setDetailForm((p) => ({ ...p, custom_start_time: "", custom_end_time: "" }))}
                            className="text-xs font-bold text-amber-700 dark:text-amber-300 underline cursor-pointer"
                          >
                            Dùng giờ chuẩn
                          </button>
                        )}
                      </div>
                      <select
                        disabled={!canEditEmployees}
                        value={detailForm.shift_type || "FULL_DAY"}
                        onChange={(e) => setDetailForm((p) => ({ ...p, shift_type: e.target.value }))}
                        className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-900/90 disabled:text-slate-500"
                      >
                        {SHIFT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
                      <FormRow label="Giờ vào ca riêng">
                        <input
                          type="time"
                          disabled={!canEditEmployees}
                          value={detailForm.custom_start_time || ""}
                          onChange={(e) => setDetailForm((p) => ({ ...p, custom_start_time: e.target.value }))}
                          className="w-32 sm:w-36 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-2 text-base font-bold text-slate-900 dark:text-white text-center"
                        />
                      </FormRow>
                      <FormRow label="Giờ tan ca riêng">
                        <input
                          type="time"
                          disabled={!canEditEmployees}
                          value={detailForm.custom_end_time || ""}
                          onChange={(e) => setDetailForm((p) => ({ ...p, custom_end_time: e.target.value }))}
                          className="w-32 sm:w-36 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-2 text-base font-bold text-slate-900 dark:text-white text-center"
                        />
                      </FormRow>
                    </div>
                  </>
                )}
              </section>

              {/* NHÓM 3 — TÀI KHOẢN & LIÊN HỆ */}
              <section className="space-y-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-amber-700 dark:text-amber-300 uppercase tracking-wider flex items-center gap-2">
                    <Phone className="w-4 h-4 shrink-0" />
                    <span>3. Tài khoản &amp; Liên hệ</span>
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-[#E11D48] dark:text-rose-300">
                    Mã NV: {detailEmp.ma_nv} • TK {detailDisplayLogin}{detailDisplayPhone && detailDisplayPhone !== detailDisplayLogin ? ` (${detailDisplayPhone})` : ""}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Số điện thoại</label>
                    <input
                      type="tel"
                      disabled={!canEditEmployees}
                      value={detailForm.phone}
                      onChange={(e) => setDetailForm((p) => ({ ...p, phone: e.target.value, dien_thoai: e.target.value }))}
                      placeholder="09xx..."
                      className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Tài khoản đăng nhập</label>
                    <input
                      type="text"
                      disabled={!canEditEmployees}
                      value={detailForm.login_username}
                      onChange={(e) => setDetailForm((p) => ({ ...p, login_username: e.target.value }))}
                      placeholder="SĐT hoặc Mã NV"
                      className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Email</label>
                    <input
                      type="email"
                      disabled={!canEditEmployees}
                      value={detailForm.email}
                      onChange={(e) => setDetailForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="email@congty.vn"
                      className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base text-slate-900 dark:text-white"
                    />
                  </div>
                  {isAdmin && detailEmp.role !== "admin" && (
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Đặt lại mật khẩu</label>
                        <button
                          type="button"
                          onClick={() => setDetailForm((p) => ({ ...p, new_password: "123456" }))}
                          className="text-xs font-bold text-[#E11D48] dark:text-rose-400 underline cursor-pointer"
                        >
                          Đặt nhanh 123456
                        </button>
                      </div>
                      <input
                        type="text"
                        value={detailForm.new_password}
                        onChange={(e) => setDetailForm((p) => ({ ...p, new_password: e.target.value }))}
                        placeholder="Nhập MK mới hoặc bỏ trống..."
                        className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                  )}
                </div>
              </section>

              {/* NHÓM 4 — THIẾT BỊ ĐĂNG NHẬP */}
              {detailEmp.role !== "admin" && (
                <section className="space-y-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                      <Smartphone className="w-4 h-4 shrink-0" />
                      <span>4. Thiết bị đăng nhập</span>
                    </h3>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        detailEmp.device_binding_mode === "enforced"
                          ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
                      }`}
                    >
                      {detailEmp.device_binding_mode === "enforced" ? "🔒 Đang khóa cứng 1 máy" : "Chế độ ghi nhận cảnh báo"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm space-y-1">
                    <div className="text-slate-500 dark:text-slate-400 font-semibold">Thiết bị định danh:</div>
                    <div className="font-bold text-emerald-700 dark:text-emerald-300 break-words">
                      📱 {detailDevSummary.primaryLabel}
                    </div>
                  </div>

                  {detailDevSummary.hasMultiAlert && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-500/70 text-xs text-rose-800 dark:text-rose-100">
                      <div className="flex items-start gap-2 font-bold text-rose-900 dark:text-rose-200 leading-snug">
                        <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                        <span>
                          Cảnh báo đa thiết bị: Phát hiện {Math.max(2, detailDevSummary.known.length)} thiết bị dùng chung tài khoản!
                        </span>
                      </div>
                    </div>
                  )}

                  {detailDevSummary.hasPendingChange && (
                    <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-500/60 space-y-2.5 text-xs">
                      <div className="font-bold text-amber-900 dark:text-amber-200">
                        📱 Nhân viên yêu cầu đổi sang máy mới: {sanitizeSingleDeviceModelName(detailEmp.pending_device_name || detailEmp.pending_device_id)}
                      </div>
                      {detailEmp.device_change_reason && (
                        <div className="text-amber-800 dark:text-amber-100">Lý do: {detailEmp.device_change_reason}</div>
                      )}
                      {isAdmin && (
                        <div className="flex flex-wrap gap-2">
                          <AppButton
                            variant="success"
                            icon={CheckCircle2}
                            loading={resolvingDevice}
                            onClick={() => handlePendingDeviceDecision(detailEmp, "approve")}
                            className="flex-1 text-xs"
                          >
                            ✅ Duyệt đổi sang máy mới
                          </AppButton>
                          <AppButton
                            variant="secondary"
                            icon={XCircle}
                            loading={resolvingDevice}
                            onClick={() => handlePendingDeviceDecision(detailEmp, "reject")}
                            className="text-xs !border-rose-500/40 !text-rose-700 dark:!text-rose-300"
                          >
                            Từ chối
                          </AppButton>
                        </div>
                      )}
                    </div>
                  )}

                  {detailDevSummary.known.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        Lịch sử thiết bị đăng nhập ({detailDevSummary.known.length} máy):
                      </div>
                      {detailDevSummary.known.map((dev, idx) => {
                        const tag = dev.short_tag || computeDeviceShortTag(dev.device_id);
                        const isPrimary = dev.device_id === detailEmp.bound_device_id;
                        return (
                          <div
                            key={dev.device_id || idx}
                            className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs ${
                              isPrimary
                                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-500/50 text-emerald-900 dark:text-emerald-100"
                                : "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-500/50 text-rose-900 dark:text-rose-100"
                            }`}
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="font-bold break-words">
                                {formatEmployeeDeviceLabel(detailEmp.ho_ten, dev.device_name || UNKNOWN_DEVICE_LABEL, tag, true)}
                                {isPrimary && (
                                  <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-200 dark:bg-emerald-500/30 text-emerald-900 dark:text-emerald-200 text-xs">
                                    Máy chính
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-600 dark:text-slate-300">
                                Đăng nhập {dev.login_count || 1} lần {dev.ip ? `• IP: ${dev.ip}` : ""}
                              </div>
                            </div>
                            {isAdmin && (
                              <AppButton
                                variant={isPrimary ? "primary" : "secondary"}
                                loading={resolvingDevice}
                                onClick={() => handleResolveDevices(detailEmp, "lock_primary", dev)}
                                className="text-xs px-3 py-1.5 shrink-0"
                              >
                                Khóa chọn máy này
                              </AppButton>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isAdmin && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {detailDevSummary.primaryId && (
                        <AppButton
                          variant="danger"
                          icon={Lock}
                          loading={resolvingDevice}
                          onClick={() => handleResolveDevices(detailEmp, "lock_primary")}
                          className="flex-1 min-w-[200px] text-xs"
                        >
                          🔒 Khóa cố định vào máy này &amp; Đăng xuất máy khác
                        </AppButton>
                      )}
                      <AppButton
                        variant="secondary"
                        icon={RotateCcw}
                        loading={resolvingDevice}
                        onClick={() => handleResolveDevices(detailEmp, "reset_devices")}
                        className="text-xs"
                      >
                        🔄 Làm mới liên kết thiết bị
                      </AppButton>
                    </div>
                  )}
                </section>
              )}

              {/* NHÓM 5 — LƯƠNG & PHỤ CẤP */}
              <section className="space-y-3 bg-[#F0F3FF]/60 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-[#E11D48] dark:text-rose-300 uppercase tracking-wider flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 shrink-0" />
                    <span>5. Lương &amp; Phụ cấp</span>
                  </h3>
                  {detailEmp.role !== "admin" && (
                    <span className="text-xs font-mono font-extrabold text-emerald-700 dark:text-emerald-300">
                      Lương CB: {formatViCurrency(detailForm.luong_cb || 0)}
                    </span>
                  )}
                </div>

                {detailEmp.role === "admin" ? (
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-500/40 text-xs sm:text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                    Tài khoản Quản trị viên chỉ dùng để điều hành hệ thống; không áp dụng bảng lương, phụ cấp hay quỹ phép năm.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Lương cơ bản (đ)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={!canEditEmployees}
                          value={formatViNumber(detailForm.luong_cb || 0, 0)}
                          onChange={(e) => setDetailForm((p) => ({ ...p, luong_cb: Math.max(0, Math.round(parseViNumberInput(e.target.value))) }))}
                          className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base font-mono text-emerald-700 dark:text-emerald-300"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Quỹ phép năm (ngày)</label>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          disabled={!canEditEmployees}
                          value={detailForm.annual_leave_quota}
                          onChange={(e) => setDetailForm((p) => ({ ...p, annual_leave_quota: Number(e.target.value) || 0 }))}
                          className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base font-mono text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Phụ cấp ăn trưa (đ)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={!canEditEmployees}
                          value={formatViNumber(detailForm.phu_cap_an_trua || 0, 0)}
                          onChange={(e) => setDetailForm((p) => ({ ...p, phu_cap_an_trua: Math.max(0, Math.round(parseViNumberInput(e.target.value))) }))}
                          className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base font-mono text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Phụ cấp xăng xe (đ)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={!canEditEmployees}
                          value={formatViNumber(detailForm.phu_cap_xang_xe || 0, 0)}
                          onChange={(e) => setDetailForm((p) => ({ ...p, phu_cap_xang_xe: Math.max(0, Math.round(parseViNumberInput(e.target.value))) }))}
                          className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base font-mono text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Phụ cấp nhà ở (đ)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={!canEditEmployees}
                          value={formatViNumber(detailForm.phu_cap_nha_o || 0, 0)}
                          onChange={(e) => setDetailForm((p) => ({ ...p, phu_cap_nha_o: Math.max(0, Math.round(parseViNumberInput(e.target.value))) }))}
                          className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-base font-mono text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={!canEditEmployees}
                          checked={Boolean(detailForm.has_insurance)}
                          onChange={(e) => setDetailForm((p) => ({ ...p, has_insurance: e.target.checked }))}
                          className="w-5 h-5 rounded accent-[#E11D48] text-[#E11D48]"
                        />
                        <span>Tham gia Bảo hiểm xã hội bắt buộc</span>
                      </label>

                      {canViewPayroll && (
                        <AppButton
                          data-testid="emp-360-payslip-btn"
                          variant="success"
                          icon={FileSpreadsheet}
                          onClick={() => setPayslipEmp(detailEmp)}
                          className="text-xs px-3.5 py-2"
                        >
                          Phiếu lương &amp; Bảng công chi tiết
                        </AppButton>
                      )}
                    </div>
                  </>
                )}
              </section>
            </form>
          );
        })()}
      </AppModal>

      {/* Modal Phiếu Lương & Bảng Công Chi Tiết Cho Nhân Viên Đang Xem */}
      {payslipEmp && (
        <SalarySlipModal
          targetMaNv={payslipEmp.ma_nv}
          month={new Date().getMonth() + 1}
          year={new Date().getFullYear()}
          isAdminOrAccountant={true}
          showToast={showToast}
          onClose={() => setPayslipEmp(null)}
        />
      )}
    </div>
  );
}
