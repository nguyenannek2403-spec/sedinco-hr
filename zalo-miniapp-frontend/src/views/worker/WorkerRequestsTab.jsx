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

const REQUEST_HUB_CARDS = [
  {
    key: "leave",
    mode: "P",
    title: "Nghỉ phép / Việc riêng",
    desc: "Phép năm, không lương, ốm",
    icon: Calendar,
    cardClass: "bg-blue-50 hover:bg-blue-100 dark:bg-blue-600/20 dark:hover:bg-blue-600/30 border-blue-200 dark:border-blue-500/40 text-blue-900 dark:text-blue-100",
    iconClass: "bg-blue-100 dark:bg-blue-500/30 text-blue-700 dark:text-blue-300"
  },
  {
    key: "comp",
    mode: "Bổ sung công / Quên chấm giờ ra",
    title: "Giải trình Bổ sung công",
    desc: "Quên giờ vào/ra, đổi ca",
    icon: Clock,
    cardClass: "bg-amber-50 hover:bg-amber-100 dark:bg-amber-600/20 dark:hover:bg-amber-600/30 border-amber-200 dark:border-amber-500/40 text-amber-900 dark:text-amber-100",
    iconClass: "bg-amber-100 dark:bg-amber-500/30 text-amber-700 dark:text-amber-300"
  },
  {
    key: "ot",
    mode: "OT",
    title: "Đăng ký Tăng ca",
    desc: "Làm thêm giờ, ngoài ca",
    icon: TrendingUp,
    cardClass: "bg-violet-50 hover:bg-violet-100 dark:bg-violet-600/20 dark:hover:bg-violet-600/30 border-violet-200 dark:border-violet-500/40 text-violet-900 dark:text-violet-100",
    iconClass: "bg-violet-100 dark:bg-violet-500/30 text-violet-700 dark:text-violet-300"
  },
  {
    key: "advance",
    mode: "SALARY_ADVANCE",
    title: "Xin Ứng lương",
    desc: "Tạm ứng trước kỳ lương",
    icon: Wallet,
    cardClass: "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-600/20 dark:hover:bg-emerald-600/30 border-emerald-200 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-100",
    iconClass: "bg-emerald-100 dark:bg-emerald-500/30 text-emerald-700 dark:text-emerald-300"
  }
];

export default function WorkerRequestsTab({ currentUser, showToast }) {
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

  const filtered = requests.filter(req => {
    if (filterStatus === "all") return true;
    return String(req.status).toUpperCase() === filterStatus.toUpperCase();
  });

  return (
    <div className="p-3.5 pb-8 space-y-4">
      {/* F1: Thẻ Quỹ Phép Năm — ZaUI Membership Card Style */}
      {leaveBalance && (
        <div className="bg-[#0055D4] bg-gradient-to-br from-[#0055D4] via-[#0068FF] to-[#0284C7] dark:bg-slate-900 dark:from-blue-950 dark:via-slate-900 dark:to-teal-950 border border-blue-500/30 dark:border-slate-700 rounded-2xl p-4 shadow-md text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-blue-900/45 dark:bg-slate-800/90 border border-white/25 text-white flex items-center justify-center shrink-0">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-white">
                Quỹ phép năm {leaveBalance.year}
              </div>
              <div className="text-xs text-blue-100 mt-0.5 leading-relaxed">
                Đã dùng {leaveBalance.used} • Chờ duyệt {leaveBalance.pending} ngày
              </div>
            </div>
          </div>
          <div className="text-right shrink-0 bg-blue-900/45 dark:bg-slate-800/90 border border-white/25 px-3 py-1.5 rounded-xl">
            <div className="text-base font-extrabold text-white whitespace-nowrap">
              Còn {leaveBalance.remaining} / {leaveBalance.quota}
            </div>
            <div className="text-xs text-blue-100">ngày phép</div>
          </div>
        </div>
      )}

      {/* Request Hub 4 Thẻ Dịch Vụ ZaUI */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100/90 dark:border-slate-800 rounded-2xl p-4 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] space-y-3">
        <div>
          <h2 className="text-base font-extrabold leading-snug text-slate-900 dark:text-white">Trung tâm Đơn từ &amp; Giải trình</h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">
            Chọn dịch vụ nhân sự bạn muốn gửi cho quản lý xét duyệt
          </p>
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
                className={`min-h-[88px] p-3 rounded-2xl border text-left flex flex-col items-start gap-2 transition active:scale-[0.98] cursor-pointer shadow-xs ${card.cardClass}`}
              >
                <div className={`zaui-service-icon w-10 h-10 rounded-xl shrink-0 ${card.iconClass}`}>
                  <CardIcon className="w-4 h-4" />
                </div>
                <div className="w-full min-w-0">
                  <div className="text-sm font-bold leading-snug break-words">{card.title}</div>
                  <div className="text-xs opacity-90 mt-0.5 leading-snug break-words">{card.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ZaUI Segmented Filter Tabs */}
      <div
        data-filter-group="worker-requests-filter"
        className="flex flex-wrap bg-slate-100 border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800 p-1 rounded-2xl text-xs gap-1"
      >
        {["all", "PENDING", "APPROVED", "REJECTED"].map((st) => {
          const active = filterStatus === st;
          return (
            <button
              key={st}
              type="button"
              data-active={active ? "true" : "false"}
              onClick={() => setFilterStatus(st)}
              className={`flex-1 min-h-[44px] px-2.5 py-2 font-semibold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                active
                  ? "bg-[#0068FF] text-white shadow-sm dark:bg-blue-600 dark:text-white"
                  : "bg-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {st === "all" ? "Tất cả" : st === "PENDING" ? "Chờ duyệt" : st === "APPROVED" ? "Đã duyệt" : "Từ chối"}
            </button>
          );
        })}
      </div>

      {/* Requests List — ZaUI Ticket Cards */}
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
                className="perf-list-item bg-white dark:bg-slate-900 border border-slate-100/90 dark:border-slate-800 rounded-2xl p-4 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.06)] space-y-2.5 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-slate-900 dark:text-white block leading-snug break-words">
                      {getRequestTypeLabel(req.request_type)}
                    </span>
                    {req.correction_mode && getCorrectionModeLabel(req.correction_mode) && (
                      <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/20 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-semibold">
                        {getCorrectionModeLabel(req.correction_mode)}
                      </span>
                    )}
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block mt-1">
                      Ngày áp dụng:{" "}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {String(req.request_date || req.start_date || "").slice(0, 10)}
                      </strong>
                    </span>
                    {(req.check_in_time || req.check_out_time) && (
                      <div className="text-xs text-amber-700 dark:text-amber-300 font-medium mt-1">
                        Giờ đề xuất:{" "}
                        {req.check_in_time ? `Vào ${String(req.check_in_time).slice(0, 5)}` : ""}
                        {req.check_in_time && req.check_out_time ? " • " : ""}
                        {req.check_out_time ? `Ra ${String(req.check_out_time).slice(0, 5)}` : ""}
                      </div>
                    )}
                    {Number(req.advance_amount) > 0 && (
                      <div className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold whitespace-nowrap">
                        <Wallet className="w-3.5 h-3.5 shrink-0" />
                        <span>Số tiền ứng: {Math.round(Number(req.advance_amount) || 0).toLocaleString("vi-VN")} đ</span>
                      </div>
                    )}
                  </div>

                  <StatusBadge type="request" status={req.status} />
                </div>

                {req.reason && (
                  <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 leading-relaxed break-words">
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

                <div className="zaui-ticket-divider !my-2" />

                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-semibold">Mã phiếu: #{req.id}</span>
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
          showToast={showToast}
          onClose={() => setIsModalOpen(false)}
          onRequestSubmitted={() => {
            setIsModalOpen(false);
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
