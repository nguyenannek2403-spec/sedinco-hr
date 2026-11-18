import React, { useState } from "react";
import {
  Clock,
  Calendar,
  FileText,
  User,
  LogOut,
  ArrowLeft
} from "lucide-react";
import OneTouchCheckIn from "../../components/OneTouchCheckIn";
import WorkerHistoryTab from "./WorkerHistoryTab";
import WorkerRequestsTab from "./WorkerRequestsTab";
import WorkerProfileTab from "./WorkerProfileTab";
import SmartLeaveRequestModal from "../../components/SmartLeaveRequestModal";
import { ThemeToggleButton } from "../../context/ThemeContext";

export default function WorkerDashboard({
  currentUser,
  onLogout,
  showToast,
  onChangePasswordRequest
}) {
  const [activeTab, setActiveTab] = useState("checkin"); // 'checkin', 'history', 'requests', 'profile'
  const [fixCheckoutInfo, setFixCheckoutInfo] = useState(null);
  const [quickServiceMode, setQuickServiceMode] = useState(null);

  const initials = String(currentUser?.ho_ten || "NV")
    .trim()
    .split(/\s+/)
    .slice(-1)[0]?.[0]
    ?.toUpperCase() || "N";

  return (
    <div
      className="w-full h-[100dvh] bg-[#F4F6F9] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col max-w-md mx-auto shadow-2xl relative overflow-hidden transition-colors duration-200"
    >
      {/* Top ZaUI Doctor Gradient Header — Tách tầng an toàn tuyệt đối khỏi cụm capsule 96px Zalo */}
      <header
        className={`shrink-0 z-40 w-full bg-[#0055D4] bg-gradient-to-r from-[#0055D4] via-[#0068FF] to-[#0284C7] dark:bg-slate-900 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 text-white px-3.5 pb-2.5 flex flex-col gap-1.5 transition-colors duration-200 ${
          activeTab !== "checkin" ? "rounded-b-[24px] shadow-md" : ""
        }`}
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        {/* Hàng 1: Vùng chừa cụm capsule Zalo (pr-[96px] trên mobile) */}
        <div className="flex items-center gap-2.5 pr-[96px] sm:pr-0 min-h-[44px]">
          {activeTab !== "checkin" ? (
            <button
              type="button"
              onClick={() => setActiveTab("checkin")}
              aria-label="Trở về"
              className="min-w-[44px] min-h-[44px] px-2.5 py-2 rounded-full bg-blue-900/45 hover:bg-blue-900/65 dark:bg-slate-800/90 text-white border border-white/25 flex items-center justify-center gap-1 text-xs font-bold whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>Trở về</span>
            </button>
          ) : (
            <div className="w-10 h-10 rounded-full bg-white/95 dark:bg-slate-800 border-2 border-white/50 dark:border-slate-700 flex items-center justify-center shadow-sm shrink-0 text-sm font-extrabold text-[#0068FF] dark:text-blue-300">
              {initials}
            </div>
          )}

          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-extrabold text-white leading-tight break-words">
              {activeTab === "checkin"
                ? `Xin chào, ${currentUser?.ho_ten || "Nhân viên"}`
                : activeTab === "history"
                  ? "Lịch sử Chấm công"
                  : activeTab === "requests"
                    ? "Đơn từ & Phép năm"
                    : "Tài khoản Cá nhân"}
            </div>
            <div className="text-xs text-blue-100 dark:text-blue-300 font-semibold leading-snug break-words mt-0.5">
              {currentUser?.login_username || currentUser?.ma_nv || "NV"} •{" "}
              {currentUser?.role === "admin"
                ? "Quản trị"
                : currentUser?.role === "accountant"
                  ? "Kế toán"
                  : currentUser?.department || "Nhân sự"}
            </div>
          </div>
        </div>

        {/* Hàng 2: Thanh công cụ nhanh (Nằm dưới vùng capsule) */}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-900/45 dark:bg-slate-800/90 border border-white/20 text-xs font-semibold text-white">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span>{currentUser?.ho_ten || "Nhân viên Sedinco"}</span>
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            <ThemeToggleButton compact />
            <button
              type="button"
              onClick={onLogout}
              title="Đăng xuất"
              aria-label="Đăng xuất"
              className="min-w-[44px] min-h-[44px] px-3 py-2 bg-blue-900/45 hover:bg-rose-600/85 dark:bg-slate-800/90 dark:hover:bg-rose-600/80 border border-white/25 dark:border-slate-700 text-white rounded-full transition-colors flex items-center justify-center gap-1 text-xs font-bold whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Thoát</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main data-scroll-container="worker" className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div key={activeTab} className="animate-tab-enter pb-6">
          {activeTab === "checkin" && (
            <OneTouchCheckIn
              currentUser={currentUser}
              showToast={showToast}
              onOpenQuickService={(mode) => setQuickServiceMode(mode)}
              onOpenFixCheckoutRequest={(info) => setFixCheckoutInfo(info)}
              onCheckInSuccess={() => {
                if (showToast) showToast("Điểm danh thành công!", "success");
              }}
            />
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
        </div>
      </main>

      {/* ZaUI Bottom Navigation Bar */}
      <nav
        className="shrink-0 z-40 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-100 dark:border-slate-800/90 px-2 pt-1.5 flex items-center justify-around shadow-[0_-6px_24px_-6px_rgba(15,23,42,0.08)] dark:shadow-2xl transition-colors duration-200"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
      >
        {[
          { key: "checkin", label: "Chấm công", Icon: Clock },
          { key: "history", label: "Lịch sử", Icon: Calendar },
          { key: "requests", label: "Đơn từ", Icon: FileText },
          { key: "profile", label: "Tài khoản", Icon: User }
        ].map(({ key, label, Icon }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`relative flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-[68px] py-1.5 px-3 rounded-2xl transition-all ${
                active
                  ? "text-[#0068FF] dark:text-blue-400 font-bold bg-blue-50/90 dark:bg-blue-500/15"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="w-5 h-1 rounded-full bg-[#0068FF] dark:bg-blue-400 mb-0.5"
                />
              )}
              <Icon className={`w-5 h-5 ${active ? "scale-105" : ""}`} />
              <span className="text-xs leading-tight">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Modal Mở Nhanh Dịch Vụ Từ Màn Hình Chính ZaUI */}
      {quickServiceMode && (
        <SmartLeaveRequestModal
          currentUser={currentUser}
          initialMode={quickServiceMode}
          showToast={showToast}
          onClose={() => setQuickServiceMode(null)}
          onRequestSubmitted={() => {
            setQuickServiceMode(null);
            if (showToast) showToast("Nộp đơn mới thành công!", "success");
          }}
        />
      )}

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
