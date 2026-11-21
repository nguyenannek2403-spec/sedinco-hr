import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Printer,
  Share2,
  AlertTriangle,
  Camera,
  Video,
  Image as ImageIcon,
  Send,
  ShieldCheck,
  Calendar,
  Clock,
  RefreshCw,
  Lock,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet
} from "lucide-react";
import { safeGet, safePost, generateIdempotencyKey } from "../utils/api";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { exportEmployeeSalaryExcel } from "../utils/salaryExcelExport";
import { compressAndResizeImage, pickCompressedEvidencePhoto } from "../utils/imageHelper";
import { formatViCurrency, formatViWorkday, formatViNumber } from "../utils/viNumberFormat";
import {
  getMonthlyStandardWorkdays,
  getVietnamTodayIso,
  normalizePureIsoDate,
  resolveHeatmapCellMeta
} from "../utils/workdayUtils";
import { AppButton, AppModal, StatusBadge, SkeletonList, UserAvatar } from "./ui";
import PayslipActionFooter from "./PayslipActionFooter";
import {
  formatDayWithWeekday,
  getPositiveAllowances,
  resolveLogNote,
  getNoteBadgeClass
} from "../utils/payslipHelpers";

/**
 * SalarySlipModal V29
 * - Hợp nhất Phiếu lương Chi tiết (Phần A) + Bảng công Từng ngày (Phần B)
 * - Bộ chọn Tháng / Năm lịch sử ngay trên đầu Modal + Chuyển nhanh Nhân viên Trước/Sau (cho Quản lý)
 * - Thanh Thao Tác Đáy Cố Định (Sticky Bottom Action Bar) tách bạch 100% theo vai trò Admin vs Worker
 * - Hiển thị Phụ cấp có điều kiện (> 0 mới hiện, = 0 ẩn hoàn toàn)
 */
export default function SalarySlipModal({
  payrollItem = null,
  employee = null,
  targetMaNv = null,
  month,
  year,
  isAdminOrAccountant = false,
  employeeList = [],
  onSelectEmployee = null,
  canAdjust = false,
  canManagePayment = false,
  onOpenAdjustment = null,
  onOpenTransfer = null,
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
  const [selectedHeatmapIso, setSelectedHeatmapIso] = useState(null);

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
    setSelectedHeatmapIso(null);
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

  const yearOptions = useMemo(() => {
    const curY = new Date().getFullYear();
    const base = new Set([curY - 1, curY, curY + 1, initialYear]);
    return Array.from(base).sort((a, b) => a - b);
  }, [initialYear]);

  const leadingEmptyCells = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(nam, thang - 1, 1)).getUTCDay();
    return (firstWeekday + 6) % 7;
  }, [nam, thang]);

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
      const isSunday = new Date(Date.UTC(nam, thang - 1, d)).getUTCDay() === 0;
      const meta = resolveHeatmapCellMeta({ log, isoDate: iso, todayIso, isSunday });
      const note = log
        ? resolveLogNote(log)
        : meta.badgeText;
      const otHours = Number(log?.ot_hours_applied ?? log?.ot_hours) || 0;
      const hasLateOrEarly = Boolean(
        meta.hasLateOrEarly ||
          (log &&
            String(log.duration_status || "").trim().toUpperCase() !== "ADMIN_ADJUSTED_FULL" &&
            /vào muộn|ra sớm/i.test(note))
      );

      rows.push({
        key: iso,
        iso,
        day: d,
        shortDate: `${String(d).padStart(2, "0")}/${String(thang).padStart(2, "0")}`,
        dateLabel: formatDayWithWeekday(iso, log?.date_label),
        log,
        note,
        credit: meta.credit,
        otHours,
        status: log ? (log.status || "0") : isSunday ? "CN" : "V",
        shortCode: meta.shortCode,
        cellClass: meta.cellClass,
        colorName: meta.colorName,
        hasLateOrEarly
      });
    }
    return rows;
  }, [item, thang, nam]);

  const selectedHeatmapDay = useMemo(() => {
    if (!selectedHeatmapIso) return null;
    return displayedDailyRows.find((r) => r.iso === selectedHeatmapIso) || null;
  }, [displayedDailyRows, selectedHeatmapIso]);

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
          notify(`Video quá nặng (${sizeKB}KB). Vui lòng chọn video ngắn dưới 800KB (khoảng 3-5 giây) để bảo vệ dung lượng hệ thống!`, "error");
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
      const res = await safePost("/payroll/confirm", {
        month: thang,
        year: nam,
        action: "CONFIRM",
        status: "CONFIRMED"
      }, {
        idempotencyKey: generateIdempotencyKey("pay_confirm")
      });
      if (res?.success) {
        setConfirmStatus("CONFIRMED");
        setLoadedItem((prev) =>
          prev
            ? {
                ...prev,
                salary_confirm_status: "CONFIRMED",
                payout_status: prev.payout_status === "PAID" ? "PAID" : "CONFIRMED"
              }
            : prev
        );
        setShowDisputeForm(false);
        notify("Cảm ơn bạn đã xác nhận bảng lương chính xác!", "success");
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

  const handleToggleDispute = () => {
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
      const res = await safePost("/payroll/confirm", {
        month: thang,
        year: nam,
        action: "DISPUTE",
        status: "DISPUTED",
        note: disputeReason.trim(),
        dispute_reason: disputeReason.trim(),
        dispute_evidence_media: evidenceMedia || null
      }, {
        idempotencyKey: generateIdempotencyKey("pay_dispute")
      });
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
      const res = await safePost("/payroll/resolve-dispute", {
        ma_nv: maNv,
        month: thang,
        year: nam,
        admin_response: resolvedNoteText,
        status: newStatus
      }, {
        idempotencyKey: generateIdempotencyKey("pay_resolve")
      });
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

  const handleShareZalo = async () => {
    if (!item) return;
    const shareText = `📄 PHIẾU LƯƠNG SEDINCO - THÁNG ${thang}/${nam}\n👤 NV: ${item.ho_ten} (${maNv})\n📅 Ngày công: ${formatViWorkday(item.totalWorkDays || 0)}/${formatViWorkday(item.standardWorkDays || item.standardDays || getMonthlyStandardWorkdays(thang, nam))}\n💰 Thực lĩnh (NET): ${formatCurrency(item.netSalary)}\n📌 Trạng thái: ${confirmStatus === "CONFIRMED" ? "Đã xác nhận" : confirmStatus === "DISPUTED" && disputeStatus !== "RESOLVED" ? "Đang khiếu nại" : item.payout_status === "PAID" ? "Đã chuyển khoản" : "Chờ xác nhận"}`;
    try {
      const res = await zmpAdapter.openShareSheet({
        type: "text",
        data: {
          text: shareText,
          description: `Phiếu lương T${thang}/${nam} - ${item.ho_ten || maNv}`
        },
        fallbackText: shareText
      });
      if (res?.cancelled) return;
      if (res?.method === "zmp") {
        notify("Đã mở chia sẻ Phiếu lương qua Zalo!", "success");
      } else if (res?.method === "clipboard") {
        notify("Đã sao chép tóm tắt Phiếu lương để dán vào Zalo!", "success");
      }
    } catch (_e) {
      // User cancelled share
    }
  };

  const isEmployeePaid = Boolean(
    item &&
      (item.payout_status === "PAID" ||
        item.employee_payment_status === "PAID" ||
        item.payment_status === "PAID")
  );
  const isLockedOrPaid = Boolean(
    item && (isEmployeePaid || item.payroll_period_status === "APPROVED" || item.period_locked)
  );

  const periodLockBadge = (() => {
    if (!item) return null;
    if (isEmployeePaid) {
      return { label: "💸 Đã chuyển khoản", cls: "bg-emerald-800/85 border-emerald-300/40 text-white" };
    }
    if (item.payout_status === "REPORT_SENT") {
      return { label: "📩 Chờ xác nhận", cls: "bg-amber-700/85 border-amber-200/40 text-white" };
    }
    if (item.period_locked || item.payroll_period_status === "APPROVED") {
      return { label: "Đã chốt sổ", cls: "bg-blue-900/65 border-blue-200/40 text-white" };
    }
    return { label: "Bản nháp / Tạm tính", cls: "bg-slate-800/75 border-white/25 text-white" };
  })();

  const otRowNumber = showAllowancesBlock ? 4 : 3;
  const bonusRowNumber = otRowNumber + 1;

  return (
    <AppModal
      open={Boolean(item || propMaNv || loadingPeriod)}
      onClose={onClose}
      disableClose={submitting || resolving}
      showCloseX={true}
      maxWidthClass="sm:max-w-2xl"
      maxHeightClass="max-h-[92vh]"
      title={`Lương & Công T${thang}/${nam} — ${maNv}`}
      icon={
        item ? (
          <UserAvatar
            name={item.ho_ten || maNv}
            avatarUrl={item.avatar_url}
            size="sm"
          />
        ) : null
      }
      headerExtra={
        <div className="flex items-center gap-1.5 print:hidden">
          <AppButton
            variant="zalo"
            icon={Share2}
            disabled={!item || loadingPeriod}
            onClick={handleShareZalo}
            className="min-h-[44px] px-3 py-2 text-xs font-bold"
            title="Chia sẻ qua Zalo"
          >
            Zalo
          </AppButton>
          <AppButton
            variant="secondary"
            icon={Printer}
            disabled={!item || loadingPeriod}
            onClick={() => window.print()}
            className="hidden sm:inline-flex min-h-[44px] px-3 py-2 text-xs font-bold"
          >
            In
          </AppButton>
        </div>
      }
      subHeader={
        <div className="print:hidden flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#111C2D] dark:text-slate-200">
            <Calendar className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />
            <select
              data-testid="payslip-month-select"
              aria-label="Chọn tháng phiếu lương"
              value={thang}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-2.5 py-1.5 text-xs font-bold text-[#111C2D] dark:text-white cursor-pointer"
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
              className="min-h-[44px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-2.5 py-1.5 text-xs font-bold text-[#111C2D] dark:text-white cursor-pointer"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <AppButton
              variant="secondary"
              icon={RefreshCw}
              loading={loadingPeriod}
              onClick={() => fetchPeriodSlip(thang, nam, maNv)}
              aria-label="Tải lại kỳ lương"
              className="min-w-[44px] min-h-[44px] px-2.5 py-1.5"
            />
          </div>

          {isAdminOrAccountant && Array.isArray(employeeList) && employeeList.length > 1 && currentEmpIdx >= 0 && (
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-1">
              <button
                type="button"
                data-testid="payslip-prev-emp-btn"
                aria-label="Nhân viên trước"
                title="NV trước"
                onClick={() => handleStepEmployee(-1)}
                className="min-w-[44px] min-h-[44px] px-2 flex items-center gap-0.5 text-xs font-bold text-[#111C2D] dark:text-slate-200 hover:text-[#E11D48] dark:hover:text-rose-300 cursor-pointer"
              >
                <ChevronLeft size={15} />
                <span className="hidden sm:inline">NV trước</span>
              </button>
              <span className="text-xs font-mono font-bold px-1.5 text-[#111C2D] dark:text-slate-200 whitespace-nowrap">
                {currentEmpIdx + 1}/{employeeList.length}
              </span>
              <button
                type="button"
                data-testid="payslip-next-emp-btn"
                aria-label="Nhân viên tiếp theo"
                title="NV sau"
                onClick={() => handleStepEmployee(1)}
                className="min-w-[44px] min-h-[44px] px-2 flex items-center gap-0.5 text-xs font-bold text-[#111C2D] dark:text-slate-200 hover:text-[#E11D48] dark:hover:text-rose-300 cursor-pointer"
              >
                <span className="hidden sm:inline">NV sau</span>
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      }
      footer={
        <PayslipActionFooter
          isAdminOrAccountant={isAdminOrAccountant}
          item={item}
          confirmStatus={confirmStatus}
          submitting={submitting}
          resolving={resolving}
          canAdjust={canAdjust}
          canManagePayment={canManagePayment}
          isLockedOrPaid={isLockedOrPaid}
          thang={thang}
          nam={nam}
          maNv={maNv}
          onClose={onClose}
          onOpenAdjustment={onOpenAdjustment}
          onOpenTransfer={onOpenTransfer}
          onExportSlip={handleExportSingleSlipExcel}
          onConfirmSalary={handleConfirmSalary}
          onToggleDispute={handleToggleDispute}
        />
      }
    >
      <div className="p-4 sm:p-6 space-y-4 text-slate-800 dark:text-slate-100">
        {loadingPeriod ? (
          <SkeletonList rows={4} label={`Đang tải phiếu lương & bảng công Tháng ${thang}/${nam}...`} />
        ) : loadError ? (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center justify-between gap-3">
            <span>{loadError}</span>
            <AppButton variant="danger" onClick={() => fetchPeriodSlip(thang, nam, maNv)} className="text-xs px-3 py-1.5 shrink-0">
              Thử lại
            </AppButton>
          </div>
        ) : item ? (
          <>
            {/* Quốc hiệu & Thực lĩnh Hero — Sedinco Pulse Physical Voucher Header */}
            <div className="bg-gradient-to-br from-[#E11D48] to-[#B80035] dark:from-rose-950 dark:via-slate-900 dark:to-slate-900 border border-rose-500/30 dark:border-rose-800/50 text-white rounded-2xl p-4 space-y-2.5 shadow-[0_8px_24px_-4px_rgba(225,29,72,0.28)]">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-white uppercase">
                    CÔNG TY CỔ PHẦN SEDINCO
                  </h2>
                  <p className="text-xs text-rose-100 mt-0.5">
                    Phiếu lương &amp; Bảng công Chi tiết Điện tử
                  </p>
                </div>
                <div className="sm:text-right flex flex-wrap sm:flex-col items-center sm:items-end gap-1.5">
                  <span className="inline-block px-3 py-1 bg-black/25 dark:bg-slate-800 border border-white/25 text-white rounded-full text-xs font-extrabold uppercase">
                    Kỳ Lương: Tháng {thang}/{nam}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {periodLockBadge && (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-bold ${periodLockBadge.cls}`}>
                        <Lock size={12} /> {periodLockBadge.label}
                      </span>
                    )}
                    {confirmStatus === "CONFIRMED" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-800/80 border border-emerald-300/40 text-white text-xs font-bold">
                        ✓ Đã xác nhận đúng lương
                      </span>
                    )}
                    {disputeStatus !== "RESOLVED" && confirmStatus === "DISPUTED" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-950/85 border border-rose-300/40 text-white text-xs font-bold">
                        <AlertTriangle size={12} /> Đang khiếu nại sai lương
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-white/20 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-100">
                  Lương thực nhận (NET)
                </span>
                <span className="text-2xl font-extrabold font-mono text-white tracking-tight">
                  {formatCurrency(item.netSalary)}
                </span>
              </div>
            </div>

            {/* Banner trạng thái báo cáo lương + Nút Tải file Excel phiếu lương 1 chạm */}
            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
              {item.payout_status === "REPORT_SENT" && !isEmployeePaid && confirmStatus !== "CONFIRMED" && (
                <div
                  data-testid="payslip-report-waiting-banner"
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-extrabold"
                >
                  📩 Báo cáo lương Tháng {thang}/{nam} đang chờ xác nhận
                </div>
              )}
              {isEmployeePaid && (
                <div className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs font-bold">
                  💸 Đã chuyển khoản lương{item.employee_paid_at_vn ? ` lúc ${item.employee_paid_at_vn}` : ""}
                </div>
              )}
              <AppButton
                variant="success"
                icon={FileSpreadsheet}
                data-testid="payslip-download-excel-btn"
                onClick={handleExportSingleSlipExcel}
                className="min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold shrink-0"
              >
                📥 Tải file Excel phiếu lương
              </AppButton>
            </div>

            {/* Thông tin nhân sự — Stitch #F0F3FF Tactical Pod */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#F0F3FF] dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
              <div>
                <span className="text-slate-600 dark:text-slate-300 block text-xs uppercase font-semibold">
                  Mã Nhân Viên
                </span>
                <span className="font-mono font-bold text-[#111C2D] dark:text-white text-sm">
                  {maNv}
                </span>
              </div>
              <div>
                <span className="text-slate-600 dark:text-slate-300 block text-xs uppercase font-semibold">
                  Họ và Tên
                </span>
                <span className="font-bold text-[#111C2D] dark:text-white break-words block">
                  {item.ho_ten}
                </span>
              </div>
              <div>
                <span className="text-slate-600 dark:text-slate-300 block text-xs font-semibold">
                  Chức danh &amp; Bộ phận
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-200 break-words block">
                  {item.chuc_danh || "Nhân viên"} • {item.department || "Khối Công trình"}
                </span>
              </div>
              <div>
                <span className="text-slate-600 dark:text-slate-300 block text-xs uppercase font-semibold">
                  Ngày Công Thực Tế
                </span>
                <span className="font-extrabold text-[#16A34A] dark:text-emerald-300 block">
                  {formatViWorkday(item.totalWorkDays || 0)} / {formatViWorkday(item.standardWorkDays || item.standardDays || getMonthlyStandardWorkdays(thang, nam))} công
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-300 block mt-0.5">
                  TT {formatViWorkday(item.workedDays ?? item.totalWorkDays)} • Phép {formatViWorkday(item.paidLeaveDays || 0)} • Lễ {formatViWorkday(item.holidayDays || 0)}
                </span>
              </div>
            </div>

            {/* PHẦN A: BẢNG CHI TIẾT THU NHẬP */}
            <div
              data-testid="payslip-part-a"
              className="border border-slate-200/80 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs"
            >
              <div className="bg-[#F0F3FF] dark:bg-slate-800 px-3.5 py-2.5 text-xs font-extrabold text-[#111C2D] dark:text-slate-200 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-700 flex justify-between">
                <span>Phần A • Chi Tiết Thu Nhập</span>
                <span>Số Tiền (VNĐ)</span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                <div className="px-3.5 py-2.5 flex justify-between items-center gap-2">
                  <span className="text-slate-600 dark:text-slate-300">
                    1. Lương cơ bản hợp đồng (Định mức {formatViWorkday(item.standardWorkDays || item.standardDays || getMonthlyStandardWorkdays(thang, nam))} ngày)
                  </span>
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                    {formatCurrency(item.baseSalary)}
                  </span>
                </div>

                <div className="px-3.5 py-2.5 flex justify-between items-center gap-2 bg-slate-50/60 dark:bg-slate-800/40">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    2. Lương chính theo ngày công ({formatViWorkday(item.totalWorkDays || 0)} ngày)
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0">
                    {formatCurrency(item.salaryByWork)}
                  </span>
                </div>

                {showAllowancesBlock && (
                  <div data-testid="payslip-allowances-section" className="px-3.5 py-2.5">
                    <div className="flex justify-between items-center font-semibold text-slate-800 dark:text-slate-100 mb-1.5">
                      <span>3. Các khoản phụ cấp theo công</span>
                      <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                        +{formatCurrency(totalPositiveAllowance)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pl-3 border-l-2 border-blue-200 dark:border-blue-800/70 text-xs text-slate-600 dark:text-slate-300">
                      {positiveAllowances.map((a) => (
                        <div key={a.key || a.label} className="flex justify-between gap-2">
                          <span>• {a.label}:</span>
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 shrink-0">
                            {formatCurrency(a.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-3.5 py-2.5 flex justify-between items-center gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {otRowNumber}. Lương làm thêm giờ (Tăng ca / OT: {formatViNumber(item.totalOtHours || 0)} giờ)
                  </span>
                  <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
                    +{formatCurrency(item.otAmount)}
                  </span>
                </div>

                {Number(item.bonusAmount) > 0 && (
                  <div className="px-3.5 py-2.5 flex justify-between items-center gap-2 bg-emerald-50/40 dark:bg-emerald-950/40">
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                      {bonusRowNumber}. Thưởng nóng / Phụ cấp thêm
                    </span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                      +{formatCurrency(item.bonusAmount)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="sedinco-ticket-cutout">
              <div className="w-full border-t-2 border-dashed border-slate-200 dark:border-slate-700" />
            </div>

            {/* Khấu trừ & Thực lĩnh */}
            <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
              <div className="bg-[#F0F3FF] dark:bg-slate-800 px-3.5 py-2.5 text-xs font-extrabold text-[#111C2D] dark:text-slate-200 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-700">
                Khấu trừ &amp; Thực lĩnh
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                <div className="px-3.5 py-2.5 flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Mức lương đóng BHXH</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                    {formatCurrency(item.insuranceBase || item.baseSalary)}
                  </span>
                </div>
                <div className="px-3.5 py-2.5 flex justify-between text-rose-700 dark:text-rose-300">
                  <span>Khấu trừ BHXH, BHYT, BHTN</span>
                  <span className="font-mono font-bold">
                    -{formatCurrency(item.totalInsurance || item.insuranceDeduction)}
                  </span>
                </div>
                {Number(item.latePenaltyAmount) > 0 && (
                  <div className="px-3.5 py-2.5 flex justify-between text-rose-600 dark:text-rose-300">
                    <span>Khấu trừ đi muộn ({item.totalLateMinutes || 0} phút)</span>
                    <span className="font-mono font-bold">
                      -{formatCurrency(item.latePenaltyAmount)}
                    </span>
                  </div>
                )}
                {Number(item.penaltyAmount) > 0 && (
                  <div className="px-3.5 py-2.5 flex justify-between text-rose-600 dark:text-rose-300">
                    <span>Khấu trừ phạt / Vi phạm</span>
                    <span className="font-mono font-bold">
                      -{formatCurrency(item.penaltyAmount)}
                    </span>
                  </div>
                )}
                {Number(item.advanceDeduction) > 0 && (
                  <div className="px-3.5 py-2.5 flex justify-between text-amber-800 dark:text-amber-300">
                    <span>Trừ tiền đã tạm ứng lương</span>
                    <span className="font-mono font-bold">
                      -{formatCurrency(item.advanceDeduction)}
                    </span>
                  </div>
                )}
                {item.adjustment_note && (
                  <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">Ghi chú kế toán: </span>
                    {item.adjustment_note}
                  </div>
                )}
                <div className="px-3.5 py-3 flex justify-between bg-emerald-50 dark:bg-emerald-950/60 font-bold text-sm">
                  <span className="text-emerald-900 dark:text-emerald-200">
                    Thực lĩnh cuối cùng (NET)
                  </span>
                  <span className={`font-mono text-base ${Number(item.netSalary) < 0 ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>
                    {formatCurrency(item.netSalary)}
                  </span>
                </div>
                {Number(item.carryOverDebt || item.carry_over_debt || 0) > 0 && (
                  <div className="px-3.5 py-2.5 flex justify-between items-center gap-2 bg-amber-50 dark:bg-amber-950/60 border-t border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200 text-xs sm:text-sm">
                    <span className="font-semibold">
                      Khoản khấu trừ còn dư (Chuyển kỳ sau)
                    </span>
                    <span className="font-mono font-bold text-amber-800 dark:text-amber-300 shrink-0">
                      {formatCurrency(item.carryOverDebt || item.carry_over_debt)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* PHẦN B: LƯỚI LỊCH HEATMAP BẢNG CÔNG TRỰC QUAN 7 CỘT (T2 -> CN) */}
            <div
              data-testid="payslip-daily-attendance-section"
              className="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-white dark:bg-slate-900"
            >
              <div className="bg-[#F0F3FF] dark:bg-slate-800 px-3.5 py-2.5 text-xs font-bold text-[#111C2D] dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Clock size={14} className="text-[#E11D48] dark:text-rose-400 shrink-0" />
                  <span>Phần B • Lịch công Tháng {thang}/{nam}</span>
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 print:hidden">
                  Chạm ô ngày để xem chi tiết
                </span>
              </div>

              <div className="p-3 sm:p-4 space-y-3">
                {/* Tiêu đề thứ T2 -> CN */}
                <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-extrabold text-slate-500 dark:text-slate-300">
                  {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((w) => (
                    <div key={w} className={w === "CN" ? "text-[#E11D48] dark:text-rose-400 py-0.5" : "py-0.5"}>
                      {w}
                    </div>
                  ))}
                </div>

                {/* Lưới ô ngày bo tròn 7 cột */}
                <div data-testid="payslip-heatmap-grid" className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: leadingEmptyCells }).map((_, idx) => (
                    <div key={`empty-${idx}`} aria-hidden="true" className="min-h-[46px]" />
                  ))}
                  {displayedDailyRows.map((cell) => {
                    const isSelected = selectedHeatmapIso === cell.iso;
                    return (
                      <button
                        key={cell.iso}
                        type="button"
                        data-testid={`payslip-day-cell-${cell.iso}`}
                        data-heatmap-color={cell.colorName}
                        onClick={() => setSelectedHeatmapIso((prev) => (prev === cell.iso ? null : cell.iso))}
                        className={`relative min-h-[46px] p-1 rounded-xl border flex flex-col items-center justify-center transition cursor-pointer ${cell.cellClass} ${
                          isSelected ? "ring-2 ring-[#E11D48] dark:ring-rose-400 shadow-sm" : "hover:opacity-90"
                        }`}
                      >
                        {cell.hasLateOrEarly && (
                          <span
                            aria-label="Có ghi chú vào muộn hoặc ra sớm"
                            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500"
                          />
                        )}
                        <span className="text-xs font-extrabold leading-none">{cell.day}</span>
                        {cell.shortCode && (
                          <span className="text-[11px] font-bold leading-tight mt-0.5 font-mono">
                            {cell.shortCode}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Chú thích màu 1 dòng siêu gọn */}
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>Đủ công / Lễ / OT</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" />
                    <span>0,5 / Phép (P)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
                    <span>Vào muộn / Ra sớm</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                    <span>KP / Nghỉ (V)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                    <span>Chủ nhật / Chưa tới</span>
                  </span>
                </div>

                {/* Thẻ tóm tắt chi tiết khi chạm vào ô ngày trên Heatmap */}
                {selectedHeatmapDay && (
                  <div
                    data-testid="payslip-heatmap-day-detail"
                    className="p-3 rounded-xl bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-extrabold text-[#111C2D] dark:text-white">
                          Ngày {selectedHeatmapDay.shortDate}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">•</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                          {selectedHeatmapDay.log?.check_in_time
                            ? String(selectedHeatmapDay.log.check_in_time).slice(0, 5)
                            : "--:--"}
                          {" – "}
                          {selectedHeatmapDay.log?.check_out_time
                            ? String(selectedHeatmapDay.log.check_out_time).slice(0, 5)
                            : "--:--"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono font-bold text-[#111C2D] dark:text-white">
                          {formatViWorkday(selectedHeatmapDay.credit)} công
                        </span>
                        {selectedHeatmapDay.otHours > 0 && (
                          <span className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-700 font-semibold text-indigo-700 dark:text-indigo-300">
                            +{formatViNumber(selectedHeatmapDay.otHours)}h OT
                          </span>
                        )}
                        {selectedHeatmapDay.log && (
                          <StatusBadge type="attendance" status={selectedHeatmapDay.log.status} />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-xs font-semibold ${getNoteBadgeClass(
                          selectedHeatmapDay.note
                        )}`}
                      >
                        {selectedHeatmapDay.note}
                      </span>
                      {selectedHeatmapDay.log?.location_name && (
                        <span className="text-xs text-slate-600 dark:text-slate-300 break-words">
                          {selectedHeatmapDay.log.location_name}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Form gửi khiếu nại cho Nhân viên khi bấm nút [⚠️ Báo sai sót] ở Thanh đáy */}
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
                    Lý do sai lệch (ghi rõ ngày công, giờ tăng ca hoặc phụ cấp bị thiếu):
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
                    Đính kèm Ảnh minh chứng (&lt;50KB) hoặc Video ngắn (&lt;800KB):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <AppButton
                      variant="secondary"
                      icon={Camera}
                      onClick={() => handlePickDisputeMedia(["camera"])}
                      className="text-xs px-3 py-2"
                    >
                      Chụp ảnh Camera
                    </AppButton>
                    <AppButton
                      variant="secondary"
                      icon={ImageIcon}
                      onClick={() => handlePickDisputeMedia(["album"])}
                      className="text-xs px-3 py-2"
                    >
                      <Video size={14} className="inline mr-1" />
                      Chọn Thư viện / Video
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
                >
                  Gửi Báo Cáo Tới Kế Toán &amp; Admin
                </AppButton>
              </form>
            )}

            {/* HIỂN THỊ KHIẾU NẠI & BẰNG CHỨNG (CHỈ HIỆN KHI ĐANG OPEN / CHƯA GIẢI QUYẾT) */}
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
                    <span className="font-bold text-rose-700 dark:text-rose-300 block mb-1">Nội dung phản ánh của Nhân viên:</span>
                    {disputeReason || item.dispute_reason}
                  </div>
                )}

                {(evidenceMedia || item.dispute_evidence_media) && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                      Hình ảnh / Video bằng chứng đính kèm:
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
                    <div className="flex flex-wrap gap-2">
                      <AppButton
                        variant="success"
                        icon={ShieldCheck}
                        loading={resolving}
                        loadingText="Đang xử lý..."
                        data-testid="slip-resolve-dispute-btn"
                        onClick={() => handleResolveDispute("RESOLVED")}
                        className="text-xs font-bold"
                      >
                        ✓ Đã giải quyết
                      </AppButton>
                      <AppButton
                        variant="secondary"
                        icon={Send}
                        loading={resolving}
                        onClick={() => handleResolveDispute("DISPUTED")}
                        className="bg-slate-700 hover:bg-slate-600 text-white border-slate-600 text-xs font-bold"
                      >
                        Gửi phản hồi (Giữ trạng thái)
                      </AppButton>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Chữ ký xác nhận */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 text-center text-xs text-slate-600 dark:text-slate-300">
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100">Người lập biểu</p>
                <p className="italic text-xs">(Ký, ghi rõ họ tên)</p>
              </div>
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100">Kế toán trưởng</p>
                <p className="italic text-xs">(Ký, ghi rõ họ tên)</p>
              </div>
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100">Giám đốc</p>
                <p className="italic text-xs">(Ký, đóng dấu)</p>
              </div>
              <div>
                <p className="font-bold text-slate-700 dark:text-slate-200">Người nhận tiền</p>
                <p className="font-semibold text-slate-800 dark:text-slate-100 mt-4">
                  {item.ho_ten}
                </p>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppModal>
  );
}
