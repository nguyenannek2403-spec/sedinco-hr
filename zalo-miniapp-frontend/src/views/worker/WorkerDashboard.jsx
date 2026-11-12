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
      {/* Top Mobile Header - Có Safe Area Top và chừa 96px bên phải tránh cụm nút ... & X của Zalo */}
      <header
        className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 pl-4 pr-[96px] pb-3 flex items-center justify-between gap-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {activeTab !== "checkin" ? (
            <button
              type="button"
              onClick={() => setActiveTab("checkin")}
              className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 flex items-center gap-1 text-xs font-extrabold shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Trở về</span>
            </button>
          ) : (
            <CompanyLogo size="small" theme="dark" layout="horizontal" showSubtitle={false} />
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canSwitchToManagement && typeof onRoleSwitch === "function" && (
            <button
              type="button"
              onClick={() => onRoleSwitch(currentUser.role)}
              className="px-2.5 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-xl text-[10px] font-black uppercase tracking-wider min-h-[36px]"
            >
              Quản trị
            </button>
          )}
          <div className="text-right max-w-[110px]">
            <span className="text-xs font-bold text-white block leading-tight truncate">{currentUser?.ho_ten}</span>
            <span className="text-[10px] text-blue-400 font-mono font-semibold block truncate">{currentUser?.ma_nv}</span>
          </div>
          <button
            onClick={onLogout}
            title="Đăng xuất"
            className="min-w-[40px] min-h-[40px] p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-xl transition-colors flex items-center justify-center"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
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
          <span className="text-[10px]">Chấm công</span>
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
          <span className="text-[10px]">Lịch sử</span>
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
          <span className="text-[10px]">Đơn từ</span>
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
          <span className="text-[10px]">Tài khoản</span>
        </button>
      </nav>

      {/* Modal Bổ Sung Giờ Ra 1 Chạm khi phát hiện quên Check-out */}
      {fixCheckoutInfo && (
        <SmartLeaveRequestModal
          currentUser={currentUser}
          initialDate={fixCheckoutInfo.iso_date}
          initialType="Bổ sung công / Quên chấm giờ ra"
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
