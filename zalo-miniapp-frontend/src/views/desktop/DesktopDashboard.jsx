import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import DesktopSidebar, { DesktopMobileBottomNav } from "../../components/DesktopSidebar";
import DesktopHeader from "../../components/DesktopHeader";
import AdminLayout from "../../layouts/AdminLayout";
import AccountantLayout from "../../layouts/AccountantLayout";
import RequestsManagementTab from "./RequestsManagementTab";
import EmployeeManagementTab from "./EmployeeManagementTab";
import CompanySettingsTab from "./CompanySettingsTab";
import HolidaysTab from "./HolidaysTab";
import WorkerProfileTab from "../worker/WorkerProfileTab";
import SalarySlipModal from "../../components/SalarySlipModal";
import { getDefaultTabForRole, isTabAllowedForRole, ROLES, ROLE_LABELS } from "../../constants/roles";
import { safeGet, safePut } from "../../utils/api";
import { compressAvatarImage } from "../../utils/imageCompressor";
import { zaloMediaService } from "../../services/zalo-media.service";
import { AppButton, UserAvatar, BottomSheet } from "../../components/ui";
import { FontScaleSelector } from "../../context/FontScaleContext";
import {
  RefreshCw,
  Building2,
  ShieldCheck,
  Gift,
  HardDrive,
  Key,
  LogOut,
  Camera,
  Trash2,
  Loader2,
  ChevronDown,
  Check
} from "lucide-react";

const SETTINGS_OPTIONS = [
  {
    id: "company",
    label: "Công ty & Vị trí",
    description: "Thông tin doanh nghiệp, tọa độ GPS/Wi-Fi & Khối làm việc",
    icon: Building2
  },
  {
    id: "permissions",
    label: "Phân quyền kế toán",
    description: "Cấp quyền thao tác cho vai trò Kế toán",
    icon: ShieldCheck
  },
  {
    id: "holidays",
    label: "Ngày lễ",
    description: "Lịch 11 ngày nghỉ lễ & hệ số lương ngày lễ",
    icon: Gift
  },
  {
    id: "media_storage",
    label: "Quản lý Media",
    description: "Dung lượng Cloudinary & dọn tệp mồ côi",
    icon: HardDrive
  }
];

// Lazy-load các phân hệ quản trị
const AttendanceMatrixTable = lazy(() => import("../../components/AttendanceMatrixTable"));
const PayrollGridTable = lazy(() => import("../../components/PayrollGridTable"));
const AccountantPermissionView = lazy(() => import("../../components/AccountantPermissionView"));
const MediaStorageManagementTab = lazy(() => import("./MediaStorageManagementTab"));

export default function DesktopDashboard({
  currentUser,
  activeRole,
  onLogout,
  onClearCache,
  onUserUpdated,
  showToast,
  onChangePasswordRequest
}) {
  const [currentTab, setCurrentTab] = useState(() => {
    const r = activeRole || currentUser?.role;
    return getDefaultTabForRole(r, currentUser?.dynamic_permissions || {});
  });
  const [settingsSubTab, setSettingsSubTab] = useState("company");
  const [isSettingsPickerOpen, setIsSettingsPickerOpen] = useState(false);
  const [isMobileSettingsSheet, setIsMobileSettingsSheet] = useState(false);
  const settingsDropdownRef = useRef(null);
  const [focusTarget, setFocusTarget] = useState(null);

  useEffect(() => {
    if (!isSettingsPickerOpen || isMobileSettingsSheet) return undefined;
    const handleOutsideClick = (e) => {
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(e.target)) {
        setIsSettingsPickerOpen(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") setIsSettingsPickerOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick, { passive: true });
    window.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isSettingsPickerOpen, isMobileSettingsSheet]);
  const [liveDynamicPerms, setLiveDynamicPerms] = useState(null);

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const adminAvatarInputRef = useRef(null);
  const [adminAvatarSaving, setAdminAvatarSaving] = useState(false);
  const [personalPayslipModal, setPersonalPayslipModal] = useState({
    open: false,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsSummary, setAlertsSummary] = useState({
    fraud_count: 0,
    fraud_alerts: [],
    disputed_salary_count: 0,
    salary_disputes: [],
    pending_device_count: 0,
    pending_device_alerts: [],
    pending_requests_count: 0,
    pending_requests: [],
    total_red_alerts: 0,
    total_actionable_count: 0,
    actionable_alerts: []
  });

  const fetchAlertsSummary = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await safeGet("/notifications/summary");
      if (res?.success && res.data) {
        setAlertsSummary(res.data);
      }
    } catch {
      // Bỏ qua lỗi mạng nền khi tải badge cảnh báo
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  const resolvedRole = activeRole || currentUser?.role;
  const effectiveDynamicPerms = useMemo(() => ({
    ...(currentUser?.dynamic_permissions || {}),
    ...(liveDynamicPerms || {})
  }), [currentUser?.dynamic_permissions, liveDynamicPerms]);

  useEffect(() => {
    if (resolvedRole !== "accountant") return undefined;
    let active = true;
    safeGet("/settings/accountant-permissions")
      .then((res) => {
        if (!active || !res?.success) return;
        const raw = res.data;
        if (Array.isArray(raw)) {
          const map = {};
          for (const row of raw) {
            if (row?.permission_key) map[row.permission_key] = Boolean(row.is_enabled);
          }
          setLiveDynamicPerms(map);
        } else if (raw && typeof raw === "object") {
          setLiveDynamicPerms(raw);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [resolvedRole, refreshTick]);

  const effectiveTab = isTabAllowedForRole(currentTab, resolvedRole, effectiveDynamicPerms)
    ? currentTab
    : getDefaultTabForRole(resolvedRole, effectiveDynamicPerms);

  useEffect(() => {
    if (!isTabAllowedForRole(currentTab, resolvedRole, effectiveDynamicPerms)) {
      setCurrentTab(getDefaultTabForRole(resolvedRole, effectiveDynamicPerms));
    }
  }, [currentTab, resolvedRole, effectiveDynamicPerms]);

  useEffect(() => {
    fetchAlertsSummary();
  }, [fetchAlertsSummary, refreshTick, effectiveTab]);

  const handleMonthChange = (m, y) => {
    if (m) setSelectedMonth(Number(m));
    if (y) setSelectedYear(Number(y));
  };

  const navigateToTarget = useCallback((rawTab, subTabOverride = null) => {
    let nextTab = rawTab || getDefaultTabForRole(resolvedRole, effectiveDynamicPerms);
    let nextSubTab = subTabOverride;

    if (nextTab === "management") {
      if (nextSubTab === "payroll") {
        nextTab = "payroll";
      } else {
        nextTab = "employees";
      }
    } else if (nextTab === "devices" || nextTab === "audit_logs") {
      nextTab = "employees";
    } else if (
      (nextTab === "company" || nextTab === "permissions" || nextTab === "holidays" || nextTab === "media_storage") &&
      resolvedRole === ROLES.ADMIN
    ) {
      nextSubTab = nextTab;
      nextTab = "settings";
    }

    if (!isTabAllowedForRole(nextTab, resolvedRole, effectiveDynamicPerms)) return;
    setCurrentTab(nextTab);
    if (nextTab === "settings" && nextSubTab) {
      setSettingsSubTab(nextSubTab);
    }
    setIsMobileMenuOpen(false);
  }, [resolvedRole, effectiveDynamicPerms]);

  const handleNavigateAlert = useCallback((alert) => {
    if (!alert) return;
    if (alert.notification_id && !alert._alreadyMarkedRead) {
      safePut(`/notifications/${alert.notification_id}/read`, {})
        .then(() => fetchAlertsSummary())
        .catch(() => {});
    } else if (alert._alreadyMarkedRead) {
      fetchAlertsSummary();
    }
    if (alert.month && alert.year) {
      setSelectedMonth(Number(alert.month));
      setSelectedYear(Number(alert.year));
    }
    const resolvedTab = alert.target_tab || "management";
    const resolvedSub = alert.target_subtab || null;
    if (resolvedTab === "payslip" && resolvedRole !== ROLES.ADMIN) {
      setPersonalPayslipModal({
        open: true,
        month: Number(alert.month || selectedMonth || new Date().getMonth() + 1),
        year: Number(alert.year || selectedYear || new Date().getFullYear())
      });
      setIsMobileMenuOpen(false);
      return;
    }
    navigateToTarget(resolvedTab, resolvedSub);
    setFocusTarget({
      tab: resolvedTab,
      subTab: resolvedSub,
      ma_nv: alert.target_ma_nv || null,
      id: alert.target_id || null,
      category: alert.category || null,
      month: alert.month || null,
      year: alert.year || null,
      ts: Date.now()
    });
  }, [navigateToTarget]);

  const mgmtInitialFilter = focusTarget?.category === "device" ? "alerts" : "all";
  const RoleLayout = resolvedRole === ROLES.ACCOUNTANT ? AccountantLayout : AdminLayout;

  return (
    <>
      <RoleLayout
        role={resolvedRole}
        dataScrollContainer="desktop"
        mainClassName="p-3 sm:p-5 pb-8 bg-[#F1F5F9] dark:bg-[#0B1120]"
        sidebar={
          <DesktopSidebar
            currentTab={effectiveTab}
            setCurrentTab={(tabId) => {
              setFocusTarget(null);
              navigateToTarget(tabId);
            }}
            activeRole={resolvedRole}
            dynamicPerms={effectiveDynamicPerms}
            currentUser={currentUser}
            onLogout={onLogout}
            onClearCache={onClearCache}
            alertsSummary={alertsSummary}
            pendingRequestsCount={alertsSummary.pending_requests_count || 0}
            isMobileMenuOpen={isMobileMenuOpen}
            onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
            showMobileBottomNav={false}
          />
        }
        header={
          <DesktopHeader
            currentUser={currentUser}
            activeRole={resolvedRole}
            dynamicPerms={effectiveDynamicPerms}
            currentTab={effectiveTab}
            settingsSubTab={settingsSubTab}
            setCurrentTab={(tabId) => {
              setFocusTarget(null);
              navigateToTarget(tabId);
            }}
            onNavigateAlert={handleNavigateAlert}
            onLogout={onLogout}
            onChangePasswordRequest={onChangePasswordRequest}
            alertsSummary={alertsSummary}
            refreshSignal={refreshTick}
            isLoading={alertsLoading}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
            onRefresh={() => {
              setRefreshTick((t) => t + 1);
              fetchAlertsSummary();
            }}
          />
        }
        bottomNav={
          <DesktopMobileBottomNav
            activeRole={resolvedRole}
            dynamicPerms={effectiveDynamicPerms}
            alertsSummary={alertsSummary}
            pendingRequestsCount={alertsSummary.pending_requests_count || 0}
            currentTab={effectiveTab}
            setCurrentTab={(tabId) => {
              setFocusTarget(null);
              navigateToTarget(tabId);
            }}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          />
        }
      >
        <div key={effectiveTab} className="animate-tab-enter">
          <Suspense
            fallback={
              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-[#E11D48]" />
                <span className="text-xs font-semibold">Đang tải phân hệ quản trị...</span>
              </div>
            }
          >
            {/* 1. Nhân sự */}
            {effectiveTab === "employees" && (
              <EmployeeManagementTab
                key={`employees-${refreshTick}`}
                currentUser={currentUser}
                activeRole={resolvedRole}
                dynamicPerms={effectiveDynamicPerms}
                showToast={showToast}
                initialFilter={resolvedRole === ROLES.ADMIN ? mgmtInitialFilter : "all"}
                focusTarget={focusTarget}
                alertsSummary={alertsSummary}
                pendingDeviceCount={alertsSummary?.pending_device_count || 0}
                onRefreshAlerts={fetchAlertsSummary}
              />
            )}

            {/* 2. Ma Trận Chấm Công Toàn Công Ty */}
            {effectiveTab === "matrix" && (
              <AttendanceMatrixTable
                key={`matrix-${selectedMonth}-${selectedYear}-${refreshTick}`}
                currentUser={currentUser}
                activeRole={resolvedRole}
                userRole={resolvedRole}
                dynamicPerms={effectiveDynamicPerms}
                month={selectedMonth}
                year={selectedYear}
                onMonthChange={handleMonthChange}
                onRefresh={fetchAlertsSummary}
                showToast={showToast}
                onShowToast={showToast}
              />
            )}

            {/* 3. Xét Duyệt Đơn Từ */}
            {effectiveTab === "requests" && (
              <RequestsManagementTab
                key={`requests-${refreshTick}`}
                currentUser={currentUser}
                activeRole={resolvedRole}
                dynamicPerms={effectiveDynamicPerms}
                focusTarget={focusTarget}
                showToast={showToast}
              />
            )}

            {/* 4. Bảng Lương (Admin & Kế toán truy cập trực tiếp) */}
            {effectiveTab === "payroll" && (
              <PayrollGridTable
                key={`payroll-${selectedMonth}-${selectedYear}-${refreshTick}`}
                currentUser={currentUser}
                activeRole={resolvedRole}
                userRole={resolvedRole}
                dynamicPerms={effectiveDynamicPerms}
                month={selectedMonth}
                year={selectedYear}
                onMonthChange={handleMonthChange}
                focusTarget={focusTarget}
                onRefresh={fetchAlertsSummary}
                showToast={showToast}
                onShowToast={showToast}
              />
            )}

            {/* 5. Cài Đặt Hệ Thống (Compact Enterprise Option Selector) */}
            {effectiveTab === "settings" && resolvedRole === ROLES.ADMIN && (() => {
              const activeSettingOpt =
                SETTINGS_OPTIONS.find((item) => item.id === settingsSubTab) || SETTINGS_OPTIONS[0];
              const ActiveSettingIcon = activeSettingOpt.icon;

              return (
                <div className="space-y-4">
                  {/* Thanh Option Selector Thống Nhất (Dropdown trên Desktop >= 768px & Bottom Sheet trên Mobile < 768px) */}
                  <div ref={settingsDropdownRef} className="relative max-w-3xl mx-auto">
                    <button
                      type="button"
                      data-testid="settings-option-selector-trigger"
                      aria-expanded={isSettingsPickerOpen}
                      aria-haspopup="listbox"
                      onClick={() => {
                        if (typeof window !== "undefined" && window.innerWidth < 768) {
                          setIsMobileSettingsSheet(true);
                        } else {
                          setIsMobileSettingsSheet(false);
                        }
                        setIsSettingsPickerOpen((prev) => !prev);
                      }}
                      className="w-full min-h-[60px] bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-[#E11D48] dark:hover:border-rose-500/60 rounded-2xl p-3.5 sm:p-4 shadow-sm text-left transition active:scale-[0.99] cursor-pointer"
                    >
                      {/* Tầng 1: Icon + Tiêu đề phân mục bên trái, Nút mũi tên bên phải */}
                      <div className="flex items-start justify-between gap-2.5 w-full">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl bg-[#FFE4E6] dark:bg-rose-950/70 text-[#E11D48] dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 flex items-center justify-center shrink-0">
                            <ActiveSettingIcon className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#E11D48] dark:text-rose-400 leading-snug">
                              Danh mục cài đặt
                            </span>
                            <div className="font-extrabold text-sm sm:text-base text-[#111C2D] dark:text-white whitespace-normal break-words overflow-visible leading-snug">
                              {activeSettingOpt.label}
                            </div>
                          </div>
                        </div>

                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#F0F3FF] dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-extrabold text-[#111C2D] dark:text-slate-200 shrink-0 mt-0.5">
                          <span className="hidden sm:inline">Chọn mục</span>
                          <ChevronDown
                            className={`w-4 h-4 text-[#E11D48] dark:text-rose-400 transition-transform duration-200 ${
                              isSettingsPickerOpen ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </div>

                      {/* Tầng 2: Dòng mô tả chức năng trải trọn 100% chiều rộng */}
                      <div className="w-full mt-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-normal break-words overflow-visible leading-snug">
                        {activeSettingOpt.description}
                      </div>
                    </button>

                    {/* Desktop Dropdown / Popover (>= 768px) */}
                    {isSettingsPickerOpen && !isMobileSettingsSheet && (
                      <div
                        role="listbox"
                        data-testid="settings-option-dropdown"
                        className="hidden md:block absolute left-0 right-0 top-full mt-2 z-50 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 rounded-2xl shadow-2xl p-2 space-y-1 animate-fade-in"
                      >
                        {SETTINGS_OPTIONS.map((opt) => {
                          const OptIcon = opt.icon;
                          const isSelected = settingsSubTab === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              data-subtab={opt.id}
                              data-active={isSelected ? "true" : "false"}
                              onClick={() => {
                                setSettingsSubTab(opt.id);
                                setIsSettingsPickerOpen(false);
                              }}
                              className={`w-full min-h-[54px] px-3.5 py-2.5 rounded-xl flex items-start justify-between gap-3 text-left transition cursor-pointer ${
                                isSelected
                                  ? "bg-[#FFE4E6]/70 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/70"
                                  : "hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-transparent"
                              }`}
                            >
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <div
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? "bg-[#E11D48] text-white"
                                      : "bg-[#F0F3FF] dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                  }`}
                                >
                                  <OptIcon className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div
                                    className={`text-sm font-extrabold whitespace-normal break-words overflow-visible leading-snug ${
                                      isSelected
                                        ? "text-[#B80035] dark:text-rose-200"
                                        : "text-[#111C2D] dark:text-white"
                                    }`}
                                  >
                                    {opt.label}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug mt-0.5">
                                    {opt.description}
                                  </div>
                                </div>
                              </div>

                              {isSelected && (
                                <span className="w-7 h-7 rounded-full bg-[#E11D48] text-white flex items-center justify-center shrink-0 mt-1">
                                  <Check className="w-4 h-4 stroke-[3]" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Mobile Bottom Sheet Picker (< 768px) */}
                    <BottomSheet
                      open={isSettingsPickerOpen && isMobileSettingsSheet}
                      onClose={() => setIsSettingsPickerOpen(false)}
                      title="Chọn phân mục Cài đặt"
                      subtitle="Chạm vào phân mục cần cấu hình"
                      footer={null}
                    >
                      <div className="p-3.5 space-y-2" role="listbox">
                        {SETTINGS_OPTIONS.map((opt) => {
                          const OptIcon = opt.icon;
                          const isSelected = settingsSubTab === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              data-subtab={opt.id}
                              data-active={isSelected ? "true" : "false"}
                              onClick={() => {
                                setSettingsSubTab(opt.id);
                                setIsSettingsPickerOpen(false);
                              }}
                              className={`w-full min-h-[56px] p-3 rounded-2xl border flex items-center justify-between gap-3 text-left transition active:scale-[0.99] cursor-pointer ${
                                isSelected
                                  ? "bg-[#FFE4E6]/80 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700"
                                  : "bg-white dark:bg-slate-800/90 border-slate-200/80 dark:border-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? "bg-[#E11D48] text-white"
                                      : "bg-[#F0F3FF] dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                  }`}
                                >
                                  <OptIcon className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div
                                    className={`text-sm font-extrabold leading-snug ${
                                      isSelected
                                        ? "text-[#B80035] dark:text-rose-200"
                                        : "text-[#111C2D] dark:text-white"
                                    }`}
                                  >
                                    {opt.label}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                                    {opt.description}
                                  </div>
                                </div>
                              </div>

                              {isSelected && (
                                <span className="w-7 h-7 rounded-full bg-[#E11D48] text-white flex items-center justify-center shrink-0">
                                  <Check className="w-4 h-4 stroke-[3]" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </BottomSheet>
                  </div>

                  {settingsSubTab === "company" && (
                    <CompanySettingsTab
                      currentUser={currentUser}
                      showToast={showToast}
                    />
                  )}
                  {settingsSubTab === "permissions" && (
                    <AccountantPermissionView
                      currentUser={currentUser}
                      showToast={showToast}
                    />
                  )}
                  {settingsSubTab === "holidays" && (
                    <HolidaysTab
                      currentUser={currentUser}
                      showToast={showToast}
                    />
                  )}
                  {settingsSubTab === "media_storage" && (
                    <MediaStorageManagementTab
                      currentUser={currentUser}
                      showToast={showToast}
                    />
                  )}
                </div>
              );
            })()}

            {/* 6. Hồ Sơ Quản Trị (Tách biệt hoàn toàn khỏi chấm công/lương cá nhân) / Hồ Sơ Kế Toán */}
            {effectiveTab === "profile" && (
              resolvedRole === ROLES.ADMIN ? (
                <div className="max-w-lg mx-auto space-y-4">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
                    <div className="flex items-start gap-4">
                      <div className="relative shrink-0 flex flex-col items-center gap-1.5">
                        <div className="relative">
                          <UserAvatar
                            name={currentUser?.ho_ten || "Ban Giám Đốc"}
                            avatarUrl={currentUser?.avatar_url}
                            size="xl"
                          />
                          <input
                            ref={adminAvatarInputRef}
                            type="file"
                            accept="image/*"
                            data-testid="admin-avatar-input"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setAdminAvatarSaving(true);
                              try {
                                let nextAvatarValue = "";
                                const uploadRes = await zaloMediaService.uploadAvatarFile(file, {
                                  targetEmployeeId: currentUser?.username || "admin"
                                });
                                if (
                                  uploadRes.ok &&
                                  uploadRes.data?.url &&
                                  (uploadRes.data.storage === "cloudinary" || String(uploadRes.data.url).length <= 45000)
                                ) {
                                  nextAvatarValue = uploadRes.data.url;
                                } else if (uploadRes.ok && uploadRes.data?.storage === "inline_compact_fallback") {
                                  const compressed = await compressAvatarImage(file);
                                  nextAvatarValue = compressed.dataUrl;
                                } else {
                                  throw new Error(uploadRes.message || "Không thể tải lên ảnh đại diện.");
                                }
                                const res = await safePut("/account/avatar", { avatar_url: nextAvatarValue });
                                if (res?.success) {
                                  const finalUrl = res?.data?.avatar_url ?? nextAvatarValue;
                                  onUserUpdated?.({ avatar_url: finalUrl });
                                  showToast?.(res.message || "Đã cập nhật ảnh đại diện!", "success");
                                }
                              } catch (err) {
                                showToast?.(err?.message || "Không thể cập nhật ảnh đại diện.", "error");
                              } finally {
                                setAdminAvatarSaving(false);
                                try { e.target.value = ""; } catch {}
                              }
                            }}
                          />
                          <button
                            type="button"
                            disabled={adminAvatarSaving}
                            data-testid="admin-avatar-upload-btn"
                            onClick={() => adminAvatarInputRef.current?.click()}
                            aria-label="Đổi ảnh đại diện quản trị"
                            title="Đổi ảnh đại diện"
                            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#E11D48] hover:bg-[#BE123C] text-white border-2 border-white dark:border-slate-900 shadow-sm flex items-center justify-center cursor-pointer disabled:opacity-60"
                          >
                            {adminAvatarSaving ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Camera className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        {currentUser?.avatar_url && (
                          <button
                            type="button"
                            disabled={adminAvatarSaving}
                            data-testid="admin-avatar-delete-btn"
                            onClick={async () => {
                              setAdminAvatarSaving(true);
                              try {
                                const res = await safePut("/account/avatar", { avatar_url: null });
                                if (res?.success) {
                                  onUserUpdated?.({ avatar_url: null });
                                  showToast?.(res.message || "Đã xóa ảnh đại diện!", "success");
                                }
                              } catch (err) {
                                showToast?.(err?.message || "Không thể xóa ảnh đại diện.", "error");
                              } finally {
                                setAdminAvatarSaving(false);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/60 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 hover:text-rose-700 dark:text-slate-300 dark:hover:text-rose-300 cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Xóa ảnh</span>
                          </button>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-black text-slate-900 dark:text-white break-words leading-snug">
                          {currentUser?.ho_ten || "Ban Giám Đốc"}
                        </h3>
                        <div className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          Tài khoản: {currentUser?.login_username || currentUser?.username || currentUser?.ma_nv || "admin"}
                        </div>
                        {currentUser?.phone && (
                          <div className="text-xs text-slate-600 dark:text-slate-300 font-semibold">
                            SĐT: {currentUser.phone}
                          </div>
                        )}
                        <span className="inline-block px-2.5 py-0.5 rounded-lg bg-amber-400 text-slate-950 text-xs font-black">
                          {ROLE_LABELS[ROLES.ADMIN]}
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      Tài khoản Quản trị viên chỉ dùng để điều hành, duyệt công/đơn từ và cấu hình hệ thống; không tính lương, không chấm công và không khóa thiết bị cá nhân.
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {typeof onChangePasswordRequest === "function" && (
                        <AppButton
                          variant="secondary"
                          icon={Key}
                          onClick={onChangePasswordRequest}
                        >
                          Tài khoản &amp; Mật khẩu
                        </AppButton>
                      )}
                      {typeof onLogout === "function" && (
                        <AppButton
                          variant="danger"
                          icon={LogOut}
                          onClick={onLogout}
                        >
                          Đăng xuất an toàn
                        </AppButton>
                      )}
                    </div>
                  </div>
                  <FontScaleSelector />
                </div>
              ) : (
                <div className="max-w-lg mx-auto">
                  <WorkerProfileTab
                    currentUser={currentUser}
                    onLogout={onLogout}
                    onUserUpdated={onUserUpdated}
                    showToast={showToast}
                    onChangePasswordRequest={onChangePasswordRequest}
                  />
                </div>
              )
            )}
          </Suspense>
        </div>
      </RoleLayout>

      {personalPayslipModal.open && resolvedRole !== ROLES.ADMIN && (
        <SalarySlipModal
          month={personalPayslipModal.month}
          year={personalPayslipModal.year}
          targetMaNv={currentUser?.ma_nv}
          isAdminOrAccountant={false}
          showToast={showToast}
          onStatusUpdated={() => {
            fetchAlertsSummary();
            setRefreshTick((t) => t + 1);
          }}
          onClose={() => setPersonalPayslipModal((p) => ({ ...p, open: false }))}
        />
      )}
    </>
  );
}
