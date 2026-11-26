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
  CheckCircle2,
  AlertCircle,
  Building2,
  Layers,
  Pencil,
  Check,
  X,
  QrCode,
  RefreshCw,
  Upload,
  Loader2,
  Megaphone
} from "lucide-react";
import QRCode from "qrcode";
import { safeGet, safePut, safePost, safeDelete, generateIdempotencyKey } from "../../utils/api";
import { zaloLocationService } from "../../services/zalo-location.service";
import { zaloMediaService } from "../../services/zalo-media.service";
import { attendanceService } from "../../services/attendance.service";
import { formatViNumber, parseViNumberInput } from "../../utils/viNumberFormat";
import { getMonthlyStandardWorkdays, getVietnamTodayIso } from "../../utils/workdayUtils";
import { AppModal, SkeletonList, Switch } from "../../components/ui";
import ConfirmDialog from "../../components/ConfirmDialog";
import useDepartments, { notifyDepartmentsChanged } from "../../hooks/useDepartments";

const SECTION_FIELD_MAP = {
  company_info: ["company_name", "phone", "address", "tax_code"],
  company_logo: ["logo_url"],
  announcement: ["announcement_text", "announcement_updated_at"],
  schedule: ["work_start", "lunch_start", "lunch_end", "work_end"],
  locations: [
    "allowed_locations",
    "latitude",
    "longitude",
    "radius_meters",
    "office_ip_whitelist",
    "is_matching_office_wifi"
  ],
  rules: [
    "grace_period_minutes",
    "late_policy_type",
    "free_late_occurrences",
    "penalty_per_minute",
    "late_penalty_per_minute",
    "penalty_fixed_block",
    "late_penalty_amount",
    "max_late_minutes_for_half_day",
    "free_late_exempts_halfday",
    "monthly_paid_leave_limit",
    "probation_salary_percent",
    "probation_allowance_full",
    "ot_rate_weekday",
    "ot_rate_weekend",
    "custom_ot_hourly_rate",
    "ot_calculation_mode",
    "insurance_rate",
    "negative_salary_policy"
  ]
};

function parseTimeStrToMinutes(timeStr) {
  const m = String(timeStr || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return NaN;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return NaN;
  return hh * 60 + mm;
}

function parseStrictViDecimal(val) {
  if (val === "" || val === null || val === undefined || typeof val === "boolean") {
    return NaN;
  }
  const normalized = typeof val === "string" ? val.trim().replace(",", ".") : val;
  if (normalized === "") return NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

const toNum = (val, fallback) => {
  const parsed = parseStrictViDecimal(val);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const COMPACT_BTN_BASE =
  "w-fit h-[36px] min-h-[36px] px-3.5 text-[13.5px] font-semibold rounded-lg whitespace-nowrap inline-flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-60 shrink-0";

const INPUT_PAIRED_BTN_BASE =
  "w-fit h-[40px] min-h-[40px] px-3.5 text-[13.5px] font-semibold rounded-lg whitespace-nowrap inline-flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-60 shrink-0";

const COMPACT_INPUT_CLASS =
  "w-full h-[40px] min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px] font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#E11D48] dark:focus:border-rose-400 focus:outline-none";

const LABEL_CLASS =
  "block text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 mb-1 whitespace-normal break-words overflow-visible leading-snug";

const HELPER_TEXT_CLASS =
  "text-[12px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug mt-1";

/**
 * InputWithSuffix — Ô nhập liệu chuẩn cao 40px có hậu tố đơn vị nằm cố định bên phải trong ô
 */
function InputWithSuffix({
  suffix,
  suffixWidthClass = "pr-11",
  className = "",
  ...inputProps
}) {
  return (
    <div className="relative flex items-center w-full">
      <input
        {...inputProps}
        className={`${COMPACT_INPUT_CLASS} ${suffix ? suffixWidthClass : ""} ${className}`}
      />
      {suffix && (
        <span className="pointer-events-none select-none absolute right-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
          {suffix}
        </span>
      )}
    </div>
  );
}

/**
 * SectionSaveButton — Nút Lưu cục bộ đặt ở góc phải dưới mỗi khối Accordion đang mở
 */
function SectionSaveButton({
  label = "Lưu",
  dirtyLabel = "Lưu thay đổi",
  isDirty,
  loading,
  onClick,
  testId
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
      className={`${COMPACT_BTN_BASE} ${
        isDirty
          ? "bg-[#E11D48] hover:bg-[#BE123C] text-white shadow-sm shadow-rose-600/25 border border-[#E11D48]"
          : "bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700"
      }`}
    >
      {loading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>Đang lưu...</span>
        </>
      ) : (
        <>
          <Save className="w-3.5 h-3.5 shrink-0" />
          <span>{isDirty ? dirtyLabel : label}</span>
        </>
      )}
    </button>
  );
}

/**
 * SmartAccordion V63 — Bố cục 2 tầng không bao giờ cắt chữ (Zero-Truncation)
 * - Tầng 1: Icon (w-8 h-8 shrink-0) + Tiêu đề chức năng (flex-1 min-w-0 whitespace-normal break-words) + ChevronDown (shrink-0 mt-1)
 * - Tầng 2: Dòng tóm tắt trạng thái động trải trọn 100% chiều rộng (kèm huy hiệu "● Chưa lưu")
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
      data-testid={`settings-accordion-${id}`}
      data-open={isOpen ? "true" : "false"}
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/85 dark:border-slate-800 shadow-xs transition-all"
    >
      <button
        type="button"
        data-testid={`accordion-header-${id}`}
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

        {/* Tầng 2: Dòng mô tả / tóm tắt trạng thái động chiếm trọn 100% chiều rộng */}
        <div className="w-full mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p
            data-testid={`accordion-summary-${id}`}
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
        <div className="px-3.5 pb-3.5 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

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
  const [savingSections, setSavingSections] = useState({});
  const savingSectionsRef = useRef({});
  const [savingWifi, setSavingWifi] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);
  const lastPositiveInsuranceRateRef = useRef(10.5);
  const lastAnnouncementTextRef = useRef("");
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [newWifiInput, setNewWifiInput] = useState("");
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
    company_info: false,
    announcement: false,
    schedule: false,
    locations: false,
    departments: false,
    payroll: false
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
    if (data.announcement_text !== undefined) {
      const cleanText = String(data.announcement_text || "").trim();
      if (cleanText) {
        lastAnnouncementTextRef.current = cleanText;
      }
      setAnnouncementEnabled(Boolean(cleanText));
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

  const toggleSection = useCallback((id) => {
    const isMobileViewport =
      typeof window !== "undefined" && Number(window.innerWidth) < 768;
    setOpenSections((prev) => {
      const nextState = !prev[id];
      if (isMobileViewport) {
        return {
          company_info: false,
          announcement: false,
          schedule: false,
          locations: false,
          departments: false,
          payroll: false,
          [id]: nextState
        };
      }
      return {
        ...prev,
        [id]: nextState
      };
    });
  }, []);

  const updateField = (key, value) => {
    if (key === "insurance_rate" && toNum(value, 0) > 0) {
      lastPositiveInsuranceRateRef.current = toNum(value, 10.5);
    }
    if (key === "announcement_text" && String(value || "").trim()) {
      lastAnnouncementTextRef.current = String(value);
      if (!announcementEnabled) setAnnouncementEnabled(true);
    }
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const effectiveAnnouncementText = announcementEnabled
    ? String(config.announcement_text || "").trim()
    : "";
  const savedAnnouncementText = String(savedConfig.announcement_text || "").trim();

  const isAnnouncementDirty = effectiveAnnouncementText !== savedAnnouncementText;

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
    toNum(config.monthly_paid_leave_limit, 1) !== toNum(savedConfig.monthly_paid_leave_limit, 1) ||
    toNum(config.ot_rate_weekday, 1.5) !== toNum(savedConfig.ot_rate_weekday, 1.5) ||
    toNum(config.ot_rate_weekend, 2.0) !== toNum(savedConfig.ot_rate_weekend, 2.0) ||
    toNum(config.insurance_rate, 10.5) !== toNum(savedConfig.insurance_rate, 10.5);

  const applySectionSavedConfig = useCallback((sectionKey, serverData, partialPayload) => {
    const keys = SECTION_FIELD_MAP[sectionKey] || Object.keys(partialPayload || {});
    const source = serverData && typeof serverData === "object" ? serverData : partialPayload || {};

    if (keys.includes("insurance_rate") && Number(source.insurance_rate) > 0) {
      lastPositiveInsuranceRateRef.current = Number(source.insurance_rate);
    }
    if (keys.includes("announcement_text") && source.announcement_text !== undefined) {
      const cleanText = String(source.announcement_text || "").trim();
      if (cleanText) {
        lastAnnouncementTextRef.current = cleanText;
      }
      setAnnouncementEnabled(Boolean(cleanText));
    }

    const patch = {};
    keys.forEach((k) => {
      if (source[k] !== undefined) {
        patch[k] = source[k];
      } else if (partialPayload && partialPayload[k] !== undefined) {
        patch[k] = partialPayload[k];
      }
    });

    setSavedConfig((prev) => ({ ...prev, ...patch }));
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const saveSectionPayload = async (sectionKey, partialPayload, successMessage) => {
    if (savingSectionsRef.current[sectionKey]) return;
    savingSectionsRef.current[sectionKey] = true;
    setSavingSections((prev) => ({ ...prev, [sectionKey]: true }));
    try {
      const res = await safePut("/company/settings", partialPayload, {
        idempotencyKey: generateIdempotencyKey(`comp_${sectionKey}`)
      });
      applySectionSavedConfig(sectionKey, res?.data, partialPayload);
      notify(successMessage || res?.message || "Đã lưu cài đặt thành công!");
    } catch (err) {
      notify(err?.message || "Không thể lưu cài đặt. Vui lòng thử lại!", "error");
    } finally {
      savingSectionsRef.current[sectionKey] = false;
      setSavingSections((prev) => ({ ...prev, [sectionKey]: false }));
    }
  };

  const handleSaveCompanyInfo = () => {
    const cleanCompanyName = String(config.company_name || "").trim();
    if (!cleanCompanyName) {
      notify("Tên công ty không được để trống!", "error");
      return;
    }
    return saveSectionPayload(
      "company_info",
      {
        company_name: cleanCompanyName,
        phone: config.phone ? String(config.phone).trim() : "",
        address: config.address ? String(config.address).trim() : "",
        tax_code: config.tax_code ? String(config.tax_code).trim() : ""
      },
      "Đã lưu thông tin công ty!"
    );
  };

  const handleSaveAnnouncement = () =>
    saveSectionPayload(
      "announcement",
      {
        announcement_text: effectiveAnnouncementText
      },
      "Đã lưu bảng tin nội bộ!"
    );

  const handleSaveSchedule = () => {
    const ws = config.work_start || "08:00";
    const ls = config.lunch_start || "12:00";
    const le = config.lunch_end || "13:30";
    const we = config.work_end || "17:30";
    const wsMin = parseTimeStrToMinutes(ws);
    const lsMin = parseTimeStrToMinutes(ls);
    const leMin = parseTimeStrToMinutes(le);
    const weMin = parseTimeStrToMinutes(we);

    if (
      !Number.isFinite(wsMin) ||
      !Number.isFinite(lsMin) ||
      !Number.isFinite(leMin) ||
      !Number.isFinite(weMin)
    ) {
      notify("Định dạng giờ làm việc không hợp lệ (HH:MM)!", "error");
      return;
    }
    if (lsMin <= wsMin) {
      notify("Giờ kết thúc ca sáng phải sau giờ bắt đầu ca sáng!", "error");
      return;
    }
    if (leMin < lsMin) {
      notify("Giờ bắt đầu ca chiều không được sớm hơn giờ kết thúc ca sáng!", "error");
      return;
    }
    if (weMin <= leMin) {
      notify("Giờ kết thúc ca chiều phải sau giờ bắt đầu ca chiều!", "error");
      return;
    }

    return saveSectionPayload(
      "schedule",
      {
        work_start: ws,
        lunch_start: ls,
        lunch_end: le,
        work_end: we
      },
      "Đã lưu giờ làm việc!"
    );
  };

  const handleSaveLocations = () => {
    const rawList = config.allowed_locations || [];
    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      const latNum = parseStrictViDecimal(item.lat);
      const lngNum = parseStrictViDecimal(item.lng);
      const radNum = parseStrictViDecimal(item.radius);
      if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
        notify(`Vĩ độ tại điểm #${i + 1} không hợp lệ (-90 đến 90)!`, "error");
        return;
      }
      if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
        notify(`Kinh độ tại điểm #${i + 1} không hợp lệ (-180 đến 180)!`, "error");
        return;
      }
      if (!Number.isFinite(radNum) || radNum <= 0) {
        notify(`Bán kính GPS tại điểm #${i + 1} phải lớn hơn 0 mét!`, "error");
        return;
      }
    }

    const cleanedLocations = rawList.map((loc, idx) => ({
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
      "Đã lưu vị trí & Wi-Fi chấm công!"
    );
  };

  const handleSaveRules = () => {
    const graceNum = parseStrictViDecimal(config.grace_period_minutes);
    if (!Number.isFinite(graceNum) || graceNum < 0 || graceNum > 240) {
      notify("Ngưỡng đi muộn tối đa phải từ 0 đến 240 phút!", "error");
      return;
    }
    const leaveLimitNum = parseStrictViDecimal(config.monthly_paid_leave_limit);
    if (!Number.isFinite(leaveLimitNum) || leaveLimitNum < 0 || leaveLimitNum > 31) {
      notify("Định mức phép có lương / tháng phải từ 0 đến 31 lượt!", "error");
      return;
    }
    const otWeekdayNum = parseStrictViDecimal(config.ot_rate_weekday);
    if (!Number.isFinite(otWeekdayNum) || otWeekdayNum < 1 || otWeekdayNum > 10) {
      notify("Hệ số OT ngày thường phải từ 1,0 đến 10,0!", "error");
      return;
    }
    const otWeekendNum = parseStrictViDecimal(config.ot_rate_weekend);
    if (!Number.isFinite(otWeekendNum) || otWeekendNum < 1 || otWeekendNum > 10) {
      notify("Hệ số OT Chủ nhật phải từ 1,0 đến 10,0!", "error");
      return;
    }
    const insRateNum = parseStrictViDecimal(config.insurance_rate);
    if (!Number.isFinite(insRateNum) || insRateNum < 0 || insRateNum > 100) {
      notify("Tỷ lệ khấu trừ bảo hiểm phải từ 0% đến 100%!", "error");
      return;
    }

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
        grace_period_minutes: Math.round(graceNum),
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
        monthly_paid_leave_limit: Math.round(leaveLimitNum * 100) / 100,
        probation_salary_percent: Math.min(
          100,
          Math.max(0, toNum(config.probation_salary_percent, 85))
        ),
        probation_allowance_full: probationFull,
        ot_rate_weekday: Math.round(otWeekdayNum * 100) / 100,
        ot_rate_weekend: Math.round(otWeekendNum * 100) / 100,
        custom_ot_hourly_rate: Math.max(0, toNum(config.custom_ot_hourly_rate, 0)),
        ot_calculation_mode: config.ot_calculation_mode || "APPROVED_OR_AUTO",
        insurance_rate: Math.round(insRateNum * 100) / 100,
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
      notify("Đã cập nhật tọa độ GPS hiện tại! Hãy bấm Lưu thay đổi.");
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

  const wifiItems = String(config.office_ip_whitelist || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const handleAddWifiEntry = () => {
    const entry = String(newWifiInput || "").trim();
    if (!entry) return;
    if (wifiItems.includes(entry)) {
      setNewWifiInput("");
      return;
    }
    const nextList = [...wifiItems, entry].join(", ");
    updateField("office_ip_whitelist", nextList);
    setNewWifiInput("");
  };

  const handleRemoveWifiEntry = (targetEntry) => {
    const nextList = wifiItems.filter((item) => item !== targetEntry).join(", ");
    updateField("office_ip_whitelist", nextList);
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
        applySectionSavedConfig("locations", res.data, {
          office_ip_whitelist: res.office_ip_whitelist
        });
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
      <div className="max-w-3xl mx-auto py-3">
        <SkeletonList rows={4} label="Đang tải cài đặt công ty..." />
      </div>
    );
  }

  const isInsuranceEnabled = toNum(config.insurance_rate, 0) > 0;
  const currentMonthNum = Number(getVietnamTodayIso().slice(5, 7));
  const currentYearNum = Number(getVietnamTodayIso().slice(0, 4));
  const currentStdDays = getMonthlyStandardWorkdays();

  // Tóm tắt trạng thái động hiển thị đầy đủ (Zero-Truncation)
  const companyInfoSummary = `${
    savedConfig.company_name || "Chưa đặt tên công ty"
  } • ${savedConfig.logo_url ? "Đã có logo" : "Chưa có logo"}`;

  const announcementSummary = savedAnnouncementText
    ? `Đang bật (${savedAnnouncementText.length} ký tự) • ${savedAnnouncementText}`
    : "Đang tắt";

  const scheduleSummary = `Sáng ${savedConfig.work_start || "08:00"}–${
    savedConfig.lunch_start || "12:00"
  } • Chiều ${savedConfig.lunch_end || "13:30"}–${savedConfig.work_end || "17:30"}`;

  const savedLocations = Array.isArray(savedConfig.allowed_locations)
    ? savedConfig.allowed_locations
    : [];
  const primarySavedLoc = savedLocations[0];
  const savedWifiList = String(savedConfig.office_ip_whitelist || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hasSavedGps =
    primarySavedLoc &&
    Number.isFinite(Number(primarySavedLoc.lat)) &&
    Number.isFinite(Number(primarySavedLoc.lng));
  const locationsSummary = hasSavedGps
    ? `Bán kính ${primarySavedLoc.radius || 300} m • ${savedWifiList.length} Wi-Fi`
    : `Chưa cấu hình GPS • ${savedWifiList.length} Wi-Fi`;

  const departmentsSummary = `${departments.length} khối làm việc • Mặc định: ${defaultDepartmentName}`;

  const savedInsuranceOn = toNum(savedConfig.insurance_rate, 0) > 0;
  const payrollSummary = `OT x${formatViNumber(
    savedConfig.ot_rate_weekday ?? 1.5
  )} / x${formatViNumber(savedConfig.ot_rate_weekend ?? 2.0)} • Phép ${
    savedConfig.monthly_paid_leave_limit ?? 1
  } lượt/tháng • BH: ${savedInsuranceOn ? "Bật" : "Tắt"}`;

  return (
    <div className="max-w-3xl mx-auto pb-6 space-y-2.5 sm:space-y-3">
      {statusBanner && (
        <div
          className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-[13px] font-medium whitespace-normal break-words overflow-visible ${
            statusBanner.type === "error"
              ? "bg-red-50 dark:bg-rose-950/60 border-red-200 dark:border-rose-800/70 text-red-700 dark:text-rose-300"
              : "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {statusBanner.type === "error" ? (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="flex-1 min-w-0 whitespace-normal break-words overflow-visible leading-snug">
            {statusBanner.msg}
          </span>
        </div>
      )}

      {/* KHỐI 1: THÔNG TIN CÔNG TY & LOGO */}
      <SmartAccordion
        id="company_info"
        title="Thông tin công ty & Logo"
        summary={companyInfoSummary}
        icon={Building2}
        iconColor="text-[#E11D48] dark:text-rose-300"
        iconBg="bg-[#FFE4E6] dark:bg-rose-950/60"
        isOpen={openSections.company_info}
        isDirty={isCompanyInfoDirty}
        onToggle={toggleSection}
      >
        <div className="space-y-2.5">
          {/* Hàng Logo 48x48 + nút [Đổi logo] */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
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
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words overflow-visible leading-snug">
                  Logo nhận diện doanh nghiệp
                </div>
                <div className="text-[12px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug mt-0.5">
                  Hỗ trợ định dạng PNG, JPG, WebP (tối đa 512×512px, tự động lưu lên Cloudinary)
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
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
                        "Đã tải lên và lưu Logo công ty!"
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
              <button
                type="button"
                disabled={uploadingLogo}
                onClick={() => logoInputRef.current?.click()}
                className={`${COMPACT_BTN_BASE} bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700`}
              >
                {uploadingLogo ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>Đổi logo</span>
              </button>
              {config.logo_url && (
                <button
                  type="button"
                  onClick={() => {
                    updateField("logo_url", null);
                    saveSectionPayload(
                      "company_logo",
                      { logo_url: null },
                      "Đã đặt lại Logo mặc định!"
                    );
                  }}
                  className={`${COMPACT_BTN_BASE} text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50`}
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Xóa</span>
                </button>
              )}
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Tên công ty</label>
            <input
              type="text"
              value={config.company_name || ""}
              onChange={(e) => updateField("company_name", e.target.value)}
              placeholder="VD: Công ty CP Sedinco"
              className={COMPACT_INPUT_CLASS}
            />
            <p className={HELPER_TEXT_CLASS}>
              Tên pháp nhân hiển thị trên bảng lương, phiếu lương điện tử và báo cáo xuất file.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 items-end">
            <div>
              <label className={LABEL_CLASS}>Mã số thuế</label>
              <input
                type="text"
                value={config.tax_code || ""}
                onChange={(e) => updateField("tax_code", e.target.value)}
                placeholder="0401234567"
                className={COMPACT_INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Điện thoại</label>
              <input
                type="text"
                value={config.phone || ""}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="0236 3888 999"
                className={COMPACT_INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Địa chỉ trụ sở</label>
            <input
              type="text"
              value={config.address || ""}
              onChange={(e) => updateField("address", e.target.value)}
              placeholder="VD: Hải Châu, Đà Nẵng"
              className={COMPACT_INPUT_CLASS}
            />
            <p className={HELPER_TEXT_CLASS}>
              Nhập địa chỉ trụ sở chính hoặc văn phòng giao dịch của công ty.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span className="flex-1 min-w-0 text-[12px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug">
              {isCompanyInfoDirty ? "Có thay đổi chưa lưu" : "Thông tin hiển thị trên phiếu lương"}
            </span>
            <SectionSaveButton
              testId="save-section-company-info-btn"
              isDirty={isCompanyInfoDirty}
              loading={Boolean(savingSections.company_info)}
              onClick={handleSaveCompanyInfo}
            />
          </div>
        </div>
      </SmartAccordion>

      {/* KHỐI 2: BẢNG TIN THÔNG BÁO NỘI BỘ */}
      <SmartAccordion
        id="announcement"
        title="Bảng tin thông báo nội bộ"
        summary={announcementSummary}
        icon={Megaphone}
        iconColor="text-amber-600 dark:text-amber-300"
        iconBg="bg-amber-50 dark:bg-amber-950/60"
        isOpen={openSections.announcement}
        isDirty={isAnnouncementDirty}
        onToggle={toggleSection}
      >
        <div className="space-y-2.5">
          {/* Bố cục 2 tầng cho dòng có nút gạt Switch */}
          <div>
            <div className="flex items-start justify-between gap-3 w-full">
              <span className="flex-1 min-w-0 text-[14px] font-medium text-slate-900 dark:text-slate-100 whitespace-normal break-words overflow-visible leading-snug">
                Hiển thị bảng tin cho nhân viên
              </span>
              <Switch
                testId="company-announcement-toggle"
                ariaLabel="Hiển thị bảng tin cho nhân viên"
                checked={announcementEnabled}
                onChange={() => {
                  if (announcementEnabled) {
                    if (String(config.announcement_text || "").trim()) {
                      lastAnnouncementTextRef.current = String(config.announcement_text);
                    }
                    setAnnouncementEnabled(false);
                    setConfig((prev) => ({ ...prev, announcement_text: "" }));
                  } else {
                    setAnnouncementEnabled(true);
                    const restored =
                      lastAnnouncementTextRef.current ||
                      savedAnnouncementText ||
                      "Thông báo nội bộ Sedinco";
                    setConfig((prev) => ({ ...prev, announcement_text: restored }));
                  }
                }}
              />
            </div>
            <p className="w-full mt-1 text-[12.5px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-relaxed">
              Khi bật, nội dung thông báo sẽ hiển thị nổi bật ngay đầu màn hình Chấm công của toàn bộ nhân viên.
            </p>
          </div>

          <div className={`relative transition-opacity ${announcementEnabled ? "opacity-100" : "opacity-55"}`}>
            <textarea
              rows={3}
              data-testid="company-announcement-textarea"
              value={config.announcement_text || ""}
              onChange={(e) => updateField("announcement_text", e.target.value)}
              placeholder="Nhập nội dung thông báo..."
              className="w-full p-2.5 pb-6 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px] text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:border-[#E11D48] focus:outline-none"
            />
            <span className="pointer-events-none select-none absolute bottom-2 right-2.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
              {(config.announcement_text || "").length} ký tự
            </span>
          </div>
          <p className={HELPER_TEXT_CLASS}>
            Ví dụ: Thứ 7 tuần này công trình A nghỉ bảo trì điện, anh em ca chiều chuyển sang kho B lúc 13:00.
          </p>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span className="flex-1 min-w-0 text-[12px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug">
              {announcementEnabled ? "Đang bật trên màn hình Chấm công" : "Đang ẩn bảng tin"}
            </span>
            <SectionSaveButton
              testId="save-section-announcement-btn"
              isDirty={isAnnouncementDirty}
              loading={Boolean(savingSections.announcement)}
              onClick={handleSaveAnnouncement}
            />
          </div>
        </div>
      </SmartAccordion>

      {/* KHỐI 3: GIỜ LÀM VIỆC */}
      <SmartAccordion
        id="schedule"
        title="Giờ làm việc"
        summary={scheduleSummary}
        icon={Clock}
        iconColor="text-[#E11D48] dark:text-rose-300"
        iconBg="bg-[#FFE4E6] dark:bg-rose-950/60"
        isOpen={openSections.schedule}
        isDirty={isScheduleDirty}
        onToggle={toggleSection}
      >
        <div className="space-y-2">
          {/* Hàng 1: Ca sáng */}
          <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
            <span className="text-[13.5px] font-semibold text-slate-700 dark:text-slate-200 whitespace-normal break-words">
              Ca sáng
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                aria-label="Giờ bắt đầu ca sáng"
                value={config.work_start || "08:00"}
                onChange={(e) => updateField("work_start", e.target.value)}
                className="w-[106px] sm:w-[120px] h-[40px] min-h-[40px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px] font-semibold text-slate-800 dark:text-slate-100 text-center focus:border-[#E11D48] focus:outline-none"
              />
              <span className="text-slate-400 font-bold">–</span>
              <input
                type="time"
                aria-label="Giờ kết thúc ca sáng"
                value={config.lunch_start || "12:00"}
                onChange={(e) => updateField("lunch_start", e.target.value)}
                className="w-[106px] sm:w-[120px] h-[40px] min-h-[40px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px] font-semibold text-slate-800 dark:text-slate-100 text-center focus:border-[#E11D48] focus:outline-none"
              />
            </div>
          </div>

          {/* Hàng 2: Ca chiều */}
          <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
            <span className="text-[13.5px] font-semibold text-slate-700 dark:text-slate-200 whitespace-normal break-words">
              Ca chiều
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                aria-label="Giờ bắt đầu ca chiều"
                value={config.lunch_end || "13:30"}
                onChange={(e) => updateField("lunch_end", e.target.value)}
                className="w-[106px] sm:w-[120px] h-[40px] min-h-[40px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px] font-semibold text-slate-800 dark:text-slate-100 text-center focus:border-[#E11D48] focus:outline-none"
              />
              <span className="text-slate-400 font-bold">–</span>
              <input
                type="time"
                aria-label="Giờ kết thúc ca chiều"
                value={config.work_end || "17:30"}
                onChange={(e) => updateField("work_end", e.target.value)}
                className="w-[106px] sm:w-[120px] h-[40px] min-h-[40px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px] font-semibold text-slate-800 dark:text-slate-100 text-center focus:border-[#E11D48] focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span className="flex-1 min-w-0 text-[12px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug">
              Khung giờ nghỉ trưa tự động: {config.lunch_start || "12:00"}–{config.lunch_end || "13:30"}
            </span>
            <SectionSaveButton
              testId="save-section-schedule-btn"
              isDirty={isScheduleDirty}
              loading={Boolean(savingSections.schedule)}
              onClick={handleSaveSchedule}
            />
          </div>
        </div>
      </SmartAccordion>

      {/* KHỐI 4: ĐỊA CHỈ & WI-FI CHẤM CÔNG */}
      <SmartAccordion
        id="locations"
        title="Địa chỉ & Wi-Fi chấm công"
        summary={locationsSummary}
        icon={MapPin}
        iconColor="text-emerald-600 dark:text-emerald-300"
        iconBg="bg-emerald-50 dark:bg-emerald-950/60"
        isOpen={openSections.locations}
        isDirty={isLocationsDirty}
        onToggle={toggleSection}
      >
        <div className="space-y-3">
          <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-3">
            {(config.allowed_locations || []).map((loc, idx) => (
              <div key={loc.id || idx} className={idx > 0 ? "pt-3 space-y-2.5" : "space-y-2.5"}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 whitespace-normal break-words">
                    Điểm chấm công #{idx + 1}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenBranchQr(loc)}
                      className={`${COMPACT_BTN_BASE} bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700`}
                    >
                      <QrCode className="w-3.5 h-3.5 shrink-0" />
                      <span>Mã QR</span>
                    </button>
                    {(config.allowed_locations || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLocation(idx)}
                        className={`${COMPACT_BTN_BASE} text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50`}
                        aria-label="Xóa địa điểm"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Xóa</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Cặp ô chứa văn bản dài dùng grid-cols-1 sm:grid-cols-2 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className={LABEL_CLASS}>Tên điểm chấm công</label>
                    <input
                      type="text"
                      value={loc.name || ""}
                      onChange={(e) => handleLocationChange(idx, "name", e.target.value)}
                      placeholder="VD: Trụ sở chính"
                      className={COMPACT_INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Phương thức chấm công</label>
                    <select
                      value={loc.attendance_method || "GPS"}
                      onChange={(e) => handleLocationChange(idx, "attendance_method", e.target.value)}
                      className={COMPACT_INPUT_CLASS}
                    >
                      <option value="GPS">GPS / Wi-Fi nội bộ</option>
                      <option value="GPS_AND_QR">GPS + QR động</option>
                      <option value="QR_ONLY">Chỉ quét QR động</option>
                    </select>
                  </div>
                </div>

                {/* Hàng 1 (2 cột số ngắn items-end): Vĩ độ | Kinh độ */}
                <div className="grid grid-cols-2 gap-2.5 items-end">
                  <div>
                    <label className={LABEL_CLASS}>Vĩ độ</label>
                    <input
                      type="number"
                      step="any"
                      value={loc.lat ?? ""}
                      onChange={(e) => handleLocationChange(idx, "lat", e.target.value)}
                      className={COMPACT_INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Kinh độ</label>
                    <input
                      type="number"
                      step="any"
                      value={loc.lng ?? ""}
                      onChange={(e) => handleLocationChange(idx, "lng", e.target.value)}
                      className={COMPACT_INPUT_CLASS}
                    />
                  </div>
                </div>

                {/* Hàng 2 (flex items-end gap-2): Bán kính GPS [100 m] (flex-1) + [📍 Lấy GPS] (w-fit h-[40px]) */}
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <label className={LABEL_CLASS}>Bán kính GPS</label>
                    <InputWithSuffix
                      type="number"
                      min="20"
                      value={loc.radius ?? 300}
                      onChange={(e) => handleLocationChange(idx, "radius", e.target.value)}
                      suffix="m"
                      suffixWidthClass="pr-8"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={detectingLocIdx === idx}
                    onClick={() => handleUseCurrentGps(idx)}
                    className={`${INPUT_PAIRED_BTN_BASE} bg-emerald-600 hover:bg-emerald-700 text-white`}
                  >
                    {detectingLocIdx === idx ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <Navigation className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>Lấy GPS</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Hàng 3: Ô nhập Wi-Fi / BSSID ghép chung 1 hàng với nút [+ Thêm] */}
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
              <label className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 whitespace-normal break-words overflow-visible leading-snug">
                Wi-Fi / BSSID văn phòng ({wifiItems.length})
              </label>
              <button
                type="button"
                disabled={savingWifi}
                onClick={handleSaveWifiIp}
                className="w-fit text-[12.5px] font-semibold text-[#0051CA] dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Wifi className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-normal break-words text-left">
                  {savingWifi
                    ? "Đang lấy Wi-Fi..."
                    : `Lưu Wi-Fi hiện tại${
                        config.current_client_ip ? ` (${config.current_client_ip})` : ""
                      }`}
                </span>
              </button>
            </div>

            <div>
              <div className="flex items-end gap-2">
                <input
                  type="text"
                  data-testid="new-wifi-input"
                  value={newWifiInput}
                  onChange={(e) => setNewWifiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddWifiEntry();
                    }
                  }}
                  placeholder="VD: 192.168.1.1"
                  className={`flex-1 ${COMPACT_INPUT_CLASS}`}
                />
                <button
                  type="button"
                  data-testid="add-wifi-btn"
                  onClick={handleAddWifiEntry}
                  className={`${INPUT_PAIRED_BTN_BASE} bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white`}
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>Thêm</span>
                </button>
              </div>
              <p className={HELPER_TEXT_CLASS}>
                Nhập địa chỉ IP hoặc BSSID Wi-Fi công ty rồi bấm Thêm (hoặc bấm Lưu Wi-Fi hiện tại để tự động nhận diện).
              </p>
            </div>

            {wifiItems.length > 0 && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl bg-slate-50/50 dark:bg-slate-800/40">
                {wifiItems.map((wifi) => (
                  <div
                    key={wifi}
                    className="py-2 px-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Wifi className="w-3.5 h-3.5 text-[#0051CA] dark:text-blue-400 shrink-0" />
                      <span className="text-[13px] font-mono text-slate-800 dark:text-slate-100 whitespace-normal break-all sm:break-words overflow-visible leading-snug">
                        {wifi}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRemoveWifiEntry(wifi)}
                        aria-label={`Xóa Wi-Fi ${wifi}`}
                        className="w-fit h-[30px] min-h-[30px] px-2.5 text-[12px] font-semibold rounded-lg whitespace-nowrap inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200/70 dark:border-rose-800/60 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3 h-3 shrink-0" />
                        <span>Xóa</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleAddLocation}
              className={`${COMPACT_BTN_BASE} bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700`}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Thêm điểm</span>
            </button>
            <SectionSaveButton
              testId="save-section-locations-btn"
              isDirty={isLocationsDirty}
              loading={Boolean(savingSections.locations)}
              onClick={handleSaveLocations}
            />
          </div>
        </div>
      </SmartAccordion>

      {/* KHỐI 5: QUẢN LÝ KHỐI / BỘ PHẬN LÀM VIỆC */}
      <SmartAccordion
        id="departments"
        title="Quản lý Khối / Bộ phận"
        summary={departmentsSummary}
        icon={Layers}
        iconColor="text-[#0051CA] dark:text-blue-300"
        iconBg="bg-blue-50 dark:bg-blue-950/60"
        isOpen={openSections.departments}
        isDirty={false}
        onToggle={toggleSection}
      >
        <div className="space-y-2.5">
          <div>
            <form onSubmit={handleAddDepartment} className="flex items-center gap-2">
              <input
                type="text"
                data-testid="new-department-input"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="VD: Khối Kỹ thuật"
                className={`flex-1 ${COMPACT_INPUT_CLASS}`}
              />
              <button
                type="submit"
                disabled={addingDept}
                data-testid="add-department-btn"
                className={`${INPUT_PAIRED_BTN_BASE} bg-[#E11D48] hover:bg-[#BE123C] text-white`}
              >
                {addingDept ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>Thêm</span>
              </button>
            </form>
            <p className={HELPER_TEXT_CLASS}>
              Nhập tên khối hoặc bộ phận làm việc mới để phân nhóm nhân sự, bảng công và duyệt đơn.
            </p>
          </div>

          {loadingDepartments && departments.length === 0 ? (
            <SkeletonList rows={3} label="Đang tải danh sách khối / bộ phận..." />
          ) : (
            <div
              data-testid="departments-list"
              className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/85 dark:border-slate-700/80 rounded-xl bg-white dark:bg-slate-900"
            >
              {departments.map((dept) => {
                const isDefault = Number(dept.is_default) === 1;
                const isEditing = editingDeptId === dept.id;
                return (
                  <div
                    key={dept.id}
                    data-testid={`department-row-${dept.id}`}
                    className="py-2.5 px-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    {isEditing ? (
                      <div className="w-full flex flex-col sm:flex-row sm:items-center gap-2">
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
                          className={`flex-1 ${COMPACT_INPUT_CLASS}`}
                        />
                        <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={savingDept}
                            data-testid={`save-rename-dept-btn-${dept.id}`}
                            onClick={() => handleSaveRenameDepartment(dept.id)}
                            className={`${COMPACT_BTN_BASE} bg-emerald-600 hover:bg-emerald-700 text-white`}
                          >
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            <span>Lưu</span>
                          </button>
                          <button
                            type="button"
                            disabled={savingDept}
                            onClick={() => {
                              setEditingDeptId(null);
                              setEditingDeptName("");
                            }}
                            className={`${COMPACT_BTN_BASE} bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}
                          >
                            <X className="w-3.5 h-3.5 shrink-0" />
                            <span>Hủy</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Hàng trên (Mobile) / Cột trái (Desktop): Tên khối + thông tin phụ chiếm 100% chiều ngang */}
                        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
                          <span className="text-[14px] font-semibold text-slate-900 dark:text-white whitespace-normal break-words overflow-visible leading-snug">
                            {dept.name}
                          </span>
                          {isDefault && (
                            <span
                              data-testid="default-department-badge"
                              className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-700 text-[#B80035] dark:text-rose-300 text-[11px] font-bold whitespace-nowrap shrink-0"
                            >
                              Mặc định
                            </span>
                          )}
                          <span className="text-[12.5px] text-slate-500 dark:text-slate-400 whitespace-normal break-words">
                            • {dept.employee_count || 0} nhân viên
                          </span>
                        </div>

                        {/* Hàng dưới (Mobile) / Cột phải (Desktop): Cụm nút Sửa & Xóa */}
                        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                          <button
                            type="button"
                            data-testid={`rename-dept-btn-${dept.id}`}
                            onClick={() => {
                              setEditingDeptId(dept.id);
                              setEditingDeptName(dept.name);
                            }}
                            className={`${COMPACT_BTN_BASE} bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700`}
                          >
                            <Pencil className="w-3.5 h-3.5 shrink-0" />
                            <span>Sửa</span>
                          </button>
                          {!isDefault && (
                            <button
                              type="button"
                              data-testid={`delete-dept-btn-${dept.id}`}
                              onClick={() => setConfirmDeleteDept({ open: true, dept })}
                              className={`${COMPACT_BTN_BASE} text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200/70 dark:border-rose-800/60`}
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Xóa</span>
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SmartAccordion>

      {/* KHỐI 6: QUY TẮC TÍNH CÔNG, TĂNG CA & BẢO HIỂM */}
      <SmartAccordion
        id="payroll"
        title="Quy tắc tính công, tăng ca & bảo hiểm"
        summary={payrollSummary}
        icon={Calculator}
        iconColor="text-[#E11D48] dark:text-rose-300"
        iconBg="bg-[#FFE4E6] dark:bg-rose-950/60"
        isOpen={openSections.payroll}
        isDirty={isRulesDirty}
        onToggle={toggleSection}
      >
        <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-3">
          {/* NHÓM 1: CHẤM CÔNG & PHÉP */}
          <div className="space-y-2.5">
            <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 whitespace-normal break-words">
              Chấm công &amp; Phép
            </h4>

            <div className="grid grid-cols-2 gap-2.5 items-end">
              <div>
                <label className={LABEL_CLASS}>Đi muộn tối đa</label>
                <InputWithSuffix
                  data-testid="company-grace-period-input"
                  type="number"
                  min="0"
                  value={config.grace_period_minutes ?? 15}
                  onChange={(e) => updateField("grace_period_minutes", e.target.value)}
                  suffix="phút"
                  suffixWidthClass="pr-12"
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Phép có lương</label>
                <InputWithSuffix
                  data-testid="company-monthly-leave-limit-input"
                  type="number"
                  min="0"
                  max="31"
                  step="1"
                  value={config.monthly_paid_leave_limit ?? 1}
                  onChange={(e) => updateField("monthly_paid_leave_limit", e.target.value)}
                  suffix="lượt"
                  suffixWidthClass="pr-12"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className={LABEL_CLASS}>Hình thức phạt đi muộn</label>
                <select
                  value={config.late_policy_type || "PER_MINUTE"}
                  onChange={(e) => updateField("late_policy_type", e.target.value)}
                  className={COMPACT_INPUT_CLASS}
                >
                  <option value="PER_MINUTE">Phạt theo phút</option>
                  <option value="PER_OCCURRENCE">Phạt theo lần</option>
                  <option value="DEDUCT_WORKDAY">Hạ xuống 0,5 công</option>
                  <option value="NONE">Không phạt tiền</option>
                </select>
              </div>

              <div>
                <label className={LABEL_CLASS}>
                  {config.late_policy_type === "DEDUCT_WORKDAY"
                    ? "Ngưỡng tính nửa công"
                    : "Mức phạt đi muộn"}
                </label>
                {config.late_policy_type === "DEDUCT_WORKDAY" ? (
                  <InputWithSuffix
                    type="number"
                    min="1"
                    value={config.max_late_minutes_for_half_day ?? 60}
                    onChange={(e) => updateField("max_late_minutes_for_half_day", e.target.value)}
                    suffix="phút"
                    suffixWidthClass="pr-12"
                  />
                ) : (
                  <InputWithSuffix
                    type="text"
                    inputMode="numeric"
                    disabled={config.late_policy_type === "NONE"}
                    value={formatViNumber(
                      config.late_policy_type === "PER_OCCURRENCE"
                        ? (config.late_penalty_amount ?? config.penalty_fixed_block ?? 50000)
                        : (config.late_penalty_per_minute ?? config.penalty_per_minute ?? 2000),
                      0
                    )}
                    onChange={(e) => {
                      const num = Math.max(0, Math.round(parseViNumberInput(e.target.value)));
                      if (config.late_policy_type === "PER_OCCURRENCE") {
                        updateField("late_penalty_amount", num);
                        updateField("penalty_fixed_block", num);
                      } else {
                        updateField("late_penalty_per_minute", num);
                        updateField("penalty_per_minute", num);
                      }
                    }}
                    suffix="đ"
                    suffixWidthClass="pr-8"
                  />
                )}
              </div>
            </div>

            <p
              data-testid="auto-standard-workdays-note"
              className="text-[12.5px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug"
            >
              Công chuẩn tháng tự động tính = Tổng số ngày trong tháng trừ Chủ nhật (Tháng{" "}
              {currentMonthNum}/{currentYearNum}: <strong>{currentStdDays} ngày</strong>).
            </p>
          </div>

          {/* NHÓM 2: TĂNG CA (OT) */}
          <div className="pt-3 space-y-2.5">
            <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 whitespace-normal break-words">
              Tăng ca (OT)
            </h4>

            <div className="grid grid-cols-2 gap-2.5 items-end">
              <div>
                <label className={LABEL_CLASS}>Ngày thường</label>
                <InputWithSuffix
                  data-testid="company-ot-weekday-input"
                  type="text"
                  inputMode="decimal"
                  value={config.ot_rate_weekday ?? 1.5}
                  onChange={(e) => updateField("ot_rate_weekday", e.target.value)}
                  suffix="x"
                  suffixWidthClass="pr-8"
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Chủ nhật</label>
                <InputWithSuffix
                  data-testid="company-ot-weekend-input"
                  type="text"
                  inputMode="decimal"
                  value={config.ot_rate_weekend ?? 2.0}
                  onChange={(e) => updateField("ot_rate_weekend", e.target.value)}
                  suffix="x"
                  suffixWidthClass="pr-8"
                />
              </div>
            </div>

            <p
              data-testid="holiday-multiplier-guidance-note"
              className="text-[12.5px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug"
            >
              Hệ số đi làm ngày lễ được thiết lập riêng cho từng dịp tại mục{" "}
              <strong className="text-slate-700 dark:text-slate-200">Cài đặt → Ngày lễ</strong>.
            </p>
          </div>

          {/* NHÓM 3: BẢO HIỂM */}
          <div className="pt-3 space-y-2.5">
            <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 whitespace-normal break-words">
              Bảo hiểm
            </h4>

            {/* Bố cục 2 tầng cho dòng có nút gạt Switch */}
            <div>
              <div className="flex items-start justify-between gap-3 w-full">
                <span className="flex-1 min-w-0 text-[14px] font-medium text-slate-900 dark:text-slate-100 whitespace-normal break-words overflow-visible leading-snug">
                  Khấu trừ bảo hiểm tự động
                </span>
                <Switch
                  testId="company-insurance-toggle"
                  ariaLabel="Khấu trừ bảo hiểm tự động"
                  checked={isInsuranceEnabled}
                  onChange={() => {
                    if (isInsuranceEnabled) {
                      updateField("insurance_rate", 0);
                    } else {
                      updateField("insurance_rate", lastPositiveInsuranceRateRef.current || 10.5);
                    }
                  }}
                />
              </div>
              <p className="w-full mt-1 text-[12.5px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-relaxed">
                Khi tắt (0%), tiền khấu trừ bảo hiểm = 0 đ và ẩn dòng bảo hiểm trên Bảng lương &amp; Phiếu lương.
              </p>
            </div>

            {isInsuranceEnabled && (
              <div>
                <label className={LABEL_CLASS}>Tỷ lệ khấu trừ BH</label>
                <InputWithSuffix
                  data-testid="company-insurance-rate-input"
                  type="text"
                  inputMode="decimal"
                  value={config.insurance_rate ?? 10.5}
                  onChange={(e) => updateField("insurance_rate", e.target.value)}
                  suffix="%"
                  suffixWidthClass="pr-8"
                />
              </div>
            )}
          </div>
        </div>

        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <span className="flex-1 min-w-0 text-[12px] text-slate-500 dark:text-slate-400 whitespace-normal break-words overflow-visible leading-snug">
            {isRulesDirty ? "Có thay đổi chưa lưu" : "Đồng bộ trực tiếp với bảng lương"}
          </span>
          <SectionSaveButton
            testId="save-section-rules-btn"
            isDirty={isRulesDirty}
            loading={Boolean(savingSections.rules)}
            onClick={handleSaveRules}
          />
        </div>
      </SmartAccordion>

      <ConfirmDialog
        open={confirmDeleteDept.open}
        title="Xác nhận xóa khối / bộ phận"
        message={
          confirmDeleteDept.dept
            ? `Xóa khối "${confirmDeleteDept.dept.name}"? Toàn bộ ${confirmDeleteDept.dept.employee_count || 0} nhân viên đang thuộc khối này sẽ tự động chuyển về khối chính "${defaultDepartmentName}".`
            : ""
        }
        confirmLabel="Xóa khối"
        variant="danger"
        loading={deletingDept}
        onCancel={() => {
          if (!deletingDept) setConfirmDeleteDept({ open: false, dept: null });
        }}
        onConfirm={handleExecuteDeleteDepartment}
      />

      {/* Modal QR Động Chấm công Chi nhánh */}
      <AppModal
        open={qrModalState.open}
        onClose={() => setQrModalState((prev) => ({ ...prev, open: false }))}
        title="Mã QR Chấm Công Động"
        subtitle={qrModalState.branch?.name || "Điểm chấm công Sedinco"}
        maxWidthClass="max-w-sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setQrModalState((prev) => ({ ...prev, open: false }))}
              className={`${COMPACT_BTN_BASE} bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={qrModalState.loading}
              onClick={() => handleOpenBranchQr(qrModalState.branch)}
              className={`${COMPACT_BTN_BASE} bg-[#E11D48] hover:bg-[#BE123C] text-white`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${qrModalState.loading ? "animate-spin" : ""}`} />
              <span>Cấp mã mới</span>
            </button>
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
