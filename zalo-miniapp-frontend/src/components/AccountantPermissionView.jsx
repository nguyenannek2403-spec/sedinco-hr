import React, { useState, useEffect, useRef } from "react";
import {
  ShieldCheck,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Calendar,
  DollarSign,
  Users,
  Settings,
  Lock
} from "lucide-react";
import { safeGet, safePut } from "../utils/api";
import {
  getRoleLabel,
  getAuditActionLabel,
  ACCOUNTANT_PERMISSION_GROUPS,
  ADMIN_SOD_EXCLUSIVE_ITEMS
} from "../utils/viLabels";
import { ACCOUNTANT_ENFORCED_PERMISSION_KEYS } from "../constants/roles";
import { AppButton, SkeletonList } from "./ui";

const GROUP_ICONS = {
  attendance_requests: Calendar,
  employee_shift: Users,
  payroll: DollarSign,
  config_reports: Settings
};

const DEFAULT_PRESETS = ACCOUNTANT_PERMISSION_GROUPS.reduce((acc, g) => {
  g.items.forEach((item) => {
    acc[item.key] = Boolean(item.defaultEnabled);
  });
  return acc;
}, {});

export default function AccountantPermissionView({ showToast }) {
  const [permissions, setPermissions] = useState([]);
  const [permMap, setPermMap] = useState(DEFAULT_PRESETS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  // Tải danh sách quyền hiện tại từ Backend
  const loadPermissions = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await safeGet("/settings/accountant-permissions");
      if (res && res.success && Array.isArray(res.data)) {
        setPermissions(res.data);
        const map = { ...DEFAULT_PRESETS };
        res.data.forEach((p) => {
          if (p?.permission_key) {
            map[p.permission_key] = Boolean(p.is_enabled);
          }
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
    setPermMap((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleApplyPreset = () => {
    if (savingRef.current) return;
    setPermMap((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((k) => {
        updated[k] = false;
      });
      Object.entries(DEFAULT_PRESETS).forEach(([k, v]) => {
        updated[k] = v;
      });
      return updated;
    });
    const presetCount = ACCOUNTANT_ENFORCED_PERMISSION_KEYS.length;
    const infoMsg = `Đã nạp bộ ${presetCount} quyền Kế toán mặc định (Bấm 'Lưu phân quyền' để áp dụng).`;
    setMessage({ type: "info", text: infoMsg });
    if (showToast) showToast(infoMsg, "info");
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const payloadMap = {};
      ACCOUNTANT_ENFORCED_PERMISSION_KEYS.forEach((key) => {
        payloadMap[key] = Boolean(permMap[key]);
      });
      const res = await safePut("/settings/accountant-permissions", { permissions: payloadMap });
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

  const serverDescMap = permissions.reduce((acc, p) => {
    if (p?.permission_key) acc[p.permission_key] = p;
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-28">
      {/* Header card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 rounded-2xl p-5 sm:p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-300 text-xs font-semibold rounded-full border border-blue-400/30 mb-2">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Quản trị viên — Cấu hình phân quyền 1:1 ({ACCOUNTANT_ENFORCED_PERMISSION_KEYS.length} quyền thực thi)</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold leading-snug">Phân quyền nghiệp vụ Kế toán</h2>
          <p className="text-slate-300 text-sm leading-relaxed mt-1 max-w-xl">
            Quản trị viên bật hoặc tắt từng quyền nghiệp vụ của Kế toán. Toàn bộ công tắc khớp trực tiếp 1:1 với lớp kiểm soát quyền hạn trên máy chủ.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <AppButton
            variant="secondary"
            tone="dark"
            icon={RotateCcw}
            disabled={saving || loading}
            onClick={handleApplyPreset}
            className="text-sm"
          >
            Cấu hình mặc định
          </AppButton>
          <AppButton
            variant="primary"
            icon={Save}
            loading={saving}
            disabled={loading}
            loadingText="Đang lưu..."
            onClick={handleSave}
            className="text-sm"
          >
            Lưu phân quyền
          </AppButton>
        </div>
      </div>

      {/* Thông báo kết quả */}
      {message && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : message.type === "error"
                ? "bg-rose-50 text-rose-800 border border-rose-200"
                : "bg-blue-50 text-blue-800 border border-blue-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="leading-snug break-words">{message.text}</span>
        </div>
      )}

      {loading ? (
        <SkeletonList rows={4} label="Đang tải danh sách phân quyền từ máy chủ..." />
      ) : (
        <div className="space-y-6">
          {ACCOUNTANT_PERMISSION_GROUPS.map((group) => {
            const Icon = GROUP_ICONS[group.id] || Settings;
            const enabledCount = group.items.filter((item) => permMap[item.key]).length;

            return (
              <div
                key={group.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden transition hover:shadow-md"
              >
                <div className="px-4 sm:px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0 ${group.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-800 text-base leading-snug break-words">{group.label}</h3>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug break-words">
                        Đang bật: <span className="font-semibold text-blue-600">{enabledCount}</span> / {group.items.length} quyền • {group.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {group.items.map((item) => {
                    const isChecked = Boolean(permMap[item.key]);
                    const srvMeta = serverDescMap[item.key];
                    const displayDesc = item.desc || srvMeta?.description;
                    return (
                      <div
                        key={item.key}
                        className="perf-list-item px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition"
                      >
                        <div className="pr-2 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900 text-sm sm:text-base leading-snug break-words">
                              {item.name}
                            </span>
                            {item.sodWarning && (
                              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold leading-snug">
                                {item.sodWarning}
                              </span>
                            )}
                          </div>
                          {displayDesc && (
                            <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed break-words">
                              {displayDesc}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(isChecked)}
                          aria-label={item.name}
                          onClick={() => handleToggle(item.key)}
                          className="shrink-0 min-w-[44px] min-h-[44px] inline-flex items-center justify-end rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                        >
                          <div
                            className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out ${
                              isChecked ? "bg-blue-600" : "bg-slate-300"
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                                isChecked ? "translate-x-5" : "translate-x-0"
                              }`}
                            />
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Chốt chặn Phân tách Nhiệm vụ (Độc quyền Ban Giám Đốc) */}
          <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-4 sm:p-6 space-y-3">
            <div className="flex items-center gap-2.5 text-amber-950 font-bold text-sm sm:text-base">
              <Lock className="w-5 h-5 text-amber-700 shrink-0" />
              <span>Chốt chặn Phân tách Nhiệm vụ (Độc quyền Quản trị viên / Giám đốc)</span>
            </div>
            <p className="text-xs sm:text-sm text-amber-900 leading-relaxed">
              Các chức năng quản trị tối cao dưới đây luôn được khóa cứng chỉ dành riêng cho Giám đốc, không cho phép Kế toán tự ý thao tác để bảo đảm kiểm soát nội bộ:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ADMIN_SOD_EXCLUSIVE_ITEMS.map((sod, idx) => (
                <div key={idx} className="bg-white/90 border border-amber-200 rounded-xl p-3 space-y-1">
                  <div className="text-xs sm:text-sm font-bold text-slate-900">{sod.name}</div>
                  <p className="text-xs text-slate-600 leading-relaxed">{sod.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Lịch sử Audit Logs thu nhỏ */}
          {auditLogs && auditLogs.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-sm">
              <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Lịch sử thay đổi quyền gần đây</span>
              </h3>
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="perf-list-item text-xs bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                  >
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
                            if (d.changed_count !== undefined) return `Đã cập nhật ${d.changed_count} mục phân quyền`;
                            if (d.updated_count !== undefined) return `Đã cập nhật ${d.updated_count} mục phân quyền`;
                            return "Đã ghi nhận cấu hình phân quyền";
                          }
                          const str = String(log.details).trim();
                          if (str.startsWith("{") && str.endsWith("}")) return "Đã ghi nhận cấu hình phân quyền";
                          return str;
                        })()}
                      </span>
                    </div>
                    <span className="text-slate-400 shrink-0 sm:ml-4 whitespace-nowrap">
                      {log.created_at ? new Date(log.created_at).toLocaleString("vi-VN") : ""}
                    </span>
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
