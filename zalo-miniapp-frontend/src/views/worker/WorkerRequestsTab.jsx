import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  AlertCircle,
  Trash2,
  Plus
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
    const curNow = new Date();
    const curMonth = curNow.getMonth() + 1;
    const curYear = curNow.getFullYear();
    try {
      const [reqRes, balRes] = await Promise.all([
        safeGet("/requests/me"),
        safeGet("/requests/leave-balance", { month: curMonth, year: curYear }).catch(() => null)
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

  const curNow = new Date();
  const displayMonth = Number(leaveBalance?.month || (curNow.getMonth() + 1));
  const displayYear = Number(leaveBalance?.year || curNow.getFullYear());
  const quota = Number(leaveBalance?.quota ?? 1);
  const used = Number(
    leaveBalance?.committed ?? (Number(leaveBalance?.used || 0) + Number(leaveBalance?.pending || 0))
  );
  const remaining = Number(leaveBalance?.remaining ?? Math.max(0, quota - used));

  return (
    <div className="space-y-3.5 pb-8">
      {/* Header + 1 nút Tạo đơn duy nhất */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-[#111C2D] dark:text-white tracking-tight">
          Đơn từ
        </h2>
        <AppButton
          data-testid="create-request-btn"
          variant="primary"
          icon={Plus}
          onClick={() => {
            setModalInitialType("P");
            setIsModalOpen(true);
          }}
          className="shrink-0 whitespace-nowrap rounded-xl"
        >
          Tạo đơn
        </AppButton>
      </div>

      {/* Thẻ ngang siêu gọn: Quỹ phép Tháng M/YYYY */}
      {leaveBalance && (
        <div
          data-testid="leave-balance-compact"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <span className="font-extrabold text-[#111C2D] dark:text-white shrink-0">
            Quỹ phép Tháng {displayMonth}/{displayYear}
          </span>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-slate-600 dark:text-slate-300">
            <span>
              Phép tháng: <strong className="font-mono text-[#111C2D] dark:text-white">{quota}</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span>
              Đã dùng: <strong className="font-mono text-[#E11D48] dark:text-rose-400">{used}</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span>
              Còn lại: <strong className="font-mono text-[#16A34A] dark:text-emerald-400">{remaining}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Filter trạng thái */}
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
              className={`flex-1 min-h-[40px] px-2.5 py-1.5 font-bold rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? "bg-[#E11D48] text-white dark:bg-rose-600 dark:text-white"
                  : "bg-transparent text-slate-600 hover:text-[#111C2D] dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {st === "all" ? "Tất cả" : st === "PENDING" ? "Chờ duyệt" : st === "APPROVED" ? "Đã duyệt" : "Từ chối"}
            </button>
          );
        })}
      </div>

      {/* Danh sách đơn từ thiết kế phẳng gọn nhẹ */}
      <div className="space-y-2.5">
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
            description="Bấm nút + Tạo đơn ở góc trên để gửi đơn mới."
          />
        ) : (
          filtered.map((req) => {
            const isPending = String(req.status).toUpperCase() === "PENDING";

            return (
              <div
                key={req.id}
                className="perf-list-item bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold text-[#111C2D] dark:text-white leading-snug break-words min-w-0">
                    {getRequestTypeLabel(req.request_type)}
                  </span>
                  <StatusBadge type="request" status={req.status} />
                </div>

                <div className="bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 rounded-xl px-3 py-2 grid grid-cols-2 gap-2 text-xs">
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
                        ? "Số tiền"
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
                  <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed break-words">
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

                {isPending && (
                  <div className="pt-1 flex justify-end">
                    <AppButton
                      variant="ghost"
                      icon={Trash2}
                      onClick={() => handleCancelRequest(req.id)}
                      className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 px-3 py-1.5 text-xs rounded-full"
                    >
                      Hủy đơn
                    </AppButton>
                  </div>
                )}
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
        message="Bạn có chắc chắn muốn hủy đơn này không?"
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
