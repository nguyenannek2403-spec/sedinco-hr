import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import DesktopSidebar, { DesktopMobileBottomNav } from "../../components/DesktopSidebar";
import DesktopHeader from "../../components/DesktopHeader";
import RequestsManagementTab from "./RequestsManagementTab";
import EmployeeManagementTab from "./EmployeeManagementTab";
import CompanySettingsTab from "./CompanySettingsTab";
import HolidaysTab from "./HolidaysTab";
import AuditLogsTab from "./AuditLogsTab";
import WorkerProfileTab from "../worker/WorkerProfileTab";
import LiveAttendanceBoardModal from "../../components/LiveAttendanceBoardModal";
import { getDefaultTabForRole, isTabAllowedForRole, ROLES, ROLE_LABELS } from "../../constants/roles";
import { safeGet } from "../../utils/api";
import { AppButton } from "../../components/ui";
import {
  RefreshCw,
  Users,
  DollarSign,
  ShieldAlert,
  Building2,
  ShieldCheck,
  Gift,
  Key,
  LogOut
} from "lucide-react";

// Lazy-load các phân hệ quản trị
const AttendanceMatrixTable = lazy(() => import("../../components/AttendanceMatrixTable"));
const PayrollGridTable = lazy(() => import("../../components/PayrollGridTable"));
const AccountantPermissionView = lazy(() => import("../../components/AccountantPermissionView"));

export default function DesktopDashboard({
  currentUser,
  activeRole,
  onLogout,
  onClearCache,
  showToast,
  onChangePasswordRequest
}) {
  const [currentTab, setCurrentTab] = useState(() => {
    const r = activeRole || currentUser?.role;
    return getDefaultTabForRole(r, currentUser?.dynamic_permissions || {});
  });
  const [managementSubTab, setManagementSubTab] = useState("employees"); // 'employees' | 'payroll' | 'audit_logs'
  const [settingsSubTab, setSettingsSubTab] = useState("company"); // 'company' | 'permissions' | 'holidays'
  const [focusTarget, setFocusTarget] = useState(null);
  const [liveDynamicPerms, setLiveDynamicPerms] = useState(null);

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [liveBoardModal, setLiveBoardModal] = useState({ open: false, initialTab: "present" });
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
    let nextTab = rawTab || "matrix";
    let nextSubTab = subTabOverride;

    if (resolvedRole === ROLES.ADMIN) {
      if (nextTab === "employees" || nextTab === "devices") {
        nextTab = "management";
        nextSubTab = nextSubTab || "employees";
      } else if (nextTab === "payroll") {
        nextTab = "management";
        nextSubTab = nextSubTab || "payroll";
      } else if (nextTab === "audit_logs") {
        nextTab = "management";
        nextSubTab = nextSubTab || "audit_logs";
      } else if (nextTab === "company") {
        nextTab = "settings";
        nextSubTab = nextSubTab || "company";
      } else if (nextTab === "permissions") {
        nextTab = "settings";
        nextSubTab = nextSubTab || "permissions";
      } else if (nextTab === "holidays") {
        nextTab = "settings";
        nextSubTab = nextSubTab || "holidays";
      }
    }

    if (!isTabAllowedForRole(nextTab, resolvedRole, effectiveDynamicPerms)) return;
    setCurrentTab(nextTab);
    if (nextTab === "management" && nextSubTab) {
      setManagementSubTab(nextSubTab);
    } else if (nextTab === "settings" && nextSubTab) {
      setSettingsSubTab(nextSubTab);
    }
    setIsMobileMenuOpen(false);
  }, [resolvedRole, effectiveDynamicPerms]);

  const handleNavigateAlert = useCallback((alert) => {
    if (!alert) return;
    if (alert.month && alert.year) {
      setSelectedMonth(Number(alert.month));
      setSelectedYear(Number(alert.year));
    }
    const resolvedTab = alert.target_tab || "management";
    const resolvedSub = alert.target_subtab || null;
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

  return (
    <div className="flex h-[100dvh] bg-slate-950 text-slate-100 overflow-hidden font-sans relative">
      {/* Sidebar Trái (Tự động chuyển thành Drawer Portal + Bottom Nav khi mở trên điện thoại < 1024px) */}
      <DesktopSidebar
        currentTab={effectiveTab}
        setCurrentTab={(tabId) => navigateToTarget(tabId)}
        onSelectTab={(tabId) => navigateToTarget(tabId)}
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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Header (Hỗ trợ Safe Area Top & Tránh cụm nút Zalo góc phải trên điện thoại) */}
        <DesktopHeader
          currentUser={currentUser}
          activeRole={resolvedRole}
          dynamicPerms={effectiveDynamicPerms}
          currentTab={effectiveTab}
          managementSubTab={managementSubTab}
          settingsSubTab={settingsSubTab}
          setCurrentTab={(tabId) => navigateToTarget(tabId)}
          onNavigateAlert={handleNavigateAlert}
          onLogout={onLogout}
          onChangePasswordRequest={onChangePasswordRequest}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          alertsSummary={alertsSummary}
          isLoading={alertsLoading}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onRefresh={() => {
            setRefreshTick((t) => t + 1);
            fetchAlertsSummary();
          }}
        />

        {/* THANH TÓM TẮT QUÂN SỐ THỜI GIAN THỰC TRONG NGÀY (BẤM ĐỂ XEM CHI TIẾT NHÂN SỰ) */}
        {alertsSummary?.headcount_today && (
          <div className="bg-slate-900/95 border-b border-slate-800 px-3 sm:px-6 py-2 flex items-center gap-2 overflow-x-auto touch-scroll-x shrink-0 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setLiveBoardModal({ open: true, initialTab: "present" })}
              className="min-h-[44px] inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 shrink-0 whitespace-nowrap cursor-pointer transition"
            >
              👥 Quân số: <strong className="text-white">{alertsSummary.headcount_today.total_employees}</strong>
            </button>
            <button
              type="button"
              onClick={() => setLiveBoardModal({ open: true, initialTab: "present" })}
              className="min-h-[44px] inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 shrink-0 whitespace-nowrap cursor-pointer transition"
            >
              🟢 Có mặt: <strong>{alertsSummary.headcount_today.present}</strong>
            </button>
            <button
              type="button"
              onClick={() => setLiveBoardModal({ open: true, initialTab: "late" })}
              className="min-h-[44px] inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-amber-950/70 hover:bg-amber-900/80 border border-amber-500/40 text-amber-300 shrink-0 whitespace-nowrap cursor-pointer transition"
            >
              🟡 Đi muộn: <strong>{alertsSummary.headcount_today.late}</strong>
            </button>
            <button
              type="button"
              onClick={() => setLiveBoardModal({ open: true, initialTab: "field_work" })}
              className="min-h-[44px] inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-orange-950/70 hover:bg-orange-900/80 border border-orange-500/40 text-orange-300 shrink-0 whitespace-nowrap cursor-pointer transition"
            >
              🚧 Công trình: <strong>{alertsSummary.headcount_today.field_work}</strong>
            </button>
            <button
              type="button"
              onClick={() => setLiveBoardModal({ open: true, initialTab: "leave" })}
              className="min-h-[44px] inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-purple-950/70 hover:bg-purple-900/80 border border-purple-500/40 text-purple-300 shrink-0 whitespace-nowrap cursor-pointer transition"
            >
              🟣 Nghỉ phép: <strong>{alertsSummary.headcount_today.leave}</strong>
            </button>
            {Array.isArray(alertsSummary.headcount_today?.live_board?.absent_list) && (
              <button
                type="button"
                onClick={() => setLiveBoardModal({ open: true, initialTab: "absent" })}
                className="min-h-[44px] inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 border border-rose-500/40 text-rose-300 shrink-0 whitespace-nowrap cursor-pointer transition"
              >
                ⚪ Chưa chấm: <strong>{alertsSummary.headcount_today.live_board.absent_list.length}</strong>
              </button>
            )}
          </div>
        )}

        {/* Tab Content with Suspense Loading */}
        <main
          data-scroll-container="desktop"
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-3 sm:p-6 pb-8 bg-slate-900/60"
        >
          <div key={effectiveTab} className="animate-tab-enter">
          <Suspense
            fallback={
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                <span className="text-xs font-semibold">Đang tải phân hệ quản trị...</span>
              </div>
            }
          >
            {/* 1. Ma Trận Chấm Công Toàn Công Ty */}
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
                showToast={showToast}
                onShowToast={showToast}
              />
            )}

            {/* 2. Bảng Tính Lương (Role Kế toán truy cập trực tiếp) */}
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

            {/* 4. Trung Tâm Quản Trị (Hợp nhất Nhân sự & Thiết bị, Giám sát Lương, Nhật ký & An ninh) */}
            {effectiveTab === "management" && (
              resolvedRole === ROLES.ADMIN ? (
                <div className="space-y-4">
                  {/* Thanh Phân mục Trung tâm Quản trị */}
                  <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl p-2 flex flex-wrap gap-2 shadow-lg">
                    <button
                      type="button"
                      data-subtab="employees"
                      onClick={() => setManagementSubTab("employees")}
                      className={`min-h-[44px] flex-1 min-w-[140px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                        managementSubTab === "employees"
                          ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                          : "bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <Users size={16} className="shrink-0" />
                      <span>Nhân sự &amp; Thiết bị</span>
                      {Number(alertsSummary?.pending_device_count) > 0 && (
                        <span className="px-2 py-0.5 text-[11px] rounded-full bg-rose-600 text-white font-black">
                          {alertsSummary.pending_device_count}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      data-subtab="payroll"
                      onClick={() => setManagementSubTab("payroll")}
                      className={`min-h-[44px] flex-1 min-w-[140px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                        managementSubTab === "payroll"
                          ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                          : "bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <DollarSign size={16} className="shrink-0" />
                      <span>Giám sát Lương</span>
                      {Number(alertsSummary?.disputed_salary_count) > 0 && (
                        <span className="px-2 py-0.5 text-[11px] rounded-full bg-amber-500 text-slate-950 font-black">
                          {alertsSummary.disputed_salary_count}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      data-subtab="audit_logs"
                      onClick={() => setManagementSubTab("audit_logs")}
                      className={`min-h-[44px] flex-1 min-w-[140px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                        managementSubTab === "audit_logs"
                          ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                          : "bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <ShieldAlert size={16} className="shrink-0" />
                      <span>Nhật ký &amp; An ninh</span>
                      {Number(alertsSummary?.fraud_count) > 0 && (
                        <span className="px-2 py-0.5 text-[11px] rounded-full bg-rose-600 text-white font-black">
                          {alertsSummary.fraud_count}
                        </span>
                      )}
                    </button>
                  </div>

                  {managementSubTab === "employees" && (
                    <EmployeeManagementTab
                      key={`management-emp-${refreshTick}`}
                      currentUser={currentUser}
                      activeRole={resolvedRole}
                      dynamicPerms={effectiveDynamicPerms}
                      showToast={showToast}
                      initialFilter={mgmtInitialFilter}
                      focusTarget={focusTarget}
                      pendingDeviceCount={alertsSummary?.pending_device_count || 0}
                      onRefreshAlerts={fetchAlertsSummary}
                    />
                  )}

                  {managementSubTab === "payroll" && (
                    <PayrollGridTable
                      key={`management-payroll-${selectedMonth}-${selectedYear}-${refreshTick}`}
                      currentUser={currentUser}
                      activeRole={resolvedRole}
                      userRole={resolvedRole}
                      dynamicPerms={effectiveDynamicPerms}
                      month={selectedMonth}
                      year={selectedYear}
                      onMonthChange={handleMonthChange}
                      focusTarget={focusTarget}
                      showToast={showToast}
                      onShowToast={showToast}
                    />
                  )}

                  {managementSubTab === "audit_logs" && (
                    <AuditLogsTab
                      key={`management-audit-${refreshTick}`}
                      currentUser={currentUser}
                      showToast={showToast}
                      focusTarget={focusTarget}
                      onRefreshAlerts={fetchAlertsSummary}
                    />
                  )}
                </div>
              ) : (
                <EmployeeManagementTab
                  key={`management-acc-${refreshTick}`}
                  currentUser={currentUser}
                  activeRole={resolvedRole}
                  dynamicPerms={effectiveDynamicPerms}
                  showToast={showToast}
                  initialFilter="all"
                  focusTarget={focusTarget}
                  pendingDeviceCount={alertsSummary?.pending_device_count || 0}
                  onRefreshAlerts={fetchAlertsSummary}
                />
              )
            )}

            {/* 5. Cài Đặt Hệ Thống (Công ty & GPS, Phân quyền Kế toán, Lịch nghỉ lễ) */}
            {effectiveTab === "settings" && resolvedRole === ROLES.ADMIN && (
              <div className="space-y-4">
                <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl p-2 flex flex-wrap gap-2 shadow-lg">
                  <button
                    type="button"
                    data-subtab="company"
                    onClick={() => setSettingsSubTab("company")}
                    className={`min-h-[44px] flex-1 min-w-[140px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                      settingsSubTab === "company"
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                        : "bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Building2 size={16} className="shrink-0" />
                    <span>Công ty &amp; Vị trí</span>
                  </button>
                  <button
                    type="button"
                    data-subtab="permissions"
                    onClick={() => setSettingsSubTab("permissions")}
                    className={`min-h-[44px] flex-1 min-w-[140px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                      settingsSubTab === "permissions"
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                        : "bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <ShieldCheck size={16} className="shrink-0" />
                    <span>Phân quyền Kế toán</span>
                  </button>
                  <button
                    type="button"
                    data-subtab="holidays"
                    onClick={() => setSettingsSubTab("holidays")}
                    className={`min-h-[44px] flex-1 min-w-[140px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                      settingsSubTab === "holidays"
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                        : "bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Gift size={16} className="shrink-0" />
                    <span>Lịch nghỉ lễ (x3)</span>
                  </button>
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
              </div>
            )}

            {/* 6. Hồ Sơ Quản Trị (Tách biệt hoàn toàn khỏi chấm công/lương cá nhân) / Hồ Sơ Kế Toán */}
            {effectiveTab === "profile" && (
              resolvedRole === ROLES.ADMIN ? (
                <div className="max-w-lg mx-auto">
                  <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border-2 border-amber-400/60 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-8 h-8 text-amber-300" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-black text-white break-words leading-snug">
                          {currentUser?.ho_ten || "Ban Giám Đốc"}
                        </h3>
                        <div className="text-xs font-mono font-bold text-emerald-400">
                          Tài khoản: {currentUser?.ma_nv || "admin"}
                        </div>
                        <span className="inline-block px-2.5 py-0.5 rounded-lg bg-amber-400 text-slate-950 text-xs font-black">
                          {ROLE_LABELS[ROLES.ADMIN]}
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs sm:text-sm text-slate-300 leading-relaxed">
                      Tài khoản Quản trị viên chỉ dùng để điều hành, duyệt công/đơn từ và cấu hình hệ thống; không tính lương, không chấm công và không khóa thiết bị cá nhân.
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {typeof onChangePasswordRequest === "function" && (
                        <AppButton
                          variant="secondary"
                          tone="dark"
                          icon={Key}
                          onClick={onChangePasswordRequest}
                        >
                          Đổi mật khẩu
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
                </div>
              ) : (
                <div className="max-w-lg mx-auto">
                  <WorkerProfileTab
                    currentUser={currentUser}
                    onLogout={onLogout}
                    showToast={showToast}
                    onChangePasswordRequest={onChangePasswordRequest}
                  />
                </div>
              )
            )}
          </Suspense>
          </div>
        </main>

        {/* Bottom Navigation Bar in-flow cho Mobile (< 1024px), không bao giờ đè lên nội dung chính */}
        <DesktopMobileBottomNav
          activeRole={resolvedRole}
          dynamicPerms={effectiveDynamicPerms}
          alertsSummary={alertsSummary}
          pendingRequestsCount={alertsSummary.pending_requests_count || 0}
          currentTab={effectiveTab}
          setCurrentTab={(tabId) => navigateToTarget(tabId)}
          onSelectTab={(tabId) => navigateToTarget(tabId)}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />
      </div>

      {/* Modal Bảng Sĩ Số Trực Tiếp (Live Attendance Board) */}
      <LiveAttendanceBoardModal
        open={liveBoardModal.open}
        initialTab={liveBoardModal.initialTab}
        headcount={alertsSummary?.headcount_today}
        loading={alertsLoading}
        currentUser={currentUser}
        dynamicPerms={effectiveDynamicPerms}
        showToast={showToast}
        onRefresh={() => {
          setRefreshTick((t) => t + 1);
          fetchAlertsSummary();
        }}
        onClose={() => setLiveBoardModal({ open: false, initialTab: "present" })}
      />
    </div>
  );
}
