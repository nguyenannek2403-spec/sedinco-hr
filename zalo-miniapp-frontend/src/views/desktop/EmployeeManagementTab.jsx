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
  CheckCircle2,
  Clock,
  Copy,
  X,
  ArrowLeft,
  Building2,
  Edit3,
  Smartphone
} from "lucide-react";
import { safeGet, safePost, safePut, generateIdempotencyKey } from "../../utils/api";
import { useDebouncedValue } from "../../hooks/useDebounce";
import { DEPARTMENT_OPTIONS, getShiftLabel } from "../../utils/viLabels";
import { useLockBodyScroll } from "../../hooks/useLockBodyScroll";
import ConfirmDialog from "../../components/ConfirmDialog";
import AdminDeviceApproval from "../../components/AdminDeviceApproval";

const SHIFT_OPTIONS = [
  { value: "FULL_DAY", label: "Ca hành chính (08:00–17:30)" },
  { value: "MORNING_SHIFT", label: "Ca sáng (07:30–12:00)" },
  { value: "AFTERNOON_SHIFT", label: "Ca chiều (13:00–17:30)" },
  { value: "NIGHT_SHIFT", label: "Ca tối (18:00–22:00)" }
];

export default function EmployeeManagementTab({
  currentUser,
  showToast,
  initialSubTab = "list",
  pendingDeviceCount = 0,
  onRefreshAlerts
}) {
  const [subTab, setSubTab] = useState(initialSubTab);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [selectedDepartment, setSelectedDepartment] = useState("ALL");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form thêm nhân sự
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

  // Modal Xem / Sửa thông tin nhân viên
  const [detailEmp, setDetailEmp] = useState(null);
  const [detailForm, setDetailForm] = useState(null);
  const [savingDetail, setSavingDetail] = useState(false);

  const [editingScheduleEmp, setEditingScheduleEmp] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({ custom_start_time: "", custom_end_time: "" });
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    setSubTab(initialSubTab || "list");
  }, [initialSubTab]);

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
  const shiftInFlightRef = useRef(false);
  const [updatingShiftMaNv, setUpdatingShiftMaNv] = useState(null);
  const [createdCreds, setCreatedCreds] = useState(null);

  useLockBodyScroll(Boolean(isAddModalOpen || editingScheduleEmp || createdCreds || detailEmp));

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/employees", {}, { cancelPrevious: true });
      if (res?.success && Array.isArray(res.data)) {
        setEmployees(res.data);
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

  // Khóa / Mở khóa tài khoản
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

  // Đổi vai trò (Chỉ Quản trị viên)
  const handleChangeRole = (emp, newRole) => {
    if (newRole === "admin") {
      if (showToast) showToast("Không thể gán vai trò Quản trị viên qua giao diện này!", "warning");
      return;
    }
    if (newRole === (emp.role || "worker")) return;

    setConfirmAction({
      open: true,
      title: "Đổi vai trò nhân viên",
      message: `Đổi vai trò của ${emp.ma_nv} (${emp.ho_ten}) sang "${ROLE_LABELS[newRole] || newRole}"?`,
      confirmLabel: "Đổi vai trò",
      danger: false,
      onExecute: async () => {
        try {
          const res = await safePut(`/employees/${emp.ma_nv}/role`, { role: newRole });
          if (res?.success) {
            if (showToast) showToast(`Đã cập nhật vai trò ${emp.ma_nv} thành ${ROLE_LABELS[newRole]}!`, "success");
            fetchEmployees();
          } else {
            if (showToast) showToast(res?.message || "Không thể đổi vai trò.", "error");
          }
        } catch (err) {
          if (showToast) showToast(err.message || "Lỗi kết nối máy chủ.", "error");
        }
      }
    });
  };

  // F3: Đổi ca làm việc
  const handleChangeShift = async (emp, newShift) => {
    if (shiftInFlightRef.current || newShift === (emp.shift_type || "FULL_DAY")) return;
    shiftInFlightRef.current = true;
    setUpdatingShiftMaNv(emp.ma_nv);
    try {
      const res = await safePut(`/employees/${emp.ma_nv}/shift`, { shift_type: newShift });
      if (res?.success) {
        setEmployees((prev) =>
          prev.map((item) => (item.ma_nv === emp.ma_nv ? { ...item, shift_type: newShift } : item))
        );
        if (showToast) showToast(`Đã chuyển ${emp.ma_nv} sang ca làm việc mới!`, "success");
      } else {
        if (showToast) showToast(res?.message || "Không thể cập nhật ca làm việc.", "error");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi cập nhật ca làm việc.", "error");
    } finally {
      shiftInFlightRef.current = false;
      setUpdatingShiftMaNv(null);
    }
  };

  const handleOpenCustomSchedule = (emp) => {
    setEditingScheduleEmp(emp);
    setScheduleForm({
      custom_start_time: emp.custom_start_time || "",
      custom_end_time: emp.custom_end_time || ""
    });
  };

  const handleSaveCustomSchedule = async (e, clearToDefault = false) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (!editingScheduleEmp || savingSchedule) return;
    setSavingSchedule(true);
    const payload = clearToDefault
      ? { custom_start_time: null, custom_end_time: null }
      : {
          custom_start_time: scheduleForm.custom_start_time ? scheduleForm.custom_start_time : null,
          custom_end_time: scheduleForm.custom_end_time ? scheduleForm.custom_end_time : null
        };
    try {
      const res = await safePut(`/employees/${editingScheduleEmp.ma_nv}/shift`, payload);
      if (res?.success) {
        setEmployees((prev) =>
          prev.map((item) =>
            item.ma_nv === editingScheduleEmp.ma_nv
              ? {
                  ...item,
                  custom_start_time: payload.custom_start_time,
                  custom_end_time: payload.custom_end_time
                }
              : item
          )
        );
        if (showToast) {
          showToast(
            clearToDefault
              ? `Đã đưa ${editingScheduleEmp.ma_nv} về giờ chuẩn công ty/ca!`
              : `Đã lưu giờ làm việc riêng cho ${editingScheduleEmp.ma_nv}!`,
            "success"
          );
        }
        setEditingScheduleEmp(null);
      } else {
        if (showToast) showToast(res?.message || "Không thể cập nhật giờ làm việc riêng.", "error");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi cập nhật giờ làm việc riêng.", "error");
    } finally {
      setSavingSchedule(false);
    }
  };

  // Kích hoạt đổi mật khẩu hàng loạt
  const handleBatchForcePassword = () => {
    setConfirmAction({
      open: true,
      title: "Yêu cầu đổi mật khẩu hàng loạt",
      message: "Kích hoạt cờ yêu cầu đổi mật khẩu ở lần đăng nhập tiếp theo cho toàn bộ nhân viên?",
      confirmLabel: "Kích hoạt",
      danger: true,
      onExecute: async () => {
        try {
          const res = await safePost("/employees/staged-force-password", { stage: "all" });
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

  // Thêm nhân viên mới
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setFormError("");
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const targetMaNv = form.ma_nv.trim().toUpperCase();
      const targetShift = form.shift_type || "FULL_DAY";
      const res = await safePost(
        "/employees",
        {
          ...form,
          ma_nv: targetMaNv,
          custom_start_time: form.custom_start_time || null,
          custom_end_time: form.custom_end_time || null
        },
        { idempotencyKey: generateIdempotencyKey("emp_add") }
      );
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
            ho_ten: form.ho_ten,
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

  const handleOpenDetailModal = (emp) => {
    setDetailEmp(emp);
    setDetailForm({
      ho_ten: emp.ho_ten || "",
      chuc_danh: emp.chuc_danh || "",
      department: emp.department || "Khối Công trình",
      dien_thoai: emp.dien_thoai || "",
      email: emp.email || "",
      luong_cb: Number(emp.luong_cb) || 0,
      phu_cap_an_trua: Number(emp.phu_cap_an_trua) || 0,
      phu_cap_xang_xe: Number(emp.phu_cap_xang_xe) || 0,
      phu_cap_nha_o: Number(emp.phu_cap_nha_o) || 0,
      thuong_htcv: Number(emp.thuong_htcv) || 0,
      phu_cap_trach_nhiem: Number(emp.phu_cap_trach_nhiem) || 0,
      phu_cap_tiep_khach: Number(emp.phu_cap_tiep_khach) || 0,
      has_insurance: Boolean(emp.has_insurance),
      custom_start_time: emp.custom_start_time || "",
      custom_end_time: emp.custom_end_time || ""
    });
  };

  const handleSaveDetailModal = async (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (!detailEmp || !detailForm || savingDetail) return;
    setSavingDetail(true);
    try {
      const res = await safePut(`/employees/${detailEmp.ma_nv}`, {
        ho_ten: detailForm.ho_ten,
        chuc_danh: detailForm.chuc_danh,
        department: detailForm.department,
        dien_thoai: detailForm.dien_thoai,
        email: detailForm.email,
        luong_cb: Number(detailForm.luong_cb) || 0,
        phu_cap_an_trua: Number(detailForm.phu_cap_an_trua) || 0,
        phu_cap_xang_xe: Number(detailForm.phu_cap_xang_xe) || 0,
        phu_cap_nha_o: Number(detailForm.phu_cap_nha_o) || 0,
        thuong_htcv: Number(detailForm.thuong_htcv) || 0,
        phu_cap_trach_nhiem: Number(detailForm.phu_cap_trach_nhiem) || 0,
        phu_cap_tiep_khach: Number(detailForm.phu_cap_tiep_khach) || 0,
        has_insurance: Boolean(detailForm.has_insurance),
        custom_start_time: detailForm.custom_start_time || null,
        custom_end_time: detailForm.custom_end_time || null
      });
      if (res?.success) {
        if (showToast) showToast(`Đã cập nhật thông tin của ${detailForm.ho_ten}!`, "success");
        setDetailEmp(null);
        setDetailForm(null);
        fetchEmployees();
      } else {
        if (showToast) showToast(res?.message || "Không thể cập nhật hồ sơ nhân viên.", "error");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi cập nhật hồ sơ nhân viên.", "error");
    } finally {
      setSavingDetail(false);
    }
  };

  const availableDepartments = Array.from(
    new Set([
      ...DEPARTMENT_OPTIONS,
      ...employees.map((e) => e.department).filter(Boolean)
    ])
  );

  const filtered = employees.filter(e => {
    const q = debouncedSearch.trim().toLowerCase();
    const matchText = !q ||
      String(e.ma_nv || "").toLowerCase().includes(q) ||
      String(e.ho_ten || "").toLowerCase().includes(q) ||
      String(e.chuc_danh || "").toLowerCase().includes(q) ||
      String(e.department || "").toLowerCase().includes(q);
    const empDept = e.department || "Khối Công trình";
    const matchDept = selectedDepartment === "ALL" || empDept === selectedDepartment;
    return matchText && matchDept;
  });

  return (
    <div className="space-y-4 pb-28">
      {/* Sub-tabs: Danh sách nhân sự vs Phê duyệt đổi thiết bị */}
      {currentUser?.role === "admin" && (
        <div className="flex flex-wrap items-center gap-2 bg-slate-800/80 border border-slate-700/70 rounded-2xl p-2 shadow-lg">
          <button
            type="button"
            onClick={() => setSubTab("list")}
            className={`flex-1 min-w-[140px] min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === "list"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-slate-300 hover:bg-slate-700/60"
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Hồ sơ nhân sự ({employees.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab("devices")}
            className={`flex-1 min-w-[140px] min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === "devices"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-300 hover:bg-slate-700/60"
            }`}
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>Đổi thiết bị</span>
            {pendingDeviceCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-extrabold rounded-full bg-rose-500 text-white">
                {pendingDeviceCount}
              </span>
            )}
          </button>
        </div>
      )}

      {subTab === "devices" && currentUser?.role === "admin" ? (
        <AdminDeviceApproval
          currentUser={currentUser}
          showToast={showToast}
          onChanged={() => {
            if (onRefreshAlerts) onRefreshAlerts();
          }}
        />
      ) : (
      <>
      {/* Top Header & Actions */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold leading-snug text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400 shrink-0" />
            <span>Quản lý hồ sơ nhân sự &amp; tài khoản</span>
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed mt-0.5">
            Đang hiển thị: <strong className="text-white">{filtered.length}</strong> / {employees.length} nhân sự
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Lọc theo Khối / Bộ phận */}
          <select
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

          {/* Search box */}
          <div className="relative flex-1 sm:flex-initial min-w-[160px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên, mã NV, bộ phận..."
              className="w-full sm:w-52 min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={handleBatchForcePassword}
            className="min-h-[42px] px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-semibold rounded-xl text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            title="Bắt buộc đổi mật khẩu đợt tới"
          >
            <Key className="w-3.5 h-3.5 shrink-0" />
            <span>Yêu cầu đổi MK</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFormError("");
              setIsAddModalOpen(true);
            }}
            className="min-h-[42px] px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-blue-600/30 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Thêm nhân viên</span>
          </button>

          <button
            type="button"
            onClick={fetchEmployees}
            disabled={loading}
            aria-label="Làm mới"
            className="min-h-[42px] min-w-[42px] p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors flex items-center justify-center cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Table Employees */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            Đang tải danh sách nhân sự...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-rose-400 text-xs flex items-center justify-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            Không tìm thấy nhân viên nào khớp với bộ lọc.
          </div>
        ) : (
          <>
            {/* Mobile Card View (Tối ưu cho Admin mở trên điện thoại Zalo Mini App 360px - 430px) */}
            <div className="md:hidden divide-y divide-slate-700/60">
              {filtered.map((emp) => {
                const isLocked = Boolean(emp.is_locked || emp.status === "inactive");
                return (
                  <div key={emp.id || emp.ma_nv} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-base text-white block break-words leading-snug">{emp.ho_ten}</span>
                        <span className="text-xs font-mono text-blue-400 font-semibold block mt-0.5 break-words">
                          {emp.ma_nv} • {emp.chuc_danh || "Nhân viên"}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-cyan-300 font-medium mt-1">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span>{emp.department || "Khối Công trình"}</span>
                        </span>
                      </div>
                      {isLocked ? (
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-lg border bg-rose-500/15 text-rose-400 border-rose-500/30 inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                          <Lock className="w-3 h-3" />
                          <span>Đã khóa</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-lg border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Hoạt động</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
                      <span className="text-slate-200 font-mono font-semibold whitespace-nowrap">
                        Lương CB: {Number(emp.luong_cb || 0).toLocaleString("vi-VN")} đ
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenDetailModal(emp)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Thông tin / Sửa</span>
                        </button>
                        <select
                          value={emp.role || "worker"}
                          onChange={(e) => handleChangeRole(emp, e.target.value)}
                          disabled={emp.role === "admin"}
                          className="min-h-[40px] bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-semibold disabled:opacity-50"
                        >
                          <option value="worker">Nhân viên</option>
                          <option value="accountant">Kế toán</option>
                          {emp.role === "admin" && <option value="admin">Quản trị viên</option>}
                        </select>
                        {emp.role !== "admin" && (
                          <button
                            type="button"
                            onClick={() => handleToggleLock(emp)}
                            aria-label={isLocked ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                            className={`min-w-[40px] min-h-[38px] p-2 rounded-xl border flex items-center justify-center cursor-pointer ${
                              isLocked
                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                : "bg-rose-500/15 border-rose-500/30 text-rose-400"
                            }`}
                          >
                            {isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <select
                        value={emp.shift_type || "FULL_DAY"}
                        disabled={updatingShiftMaNv === emp.ma_nv}
                        onChange={(e) => handleChangeShift(emp, e.target.value)}
                        className="flex-1 min-w-[140px] min-h-[38px] bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-indigo-200 font-medium disabled:opacity-50"
                      >
                        {SHIFT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleOpenCustomSchedule(emp)}
                        className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-colors cursor-pointer shrink-0 ${
                          emp.custom_start_time && emp.custom_end_time
                            ? "bg-amber-500/20 border-amber-500/40 text-amber-200 hover:bg-amber-500/30"
                            : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        {emp.custom_start_time && emp.custom_end_time
                          ? `Giờ riêng: ${emp.custom_start_time}–${emp.custom_end_time}`
                          : "Giờ riêng"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto touch-scroll-x">
              <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 border-b border-slate-700/80 text-slate-300 font-semibold">
                <tr>
                  <th className="p-3.5 pl-5 whitespace-nowrap">Mã NV / Họ tên</th>
                  <th className="p-3.5 whitespace-nowrap">Chức danh</th>
                  <th className="p-3.5 whitespace-nowrap">Vai trò</th>
                  <th className="p-3.5 whitespace-nowrap">Ca làm việc</th>
                  <th className="p-3.5 whitespace-nowrap">Lương CB</th>
                  <th className="p-3.5 whitespace-nowrap">Trạng thái</th>
                  <th className="p-3.5 text-right pr-5 whitespace-nowrap">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50 text-slate-300">
                {filtered.map(emp => {
                  const isLocked = Boolean(emp.is_locked || emp.status === "inactive");

                  return (
                    <tr key={emp.id || emp.ma_nv} className="hover:bg-slate-700/30 transition-colors">
                      <td className="p-3.5 pl-5">
                        <div className="font-semibold text-white">{emp.ho_ten}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{emp.ma_nv}</div>
                      </td>
                      <td className="p-3.5 font-medium text-slate-200">
                        <div>{emp.chuc_danh || "Nhân viên"}</div>
                        <div className="text-[11px] text-cyan-300 font-normal mt-0.5">{emp.department || "Khối Công trình"}</div>
                      </td>
                      <td className="p-3.5">
                        <select
                          value={emp.role || "worker"}
                          onChange={(e) => handleChangeRole(emp, e.target.value)}
                          disabled={emp.role === "admin"}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                        >
                          <option value="worker">Nhân viên</option>
                          <option value="accountant">Kế toán</option>
                          {emp.role === "admin" && <option value="admin">Quản trị viên</option>}
                        </select>
                      </td>
                      <td className="p-3.5">
                        <div className="flex flex-col items-start gap-1.5">
                          <select
                            value={emp.shift_type || "FULL_DAY"}
                            disabled={updatingShiftMaNv === emp.ma_nv}
                            onChange={(e) => handleChangeShift(emp, e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-indigo-200 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                          >
                            {SHIFT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleOpenCustomSchedule(emp)}
                            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                              emp.custom_start_time && emp.custom_end_time
                                ? "bg-amber-500/20 border-amber-500/40 text-amber-200 hover:bg-amber-500/30"
                                : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                            }`}
                          >
                            {emp.custom_start_time && emp.custom_end_time
                              ? `Giờ riêng: ${emp.custom_start_time}–${emp.custom_end_time}`
                              : "Cài giờ riêng"}
                          </button>
                        </div>
                      </td>
                      <td className="p-3.5 text-slate-300 font-mono font-medium whitespace-nowrap">
                        {Number(emp.luong_cb || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        {isLocked ? (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-lg border bg-rose-500/15 text-rose-400 border-rose-500/30 inline-flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>Đã khóa</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-lg border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Hoạt động</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-right pr-5 whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDetailModal(emp)}
                            className="px-2.5 py-1.5 rounded-lg border border-blue-500/40 bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                            title="Xem & Sửa hồ sơ"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Hồ sơ</span>
                          </button>
                          {emp.role !== "admin" ? (
                            <button
                              type="button"
                              onClick={() => handleToggleLock(emp)}
                              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                                isLocked
                                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
                                  : "bg-rose-500/15 border-rose-500/30 text-rose-400 hover:bg-rose-500/25"
                              }`}
                              title={isLocked ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                            >
                              {isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            </button>
                          ) : (
                            <span className="text-slate-500 text-xs italic">Bảo vệ</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
      </>
      )}

      <ConfirmDialog
        open={confirmAction.open}
        title={confirmAction.title}
        message={confirmAction.message}
        confirmLabel={confirmAction.confirmLabel}
        danger={confirmAction.danger}
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

      {createdCreds && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onTouchMove={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
          onClick={(e) => { if (e.target === e.currentTarget) setCreatedCreds(null); }}
        >
          <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-sm max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-sheet-up">
            <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-slate-700/80 shrink-0">
              <button
                type="button"
                onClick={() => setCreatedCreds(null)}
                className="inline-flex items-center gap-1 min-h-[42px] px-2.5 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-semibold shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Trở về</span>
              </button>
              <h3 className="text-sm sm:text-base font-bold text-white truncate">Tài khoản mới tạo</h3>
              <button
                type="button"
                onClick={() => setCreatedCreds(null)}
                className="w-9 h-9 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center shrink-0"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-scroll-area flex-1 min-h-0 p-5 space-y-4">
              <p className="text-sm text-slate-200 leading-relaxed">
                Đã tạo tài khoản cho <strong>{createdCreds.ho_ten}</strong> ({createdCreds.ma_nv}). Vui lòng gửi mật khẩu tạm thời bên dưới cho nhân viên:
              </p>
              <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl flex items-center justify-between gap-2">
                <code className="text-base font-mono font-bold text-emerald-400 break-all">{createdCreds.password}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(createdCreds.password);
                    if (showToast) showToast("Đã sao chép mật khẩu tạm thời!", "success");
                  }}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Sao chép</span>
                </button>
              </div>
            </div>
            <div
              className="px-5 py-3.5 border-t border-slate-700/80 bg-slate-800 shrink-0"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
            >
              <button
                type="button"
                onClick={() => setCreatedCreds(null)}
                className="w-full min-h-[46px] py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-base font-semibold rounded-xl cursor-pointer"
              >
                Đóng / Quay lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thêm Nhân Sự Mới */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onTouchMove={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsAddModalOpen(false); }}
        >
          <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-sheet-up">
            <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-slate-700/80 shrink-0">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="inline-flex items-center gap-1 min-h-[42px] px-2.5 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-semibold shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Trở về</span>
              </button>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 truncate">
                <Plus className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="truncate">Thêm nhân viên mới</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center shrink-0"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              id="add-employee-form"
              onSubmit={handleAddEmployee}
              className="modal-scroll-area flex-1 min-h-0 p-5 space-y-3"
            >
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
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Khối / Bộ phận</label>
                  <select
                    value={form.department || "Khối Công trình"}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-200 mb-1">Ca làm việc mặc định</label>
                <select
                  value={form.shift_type || "FULL_DAY"}
                  onChange={(e) => setForm({ ...form, shift_type: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {SHIFT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="divide-y divide-slate-700/80 border border-slate-700 rounded-xl bg-slate-900/90 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <label className="text-sm font-semibold text-slate-200">Giờ vào riêng (tùy chọn)</label>
                  <input
                    type="time"
                    value={form.custom_start_time || ""}
                    onChange={(e) => setForm({ ...form, custom_start_time: e.target.value })}
                    className="w-32 sm:w-36 shrink-0 bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-2 text-base font-semibold text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <label className="text-sm font-semibold text-slate-200">Giờ tan riêng (tùy chọn)</label>
                  <input
                    type="time"
                    value={form.custom_end_time || ""}
                    onChange={(e) => setForm({ ...form, custom_end_time: e.target.value })}
                    className="w-32 sm:w-36 shrink-0 bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-2 text-base font-semibold text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Bỏ trống 2 ô giờ riêng nếu nhân viên áp dụng giờ chuẩn của Ca làm việc / Công ty.
              </p>
            </form>

            <div
              className="px-5 py-3.5 border-t border-slate-700/80 bg-slate-800 shrink-0 flex gap-2.5"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
            >
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="flex-1 min-h-[46px] py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-base font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Đóng / Quay lại
              </button>
              <button
                type="submit"
                form="add-employee-form"
                disabled={isSubmitting}
                className="flex-1 min-h-[46px] py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-base font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? "Đang lưu..." : "Lưu nhân viên"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cài Giờ Làm Việc Riêng Từng Nhân Sự */}
      {editingScheduleEmp && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onTouchMove={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingScheduleEmp(null); }}
        >
          <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-sheet-up">
            <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-slate-700/80 shrink-0">
              <button
                type="button"
                onClick={() => setEditingScheduleEmp(null)}
                className="inline-flex items-center gap-1 min-h-[42px] px-2.5 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-semibold shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Trở về</span>
              </button>
              <div className="min-w-0 flex-1 text-center">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center justify-center gap-1.5 truncate">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate">Giờ làm việc riêng</span>
                </h3>
                <p className="text-xs text-slate-300 font-semibold truncate">
                  {editingScheduleEmp.ho_ten} ({editingScheduleEmp.ma_nv})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingScheduleEmp(null)}
                className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center shrink-0"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              id="custom-schedule-form"
              onSubmit={(e) => handleSaveCustomSchedule(e, false)}
              className="modal-scroll-area flex-1 min-h-0 p-5 space-y-4"
            >
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-700 text-sm text-slate-200 leading-relaxed">
                Khung giờ riêng sẽ được ưu tiên hơn giờ ca mặc định (<strong className="text-indigo-300">{getShiftLabel(editingScheduleEmp.shift_type || "FULL_DAY")}</strong>) khi chấm công vào/ra và tính đi muộn.
              </div>

              <div className="divide-y divide-slate-700/80 border border-slate-700 rounded-xl bg-slate-900/90 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <label className="text-sm font-semibold text-slate-200">Giờ vào ca riêng</label>
                  <input
                    type="time"
                    value={scheduleForm.custom_start_time || ""}
                    onChange={(e) =>
                      setScheduleForm((prev) => ({ ...prev, custom_start_time: e.target.value }))
                    }
                    className="w-32 sm:w-36 shrink-0 bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-2 text-base font-bold text-white text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <label className="text-sm font-semibold text-slate-200">Giờ tan ca riêng</label>
                  <input
                    type="time"
                    value={scheduleForm.custom_end_time || ""}
                    onChange={(e) =>
                      setScheduleForm((prev) => ({ ...prev, custom_end_time: e.target.value }))
                    }
                    className="w-32 sm:w-36 shrink-0 bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-2 text-base font-bold text-white text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Ví dụ: nhân viên bộ phận hỗ trợ làm <strong>09:00 – 18:00</strong> sẽ được tính đúng giờ nếu chấm vào trước hoặc đúng 09:00. Bấm <strong>"Dùng giờ chuẩn"</strong> để xóa giờ riêng.
              </p>
            </form>

            <div
              className="px-5 py-3.5 border-t border-slate-700/80 bg-slate-800 shrink-0 flex flex-wrap gap-2"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
            >
              <button
                type="button"
                disabled={savingSchedule}
                onClick={() => handleSaveCustomSchedule(null, true)}
                className="min-h-[46px] px-3.5 py-2.5 bg-slate-900 hover:bg-slate-700 border border-slate-600 text-amber-200 text-sm font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
              >
                Dùng giờ chuẩn
              </button>
              <button
                type="button"
                disabled={savingSchedule}
                onClick={() => setEditingScheduleEmp(null)}
                className="flex-1 min-h-[46px] py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
              >
                Đóng / Quay lại
              </button>
              <button
                type="submit"
                form="custom-schedule-form"
                disabled={savingSchedule}
                className="flex-1 min-h-[46px] py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-black rounded-xl shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                {savingSchedule ? "Đang lưu..." : "Lưu giờ riêng"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem / Chỉnh sửa Chi tiết Hồ sơ Nhân viên */}
      {detailEmp && detailForm && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onTouchMove={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingDetail) {
              setDetailEmp(null);
              setDetailForm(null);
            }
          }}
        >
          <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] shadow-2xl flex flex-col overflow-hidden animate-sheet-up">
            <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-slate-700/80 shrink-0">
              <button
                type="button"
                disabled={savingDetail}
                onClick={() => {
                  setDetailEmp(null);
                  setDetailForm(null);
                }}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Trở về</span>
              </button>
              <div className="min-w-0 flex-1 text-center">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">Thông tin nhân viên</h3>
                <p className="text-xs text-blue-300 font-semibold truncate">{detailEmp.ma_nv}</p>
              </div>
              <button
                type="button"
                disabled={savingDetail}
                onClick={() => {
                  setDetailEmp(null);
                  setDetailForm(null);
                }}
                className="w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center shrink-0"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              id="edit-employee-detail-form"
              onSubmit={handleSaveDetailModal}
              className="modal-scroll-area flex-1 min-h-0 p-5 space-y-3.5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Họ và tên</label>
                  <input
                    type="text"
                    required
                    value={detailForm.ho_ten}
                    onChange={(e) => setDetailForm((p) => ({ ...p, ho_ten: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Chức danh</label>
                  <input
                    type="text"
                    value={detailForm.chuc_danh}
                    onChange={(e) => setDetailForm((p) => ({ ...p, chuc_danh: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-200 mb-1">Khối / Bộ phận công tác</label>
                <select
                  value={detailForm.department}
                  onChange={(e) => setDetailForm((p) => ({ ...p, department: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                >
                  {availableDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Số điện thoại</label>
                  <input
                    type="tel"
                    value={detailForm.dien_thoai}
                    onChange={(e) => setDetailForm((p) => ({ ...p, dien_thoai: e.target.value }))}
                    placeholder="09xx..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Email</label>
                  <input
                    type="email"
                    value={detailForm.email}
                    onChange={(e) => setDetailForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="email@congty.vn"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
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
                    value={detailForm.luong_cb}
                    onChange={(e) => setDetailForm((p) => ({ ...p, luong_cb: Number(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base font-mono text-emerald-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Phụ cấp ăn trưa (đ)</label>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    value={detailForm.phu_cap_an_trua}
                    onChange={(e) => setDetailForm((p) => ({ ...p, phu_cap_an_trua: Number(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base font-mono text-white"
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
                    value={detailForm.phu_cap_xang_xe}
                    onChange={(e) => setDetailForm((p) => ({ ...p, phu_cap_xang_xe: Number(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1">Phụ cấp nhà ở / khác (đ)</label>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    value={detailForm.phu_cap_nha_o}
                    onChange={(e) => setDetailForm((p) => ({ ...p, phu_cap_nha_o: Number(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base font-mono text-white"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/90 border border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(detailForm.has_insurance)}
                  onChange={(e) => setDetailForm((p) => ({ ...p, has_insurance: e.target.checked }))}
                  className="w-5 h-5 rounded text-blue-600"
                />
                <span className="text-sm font-semibold text-slate-200">
                  Có tham gia đóng Bảo hiểm xã hội bắt buộc
                </span>
              </label>

              <div className="divide-y divide-slate-700/80 border border-slate-700 rounded-xl bg-slate-900/90 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <label className="text-sm font-semibold text-slate-200">Giờ vào ca riêng</label>
                  <input
                    type="time"
                    value={detailForm.custom_start_time || ""}
                    onChange={(e) => setDetailForm((p) => ({ ...p, custom_start_time: e.target.value }))}
                    className="w-32 sm:w-36 shrink-0 bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-2 text-base font-bold text-white text-center"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <label className="text-sm font-semibold text-slate-200">Giờ tan ca riêng</label>
                  <input
                    type="time"
                    value={detailForm.custom_end_time || ""}
                    onChange={(e) => setDetailForm((p) => ({ ...p, custom_end_time: e.target.value }))}
                    className="w-32 sm:w-36 shrink-0 bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-2 text-base font-bold text-white text-center"
                  />
                </div>
              </div>
            </form>

            <div
              className="px-5 py-3.5 border-t border-slate-700/80 bg-slate-800 shrink-0 flex gap-2.5"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
            >
              <button
                type="button"
                disabled={savingDetail}
                onClick={() => {
                  setDetailEmp(null);
                  setDetailForm(null);
                }}
                className="flex-1 min-h-[46px] py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-base font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Đóng / Quay lại
              </button>
              <button
                type="submit"
                form="edit-employee-detail-form"
                disabled={savingDetail}
                className="flex-1 min-h-[46px] py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-base font-bold rounded-xl shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 cursor-pointer"
              >
                {savingDetail ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
