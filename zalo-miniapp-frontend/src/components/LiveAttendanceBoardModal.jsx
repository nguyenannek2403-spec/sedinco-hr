import React, { useState, useRef } from "react";
import {
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
import { safePost, generateIdempotencyKey } from "../utils/api";
import { getShiftLabel } from "../utils/viLabels";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { AppButton, AppModal, FormRow, EmptyState } from "./ui";

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
  const [proxyLocationType, setProxyLocationType] = useState("OFFICE");
  const [proxyNote, setProxyNote] = useState("");
  const [proxySubmitting, setProxySubmitting] = useState(false);
  const [proxyError, setProxyError] = useState("");
  const proxyInFlightRef = useRef(false);

  React.useEffect(() => {
    if (open && initialTab) {
      setActiveTab(initialTab);
      setProxyTarget(null);
      setProxyError("");
    }
  }, [open, initialTab]);

  React.useEffect(() => {
    if (!open) return undefined;
    zmpAdapter.keepScreenOn(true).catch(() => {});
    return () => {
      zmpAdapter.keepScreenOn(false).catch(() => {});
    };
  }, [open]);

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
    const target = emp || (lists.absent[0] || visibleItems[0] || { ma_nv: "", ho_ten: "Nhân viên" });
    setProxyTarget(target);
    setProxyInTime(target.check_in_time ? String(target.check_in_time).slice(0, 5) : "07:30");
    setProxyOutTime(target.check_out_time ? String(target.check_out_time).slice(0, 5) : "");
    setProxyLocationType("OFFICE");
    setProxyNote("");
    setProxyError("");
  };

  const handleSubmitProxy = async (e) => {
    e.preventDefault();
    if (!proxyTarget || !proxyTarget.ma_nv || proxyInFlightRef.current) {
      if (!proxyTarget?.ma_nv) setProxyError("Vui lòng chọn nhân viên cần chấm công hộ.");
      return;
    }
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
          record_date: board.date || undefined,
          date: board.date || undefined,
          check_in_time: proxyInTime,
          check_out_time: proxyOutTime || null,
          work_location_type: proxyLocationType,
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

  const allEmployeesForProxy = [
    ...lists.absent,
    ...lists.present,
    ...lists.late,
    ...lists.field_work,
    ...lists.leave,
  ].filter(
    (emp, idx, arr) =>
      emp?.ma_nv &&
      emp.ma_nv !== currentUser?.ma_nv &&
      arr.findIndex((x) => x.ma_nv === emp.ma_nv) === idx
  );

  return (
    <>
      <AppModal
        open={open}
        onClose={onClose}
        maxWidthClass="sm:max-w-2xl"
        maxHeightClass="max-h-[88vh]"
        showCloseX={false}
        title={
          <span className="inline-flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span>Ai đang làm việc hôm nay</span>
          </span>
        }
        subtitle={`Quân số: ${headcount?.total_employees || 0} nhân sự • Ngày ${board.date || "hôm nay"}`}
        headerExtra={
          <div className="flex items-center gap-1.5">
            {canProxy && allEmployeesForProxy.length > 0 && (
              <AppButton
                variant="primary"
                icon={UserCheck}
                onClick={() => handleOpenProxy(lists.absent[0] || allEmployeesForProxy[0])}
                className="px-3 py-2 text-xs"
              >
                <span className="hidden sm:inline">Chấm công hộ</span>
              </AppButton>
            )}
            {onRefresh && (
              <AppButton
                variant="ghost"
                icon={RefreshCw}
                loading={loading}
                onClick={onRefresh}
                aria-label="Làm mới bảng quân số"
                className="min-w-[44px] px-3 py-2 text-xs"
                title="Cập nhật dữ liệu trực tiếp"
              >
                <span className="hidden sm:inline">Làm mới</span>
              </AppButton>
            )}
          </div>
        }
      >
      {/* Filter Tabs (Scrollable nicely on 360px+) */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800 space-y-2.5 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 border transition ${
                  isActive
                    ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                    : "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-xs font-bold ${
                    isActive ? "bg-white/20 text-white" : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
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
            className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-950/70 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="p-4 space-y-2.5">
        {visibleItems.length === 0 ? (
          <EmptyState icon={Users} title="Không có nhân sự nào trong nhóm này." />
        ) : (
          visibleItems.map((emp) => {
            const isEditingProxy = proxyTarget?.ma_nv === emp.ma_nv;
            return (
              <div
                key={`${activeTab}-${emp.ma_nv}`}
                className="perf-list-item bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-3.5 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-white leading-snug break-words">
                      {emp.ho_ten}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 flex flex-wrap items-center gap-1.5 leading-snug">
                      <span className="font-mono text-blue-700 dark:text-blue-300 font-semibold">{emp.ma_nv}</span>
                      {emp.chuc_danh && <span>• {emp.chuc_danh}</span>}
                      <span>• {getShiftLabel(emp.shift_type)}</span>
                    </div>
                    {emp.department && (
                      <div className="text-xs text-sky-700 dark:text-sky-300/90 mt-1 flex items-center gap-1 leading-snug">
                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="break-words">{emp.department}</span>
                      </div>
                    )}
                  </div>
                  {emp.late_minutes > 0 ? (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 text-xs font-semibold whitespace-nowrap shrink-0">
                      Muộn {emp.late_minutes}p
                    </span>
                  ) : emp.check_in_time ? (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold whitespace-nowrap shrink-0">
                      Vào {String(emp.check_in_time).slice(0, 5)}
                      {emp.check_out_time ? ` • Ra ${String(emp.check_out_time).slice(0, 5)}` : ""}
                    </span>
                  ) : emp.status === "P" || emp.status === "KP" ? (
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 border border-indigo-300 dark:border-indigo-500/40 text-indigo-800 dark:text-indigo-300 text-xs font-semibold whitespace-nowrap shrink-0">
                      {emp.status === "KP" ? "Nghỉ không lương" : "Nghỉ phép năm"}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-300 text-xs font-semibold whitespace-nowrap shrink-0">
                      Chưa chấm công
                    </span>
                  )}
                </div>

                {(emp.location_name || emp.field_note || emp.has_photo) && (
                  <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-start gap-1.5 min-w-0 flex-1">
                      <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                      <span className="leading-snug break-words">
                        {emp.field_note ? `${emp.location_name ? emp.location_name + " — " : ""}${emp.field_note}` : emp.location_name}
                      </span>
                    </div>
                    {emp.has_photo && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 font-medium whitespace-nowrap shrink-0">
                        <Camera className="w-3 h-3" />
                        Có ảnh chụp
                      </span>
                    )}
                  </div>
                )}

                {canProxy && (activeTab === "absent" || !emp.check_in_time) && emp.ma_nv !== currentUser?.ma_nv && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60">
                    <AppButton
                      variant="ghost"
                      fullWidth
                      icon={UserCheck}
                      onClick={() => handleOpenProxy(emp)}
                      className="bg-blue-50 hover:bg-blue-100 dark:bg-blue-600/20 dark:hover:bg-blue-600/30 border border-blue-200 dark:border-blue-500/40 text-blue-700 dark:text-blue-200 text-xs"
                    >
                      Chấm công hộ hôm nay
                    </AppButton>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      </AppModal>

      {/* Modal con lồng bên trên để Chấm công hộ (Tự động tăng z-index 110 & khóa modal cha) */}
      <AppModal
        open={Boolean(open && proxyTarget)}
        onClose={() => !proxySubmitting && setProxyTarget(null)}
        disableClose={proxySubmitting}
        maxWidthClass="max-w-md"
        title={proxyTarget?.ho_ten ? `Chấm công hộ: ${proxyTarget.ho_ten}` : "Chấm công hộ nhân viên"}
        subtitle={`Ngày ${board.date || "hôm nay"}`}
        icon={<UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />}
        footer={
          <div className="flex gap-2.5">
            <AppButton
              variant="secondary"
              disabled={proxySubmitting}
              onClick={() => setProxyTarget(null)}
              className="flex-1"
            >
              Đóng / Quay lại
            </AppButton>
            <AppButton
              type="submit"
              form="live-board-proxy-form"
              variant="primary"
              loading={proxySubmitting}
              loadingText="Đang lưu..."
              disabled={proxySubmitting || !proxyTarget?.ma_nv}
              className="flex-1"
            >
              Xác nhận Chấm công hộ
            </AppButton>
          </div>
        }
      >
        {proxyTarget && (
          <form id="live-board-proxy-form" onSubmit={handleSubmitProxy} className="p-4 space-y-3.5 text-slate-800 dark:text-slate-100">
            {proxyError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-200 text-xs leading-snug">
                {proxyError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nhân viên chấm hộ</label>
              <select
                value={proxyTarget.ma_nv || ""}
                onChange={(e) => {
                  const found = allEmployeesForProxy.find((x) => x.ma_nv === e.target.value);
                  if (found) handleOpenProxy(found);
                }}
                className="w-full min-h-[46px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white font-semibold"
              >
                {allEmployeesForProxy.map((item) => (
                  <option key={item.ma_nv} value={item.ma_nv}>
                    {item.ho_ten} ({item.ma_nv})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800/70 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setProxyLocationType("OFFICE")}
                className={`min-h-[44px] px-2.5 py-2 rounded-lg text-xs font-bold transition ${
                  proxyLocationType === "OFFICE"
                    ? "bg-blue-600 text-white"
                    : "text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                }`}
              >
                🏢 Tại văn phòng
              </button>
              <button
                type="button"
                onClick={() => setProxyLocationType("FIELD_WORK")}
                className={`min-h-[44px] px-2.5 py-2 rounded-lg text-xs font-bold transition ${
                  proxyLocationType === "FIELD_WORK"
                    ? "bg-amber-600 text-white"
                    : "text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                }`}
              >
                🚧 Đi công trình
              </button>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-700 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <FormRow label="Giờ vào">
                <input
                  type="time"
                  value={proxyInTime}
                  onChange={(e) => setProxyInTime(e.target.value)}
                  className="w-32 sm:w-36 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-900 dark:text-white font-semibold"
                  required
                />
              </FormRow>
              <FormRow label="Giờ ra (nếu có)">
                <input
                  type="time"
                  value={proxyOutTime}
                  onChange={(e) => setProxyOutTime(e.target.value)}
                  className="w-32 sm:w-36 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-900 dark:text-white font-semibold"
                />
              </FormRow>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Ghi chú chấm hộ</label>
              <input
                type="text"
                value={proxyNote}
                onChange={(e) => setProxyNote(e.target.value)}
                placeholder="Ví dụ: Quên điện thoại / hỏng máy..."
                className="w-full min-h-[46px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
              />
            </div>
          </form>
        )}
      </AppModal>
    </>
  );
}

