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
  Clock,
  Copy,
  Building2,
  Edit3,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RotateCcw
} from "lucide-react";
import { safeGet, safePost, safePut } from "../../utils/api";
import { useDebouncedValue } from "../../hooks/useDebounce";
import { DEPARTMENT_OPTIONS, getShiftLabel } from "../../utils/viLabels";
import { ROLES, ROLE_LABELS } from "../../constants/roles";
import {
  computeDeviceShortTag,
  formatEmployeeDeviceLabel,
  parseKnownDevices
} from "../../utils/deviceIdentity";
import ConfirmDialog from "../../components/ConfirmDialog";
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
  const known = parseKnownDevices(emp.known_devices_json);
  const hasMultiAlert = Boolean(emp.multi_device_alert) || known.length >= 2;
  const hasPendingChange = Boolean(emp.pending_device_id);
  const primaryId = emp.bound_device_id || (known[0] && known[0].device_id) || "";
  const primaryMatch = known.find((d) => d.device_id === primaryId) || known[0] || null;
  const primaryName = emp.bound_device_name || primaryMatch?.device_name || (primaryId ? "Thiết bị di động" : "");
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
  onRefreshAlerts,
  activeRole,
  dynamicPerms = {}
}) {
  const effectiveRole = activeRole || currentUser?.role || ROLES.ADMIN;
  const isAdmin = effectiveRole === ROLES.ADMIN;
  const canEditEmployees = isAdmin || dynamicPerms?.employee_edit === true;

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [quickFilter, setQuickFilter] = useState(initialFilter || "all"); // 'all' | 'active' | 'alerts' | 'locked'
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
    dien_thoai: "",
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
      dien_thoai: emp.dien_thoai || "",
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

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setFormError("");
    const targetMaNv = String(form.ma_nv || "").trim().toUpperCase();
    const cleanName = String(form.ho_ten || "").trim();
    const cleanTitle = String(form.chuc_danh || "").trim();
    if (!targetMaNv) {
      setFormError("Vui lòng nhập Mã nhân viên (VD: NV025)!");
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
      const targetShift = form.shift_type || "FULL_DAY";
      const res = await safePost("/employees", {
        ...form,
        ma_nv: targetMaNv,
        ho_ten: cleanName,
        chuc_danh: cleanTitle,
        custom_start_time: form.custom_start_time || null,
        custom_end_time: form.custom_end_time || null
      });
      if (res?.success) {
        if (targetShift !== "FULL_DAY" || form.custom_start_time || form.custom_end_time) {
          await safePut(`/employees/${targetMaNv}/shift`, {
            shift_type: targetShift,
            custom_start_time: form.custom_start_time || null,
            custom_end_time: form.custom_end_time || null
          }).catch(() => {});
        }
        if (showToast) showToast(`Thêm nhân viên ${targetMaNv} thành công!`, "success");
        setIsAddModalOpen(false);
        if (res.one_time_password) {
          setCreatedCreds({
            ma_nv: targetMaNv,
            ho_ten: cleanName,
            password: res.one_time_password
          });
        }
        setForm({
          ma_nv: "",
          ho_ten: "",
          chuc_danh: "",
          department: "Khối Công trình",
          dien_thoai: "",
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
      const msg = err.message || "Lỗi tạo mới nhân sự.";
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
      const payload = {
        ho_ten: String(detailForm.ho_ten || "").trim(),
        chuc_danh: detailForm.chuc_danh,
        department: detailForm.department,
        dien_thoai: detailForm.dien_thoai,
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

  // Thống kê nhanh 4 nhóm
  const totalCount = employees.length;
  const activeCount = employees.filter((e) => !e.is_locked && e.status !== "inactive").length;
  const lockedCount = employees.filter((e) => Boolean(e.is_locked || e.status === "inactive")).length;
  const alertEmployees = employees.filter((e) => getEmployeeDeviceSummary(e).hasAnyAlert);
  const alertCount = alertEmployees.length;

  const filtered = employees.filter((e) => {
    const isLocked = Boolean(e.is_locked || e.status === "inactive");
    const devSummary = getEmployeeDeviceSummary(e);
    if (quickFilter === "active" && isLocked) return false;
    if (quickFilter === "locked" && !isLocked) return false;
    if (quickFilter === "alerts" && !devSummary.hasAnyAlert) return false;

    const empDept = e.department || "Khối Công trình";
    if (selectedDepartment !== "ALL" && empDept !== selectedDepartment) return false;

    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(e.ma_nv || "").toLowerCase().includes(q) ||
      String(e.ho_ten || "").toLowerCase().includes(q) ||
      String(e.chuc_danh || "").toLowerCase().includes(q) ||
      String(e.department || "").toLowerCase().includes(q) ||
      String(e.bound_device_name || "").toLowerCase().includes(q)
    );
  });

  const detailDevSummary = detailEmp ? getEmployeeDeviceSummary(detailEmp) : null;

  return (
    <div className="space-y-4 pb-8">
      {/* 1. 4 Thẻ Lọc Nhanh Trung Tâm Nhân Sự 360° */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          type="button"
          onClick={() => setQuickFilter("all")}
          className={`min-h-[60px] p-3 rounded-2xl border text-left transition cursor-pointer ${
            quickFilter === "all"
              ? "bg-blue-600/25 border-blue-400 text-white shadow-lg shadow-blue-900/30"
              : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800"
          }`}
        >
          <div className="text-xs font-semibold opacity-90">👥 Tất cả nhân sự</div>
          <div className="text-xl font-black mt-0.5 text-white">{totalCount}</div>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter("active")}
          className={`min-h-[60px] p-3 rounded-2xl border text-left transition cursor-pointer ${
            quickFilter === "active"
              ? "bg-emerald-600/25 border-emerald-400 text-white shadow-lg shadow-emerald-900/30"
              : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800"
          }`}
        >
          <div className="text-xs font-semibold text-emerald-300">🟢 Đang làm việc</div>
          <div className="text-xl font-black mt-0.5 text-white">{activeCount}</div>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter("alerts")}
          className={`min-h-[60px] p-3 rounded-2xl border text-left transition cursor-pointer ${
            quickFilter === "alerts"
              ? "bg-rose-600/30 border-rose-400 text-white shadow-lg shadow-rose-900/30"
              : alertCount > 0
              ? "bg-rose-950/50 border-rose-500/50 text-rose-100 hover:bg-rose-950/80"
              : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800"
          }`}
        >
          <div className="text-xs font-semibold text-rose-300">🚨 Đa thiết bị / Đổi máy</div>
          <div className="text-xl font-black mt-0.5 text-white">{alertCount}</div>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter("locked")}
          className={`min-h-[60px] p-3 rounded-2xl border text-left transition cursor-pointer ${
            quickFilter === "locked"
              ? "bg-amber-600/25 border-amber-400 text-white shadow-lg shadow-amber-900/30"
              : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800"
          }`}
        >
          <div className="text-xs font-semibold text-amber-300">🔒 Đang khóa</div>
          <div className="text-xl font-black mt-0.5 text-white">{lockedCount}</div>
        </button>
      </div>

      {/* 2. Thanh Công Cụ Tìm Kiếm, Lọc Bộ Phận & Thao Tác */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold leading-snug text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400 shrink-0" />
              <span>Trung tâm Nhân sự &amp; Thiết bị 360°</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Đang hiển thị <strong className="text-white">{filtered.length}</strong> / {totalCount} nhân sự
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <AppButton
                variant="ghost"
                tone="dark"
                icon={Key}
                onClick={handleBatchForcePassword}
                className="bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300 text-xs px-3 py-2"
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
                className="text-xs px-3.5 py-2 shadow-lg shadow-blue-600/30"
              >
                Thêm nhân viên
              </AppButton>
            )}
            <AppButton
              variant="secondary"
              tone="dark"
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
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên, mã NV, bộ phận, tên máy..."
              className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            aria-label="Lọc theo bộ phận"
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {/* 3. Danh Sách Thẻ Nhân Viên Trực Quan */}
      {loading ? (
        <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4">
          <SkeletonList rows={4} dark label="Đang tải danh sách nhân sự..." />
        </div>
      ) : error ? (
        <div className="bg-slate-800/80 border border-rose-500/40 rounded-2xl p-6 text-center text-rose-300 text-sm flex items-center justify-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4">
          <EmptyState dark icon={Users} title="Không tìm thấy nhân viên nào khớp với bộ lọc." />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
          {filtered.map((emp) => {
            const isLocked = Boolean(emp.is_locked || emp.status === "inactive");
            const devSummary = getEmployeeDeviceSummary(emp);

            return (
              <div
                key={emp.ma_nv}
                className={`perf-list-item bg-slate-800/85 border rounded-2xl p-4 shadow-xl space-y-3 transition ${
                  devSummary.hasAnyAlert ? "border-rose-500/60" : "border-slate-700/80"
                }`}
              >
                {/* Dòng 1: Họ tên + Mã NV + Vai trò + Trạng thái */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-base text-white break-words leading-snug">
                        {emp.ho_ten}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-xs font-mono font-bold text-blue-300">
                        {emp.ma_nv}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-xs font-semibold">
                        {ROLE_LABELS[emp.role] || "Nhân viên"}
                      </span>
                    </div>

                    {/* Dòng 2: Bộ phận, Chức danh & Ca làm việc */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
                      <span className="inline-flex items-center gap-1 text-cyan-300 font-medium">
                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{emp.department || "Khối Công trình"} • {emp.chuc_danh || "Nhân viên"}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-indigo-300 font-medium">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>{getShiftWindowText(emp)}</span>
                      </span>
                    </div>
                  </div>

                  <StatusBadge type="employee" status={isLocked ? "locked" : "active"} dark />
                </div>

                {/* Dòng 3: Hiển thị Thiết bị chuẩn "[Tên nhân viên] : [Tên thiết bị]" */}
                <div className="px-3 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-bold text-emerald-200 break-words">
                      📱 {devSummary.primaryLabel}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md font-semibold shrink-0 ${
                      emp.device_binding_mode === "enforced"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-slate-800 text-slate-300 border border-slate-700"
                    }`}
                  >
                    {emp.device_binding_mode === "enforced" ? "🔒 Khóa 1 máy" : "Ghi nhận"}
                  </span>
                </div>

                {/* Băng cảnh báo đỏ nếu phát hiện >= 2 thiết bị dùng chung tài khoản hoặc yêu cầu đổi máy */}
                {devSummary.hasMultiAlert && (
                  <div className="p-3 rounded-xl bg-rose-950/75 border border-rose-500/70 text-xs text-rose-100 space-y-2">
                    <div className="flex items-start gap-2 font-bold text-rose-200 leading-snug">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span>
                        🚨 Phát hiện {Math.max(2, devSummary.known.length)} thiết bị dùng chung tài khoản:{" "}
                        {devSummary.known.length >= 2
                          ? devSummary.known
                              .map((d) => `${d.device_name || "Thiết bị"} (#${d.short_tag || computeDeviceShortTag(d.device_id)})`)
                              .join(" & ")
                          : "Đã ghi nhận đăng nhập từ máy thứ 2"}
                      </span>
                    </div>
                  </div>
                )}

                {devSummary.hasPendingChange && (
                  <div className="p-3 rounded-xl bg-amber-950/65 border border-amber-500/60 text-xs text-amber-100 space-y-1">
                    <div className="font-bold text-amber-200">
                      📱 Yêu cầu đổi sang máy mới: {emp.pending_device_name || emp.pending_device_id}
                    </div>
                    {emp.device_change_reason && (
                      <div className="text-amber-100/90">Lý do: {emp.device_change_reason}</div>
                    )}
                  </div>
                )}

                {/* Thanh Hành Động Nhanh trên Thẻ */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-xs sm:text-sm text-slate-200 font-mono font-semibold whitespace-nowrap">
                    Lương CB: {Number(emp.luong_cb || 0).toLocaleString("vi-VN")} đ
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <AppButton
                      variant={devSummary.hasAnyAlert ? "danger" : "primary"}
                      icon={devSummary.hasAnyAlert ? ShieldCheck : Edit3}
                      onClick={() => handleOpen360Modal(emp)}
                      className="text-xs px-3.5 py-2"
                    >
                      {devSummary.hasAnyAlert
                        ? "Xử lý thiết bị & 360°"
                        : canEditEmployees
                        ? "Hồ sơ 360°"
                        : "Xem hồ sơ"}
                    </AppButton>

                    {isAdmin && emp.role !== "admin" && (
                      <AppButton
                        variant="secondary"
                        tone="dark"
                        icon={isLocked ? Unlock : Lock}
                        onClick={() => handleToggleLock(emp)}
                        aria-label={isLocked ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                        className={`min-w-[44px] px-3 py-2 text-xs ${
                          isLocked
                            ? "!border-emerald-500/40 !text-emerald-300"
                            : "!border-rose-500/40 !text-rose-300"
                        }`}
                      >
                        {isLocked ? "Mở khóa" : "Khóa"}
                      </AppButton>
                    )}
                  </div>
                </div>
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
        theme="dark"
        maxWidthClass="max-w-sm"
        title="Tài khoản mới tạo"
        closeLabel="Đóng / Quay lại"
      >
        {createdCreds && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-200 leading-relaxed">
              Đã tạo tài khoản cho <strong>{createdCreds.ho_ten}</strong> ({createdCreds.ma_nv}). Vui lòng gửi mật khẩu tạm thời bên dưới cho nhân viên:
            </p>
            <div className="p-3 bg-slate-950 border border-slate-700 rounded-xl flex items-center justify-between gap-2">
              <code className="text-base font-mono font-bold text-emerald-400 break-all">{createdCreds.password}</code>
              <AppButton
                variant="secondary"
                tone="dark"
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
            <p className="text-xs text-amber-300 leading-relaxed">
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
        theme="dark"
        maxWidthClass="max-w-md"
        title="Thêm nhân viên mới"
        icon={<Plus className="w-4 h-4 text-blue-400 shrink-0" />}
        footer={
          <div className="flex gap-2.5">
            <AppButton
              variant="secondary"
              tone="dark"
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
              className="flex-1 shadow-lg shadow-blue-600/30"
            >
              Lưu nhân viên
            </AppButton>
          </div>
        }
      >
        <form id="add-employee-form" onSubmit={handleAddEmployee} className="p-5 space-y-3">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-sm leading-snug">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-1">Mã nhân viên</label>
              <input
                type="text"
                required
                value={form.ma_nv}
                onChange={(e) => setForm({ ...form, ma_nv: e.target.value.toUpperCase() })}
                placeholder="VD: NV025"
                className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-1">Họ và tên</label>
              <input
                type="text"
                required
                value={form.ho_ten}
                onChange={(e) => setForm({ ...form, ho_ten: e.target.value })}
                placeholder="Nguyễn Văn A"
                className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-1">Chức danh</label>
              <input
                type="text"
                required
                value={form.chuc_danh}
                onChange={(e) => setForm({ ...form, chuc_danh: e.target.value })}
                placeholder="Kỹ thuật / Nhân viên kho"
                className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-1">Khối / Bộ phận</label>
              <select
                value={form.department || "Khối Công trình"}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm font-semibold text-slate-200 mb-1">Vai trò</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="worker">Nhân viên</option>
                <option value="accountant">Kế toán</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-1">Lương cơ bản (đ)</label>
              <input
                type="number"
                required
                min={0}
                step={100000}
                value={form.luong_cb}
                onChange={(e) => setForm({ ...form, luong_cb: Number(e.target.value) })}
                className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-1">Ca làm việc mặc định</label>
            <select
              value={form.shift_type || "FULL_DAY"}
              onChange={(e) => setForm({ ...form, shift_type: e.target.value })}
              className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SHIFT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </form>
      </AppModal>

      {/* 4. MODAL DUY NHẤT: HỒ SƠ KIỂM SOÁT NHÂN SỰ 360° */}
      <AppModal
        open={Boolean(detailEmp && detailForm)}
        onClose={() => {
          if (!savingDetail && !resolvingDevice) {
            setDetailEmp(null);
            setDetailForm(null);
          }
        }}
        disableClose={savingDetail || resolvingDevice}
        theme="dark"
        maxWidthClass="max-w-2xl"
        maxHeightClass="max-h-[92vh]"
        title="Hồ Sơ Kiểm Soát Nhân Sự 360°"
        subtitle={detailEmp ? `${detailEmp.ho_ten} (${detailEmp.ma_nv})` : ""}
        icon={<ShieldCheck className="w-5 h-5 text-blue-400 shrink-0" />}
        footer={
          <div className="flex gap-2.5">
            <AppButton
              variant="secondary"
              tone="dark"
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
                className="flex-1 shadow-lg shadow-blue-600/30"
              >
                Lưu hồ sơ 360°
              </AppButton>
            )}
          </div>
        }
      >
        {detailEmp && detailForm && detailDevSummary && (
          <form
            id="edit-employee-360-form"
            onSubmit={handleSaveDetailModal}
            className="p-4 sm:p-5 space-y-5"
          >
            {/* KHU VỰC 1: THÔNG TIN & CHẾ ĐỘ ĐÃI NGỘ */}
            <section className="space-y-3 bg-slate-950/60 border border-slate-700/80 rounded-2xl p-4">
              <h3 className="text-sm font-black text-blue-300 uppercase tracking-wide flex items-center gap-2">
                <Users className="w-4 h-4 shrink-0" />
                <span>1. Thông tin &amp; Chế độ đãi ngộ</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Họ và tên</label>
                  <input
                    type="text"
                    required
                    disabled={!canEditEmployees}
                    value={detailForm.ho_ten}
                    onChange={(e) => setDetailForm((p) => ({ ...p, ho_ten: e.target.value }))}
                    className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base text-white disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Chức danh</label>
                  <input
                    type="text"
                    disabled={!canEditEmployees}
                    value={detailForm.chuc_danh}
                    onChange={(e) => setDetailForm((p) => ({ ...p, chuc_danh: e.target.value }))}
                    className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base text-white disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Khối / Bộ phận công tác</label>
                  <select
                    disabled={!canEditEmployees}
                    value={detailForm.department}
                    onChange={(e) => setDetailForm((p) => ({ ...p, department: e.target.value }))}
                    className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base text-white disabled:opacity-60"
                  >
                    {availableDepartments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Quỹ phép năm (ngày)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    disabled={!canEditEmployees}
                    value={detailForm.annual_leave_quota}
                    onChange={(e) => setDetailForm((p) => ({ ...p, annual_leave_quota: Number(e.target.value) || 0 }))}
                    className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base font-mono text-white disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Số điện thoại</label>
                  <input
                    type="tel"
                    disabled={!canEditEmployees}
                    value={detailForm.dien_thoai}
                    onChange={(e) => setDetailForm((p) => ({ ...p, dien_thoai: e.target.value }))}
                    placeholder="09xx..."
                    className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base text-white disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Email</label>
                  <input
                    type="email"
                    disabled={!canEditEmployees}
                    value={detailForm.email}
                    onChange={(e) => setDetailForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="email@congty.vn"
                    className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base text-white disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Lương cơ bản (đ)</label>
                  <input
                    type="number"
                    min={0}
                    step={100000}
                    disabled={!canEditEmployees}
                    value={detailForm.luong_cb}
                    onChange={(e) => setDetailForm((p) => ({ ...p, luong_cb: Number(e.target.value) || 0 }))}
                    className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base font-mono text-emerald-300 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Phụ cấp ăn trưa (đ)</label>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    disabled={!canEditEmployees}
                    value={detailForm.phu_cap_an_trua}
                    onChange={(e) => setDetailForm((p) => ({ ...p, phu_cap_an_trua: Number(e.target.value) || 0 }))}
                    className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base font-mono text-white disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Phụ cấp xăng xe (đ)</label>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    disabled={!canEditEmployees}
                    value={detailForm.phu_cap_xang_xe}
                    onChange={(e) => setDetailForm((p) => ({ ...p, phu_cap_xang_xe: Number(e.target.value) || 0 }))}
                    className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base font-mono text-white disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Phụ cấp nhà ở / khác (đ)</label>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    disabled={!canEditEmployees}
                    value={detailForm.phu_cap_nha_o}
                    onChange={(e) => setDetailForm((p) => ({ ...p, phu_cap_nha_o: Number(e.target.value) || 0 }))}
                    className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base font-mono text-white disabled:opacity-60"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canEditEmployees}
                  checked={Boolean(detailForm.has_insurance)}
                  onChange={(e) => setDetailForm((p) => ({ ...p, has_insurance: e.target.checked }))}
                  className="w-5 h-5 rounded text-blue-600"
                />
                <span className="text-sm font-semibold text-slate-200">
                  Có tham gia đóng Bảo hiểm xã hội bắt buộc
                </span>
              </label>
            </section>

            {/* KHU VỰC 2: CA LÀM VIỆC & GIỜ RIÊNG */}
            <section className="space-y-3 bg-slate-950/60 border border-slate-700/80 rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black text-indigo-300 uppercase tracking-wide flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>2. Ca làm việc &amp; Giờ riêng</span>
                </h3>
                {canEditEmployees && (detailForm.custom_start_time || detailForm.custom_end_time) && (
                  <AppButton
                    variant="ghost"
                    tone="dark"
                    onClick={() => setDetailForm((p) => ({ ...p, custom_start_time: "", custom_end_time: "" }))}
                    className="text-xs text-amber-300 border-amber-500/40 px-2.5 py-1.5"
                  >
                    Dùng giờ chuẩn
                  </AppButton>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-200 mb-1">Ca làm việc chuẩn</label>
                <select
                  disabled={!canEditEmployees}
                  value={detailForm.shift_type || "FULL_DAY"}
                  onChange={(e) => setDetailForm((p) => ({ ...p, shift_type: e.target.value }))}
                  className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base text-white disabled:opacity-60"
                >
                  {SHIFT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="divide-y divide-slate-800 border border-slate-700 rounded-xl bg-slate-900 overflow-hidden">
                <FormRow dark label="Giờ vào ca riêng">
                  <input
                    type="time"
                    disabled={!canEditEmployees}
                    value={detailForm.custom_start_time || ""}
                    onChange={(e) => setDetailForm((p) => ({ ...p, custom_start_time: e.target.value }))}
                    className="w-32 sm:w-36 bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-2 text-base font-bold text-white text-center"
                  />
                </FormRow>
                <FormRow dark label="Giờ tan ca riêng">
                  <input
                    type="time"
                    disabled={!canEditEmployees}
                    value={detailForm.custom_end_time || ""}
                    onChange={(e) => setDetailForm((p) => ({ ...p, custom_end_time: e.target.value }))}
                    className="w-32 sm:w-36 bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-2 text-base font-bold text-white text-center"
                  />
                </FormRow>
              </div>
            </section>

            {/* KHU VỰC 3: KIỂM SOÁT THIẾT BỊ & CHỐNG DÙNG CHUNG TÀI KHOẢN */}
            <section className="space-y-3 bg-slate-950/60 border border-slate-700/80 rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black text-emerald-300 uppercase tracking-wide flex items-center gap-2">
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>3. Kiểm soát Thiết bị &amp; Chống dùng chung</span>
                </h3>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    detailEmp.device_binding_mode === "enforced"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-slate-800 text-slate-300 border border-slate-700"
                  }`}
                >
                  {detailEmp.device_binding_mode === "enforced" ? "🔒 Đang khóa cứng 1 máy" : "Chế độ ghi nhận cảnh báo"}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm space-y-1">
                <div className="text-slate-400 font-semibold">Thiết bị chính hiện tại:</div>
                <div className="font-bold text-emerald-300 break-words">
                  📱 {detailDevSummary.primaryLabel}
                </div>
              </div>

              {/* Yêu cầu đổi máy mới từ nhân viên */}
              {detailDevSummary.hasPendingChange && (
                <div className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-500/60 space-y-2.5 text-xs">
                  <div className="font-bold text-amber-200">
                    📱 Nhân viên yêu cầu đổi sang máy mới: {detailEmp.pending_device_name || detailEmp.pending_device_id}
                  </div>
                  {detailEmp.device_change_reason && (
                    <div className="text-amber-100">Lý do: {detailEmp.device_change_reason}</div>
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
                        tone="dark"
                        icon={XCircle}
                        loading={resolvingDevice}
                        onClick={() => handlePendingDeviceDecision(detailEmp, "reject")}
                        className="text-xs !border-rose-500/40 !text-rose-300"
                      >
                        Từ chối
                      </AppButton>
                    </div>
                  )}
                </div>
              )}

              {/* Danh sách tất cả các thiết bị đã đăng nhập / chấm công */}
              {detailDevSummary.known.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-300">
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
                            ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-100"
                            : "bg-rose-950/40 border-rose-500/50 text-rose-100"
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="font-bold break-words">
                            {formatEmployeeDeviceLabel(detailEmp.ho_ten, dev.device_name || "Thiết bị di động", tag, true)}
                            {isPrimary && (
                              <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 text-xs">
                                Máy chính
                              </span>
                            )}
                          </div>
                          <div className="text-slate-300">
                            Đăng nhập {dev.login_count || 1} lần {dev.ip ? `• IP: ${dev.ip}` : ""}
                          </div>
                        </div>
                        {isAdmin && (
                          <AppButton
                            variant={isPrimary ? "primary" : "secondary"}
                            tone="dark"
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
                      🔒 Khóa cố định vào máy này &amp; Đăng xuất mọi máy khác
                    </AppButton>
                  )}
                  <AppButton
                    variant="secondary"
                    tone="dark"
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

            {/* KHU VỰC 4: QUYỀN HẠN & BẢO MẬT TÀI KHOẢN */}
            {isAdmin && detailEmp.role !== "admin" && (
              <section className="space-y-3 bg-slate-950/60 border border-slate-700/80 rounded-2xl p-4">
                <h3 className="text-sm font-black text-amber-300 uppercase tracking-wide flex items-center gap-2">
                  <Key className="w-4 h-4 shrink-0" />
                  <span>4. Quyền hạn &amp; Bảo mật tài khoản</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-200 mb-1">Vai trò phân quyền</label>
                    <select
                      value={detailForm.role || "worker"}
                      onChange={(e) => setDetailForm((p) => ({ ...p, role: e.target.value }))}
                      className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base text-white"
                    >
                      <option value="worker">Nhân viên</option>
                      <option value="accountant">Kế toán</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-200 mb-1">Đặt lại mật khẩu mới (tùy chọn)</label>
                    <input
                      type="text"
                      value={detailForm.new_password}
                      onChange={(e) => setDetailForm((p) => ({ ...p, new_password: e.target.value }))}
                      placeholder="Bỏ trống nếu giữ nguyên..."
                      className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base text-white placeholder-slate-500"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(detailForm.keep_logs)}
                    onChange={(e) => setDetailForm((p) => ({ ...p, keep_logs: e.target.checked }))}
                    className="w-5 h-5 rounded text-blue-600"
                  />
                  <span className="text-sm font-semibold text-slate-200">
                    Lưu giữ toàn bộ nhật ký hoạt động của nhân viên này (không tự động dọn dẹp)
                  </span>
                </label>

                <div className="pt-1">
                  <AppButton
                    variant="secondary"
                    tone="dark"
                    icon={Boolean(detailEmp.is_locked || detailEmp.status === "inactive") ? Unlock : Lock}
                    onClick={() => handleToggleLock(detailEmp)}
                    className="w-full text-xs !border-rose-500/40 !text-rose-200"
                  >
                    {Boolean(detailEmp.is_locked || detailEmp.status === "inactive")
                      ? "Mở khóa tài khoản nhân viên này"
                      : "Tạm khóa tài khoản nhân viên này"}
                  </AppButton>
                </div>
              </section>
            )}
          </form>
        )}
      </AppModal>
    </div>
  );
}
