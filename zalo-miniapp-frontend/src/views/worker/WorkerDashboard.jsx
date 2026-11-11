import React, { useState } from "react";
import {
  Clock,
  Calendar,
  FileText,
  User,
  ShieldCheck,
  LogOut,
  Bell
} from "lucide-react";
import OneTouchCheckIn from "../../components/OneTouchCheckIn";
import WorkerHistoryTab from "./WorkerHistoryTab";
import WorkerRequestsTab from "./WorkerRequestsTab";
import WorkerProfileTab from "./WorkerProfileTab";
import CompanyLogo from "../../components/CompanyLogo";

export default function WorkerDashboard({
  currentUser,
  onLogout,
  showToast,
  onChangePasswordRequest
}) {
  const [activeTab, setActiveTab] = useState("checkin"); // 'checkin', 'history', 'requests', 'profile'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between max-w-md mx-auto shadow-2xl relative pb-20">
      {/* Top Mobile Header */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <CompanyLogo size="small" theme="dark" layout="horizontal" showSubtitle={false} />
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className="text-xs font-bold text-white block leading-tight">{currentUser?.ho_ten}</span>
            <span className="text-[10px] text-blue-400 font-mono font-semibold">{currentUser?.ma_nv}</span>
          </div>
          <button
            onClick={onLogout}
            title="Đăng xuất"
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-xl transition-colors"
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
              onCheckInSuccess={() => {
                if (showToast) showToast("Điểm danh thành công!", "success");
              }}
            />
          </div>
        )}

        {activeTab === "history" && (
          <WorkerHistoryTab currentUser={currentUser} />
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

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/90 max-w-md mx-auto px-2 py-1.5 flex items-center justify-around shadow-2xl">
        <button
          onClick={() => setActiveTab("checkin")}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            activeTab === "checkin"
              ? "text-blue-400 font-bold"
              : "text-slate-500 hover:text-slate-300 font-medium"
          }`}
        >
          <Clock className={`w-5 h-5 ${activeTab === "checkin" ? "scale-110" : ""}`} />
          <span className="text-[10px]">Chấm công</span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            activeTab === "history"
              ? "text-blue-400 font-bold"
              : "text-slate-500 hover:text-slate-300 font-medium"
          }`}
        >
          <Calendar className={`w-5 h-5 ${activeTab === "history" ? "scale-110" : ""}`} />
          <span className="text-[10px]">Lịch sử</span>
        </button>

        <button
          onClick={() => setActiveTab("requests")}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            activeTab === "requests"
              ? "text-blue-400 font-bold"
              : "text-slate-500 hover:text-slate-300 font-medium"
          }`}
        >
          <FileText className={`w-5 h-5 ${activeTab === "requests" ? "scale-110" : ""}`} />
          <span className="text-[10px]">Đơn từ</span>
        </button>

        <button
          onClick={() => setActiveTab("profile")}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            activeTab === "profile"
              ? "text-blue-400 font-bold"
              : "text-slate-500 hover:text-slate-300 font-medium"
          }`}
        >
          <User className={`w-5 h-5 ${activeTab === "profile" ? "scale-110" : ""}`} />
          <span className="text-[10px]">Tài khoản</span>
        </button>
      </nav>
    </div>
  );
}
