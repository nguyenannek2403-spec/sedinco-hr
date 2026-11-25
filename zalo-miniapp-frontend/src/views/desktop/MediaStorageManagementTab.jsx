import React, { useState, useEffect, useCallback } from "react";
import {
  HardDrive,
  RefreshCw,
  Trash2,
  ShieldAlert,
  Image as ImageIcon,
  FileText,
  Video,
  FolderOpen,
  Users,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Filter,
  Search,
  Sparkles,
  Cloud
} from "lucide-react";
import { zaloMediaService } from "../../services/zalo-media.service";
import { formatViNumber } from "../../utils/viNumberFormat";
import { AppButton, AppModal, SkeletonList, EmptyState, SecureMediaPreview, CollapsibleFilterBar } from "../../components/ui";
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
  NORMAL: { label: "An toàn", cls: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700" },
  WARNING: { label: "Cảnh báo (>=70%)", cls: "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700" },
  CRITICAL: { label: "Nghiêm trọng (>=85%)", cls: "bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-700" },
  RESTRICTED: { label: "Hạn chế upload (>=95%)", cls: "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700" },
  EXHAUSTED: { label: "Đầy hạn mức (100%)", cls: "bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border-rose-400" },
  UNBOUNDED_MONITORING: { label: "Đang theo dõi (Chưa đặt budget)", cls: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700" }
};

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

  const loadData = useCallback(async (page = 1) => {
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
  }, [filters, cleanFilterParams, showToast]);

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
      const res = await zaloMediaService.deleteMediaAsset(deleteTarget.asset_uuid, "ADMIN_MEDIA_STORAGE_DELETE");
      setDeleteTarget(null);
      showToast?.(res?.message || "Đã xóa tài nguyên media an toàn!", "success");
      await loadData(assetsData.page || 1);
    } catch (err) {
      showToast?.(err?.message || "Không thể xóa tài nguyên này (có thể đang được hồ sơ/đơn từ sử dụng).", "error");
    } finally {
      setDeletingAsset(false);
    }
  };

  if (loading && !dashboard) {
    return <SkeletonList rows={4} label="Đang tải thống kê lưu trữ Cloudinary..." />;
  }

  const cloud = dashboard?.cloudinary_account || {};
  const quota = dashboard?.quota || {};
  const summary = dashboard?.summary || {};
  const snapshot = quota.latest_snapshot || null;
  const badge = THRESHOLD_BADGES[quota.threshold_state] || THRESHOLD_BADGES.UNBOUNDED_MONITORING;
  const percentBar = Math.min(100, Math.max(0, Number(quota.current_percent || 0)));

  const activeAdvancedFilterCount = [
    filters.startDate,
    filters.endDate,
    filters.resourceType,
    filters.status
  ].filter(Boolean).length;
  const totalActiveFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div data-testid="admin-media-storage-management" className="max-w-5xl mx-auto pb-6 space-y-4">
      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#FFE4E6] dark:bg-rose-950/60 text-[#E11D48] dark:text-rose-300 flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#111C2D] dark:text-white">
                Quản lý Dung lượng &amp; Media Tập Trung (Cloudinary)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Thư mục gốc: <span className="font-mono font-bold">{cloud.root_folder || "sedinco-hr"}</span> • Chế độ thư mục: <span className="font-mono font-bold uppercase">{cloud.folder_mode || "dynamic"}</span> • Trạng thái:{" "}
                <strong className={cloud.configured ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                  {cloud.configured ? `Đã kết nối (${cloud.cloud_name})` : "Chưa cấu hình khóa Cloudinary trong .env"}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <AppButton
              variant="secondary"
              icon={RefreshCw}
              loading={syncingUsage}
              onClick={handleSyncUsage}
              className="text-xs px-3 py-2"
            >
              Đồng bộ Usage API
            </AppButton>
            <AppButton
              variant="danger"
              icon={Sparkles}
              loading={runningCleanup}
              onClick={handleDryRunOrphanScan}
              className="text-xs px-3 py-2"
            >
              Quét &amp; Dọn file mồ côi
            </AppButton>
          </div>
        </div>

        {/* Quota Progress Gauge */}
        <div className="p-3.5 rounded-2xl bg-[#F0F3FF] dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-[#111C2D] dark:text-white flex items-center gap-2">
              <Cloud className="w-4 h-4 text-[#0051CA] dark:text-blue-400" />
              <span>
                Tình trạng hạn mức lưu trữ:{" "}
                {quota.budget_bytes
                  ? `${formatBytes(quota.effective_used_bytes)} / ${formatBytes(quota.budget_bytes)} (${formatViNumber(percentBar, 1)}%)`
                  : `${formatBytes(summary.active_bytes)} đang sử dụng (Chưa giới hạn CLOUDINARY_STORAGE_BUDGET_BYTES)`}
              </span>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${badge.cls}`}>
              {badge.label}
            </span>
          </div>

          {quota.budget_bytes && (
            <div className="w-full h-2.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden">
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
                style={{ width: `${percentBar}%` }}
              />
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] text-slate-600 dark:text-slate-300">
            <div>
              Gói Cloudinary: <strong>{snapshot?.plan_name || "Chưa đồng bộ"}</strong>
            </div>
            <div>
              Bandwidth đã dùng: <strong>{formatBytes(snapshot?.cloud_bandwidth_bytes || 0)}</strong>
            </div>
            <div>
              Transformations: <strong>{formatViNumber(snapshot?.cloud_transformations || 0, 0)}</strong>
            </div>
            <div>
              Sync gần nhất: <strong>{formatDateTimeVi(snapshot?.synced_at)}</strong>
            </div>
          </div>
        </div>

        {/* Anomaly / Security / Quota Alerts */}
        {(dashboard?.anomaly_alerts || []).length > 0 && (
          <div className="space-y-2">
            {dashboard.anomaly_alerts.map((al, i) => (
              <div
                key={`${al.code}-${i}`}
                className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 flex items-start gap-2.5 text-xs"
              >
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-rose-800 dark:text-rose-200">{al.title}</div>
                  <div className="text-rose-700 dark:text-rose-300">{al.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Tổng tệp hoạt động</div>
          <div className="text-xl font-black text-[#111C2D] dark:text-white mt-1">{formatViNumber(summary.active_files || 0, 0)}</div>
          <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">{formatBytes(summary.active_bytes)}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">
            <ImageIcon className="w-3.5 h-3.5 text-emerald-600" /> Ảnh / Tài liệu / Video
          </div>
          <div className="text-xs font-semibold text-[#111C2D] dark:text-white mt-1.5 space-y-0.5">
            <div>Ảnh ({summary.image_files || 0}): <strong>{formatBytes(summary.image_bytes)}</strong></div>
            <div>PDF/Tài liệu ({summary.document_files || 0}): <strong>{formatBytes(summary.document_bytes)}</strong></div>
            <div>Video ({summary.video_files || 0}): <strong>{formatBytes(summary.video_bytes)}</strong></div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Lưu lượng Ngày / Tháng</div>
          <div className="text-xs font-semibold text-[#111C2D] dark:text-white mt-1.5 space-y-1">
            <div>Hôm nay: <strong>{summary.uploads_today || 0} tệp</strong> ({formatBytes(summary.bytes_today)})</div>
            <div>Tháng này: <strong>{summary.uploads_month || 0} tệp</strong> ({formatBytes(summary.bytes_month)})</div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Chặn / Lỗi / Mồ côi</div>
          <div className="text-xs font-semibold text-[#111C2D] dark:text-white mt-1.5 space-y-0.5">
            <div className="text-rose-600 dark:text-rose-400">Chặn/Từ chối: <strong>{summary.rejected_requests || 0}</strong></div>
            <div className="text-amber-600 dark:text-amber-400">Upload lỗi: <strong>{summary.failed_uploads || 0}</strong></div>
            <div>Mồ côi chờ dọn: <strong>{summary.orphan_files || 0}</strong> ({summary.deleted_files || 0} đã xóa)</div>
          </div>
        </div>
      </div>

      {/* Top Folders & Top Uploaders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#111C2D] dark:text-white">
            <FolderOpen className="w-4 h-4 text-[#E11D48]" />
            <span>Top Thư mục Tiêu thụ Storage</span>
          </div>
          {(dashboard?.folders_breakdown || []).length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">Chưa có tệp nào được ghi nhận.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
              {dashboard.folders_breakdown.map((f, idx) => (
                <div key={`${f.asset_folder}-${idx}`} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono font-bold text-[#111C2D] dark:text-slate-100 truncate">{f.asset_folder}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {f.upload_category} • {f.access_level === "private" ? "Riêng tư" : "Công khai chính sách"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-800 dark:text-white">{f.file_count} tệp</div>
                    <div className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">{formatBytes(f.total_bytes)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#111C2D] dark:text-white">
            <Users className="w-4 h-4 text-[#0051CA]" />
            <span>Nhân sự Tải lên Nhiều nhất</span>
          </div>
          {(dashboard?.top_uploaders || []).length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">Chưa có dữ liệu tải lên.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
              {dashboard.top_uploaders.map((u) => (
                <div key={u.uploaded_by} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-[#111C2D] dark:text-white truncate">
                      {u.ho_ten} <span className="font-mono text-slate-500">({u.uploaded_by})</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Hôm nay: {formatBytes(u.today_bytes)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-800 dark:text-white">{u.total_files} tệp</div>
                    <div className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">{formatBytes(u.total_bytes)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters & Asset Explorer (Progressive Disclosure) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#111C2D] dark:text-white">
            <Filter className="w-4 h-4 text-[#E11D48]" />
            <span>Danh sách Tài nguyên Media ({assetsData.total || 0})</span>
          </div>
        </div>

        <CollapsibleFilterBar
          activeFilterCount={totalActiveFilterCount}
          onReset={() =>
            setFilters({ startDate: "", endDate: "", category: "", ma_nv: "", resourceType: "", status: "" })
          }
          primaryControls={
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
              <input
                type="text"
                value={filters.ma_nv}
                onChange={(e) => setFilters((p) => ({ ...p, ma_nv: e.target.value.toUpperCase() }))}
                placeholder="Tìm theo Mã NV (VD: NV001)..."
                className="min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              />
              <select
                value={filters.category}
                onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}
                className="min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              >
                <option value="">Tất cả module nghiệp vụ</option>
                <option value="employee_avatar">Ảnh đại diện</option>
                <option value="employee_document">Hồ sơ nhân viên</option>
                <option value="attendance_evidence">Chấm công</option>
                <option value="leave_evidence">Đơn xin nghỉ</option>
                <option value="attendance_adjustment">Điều chỉnh công</option>
                <option value="overtime_evidence">Tăng ca</option>
                <option value="shift_change_evidence">Đổi ca</option>
                <option value="business_trip_document">Công tác</option>
                <option value="accounting_attachment">Kế toán / Khiếu nại lương</option>
                <option value="company_branding">Logo công ty</option>
              </select>
            </div>
          }
          advancedControls={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))}
                aria-label="Từ ngày"
                className="min-h-[40px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              />
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))}
                aria-label="Đến ngày"
                className="min-h-[40px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              />
              <select
                value={filters.resourceType}
                onChange={(e) => setFilters((p) => ({ ...p, resourceType: e.target.value }))}
                className="min-h-[40px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              >
                <option value="">Mọi loại tệp</option>
                <option value="image">Hình ảnh</option>
                <option value="raw">Tài liệu (PDF/Excel)</option>
                <option value="video">Video</option>
              </select>
              <select
                value={filters.status}
                onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                className="min-h-[40px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              >
                <option value="">Mọi trạng thái</option>
                <option value="active">Đang sử dụng (active)</option>
                <option value="orphan_candidate">Mồ côi chờ dọn</option>
                <option value="deleted">Đã xóa</option>
                <option value="failed">Lỗi</option>
              </select>
            </div>
          }
        />

        {assetsLoading ? (
          <SkeletonList rows={3} label="Đang lọc danh sách tài nguyên..." />
        ) : (assetsData.items || []).length === 0 ? (
          <EmptyState
            icon={Search}
            title="Chưa có tệp nào khớp bộ lọc"
            description="Thử thay đổi bộ lọc thời gian, module hoặc nhân viên."
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {assetsData.items.map((item) => (
              <div key={item.asset_uuid} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-[#111C2D] dark:text-white">
                      {item.original_filename || item.asset_uuid.slice(0, 12)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase">
                      {item.resource_type} • {item.format || "file"}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.upload_status === "active"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : item.upload_status === "orphan_candidate"
                            ? "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {item.upload_status}
                    </span>
                    <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400">
                      {formatBytes(item.bytes)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                    {item.asset_folder} • Người tải: {item.uploader_name} ({item.uploaded_by}) • {formatDateTimeVi(item.created_at)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {item.upload_status !== "deleted" && item.preview_url && (
                    <AppButton
                      variant="secondary"
                      icon={Eye}
                      onClick={() => setPreviewAsset(item)}
                      className="text-xs px-2.5 py-1.5 min-h-[36px]"
                    >
                      Xem
                    </AppButton>
                  )}
                  {item.upload_status !== "deleted" && (
                    <AppButton
                      variant="ghost"
                      icon={Trash2}
                      onClick={() => setDeleteTarget(item)}
                      className="text-xs px-2.5 py-1.5 min-h-[36px] text-rose-600 dark:text-rose-400"
                    >
                      Xóa
                    </AppButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lịch sử dọn dẹp */}
      {(dashboard?.cleanup_history || []).length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#111C2D] dark:text-white">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Nhật ký Đồng bộ &amp; Dọn dẹp Tài nguyên</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {dashboard.cleanup_history.map((log) => (
              <div key={log.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-[#111C2D] dark:text-white">{log.action}</span>
                  <span className="text-slate-500 dark:text-slate-400 ml-2">bởi {log.actor_id}</span>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{formatDateTimeVi(log.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 bg-slate-50 dark:bg-slate-800/70 p-3 rounded-xl">
              <div><strong>Public ID:</strong> <span className="font-mono">{previewAsset.public_id || "inline_fallback"}</span></div>
              <div><strong>Loại nghiệp vụ:</strong> {previewAsset.upload_category}</div>
              <div><strong>Liên kết nghiệp vụ:</strong> {previewAsset.related_entity_type || "Chưa gắn bản ghi"} {previewAsset.related_entity_id ? `(#${previewAsset.related_entity_id})` : ""}</div>
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
