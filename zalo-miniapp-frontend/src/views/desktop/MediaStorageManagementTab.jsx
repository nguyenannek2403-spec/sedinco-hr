import React, { useState, useEffect, useCallback } from "react";
import {
  HardDrive,
  RefreshCw,
  Trash2,
  ShieldAlert,
  Image as ImageIcon,
  FileText,
  Video,
  Eye,
  Filter,
  Search,
  Sparkles,
  ChevronDown,
  RotateCcw,
  Loader2,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { zaloMediaService } from "../../services/zalo-media.service";
import { formatViNumber } from "../../utils/viNumberFormat";
import { AppModal, SkeletonList, EmptyState, SecureMediaPreview } from "../../components/ui";
import ConfirmDialog from "../../components/ConfirmDialog";

function formatBytes(raw) {
  const bytes = Number(raw) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatViNumber(bytes / 1024, 1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${formatViNumber(bytes / (1024 * 1024), 2)} MB`;
  return `${formatViNumber(bytes / (1024 * 1024 * 1024), 2)} GB`;
}

function formatDateTimeVi(val) {
  if (!val) return "Chưa đồng bộ";
  try {
    return new Date(val).toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return String(val);
  }
}

const THRESHOLD_BADGES = {
  NORMAL: {
    label: "Bình thường",
    cls: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700"
  },
  WARNING: {
    label: "Cảnh báo (>=70%)",
    cls: "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
  },
  CRITICAL: {
    label: "Nghiêm trọng (>=85%)",
    cls: "bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-700"
  },
  RESTRICTED: {
    label: "Hạn chế upload (>=95%)",
    cls: "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700"
  },
  EXHAUSTED: {
    label: "Đầy hạn mức (100%)",
    cls: "bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border-rose-400"
  },
  UNBOUNDED_MONITORING: {
    label: "Bình thường",
    cls: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700"
  }
};

const CATEGORY_LABELS = {
  employee_avatar: "Ảnh đại diện",
  employee_document: "Hồ sơ nhân viên",
  attendance_evidence: "Chấm công",
  leave_evidence: "Đơn xin nghỉ",
  attendance_adjustment: "Điều chỉnh công",
  overtime_evidence: "Tăng ca",
  shift_change_evidence: "Đổi ca",
  business_trip_document: "Công tác",
  accounting_attachment: "Kế toán / Lương",
  company_branding: "Logo công ty"
};

const COMPACT_BTN_BASE =
  "w-fit h-[36px] min-h-[36px] px-3.5 text-[13.5px] font-semibold rounded-lg whitespace-nowrap inline-flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-60 shrink-0";

const COMPACT_INPUT_CLASS =
  "w-full h-[40px] min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px] font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none";

const ROW_ACTION_BTN_BASE =
  "w-fit h-[32px] min-h-[32px] px-2.5 text-[12.5px] font-semibold rounded-lg whitespace-nowrap inline-flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer disabled:opacity-60 shrink-0";

const LABEL_CLASS =
  "block text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 mb-1 whitespace-normal break-words overflow-visible leading-snug";

const HELPER_TEXT_CLASS =
  "text-[12px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug mt-1";

/**
 * SmartAccordion V63 — Bố cục 2 tầng không bao giờ cắt chữ (Zero-Truncation)
 */
function SmartAccordion({
  id,
  title,
  summary,
  icon: Icon,
  iconColor = "text-[#E11D48] dark:text-rose-300",
  iconBg = "bg-[#FFE4E6] dark:bg-rose-950/60",
  isOpen,
  isDirty = false,
  onToggle,
  children
}) {
  return (
    <div
      data-testid={`media-accordion-${id}`}
      data-open={isOpen ? "true" : "false"}
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/85 dark:border-slate-800 shadow-xs transition-all"
    >
      <button
        type="button"
        data-testid={`media-accordion-header-${id}`}
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        className="w-full min-h-[58px] py-3 px-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors text-left cursor-pointer rounded-xl"
      >
        {/* Tầng 1: Icon + Tiêu đề chức năng bên trái, Mũi tên bên phải */}
        <div className="flex items-start justify-between gap-2.5 w-full">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div
              className={`w-8 h-8 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}
            >
              <Icon className="w-4 h-4" />
            </div>
            <h3 className="flex-1 min-w-0 text-[14px] font-semibold text-slate-900 dark:text-slate-100 whitespace-normal break-words overflow-visible leading-snug pt-0.5">
              {title}
            </h3>
          </div>

          <ChevronDown
            className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 shrink-0 mt-1 ${
              isOpen ? "rotate-180" : "rotate-0"
            }`}
          />
        </div>

        {/* Tầng 2: Dòng mô tả / tóm tắt động trải trọn 100% chiều rộng */}
        <div className="w-full mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p
            data-testid={`media-accordion-summary-${id}`}
            className="flex-1 min-w-0 text-[12.5px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug"
          >
            {summary}
          </p>

          {isDirty && (
            <span
              data-testid={`unsaved-badge-${id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-[11px] font-semibold whitespace-nowrap shrink-0"
            >
              ● Chưa lưu
            </span>
          )}
        </div>
      </button>

      {isOpen && (
        <div className="px-3.5 pb-3.5 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

export default function MediaStorageManagementTab({ showToast }) {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [assetsData, setAssetsData] = useState({ items: [], total: 0, page: 1, limit: 20 });
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [syncingUsage, setSyncingUsage] = useState(false);
  const [runningCleanup, setRunningCleanup] = useState(false);
  const [orphanPreview, setOrphanPreview] = useState(null);
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingAsset, setDeletingAsset] = useState(false);
  const [previewAsset, setPreviewAsset] = useState(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  const [openSections, setOpenSections] = useState({
    media_quota: true,
    media_maintenance: false,
    media_assets: false
  });

  const toggleSection = useCallback((id) => {
    const isMobileViewport =
      typeof window !== "undefined" && Number(window.innerWidth) < 768;
    setOpenSections((prev) => {
      const nextState = !prev[id];
      if (isMobileViewport) {
        return {
          media_quota: false,
          media_maintenance: false,
          media_assets: false,
          [id]: nextState
        };
      }
      return {
        ...prev,
        [id]: nextState
      };
    });
  }, []);

  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    category: "",
    ma_nv: "",
    resourceType: "",
    status: ""
  });

  const cleanFilterParams = useCallback((obj) => {
    const out = {};
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v !== "" && v !== null && v !== undefined) out[k] = v;
    });
    return out;
  }, []);

  const loadData = useCallback(
    async (page = 1) => {
      setLoading(true);
      setAssetsLoading(true);
      try {
        const fParams = cleanFilterParams(filters);
        const [dashRes, listRes] = await Promise.all([
          zaloMediaService.getAdminMediaDashboard(fParams),
          zaloMediaService.getAdminMediaAssets({ ...fParams, page, limit: 20 })
        ]);
        if (dashRes?.success) setDashboard(dashRes.data);
        if (listRes?.success) setAssetsData(listRes.data);
      } catch (err) {
        showToast?.(err?.message || "Không thể tải báo cáo dung lượng media.", "error");
      } finally {
        setLoading(false);
        setAssetsLoading(false);
      }
    },
    [filters, cleanFilterParams, showToast]
  );

  useEffect(() => {
    loadData(1);
  }, [loadData]);

  const handleSyncUsage = async () => {
    setSyncingUsage(true);
    try {
      const res = await zaloMediaService.syncAdminCloudinaryUsage();
      showToast?.(res?.message || "Đã đồng bộ thông số Cloudinary!", "success");
      await loadData(assetsData.page || 1);
    } catch (err) {
      showToast?.(err?.message || "Không thể đồng bộ Cloudinary Usage API.", "error");
    } finally {
      setSyncingUsage(false);
    }
  };

  const handleDryRunOrphanScan = async () => {
    setRunningCleanup(true);
    try {
      const res = await zaloMediaService.cleanupAdminOrphanAssets({ dryRun: true });
      setOrphanPreview(res?.data || null);
      if (res?.data?.eligible > 0) {
        setConfirmCleanupOpen(true);
      } else {
        showToast?.("Không có tệp mồ côi nào quá hạn retention cần dọn dẹp.", "success");
      }
    } catch (err) {
      showToast?.(err?.message || "Lỗi kiểm tra tệp mồ côi.", "error");
    } finally {
      setRunningCleanup(false);
    }
  };

  const handleExecuteCleanup = async () => {
    setRunningCleanup(true);
    try {
      const res = await zaloMediaService.cleanupAdminOrphanAssets({ dryRun: false });
      setConfirmCleanupOpen(false);
      setOrphanPreview(null);
      showToast?.(res?.message || "Đã dọn dẹp tệp mồ côi an toàn!", "success");
      await loadData(1);
    } catch (err) {
      showToast?.(err?.message || "Không thể thực thi dọn dẹp tệp mồ côi.", "error");
    } finally {
      setRunningCleanup(false);
    }
  };

  const handleConfirmDeleteAsset = async () => {
    if (!deleteTarget) return;
    setDeletingAsset(true);
    try {
      const res = await zaloMediaService.deleteMediaAsset(
        deleteTarget.asset_uuid,
        "ADMIN_MEDIA_STORAGE_DELETE"
      );
      setDeleteTarget(null);
      showToast?.(res?.message || "Đã xóa tài nguyên media an toàn!", "success");
      await loadData(assetsData.page || 1);
    } catch (err) {
      showToast?.(
        err?.message ||
          "Không thể xóa tài nguyên này (có thể đang được hồ sơ/đơn từ sử dụng).",
        "error"
      );
    } finally {
      setDeletingAsset(false);
    }
  };

  if (loading && !dashboard) {
    return (
      <div className="max-w-3xl mx-auto py-3">
        <SkeletonList rows={3} label="Đang tải thống kê lưu trữ Cloudinary..." />
      </div>
    );
  }

  const cloud = dashboard?.cloudinary_account || {};
  const quota = dashboard?.quota || {};
  const summary = dashboard?.summary || {};
  const snapshot = quota.latest_snapshot || null;
  const badge = THRESHOLD_BADGES[quota.threshold_state] || THRESHOLD_BADGES.UNBOUNDED_MONITORING;

  const usedBytes = Number(quota.effective_used_bytes ?? summary.active_bytes ?? 0);
  const budgetBytes = Number(quota.budget_bytes || 25 * 1024 * 1024 * 1024);
  const percentBar = Math.min(
    100,
    Math.max(
      0,
      Number(
        quota.current_percent !== undefined && quota.current_percent !== null
          ? quota.current_percent
          : (usedBytes / budgetBytes) * 100
      )
    )
  );

  const usedMbStr = `${formatViNumber(usedBytes / (1024 * 1024), 2)} MB`;
  const budgetGbStr = `${formatViNumber(budgetBytes / (1024 * 1024 * 1024), 1)} GB`;

  const advancedFilterCount = [
    filters.category,
    filters.startDate,
    filters.endDate,
    filters.resourceType,
    filters.status
  ].filter(Boolean).length;
  const totalActiveFilterCount = Object.values(filters).filter(Boolean).length;

  const quotaSummary = `Đã dùng ${usedMbStr} / ${budgetGbStr} (${formatViNumber(
    percentBar,
    1
  )}%) • ${badge.label}`;

  const maintenanceSummary = `${summary.orphan_files || 0} tệp mồ côi chờ dọn • Lưu giữ 24 giờ`;

  const assetsSummary = `${assetsData.total || 0} tệp đang lưu trữ${
    totalActiveFilterCount > 0 ? " • Đang lọc" : ""
  }`;

  const totalPages = Math.max(
    1,
    Math.ceil(Number(assetsData.total || 0) / Number(assetsData.limit || 20))
  );

  return (
    <div
      data-testid="admin-media-storage-management"
      className="max-w-3xl mx-auto pb-6 space-y-2.5 sm:space-y-3"
    >
      {/* KHỐI ACCORDION 1: DUNG LƯỢNG & HẠN MỨC CLOUDINARY */}
      <SmartAccordion
        id="media_quota"
        title="Dung lượng & Hạn mức Cloudinary"
        summary={quotaSummary}
        icon={HardDrive}
        iconColor="text-[#E11D48] dark:text-rose-300"
        iconBg="bg-[#FFE4E6] dark:bg-rose-950/60"
        isOpen={openSections.media_quota}
        isDirty={false}
        onToggle={toggleSection}
      >
        <div className="space-y-2.5">
          {/* Thanh tiến trình dung lượng mảnh, rõ nét, không cắt chữ */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
              <span className="flex-1 min-w-0 font-semibold text-slate-700 dark:text-slate-200 whitespace-normal break-words overflow-visible leading-snug">
                Thư mục gốc:{" "}
                <strong className="font-mono">{cloud.root_folder || "sedinco-hr"}</strong> •{" "}
                <span
                  className={
                    cloud.configured
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {cloud.configured ? `Đã kết nối (${cloud.cloud_name})` : "Chế độ Local Fallback"}
                </span>
              </span>
              <span
                className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap shrink-0 ${badge.cls}`}
              >
                {badge.label}
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  percentBar >= 95
                    ? "bg-rose-600"
                    : percentBar >= 85
                      ? "bg-orange-500"
                      : percentBar >= 70
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                }`}
                style={{ width: `${Math.max(percentBar, usedBytes > 0 ? 1.5 : 0)}%` }}
              />
            </div>
          </div>

          {/* Lưới 4 chỉ số chính nén gọn, hiển thị đầy đủ không cắt chữ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70">
              <div className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 whitespace-normal break-words leading-snug">
                Dung lượng lưu trữ
              </div>
              <div className="text-[14px] font-bold text-slate-900 dark:text-white mt-0.5 font-mono whitespace-normal break-words">
                {formatBytes(summary.active_bytes)}
              </div>
              <div className="text-[11.5px] text-slate-500 dark:text-slate-400 whitespace-normal break-words leading-snug mt-0.5">
                Hôm nay: {formatBytes(summary.bytes_today)}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70">
              <div className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 whitespace-normal break-words leading-snug">
                Băng thông / Tín dụng
              </div>
              <div className="text-[14px] font-bold text-slate-900 dark:text-white mt-0.5 font-mono whitespace-normal break-words">
                {formatBytes(snapshot?.cloud_bandwidth_bytes || 0)}
              </div>
              <div className="text-[11.5px] text-slate-500 dark:text-slate-400 whitespace-normal break-words leading-snug mt-0.5">
                Biến đổi: {formatViNumber(snapshot?.cloud_transformations || 0, 0)}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70">
              <div className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 whitespace-normal break-words leading-snug">
                Số tệp hoạt động
              </div>
              <div className="text-[14px] font-bold text-slate-900 dark:text-white mt-0.5 whitespace-normal break-words">
                {formatViNumber(summary.active_files || 0, 0)} tệp
              </div>
              <div className="text-[11.5px] text-slate-500 dark:text-slate-400 whitespace-normal break-words leading-snug mt-0.5">
                Ảnh: {summary.image_files || 0} • TL: {summary.document_files || 0}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70">
              <div className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 whitespace-normal break-words leading-snug">
                Ngưỡng cảnh báo
              </div>
              <div className="text-[14px] font-bold text-slate-900 dark:text-white mt-0.5 font-mono whitespace-normal break-words">
                70% / 85% / 95%
              </div>
              <div className="text-[11.5px] text-slate-500 dark:text-slate-400 whitespace-normal break-words leading-snug mt-0.5">
                Gói: {snapshot?.plan_name || "Tiêu chuẩn"}
              </div>
            </div>
          </div>

          {(dashboard?.anomaly_alerts || []).length > 0 && (
            <div className="space-y-1.5">
              {dashboard.anomaly_alerts.map((al, i) => (
                <div
                  key={`${al.code}-${i}`}
                  className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 flex items-start gap-2 text-[12.5px] whitespace-normal break-words overflow-visible"
                >
                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1 leading-snug">
                    <span className="font-bold text-rose-800 dark:text-rose-200">{al.title}: </span>
                    <span className="text-rose-700 dark:text-rose-300">{al.description}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Hàng thao tác 1 dòng gọn */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span className="flex-1 min-w-0 text-[12px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug">
              Đồng bộ gần nhất: {formatDateTimeVi(snapshot?.synced_at)}
            </span>
            <button
              type="button"
              disabled={syncingUsage}
              onClick={handleSyncUsage}
              data-testid="sync-cloudinary-usage-btn"
              className={`${COMPACT_BTN_BASE} bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700`}
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${syncingUsage ? "animate-spin" : ""}`} />
              <span>{syncingUsage ? "Đang đồng bộ..." : "Đồng bộ Usage"}</span>
            </button>
          </div>
        </div>
      </SmartAccordion>

      {/* KHỐI ACCORDION 2: BẢO TRÌ & DỌN TỆP MỒ CÔI */}
      <SmartAccordion
        id="media_maintenance"
        title="Bảo trì & Dọn tệp mồ côi"
        summary={maintenanceSummary}
        icon={Sparkles}
        iconColor="text-amber-600 dark:text-amber-300"
        iconBg="bg-amber-50 dark:bg-amber-950/60"
        isOpen={openSections.media_maintenance}
        isDirty={false}
        onToggle={toggleSection}
      >
        <div className="space-y-2.5">
          <p className="text-[13px] text-slate-600 dark:text-slate-300 whitespace-normal break-words overflow-visible leading-relaxed">
            Hệ thống tự động giữ an toàn <strong>24 giờ</strong> đối với các tệp không còn gắn với hồ sơ nhân viên, bảng công hoặc đơn từ trước khi cho phép thu hồi vĩnh viễn khỏi Cloudinary.
          </p>

          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500 dark:text-slate-400 whitespace-normal break-words">
            <span>
              Chờ dọn: <strong className="text-slate-800 dark:text-slate-100">{summary.orphan_files || 0} tệp</strong>
            </span>
            <span>•</span>
            <span>
              Đã thu hồi: <strong className="text-slate-800 dark:text-slate-100">{summary.deleted_files || 0} tệp</strong>
            </span>
            <span>•</span>
            <span>
              Chặn quá tải / Lỗi: <strong className="text-rose-600 dark:text-rose-400">{(summary.rejected_requests || 0) + (summary.failed_uploads || 0)}</strong>
            </span>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span className="flex-1 min-w-0 text-[12px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug">
              Bảo vệ 100% tệp đang sử dụng (ASSET_IN_USE)
            </span>
            <button
              type="button"
              disabled={runningCleanup}
              onClick={handleDryRunOrphanScan}
              data-testid="cleanup-orphan-media-btn"
              className={`${COMPACT_BTN_BASE} bg-[#E11D48] hover:bg-[#BE123C] text-white shadow-xs`}
            >
              {runningCleanup ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{runningCleanup ? "Đang quét..." : "Dọn tệp mồ côi"}</span>
            </button>
          </div>
        </div>
      </SmartAccordion>

      {/* KHỐI ACCORDION 3: DANH SÁCH TỆP MEDIA */}
      <SmartAccordion
        id="media_assets"
        title="Danh sách tệp Media"
        summary={assetsSummary}
        icon={Filter}
        iconColor="text-[#0051CA] dark:text-blue-300"
        iconBg="bg-blue-50 dark:bg-blue-950/60"
        isOpen={openSections.media_assets}
        isDirty={false}
        onToggle={toggleSection}
      >
        <div className="space-y-2.5">
          {/* Thanh tìm kiếm & Bộ lọc nâng cao gọn trên 1 hàng */}
          <div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={filters.ma_nv}
                  onChange={(e) =>
                    setFilters((p) => ({ ...p, ma_nv: e.target.value.toUpperCase() }))
                  }
                  placeholder="VD: NV001"
                  className={`${COMPACT_INPUT_CLASS} pl-9`}
                />
              </div>

              <button
                type="button"
                data-testid="toggle-media-filters-btn"
                onClick={() => setFilterPanelOpen((prev) => !prev)}
                className={`w-fit h-[40px] min-h-[40px] px-3.5 text-[13.5px] font-semibold rounded-lg whitespace-nowrap inline-flex items-center justify-center gap-1.5 border transition cursor-pointer shrink-0 ${
                  filterPanelOpen || advancedFilterCount > 0
                    ? "bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-[#E11D48] dark:text-rose-300"
                    : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                }`}
              >
                <Filter className="w-3.5 h-3.5 shrink-0" />
                <span>Bộ lọc{totalActiveFilterCount > 0 ? ` (${totalActiveFilterCount})` : ""}</span>
              </button>
            </div>
            <p className={HELPER_TEXT_CLASS}>
              Tìm nhanh tài nguyên theo mã nhân viên tải lên hoặc bấm Bộ lọc để lọc theo module nghiệp vụ và thời gian.
            </p>
          </div>

          {/* Bộ lọc nâng cao Progressive Disclosure */}
          {filterPanelOpen && (
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className={LABEL_CLASS}>Module nghiệp vụ</label>
                  <select
                    value={filters.category}
                    onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}
                    className={COMPACT_INPUT_CLASS}
                  >
                    <option value="">Tất cả module</option>
                    <option value="employee_avatar">Ảnh đại diện</option>
                    <option value="employee_document">Hồ sơ nhân viên</option>
                    <option value="attendance_evidence">Chấm công</option>
                    <option value="leave_evidence">Đơn xin nghỉ</option>
                    <option value="attendance_adjustment">Điều chỉnh công</option>
                    <option value="overtime_evidence">Tăng ca</option>
                    <option value="shift_change_evidence">Đổi ca</option>
                    <option value="business_trip_document">Công tác</option>
                    <option value="accounting_attachment">Kế toán / Lương</option>
                    <option value="company_branding">Logo công ty</option>
                  </select>
                </div>

                <div>
                  <label className={LABEL_CLASS}>Loại tệp</label>
                  <select
                    value={filters.resourceType}
                    onChange={(e) => setFilters((p) => ({ ...p, resourceType: e.target.value }))}
                    className={COMPACT_INPUT_CLASS}
                  >
                    <option value="">Mọi loại tệp</option>
                    <option value="image">Hình ảnh</option>
                    <option value="raw">Tài liệu (PDF/Excel)</option>
                    <option value="video">Video</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 items-end">
                <div>
                  <label className={LABEL_CLASS}>Từ ngày</label>
                  <input
                    type="date"
                    aria-label="Từ ngày"
                    value={filters.startDate}
                    onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))}
                    className={COMPACT_INPUT_CLASS}
                  />
                </div>

                <div>
                  <label className={LABEL_CLASS}>Đến ngày</label>
                  <input
                    type="date"
                    aria-label="Đến ngày"
                    value={filters.endDate}
                    onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))}
                    className={COMPACT_INPUT_CLASS}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2.5">
                <div className="flex-1 min-w-0">
                  <label className={LABEL_CLASS}>Trạng thái tệp</label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                    className={COMPACT_INPUT_CLASS}
                  >
                    <option value="">Mọi trạng thái</option>
                    <option value="active">Đang sử dụng</option>
                    <option value="orphan_candidate">Mồ côi chờ dọn</option>
                    <option value="deleted">Đã xóa</option>
                    <option value="failed">Lỗi tải lên</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setFilters({
                      startDate: "",
                      endDate: "",
                      category: "",
                      ma_nv: "",
                      resourceType: "",
                      status: ""
                    })
                  }
                  className="w-fit h-[34px] min-h-[34px] px-3 text-[12.5px] font-semibold rounded-lg whitespace-nowrap inline-flex items-center justify-center gap-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0 self-end"
                >
                  <RotateCcw className="w-3 h-3 shrink-0" />
                  <span>Đặt lại</span>
                </button>
              </div>
            </div>
          )}

          {/* Danh sách tệp nén gọn (divide-y), 2 tầng trên Mobile để không cắt tên tệp */}
          {assetsLoading ? (
            <SkeletonList rows={3} label="Đang lọc danh sách tài nguyên..." />
          ) : (assetsData.items || []).length === 0 ? (
            <EmptyState
              icon={Search}
              title="Chưa có tệp nào khớp bộ lọc"
              description="Thử thay đổi từ khóa tìm kiếm hoặc điều kiện lọc."
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {assetsData.items.map((item) => {
                const isImage = item.resource_type === "image";
                const isVideo = item.resource_type === "video";
                const TypeIcon = isImage ? ImageIcon : isVideo ? Video : FileText;
                const categoryName =
                  CATEGORY_LABELS[item.upload_category] ||
                  item.upload_category ||
                  "Tài nguyên hệ thống";

                return (
                  <div
                    key={item.asset_uuid}
                    className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
                  >
                    {/* Hàng trên (Mobile) / Cột trái (Desktop): Thumbnail + Tên tệp + Thông tin phụ chiếm 100% chiều ngang */}
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                        {isImage && item.preview_url && item.upload_status !== "deleted" ? (
                          <img
                            src={item.preview_url}
                            alt={item.original_filename || "Thumbnail"}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <TypeIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="text-[13.5px] font-semibold text-slate-900 dark:text-white whitespace-normal break-words overflow-visible leading-snug">
                            {item.original_filename || item.asset_uuid.slice(0, 12)}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 whitespace-normal break-words">
                            {categoryName}
                          </span>
                        </div>
                        <div className="text-[12px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug mt-0.5">
                          {item.uploader_name || item.uploaded_by || "Hệ thống"} •{" "}
                          <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                            {formatBytes(item.bytes)}
                          </span>{" "}
                          • {formatDateTimeVi(item.created_at)}
                        </div>
                      </div>
                    </div>

                    {/* Hàng dưới (Mobile) / Cột phải (Desktop): Cụm 2 nút gọn Xem & Xóa */}
                    <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                      {item.upload_status !== "deleted" && item.preview_url && (
                        <button
                          type="button"
                          onClick={() => setPreviewAsset(item)}
                          className={`${ROW_ACTION_BTN_BASE} bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700`}
                        >
                          <Eye className="w-3 h-3 shrink-0" />
                          <span>Xem</span>
                        </button>
                      )}
                      {item.upload_status !== "deleted" && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className={`${ROW_ACTION_BTN_BASE} text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200/70 dark:border-rose-800/60`}
                        >
                          <Trash2 className="w-3 h-3 shrink-0" />
                          <span>Xóa</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Phân trang gọn gàng phía dưới */}
          {totalPages > 1 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[12px]">
              <span className="text-slate-500 dark:text-slate-400 whitespace-normal break-words">
                Trang <strong>{assetsData.page || 1}</strong> / {totalPages} ({assetsData.total} tệp)
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={(assetsData.page || 1) <= 1 || assetsLoading}
                  onClick={() => loadData((assetsData.page || 1) - 1)}
                  className={`${ROW_ACTION_BTN_BASE} bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Trước</span>
                </button>
                <button
                  type="button"
                  disabled={(assetsData.page || 1) >= totalPages || assetsLoading}
                  onClick={() => loadData((assetsData.page || 1) + 1)}
                  className={`${ROW_ACTION_BTN_BASE} bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}
                >
                  <span>Sau</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </SmartAccordion>

      {/* Modal Preview Tài Nguyên */}
      <AppModal
        open={Boolean(previewAsset)}
        onClose={() => setPreviewAsset(null)}
        title={previewAsset?.original_filename || "Xem tài nguyên Media"}
        subtitle={`${previewAsset?.asset_folder || ""} (${formatBytes(previewAsset?.bytes)})`}
        maxWidthClass="max-w-lg"
      >
        {previewAsset && (
          <div className="space-y-3">
            <SecureMediaPreview
              src={previewAsset.preview_url}
              mimeType={previewAsset.mime_type}
              filename={previewAsset.original_filename}
            />
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 bg-slate-50 dark:bg-slate-800/70 p-3 rounded-xl whitespace-normal break-words">
              <div>
                <strong>Public ID:</strong>{" "}
                <span className="font-mono break-all">{previewAsset.public_id || "inline_fallback"}</span>
              </div>
              <div>
                <strong>Loại nghiệp vụ:</strong>{" "}
                {CATEGORY_LABELS[previewAsset.upload_category] || previewAsset.upload_category}
              </div>
              <div>
                <strong>Liên kết nghiệp vụ:</strong>{" "}
                {previewAsset.related_entity_type || "Chưa gắn bản ghi"}{" "}
                {previewAsset.related_entity_id ? `(#${previewAsset.related_entity_id})` : ""}
              </div>
            </div>
          </div>
        )}
      </AppModal>

      <ConfirmDialog
        open={confirmCleanupOpen}
        onCancel={() => !runningCleanup && setConfirmCleanupOpen(false)}
        onConfirm={handleExecuteCleanup}
        loading={runningCleanup}
        title="Xác nhận Dọn dẹp Tệp Mồ Côi"
        message={
          orphanPreview
            ? `Phát hiện ${orphanPreview.eligible} tệp không còn tham chiếu trên Database và đã vượt qua thời hạn giữ an toàn (${orphanPreview.retention_hours} giờ). Bạn có chắc chắn muốn xóa khỏi Cloudinary để giải phóng dung lượng?`
            : "Xác nhận dọn dẹp tệp mồ côi?"
        }
        confirmLabel="Xác nhận dọn dẹp"
        variant="danger"
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onCancel={() => !deletingAsset && setDeleteTarget(null)}
        onConfirm={handleConfirmDeleteAsset}
        loading={deletingAsset}
        title="Xác nhận Xóa Tài Nguyên Media"
        message={`Xóa tệp "${deleteTarget?.original_filename || deleteTarget?.asset_uuid}"? Hệ thống sẽ tự động chặn nếu tệp vẫn đang được gắn với đơn từ, bảng công hoặc hồ sơ nhân sự.`}
        confirmLabel="Xóa an toàn"
        variant="danger"
      />
    </div>
  );
}
