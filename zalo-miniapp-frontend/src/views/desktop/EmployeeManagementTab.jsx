import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Lock,
  Unlock,
  Key,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Edit3
} from "lucide-react";
import { safeGet, safePost, safePut, safeDelete } from "../../utils/api";
import { ROLES, ROLE_LABELS } from "../../constants/roles";

export default function EmployeeManagementTab({ currentUser, showToast }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form thêm nhân sự
  const [form, setForm] = useState({
    ma_nv: "",
    ho_ten: "",
    chuc_danh: "",
    dien_thoai: "",
    email: "",
    role: "worker",
    luong_cb: 8000000,
    has_insurance: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeGet("/employees");
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

  // Khóa / Mở khóa tài khoản
  const handleToggleLock = async (emp) => {
    const isCurrentlyLocked = Boolean(emp.is_locked || emp.status === "inactive");
    const nextStatus = isCurrentlyLocked ? "active" : "inactive";
    const nextLocked = !isCurrentlyLocked;

    if (!window.confirm(`Bạn có chắc chắn muốn ${isCurrentlyLocked ? "MỞ KHÓA" : "TẠM KHÓA"} tài khoản ${emp.ma_nv}?`)) {
      return;
    }

    try {
      const res = await safePut(`/employees/${emp.ma_nv}/status`, {
        status: nextStatus,
        is_locked: nextLocked ? 1 : 0
      });
      if (res?.success) {
        if (showToast) showToast(`Đã ${isCurrentlyLocked ? "mở khóa" : "khóa"} tài khoản ${emp.ma_nv}!`, "success");
        fetchEmployees();
      } else {
        alert(res?.message || "Không thể thay đổi trạng thái tài khoản.");
      }
    } catch (err) {
      alert(err.message || "Lỗi cập nhật trạng thái tài khoản.");
    }
  };

  // Đổi vai trò (Chỉ Quản trị viên)
  const handleChangeRole = async (emp, newRole) => {
    if (newRole === "admin") {
      alert("Cảnh báo an toàn: Không thể gán vai trò Admin qua giao diện này!");
      return;
    }
    if (!window.confirm(`Đổi vai trò nhân viên ${emp.ma_nv} thành "${ROLE_LABELS[newRole]}"?`)) return;

    try {
      const res = await safePut(`/employees/${emp.ma_nv}/role`, { role: newRole });
      if (res?.success) {
        if (showToast) showToast(`Đã cập nhật vai trò ${emp.ma_nv} thành ${ROLE_LABELS[newRole]}!`, "success");
        fetchEmployees();
      } else {
        alert(res?.message || "Không thể đổi vai trò.");
      }
    } catch (err) {
      alert(err.message || "Lỗi kết nối máy chủ.");
    }
  };

  // Kích hoạt đổi mật khẩu hàng loạt
  const handleBatchForcePassword = async () => {
    if (!window.confirm("Kích hoạt cờ YÊU CẦU ĐỔI MẬT KHẨU ở lần đăng nhập tiếp theo cho toàn bộ công nhân?")) {
      return;
    }
    try {
      const res = await safePost("/employees/staged-force-password", { stage: "all" });
      if (res?.success) {
        if (showToast) showToast("Đã kích hoạt đổi mật khẩu cho toàn bộ nhân viên!", "success");
        fetchEmployees();
      } else {
        alert(res?.message || "Lỗi kích hoạt đổi mật khẩu.");
      }
    } catch (err) {
      alert(err.message || "Lỗi máy chủ.");
    }
  };

  // Thêm nhân viên mới
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await safePost("/employees", form);
      if (res?.success) {
        if (showToast) showToast(`Thêm nhân viên ${form.ma_nv} thành công!`, "success");
        setIsAddModalOpen(false);
        setForm({
          ma_nv: "",
          ho_ten: "",
          chuc_danh: "",
          dien_thoai: "",
          email: "",
          role: "worker",
          luong_cb: 8000000,
          has_insurance: true
        });
        fetchEmployees();
      } else {
        alert(res?.message || "Không thể tạo mới nhân viên.");
      }
    } catch (err) {
      alert(err.message || "Lỗi tạo mới nhân sự.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = employees.filter(e => {
    const q = searchQuery.trim().toLowerCase();
    return !q ||
      String(e.ma_nv || "").toLowerCase().includes(q) ||
      String(e.ho_ten || "").toLowerCase().includes(q) ||
      String(e.chuc_danh || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Top Header & Actions */}
      <div className="bg-slate-800/80 border border-slate-700/70 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Quản Lý Hồ Sơ Nhân Sự & Tài Khoản
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Tổng cộng: <strong className="text-white">{employees.length}</strong> nhân sự trong hệ thống
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên, mã NV, chức danh..."
              className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
            />
          </div>

          <button
            onClick={handleBatchForcePassword}
            className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5"
            title="Bắt buộc đổi mật khẩu đợt tới"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Yêu cầu đổi mật khẩu</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-blue-600/30 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Nhân Viên</span>
          </button>

          <button
            onClick={fetchEmployees}
            disabled={loading}
            className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
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
                      <div>
                        <span className="font-black text-sm text-white block">{emp.ho_ten}</span>
                        <span className="text-xs font-mono text-blue-400 font-bold">
                          {emp.ma_nv} • {emp.chuc_danh || "Nhân viên"}
                        </span>
                      </div>
                      {isLocked ? (
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg border bg-rose-500/15 text-rose-400 border-rose-500/30 inline-flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          Đã khóa
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Hoạt động
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                      <span className="text-slate-300 font-mono font-bold">
                        Lương CB: {Number(emp.luong_cb || 0).toLocaleString("vi-VN")} đ
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          value={emp.role || "worker"}
                          onChange={(e) => handleChangeRole(emp, e.target.value)}
                          disabled={emp.role === "admin"}
                          className="min-h-[38px] bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold disabled:opacity-50"
                        >
                          <option value="worker">Công nhân</option>
                          <option value="accountant">Kế toán</option>
                          {emp.role === "admin" && <option value="admin">Quản trị viên</option>}
                        </select>
                        {emp.role !== "admin" && (
                          <button
                            type="button"
                            onClick={() => handleToggleLock(emp)}
                            className={`min-w-[40px] min-h-[38px] p-2 rounded-xl border flex items-center justify-center ${
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
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto touch-scroll-x">
              <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 border-b border-slate-700/80 text-slate-400 uppercase tracking-wider font-bold">
                <tr>
                  <th className="p-3.5 pl-5">Mã NV / Họ Tên</th>
                  <th className="p-3.5">Chức Danh</th>
                  <th className="p-3.5">Vai Trò (Role)</th>
                  <th className="p-3.5">Lương CB</th>
                  <th className="p-3.5">Trạng Thái</th>
                  <th className="p-3.5 text-right pr-5">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50 text-slate-300">
                {filtered.map(emp => {
                  const isLocked = Boolean(emp.is_locked || emp.status === "inactive");
                  const roleLabel = ROLE_LABELS[emp.role] || emp.role;

                  return (
                    <tr key={emp.id || emp.ma_nv} className="hover:bg-slate-700/30 transition-colors">
                      <td className="p-3.5 pl-5">
                        <div className="font-bold text-white">{emp.ho_ten}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{emp.ma_nv}</div>
                      </td>
                      <td className="p-3.5 font-semibold text-slate-200">
                        {emp.chuc_danh || "Nhân viên"}
                      </td>
                      <td className="p-3.5">
                        <select
                          value={emp.role || "worker"}
                          onChange={(e) => handleChangeRole(emp, e.target.value)}
                          disabled={emp.role === "admin"}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                        >
                          <option value="worker">Công nhân</option>
                          <option value="accountant">Kế toán</option>
                          {emp.role === "admin" && <option value="admin">Quản trị viên</option>}
                        </select>
                      </td>
                      <td className="p-3.5 text-slate-300 font-mono font-medium">
                        {Number(emp.luong_cb || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5">
                        {isLocked ? (
                          <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg border bg-rose-500/15 text-rose-400 border-rose-500/30 inline-flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Đã khóa
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Hoạt động
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-right pr-5">
                        {emp.role !== "admin" ? (
                          <button
                            onClick={() => handleToggleLock(emp)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isLocked
                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
                                : "bg-rose-500/15 border-rose-500/30 text-rose-400 hover:bg-rose-500/25"
                            }`}
                            title={isLocked ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                          >
                            {isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">Bảo vệ</span>
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

      {/* Modal Thêm Nhân Sự Mới */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-400" />
              Thêm Nhân Viên Mới
            </h3>

            <form onSubmit={handleAddEmployee} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Mã NV</label>
                  <input
                    type="text"
                    required
                    value={form.ma_nv}
                    onChange={(e) => setForm({ ...form, ma_nv: e.target.value.toUpperCase() })}
                    placeholder="VD: NV025"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Họ và Tên</label>
                  <input
                    type="text"
                    required
                    value={form.ho_ten}
                    onChange={(e) => setForm({ ...form, ho_ten: e.target.value })}
                    placeholder="Nguyễn Văn A"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Chức Danh</label>
                <input
                  type="text"
                  required
                  value={form.chuc_danh}
                  onChange={(e) => setForm({ ...form, chuc_danh: e.target.value })}
                  placeholder="Công nhân kỹ thuật"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Vai Trò</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="worker">Công nhân</option>
                    <option value="accountant">Kế toán</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Lương Cơ Bản</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={100000}
                    value={form.luong_cb}
                    onChange={(e) => setForm({ ...form, luong_cb: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "Đang lưu..." : "Lưu Nhân Viên"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
