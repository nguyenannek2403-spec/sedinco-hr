import React, { useState, useMemo, useRef } from "react";
import {
  FileText,
  AlertCircle,
  Gift,
  Sparkles,
  Send,
  Wallet,
  Clock,
  Camera,
  Image as ImageIcon,
  Trash2
} from "lucide-react";
import { safePost, generateIdempotencyKey } from "../utils/api";
import { pickCompressedEvidencePhoto } from "../utils/imageHelper";
import { analyzeLeaveRequest, formatDateKey } from "../utils/holidayUtils";
import { CORRECTION_MODES, getRequestTypeLabel } from "../utils/viLabels";
import { formatViCurrency, formatViNumber, parseViNumberInput } from "../utils/viNumberFormat";
import { AppButton, AppModal, FormRow } from "./ui";

const LEAVE_TYPES = [
  { id: "P", label: "Nghỉ phép năm (Hưởng nguyên lương)" },
  { id: "KP", label: "Nghỉ không lương (Việc riêng)" },
  { id: "Bổ sung công / Quên chấm giờ ra", label: "Giải trình Bổ sung công (Quên chấm / Đổi ca)" },
  { id: "OT", label: "Đăng ký Tăng ca (Làm thêm giờ)" },
  { id: "SALARY_ADVANCE", label: "Xin ứng lương (Tạm ứng trước kỳ)" },
  { id: "OM", label: "Nghỉ ốm đau (Hưởng chế độ BHXH)" },
  { id: "CT", label: "Đi công tác / Ra ngoài công trình" }
];

const QUICK_ADVANCE_AMOUNTS = [500000, 1000000, 2000000, 5000000];

const formatVnd = (n) => formatViCurrency(n, true);

const compressProofImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không đọc được file ảnh"));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Định dạng ảnh không hợp lệ"));
      img.onload = () => {
        const maxWidth = 720;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        let quality = 0.65;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > 180000 && quality > 0.35) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        if (dataUrl.length > 240000) {
          reject(new Error("Ảnh quá lớn, vui lòng chọn ảnh nhẹ hơn."));
          return;
        }
        resolve(dataUrl);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

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
  initialCorrectionMode = "CHECK_OUT",
  initialCheckInTime = "",
  initialCheckOutTime = "",
  showToast = null,
  onClose,
  onRequestCreated,
  onRequestSubmitted
}) {
  const defaultDate = initialDate || formatDateKey(new Date());
  const resolvedInitial =
    initialMode === "ATTENDANCE_COMPENSATION"
      ? "Bổ sung công / Quên chấm giờ ra"
      : (initialMode || initialType || "P");
  const [requestType, setRequestType] = useState(resolvedInitial);
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [advanceAmount, setAdvanceAmount] = useState("1000000");
  const [otHours, setOtHours] = useState("3");
  const [correctionMode, setCorrectionMode] = useState(initialCorrectionMode || "CHECK_OUT");
  const [checkInTime, setCheckInTime] = useState(initialCheckInTime || "07:30");
  const [checkOutTime, setCheckOutTime] = useState(initialCheckOutTime || "17:30");
  const [evidenceImage, setEvidenceImage] = useState("");
  const [reason, setReason] = useState(initialReason || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isSubmittingRef = useRef(false);
  const proofInputRef = useRef(null);
  const isSalaryAdvance = requestType === "SALARY_ADVANCE";
  const isOt = requestType === "OT";
  const isCompensation =
    requestType === "Bổ sung công / Quên chấm giờ ra" ||
    requestType === "ATTENDANCE_COMPENSATION";
  const needsCheckIn = isCompensation && (correctionMode === "CHECK_IN" || correctionMode === "BOTH" || correctionMode === "SHIFT_CHANGE");
  const needsCheckOut = isCompensation && (correctionMode === "CHECK_OUT" || correctionMode === "BOTH" || correctionMode === "SHIFT_CHANGE");

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

  const parsedAdvanceNum = Math.max(0, Math.round(parseViNumberInput(advanceAmount)));

  // Xử lý chọn ảnh chứng minh (nén nhẹ <= 180KB)
  const handlePickEvidence = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage("");
    try {
      const compressed = await compressProofImage(file);
      setEvidenceImage(compressed);
    } catch (err) {
      setErrorMessage(err.message || "Không thể xử lý ảnh đính kèm.");
    }
    e.target.value = "";
  };

  const handlePickEvidenceSdk = async (sourceType) => {
    setErrorMessage("");
    const res = await pickCompressedEvidencePhoto({
      sourceType,
      cameraType: "back",
      maxWidth: 720,
      maxHeight: 720,
      quality: 0.65
    });
    if (res?.success && res?.photoUrl) {
      setEvidenceImage(res.photoUrl);
      return;
    }
    if (proofInputRef.current) {
      if (sourceType?.[0] === "camera") {
        proofInputRef.current.setAttribute("capture", "environment");
      } else {
        proofInputRef.current.removeAttribute("capture");
      }
      proofInputRef.current.click();
    }
  };

  // Xử lý gửi đơn
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;

    if (isSalaryAdvance) {
      if (!Number.isFinite(parsedAdvanceNum) || parsedAdvanceNum < 10000 || parsedAdvanceNum > 500000000) {
        const msg = "Số tiền xin ứng lương phải từ 10.000 đ đến 500.000.000 đ.";
        setErrorMessage(msg);
        if (showToast) showToast(msg, "warning");
        return;
      }
    }

    if (isOt) {
      const parsedOt = Number(otHours);
      if (!Number.isFinite(parsedOt) || parsedOt < 0.5 || parsedOt > 12) {
        const msg = "Số giờ tăng ca dự kiến phải từ 0.5 đến 12 giờ.";
        setErrorMessage(msg);
        if (showToast) showToast(msg, "warning");
        return;
      }
    }

    if (isCompensation) {
      if (needsCheckIn && !checkInTime) {
        setErrorMessage("Vui lòng chọn Giờ vào thực tế cần bổ sung.");
        return;
      }
      if (needsCheckOut && !checkOutTime) {
        setErrorMessage("Vui lòng chọn Giờ ra thực tế cần bổ sung.");
        return;
      }
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      const msg = isSalaryAdvance ? "Vui lòng nhập lý do xin ứng lương." : "Vui lòng nhập lý do cụ thể.";
      setErrorMessage(msg);
      if (showToast) showToast(msg, "warning");
      return;
    }

    if (trimmedReason.length < 5) {
      const msg = "Lý do phải có tối thiểu 5 ký tự.";
      setErrorMessage(msg);
      if (showToast) showToast(msg, "warning");
      return;
    }

    if (overlappingRequest && !isCompensation) {
      setErrorMessage(
        isSalaryAdvance
          ? "Bạn đang có 1 đơn xin ứng lương chờ duyệt. Vui lòng đợi xử lý trước khi tạo đơn mới."
          : `Bạn đã có "${getRequestTypeLabel(overlappingRequest.request_type)}" đang trong khoảng thời gian này.`
      );
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const idempotencyKey = generateIdempotencyKey("req");

      const effectiveEndDate = isSalaryAdvance || isCompensation || isOt ? startDate : endDate;
      const otHoursNum = isOt ? Number(otHours) || 3 : 0;
      const finalReason =
        isOt && !/\d+(?:\.\d+)?\s*(?:giờ|h\b)/i.test(trimmedReason)
          ? `${trimmedReason} (${otHoursNum} giờ)`
          : trimmedReason;
      const payload = {
        employee_id: currentUser?.ma_nv,
        request_type: requestType,
        from_date: startDate,
        to_date: effectiveEndDate,
        start_date: startDate,
        end_date: effectiveEndDate,
        request_date: startDate,
        reason: finalReason,
        advance_amount: isSalaryAdvance ? parsedAdvanceNum : 0,
        ot_hours: isOt ? otHoursNum : undefined,
        calculated_days: isSalaryAdvance || isCompensation || isOt ? 0 : analysis.actualDeductedDays,
        ...(isCompensation
          ? {
              correction_mode: correctionMode,
              check_in_time: needsCheckIn ? checkInTime : null,
              check_out_time: needsCheckOut ? checkOutTime : null,
              evidence_image: evidenceImage || null
            }
          : {})
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

  const submitVariant = isSalaryAdvance ? "success" : isCompensation ? "warning" : "primary";
  const modalTitle = isSalaryAdvance
    ? "Đề nghị xin ứng lương"
    : isCompensation
      ? "Giải trình Bổ sung công"
      : "Tạo đơn xin phép / tăng ca";
  const modalSubtitle = isSalaryAdvance
    ? "Khấu trừ tự động vào kỳ lương tháng"
    : isCompensation
      ? "Quên chấm vào/ra hoặc đổi ca làm việc"
      : "Hệ thống tự động đối soát lịch nghỉ lễ";
  const modalIcon = (
    <div
      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold border shrink-0 ${
        isSalaryAdvance
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70"
          : isCompensation
            ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70"
            : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/70"
      }`}
    >
      {isSalaryAdvance ? <Wallet size={20} /> : isCompensation ? <Clock size={20} /> : <FileText size={20} />}
    </div>
  );

  return (
    <AppModal
      isOpen
      onClose={onClose}
      disableClose={isSubmitting}
      showCloseX={false}
      title={modalTitle}
      subtitle={modalSubtitle}
      icon={modalIcon}
      maxWidthClass="max-w-lg"
      footer={
        <div className="flex gap-2.5">
          <AppButton
            variant="secondary"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex-1"
          >
            Đóng / Quay lại
          </AppButton>
          <AppButton
            type="submit"
            form="smart-leave-request-form"
            variant={submitVariant}
            icon={Send}
            loading={isSubmitting}
            loadingText="Đang gửi đơn..."
            className="flex-1"
          >
            {isSalaryAdvance
              ? "Gửi đơn ứng lương"
              : isCompensation
                ? "Gửi giải trình công"
                : "Nộp đơn xét duyệt"}
          </AppButton>
        </div>
      }
    >
        {/* Nội dung Form có thể cuộn mượt trên mọi thiết bị */}
        <form
          id="smart-leave-request-form"
          onSubmit={handleSubmit}
          className="p-4 space-y-4 text-slate-800 dark:text-slate-100"
        >
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200 text-xs font-semibold flex items-start gap-2.5 leading-relaxed">
              <AlertCircle size={18} className="text-rose-600 dark:text-rose-300 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Chọn Loại đơn */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1.5">Loại đơn / chế độ</label>
            <select
              value={requestType}
              onChange={(e) => {
                setErrorMessage("");
                setRequestType(e.target.value);
              }}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 font-semibold bg-white dark:bg-slate-800"
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
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1.5">
                  Số tiền muốn ứng (VNĐ)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={parsedAdvanceNum > 0 ? formatViNumber(parsedAdvanceNum, 0) : ""}
                  onChange={(e) => setAdvanceAmount(String(Math.max(0, Math.round(parseViNumberInput(e.target.value)))))}
                  placeholder="Ví dụ: 2.000.000"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-base font-bold focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400"
                />
                <div className="mt-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  Bằng số: {formatVnd(parsedAdvanceNum)}
                </div>
                <div
                  data-filter-group="quick-advance-amounts"
                  className="grid grid-cols-2 gap-2 mt-2 p-1.5 rounded-xl bg-slate-100 border border-slate-200/80 dark:bg-slate-950 dark:border-slate-800"
                >
                  {QUICK_ADVANCE_AMOUNTS.map((amt) => {
                    const active = parsedAdvanceNum === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        data-active={active ? "true" : "false"}
                        onClick={() => setAdvanceAmount(String(amt))}
                        className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer whitespace-nowrap ${
                          active
                            ? "bg-[#E11D48] text-white border-[#BE123C] shadow-sm dark:bg-rose-600 dark:text-white ring-1 ring-rose-500/50"
                            : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-slate-100"
                        }`}
                      >
                        {formatViCurrency(amt)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <FormRow label="Ngày đề nghị">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-36 min-h-[44px] px-2.5 py-1.5 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:border-emerald-600"
                  />
                </FormRow>
              </div>
            </div>
          ) : isOt ? (
            <div className="space-y-3">
              <div className="divide-y divide-slate-200 dark:divide-slate-700/70 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700/80 overflow-hidden">
                <FormRow label="Ngày đăng ký tăng ca">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setEndDate(e.target.value);
                    }}
                    className="w-36 min-h-[44px] px-2.5 py-1.5 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:border-violet-600"
                  />
                </FormRow>
                <FormRow label="Số giờ tăng ca dự kiến" description="Đơn giá 1.5x ngày thường • 2.0x CN • 3.0x Lễ">
                  <input
                    type="number"
                    min={0.5}
                    max={12}
                    step={0.5}
                    value={otHours}
                    onChange={(e) => setOtHours(e.target.value)}
                    className="w-24 min-h-[44px] px-2.5 py-1.5 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-bold text-center focus:outline-none focus:border-violet-600"
                  />
                </FormRow>
              </div>
              <div
                data-filter-group="quick-ot-hours"
                className="grid grid-cols-4 gap-2 p-1.5 rounded-xl bg-slate-100 border border-slate-200/80 dark:bg-slate-950 dark:border-slate-800"
              >
                {[2, 3, 4, 8].map((h) => {
                  const active = Number(otHours) === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      data-active={active ? "true" : "false"}
                      onClick={() => setOtHours(String(h))}
                      className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        active
                          ? "bg-[#E11D48] text-white border-[#BE123C] shadow-sm dark:bg-rose-600 dark:text-white ring-1 ring-rose-500/50"
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-slate-100"
                      }`}
                    >
                      {h} giờ
                    </button>
                  );
                })}
              </div>
            </div>
          ) : isCompensation ? (
            <div className="space-y-4">
              {/* Chọn Ngày giải trình */}
              <div className="bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <FormRow label="Ngày bổ sung công">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setEndDate(e.target.value);
                    }}
                    className="w-36 min-h-[44px] px-2.5 py-1.5 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:border-amber-600"
                    required
                  />
                </FormRow>
              </div>

              {/* 4 Nút chọn phạm vi giải trình */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
                  Tình huống cần giải trình
                </label>
                <div
                  data-filter-group="correction-modes"
                  className="grid grid-cols-2 gap-2 p-1.5 rounded-xl bg-slate-100 border border-slate-200/80 dark:bg-slate-950 dark:border-slate-800"
                >
                  {CORRECTION_MODES.map((m) => {
                    const active = correctionMode === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        data-active={active ? "true" : "false"}
                        onClick={() => {
                          setErrorMessage("");
                          setCorrectionMode(m.value);
                        }}
                        className={`min-h-[60px] p-2.5 rounded-xl border-2 text-left transition active:scale-[0.98] cursor-pointer ${
                          active
                            ? "bg-[#E11D48] text-white border-[#BE123C] shadow-sm dark:bg-rose-600 dark:text-white ring-1 ring-rose-500/50"
                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                        }`}
                      >
                        <div className="text-xs font-bold leading-snug">{m.label}</div>
                        <div className={`text-xs mt-0.5 leading-snug ${active ? "text-rose-100" : "text-slate-500 dark:text-slate-400"}`}>{m.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Giờ vào / Giờ ra thực tế dạng dòng ngang iOS */}
              <div className="divide-y divide-slate-200 dark:divide-slate-700/70 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700/80">
                {needsCheckIn && (
                  <FormRow label="Giờ vào thực tế">
                    <input
                      type="time"
                      value={checkInTime}
                      onChange={(e) => setCheckInTime(e.target.value)}
                      className="w-32 sm:w-36 min-h-[44px] px-2.5 py-1.5 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-bold focus:outline-none focus:border-amber-600"
                      required
                    />
                  </FormRow>
                )}
                {needsCheckOut && (
                  <FormRow label="Giờ ra thực tế">
                    <input
                      type="time"
                      value={checkOutTime}
                      onChange={(e) => setCheckOutTime(e.target.value)}
                      className="w-32 sm:w-36 min-h-[44px] px-2.5 py-1.5 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-bold focus:outline-none focus:border-amber-600"
                      required
                    />
                  </FormRow>
                )}
              </div>

              {/* Ảnh chứng minh (tùy chọn) */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Ảnh chứng minh (nếu có)
                  </span>
                  {evidenceImage && (
                    <button
                      type="button"
                      onClick={() => setEvidenceImage("")}
                      className="text-xs font-semibold text-rose-600 dark:text-rose-300 flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60"
                    >
                      <Trash2 size={13} />
                      <span>Xóa ảnh</span>
                    </button>
                  )}
                </div>
                {evidenceImage ? (
                  <img
                    src={evidenceImage}
                    alt="Ảnh minh chứng giải trình công"
                    className="w-full max-h-40 object-cover rounded-xl border border-slate-300 dark:border-slate-600"
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <AppButton
                      type="button"
                      variant="secondary"
                      icon={Camera}
                      onClick={() => handlePickEvidenceSdk(["camera"])}
                      className="text-xs font-semibold"
                    >
                      📷 Chụp ảnh Camera
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="secondary"
                      icon={ImageIcon}
                      onClick={() => handlePickEvidenceSdk(["album"])}
                      className="text-xs font-semibold"
                    >
                      🖼️ Chọn từ thư viện
                    </AppButton>
                  </div>
                )}
                <input
                  ref={proofInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePickEvidence}
                  className="hidden"
                />
              </div>
            </div>
          ) : (
            <>
              {/* Chọn Khoảng ngày nghỉ dạng hàng ngang iOS gọn gàng */}
              <div className="divide-y divide-slate-200 dark:divide-slate-700/70 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <FormRow label="Từ ngày">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setStartDate(nextStart);
                      if (endDate < nextStart) setEndDate(nextStart);
                    }}
                    className="w-36 min-h-[44px] px-2.5 py-1.5 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:border-[#E11D48] dark:focus:border-rose-400"
                    required
                  />
                </FormRow>
                <FormRow label="Đến ngày">
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-36 min-h-[44px] px-2.5 py-1.5 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:border-[#E11D48] dark:focus:border-rose-400"
                    required
                  />
                </FormRow>
              </div>

              {/* BANNER THÔNG MINH: TỰ LOẠI TRỪ NGÀY LỄ */}
              {analysis.holidaysEncountered.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border-2 border-amber-300 dark:border-amber-700/80 text-amber-950 dark:text-amber-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-amber-900 dark:text-amber-200">
                    <Gift size={18} className="shrink-0" />
                    <span>Khoảng ngày này trùng với Ngày Lễ quy định</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-amber-900 dark:text-amber-200 font-medium space-y-1">
                    {analysis.holidaysEncountered.map((h, i) => (
                      <li key={i}>
                        Ngày <span className="font-bold">{h.date}</span>: {h.name} (Miễn trừ phép)
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    Theo Điều 112 BLLĐ, ngày nghỉ lễ được hưởng nguyên lương, không trừ vào quỹ phép năm.
                  </p>
                </div>
              )}

              {/* BANNER GỢI Ý NGÀY CẦU NỐI */}
              {analysis.bridgeSuggestions.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border-2 border-indigo-200 dark:border-indigo-700/80 text-indigo-950 dark:text-indigo-200 text-xs flex items-start gap-2.5">
                  <Sparkles size={18} className="text-indigo-600 dark:text-indigo-300 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-bold text-sm block mb-0.5">Gợi ý kỳ nghỉ liền kề</span>
                    <span className="text-xs text-indigo-900 dark:text-indigo-200">
                      {analysis.bridgeSuggestions[0].message} Bạn có thể sắp xếp công việc để có kỳ nghỉ dài.
                    </span>
                  </div>
                </div>
              )}

              {/* KHỐI TỔNG KẾT TÍNH TOÁN NGÀY PHÉP */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border-2 border-slate-200 dark:border-slate-700/80 space-y-2 text-sm">
                <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                  <span className="font-medium">Tổng số ngày theo lịch:</span>
                  <span className="font-bold text-slate-900 dark:text-white whitespace-nowrap">{analysis.totalCalendarDays} ngày</span>
                </div>
                {analysis.holidaysEncountered.length > 0 && (
                  <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-300 font-semibold">
                    <span>Ngày lễ được miễn trừ:</span>
                    <span className="font-bold whitespace-nowrap">-{analysis.holidaysEncountered.length} ngày</span>
                  </div>
                )}
                {analysis.weekendDaysEncountered.length > 0 && (
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-300 font-medium">
                    <span>Cuối tuần (Chủ nhật):</span>
                    <span className="font-semibold whitespace-nowrap">-{analysis.weekendDaysEncountered.length} ngày</span>
                  </div>
                )}
                <div className="pt-2 border-t-2 border-slate-200 dark:border-slate-700 flex justify-between items-center text-base font-bold text-slate-900 dark:text-white">
                  <span>Số ngày trừ phép thực tế:</span>
                  <span className="text-[#E11D48] dark:text-rose-400 font-bold whitespace-nowrap">
                    {requestType === "P" ? analysis.actualDeductedDays : 0} ngày
                  </span>
                </div>
                {requestType === "P" && (
                  <div className="pt-1 space-y-2">
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                      Quỹ phép năm còn lại: <span className="font-bold text-slate-900 dark:text-white">{availableLeaveDays} ngày</span>
                    </p>
                    {isExceedingBalance && (
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 space-y-2">
                        <p className="text-xs text-rose-700 dark:text-rose-200 font-semibold leading-relaxed">
                          {isOutOfLeave
                            ? "Quỹ phép năm của bạn đã hết (0 ngày còn lại). Hãy chuyển sang Nghỉ không lương (KP)."
                            : `Số ngày xin nghỉ (${analysis.actualDeductedDays} ngày) vượt quá phép năm còn lại (${availableLeaveDays} ngày).`}
                        </p>
                        <button
                          type="button"
                          onClick={() => setRequestType("KP")}
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs cursor-pointer transition whitespace-nowrap"
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
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1.5">
              Lý do cụ thể <span className="text-rose-600 dark:text-rose-400">*</span>
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
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-[#E11D48] dark:focus:border-rose-400 leading-relaxed"
            />
          </div>
        </form>
    </AppModal>
  );
}
