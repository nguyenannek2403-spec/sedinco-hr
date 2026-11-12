import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import DesktopSidebar from "../../components/DesktopSidebar";
import DesktopHeader from "../../components/DesktopHeader";
import RequestsManagementTab from "./RequestsManagementTab";
import EmployeeManagementTab from "./EmployeeManagementTab";
import CompanySettingsTab from "./CompanySettingsTab";
import HolidaysTab from "./HolidaysTab";
import AuditLogsTab from "./AuditLogsTab";
import WorkerProfileTab from "../worker/WorkerProfileTab";
import { getDefaultTabForRole } from "../../constants/roles";
import { safeGet } from "../../utils/api";
import { RefreshCw } from "lucide-react";

// Lazy-load các phân hệ quản trị
const AttendanceMatrixTable = lazy(() => import("../../components/AttendanceMatrixTable"));
const PayrollGridTable = lazy(() => import("../../components/PayrollGridTable"));
const AccountantPermissionView = lazy(() => import("../../components/AccountantPermissionView"));
const AdminDeviceApproval = lazy(() => import("../../components/AdminDeviceApproval"));

export default function DesktopDashboard({
  currentUser,
  activeRole,
  onRoleSwitch,
  onLogout,
  showToast,
  onChangePasswordRequest
}) {
  const [currentTab, setCurrentTab] = useState(() => {
    return getDefaultTabForRole(activeRole || currentUser?.role);
  });

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [alertsSummary, setAlertsSummary] = useState({
    fraud_count: 0,
    fraud_alerts: [],
    disputed_salary_count: 0,
    salary_disputes: [],
    pending_device_count: 0,
    pending_requests_count: 0,
    total_red_alerts: 0
  });

  const fetchAlertsSummary = useCallback(async () => {
    try {
      const res = await safeGet("/notifications/summary");
      if (res?.success && res.data) {
        setAlertsSummary(res.data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchAlertsSummary();
  }, [fetchAlertsSummary, refreshTick, currentTab]);

  const handleMonthChange = (m, y) => {
    if (m) setSelectedMonth(Number(m));
    if (y) setSelectedYear(Number(y));
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans relative">
      {/* Sidebar Trái (Tự động chuyển thành Drawer + Bottom Nav khi mở trên điện thoại < 1024px) */}
      <DesktopSidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onSelectTab={(tabId) => {
          setCurrentTab(tabId);
          setIsMobileMenuOpen(false);
        }}
        activeRole={activeRole || currentUser?.role}
        onRoleSwitch={onRoleSwitch}
        currentUser={currentUser}
        onLogout={onLogout}
        alertsSummary={alertsSummary}
        pendingRequestsCount={alertsSummary.pending_requests_count || 0}
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header (Hỗ trợ Safe Area Top & Tránh cụm nút Zalo góc phải trên điện thoại) */}
        <DesktopHeader
          currentUser={currentUser}
          activeRole={activeRole || currentUser?.role}
          onRoleSwitch={onRoleSwitch}
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          onLogout={onLogout}
          onChangePasswordRequest={onChangePasswordRequest}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          alertsSummary={alertsSummary}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onRefresh={() => {
            setRefreshTick((t) => t + 1);
            fetchAlertsSummary();
          }}
        />

        {/* Tab Content with Suspense Loading */}
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 bg-slate-900/60"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)" }}
        >
          <Suspense
            fallback={
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                <span className="text-xs font-semibold">Đang tải phân hệ quản trị...</span>
              </div>
            }
          >
            {/* 1. Ma Trận Chấm Công Toàn Công Ty */}
            {currentTab === "matrix" && (
              <AttendanceMatrixTable
                key={`matrix-${selectedMonth}-${selectedYear}-${refreshTick}`}
                currentUser={currentUser}
                activeRole={activeRole || currentUser?.role}
                userRole={activeRole || currentUser?.role}
                month={selectedMonth}
                year={selectedYear}
                onMonthChange={handleMonthChange}
                showToast={showToast}
                onShowToast={showToast}
              />
            )}

            {/* 2. Bảng Tính Lương & Xuất Báo Cáo */}
            {currentTab === "payroll" && (
              <PayrollGridTable
                key={`payroll-${selectedMonth}-${selectedYear}-${refreshTick}`}
                currentUser={currentUser}
                activeRole={activeRole || currentUser?.role}
                userRole={activeRole || currentUser?.role}
                month={selectedMonth}
                year={selectedYear}
                onMonthChange={handleMonthChange}
                showToast={showToast}
                onShowToast={showToast}
              />
            )}

            {/* 3. Xét Duyệt Đơn Từ */}
            {currentTab === "requests" && (
              <RequestsManagementTab
                key={`requests-${refreshTick}`}
                currentUser={currentUser}
                showToast={showToast}
              />
            )}

            {/* 4. Quản Lý Hồ Sơ Nhân Sự */}
            {currentTab === "management" && (
              <EmployeeManagementTab
                key={`management-${refreshTick}`}
                currentUser={currentUser}
                showToast={showToast}
              />
            )}

            {/* 5. Cấu Hình Công Ty & GPS */}
            {currentTab === "company" && (
              <CompanySettingsTab
                currentUser={currentUser}
                showToast={showToast}
              />
            )}

            {/* 6. Danh Mục Ngày Lễ */}
            {currentTab === "holidays" && (
              <HolidaysTab
                currentUser={currentUser}
                showToast={showToast}
              />
            )}

            {/* 7. Nhật Ký Kiểm Toán & Giám Sát Nhân Viên (V5) */}
            {currentTab === "audit_logs" && (
              <AuditLogsTab
                currentUser={currentUser}
                showToast={showToast}
                onRefreshAlerts={fetchAlertsSummary}
              />
            )}

            {/* 8. Phân Quyền Kế Toán */}
            {currentTab === "permissions" && (
              <AccountantPermissionView
                currentUser={currentUser}
                showToast={showToast}
              />
            )}

            {/* 9. Phê Duyệt Đổi Thiết Bị (Admin) */}
            {currentTab === "devices" && (
              <AdminDeviceApproval
                currentUser={currentUser}
                showToast={showToast}
              />
            )}

            {/* 10. Hồ Sơ Cá Nhân & Phiếu Lương */}
            {currentTab === "profile" && (
              <div className="max-w-lg mx-auto">
                <WorkerProfileTab
                  currentUser={currentUser}
                  onLogout={onLogout}
                  showToast={showToast}
                  onChangePasswordRequest={onChangePasswordRequest}
                />
              </div>
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
