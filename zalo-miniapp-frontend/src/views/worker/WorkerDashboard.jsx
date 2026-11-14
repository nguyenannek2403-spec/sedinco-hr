import React, { useState } from "react";
import {
  Clock,
  Calendar,
  FileText,
  User,
  ShieldCheck,
  LogOut,
  Bell,
  ArrowLeft
} from "lucide-react";
import OneTouchCheckIn from "../../components/OneTouchCheckIn";
import WorkerHistoryTab from "./WorkerHistoryTab";
import WorkerRequestsTab from "./WorkerRequestsTab";
import WorkerProfileTab from "./WorkerProfileTab";
import CompanyLogo from "../../components/CompanyLogo";
import SmartLeaveRequestModal from "../../components/SmartLeaveRequestModal";

export default function WorkerDashboard({
  currentUser,
  activeRole,
  onRoleSwitch,
  onLogout,
  showToast,
  onChangePasswordRequest
}) {
  const [activeTab, setActiveTab] = useState("checkin"); // 'checkin', 'history', 'requests', 'profile'
  const [fixCheckoutInfo, setFixCheckoutInfo] = useState(null);
  const canSwitchToManagement =
    currentUser?.role === "admin" || currentUser?.role === "accountant";

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between max-w-md mx-auto shadow-2xl relative overflow-x-hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)" }}
    >
      {/* Top Mobile Header - Chuẩn hóa 3 vùng: Trái (Trở về/Logo) - Giữa (Tên + Mã/Role) - Phải (Đăng xuất) & chừa cụm nút Zalo */}
      <header
        className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 pl-3 pr-[96px] pb-2.5 flex items-center justify-between gap-2 shadow-sm"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        {/* Trái: Nút Trở về (ở tab phụ) hoặc Logo công ty */}
        <div className="flex items-center gap-1.5 shrink-0">
          {activeTab !== "checkin" ? (
            <button
              type="button"
              onClick={() => setActiveTab("checkin")}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 flex items-center gap-1.5 text-xs font-bold shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Trở về</span>
            </button>
          ) : canSwitchToManagement && typeof onRoleSwitch === "function" ? (
            <button
              type="button"
              onClick={() => onRoleSwitch(currentUser.role)}
              className="min-h-[44px] px-3 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-200 rounded-xl text-xs font-bold shrink-0"
            >
              Quản trị
            </button>
          ) : (
            <CompanyLogo size="small" theme="dark" layout="horizontal" showSubtitle={false} />
          )}
        </div>

        {/* Giữa: Tên nhân viên nổi bật + Mã NV & Vai trò */}
        <div className="flex-1 min-w-0 text-center px-1">
          <div className="text-xs font-extrabold text-white leading-tight truncate">
            {currentUser?.ho_ten || "Nhân viên"}
          </div>
          <div className="text-xs text-blue-300 font-semibold leading-snug break-words">
            {currentUser?.ma_nv || "NV"} • {currentUser?.role === "admin" ? "Quản trị" : currentUser?.role === "accountant" ? "Kế toán" : "Nhân sự"}
          </div>
        </div>

        {/* Phải: Nút Đăng xuất rõ ràng kèm Icon */}
        <button
          type="button"
          onClick={onLogout}
          title="Đăng xuất"
          className="min-h-[44px] px-3 py-2 bg-slate-800/90 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/40 text-slate-200 hover:text-rose-300 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-bold shrink-0"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span>Đăng xuất</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === "checkin" && (
          <div className="p-4 space-y-4">
            <OneTouchCheckIn
              currentUser={currentUser}
              onOpenFixCheckoutRequest={(info) => setFixCheckoutInfo(info)}
              onCheckInSuccess={() => {
                if (showToast) showToast("Điểm danh thành công!", "success");
              }}
            />
          </div>
        )}

        {activeTab === "history" && (
          <WorkerHistoryTab currentUser={currentUser} showToast={showToast} />
        )}

        {activeTab === "requests" && (
          <WorkerRequestsTab currentUser={currentUser} showToast={showToast} />
        )}

        {activeTab === "profile" && (
          <WorkerProfileTab
            currentUser={currentUser}
            onLogout={onLogout}
            showToast={showToast}
            onChangePasswordRequest={onChangePasswordRequest}
          />
        )}
      </main>

      {/* Bottom Navigation Bar - Tối ưu Safe Area Bottom cho iPhone Home Indicator & Touch Target >= 44px */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/90 max-w-md mx-auto px-2 pt-1.5 flex items-center justify-around shadow-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
      >
        <button
          onClick={() => setActiveTab("checkin")}
          className={`flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-[68px] py-1 px-3 rounded-xl transition-all ${
            activeTab === "checkin"
              ? "text-blue-400 font-bold bg-blue-500/10"
              : "text-slate-400 hover:text-slate-200 font-medium"
          }`}
        >
          <Clock className={`w-5 h-5 ${activeTab === "checkin" ? "scale-110" : ""}`} />
          <span className="text-xs leading-tight">Chấm công</span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-[68px] py-1 px-3 rounded-xl transition-all ${
            activeTab === "history"
              ? "text-blue-400 font-bold bg-blue-500/10"
              : "text-slate-400 hover:text-slate-200 font-medium"
          }`}
        >
          <Calendar className={`w-5 h-5 ${activeTab === "history" ? "scale-110" : ""}`} />
          <span className="text-xs leading-tight">Lịch sử</span>
        </button>

        <button
          onClick={() => setActiveTab("requests")}
          className={`flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-[68px] py-1 px-3 rounded-xl transition-all ${
            activeTab === "requests"
              ? "text-blue-400 font-bold bg-blue-500/10"
              : "text-slate-400 hover:text-slate-200 font-medium"
          }`}
        >
          <FileText className={`w-5 h-5 ${activeTab === "requests" ? "scale-110" : ""}`} />
          <span className="text-xs leading-tight">Đơn từ</span>
        </button>

        <button
          onClick={() => setActiveTab("profile")}
          className={`flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-[68px] py-1 px-3 rounded-xl transition-all ${
            activeTab === "profile"
              ? "text-blue-400 font-bold bg-blue-500/10"
              : "text-slate-400 hover:text-slate-200 font-medium"
          }`}
        >
          <User className={`w-5 h-5 ${activeTab === "profile" ? "scale-110" : ""}`} />
          <span className="text-xs leading-tight">Tài khoản</span>
        </button>
      </nav>

      {/* Modal Bổ Sung Giờ Ra 1 Chạm khi phát hiện quên Check-out */}
      {fixCheckoutInfo && (
        <SmartLeaveRequestModal
          currentUser={currentUser}
          initialDate={fixCheckoutInfo.iso_date}
          initialMode="Bổ sung công / Quên chấm giờ ra"
          initialCorrectionMode="CHECK_OUT"
          initialCheckInTime={fixCheckoutInfo.check_in_time ? String(fixCheckoutInfo.check_in_time).slice(0, 5) : "07:30"}
          initialCheckOutTime="17:30"
          initialReason={`Ngày ${fixCheckoutInfo.short_date} em đã chấm công Vào lúc ${String(fixCheckoutInfo.check_in_time || "").slice(0, 5)} nhưng quên bấm Giờ Ra. Kính mong Admin duyệt bổ sung giờ ra.`}
          onClose={() => setFixCheckoutInfo(null)}
          onRequestSubmitted={() => {
            setFixCheckoutInfo(null);
            if (showToast) showToast("Đã gửi đơn bổ sung giờ ra thành công!", "success");
          }}
        />
      )}
    </div>
  );
}
