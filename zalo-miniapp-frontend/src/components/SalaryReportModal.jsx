import React, { useState } from "react";
import {
  CheckCircle2,
  MessageSquareShare,
  FileSpreadsheet,
  Send
} from "lucide-react";
import { AppButton, AppModal, UserAvatar } from "./ui";
import { zmpAdapter } from "../adapters/zmp/sdkAdapter";
import { exportEmployeeSalaryExcel } from "../utils/salaryExcelExport";
import { formatViCurrency, formatViWorkday } from "../utils/viNumberFormat";
import { getMonthlyStandardWorkdays } from "../utils/workdayUtils";

/**
 * SalaryReportModal V45
 * - Mở ngay sau khi Quản trị viên bấm [Gửi báo cáo] cho một nhân viên
 * - Cung cấp 2 tiện ích 1 chạm:
 *   1. [Chia sẻ qua tin nhắn Zalo]: gọi zmp-sdk openShareSheet (+ fallback copy)
 *   2. [Xuất file Excel (.xlsx)]: xuất trực tiếp file Excel chi tiết bằng SheetJS (xlsx)
 */
export default function SalaryReportModal({
  open,
  onClose,
  item,
  month,
  year,
  showToast
}) {
  const [sharing, setSharing] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!open || !item) return null;

  const maNv = item.ma_nv || item.id_nhan_vien || "";
  const thang = Number(item.thang || month || new Date().getMonth() + 1);
  const nam = Number(item.nam || year || new Date().getFullYear());
  const netSalary = Math.max(0, Math.round(Number(item.netSalary) || 0));
  const totalWorkDays = Number(item.totalWorkDays || 0);
  const stdWorkDays = Number(item.standardWorkDays || item.standardDays || getMonthlyStandardWorkdays(thang, nam));

  const shareMessage = [
    `📩 BÁO CÁO XÁC NHẬN LƯƠNG THÁNG ${thang}/${nam} — SEDINCO`,
    `👤 Nhân viên: ${item.ho_ten || maNv} (${maNv})`,
    `📅 Tổng công: ${formatViWorkday(totalWorkDays)} / ${formatViWorkday(stdWorkDays)} công`,
    `💰 Thực lĩnh (NET): ${formatViCurrency(netSalary)}`,
    `👉 Vui lòng mở Zalo Mini App Sedinco HR để kiểm tra chi tiết & bấm Xác nhận lương.`
  ].join("\n");

  const handleShareViaZalo = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const res = await zmpAdapter.openShareSheet({
        type: "text",
        data: {
          text: shareMessage,
          description: `Báo cáo lương Tháng ${thang}/${nam} - ${item.ho_ten || maNv}`,
          autoParseLink: false
        },
        fallbackText: shareMessage
      });
      if (res?.cancelled) return;
      if (res?.method === "zmp") {
        showToast?.("Đã mở chia sẻ báo cáo lương qua Zalo!", "success");
      } else if (res?.method === "clipboard") {
        showToast?.("Đã sao chép nội dung báo cáo lương để dán gửi qua Zalo!", "success");
      } else if (res?.success) {
        showToast?.("Đã chia sẻ báo cáo lương!", "success");
      }
    } catch (err) {
      showToast?.(err?.message || "Không thể mở chia sẻ Zalo lúc này.", "error");
    } finally {
      setSharing(false);
    }
  };

  const handleExportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { filename } = await exportEmployeeSalaryExcel(item, {
        month: thang,
        year: nam
      });
      showToast?.(`Đã xuất file Excel phiếu lương ${filename}!`, "success");
    } catch (err) {
      showToast?.(err?.message || "Không thể xuất file Excel phiếu lương.", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppModal
      open={Boolean(open && item)}
      onClose={onClose}
      nested={true}
      maxWidthClass="sm:max-w-md"
      icon={
        <UserAvatar
          name={item.ho_ten || maNv}
          avatarUrl={item.avatar_url}
          size="sm"
        />
      }
      title={`Gửi & Chia sẻ Báo cáo Lương T${thang}/${nam}`}
      subtitle={`${item.ho_ten || maNv} • ${maNv}`}
      footer={
        <AppButton
          variant="secondary"
          fullWidth
          onClick={onClose}
          data-testid="salary-report-close-btn"
        >
          Đóng
        </AppButton>
      }
    >
      <div data-testid="salary-report-modal-body" className="p-4 sm:p-5 space-y-4">
        {/* Banner xác nhận đã bắn thông báo in-app */}
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 p-3.5 flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-200">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <div className="space-y-0.5">
            <div className="font-extrabold">
              Đã gửi thông báo xác nhận lên Zalo Mini App của {item.ho_ten || maNv}
            </div>
            <div className="text-emerald-700 dark:text-emerald-300">
              Trạng thái: <span className="font-bold">Đã gửi báo cáo — Chờ xác nhận</span>. Bạn có thể chia sẻ thêm qua Zalo Chat hoặc tải file Excel dưới đây.
            </div>
          </div>
        </div>

        {/* Tóm tắt phiếu lương */}
        <div className="rounded-2xl bg-[#F4F6FA] dark:bg-slate-800/85 border border-slate-200 dark:border-slate-700 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-semibold">Họ và tên</span>
            <span className="font-extrabold text-[#111C2D] dark:text-white text-right">
              {item.ho_ten} ({maNv})
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-semibold">Kỳ lương</span>
            <span className="font-bold text-[#111C2D] dark:text-slate-100">
              Tháng {thang}/{nam}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-semibold">Ngày công</span>
            <span className="font-mono font-bold text-[#111C2D] dark:text-slate-100">
              {formatViWorkday(totalWorkDays)} / {formatViWorkday(stdWorkDays)} công
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-700">
            <span className="text-slate-600 dark:text-slate-300 font-bold">Thực lĩnh (NET)</span>
            <span className="text-base font-black font-mono text-[#E11D48] dark:text-rose-300">
              {formatViCurrency(netSalary)}
            </span>
          </div>
        </div>

        {/* 2 nút hành động chia sẻ Zalo & Xuất file Excel */}
        <div className="space-y-2.5">
          <AppButton
            variant="zalo"
            fullWidth
            icon={MessageSquareShare}
            loading={sharing}
            loadingText="Đang mở Zalo..."
            data-testid="report-share-zalo-btn"
            onClick={handleShareViaZalo}
            className="min-h-[48px] rounded-xl font-extrabold"
          >
            💬 Chia sẻ qua tin nhắn Zalo
          </AppButton>

          <AppButton
            variant="success"
            fullWidth
            icon={FileSpreadsheet}
            loading={exporting}
            loadingText="Đang xuất Excel..."
            data-testid="report-export-xlsx-btn"
            onClick={handleExportExcel}
            className="min-h-[48px] rounded-xl font-extrabold"
          >
            📥 Xuất file Excel (.xlsx)
          </AppButton>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center flex items-center justify-center gap-1">
          <Send className="w-3 h-3 shrink-0" />
          <span>File Excel gồm Phiếu lương chi tiết &amp; Bảng chấm công từng ngày</span>
        </p>
      </div>
    </AppModal>
  );
}
