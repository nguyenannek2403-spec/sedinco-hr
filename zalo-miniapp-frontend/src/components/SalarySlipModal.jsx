import React, { useState, useRef } from "react";
import {
  Printer,
  Download,
  Share2,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Video,
  Image as ImageIcon,
  Send,
  ShieldCheck,
  Calendar
} from "lucide-react";
import { safePost, sanitizeFormula, formatCsvCellRFC4180, generateIdempotencyKey } from "../utils/api";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { compressAndResizeImage, pickCompressedEvidencePhoto } from "../utils/imageHelper";
import { AppButton, AppModal, StatusBadge } from "./ui";

/**
 * SalarySlipModal V5/V12
 * - Xuất Phiếu lương cá nhân ra CSV/Excel chuẩn UTF-8 BOM & Chia sẻ nhanh qua Zalo/Mobile Share
 * - Nhân viên: Xác nhận đúng lương hoặc Báo cáo sai lương kèm Lý do + Ảnh/Video
 * - Bảng đối chiếu công & tăng ca từng ngày
 */
export default function SalarySlipModal({
  payrollItem,
  employee,
  month,
  year,
  isAdminOrAccountant = false,
  showToast,
  onStatusUpdated,
  onClose
}) {
  const item = payrollItem || employee;

  const thang = month || item?.thang || new Date().getMonth() + 1;
  const nam = year || item?.nam || new Date().getFullYear();
  const maNv = item?.ma_nv || item?.id_nhan_vien || "NV";

  const [confirmStatus, setConfirmStatus] = useState(item?.salary_confirm_status || "PENDING");
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState(item?.dispute_reason || "");
  const [evidenceMedia, setEvidenceMedia] = useState(item?.dispute_evidence_media || "");
  const [mediaNotice, setMediaNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Phản hồi của Admin/Kế toán
  const [adminResponse, setAdminResponse] = useState(item?.admin_response || "");
  const [resolving, setResolving] = useState(false);

  const fileInputRef = useRef(null);
  const submittingRef = useRef(false);
  const resolvingRef = useRef(false);

  if (!item) return null;

  const notify = (msg, type = "info") => {
    if (showToast) showToast(msg, type);
  };

  const formatCurrency = (val) => {
    const num = Number(val) || 0;
    return Math.round(num).toLocaleString("vi-VN") + " đ";
  };

  const b = item.allowances_breakdown || {};

  // Nén ảnh (<50KB) hoặc kiểm tra video ngắn (<800KB)
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

  // Công nhân bấm [✅ Xác nhận đúng lương]
  const handleConfirmSalary = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await safePost("/payroll/confirm", {
        month: thang,
        year: nam,
        status: "CONFIRMED"
      }, {
        idempotencyKey: generateIdempotencyKey("pay_confirm")
      });
      if (res?.success) {
        setConfirmStatus("CONFIRMED");
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

  // Công nhân gửi [⚠️ Báo cáo sai lương]
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
        status: "DISPUTED",
        dispute_reason: disputeReason.trim(),
        dispute_evidence_media: evidenceMedia || null
      }, {
        idempotencyKey: generateIdempotencyKey("pay_dispute")
      });
      if (res?.success) {
        setConfirmStatus("DISPUTED");
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

  // Admin / Kế toán xử lý khiếu nại lương
  const handleResolveDispute = async (newStatus) => {
    if (resolvingRef.current) return;
    if (!adminResponse.trim()) {
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
        admin_response: adminResponse.trim(),
        status: newStatus
      }, {
        idempotencyKey: generateIdempotencyKey("pay_resolve")
      });
      if (res?.success) {
        setConfirmStatus(newStatus);
        notify("Đã cập nhật phản hồi xử lý khiếu nại lương!", "success");
        if (onStatusUpdated) onStatusUpdated(newStatus);
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

  // Tải phiếu lương cá nhân ra CSV/Excel
  const handleExportSingleSlipExcel = async () => {
    const rows = [
      ["PHIẾU LƯƠNG ĐIỆN TỬ SEDINCO", `Kỳ lương: Tháng ${thang}/${nam}`],
      ["Mã nhân viên", sanitizeFormula(maNv)],
      ["Họ và tên", sanitizeFormula(item.ho_ten || "")],
      ["Chức danh", sanitizeFormula(item.chuc_danh || "Nhân viên")],
      ["Ngày công thực tế", `${item.totalWorkDays || 0} / ${item.standardDays || 26}`],
      ["Lương cơ bản HĐ", Number(item.baseSalary || 0)],
      ["Lương theo ngày công", Number(item.salaryByWork || 0)],
      ["Tổng phụ cấp", Number(item.totalAllowance || 0)],
      ["Lương tăng ca (OT)", Number(item.otAmount || 0)],
      ["Thưởng thêm", Number(item.bonusAmount || 0)],
      ["Khấu trừ BHXH", -Number(item.totalInsurance || item.insuranceDeduction || 0)],
      ["Phạt đi muộn", -Number(item.latePenaltyAmount || 0)],
      ["Phạt / Khấu trừ khác", -Number(item.penaltyAmount || 0)],
      ["Trừ tạm ứng lương", -Number(item.advanceDeduction || 0)],
      ["THỰC LĨNH (NET)", Number(item.netSalary || 0)],
      ...(Number(item.carryOverDebt || item.carry_over_debt || 0) > 0
        ? [["Khoản nợ chuyển kỳ lương sau", Number(item.carryOverDebt || item.carry_over_debt || 0)]]
        : []),
      ["Trạng thái xác nhận", confirmStatus]
    ];

    const csvContent =
      "\uFEFF" +
      rows.map((r) => r.map((c) => formatCsvCellRFC4180(c)).join(",")).join("\r\n");

    try {
      await zmpAdapter.saveFile({
        filename: `Phieu_Luong_${maNv}_T${thang}_${nam}.csv`,
        content: csvContent,
        mimeType: "text/csv;charset=utf-8;"
      });
      notify("Đã tải xuống Phiếu lương Excel/CSV!", "success");
    } catch (err) {
      notify(err?.message || "Không thể tải xuống phiếu lương lúc này!", "error");
    }
  };

  // Chia sẻ nhanh qua Zalo / Mobile Share
  const handleShareZalo = async () => {
    const shareText = `📄 PHIẾU LƯƠNG SEDINCO - THÁNG ${thang}/${nam}\n👤 NV: ${item.ho_ten} (${maNv})\n📅 Ngày công: ${item.totalWorkDays || 0}/${item.standardDays || 26}\n💰 Thực lĩnh (NET): ${formatCurrency(item.netSalary)}\n📌 Trạng thái: ${confirmStatus === "CONFIRMED" ? "Đã xác nhận" : confirmStatus === "DISPUTED" ? "Đang khiếu nại" : "Chờ xác nhận"}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Phiếu lương T${thang}/${nam} - ${item.ho_ten}`,
          text: shareText
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        notify("Đã sao chép tóm tắt Phiếu lương để dán vào Zalo!", "success");
      }
    } catch (_e) {
      // User cancelled share
    }
  };

  return (
    <AppModal
      open={Boolean(item)}
      onClose={onClose}
      disableClose={submitting || resolving}
      showCloseX={false}
      maxWidthClass="sm:max-w-2xl"
      maxHeightClass="max-h-[92vh]"
      title={`Phiếu lương T${thang}/${nam} — ${maNv}`}
      headerExtra={
        <div className="flex items-center gap-1.5 print:hidden">
          <AppButton
            variant="success"
            icon={Download}
            onClick={handleExportSingleSlipExcel}
            className="min-h-[44px] px-3 py-2 text-xs font-bold"
            title="Tải phiếu lương Excel/CSV"
          >
            Excel
          </AppButton>
          <AppButton
            variant="primary"
            icon={Share2}
            onClick={handleShareZalo}
            className="min-h-[44px] px-3 py-2 text-xs font-bold"
            title="Chia sẻ qua Zalo"
          >
            Zalo
          </AppButton>
          <AppButton
            variant="secondary"
            icon={Printer}
            onClick={() => window.print()}
            className="hidden sm:inline-flex min-h-[44px] px-3 py-2 text-xs font-bold"
          >
            In
          </AppButton>
        </div>
      }
    >
        {/* Nội dung Phiếu Lương */}
        <div className="p-4 sm:p-6 space-y-4 text-slate-800 dark:text-slate-100">
          {/* Quốc hiệu & Tiêu đề công ty — ZaUI E-Receipt Header */}
          <div className="bg-[#0055D4] bg-gradient-to-br from-[#0055D4] via-[#0068FF] to-[#0284C7] dark:bg-slate-800 dark:from-blue-950 dark:via-slate-900 dark:to-teal-950 text-white rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 shadow-sm">
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white uppercase">
                CÔNG TY CỔ PHẦN SEDINCO
              </h2>
              <p className="text-xs text-blue-100 mt-0.5">
                Hệ thống Quản trị Nhân sự &amp; Phiếu lương Điện tử
              </p>
            </div>
            <div className="sm:text-right flex flex-wrap sm:flex-col items-center sm:items-end gap-1.5">
              <span className="inline-block px-3 py-1 bg-blue-900/45 dark:bg-slate-800 border border-white/25 text-white rounded-full text-xs font-extrabold uppercase">
                Kỳ Lương: Tháng {thang}/{nam}
              </span>
              {confirmStatus === "CONFIRMED" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-800/80 border border-emerald-300/40 text-white text-xs font-bold">
                  <CheckCircle2 size={12} /> Đã xác nhận đúng lương
                </span>
              )}
              {confirmStatus === "DISPUTED" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-800/85 border border-rose-300/40 text-white text-xs font-bold">
                  <AlertTriangle size={12} /> Đang khiếu nại sai lương
                </span>
              )}
            </div>
          </div>

          {/* Thông tin nhân sự */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 dark:bg-slate-800/70 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
            <div>
              <span className="text-slate-600 dark:text-slate-400 block text-xs uppercase font-semibold">
                Mã Nhân Viên
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                {maNv}
              </span>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400 block text-xs uppercase font-semibold">
                Họ và Tên
              </span>
              <span className="font-bold text-slate-900 dark:text-white break-words block">
                {item.ho_ten}
              </span>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400 block text-xs font-semibold">
                Chức danh &amp; Bộ phận
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-200 break-words block">
                {item.chuc_danh || "Nhân viên"} • {item.department || "Khối Công trình"}
              </span>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400 block text-xs uppercase font-semibold">
                Ngày Công Thực Tế
              </span>
              <span className="font-extrabold text-emerald-700 dark:text-emerald-300">
                {item.totalWorkDays || 0} / {item.standardDays || 26} công
              </span>
            </div>
          </div>

          {/* Bảng chi tiết thu nhập */}
          <div className="border border-slate-200 dark:border-slate-700/80 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
            <div className="bg-slate-100 dark:bg-slate-800 px-3.5 py-2 text-xs font-extrabold text-slate-600 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 flex justify-between">
              <span>Khoản Mục Thu Nhập & Phụ Cấp</span>
              <span>Số Tiền (VNĐ)</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <div className="px-3.5 py-2.5 flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-300">
                  1. Lương cơ bản hợp đồng (Định mức {item.standardDays || 26} ngày)
                </span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                  {formatCurrency(item.baseSalary)}
                </span>
              </div>

              <div className="px-3.5 py-2.5 flex justify-between items-center bg-slate-50/60 dark:bg-slate-800/40">
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  2. Lương chính theo ngày công ({item.totalWorkDays || 0} ngày)
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {formatCurrency(item.salaryByWork)}
                </span>
              </div>

              <div className="px-3.5 py-2.5">
                <div className="flex justify-between items-center font-semibold text-slate-800 dark:text-slate-100 mb-1.5">
                  <span>3. Tổng các khoản phụ cấp theo công</span>
                  <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                    +{formatCurrency(item.totalAllowance)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pl-3 border-l-2 border-blue-200 dark:border-blue-800/70 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>• Phụ cấp ăn trưa:</span>
                    <span className="font-mono">{formatCurrency(b.an_trua ?? b.an_ca)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Phụ cấp xăng xe:</span>
                    <span className="font-mono">{formatCurrency(b.xang_xe ?? b.xang)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Phụ cấp nhà ở:</span>
                    <span className="font-mono">{formatCurrency(b.nha_o ?? b.doc_hai)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Thưởng hoàn thành CV:</span>
                    <span className="font-mono">{formatCurrency(b.thuong_htcv)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Phụ cấp trách nhiệm:</span>
                    <span className="font-mono">{formatCurrency(b.trach_nhiem)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Phụ cấp tiếp khách / ĐT:</span>
                    <span className="font-mono">{formatCurrency(b.tiep_khach ?? b.dien_thoai)}</span>
                  </div>
                </div>
              </div>

              <div className="px-3.5 py-2.5 flex justify-between items-center">
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  4. Lương làm thêm giờ (Tăng ca / OT: {item.totalOtHours || 0} giờ)
                </span>
                <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                  +{formatCurrency(item.otAmount)}
                </span>
              </div>

              {Number(item.bonusAmount) > 0 && (
                <div className="px-3.5 py-2.5 flex justify-between items-center bg-emerald-50/40 dark:bg-emerald-950/40">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                    5. Thưởng nóng / Phụ cấp thêm
                  </span>
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                    +{formatCurrency(item.bonusAmount)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="zaui-ticket-divider" />

          {/* Khấu trừ & Thực lĩnh */}
          <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
            <div className="bg-slate-100 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
              Khấu trừ & Thực lĩnh
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <div className="px-3.5 py-2.5 flex justify-between text-slate-600 dark:text-slate-300">
                <span>Mức lương đóng BHXH</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                  {formatCurrency(item.insuranceBase || item.baseSalary)}
                </span>
              </div>
              <div className="px-3.5 py-2.5 flex justify-between text-red-600 dark:text-rose-300">
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
                <div className="px-3.5 py-2.5 flex justify-between text-amber-700 dark:text-amber-300">
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

          {/* BẢNG ĐỐI CHIẾU CÔNG TỪNG NGÀY TRONG KỲ LƯƠNG */}
          {Array.isArray(item.daily_logs) && item.daily_logs.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-700/80 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
              <div className="bg-slate-100 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Bảng đối chiếu công từng ngày</span>
                </span>
                <span className="text-slate-500 dark:text-slate-300 font-semibold">{item.daily_logs.length} ngày</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {item.daily_logs.map((log, idx) => {
                  const dateStr = log.record_date_iso || String(log.record_date || "").slice(0, 10);
                  const otH = Number(log.ot_hours) || 0;
                  const lateM = Number(log.late_minutes) || 0;
                  return (
                    <div key={`${dateStr}-${idx}`} className="perf-list-item px-3.5 py-2.5 flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-mono font-bold text-slate-800 dark:text-slate-100">{dateStr}</div>
                        <div className="text-slate-500 dark:text-slate-300 flex flex-wrap items-center gap-2">
                          <span>
                            Vào {log.check_in_time ? String(log.check_in_time).slice(0, 5) : "--:--"}
                            {" • "}
                            Ra {log.check_out_time ? String(log.check_out_time).slice(0, 5) : "--:--"}
                          </span>
                          {otH > 0 && (
                            <span className="text-indigo-700 dark:text-indigo-300 font-semibold">+{otH}h tăng ca</span>
                          )}
                          {lateM > 0 && (
                            <span className="text-amber-700 dark:text-amber-300 font-semibold">Muộn {lateM}p</span>
                          )}
                        </div>
                        {log.location_name && (
                          <div className="text-xs text-slate-600 dark:text-slate-400 break-words">
                            {log.location_name}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <StatusBadge type="attendance" status={log.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* HIỂN THỊ KHIẾU NẠI & BẰNG CHỨNG (NẾU CÓ) */}
          {(confirmStatus === "DISPUTED" || item.dispute_reason || item.admin_response) && (
            <div className="bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-200 dark:border-rose-800/70 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200 font-black text-xs uppercase">
                <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Hồ sơ Báo cáo Sai lệch Lương / Công</span>
              </div>

              { (disputeReason || item.dispute_reason) && (
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

              {/* Khu vực dành riêng cho Admin / Kế toán xử lý khiếu nại */}
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
                      onClick={() => handleResolveDispute("CONFIRMED")}
                      className="text-xs font-bold"
                    >
                      Đã điều chỉnh &amp; Chốt lại
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

          {/* KHU VỰC XÁC NHẬN LƯƠNG DÀNH CHO CÔNG NHÂN */}
          {!isAdminOrAccountant && (
            <div className="bg-slate-50 dark:bg-slate-800/70 border-2 border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 space-y-3 print:hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase">
                  Xác Nhận Phiếu Lương Của Bạn
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-300">
                  {confirmStatus === "CONFIRMED"
                    ? "Đã đồng ý"
                    : confirmStatus === "DISPUTED"
                    ? "Đã gửi báo cáo"
                    : "Chưa xác nhận"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <AppButton
                  variant="success"
                  icon={CheckCircle2}
                  loading={submitting}
                  disabled={confirmStatus === "CONFIRMED"}
                  loadingText="Đang xác nhận..."
                  onClick={handleConfirmSalary}
                  className={
                    confirmStatus === "CONFIRMED"
                      ? "!bg-emerald-100 !text-emerald-800 !border-emerald-300 dark:!bg-emerald-950/70 dark:!text-emerald-200 dark:!border-emerald-700"
                      : ""
                  }
                >
                  {confirmStatus === "CONFIRMED"
                    ? "✅ Đã Xác Nhận Đúng Lương"
                    : "✅ Xác Nhận Đúng Lương"}
                </AppButton>

                <AppButton
                  variant="warning"
                  icon={AlertTriangle}
                  disabled={submitting}
                  onClick={() => setShowDisputeForm((v) => !v)}
                >
                  ⚠️ Báo Cáo Sai Lương
                </AppButton>
              </div>

              {/* Form Báo cáo sai lương đính kèm Ảnh nén (<50KB) / Video ngắn (<800KB) */}
              {showDisputeForm && (
                <form
                  onSubmit={handleSubmitDispute}
                  className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3"
                >
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
                          📷 Chụp ảnh Camera
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
        </div>
    </AppModal>
  );
}
