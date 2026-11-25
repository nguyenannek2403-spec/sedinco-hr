import React, { useState, useEffect, useMemo, useRef } from "react";
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
  Trash2,
  Loader2,
  Settings
} from "lucide-react";
import { safeGet, safePost, generateIdempotencyKey } from "../utils/api";
import { zaloMediaService } from "../services/zalo-media.service";
import { SDK_STATES, isZaloMiniAppRuntime, openZaloPermissionSettings } from "../services/zalo-sdk-core";
import { analyzeLeaveRequest, formatDateKey } from "../utils/holidayUtils";
import { CORRECTION_MODES, getRequestTypeLabel } from "../utils/viLabels";
import { formatViCurrency, formatViNumber, parseViNumberInput } from "../utils/viNumberFormat";
import { AppButton, AppModal, FormRow, SecureMediaPreview } from "./ui";

const LEAVE_TYPES = [
  { id: "P", label: "Nghỉ phép có lương (Tối đa 1 lượt/tháng)" },
  { id: "KP", label: "Nghỉ không lương (Việc riêng)" },
  { id: "Bổ sung công / Quên chấm giờ ra", label: "Giải trình Bổ sung công (Quên chấm / Đổi ca)" },
  { id: "OT", label: "Đăng ký Tăng ca (Làm thêm giờ)" },
  { id: "CONG_TAC", label: "Đi công tác / Ra ngoài công trình" },
  { id: "SALARY_ADVANCE", label: "Xin ứng lương (Tạm ứng trước kỳ)" },
  { id: "OM", label: "Nghỉ ốm đau (Hưởng chế độ BHXH)" }
];

const QUICK_ADVANCE_AMOUNTS = [500000, 1000000, 2000000, 5000000];

const formatVnd = (n) => formatViCurrency(n, true);

/**
 * Modal Tạo Đơn Xin Nghỉ / Tăng Ca / Bổ Sung Công / Xin Ứng Lương
 */
export default function SmartLeaveRequestModal({
  currentUser,
  holidaysList = [],
  existingRequests = [],
  leaveBalance = null,
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
  const [evidenceMeta, setEvidenceMeta] = useState({ mime: "", filename: "" });
  const [mediaUploadStatus, setMediaUploadStatus] = useState(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [reason, setReason] = useState(initialReason || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [monthBalance, setMonthBalance] = useState(null);

  const isSubmittingRef = useRef(false);
  const proofInputRef = useRef(null);
  const isSalaryAdvance = requestType === "SALARY_ADVANCE";
  const isOt = requestType === "OT";
  const isBusinessTrip = requestType === "CONG_TAC";
  const isCompensation =
    requestType === "Bổ sung công / Quên chấm giờ ra" ||
    requestType === "ATTENDANCE_COMPENSATION";
  const supportsEvidenceAttachment = !isSalaryAdvance;
  const mediaCategory = isCompensation
    ? (correctionMode === "SHIFT_CHANGE" ? "shift_change_evidence" : "attendance_adjustment")
    : isOt
      ? "overtime_evidence"
      : isBusinessTrip
        ? "business_trip_document"
        : requestType === "P" || requestType === "KP" || requestType === "OM"
          ? "leave_evidence"
          : "employee_attachment";
  const needsCheckIn = isCompensation && (correctionMode === "CHECK_IN" || correctionMode === "BOTH" || correctionMode === "SHIFT_CHANGE");
  const needsCheckOut = isCompensation && (correctionMode === "CHECK_OUT" || correctionMode === "BOTH" || correctionMode === "SHIFT_CHANGE");

  const [selYear, selMonth] = useMemo(() => {
    const parts = String(startDate || "").split("-").map(Number);
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && parts[1] >= 1 && parts[1] <= 12) {
      return [parts[0], parts[1]];
    }
    const n = new Date();
    return [n.getFullYear(), n.getMonth() + 1];
  }, [startDate]);

  useEffect(() => {
    let active = true;
    safeGet("/requests/leave-balance", { month: selMonth, year: selYear }, { cancelPrevious: false })
      .then((res) => {
        if (active && res?.success && res?.data) {
          setMonthBalance(res.data);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selMonth, selYear]);

  const effectiveMonthBalance = useMemo(() => {
    if (monthBalance && Number(monthBalance.month) === selMonth && Number(monthBalance.year) === selYear) {
      return monthBalance;
    }
    if (
      leaveBalance &&
      typeof leaveBalance === "object" &&
      Number(leaveBalance.month) === selMonth &&
      Number(leaveBalance.year) === selYear
    ) {
      return leaveBalance;
    }
    return null;
  }, [monthBalance, leaveBalance, selMonth, selYear]);

  const monthlyQuotaLimit = Number(
    effectiveMonthBalance?.quota ?? (leaveBalance && typeof leaveBalance === "object" ? leaveBalance.quota : 1) ?? 1
  );

  const existingMonthPaidCount = useMemo(() => {
    return (existingRequests || []).filter((req) => {
      const st = String(req.status || "").toLowerCase();
      if (st === "rejected" || st === "cancelled") return false;
      const rawType = String(req.request_type || req.type || "").trim().toLowerCase();
      const isPaid =
        (rawType === "p" ||
          rawType === "paid_leave" ||
          rawType === "nghi_phep" ||
          rawType === "leave" ||
          rawType === "leave_annual" ||
          rawType === "0.5" ||
          rawType.includes("phép") ||
          rawType.includes("có lương")) &&
        !rawType.includes("không lương") &&
        !rawType.includes("unpaid") &&
        rawType !== "kp";
      if (!isPaid) return false;
      const iso = formatDateKey(req.request_date || req.start_date);
      if (!iso) return false;
      const [y, m] = iso.split("-").map(Number);
      return y === selYear && m === selMonth;
    }).length;
  }, [existingRequests, selMonth, selYear]);

  const availableLeaveDays = useMemo(() => {
    if (effectiveMonthBalance) {
      return Math.max(0, Number(effectiveMonthBalance.remaining ?? 0));
    }
    if (typeof leaveBalance === "number" && Number.isFinite(leaveBalance)) {
      return Math.max(0, Math.min(monthlyQuotaLimit, leaveBalance) - existingMonthPaidCount);
    }
    return Math.max(0, monthlyQuotaLimit - existingMonthPaidCount);
  }, [effectiveMonthBalance, leaveBalance, monthlyQuotaLimit, existingMonthPaidCount]);

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

  // Cảnh báo hết/vượt lượt nghỉ có lương trong tháng (tối đa 1 lượt/tháng)
  const isMonthOutOfLeave = availableLeaveDays <= 0;
  const isOutOfLeave = requestType === "P" && isMonthOutOfLeave;
  const isExceedingBalance =
    requestType === "P" && (isMonthOutOfLeave || analysis.actualDeductedDays > availableLeaveDays);

  const parsedAdvanceNum = Math.max(0, Math.round(parseViNumberInput(advanceAmount)));

  // Xử lý chọn & xác thực ảnh / PDF minh chứng qua Backend (/api/media/upload -> Cloudinary / Protected Access)
  const handlePickEvidence = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage("");
    setMediaUploadStatus(null);
    setIsUploadingMedia(true);
    try {
      const res = await zaloMediaService.uploadBrowserEvidenceFile(file, {
        category: mediaCategory,
        referenceDate: startDate,
        allowPdf: true
      });
      if (res.ok && res.data?.url) {
        setEvidenceImage(res.data.url);
        setEvidenceMeta({
          mime: res.data.mime || file.type || "",
          filename: res.data.original_filename || file.name || ""
        });
        setMediaUploadStatus({
          state: "success",
          message: res.message || "Đã đính kèm tài liệu minh chứng an toàn."
        });
      } else {
        setErrorMessage(res.message || "Không thể xử lý tệp đính kèm.");
        setMediaUploadStatus({ state: res.state, message: res.message });
      }
    } catch (err) {
      setErrorMessage(err.message || "Không thể xử lý tệp đính kèm.");
    } finally {
      setIsUploadingMedia(false);
      e.target.value = "";
    }
  };

  const handlePickEvidenceSdk = async (sourceType) => {
    setErrorMessage("");
    setMediaUploadStatus(null);
    const preferredSource = sourceType?.[0] === "camera" ? "camera" : "album";

    if (isZaloMiniAppRuntime()) {
      setIsUploadingMedia(true);
      try {
        const res = await zaloMediaService.pickZaloMediaAndUpload({
          preferredSource,
          category: mediaCategory,
          referenceDate: startDate
        });
        if (res.ok && res.data?.url) {
          setEvidenceImage(res.data.url);
          setMediaUploadStatus({
            state: "success",
            message: res.message || "Đã đính kèm ảnh minh chứng an toàn."
          });
          return;
        }
        if (
          res.state === SDK_STATES.PERMISSION_DENIED ||
          res.state === SDK_STATES.PENDING_ZALO_APPROVAL
        ) {
          setMediaUploadStatus({
            state: res.state,
            message: res.message,
            canOpenSettings: res.canOpenSettings
          });
          return;
        }
      } finally {
        setIsUploadingMedia(false);
      }
    }

    if (proofInputRef.current) {
      if (preferredSource === "camera") {
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

    if (isExceedingBalance) {
      const msg = isOutOfLeave
        ? `Bạn đã dùng hết ${monthlyQuotaLimit} lượt nghỉ có lương trong tháng ${selMonth}/${selYear}. Vui lòng chọn Nghỉ không lương nếu cần nghỉ thêm.`
        : `Định mức phép có lương tối đa ${monthlyQuotaLimit} lượt/tháng (${selMonth}/${selYear}). Số ngày xin nghỉ (${analysis.actualDeductedDays}) vượt quá hạn mức còn lại (${availableLeaveDays}).`;
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
        calculated_days: isSalaryAdvance || isCompensation || isOt || isBusinessTrip ? 0 : analysis.actualDeductedDays,
        evidence_image: supportsEvidenceAttachment ? (evidenceImage || null) : null,
        ...(isCompensation
          ? {
              correction_mode: correctionMode,
              check_in_time: needsCheckIn ? checkInTime : null,
              check_out_time: needsCheckOut ? checkOutTime : null
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
      : isBusinessTrip
        ? "Đăng ký Đi công tác"
        : "Tạo đơn xin phép / tăng ca";
  const modalSubtitle = isSalaryAdvance
    ? "Khấu trừ tự động vào kỳ lương tháng"
    : isCompensation
      ? "Quên chấm vào/ra hoặc đổi ca làm việc"
      : isBusinessTrip
        ? "Công tác ngoài công trình • Đính kèm giấy đi đường / minh chứng"
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
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Loại đơn / chế độ
              </label>
              <span
                data-testid="modal-monthly-leave-quota"
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap ${
                  isMonthOutOfLeave
                    ? "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-700 text-[#B80035] dark:text-rose-300"
                    : "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-700 text-[#16A34A] dark:text-emerald-300"
                }`}
              >
                Phép có lương T{selMonth}/{selYear}: {availableLeaveDays}/{monthlyQuotaLimit} lượt
              </span>
            </div>
            <select
              value={requestType}
              onChange={(e) => {
                setErrorMessage("");
                setRequestType(e.target.value);
              }}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 font-semibold bg-white dark:bg-slate-800"
            >
              {LEAVE_TYPES.map((t) => {
                const lockedPaid = t.id === "P" && isMonthOutOfLeave;
                return (
                  <option key={t.id} value={t.id} disabled={lockedPaid && requestType !== "P"}>
                    {lockedPaid ? `Nghỉ phép có lương (Hết lượt T${selMonth})` : t.label}
                  </option>
                );
              })}
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
                    Theo Điều 112 BLLĐ, ngày nghỉ lễ được hưởng nguyên lương, không trừ vào lượt phép tháng.
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

              {/* KHỐI TỔNG KẾT TÍNH TOÁN NGÀY PHÉP — STITCH PERFORATED VOUCHER CARD */}
              <div className="p-4 rounded-2xl bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 space-y-2 text-sm">
                <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                  <span className="font-medium">Tổng số ngày theo lịch:</span>
                  <span className="font-bold text-[#111C2D] dark:text-white whitespace-nowrap">{analysis.totalCalendarDays} ngày</span>
                </div>
                {analysis.holidaysEncountered.length > 0 && (
                  <div className="flex justify-between items-center text-[#16A34A] dark:text-emerald-300 font-semibold">
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
                <div className="sedinco-ticket-cutout">
                  <div className="w-full border-t-2 border-dashed border-slate-200 dark:border-slate-700" />
                </div>
                <div className="flex justify-between items-center text-base font-extrabold text-[#111C2D] dark:text-white">
                  <span>Số ngày nghỉ có lương dự kiến:</span>
                  <span className="text-[#E11D48] dark:text-rose-400 font-extrabold whitespace-nowrap">
                    {requestType === "P" ? analysis.actualDeductedDays : 0} ngày
                  </span>
                </div>
                {requestType === "P" && (
                  <div className="pt-1 space-y-2">
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                      Phép có lương Tháng {selMonth}/{selYear} còn lại:{" "}
                      <span className="font-bold text-slate-900 dark:text-white">
                        {availableLeaveDays}/{monthlyQuotaLimit} lượt
                      </span>
                    </p>
                    {isExceedingBalance && (
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 space-y-2">
                        <p className="text-xs text-rose-700 dark:text-rose-200 font-semibold leading-relaxed">
                          {isOutOfLeave
                            ? `Bạn đã dùng hết ${monthlyQuotaLimit} lượt nghỉ có lương trong tháng ${selMonth}/${selYear}. Vui lòng chọn Nghỉ không lương nếu cần nghỉ thêm.`
                            : `Định mức nghỉ có lương tối đa ${monthlyQuotaLimit} lượt/tháng (${selMonth}/${selYear}). Số ngày xin nghỉ (${analysis.actualDeductedDays}) vượt quá lượt còn lại (${availableLeaveDays}).`}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMessage("");
                            setRequestType("KP");
                          }}
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

          {/* Smart Media: Đính kèm ảnh minh chứng cho Đơn xin nghỉ, Điều chỉnh công, Đơn công tác & Hồ sơ minh chứng */}
          {supportsEvidenceAttachment && (
            <div
              data-testid="smart-media-evidence-box"
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Ảnh minh chứng / Giấy tờ đính kèm (tùy chọn)
                </span>
                {evidenceImage && (
                  <button
                    type="button"
                    onClick={() => {
                      setEvidenceImage("");
                      setEvidenceMeta({ mime: "", filename: "" });
                      setMediaUploadStatus(null);
                    }}
                    className="text-xs font-semibold text-rose-600 dark:text-rose-300 flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Xóa tệp</span>
                  </button>
                )}
              </div>

              {isUploadingMedia ? (
                <div className="py-3 flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <Loader2 className="w-4 h-4 animate-spin text-[#E11D48]" />
                  <span>Đang kiểm tra &amp; tải tệp minh chứng an toàn...</span>
                </div>
              ) : evidenceImage ? (
                <SecureMediaPreview
                  src={evidenceImage}
                  alt="Tài liệu minh chứng đơn từ"
                  mimeType={evidenceMeta.mime}
                  filename={evidenceMeta.filename}
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
                    Chụp ảnh Camera
                  </AppButton>
                  <AppButton
                    type="button"
                    variant="secondary"
                    icon={ImageIcon}
                    onClick={() => handlePickEvidenceSdk(["album"])}
                    className="text-xs font-semibold"
                  >
                    Chọn từ thư viện
                  </AppButton>
                </div>
              )}

              {mediaUploadStatus?.message && (
                <div
                  className={`p-2.5 rounded-xl text-xs border space-y-1.5 ${
                    mediaUploadStatus.state === "success"
                      ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-semibold"
                      : "bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                  }`}
                >
                  <p>{mediaUploadStatus.message}</p>
                  {mediaUploadStatus.canOpenSettings && isZaloMiniAppRuntime() && (
                    <button
                      type="button"
                      onClick={() => openZaloPermissionSettings()}
                      className="inline-flex items-center gap-1 font-bold underline text-[#0051CA] dark:text-blue-300 cursor-pointer"
                    >
                      <Settings size={12} />
                      <span>Mở cài đặt quyền Zalo</span>
                    </button>
                  )}
                </div>
              )}

              <input
                ref={proofInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handlePickEvidence}
                className="hidden"
              />
            </div>
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
