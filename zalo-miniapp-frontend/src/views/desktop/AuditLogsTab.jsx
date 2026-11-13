import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  RefreshCw,
  AlertCircle,
  UserCheck,
  Pin,
  Lock,
  Unlock,
  Trash2,
  Filter
} from "lucide-react";
import { safeGet, safePost, safePut } from "../../utils/api";
import { useDebouncedValue } from "../../hooks/useDebounce";

export default function AuditLogsTab({ currentUser, showToast, onRefreshAlerts }) {
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Bộ lọc nâng cao (Nhiệm vụ 4)
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [selectedEmp, setSelectedEmp] = useState("");
  const [category, setCategory] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [cleaning, setCleaning] = useState(false);

  const pinLockRef = useRef(false);
  const keepLockRef = useRef(false);
  const accLockRef = useRef(false);
  const cleanupLockRef = useRef(false);

  const fetchEmployeesAndSettings = useCallback(async () => {
    try {
      const [empRes, compRes] = await Promise.all([
        safeGet("/employees").catch(() => null),
        safeGet("/company").catch(() => null)
      ]);
      if (empRes?.success && Array.isArray(empRes.data)) {
        setEmployees(empRes.data);
      }
      if (compRes?.success && compRes.data?.log_retention_days) {
        setRetentionDays(Number(compRes.data.log_retention_days) || 30);
      }
    } catch {}
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/audit-logs", {
        ma_nv: selectedEmp || undefined,
        category: category || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        pinnedOnly: pinnedOnly ? "true" : undefined,
        limit: 250
      }, { cancelPrevious: true });
      if (res?.success && Array.isArray(res.data)) {
        setLogs(res.data);
      } else {
        setLogs([]);
      }
    } catch (err) {
      setError(err.message || "Không thể tải nhật ký giám sát");
    } finally {
      setLoading(false);
    }
  }, [selectedEmp, category, startDate, endDate, pinnedOnly]);

  useEffect(() => {
    fetchEmployeesAndSettings();
  }, [fetchEmployeesAndSettings]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleTogglePin = async (log) => {
    if (pinLockRef.current) return;
    pinLockRef.current = true;
    const nextPinned = !Boolean(log.is_pinned);
    try {
      const res = await safePut(`/audit-logs/${log.id}/pin`, { is_pinned: nextPinned });
      if (res?.success) {
        setLogs((prev) =>
          prev.map((item) => (item.id === log.id ? { ...item, is_pinned: nextPinned ? 1 : 0 } : item))
        );
        if (showToast) showToast(res.message || "Đã cập nhật trạng thái ghim!", "success");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Không thể ghim dòng lịch sử.", "error");
    } finally {
      pinLockRef.current = false;
    }
  };

  const handleToggleKeepEmployeeLogs = async (actorId, currentKeep) => {
    if (!actorId || actorId === "SYSTEM" || actorId === "admin" || keepLockRef.current) return;
    keepLockRef.current = true;
    const nextKeep = !Boolean(currentKeep);
    try {
      const res = await safePut(`/audit-logs/keep-employee/${actorId}`, { keep_logs: nextKeep });
      if (res?.success) {
        setLogs((prev) =>
          prev.map((item) => (item.actor_id === actorId ? { ...item, keep_logs: nextKeep ? 1 : 0 } : item))
        );
        setEmployees((prev) =>
          prev.map((e) => (e.ma_nv === actorId ? { ...e, keep_logs: nextKeep ? 1 : 0 } : e))
        );
        if (showToast) showToast(res.message, "success");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi cập nhật chế độ lưu trữ của nhân viên.", "error");
    } finally {
      keepLockRef.current = false;
    }
  };

  const handleToggleLockAccount = async (actorId, currentLocked) => {
    if (!actorId || actorId === "SYSTEM" || actorId === "admin" || accLockRef.current) return;
    accLockRef.current = true;
    const nextLocked = !Boolean(currentLocked);
    try {
      const res = await safePut(`/employees/${actorId}/status`, {
        is_locked: nextLocked ? 1 : 0,
        status: nextLocked ? "inactive" : "active"
      });
      if (res?.success) {
        setLogs((prev) =>
          prev.map((item) => (item.actor_id === actorId ? { ...item, is_locked: nextLocked ? 1 : 0 } : item))
        );
        if (showToast) {
          showToast(
            nextLocked
              ? `Đã tạm khóa khẩn cấp tài khoản nhân viên ${actorId}!`
              : `Đã mở khóa tài khoản nhân viên ${actorId}!`,
            nextLocked ? "warning" : "success"
          );
        }
        if (onRefreshAlerts) onRefreshAlerts();
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Không thể khóa/mở khóa tài khoản.", "error");
    } finally {
      accLockRef.current = false;
    }
  };

  const handleRunCleanup = async (newDays = retentionDays) => {
    if (cleanupLockRef.current) return;
    cleanupLockRef.current = true;
    setCleaning(true);
    try {
      const res = await safePost("/audit-logs/cleanup", { retention_days: Number(newDays) });
      if (res?.success) {
        if (showToast) {
          showToast(
            `Đã lưu chu kỳ ${res.retention_days} ngày & dọn dẹp ${res.deleted_count} bản ghi cũ (Bảo toàn log đã ghim & NV giữ lịch sử)!`,
            "success"
          );
        }
        fetchLogs();
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi dọn dẹp nhật ký.", "error");
    } finally {
      cleanupLockRef.current = false;
      setCleaning(false);
    }
  };

const ACTION_LABELS = {
  CRITICAL_FRAUD: "Cảnh báo chấm công bất thường",
  CHECK_IN_1TOUCH: "Chấm công vào ca",
  CHECK_OUT_1TOUCH: "Chấm công tan ca",
  PROXY_CHECK_IN: "Chấm công hộ / Điểm danh nhanh",
  UPDATE_ATTENDANCE: "Chỉnh sửa bảng chấm công",
  LOCK_ATTENDANCE_PERIOD: "Chốt kỳ chấm công",
  UNLOCK_ATTENDANCE_PERIOD: "Mở lại kỳ chấm công",
  LOGIN_SUCCESS: "Đăng nhập hệ thống",
  ZALO_AUTO_LOGIN_SUCCESS: "Tự động đăng nhập qua Zalo",
  LOGIN_FAILED: "Đăng nhập sai mật khẩu / tài khoản",
  LOGIN_RATE_LIMITED: "Tạm khóa đăng nhập do thử sai nhiều lần",
  ACCOUNT_UNDER_DISTRIBUTED_ATTACK: "Cảnh báo thử đăng nhập bất thường",
  ADMIN_LOGIN_SUCCESS: "Quản trị viên đăng nhập",
  ADMIN_LOGIN_FAILED: "Quản trị viên đăng nhập thất bại",
  ADMIN_REGISTER: "Tạo tài khoản quản trị mới",
  CHANGE_PASSWORD: "Đổi mật khẩu tài khoản",
  STAGED_FORCE_PASSWORD_CHANGE: "Yêu cầu đổi mật khẩu định kỳ",
  CREATE_REQUEST: "Gửi đơn xin nghỉ / tăng ca",
  APPROVE_REQUEST: "Duyệt đơn từ nhân viên",
  REJECT_REQUEST: "Từ chối đơn từ nhân viên",
  CANCEL_REQUEST: "Hủy đơn từ đã gửi",
  REGISTER_PRE_OT: "Đăng ký làm thêm giờ (OT)",
  APPROVE_OT_REGISTRATION: "Duyệt đăng ký làm thêm giờ",
  REJECT_OT_REGISTRATION: "Từ chối đăng ký làm thêm giờ",
  SALARY_CONFIRMED: "Xác nhận phiếu lương",
  SALARY_DISPUTED: "Gửi thắc mắc / khiếu nại lương",
  RESOLVE_SALARY_DISPUTE: "Giải quyết thắc mắc bảng lương",
  APPROVE_PAYROLL: "Chốt & duyệt bảng lương tháng",
  UPDATE_PAYMENT_STATUS: "Cập nhật trạng thái chi trả lương",
  UPDATE_COMPANY_SETTINGS: "Cập nhật cài đặt công ty",
  UPDATE_ACCOUNTANT_PERMISSIONS: "Phân quyền cho kế toán",
  TOGGLE_EMPLOYEE_KEEP_LOGS: "Cài đặt giữ lịch sử nhân viên",
  CREATE_EMPLOYEE: "Thêm nhân viên mới",
  UPDATE_EMPLOYEE: "Cập nhật hồ sơ nhân viên",
  UPDATE_EMPLOYEE_STATUS: "Đổi trạng thái làm việc nhân viên",
  UPDATE_EMPLOYEE_ROLE: "Thay đổi vai trò nhân viên",
  DELETE_EMPLOYEE: "Xóa hồ sơ nhân viên",
  BIND_DEVICE_AUTO: "Liên kết điện thoại chấm công",
  BIND_ZALO: "Liên kết tài khoản Zalo",
  REQUEST_DEVICE_CHANGE: "Gửi yêu cầu đổi điện thoại chấm công",
  APPROVE_DEVICE_CHANGE: "Duyệt đổi điện thoại chấm công",
  REJECT_DEVICE_CHANGE: "Từ chối đổi điện thoại chấm công",
  SET_DEVICE_BINDING_MODE: "Đổi chế độ khóa thiết bị chấm công",
};

const getActionLabel = (action) => ACTION_LABELS[action] || "Thao tác hệ thống";

const formatAuditDateTime = (rawDate) => {
  if (!rawDate) return "--";
  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) return "--";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} - Ngày ${pad(d.getDate())}/${pad(
    d.getMonth() + 1
  )}/${d.getFullYear()}`;
};

const KEY_VI_MAP = {
  ma_nv: "Mã nhân viên",
  ho_ten: "Họ tên",
  month: "Tháng",
  year: "Năm",
  work_start: "Giờ vào làm",
  lunch_start: "Bắt đầu nghỉ trưa",
  lunch_end: "Hết nghỉ trưa",
  work_end: "Giờ tan ca",
  standard_work_days: "Số ngày công chuẩn",
  locations_count: "Số địa điểm chấm công",
  office_ip_whitelist: "IP Wi-Fi công ty",
  status: "Trạng thái",
  role: "Vai trò",
  date: "Ngày",
  code: "Mã công",
  distance: "Khoảng cách (m)",
  distance_meters: "Khoảng cách (m)",
  method: "Hình thức",
  location_name: "Địa điểm",
  target_ma_nv: "Mã NV liên quan",
  target_employee: "Nhân viên",
  correction_mode: "Loại giải trình",
  check_in_time: "Giờ vào",
  check_out_time: "Giờ ra",
  department: "Khối / Bộ phận",
  note: "Ghi chú",
  days_count: "Số ngày",
};

const ROLE_VI_MAP = {
  admin: "Quản trị viên",
  accountant: "Kế toán",
  worker: "Nhân viên",
};

const formatDetails = (rawDetails, action = "") => {
  if (!rawDetails) return "Đã ghi nhận thao tác.";
  try {
    const obj = typeof rawDetails === "string" ? JSON.parse(rawDetails) : rawDetails;
    if (!obj || typeof obj !== "object") return String(rawDetails);

    if (obj.reason) return String(obj.reason);
    if (obj.message) return String(obj.message);

    if (obj.shift_evaluation) {
      const checkLabel =
        obj.check_type === "CHECK_OUT" || action === "CHECK_OUT_1TOUCH"
          ? "Tan ca"
          : "Vào ca";
      const timePart = obj.time ? ` lúc ${obj.time}` : "";
      const locPart = obj.location_name ? ` tại ${obj.location_name}` : "";
      return `${checkLabel}${timePart}${locPart}: ${obj.shift_evaluation}`;
    }

    if (obj.dispute_reason) {
      return `Thắc mắc bảng lương tháng ${obj.month || "--"}/${obj.year || "--"}: ${obj.dispute_reason}`;
    }

    if (action === "UPDATE_COMPANY_SETTINGS") {
      return `Cập nhật giờ làm ${obj.work_start || "08:00"}–${obj.work_end || "17:30"}, công chuẩn ${
        obj.standard_work_days || 26
      } ngày, ${obj.locations_count || 1} địa điểm chấm công.`;
    }

    if (action === "LOGIN_SUCCESS" || action === "ZALO_AUTO_LOGIN_SUCCESS" || action === "ADMIN_LOGIN_SUCCESS") {
      const roleVi = ROLE_VI_MAP[obj.role] || "Nhân viên";
      return `Đăng nhập thành công với vai trò ${roleVi}.`;
    }

    if (action === "SALARY_CONFIRMED") {
      return `Nhân viên đã xác nhận đúng bảng lương tháng ${obj.month || "--"}/${obj.year || "--"}.`;
    }

    const parts = Object.entries(obj)
      .filter(([k, val]) => Boolean(KEY_VI_MAP[k]) && val !== null && val !== undefined && val !== "" && typeof val !== "object")
      .slice(0, 4)
      .map(([k, v]) => {
        const label = KEY_VI_MAP[k];
        const formattedVal = k === "role" ? ROLE_VI_MAP[v] || "Nhân viên" : v;
        return `${label}: ${formattedVal}`;
      });

    return parts.length > 0 ? parts.join(" • ") : getActionLabel(action);
  } catch {
    const str = String(rawDetails).trim();
    if (str.startsWith("{") && str.endsWith("}")) {
      return getActionLabel(action);
    }
    return str;
  }
};

  const filtered = logs.filter((l) => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(l.action || "").toLowerCase().includes(q) ||
      String(l.actor_id || "").toLowerCase().includes(q) ||
      String(l.ho_ten || "").toLowerCase().includes(q) ||
      String(l.details || "").toLowerCase().includes(q)
    );
  });

  const selectedEmpObj = employees.find((e) => e.ma_nv === selectedEmp);

  return (
    <div className="space-y-4">
      {/* Header & Cấu hình Tự động Xóa Dữ liệu Quá hạn (Auto-Retention Cleanup) */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Nhật ký hoạt động & Kiểm tra chấm công
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ghi vết thời gian thực theo từng mã nhân viên • Tự động dọn dẹp bảo vệ dung lượng TiDB Cloud
            </p>
          </div>

          {/* Chu kỳ tự động xóa log quá hạn */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 border border-slate-700 p-2 rounded-xl">
            <span className="text-[11px] font-bold text-slate-300 pl-1">Tự xóa sau:</span>
            <select
              value={retentionDays}
              onChange={(e) => {
                const val = Number(e.target.value);
                setRetentionDays(val);
                handleRunCleanup(val);
              }}
              className="bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs font-black text-amber-300"
            >
              <option value={15}>15 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={60}>60 ngày</option>
              <option value={90}>90 ngày</option>
            </select>
            <button
              type="button"
              onClick={() => handleRunCleanup(retentionDays)}
              disabled={cleaning}
              className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition"
              title="Dọn dẹp ngay các log cũ (Trừ log đã ghim 📌 hoặc nhân viên bật Giữ toàn bộ lịch sử 🔒)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{cleaning ? "Đang dọn..." : "Dọn Log Quá Hạn"}</span>
            </button>
          </div>
        </div>

        {/* Thanh Bộ Lọc Đa Chiều (Nhân viên / Phân loại / Từ ngày - Đến ngày / Ghim) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t border-slate-700/60">
          {/* Lọc theo Nhân viên */}
          <select
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold"
          >
            <option value="">👤 Tất cả nhân sự ({employees.length})</option>
            {employees.map((emp) => (
              <option key={emp.ma_nv} value={emp.ma_nv}>
                {emp.ma_nv} — {emp.ho_ten} {emp.keep_logs ? "(🔒 Giữ LS)" : ""}
              </option>
            ))}
          </select>

          {/* Lọc theo Danh mục hành động */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold"
          >
            <option value="">📂 Tất cả loại hành động</option>
            <option value="fraud">🚨 Cảnh báo chấm công bất thường (Sai vị trí / Thiết bị lạ)</option>
            <option value="attendance">⏱️ Chấm công Vào ca / Ra ca</option>
            <option value="requests">📝 Đơn từ & Đăng ký Tăng ca</option>
            <option value="payroll">💰 Xác nhận & Khiếu nại Lương</option>
            <option value="auth_device">🔐 Đăng nhập & Đổi thiết bị</option>
          </select>

          {/* Từ ngày - Đến ngày (Bố cục ngang gọn trên Mobile) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5">
              <span className="text-xs font-semibold text-slate-300 shrink-0">Từ ngày</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-36 sm:w-40 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm font-semibold text-white text-center"
              />
            </div>
            <div className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5">
              <span className="text-xs font-semibold text-slate-300 shrink-0">Đến ngày</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-36 sm:w-40 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm font-semibold text-white text-center"
              />
            </div>
          </div>

          {/* Ô tìm kiếm từ khóa */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã NV, nội dung..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500"
            />
          </div>

          {/* Nút lọc Đã ghim & Làm mới */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPinnedOnly(!pinnedOnly)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition ${
                pinnedOnly
                  ? "bg-amber-500/20 border-amber-400 text-amber-300"
                  : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Pin className="w-3.5 h-3.5" />
              <span>Đã ghim</span>
            </button>
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="p-2 bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl transition-colors"
              title="Tải lại nhật ký"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Nếu đang chọn 1 nhân viên cụ thể: Hiện thanh công tắc "🔒 Giữ toàn bộ lịch sử của nhân viên này" */}
        {selectedEmpObj && (
          <div className="p-3 rounded-xl bg-indigo-950/50 border border-indigo-500/40 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs">
              <span className="font-black text-white">
                Nhân sự đang chọn: {selectedEmpObj.ho_ten} ({selectedEmpObj.ma_nv})
              </span>
              <span className="block text-[11px] text-indigo-200">
                Khi bật giữ lịch sử, toàn bộ hoạt động của nhân viên này sẽ được miễn trừ khỏi tiến trình tự động xóa định kỳ.
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleToggleKeepEmployeeLogs(selectedEmpObj.ma_nv, selectedEmpObj.keep_logs)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black border flex items-center gap-1.5 transition ${
                selectedEmpObj.keep_logs
                  ? "bg-emerald-600 text-white border-emerald-400 shadow-md"
                  : "bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700"
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {selectedEmpObj.keep_logs
                  ? "🔒 Đang Giữ Toàn Bộ Lịch Sử NV Này (Bấm để tắt)"
                  : "🔒 Bật Giữ Toàn Bộ Lịch Sử NV Này"}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Bảng Danh Sách Nhật Ký Kiểm Toán & Cảnh Báo Đỏ */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            Đang tải dữ liệu giám sát hoạt động...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-rose-400 text-xs flex items-center justify-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            Không có bản ghi hoạt động nào khớp với bộ lọc hiện tại.
          </div>
        ) : (
          <div className="overflow-x-auto touch-scroll-x">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 border-b border-slate-700/80 text-slate-400 uppercase tracking-wider font-bold">
                <tr>
                  <th className="p-3.5 pl-4">Thời Gian</th>
                  <th className="p-3.5">Nhân Viên</th>
                  <th className="p-3.5">Hành Động</th>
                  <th className="p-3.5">Chi Tiết Hoạt Động / Vi Phạm</th>
                  <th className="p-3.5 text-center">Bảo Toàn & Xử Lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50 text-slate-200">
                {filtered.map((log, idx) => {
                  const isFraud = log.action === "CRITICAL_FRAUD" || log.resource === "attendance_security";
                  const isPinned = Boolean(log.is_pinned);
                  const isKeepEmp = Boolean(log.keep_logs);
                  const isEmpLocked = Boolean(log.is_locked);

                  return (
                    <tr
                      key={log.id || idx}
                      className={`transition-colors ${
                        isFraud
                          ? "bg-rose-950/50 hover:bg-rose-900/40"
                          : isPinned
                          ? "bg-amber-950/25 hover:bg-amber-900/20"
                          : "hover:bg-slate-700/30"
                      }`}
                    >
                      <td className="p-3.5 pl-4 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                        {formatAuditDateTime(log.created_at)}
                      </td>

                      <td className="p-3.5">
                        <div className="font-black text-white flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>{log.ho_ten || log.actor_id || "Hệ thống"}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                          <span>Mã: {log.actor_id || "HT"}</span>
                          {isKeepEmp && (
                            <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded font-sans font-bold">
                              🔒 Giữ LS
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-black text-[11px] border ${
                            isFraud
                              ? "bg-rose-600 text-white border-rose-400 shadow-sm"
                              : log.action?.includes("DISPUTED")
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              : "bg-blue-500/15 border-blue-500/30 text-blue-300"
                          }`}
                        >
                          {isFraud && <ShieldAlert className="w-3.5 h-3.5" />}
                          {getActionLabel(log.action)}
                        </span>
                      </td>

                      <td className="p-3.5 max-w-md text-slate-200 font-medium leading-relaxed">
                        {formatDetails(log.details, log.action)}
                      </td>

                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Nút Ghim dòng lịch sử */}
                          <button
                            type="button"
                            onClick={() => handleTogglePin(log)}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 transition ${
                              isPinned
                                ? "bg-amber-500 text-slate-950 border-amber-300 font-black"
                                : "bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-700"
                            }`}
                            title="📌 Ghim giữ lại lịch sử này vĩnh viễn"
                          >
                            <Pin className="w-3 h-3" />
                            <span>{isPinned ? "Đã ghim" : "Ghim"}</span>
                          </button>

                          {/* Nút Giữ toàn bộ lịch sử nhân viên */}
                          {log.actor_id && log.actor_id !== "admin" && log.actor_id !== "system" && (
                            <button
                              type="button"
                              onClick={() => handleToggleKeepEmployeeLogs(log.actor_id, isKeepEmp)}
                              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 transition ${
                                isKeepEmp
                                  ? "bg-indigo-600 text-white border-indigo-400"
                                  : "bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-700"
                              }`}
                              title="🔒 Giữ toàn bộ lịch sử của nhân viên này"
                            >
                              <Lock className="w-3 h-3" />
                              <span className="hidden sm:inline">{isKeepEmp ? "Giữ NV" : "Lưu NV"}</span>
                            </button>
                          )}

                          {/* Nút Khóa nóng tài khoản khi phát hiện Gian lận */}
                          {isFraud && log.actor_id && log.actor_id !== "admin" && (
                            <button
                              type="button"
                              onClick={() => handleToggleLockAccount(log.actor_id, isEmpLocked)}
                              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black border flex items-center gap-1 transition ${
                                isEmpLocked
                                  ? "bg-slate-700 text-emerald-300 border-emerald-500/40"
                                  : "bg-rose-600 hover:bg-rose-500 text-white border-rose-400"
                              }`}
                            >
                              {isEmpLocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                              <span>{isEmpLocked ? "Mở khóa NV" : "Khóa NV"}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
