import React, { useState, useMemo, useRef } from "react";
import {
  FileText,
  X,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Gift,
  Sparkles,
  Send,
  AlertTriangle,
  Info
} from "lucide-react";
import { safePost, generateIdempotencyKey } from "../utils/api";
import { analyzeLeaveRequest, formatDateKey } from "../utils/holidayUtils";

const LEAVE_TYPES = [
  { id: "P", label: "Nghỉ Phép Năm (Hưởng nguyên lương)" },
  { id: "KP", label: "Nghỉ Không Lương (Việc riêng)" },
  { id: "OM", label: "Nghỉ Ốm Đau (Hưởng chế độ BHXH)" },
  { id: "OT", label: "Làm Thêm Giờ (Tăng ca OT)" },
  { id: "CT", label: "Đi Công Tác / Ra Ngoài Công Trình" }
];

/**
 * F3: Modal Tạo Đơn Xin Nghỉ Thông Minh Tích Hợp Lịch Lễ & Gợi Ý Cầu Nối
 */
export default function SmartLeaveRequestModal({
  currentUser,
  holidaysList = [],
  existingRequests = [],
  leaveBalance = 12,
  onClose,
  onRequestCreated
}) {
  const [requestType, setRequestType] = useState("P");
  const [startDate, setStartDate] = useState(formatDateKey(new Date()));
  const [endDate, setEndDate] = useState(formatDateKey(new Date()));
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isSubmittingRef = useRef(false);

  // Phân tích thông minh ngày nghỉ và ngày lễ
  const analysis = useMemo(() => {
    return analyzeLeaveRequest(startDate, endDate, holidaysList);
  }, [startDate, endDate, holidaysList]);

  // Kiểm tra cảnh báo trùng đơn đã nộp
  const overlappingRequest = useMemo(() => {
    if (!startDate || !endDate) return null;
    return existingRequests.find((req) => {
      if (req.status === "rejected" || req.status === "cancelled") return false;
      const reqStart = formatDateKey(req.request_date || req.start_date);
      const reqEnd = formatDateKey(req.end_date || req.request_date || req.start_date);
      return startDate <= reqEnd && endDate >= reqStart;
    });
  }, [startDate, endDate, existingRequests]);

  // Cảnh báo vượt số dư phép năm
  const isExceedingBalance = requestType === "P" && analysis.actualDeductedDays > leaveBalance;

  // Xử lý gửi đơn
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setErrorMessage("Vui lòng nhập lý do xin nghỉ cụ thể.");
      return;
    }

    if (trimmedReason.length < 5) {
      setErrorMessage("Lý do xin nghỉ phải có tối thiểu 5 ký tự.");
      return;
    }

    if (overlappingRequest) {
      setErrorMessage(`Bạn đã có đơn "${overlappingRequest.request_type}" đang trong khoảng thời gian này.`);
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
        end_date: endDate,
        request_date: startDate, // V1 compat
        reason: trimmedReason,
        calculated_days: analysis.actualDeductedDays
      };

      const res = await safePost("/requests", payload, { idempotencyKey });
      if (onRequestCreated) {
        onRequestCreated(res?.data || payload);
      }
      onClose();
    } catch (err) {
      setErrorMessage(err.message || "Lỗi nộp đơn xin nghỉ lên máy chủ.");
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl text-slate-800 border-2 border-slate-300">
        
        {/* Header Modal */}
        <div className="p-5 border-b-2 border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold border-2 border-blue-200">
              <FileText size={24} />
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-900">Tạo Đơn Xin Nghỉ Mới</h3>
              <p className="text-xs text-slate-500 font-bold">Hệ thống hỗ trợ tự động đối soát lịch nghỉ lễ</p>
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

        {/* Nội dung Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs font-bold flex items-start gap-2.5">
              <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Chọn Loại đơn */}
          <div>
            <label className="block text-sm font-black text-slate-800 mb-1.5">Loại Đơn / Chế Độ Nghỉ</label>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
              className="w-full px-3.5 py-3 rounded-xl border-2 border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-600 font-bold bg-white"
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Chọn Khoảng ngày nghỉ */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-black text-slate-800 mb-1.5">Từ Ngày</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-300 text-slate-900 text-sm font-bold focus:outline-none focus:border-blue-600"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-black text-slate-800 mb-1.5">Đến Ngày</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-300 text-slate-900 text-sm font-bold focus:outline-none focus:border-blue-600"
                required
              />
            </div>
          </div>

          {/* BANNER THÔNG MINH: TỰ LOẠI TRỪ NGÀY LỄ */}
          {analysis.holidaysEncountered.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 text-xs space-y-2">
              <div className="flex items-center gap-2 font-black text-sm text-amber-900">
                <Gift size={18} />
                <span>Khoảng ngày này trùng với Ngày Lễ quy định!</span>
              </div>
              <ul className="list-disc list-inside text-xs text-amber-900 font-semibold space-y-1">
                {analysis.holidaysEncountered.map((h, i) => (
                  <li key={i}>
                    Ngày <span className="font-black">{h.date}</span>: {h.name} (Hệ thống tự động miễn trừ)
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-800 font-medium italic">
                * Căn cứ Điều 112 BLLĐ: Ngày nghỉ lễ được hưởng nguyên lương, công ty không trừ vào quỹ phép năm.
              </p>
            </div>
          )}

          {/* BANNER GỢI Ý NGÀY CẦU NỐI (BRIDGE DAY SUGGESTION) */}
          {analysis.bridgeSuggestions.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-indigo-50 border-2 border-indigo-200 text-indigo-950 text-xs flex items-start gap-2.5">
              <Sparkles size={18} className="text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-black text-sm block mb-0.5">Gợi ý kỳ nghỉ liền kề:</span>
                <span className="text-xs text-indigo-900 font-medium">
                  {analysis.bridgeSuggestions[0].message} Bạn có thể cân nhắc sắp xếp công việc để có kỳ nghỉ dài.
                </span>
              </div>
            </div>
          )}

          {/* KHỐI TỔNG KẾT TÍNH TOÁN NGÀY PHÉP */}
          <div className="p-4 rounded-2xl bg-slate-50 border-2 border-slate-200 space-y-2 text-sm">
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-medium">Tổng số ngày theo lịch:</span>
              <span className="font-black text-slate-900">{analysis.totalCalendarDays} ngày</span>
            </div>
            {analysis.holidaysEncountered.length > 0 && (
              <div className="flex justify-between items-center text-emerald-700 font-bold">
                <span>Số ngày lễ được miễn trừ:</span>
                <span className="font-black">-{analysis.holidaysEncountered.length} ngày</span>
              </div>
            )}
            {analysis.weekendDaysEncountered.length > 0 && (
              <div className="flex justify-between items-center text-slate-600 font-medium">
                <span>Ngày nghỉ cuối tuần (Chủ nhật):</span>
                <span className="font-bold">-{analysis.weekendDaysEncountered.length} ngày</span>
              </div>
            )}
            <div className="pt-2 border-t-2 border-slate-200 flex justify-between items-center text-base font-black text-slate-900">
              <span>Số ngày trừ phép thực tế:</span>
              <span className="text-blue-700 font-black">{analysis.actualDeductedDays} ngày</span>
            </div>
            {requestType === "P" && (
              <p className="text-xs text-slate-600 mt-1 font-semibold">
                Số dư phép năm hiện có: <span className="font-black text-slate-900">{leaveBalance} ngày</span>
                {isExceedingBalance && (
                  <span className="text-rose-600 font-black ml-1.5 block mt-0.5">⚠️ Vượt quá số dư phép năm còn lại!</span>
                )}
              </p>
            )}
          </div>

          {/* Lý do xin nghỉ */}
          <div>
            <label className="block text-sm font-black text-slate-800 mb-1.5">
              Lý Do Cụ Thể <span className="text-rose-600">* (Bắt buộc)</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ghi rõ lý do xin nghỉ hoặc công việc tăng ca để Trưởng bộ phận xét duyệt..."
              className="w-full px-3.5 py-3 rounded-xl border-2 border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-blue-600"
              required
            />
          </div>

          {/* Nút gửi đơn */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-sm border-2 border-slate-300 cursor-pointer"
            >
              Hủy Bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isSubmittingRef.current}
              className="flex-2 py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm border-2 border-blue-700 shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Đang gửi đơn...</span>
              ) : (
                <>
                  <Send size={16} />
                  <span>NỘP ĐƠN XÉT DUYỆT</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
