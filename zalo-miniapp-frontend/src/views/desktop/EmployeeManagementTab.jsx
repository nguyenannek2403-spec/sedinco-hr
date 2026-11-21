import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Lock,
  Unlock,
  AlertCircle,
  AlertTriangle,
  Copy,
  Building2,
  Eye,
  Smartphone,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Phone,
  FileSpreadsheet,
  X,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { safeGet, safePost, safePut } from "../../utils/api";
import { useDebouncedValue } from "../../hooks/useDebounce";
import { DEPARTMENT_OPTIONS, getShiftLabel } from "../../utils/viLabels";
import { formatViCurrency, formatViNumber, parseViNumberInput } from "../../utils/viNumberFormat";
import { ROLES } from "../../constants/roles";
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
  SkeletonList,
  EmptyState
} from "../../components/ui";

const SHIFT_OPTIONS = [
  { value: "FULL_DAY", label: "Ca hành chính (08:00–17:30)" },
  { value: "MORNING_SHIFT", label: "Ca sáng (07:30–12:00)" },
  { value: "AFTERNOON_SHIFT", label: "Ca chiều (13:00–17:30)" },
  { value: "NIGHT_SHIFT", label: "Ca tối (18:00–22:00)" }
];

const DEFAULT_ALLOWANCE_PRESETS = [
  "Phụ cấp ăn trưa",
  "Phụ cấp xăng xe",
  "Phụ cấp nhà ở",
  "Phụ cấp điện thoại",
  "Phụ cấp công trình",
  "Phụ cấp trách nhiệm"
];

function formatViDateTime(isoVal) {
  if (!isoVal) return "";
  try {
    return new Date(isoVal).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  } catch {
    return String(isoVal);
  }
}

function getShiftWindowText(emp) {
  if (emp.custom_start_time && emp.custom_end_time) {
    return `${String(emp.custom_start_time).slice(0, 5)}–${String(emp.custom_end_time).slice(0, 5)} (Giờ riêng)`;
  }
  return getShiftLabel(emp.shift_type || "FULL_DAY");
}

function extractInitialAllowances(emp) {
  if (!emp) return [];
  if (Array.isArray(emp.custom_allowances)) {
    return emp.custom_allowances
      .map((item, idx) => ({
        id: String(item?.id || `alw_${idx + 1}`),
        name: String(item?.name || item?.label || "").trim(),
        amount: Math.max(0, Math.round(Number(item?.amount) || 0))
      }))
      .filter((item) => item.name && item.amount > 0);
  }
  if (typeof emp.custom_allowances === "string" && emp.custom_allowances.trim()) {
    try {
      const parsed = JSON.parse(emp.custom_allowances);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item, idx) => ({
            id: String(item?.id || `alw_${idx + 1}`),
            name: String(item?.name || item?.label || "").trim(),
            amount: Math.max(0, Math.round(Number(item?.amount) || 0))
          }))
          .filter((item) => item.name && item.amount > 0);
      }
    } catch {
      // fallback below
    }
  }
  const legacy = [
    { id: "alw_an_trua", name: "Phụ cấp ăn trưa", amount: Number(emp.phu_cap_an_trua) || 0 },
    { id: "alw_xang_xe", name: "Phụ cấp xăng xe", amount: Number(emp.phu_cap_xang_xe) || 0 },
    { id: "alw_nha_o", name: "Phụ cấp nhà ở", amount: Number(emp.phu_cap_nha_o) || 0 },
    { id: "alw_thuong_htcv", name: "Thưởng hoàn thành công việc", amount: Number(emp.thuong_htcv) || 0 },
    { id: "alw_trach_nhiem", name: "Phụ cấp trách nhiệm", amount: Number(emp.phu_cap_trach_nhiem) || 0 },
    { id: "alw_tiep_khach", name: "Phụ cấp điện thoại", amount: Number(emp.phu_cap_tiep_khach) || 0 }
  ];
  return legacy
    .map((x) => ({ ...x, amount: Math.max(0, Math.round(x.amount)) }))
    .filter((x) => x.amount > 0);
}

function getEmployeeDeviceSummary(emp) {
  if (emp?.role === "admin") {
    return {
      known: [],
      sortedHistory: [],
      hasMultiAlert: false,
      hasPendingChange: false,
      hasAnyAlert: false,
      primaryId: "",
      primaryName: "",
      primaryTag: "",
      latestSeenAt: "",
      primaryLabel: "Không áp dụng thiết bị cá nhân"
    };
  }
  const known = parseKnownDevices(emp?.known_devices_json);
  const sortedHistory = [...known].sort((a, b) => {
    const ta = new Date(a?.last_seen || a?.first_seen || 0).getTime() || 0;
    const tb = new Date(b?.last_seen || b?.first_seen || 0).getTime() || 0;
    return tb - ta;
  });
  const latestItem = sortedHistory[0] || null;
  const distinctDevices = new Set(known.map((d) => d.device_id || d.device_name).filter(Boolean));
  const hasMultiAlert = Boolean(emp?.multi_device_alert) || distinctDevices.size >= 2;
  const hasPendingChange = Boolean(emp?.pending_device_id);
  const primaryId = latestItem?.device_id || emp?.bound_device_id || "";
  const rawPrimaryName = latestItem?.device_name || emp?.bound_device_name || (primaryId ? UNKNOWN_DEVICE_LABEL : "");
  const primaryName = rawPrimaryName ? sanitizeSingleDeviceModelName(rawPrimaryName) : "";
  const primaryTag = latestItem?.short_tag || (primaryId ? computeDeviceShortTag(primaryId) : "");
  const latestSeenAt = latestItem?.last_seen || latestItem?.first_seen || "";

  return {
    known,
    sortedHistory,
    hasMultiAlert,
    hasPendingChange,
    hasAnyAlert: hasMultiAlert || hasPendingChange,
    primaryId,
    primaryName,
    primaryTag,
    latestSeenAt,
    primaryLabel: primaryName
      ? formatEmployeeDeviceLabel(emp.ho_ten || emp.ma_nv, primaryName, primaryTag, hasMultiAlert)
      : `${emp.ho_ten || emp.ma_nv} : Chưa ghi nhận thiết bị`
  };
}

export default function EmployeeManagementTab({
  currentUser,
  showToast,
  focusTarget = null,
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
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

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

  // Modal Chi tiết Nhân viên (mở khi bấm icon Con Mắt 👁️)
  const [detailEmp, setDetailEmp] = useState(null);
  const [detailForm, setDetailForm] = useState(null);
  const [savingDetail, setSavingDetail] = useState(false);
  const [resolvingDevice, setResolvingDevice] = useState(false);
  const [showAllDevices, setShowAllDevices] = useState(false);

  // Trạng thái thêm phụ cấp động trong Modal
  const [isAddingAllowance, setIsAddingAllowance] = useState(false);
  const [newAllowanceName, setNewAllowanceName] = useState("");
  const [newAllowanceAmount, setNewAllowanceAmount] = useState(500000);

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

  const allowancePresetOptions = useMemo(() => {
    const names = new Set(DEFAULT_ALLOWANCE_PRESETS);
    employees.forEach((emp) => {
      extractInitialAllowances(emp).forEach((item) => {
        if (item.name) names.add(item.name);
      });
    });
    if (Array.isArray(detailForm?.custom_allowances)) {
      detailForm.custom_allowances.forEach((item) => {
        if (item?.name) names.add(item.name);
      });
    }
    return Array.from(names);
  }, [employees, detailForm?.custom_allowances]);

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
    setShowAllDevices(false);
    setIsAddingAllowance(false);
    setNewAllowanceName("");
    setNewAllowanceAmount(500000);
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
      custom_allowances: extractInitialAllowances(emp),
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
        custom_allowances: [],
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
            `Thêm nhân viên ${cleanName} (${finalId}) thành công!`,
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

  const handleConfirmAddAllowance = () => {
    const cleanName = String(newAllowanceName || "").trim();
    const cleanAmt = Math.max(0, Math.round(Number(newAllowanceAmount) || 0));
    if (!cleanName) {
      if (showToast) showToast("Vui lòng chọn hoặc nhập tên phụ cấp!", "warning");
      return;
    }
    if (cleanAmt <= 0) {
      if (showToast) showToast("Vui lòng nhập số tiền phụ cấp lớn hơn 0!", "warning");
      return;
    }
    setDetailForm((prev) => {
      if (!prev) return prev;
      const list = Array.isArray(prev.custom_allowances) ? [...prev.custom_allowances] : [];
      const existingIdx = list.findIndex((x) => x.name.toLowerCase() === cleanName.toLowerCase());
      if (existingIdx >= 0) {
        list[existingIdx] = { ...list[existingIdx], amount: cleanAmt };
      } else {
        list.push({
          id: `alw_${Date.now()}_${list.length + 1}`,
          name: cleanName,
          amount: cleanAmt
        });
      }
      return { ...prev, custom_allowances: list };
    });
    setNewAllowanceName("");
    setNewAllowanceAmount(500000);
    setIsAddingAllowance(false);
  };

  const handleUpdateAllowanceAmount = (id, rawVal) => {
    const nextAmt = Math.max(0, Math.round(parseViNumberInput(rawVal)));
    setDetailForm((prev) => {
      if (!prev) return prev;
      const list = (prev.custom_allowances || []).map((item) =>
        item.id === id ? { ...item, amount: nextAmt } : item
      );
      return { ...prev, custom_allowances: list };
    });
  };

  const handleUpdateAllowanceName = (id, rawName) => {
    setDetailForm((prev) => {
      if (!prev) return prev;
      const list = (prev.custom_allowances || []).map((item) =>
        item.id === id ? { ...item, name: rawName } : item
      );
      return { ...prev, custom_allowances: list };
    });
  };

  const handleRemoveAllowance = (id) => {
    setDetailForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        custom_allowances: (prev.custom_allowances || []).filter((item) => item.id !== id)
      };
    });
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
      const baseAllowances = Array.isArray(detailForm.custom_allowances)
        ? [...detailForm.custom_allowances]
        : [];

      // Nếu người dùng đang mở khung "+ Thêm phụ cấp" và đã nhập tên + số tiền rồi bấm thẳng "Lưu thay đổi"
      if (isAddingAllowance) {
        const pendingName = String(newAllowanceName || "").trim();
        const pendingAmt = Math.max(0, Math.round(parseViNumberInput(newAllowanceAmount)));
        if (pendingName && pendingAmt > 0) {
          const existIdx = baseAllowances.findIndex(
            (x) => String(x?.name || "").trim().toLowerCase() === pendingName.toLowerCase()
          );
          if (existIdx >= 0) {
            baseAllowances[existIdx] = { ...baseAllowances[existIdx], amount: pendingAmt };
          } else {
            baseAllowances.push({
              id: `alw_${Date.now()}`,
              name: pendingName,
              amount: pendingAmt
            });
          }
        }
      }

      const cleanAllowances = baseAllowances
        .map((item, idx) => ({
          id: String(item?.id || `alw_${idx + 1}`).trim(),
          name: String(item?.name || "").trim(),
          amount: Math.max(0, Math.round(parseViNumberInput(item?.amount)))
        }))
        .filter((item) => item.name && Number.isFinite(item.amount) && item.amount > 0);

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
        luong_cb: Math.max(0, Math.round(parseViNumberInput(detailForm.luong_cb))),
        custom_allowances: cleanAllowances,
        phu_cap_an_trua: 0,
        phu_cap_xang_xe: 0,
        phu_cap_nha_o: 0,
        thuong_htcv: 0,
        phu_cap_trach_nhiem: 0,
        phu_cap_tiep_khach: 0,
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
        if (showToast) showToast(`Đã lưu thông tin nhân viên ${detailForm.ho_ten}!`, "success");
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
        if (showToast) showToast(res.message || "Đã cập nhật thiết bị thành công!", "success");
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

  const availableDepartments = Array.from(
    new Set([
      ...DEPARTMENT_OPTIONS,
      ...employees.map((e) => e.department).filter(Boolean)
    ])
  );

  const filtered = employees.filter((e) => {
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
    <div className="space-y-3.5 pb-8">
      {/* 1. Thanh Tìm Kiếm & Nút [+ Thêm nhân viên] Siêu Gọn */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm họ tên, mã NV, SĐT..."
            className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canEditEmployees && (
            <AppButton
              variant="primary"
              icon={Plus}
              onClick={() => {
                setFormError("");
                setIsAddModalOpen(true);
              }}
              className="text-xs sm:text-sm px-3.5 py-2 shadow-md shadow-rose-600/20"
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

      {/* 2. Danh Sách Nhân Viên Siêu Sạch (Avatar + Họ tên + Mã NV bên trái, icon Con Mắt 👁️ bên phải) */}
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
          <EmptyState icon={Users} title="Không tìm thấy nhân viên nào." />
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
              Đã tạo tài khoản cho <strong>{createdCreds.ho_ten}</strong> (TK: <strong>{createdCreds.login_username || createdCreds.ma_nv}</strong> • Mã: {createdCreds.ma_nv}). Mật khẩu tạm thời:
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
              Tài khoản đăng nhập
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Số điện thoại
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
                  className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Tài khoản tùy chỉnh
                </label>
                <input
                  type="text"
                  value={form.login_username}
                  onChange={(e) => setForm({ ...form, login_username: e.target.value })}
                  placeholder={form.phone ? form.phone : "SĐT hoặc Mã NV"}
                  className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Mật khẩu khởi tạo
              </label>
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="123456"
                className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
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
                className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
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
                className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
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
                className="w-full min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
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

      {/* 3. MODAL CHI TIẾT NHÂN VIÊN (KHI BẤM ICON CON MẮT 👁️) */}
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
          const detailDisplayPhone = detailForm.phone || detailEmp.phone || detailEmp.dien_thoai || "";
          const detailDisplayLogin = detailForm.login_username || detailDisplayPhone || detailEmp.ma_nv;
          const deviceHistoryList = detailDevSummary.sortedHistory || [];
          const visibleDeviceHistory = showAllDevices ? deviceHistoryList : deviceHistoryList.slice(0, 3);
          const customAllowancesList = Array.isArray(detailForm.custom_allowances) ? detailForm.custom_allowances : [];
          const totalCustomAllowance = customAllowancesList.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

          return (
            <form
              id="edit-employee-360-form"
              onSubmit={handleSaveDetailModal}
              className="p-4 sm:p-5 space-y-4"
            >
              {/* NHÓM 1 — CÔNG VIỆC & CA LÀM */}
              <section className="space-y-3 bg-[#F0F3FF]/60 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-4 h-4 shrink-0" />
                    <span>1. Công việc &amp; Ca làm</span>
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

              {/* NHÓM 2 — TÀI KHOẢN & LIÊN HỆ */}
              <section className="space-y-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-amber-700 dark:text-amber-300 uppercase tracking-wider flex items-center gap-2">
                    <Phone className="w-4 h-4 shrink-0" />
                    <span>2. Tài khoản &amp; Liên hệ</span>
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

              {/* NHÓM 3 — THIẾT BỊ ĐĂNG NHẬP & LỊCH SỬ THIẾT BỊ ("XEM THÊM CHI TIẾT", KHÔNG ÉP KHÓA CỨNG) */}
              {detailEmp.role !== "admin" && (
                <section className="space-y-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                      <Smartphone className="w-4 h-4 shrink-0" />
                      <span>3. Thiết bị đăng nhập</span>
                    </h3>
                    {isAdmin && deviceHistoryList.length > 0 && (
                      <AppButton
                        variant="secondary"
                        icon={RotateCcw}
                        loading={resolvingDevice}
                        onClick={() => handleResolveDevices(detailEmp, "reset_devices")}
                        className="text-xs px-2.5 py-1.5"
                      >
                        Làm mới lịch sử
                      </AppButton>
                    )}
                  </div>

                  {/* Thiết bị gần nhất */}
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm space-y-1">
                    <div className="text-slate-500 dark:text-slate-400 font-semibold">Thiết bị gần nhất:</div>
                    <div className="font-bold text-emerald-700 dark:text-emerald-300 break-words">
                      📱 {detailDevSummary.primaryLabel}
                    </div>
                    {detailDevSummary.latestSeenAt && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Hoạt động gần nhất: {formatViDateTime(detailDevSummary.latestSeenAt)}
                      </div>
                    )}
                  </div>

                  {detailDevSummary.hasMultiAlert && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-500/60 text-xs text-amber-900 dark:text-amber-100">
                      <div className="flex items-start gap-2 font-bold leading-snug">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <span>
                          Ghi nhận tài khoản đã đăng nhập trên {deviceHistoryList.length} lượt thiết bị khác nhau.
                        </span>
                      </div>
                    </div>
                  )}

                  {detailDevSummary.hasPendingChange && (
                    <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-500/60 space-y-2.5 text-xs">
                      <div className="font-bold text-amber-900 dark:text-amber-200">
                        📱 Đề xuất đổi thiết bị: {sanitizeSingleDeviceModelName(detailEmp.pending_device_name || detailEmp.pending_device_id)}
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
                            Duyệt thiết bị
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

                  {/* Lịch sử thiết bị đã dùng (Mặc định hiện tối đa 3 dòng gần nhất + nút Xem thêm chi tiết) */}
                  {deviceHistoryList.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        Lịch sử thiết bị đã dùng ({deviceHistoryList.length}):
                      </div>
                      {visibleDeviceHistory.map((dev, idx) => {
                        const tag = dev.short_tag || computeDeviceShortTag(dev.device_id);
                        const isLatest = idx === 0;
                        return (
                          <div
                            key={`${dev.device_id || "dev"}-${dev.last_seen || idx}`}
                            className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs ${
                              isLatest
                                ? "bg-emerald-50/70 dark:bg-emerald-950/35 border-emerald-300 dark:border-emerald-500/50 text-emerald-900 dark:text-emerald-100"
                                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                            }`}
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="font-bold break-words">
                                📱 {formatEmployeeDeviceLabel(detailEmp.ho_ten, dev.device_name || UNKNOWN_DEVICE_LABEL, tag, true)}
                                {isLatest && (
                                  <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-200 dark:bg-emerald-500/30 text-emerald-900 dark:text-emerald-200 text-xs">
                                    Gần nhất
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-500 dark:text-slate-400">
                                {dev.last_seen ? `${formatViDateTime(dev.last_seen)} • ` : ""}
                                {dev.login_count || 1} lượt {dev.ip ? `• IP: ${dev.ip}` : ""}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {deviceHistoryList.length > 3 && (
                        <button
                          type="button"
                          data-testid="device-history-toggle-btn"
                          onClick={() => setShowAllDevices((prev) => !prev)}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-[#E11D48] dark:text-rose-300 flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          {showAllDevices ? (
                            <>
                              <ChevronUp className="w-4 h-4" />
                              <span>Thu gọn</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4" />
                              <span>Xem thêm chi tiết ({deviceHistoryList.length})</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* NHÓM 4 — LƯƠNG & PHỤ CẤP ĐỘNG LINH HOẠT THEO TỪNG NHÂN VIÊN */}
              <section className="space-y-3 bg-[#F0F3FF]/60 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-[#E11D48] dark:text-rose-300 uppercase tracking-wider flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 shrink-0" />
                    <span>4. Lương &amp; Phụ cấp</span>
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

                    {/* Danh sách phụ cấp động của riêng nhân viên này */}
                    <div className="space-y-2.5 pt-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          Các khoản phụ cấp{" "}
                          {totalCustomAllowance > 0 && (
                            <span className="text-xs font-mono font-extrabold text-blue-700 dark:text-blue-300">
                              (+{formatViCurrency(totalCustomAllowance)})
                            </span>
                          )}
                        </div>
                        {canEditEmployees && !isAddingAllowance && (
                          <button
                            type="button"
                            data-testid="add-allowance-btn"
                            onClick={() => {
                              setNewAllowanceName(allowancePresetOptions[0] || "Phụ cấp ăn trưa");
                              setNewAllowanceAmount(500000);
                              setIsAddingAllowance(true);
                            }}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 dark:bg-slate-900 dark:hover:bg-rose-500/20 border border-rose-300 dark:border-rose-500/40 text-xs font-extrabold text-[#E11D48] dark:text-rose-300 inline-flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Thêm phụ cấp</span>
                          </button>
                        )}
                      </div>

                      {customAllowancesList.length === 0 && !isAddingAllowance ? (
                        <div
                          data-testid="no-allowances-empty"
                          className="px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 font-medium"
                        >
                          Chưa áp dụng phụ cấp
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {customAllowancesList.map((item) => (
                            <div
                              key={item.id}
                              data-testid={`allowance-item-${item.id}`}
                              className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-wrap sm:flex-nowrap items-center gap-2"
                            >
                              <input
                                type="text"
                                disabled={!canEditEmployees}
                                value={item.name}
                                onChange={(e) => handleUpdateAllowanceName(item.id, e.target.value)}
                                placeholder="Tên phụ cấp"
                                className="flex-1 min-w-[140px] min-h-[40px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-900 dark:text-white"
                              />
                              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  disabled={!canEditEmployees}
                                  value={formatViNumber(item.amount || 0, 0)}
                                  onChange={(e) => handleUpdateAllowanceAmount(item.id, e.target.value)}
                                  className="w-full sm:w-36 min-h-[40px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300 text-right"
                                />
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">đ</span>
                                {canEditEmployees && (
                                  <button
                                    type="button"
                                    aria-label={`Xóa ${item.name}`}
                                    title="Xóa khoản phụ cấp này"
                                    onClick={() => handleRemoveAllowance(item.id)}
                                    className="min-w-[40px] min-h-[40px] rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 border border-rose-200 dark:border-rose-500/40 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0 cursor-pointer"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Khung tạo / chọn nhanh phụ cấp mới */}
                      {canEditEmployees && isAddingAllowance && (
                        <div
                          data-testid="add-allowance-panel"
                          className="p-3 rounded-xl bg-white dark:bg-slate-900 border-2 border-rose-300 dark:border-rose-500/50 space-y-2.5"
                        >
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            Chọn nhanh hoặc tự gõ tên phụ cấp mới:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {allowancePresetOptions.map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setNewAllowanceName(preset)}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${
                                  newAllowanceName === preset
                                    ? "bg-[#E11D48] text-white border-[#BE123C]"
                                    : "bg-[#F0F3FF] dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-rose-300"
                                }`}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={newAllowanceName}
                              onChange={(e) => setNewAllowanceName(e.target.value)}
                              placeholder="Nhập tên phụ cấp (VD: Phụ cấp xăng xe...)"
                              className="w-full min-h-[42px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white"
                            />
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatViNumber(newAllowanceAmount || 0, 0)}
                              onChange={(e) => setNewAllowanceAmount(Math.max(0, Math.round(parseViNumberInput(e.target.value))))}
                              placeholder="Số tiền (đ)"
                              className="w-full min-h-[42px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setIsAddingAllowance(false)}
                              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={handleConfirmAddAllowance}
                              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-extrabold text-white cursor-pointer"
                            >
                              Gán phụ cấp
                            </button>
                          </div>
                        </div>
                      )}
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

              {/* KHỐI DƯỚI CÙNG CỦA FORM: LƯU GIỮ NHẬT KÝ HOẠT ĐỘNG & TẠM KHÓA TÀI KHOẢN */}
              {isAdmin && detailEmp.role !== "admin" && (
                <section
                  data-testid="employee-bottom-account-actions"
                  className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <label className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(detailForm.keep_logs)}
                      onChange={(e) => setDetailForm((p) => ({ ...p, keep_logs: e.target.checked }))}
                      className="w-4 h-4 rounded accent-[#E11D48] text-[#E11D48]"
                    />
                    <span>Lưu giữ nhật ký hoạt động</span>
                  </label>

                  <AppButton
                    variant="secondary"
                    icon={isDetailLocked ? Unlock : Lock}
                    onClick={() => handleToggleLock(detailEmp)}
                    className={`text-xs px-3.5 py-2 ${
                      isDetailLocked
                        ? "!border-emerald-500/50 !text-emerald-700 dark:!text-emerald-300"
                        : "!border-rose-500/50 !text-rose-700 dark:!text-rose-300"
                    }`}
                  >
                    {isDetailLocked ? "Mở khóa tài khoản" : "Tạm khóa tài khoản"}
                  </AppButton>
                </section>
              )}
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
