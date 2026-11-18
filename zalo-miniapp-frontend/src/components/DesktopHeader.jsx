import React, { useState } from "react";
import {
  Clock,
  Smartphone,
  RefreshCw,
  ChevronRight,
  Menu,
  Bell,
  ShieldAlert,
  AlertTriangle,
  FileText,
  DollarSign,
  ArrowLeft,
  LogOut,
  KeyRound
} from "lucide-react";
import { ROLE_LABELS, ROLES } from "../constants/roles";
import { AppModal } from "./ui";
import { ThemeToggleButton } from "../context/ThemeContext";

export default function DesktopHeader({
  currentUser,
  currentTab,
  setCurrentTab,
  onNavigateAlert,
  managementSubTab = "employees",
  settingsSubTab = "company",
  activeRole,
  dynamicPerms = {},
  onLogout,
  onChangePasswordRequest,
  currentTime,
  alertsSummary = {},
  onRefresh,
  isLoading,
  onOpenMobileMenu
}) {
  const [showAlertPanel, setShowAlertPanel] = useState(false);

  const fraudCount = Number(alertsSummary?.fraud_count) || 0;
  const disputedCount = Number(alertsSummary?.disputed_salary_count) || 0;
  const deviceCount = Number(alertsSummary?.pending_device_count) || 0;
  const pendingReqCount = Number(alertsSummary?.pending_requests_count) || 0;

  const isAlertVisibleForRole = (item) => {
    if (activeRole === ROLES.ADMIN) return true;
    if (item.category === "salary_dispute") return dynamicPerms?.payroll_view_all !== false;
    if (item.category === "pending_request") return dynamicPerms?.leave_view_all !== false;
    return false;
  };

  const rawActionable = Array.isArray(alertsSummary?.actionable_alerts)
    ? alertsSummary.actionable_alerts
    : null;

  const fallbackAlerts = [];
  if (fraudCount > 0) {
    fallbackAlerts.push({
      id: "summary_fraud",
      category: "fraud",
      severity: "critical",
      title: `${fraudCount} Cảnh báo Vị trí / Thiết bị lạ`,
      description: "Nhấn để mở Nhật ký Giám sát, xem chi tiết vị trí/thiết bị và xử lý tài khoản.",
      target_tab: "management",
      target_subtab: "audit_logs"
    });
  }
  if (deviceCount > 0) {
    fallbackAlerts.push({
      id: "summary_device",
      category: "device",
      severity: "high",
      title: `${deviceCount} Cảnh báo đa thiết bị / Đổi máy`,
      description: "Nhấn để mở Hồ sơ 360° kiểm tra và khóa cố định 1 thiết bị cho nhân viên.",
      target_tab: "management",
      target_subtab: "employees"
    });
  }
  if (disputedCount > 0) {
    fallbackAlerts.push({
      id: "summary_dispute",
      category: "salary_dispute",
      severity: "high",
      title: `${disputedCount} Khiếu nại sai lương từ Nhân viên`,
      description: "Nhân viên đã gửi báo cáo sai lương kèm minh chứng. Nhấn để đối soát ngay.",
      target_tab: activeRole === ROLES.ADMIN ? "management" : "payroll",
      target_subtab: activeRole === ROLES.ADMIN ? "payroll" : null
    });
  }
  if (pendingReqCount > 0) {
    fallbackAlerts.push({
      id: "summary_requests",
      category: "pending_request",
      severity: "medium",
      title: `${pendingReqCount} Đơn từ nhân sự đang chờ duyệt`,
      description: "Nghỉ phép, bổ sung công, ứng lương hoặc tăng ca chờ phê duyệt.",
      target_tab: "requests",
      target_subtab: null
    });
  }

  const visibleAlerts = (rawActionable || fallbackAlerts)
    .filter(isAlertVisibleForRole)
    .map((item) => {
      if (activeRole === ROLES.ACCOUNTANT && item.category === "salary_dispute") {
        return { ...item, target_tab: "payroll", target_subtab: null };
      }
      return item;
    });

  const criticalOrHighCount = visibleAlerts.filter((a) => a.severity === "critical" || a.severity === "high").length;
  const totalBellCount = visibleAlerts.length;

  const getTabTitle = () => {
    switch (currentTab) {
      case "matrix":
        return activeRole === "accountant"
          ? "Bảng Chấm Công Ma Trận"
          : "Bảng Công Ma Trận (Toàn Công Ty)";
      case "requests":
        return "Xét Duyệt Đơn Từ";
      case "management":
        if (activeRole !== ROLES.ADMIN) return "Quản Lý Nhân Sự";
        if (managementSubTab === "payroll") return "Trung Tâm Quản Trị • Giám Sát Lương";
        if (managementSubTab === "audit_logs") return "Trung Tâm Quản Trị • Nhật Ký & An Ninh";
        return "Trung Tâm Quản Trị • Nhân Sự & Thiết Bị";
      case "settings":
        if (settingsSubTab === "permissions") return "Cài Đặt Hệ Thống • Phân Quyền Kế Toán";
        if (settingsSubTab === "holidays") return "Cài Đặt Hệ Thống • Lịch Nghỉ Lễ (x3)";
        return "Cài Đặt Hệ Thống • Công Ty & GPS";
      case "payroll":
        return "Bảng Lương & Đối Soát Khiếu Nại";
      case "profile":
        return activeRole === ROLES.ADMIN
          ? "Hồ Sơ Quản Trị Hệ Thống"
          : "Hồ Sơ Cá Nhân & Phiếu Lương";
      default:
        return "Bảng Điều Khiển Sedinco HR";
    }
  };

  const displayTime = currentTime instanceof Date ? currentTime : new Date();

  return (
    <header
      className="bg-white/95 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-[10px] sm:px-6 lg:px-8 pb-2.5 flex items-center justify-between gap-[6px] sm:gap-2 sticky top-0 z-40 select-none shadow-sm transition-colors duration-200"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
    >
      {/* Trái: Nút Menu Mobile + Nút Trở về trên tab phụ + Tiêu đề tab */}
      <div className="flex items-center gap-[6px] sm:gap-2 min-w-0 shrink-0 sm:shrink">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden min-w-[44px] min-h-[44px] p-[8px] sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 flex items-center justify-center shrink-0"
            aria-label="Mở danh mục quản trị"
            title="Mở danh mục quản trị"
          >
            <Menu size={18} />
          </button>
        )}

        {currentTab && currentTab !== "matrix" && typeof setCurrentTab === "function" && (
          <button
            type="button"
            aria-label="Trở về"
            onClick={() => setCurrentTab("matrix")}
            className="hidden sm:flex min-w-[44px] min-h-[44px] px-[8px] sm:px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-600/20 dark:hover:bg-blue-600/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/40 items-center justify-center gap-1 text-xs font-extrabold shrink-0"
          >
            <ArrowLeft size={15} className="shrink-0" />
            <span className="hidden sm:inline">Trở về</span>
          </button>
        )}

        <div className="hidden lg:block min-w-0 max-w-[260px]">
          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-300 font-bold leading-snug">
            <span className="truncate">Sedinco Nhân Sự</span>
            <ChevronRight size={12} className="shrink-0" />
            <span className="text-blue-600 dark:text-blue-400 font-black truncate">{ROLE_LABELS[activeRole] || currentUser?.ho_ten}</span>
          </div>
          <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight truncate">
            {getTabTitle()}
          </h2>
        </div>
      </div>

      {/* Giữa: Tên nhân sự nổi bật + Mã NV / Vai trò (Tránh tràn chữ với truncate) */}
      <div className="flex-1 min-w-0 text-center px-1">
        <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-tight truncate">
          {currentUser?.ho_ten || ROLE_LABELS[activeRole] || "Quản trị viên"}
        </div>
        <div className="text-xs text-blue-600 dark:text-blue-300 font-semibold leading-snug truncate">
          {currentUser?.login_username || currentUser?.ma_nv ? `${currentUser?.login_username || currentUser?.ma_nv} • ` : ""}
          {ROLE_LABELS[activeRole] || getTabTitle()}
        </div>
      </div>

      {/* Phải: Giao diện, Tài khoản, Thông báo, Làm mới & Đăng xuất */}
      <div className="flex items-center gap-[6px] sm:gap-1.5 shrink-0 relative">
        {/* Đồng hồ số thời gian thực (Desktop) */}
        <div className="hidden xl:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
          <Clock size={14} className="text-blue-600 dark:text-blue-400" />
          <span>
            {displayTime.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
          </span>
        </div>

        {/* Nút chuyển Sáng / Tối */}
        <ThemeToggleButton compact />

        {/* Nút Tài khoản & Đổi Mật Khẩu */}
        {typeof onChangePasswordRequest === "function" && (
          <button
            type="button"
            onClick={onChangePasswordRequest}
            data-testid="header-account-btn"
            aria-label="Tài khoản và mật khẩu"
            title="Cập nhật Tài khoản đăng nhập (SĐT) & Mật khẩu"
            className="hidden sm:flex min-w-[44px] min-h-[44px] px-2.5 py-1.5 bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-500/20 text-slate-700 hover:text-blue-700 dark:text-slate-200 dark:hover:text-blue-300 border border-slate-300 dark:border-slate-700 rounded-xl items-center justify-center gap-1.5 text-xs font-bold transition-colors"
          >
            <KeyRound size={14} className="shrink-0" />
            <span className="hidden xl:inline">Tài khoản</span>
          </button>
        )}

        {/* Nút Chuông Thông Báo & Cảnh Báo Deep-Link */}
        <button
          type="button"
          data-bell-button="true"
          onClick={() => setShowAlertPanel(!showAlertPanel)}
          aria-label="Trung tâm cảnh báo và thông báo"
          className={`relative min-w-[44px] min-h-[44px] px-[8px] sm:px-2.5 py-1.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-black transition-all ${
            criticalOrHighCount > 0
              ? "bg-rose-50 dark:bg-rose-600/20 border-rose-300 dark:border-rose-500 text-rose-700 dark:text-rose-300 shadow-sm"
              : totalBellCount > 0
              ? "bg-amber-50 dark:bg-amber-500/20 border-amber-300 dark:border-amber-400 text-amber-700 dark:text-amber-200 shadow-sm"
              : "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
          title="Trung tâm Thông báo & Cảnh báo"
        >
          <Bell
            size={16}
            className={
              criticalOrHighCount > 0
                ? "text-rose-600 dark:text-rose-400 animate-bounce"
                : totalBellCount > 0
                ? "text-amber-600 dark:text-amber-300"
                : "text-slate-600 dark:text-slate-300"
            }
          />
          {totalBellCount > 0 && (
            <span
              className={`px-[5px] py-0.5 text-[11px] leading-none rounded-full text-white font-black ${
                criticalOrHighCount > 0 ? "bg-rose-600" : "bg-amber-600"
              }`}
            >
              {totalBellCount}
            </span>
          )}
        </button>

        {/* Nút Làm mới dữ liệu (Desktop) */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Làm mới dữ liệu"
            className="hidden sm:flex min-w-[44px] min-h-[44px] p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl transition-all active:scale-95 items-center justify-center"
            title="Tải lại dữ liệu mới nhất"
          >
            <RefreshCw size={15} className={isLoading ? "animate-spin text-blue-600 dark:text-blue-400" : ""} />
          </button>
        )}

        {/* Nút Đăng xuất rõ ràng kèm Icon */}
        {typeof onLogout === "function" && (
          <button
            type="button"
            aria-label="Đăng xuất"
            onClick={onLogout}
            title="Đăng xuất"
            className="min-w-[44px] min-h-[44px] px-[10px] sm:px-3 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-500/20 text-slate-700 hover:text-rose-700 dark:text-slate-100 dark:hover:text-rose-200 border border-slate-300 dark:border-slate-700 hover:border-rose-400 flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 transition-colors"
          >
            <LogOut size={14} className="shrink-0" />
            <span className="hidden sm:inline">Đăng xuất</span>
          </button>
        )}

        {/* Modal Trung tâm Thông báo & Cảnh báo 1 chạm (Render qua AppModal Portal) */}
        <AppModal
          open={showAlertPanel}
          onClose={() => setShowAlertPanel(false)}
          title={`Thông báo & Cảnh báo (${totalBellCount})`}
          subtitle="Chạm vào mục bất kỳ để mở thẳng nơi xử lý"
          icon={<ShieldAlert className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />}
          maxWidthClass="max-w-lg"
        >
          <div className="p-4 space-y-2.5">
            {visibleAlerts.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-300 py-6 text-center">
                Hệ thống ổn định. Không có cảnh báo vị trí/thiết bị, khiếu nại lương hay đơn từ nào đang chờ xử lý.
              </p>
            ) : (
              <div className="space-y-2.5">
                {visibleAlerts.map((alert) => {
                  const styleMap = {
                    fraud: {
                      card: "bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/70 dark:hover:bg-rose-900/70 border-rose-200 dark:border-rose-500/50",
                      title: "text-rose-800 dark:text-rose-200",
                      action: "Xem & Khóa →",
                      Icon: ShieldAlert,
                      iconColor: "text-rose-600 dark:text-rose-400"
                    },
                    device: {
                      card: "bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/70 border-indigo-200 dark:border-indigo-500/50",
                      title: "text-indigo-800 dark:text-indigo-200",
                      action: "Mở 360° →",
                      Icon: Smartphone,
                      iconColor: "text-indigo-600 dark:text-indigo-300"
                    },
                    salary_dispute: {
                      card: "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/70 dark:hover:bg-amber-900/70 border-amber-200 dark:border-amber-500/50",
                      title: "text-amber-900 dark:text-amber-200",
                      action: "Xem phiếu →",
                      Icon: DollarSign,
                      iconColor: "text-amber-600 dark:text-amber-300"
                    },
                    pending_request: {
                      card: "bg-blue-50 hover:bg-blue-100 dark:bg-slate-800/90 dark:hover:bg-slate-700/90 border-blue-200 dark:border-blue-500/40",
                      title: "text-blue-800 dark:text-blue-200",
                      action: "Duyệt đơn →",
                      Icon: FileText,
                      iconColor: "text-blue-600 dark:text-blue-300"
                    }
                  };
                  const theme = styleMap[alert.category] || {
                    card: "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-600",
                    title: "text-slate-900 dark:text-white",
                    action: "Mở xử lý →",
                    Icon: AlertTriangle,
                    iconColor: "text-amber-600 dark:text-amber-300"
                  };
                  const IconComp = theme.Icon;

                  return (
                    <button
                      key={alert.id}
                      type="button"
                      data-alert-item={alert.id}
                      data-alert-category={alert.category}
                      onClick={() => {
                        setShowAlertPanel(false);
                        if (typeof onNavigateAlert === "function") {
                          onNavigateAlert(alert);
                        } else if (setCurrentTab && alert.target_tab) {
                          setCurrentTab(alert.target_tab);
                        }
                      }}
                      className={`w-full min-h-[52px] text-left p-3.5 rounded-xl border space-y-1 transition cursor-pointer ${theme.card}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-xs font-black flex items-center gap-1.5 leading-snug ${theme.title}`}>
                          <IconComp size={14} className={`${theme.iconColor} shrink-0`} />
                          <span>{alert.title}</span>
                        </span>
                        <span className={`text-xs font-bold underline shrink-0 whitespace-nowrap ${theme.title}`}>
                          {theme.action}
                        </span>
                      </div>
                      {alert.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-200/90 leading-relaxed pl-5">
                          {alert.description}
                        </p>
                      )}
                      {alert.created_at && (
                        <div className="text-xs text-slate-400 pl-5">
                          {new Date(alert.created_at).toLocaleString("vi-VN")}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </AppModal>
      </div>
    </header>
  );
}
