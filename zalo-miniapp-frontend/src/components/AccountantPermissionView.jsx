import React, { useState, useEffect, useRef, useCallback } from "react";
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
  Lock,
  ChevronDown,
  Loader2,
  History
} from "lucide-react";
import { safeGet, safePut } from "../utils/api";
import {
  getRoleLabel,
  getAuditActionLabel,
  ACCOUNTANT_PERMISSION_GROUPS,
  ADMIN_SOD_EXCLUSIVE_ITEMS
} from "../utils/viLabels";
import { ACCOUNTANT_ENFORCED_PERMISSION_KEYS } from "../constants/roles";
import { SkeletonList, Switch } from "./ui";

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

const COMPACT_BTN_BASE =
  "w-fit h-[36px] min-h-[36px] px-3.5 text-[13.5px] font-semibold rounded-lg whitespace-nowrap inline-flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-60 shrink-0";

function SmartAccordion({
  id,
  title,
  summary,
  icon: Icon,
  iconColor = "text-[#E11D48] dark:text-rose-300",
  iconBg = "bg-[#FFE4E6] dark:bg-rose-950/60",
  isOpen,
  isDirty = false,
  onToggle,
  children
}) {
  return (
    <div
      data-testid={`permission-accordion-${id}`}
      data-open={isOpen ? "true" : "false"}
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/85 dark:border-slate-800 shadow-xs overflow-hidden transition-all"
    >
      <button
        type="button"
        data-testid={`permission-accordion-header-${id}`}
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-2.5 py-3 px-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className={`w-8 h-8 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 leading-tight truncate">
              {title}
            </h3>
            <p
              data-testid={`permission-accordion-summary-${id}`}
              className="text-[12px] text-slate-500 dark:text-slate-400 truncate mt-0.5 leading-snug"
            >
              {summary}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isDirty && (
            <span
              data-testid={`unsaved-badge-${id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-[11px] font-semibold whitespace-nowrap"
            >
              ● Chưa lưu
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 shrink-0 ${
              isOpen ? "rotate-180" : "rotate-0"
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="px-3.5 pb-3.5 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

export default function AccountantPermissionView({ showToast }) {
  const [permissions, setPermissions] = useState([]);
  const [permMap, setPermMap] = useState(DEFAULT_PRESETS);
  const [savedPermMap, setSavedPermMap] = useState(DEFAULT_PRESETS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  // Mobile (< 768px): Single-Open; Desktop (>= 768px): Multi-Open
  const [openSections, setOpenSections] = useState(() => {
    const initial = {};
    ACCOUNTANT_PERMISSION_GROUPS.forEach((g, idx) => {
      initial[g.id] = idx === 0;
    });
    initial.audit_history = false;
    return initial;
  });

  const toggleSection = useCallback((id) => {
    const isMobileViewport =
      typeof window !== "undefined" && Number(window.innerWidth) < 768;
    setOpenSections((prev) => {
      const nextState = !prev[id];
      if (isMobileViewport) {
        const nextMap = {};
        ACCOUNTANT_PERMISSION_GROUPS.forEach((g) => {
          nextMap[g.id] = false;
        });
        nextMap.audit_history = false;
        nextMap[id] = nextState;
        return nextMap;
      }
      return {
        ...prev,
        [id]: nextState
      };
    });
  }, []);

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
        setSavedPermMap(map);
      }
    } catch (err) {
      setMessage({ type: "error", text: "Không thể tải cấu hình quyền: " + err.message });
    } finally {
      setLoading(false);
    }
  };

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
        setSavedPermMap({ ...permMap });
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

  const isGroupDirty = (group) =>
    group.items.some((item) => Boolean(permMap[item.key]) !== Boolean(savedPermMap[item.key]));

  const isAnyDirty = ACCOUNTANT_ENFORCED_PERMISSION_KEYS.some(
    (key) => Boolean(permMap[key]) !== Boolean(savedPermMap[key])
  );

  const totalEnabledCount = ACCOUNTANT_ENFORCED_PERMISSION_KEYS.filter((k) =>
    Boolean(permMap[k])
  ).length;

  return (
    <div className="max-w-3xl mx-auto pb-6 space-y-2.5 sm:space-y-3">
      {/* 1. Thanh chọn đối tượng / bộ công cụ đầu mục: đúng 1 hàng ngang cao 40px */}
      <div className="h-[40px] min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/85 dark:border-slate-800 shadow-xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ShieldCheck className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />
          <span className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 truncate">
            Phân quyền Kế toán
          </span>
          <span className="text-[12px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
            • Bật {totalEnabledCount}/{ACCOUNTANT_ENFORCED_PERMISSION_KEYS.length}
          </span>
          {isAnyDirty && (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-[11px] font-semibold whitespace-nowrap">
              ● Chưa lưu
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={saving || loading}
            onClick={handleApplyPreset}
            className="w-fit h-[30px] min-h-[30px] px-2.5 text-[12.5px] font-semibold rounded-lg whitespace-nowrap inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer disabled:opacity-60"
          >
            <RotateCcw className="w-3 h-3 shrink-0" />
            <span>Mặc định</span>
          </button>
          {isAnyDirty && (
            <button
              type="button"
              disabled={saving || loading}
              onClick={handleSave}
              className="w-fit h-[30px] min-h-[30px] px-2.5 text-[12.5px] font-semibold rounded-lg whitespace-nowrap inline-flex items-center gap-1 bg-[#E11D48] hover:bg-[#BE123C] text-white shadow-xs transition cursor-pointer disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              ) : (
                <Save className="w-3 h-3 shrink-0" />
              )}
              <span>{saving ? "Đang lưu..." : "Lưu phân quyền"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Thông báo kết quả gọn */}
      {message && (
        <div
          className={`px-3 py-2.5 rounded-xl flex items-center gap-2 text-[13px] font-medium ${
            message.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/70"
              : message.type === "error"
                ? "bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/70"
                : "bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/70"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span className="leading-snug break-words">{message.text}</span>
        </div>
      )}

      {loading ? (
        <SkeletonList rows={4} label="Đang tải danh sách phân quyền từ máy chủ..." />
      ) : (
        <div className="space-y-2.5 sm:space-y-3">
          {/* 2. Các khối Smart Accordion theo nhóm nghiệp vụ */}
          {ACCOUNTANT_PERMISSION_GROUPS.map((group) => {
            const Icon = GROUP_ICONS[group.id] || Settings;
            const enabledCount = group.items.filter((item) => Boolean(permMap[item.key])).length;
            const groupDirty = isGroupDirty(group);

            return (
              <SmartAccordion
                key={group.id}
                id={group.id}
                title={group.label}
                summary={`Đang bật ${enabledCount} / ${group.items.length} quyền • ${group.description}`}
                icon={Icon}
                iconColor="text-[#E11D48] dark:text-rose-300"
                iconBg="bg-[#FFE4E6] dark:bg-rose-950/60"
                isOpen={Boolean(openSections[group.id])}
                isDirty={groupDirty}
                onToggle={toggleSection}
              >
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {group.items.map((item) => {
                    const isChecked = Boolean(permMap[item.key]);
                    const srvMeta = serverDescMap[item.key];
                    const displayDesc = item.desc || srvMeta?.description;
                    return (
                      <div
                        key={item.key}
                        className="py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[14px] font-medium text-slate-900 dark:text-slate-100 leading-snug">
                              {item.name}
                            </span>
                            {item.sodWarning && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70 font-semibold leading-none">
                                {item.sodWarning}
                              </span>
                            )}
                          </div>
                          {displayDesc && (
                            <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {displayDesc}
                            </p>
                          )}
                        </div>

                        <Switch
                          checked={Boolean(isChecked)}
                          ariaLabel={item.name}
                          testId={`permission-switch-${item.key}`}
                          onChange={() => handleToggle(item.key)}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Thanh lưu phân quyền gọn ở góc phải cuối khối */}
                <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-[12px] text-slate-500 dark:text-slate-400 truncate">
                    {groupDirty ? "Có thay đổi chưa lưu trong nhóm này" : "Áp dụng tức thì 1:1 với máy chủ"}
                  </span>
                  <button
                    type="button"
                    data-testid={`save-permissions-btn-${group.id}`}
                    disabled={saving || loading}
                    onClick={handleSave}
                    className={`${COMPACT_BTN_BASE} ${
                      groupDirty || isAnyDirty
                        ? "bg-[#E11D48] hover:bg-[#BE123C] text-white shadow-sm shadow-rose-600/25 border border-[#E11D48]"
                        : "bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700"
                    }`}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        <span>Đang lưu...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5 shrink-0" />
                        <span>Lưu phân quyền</span>
                      </>
                    )}
                  </button>
                </div>
              </SmartAccordion>
            );
          })}

          {/* Lịch sử thay đổi quyền gần đây (Accordion gọn) */}
          {auditLogs && auditLogs.length > 0 && (
            <SmartAccordion
              id="audit_history"
              title="Lịch sử thay đổi phân quyền"
              summary={`${auditLogs.length} bản ghi kiểm toán gần nhất`}
              icon={History}
              iconColor="text-slate-600 dark:text-slate-300"
              iconBg="bg-slate-100 dark:bg-slate-800"
              isOpen={Boolean(openSections.audit_history)}
              isDirty={false}
              onToggle={toggleSection}
            >
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[12px]"
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {log.actor_id}
                      </span>{" "}
                      <span className="text-slate-500 dark:text-slate-400">
                        ({getRoleLabel(log.actor_role)})
                      </span>{" "}
                      •{" "}
                      <span className="font-semibold text-[#E11D48] dark:text-rose-300">
                        {getAuditActionLabel(log.action)}
                      </span>{" "}
                      —{" "}
                      <span className="text-slate-600 dark:text-slate-300">
                        {(() => {
                          if (!log.details) return "Đã cập nhật thay đổi";
                          if (typeof log.details === "object") {
                            const d = log.details;
                            if (d.message) return d.message;
                            if (d.changed_count !== undefined)
                              return `Đã cập nhật ${d.changed_count} mục phân quyền`;
                            if (d.updated_count !== undefined)
                              return `Đã cập nhật ${d.updated_count} mục phân quyền`;
                            return "Đã ghi nhận cấu hình phân quyền";
                          }
                          const str = String(log.details).trim();
                          if (str.startsWith("{") && str.endsWith("}"))
                            return "Đã ghi nhận cấu hình phân quyền";
                          return str;
                        })()}
                      </span>
                    </div>
                    <span className="text-slate-400 shrink-0 whitespace-nowrap text-[11px]">
                      {log.created_at ? new Date(log.created_at).toLocaleString("vi-VN") : ""}
                    </span>
                  </div>
                ))}
              </div>
            </SmartAccordion>
          )}

          {/* Ghi chú bảo vệ cốt lõi dạng 1 dòng chú thích mảnh tinh tế */}
          <p
            data-testid="sod-core-protection-note"
            className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 px-1 leading-snug"
          >
            <Lock className="w-3.5 h-3.5 text-[#E11D48] dark:text-rose-400 shrink-0" />
            <span className="truncate">
              Chốt chặn bảo vệ: Kế toán không thể tự sửa lương, phụ cấp hoặc vai trò của chính mình (
              {ADMIN_SOD_EXCLUSIVE_ITEMS.map((item) => item.name).join(" • ")} — độc quyền Giám đốc).
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
