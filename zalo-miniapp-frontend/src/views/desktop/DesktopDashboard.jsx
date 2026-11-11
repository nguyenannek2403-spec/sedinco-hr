import React, { useState, lazy, Suspense } from "react";
import DesktopSidebar from "../../components/DesktopSidebar";
import DesktopHeader from "../../components/DesktopHeader";
import RequestsManagementTab from "./RequestsManagementTab";
import EmployeeManagementTab from "./EmployeeManagementTab";
import CompanySettingsTab from "./CompanySettingsTab";
import HolidaysTab from "./HolidaysTab";
import AuditLogsTab from "./AuditLogsTab";
import { getDefaultTabForRole } from "../../constants/roles";
import { RefreshCw } from "lucide-react";

// Lazy-load các phân hệ nặng
const AttendanceMatrixTable = lazy(() => import("../../components/AttendanceMatrixTable"));
const PayrollGridTable = lazy(() => import("../../components/PayrollGridTable"));
const EmployeeCheckinPC = lazy(() => import("../../components/EmployeeCheckinPC"));
const AccountantPermissionView = lazy(() => import("../../components/AccountantPermissionView"));
const AdminDeviceApproval = lazy(() => import("../../components/AdminDeviceApproval"));
const KioskDisplayView = lazy(() => import("../../components/KioskDisplayView"));
const DiagnosticsView = lazy(() => import("../../components/DiagnosticsView"));

export default function DesktopDashboard({
  currentUser,
  activeRole,
  onLogout,
  showToast,
  onChangePasswordRequest
}) {
  const [currentTab, setCurrentTab] = useState(() => {
    return getDefaultTabForRole(activeRole || currentUser?.role);
  });

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Trái */}
      <DesktopSidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onSelectTab={setCurrentTab}
        activeRole={activeRole || currentUser?.role}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Desktop Header */}
        <DesktopHeader
          currentUser={currentUser}
          activeRole={activeRole || currentUser?.role}
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          onLogout={onLogout}
          onChangePasswordRequest={onChangePasswordRequest}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
        />

        {/* Tab Content with Suspense Loading */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-900/60">
          <Suspense
            fallback={
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                <span className="text-xs font-semibold">Đang tải phân hệ quản trị...</span>
              </div>
            }
          >
            {/* 1. Ma Trận Chấm Công Toàn Công Ty */}
            {currentTab === "matrix" && (
              <AttendanceMatrixTable
                currentUser={currentUser}
                activeRole={activeRole || currentUser?.role}
                month={selectedMonth}
                year={selectedYear}
                showToast={showToast}
              />
            )}

            {/* 2. Bảng Tính Lương & Xuất Báo Cáo */}
            {currentTab === "payroll" && (
              <PayrollGridTable
                currentUser={currentUser}
                activeRole={activeRole || currentUser?.role}
                month={selectedMonth}
                year={selectedYear}
                showToast={showToast}
              />
            )}

            {/* 3. Xét Duyệt Đơn Từ */}
            {currentTab === "requests" && (
              <RequestsManagementTab
                currentUser={currentUser}
                showToast={showToast}
              />
            )}

            {/* 4. Quản Lý Hồ Sơ Nhân Sự */}
            {currentTab === "management" && (
              <EmployeeManagementTab
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

            {/* 7. Nhật Ký Kiểm Toán Hệ Thống */}
            {currentTab === "audit_logs" && (
              <AuditLogsTab
                currentUser={currentUser}
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

            {/* 10. Màn Hình Kiosk QR Động */}
            {currentTab === "kiosk" && (
              <KioskDisplayView
                currentUser={currentUser}
              />
            )}

            {/* 11. Chẩn Đoán & Giám Sát */}
            {currentTab === "diagnostics" && (
              <DiagnosticsView
                currentUser={currentUser}
              />
            )}

            {/* 12. Chấm Công Máy Tính Bàn (Webcam PC) */}
            {currentTab === "checkin_pc" && (
              <EmployeeCheckinPC
                currentUser={currentUser}
                showToast={showToast}
              />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
