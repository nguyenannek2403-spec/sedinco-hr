import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Clock,
  MapPin,
  Calculator,
  Wifi,
  Save,
  Plus,
  Trash2,
  Navigation,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Building2,
  CalendarDays,
  Layers,
  Pencil,
  Check,
  X,
  QrCode,
  RefreshCw,
  Upload,
  Loader2,
  Gift,
  ShieldCheck
} from "lucide-react";
import QRCode from "qrcode";
import { safeGet, safePut, safePost, safeDelete, generateIdempotencyKey } from "../../utils/api";
import { zaloLocationService } from "../../services/zalo-location.service";
import { zaloMediaService } from "../../services/zalo-media.service";
import { attendanceService } from "../../services/attendance.service";
import { formatViNumber, parseViNumberInput } from "../../utils/viNumberFormat";
import { getMonthlyStandardWorkdays, getVietnamTodayIso } from "../../utils/workdayUtils";
import { AppButton, AppModal, FormRow, SkeletonList } from "../../components/ui";
import ConfirmDialog from "../../components/ConfirmDialog";
import useDepartments, { notifyDepartmentsChanged } from "../../hooks/useDepartments";

const toNum = (val, fallback) => {
  if (val === "" || val === null || val === undefined) return fallback;
  const normalized = typeof val === "string" ? val.trim().replace(",", ".") : val;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * SectionSaveButton — Nút Lưu cục bộ cho từng phân mục nhỏ trong Cài đặt
 * - Chuẩn kích thước gọn đẹp: h-[36px] px-3.5 text-sm rounded-lg font-medium whitespace-nowrap
 * - Dirty State thông minh: Dịu nhẹ khi chưa sửa; nổi bật màu Primary (kèm chấm tròn nhỏ) khi có thay đổi;
 *   hiển thị "Đang lưu..." khi đang gọi API.
 */
function SectionSaveButton({
  label,
  isDirty,
  loading,
  onClick,
  testId,
  className = ""
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-dirty={isDirty ? "true" : "false"}
      disabled={loading}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`h-[36px] min-h-[36px] px-3.5 text-xs sm:text-sm rounded-lg font-bold whitespace-nowrap inline-flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-60 shrink-0 ${
        isDirty
          ? "bg-[#E11D48] hover:bg-[#BE123C] text-white shadow-sm shadow-rose-600/25 border border-[#E11D48]"
          : "bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700"
      } ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>Đang lưu...</span>
        </>
      ) : (
        <>
          {isDirty ? (
            <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
          ) : (
            <Save className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

const AccordionSection = ({
  id,
  title,
  subtitle,
  icon: Icon,
  iconColor = "text-[#E11D48] dark:text-rose-300",
  iconBg = "bg-[#FFE4E6] dark:bg-rose-950/60",
  isOpen,
  onToggle,
  headerAction = null,
  children
}) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-all">
    <div className="w-full flex flex-wrap items-center justify-between gap-2.5 p-[14px] sm:p-4 hover:bg-[#F0F3FF]/50 dark:hover:bg-slate-800/40 transition-colors min-h-[64px]">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex items-center gap-[10px] min-w-0 flex-1 text-left cursor-pointer min-h-[40px]"
      >
        <div
          className={`w-[38px] h-[38px] rounded-xl ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}
        >
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">
            {title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-300 leading-snug break-words mt-0.5">
            {subtitle}
          </p>
        </div>
      </button>

      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {headerAction}
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-label={isOpen ? "Thu gọn mục" : "Mở rộng mục"}
          className="w-[36px] h-[36px] min-h-[36px] rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0 cursor-pointer"
        >
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
    </div>
    {isOpen && (
      <div className="px-[14px] sm:px-4 pb-[14px] sm:pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
        {children}
      </div>
    )}
  </div>
);

const INITIAL_CONFIG = {
  company_name: "CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO",
  phone: "",
  address: "",
  tax_code: "",
  logo_url: null,
  work_start: "08:00",
  lunch_start: "12:00",
  lunch_end: "13:30",
  work_end: "17:30",
  grace_period_minutes: 15,
  penalty_per_minute: 2000,
  penalty_fixed_block: 50000,
  late_policy_type: "PER_MINUTE",
  free_late_occurrences: 3,
  late_penalty_per_minute: 2000,
  late_penalty_amount: 50000,
  max_late_minutes_for_half_day: 60,
  probation_salary_percent: 85,
  probation_allowance_full: 1,
  ot_rate_weekday: 1.5,
  ot_rate_weekend: 2.0,
  custom_ot_hourly_rate: 0,
  ot_calculation_mode: "APPROVED_OR_AUTO",
  free_late_exempts_halfday: 0,
  negative_salary_policy: "CLAMP_ZERO",
  insurance_rate: 10.5,
  monthly_paid_leave_limit: 1,
  office_ip_whitelist: "",
  announcement_text: "",
  announcement_updated_at: null,
  current_client_ip: "",
  is_matching_office_wifi: false,
  allowed_locations: [
    {
      id: "loc_hq_1",
      name: "Trụ sở chính Đà Nẵng",
      lat: 16.0544,
      lng: 108.2022,
      radius: 500,
      attendance_method: "GPS"
    }
  ]
};

export default function CompanySettingsTab({ showToast }) {
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState(null); // null | 'announcement' | 'schedule' | 'company_info' | 'locations' | 'rules'
  const [savingWifi, setSavingWifi] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);
  const lastPositiveInsuranceRateRef = useRef(10.5);
  const [detectingLocIdx, setDetectingLocIdx] = useState(null);
  const [qrModalState, setQrModalState] = useState({
    open: false,
    loading: false,
    branch: null,
    session: null,
    qrDataUrl: "",
    error: ""
  });
  const [statusBanner, setStatusBanner] = useState(null);
  const [openSections, setOpenSections] = useState({
    schedule: true,
    company_info: false,
    departments: true,
    locations: false,
    payroll: true
  });

  const {
    departments,
    defaultDepartmentName,
    loading: loadingDepartments,
    refreshDepartments
  } = useDepartments();
  const [newDeptName, setNewDeptName] = useState("");
  const [addingDept, setAddingDept] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState(null);
  const [editingDeptName, setEditingDeptName] = useState("");
  const [savingDept, setSavingDept] = useState(false);
  const [confirmDeleteDept, setConfirmDeleteDept] = useState({ open: false, dept: null });
  const [deletingDept, setDeletingDept] = useState(false);

  const [config, setConfig] = useState(INITIAL_CONFIG);
  const [savedConfig, setSavedConfig] = useState(INITIAL_CONFIG);

  const notify = useCallback(
    (msg, type = "success") => {
      setStatusBanner({ msg, type });
      if (typeof showToast === "function") {
        showToast(msg, type);
      }
      setTimeout(() => {
        setStatusBanner((prev) => (prev?.msg === msg ? null : prev));
      }, 4500);
    },
    [showToast]
  );

  const applyServerConfig = useCallback((data) => {
    if (!data || typeof data !== "object") return;
    if (Number(data.insurance_rate) > 0) {
      lastPositiveInsuranceRateRef.current = Number(data.insurance_rate);
    }
    setConfig((prev) => {
      const merged = {
        ...prev,
        ...data,
        allowed_locations:
          Array.isArray(data.allowed_locations) && data.allowed_locations.length > 0
            ? data.allowed_locations
            : prev.allowed_locations
      };
      setSavedConfig(merged);
      return merged;
    });
  }, []);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await safeGet("/company", {}, { cancelPrevious: false });
      const data = res?.data || res;
      applyServerConfig(data);
    } catch (err) {
      notify(err?.message || "Không thể tải cài đặt công ty", "error");
    } finally {
      setLoading(false);
    }
  }, [applyServerConfig, notify]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const toggleSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const updateField = (key, value) => {
    if (key === "insurance_rate" && toNum(value, 0) > 0) {
      lastPositiveInsuranceRateRef.current = toNum(value, 10.5);
    }
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Kiểm tra Dirty State riêng cho từng phân mục nhỏ
  const isAnnouncementDirty =
    String(config.announcement_text || "").trim() !==
    String(savedConfig.announcement_text || "").trim();

  const isScheduleDirty =
    (config.work_start || "08:00") !== (savedConfig.work_start || "08:00") ||
    (config.work_end || "17:30") !== (savedConfig.work_end || "17:30") ||
    (config.lunch_start || "12:00") !== (savedConfig.lunch_start || "12:00") ||
    (config.lunch_end || "13:30") !== (savedConfig.lunch_end || "13:30");

  const isCompanyInfoDirty =
    String(config.company_name || "").trim() !== String(savedConfig.company_name || "").trim() ||
    String(config.phone || "").trim() !== String(savedConfig.phone || "").trim() ||
    String(config.address || "").trim() !== String(savedConfig.address || "").trim() ||
    String(config.tax_code || "").trim() !== String(savedConfig.tax_code || "").trim();

  const isLocationsDirty =
    JSON.stringify(config.allowed_locations || []) !==
      JSON.stringify(savedConfig.allowed_locations || []) ||
    String(config.office_ip_whitelist || "").trim() !==
      String(savedConfig.office_ip_whitelist || "").trim();

  const isRulesDirty =
    toNum(config.grace_period_minutes, 15) !== toNum(savedConfig.grace_period_minutes, 15) ||
    String(config.late_policy_type || "PER_MINUTE") !==
      String(savedConfig.late_policy_type || "PER_MINUTE") ||
    toNum(config.free_late_occurrences, 3) !== toNum(savedConfig.free_late_occurrences, 3) ||
    toNum(config.late_penalty_per_minute ?? config.penalty_per_minute, 2000) !==
      toNum(savedConfig.late_penalty_per_minute ?? savedConfig.penalty_per_minute, 2000) ||
    toNum(config.late_penalty_amount ?? config.penalty_fixed_block, 50000) !==
      toNum(savedConfig.late_penalty_amount ?? savedConfig.penalty_fixed_block, 50000) ||
    toNum(config.max_late_minutes_for_half_day, 60) !==
      toNum(savedConfig.max_late_minutes_for_half_day, 60) ||
    Number(Boolean(config.free_late_exempts_halfday)) !==
      Number(Boolean(savedConfig.free_late_exempts_halfday)) ||
    toNum(config.monthly_paid_leave_limit, 1) !== toNum(savedConfig.monthly_paid_leave_limit, 1) ||
    toNum(config.probation_salary_percent, 85) !==
      toNum(savedConfig.probation_salary_percent, 85) ||
    Number(config.probation_allowance_full ? 1 : 0) !==
      Number(savedConfig.probation_allowance_full ? 1 : 0) ||
    toNum(config.ot_rate_weekday, 1.5) !== toNum(savedConfig.ot_rate_weekday, 1.5) ||
    toNum(config.ot_rate_weekend, 2.0) !== toNum(savedConfig.ot_rate_weekend, 2.0) ||
    toNum(config.custom_ot_hourly_rate, 0) !== toNum(savedConfig.custom_ot_hourly_rate, 0) ||
    String(config.ot_calculation_mode || "APPROVED_OR_AUTO") !==
      String(savedConfig.ot_calculation_mode || "APPROVED_OR_AUTO") ||
    toNum(config.insurance_rate, 10.5) !== toNum(savedConfig.insurance_rate, 10.5) ||
    String(config.negative_salary_policy || "CLAMP_ZERO") !==
      String(savedConfig.negative_salary_policy || "CLAMP_ZERO");

  // Hàm lưu cục bộ từng phân mục nhỏ (chỉ gửi đúng các trường của phân mục đó)
  const saveSectionPayload = async (sectionKey, partialPayload, successMessage) => {
    if (savingSection) return;
    setSavingSection(sectionKey);
    try {
      const res = await safePut("/company/settings", partialPayload, {
        idempotencyKey: generateIdempotencyKey(`comp_${sectionKey}`)
      });
      if (res?.data) {
        applyServerConfig(res.data);
      } else {
        setSavedConfig((prev) => ({ ...prev, ...partialPayload }));
      }
      notify(successMessage || res?.message || "Đã lưu cài đặt thành công!");
    } catch (err) {
      notify(err?.message || "Không thể lưu cài đặt. Vui lòng thử lại!", "error");
    } finally {
      setSavingSection(null);
    }
  };

  // 1. Lưu riêng Bảng tin thông báo nội bộ (payload siêu nhẹ vài trăm byte)
  const handleSaveAnnouncement = () =>
    saveSectionPayload(
      "announcement",
      {
        announcement_text: String(config.announcement_text || "").trim()
      },
      "Đã lưu bảng tin nội bộ!"
    );

  // 2. Lưu riêng Giờ làm việc (Ca Sáng / Ca Chiều)
  const handleSaveSchedule = () =>
    saveSectionPayload(
      "schedule",
      {
        work_start: config.work_start || "08:00",
        lunch_start: config.lunch_start || "12:00",
        lunch_end: config.lunch_end || "13:30",
        work_end: config.work_end || "17:30"
      },
      "Đã lưu giờ làm việc!"
    );

  // 3. Lưu riêng Thông tin công ty
  const handleSaveCompanyInfo = () =>
    saveSectionPayload(
      "company_info",
      {
        company_name:
          String(config.company_name || "").trim() ||
          "CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO",
        phone: config.phone ? String(config.phone).trim() : "",
        address: config.address ? String(config.address).trim() : "",
        tax_code: config.tax_code ? String(config.tax_code).trim() : ""
      },
      "Đã lưu thông tin công ty!"
    );

  // 4. Lưu riêng Địa chỉ & Wi-Fi chấm công
  const handleSaveLocations = () => {
    const cleanedLocations = (config.allowed_locations || []).map((loc, idx) => ({
      id: loc.id || `loc_${idx + 1}`,
      name: String(loc.name || `Địa điểm ${idx + 1}`).trim(),
      lat: toNum(loc.lat, 16.0544),
      lng: toNum(loc.lng, 108.2022),
      radius: Math.max(20, Math.round(toNum(loc.radius, 300))),
      attendance_method: ["GPS", "GPS_AND_QR", "QR_ONLY"].includes(
        String(loc.attendance_method || "").toUpperCase()
      )
        ? String(loc.attendance_method).toUpperCase()
        : "GPS"
    }));
    const primary = cleanedLocations[0] || { lat: 16.0544, lng: 108.2022, radius: 500 };

    return saveSectionPayload(
      "locations",
      {
        allowed_locations: cleanedLocations,
        latitude: primary.lat,
        longitude: primary.lng,
        radius_meters: primary.radius,
        office_ip_whitelist: String(config.office_ip_whitelist || "").trim()
      },
      "Đã lưu vị trí chấm công!"
    );
  };

  // 5. Lưu riêng Quy tắc tính công, tăng ca & bảo hiểm
  const handleSaveRules = () => {
    const perMin = Math.max(
      0,
      toNum(config.late_penalty_per_minute ?? config.penalty_per_minute, 2000)
    );
    const perBlock = Math.max(
      0,
      toNum(config.late_penalty_amount ?? config.penalty_fixed_block, 50000)
    );
    const probationFull =
      config.probation_allowance_full === 0 ||
      config.probation_allowance_full === false ||
      String(config.probation_allowance_full) === "0"
        ? 0
        : 1;

    return saveSectionPayload(
      "rules",
      {
        grace_period_minutes: Math.max(0, Math.round(toNum(config.grace_period_minutes, 15))),
        late_policy_type: config.late_policy_type || "PER_MINUTE",
        free_late_occurrences: Math.max(0, Math.round(toNum(config.free_late_occurrences, 3))),
        penalty_per_minute: perMin,
        late_penalty_per_minute: perMin,
        penalty_fixed_block: perBlock,
        late_penalty_amount: perBlock,
        max_late_minutes_for_half_day: Math.max(
          1,
          Math.round(toNum(config.max_late_minutes_for_half_day, 60))
        ),
        free_late_exempts_halfday: Number(config.free_late_exempts_halfday) ? 1 : 0,
        monthly_paid_leave_limit: Math.max(
          0,
          Math.min(31, toNum(config.monthly_paid_leave_limit, 1))
        ),
        probation_salary_percent: Math.min(
          100,
          Math.max(0, toNum(config.probation_salary_percent, 85))
        ),
        probation_allowance_full: probationFull,
        ot_rate_weekday: Math.max(0, toNum(config.ot_rate_weekday, 1.5)),
        ot_rate_weekend: Math.max(0, toNum(config.ot_rate_weekend, 2.0)),
        custom_ot_hourly_rate: Math.max(0, toNum(config.custom_ot_hourly_rate, 0)),
        ot_calculation_mode: config.ot_calculation_mode || "APPROVED_OR_AUTO",
        insurance_rate: Math.max(0, toNum(config.insurance_rate, 10.5)),
        negative_salary_policy: config.negative_salary_policy || "CLAMP_ZERO"
      },
      "Đã lưu quy tắc tính công, tăng ca & bảo hiểm!"
    );
  };

  const handleAddDepartment = async (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    const cleanName = String(newDeptName || "").trim();
    if (!cleanName) {
      notify("Vui lòng nhập tên khối / bộ phận mới!", "error");
      return;
    }
    setAddingDept(true);
    try {
      const res = await safePost("/departments", { name: cleanName });
      if (res?.success) {
        setNewDeptName("");
        await refreshDepartments();
        notifyDepartmentsChanged();
        notify(`Đã thêm khối "${cleanName}" thành công!`);
      } else {
        notify(res?.message || "Không thể thêm khối mới", "error");
      }
    } catch (err) {
      notify(err?.message || "Không thể thêm khối mới", "error");
    } finally {
      setAddingDept(false);
    }
  };

  const handleSaveRenameDepartment = async (deptId) => {
    const cleanName = String(editingDeptName || "").trim();
    if (!cleanName) {
      notify("Tên khối / bộ phận không được để trống!", "error");
      return;
    }
    setSavingDept(true);
    try {
      const res = await safePut(`/departments/${deptId}`, { name: cleanName });
      if (res?.success) {
        const moved = Number(res?.data?.updated_employees || 0);
        setEditingDeptId(null);
        setEditingDeptName("");
        await refreshDepartments();
        notifyDepartmentsChanged();
        notify(
          moved > 0
            ? `Đã đổi tên thành "${cleanName}" và đồng bộ ${moved} nhân viên!`
            : `Đã đổi tên khối thành "${cleanName}"!`
        );
      } else {
        notify(res?.message || "Không thể đổi tên khối", "error");
      }
    } catch (err) {
      notify(err?.message || "Không thể đổi tên khối", "error");
    } finally {
      setSavingDept(false);
    }
  };

  const handleExecuteDeleteDepartment = async () => {
    const target = confirmDeleteDept.dept;
    if (!target || deletingDept) return;
    setDeletingDept(true);
    try {
      const res = await safeDelete(`/departments/${target.id}`);
      if (res?.success) {
        setConfirmDeleteDept({ open: false, dept: null });
        await refreshDepartments();
        notifyDepartmentsChanged();
        const moved = Number(res.moved_employees || 0);
        const defName = res.default_department || defaultDepartmentName;
        notify(
          moved > 0
            ? `Đã xóa khối "${target.name}" và chuyển ${moved} nhân viên về "${defName}"!`
            : `Đã xóa khối "${target.name}"!`
        );
      } else {
        notify(res?.message || "Không thể xóa khối này", "error");
      }
    } catch (err) {
      notify(err?.message || "Không thể xóa khối này", "error");
    } finally {
      setDeletingDept(false);
    }
  };

  const handleLocationChange = (idx, field, value) => {
    setConfig((prev) => {
      const next = [...(prev.allowed_locations || [])];
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, allowed_locations: next };
    });
  };

  const handleAddLocation = () => {
    setConfig((prev) => ({
      ...prev,
      allowed_locations: [
        ...(prev.allowed_locations || []),
        {
          id: `loc_${Date.now()}`,
          name: `Chi nhánh / Công trình ${(prev.allowed_locations?.length || 0) + 1}`,
          lat: 16.0544,
          lng: 108.2022,
          radius: 300,
          attendance_method: "GPS"
        }
      ]
    }));
  };

  const handleRemoveLocation = (idx) => {
    setConfig((prev) => {
      const list = prev.allowed_locations || [];
      if (list.length <= 1) {
        notify("Cần giữ lại ít nhất 1 địa điểm chấm công!", "error");
        return prev;
      }
      return {
        ...prev,
        allowed_locations: list.filter((_, i) => i !== idx)
      };
    });
  };

  const handleUseCurrentGps = async (idx) => {
    setDetectingLocIdx(idx);
    try {
      const locRes = await zaloLocationService.acquireVerifiedLocation({
        requestPermissionIfNeeded: true,
        timeoutMs: 10000
      });
      const rawLat = Number(locRes?.data?.latitude);
      const rawLng = Number(locRes?.data?.longitude);
      if (!locRes.ok || !Number.isFinite(rawLat) || !Number.isFinite(rawLng)) {
        notify(
          locRes?.message ||
            "Thiết bị chưa trả về được tọa độ vị trí hiện tại. Vui lòng nhập tay hoặc thử lại.",
          "error"
        );
        return;
      }
      const lat = Number(rawLat.toFixed(6));
      const lng = Number(rawLng.toFixed(6));
      setConfig((prev) => {
        const next = [...(prev.allowed_locations || [])];
        next[idx] = { ...next[idx], lat, lng };
        return { ...prev, allowed_locations: next };
      });
      notify("Đã cập nhật tọa độ theo vị trí bạn đang đứng! Hãy bấm Lưu vị trí chấm công.");
    } catch (err) {
      notify(
        err?.message || "Không thể lấy vị trí. Hãy kiểm tra quyền truy cập vị trí trên thiết bị.",
        "error"
      );
    } finally {
      setDetectingLocIdx(null);
    }
  };

  const handleOpenBranchQr = async (branch) => {
    setQrModalState({
      open: true,
      loading: true,
      branch,
      session: null,
      qrDataUrl: "",
      error: ""
    });
    try {
      const session = await attendanceService.fetchDynamicBranchQr({
        branchId: branch?.id || "loc_hq_1",
        ttlSeconds: 90
      });
      if (!session?.qr_token) {
        throw new Error("Không nhận được mã QR từ máy chủ.");
      }
      const qrDataUrl = await QRCode.toDataURL(session.qr_token, {
        width: 260,
        margin: 2
      });
      setQrModalState({
        open: true,
        loading: false,
        branch,
        session,
        qrDataUrl,
        error: ""
      });
    } catch (err) {
      setQrModalState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || "Không thể khởi tạo mã QR động cho chi nhánh này."
      }));
    }
  };

  const handleSaveWifiIp = async () => {
    setSavingWifi(true);
    try {
      const res = await safePost(
        "/company/save-wifi-ip",
        {},
        {
          idempotencyKey: generateIdempotencyKey("comp_wifi")
        }
      );
      if (res?.data) {
        applyServerConfig(res.data);
      }
      notify(res?.message || "Đã lưu mạng Wi-Fi công ty thành công!");
    } catch (err) {
      notify(err?.message || "Không thể lưu mạng Wi-Fi hiện tại", "error");
    } finally {
      setSavingWifi(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-4">
        <SkeletonList rows={4} label="Đang tải cài đặt công ty..." />
      </div>
    );
  }

  const isInsuranceEnabled = toNum(config.insurance_rate, 0) > 0;
  const currentMonthNum = Number(getVietnamTodayIso().slice(5, 7));
  const currentYearNum = Number(getVietnamTodayIso().slice(0, 4));
  const currentStdDays = getMonthlyStandardWorkdays();

  return (
    <div className="max-w-3xl mx-auto pb-8 space-y-4">
      {statusBanner && (
        <div
          className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-sm font-medium ${
            statusBanner.type === "error"
              ? "bg-red-50 dark:bg-rose-950/60 border-red-200 dark:border-rose-800/70 text-red-700 dark:text-rose-300"
              : "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {statusBanner.type === "error" ? (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <span>{statusBanner.msg}</span>
        </div>
      )}

      {/* KHỐI 1: BẢNG TIN THÔNG BÁO NỘI BỘ (Lưu độc lập, payload siêu nhẹ) */}
      <div className="bg-amber-50/85 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 rounded-2xl p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-amber-950 dark:text-amber-200">
              📢 Bảng tin thông báo nội bộ
            </h3>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/90 mt-0.5">
              Hiển thị nổi bật ngay đầu màn hình chấm công của toàn bộ công nhân.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {config.announcement_text && (
              <button
                type="button"
                onClick={() => updateField("announcement_text", "")}
                className="h-[36px] min-h-[36px] px-3 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/60 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Xóa nội dung
              </button>
            )}
            <SectionSaveButton
              label="Lưu bảng tin"
              testId="save-section-announcement-btn"
              isDirty={isAnnouncementDirty}
              loading={savingSection === "announcement"}
              onClick={handleSaveAnnouncement}
            />
          </div>
        </div>
        <textarea
          rows={3}
          data-testid="company-announcement-textarea"
          value={config.announcement_text || ""}
          onChange={(e) => updateField("announcement_text", e.target.value)}
          placeholder="VD: Thứ 7 tuần này công trình A nghỉ bảo trì điện, anh em ca chiều chuyển sang kho B lúc 13:00..."
          className="w-full p-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-400 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {/* KHỐI 2: GIỜ LÀM VIỆC (CA SÁNG / CA CHIỀU) */}
      <AccordionSection
        id="schedule"
        title="1. Giờ làm việc (Ca Sáng / Ca Chiều)"
        subtitle={`${config.work_start || "08:00"} – ${config.work_end || "17:30"} • Nghỉ trưa ${config.lunch_start || "12:00"} – ${config.lunch_end || "13:30"}`}
        icon={Clock}
        iconColor="text-[#E11D48] dark:text-rose-300"
        iconBg="bg-[#FFE4E6] dark:bg-rose-950/60"
        isOpen={openSections.schedule}
        onToggle={toggleSection}
        headerAction={
          <SectionSaveButton
            label="Lưu giờ làm việc"
            testId="save-section-schedule-btn"
            isDirty={isScheduleDirty}
            loading={savingSection === "schedule"}
            onClick={handleSaveSchedule}
          />
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 flex items-center justify-between sm:flex-col sm:justify-center gap-2">
            <span className="text-slate-600 dark:text-slate-300 font-bold">CA SÁNG (4,0H)</span>
            <strong className="text-[#111C2D] dark:text-white font-mono whitespace-nowrap">
              {config.work_start || "08:00"} – {config.lunch_start || "12:00"}
            </strong>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 flex items-center justify-between sm:flex-col sm:justify-center gap-2">
            <span className="text-amber-800 dark:text-amber-300 font-bold">NGHỈ TRƯA</span>
            <strong className="text-amber-950 dark:text-amber-200 font-mono whitespace-nowrap">
              {config.lunch_start || "12:00"} – {config.lunch_end || "13:30"}
            </strong>
          </div>
          <div className="p-2.5 rounded-xl bg-[#F0F3FF] dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 flex items-center justify-between sm:flex-col sm:justify-center gap-2">
            <span className="text-slate-600 dark:text-slate-300 font-bold">CA CHIỀU (4,0H)</span>
            <strong className="text-[#111C2D] dark:text-white font-mono whitespace-nowrap">
              {config.lunch_end || "13:30"} – {config.work_end || "17:30"}
            </strong>
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-700/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl bg-slate-50/70 dark:bg-slate-800/70 overflow-hidden">
          <FormRow label="Giờ bắt đầu ca sáng">
            <input
              type="time"
              value={config.work_start || "08:00"}
              onChange={(e) => updateField("work_start", e.target.value)}
              className="w-[116px] sm:w-36 min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-base font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-center focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
            />
          </FormRow>
          <FormRow label="Bắt đầu nghỉ trưa (Kết thúc ca sáng)">
            <input
              type="time"
              value={config.lunch_start || "12:00"}
              onChange={(e) => updateField("lunch_start", e.target.value)}
              className="w-[116px] sm:w-36 min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-base font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-center focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
            />
          </FormRow>
          <FormRow label="Kết thúc nghỉ trưa (Bắt đầu ca chiều)">
            <input
              type="time"
              value={config.lunch_end || "13:30"}
              onChange={(e) => updateField("lunch_end", e.target.value)}
              className="w-[116px] sm:w-36 min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-base font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-center focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
            />
          </FormRow>
          <FormRow label="Giờ tan ca chiều">
            <input
              type="time"
              value={config.work_end || "17:30"}
              onChange={(e) => updateField("work_end", e.target.value)}
              className="w-[116px] sm:w-36 min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-base font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-center focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
            />
          </FormRow>
        </div>
      </AccordionSection>

      {/* KHỐI 3: THÔNG TIN CÔNG TY & LOGO */}
      <AccordionSection
        id="company_info"
        title="2. Thông tin công ty & Logo nhận diện"
        subtitle={config.company_name || "CÔNG TY CỔ PHẦN VẬT LIỆU XÂY DỰNG SEDINCO"}
        icon={Building2}
        iconColor="text-[#E11D48] dark:text-rose-300"
        iconBg="bg-[#FFE4E6] dark:bg-rose-950/60"
        isOpen={openSections.company_info}
        onToggle={toggleSection}
        headerAction={
          <SectionSaveButton
            label="Lưu thông tin"
            testId="save-section-company-info-btn"
            isDirty={isCompanyInfoDirty}
            loading={savingSection === "company_info"}
            onClick={handleSaveCompanyInfo}
          />
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Tên công ty hiển thị trên phiếu lương
            </label>
            <input
              type="text"
              value={config.company_name || ""}
              onChange={(e) => updateField("company_name", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Mã số thuế
              </label>
              <input
                type="text"
                value={config.tax_code || ""}
                onChange={(e) => updateField("tax_code", e.target.value)}
                placeholder="VD: 0401234567"
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Số điện thoại liên hệ
              </label>
              <input
                type="text"
                value={config.phone || ""}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="Ví dụ: 0236 3888 999"
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Địa chỉ trụ sở
              </label>
              <input
                type="text"
                value={config.address || ""}
                onChange={(e) => updateField("address", e.target.value)}
                placeholder="Nhập địa chỉ công ty"
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src={
                    config.logo_url &&
                    (String(config.logo_url).startsWith("https://res.cloudinary.com/") ||
                      String(config.logo_url).startsWith("data:image/"))
                      ? config.logo_url
                      : "/sedinco-logo.png"
                  }
                  alt="Logo công ty"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#111C2D] dark:text-white">
                  Logo nhận diện công ty (Cloudinary)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Hỗ trợ PNG, JPEG, WebP. Tự động lưu URL Cloudinary ngay sau khi tải lên.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingLogo(true);
                  try {
                    const uploadRes = await zaloMediaService.uploadBrowserEvidenceFile(file, {
                      category: "company_branding",
                      maxWidth: 512,
                      maxHeight: 512,
                      quality: 0.85
                    });
                    if (uploadRes.ok && uploadRes.data?.url) {
                      updateField("logo_url", uploadRes.data.url);
                      await saveSectionPayload(
                        "company_logo",
                        { logo_url: uploadRes.data.url },
                        "Đã tải lên và lưu Logo công ty thành công!"
                      );
                    } else {
                      notify(uploadRes.message || "Không thể tải lên logo công ty.", "error");
                    }
                  } catch (err) {
                    notify(err?.message || "Lỗi tải logo công ty.", "error");
                  } finally {
                    setUploadingLogo(false);
                    try {
                      e.target.value = "";
                    } catch {}
                  }
                }}
              />
              <AppButton
                type="button"
                variant="secondary"
                icon={uploadingLogo ? Loader2 : Upload}
                loading={uploadingLogo}
                onClick={() => logoInputRef.current?.click()}
                className="text-xs px-3 py-2"
              >
                Tải Logo mới
              </AppButton>
              {config.logo_url && (
                <AppButton
                  type="button"
                  variant="ghost"
                  icon={Trash2}
                  onClick={() => {
                    updateField("logo_url", null);
                    saveSectionPayload(
                      "company_logo",
                      { logo_url: null },
                      "Đã đặt lại Logo mặc định!"
                    );
                  }}
                  className="text-xs px-2.5 py-2 text-rose-600 dark:text-rose-400"
                >
                  Đặt lại
                </AppButton>
              )}
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* KHỐI 4: QUẢN LÝ KHỐI / BỘ PHẬN LÀM VIỆC (Lưu trực tiếp từng khối V52) */}
      <AccordionSection
        id="departments"
        title="3. Quản lý Khối / Bộ phận làm việc"
        subtitle={`${departments.length} khối / bộ phận • Mặc định: ${defaultDepartmentName}`}
        icon={Layers}
        iconColor="text-[#0051CA] dark:text-blue-300"
        iconBg="bg-blue-50 dark:bg-blue-950/60"
        isOpen={openSections.departments}
        onToggle={toggleSection}
      >
        <form onSubmit={handleAddDepartment} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            data-testid="new-department-input"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            placeholder="Nhập tên khối / bộ phận mới..."
            className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
          />
          <AppButton
            type="submit"
            variant="primary"
            icon={Plus}
            loading={addingDept}
            data-testid="add-department-btn"
            className="min-h-[44px] px-4 text-xs sm:text-sm whitespace-nowrap shrink-0"
          >
            Thêm khối
          </AppButton>
        </form>

        {loadingDepartments && departments.length === 0 ? (
          <SkeletonList rows={3} label="Đang tải danh sách khối / bộ phận..." />
        ) : (
          <div
            data-testid="departments-list"
            className="divide-y divide-slate-200 dark:divide-slate-700/80 border border-slate-200 dark:border-slate-700/80 rounded-2xl bg-slate-50/70 dark:bg-slate-800/60 overflow-hidden"
          >
            {departments.map((dept) => {
              const isDefault = Number(dept.is_default) === 1;
              const isEditing = editingDeptId === dept.id;
              return (
                <div
                  key={dept.id}
                  data-testid={`department-row-${dept.id}`}
                  className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white dark:bg-slate-900/70"
                >
                  {isEditing ? (
                    <div className="flex-1 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        data-testid={`rename-dept-input-${dept.id}`}
                        value={editingDeptName}
                        onChange={(e) => setEditingDeptName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSaveRenameDepartment(dept.id);
                          } else if (e.key === "Escape") {
                            setEditingDeptId(null);
                            setEditingDeptName("");
                          }
                        }}
                        autoFocus
                        className="flex-1 min-w-[160px] min-h-[44px] px-3 py-1.5 rounded-xl border border-rose-400 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none"
                      />
                      <AppButton
                        variant="success"
                        icon={Check}
                        loading={savingDept}
                        data-testid={`save-rename-dept-btn-${dept.id}`}
                        onClick={() => handleSaveRenameDepartment(dept.id)}
                        className="min-h-[44px] px-3 text-xs"
                      >
                        Lưu
                      </AppButton>
                      <AppButton
                        variant="secondary"
                        icon={X}
                        disabled={savingDept}
                        onClick={() => {
                          setEditingDeptId(null);
                          setEditingDeptName("");
                        }}
                        className="min-h-[44px] px-3 text-xs"
                      >
                        Hủy
                      </AppButton>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-[#111C2D] dark:text-white break-words">
                          {dept.name}
                        </span>
                        {isDefault && (
                          <span
                            data-testid="default-department-badge"
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-700 text-[#B80035] dark:text-rose-300 text-xs font-extrabold whitespace-nowrap"
                          >
                            Khối chính • Mặc định
                          </span>
                        )}
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold whitespace-nowrap">
                          {dept.employee_count || 0} nhân viên
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <AppButton
                          variant="secondary"
                          icon={Pencil}
                          data-testid={`rename-dept-btn-${dept.id}`}
                          onClick={() => {
                            setEditingDeptId(dept.id);
                            setEditingDeptName(dept.name);
                          }}
                          className="min-h-[44px] px-3 text-xs font-bold whitespace-nowrap"
                        >
                          Đổi tên
                        </AppButton>
                        {!isDefault && (
                          <AppButton
                            variant="ghost"
                            icon={Trash2}
                            data-testid={`delete-dept-btn-${dept.id}`}
                            onClick={() => setConfirmDeleteDept({ open: true, dept })}
                            className="min-h-[44px] px-3 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 whitespace-nowrap"
                          >
                            Xóa
                          </AppButton>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </AccordionSection>

      {/* KHỐI 5: ĐỊA CHỈ & WI-FI CHẤM CÔNG (GPS / BSSID) */}
      <AccordionSection
        id="locations"
        title="4. Địa chỉ & Wi-Fi chấm công (GPS / BSSID)"
        subtitle={`${config.allowed_locations?.length || 1} địa điểm được phép chấm công`}
        icon={MapPin}
        iconColor="text-emerald-600 dark:text-emerald-300"
        iconBg="bg-emerald-50 dark:bg-emerald-950/60"
        isOpen={openSections.locations}
        onToggle={toggleSection}
        headerAction={
          <SectionSaveButton
            label="Lưu vị trí chấm công"
            testId="save-section-locations-btn"
            isDirty={isLocationsDirty}
            loading={savingSection === "locations"}
            onClick={handleSaveLocations}
          />
        }
      >
        <div className="space-y-3">
          {(config.allowed_locations || []).map((loc, idx) => (
            <div
              key={loc.id || idx}
              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/70 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Địa điểm #{idx + 1}
                </span>
                <div className="flex items-center gap-2">
                  <AppButton
                    variant="success"
                    icon={Navigation}
                    loading={detectingLocIdx === idx}
                    onClick={() => handleUseCurrentGps(idx)}
                    className="text-xs px-3 py-2"
                  >
                    Lấy vị trí tôi đang đứng
                  </AppButton>
                  {(config.allowed_locations || []).length > 1 && (
                    <AppButton
                      variant="ghost"
                      onClick={() => handleRemoveLocation(idx)}
                      className="min-w-[44px] min-h-[44px] px-2.5 border border-red-200 dark:border-rose-800/70 bg-white dark:bg-slate-800 text-red-600 dark:text-rose-300 hover:bg-red-50 dark:hover:bg-rose-950/50"
                      aria-label="Xóa địa điểm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </AppButton>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Tên văn phòng / Kho bãi / Công trình
                </label>
                <input
                  type="text"
                  value={loc.name || ""}
                  onChange={(e) => handleLocationChange(idx, "name", e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Vĩ độ
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={loc.lat ?? ""}
                    onChange={(e) => handleLocationChange(idx, "lat", e.target.value)}
                    className="w-full min-h-[44px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Kinh độ
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={loc.lng ?? ""}
                    onChange={(e) => handleLocationChange(idx, "lng", e.target.value)}
                    className="w-full min-h-[44px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Bán kính (mét)
                  </label>
                  <input
                    type="number"
                    min="20"
                    value={loc.radius ?? 300}
                    onChange={(e) => handleLocationChange(idx, "radius", e.target.value)}
                    className="w-full min-h-[44px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Phương thức chấm công tại điểm
                  </label>
                  <select
                    value={loc.attendance_method || "GPS"}
                    onChange={(e) => handleLocationChange(idx, "attendance_method", e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-[#E11D48] focus:outline-none"
                  >
                    <option value="GPS">GPS định vị / Wi-Fi nội bộ</option>
                    <option value="GPS_AND_QR">Kết hợp GPS + Quét mã QR động</option>
                    <option value="QR_ONLY">Chỉ Quét mã QR động (dự phòng khi tắt GPS)</option>
                  </select>
                </div>
                <AppButton
                  variant="secondary"
                  icon={QrCode}
                  onClick={() => handleOpenBranchQr(loc)}
                  className="min-h-[44px] text-xs font-bold"
                >
                  Hiển thị QR Động Chi nhánh
                </AppButton>
              </div>
            </div>
          ))}

          <AppButton
            variant="ghost"
            fullWidth
            icon={Plus}
            onClick={handleAddLocation}
            className="border border-dashed border-emerald-400 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/70"
          >
            Thêm chi nhánh / công trình mới
          </AppButton>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F0F3FF] dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/70 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-[#0068FF] dark:text-blue-300 font-bold text-xs">
              <Wifi className="w-4 h-4" />
              <span>Chấm công nhanh bằng Wi-Fi công ty</span>
            </div>
            <AppButton
              variant="primary"
              icon={Wifi}
              loading={savingWifi}
              onClick={handleSaveWifiIp}
              className="text-xs px-3 py-2"
            >
              Lưu Wi-Fi đang kết nối
            </AppButton>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Địa chỉ mạng hiện tại của bạn:{" "}
            <strong className="text-slate-800 dark:text-white">
              {config.current_client_ip || "Đang xác định"}
            </strong>
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Danh sách địa chỉ mạng Wi-Fi hợp lệ (cách nhau bởi dấu phẩy)
            </label>
            <input
              type="text"
              value={config.office_ip_whitelist || ""}
              onChange={(e) => updateField("office_ip_whitelist", e.target.value)}
              placeholder="Bấm nút Lưu Wi-Fi đang kết nối để tự điền"
              className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none"
            />
          </div>
        </div>
      </AccordionSection>

      {/* KHỐI 6: QUY TẮC TÍNH CÔNG, TĂNG CA & BẢO HIỂM (Đồng bộ 1-1 với Payroll & Attendance Engine) */}
      <AccordionSection
        id="payroll"
        title="5. Quy tắc tính công, tăng ca & bảo hiểm"
        subtitle={`Công chuẩn tự động (${currentStdDays} ngày) • Phép tháng ${config.monthly_paid_leave_limit ?? 1} lượt • OT x${formatViNumber(config.ot_rate_weekday ?? 1.5)} • Bảo hiểm ${isInsuranceEnabled ? `${formatViNumber(config.insurance_rate ?? 10.5)}%` : "Tắt"}`}
        icon={Calculator}
        iconColor="text-[#E11D48] dark:text-rose-300"
        iconBg="bg-[#FFE4E6] dark:bg-rose-950/60"
        isOpen={openSections.payroll}
        onToggle={toggleSection}
        headerAction={
          <SectionSaveButton
            label="Lưu quy tắc"
            testId="save-section-rules-btn"
            isDirty={isRulesDirty}
            loading={savingSection === "rules"}
            onClick={handleSaveRules}
          />
        }
      >
        {/* NHÓM 1: QUY TẮC CHẤM CÔNG & PHÉP THÁNG */}
        <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-white uppercase tracking-wide flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />
              <span>Nhóm 1 — Quy tắc Chấm công &amp; Phép tháng</span>
            </h4>
          </div>

          <div
            data-testid="auto-standard-workdays-note"
            className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/70 text-xs text-slate-700 dark:text-slate-200 leading-relaxed"
          >
            <strong>Công chuẩn tháng tự động tính = Tổng số ngày trong tháng trừ Chủ nhật</strong>{" "}
            (Tháng {currentMonthNum}/{currentYearNum} hiện tại: <strong>{currentStdDays} ngày công chuẩn</strong>).
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Định mức nghỉ phép có lương tối đa / tháng (lượt)
              </label>
              <input
                data-testid="company-monthly-leave-limit-input"
                type="number"
                min="0"
                max="31"
                step="1"
                value={config.monthly_paid_leave_limit ?? 1}
                onChange={(e) => updateField("monthly_paid_leave_limit", e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:border-[#E11D48] focus:outline-none"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Mặc định: 1 lượt/tháng (không cộng dồn). Áp dụng ngay cho duyệt đơn &amp; tính lương.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Ngưỡng đi muộn / về sớm cho phép (phút)
              </label>
              <input
                data-testid="company-grace-period-input"
                type="number"
                min="0"
                value={config.grace_period_minutes ?? 15}
                onChange={(e) => updateField("grace_period_minutes", e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:border-[#E11D48] focus:outline-none"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Vào trễ trong số phút này vẫn được ghi nhận đúng giờ.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Hình thức xử lý đi muộn
              </label>
              <select
                value={config.late_policy_type || "PER_MINUTE"}
                onChange={(e) => updateField("late_policy_type", e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 focus:border-[#E11D48] focus:outline-none"
              >
                <option value="NONE">Không trừ phạt (Chỉ ghi nhận)</option>
                <option value="PER_MINUTE">Phạt tiền theo số phút đi muộn</option>
                <option value="PER_OCCURRENCE">Phạt tiền cố định mỗi lần đi muộn</option>
                <option value="DEDUCT_WORKDAY">Trừ nửa ngày công nếu trễ quá ngưỡng</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Số lần đi muộn miễn phạt / tháng
              </label>
              <input
                type="number"
                min="0"
                value={config.free_late_occurrences ?? 3}
                onChange={(e) => updateField("free_late_occurrences", e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {(config.late_policy_type || "PER_MINUTE") === "PER_MINUTE" && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Mức phạt đi muộn mỗi phút (VNĐ — nhập 0 nếu không phạt tiền)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={formatViNumber(
                  config.late_penalty_per_minute ?? config.penalty_per_minute ?? 2000,
                  0
                )}
                onChange={(e) => {
                  const num = Math.max(0, Math.round(parseViNumberInput(e.target.value)));
                  updateField("late_penalty_per_minute", num);
                  updateField("penalty_per_minute", num);
                }}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
              />
            </div>
          )}

          {config.late_policy_type === "PER_OCCURRENCE" && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Mức phạt mỗi lần đi muộn (VNĐ — nhập 0 nếu không phạt tiền)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={formatViNumber(
                  config.late_penalty_amount ?? config.penalty_fixed_block ?? 50000,
                  0
                )}
                onChange={(e) => {
                  const num = Math.max(0, Math.round(parseViNumberInput(e.target.value)));
                  updateField("late_penalty_amount", num);
                  updateField("penalty_fixed_block", num);
                }}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
              />
            </div>
          )}

          {config.late_policy_type === "DEDUCT_WORKDAY" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Ngưỡng trễ tính nửa công (phút)
                </label>
                <input
                  type="number"
                  min="1"
                  value={config.max_late_minutes_for_half_day ?? 60}
                  onChange={(e) => updateField("max_late_minutes_for_half_day", e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Miễn hạ công trong số lần trễ cho phép
                </label>
                <select
                  value={String(config.free_late_exempts_halfday ? 1 : 0)}
                  onChange={(e) => updateField("free_late_exempts_halfday", Number(e.target.value))}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100"
                >
                  <option value="0">Không miễn (Vẫn tính 0,5 công nếu trễ nặng)</option>
                  <option value="1">Có miễn trong số lần trễ cho phép</option>
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Mức hưởng lương thử việc (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={config.probation_salary_percent ?? 85}
                onChange={(e) => updateField("probation_salary_percent", e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Phụ cấp &amp; đơn giá tăng ca thử việc
              </label>
              <select
                value={String(config.probation_allowance_full ?? 1)}
                onChange={(e) => updateField("probation_allowance_full", Number(e.target.value))}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="1">Hưởng đủ 100% phụ cấp &amp; đơn giá tăng ca</option>
                <option value="0">Nhân theo tỷ lệ lương thử việc</option>
              </select>
            </div>
          </div>
        </div>

        {/* NHÓM 2: QUY TẮC TĂNG CA (OT) */}
        <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-3.5">
          <h4 className="text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-white uppercase tracking-wide flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Nhóm 2 — Quy tắc Tăng ca (OT)</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Hệ số tăng ca ngày thường (VD: 1,5)
              </label>
              <input
                data-testid="company-ot-weekday-input"
                type="number"
                min="1"
                step="0.1"
                value={config.ot_rate_weekday ?? 1.5}
                onChange={(e) => updateField("ot_rate_weekday", e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:border-[#E11D48] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Hệ số tăng ca ngày Chủ nhật (VD: 2,0)
              </label>
              <input
                data-testid="company-ot-weekend-input"
                type="number"
                min="1"
                step="0.1"
                value={config.ot_rate_weekend ?? 2.0}
                onChange={(e) => updateField("ot_rate_weekend", e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:border-[#E11D48] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Đơn giá tăng ca cố định / giờ (VNĐ — nhập 0 để tính theo hệ số)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={formatViNumber(config.custom_ot_hourly_rate ?? 0, 0)}
                onChange={(e) =>
                  updateField(
                    "custom_ot_hourly_rate",
                    Math.max(0, Math.round(parseViNumberInput(e.target.value)))
                  )
                }
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Chế độ ghi nhận tăng ca
              </label>
              <select
                value={config.ot_calculation_mode || "APPROVED_OR_AUTO"}
                onChange={(e) => updateField("ot_calculation_mode", e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="APPROVED_OR_AUTO">Ưu tiên đơn duyệt, tự tính theo bảng công</option>
                <option value="REQUIRE_APPROVAL">Bắt buộc có đơn tăng ca đã duyệt</option>
                <option value="AUTO_ACTUAL">Tính đủ theo giờ tăng ca trên bảng công</option>
              </select>
            </div>
          </div>

          <div
            data-testid="holiday-multiplier-guidance-note"
            className="p-3 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 flex items-center gap-2 text-xs text-rose-900 dark:text-rose-200 font-semibold"
          >
            <Gift className="w-4 h-4 text-[#E11D48] dark:text-rose-400 shrink-0" />
            <span>
              Hệ số đi làm ngày lễ được thiết lập riêng cho từng dịp tại mục{" "}
              <strong>Cài đặt → Ngày lễ</strong>.
            </span>
          </div>
        </div>

        {/* NHÓM 3: QUY TẮC BẢO HIỂM (BHXH / BHYT / BHTN) */}
        <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs sm:text-sm font-extrabold text-[#111C2D] dark:text-white uppercase tracking-wide flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Nhóm 3 — Quy tắc Bảo hiểm (BHXH / BHYT / BHTN)</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Khi Tắt (0%), tiền khấu trừ bảo hiểm = 0 đ và ẩn hoàn toàn dòng bảo hiểm trên Bảng lương &amp; Phiếu lương.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={isInsuranceEnabled}
              data-testid="company-insurance-toggle"
              onClick={() => {
                if (isInsuranceEnabled) {
                  updateField("insurance_rate", 0);
                } else {
                  updateField("insurance_rate", lastPositiveInsuranceRateRef.current || 10.5);
                }
              }}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl border text-xs font-extrabold inline-flex items-center gap-2 transition cursor-pointer ${
                isInsuranceEnabled
                  ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600"
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isInsuranceEnabled ? "bg-white" : "bg-slate-400"
                }`}
              />
              <span>{isInsuranceEnabled ? "Đang Bật khấu trừ Bảo hiểm" : "Đang Tắt khấu trừ Bảo hiểm"}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isInsuranceEnabled && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Tỷ lệ đóng bảo hiểm người lao động (%)
                </label>
                <input
                  data-testid="company-insurance-rate-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={config.insurance_rate ?? 10.5}
                  onChange={(e) => updateField("insurance_rate", e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:border-[#E11D48] focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Xử lý khi lương thực lĩnh âm
              </label>
              <select
                value={config.negative_salary_policy || "CLAMP_ZERO"}
                onChange={(e) => updateField("negative_salary_policy", e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="CLAMP_ZERO">Giữ 0 đ &amp; ghi nhận nợ chuyển kỳ sau</option>
                <option value="SHOW_NEGATIVE">Hiển thị số âm trực tiếp trên phiếu lương</option>
              </select>
            </div>
          </div>
        </div>
      </AccordionSection>

      <ConfirmDialog
        open={confirmDeleteDept.open}
        title="Xác nhận xóa khối / bộ phận"
        message={
          confirmDeleteDept.dept
            ? `Xóa khối "${confirmDeleteDept.dept.name}"? Toàn bộ ${confirmDeleteDept.dept.employee_count || 0} nhân viên đang thuộc khối này sẽ tự động chuyển về khối chính "${defaultDepartmentName}".`
            : ""
        }
        confirmLabel="Xóa khối & Chuyển nhân viên"
        variant="danger"
        loading={deletingDept}
        onCancel={() => {
          if (!deletingDept) setConfirmDeleteDept({ open: false, dept: null });
        }}
        onConfirm={handleExecuteDeleteDepartment}
      />

      {/* Modal QR Động Chấm công Chi nhánh (Có thời hạn & chống replay) */}
      <AppModal
        open={qrModalState.open}
        onClose={() => setQrModalState((prev) => ({ ...prev, open: false }))}
        title="Mã QR Chấm Công Động"
        subtitle={qrModalState.branch?.name || "Điểm chấm công Sedinco"}
        maxWidthClass="max-w-sm"
        footer={
          <div className="flex gap-2">
            <AppButton
              variant="secondary"
              onClick={() => setQrModalState((prev) => ({ ...prev, open: false }))}
              className="flex-1"
            >
              Đóng
            </AppButton>
            <AppButton
              variant="primary"
              icon={RefreshCw}
              loading={qrModalState.loading}
              onClick={() => handleOpenBranchQr(qrModalState.branch)}
              className="flex-1"
            >
              Cấp mã QR mới
            </AppButton>
          </div>
        }
      >
        <div className="p-4 text-center space-y-3">
          {qrModalState.loading ? (
            <div className="py-10 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Đang sinh mã QR ký HMAC có hiệu lực 90 giây...
            </div>
          ) : qrModalState.error ? (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-700 text-xs font-semibold text-rose-700 dark:text-rose-200">
              {qrModalState.error}
            </div>
          ) : (
            <>
              {qrModalState.qrDataUrl && (
                <img
                  src={qrModalState.qrDataUrl}
                  alt="Mã QR chấm công động"
                  className="w-56 h-56 mx-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white p-2"
                />
              )}
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 bg-slate-50 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                <div>
                  Hiệu lực đến:{" "}
                  <strong className="text-[#111C2D] dark:text-white font-mono">
                    {qrModalState.session?.expires_at_vn}
                  </strong>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Múi giờ: {qrModalState.session?.timezone || "Asia/Ho_Chi_Minh"} • Dùng 1 lần chống quét lại
                </div>
              </div>
            </>
          )}
        </div>
      </AppModal>
    </div>
  );
}
