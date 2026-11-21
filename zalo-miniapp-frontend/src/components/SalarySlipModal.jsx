import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Video,
  Image as ImageIcon,
  Send,
  ShieldCheck,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  SlidersHorizontal
} from "lucide-react";
import { safeGet, safePost, generateIdempotencyKey } from "../utils/api";
import { exportEmployeeSalaryExcel } from "../utils/salaryExcelExport";
import { compressAndResizeImage, pickCompressedEvidencePhoto } from "../utils/imageHelper";
import { formatViCurrency, formatViWorkday, formatViNumber } from "../utils/viNumberFormat";
import {
  getMonthlyStandardWorkdays,
  getVietnamTodayIso,
  normalizePureIsoDate,
  resolveHeatmapCellMeta
} from "../utils/workdayUtils";
import { AppButton, AppModal, SkeletonList, UserAvatar } from "./ui";
import PayslipActionFooter from "./PayslipActionFooter";
import {
  formatDayWithWeekday,
  formatFullDateWithWeekday,
  resolveDailyStatusLabelVi,
  getPositiveAllowances,
  resolveLogNote
} from "../utils/payslipHelpers";

const VI_SHORT_WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function resolveCompactDailyStatus(row) {
  if (!row) return "Chưa phát sinh";
  const st = String(row.status || "").trim().toUpperCase();
  if (st === "L" || st === "HOLIDAY") return "Nghỉ lễ";
  if (st === "P" || st === "PAID_LEAVE") return "Nghỉ phép";
  if (row.isSunday && row.credit <= 0 && row.otHours <= 0) return "Chủ nhật";
  if (row.isFutureOrTodayEmpty) return "Chưa phát sinh";
  if (row.credit >= 1) return "Đủ 1 công";
  if (row.credit === 0.5) return "Nửa công 0,5";
  if (row.otHours > 0) return "Tăng ca OT";
  return "Nghỉ KP";
}

function getDailyDotClass(colorName) {
  if (colorName === "green") return "bg-emerald-500";
  if (colorName === "blue") return "bg-sky-500";
  if (colorName === "red") return "bg-rose-500";
  return "bg-slate-400 dark:bg-slate-500";
}

/**
 * SalarySlipModal V50 — Single-Layer Full-Screen Payslip Sheet (100dvh)
 * - 1 màn hình toàn diện duy nhất (không chồng modal) + 1 vùng cuộn mượt
 * - Sticky Header 56px: [← Đóng] | Phiếu lương T[MM]/[YYYY] | [📥 Excel]
 * - 2 Pill Tabs tức thì (h-42px): [Tổng hợp lương] & [Thu nhập từng ngày]
 * - Sticky Bottom Bar: tối đa 2 nút cân đối chuẩn safe-area
 */
export default function SalarySlipModal({
  payrollItem = null,
  employee = null,
  targetMaNv = null,
  month,
  year,
  isAdminOrAccountant = false,
  isAdminUser = false,
  employeeList = [],
  onSelectEmployee = null,
  canAdjust = false,
  canManagePayment = false,
  onOpenAdjustment = null,
  onOpenTransfer = null,
  onSendReport = null,
  refreshKey = 0,
  showToast,
  onStatusUpdated,
  onClose
}) {
  const initialItem = payrollItem || employee || null;
  const now = new Date();
  const initialMonth = Number(month || initialItem?.thang || now.getMonth() + 1);
  const initialYear = Number(year || initialItem?.nam || now.getFullYear());
  const propMaNv = targetMaNv || initialItem?.ma_nv || initialItem?.id_nhan_vien || "";

  const [activeMaNv, setActiveMaNv] = useState(propMaNv);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [loadedItem, setLoadedItem] = useState(initialItem);
  const [loadingPeriod, setLoadingPeriod] = useState(!initialItem);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("summary"); // 'summary' | 'daily'
  const [expandedDayIso, setExpandedDayIso] = useState(null);

  const [confirmStatus, setConfirmStatus] = useState(initialItem?.salary_confirm_status || "PENDING");
  const [disputeStatus, setDisputeStatus] = useState(
    initialItem?.dispute_status ||
      (initialItem?.salary_confirm_status === "DISPUTED" || initialItem?.payout_status === "DISPUTED" ? "OPEN" : null)
  );
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState(initialItem?.dispute_reason || "");
  const [evidenceMedia, setEvidenceMedia] = useState(initialItem?.dispute_evidence_media || "");
  const [mediaNotice, setMediaNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);

  const [adminResponse, setAdminResponse] = useState(initialItem?.admin_response || "");
  const [resolving, setResolving] = useState(false);

  const fileInputRef = useRef(null);
  const disputeSectionRef = useRef(null);
  const submittingRef = useRef(false);
  const resolvingRef = useRef(false);
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    setActiveMaNv(propMaNv);
  }, [propMaNv]);

  useEffect(() => {
    if (initialItem) {
      setLoadedItem(initialItem);
      setConfirmStatus(initialItem.salary_confirm_status || "PENDING");
      setDisputeStatus(
        initialItem.dispute_status ||
          (initialItem.salary_confirm_status === "DISPUTED" || initialItem.payout_status === "DISPUTED" ? "OPEN" : null)
      );
      setDisputeReason(initialItem.dispute_reason || "");
      setEvidenceMedia(initialItem.dispute_evidence_media || "");
      setAdminResponse(initialItem.admin_response || "");
    }
  }, [initialItem]);

  const fetchPeriodSlip = useCallback(async (m, y, overrideMaNv = null) => {
    const seq = ++fetchSeqRef.current;
    const empCode = overrideMaNv || activeMaNv || propMaNv;
    setLoadingPeriod(true);
    setLoadError("");
    try {
      const endpoint = isAdminOrAccountant && empCode
        ? `/payroll/employee/${encodeURIComponent(empCode)}`
        : "/payroll/me";
      const res = await safeGet(endpoint, { month: m, year: y }, { cancelPrevious: false });
      if (seq !== fetchSeqRef.current) return;
      if (res?.success && res.data) {
        setLoadedItem(res.data);
        setConfirmStatus(res.data.salary_confirm_status || "PENDING");
        setDisputeStatus(
          res.data.dispute_status ||
            (res.data.salary_confirm_status === "DISPUTED" || res.data.payout_status === "DISPUTED" ? "OPEN" : null)
        );
        setDisputeReason(res.data.dispute_reason || "");
        setEvidenceMedia(res.data.dispute_evidence_media || "");
        setAdminResponse(res.data.admin_response || "");
        setShowDisputeForm(false);
      } else {
        setLoadError(res?.message || `Không có dữ liệu bảng lương Tháng ${m}/${y}.`);
      }
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setLoadError(err?.message || `Không thể tải phiếu lương Tháng ${m}/${y}.`);
    } finally {
      if (seq === fetchSeqRef.current) setLoadingPeriod(false);
    }
  }, [isAdminOrAccountant, activeMaNv, propMaNv]);

  useEffect(() => {
    const currentItemCode = loadedItem?.ma_nv || loadedItem?.id_nhan_vien || "";
    const matchesInitial =
      Boolean(initialItem) &&
      activeMaNv === propMaNv &&
      currentItemCode === activeMaNv &&
      Number(selectedMonth) === Number(initialMonth) &&
      Number(selectedYear) === Number(initialYear) &&
      Array.isArray(initialItem.daily_logs) &&
      Array.isArray(initialItem.allowances);
    if (!matchesInitial) {
      fetchPeriodSlip(selectedMonth, selectedYear, activeMaNv);
    }
  }, [selectedMonth, selectedYear, activeMaNv, propMaNv, initialItem, initialMonth, initialYear, fetchPeriodSlip]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setExpandedDayIso(null);
  }, [selectedMonth, selectedYear, activeMaNv]);

  useEffect(() => {
    if (refreshKey > 0) {
      fetchPeriodSlip(selectedMonth, selectedYear, activeMaNv);
    }
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const item = loadedItem || initialItem;
  const thang = Number(selectedMonth || item?.thang || now.getMonth() + 1);
  const nam = Number(selectedYear || item?.nam || now.getFullYear());
  const maNv = activeMaNv || item?.ma_nv || item?.id_nhan_vien || "NV";
  const monthLabelPadded = String(thang).padStart(2, "0");

  const currentEmpIdx = useMemo(() => {
    if (!Array.isArray(employeeList) || employeeList.length <= 1) return -1;
    return employeeList.findIndex((e) => (e.ma_nv || e.id_nhan_vien) === maNv);
  }, [employeeList, maNv]);

  const handleStepEmployee = (delta) => {
    if (!Array.isArray(employeeList) || employeeList.length <= 1 || currentEmpIdx < 0) return;
    const nextIdx = (currentEmpIdx + delta + employeeList.length) % employeeList.length;
    const nextEmp = employeeList[nextIdx];
    const nextCode = nextEmp?.ma_nv || nextEmp?.id_nhan_vien;
    if (!nextCode) return;
    setActiveMaNv(nextCode);
    setLoadedItem(nextEmp);
    if (typeof onSelectEmployee === "function") {
      onSelectEmployee(nextEmp);
    }
  };

  const notify = (msg, type = "info") => {
    if (showToast) showToast(msg, type);
  };

  const formatCurrency = (val) => formatViCurrency(val, true);

  const positiveAllowances = useMemo(() => getPositiveAllowances(item), [item]);
  const totalPositiveAllowance = Number(item?.totalAllowance ?? item?.total_allowance ?? 0);
  const showAllowancesBlock = positiveAllowances.length > 0 && totalPositiveAllowance > 0;
  const stdDays = Number(item?.standardWorkDays || item?.standardDays || getMonthlyStandardWorkdays(thang, nam));
  const unitDailyWage = Number(item?.unitDailyWage) || (stdDays > 0 ? Math.round((Number(item?.baseSalary) || 0) / stdDays) : 0);

  const yearOptions = useMemo(() => {
    const curY = new Date().getFullYear();
    const base = new Set([curY - 1, curY, curY + 1, initialYear]);
    return Array.from(base).sort((a, b) => a - b);
  }, [initialYear]);

  const displayedDailyRows = useMemo(() => {
    const rawLogs = Array.isArray(item?.daily_logs) ? item.daily_logs : [];
    const byDate = {};
    rawLogs.forEach((log) => {
      const iso = normalizePureIsoDate(log.record_date_iso || log.record_date || log.date);
      if (iso) byDate[iso] = log;
    });

    const todayIso = getVietnamTodayIso();
    const daysInMonth = new Date(Date.UTC(nam, thang, 0)).getUTCDate();
    const rows = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${nam}-${String(thang).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const log = byDate[iso] || null;
      const utcDow = new Date(Date.UTC(nam, thang - 1, d)).getUTCDay();
      const isSunday = utcDow === 0;
      const weekdayShort = VI_SHORT_WEEKDAYS[utcDow] || "";
      const isFutureOrTodayEmpty = !log && !isSunday && Boolean(todayIso && iso >= todayIso);
      const meta = resolveHeatmapCellMeta({ log, isoDate: iso, todayIso, isSunday });
      const note = log ? resolveLogNote(log) : meta.badgeText;
      const otHours = Number(log?.ot_hours_applied ?? log?.ot_hours) || 0;
      const { ddmmyyyy, weekdayFull } = formatFullDateWithWeekday(iso);
      const statusLabelVi = resolveDailyStatusLabelVi({
        log,
        credit: meta.credit,
        isSunday,
        isFutureOrTodayEmpty
      });

      const hasBackendBase = log && log.daily_base_amount !== undefined && log.daily_base_amount !== null;
      const dailyBaseAmount = hasBackendBase
        ? Number(log.daily_base_amount) || 0
        : meta.credit > 0
          ? Math.round(unitDailyWage * meta.credit)
          : 0;
      const hasBackendOt = log && log.daily_ot_amount !== undefined && log.daily_ot_amount !== null;
      const dailyOtAmount = hasBackendOt ? Number(log.daily_ot_amount) || 0 : 0;
      const dailyPenaltyAmount = Number(log?.daily_penalty_amount) || 0;
      const dailyPenaltyReason = log?.daily_penalty_reason || null;
      const dailyEarnedAmount =
        log && log.daily_earned_amount !== undefined && log.daily_earned_amount !== null
          ? Number(log.daily_earned_amount) || 0
          : dailyBaseAmount + dailyOtAmount - dailyPenaltyAmount;

      const checkWindow =
        log?.check_in_time || log?.check_out_time
          ? `${log?.check_in_time ? String(log.check_in_time).slice(0, 5) : "--:--"} – ${
              log?.check_out_time ? String(log.check_out_time).slice(0, 5) : "--:--"
            }`
          : null;

      const compactStatus = resolveCompactDailyStatus({
        status: log ? (log.status || "0") : isSunday ? "CN" : isFutureOrTodayEmpty ? "" : "KL",
        credit: meta.credit,
        otHours,
        isSunday,
        isFutureOrTodayEmpty
      });

      const hasDetails = Boolean(
        checkWindow ||
          otHours > 0 ||
          dailyOtAmount > 0 ||
          dailyPenaltyAmount > 0 ||
          log?.holiday_name ||
          log?.location_name ||
          log?.proxy_by ||
          (log && note && !/đủ công/i.test(note))
      );

      rows.push({
        key: iso,
        iso,
        day: d,
        shortDate: `${String(d).padStart(2, "0")}/${String(thang).padStart(2, "0")}`,
        weekdayShort,
        fullDate: ddmmyyyy,
        weekdayFull,
        dateLabel: formatDayWithWeekday(iso, log?.date_label),
        log,
        note,
        credit: meta.credit,
        otHours,
        status: log ? (log.status || "0") : isSunday ? "CN" : isFutureOrTodayEmpty ? "" : "KL",
        compactStatus,
        statusLabelVi,
        dailyBaseAmount,
        dailyOtAmount,
        dailyPenaltyAmount,
        dailyPenaltyReason,
        dailyEarnedAmount,
        isSunday,
        isFutureOrTodayEmpty,
        colorName: meta.colorName,
        checkWindow,
        hasDetails
      });
    }
    return rows;
  }, [item, thang, nam, unitDailyWage]);

  const dailyLedgerTotals = useMemo(
    () =>
      displayedDailyRows.reduce(
        (acc, row) => ({
          base: acc.base + (row.dailyBaseAmount || 0),
          ot: acc.ot + (row.dailyOtAmount || 0),
          penalty: acc.penalty + (row.dailyPenaltyAmount || 0),
          earned: acc.earned + (row.dailyEarnedAmount || 0)
        }),
        { base: 0, ot: 0, penalty: 0, earned: 0 }
      ),
    [displayedDailyRows]
  );

  const handleSelectEvidenceFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.type.startsWith("image/")) {
        setMediaNotice("Đang nén ảnh minh chứng (< 50KB)...");
        const rawDataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = () => reject(new Error("Không đọc được file ảnh"));
          r.readAsDataURL(file);
        });
        const compressedBase64 = await compressAndResizeImage(rawDataUrl, 640, 640, 0.55);
        const sizeKB = Math.round((compressedBase64.length * 3) / 4 / 1024);
        setEvidenceMedia(compressedBase64);
        setMediaNotice(`Đã đính kèm ảnh nén (${sizeKB} KB)`);
      } else if (file.type.startsWith("video/")) {
        const sizeKB = Math.round(file.size / 1024);
        if (sizeKB > 800) {
          notify(`Video quá nặng (${sizeKB}KB). Vui lòng chọn video ngắn dưới 800KB!`, "error");
          e.target.value = "";
          return;
        }
        setMediaNotice("Đang nạp video ngắn...");
        const reader = new FileReader();
        reader.onload = () => {
          setEvidenceMedia(reader.result);
          setMediaNotice(`Đã đính kèm video ngắn (${sizeKB} KB)`);
        };
        reader.readAsDataURL(file);
      } else {
        notify("Chỉ hỗ trợ file Hình ảnh hoặc Video ngắn.", "warning");
      }
    } catch (err) {
      notify("Lỗi xử lý tệp đính kèm: " + err.message, "error");
    }
  };

  const handlePickDisputeMedia = async (sourceType) => {
    const res = await pickCompressedEvidencePhoto({
      sourceType,
      cameraType: "back",
      maxWidth: 640,
      maxHeight: 640,
      quality: 0.55
    });
    if (res?.success && res?.photoUrl) {
      const sizeKB = Math.round((res.photoUrl.length * 3) / 4 / 1024);
      setEvidenceMedia(res.photoUrl);
      setMediaNotice(`Đã đính kèm ảnh (${sizeKB} KB)`);
      return;
    }
    if (fileInputRef.current) {
      if (sourceType?.[0] === "camera") {
        fileInputRef.current.setAttribute("accept", "image/*");
        fileInputRef.current.setAttribute("capture", "environment");
      } else {
        fileInputRef.current.setAttribute("accept", "image/*,video/*");
        fileInputRef.current.removeAttribute("capture");
      }
      fileInputRef.current.click();
    }
  };

  const handleConfirmSalary = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await safePost(
        "/payroll/confirm",
        {
          month: thang,
          year: nam,
          action: "CONFIRM_REPORT",
          status: "CONFIRMED"
        },
        { idempotencyKey: generateIdempotencyKey("pay_confirm") }
      );
      if (res?.success) {
        setConfirmStatus("CONFIRMED");
        setLoadedItem((prev) =>
          prev
            ? {
                ...prev,
                salary_confirm_status: "CONFIRMED",
                payout_status:
                  prev.payout_status === "RECEIVED"
                    ? "RECEIVED"
                    : prev.payout_status === "PAID"
                      ? "PAID"
                      : "CONFIRMED"
              }
            : prev
        );
        setShowDisputeForm(false);
        notify("Đã xác nhận đã đọc báo cáo bảng lương!", "success");
        if (onStatusUpdated) onStatusUpdated("CONFIRMED");
      } else {
        notify(res?.message || "Lỗi xác nhận lương", "error");
      }
    } catch (err) {
      notify(err.message || "Không thể kết nối máy chủ", "error");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleConfirmReceived = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await safePost(
        "/payroll/confirm",
        {
          month: thang,
          year: nam,
          action: "CONFIRM_RECEIVED",
          status: "RECEIVED"
        },
        { idempotencyKey: generateIdempotencyKey("pay_received") }
      );
      if (res?.success) {
        setConfirmStatus("CONFIRMED");
        setLoadedItem((prev) =>
          prev
            ? {
                ...prev,
                salary_confirm_status: "CONFIRMED",
                payout_status: "RECEIVED",
                received_at: res.received_at || new Date().toISOString(),
                received_at_vn: res.received_at_vn || prev.received_at_vn
              }
            : prev
        );
        setShowDisputeForm(false);
        notify("Đã xác nhận nhận đủ lương thành công!", "success");
        if (onStatusUpdated) onStatusUpdated("RECEIVED");
      } else {
        notify(res?.message || "Lỗi xác nhận đã nhận lương", "error");
      }
    } catch (err) {
      notify(err.message || "Không thể kết nối máy chủ", "error");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleToggleDispute = () => {
    setActiveTab("summary");
    setShowDisputeForm((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          disputeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 120);
      }
      return next;
    });
  };

  const handleSubmitDispute = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!disputeReason.trim()) {
      notify("Vui lòng nhập rõ lý do sai lệch lương/công.", "warning");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await safePost(
        "/payroll/confirm",
        {
          month: thang,
          year: nam,
          action: "DISPUTE",
          status: "DISPUTED",
          note: disputeReason.trim(),
          dispute_reason: disputeReason.trim(),
          dispute_evidence_media: evidenceMedia || null
        },
        { idempotencyKey: generateIdempotencyKey("pay_dispute") }
      );
      if (res?.success) {
        setConfirmStatus("DISPUTED");
        setDisputeStatus("OPEN");
        setLoadedItem((prev) =>
          prev
            ? {
                ...prev,
                salary_confirm_status: "DISPUTED",
                dispute_status: "OPEN",
                payout_status: prev.payout_status === "PAID" ? "PAID" : "DISPUTED",
                dispute_reason: disputeReason.trim(),
                dispute_note: disputeReason.trim()
              }
            : prev
        );
        setShowDisputeForm(false);
        notify("Đã gửi báo cáo sai lương kèm minh chứng tới Admin & Kế toán!", "success");
        if (onStatusUpdated) onStatusUpdated("DISPUTED");
      } else {
        notify(res?.message || "Gửi khiếu nại thất bại", "error");
      }
    } catch (err) {
      notify(err.message || "Lỗi mạng khi gửi khiếu nại", "error");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleResolveDispute = async (newStatus = "RESOLVED") => {
    if (resolvingRef.current) return;
    const isKeepingOpen = newStatus === "DISPUTED";
    const resolvedNoteText = adminResponse.trim() || "Quản trị viên đã kiểm tra và đánh dấu đã giải quyết";
    if (isKeepingOpen && !adminResponse.trim()) {
      notify("Vui lòng nhập nội dung phản hồi giải quyết cho nhân viên.", "warning");
      return;
    }
    resolvingRef.current = true;
    setResolving(true);
    try {
      const res = await safePost(
        "/payroll/resolve-dispute",
        {
          ma_nv: maNv,
          month: thang,
          year: nam,
          admin_response: resolvedNoteText,
          status: newStatus
        },
        { idempotencyKey: generateIdempotencyKey("pay_resolve") }
      );
      if (res?.success) {
        const nextConfirm = isKeepingOpen ? "DISPUTED" : (res.salary_confirm_status || "CONFIRMED");
        const nextDispute = isKeepingOpen ? "OPEN" : "RESOLVED";
        setConfirmStatus(nextConfirm);
        setDisputeStatus(nextDispute);
        if (!isKeepingOpen) {
          setDisputeReason("");
          setEvidenceMedia("");
          setAdminResponse("");
        }
        setLoadedItem((prev) =>
          prev
            ? {
                ...prev,
                salary_confirm_status: nextConfirm,
                dispute_status: nextDispute,
                payout_status:
                  prev.payout_status === "PAID" || prev.employee_payment_status === "PAID"
                    ? "PAID"
                    : isKeepingOpen
                      ? "DISPUTED"
                      : nextConfirm,
                dispute_reason: isKeepingOpen ? prev.dispute_reason : null,
                dispute_note: isKeepingOpen ? prev.dispute_note : null,
                dispute_evidence_media: isKeepingOpen ? prev.dispute_evidence_media : null,
                admin_response: isKeepingOpen ? resolvedNoteText : null
              }
            : prev
        );
        notify(
          isKeepingOpen
            ? "Đã cập nhật phản hồi xử lý khiếu nại lương!"
            : "Đã giải quyết và đóng phản ánh sai lệch lương/công!",
          "success"
        );
        if (onStatusUpdated) onStatusUpdated(isKeepingOpen ? "DISPUTED" : "RESOLVED");
      } else {
        notify(res?.message || "Lỗi cập nhật phản hồi", "error");
      }
    } catch (err) {
      notify(err.message || "Lỗi kết nối máy chủ", "error");
    } finally {
      resolvingRef.current = false;
      setResolving(false);
    }
  };

  const handleSendReportAction = async (payload) => {
    if (typeof onSendReport === "function") {
      setSendingReport(true);
      try {
        await onSendReport(payload);
      } finally {
        setSendingReport(false);
      }
      return;
    }
    if (!maNv || sendingReport) return;
    setSendingReport(true);
    try {
      const res = await safePost("/payroll/send-report", {
        month: thang,
        year: nam,
        ma_nv: maNv
      });
      if (res?.success) {
        setLoadedItem((prev) =>
          prev
            ? {
                ...prev,
                payout_status: prev.payout_status === "PAID" ? "PAID" : "REPORT_SENT",
                salary_confirm_status: prev.payout_status === "PAID" ? prev.salary_confirm_status : "PENDING"
              }
            : prev
        );
        notify(res.message || `Đã gửi báo cáo lương cho ${item?.ho_ten || maNv}!`, "success");
        if (onStatusUpdated) onStatusUpdated("REPORT_SENT");
      } else {
        notify(res?.message || "Không thể gửi báo cáo lương.", "error");
      }
    } catch (err) {
      notify(err?.message || "Lỗi kết nối khi gửi báo cáo lương.", "error");
    } finally {
      setSendingReport(false);
    }
  };

  const handleExportSingleSlipExcel = async () => {
    if (!item) return;
    try {
      const { filename } = await exportEmployeeSalaryExcel(item, {
        month: thang,
        year: nam,
        dailyRows: displayedDailyRows
      });
      notify(`Đã tải xuống file Excel phiếu lương ${filename}!`, "success");
    } catch (err) {
      notify(err?.message || "Không thể xuất file Excel phiếu lương lúc này!", "error");
    }
  };

  const isEmployeePaid = Boolean(
    item &&
      (item.payout_status === "PAID" ||
        item.payout_status === "RECEIVED" ||
        item.employee_payment_status === "PAID" ||
        item.payment_status === "PAID")
  );
  const isLockedOrPaid = Boolean(
    item && (isEmployeePaid || item.payroll_period_status === "APPROVED" || item.period_locked)
  );

  const payoutStatusBadge = (() => {
    if (!item) return null;
    if (item.payout_status === "RECEIVED" || Boolean(item.received_at)) {
      return {
        label: "💰 Đã nhận đủ lương",
        cls: "bg-emerald-100 dark:bg-emerald-950/70 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200"
      };
    }
    if (isEmployeePaid) {
      return {
        label: "💸 Đã chuyển khoản",
        cls: "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200"
      };
    }
    if (disputeStatus !== "RESOLVED" && confirmStatus === "DISPUTED") {
      return {
        label: "⚠️ Đang báo sai sót",
        cls: "bg-rose-100 dark:bg-rose-950/70 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200"
      };
    }
    if (confirmStatus === "CONFIRMED" || item.payout_status === "CONFIRMED") {
      return {
        label: "✓ Đã đọc báo cáo",
        cls: "bg-teal-50 dark:bg-teal-950/60 border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-200"
      };
    }
    if (item.payout_status === "REPORT_SENT") {
      return {
        label: "📩 Chờ xác nhận",
        cls: "bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200"
      };
    }
    return {
      label: item.period_locked ? "Đã chốt kỳ" : "Tạm tính",
      cls: "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
    };
  })();

  const hasLatePenalty = Number(item?.latePenaltyAmount) > 0;
  const hasManualPenalty = Number(item?.penaltyAmount) > 0;
  const hasAdvance = Number(item?.advanceDeduction) > 0;
  const hasInsurance = Number(item?.totalInsurance || item?.insuranceDeduction || 0) > 0;
  const hasBonus = Number(item?.bonusAmount) > 0;
  const hasOt = Number(item?.totalOtHours) > 0 || Number(item?.otAmount) > 0;
  const hasSalaryByWork = Number(item?.salaryByWork) > 0;
  const canDoSendReport = Boolean(isAdminUser || (isAdminOrAccountant && typeof onSendReport === "function"));

  return (
    <AppModal
      open={Boolean(item || propMaNv || loadingPeriod)}
      onClose={onClose}
      disableClose={submitting || resolving || sendingReport}
      fullScreenSheet={true}
      maxWidthClass="sm:max-w-2xl"
      customHeader={({ handleSafeClose }) => (
        <header
          data-testid="payslip-sticky-header"
          className="u-modal-header-safe shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-1.5 sm:gap-2 print:hidden"
        >
          <button
            type="button"
            data-testid="payslip-top-close-btn"
            disabled={submitting || resolving || sendingReport}
            onClick={handleSafeClose}
            className="min-w-[44px] min-h-[44px] px-2 sm:px-3 rounded-xl inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-[#B80035] dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Đóng</span>
          </button>

          <h2 className="flex-1 min-w-0 text-center font-extrabold text-xs sm:text-base text-[#111C2D] dark:text-white truncate">
            Phiếu lương T{monthLabelPadded}/{nam}
          </h2>

          <button
            type="button"
            data-testid="payslip-download-excel-btn"
            disabled={!item || loadingPeriod}
            onClick={handleExportSingleSlipExcel}
            className="min-w-[44px] min-h-[44px] px-2.5 sm:px-3 rounded-xl inline-flex items-center gap-1 sm:gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 cursor-pointer whitespace-nowrap disabled:opacity-50 shadow-xs"
            title="Tải file Excel phiếu lương (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Excel</span>
          </button>
        </header>
      )}
      stickyTabs={
        <div
          data-testid="payslip-tab-bar"
          className="shrink-0 px-3.5 py-2 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-800 print:hidden"
        >
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-200/75 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              data-testid="payslip-tab-summary"
              data-active={activeTab === "summary" ? "true" : "false"}
              onClick={() => setActiveTab("summary")}
              className={`h-[42px] px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap truncate ${
                activeTab === "summary"
                  ? "bg-white dark:bg-slate-900 text-[#B80035] dark:text-rose-300 shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Tổng hợp lương
            </button>
            <button
              type="button"
              data-testid="payslip-tab-daily"
              data-active={activeTab === "daily" ? "true" : "false"}
              onClick={() => setActiveTab("daily")}
              className={`h-[42px] px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap truncate ${
                activeTab === "daily"
                  ? "bg-white dark:bg-slate-900 text-[#B80035] dark:text-rose-300 shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Thu nhập từng ngày ({displayedDailyRows.length} ngày)
            </button>
          </div>
        </div>
      }
      footer={
        <PayslipActionFooter
          isAdminOrAccountant={isAdminOrAccountant}
          item={item}
          confirmStatus={confirmStatus}
          submitting={submitting}
          resolving={resolving}
          sendingReport={sendingReport}
          canAdjust={canAdjust}
          canManagePayment={canManagePayment}
          canSendReport={canDoSendReport}
          isLockedOrPaid={isLockedOrPaid}
          thang={thang}
          nam={nam}
          maNv={maNv}
          onClose={onClose}
          onOpenAdjustment={onOpenAdjustment}
          onOpenTransfer={onOpenTransfer}
          onSendReport={handleSendReportAction}
          onExportSlip={handleExportSingleSlipExcel}
          onConfirmSalary={handleConfirmSalary}
          onConfirmReceived={handleConfirmReceived}
          onToggleDispute={handleToggleDispute}
        />
      }
    >
      <div className="p-3.5 sm:p-5 space-y-4 text-slate-800 dark:text-slate-100">
        {loadingPeriod ? (
          <SkeletonList rows={4} label={`Đang tải phiếu lương Tháng ${thang}/${nam}...`} />
        ) : loadError ? (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center justify-between gap-3">
            <span>{loadError}</span>
            <AppButton
              variant="danger"
              onClick={() => fetchPeriodSlip(thang, nam, maNv)}
              className="text-xs px-3 py-2 shrink-0 whitespace-nowrap"
            >
              Thử lại
            </AppButton>
          </div>
        ) : item ? (
          activeTab === "summary" ? (
            <div data-testid="payslip-summary-panel" className="space-y-4 animate-tab-enter">
              {/* Thanh chọn kỳ tháng / năm & chuyển nhanh NV gọn nhẹ */}
              <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Calendar className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />
                  <select
                    data-testid="payslip-month-select"
                    aria-label="Chọn tháng phiếu lương"
                    value={thang}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="min-h-[42px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-[#111C2D] dark:text-white cursor-pointer"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        Tháng {m}
                      </option>
                    ))}
                  </select>
                  <select
                    data-testid="payslip-year-select"
                    aria-label="Chọn năm phiếu lương"
                    value={nam}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="min-h-[42px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-[#111C2D] dark:text-white cursor-pointer"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                {isAdminOrAccountant && Array.isArray(employeeList) && employeeList.length > 1 && currentEmpIdx >= 0 && (
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-1">
                    <button
                      type="button"
                      data-testid="payslip-prev-emp-btn"
                      aria-label="Nhân viên trước"
                      onClick={() => handleStepEmployee(-1)}
                      className="min-w-[42px] min-h-[42px] px-2 flex items-center justify-center text-xs font-bold text-[#111C2D] dark:text-slate-200 hover:text-[#E11D48] dark:hover:text-rose-300 cursor-pointer"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs font-mono font-bold px-1.5 text-[#111C2D] dark:text-slate-200 whitespace-nowrap">
                      {currentEmpIdx + 1}/{employeeList.length}
                    </span>
                    <button
                      type="button"
                      data-testid="payslip-next-emp-btn"
                      aria-label="Nhân viên tiếp theo"
                      onClick={() => handleStepEmployee(1)}
                      className="min-w-[42px] min-h-[42px] px-2 flex items-center justify-center text-xs font-bold text-[#111C2D] dark:text-slate-200 hover:text-[#E11D48] dark:hover:text-rose-300 cursor-pointer"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Thẻ Thực Lĩnh Nổi Bật (Avatar + Họ tên + Bộ phận + Con số Thực lĩnh đọc ngay trong 1 giây) */}
              <div className="rounded-2xl bg-gradient-to-br from-[#E11D48] to-[#B80035] dark:from-rose-950 dark:via-slate-900 dark:to-slate-900 border border-rose-500/30 dark:border-rose-800/60 text-white p-4 sm:p-5 shadow-[0_8px_24px_-4px_rgba(225,29,72,0.28)] space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      name={item.ho_ten || maNv}
                      avatarUrl={item.avatar_url}
                      size="md"
                    />
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-base sm:text-lg text-white truncate">
                        {item.ho_ten}
                      </h3>
                      <p className="text-xs text-rose-100 truncate">
                        {maNv} • {item.department || "Khối Công trình"}
                      </p>
                    </div>
                  </div>
                  {payoutStatusBadge && (
                    <span className={`px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap shrink-0 ${payoutStatusBadge.cls}`}>
                      {payoutStatusBadge.label}
                    </span>
                  )}
                </div>

                <div className="pt-3 border-t border-white/20 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-100">
                    Thực lĩnh Tháng {thang}/{nam}
                  </span>
                  <span
                    data-testid="payslip-net-total"
                    className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight"
                  >
                    {formatCurrency(item.netSalary)}
                  </span>
                </div>
              </div>

              {/* Banner thông báo trạng thái */}
              {!isAdminOrAccountant && item.payout_status === "REPORT_SENT" && confirmStatus !== "CONFIRMED" && (
                <div
                  data-testid="payslip-report-waiting-banner"
                  className="px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-bold"
                >
                  📩 Báo cáo lương Tháng {thang}/{nam} đang chờ bạn kiểm tra &amp; xác nhận bên dưới.
                </div>
              )}

              {/* Các dòng kê khai thoáng đãng (py-3, ẩn sạch mọi khoản = 0) */}
              <div
                data-testid="payslip-part-a"
                className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden"
              >
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 block">
                      Ngày công thực tế
                    </span>
                    <span
                      data-testid="payslip-unit-daily-wage"
                      className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5"
                    >
                      Đơn giá {formatCurrency(unitDailyWage)}/ngày
                    </span>
                  </div>
                  <span className="font-mono font-extrabold text-sm text-[#16A34A] dark:text-emerald-300 whitespace-nowrap shrink-0">
                    {formatViWorkday(item.totalWorkDays || 0)} / {formatViWorkday(stdDays)} ngày chuẩn
                  </span>
                </div>

                {hasSalaryByWork && (
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Lương theo ngày công
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white whitespace-nowrap shrink-0">
                      {formatCurrency(item.salaryByWork)}
                    </span>
                  </div>
                )}

                {showAllowancesBlock && (
                  <div data-testid="payslip-allowances-section" className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Phụ cấp ({positiveAllowances.length} khoản)
                      </span>
                      <span className="font-mono font-bold text-sm text-blue-700 dark:text-blue-300 whitespace-nowrap shrink-0">
                        +{formatCurrency(totalPositiveAllowance)}
                      </span>
                    </div>
                    <div className="pl-3 border-l-2 border-blue-200 dark:border-blue-800 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {positiveAllowances.map((a) => (
                        <div key={a.key || a.label} className="flex justify-between gap-2">
                          <span>• {a.label}</span>
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0">
                            +{formatCurrency(a.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {hasOt && (
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 block">
                        Tăng ca (OT)
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 block">
                        Tổng {formatViNumber(item.totalOtHours || 0)} giờ làm thêm
                      </span>
                    </div>
                    <span className="font-mono font-bold text-sm text-indigo-700 dark:text-indigo-300 whitespace-nowrap shrink-0">
                      +{formatCurrency(item.otAmount || 0)}
                    </span>
                  </div>
                )}

                {hasBonus && (
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <span className="text-xs sm:text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      Tiền thưởng
                    </span>
                    <span className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-300 whitespace-nowrap shrink-0">
                      +{formatCurrency(item.bonusAmount)}
                    </span>
                  </div>
                )}

                {hasLatePenalty && (
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs sm:text-sm font-semibold text-rose-700 dark:text-rose-300 block">
                        Phạt đi muộn
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 block">
                        {formatViNumber(item.totalLateMinutes || 0, 0)} phút ({formatViNumber(item.lateOccurrences || 0, 0)} lần)
                      </span>
                    </div>
                    <span className="font-mono font-bold text-sm text-rose-600 dark:text-rose-300 whitespace-nowrap shrink-0">
                      -{formatCurrency(item.latePenaltyAmount)}
                    </span>
                  </div>
                )}

                {hasManualPenalty && (
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm font-semibold text-rose-700 dark:text-rose-300 block">
                        Phạt / Khấu trừ
                      </span>
                      {item.adjustment_note && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 block break-words">
                          {item.adjustment_note}
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-sm text-rose-600 dark:text-rose-300 whitespace-nowrap shrink-0">
                      -{formatCurrency(item.penaltyAmount)}
                    </span>
                  </div>
                )}

                {hasAdvance && (
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <span className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-300">
                      Tạm ứng
                    </span>
                    <span className="font-mono font-bold text-sm text-amber-700 dark:text-amber-300 whitespace-nowrap shrink-0">
                      -{formatCurrency(item.advanceDeduction)}
                    </span>
                  </div>
                )}

                {hasInsurance && (
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <span className="text-xs sm:text-sm font-semibold text-rose-700 dark:text-rose-300">
                      Khấu trừ BHXH ({formatViNumber(item.insuranceRatePercent ?? 10.5)}%)
                    </span>
                    <span className="font-mono font-bold text-sm text-rose-600 dark:text-rose-300 whitespace-nowrap shrink-0">
                      -{formatCurrency(item.totalInsurance || item.insuranceDeduction)}
                    </span>
                  </div>
                )}

                {!hasManualPenalty && item.adjustment_note && (
                  <div className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">Ghi chú: </span>
                    {item.adjustment_note}
                  </div>
                )}

                {item.bank_account_number && (
                  <div data-testid="payslip-bank-info" className="px-4 py-3 flex items-start justify-between gap-3">
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                      Ngân hàng nhận lương
                    </span>
                    <div className="text-right min-w-0 text-xs sm:text-sm">
                      <div className="font-bold text-slate-900 dark:text-white break-words">
                        {item.bank_name || item.bank_code || "Ngân hàng"}
                      </div>
                      <div className="font-mono font-semibold text-blue-700 dark:text-blue-300 break-all">
                        {item.bank_account_number}
                      </div>
                      {item.bank_account_name && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 uppercase">
                          {item.bank_account_name}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Thao tác điều chỉnh thưởng/phạt gọn cho Quản lý nếu kỳ chưa chốt */}
              {isAdminOrAccountant && canAdjust && !isLockedOrPaid && typeof onOpenAdjustment === "function" && (
                <div className="flex justify-end">
                  <AppButton
                    variant="ghost"
                    icon={SlidersHorizontal}
                    onClick={() =>
                      onOpenAdjustment({
                        ...item,
                        thang,
                        nam,
                        ma_nv: maNv
                      })
                    }
                    className="min-h-[44px] px-4 rounded-xl text-xs font-bold whitespace-nowrap"
                  >
                    Điều chỉnh Thưởng / Phạt / Tạm ứng
                  </AppButton>
                </div>
              )}

              {/* Form gửi khiếu nại cho Nhân viên khi bấm nút [Báo sai sót] ở Thanh đáy */}
              {!isAdminOrAccountant && showDisputeForm && (
                <form
                  ref={disputeSectionRef}
                  onSubmit={handleSubmitDispute}
                  data-testid="payslip-worker-dispute-form"
                  className="bg-amber-50/70 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700 rounded-2xl p-4 space-y-3 print:hidden"
                >
                  <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-extrabold text-xs sm:text-sm">
                    <AlertTriangle size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>Gửi Phản hồi Sai sót Lương / Ngày công</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Lý do sai lệch:
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder="VD: Ngày 12/11 em có tăng ca 2 tiếng nhưng chưa thấy cộng vào phiếu lương..."
                      className="w-full p-3 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                      Đính kèm Ảnh (&lt;50KB) hoặc Video (&lt;800KB):
                    </span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <AppButton
                        variant="secondary"
                        icon={Camera}
                        onClick={() => handlePickDisputeMedia(["camera"])}
                        className="min-h-[44px] text-xs px-3 py-2 whitespace-nowrap"
                      >
                        Chụp ảnh
                      </AppButton>
                      <AppButton
                        variant="secondary"
                        icon={ImageIcon}
                        onClick={() => handlePickDisputeMedia(["album"])}
                        className="min-h-[44px] text-xs px-3 py-2 whitespace-nowrap"
                      >
                        <Video size={14} className="inline mr-1" />
                        Chọn tệp
                      </AppButton>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleSelectEvidenceFile}
                      className="hidden"
                    />
                    {mediaNotice && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 font-bold">{mediaNotice}</p>
                    )}
                  </div>

                  <AppButton
                    type="submit"
                    variant="danger"
                    icon={Send}
                    fullWidth
                    loading={submitting}
                    loadingText="Đang gửi báo cáo..."
                    className="min-h-[46px] whitespace-nowrap"
                  >
                    Gửi Báo Cáo Tới Kế Toán &amp; Admin
                  </AppButton>
                </form>
              )}

              {/* HIỂN THỊ KHIẾU NẠI & BẰNG CHỨNG */}
              {(disputeStatus === "OPEN" || (disputeStatus !== "RESOLVED" && confirmStatus === "DISPUTED")) && (
                <div
                  data-testid="payslip-open-dispute-box"
                  className="bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-200 dark:border-rose-800/70 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200 font-black text-xs uppercase">
                    <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 shrink-0" />
                    <span>Hồ sơ Báo cáo Sai lệch Lương / Công</span>
                  </div>

                  {(disputeReason || item.dispute_reason) && (
                    <div className="text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 p-3 rounded-xl border border-rose-200 dark:border-rose-800/60">
                      <span className="font-bold text-rose-700 dark:text-rose-300 block mb-1">Nội dung phản ánh:</span>
                      {disputeReason || item.dispute_reason}
                    </div>
                  )}

                  {(evidenceMedia || item.dispute_evidence_media) && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                        Bằng chứng đính kèm:
                      </span>
                      {(evidenceMedia || item.dispute_evidence_media).startsWith("data:video") ? (
                        <video
                          src={evidenceMedia || item.dispute_evidence_media}
                          controls
                          className="w-full max-h-56 rounded-xl border border-slate-300 dark:border-slate-700 bg-black"
                        />
                      ) : (
                        <img
                          src={evidenceMedia || item.dispute_evidence_media}
                          alt="Minh chứng lương"
                          className="w-full max-h-60 object-contain rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      )}
                    </div>
                  )}

                  {(adminResponse || item.admin_response) && !isAdminOrAccountant && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 p-3 rounded-xl text-xs text-emerald-950 dark:text-emerald-200">
                      <span className="font-black text-emerald-800 dark:text-emerald-300 block mb-0.5">
                        Phản hồi từ Phòng Kế toán / Admin:
                      </span>
                      {adminResponse || item.admin_response}
                    </div>
                  )}

                  {isAdminOrAccountant && (
                    <div className="pt-2 border-t border-rose-200 dark:border-rose-800/70 space-y-2.5">
                      <label className="block text-xs font-black text-slate-800 dark:text-slate-100">
                        Phản hồi giải quyết của Kế toán / Admin:
                      </label>
                      <textarea
                        rows={2}
                        value={adminResponse}
                        onChange={(e) => setAdminResponse(e.target.value)}
                        placeholder="Nhập kết quả kiểm tra lại bảng công/lương cho nhân viên..."
                        className="w-full p-2.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:border-emerald-600"
                      />
                      <div className="flex gap-2.5">
                        <AppButton
                          variant="success"
                          icon={ShieldCheck}
                          loading={resolving}
                          loadingText="Đang xử lý..."
                          data-testid="slip-resolve-dispute-btn"
                          onClick={() => handleResolveDispute("RESOLVED")}
                          className="flex-1 min-h-[44px] text-xs font-bold whitespace-nowrap"
                        >
                          ✓ Đã giải quyết
                        </AppButton>
                        <AppButton
                          variant="secondary"
                          icon={Send}
                          loading={resolving}
                          onClick={() => handleResolveDispute("DISPUTED")}
                          className="flex-1 min-h-[44px] text-xs font-bold whitespace-nowrap"
                        >
                          Gửi phản hồi
                        </AppButton>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* TAB 2: THU NHẬP TỪNG NGÀY (30/31 DÒNG NGANG SIÊU GỌN) */
            <div data-testid="payslip-daily-panel" className="space-y-3 animate-tab-enter">
              <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                {displayedDailyRows.map((row) => {
                  const hasOt = row.otHours > 0 || row.dailyOtAmount > 0;
                  const hasPen = row.dailyPenaltyAmount > 0;
                  const isExpanded = expandedDayIso === row.iso;
                  const RowTag = row.hasDetails ? "button" : "div";

                  return (
                    <div
                      key={row.iso}
                      data-testid={`payslip-day-row-${row.iso}`}
                      className={row.isSunday ? "bg-slate-50/70 dark:bg-slate-800/25" : ""}
                    >
                      <RowTag
                        {...(row.hasDetails
                          ? {
                              type: "button",
                              onClick: () => setExpandedDayIso((prev) => (prev === row.iso ? null : row.iso))
                            }
                          : {})}
                        className={`w-full min-h-[50px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left text-xs sm:text-sm ${
                          row.hasDetails
                            ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                            : ""
                        }`}
                      >
                        {/* Cột trái: DD/MM + Thứ + Chấm màu */}
                        <div className="flex items-center gap-2 shrink-0 min-w-[92px]">
                          <span
                            aria-hidden="true"
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${getDailyDotClass(row.colorName)}`}
                          />
                          <span className="font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {row.shortDate}
                          </span>
                          <span
                            className={`text-xs font-bold whitespace-nowrap ${
                              row.isSunday ? "text-[#E11D48] dark:text-rose-400" : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {row.weekdayShort}
                          </span>
                        </div>

                        {/* Cột giữa: Nhãn trạng thái ngắn gọn + badge OT / Phạt (chỉ hiện nếu có) */}
                        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`text-xs font-semibold truncate ${
                              row.colorName === "red"
                                ? "text-rose-600 dark:text-rose-300"
                                : row.colorName === "blue"
                                  ? "text-sky-700 dark:text-sky-300"
                                  : row.colorName === "green"
                                    ? "text-emerald-700 dark:text-emerald-300"
                                    : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {row.compactStatus}
                          </span>
                          {hasOt && (
                            <span
                              data-testid={`payslip-day-ot-${row.iso}`}
                              className="px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-200 text-[11px] font-bold whitespace-nowrap"
                            >
                              +{formatViNumber(row.otHours)} giờ OT
                            </span>
                          )}
                          {hasPen && (
                            <span
                              data-testid={`payslip-day-penalty-${row.iso}`}
                              className="px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] font-bold whitespace-nowrap"
                            >
                              -Phạt
                            </span>
                          )}
                        </div>

                        {/* Cột phải: Số tiền kiếm được trong ngày */}
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            data-testid={`payslip-day-earned-${row.iso}`}
                            className={`font-mono font-extrabold text-xs sm:text-sm whitespace-nowrap ${
                              row.dailyEarnedAmount > 0
                                ? "text-emerald-700 dark:text-emerald-300"
                                : row.dailyEarnedAmount < 0
                                  ? "text-rose-600 dark:text-rose-300"
                                  : "text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {formatCurrency(row.dailyEarnedAmount)}
                          </span>
                          {row.hasDetails && (
                            isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            )
                          )}
                        </div>
                      </RowTag>

                      {/* Chi tiết mở rộng tại chỗ (không popup phụ) */}
                      {isExpanded && row.hasDetails && (
                        <div
                          data-testid={`payslip-day-expand-${row.iso}`}
                          className="px-3.5 pb-3 pt-1 bg-slate-50/90 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1 text-slate-600 dark:text-slate-300"
                        >
                          <div className="flex flex-wrap justify-between gap-2">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">
                              {row.weekdayFull}, {row.fullDate} • {row.statusLabelVi}
                            </span>
                            {row.checkWindow && (
                              <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                                {row.checkWindow}
                              </span>
                            )}
                          </div>
                          {row.dailyBaseAmount > 0 && (hasOt || hasPen) && (
                            <div>Lương công ngày: {formatCurrency(row.dailyBaseAmount)}</div>
                          )}
                          {hasOt && (
                            <div className="text-indigo-700 dark:text-indigo-300 font-semibold">
                              Tăng ca: +{formatViNumber(row.otHours)} giờ OT = +{formatCurrency(row.dailyOtAmount)}
                            </div>
                          )}
                          {hasPen && (
                            <div className="text-rose-700 dark:text-rose-300 font-semibold">
                              Phạt: -{formatCurrency(row.dailyPenaltyAmount)}
                              {row.dailyPenaltyReason ? ` (${row.dailyPenaltyReason})` : ""}
                            </div>
                          )}
                          {row.log?.holiday_name && (
                            <div className="text-purple-700 dark:text-purple-300 font-semibold">
                              🎉 {row.log.holiday_name}
                            </div>
                          )}
                          {row.note && <div>Ghi chú: {row.note}</div>}
                          {row.log?.location_name && (
                            <div className="text-slate-500 dark:text-slate-400">Địa điểm: {row.log.location_name}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Đối chiếu tổng thu nhập từng ngày khớp tháng */}
              <div
                data-testid="payslip-daily-reconciliation"
                className="rounded-2xl bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Cộng dồn từ {displayedDailyRows.length} ngày
                </span>
                <span className="font-mono font-extrabold text-sm text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(dailyLedgerTotals.earned)}
                </span>
              </div>
            </div>
          )
        ) : null}
      </div>
    </AppModal>
  );
}
