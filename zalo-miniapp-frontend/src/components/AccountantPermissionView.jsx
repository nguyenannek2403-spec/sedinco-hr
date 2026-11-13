import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  Save, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  FileText, 
  DollarSign, 
  Users, 
  Settings, 
  Lock
} from "lucide-react";
import { safeGet, safePut } from "../utils/api";
import { getRoleLabel, getAuditActionLabel } from "../utils/viLabels";

const CATEGORY_META = {
  attendance: { label: "1. Nghiệp Vụ Chấm Công", icon: Calendar, color: "text-blue-600 bg-blue-50" },
  requests: { label: "2. Phê Duyệt Đơn Từ", icon: FileText, color: "text-amber-600 bg-amber-50" },
  payroll: { label: "3. Nghiệp Vụ Tiền Lương", icon: DollarSign, color: "text-emerald-600 bg-emerald-50" },
  employee: { label: "4. Quản Lý Hồ Sơ Nhân Sự", icon: Users, color: "text-purple-600 bg-purple-50" },
  reports: { label: "5. Báo Cáo & Thống Kê", icon: Settings, color: "text-indigo-600 bg-indigo-50" },
  settings: { label: "6. Cấu Hình Công Ty & Ca Làm", icon: Settings, color: "text-slate-600 bg-slate-50" },
  security: { label: "7. Tài Khoản & Bảo Mật", icon: Lock, color: "text-rose-600 bg-rose-50" }
};

const DEFAULT_PRESETS = {
  attendance_view_all: true,
  attendance_summarize: true,
  attendance_edit: false,
  attendance_lock: false,
  leave_view_all: true,
  leave_approve: false,
  attendance_request_approve: false,
  payroll_view_all: true,
  payroll_calculate: true,
  payroll_export: true,
  payroll_approve: false,
  employee_view: true,
  employee_edit: false,
  report_view: true
};

export default function AccountantPermissionView({ showToast }) {
  const [permissions, setPermissions] = useState([]);
  const [permMap, setPermMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = React.useRef(false);
  const [message, setMessage] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  // Tải danh sách quyền hiện tại từ Backend
  const loadPermissions = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await safeGet("/settings/accountant-permissions");
      if (res && res.success && res.data) {
        setPermissions(res.data);
        const map = {};
        res.data.forEach(p => {
          map[p.permission_key] = Boolean(p.is_enabled);
        });
        setPermMap(map);
      }
    } catch (err) {
      setMessage({ type: "error", text: "Không thể tải cấu hình quyền: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  // Tải lịch sử audit log
  const loadAuditLogs = async () => {
    try {
      const res = await safeGet("/settings/audit-logs?limit=5");
      if (res && res.success && res.data) {
        setAuditLogs(res.data);
      }
    } catch (err) {
      console.warn("Lỗi tải audit logs:", err);
    }
  };

  useEffect(() => {
    loadPermissions();
    loadAuditLogs();
  }, []);

  const handleToggle = (key) => {
    setPermMap(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleApplyPreset = () => {
    if (savingRef.current) return;
    setPermMap(prev => {
      const updated = { ...prev };
      // Đặt tất cả về false trước
      Object.keys(updated).forEach(k => {
        updated[k] = false;
      });
      // Áp dụng 13 quyền chuẩn mặc định
      Object.entries(DEFAULT_PRESETS).forEach(([k, v]) => {
        updated[k] = v;
      });
      return updated;
    });
    const infoMsg = "Đã nạp bộ 13 quyền Kế toán mặc định (Chưa lưu vào DB. Nhấn 'Lưu phân quyền' để áp dụng).";
    setMessage({ type: "info", text: infoMsg });
    if (showToast) showToast(infoMsg, "info");
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const res = await safePut("/settings/accountant-permissions", { permissions: permMap });
      if (res && res.success) {
        const okMsg = "Lưu cấu hình phân quyền Kế toán thành công! Hệ thống đã cập nhật tức thì.";
        setMessage({ type: "success", text: okMsg });
        if (showToast) showToast(okMsg, "success");
        loadPermissions();
        loadAuditLogs();
      } else {
        const errMsg = res?.message || "Lưu thất bại";
        setMessage({ type: "error", text: errMsg });
        if (showToast) showToast(errMsg, "error");
      }
    } catch (err) {
      const errMsg = "Lỗi kết nối khi lưu: " + err.message;
      setMessage({ type: "error", text: errMsg });
      if (showToast) showToast(errMsg, "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Gom nhóm theo category
  const grouped = permissions.reduce((acc, p) => {
    const cat = p.category || "settings";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-28">
      {/* Header card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 rounded-2xl p-5 sm:p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-300 text-xs font-semibold rounded-full border border-blue-400/30 mb-2">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Quản trị viên — Cấu hình phân quyền</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold leading-snug">Phân quyền nghiệp vụ Kế toán</h2>
          <p className="text-slate-300 text-sm leading-relaxed mt-1 max-w-xl">
            Quản trị viên có toàn quyền bật hoặc tắt từng nghiệp vụ của Kế toán. Mọi thay đổi được áp dụng ngay lập tức theo nguyên tắc cấp quyền vừa đủ nhu cầu công việc.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleApplyPreset}
            disabled={saving || loading}
            className="min-h-[42px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition flex items-center gap-2 shadow-sm disabled:opacity-50 whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>Cấu hình mặc định</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="min-h-[42px] px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
          >
            <Save className="w-4 h-4 shrink-0" />
            <span>{saving ? "Đang lưu..." : "Lưu phân quyền"}</span>
          </button>
        </div>
      </div>

      {/* Thông báo kết quả */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
          message.type === "success" 
            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
            : message.type === "error"
            ? "bg-rose-50 text-rose-800 border border-rose-200"
            : "bg-blue-50 text-blue-800 border border-blue-200"
        }`}>
          {message.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-500 shadow-sm border border-slate-100">
          <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
          Đang tải danh sách phân quyền từ máy chủ...
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, items]) => {
            const meta = CATEGORY_META[category] || { label: category, icon: Settings, color: "text-slate-600 bg-slate-50" };
            const Icon = meta.icon;
            const enabledCount = items.filter(p => permMap[p.permission_key]).length;

            return (
              <div key={category} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden transition hover:shadow-md">
                <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${meta.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-base">{meta.label}</h3>
                      <p className="text-xs text-slate-500">Đang bật: <span className="font-semibold text-blue-600">{enabledCount}</span> / {items.length} quyền</p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {items.map(p => {
                    const isChecked = Boolean(permMap[p.permission_key]);
                    return (
                      <div 
                        key={p.permission_key}
                        onClick={() => handleToggle(p.permission_key)}
                        className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50/50 cursor-pointer transition select-none"
                      >
                        <div className="pr-3 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900 text-sm sm:text-base leading-snug break-words">{p.permission_name}</span>
                          </div>
                          {p.description && (
                            <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed break-words">{p.description}</p>
                          )}
                        </div>

                        {/* Switch button */}
                        <div className="shrink-0">
                          <div className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out ${
                            isChecked ? "bg-blue-600" : "bg-slate-300"
                          }`}>
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                              isChecked ? "translate-x-5" : "translate-x-0"
                            }`} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Lịch sử Audit Logs thu nhỏ */}
          {auditLogs && auditLogs.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
              <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                Lịch Sử Kiểm Toán Thay Đổi Quyền Gần Đây
              </h3>
              <div className="space-y-2">
                {auditLogs.map(log => (
                  <div key={log.id} className="text-xs bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div className="min-w-0 break-words leading-relaxed">
                      <span className="font-semibold text-slate-800">{log.actor_id}</span>{" "}
                      <span className="text-slate-500">({getRoleLabel(log.actor_role)})</span> —{" "}
                      <span className="font-semibold text-blue-700">{getAuditActionLabel(log.action)}</span>
                      <span className="text-slate-600 block mt-0.5">
                        {(() => {
                          if (!log.details) return "Đã cập nhật thay đổi";
                          if (typeof log.details === "object") {
                            const d = log.details;
                            if (d.message) return d.message;
                            if (d.updated_count !== undefined) return `Đã cập nhật ${d.updated_count} mục phân quyền`;
                            return "Đã ghi nhận cấu hình phân quyền";
                          }
                          const str = String(log.details).trim();
                          if (str.startsWith("{") && str.endsWith("}")) return "Đã ghi nhận cấu hình phân quyền";
                          return str;
                        })()}
                      </span>
                    </div>
                    <span className="text-slate-400 shrink-0 sm:ml-4 whitespace-nowrap">{new Date(log.created_at).toLocaleString("vi-VN")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
