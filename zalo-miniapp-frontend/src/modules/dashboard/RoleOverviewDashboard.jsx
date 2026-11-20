import React from "react";
import {
  Users,
  Clock,
  FileText,
  DollarSign,
  ShieldAlert,
  Activity,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Calendar
} from "lucide-react";
import { ROLES, ROLE_LABELS } from "../../constants/roles";
import { AppButton, SkeletonList } from "../../components/ui";
import { formatViNumber } from "../../utils/viNumberFormat";

const PAYROLL_STATUS_VI = {
  DRAFT: "Bản nháp / Chưa chốt",
  PENDING_APPROVAL: "Chờ Giám đốc duyệt",
  APPROVED: "Đã duyệt & Phát hành",
  REJECTED: "Trả lại rà soát"
};

/**
 * Bảng điều khiển Tổng quan theo Vai trò (Admin & Kế toán):
 * - Chỉ hiển thị KPI & lối tắt thuộc quyền thực tế của vai trò (RBAC + 16 khóa Kế toán)
 * - Chạm vào từng thẻ để nhảy thẳng tới phân hệ xử lý chuyên sâu
 */
export default function RoleOverviewDashboard({
  currentUser,
  activeRole,
  dynamicPerms = {},
  alertsSummary = {},
  isLoading = false,
  onNavigate,
  onOpenLiveBoard,
  onRefresh
}) {
  const isAdmin = activeRole === ROLES.ADMIN;
  const canViewAttendance = isAdmin || dynamicPerms?.attendance_view_all !== false;
  const canViewPayroll = isAdmin || dynamicPerms?.payroll_view_all !== false;
  const canViewRequests = isAdmin || dynamicPerms?.leave_view_all !== false;
  const canViewEmployees = isAdmin || dynamicPerms?.employee_view === true;

  const headcount = alertsSummary?.headcount_today || {};
  const presentCount = Number(headcount.present) || 0;
  const lateCount = Number(headcount.late) || 0;
  const totalHeadcount = Number(headcount.total_employees) || 0;
  const absentCount = Number(headcount.absent) || 0;

  const pendingReqCount = Number(alertsSummary?.pending_requests_count) || 0;
  const pendingOtCount = Number(alertsSummary?.pending_ot_count) || 0;
  const disputedCount = Number(alertsSummary?.disputed_salary_count) || 0;
  const fraudCount = Number(alertsSummary?.fraud_count) || 0;
  const deviceAlertCount = Number(alertsSummary?.pending_device_count) || 0;
  const unreadNotifCount = Number(alertsSummary?.unread_notification_count) || 0;

  const period = alertsSummary?.current_payroll_period || {
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    status: "DRAFT",
    payment_status: "UNPAID",
    is_locked: false
  };

  const lastUpdatedText = alertsSummary?.last_updated_at
    ? new Date(alertsSummary.last_updated_at).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
    : "Vừa xong";

  return (
    <div data-testid="role-overview-dashboard" className="space-y-5 max-w-6xl mx-auto">
      {/* Banner Chào Mừng & Trạng thái Hệ thống */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-700 text-[#0068FF] dark:text-blue-300 text-xs font-extrabold">
              <CheckCircle2 size={13} />
              <span>{ROLE_LABELS[activeRole]}</span>
            </span>
            <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              Cập nhật lúc {lastUpdatedText}
            </span>
          </div>
          <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-snug">
            Tổng quan Điều hành — {currentUser?.ho_ten || ROLE_LABELS[activeRole]}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Chọn nhanh từng thẻ nghiệp vụ bên dưới để mở đúng ngăn chức năng cần xử lý.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {typeof onRefresh === "function" && (
            <AppButton
              variant="secondary"
              icon={RefreshCw}
              loading={isLoading}
              onClick={onRefresh}
              className="text-xs sm:text-sm"
            >
              Làm mới số liệu
            </AppButton>
          )}
          {isAdmin && (
            <AppButton
              data-testid="overview-open-qa-btn"
              variant="primary"
              icon={Activity}
              onClick={() => onNavigate && onNavigate("qa_center")}
              className="text-xs sm:text-sm"
            >
              Mở QA Center
            </AppButton>
          )}
        </div>
      </div>

      {isLoading && !alertsSummary?.headcount_today ? (
        <SkeletonList rows={3} label="Đang tổng hợp số liệu Tổng quan..." />
      ) : (
        <>
          {/* Lưới KPI trực tiếp theo vai trò */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {canViewAttendance && (
              <button
                type="button"
                data-testid="overview-kpi-attendance"
                onClick={() =>
                  typeof onOpenLiveBoard === "function"
                    ? onOpenLiveBoard("present")
                    : onNavigate && onNavigate("matrix")
                }
                className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 rounded-2xl p-4 shadow-sm transition-all cursor-pointer space-y-2 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Chấm công hôm nay
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#0068FF] dark:text-blue-300 flex items-center justify-center shrink-0">
                    <Clock size={18} />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  {formatViNumber(presentCount, 0)} / {formatViNumber(totalHeadcount, 0)}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 w-full">
                  <span>
                    Đi muộn: <strong className="text-amber-700 dark:text-amber-300">{lateCount}</strong> • Chưa vào: <strong>{absentCount}</strong>
                  </span>
                  <ArrowRight size={14} className="text-[#0068FF] dark:text-blue-400 shrink-0" />
                </div>
              </button>
            )}

            {canViewRequests && (
              <button
                type="button"
                data-testid="overview-kpi-requests"
                onClick={() => onNavigate && onNavigate("requests")}
                className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500 rounded-2xl p-4 shadow-sm transition-all cursor-pointer space-y-2 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Đơn từ &amp; OT chờ duyệt
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <FileText size={18} />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  {formatViNumber(pendingReqCount + pendingOtCount, 0)}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 w-full">
                  <span>
                    Đơn từ: <strong>{pendingReqCount}</strong> • Tăng ca OT: <strong>{pendingOtCount}</strong>
                  </span>
                  <ArrowRight size={14} className="text-amber-700 dark:text-amber-300 shrink-0" />
                </div>
              </button>
            )}

            {canViewPayroll && (
              <button
                type="button"
                data-testid="overview-kpi-payroll"
                onClick={() =>
                  onNavigate && onNavigate(isAdmin ? "management" : "payroll", isAdmin ? "payroll" : null)
                }
                className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-500 rounded-2xl p-4 shadow-sm transition-all cursor-pointer space-y-2 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Kỳ lương T{period.month}/{period.year}
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                    <DollarSign size={18} />
                  </div>
                </div>
                <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-snug">
                  {period.payment_status === "PAID"
                    ? "Đã chi trả lương"
                    : PAYROLL_STATUS_VI[period.status] || period.status}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 w-full">
                  <span>
                    Khiếu nại: <strong className={disputedCount > 0 ? "text-rose-600 dark:text-rose-400" : ""}>{disputedCount}</strong> • {period.is_locked ? "Đã khóa công" : "Đang mở công"}
                  </span>
                  <ArrowRight size={14} className="text-emerald-700 dark:text-emerald-300 shrink-0" />
                </div>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                data-testid="overview-kpi-alerts"
                onClick={() =>
                  onNavigate &&
                  onNavigate("management", fraudCount > 0 ? "audit_logs" : "employees")
                }
                className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-400 dark:hover:border-rose-500 rounded-2xl p-4 shadow-sm transition-all cursor-pointer space-y-2 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Cảnh báo &amp; Thiết bị
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0">
                    <ShieldAlert size={18} />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  {formatViNumber(fraudCount + deviceAlertCount, 0)}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 w-full">
                  <span>
                    An ninh: <strong>{fraudCount}</strong> • Thiết bị: <strong>{deviceAlertCount}</strong>
                  </span>
                  <ArrowRight size={14} className="text-rose-700 dark:text-rose-300 shrink-0" />
                </div>
              </button>
            )}

            {!isAdmin && canViewEmployees && (
              <button
                type="button"
                data-testid="overview-kpi-employees"
                onClick={() => onNavigate && onNavigate("management")}
                className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-2xl p-4 shadow-sm transition-all cursor-pointer space-y-2 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Hồ sơ Nhân sự
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
                    <Users size={18} />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  {formatViNumber(totalHeadcount, 0)}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 w-full">
                  <span>Mở danh sách nhân viên</span>
                  <ArrowRight size={14} className="text-indigo-700 dark:text-indigo-300 shrink-0" />
                </div>
              </button>
            )}
          </div>

          {/* Điều hướng nhanh theo Phân hệ chuyên biệt */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Truy cập nhanh các Phân hệ Chức năng
              </h2>
              {unreadNotifCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs font-bold">
                  <AlertTriangle size={13} />
                  <span>{unreadNotifCount} thông báo chưa đọc trên Chuông 🔔</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {canViewAttendance && (
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate("matrix")}
                  className="min-h-[54px] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 hover:bg-blue-50/80 dark:bg-slate-800/70 dark:hover:bg-slate-800 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Calendar size={18} className="text-[#0068FF] dark:text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">Bảng công Ma trận 31 ngày</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">Chấm công hộ, chỉnh sửa 1 chạm, chốt kỳ công</div>
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-slate-500 shrink-0" />
                </button>
              )}

              {canViewRequests && (
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate("requests")}
                  className="min-h-[54px] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 hover:bg-blue-50/80 dark:bg-slate-800/70 dark:hover:bg-slate-800 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">Đơn từ &amp; Tăng ca OT</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">Duyệt nghỉ phép, bổ sung công, tạm ứng, OT</div>
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-slate-500 shrink-0" />
                </button>
              )}

              {canViewPayroll && (
                <button
                  type="button"
                  onClick={() =>
                    onNavigate && onNavigate(isAdmin ? "management" : "payroll", isAdmin ? "payroll" : null)
                  }
                  className="min-h-[54px] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 hover:bg-blue-50/80 dark:bg-slate-800/70 dark:hover:bg-slate-800 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <DollarSign size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">Tiền lương &amp; Phiếu lương</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">Xem bảng tổng quan, bóc tách chi tiết &amp; CSV</div>
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-slate-500 shrink-0" />
                </button>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate("management", "employees")}
                  className="min-h-[54px] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 hover:bg-blue-50/80 dark:bg-slate-800/70 dark:hover:bg-slate-800 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Users size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">Nhân sự &amp; Thiết bị 360°</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">Quản lý hồ sơ, đổi máy, khóa tài khoản</div>
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-slate-500 shrink-0" />
                </button>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate("qa_center")}
                  className="min-h-[54px] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 hover:bg-blue-50/80 dark:bg-slate-800/70 dark:hover:bg-slate-800 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Activity size={18} className="text-[#0068FF] dark:text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">QA Center — Chất lượng hệ thống</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">Theo dõi 8 nhóm test, bug registry &amp; P95</div>
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-slate-500 shrink-0" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
