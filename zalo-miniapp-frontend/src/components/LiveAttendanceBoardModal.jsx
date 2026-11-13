import React, { useState, useRef } from "react";
import {
  ArrowLeft,
  Users,
  Clock,
  Hammer,
  Palmtree,
  UserX,
  MapPin,
  Camera,
  RefreshCw,
  Search,
  UserCheck,
  Building2,
} from "lucide-react";
import useLockBodyScroll from "../hooks/useLockBodyScroll";
import { safePost, generateIdempotencyKey } from "../utils/api";
import { getShiftLabel } from "../utils/viLabels";

const TABS = [
  { key: "present", label: "Có mặt", icon: Users, color: "emerald" },
  { key: "late", label: "Đi muộn", icon: Clock, color: "amber" },
  { key: "field_work", label: "Công trình", icon: Hammer, color: "sky" },
  { key: "leave", label: "Nghỉ phép", icon: Palmtree, color: "indigo" },
  { key: "absent", label: "Chưa chấm", icon: UserX, color: "rose" },
];

export default function LiveAttendanceBoardModal({
  open = false,
  initialTab = "present",
  headcount,
  loading = false,
  currentUser = null,
  showToast = null,
  onRefresh,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState(initialTab || "present");
  const [search, setSearch] = useState("");
  const [proxyTarget, setProxyTarget] = useState(null);
  const [proxyInTime, setProxyInTime] = useState("07:30");
  const [proxyOutTime, setProxyOutTime] = useState("");
  const [proxyNote, setProxyNote] = useState("");
  const [proxySubmitting, setProxySubmitting] = useState(false);
  const [proxyError, setProxyError] = useState("");
  const proxyInFlightRef = useRef(false);

  useLockBodyScroll(open);

  React.useEffect(() => {
    if (open && initialTab) {
      setActiveTab(initialTab);
      setProxyTarget(null);
      setProxyError("");
    }
  }, [open, initialTab]);

  if (!open) return null;

  const canProxy = Boolean(
    currentUser && (currentUser.role === "admin" || currentUser.role === "accountant")
  );

  const board = headcount?.live_board || {};
  const lists = {
    present: board.present_list || [],
    late: board.late_list || [],
    field_work: board.field_work_list || [],
    leave: board.leave_list || [],
    absent: board.absent_list || [],
  };

  const counts = {
    present: headcount?.present ?? lists.present.length,
    late: headcount?.late ?? lists.late.length,
    field_work: headcount?.field_work ?? lists.field_work.length,
    leave: headcount?.leave ?? lists.leave.length,
    absent: headcount?.absent ?? lists.absent.length,
  };

  const q = search.trim().toLowerCase();
  const visibleItems = (lists[activeTab] || []).filter((item) => {
    if (!q) return true;
    return (
      String(item.ma_nv || "").toLowerCase().includes(q) ||
      String(item.ho_ten || "").toLowerCase().includes(q) ||
      String(item.department || "").toLowerCase().includes(q) ||
      String(item.location_name || "").toLowerCase().includes(q) ||
      String(item.field_note || "").toLowerCase().includes(q)
    );
  });

  const handleOpenProxy = (emp) => {
    setProxyTarget(emp);
    setProxyInTime(emp.check_in_time ? String(emp.check_in_time).slice(0, 5) : "07:30");
    setProxyOutTime(emp.check_out_time ? String(emp.check_out_time).slice(0, 5) : "");
    setProxyNote("");
    setProxyError("");
  };

  const handleSubmitProxy = async (e) => {
    e.preventDefault();
    if (!proxyTarget || proxyInFlightRef.current) return;
    if (!proxyInTime) {
      setProxyError("Vui lòng chọn giờ vào hợp lệ.");
      return;
    }
    proxyInFlightRef.current = true;
    setProxySubmitting(true);
    setProxyError("");
    try {
      const idempotencyKey = generateIdempotencyKey("proxy");
      const res = await safePost(
        "/attendance/proxy-check-in",
        {
          ma_nv: proxyTarget.ma_nv,
          date: board.date || undefined,
          check_in_time: proxyInTime,
          check_out_time: proxyOutTime || null,
          note: proxyNote.trim() || "Chấm công hộ từ bảng theo dõi trực tiếp",
        },
        { idempotencyKey }
      );
      if (!res?.success) {
        setProxyError(res?.message || "Không thể thực hiện chấm công hộ.");
        return;
      }
      if (showToast) showToast(res.message || `Đã chấm công hộ cho ${proxyTarget.ho_ten}!`, "success");
      setProxyTarget(null);
      if (onRefresh) await onRefresh();
    } catch (err) {
      setProxyError(err.message || "Lỗi kết nối khi chấm công hộ.");
    } finally {
      proxyInFlightRef.current = false;
      setProxySubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl bg-slate-900 text-slate-100 rounded-t-3xl sm:rounded-2xl border border-slate-700/80 shadow-2xl max-h-[88vh] flex flex-col overflow-hidden animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition active:scale-[0.98]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Trở về</span>
            </button>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white flex items-center gap-2 leading-snug">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="break-words">Ai đang làm việc hôm nay</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                Quân số: {headcount?.total_employees || 0} nhân sự • Ngày {board.date || "hôm nay"}
              </p>
            </div>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 shrink-0 transition active:scale-[0.98]"
              title="Cập nhật dữ liệu trực tiếp"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          )}
        </div>

        {/* Filter Tabs (Scrollable nicely on 360px+) */}
        <div className="px-4 pt-3 pb-2 border-b border-slate-800 space-y-2.5 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 border transition ${
                    isActive
                      ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                      : "bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold ${
                      isActive ? "bg-white/20 text-white" : "bg-slate-900 text-slate-300"
                    }`}
                  >
                    {counts[tab.key]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên, mã NV, vị trí công trình..."
              className="w-full bg-slate-950/70 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* List */}
        <div className="modal-scroll-area flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-2.5">
          {visibleItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Không có nhân sự nào trong nhóm này.
            </div>
          ) : (
            visibleItems.map((emp) => {
              const isEditingProxy = proxyTarget?.ma_nv === emp.ma_nv;
              return (
                <div
                  key={`${activeTab}-${emp.ma_nv}`}
                  className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white leading-snug break-words">
                        {emp.ho_ten}
                      </div>
                      <div className="text-xs text-slate-300 mt-0.5 flex flex-wrap items-center gap-1.5 leading-snug">
                        <span className="font-mono text-blue-300 font-semibold">{emp.ma_nv}</span>
                        {emp.chuc_danh && <span>• {emp.chuc_danh}</span>}
                        <span>• {getShiftLabel(emp.shift_type)}</span>
                      </div>
                      {emp.department && (
                        <div className="text-xs text-sky-300/90 mt-1 flex items-center gap-1 leading-snug">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="break-words">{emp.department}</span>
                        </div>
                      )}
                    </div>
                    {emp.late_minutes > 0 ? (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold whitespace-nowrap shrink-0">
                        Muộn {emp.late_minutes}p
                      </span>
                    ) : emp.check_in_time ? (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold whitespace-nowrap shrink-0">
                        Vào {String(emp.check_in_time).slice(0, 5)}
                        {emp.check_out_time ? ` • Ra ${String(emp.check_out_time).slice(0, 5)}` : ""}
                      </span>
                    ) : emp.status === "P" || emp.status === "KP" ? (
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-semibold whitespace-nowrap shrink-0">
                        {emp.status === "KP" ? "Nghỉ không lương" : "Nghỉ phép năm"}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold whitespace-nowrap shrink-0">
                        Chưa chấm công
                      </span>
                    )}
                  </div>

                  {(emp.location_name || emp.field_note || emp.has_photo) && (
                    <div className="pt-1.5 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                      <div className="flex items-start gap-1.5 min-w-0 flex-1">
                        <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                        <span className="leading-snug break-words">
                          {emp.field_note ? `${emp.location_name ? emp.location_name + " — " : ""}${emp.field_note}` : emp.location_name}
                        </span>
                      </div>
                      {emp.has_photo && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 font-medium whitespace-nowrap shrink-0">
                          <Camera className="w-3 h-3" />
                          Có ảnh chụp
                        </span>
                      )}
                    </div>
                  )}

                  {canProxy && (activeTab === "absent" || !emp.check_in_time) && emp.ma_nv !== currentUser?.ma_nv && (
                    <div className="pt-2 border-t border-slate-700/60">
                      {!isEditingProxy ? (
                        <button
                          type="button"
                          onClick={() => handleOpenProxy(emp)}
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-[0.99]"
                        >
                          <UserCheck className="w-4 h-4 shrink-0" />
                          <span>Chấm công hộ hôm nay</span>
                        </button>
                      ) : (
                        <form onSubmit={handleSubmitProxy} className="space-y-2.5 bg-slate-900/90 border border-blue-500/40 rounded-xl p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-blue-300">
                              Chấm công hộ: {emp.ho_ten}
                            </span>
                            <button
                              type="button"
                              onClick={() => setProxyTarget(null)}
                              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-slate-800"
                            >
                              Hủy
                            </button>
                          </div>
                          {proxyError && (
                            <div className="p-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs leading-snug">
                              {proxyError}
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-3 bg-slate-950/70 px-3 py-2 rounded-xl border border-slate-700">
                            <label className="text-xs font-semibold text-slate-200">Giờ vào</label>
                            <input
                              type="time"
                              value={proxyInTime}
                              onChange={(e) => setProxyInTime(e.target.value)}
                              className="w-32 sm:w-36 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white font-semibold"
                              required
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3 bg-slate-950/70 px-3 py-2 rounded-xl border border-slate-700">
                            <label className="text-xs font-semibold text-slate-200">Giờ ra (nếu có)</label>
                            <input
                              type="time"
                              value={proxyOutTime}
                              onChange={(e) => setProxyOutTime(e.target.value)}
                              className="w-32 sm:w-36 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white font-semibold"
                            />
                          </div>
                          <input
                            type="text"
                            value={proxyNote}
                            onChange={(e) => setProxyNote(e.target.value)}
                            placeholder="Ghi chú lý do chấm hộ (ví dụ: hỏng máy / hết pin)..."
                            className="w-full min-h-[42px] bg-slate-950/70 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
                          />
                          <button
                            type="submit"
                            disabled={proxySubmitting}
                            className="w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50 transition active:scale-[0.98]"
                          >
                            {proxySubmitting ? "Đang lưu chấm công hộ..." : "Xác nhận Chấm công hộ"}
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-3 border-t border-slate-800 bg-slate-900 shrink-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[46px] rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition active:scale-[0.98]"
          >
            Đóng / Quay lại
          </button>
        </div>
      </div>
    </div>
  );
}

