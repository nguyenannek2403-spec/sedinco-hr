import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  AlertCircle,
  Clock,
  Trash2,
  Wallet,
  CalendarCheck,
  Calendar,
  TrendingUp
} from "lucide-react";
import { safeGet, safePut } from "../../utils/api";
import SmartLeaveRequestModal from "../../components/SmartLeaveRequestModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { AppButton, StatusBadge, SkeletonList, EmptyState } from "../../components/ui";
import {
  getRequestTypeLabel,
  getCorrectionModeLabel
} from "../../utils/viLabels";
import { formatViCurrency } from "../../utils/viNumberFormat";

const REQUEST_HUB_CARDS = [
  {
    key: "leave",
    mode: "P",
    title: "Nghỉ phép / Việc riêng",
    desc: "Phép năm, không lương, ốm",
    icon: Calendar,
    iconClass: "bg-emerald-50 dark:bg-emerald-500/20 text-[#16A34A] dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-500/30"
  },
  {
    key: "comp",
    mode: "Bổ sung công / Quên chấm giờ ra",
    title: "Giải trình Bổ sung công",
    desc: "Quên giờ vào/ra, đổi ca",
    icon: Clock,
    iconClass: "bg-blue-50 dark:bg-blue-500/20 text-[#0051CA] dark:text-blue-300 border border-blue-200/80 dark:border-blue-500/30"
  },
  {
    key: "ot",
    mode: "OT",
    title: "Đăng ký Tăng ca",
    desc: "Làm thêm giờ, ngoài ca",
    icon: TrendingUp,
    iconClass: "bg-rose-50 dark:bg-rose-500/20 text-[#E11D48] dark:text-rose-300 border border-rose-200/80 dark:border-rose-500/30"
  },
  {
    key: "advance",
    mode: "SALARY_ADVANCE",
    title: "Xin Ứng lương",
    desc: "Tạm ứng trước kỳ lương",
    icon: Wallet,
    iconClass: "bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-500/30"
  }
];

/**
 * WorkerRequestsTab — Google Stitch "Sedinco Pulse" Screen 4 (Đơn từ & Đề xuất)
 * - Section Header: "CỔNG DỊCH VỤ NHÂN SỰ" + "Trung tâm Đơn từ"
 * - White Annual Leave Quota Ticket Card with #F0F3FF progress gauge + perforated divider + 3-col breakdown
 * - 2x2 Squircle Service Launcher Grid ("Tạo đề xuất nhanh")
 * - Horizontal Filter Pills with counts
 * - Perforated Request Ticket Cards with #F0F3FF 2-col metric box & "Hủy đơn" footer
 */
export default function WorkerRequestsTab({
  currentUser,
  showToast,
  prefillFixDate = "",
  prefillCheckInTime = "",
  onClearPrefill = null
}) {
  const [requests, setRequests] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialType, setModalInitialType] = useState("P");
  const [confirmCancel, setConfirmCancel] = useState({ open: false, id: null });
  const [cancelling, setCancelling] = useState(false);
  const cancelInFlightRef = useRef(false);

  const fetchMyRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reqRes, balRes] = await Promise.all([
        safeGet("/requests/me"),
        safeGet("/requests/leave-balance").catch(() => null)
      ]);
      if (reqRes?.success && Array.isArray(reqRes.data)) {
        setRequests(reqRes.data);
      } else {
        setRequests([]);
      }
      if (balRes?.success && balRes.data) {
        setLeaveBalance(balRes.data);
      }
    } catch (err) {
      setError(err.message || "Không thể tải danh sách đơn từ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyRequests();
  }, [fetchMyRequests]);

  useEffect(() => {
    if (prefillFixDate) {
      setModalInitialType("Bổ sung công / Quên chấm giờ ra");
      setIsModalOpen(true);
    }
  }, [prefillFixDate]);

  const handleCancelRequest = (id) => {
    setConfirmCancel({ open: true, id });
  };

  const executeCancelRequest = async () => {
    if (cancelInFlightRef.current || !confirmCancel.id) return;
    cancelInFlightRef.current = true;
    setCancelling(true);
    try {
      const res = await safePut(`/requests/${confirmCancel.id}/cancel`, {});
      if (res?.success) {
        if (showToast) showToast("Đã hủy đơn thành công!", "success");
        setConfirmCancel({ open: false, id: null });
        fetchMyRequests();
      } else {
        if (showToast) showToast(res?.message || "Không thể hủy đơn này!", "error");
      }
    } catch (err) {
      if (showToast) showToast(err.message || "Lỗi kết nối hủy đơn.", "error");
    } finally {
      cancelInFlightRef.current = false;
      setCancelling(false);
    }
  };

  const filtered = requests.filter((req) => {
    if (filterStatus === "all") return true;
    return String(req.status).toUpperCase() === filterStatus.toUpperCase();
  });

  const quota = Number(leaveBalance?.quota || 12);
  const used = Number(leaveBalance?.used || 0);
  const pending = Number(leaveBalance?.pending || 0);
  const remaining = Number(leaveBalance?.remaining ?? Math.max(0, quota - used));
  const remainPct = quota > 0 ? Math.min(100, Math.round((remaining / quota) * 100)) : 0;

  return (
    <div className="space-y-4 pb-8">
      {/* STITCH SCREEN 4 — SECTION 1: HEADER & WHITE ANNUAL LEAVE QUOTA TICKET CARD */}
      <div className="space-y-2.5">
        <div>
          <span className="text-xs font-extrabold uppercase tracking-wider text-[#B80035] dark:text-rose-400">
            CỔNG DỊCH VỤ NHÂN SỰ
          </span>
          <h2 className="text-lg font-extrabold text-[#111C2D] dark:text-white tracking-tight">
            Trung tâm Đơn từ &amp; Đề xuất
          </h2>
        </div>

        {leaveBalance && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-700 text-[#16A34A] dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-[#111C2D] dark:text-white leading-snug">
                    Quỹ phép năm {leaveBalance.year}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Nghỉ phép hưởng lương
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-700 text-xs font-bold text-[#16A34A] dark:text-emerald-300 shrink-0 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] shrink-0" />
                <span className="whitespace-nowrap">Khả dụng</span>
              </span>
            </div>

            {/* Inner #F0F3FF Progress Gauge Box */}
            <div className="bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 rounded-xl p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-black text-[#16A34A] dark:text-emerald-300 font-mono">
                    Còn {remaining} / {quota}
                  </span>
                  <span className="text-xs font-bold text-[#111C2D] dark:text-slate-200">
                    ngày còn lại
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Đã dùng: <strong>{used} / {quota}</strong> ngày
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-white dark:bg-slate-900 overflow-hidden border border-slate-200/80 dark:border-slate-700">
                <div
                  className="h-full rounded-full bg-[#16A34A] transition-all duration-300"
                  style={{ width: `${remainPct}%` }}
                />
              </div>
            </div>

            {/* Perforated Ticket Cutout Divider */}
            <div className="sedinco-ticket-cutout">
              <div className="w-full border-t-2 border-dashed border-slate-200 dark:border-slate-700" />
            </div>

            {/* 3-Column Quota Breakdown */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="block text-slate-500 dark:text-slate-400">Tổng tiêu chuẩn</span>
                <strong className="text-[#111C2D] dark:text-white font-mono">{quota} ngày</strong>
              </div>
              <div className="border-x border-slate-200 dark:border-slate-800">
                <span className="block text-slate-500 dark:text-slate-400">Đã nghỉ</span>
                <strong className="text-[#E11D48] dark:text-rose-400 font-mono">{used} ngày</strong>
              </div>
              <div>
                <span className="block text-slate-500 dark:text-slate-400">Chờ duyệt</span>
                <strong className="text-amber-700 dark:text-amber-300 font-mono">{pending} ngày</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STITCH SCREEN 4 — SECTION 2: 2x2 SQUIRCLE SERVICE LAUNCHER GRID */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-extrabold text-[#111C2D] dark:text-white">
            Tạo đề xuất nhanh
          </h3>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Chạm để mở biểu mẫu
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {REQUEST_HUB_CARDS.map((card) => {
            const CardIcon = card.icon;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => {
                  setModalInitialType(card.mode);
                  setIsModalOpen(true);
                }}
                className="min-h-[96px] p-3.5 rounded-2xl bg-white hover:bg-[#F0F3FF]/60 dark:bg-slate-900 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800 text-left flex flex-col items-start justify-between gap-2 transition active:scale-[0.98] cursor-pointer shadow-xs"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.iconClass}`}>
                  <CardIcon className="w-5 h-5" />
                </div>
                <div className="w-full min-w-0">
                  <div className="text-sm font-extrabold text-[#111C2D] dark:text-white leading-snug break-words">
                    {card.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug break-words">
                    {card.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* STITCH SCREEN 4 — SECTION 3: HORIZONTAL FILTER PILLS */}
      <div
        data-filter-group="worker-requests-filter"
        className="flex flex-wrap bg-[#F0F3FF] border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800 p-1 rounded-2xl text-xs gap-1"
      >
        {["all", "PENDING", "APPROVED", "REJECTED"].map((st) => {
          const active = filterStatus === st;
          return (
            <button
              key={st}
              type="button"
              data-active={active ? "true" : "false"}
              onClick={() => setFilterStatus(st)}
              className={`flex-1 min-h-[44px] px-2.5 py-2 font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                active
                  ? "bg-[#E11D48] text-white shadow-sm dark:bg-rose-600 dark:text-white"
                  : "bg-transparent text-slate-600 hover:text-[#111C2D] dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {st === "all" ? "Tất cả" : st === "PENDING" ? "Chờ duyệt" : st === "APPROVED" ? "Đã duyệt" : "Từ chối"}
            </button>
          );
        })}
      </div>

      {/* STITCH SCREEN 4 — SECTION 4: PERFORATED REQUEST TICKET CARDS */}
      <div className="space-y-3">
        {loading ? (
          <SkeletonList rows={3} label="Đang tải danh sách đơn từ..." />
        ) : error ? (
          <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-2xl text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Chưa có đơn từ nào trong danh mục này."
            description="Chọn một trong bốn thẻ phía trên để gửi đơn mới."
          />
        ) : (
          filtered.map((req) => {
            const isPending = String(req.status).toUpperCase() === "PENDING";

            return (
              <div
                key={req.id}
                className="perf-list-item bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-2.5 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-extrabold text-[#111C2D] dark:text-white block leading-snug break-words">
                      {getRequestTypeLabel(req.request_type)}
                    </span>
                    <span className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400">
                      Mã phiếu: #{req.id}
                    </span>
                  </div>
                  <StatusBadge type="request" status={req.status} />
                </div>

                {/* Middle #F0F3FF 2-Column Metric Box */}
                <div className="bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="block text-slate-500 dark:text-slate-400 font-semibold">
                      Ngày áp dụng
                    </span>
                    <strong className="text-[#111C2D] dark:text-white font-mono">
                      {String(req.request_date || req.start_date || "").slice(0, 10)}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-slate-500 dark:text-slate-400 font-semibold">
                      {Number(req.advance_amount) > 0
                        ? "Số tiền xin ứng"
                        : req.check_in_time || req.check_out_time
                        ? "Giờ đề xuất"
                        : "Chi tiết"}
                    </span>
                    {Number(req.advance_amount) > 0 ? (
                      <strong className="text-[#16A34A] dark:text-emerald-300 font-mono">
                        {formatViCurrency(req.advance_amount)}
                      </strong>
                    ) : req.check_in_time || req.check_out_time ? (
                      <strong className="text-[#111C2D] dark:text-white font-mono">
                        {req.check_in_time ? `Vào ${String(req.check_in_time).slice(0, 5)}` : ""}
                        {req.check_in_time && req.check_out_time ? " • " : ""}
                        {req.check_out_time ? `Ra ${String(req.check_out_time).slice(0, 5)}` : ""}
                      </strong>
                    ) : (
                      <strong className="text-[#111C2D] dark:text-white">
                        {getCorrectionModeLabel(req.correction_mode) || "Theo quy định"}
                      </strong>
                    )}
                  </div>
                </div>

                {req.reason && (
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed break-words">
                    <span className="font-bold text-slate-500 dark:text-slate-400">Lý do: </span>
                    {req.reason}
                  </p>
                )}

                {req.evidence_image && (
                  <div>
                    <img
                      src={req.evidence_image}
                      alt="Ảnh chứng minh đơn từ"
                      className="max-h-36 rounded-xl border border-slate-200 dark:border-slate-700 object-cover"
                    />
                  </div>
                )}

                {/* Perforated Ticket Cutout Divider */}
                <div className="sedinco-ticket-cutout">
                  <div className="w-full border-t-2 border-dashed border-slate-200 dark:border-slate-700" />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold">
                    {isPending ? "Đang chờ Quản lý phê duyệt" : "Đã hoàn tất xét duyệt"}
                  </span>
                  {isPending && (
                    <AppButton
                      variant="ghost"
                      icon={Trash2}
                      onClick={() => handleCancelRequest(req.id)}
                      className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 px-3 py-1.5 text-xs rounded-full"
                    >
                      Hủy đơn
                    </AppButton>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal nộp đơn */}
      {isModalOpen && (
        <SmartLeaveRequestModal
          currentUser={currentUser}
          existingRequests={requests}
          leaveBalance={leaveBalance}
          initialMode={modalInitialType}
          initialDate={prefillFixDate || undefined}
          initialCheckInTime={prefillCheckInTime || undefined}
          showToast={showToast}
          onClose={() => {
            setIsModalOpen(false);
            if (typeof onClearPrefill === "function") onClearPrefill();
          }}
          onRequestSubmitted={() => {
            setIsModalOpen(false);
            if (typeof onClearPrefill === "function") onClearPrefill();
            fetchMyRequests();
            if (showToast) showToast("Nộp đơn mới thành công!", "success");
          }}
        />
      )}

      <ConfirmDialog
        open={confirmCancel.open}
        title="Xác nhận hủy đơn"
        message={`Bạn có chắc chắn muốn hủy đơn #${confirmCancel.id || ""} không?`}
        confirmLabel="Xác nhận hủy"
        variant="danger"
        loading={cancelling}
        onCancel={() => {
          if (!cancelling) setConfirmCancel({ open: false, id: null });
        }}
        onConfirm={executeCancelRequest}
      />
    </div>
  );
}
