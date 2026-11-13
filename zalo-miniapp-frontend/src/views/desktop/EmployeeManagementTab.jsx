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
  X
} from "lucide-react";
import { safeGet, safePost, safePut, generateIdempotencyKey } from "../../utils/api";
import { useDebouncedValue } from "../../hooks/useDebounce";
import { ROLE_LABELS } from "../../constants/roles";
import ConfirmDialog from "../../components/ConfirmDialog";

const SHIFT_OPTIONS = [
  { value: "FULL_DAY", label: "Ca hành chính (08:00–17:30)" },
  { value: "MORNING_SHIFT", label: "Ca sáng (07:30–12:00)" },
  { value: "AFTERNOON_SHIFT", label: "Ca chiều (13:00–17:30)" },
  { value: "NIGHT_SHIFT", label: "Ca tối (18:00–22:00)" }
];

export default function EmployeeManagementTab({ currentUser, showToast }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form thêm nhân sự
  const [form, setForm] = useState({
    ma_nv: "",
    ho_ten: "",
    chuc_danh: "",
    dien_thoai: "",
    email: "",
    role: "worker",
    shift_type: "FULL_DAY",
    luong_cb: 8000000,
    has_insurance: true
  });
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

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
        { ...form, ma_nv: targetMaNv },
        { idempotencyKey: generateIdempotencyKey("emp_add") }
      );
      if (res?.success) {
        if (targetShift !== "FULL_DAY") {
          await safePut(`/employees/${targetMaNv}/shift`, { shift_type: targetShift }).catch(() => {});
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
          dien_thoai: "",
          email: "",
          role: "worker",
          shift_type: "FULL_DAY",
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

  const filtered = employees.filter(e => {
    const q = debouncedSearch.trim().toLowerCase();
    return !q ||
      String(e.ma_nv || "").toLowerCase().includes(q) ||
      String(e.ho_ten || "").toLowerCase().includes(q) ||
      String(e.chuc_danh || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 pb-28">
      {/* Top Header & Actions */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold leading-snug text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400 shrink-0" />
            <span>Quản lý hồ sơ nhân sự &amp; tài khoản</span>
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed mt-0.5">
            Tổng cộng: <strong className="text-white">{employees.length}</strong> nhân sự trong hệ thống
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Search box */}
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên, mã NV, chức danh..."
              className="w-full sm:w-52 min-h-[42px] bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        <span className="font-semibold text-sm text-white block truncate">{emp.ho_ten}</span>
                        <span className="text-xs font-mono text-blue-400 font-semibold block">
                          {emp.ma_nv} • {emp.chuc_danh || "Nhân viên"}
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

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                      <span className="text-slate-300 font-mono font-semibold whitespace-nowrap">
                        Lương CB: {Number(emp.luong_cb || 0).toLocaleString("vi-VN")} đ
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={emp.role || "worker"}
                          onChange={(e) => handleChangeRole(emp, e.target.value)}
                          disabled={emp.role === "admin"}
                          className="min-h-[38px] bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-semibold disabled:opacity-50"
                        >
                          <option value="worker">Công nhân</option>
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

                    <div className="flex items-center gap-2 pt-1">
                      <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <select
                        value={emp.shift_type || "FULL_DAY"}
                        disabled={updatingShiftMaNv === emp.ma_nv}
                        onChange={(e) => handleChangeShift(emp, e.target.value)}
                        className="flex-1 min-h-[38px] bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-indigo-200 font-medium disabled:opacity-50"
                      >
                        {SHIFT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
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
                        {emp.chuc_danh || "Nhân viên"}
                      </td>
                      <td className="p-3.5">
                        <select
                          value={emp.role || "worker"}
                          onChange={(e) => handleChangeRole(emp, e.target.value)}
                          disabled={emp.role === "admin"}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                        >
                          <option value="worker">Công nhân</option>
                          <option value="accountant">Kế toán</option>
                          {emp.role === "admin" && <option value="admin">Quản trị viên</option>}
                        </select>
                      </td>
                      <td className="p-3.5">
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Thông tin đăng nhập mới</h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Đã tạo tài khoản cho <strong>{createdCreds.ho_ten}</strong> ({createdCreds.ma_nv}). Vui lòng gửi mật khẩu tạm thời bên dưới cho nhân viên:
            </p>
            <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl flex items-center justify-between gap-2">
              <code className="text-base font-mono font-bold text-emerald-400">{createdCreds.password}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(createdCreds.password);
                  if (showToast) showToast("Đã sao chép mật khẩu tạm thời!", "success");
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Sao chép</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setCreatedCreds(null)}
              className="w-full min-h-[44px] py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl cursor-pointer"
            >
              Đã ghi lại
            </button>
          </div>
        </div>
      )}

      {/* Modal Thêm Nhân Sự Mới */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-400" />
                Thêm Nhân Viên Mới
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

            <form onSubmit={handleAddEmployee} className="space-y-3">
              {formError && (
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Mã nhân viên</label>
                  <input
                    type="text"
                    required
                    value={form.ma_nv}
                    onChange={(e) => setForm({ ...form, ma_nv: e.target.value.toUpperCase() })}
                    placeholder="VD: NV025"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Họ và tên</label>
                  <input
                    type="text"
                    required
                    value={form.ho_ten}
                    onChange={(e) => setForm({ ...form, ho_ten: e.target.value })}
                    placeholder="Nguyễn Văn A"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Chức danh</label>
                <input
                  type="text"
                  required
                  value={form.chuc_danh}
                  onChange={(e) => setForm({ ...form, chuc_danh: e.target.value })}
                  placeholder="Công nhân kỹ thuật"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Vai trò</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="worker">Công nhân</option>
                    <option value="accountant">Kế toán</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Lương cơ bản</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={100000}
                    value={form.luong_cb}
                    onChange={(e) => setForm({ ...form, luong_cb: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Ca làm việc mặc định</label>
                <select
                  value={form.shift_type || "FULL_DAY"}
                  onChange={(e) => setForm({ ...form, shift_type: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {SHIFT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 min-h-[44px] py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 min-h-[44px] py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {isSubmitting ? "Đang lưu..." : "Lưu nhân viên"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
