import React, { useState, useMemo, useRef } from "react";
import {
  FileText,
  X,
  AlertCircle,
  Gift,
  Sparkles,
  Send,
  Wallet
} from "lucide-react";
import { safePost, generateIdempotencyKey } from "../utils/api";
import { analyzeLeaveRequest, formatDateKey } from "../utils/holidayUtils";

const LEAVE_TYPES = [
  { id: "P", label: "Nghỉ phép năm (Hưởng nguyên lương)" },
  { id: "KP", label: "Nghỉ không lương (Việc riêng)" },
  { id: "SALARY_ADVANCE", label: "Xin ứng lương (Tạm ứng trước kỳ)" },
  { id: "Bổ sung công / Quên chấm giờ ra", label: "Bổ sung công / Quên chấm giờ ra" },
  { id: "OM", label: "Nghỉ ốm đau (Hưởng chế độ BHXH)" },
  { id: "OT", label: "Làm thêm giờ (Tăng ca OT)" },
  { id: "CT", label: "Đi công tác / Ra ngoài công trình" }
];

const QUICK_ADVANCE_AMOUNTS = [500000, 1000000, 2000000, 5000000];

const formatVnd = (n) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")} đ`;

/**
 * Modal Tạo Đơn Xin Nghỉ / Tăng Ca / Bổ Sung Công / Xin Ứng Lương
 */
export default function SmartLeaveRequestModal({
  currentUser,
  holidaysList = [],
  existingRequests = [],
  leaveBalance = 12,
  initialDate = null,
  initialType = "P",
  initialMode = null,
  initialReason = "",
  onClose,
  onRequestCreated,
  onRequestSubmitted
}) {
  const defaultDate = initialDate || formatDateKey(new Date());
  const resolvedInitialType = initialMode || initialType || "P";
  const [requestType, setRequestType] = useState(resolvedInitialType);
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [advanceAmount, setAdvanceAmount] = useState("1000000");
  const [reason, setReason] = useState(initialReason || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isSubmittingRef = useRef(false);
  const isSalaryAdvance = requestType === "SALARY_ADVANCE";

  const availableLeaveDays = useMemo(() => {
    if (leaveBalance && typeof leaveBalance === "object") {
      return Number(leaveBalance.remaining ?? 0);
    }
    const parsed = Number(leaveBalance);
    return Number.isFinite(parsed) ? parsed : 12;
  }, [leaveBalance]);

  // Phân tích thông minh ngày nghỉ và ngày lễ
  const analysis = useMemo(() => {
    return analyzeLeaveRequest(startDate, endDate, holidaysList);
  }, [startDate, endDate, holidaysList]);

  // Kiểm tra cảnh báo trùng đơn đã nộp (tách riêng đơn ứng lương & đơn nghỉ/công)
  const overlappingRequest = useMemo(() => {
    if (!startDate) return null;
    if (isSalaryAdvance) {
      return existingRequests.find((req) => {
        const st = String(req.status || "").toLowerCase();
        if (st !== "pending") return false;
        const rt = String(req.request_type || "").toLowerCase();
        return rt === "salary_advance" || rt.includes("ứng lương");
      }) || null;
    }
    if (!endDate) return null;
    return existingRequests.find((req) => {
      const st = String(req.status || "").toLowerCase();
      if (st === "rejected" || st === "cancelled") return false;
      const rt = String(req.request_type || "").toLowerCase();
      if (rt === "salary_advance" || rt.includes("ứng lương")) return false;
      const reqStart = formatDateKey(req.request_date || req.start_date);
      const reqEnd = formatDateKey(req.end_date || req.request_date || req.start_date);
      return startDate <= reqEnd && endDate >= reqStart;
    }) || null;
  }, [startDate, endDate, existingRequests, isSalaryAdvance]);

  // Cảnh báo vượt số dư phép năm hoặc đã hết phép năm
  const isOutOfLeave = requestType === "P" && availableLeaveDays <= 0;
  const isExceedingBalance =
    requestType === "P" && (availableLeaveDays <= 0 || analysis.actualDeductedDays > availableLeaveDays);

  const parsedAdvanceNum = Math.round(Number(String(advanceAmount).replace(/[^0-9]/g, "")) || 0);

  // Xử lý gửi đơn
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;

    if (isSalaryAdvance) {
      if (!Number.isFinite(parsedAdvanceNum) || parsedAdvanceNum < 10000 || parsedAdvanceNum > 500000000) {
        setErrorMessage("Số tiền xin ứng lương phải từ 10.000 đ đến 500.000.000 đ.");
        return;
      }
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setErrorMessage(isSalaryAdvance ? "Vui lòng nhập lý do xin ứng lương." : "Vui lòng nhập lý do cụ thể.");
      return;
    }

    if (trimmedReason.length < 5) {
      setErrorMessage("Lý do phải có tối thiểu 5 ký tự.");
      return;
    }

    if (overlappingRequest) {
      setErrorMessage(
        isSalaryAdvance
          ? "Bạn đang có 1 đơn xin ứng lương chờ duyệt. Vui lòng đợi xử lý trước khi tạo đơn mới."
          : `Bạn đã có đơn "${overlappingRequest.request_type}" đang trong khoảng thời gian này.`
      );
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const idempotencyKey = generateIdempotencyKey("req");

      const payload = {
        employee_id: currentUser?.ma_nv,
        request_type: requestType,
        start_date: startDate,
        end_date: isSalaryAdvance ? startDate : endDate,
        request_date: startDate,
        reason: trimmedReason,
        advance_amount: isSalaryAdvance ? parsedAdvanceNum : 0,
        calculated_days: isSalaryAdvance ? 0 : analysis.actualDeductedDays
      };

      const res = await safePost("/requests", payload, { idempotencyKey });
      if (!res?.success) {
        setErrorMessage(res?.message || "Không thể gửi đơn lên máy chủ.");
        return;
      }
      if (onRequestCreated) {
        onRequestCreated(res?.data || payload);
      }
      if (onRequestSubmitted) {
        onRequestSubmitted(res?.data || payload);
      }
      onClose();
    } catch (err) {
      setErrorMessage(err.message || "Lỗi nộp đơn lên máy chủ.");
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="flex flex-col w-full max-w-lg max-h-[88vh] bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl text-slate-800 border-2 border-slate-300">
        
        {/* Header Modal */}
        <div className="p-4 sm:p-5 border-b-2 border-slate-100 flex items-center justify-between gap-2 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold border-2 shrink-0 ${
              isSalaryAdvance
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-blue-50 text-blue-700 border-blue-200"
            }`}>
              {isSalaryAdvance ? <Wallet size={22} /> : <FileText size={22} />}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base sm:text-lg leading-snug text-slate-900">
                {isSalaryAdvance ? "Đề nghị ứng lương" : "Tạo đơn xin phép / tăng ca"}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {isSalaryAdvance ? "Khấu trừ tự động vào kỳ lương tháng" : "Hệ thống tự động đối soát lịch nghỉ lễ"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 text-slate-600 hover:text-slate-900 border-2 border-slate-200 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nội dung Form có thể cuộn mượt trên mọi thiết bị */}
        <form
          id="smart-leave-request-form"
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs font-semibold flex items-start gap-2.5 leading-relaxed">
              <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Chọn Loại đơn */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Loại đơn / chế độ</label>
            <select
              value={requestType}
              onChange={(e) => {
                setErrorMessage("");
                setRequestType(e.target.value);
              }}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-600 font-semibold bg-white"
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {isSalaryAdvance ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Số tiền muốn ứng (VNĐ)
                </label>
                <input
                  type="number"
                  min={10000}
                  max={500000000}
                  step={50000}
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  placeholder="Ví dụ: 2000000"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 text-slate-900 text-base font-bold focus:outline-none focus:border-emerald-600"
                  required
                />
                <div className="mt-1.5 text-xs font-semibold text-emerald-700">
                  Bằng số: {formatVnd(parsedAdvanceNum)}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {QUICK_ADVANCE_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAdvanceAmount(String(amt))}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer whitespace-nowrap ${
                        parsedAdvanceNum === amt
                          ? "bg-emerald-600 text-white border-emerald-700"
                          : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                      }`}
                    >
                      {amt.toLocaleString("vi-VN")} đ
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Ngày đề nghị</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border-2 border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-emerald-600"
                  required
                />
              </div>
            </div>
          ) : (
            <>
              {/* Chọn Khoảng ngày nghỉ */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Từ ngày</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setStartDate(nextStart);
                      if (endDate < nextStart) setEndDate(nextStart);
                    }}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border-2 border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">Đến ngày</label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border-2 border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>
              </div>

              {/* BANNER THÔNG MINH: TỰ LOẠI TRỪ NGÀY LỄ */}
              {analysis.holidaysEncountered.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
                    <Gift size={18} className="shrink-0" />
                    <span>Khoảng ngày này trùng với Ngày Lễ quy định</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-amber-900 font-medium space-y-1">
                    {analysis.holidaysEncountered.map((h, i) => (
                      <li key={i}>
                        Ngày <span className="font-bold">{h.date}</span>: {h.name} (Miễn trừ phép)
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Theo Điều 112 BLLĐ, ngày nghỉ lễ được hưởng nguyên lương, không trừ vào quỹ phép năm.
                  </p>
                </div>
              )}

              {/* BANNER GỢI Ý NGÀY CẦU NỐI */}
              {analysis.bridgeSuggestions.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-indigo-50 border-2 border-indigo-200 text-indigo-950 text-xs flex items-start gap-2.5">
                  <Sparkles size={18} className="text-indigo-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-bold text-sm block mb-0.5">Gợi ý kỳ nghỉ liền kề</span>
                    <span className="text-xs text-indigo-900">
                      {analysis.bridgeSuggestions[0].message} Bạn có thể sắp xếp công việc để có kỳ nghỉ dài.
                    </span>
                  </div>
                </div>
              )}

              {/* KHỐI TỔNG KẾT TÍNH TOÁN NGÀY PHÉP */}
              <div className="p-4 rounded-2xl bg-slate-50 border-2 border-slate-200 space-y-2 text-sm">
                <div className="flex justify-between items-center text-slate-700">
                  <span className="font-medium">Tổng số ngày theo lịch:</span>
                  <span className="font-bold text-slate-900 whitespace-nowrap">{analysis.totalCalendarDays} ngày</span>
                </div>
                {analysis.holidaysEncountered.length > 0 && (
                  <div className="flex justify-between items-center text-emerald-700 font-semibold">
                    <span>Ngày lễ được miễn trừ:</span>
                    <span className="font-bold whitespace-nowrap">-{analysis.holidaysEncountered.length} ngày</span>
                  </div>
                )}
                {analysis.weekendDaysEncountered.length > 0 && (
                  <div className="flex justify-between items-center text-slate-600 font-medium">
                    <span>Cuối tuần (Chủ nhật):</span>
                    <span className="font-semibold whitespace-nowrap">-{analysis.weekendDaysEncountered.length} ngày</span>
                  </div>
                )}
                <div className="pt-2 border-t-2 border-slate-200 flex justify-between items-center text-base font-bold text-slate-900">
                  <span>Số ngày trừ phép thực tế:</span>
                  <span className="text-blue-700 font-bold whitespace-nowrap">
                    {requestType === "P" ? analysis.actualDeductedDays : 0} ngày
                  </span>
                </div>
                {requestType === "P" && (
                  <div className="pt-1 space-y-2">
                    <p className="text-xs text-slate-600 font-medium">
                      Quỹ phép năm còn lại: <span className="font-bold text-slate-900">{availableLeaveDays} ngày</span>
                    </p>
                    {isExceedingBalance && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 space-y-2">
                        <p className="text-xs text-rose-700 font-semibold leading-relaxed">
                          {isOutOfLeave
                            ? "Quỹ phép năm của bạn đã hết (0 ngày còn lại). Hãy chuyển sang Nghỉ không lương (KP)."
                            : `Số ngày xin nghỉ (${analysis.actualDeductedDays} ngày) vượt quá phép năm còn lại (${availableLeaveDays} ngày).`}
                        </p>
                        <button
                          type="button"
                          onClick={() => setRequestType("KP")}
                          className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs cursor-pointer transition whitespace-nowrap"
                        >
                          Chuyển sang Nghỉ Không Lương (KP)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Lý do */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              Lý do cụ thể <span className="text-rose-600">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isSalaryAdvance
                  ? "Ghi rõ lý do cần tạm ứng lương..."
                  : "Ghi rõ lý do xin nghỉ hoặc công việc tăng ca để quản lý xét duyệt..."
              }
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-600 leading-relaxed"
              required
            />
          </div>
        </form>

        {/* Footer nút gửi đơn cố định dưới đáy sheet */}
        <div
          className="px-4 py-3 border-t border-slate-200 bg-white flex gap-2.5 shrink-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm border-2 border-slate-300 cursor-pointer whitespace-nowrap"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            form="smart-leave-request-form"
            disabled={isSubmitting || isSubmittingRef.current}
            className={`flex-1 min-h-[44px] py-2.5 px-4 rounded-xl text-white font-semibold text-sm border-2 shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap ${
              isSalaryAdvance
                ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-700"
                : "bg-blue-600 hover:bg-blue-700 border-blue-700"
            }`}
          >
            {isSubmitting ? (
              <span>Đang gửi đơn...</span>
            ) : (
              <>
                <Send size={16} className="shrink-0" />
                <span>{isSalaryAdvance ? "Gửi đơn ứng lương" : "Nộp đơn xét duyệt"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
