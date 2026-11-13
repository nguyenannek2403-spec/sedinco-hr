import React, { useState, useRef } from "react";
import {
  ArrowLeft,
  Printer,
  Download,
  Share2,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Video,
  Send,
  ShieldCheck,
  Loader2,
  Calendar
} from "lucide-react";
import { safePost, sanitizeFormula, formatCsvCellRFC4180, generateIdempotencyKey } from "../utils/api";
import { compressAndResizeImage } from "../utils/imageHelper";
import useLockBodyScroll from "../hooks/useLockBodyScroll";
import { getAttendanceStatusInfo } from "../utils/viLabels";

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
  useLockBodyScroll(Boolean(item));
  if (!item) return null;

  const thang = month || item.thang || new Date().getMonth() + 1;
  const nam = year || item.nam || new Date().getFullYear();
  const maNv = item.ma_nv || item.id_nhan_vien || "NV";

  const [confirmStatus, setConfirmStatus] = useState(item.salary_confirm_status || "PENDING");
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState(item.dispute_reason || "");
  const [evidenceMedia, setEvidenceMedia] = useState(item.dispute_evidence_media || "");
  const [mediaNotice, setMediaNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Phản hồi của Admin/Kế toán
  const [adminResponse, setAdminResponse] = useState(item.admin_response || "");
  const [resolving, setResolving] = useState(false);

  const fileInputRef = useRef(null);
  const submittingRef = useRef(false);
  const resolvingRef = useRef(false);

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
  const handleExportSingleSlipExcel = () => {
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
      ["Trạng thái xác nhận", confirmStatus]
    ];

    const csvContent =
      "\uFEFF" +
      rows.map((r) => r.map((c) => formatCsvCellRFC4180(c)).join(",")).join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Phieu_Luong_${maNv}_T${thang}_${nam}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify("Đã tải xuống Phiếu lương Excel/CSV!", "success");
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
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 print:p-0 print:bg-white animate-fade-in"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)"
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-sheet-up print:shadow-none print:border-none print:max-w-full print:max-h-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Action Bar: Trở về ở góc trái để tránh cụm nút Zalo top-right */}
        <div className="bg-slate-900 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0 print:hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition active:scale-[0.98]"
            >
              <ArrowLeft size={15} />
              <span>Trở về</span>
            </button>
            <div className="min-w-0">
              <h3 className="font-bold text-xs sm:text-sm tracking-wide leading-snug break-words">
                Phiếu lương T{thang}/{nam} — {maNv}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleExportSingleSlipExcel}
              className="min-h-[38px] px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
              title="Tải phiếu lương Excel/CSV"
            >
              <Download size={14} />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={handleShareZalo}
              className="min-h-[38px] px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
              title="Chia sẻ qua Zalo"
            >
              <Share2 size={14} />
              <span>Zalo</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden sm:flex min-h-[38px] px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold items-center gap-1 transition cursor-pointer"
            >
              <Printer size={14} />
              <span>In</span>
            </button>
          </div>
        </div>

        {/* Nội dung Phiếu Lương */}
        <div
          className="modal-scroll-area p-4 sm:p-6 space-y-4 text-slate-800 overflow-y-auto overscroll-contain touch-pan-y flex-1"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          {/* Quốc hiệu & Tiêu đề công ty */}
          <div className="border-b-2 border-slate-800 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 uppercase">
                CÔNG TY CỔ PHẦN SEDINCO
              </h2>
              <p className="text-[11px] text-slate-500">
                Hệ thống Quản trị Nhân sự & Phiếu lương Điện tử
              </p>
            </div>
            <div className="sm:text-right flex sm:flex-col items-center sm:items-end gap-2">
              <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-extrabold uppercase">
                Kỳ Lương: Tháng {thang}/{nam}
              </span>
              {confirmStatus === "CONFIRMED" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black">
                  <CheckCircle2 size={12} /> Đã xác nhận đúng lương
                </span>
              )}
              {confirmStatus === "DISPUTED" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-black">
                  <AlertTriangle size={12} /> Đang khiếu nại sai lương
                </span>
              )}
            </div>
          </div>

          {/* Thông tin nhân sự */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                Mã Nhân Viên
              </span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {maNv}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                Họ và Tên
              </span>
              <span className="font-bold text-slate-900 truncate block">
                {item.ho_ten}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px] font-semibold">
                Chức danh &amp; Bộ phận
              </span>
              <span className="font-semibold text-slate-700 break-words block">
                {item.chuc_danh || "Nhân viên"} • {item.department || "Khối Công trình"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                Ngày Công Thực Tế
              </span>
              <span className="font-extrabold text-emerald-700">
                {item.totalWorkDays || 0} / {item.standardDays || 26} công
              </span>
            </div>
          </div>

          {/* Bảng chi tiết thu nhập */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100 px-3.5 py-2 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider border-b border-slate-200 flex justify-between">
              <span>Khoản Mục Thu Nhập & Phụ Cấp</span>
              <span>Số Tiền (VNĐ)</span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="px-3.5 py-2.5 flex justify-between items-center">
                <span className="text-slate-600">
                  1. Lương cơ bản hợp đồng (Định mức {item.standardDays || 26} ngày)
                </span>
                <span className="font-mono font-semibold text-slate-700">
                  {formatCurrency(item.baseSalary)}
                </span>
              </div>

              <div className="px-3.5 py-2.5 flex justify-between items-center bg-slate-50/60">
                <span className="font-semibold text-slate-800">
                  2. Lương chính theo ngày công ({item.totalWorkDays || 0} ngày)
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {formatCurrency(item.salaryByWork)}
                </span>
              </div>

              <div className="px-3.5 py-2.5">
                <div className="flex justify-between items-center font-semibold text-slate-800 mb-1.5">
                  <span>3. Tổng các khoản phụ cấp theo công</span>
                  <span className="font-mono font-bold text-blue-700">
                    +{formatCurrency(item.totalAllowance)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pl-3 border-l-2 border-blue-200 text-xs text-slate-600">
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
                <span className="font-semibold text-slate-800">
                  4. Lương làm thêm giờ (Tăng ca / OT: {item.totalOtHours || 0} giờ)
                </span>
                <span className="font-mono font-bold text-indigo-700">
                  +{formatCurrency(item.otAmount)}
                </span>
              </div>

              {Number(item.bonusAmount) > 0 && (
                <div className="px-3.5 py-2.5 flex justify-between items-center bg-emerald-50/40">
                  <span className="font-semibold text-emerald-800">
                    5. Thưởng nóng / Phụ cấp thêm
                  </span>
                  <span className="font-mono font-bold text-emerald-700">
                    +{formatCurrency(item.bonusAmount)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Khấu trừ & Thực lĩnh */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-600 border-b border-slate-200">
              Khấu trừ & Thực lĩnh
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              <div className="px-3.5 py-2.5 flex justify-between text-slate-600">
                <span>Mức lương đóng BHXH</span>
                <span className="font-mono font-semibold">
                  {formatCurrency(item.insuranceBase || item.baseSalary)}
                </span>
              </div>
              <div className="px-3.5 py-2.5 flex justify-between text-red-600">
                <span>Khấu trừ BHXH, BHYT, BHTN</span>
                <span className="font-mono font-bold">
                  -{formatCurrency(item.totalInsurance || item.insuranceDeduction)}
                </span>
              </div>
              {Number(item.latePenaltyAmount) > 0 && (
                <div className="px-3.5 py-2.5 flex justify-between text-rose-600">
                  <span>Khấu trừ đi muộn ({item.totalLateMinutes || 0} phút)</span>
                  <span className="font-mono font-bold">
                    -{formatCurrency(item.latePenaltyAmount)}
                  </span>
                </div>
              )}
              {Number(item.penaltyAmount) > 0 && (
                <div className="px-3.5 py-2.5 flex justify-between text-rose-600">
                  <span>Khấu trừ phạt / Vi phạm</span>
                  <span className="font-mono font-bold">
                    -{formatCurrency(item.penaltyAmount)}
                  </span>
                </div>
              )}
              {Number(item.advanceDeduction) > 0 && (
                <div className="px-3.5 py-2.5 flex justify-between text-amber-700">
                  <span>Trừ tiền đã tạm ứng lương</span>
                  <span className="font-mono font-bold">
                    -{formatCurrency(item.advanceDeduction)}
                  </span>
                </div>
              )}
              {item.adjustment_note && (
                <div className="px-3.5 py-2 bg-slate-50 text-xs text-slate-600">
                  <span className="font-semibold">Ghi chú kế toán: </span>
                  {item.adjustment_note}
                </div>
              )}
              <div className="px-3.5 py-3 flex justify-between bg-emerald-50 font-bold text-sm">
                <span className="text-emerald-900">
                  Thực lĩnh cuối cùng (NET)
                </span>
                <span className="text-emerald-700 font-mono text-base">
                  {formatCurrency(item.netSalary)}
                </span>
              </div>
            </div>
          </div>

          {/* BẢNG ĐỐI CHIẾU CÔNG TỪNG NGÀY TRONG KỲ LƯƠNG */}
          {Array.isArray(item.daily_logs) && item.daily_logs.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 border-b border-slate-200 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-600 shrink-0" />
                  <span>Bảng đối chiếu công từng ngày</span>
                </span>
                <span className="text-slate-500 font-semibold">{item.daily_logs.length} ngày</span>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {item.daily_logs.map((log, idx) => {
                  const dateStr = log.record_date_iso || String(log.record_date || "").slice(0, 10);
                  const statusInfo = getAttendanceStatusInfo(log.status);
                  const otH = Number(log.ot_hours) || 0;
                  const lateM = Number(log.late_minutes) || 0;
                  return (
                    <div key={`${dateStr}-${idx}`} className="px-3.5 py-2.5 flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-mono font-bold text-slate-800">{dateStr}</div>
                        <div className="text-slate-500 flex flex-wrap items-center gap-2">
                          <span>
                            Vào {log.check_in_time ? String(log.check_in_time).slice(0, 5) : "--:--"}
                            {" • "}
                            Ra {log.check_out_time ? String(log.check_out_time).slice(0, 5) : "--:--"}
                          </span>
                          {otH > 0 && (
                            <span className="text-indigo-700 font-semibold">+{otH}h tăng ca</span>
                          )}
                          {lateM > 0 && (
                            <span className="text-amber-700 font-semibold">Muộn {lateM}p</span>
                          )}
                        </div>
                        {log.location_name && (
                          <div className="text-[11px] text-slate-500 break-words">
                            {log.location_name}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-semibold ${statusInfo.badgeClass}`}>
                          {statusInfo.shortLabel}
                        </span>
                        <div className="text-[11px] font-bold text-slate-700 mt-0.5">
                          {statusInfo.creditText}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* HIỂN THỊ KHIẾU NẠI & BẰNG CHỨNG (NẾU CÓ) */}
          {(confirmStatus === "DISPUTED" || item.dispute_reason || item.admin_response) && (
            <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-rose-800 font-black text-xs uppercase">
                <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                <span>Hồ sơ Báo cáo Sai lệch Lương / Công</span>
              </div>

              { (disputeReason || item.dispute_reason) && (
                <div className="text-xs text-slate-800 bg-white p-3 rounded-xl border border-rose-200">
                  <span className="font-bold text-rose-700 block mb-1">Nội dung phản ánh của Nhân viên:</span>
                  {disputeReason || item.dispute_reason}
                </div>
              )}

              {(evidenceMedia || item.dispute_evidence_media) && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-600 block">
                    Hình ảnh / Video bằng chứng đính kèm:
                  </span>
                  {(evidenceMedia || item.dispute_evidence_media).startsWith("data:video") ? (
                    <video
                      src={evidenceMedia || item.dispute_evidence_media}
                      controls
                      className="w-full max-h-56 rounded-xl border border-slate-300 bg-black"
                    />
                  ) : (
                    <img
                      src={evidenceMedia || item.dispute_evidence_media}
                      alt="Minh chứng lương"
                      className="w-full max-h-60 object-contain rounded-xl border border-slate-300 bg-white"
                    />
                  )}
                </div>
              )}

              {(adminResponse || item.admin_response) && !isAdminOrAccountant && (
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs text-emerald-950">
                  <span className="font-black text-emerald-800 block mb-0.5">
                    Phản hồi từ Phòng Kế toán / Admin:
                  </span>
                  {adminResponse || item.admin_response}
                </div>
              )}

              {/* Khu vực dành riêng cho Admin / Kế toán xử lý khiếu nại */}
              {isAdminOrAccountant && (
                <div className="pt-2 border-t border-rose-200 space-y-2.5">
                  <label className="block text-xs font-black text-slate-800">
                    Phản hồi giải quyết của Kế toán / Admin:
                  </label>
                  <textarea
                    rows={2}
                    value={adminResponse}
                    onChange={(e) => setAdminResponse(e.target.value)}
                    placeholder="Nhập kết quả kiểm tra lại bảng công/lương cho nhân viên..."
                    className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={resolving}
                      onClick={() => handleResolveDispute("CONFIRMED")}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {resolving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      <span>{resolving ? "Đang xử lý..." : "Đã điều chỉnh & Chốt lại"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={resolving}
                      onClick={() => handleResolveDispute("DISPUTED")}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {resolving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      <span>Gửi phản hồi (Giữ trạng thái)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* KHU VỰC XÁC NHẬN LƯƠNG DÀNH CHO CÔNG NHÂN */}
          {!isAdminOrAccountant && (
            <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 space-y-3 print:hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 uppercase">
                  Xác Nhận Phiếu Lương Của Bạn
                </span>
                <span className="text-[11px] font-bold text-slate-500">
                  {confirmStatus === "CONFIRMED"
                    ? "Đã đồng ý"
                    : confirmStatus === "DISPUTED"
                    ? "Đã gửi báo cáo"
                    : "Chưa xác nhận"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={submitting || confirmStatus === "CONFIRMED"}
                  onClick={handleConfirmSalary}
                  className={`py-3 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 ${
                    confirmStatus === "CONFIRMED"
                      ? "bg-emerald-100 text-emerald-800 border-2 border-emerald-300"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md"
                  }`}
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  <span>
                    {submitting
                      ? "Đang xác nhận..."
                      : confirmStatus === "CONFIRMED"
                      ? "✅ Đã Xác Nhận Đúng Lương"
                      : "✅ Xác Nhận Đúng Lương"}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setShowDisputeForm((v) => !v)}
                  className="py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                >
                  <AlertTriangle size={16} />
                  <span>⚠️ Báo Cáo Sai Lương</span>
                </button>
              </div>

              {/* Form Báo cáo sai lương đính kèm Ảnh nén (<50KB) / Video ngắn (<800KB) */}
              {showDisputeForm && (
                <form
                  onSubmit={handleSubmitDispute}
                  className="mt-3 pt-3 border-t border-slate-200 space-y-3"
                >
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Lý do sai lệch (ghi rõ ngày công, giờ tăng ca hoặc phụ cấp bị thiếu):
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder="VD: Ngày 12/11 em có tăng ca 2 tiếng nhưng chưa thấy cộng vào phiếu lương..."
                      className="w-full p-3 text-xs bg-white border-2 border-slate-300 rounded-xl focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-600">
                        Đính kèm Ảnh minh chứng (&lt;50KB) hoặc Video ngắn (&lt;800KB):
                      </span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Camera size={13} />
                        <Video size={13} />
                        <span>Chọn Ảnh / Video</span>
                      </button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleSelectEvidenceFile}
                      className="hidden"
                    />
                    {mediaNotice && (
                      <p className="text-[11px] text-emerald-700 font-bold">{mediaNotice}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    <span>{submitting ? "Đang gửi báo cáo..." : "Gửi Báo Cáo Tới Kế Toán & Admin"}</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Chữ ký xác nhận */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 text-center text-[11px] text-slate-500">
            <div>
              <p className="font-bold text-slate-700">Người lập biểu</p>
              <p className="italic text-[10px]">(Ký, ghi rõ họ tên)</p>
            </div>
            <div>
              <p className="font-bold text-slate-700">Kế toán trưởng</p>
              <p className="italic text-[10px]">(Ký, ghi rõ họ tên)</p>
            </div>
            <div>
              <p className="font-bold text-slate-700">Giám đốc</p>
              <p className="italic text-[10px]">(Ký, đóng dấu)</p>
            </div>
            <div>
              <p className="font-bold text-slate-700">Người nhận tiền</p>
              <p className="font-semibold text-slate-800 mt-4">
                {item.ho_ten}
              </p>
            </div>
          </div>
        </div>

        {/* Nút đóng lớn ở đáy Modal */}
        <div
          className="px-4 py-3 border-t border-slate-200 bg-slate-50 shrink-0 print:hidden"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 min-h-[46px] bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition active:scale-[0.98] cursor-pointer"
          >
            Đóng / Quay lại
          </button>
        </div>
      </div>
    </div>
  );
}
