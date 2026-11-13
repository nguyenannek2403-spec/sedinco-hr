import React, { useState, useEffect, useRef } from "react";
import { Lock, Unlock, AlertTriangle, X, CheckCircle2, ShieldAlert } from "lucide-react";
import { safeGet, safePost, generateIdempotencyKey } from "../utils/api";

/**
 * F5: Modal Chốt Công Kỳ Lương (Dành cho Kế toán & Mở lại bởi Quản trị)
 */
export default function PeriodLockModal({
  month,
  year,
  isCurrentlyLocked = false,
  userRole = "accountant",
  onClose,
  onStatusChanged
}) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lowTrustCount, setLowTrustCount] = useState(0);
  const [lowTrustLogs, setLowTrustLogs] = useState([]);
  const [confirmLowTrust, setConfirmLowTrust] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  const isLockAction = !isCurrentlyLocked;

  useEffect(() => {
    if (isLockAction) {
      setIsLoadingStatus(true);
      safeGet(`/attendance/period-status?month=${month}&year=${year}`)
        .then((res) => {
          if (res?.data) {
            setLowTrustCount(res.data.low_trust_count || 0);
            setLowTrustLogs(res.data.low_trust_logs || []);
          }
        })
        .catch((err) => {
          console.warn("Không thể tải trạng thái kỳ công:", err.message);
        })
        .finally(() => {
          setIsLoadingStatus(false);
        });
    }
  }, [isLockAction, month, year]);

  const handleAction = async (e) => {
    e.preventDefault();
    if (submitInFlightRef.current) return;
    if (!isLockAction && userRole !== "admin") {
      setErrorMessage("Tách quyền: Chỉ Quản Trị Viên mới có thẩm quyền mở lại kỳ công đã chốt!");
      return;
    }

    if (isLockAction && userRole !== "accountant" && userRole !== "admin") {
      setErrorMessage("Tách quyền: Chỉ bộ phận Kế toán mới có quyền chốt sổ kỳ công!");
      return;
    }

    if (!isLockAction && !reason.trim()) {
      setErrorMessage("Vui lòng ghi rõ lý do mở lại kỳ công đã chốt.");
      return;
    }

    if (isLockAction && lowTrustCount > 0 && !confirmLowTrust) {
      setErrorMessage(`Kỳ công có ${lowTrustCount} bản ghi độ tin cậy thấp (is_low_trust > 0). Vui lòng tích chọn xác nhận trước khi chốt!`);
      return;
    }

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const idempotencyKey = generateIdempotencyKey("period_lock");
      const endpoint = isLockAction ? "/attendance/lock-period" : "/attendance/unlock-period";
      
      const payload = {
        month,
        year,
        reason: reason.trim() || (isLockAction ? "Kế toán chốt số liệu công tính lương" : ""),
        confirm_low_trust: confirmLowTrust
      };

      await safePost(endpoint, payload, { idempotencyKey });

      if (onStatusChanged) {
        onStatusChanged(isLockAction, payload.reason);
      }
      onClose();
    } catch (err) {
      setErrorMessage(err.message || "Lỗi cập nhật trạng thái chốt kỳ công.");
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl text-slate-800 border-2 border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b-2 border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 ${
                isLockAction ? "bg-rose-50 text-rose-700 border-rose-300" : "bg-amber-50 text-amber-700 border-amber-300"
              }`}
            >
              {isLockAction ? <Lock size={24} /> : <Unlock size={24} />}
            </div>
            <div>
              <h3 className="font-black text-lg md:text-xl text-slate-900">
                {isLockAction ? "Chốt Công Kỳ Lương" : "Mở Lại Kỳ Công Đã Chốt"}
              </h3>
              <p className="text-sm text-slate-600 font-bold">
                Tháng {month}/{year}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 hover:text-slate-900 border-2 border-slate-200 flex items-center justify-center cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-5 space-y-4"
          style={{ WebkitOverflowScrolling: "touch", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        >
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs font-bold flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Nội dung cảnh báo */}
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 text-sm space-y-2 mb-5">
          <div className="flex items-center gap-2 font-black text-sm text-amber-900">
            <ShieldAlert size={18} className="text-amber-700" />
            <span>Lưu ý quan trọng về tính toàn vẹn dữ liệu:</span>
          </div>
          <p className="text-xs md:text-sm leading-relaxed text-amber-900 font-semibold">
            {isLockAction ? (
              <>
                Sau khi Kế toán xác nhận <strong>Chốt công</strong>, toàn bộ bảng chấm công của Tháng {month}/{year} sẽ bị đóng băng. Nhân sự và Nhân viên sẽ <strong>không thể sửa đổi hay bổ sung công</strong> nữa để đảm bảo số liệu tính lương chính xác tuyệt đối.
              </>
            ) : (
              <>
                Việc <strong>Mở lại kỳ công đã chốt</strong> chỉ dành cho Ban Quản Trị và bắt buộc phải có lý do giải trình cụ thể để lưu lại trong Nhật ký thao tác (Audit Log).
              </>
            )}
          </p>
        </div>

        <form onSubmit={handleAction} className="space-y-4">
          {/* Cảnh báo bản ghi độ tin cậy thấp (is_low_trust > 0: mức 1 raw, mức 2 hạ cấp) */}
          {isLockAction && lowTrustCount > 0 && (
            <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 space-y-3">
              <div className="flex items-center gap-2 font-black text-sm text-rose-900">
                <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                <span>Phát hiện {lowTrustCount} bản ghi độ tin cậy thấp (is_low_trust &gt; 0)</span>
              </div>
              <p className="text-xs text-rose-800 font-semibold">
                Kỳ công này có các bản ghi chấm công bằng tọa độ thô (raw) hoặc có dấu hiệu hạ cấp phương thức. Kế toán cần đối soát kỹ trước khi xác nhận.
              </p>
              {lowTrustLogs.length > 0 && (
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {lowTrustLogs.slice(0, 10).map((item, idx) => (
                    <div key={idx} className="bg-white/80 p-2 rounded-lg border border-rose-200 text-xs flex justify-between items-center">
                      <span className="font-bold text-slate-800">{item.ho_ten || item.employee_id} ({item.employee_id})</span>
                      <span className="text-rose-700 font-semibold">{item.reason || `Mức ${item.is_low_trust}`}</span>
                    </div>
                  ))}
                  {lowTrustLogs.length > 10 && (
                    <p className="text-xs text-slate-500 italic text-center">Và {lowTrustLogs.length - 10} bản ghi khác...</p>
                  )}
                </div>
              )}
              <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmLowTrust}
                  onChange={(e) => setConfirmLowTrust(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                />
                <span className="text-xs font-bold text-rose-950">
                  Tôi đã kiểm tra danh sách và xác nhận chốt sổ mặc dù có {lowTrustCount} bản ghi độ tin cậy thấp
                </span>
              </label>
            </div>
          )}

          {!isLockAction && (
            <div>
              <label className="block text-sm font-black text-slate-800 mb-1.5">
                Lý Do Mở Lại Kỳ Công <span className="text-rose-600">* (Bắt buộc)</span>
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ghi rõ lý do hoặc căn cứ mở lại kỳ công đã chốt..."
                className="w-full px-3.5 py-3 rounded-xl border-2 border-slate-300 text-slate-900 font-semibold text-sm focus:outline-none focus:border-amber-600"
                required
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-sm border-2 border-slate-300 cursor-pointer"
            >
              Hủy Bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-2 py-3.5 px-4 rounded-xl text-white font-black text-sm border-2 shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                isLockAction
                  ? "bg-rose-600 hover:bg-rose-700 border-rose-700 shadow-rose-600/20"
                  : "bg-amber-600 hover:bg-amber-700 border-amber-700 shadow-amber-600/20"
              }`}
            >
              {isSubmitting ? (
                <span>Đang xử lý...</span>
              ) : isLockAction ? (
                <>
                  <Lock size={16} />
                  <span>XÁC NHẬN CHỐT CÔNG</span>
                </>
              ) : (
                <>
                  <Unlock size={16} />
                  <span>XÁC NHẬN MỞ KỲ CÔNG</span>
                </>
              )}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
